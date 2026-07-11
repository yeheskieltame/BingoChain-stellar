// A pure, synchronous practice engine mirroring contracts/bingo/src/board.rs
// and the contract's settlement rules exactly, so what the bot game teaches
// is what the chain enforces. No wallet, no contract, no transactions: this
// file must never import from wallet.ts, contract.ts, tx.ts, or the
// generated bindings. State is immutable; every function returns a new state
// or, for a rejected move, the same state unchanged.

import { isValidBoard, randomBoard } from "./commit";

const MAX_NUMBER = 25;
const BINGO_LINES = 5;

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

/** How many of the 12 lines are fully contained in the marked-cell mask. */
export function countCompletedLines(marked: number): number {
  let count = 0;
  for (const lm of LINE_MASKS) {
    if ((marked & lm) === lm) count++;
  }
  return count;
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

export type PracticePhase = "setup" | "playing" | "claimed" | "settled";

export interface PracticeState {
  phase: PracticePhase;
  playerBoard: number[];
  botBoard: number[];
  calledMask: number;
  calls: number[];
  playerTurn: boolean;
  /** Who froze the round, or null when the 25th call exhausted the pool. */
  claimer: "you" | "bot" | null;
  winner: "you" | "bot" | "tie" | null;
}

/** A fresh practice game against a random bot board. The player calls
 * first, like the real game's opening call after the table seals. */
export function newPractice(playerBoard: number[]): PracticeState {
  if (!isValidBoard(playerBoard)) {
    throw new Error("Board must contain 1 to 25, each exactly once.");
  }
  return {
    phase: "playing",
    playerBoard: [...playerBoard],
    botBoard: randomBoard(),
    calledMask: 0,
    calls: [],
    playerTurn: true,
    claimer: null,
    winner: null,
  };
}

/** Record a call and hand the turn over; the 25th call freezes the round,
 * exactly as the contract moves to Revealing when the pool runs out. */
function applyCall(s: PracticeState, n: number): PracticeState {
  const next: PracticeState = {
    ...s,
    calledMask: s.calledMask | (1 << (n - 1)),
    calls: [...s.calls, n],
    playerTurn: !s.playerTurn,
  };
  if (next.calls.length === MAX_NUMBER) {
    return { ...next, phase: "claimed", claimer: null };
  }
  return next;
}

/** The player's call. Rejected moves (wrong phase, not their turn, out of
 * range, already called) return the state unchanged, like a reverted
 * NotYourTurn or NumberAlreadyCalled transaction. The bot never uses this. */
export function callNumber(s: PracticeState, n: number): PracticeState {
  if (s.phase !== "playing" || !s.playerTurn) return s;
  if (!Number.isInteger(n) || n < 1 || n > MAX_NUMBER) return s;
  if ((s.calledMask & (1 << (n - 1))) !== 0) return s;
  return applyCall(s, n);
}

/** The bot's turn: call the uncalled number on its own board whose best
 * line is closest to completion, then claim the moment it holds five
 * lines. Returns the state unchanged when it is not the bot's move. */
export function botMove(s: PracticeState): PracticeState {
  if (s.phase !== "playing" || s.playerTurn) return s;

  // Claim first if earlier calls already finished a fifth line.
  if (countCompletedLines(marks(s.botBoard, s.calledMask)) >= BINGO_LINES) {
    return claim(s, "bot");
  }

  const pick = botPick(s);
  if (pick === null) return s;
  const called = applyCall(s, pick);
  if (
    called.phase === "playing" &&
    countCompletedLines(marks(called.botBoard, called.calledMask)) >= BINGO_LINES
  ) {
    return claim(called, "bot");
  }
  return called;
}

/** The number the bot calls: for every uncalled number on its board, score
 * the most complete line through that cell, and take the best. Falls back
 * to any uncalled number, though a full 1..25 board never needs it. */
function botPick(s: PracticeState): number | null {
  const marked = marks(s.botBoard, s.calledMask);
  let best: number | null = null;
  let bestScore = -1;

  for (let position = 0; position < s.botBoard.length; position++) {
    const n = s.botBoard[position];
    if (n < 1 || n > MAX_NUMBER) continue;
    if ((s.calledMask & (1 << (n - 1))) !== 0) continue;

    let score = -1;
    for (const lm of LINE_MASKS) {
      if ((lm & (1 << position)) === 0) continue;
      const done = popcount(lm & marked);
      if (done > score) score = done;
    }
    if (score > bestScore) {
      bestScore = score;
      best = n;
    }
  }
  if (best !== null) return best;

  for (let n = 1; n <= MAX_NUMBER; n++) {
    if ((s.calledMask & (1 << (n - 1))) === 0) return n;
  }
  return null;
}

function popcount(v: number): number {
  let count = 0;
  while (v !== 0) {
    v &= v - 1;
    count++;
  }
  return count;
}

/** Freeze the round, like claim_bingo: no validation of the claim itself,
 * settlement decides the truth. Only a playing round can be frozen. */
export function claim(s: PracticeState, who: "you" | "bot"): PracticeState {
  if (s.phase !== "playing") return s;
  return { ...s, phase: "claimed", claimer: who };
}

/** Replay the frozen call sequence against both boards, exactly like the
 * contract's settle: the earliest fifth line wins, equal indexes tie, a
 * board that never reached five lines loses to any that did (so a false
 * claim cannot win), and when nobody has bingo the most completed lines
 * take it, ties splitting the pot. */
export function settle(s: PracticeState): PracticeState {
  if (s.phase !== "claimed") return s;

  const yours = bingoIndex(s.playerBoard, s.calls);
  const bots = bingoIndex(s.botBoard, s.calls);

  let winner: "you" | "bot" | "tie";
  if (yours !== null && bots !== null) {
    winner = yours < bots ? "you" : bots < yours ? "bot" : "tie";
  } else if (yours !== null) {
    winner = "you";
  } else if (bots !== null) {
    winner = "bot";
  } else {
    const yourLines = countCompletedLines(marks(s.playerBoard, s.calledMask));
    const botLines = countCompletedLines(marks(s.botBoard, s.calledMask));
    winner = yourLines > botLines ? "you" : botLines > yourLines ? "bot" : "tie";
  }
  return { ...s, phase: "settled", winner };
}
