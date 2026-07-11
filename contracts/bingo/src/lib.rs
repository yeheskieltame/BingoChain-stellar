#![no_std]

//! BINGO peer to peer arena lifecycle on Soroban.
//!
//! Players stake a token, join by committing a sealed 5x5 board (a hash over the
//! board bytes and a salt), then call numbers in turn and reveal to settle. This
//! module covers the full arena lifecycle: create, commit and join with escrow,
//! cancel, turn based number calls, bingo claims, commit reveal verification,
//! winner resolution and settlement, and pull payment withdrawals.

pub mod board;
pub mod types;

use soroban_sdk::{
    contract, contractimpl, panic_with_error, symbol_short, token, Address, Bytes, BytesN, Env, Vec,
};

use board::{bingo_index, count_completed_lines, is_valid_board, marks};
use types::{Arena, ArenaState, Config, DataKey, Error};

// Game constants.
const MIN_PLAYERS: u32 = 2;
const MAX_PLAYERS: u32 = 6;
const MIN_STAKE: i128 = 10_000_000;
const MAX_FEE_BPS: u32 = 500;
// Highest board number; also the number of calls that fills a game.
const MAX_NUMBER: u32 = 25;
// Seconds an unfilled lobby stays open before anyone may cancel it.
const JOIN_WINDOW: u64 = 86_400;
// Seconds players have to reveal once the reveal phase opens.
const REVEAL_WINDOW: u64 = 86_400;

// Storage lifetime bounds applied on every write.
const TTL_THRESHOLD: u32 = 50_000;
const TTL_EXTEND: u32 = 100_000;

#[contract]
pub struct BingoContract;

#[contractimpl]
impl BingoContract {
    /// Initialize the contract with the fee recipient, the settlement token, and
    /// the protocol fee in basis points. Panics with FeeTooHigh if fee_bps > 500.
    pub fn __constructor(env: Env, admin: Address, token: Address, fee_bps: u32) {
        if fee_bps > MAX_FEE_BPS {
            panic_with_error!(&env, Error::FeeTooHigh);
        }
        let config = Config {
            admin,
            token,
            fee_bps,
        };
        env.storage().instance().set(&DataKey::Config, &config);
        env.storage().instance().set(&DataKey::ArenaCount, &0u32);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
    }

    /// Open a new arena. The creator does not auto join; they join through
    /// commit_board like every other player. Arena ids start at 1.
    // Events use the legacy publish API on purpose: the topic and data layout
    // is a fixed contract the frontend event decoder reads verbatim.
    #[allow(deprecated)]
    pub fn create_arena(
        env: Env,
        creator: Address,
        stake: i128,
        max_players: u32,
    ) -> Result<u32, Error> {
        creator.require_auth();

        if !(MIN_PLAYERS..=MAX_PLAYERS).contains(&max_players) {
            return Err(Error::InvalidPlayerCount);
        }
        if stake < MIN_STAKE {
            return Err(Error::StakeTooLow);
        }

        let count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::ArenaCount)
            .unwrap_or(0);
        let id = count + 1;

        let arena = Arena {
            id,
            creator: creator.clone(),
            stake,
            max_players,
            state: ArenaState::Created,
            players: Vec::new(&env),
            called_mask: 0,
            call_count: 0,
            turn_index: 0,
            call_sequence: Bytes::new(&env),
            reveal_deadline: 0,
            created_at: env.ledger().timestamp(),
        };

        write_arena(&env, id, &arena);
        env.storage().instance().set(&DataKey::ArenaCount, &id);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND);

        env.events().publish(
            (symbol_short!("arena"), symbol_short!("created"), id),
            (creator, stake, max_players),
        );

        Ok(id)
    }

    /// Join an arena with a sealed board commitment and escrow the stake. Seals
    /// the arena to Committed once the last seat fills.
    #[allow(deprecated)]
    pub fn commit_board(
        env: Env,
        arena_id: u32,
        player: Address,
        commitment: BytesN<32>,
    ) -> Result<(), Error> {
        player.require_auth();

        let mut arena = load_arena(&env, arena_id)?;

        if arena.state != ArenaState::Created {
            return Err(Error::WrongState);
        }
        let commit_key = DataKey::Commit(arena_id, player.clone());
        if env.storage().persistent().has(&commit_key) {
            return Err(Error::AlreadyJoined);
        }
        if arena.players.len() >= arena.max_players {
            return Err(Error::ArenaFull);
        }

        // Record the sealed board and the seat, then pull the stake.
        env.storage().persistent().set(&commit_key, &commitment);
        env.storage()
            .persistent()
            .extend_ttl(&commit_key, TTL_THRESHOLD, TTL_EXTEND);
        arena.players.push_back(player.clone());

        let config = read_config(&env);
        token::Client::new(&env, &config.token).transfer(
            &player,
            env.current_contract_address(),
            &arena.stake,
        );

        let joined = arena.players.len();
        env.events().publish(
            (symbol_short!("arena"), symbol_short!("joined"), arena_id),
            (player, joined),
        );

        let sealed = joined == arena.max_players;
        if sealed {
            arena.state = ArenaState::Committed;
        }
        write_arena(&env, arena_id, &arena);

        if sealed {
            env.events().publish(
                (symbol_short!("arena"), symbol_short!("ready"), arena_id),
                (),
            );
        }

        Ok(())
    }

    /// Cancel a stalled arena and refund every joined player through the
    /// earnings ledger. Authorization matrix: a Created (unfilled) arena may be
    /// cancelled by its creator anytime, or by anyone once the join window has
    /// elapsed; a Committed (full but never called) arena may be cancelled by
    /// anyone, creator included, only after the join window, so stakes cannot
    /// stay stranded when the first player to act never calls. Early attempts
    /// get CancelNotAllowed; a Playing or later arena gets WrongState.
    #[allow(deprecated)]
    pub fn cancel_arena(env: Env, arena_id: u32, caller: Address) -> Result<(), Error> {
        caller.require_auth();

        let mut arena = load_arena(&env, arena_id)?;

        let past_window = env.ledger().timestamp() > arena.created_at + JOIN_WINDOW;
        match arena.state {
            ArenaState::Created => {
                if caller != arena.creator && !past_window {
                    return Err(Error::CancelNotAllowed);
                }
            }
            ArenaState::Committed => {
                if !past_window {
                    return Err(Error::CancelNotAllowed);
                }
            }
            _ => return Err(Error::WrongState),
        }

        arena.state = ArenaState::Cancelled;

        for player in arena.players.iter() {
            let key = DataKey::Earnings(player);
            let current: i128 = env.storage().persistent().get(&key).unwrap_or(0);
            env.storage()
                .persistent()
                .set(&key, &(current + arena.stake));
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
        }

        let refunded = arena.players.len();
        write_arena(&env, arena_id, &arena);

        env.events().publish(
            (symbol_short!("arena"), symbol_short!("cancel"), arena_id),
            (refunded,),
        );

        Ok(())
    }

    /// Call a number on your turn. The first call flips a Committed arena to
    /// Playing; the 25th opens the reveal phase. Each of 1..=25 is callable once.
    #[allow(deprecated)]
    pub fn call_number(env: Env, arena_id: u32, player: Address, number: u32) -> Result<(), Error> {
        player.require_auth();

        let mut arena = load_arena(&env, arena_id)?;

        if arena.state == ArenaState::Committed {
            arena.state = ArenaState::Playing;
        }
        if arena.state != ArenaState::Playing {
            return Err(Error::WrongState);
        }
        if !(1..=MAX_NUMBER).contains(&number) {
            return Err(Error::NumberOutOfRange);
        }
        let bit = 1u32 << (number - 1);
        if arena.called_mask & bit != 0 {
            return Err(Error::NumberAlreadyCalled);
        }
        // Membership first: strangers get NotAPlayer, seated players out of turn
        // get NotYourTurn.
        let seat = player_index(&arena.players, &player).ok_or(Error::NotAPlayer)?;
        if seat != arena.turn_index {
            return Err(Error::NotYourTurn);
        }

        arena.called_mask |= bit;
        arena.call_sequence.push_back(number as u8);
        let call_index = arena.call_count;
        arena.call_count += 1;
        arena.turn_index = (arena.turn_index + 1) % arena.players.len();

        let opened_reveal = arena.call_count == MAX_NUMBER;
        if opened_reveal {
            arena.state = ArenaState::Revealing;
            arena.reveal_deadline = env.ledger().timestamp() + REVEAL_WINDOW;
        }
        let deadline = arena.reveal_deadline;

        write_arena(&env, arena_id, &arena);

        env.events().publish(
            (symbol_short!("arena"), symbol_short!("called"), arena_id),
            (player, number, call_index),
        );
        if opened_reveal {
            env.events().publish(
                (symbol_short!("arena"), symbol_short!("reveal"), arena_id),
                (deadline,),
            );
        }

        Ok(())
    }

    /// Claim BINGO to freeze the call sequence and open the reveal phase. The
    /// winner is decided by replay in settle, so a false claim cannot win.
    #[allow(deprecated)]
    pub fn claim_bingo(env: Env, arena_id: u32, player: Address) -> Result<(), Error> {
        player.require_auth();

        let mut arena = load_arena(&env, arena_id)?;

        if arena.state != ArenaState::Playing {
            return Err(Error::WrongState);
        }
        if player_index(&arena.players, &player).is_none() {
            return Err(Error::NotAPlayer);
        }

        arena.state = ArenaState::Revealing;
        arena.reveal_deadline = env.ledger().timestamp() + REVEAL_WINDOW;
        let call_count = arena.call_count;
        let deadline = arena.reveal_deadline;

        write_arena(&env, arena_id, &arena);

        env.events().publish(
            (symbol_short!("arena"), symbol_short!("claimed"), arena_id),
            (player, call_count),
        );
        env.events().publish(
            (symbol_short!("arena"), symbol_short!("reveal"), arena_id),
            (deadline,),
        );

        Ok(())
    }

    /// Reveal your board within the reveal window. It must hash to your sealed
    /// commitment (sha256 over the 25 board bytes followed by the 32 salt bytes)
    /// and be a permutation of 1..=25.
    #[allow(deprecated)]
    pub fn reveal_board(
        env: Env,
        arena_id: u32,
        player: Address,
        board: Bytes,
        salt: BytesN<32>,
    ) -> Result<(), Error> {
        player.require_auth();

        let arena = load_arena(&env, arena_id)?;

        if arena.state != ArenaState::Revealing {
            return Err(Error::WrongState);
        }
        if env.ledger().timestamp() > arena.reveal_deadline {
            return Err(Error::RevealWindowClosed);
        }
        if player_index(&arena.players, &player).is_none() {
            return Err(Error::NotAPlayer);
        }
        let board_key = DataKey::Board(arena_id, player.clone());
        if env.storage().persistent().has(&board_key) {
            return Err(Error::AlreadyRevealed);
        }

        let stored: BytesN<32> = env
            .storage()
            .persistent()
            .get(&DataKey::Commit(arena_id, player.clone()))
            .ok_or(Error::CommitMismatch)?;
        let mut preimage = board.clone();
        preimage.append(&Bytes::from_array(&env, &salt.to_array()));
        let digest = env.crypto().sha256(&preimage).to_bytes();
        if digest != stored {
            return Err(Error::CommitMismatch);
        }
        if !is_valid_board(&board) {
            return Err(Error::InvalidBoard);
        }

        env.storage().persistent().set(&board_key, &board);
        env.storage()
            .persistent()
            .extend_ttl(&board_key, TTL_THRESHOLD, TTL_EXTEND);

        env.events().publish(
            (symbol_short!("arena"), symbol_short!("revealed"), arena_id),
            (player,),
        );

        Ok(())
    }

    /// Settle an arena and split the prize. Anyone may call once the reveal
    /// window closes, or earlier if every player has revealed. Non revealers
    /// forfeit. Winners are the revealed players who reached five lines at the
    /// earliest call index; if none did, those with the most completed lines at
    /// the final state; if nobody revealed, the whole pot becomes the fee.
    #[allow(deprecated)]
    pub fn settle(env: Env, arena_id: u32) -> Result<(), Error> {
        let mut arena = load_arena(&env, arena_id)?;

        if arena.state != ArenaState::Revealing {
            return Err(Error::WrongState);
        }

        let players = arena.players.clone();
        let n = players.len();

        // First pass: reveal count and the winning criteria.
        let mut revealed_count: u32 = 0;
        let mut best_idx: Option<u32> = None;
        let mut best_lines: u32 = 0;
        for player in players.iter() {
            if let Some(board) = revealed_board(&env, arena_id, &player) {
                revealed_count += 1;
                if let Some(idx) = bingo_index(&board, &arena.call_sequence) {
                    best_idx = Some(match best_idx {
                        Some(current) if current <= idx => current,
                        _ => idx,
                    });
                }
                let lines = count_completed_lines(marks(&board, arena.called_mask));
                if lines > best_lines {
                    best_lines = lines;
                }
            }
        }

        // The window must be closed unless everyone already revealed.
        if env.ledger().timestamp() <= arena.reveal_deadline && revealed_count != n {
            return Err(Error::RevealWindowOpen);
        }

        // Second pass: flag winners under whichever criterion applies.
        let mut winners: Vec<bool> = Vec::new(&env);
        let mut winner_count: u32 = 0;
        for player in players.iter() {
            let mut is_winner = false;
            if let Some(board) = revealed_board(&env, arena_id, &player) {
                is_winner = match best_idx {
                    Some(best) => bingo_index(&board, &arena.call_sequence) == Some(best),
                    None => count_completed_lines(marks(&board, arena.called_mask)) == best_lines,
                };
            }
            if is_winner {
                winner_count += 1;
            }
            winners.push_back(is_winner);
        }

        let config = read_config(&env);
        let total = arena.stake * (n as i128);
        let fee = total * (config.fee_bps as i128) / 10_000;
        let pool = total - fee;

        arena.state = ArenaState::Settled;
        write_arena(&env, arena_id, &arena);

        // Nobody revealed: the whole pot becomes the protocol fee.
        if winner_count == 0 {
            credit_earnings(&env, &config.admin, total);
            env.events().publish(
                (symbol_short!("arena"), symbol_short!("settled"), arena_id),
                (0i128, total, 0u32),
            );
            return Ok(());
        }

        let share = pool / (winner_count as i128);
        let remainder = pool - share * (winner_count as i128);

        for (i, player) in players.iter().enumerate() {
            if winners.get(i as u32).unwrap_or(false) {
                credit_earnings(&env, &player, share);
                env.events().publish(
                    (symbol_short!("arena"), symbol_short!("paid"), arena_id),
                    (player.clone(), share),
                );
            }
        }
        // The rounding remainder joins the fee in the treasury balance.
        credit_earnings(&env, &config.admin, fee + remainder);

        env.events().publish(
            (symbol_short!("arena"), symbol_short!("settled"), arena_id),
            (pool, fee, winner_count),
        );

        Ok(())
    }

    /// Withdraw your accumulated earnings. The ledger entry is zeroed before the
    /// token leaves the contract. Returns the amount paid out.
    #[allow(deprecated)]
    pub fn withdraw(env: Env, account: Address) -> Result<i128, Error> {
        account.require_auth();

        let key = DataKey::Earnings(account.clone());
        let amount: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if amount == 0 {
            return Err(Error::NothingToWithdraw);
        }

        // Zero the entry before the transfer out.
        env.storage().persistent().set(&key, &0i128);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);

        let config = read_config(&env);
        token::Client::new(&env, &config.token).transfer(
            &env.current_contract_address(),
            &account,
            &amount,
        );

        env.events()
            .publish((symbol_short!("withdraw"), account), (amount,));

        Ok(amount)
    }

    /// Read a single arena, or ArenaNotFound if the id was never created.
    pub fn get_arena(env: Env, arena_id: u32) -> Result<Arena, Error> {
        load_arena(&env, arena_id)
    }

    /// Number of arenas ever created (also the id of the most recent one).
    pub fn arena_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::ArenaCount)
            .unwrap_or(0)
    }

    /// The sealed board commitment a player submitted, if they joined.
    pub fn commit_of(env: Env, arena_id: u32, player: Address) -> Option<BytesN<32>> {
        env.storage()
            .persistent()
            .get(&DataKey::Commit(arena_id, player))
    }

    /// A player's withdrawable balance from cancels and settlements.
    pub fn earnings_of(env: Env, player: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Earnings(player))
            .unwrap_or(0)
    }

    /// The board a player revealed for an arena, if they have revealed.
    pub fn revealed_board_of(env: Env, arena_id: u32, player: Address) -> Option<Bytes> {
        revealed_board(&env, arena_id, &player)
    }

    /// The contract configuration set at construction.
    pub fn config(env: Env) -> Config {
        read_config(&env)
    }
}

fn load_arena(env: &Env, arena_id: u32) -> Result<Arena, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Arena(arena_id))
        .ok_or(Error::ArenaNotFound)
}

fn write_arena(env: &Env, arena_id: u32, arena: &Arena) {
    let key = DataKey::Arena(arena_id);
    env.storage().persistent().set(&key, arena);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
}

fn read_config(env: &Env) -> Config {
    env.storage().instance().get(&DataKey::Config).unwrap()
}

/// Seat of `player` in the arena's turn order, or None if not a player.
fn player_index(players: &Vec<Address>, player: &Address) -> Option<u32> {
    for (i, p) in players.iter().enumerate() {
        if p == *player {
            return Some(i as u32);
        }
    }
    None
}

/// The board a player revealed for an arena, if any.
fn revealed_board(env: &Env, arena_id: u32, player: &Address) -> Option<Bytes> {
    env.storage()
        .persistent()
        .get(&DataKey::Board(arena_id, player.clone()))
}

/// Add `amount` to an account's pull payment balance.
fn credit_earnings(env: &Env, account: &Address, amount: i128) {
    let key = DataKey::Earnings(account.clone());
    let current: i128 = env.storage().persistent().get(&key).unwrap_or(0);
    env.storage().persistent().set(&key, &(current + amount));
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
}

mod test;
