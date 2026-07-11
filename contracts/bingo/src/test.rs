#![cfg(test)]

use crate::board::is_valid_board;
use crate::types::{ArenaState, Error};
use crate::{BingoContract, BingoContractClient};

use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::{token, Address, Bytes, BytesN, Env};

const STAKE: i128 = 10_000_000;
const FEE_BPS: u32 = 100;

struct Setup<'a> {
    env: Env,
    contract_id: Address,
    client: BingoContractClient<'a>,
    token: Address,
}

fn setup() -> Setup<'static> {
    let env = Env::default();
    env.mock_all_auths();

    let token_admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(token_admin);
    let token = sac.address();

    let admin = Address::generate(&env);
    let contract_id = env.register(BingoContract, (admin, token.clone(), FEE_BPS));
    let client = BingoContractClient::new(&env, &contract_id);

    Setup {
        env,
        contract_id,
        client,
        token,
    }
}

fn funded_player(s: &Setup, amount: i128) -> Address {
    let player = Address::generate(&s.env);
    StellarAssetClient::new(&s.env, &s.token).mint(&player, &amount);
    player
}

fn commitment(env: &Env, seed: u8) -> BytesN<32> {
    BytesN::from_array(env, &[seed; 32])
}

// A permutation of 1..=25 in cell order (identity board: number n at cell n-1).
fn valid_board_bytes() -> [u8; 25] {
    let mut b = [0u8; 25];
    let mut i = 0usize;
    while i < 25 {
        b[i] = (i as u8) + 1;
        i += 1;
    }
    b
}

// Numbers 22..=25 sit on cells 0, 6, 12, 18, so calling 1..=21 completes only
// row 4 and column 4 (two lines) and never reaches a bingo.
fn board_two_lines() -> [u8; 25] {
    [
        22, 1, 2, 3, 4, 5, 23, 6, 7, 8, 9, 10, 24, 11, 12, 13, 14, 15, 25, 16, 17, 18, 19, 20, 21,
    ]
}

// Numbers 1..=5 sit on cells 0, 1, 2, 3, 5, so calling 1..=5 completes no line.
fn board_zero_lines() -> [u8; 25] {
    [
        1, 2, 3, 4, 6, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
    ]
}

// Numbers 1..=5 sit on cells 0, 5, 10, 15, 20, so calling 1..=5 completes
// exactly column 0 and nothing else.
fn board_one_column() -> [u8; 25] {
    [
        1, 6, 7, 8, 9, 2, 10, 11, 12, 13, 3, 14, 15, 16, 17, 4, 18, 19, 20, 21, 5, 22, 23, 24, 25,
    ]
}

fn salt_of(env: &Env, seed: u8) -> BytesN<32> {
    BytesN::from_array(env, &[seed; 32])
}

// The board commitment the contract verifies: sha256 over the 25 board bytes
// followed by the 32 salt bytes.
fn commit_for(env: &Env, board: &[u8; 25], salt: &BytesN<32>) -> BytesN<32> {
    let mut preimage = Bytes::from_array(env, board);
    preimage.append(&Bytes::from_array(env, &salt.to_array()));
    env.crypto().sha256(&preimage).to_bytes()
}

// Fill a two seat arena and open its reveal phase (one call flips it to Playing,
// then player one claims). Returns the arena id and both players in seat order.
fn revealing_game(
    s: &Setup,
    board1: &[u8; 25],
    salt1: &BytesN<32>,
    board2: &[u8; 25],
    salt2: &BytesN<32>,
) -> (u32, Address, Address) {
    let p1 = funded_player(s, STAKE);
    let p2 = funded_player(s, STAKE);
    let id = s.client.create_arena(&p1, &STAKE, &2);
    s.client
        .commit_board(&id, &p1, &commit_for(&s.env, board1, salt1));
    s.client
        .commit_board(&id, &p2, &commit_for(&s.env, board2, salt2));
    s.client.call_number(&id, &p1, &1);
    s.client.claim_bingo(&id, &p1);
    (id, p1, p2)
}

#[test]
#[should_panic]
fn constructor_rejects_fee_above_max() {
    let env = Env::default();
    env.mock_all_auths();
    let token_admin = Address::generate(&env);
    let token = env
        .register_stellar_asset_contract_v2(token_admin)
        .address();
    let admin = Address::generate(&env);
    // 501 bps is above MAX_FEE_BPS (500); construction must panic.
    env.register(BingoContract, (admin, token, 501u32));
}

#[test]
fn constructor_accepts_fee_at_max() {
    let env = Env::default();
    env.mock_all_auths();
    let token_admin = Address::generate(&env);
    let token = env
        .register_stellar_asset_contract_v2(token_admin)
        .address();
    let admin = Address::generate(&env);
    let contract_id = env.register(BingoContract, (admin.clone(), token.clone(), 500u32));
    let client = BingoContractClient::new(&env, &contract_id);
    let config = client.config();
    assert_eq!(config.admin, admin);
    assert_eq!(config.token, token);
    assert_eq!(config.fee_bps, 500);
    assert_eq!(client.arena_count(), 0);
}

#[test]
fn create_validates_player_count_and_stake() {
    let s = setup();
    let creator = Address::generate(&s.env);

    // Too few and too many players.
    assert_eq!(
        s.client.try_create_arena(&creator, &STAKE, &1),
        Err(Ok(Error::InvalidPlayerCount))
    );
    assert_eq!(
        s.client.try_create_arena(&creator, &STAKE, &7),
        Err(Ok(Error::InvalidPlayerCount))
    );

    // Stake below the floor.
    assert_eq!(
        s.client.try_create_arena(&creator, &(STAKE - 1), &2),
        Err(Ok(Error::StakeTooLow))
    );

    // Valid bounds succeed and ids start at 1.
    let id = s.client.create_arena(&creator, &STAKE, &2);
    assert_eq!(id, 1);
    assert_eq!(s.client.arena_count(), 1);
    let arena = s.client.get_arena(&id);
    assert_eq!(arena.creator, creator);
    assert_eq!(arena.state, ArenaState::Created);
    assert_eq!(arena.players.len(), 0);

    let id2 = s.client.create_arena(&creator, &STAKE, &6);
    assert_eq!(id2, 2);
}

#[test]
fn get_arena_missing_returns_not_found() {
    let s = setup();
    // Arena has no PartialEq (matching the ABI type), so match instead of ==.
    assert!(matches!(
        s.client.try_get_arena(&999),
        Err(Ok(Error::ArenaNotFound))
    ));
}

#[test]
fn commit_board_escrows_stake() {
    let s = setup();
    let p1 = funded_player(&s, STAKE);
    let p2 = funded_player(&s, STAKE);

    let id = s.client.create_arena(&p1, &STAKE, &2);
    let token_client = token::Client::new(&s.env, &s.token);

    s.client.commit_board(&id, &p1, &commitment(&s.env, 1));
    // One player joined, contract holds one stake.
    assert_eq!(token_client.balance(&s.contract_id), STAKE);
    assert_eq!(token_client.balance(&p1), 0);
    assert_eq!(s.client.get_arena(&id).state, ArenaState::Created);

    s.client.commit_board(&id, &p2, &commitment(&s.env, 2));
    // Both joined, contract holds two stakes and the arena is sealed.
    assert_eq!(token_client.balance(&s.contract_id), STAKE * 2);
    let arena = s.client.get_arena(&id);
    assert_eq!(arena.state, ArenaState::Committed);
    assert_eq!(arena.players.len(), 2);

    // Commitments are readable.
    assert_eq!(s.client.commit_of(&id, &p1), Some(commitment(&s.env, 1)));
    assert_eq!(s.client.commit_of(&id, &p2), Some(commitment(&s.env, 2)));
}

#[test]
fn commit_board_unknown_arena_rejected() {
    let s = setup();
    let p1 = funded_player(&s, STAKE);
    assert_eq!(
        s.client.try_commit_board(&404, &p1, &commitment(&s.env, 1)),
        Err(Ok(Error::ArenaNotFound))
    );
}

#[test]
fn double_join_rejected() {
    let s = setup();
    let p1 = funded_player(&s, STAKE * 2);

    let id = s.client.create_arena(&p1, &STAKE, &3);
    s.client.commit_board(&id, &p1, &commitment(&s.env, 1));

    assert_eq!(
        s.client.try_commit_board(&id, &p1, &commitment(&s.env, 9)),
        Err(Ok(Error::AlreadyJoined))
    );
}

#[test]
fn join_after_full_rejected() {
    let s = setup();
    let p1 = funded_player(&s, STAKE);
    let p2 = funded_player(&s, STAKE);
    let p3 = funded_player(&s, STAKE);

    // Fill a two seat arena, which seals it to Committed.
    let id = s.client.create_arena(&p1, &STAKE, &2);
    s.client.commit_board(&id, &p1, &commitment(&s.env, 1));
    s.client.commit_board(&id, &p2, &commitment(&s.env, 2));

    // A third join is rejected because the arena is no longer Created.
    assert_eq!(
        s.client.try_commit_board(&id, &p3, &commitment(&s.env, 3)),
        Err(Ok(Error::WrongState))
    );
    // The third player kept their stake.
    assert_eq!(token::Client::new(&s.env, &s.token).balance(&p3), STAKE);
}

#[test]
fn cancel_by_creator_refunds_via_earnings() {
    let s = setup();
    let p1 = funded_player(&s, STAKE);
    let p2 = funded_player(&s, STAKE);

    // Three seat arena, only two join, so it stays Created.
    let id = s.client.create_arena(&p1, &STAKE, &3);
    s.client.commit_board(&id, &p1, &commitment(&s.env, 1));
    s.client.commit_board(&id, &p2, &commitment(&s.env, 2));

    s.client.cancel_arena(&id, &p1);

    // Refunds land in the earnings ledger, not back in wallets directly.
    assert_eq!(s.client.earnings_of(&p1), STAKE);
    assert_eq!(s.client.earnings_of(&p2), STAKE);
    assert_eq!(token::Client::new(&s.env, &s.token).balance(&p1), 0);
    assert_eq!(s.client.get_arena(&id).state, ArenaState::Cancelled);
}

#[test]
fn cancel_by_stranger_before_window_rejected() {
    let s = setup();
    let p1 = funded_player(&s, STAKE);
    let stranger = Address::generate(&s.env);

    let id = s.client.create_arena(&p1, &STAKE, &3);
    s.client.commit_board(&id, &p1, &commitment(&s.env, 1));

    assert_eq!(
        s.client.try_cancel_arena(&id, &stranger),
        Err(Ok(Error::CancelNotAllowed))
    );
    assert_eq!(s.client.get_arena(&id).state, ArenaState::Created);
}

#[test]
fn cancel_by_stranger_after_window_allowed() {
    let s = setup();
    let p1 = funded_player(&s, STAKE);
    let stranger = Address::generate(&s.env);

    let id = s.client.create_arena(&p1, &STAKE, &3);
    s.client.commit_board(&id, &p1, &commitment(&s.env, 1));

    // Advance past the join window; anyone may then cancel.
    s.env.ledger().set_timestamp(86_401);
    s.client.cancel_arena(&id, &stranger);

    assert_eq!(s.client.get_arena(&id).state, ArenaState::Cancelled);
    assert_eq!(s.client.earnings_of(&p1), STAKE);
}

#[test]
fn board_validity_accepts_permutation_rejects_bad() {
    let env = Env::default();

    // A permutation of 1..=25 is valid.
    let valid = valid_board_bytes();
    assert!(is_valid_board(&Bytes::from_array(&env, &valid)));

    // A duplicate value is rejected.
    let mut dup = valid;
    dup[24] = dup[0];
    assert!(!is_valid_board(&Bytes::from_array(&env, &dup)));

    // A zero is out of range.
    let mut zero = valid;
    zero[0] = 0;
    assert!(!is_valid_board(&Bytes::from_array(&env, &zero)));

    // Twenty six is out of range.
    let mut over = valid;
    over[0] = 26;
    assert!(!is_valid_board(&Bytes::from_array(&env, &over)));

    // Wrong length is rejected.
    assert!(!is_valid_board(&Bytes::from_array(&env, &[1u8; 24])));
    assert!(!is_valid_board(&Bytes::from_array(&env, &[0u8; 0])));
}

#[test]
fn full_happy_path_single_winner() {
    let s = setup();
    let token_client = token::Client::new(&s.env, &s.token);

    let board1 = valid_board_bytes(); // identity board reaches five lines at call 21
    let board2 = board_two_lines(); // never reaches a bingo
    let salt1 = salt_of(&s.env, 7);
    let salt2 = salt_of(&s.env, 9);

    let p1 = funded_player(&s, STAKE);
    let p2 = funded_player(&s, STAKE);
    let id = s.client.create_arena(&p1, &STAKE, &2);
    s.client
        .commit_board(&id, &p1, &commit_for(&s.env, &board1, &salt1));
    s.client
        .commit_board(&id, &p2, &commit_for(&s.env, &board2, &salt2));

    // The contract escrows both stakes.
    assert_eq!(token_client.balance(&s.contract_id), STAKE * 2);

    // Player two cannot open play out of turn.
    assert_eq!(
        s.client.try_call_number(&id, &p2, &1),
        Err(Ok(Error::NotYourTurn))
    );

    // Alternate calls 1..=21 starting with player one (seat 0).
    let mut n = 1u32;
    while n <= 21 {
        let caller = if (n - 1).is_multiple_of(2) { &p1 } else { &p2 };
        s.client.call_number(&id, caller, &n);
        n += 1;
    }
    let arena = s.client.get_arena(&id);
    assert_eq!(arena.state, ArenaState::Playing);
    assert_eq!(arena.call_count, 21);

    // Player one's board has hit five lines; they claim to open the reveal.
    s.client.claim_bingo(&id, &p1);
    assert_eq!(s.client.get_arena(&id).state, ArenaState::Revealing);

    // Both reveal before the deadline.
    s.client
        .reveal_board(&id, &p1, &Bytes::from_array(&s.env, &board1), &salt1);
    s.client
        .reveal_board(&id, &p2, &Bytes::from_array(&s.env, &board2), &salt2);
    assert_eq!(
        s.client.revealed_board_of(&id, &p1),
        Some(Bytes::from_array(&s.env, &board1))
    );

    // Settle is allowed before the deadline because everyone revealed.
    s.client.settle(&id);
    assert_eq!(s.client.get_arena(&id).state, ArenaState::Settled);

    // total 20_000_000, fee 1% = 200_000, pool 19_800_000, single winner.
    let admin = s.client.config().admin;
    assert_eq!(s.client.earnings_of(&p1), 19_800_000);
    assert_eq!(s.client.earnings_of(&p2), 0);
    assert_eq!(s.client.earnings_of(&admin), 200_000);

    // Withdraw pays out, zeroes the balance, and moves the tokens.
    let paid = s.client.withdraw(&p1);
    assert_eq!(paid, 19_800_000);
    assert_eq!(token_client.balance(&p1), 19_800_000);
    assert_eq!(token_client.balance(&s.contract_id), 200_000);

    s.client.withdraw(&admin);
    assert_eq!(token_client.balance(&admin), 200_000);
    assert_eq!(token_client.balance(&s.contract_id), 0);

    // A second withdraw has nothing to pay.
    assert_eq!(
        s.client.try_withdraw(&p1),
        Err(Ok(Error::NothingToWithdraw))
    );
}

#[test]
fn earliest_index_tie_splits_pool_remainder_to_admin() {
    let s = setup();
    // An odd pool leaves a one unit remainder that joins the fee.
    let stake: i128 = 10_000_050;

    let board = valid_board_bytes(); // both boards are identical and tie at call 21
    let salt1 = salt_of(&s.env, 3);
    let salt2 = salt_of(&s.env, 4);

    let p1 = funded_player(&s, stake);
    let p2 = funded_player(&s, stake);
    let id = s.client.create_arena(&p1, &stake, &2);
    s.client
        .commit_board(&id, &p1, &commit_for(&s.env, &board, &salt1));
    s.client
        .commit_board(&id, &p2, &commit_for(&s.env, &board, &salt2));

    let mut n = 1u32;
    while n <= 21 {
        let caller = if (n - 1).is_multiple_of(2) { &p1 } else { &p2 };
        s.client.call_number(&id, caller, &n);
        n += 1;
    }
    s.client.claim_bingo(&id, &p1);
    s.client
        .reveal_board(&id, &p1, &Bytes::from_array(&s.env, &board), &salt1);
    s.client
        .reveal_board(&id, &p2, &Bytes::from_array(&s.env, &board), &salt2);
    s.client.settle(&id);

    // total 20_000_100, fee 200_001, pool 19_800_099, split two ways leaves 1.
    let admin = s.client.config().admin;
    assert_eq!(s.client.earnings_of(&p1), 9_900_049);
    assert_eq!(s.client.earnings_of(&p2), 9_900_049);
    assert_eq!(s.client.earnings_of(&admin), 200_002);
}

#[test]
fn no_bingo_winner_is_most_completed_lines() {
    let s = setup();
    let board1 = valid_board_bytes(); // completes row 0 after calls 1..=5
    let board2 = board_zero_lines(); // completes no line
    let salt1 = salt_of(&s.env, 1);
    let salt2 = salt_of(&s.env, 2);

    let p1 = funded_player(&s, STAKE);
    let p2 = funded_player(&s, STAKE);
    let id = s.client.create_arena(&p1, &STAKE, &2);
    s.client
        .commit_board(&id, &p1, &commit_for(&s.env, &board1, &salt1));
    s.client
        .commit_board(&id, &p2, &commit_for(&s.env, &board2, &salt2));

    // Only five calls, so nobody reaches five lines.
    let mut n = 1u32;
    while n <= 5 {
        let caller = if (n - 1).is_multiple_of(2) { &p1 } else { &p2 };
        s.client.call_number(&id, caller, &n);
        n += 1;
    }
    s.client.claim_bingo(&id, &p1);
    s.client
        .reveal_board(&id, &p1, &Bytes::from_array(&s.env, &board1), &salt1);
    s.client
        .reveal_board(&id, &p2, &Bytes::from_array(&s.env, &board2), &salt2);
    s.client.settle(&id);

    // Player one completed one line (row 0), player two none, so one winner.
    let admin = s.client.config().admin;
    assert_eq!(s.client.earnings_of(&p1), 19_800_000);
    assert_eq!(s.client.earnings_of(&p2), 0);
    assert_eq!(s.client.earnings_of(&admin), 200_000);
}

#[test]
fn nobody_reveals_sends_pot_to_admin() {
    let s = setup();
    let board = valid_board_bytes();
    let (id, p1, p2) = revealing_game(&s, &board, &salt_of(&s.env, 5), &board, &salt_of(&s.env, 6));

    // Let the reveal window lapse with no reveals.
    let deadline = s.client.get_arena(&id).reveal_deadline;
    s.env.ledger().set_timestamp(deadline + 1);

    s.client.settle(&id);

    let admin = s.client.config().admin;
    assert_eq!(s.client.earnings_of(&admin), STAKE * 2);
    assert_eq!(s.client.earnings_of(&p1), 0);
    assert_eq!(s.client.earnings_of(&p2), 0);
    assert_eq!(s.client.get_arena(&id).state, ArenaState::Settled);
}

#[test]
fn reveal_wrong_salt_rejected() {
    let s = setup();
    let board = valid_board_bytes();
    let salt1 = salt_of(&s.env, 11);
    let (id, p1, _p2) = revealing_game(&s, &board, &salt1, &board, &salt_of(&s.env, 12));

    // A different salt breaks the commitment check.
    let wrong = salt_of(&s.env, 99);
    assert_eq!(
        s.client
            .try_reveal_board(&id, &p1, &Bytes::from_array(&s.env, &board), &wrong),
        Err(Ok(Error::CommitMismatch))
    );
}

#[test]
fn reveal_twice_rejected() {
    let s = setup();
    let board = valid_board_bytes();
    let salt1 = salt_of(&s.env, 21);
    let (id, p1, _p2) = revealing_game(&s, &board, &salt1, &board, &salt_of(&s.env, 22));

    s.client
        .reveal_board(&id, &p1, &Bytes::from_array(&s.env, &board), &salt1);
    assert_eq!(
        s.client
            .try_reveal_board(&id, &p1, &Bytes::from_array(&s.env, &board), &salt1),
        Err(Ok(Error::AlreadyRevealed))
    );
}

#[test]
fn reveal_after_deadline_rejected() {
    let s = setup();
    let board = valid_board_bytes();
    let salt1 = salt_of(&s.env, 31);
    let (id, p1, _p2) = revealing_game(&s, &board, &salt1, &board, &salt_of(&s.env, 32));

    let deadline = s.client.get_arena(&id).reveal_deadline;
    s.env.ledger().set_timestamp(deadline + 1);
    assert_eq!(
        s.client
            .try_reveal_board(&id, &p1, &Bytes::from_array(&s.env, &board), &salt1),
        Err(Ok(Error::RevealWindowClosed))
    );
}

#[test]
fn reveal_invalid_board_rejected() {
    let s = setup();
    // A board that hashes to its commitment but is not a permutation of 1..=25.
    let bad = [1u8; 25];
    let salt1 = salt_of(&s.env, 51);
    let (id, p1, _p2) =
        revealing_game(&s, &bad, &salt1, &valid_board_bytes(), &salt_of(&s.env, 52));

    assert_eq!(
        s.client
            .try_reveal_board(&id, &p1, &Bytes::from_array(&s.env, &bad), &salt1),
        Err(Ok(Error::InvalidBoard))
    );
}

#[test]
fn settle_window_open_not_all_revealed_rejected() {
    let s = setup();
    let board = valid_board_bytes();
    let salt1 = salt_of(&s.env, 41);
    let (id, p1, _p2) = revealing_game(&s, &board, &salt1, &board, &salt_of(&s.env, 42));

    // Only player one reveals while the window is still open.
    s.client
        .reveal_board(&id, &p1, &Bytes::from_array(&s.env, &board), &salt1);
    assert_eq!(s.client.try_settle(&id), Err(Ok(Error::RevealWindowOpen)));
}

#[test]
fn call_number_out_of_range_rejected() {
    let s = setup();
    let board = valid_board_bytes();
    let p1 = funded_player(&s, STAKE);
    let p2 = funded_player(&s, STAKE);
    let id = s.client.create_arena(&p1, &STAKE, &2);
    s.client
        .commit_board(&id, &p1, &commit_for(&s.env, &board, &salt_of(&s.env, 1)));
    s.client
        .commit_board(&id, &p2, &commit_for(&s.env, &board, &salt_of(&s.env, 2)));

    // Player one holds the turn; 0 and 26 are out of range.
    assert_eq!(
        s.client.try_call_number(&id, &p1, &0),
        Err(Ok(Error::NumberOutOfRange))
    );
    assert_eq!(
        s.client.try_call_number(&id, &p1, &26),
        Err(Ok(Error::NumberOutOfRange))
    );
}

#[test]
fn call_number_repeat_rejected() {
    let s = setup();
    let board = valid_board_bytes();
    let p1 = funded_player(&s, STAKE);
    let p2 = funded_player(&s, STAKE);
    let id = s.client.create_arena(&p1, &STAKE, &2);
    s.client
        .commit_board(&id, &p1, &commit_for(&s.env, &board, &salt_of(&s.env, 1)));
    s.client
        .commit_board(&id, &p2, &commit_for(&s.env, &board, &salt_of(&s.env, 2)));

    s.client.call_number(&id, &p1, &5);
    // Player two holds the turn now; 5 has already been called.
    assert_eq!(
        s.client.try_call_number(&id, &p2, &5),
        Err(Ok(Error::NumberAlreadyCalled))
    );
}

#[test]
fn call_number_by_stranger_rejected() {
    let s = setup();
    let board = valid_board_bytes();
    let p1 = funded_player(&s, STAKE);
    let p2 = funded_player(&s, STAKE);
    let stranger = Address::generate(&s.env);
    let id = s.client.create_arena(&p1, &STAKE, &2);
    s.client
        .commit_board(&id, &p1, &commit_for(&s.env, &board, &salt_of(&s.env, 1)));
    s.client
        .commit_board(&id, &p2, &commit_for(&s.env, &board, &salt_of(&s.env, 2)));

    assert_eq!(
        s.client.try_call_number(&id, &stranger, &1),
        Err(Ok(Error::NotAPlayer))
    );
}

#[test]
fn call_number_wrong_state_rejected() {
    let s = setup();
    let board = valid_board_bytes();
    let p1 = funded_player(&s, STAKE);
    let p2 = funded_player(&s, STAKE);

    // Not started: a Created arena that is not yet full cannot take calls.
    let id = s.client.create_arena(&p1, &STAKE, &2);
    s.client
        .commit_board(&id, &p1, &commit_for(&s.env, &board, &salt_of(&s.env, 1)));
    assert_eq!(
        s.client.try_call_number(&id, &p1, &1),
        Err(Ok(Error::WrongState))
    );

    // Finished: once the reveal phase is open, calls are rejected.
    s.client
        .commit_board(&id, &p2, &commit_for(&s.env, &board, &salt_of(&s.env, 2)));
    s.client.call_number(&id, &p1, &1);
    s.client.claim_bingo(&id, &p1);
    assert_eq!(
        s.client.try_call_number(&id, &p1, &2),
        Err(Ok(Error::WrongState))
    );
}

#[test]
fn partial_reveal_past_deadline_forfeits_non_revealer() {
    let s = setup();
    let board = valid_board_bytes();
    let salt1 = salt_of(&s.env, 61);
    let (id, p1, p2) = revealing_game(&s, &board, &salt1, &board, &salt_of(&s.env, 62));

    // Only player one reveals; the window then lapses.
    s.client
        .reveal_board(&id, &p1, &Bytes::from_array(&s.env, &board), &salt1);
    let deadline = s.client.get_arena(&id).reveal_deadline;
    s.env.ledger().set_timestamp(deadline + 1);

    s.client.settle(&id);
    assert_eq!(s.client.get_arena(&id).state, ArenaState::Settled);

    // The non revealer forfeits: their stake stays in the pot, so the sole
    // revealer takes the full pool of both stakes minus the fee.
    // total 20_000_000, fee 1% = 200_000, pool 19_800_000, one winner, no remainder.
    let admin = s.client.config().admin;
    assert_eq!(s.client.earnings_of(&p1), 19_800_000);
    assert_eq!(s.client.earnings_of(&p2), 0);
    assert_eq!(s.client.earnings_of(&admin), 200_000);
    // Every unit of the two escrowed stakes is accounted for.
    assert_eq!(
        s.client.earnings_of(&p1) + s.client.earnings_of(&p2) + s.client.earnings_of(&admin),
        STAKE * 2
    );
}

#[test]
fn no_bingo_line_tie_splits_pool_remainder_to_admin() {
    let s = setup();
    // An odd pool leaves a one unit remainder that joins the fee.
    let stake: i128 = 10_000_050;

    // After calls 1..=5 both boards complete exactly one line (row 0 for the
    // identity board, column 0 for the other), so the settle ties on lines.
    let board1 = valid_board_bytes();
    let board2 = board_one_column();
    let salt1 = salt_of(&s.env, 71);
    let salt2 = salt_of(&s.env, 72);

    let p1 = funded_player(&s, stake);
    let p2 = funded_player(&s, stake);
    let id = s.client.create_arena(&p1, &stake, &2);
    s.client
        .commit_board(&id, &p1, &commit_for(&s.env, &board1, &salt1));
    s.client
        .commit_board(&id, &p2, &commit_for(&s.env, &board2, &salt2));

    let mut n = 1u32;
    while n <= 5 {
        let caller = if (n - 1).is_multiple_of(2) { &p1 } else { &p2 };
        s.client.call_number(&id, caller, &n);
        n += 1;
    }
    s.client.claim_bingo(&id, &p1);
    s.client
        .reveal_board(&id, &p1, &Bytes::from_array(&s.env, &board1), &salt1);
    s.client
        .reveal_board(&id, &p2, &Bytes::from_array(&s.env, &board2), &salt2);
    s.client.settle(&id);

    // total 20_000_100, fee 200_001, pool 19_800_099, split two ways leaves 1.
    let admin = s.client.config().admin;
    assert_eq!(s.client.earnings_of(&p1), 9_900_049);
    assert_eq!(s.client.earnings_of(&p2), 9_900_049);
    assert_eq!(s.client.earnings_of(&admin), 200_002);
    // Every unit of the two escrowed stakes is accounted for.
    assert_eq!(
        s.client.earnings_of(&p1) + s.client.earnings_of(&p2) + s.client.earnings_of(&admin),
        stake * 2
    );
}

#[test]
fn losing_claimant_gains_no_advantage() {
    let s = setup();
    // Over calls 1..=23 in order, the two lines board reaches five lines at
    // call 23 while the identity board reaches them at call 21, so the
    // claimant holds the later bingo index and must lose the replay.
    let board1 = board_two_lines();
    let board2 = valid_board_bytes();
    let salt1 = salt_of(&s.env, 81);
    let salt2 = salt_of(&s.env, 82);

    let p1 = funded_player(&s, STAKE);
    let p2 = funded_player(&s, STAKE);
    let id = s.client.create_arena(&p1, &STAKE, &2);
    s.client
        .commit_board(&id, &p1, &commit_for(&s.env, &board1, &salt1));
    s.client
        .commit_board(&id, &p2, &commit_for(&s.env, &board2, &salt2));

    let mut n = 1u32;
    while n <= 23 {
        let caller = if (n - 1).is_multiple_of(2) { &p1 } else { &p2 };
        s.client.call_number(&id, caller, &n);
        n += 1;
    }
    // Player one claims on their own bingo at call 23.
    s.client.claim_bingo(&id, &p1);
    s.client
        .reveal_board(&id, &p1, &Bytes::from_array(&s.env, &board1), &salt1);
    s.client
        .reveal_board(&id, &p2, &Bytes::from_array(&s.env, &board2), &salt2);
    s.client.settle(&id);

    // The claim only froze the sequence; player two's earlier index wins all.
    // total 20_000_000, fee 200_000, pool 19_800_000, one winner.
    let admin = s.client.config().admin;
    assert_eq!(s.client.earnings_of(&p1), 0);
    assert_eq!(s.client.earnings_of(&p2), 19_800_000);
    assert_eq!(s.client.earnings_of(&admin), 200_000);
}

#[test]
fn stale_committed_arena_cancelled_by_anyone_after_window() {
    let s = setup();
    let board = valid_board_bytes();
    let p1 = funded_player(&s, STAKE);
    let p2 = funded_player(&s, STAKE);
    let stranger = Address::generate(&s.env);

    // Fill the table so it seals to Committed; nobody ever calls.
    let id = s.client.create_arena(&p1, &STAKE, &2);
    s.client
        .commit_board(&id, &p1, &commit_for(&s.env, &board, &salt_of(&s.env, 1)));
    s.client
        .commit_board(&id, &p2, &commit_for(&s.env, &board, &salt_of(&s.env, 2)));
    assert_eq!(s.client.get_arena(&id).state, ArenaState::Committed);

    // Past the join window a non creator may free the stranded stakes.
    let created_at = s.client.get_arena(&id).created_at;
    s.env.ledger().set_timestamp(created_at + 86_401);
    s.client.cancel_arena(&id, &stranger);

    assert_eq!(s.client.get_arena(&id).state, ArenaState::Cancelled);
    assert_eq!(s.client.earnings_of(&p1), STAKE);
    assert_eq!(s.client.earnings_of(&p2), STAKE);
    assert_eq!(s.client.earnings_of(&stranger), 0);
    // Every escrowed unit is refunded, still held by the contract for withdraw.
    assert_eq!(
        s.client.earnings_of(&p1) + s.client.earnings_of(&p2),
        STAKE * 2
    );
    assert_eq!(
        token::Client::new(&s.env, &s.token).balance(&s.contract_id),
        STAKE * 2
    );
}

#[test]
fn committed_cancel_before_window_rejected() {
    let s = setup();
    let board = valid_board_bytes();
    let p1 = funded_player(&s, STAKE);
    let p2 = funded_player(&s, STAKE);
    let stranger = Address::generate(&s.env);

    let id = s.client.create_arena(&p1, &STAKE, &2);
    s.client
        .commit_board(&id, &p1, &commit_for(&s.env, &board, &salt_of(&s.env, 1)));
    s.client
        .commit_board(&id, &p2, &commit_for(&s.env, &board, &salt_of(&s.env, 2)));

    // Inside the window nobody may cancel a full table, not even the creator.
    assert_eq!(
        s.client.try_cancel_arena(&id, &p1),
        Err(Ok(Error::CancelNotAllowed))
    );
    assert_eq!(
        s.client.try_cancel_arena(&id, &stranger),
        Err(Ok(Error::CancelNotAllowed))
    );
    assert_eq!(s.client.get_arena(&id).state, ArenaState::Committed);
}

#[test]
fn cancel_after_play_started_rejected() {
    let s = setup();
    let board = valid_board_bytes();
    let p1 = funded_player(&s, STAKE);
    let p2 = funded_player(&s, STAKE);

    let id = s.client.create_arena(&p1, &STAKE, &2);
    s.client
        .commit_board(&id, &p1, &commit_for(&s.env, &board, &salt_of(&s.env, 1)));
    s.client
        .commit_board(&id, &p2, &commit_for(&s.env, &board, &salt_of(&s.env, 2)));
    s.client.call_number(&id, &p1, &1);
    assert_eq!(s.client.get_arena(&id).state, ArenaState::Playing);

    // Once a call has landed the escape hatch closes, even past the window.
    let created_at = s.client.get_arena(&id).created_at;
    s.env.ledger().set_timestamp(created_at + 86_401);
    assert_eq!(
        s.client.try_cancel_arena(&id, &p1),
        Err(Ok(Error::WrongState))
    );
    assert_eq!(s.client.get_arena(&id).state, ArenaState::Playing);
}
