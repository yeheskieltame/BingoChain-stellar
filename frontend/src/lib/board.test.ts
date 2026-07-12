import { describe, expect, it } from "vitest";
import {
  LINE_MASKS,
  bingoIndex,
  completedLineIndexes,
  countCompletedLines,
  lineLetters,
  marks,
} from "./board";

const identity = Array.from({ length: 25 }, (_, i) => i + 1);
const reversed = Array.from({ length: 25 }, (_, i) => 25 - i);

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
