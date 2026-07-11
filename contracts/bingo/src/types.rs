use soroban_sdk::{contracterror, contracttype, Address, Bytes, Vec};

/// Contract error codes. The numeric values are part of the ABI: the frontend
/// error mapper decodes them by code, so never renumber an existing variant.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    FeeTooHigh = 1,
    InvalidPlayerCount = 2,
    StakeTooLow = 3,
    ArenaNotFound = 4,
    WrongState = 5,
    AlreadyJoined = 6,
    ArenaFull = 7,
    NotAPlayer = 8,
    NotYourTurn = 9,
    NumberOutOfRange = 10,
    NumberAlreadyCalled = 11,
    CommitMismatch = 12,
    AlreadyRevealed = 13,
    RevealWindowClosed = 14,
    RevealWindowOpen = 15,
    InvalidBoard = 16,
    NothingToWithdraw = 17,
    CancelNotAllowed = 18,
}

/// Lifecycle of a single arena, advanced only in the order declared here.
#[contracttype]
#[derive(Clone, PartialEq, Debug)]
pub enum ArenaState {
    Created,
    Committed,
    Playing,
    Revealing,
    Settled,
    Cancelled,
}

/// A staked peer to peer bingo arena. Gameplay fields (called_mask, call_count,
/// turn_index, call_sequence, reveal_deadline) are set by later gameplay calls
/// and start zeroed at creation.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Arena {
    pub id: u32,
    pub creator: Address,
    pub stake: i128,
    pub max_players: u32,
    pub state: ArenaState,
    pub players: Vec<Address>,
    pub called_mask: u32,
    pub call_count: u32,
    pub turn_index: u32,
    // One byte per called number, in call order.
    pub call_sequence: Bytes,
    pub reveal_deadline: u64,
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    // instance: Config
    Config,
    // instance: u32
    ArenaCount,
    // persistent: Arena
    Arena(u32),
    // persistent: BytesN<32>, the sealed board commitment
    Commit(u32, Address),
    // persistent: Bytes(25), the revealed board
    Board(u32, Address),
    // persistent: i128, pull payment balance
    Earnings(Address),
}

#[contracttype]
#[derive(Clone)]
pub struct Config {
    pub admin: Address,
    pub token: Address,
    pub fee_bps: u32,
}
