import type { Arena } from "bingo-client";
import CreateArenaForm from "./CreateArenaForm";
import { RefreshIcon } from "./Icons";
import { stroopsToXlm, truncateAddress } from "../lib/format";

interface LobbyProps {
  address: string | null;
  arenas: Arena[];
  loading: boolean;
  error: string | null;
  onRefresh(): void;
  onOpenArena(id: number): void;
  onCreated(id: number): void;
}

/** Shared with GameRoom, which shows the same badge in the room header. */
export const STATE_LABEL: Record<Arena["state"]["tag"], string> = {
  Created: "open",
  Committed: "sealed",
  Playing: "playing",
  Revealing: "revealing",
  Settled: "settled",
  Cancelled: "cancelled",
};

function ArenaCard({
  arena,
  address,
  onOpen,
}: {
  arena: Arena;
  address: string | null;
  onOpen(id: number): void;
}) {
  const joined = !!address && arena.players.includes(address);
  return (
    <button type="button" className="table-card" onClick={() => onOpen(arena.id)}>
      <div className="table-card-top">
        <span className="table-id">TABLE {arena.id}</span>
        <span className={`badge badge--${arena.state.tag.toLowerCase()}`}>
          {STATE_LABEL[arena.state.tag]}
        </span>
      </div>
      <div className="table-stake">
        {stroopsToXlm(arena.stake)}
        <small>XLM a seat</small>
      </div>
      <div className="seats-row">
        <span className="seats-pips" aria-hidden>
          {Array.from({ length: arena.max_players }, (_, i) => (
            <span key={i} className={`pip ${i < arena.players.length ? "pip--filled" : ""}`} />
          ))}
        </span>
        {arena.players.length}/{arena.max_players} seated
      </div>
      <div className="table-host">
        opened by <span className="mono">{truncateAddress(arena.creator)}</span>
        {joined && <span className="player-you">your seat</span>}
      </div>
    </button>
  );
}

/** Placeholder cards with the exact footprint of ArenaCard, so the grid
 * settles once and never jumps when real arenas replace them. */
function SkeletonCards({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="table-card table-card--skeleton" aria-hidden>
          <div className="table-card-top">
            <span className="skel skel--id" />
            <span className="skel skel--badge" />
          </div>
          <span className="skel skel--stake" />
          <span className="skel skel--seats" />
          <span className="skel skel--host" />
        </div>
      ))}
    </>
  );
}

export default function Lobby({
  address,
  arenas,
  loading,
  error,
  onRefresh,
  onOpenArena,
  onCreated,
}: LobbyProps) {
  const open = arenas.filter((a) => a.state.tag === "Created");
  const mine = address
    ? arenas.filter((a) => a.players.includes(address) || a.creator === address)
    : [];

  return (
    <>
      <CreateArenaForm address={address} onCreated={onCreated} />

      <div>
        <div className="tables-head">
          <h2 className="section-title">Open tables</h2>
          <span className="section-count">{open.length}</span>
          <button
            type="button"
            className="btn btn--icon"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh tables"
          >
            <RefreshIcon size={14} className={loading ? "spin" : ""} />
          </button>
        </div>

        {error && <p className="field-error">{error}</p>}

        {!loading && open.length === 0 && !error && (
          <div className="state">
            <span className="state-art" aria-hidden />
            <p className="state-title">The room is quiet</p>
            <p className="state-msg">No open tables right now. Open one above; play starts once every seat has sealed a board.</p>
          </div>
        )}

        <div className="table-grid">
          {loading && arenas.length === 0 && !error ? (
            <SkeletonCards count={3} />
          ) : (
            open.map((arena) => (
              <ArenaCard key={arena.id} arena={arena} address={address} onOpen={onOpenArena} />
            ))
          )}
        </div>
      </div>

      {mine.length > 0 && (
        <div>
          <div className="tables-head">
            <h2 className="section-title">Your tables</h2>
            <span className="section-count">{mine.length}</span>
          </div>
          <div className="table-grid">
            {mine.map((arena) => (
              <ArenaCard key={arena.id} arena={arena} address={address} onOpen={onOpenArena} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
