import { useEffect, useState } from "react";
import { bingoIndex, completedLineIndexes, countCompletedLines, marks } from "../lib/board";
import { randomBoard } from "../lib/commit";
import {
  botMove,
  callNumber,
  claim,
  newPractice,
  settle,
  shouldAutoClaim,
  type PracticePhase,
  type PracticeState,
} from "../lib/practice";
import { BingoMeter, LineStrikes } from "./BingoMeter";
import { Showdown } from "./Showdown";
import { ArrowLeftIcon, DiceIcon, SparkleIcon, TrophyIcon, UsersIcon, XIcon } from "./Icons";

// The zero-risk front door: a full round against a bot, entirely in the
// browser. Nothing in this file (or in practice.ts) touches the wallet, the
// contract, or a transaction; it must work with everything disconnected.

interface PracticeRoomProps {
  onBack(): void;
}

const BOT_DELAY_MS = 900;
// Shorter than the bot's pause, so a fresh bingo claims before the next move.
const AUTO_CLAIM_DELAY_MS = 650;

// One hint per phase: what is happening at this table now, and what the real
// game does on chain at the same moment.
const COACH: Record<PracticePhase, string> = {
  setup:
    "Arrange your numbers freely; where they sit decides which calls help you. " +
    "In the real game only a hash of this layout goes on chain, sealed with a secret salt, " +
    "and your stake locks in escrow the moment you commit.",
  playing:
    "Your board is the call sheet: on your turn, tap an unmarked cell to call its number. " +
    "Every board holds the same 25 numbers, and on chain each call is its own signed " +
    "transaction, public and replayable. Complete 5 of the 12 lines: rows, columns, both diagonals.",
  claimed:
    "The claim froze the call sequence; nobody can call again. " +
    "On chain this opens a 24 hour reveal window where each player proves " +
    "their board matches the commitment they sealed at the start.",
  settled:
    "Settlement replayed the calls against both boards: the earliest fifth line wins, " +
    "and if nobody reached five, the most completed lines take the pot. " +
    "The contract does the same with revealed boards; the claim itself proves nothing, " +
    "it only freezes the round.",
};

/** "1st", "2nd", "3rd"... Local copy of GameRoom's helper: importing it from
 * GameRoom would drag the contract client into the practice bundle path. */
function addOrdinal(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n}st`;
  if (mod10 === 2 && mod100 !== 12) return `${n}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${n}rd`;
  return `${n}th`;
}

export default function PracticeRoom({ onBack }: PracticeRoomProps) {
  const [game, setGame] = useState<PracticeState | null>(null);
  const [board, setBoard] = useState<number[]>(() => randomBoard());
  const [selected, setSelected] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState<PracticePhase | null>(null);

  const stage: PracticePhase = game ? game.phase : "setup";

  // The engine is synchronous; the bot's turn is sequenced here with a short
  // pause so calls land at a readable pace instead of instantly.
  useEffect(() => {
    if (!game || game.phase !== "playing" || game.playerTurn) return;
    const timer = setTimeout(() => setGame((g) => (g ? botMove(g) : g)), BOT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [game]);

  // Auto-claim on bingo, after a beat so the strike and the fifth letter
  // land first. The bot already claims its own bingo; this is the mirror.
  useEffect(() => {
    if (!game || !shouldAutoClaim(game)) return;
    const timer = setTimeout(
      () => setGame((g) => (g && shouldAutoClaim(g) ? claim(g, "you") : g)),
      AUTO_CLAIM_DELAY_MS
    );
    return () => clearTimeout(timer);
  }, [game]);

  function tapCell(i: number) {
    if (selected === null) {
      setSelected(i);
      return;
    }
    if (selected === i) {
      setSelected(null);
      return;
    }
    setBoard((cur) => {
      const next = [...cur];
      [next[selected], next[i]] = [next[i], next[selected]];
      return next;
    });
    setSelected(null);
  }

  function playAgain() {
    setGame(null);
    setBoard(randomBoard());
    setSelected(null);
    setDismissed(null);
  }

  return (
    <div>
      <div className="room-bar">
        <button type="button" className="btn btn--icon" onClick={onBack} aria-label="Back to lobby">
          <ArrowLeftIcon size={16} />
        </button>
        <div className="room-title">
          <h2>Practice table</h2>
          <span className="badge badge--practice">practice</span>
        </div>
      </div>

      {dismissed !== stage && (
        <aside className="coach" role="status">
          <SparkleIcon size={14} className="coach-icon" />
          <div>
            <p className="coach-label">coach</p>
            <p className="coach-msg">{COACH[stage]}</p>
          </div>
          <button
            type="button"
            className="coach-close"
            onClick={() => setDismissed(stage)}
            aria-label="Dismiss hint"
          >
            <XIcon size={13} />
          </button>
        </aside>
      )}

      {game === null && (
        <section className="panel create-card">
          <p className="panel-label">arrange your board</p>
          <p className="call-note">
            Tap two cells to swap them. The bot's board stays hidden until settlement.
          </p>
          <div className="card-grid">
            {board.map((n, i) => (
              <button
                type="button"
                key={i}
                className={`cell board-cell ${selected === i ? "cell--selected" : ""}`}
                onClick={() => tapCell(i)}
                aria-pressed={selected === i}
              >
                <span className="cell-num">{n}</span>
              </button>
            ))}
          </div>
          <div className="board-setup-actions">
            <button type="button" className="btn btn--ghost" onClick={() => setBoard(randomBoard())}>
              <DiceIcon size={14} /> shuffle
            </button>
            <button type="button" className="btn btn--primary" onClick={() => setGame(newPractice(board))}>
              seal and play
            </button>
          </div>
          <p className="board-setup-warn">
            Free round, nothing leaves this browser. No wallet, no stake, no transactions.
          </p>
        </section>
      )}

      {game !== null && game.phase !== "settled" && (
        <PracticePlay game={game} onChange={setGame} />
      )}

      {game !== null && game.phase === "settled" && (
        <PracticeResult game={game} onPlayAgain={playAgain} />
      )}
    </div>
  );
}

function PracticePlay({
  game,
  onChange,
}: {
  game: PracticeState;
  onChange(next: PracticeState): void;
}) {
  const frozen = game.phase === "claimed";
  const markedMask = marks(game.playerBoard, game.calledMask);
  const yourLines = countCompletedLines(markedMask);
  const lastCall = game.calls.length > 0 ? game.calls[game.calls.length - 1] : null;

  const calledOrder = new Map<number, number>();
  game.calls.forEach((n, i) => calledOrder.set(n, i + 1));

  const turnLabel = frozen
    ? game.claimer === "you"
      ? "you claimed bingo, the round is frozen"
      : game.claimer === "bot"
        ? "the bot claimed bingo, the round is frozen"
        : "all 25 numbers called, the round is frozen"
    : game.playerTurn
      ? "your call, tap an unmarked cell"
      : "the bot is thinking";

  return (
    <div className="room-grid">
      <section className="panel">
        <p className="panel-label">your board</p>

        <p className={`turn-strip ${!frozen && game.playerTurn ? "turn-strip--you" : ""}`} role="status">
          <span className="turn-dot" aria-hidden />
          {turnLabel}
        </p>

        <div className="board-flex">
          <div className="board-wrap">
            <div className="card-grid">
              {game.playerBoard.map((n, i) => {
                const order = calledOrder.get(n);
                const marked = order !== undefined;
                const disabled = frozen || !game.playerTurn || marked;
                return (
                  <button
                    type="button"
                    key={i}
                    className={`cell board-cell ${marked ? "cell--marked" : ""} ${n === lastCall ? "cell--latest" : ""}`}
                    onClick={() => onChange(callNumber(game, n))}
                    disabled={disabled}
                    aria-label={marked ? `${n}, called ${addOrdinal(order)}` : `call ${n}`}
                  >
                    <span className="cell-num">{n}</span>
                    {marked && <span className="cell-order">{order}</span>}
                  </button>
                );
              })}
            </div>
            <LineStrikes lineIndexes={completedLineIndexes(markedMask)} />
          </div>
          <BingoMeter lines={yourLines} />
        </div>

        <div className="claim-row">
          {frozen ? (
            <button
              type="button"
              className="btn btn--ghost btn--block"
              onClick={() => onChange(settle(game))}
            >
              <TrophyIcon size={14} /> settle the table
            </button>
          ) : yourLines >= 5 ? (
            <p className="claim-note" role="status">
              Bingo. The claim fires on its own.
            </p>
          ) : (
            <button
              type="button"
              className="btn btn--ghost btn--block"
              onClick={() => onChange(claim(game, "you"))}
            >
              <TrophyIcon size={14} /> claim bingo
            </button>
          )}
        </div>
      </section>

      <aside className="panel">
        <p className="panel-label">the table</p>
        <p className="call-note">Nothing staked, two seats. The real table escrows XLM per seat.</p>

        <div className="players">
          <div className="players-head">
            <UsersIcon size={14} /> players, in calling order
          </div>
          <ul className="players-list">
            <li className="player player--me">
              you
              <span className="player-you">you</span>
              {!frozen && game.playerTurn && <span className="tag tag--turn">turn</span>}
              {frozen && game.claimer === "you" && <span className="tag tag--pending">claimed</span>}
            </li>
            <li className="player">
              the bot
              {!frozen && !game.playerTurn && <span className="tag tag--turn">turn</span>}
              {frozen && game.claimer === "bot" && <span className="tag tag--pending">claimed</span>}
            </li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

function PracticeResult({
  game,
  onPlayAgain,
}: {
  game: PracticeState;
  onPlayAgain(): void;
}) {
  const title =
    game.winner === "you" ? "You take the pot" : game.winner === "bot" ? "The bot takes it" : "Split pot";

  return (
    <>
      <div className="state">
        <span className="state-art" aria-hidden />
        <p className="state-title">{title}</p>
        <p className="state-msg">{resultDetail(game)}</p>
        <div className="board-setup-actions">
          <button type="button" className="btn btn--ghost" onClick={onPlayAgain}>
            <DiceIcon size={14} /> play again
          </button>
          <a className="btn btn--primary" href="#/">
            stake a real table
          </a>
        </div>
      </div>

      <section className="panel showdown-panel">
        <p className="panel-label">showdown</p>
        <p className="call-note">
          Both boards face up, the bot's included. On the real table this is where the pot splits.
        </p>
        <Showdown
          seats={[
            { key: "you", label: "you", isYou: true, board: game.playerBoard },
            { key: "bot", label: "the bot", board: game.botBoard },
          ]}
          calls={game.calls}
          calledMask={game.calledMask}
          final
        />
      </section>
    </>
  );
}

/** How the replay went, in one line: mirrors what settle just computed. */
function resultDetail(game: PracticeState): string {
  const yours = bingoIndex(game.playerBoard, game.calls);
  const bots = bingoIndex(game.botBoard, game.calls);

  if (yours !== null && bots !== null) {
    if (yours === bots) return `Both boards reached five lines on call ${yours}, so the pot splits.`;
    return yours < bots
      ? `The replay found your fifth line on call ${yours}, the bot's on call ${bots}.`
      : `The replay found the bot's fifth line on call ${bots}, yours on call ${yours}.`;
  }
  if (yours !== null) return `The replay found your fifth line on call ${yours}. The bot never reached five.`;
  if (bots !== null) return `The replay found the bot's fifth line on call ${bots}. Your board never reached five.`;

  const yourLines = countCompletedLines(marks(game.playerBoard, game.calledMask));
  const botLines = countCompletedLines(marks(game.botBoard, game.calledMask));
  if (yourLines === botLines) {
    return `Nobody reached five lines, and both boards held ${yourLines}, so the pot splits.`;
  }
  return yourLines > botLines
    ? `Nobody reached five lines, but you held ${yourLines} to the bot's ${botLines}.`
    : `Nobody reached five lines, but the bot held ${botLines} to your ${yourLines}.`;
}

