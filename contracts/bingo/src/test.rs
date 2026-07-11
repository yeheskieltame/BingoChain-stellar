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

// A permutation of 1..=25 in cell order.
fn valid_board_bytes() -> [u8; 25] {
    let mut b = [0u8; 25];
    let mut i = 0usize;
    while i < 25 {
        b[i] = (i as u8) + 1;
        i += 1;
    }
    b
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
