import { completedLineIndexes, marks, resolveShowdown, type ShowdownResult } from "../lib/board";
import { LineStrikes } from "./BingoMeter";
import { TrophyIcon } from "./Icons";

// The showdown: every seat's revealed board opened face up, the payoff
// moment of the transparency story. The verdict mirrors the contract's
// settle rule through resolveShowdown. Shared by GameRoom and PracticeRoom,
// and safe for the practice path: board math and icons only, no chain code.

export interface ShowdownSeat {
  key: string;
  /** Short display name: a truncated address, "you", or "the bot". */
  label: string;
  /** Render the label in the mono address face. */
  mono?: boolean;
  isYou?: boolean;
  /** The revealed board, or null when this seat never revealed. */
  board: number[] | null;
}

interface ShowdownProps {
  seats: ShowdownSeat[];
  calls: number[];
  calledMask: number;
  /** True once the table is settled: winner badges and forfeit wording show.
   * During the reveal window the verdict is still open, so neither does. */
  final: boolean;
  /** Precomputed verdict, when the caller already resolved it (GameRoom's
   * pot line needs it too); computed here otherwise. */
  results?: Record<string, ShowdownResult>;
}

export function Showdown({ seats, calls, calledMask, final, results: given }: ShowdownProps) {
  const results =
    given ??
    resolveShowdown(Object.fromEntries(seats.map((seat) => [seat.key, seat.board])), calls, calledMask);

  return (
    <div className="showdown-grid">
      {seats.map((seat) => {
        const result = results[seat.key];
        const stat = seat.board
          ? `${result.lines} line${result.lines === 1 ? "" : "s"}` +
            (result.bingoAt !== null ? `, bingo at call ${result.bingoAt}` : "")
          : final
            ? "did not reveal, stake forfeited"
            : "not revealed yet";
        const winner = final && result.winner;

        return (
          <section
            key={seat.key}
            className={`showdown-card ${winner ? "showdown-card--winner" : ""}`}
            aria-label={`${seat.label}${seat.isYou ? ", you" : ""}: ${stat}${winner ? ", winner" : ""}`}
          >
            <div className="showdown-head">
              <span className={seat.mono ? "mono" : ""}>{seat.label}</span>
              {seat.isYou && <span className="player-you">you</span>}
              {winner && (
                <span className="badge badge--winner">
                  <TrophyIcon size={11} /> winner
                </span>
              )}
            </div>

            {seat.board ? (
              <>
                <div className="board-wrap board-wrap--mini" aria-hidden>
                  <div className="card-grid card-grid--mini">
                    {seat.board.map((n, i) => {
                      const marked = (calledMask & (1 << (n - 1))) !== 0;
                      return (
                        <div key={i} className={`cell ${marked ? "cell--marked" : ""}`}>
                          <span className="cell-num">{n}</span>
                        </div>
                      );
                    })}
                  </div>
                  <LineStrikes lineIndexes={completedLineIndexes(marks(seat.board, calledMask))} />
                </div>
                <p className="showdown-stat">{stat}</p>
              </>
            ) : (
              <p className={`showdown-stat ${final ? "showdown-stat--forfeit" : ""}`}>{stat}</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
