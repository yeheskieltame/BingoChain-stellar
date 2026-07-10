#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

fn setup() -> (Env, BingoContractClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(BingoContract, ());
    let client = BingoContractClient::new(&env, &contract_id);
    (env, client)
}

#[test]
fn create_and_join() {
    let (env, client) = setup();
    let host = Address::generate(&env);
    let alice = Address::generate(&env);

    let id = client.create_game(&host);
    assert_eq!(id, 0);

    let game = client.get_game(&0);
    assert_eq!(game.status, Status::Open);
    assert_eq!(game.players.len(), 1);
    assert_eq!(game.host, host);

    // Host's card has 25 cells and a free center.
    let card = game.players.get(0).unwrap().card;
    assert_eq!(card.len(), 25);
    assert_eq!(card.get(CENTER).unwrap(), 0);

    client.join_game(&0, &alice);
    let game = client.get_game(&0);
    assert_eq!(game.players.len(), 2);
}

#[test]
#[should_panic(expected = "already joined")]
fn cannot_join_twice() {
    let (env, client) = setup();
    let host = Address::generate(&env);
    client.create_game(&host);
    client.join_game(&0, &host); // host already joined on create
}

#[test]
fn draw_advances_status_and_is_unique() {
    let (env, client) = setup();
    let host = Address::generate(&env);
    client.create_game(&host);

    let n = client.draw_number(&0);
    assert!((1..=75).contains(&n));

    let game = client.get_game(&0);
    assert_eq!(game.status, Status::Playing);
    assert_eq!(game.drawn.len(), 1);

    // Draw several more; all must remain unique.
    for _ in 0..20 {
        client.draw_number(&0);
    }
    let game = client.get_game(&0);
    let drawn = game.drawn;
    for i in 0..drawn.len() {
        for j in (i + 1)..drawn.len() {
            assert_ne!(drawn.get(i).unwrap(), drawn.get(j).unwrap());
        }
    }
}

#[test]
fn no_bingo_at_start() {
    let (env, client) = setup();
    let host = Address::generate(&env);
    client.create_game(&host);
    // No numbers drawn yet — only the free center is marked, so no line.
    assert_eq!(client.claim_bingo(&0, &host), false);
}

#[test]
fn full_draw_wins() {
    let (env, client) = setup();
    let host = Address::generate(&env);
    client.create_game(&host);

    // Draw all 75 numbers — every cell is now covered, so any line completes.
    for _ in 0..75 {
        client.draw_number(&0);
    }

    let won = client.claim_bingo(&0, &host);
    assert!(won);

    let game = client.get_game(&0);
    assert_eq!(game.status, Status::Finished);
    assert_eq!(game.winner, Some(host));
}
