import { useEffect, useState, type ReactNode } from "react";
import type { Arena } from "bingo-client";
import BoardSetup from "./BoardSetup";
import TxStatus from "./TxStatus";
import { STATE_LABEL } from "./Lobby";
import { ArrowLeftIcon, CheckIcon, TrophyIcon, UsersIcon } from "./Icons";
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

const BOARD_NUMBERS = Array.from({ length: 25 }, (_, i) => i + 1);

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
        <p className="state-msg">Loading arena...</p>
      </RoomShell>
    );
  }
  if (!arena) {
    return (
      <RoomShell arenaId={arenaId} onBack={onBack}>
        <p className="field-error">{error ? errorMessage(error) : "That arena does not exist."}</p>
      </RoomShell>
    );
  }

  const isPlayer = !!address && arena.players.includes(address);

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
          <div className="state">
            <p className="state-title">Reveal phase</p>
            <p className="state-msg">
              Calling has stopped and every player now has a window to reveal their board. Reveal and
              settle actions land in the next commit.
            </p>
          </div>
          <PlayersPanel arena={arena} address={address} revealStatus={revealStatus} />
        </div>
      )}

      {arena.state.tag === "Settled" && (
        <div className="state">
          <p className="state-title">Arena settled</p>
          <p className="state-msg">
            The pool was split into each winner's earnings balance. Withdraw from the earnings card above.
          </p>
        </div>
      )}

      {arena.state.tag === "Cancelled" && (
        <div className="state">
          <p className="state-title">Arena cancelled</p>
          <p className="state-msg">Every joined player's stake was refunded to their earnings balance.</p>
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
          <h2>Arena #{arenaId}</h2>
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
        <p className="state-msg">You need a connected wallet to join this arena.</p>
      </div>
    );
  }

  if (isPlayer) {
    const remaining = arena.max_players - arena.players.length;
    return (
      <div className="state">
        <p className="state-title">Board sealed</p>
        <p className="state-msg">
          Waiting for {remaining} more player{remaining === 1 ? "" : "s"} to seal a board before calling
          starts.
        </p>
      </div>
    );
  }

  return <BoardSetup arenaId={arena.id} address={address} onCommitted={onCommitted} />;
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

  const calledOrder = new Map<number, number>();
  Array.from(arena.call_sequence).forEach((n, i) => calledOrder.set(n, i + 1));

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

  function claimBingo() {
    if (!address || claimBusy) return;
    const confirmed = window.confirm(
      "Claim bingo now. If your board does not actually have five completed lines yet, the claim still " +
        "ends the call phase and opens reveal; settlement replays every revealed board against the real " +
        "call order and decides winners there, so a false claim freezes the round without winning it."
    );
    if (!confirmed) return;
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

  const turnLabel =
    arena.state.tag === "Committed"
      ? "waiting for the first call"
      : myTurn
        ? "your turn to call"
        : `waiting on ${truncateAddress(arena.players[arena.turn_index])}`;

  return (
    <div className="room-grid">
      <section className="panel">
        <p className="panel-label">call board · {turnLabel}</p>

        {!isPlayer && (
          <p className="call-note">
            {address
              ? "This wallet has not joined this arena, so calling is read only."
              : "Connect the wallet that joined this arena to call numbers."}
          </p>
        )}

        <div className="card-grid">
          {BOARD_NUMBERS.map((n) => {
            const order = calledOrder.get(n);
            const disabled = !isPlayer || !myTurn || callBusy || order !== undefined;
            return (
              <button
                type="button"
                key={n}
                className={`cell board-cell ${order !== undefined ? "cell--called" : ""}`}
                onClick={() => callNumber(n)}
                disabled={disabled}
              >
                <span className="cell-num">{n}</span>
                {order !== undefined && <span className="cell-order">{order}</span>}
              </button>
            );
          })}
        </div>

        {arena.state.tag === "Playing" && isPlayer && (
          <div className="claim-row">
            <button type="button" className="btn btn--win btn--block" onClick={claimBingo} disabled={claimBusy}>
              <TrophyIcon size={14} /> {claimBusy ? "claiming..." : "claim bingo"}
            </button>
            <TxStatus state={claimTx.state} onRetry={claimTx.reset} />
          </div>
        )}
        <TxStatus state={callTx.state} onRetry={callTx.reset} />

        {myReveal && (
          <div className="your-board">
            <p className="panel-label">your board</p>
            <div className="card-grid">
              {myReveal.board.map((n, i) => {
                const marked = (arena.called_mask & (1 << (n - 1))) !== 0;
                return (
                  <div key={i} className={`cell ${marked ? "cell--marked" : ""}`}>
                    <span className="cell-num">{n}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <PlayersPanel arena={arena} address={address} revealStatus={revealStatus} />
    </div>
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
      <p className="panel-label">arena #{arena.id}</p>
      <p className="call-note">
        {stroopsToXlm(arena.stake)} XLM stake each · {arena.players.length}/{arena.max_players} seats
      </p>

      <div className="players">
        <div className="players-head">
          <UsersIcon size={14} /> players
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
