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

/// The 12 winning lines as bitmasks over the 25 cell positions (bit `p` set when
/// cell `p = row * 5 + col` is part of the line): 5 rows, 5 columns, 2 diagonals.
/// Values copied verbatim from the reference LineLib.
pub const LINE_MASKS: [u32; 12] = [
    0x000_001F, // row 0    positions 0-4
    0x000_03E0, // row 1    positions 5-9
    0x000_7C00, // row 2    positions 10-14
    0x00F_8000, // row 3    positions 15-19
    0x1F0_0000, // row 4    positions 20-24
    0x010_8421, // col 0    positions 0,5,10,15,20
    0x021_0842, // col 1    positions 1,6,11,16,21
    0x042_1084, // col 2    positions 2,7,12,17,22
    0x084_2108, // col 3    positions 3,8,13,18,23
    0x108_4210, // col 4    positions 4,9,14,19,24
    0x104_1041, // main diagonal    positions 0,6,12,18,24
    0x011_1110, // anti diagonal    positions 4,8,12,16,20
];

/// Count how many of the 12 lines are fully contained in `marked_mask`.
pub fn count_completed_lines(marked_mask: u32) -> u32 {
    let mut count = 0u32;
    for lm in LINE_MASKS.iter() {
        if marked_mask & lm == *lm {
            count += 1;
        }
    }
    count
}

/// Marked cell bitmask for `board` given the called numbers: bit `p` set when the
/// number at cell `p` is present in `called_mask` (bit `n-1` set for number `n`).
pub fn marks(board: &Bytes, called_mask: u32) -> u32 {
    let mut marked: u32 = 0;
    for (position, n) in board.iter().enumerate() {
        let n = n as u32;
        if (1..=BOARD_SIZE).contains(&n) && called_mask & (1u32 << (n - 1)) != 0 {
            marked |= 1u32 << (position as u32);
        }
    }
    marked
}

/// Earliest 1-based call index at which replaying `calls` against `board` reaches
/// at least 5 completed lines, or None if it never does. Numbers not on the board
/// advance the index but mark nothing, matching the reference replay.
pub fn bingo_index(board: &Bytes, calls: &Bytes) -> Option<u32> {
    // pos[n] holds the 1-based cell index of number n, 0 when absent.
    let mut pos = [0u8; 26];
    for (position, n) in board.iter().enumerate() {
        let n = n as usize;
        if (1..=25).contains(&n) {
            pos[n] = (position + 1) as u8;
        }
    }

    let mut marked: u32 = 0;
    for (offset, c) in calls.iter().enumerate() {
        let c = c as usize;
        if !(1..=25).contains(&c) {
            continue;
        }
        let cell = pos[c];
        if cell == 0 {
            continue;
        }
        marked |= 1u32 << (cell as u32 - 1);
        if count_completed_lines(marked) >= 5 {
            return Some(offset as u32 + 1);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{Bytes, Env};

    fn identity_board(env: &Env) -> Bytes {
        let mut b = [0u8; 25];
        let mut i = 0usize;
        while i < 25 {
            b[i] = (i as u8) + 1;
            i += 1;
        }
        Bytes::from_array(env, &b)
    }

    #[test]
    fn line_masks_match_reference() {
        assert_eq!(LINE_MASKS.len(), 12);
        assert_eq!(LINE_MASKS[0], 0x000_001F);
        assert_eq!(LINE_MASKS[1], 0x000_03E0);
        assert_eq!(LINE_MASKS[2], 0x000_7C00);
        assert_eq!(LINE_MASKS[3], 0x00F_8000);
        assert_eq!(LINE_MASKS[4], 0x1F0_0000);
        assert_eq!(LINE_MASKS[5], 0x010_8421);
        assert_eq!(LINE_MASKS[6], 0x021_0842);
        assert_eq!(LINE_MASKS[7], 0x042_1084);
        assert_eq!(LINE_MASKS[8], 0x084_2108);
        assert_eq!(LINE_MASKS[9], 0x108_4210);
        assert_eq!(LINE_MASKS[10], 0x104_1041);
        assert_eq!(LINE_MASKS[11], 0x011_1110);
    }

    #[test]
    fn count_completed_lines_known_masks() {
        assert_eq!(count_completed_lines(0), 0);
        // A single row is one line and completes nothing else.
        assert_eq!(count_completed_lines(LINE_MASKS[0]), 1);
        // Two disjoint rows complete no column, so exactly two lines.
        assert_eq!(count_completed_lines(LINE_MASKS[0] | LINE_MASKS[2]), 2);
        // Every cell marked completes all twelve lines.
        assert_eq!(count_completed_lines(0x1FF_FFFF), 12);
        // Positions 0..=20 complete rows 0-3, column 0, and the anti diagonal.
        assert_eq!(count_completed_lines((1u32 << 21) - 1), 6);
    }

    #[test]
    fn marks_maps_called_numbers_to_positions() {
        let env = Env::default();
        let board = identity_board(&env);
        // Numbers 1..=5 called maps to positions 0..=4 on the identity board.
        assert_eq!(marks(&board, 0x1F), 0x1F);

        // Reversed board places number 25 at position 0.
        let mut rev = [0u8; 25];
        let mut i = 0usize;
        while i < 25 {
            rev[i] = 25 - (i as u8);
            i += 1;
        }
        let rboard = Bytes::from_array(&env, &rev);
        assert_eq!(marks(&rboard, 1u32 << 24), 1);
    }

    #[test]
    fn bingo_index_reaches_five_lines_at_known_index() {
        let env = Env::default();
        let board = identity_board(&env);
        // Calling 1..=21 in order completes rows 0-3 at the 20th call (four
        // lines), then column 0 and the anti diagonal at the 21st, crossing five.
        let calls21 = Bytes::from_array(
            &env,
            &[
                1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
            ],
        );
        assert_eq!(bingo_index(&board, &calls21), Some(21));

        let calls20 = Bytes::from_array(
            &env,
            &[
                1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
            ],
        );
        assert_eq!(bingo_index(&board, &calls20), None);
    }

    #[test]
    fn bingo_index_returns_none_when_never_five_lines() {
        let env = Env::default();
        let board = identity_board(&env);
        let calls = Bytes::from_array(&env, &[1, 2, 3]);
        assert_eq!(bingo_index(&board, &calls), None);
    }
}
