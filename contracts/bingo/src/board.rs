use soroban_sdk::Bytes;

/// Number of cells on a 5x5 board.
const BOARD_SIZE: u32 = 25;

/// True iff `board` has length 25 and is a permutation of the numbers 1..=25
/// (each present exactly once). Single pass over a 25 bit seen set.
pub fn is_valid_board(board: &Bytes) -> bool {
    if board.len() != BOARD_SIZE {
        return false;
    }
    let mut seen: u32 = 0;
    for n in board.iter() {
        let n = n as u32;
        if !(1..=BOARD_SIZE).contains(&n) {
            return false;
        }
        let bit = 1u32 << (n - 1);
        if seen & bit != 0 {
            return false;
        }
        seen |= bit;
    }
    true
}
