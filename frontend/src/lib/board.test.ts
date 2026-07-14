import { describe, expect, it } from "vitest";
import {
  LINE_MASKS,
  bingoIndex,
  completedLineIndexes,
  countCompletedLines,
  lineLetters,
  marks,
  resolveShowdown,
} from "./board";

const identity = Array.from({ length: 25 }, (_, i) => i + 1);
const reversed = Array.from({ length: 25 }, (_, i) => 25 - i);

function maskOf(calls: number[]): number {
  return calls.reduce((m, n) => m | (1 << (n - 1)), 0);
}

/** A permutation of 1..25 with numbers 1..k pinned to the given positions in
 * order; the rest fill in ascending order. */
function boardWith(positions: number[]): number[] {
  const board: number[] = new Array(25).fill(0);
  positions.forEach((p, i) => {
    board[p] = i + 1;
  });
  const used = new Set(positions.map((_, i) => i + 1));
  let next = 1;
  for (let p = 0; p < 25; p++) {
    if (board[p] !== 0) continue;
    while (used.has(next)) next++;
    board[p] = next;
    used.add(next);
  }
  return board;
}

describe("LINE_MASKS", () => {
  it("equals the contract's 12 masks exactly", () => {
    expect(LINE_MASKS).toEqual([
      0x000001f, 0x00003e0, 0x0007c00, 0x00f8000, 0x1f00000, 0x0108421, 0x0210842, 0x0421084,
      0x0842108, 0x1084210, 0x1041041, 0x0111110,
    ]);
  });
});

describe("countCompletedLines", () => {
  it("matches the contract's known masks", () => {
    expect(countCompletedLines(0)).toBe(0);
    expect(countCompletedLines(LINE_MASKS[0])).toBe(1);
    expect(countCompletedLines(LINE_MASKS[0] | LINE_MASKS[2])).toBe(2);
    // Every cell marked completes all twelve lines.
    expect(countCompletedLines(0x1ffffff)).toBe(12);
    // Positions 0..=20 complete rows 0-3, column 0, and the anti diagonal.
    expect(countCompletedLines((1 << 21) - 1)).toBe(6);
  });
});

describe("completedLineIndexes", () => {
  it("names each completed line by its mask index", () => {
    expect(completedLineIndexes(0)).toEqual([]);
    expect(completedLineIndexes(LINE_MASKS[0])).toEqual([0]);
    expect(completedLineIndexes(LINE_MASKS[0] | LINE_MASKS[2])).toEqual([0, 2]);
    // Rows 0-3, column 0, and the anti diagonal, in mask order.
    expect(completedLineIndexes((1 << 21) - 1)).toEqual([0, 1, 2, 3, 5, 11]);
    expect(completedLineIndexes(0x1ffffff)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});

describe("lineLetters", () => {
  it("fills one letter per completed line, capping at BINGO", () => {
    expect(lineLetters(0)).toBe("");
    expect(lineLetters(1)).toBe("B");
    expect(lineLetters(2)).toBe("BI");
    expect(lineLetters(3)).toBe("BIN");
    expect(lineLetters(4)).toBe("BING");
    expect(lineLetters(5)).toBe("BINGO");
    expect(lineLetters(6)).toBe("BINGO");
  });
});

describe("marks", () => {
  it("maps called numbers to board positions", () => {
    // Numbers 1..=5 called maps to positions 0..=4 on the identity board.
    expect(marks(identity, 0x1f)).toBe(0x1f);
    // Reversed board places number 25 at position 0.
    expect(marks(reversed, 1 << 24)).toBe(1);
    expect(marks(identity, 0)).toBe(0);
  });
});

describe("bingoIndex", () => {
  it("finds five lines at the contract's known index", () => {
    const calls21 = Array.from({ length: 21 }, (_, i) => i + 1);
    expect(bingoIndex(identity, calls21)).toBe(21);
    const calls20 = calls21.slice(0, 20);
    expect(bingoIndex(identity, calls20)).toBeNull();
  });

  it("returns null when five lines are never reached", () => {
    expect(bingoIndex(identity, [1, 2, 3])).toBeNull();
    expect(bingoIndex(identity, [])).toBeNull();
  });
});

describe("resolveShowdown", () => {
  // Numbers 1..19 packed into rows 0-1, columns 0-2, and the anti diagonal,
  // with position 20 marked last: bingo lands exactly at call 19.
  const earlyBingo = boardWith([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 16, 17, 21, 22, 20]);
  // Four lines after 19 calls; calls 20 and 21 then hand it a bingo at 20.
  const fourLines = boardWith([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 15, 16, 20, 21, 14, 18, 22]);
  const calls21 = Array.from({ length: 21 }, (_, i) => i + 1);

  it("pays the earliest bingo across three seats", () => {
    const r = resolveShowdown(
      { a: earlyBingo, b: identity, c: fourLines },
      calls21,
      maskOf(calls21)
    );
    expect(r.a.bingoAt).toBe(19);
    expect(r.b.bingoAt).toBe(21);
    expect(r.c.bingoAt).toBe(20);
    expect(r.a.winner).toBe(true);
    expect(r.b.winner).toBe(false);
    expect(r.c.winner).toBe(false);
  });

  it("ties equal bingo indexes", () => {
    const r = resolveShowdown({ a: identity, b: [...identity] }, calls21, maskOf(calls21));
    expect(r.a.bingoAt).toBe(21);
    expect(r.a.winner).toBe(true);
    expect(r.b.winner).toBe(true);
  });

  it("falls back to most completed lines when nobody has bingo", () => {
    const calls10 = Array.from({ length: 10 }, (_, i) => i + 1);
    const twoRows = boardWith([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const oneRow = boardWith([0, 1, 2, 3, 4, 12, 16, 18, 21, 23]);
    const r = resolveShowdown({ a: twoRows, b: oneRow }, calls10, maskOf(calls10));
    expect(r.a.lines).toBe(2);
    expect(r.b.lines).toBe(1);
    expect(r.a.bingoAt).toBeNull();
    expect(r.a.winner).toBe(true);
    expect(r.b.winner).toBe(false);
  });

  it("excludes forfeits: a null board never wins, a lone revealer always does", () => {
    const calls19 = Array.from({ length: 19 }, (_, i) => i + 1);
    const r = resolveShowdown({ gone: null, here: fourLines }, calls19, maskOf(calls19));
    expect(r.gone.lines).toBe(0);
    expect(r.gone.bingoAt).toBeNull();
    expect(r.gone.winner).toBe(false);
    expect(r.here.lines).toBe(4);
    expect(r.here.winner).toBe(true);
  });

  it("names no winner when nobody revealed", () => {
    const r = resolveShowdown({ a: null, b: null }, calls21, maskOf(calls21));
    expect(r.a.winner).toBe(false);
    expect(r.b.winner).toBe(false);
  });
});
