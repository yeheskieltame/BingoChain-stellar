import { describe, expect, it } from "vitest";
import { isValidBoard } from "./commit";
import {
  LINE_MASKS,
  bingoIndex,
  botMove,
  callNumber,
  claim,
  countCompletedLines,
  marks,
  newPractice,
  settle,
  type PracticeState,
} from "./practice";

const identity = Array.from({ length: 25 }, (_, i) => i + 1);
const reversed = Array.from({ length: 25 }, (_, i) => 25 - i);

function maskOf(calls: number[]): number {
  return calls.reduce((m, n) => m | (1 << (n - 1)), 0);
}

/** A permutation of 1..25 with chosen numbers pinned to chosen positions
 * (numberAt[position] = number); the rest fill in ascending order. */
function boardWith(numberAt: Record<number, number>): number[] {
  const board: number[] = new Array(25).fill(0);
  const used = new Set<number>(Object.values(numberAt));
  for (const [p, n] of Object.entries(numberAt)) board[Number(p)] = n;
  let next = 1;
  for (let p = 0; p < 25; p++) {
    if (board[p] !== 0) continue;
    while (used.has(next)) next++;
    board[p] = next;
    used.add(next);
  }
  return board;
}

/** A frozen practice state built directly, for settle parity cases. */
function claimedState(
  playerBoard: number[],
  botBoard: number[],
  calls: number[],
  claimer: "you" | "bot" | null
): PracticeState {
  return {
    phase: "claimed",
    playerBoard,
    botBoard,
    calledMask: maskOf(calls),
    calls,
    playerTurn: false,
    claimer,
    winner: null,
  };
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

describe("newPractice", () => {
  it("starts a playing game with the player on turn and a valid bot board", () => {
    const s = newPractice(identity);
    expect(s.phase).toBe("playing");
    expect(s.playerTurn).toBe(true);
    expect(s.playerBoard).toEqual(identity);
    expect(isValidBoard(s.botBoard)).toBe(true);
    expect(s.calls).toEqual([]);
    expect(s.calledMask).toBe(0);
    expect(s.claimer).toBeNull();
    expect(s.winner).toBeNull();
  });

  it("rejects an invalid player board", () => {
    expect(() => newPractice([1, 2, 3])).toThrow();
    expect(() => newPractice(new Array(25).fill(7))).toThrow();
  });
});

describe("callNumber", () => {
  it("records a legal call and passes the turn to the bot", () => {
    const s = newPractice(identity);
    const next = callNumber(s, 13);
    expect(next.calls).toEqual([13]);
    expect(next.calledMask).toBe(1 << 12);
    expect(next.playerTurn).toBe(false);
    expect(next.phase).toBe("playing");
    // The input state is untouched.
    expect(s.calls).toEqual([]);
  });

  it("returns the same state when it is not the player's turn", () => {
    const s = { ...newPractice(identity), playerTurn: false };
    expect(callNumber(s, 13)).toBe(s);
  });

  it("returns the same state for repeats and out-of-range numbers", () => {
    const s = callNumber(newPractice(identity), 13);
    const back = { ...s, playerTurn: true };
    expect(callNumber(back, 13)).toBe(back);
    expect(callNumber(back, 0)).toBe(back);
    expect(callNumber(back, 26)).toBe(back);
  });

  it("returns the same state outside the playing phase", () => {
    const s = claim(callNumber(newPractice(identity), 13), "you");
    expect(callNumber(s, 14)).toBe(s);
  });

  it("freezes the round when the 25th number is called", () => {
    let s = newPractice(identity);
    // Alternate player calls and bot turns handed straight back, keeping the
    // engine's own bookkeeping for all 24 leading calls.
    for (let n = 1; n <= 24; n++) {
      s = { ...callNumber({ ...s, playerTurn: true }, n) };
    }
    const done = callNumber({ ...s, playerTurn: true }, 25);
    expect(done.calls).toHaveLength(25);
    expect(done.phase).toBe("claimed");
    expect(done.claimer).toBeNull();
  });
});

describe("botMove", () => {
  it("always produces a legal call on its turn", () => {
    let s = newPractice(identity);
    let guard = 0;
    while (s.phase === "playing" && guard < 60) {
      guard++;
      if (s.playerTurn) {
        // Player plays lowest uncalled number.
        let pick = 1;
        while ((s.calledMask & (1 << (pick - 1))) !== 0) pick++;
        s = callNumber(s, pick);
      } else {
        const before = s.calls.length;
        const beforeMask = s.calledMask;
        s = botMove(s);
        if (s.calls.length > before) {
          const n = s.calls[s.calls.length - 1];
          expect(n).toBeGreaterThanOrEqual(1);
          expect(n).toBeLessThanOrEqual(25);
          expect(beforeMask & (1 << (n - 1))).toBe(0);
        }
      }
    }
    expect(s.phase).not.toBe("playing");
    expect(new Set(s.calls).size).toBe(s.calls.length);
  });

  it("returns the same state when it is the player's turn or play is over", () => {
    const s = newPractice(identity);
    expect(botMove(s)).toBe(s);
    const frozen = claim(callNumber(s, 1), "you");
    expect(botMove(frozen)).toBe(frozen);
  });

  it("completes its most advanced line", () => {
    // Bot board identity, numbers 1..20 called: rows 0-3 done, and column 0
    // plus the anti diagonal each sit one mark (number 21) from completion.
    const s: PracticeState = {
      phase: "playing",
      playerBoard: reversed,
      botBoard: identity,
      calledMask: maskOf(Array.from({ length: 20 }, (_, i) => i + 1)),
      calls: Array.from({ length: 20 }, (_, i) => i + 1),
      playerTurn: false,
      claimer: null,
      winner: null,
    };
    const next = botMove(s);
    expect(next.calls[next.calls.length - 1]).toBe(21);
  });

  it("claims as soon as it reaches five completed lines", () => {
    // Same setup: calling 21 takes the identity bot board to six lines.
    const s: PracticeState = {
      phase: "playing",
      playerBoard: reversed,
      botBoard: identity,
      calledMask: maskOf(Array.from({ length: 20 }, (_, i) => i + 1)),
      calls: Array.from({ length: 20 }, (_, i) => i + 1),
      playerTurn: false,
      claimer: null,
      winner: null,
    };
    const next = botMove(s);
    expect(next.phase).toBe("claimed");
    expect(next.claimer).toBe("bot");
    expect(next.winner).toBeNull();
  });
});

describe("claim", () => {
  it("freezes a playing round for either claimer", () => {
    const s = newPractice(identity);
    const yours = claim(s, "you");
    expect(yours.phase).toBe("claimed");
    expect(yours.claimer).toBe("you");
    const bots = claim(s, "bot");
    expect(bots.claimer).toBe("bot");
  });

  it("returns the same state outside the playing phase", () => {
    const s = claim(newPractice(identity), "you");
    expect(claim(s, "bot")).toBe(s);
  });
});

describe("settle", () => {
  // 19 calls land one board six lines exactly at the 19th call (rows 0 and 1,
  // columns 0, 1, 2, and the anti diagonal, position 20 marked last) while a
  // second board turns the same calls into only four lines, never five.
  const calls19 = Array.from({ length: 19 }, (_, i) => i + 1);
  const fiveLinePositions = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 16, 17, 21, 22, 20];
  const fourLinePositions = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 15, 16, 20, 21, 14, 18, 22];

  function pin(positions: number[]): Record<number, number> {
    const numberAt: Record<number, number> = {};
    positions.forEach((p, i) => {
      numberAt[p] = i + 1;
    });
    return numberAt;
  }

  const fiveLineBoard = boardWith(pin(fiveLinePositions));
  const fourLineBoard = boardWith(pin(fourLinePositions));

  it("sanity: the crafted boards behave as designed", () => {
    expect(isValidBoard(fiveLineBoard)).toBe(true);
    expect(isValidBoard(fourLineBoard)).toBe(true);
    expect(bingoIndex(fiveLineBoard, calls19)).toBe(19);
    expect(bingoIndex(fourLineBoard, calls19)).toBeNull();
    expect(countCompletedLines(marks(fourLineBoard, maskOf(calls19)))).toBe(4);
  });

  it("gives the pot to the earliest bingo", () => {
    // Identity reaches five lines on call 21; a board with the first 19
    // numbers packed into five lines got there two calls earlier.
    const calls21 = Array.from({ length: 21 }, (_, i) => i + 1);
    const s = settle(claimedState(fiveLineBoard, identity, calls21, "you"));
    expect(s.phase).toBe("settled");
    expect(s.winner).toBe("you");
    // Same boards, other way around.
    const t = settle(claimedState(identity, fiveLineBoard, calls21, "you"));
    expect(t.winner).toBe("bot");
  });

  it("makes a false claim lose to a real bingo", () => {
    // You claimed on four lines; the bot holds a real five line board.
    const s = settle(claimedState(fourLineBoard, fiveLineBoard, calls19, "you"));
    expect(s.winner).toBe("bot");
    // And the claimer wins only when the bingo is theirs.
    const t = settle(claimedState(fiveLineBoard, fourLineBoard, calls19, "bot"));
    expect(t.winner).toBe("you");
  });

  it("falls back to most completed lines when nobody has bingo", () => {
    // 10 calls: two full rows on one board, one full row on the other.
    const calls10 = Array.from({ length: 10 }, (_, i) => i + 1);
    const twoRows = boardWith(pin([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
    const oneRow = boardWith(pin([0, 1, 2, 3, 4, 12, 16, 18, 21, 23]));
    const s = settle(claimedState(twoRows, oneRow, calls10, "bot"));
    expect(s.winner).toBe("you");
  });

  it("ties on equal bingo index and on equal line counts", () => {
    // Both boards replay the same calls into a bingo at the same index.
    const calls21 = Array.from({ length: 21 }, (_, i) => i + 1);
    const same = settle(claimedState(identity, [...identity], calls21, "you"));
    expect(same.winner).toBe("tie");
    // No bingo on either side and equal line counts.
    const calls5 = [1, 2, 3, 4, 5];
    const rowA = boardWith(pin([0, 1, 2, 3, 4]));
    const rowB = boardWith(pin([5, 6, 7, 8, 9]));
    const t = settle(claimedState(rowA, rowB, calls5, null));
    expect(t.winner).toBe("tie");
  });

  it("returns the same state unless the round is frozen", () => {
    const s = newPractice(identity);
    expect(settle(s)).toBe(s);
    const done = settle(claimedState(identity, reversed, [1, 2, 3], "you"));
    expect(settle(done)).toBe(done);
  });
});
