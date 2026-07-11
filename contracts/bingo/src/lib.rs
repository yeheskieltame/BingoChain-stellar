#![no_std]

//! BINGO peer to peer arena lifecycle on Soroban.
//!
//! Players stake a token, join by committing a sealed 5x5 board (a hash over the
//! board bytes and a salt), then in a later phase call numbers in turn and reveal
//! to settle. This module covers the lobby lifecycle: create, commit and join
//! with escrow, and cancel. Gameplay (call, claim, reveal, settle, withdraw) is
//! layered on the same types by a later task.

pub mod board;
pub mod types;

use soroban_sdk::{
    contract, contractimpl, panic_with_error, symbol_short, token, Address, Bytes, BytesN, Env, Vec,
};

use types::{Arena, ArenaState, Config, DataKey, Error};

// Game constants.
const MIN_PLAYERS: u32 = 2;
const MAX_PLAYERS: u32 = 6;
const MIN_STAKE: i128 = 10_000_000;
const MAX_FEE_BPS: u32 = 500;
// Seconds an unfilled lobby stays open before anyone may cancel it.
const JOIN_WINDOW: u64 = 86_400;

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

    /// Cancel an unfilled (Created) arena and refund every joined player through
    /// the earnings ledger. The creator may cancel anytime; anyone may cancel
    /// once the join window has elapsed.
    #[allow(deprecated)]
    pub fn cancel_arena(env: Env, arena_id: u32, caller: Address) -> Result<(), Error> {
        caller.require_auth();

        let mut arena = load_arena(&env, arena_id)?;

        if arena.state != ArenaState::Created {
            return Err(Error::WrongState);
        }

        let past_window = env.ledger().timestamp() > arena.created_at + JOIN_WINDOW;
        if caller != arena.creator && !past_window {
            return Err(Error::CancelNotAllowed);
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

    /// A player's withdrawable balance from cancels and (later) settlements.
    pub fn earnings_of(env: Env, player: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Earnings(player))
            .unwrap_or(0)
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

mod test;
