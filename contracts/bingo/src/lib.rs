#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Symbol, Vec, symbol_short};

// =============================================================================
// P2P Bingo — a fully on-chain, peer-to-peer Bingo game on Soroban.
//
// Anyone can create a game; anyone can join; anyone can draw the next number
// (decentralized draw, no privileged host); a player claims BINGO and the
// contract verifies the win on-chain. Cards are 5x5 (B-I-N-G-O columns) with a
// free center cell. No central server — every action is a transaction.
// =============================================================================

const GAMES: Symbol = symbol_short!("GAMES");

const SIZE: u32 = 5; // 5x5 card
const CELLS: u32 = 25;
const CENTER: u32 = 12; // index of the free center cell
const MAX_BALL: u64 = 75; // numbers 1..=75

#[contracttype]
#[derive(Clone, PartialEq, Debug)]
pub enum Status {
    Open,     // created, waiting / accepting players
    Playing,  // at least one number drawn
    Finished, // someone claimed bingo
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Player {
    pub addr: Address,
    /// 25 numbers, row-major. The center cell (index 12) is 0 = free space.
    pub card: Vec<u32>,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Game {
    pub id: u32,
    pub host: Address,
    pub players: Vec<Player>,
    pub drawn: Vec<u32>,
    pub status: Status,
    pub winner: Option<Address>,
}

#[contract]
pub struct BingoContract;

#[contractimpl]
impl BingoContract {
    /// Create a new game. The host auto-joins with a fresh card. Returns the game id.
    pub fn create_game(env: Env, host: Address) -> u32 {
        host.require_auth();

        let mut games = Self::load_games(&env);
        let id = games.len();

        let host_player = Player {
            addr: host.clone(),
            card: gen_card(&env),
        };
        let mut players = Vec::new(&env);
        players.push_back(host_player);

        let game = Game {
            id,
            host,
            players,
            drawn: Vec::new(&env),
            status: Status::Open,
            winner: None,
        };

        games.push_back(game);
        Self::save_games(&env, &games);
        id
    }

    /// Join an existing game with a freshly generated card.
    pub fn join_game(env: Env, game_id: u32, player: Address) -> Vec<u32> {
        player.require_auth();

        let mut games = Self::load_games(&env);
        let mut game = games.get(game_id).expect("game not found");

        if game.status == Status::Finished {
            panic!("game already finished");
        }
        if find_index(&game.players, &player).is_some() {
            panic!("already joined");
        }

        let card = gen_card(&env);
        game.players.push_back(Player {
            addr: player,
            card: card.clone(),
        });
        games.set(game_id, game);
        Self::save_games(&env, &games);
        card
    }

    /// Draw the next random number for a game. Permissionless — anyone may call.
    pub fn draw_number(env: Env, game_id: u32) -> u32 {
        let mut games = Self::load_games(&env);
        let mut game = games.get(game_id).expect("game not found");

        if game.status == Status::Finished {
            panic!("game already finished");
        }
        if (game.drawn.len() as u64) >= MAX_BALL {
            panic!("all numbers drawn");
        }

        // Draw a number in 1..=75 that has not been drawn yet.
        let mut n: u32;
        loop {
            n = 1 + (env.prng().gen::<u64>() % MAX_BALL) as u32;
            if !contains(&game.drawn, n) {
                break;
            }
        }

        game.drawn.push_back(n);
        if game.status == Status::Open {
            game.status = Status::Playing;
        }
        games.set(game_id, game);
        Self::save_games(&env, &games);
        n
    }

    /// Claim BINGO. The contract verifies the caller's card against drawn numbers.
    /// Returns true and ends the game on a valid win; false otherwise.
    pub fn claim_bingo(env: Env, game_id: u32, player: Address) -> bool {
        player.require_auth();

        let mut games = Self::load_games(&env);
        let mut game = games.get(game_id).expect("game not found");

        if game.status == Status::Finished {
            panic!("game already finished");
        }

        let idx = find_index(&game.players, &player).expect("not a player in this game");
        let p = game.players.get(idx).unwrap();

        if has_bingo(&p.card, &game.drawn) {
            game.status = Status::Finished;
            game.winner = Some(player);
            games.set(game_id, game);
            Self::save_games(&env, &games);
            true
        } else {
            false
        }
    }

    /// Read a single game.
    pub fn get_game(env: Env, game_id: u32) -> Game {
        Self::load_games(&env).get(game_id).expect("game not found")
    }

    /// Read all games (lobby view).
    pub fn get_games(env: Env) -> Vec<Game> {
        Self::load_games(&env)
    }

    fn load_games(env: &Env) -> Vec<Game> {
        env.storage()
            .instance()
            .get(&GAMES)
            .unwrap_or(Vec::new(env))
    }

    fn save_games(env: &Env, games: &Vec<Game>) {
        env.storage().instance().set(&GAMES, games);
        // Keep the contract data alive across ledgers.
        env.storage().instance().extend_ttl(50_000, 100_000);
    }
}

// ----------------------------- pure helpers ----------------------------------

fn contains(v: &Vec<u32>, n: u32) -> bool {
    for x in v.iter() {
        if x == n {
            return true;
        }
    }
    false
}

fn find_index(players: &Vec<Player>, addr: &Address) -> Option<u32> {
    for i in 0..players.len() {
        if &players.get(i).unwrap().addr == addr {
            return Some(i);
        }
    }
    None
}

/// Generate a standard Bingo card: column c holds 5 distinct numbers from
/// [c*15+1, c*15+15]; center cell is the free space (0). Stored row-major.
fn gen_card(env: &Env) -> Vec<u32> {
    let mut grid = [0u32; 25];

    for c in 0..SIZE {
        let lo = c * 15 + 1;
        let mut chosen = [0u32; 5];
        let mut count: usize = 0;
        while count < 5 {
            let n = lo + (env.prng().gen::<u64>() % 15) as u32;
            let mut dup = false;
            for i in 0..count {
                if chosen[i] == n {
                    dup = true;
                    break;
                }
            }
            if dup {
                continue;
            }
            chosen[count] = n;
            count += 1;
        }
        for r in 0..5usize {
            grid[r * 5 + c as usize] = chosen[r];
        }
    }

    grid[CENTER as usize] = 0; // free space

    let mut card = Vec::new(env);
    for i in 0..(CELLS as usize) {
        card.push_back(grid[i]);
    }
    card
}

fn is_marked(card: &Vec<u32>, idx: u32, drawn: &Vec<u32>) -> bool {
    let v = card.get(idx).unwrap();
    v == 0 || contains(drawn, v)
}

/// True if the card has any completed line: a full row, column, or diagonal.
fn has_bingo(card: &Vec<u32>, drawn: &Vec<u32>) -> bool {
    // rows
    for r in 0..SIZE {
        let mut all = true;
        for c in 0..SIZE {
            if !is_marked(card, r * SIZE + c, drawn) {
                all = false;
                break;
            }
        }
        if all {
            return true;
        }
    }
    // columns
    for c in 0..SIZE {
        let mut all = true;
        for r in 0..SIZE {
            if !is_marked(card, r * SIZE + c, drawn) {
                all = false;
                break;
            }
        }
        if all {
            return true;
        }
    }
    // main diagonal
    let mut d = true;
    for i in 0..SIZE {
        if !is_marked(card, i * SIZE + i, drawn) {
            d = false;
            break;
        }
    }
    if d {
        return true;
    }
    // anti-diagonal
    let mut d = true;
    for i in 0..SIZE {
        if !is_marked(card, i * SIZE + (SIZE - 1 - i), drawn) {
            d = false;
            break;
        }
    }
    d
}

mod test;
