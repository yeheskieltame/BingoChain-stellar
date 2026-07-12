import { lineLetters } from "../lib/board";

// The two visual companions of the single play board: the strike overlay
// that draws through completed lines, and the BINGO letter meter that fills
// one letter per completed line. Shared by PracticeRoom and GameRoom, and
// safe for the practice path: this file imports board math only.

/** Endpoints for each LINE_MASKS index in board coordinates (viewBox 0..5,
 * one unit per cell): 5 rows, 5 columns, main diagonal, anti diagonal. */
const LINE_ENDPOINTS: [number, number, number, number][] = [
  [0.15, 0.5, 4.85, 0.5],
  [0.15, 1.5, 4.85, 1.5],
  [0.15, 2.5, 4.85, 2.5],
  [0.15, 3.5, 4.85, 3.5],
  [0.15, 4.5, 4.85, 4.5],
  [0.5, 0.15, 0.5, 4.85],
  [1.5, 0.15, 1.5, 4.85],
  [2.5, 0.15, 2.5, 4.85],
  [3.5, 0.15, 3.5, 4.85],
  [4.5, 0.15, 4.5, 4.85],
  [0.22, 0.22, 4.78, 4.78],
  [4.78, 0.22, 0.22, 4.78],
];

/** Marker strokes through every completed line, laid over the board grid.
 * Render inside a .board-wrap so the overlay tracks the grid exactly. */
export function LineStrikes({ lineIndexes }: { lineIndexes: number[] }) {
  if (lineIndexes.length === 0) return null;
  return (
    <svg className="strike-svg" viewBox="0 0 5 5" preserveAspectRatio="none" aria-hidden>
      {lineIndexes.map((i) => {
        const [x1, y1, x2, y2] = LINE_ENDPOINTS[i];
        return <line key={i} className="strike-line" x1={x1} y1={y1} x2={x2} y2={y2} pathLength={1} />;
      })}
    </svg>
  );
}

/** The letter meter: B, then I, N, G, O, one per completed line. Five or
 * more lines spell the full word; that is the moment to claim. */
export function BingoMeter({ lines }: { lines: number }) {
  const lit = lineLetters(lines).length;
  return (
    <div
      className="bingo-meter"
      role="status"
      aria-label={lit >= 5 ? "Bingo, 5 of 5 lines complete" : `${lit} of 5 lines complete`}
    >
      {"BINGO".split("").map((letter, i) => (
        <span key={i} className={`meter-letter ${i < lit ? "meter-letter--lit" : ""}`} aria-hidden>
          {letter}
        </span>
      ))}
    </div>
  );
}
