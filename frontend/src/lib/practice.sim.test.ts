import { describe, expect, it } from "vitest";
import { botMove, callNumber, claim, newPractice, settle, shouldAutoClaim } from "./practice";

// A seeded, deterministic simulation pinning the practice invariants across
// 300 full games: random legal player calls against the bot, with the UI's
// auto-claim mirrored the way PracticeRoom sequences it (the claim beat runs
// before the bot's next move). Same seed, same games, every run.

/** mulberry32: a tiny seeded PRNG, plenty for shuffles and pick order. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seeded permutation of 1..25. */
function seededBoard(rand: () => number): number[] {
  const board = Array.from({ length: 25 }, (_, i) => i + 1);
  for (let i = board.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [board[i], board[j]] = [board[j], board[i]];
  }
  return board;
}

function popcount(v: number): number {
  let count = 0;
  while (v !== 0) {
    v &= v - 1;
    count++;
  }
  return count;
}

describe("seeded practice simulation", () => {
  it("holds the engine invariants across 300 games", () => {
    const outcomes = { you: 0, bot: 0, tie: 0 };
    const claimers = { you: 0, bot: 0, exhausted: 0 };

    for (let g = 0; g < 300; g++) {
      const rand = mulberry32(0xb1460 + g);
      let s = { ...newPractice(seededBoard(rand)), botBoard: seededBoard(rand) };

      let guard = 0;
      while (s.phase === "playing" && guard++ < 60) {
        // Mirror PracticeRoom: the auto-claim beat fires before the next move.
        if (shouldAutoClaim(s)) {
          s = claim(s, "you");
          break;
        }
        if (s.playerTurn) {
          const uncalled: number[] = [];
          for (let n = 1; n <= 25; n++) {
            if ((s.calledMask & (1 << (n - 1))) === 0) uncalled.push(n);
          }
          expect(uncalled.length).toBeGreaterThan(0);
          s = callNumber(s, uncalled[Math.floor(rand() * uncalled.length)]);
          if (shouldAutoClaim(s)) s = claim(s, "you");
        } else {
          s = botMove(s);
        }
      }

      // Every game freezes: a claim by either side, or the 25th call.
      expect(s.phase).toBe("claimed");
      expect(shouldAutoClaim(s)).toBe(false);
      if (s.claimer === null) {
        expect(s.calls.length).toBe(25);
        claimers.exhausted++;
      } else {
        claimers[s.claimer]++;
      }

      // The call record stays legal: unique numbers in range, mask in sync.
      expect(s.calls.length).toBeLessThanOrEqual(25);
      expect(new Set(s.calls).size).toBe(s.calls.length);
      for (const n of s.calls) {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(25);
      }
      expect(popcount(s.calledMask)).toBe(s.calls.length);

      // Settlement always lands a verdict.
      const done = settle(s);
      expect(done.phase).toBe("settled");
      expect(done.winner).not.toBeNull();
      if (done.winner) outcomes[done.winner]++;
    }

    expect(outcomes.you + outcomes.bot + outcomes.tie).toBe(300);
    expect(claimers.you + claimers.bot + claimers.exhausted).toBe(300);
  });
});
