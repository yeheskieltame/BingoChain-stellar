// Pure 5x5 board math, mirroring contracts/bingo/src/board.rs exactly.
// Shared by the practice engine and both game rooms. No react, no wallet,
// no contract, no transactions: keep this file dependency free.

/** Numbers run 1..25, one per cell of the 5x5 board. */
export const MAX_NUMBER = 25;

/** Completed lines needed for bingo. */
export const BINGO_LINES = 5;

/** The 12 winning lines as bitmasks over the 25 cell positions (bit p set
 * when cell p = row * 5 + col is on the line): 5 rows, 5 columns, 2
 * diagonals. Values copied verbatim from the contract's LINE_MASKS. */
export const LINE_MASKS: number[] = [
  0x000001f, // row 0    positions 0-4
  0x00003e0, // row 1    positions 5-9
  0x0007c00, // row 2    positions 10-14
  0x00f8000, // row 3    positions 15-19
  0x1f00000, // row 4    positions 20-24
  0x0108421, // col 0    positions 0,5,10,15,20
  0x0210842, // col 1    positions 1,6,11,16,21
  0x0421084, // col 2    positions 2,7,12,17,22
  0x0842108, // col 3    positions 3,8,13,18,23
  0x1084210, // col 4    positions 4,9,14,19,24
  0x1041041, // main diagonal    positions 0,6,12,18,24
  0x0111110, // anti diagonal    positions 4,8,12,16,20
];

/** Indexes into LINE_MASKS of every line fully contained in the marked-cell
 * mask, in mask order (rows, columns, main diagonal, anti diagonal). */
export function completedLineIndexes(marked: number): number[] {
  const indexes: number[] = [];
  LINE_MASKS.forEach((lm, i) => {
    if ((marked & lm) === lm) indexes.push(i);
  });
  return indexes;
}

/** How many of the 12 lines are fully contained in the marked-cell mask. */
export function countCompletedLines(marked: number): number {
  return completedLineIndexes(marked).length;
}

/** The letter meter: one letter of BINGO per completed line, five or more
 * spelling the whole word. */
export function lineLetters(count: number): string {
  return "BINGO".slice(0, Math.max(0, Math.min(count, BINGO_LINES)));
}

/** Marked cell bitmask for board given the called numbers: bit p set when
 * the number at cell p is in calledMask (bit n-1 set for number n). */
export function marks(board: number[], calledMask: number): number {
  let marked = 0;
  board.forEach((n, position) => {
    if (n >= 1 && n <= MAX_NUMBER && (calledMask & (1 << (n - 1))) !== 0) {
      marked |= 1 << position;
    }
  });
  return marked;
}

/** Earliest 1-based call index at which replaying calls against board
 * reaches at least 5 completed lines, or null if it never does. Matches the
 * contract's bingo_index replay, including skipping out-of-range calls. */
export function bingoIndex(board: number[], calls: number[]): number | null {
  // positionOf[n] holds the 1-based cell index of number n, 0 when absent.
  const positionOf = new Array<number>(MAX_NUMBER + 1).fill(0);
  board.forEach((n, position) => {
    if (n >= 1 && n <= MAX_NUMBER) positionOf[n] = position + 1;
  });

  let marked = 0;
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    if (c < 1 || c > MAX_NUMBER) continue;
    const cell = positionOf[c];
    if (cell === 0) continue;
    marked |= 1 << (cell - 1);
    if (countCompletedLines(marked) >= BINGO_LINES) return i + 1;
  }
  return null;
}
