import { describe, expect, it } from "vitest";
import { boardCommitment, isValidBoard, randomBoard } from "./commit";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("randomBoard", () => {
  it("returns a permutation of 1..25 on every run", () => {
    for (let run = 0; run < 200; run++) {
      const board = randomBoard();
      expect(board).toHaveLength(25);
      const seen = new Set(board);
      expect(seen.size).toBe(25);
      for (const n of board) {
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(25);
      }
    }
  });
});

describe("isValidBoard", () => {
  const identity = Array.from({ length: 25 }, (_, i) => i + 1);

  it("accepts the identity permutation", () => {
    expect(isValidBoard(identity)).toBe(true);
  });

  it("accepts any shuffled permutation from randomBoard", () => {
    for (let run = 0; run < 50; run++) {
      expect(isValidBoard(randomBoard())).toBe(true);
    }
  });

  it("rejects a duplicate value", () => {
    const board = identity.slice();
    board[24] = board[0]; // last cell duplicates the first instead of 25
    expect(isValidBoard(board)).toBe(false);
  });

  it("rejects a board containing 0", () => {
    const board = identity.slice();
    board[0] = 0;
    expect(isValidBoard(board)).toBe(false);
  });

  it("rejects a board containing 26", () => {
    const board = identity.slice();
    board[0] = 26;
    expect(isValidBoard(board)).toBe(false);
  });

  it("rejects a board with the wrong length", () => {
    expect(isValidBoard(identity.slice(0, 24))).toBe(false);
    expect(isValidBoard([...identity, 1])).toBe(false);
  });
});

describe("boardCommitment", () => {
  it("matches the known vector: board 1..25 in order, salt of 32 0x01 bytes", async () => {
    const board = Array.from({ length: 25 }, (_, i) => i + 1);
    const salt = new Uint8Array(32).fill(1);

    const digest = await boardCommitment(board, salt);

    expect(bytesToHex(digest)).toBe(
      "9d00d7dab8e30836adeb170f4ecf7cfddebf90f3fed5a0613dccc87d351fb4d3"
    );
  });

  it("rejects an invalid board", async () => {
    const badBoard = Array.from({ length: 25 }, () => 1);
    const salt = new Uint8Array(32);
    await expect(boardCommitment(badBoard, salt)).rejects.toThrow();
  });

  it("rejects a salt that is not 32 bytes", async () => {
    const board = Array.from({ length: 25 }, (_, i) => i + 1);
    await expect(boardCommitment(board, new Uint8Array(31))).rejects.toThrow();
  });
});
