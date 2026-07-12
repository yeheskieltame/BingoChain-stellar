import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Arena } from "bingo-client";
import { BingoMeter, LineStrikes } from "./BingoMeter";
import BoardSetup from "./BoardSetup";
import RevealPanel from "./RevealPanel";
import TxStatus from "./TxStatus";
import { STATE_LABEL } from "./Lobby";
import { ArrowLeftIcon, CheckIcon, TrophyIcon, UsersIcon } from "./Icons";
import { completedLineIndexes, countCompletedLines, marks } from "../lib/board";
import { arenaClient, signAndSubmit, simulationError, unwrapResult } from "../lib/contract";
import { useArena } from "../hooks/useArena";
import { useTx } from "../hooks/useTx";
import { errorMessage } from "../lib/errors";
import { stroopsToXlm, truncateAddress } from "../lib/format";

interface GameRoomProps {
  arenaId: number;
  address: string | null;
  onBack(): void;
  /** Called after any of this room's own transactions confirm, so the lobby's
   * cached arena list can pick up the state change too. */
  onChanged(): void;
}

/** "1st", "2nd", "3rd", "4th"... for the call-order screen reader labels. */
function addOrdinal(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n}st`;
  if (mod10 === 2 && mod100 !== 12) return `${n}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${n}rd`;
  return `${n}th`;
}

/**
 * The live game room. Gameplay state (who is seated, the turn, the call
 * order, the reveal deadline) all comes from the arena itself via useArena,
 * which stays fresh off the contract's event stream; this component only
 * decides which panel to show for the arena's current state and wires the
 * write actions (call, claim, reveal, settle) through useTx.
 */
export default function GameRoom({ arenaId, address, onBack, onChanged }: GameRoomProps) {
  const { arena, loading, error, myReveal, refresh } = useArena(arenaId, address);
  const [revealStatus, setRevealStatus] = useState<Record<string, boolean>>({});

  // Per-player reveal status only matters once calling has stopped. Fetched
  // fresh whenever the arena object changes: every event tick and every
  // manual refresh produce a new arena reference, which reruns this.
  useEffect(() => {
    if (!arena) return;
    if (arena.state.tag !== "Revealing" && arena.state.tag !== "Settled") return;

    let cancelled = false;
    const client = arenaClient();
    Promise.all(
      arena.players.map((p) => client.revealed_board_of({ arena_id: arena.id, player: p }).then((tx) => tx.result))
    ).then((boards) => {
      if (cancelled) return;
      const next: Record<string, boolean> = {};
      arena.players.forEach((p, i) => {
        next[p] = boards[i] !== undefined;
      });
      setRevealStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, [arena]);

  function handleChanged() {
    refresh();
    onChanged();
  }

  if (loading && !arena) {
    return (
      <RoomShell arenaId={arenaId} onBack={onBack}>
        <div className="panel room-skel" aria-label="Loading table">
          <span className="skel skel--label" />
          <span className="skel skel--board" />
          <span className="skel skel--line" />
        </div>
      </RoomShell>
    );
  }
  if (!arena) {
    return (
      <RoomShell arenaId={arenaId} onBack={onBack}>
        <div className="state">
          <p className="state-title">No table here</p>
          <p className="state-msg">{error ? errorMessage(error) : "That table does not exist."}</p>
        </div>
      </RoomShell>
    );
  }

  const isPlayer = !!address && arena.players.includes(address);
  const allRevealed = arena.players.length > 0 && arena.players.every((p) => revealStatus[p]);

  return (
    <RoomShell arenaId={arenaId} onBack={onBack} state={arena.state.tag}>
      {arena.state.tag === "Created" && (
        <CreatedRoom arena={arena} address={address} isPlayer={isPlayer} onCommitted={handleChanged} />
      )}

      {(arena.state.tag === "Committed" || arena.state.tag === "Playing") && (
        <PlayRoom
          arena={arena}
          address={address}
          isPlayer={isPlayer}
          myReveal={myReveal}
          revealStatus={revealStatus}
          onChanged={handleChanged}
        />
      )}

      {arena.state.tag === "Revealing" && (
        <div className="room-grid">
          <RevealPanel
            arena={arena}
            address={address}
            myReveal={myReveal}
            revealed={!!address && !!revealStatus[address]}
            allRevealed={allRevealed}
            onChanged={handleChanged}
          />
          <PlayersPanel arena={arena} address={address} revealStatus={revealStatus} />
        </div>
      )}

      {(arena.state.tag === "Created" || arena.state.tag === "Committed") && (
        <CancelControl arena={arena} address={address} onChanged={handleChanged} />
      )}

      {arena.state.tag === "Settled" && (
        <div className="state">
          <span className="state-art" aria-hidden />
          <p className="state-title">Table settled</p>
          <p className="state-msg">
            The pot went to each winner's earnings balance. Winners withdraw from the earnings card above.
          </p>
        </div>
      )}

      {arena.state.tag === "Cancelled" && (
        <div className="state">
          <p className="state-title">Table cancelled</p>
          <p className="state-msg">Every seated player's stake went back to their earnings balance.</p>
        </div>
      )}
    </RoomShell>
  );
}

function RoomShell({
  arenaId,
  onBack,
  state,
  children,
}: {
  arenaId: number;
  onBack(): void;
  state?: Arena["state"]["tag"];
  children: ReactNode;
}) {
  return (
    <div>
      <div className="room-bar">
        <button type="button" className="btn btn--icon" onClick={onBack} aria-label="Back to lobby">
          <ArrowLeftIcon size={16} />
        </button>
        <div className="room-title">
          <h2>Table {arenaId}</h2>
          {state && <span className={`badge badge--${state.toLowerCase()}`}>{STATE_LABEL[state]}</span>}
        </div>
      </div>
      {children}
    </div>
  );
}

function CreatedRoom({
  arena,
  address,
  isPlayer,
  onCommitted,
}: {
  arena: Arena;
  address: string | null;
  isPlayer: boolean;
  onCommitted(): void;
}) {
  if (!address) {
    return (
      <div className="state">
        <p className="state-title">Connect your wallet</p>
        <p className="state-msg">You need a connected wallet to take a seat at this table.</p>
      </div>
    );
  }

  if (isPlayer) {
    const remaining = arena.max_players - arena.players.length;
    return (
      <div className="state">
        <span className="state-art" aria-hidden />
        <p className="state-title">Your board is sealed</p>
        <p className="state-msg">
          Waiting on {remaining} more player{remaining === 1 ? "" : "s"} to seal a board. Calling starts
          when the table is full.
        </p>
      </div>
    );
  }

  return <BoardSetup arenaId={arena.id} address={address} onCommitted={onCommitted} />;
}

/**
 * Escape hatch for stalled tables. Shown to the creator while the table is
 * still filling, and to anyone once the 24 hour join window has passed on a
 * Created or Committed table (a full table whose opening call never came).
 * The contract enforces the same rules; this only decides visibility.
 */
function CancelControl({
  arena,
  address,
  onChanged,
}: {
  arena: Arena;
  address: string | null;
  onChanged(): void;
}) {
  const cancelTx = useTx();

  const windowPassed = Date.now() / 1000 > Number(arena.created_at) + 86_400;
  const isCreator = !!address && arena.creator === address;
  const visible = !!address && ((arena.state.tag === "Created" && isCreator) || windowPassed);
  if (!visible) return null;

  const busy =
    cancelTx.state.phase === "building" || cancelTx.state.phase === "signing" || cancelTx.state.phase === "submitting";

  function cancelTable() {
    if (!address || busy) return;
    void cancelTx.run(async (report) => {
      report("building");
      const client = arenaClient(address);
      const tx = await client.cancel_arena({ arena_id: arena.id, caller: address });
      unwrapResult(tx.result, simulationError(tx));

      const { hash, result } = await signAndSubmit(tx, address, report);
      unwrapResult(result);
      onChanged();
      return hash;
    });
  }

  return (
    <section className="panel">
      <p className="panel-label">cancel table</p>
      <p className="call-note">
        {arena.state.tag === "Committed"
          ? "This table filled but nobody opened play. Cancelling refunds every seated stake to earnings."
          : "Cancelling closes this table and refunds every seated stake to earnings."}
      </p>
      <button type="button" className="btn btn--ghost btn--block" onClick={cancelTable} disabled={busy}>
        {busy ? "cancelling" : "cancel table"}
      </button>
      <TxStatus state={cancelTx.state} onRetry={cancelTx.reset} />
    </section>
  );
}

function PlayRoom({
  arena,
  address,
  isPlayer,
  myReveal,
  revealStatus,
  onChanged,
}: {
  arena: Arena;
  address: string | null;
  isPlayer: boolean;
  myReveal: { board: number[]; salt: Uint8Array } | null;
  revealStatus: Record<string, boolean>;
  onChanged(): void;
}) {
  const callTx = useTx();
  const claimTx = useTx();

  const myTurn = !!address && arena.players[arena.turn_index] === address;
  const callBusy =
    callTx.state.phase === "building" || callTx.state.phase === "signing" || callTx.state.phase === "submitting";
  const claimBusy =
    claimTx.state.phase === "building" || claimTx.state.phase === "signing" || claimTx.state.phase === "submitting";

  const calls = Array.from(arena.call_sequence);
  const lastCall = calls.length > 0 ? calls[calls.length - 1] : null;
  const calledOrder = new Map<number, number>();
  calls.forEach((n, i) => calledOrder.set(n, i + 1));

  const markedMask = myReveal ? marks(myReveal.board, arena.called_mask) : 0;
  const myLines = countCompletedLines(markedMask);

  function callNumber(n: number) {
    if (!address || !myTurn || callBusy || calledOrder.has(n)) return;
    void callTx.run(async (report) => {
      report("building");
      const client = arenaClient(address);
      const tx = await client.call_number({ arena_id: arena.id, player: address, number: n });
      unwrapResult(tx.result, simulationError(tx));

      const { hash, result } = await signAndSubmit(tx, address, report);
      unwrapResult(result);
      onChanged();
      return hash;
    });
  }

  /** The claim transaction itself, shared by auto-claim at bingo and the
   * armed manual button. No confirm here: with five lines on the board the
   * claim is always optimal, the bingo index is already fixed. */
  function runClaim() {
    if (!address || claimBusy) return;
    void claimTx.run(async (report) => {
      report("building");
      const client = arenaClient(address);
      const tx = await client.claim_bingo({ arena_id: arena.id, player: address });
      unwrapResult(tx.result, simulationError(tx));

      const { hash, result } = await signAndSubmit(tx, address, report);
      unwrapResult(result);
      onChanged();
      return hash;
    });
  }

  /** The strategic early claim, before bingo. This one keeps the confirm:
   * it freezes the round for everyone on a board that has not won yet. */
  function claimEarly() {
    if (!address || claimBusy) return;
    const confirmed = window.confirm(
      "Claim bingo now? Claiming ends the calling phase for everyone and opens the reveal. " +
        "The claim itself proves nothing: settlement replays the recorded calls against every " +
        "revealed board, the earliest fifth line wins, and if nobody reached five, the most " +
        "completed lines take the pot."
    );
    if (!confirmed) return;
    runClaim();
  }

  // Auto-claim: the fifth line fixes this board's bingo index, and an
  // opponent without bingo can only land a later one, so claiming now never
  // loses. Fires at most once per detection; a Freighter decline or an
  // error falls back to the armed manual button instead of looping. Waits
  // out any in-flight call first, then re-checks it is still valid.
  const autoClaimed = useRef(false);
  useEffect(() => {
    if (autoClaimed.current) return;
    if (arena.state.tag !== "Playing" || !isPlayer || myLines < 5) return;
    if (callBusy || claimTx.state.phase !== "idle") return;
    autoClaimed.current = true;
    runClaim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arena.state.tag, isPlayer, myLines, callBusy, claimTx.state.phase]);

  // Committed means the table is full and the opening call is live for
  // whoever holds the turn, so the label must not read as a dead wait.
  const turnLabel =
    arena.state.tag === "Committed"
      ? myTurn
        ? "your call opens the game"
        : `waiting on ${truncateAddress(arena.players[arena.turn_index])} to open`
      : myTurn
        ? "your call"
        : `waiting on ${truncateAddress(arena.players[arena.turn_index])}`;

  return (
    <div className="room-grid">
      <section className="panel">
        <p className="panel-label">{myReveal ? "your board" : isPlayer ? "call sheet" : "call record"}</p>

        <p className={`turn-strip ${myTurn ? "turn-strip--you" : ""}`} role="status">
          <span className="turn-dot" aria-hidden />
          {turnLabel}
        </p>

        {!isPlayer && (
          <p className="call-note">
            {address
              ? "This wallet holds no seat here, so the record below is read only."
              : "Connect the wallet seated at this table to play its board."}
          </p>
        )}

        {myReveal ? (
          <>
            {isPlayer && (
              <p className="call-note">
                Your board is the call sheet: on your turn, tap an unmarked cell to call its number.
              </p>
            )}
            <div className="board-flex">
              <div className="board-wrap">
                <div className="card-grid">
                  {myReveal.board.map((n, i) => {
                    const order = calledOrder.get(n);
                    const marked = order !== undefined;
                    const disabled = !isPlayer || !myTurn || callBusy || marked;
                    return (
                      <button
                        type="button"
                        key={i}
                        className={`cell board-cell ${marked ? "cell--marked" : ""} ${n === lastCall ? "cell--latest" : ""}`}
                        onClick={() => callNumber(n)}
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
              <BingoMeter lines={myLines} />
            </div>
          </>
        ) : isPlayer ? (
          <>
            <p className="call-note">
              No saved board on this device. You can still call and claim from the sheet below, but
              with nothing to reveal, this stake is forfeit at settlement.
            </p>
            <CallSheet
              calledOrder={calledOrder}
              myTurn={myTurn}
              busy={callBusy}
              onCall={callNumber}
            />
          </>
        ) : (
          <CallRecord calls={calls} />
        )}

        {arena.state.tag === "Playing" && isPlayer && (
          <div className="claim-row">
            {myLines >= 5 ? (
              claimTx.state.phase === "success" ? null : claimBusy || !autoClaimed.current ? (
                <p className="claim-note" role="status">
                  Bingo reached. Approve the claim in your wallet.
                </p>
              ) : (
                <button type="button" className="btn btn--win btn--block" onClick={runClaim}>
                  <TrophyIcon size={14} /> claim bingo
                </button>
              )
            ) : (
              <button
                type="button"
                className="btn btn--ghost btn--block"
                onClick={claimEarly}
                disabled={claimBusy}
              >
                <TrophyIcon size={14} /> {claimBusy ? "claiming" : "claim bingo"}
              </button>
            )}
            <TxStatus state={claimTx.state} onRetry={claimTx.reset} />
          </div>
        )}
        <TxStatus state={callTx.state} onRetry={callTx.reset} />
      </section>

      <PlayersPanel arena={arena} address={address} revealStatus={revealStatus} />
    </div>
  );
}

const SHEET_NUMBERS = Array.from({ length: 25 }, (_, i) => i + 1);

/** The 1..25 call sheet for a seated player whose reveal record is gone.
 * The contract never needs your board to call, so their turn must not
 * stall the table: uncalled numbers stay tappable on their turn and fire
 * the same call_number path the board cells use. */
function CallSheet({
  calledOrder,
  myTurn,
  busy,
  onCall,
}: {
  calledOrder: Map<number, number>;
  myTurn: boolean;
  busy: boolean;
  onCall(n: number): void;
}) {
  return (
    <div className="call-record">
      {SHEET_NUMBERS.map((n) => {
        const order = calledOrder.get(n);
        const called = order !== undefined;
        return (
          <button
            type="button"
            key={n}
            className={`call-chip call-chip--live ${called ? "call-chip--called" : ""}`}
            onClick={() => onCall(n)}
            disabled={called || !myTurn || busy}
            aria-label={called ? `${n}, called ${addOrdinal(order)}` : `call ${n}`}
          >
            {called && <span className="cell-order">{order}</span>}
            {n}
          </button>
        );
      })}
    </div>
  );
}

/** The compact, read-only record of calls in order, for spectators. */
function CallRecord({ calls }: { calls: number[] }) {
  if (calls.length === 0) {
    return <p className="call-note">No calls yet.</p>;
  }
  return (
    <ol className="call-record" aria-label="Call record, in order">
      {calls.map((n, i) => (
        <li key={i} className="call-chip">
          <span className="cell-order">{i + 1}</span>
          {n}
        </li>
      ))}
    </ol>
  );
}

function PlayersPanel({
  arena,
  address,
  revealStatus,
}: {
  arena: Arena;
  address: string | null;
  revealStatus: Record<string, boolean>;
}) {
  const showReveal = arena.state.tag === "Revealing" || arena.state.tag === "Settled";
  const showTurn = arena.state.tag === "Committed" || arena.state.tag === "Playing";

  return (
    <aside className="panel">
      <p className="panel-label">the table</p>
      <p className="call-note">
        {stroopsToXlm(arena.stake)} XLM a seat · {arena.players.length}/{arena.max_players} seated ·{" "}
        {stroopsToXlm(arena.stake * BigInt(arena.players.length))} XLM in the pot
      </p>

      <div className="players">
        <div className="players-head">
          <UsersIcon size={14} /> players, in calling order
        </div>
        <ul className="players-list">
          {arena.players.map((p, i) => {
            const isMe = p === address;
            const isTurn = showTurn && i === arena.turn_index;
            return (
              <li key={p} className={`player ${isMe ? "player--me" : ""}`}>
                <span className="mono">{truncateAddress(p)}</span>
                {isMe && <span className="player-you">you</span>}
                {isTurn && <span className="tag tag--turn">turn</span>}
                {showReveal &&
                  (revealStatus[p] ? (
                    <span className="reveal-ok">
                      <CheckIcon size={12} /> revealed
                    </span>
                  ) : (
                    <span className="tag tag--pending">pending</span>
                  ))}
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
