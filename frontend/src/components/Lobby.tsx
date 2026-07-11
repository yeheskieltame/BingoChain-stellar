import type { Arena } from "bingo-client";
import CreateArenaForm from "./CreateArenaForm";
import { RefreshIcon, UsersIcon } from "./Icons";
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
        <span className="table-id">#{arena.id}</span>
        <span className={`badge badge--${arena.state.tag.toLowerCase()}`}>
          {STATE_LABEL[arena.state.tag]}
        </span>
      </div>
      <div className="table-stats">
        <span className="tstat">
          <UsersIcon size={13} /> {arena.players.length}/{arena.max_players}
        </span>
        <span className="tstat">{stroopsToXlm(arena.stake)} XLM stake</span>
      </div>
      <div className="table-host">
        by {truncateAddress(arena.creator)}
        {joined && <span className="player-you">you joined</span>}
      </div>
    </button>
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
          <h2 className="section-title">Open arenas</h2>
          <span className="section-count">{open.length}</span>
          <button
            type="button"
            className="btn btn--icon"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh arenas"
          >
            <RefreshIcon size={14} className={loading ? "spin" : ""} />
          </button>
        </div>

        {error && <p className="field-error">{error}</p>}

        {!loading && open.length === 0 && !error && (
          <div className="state">
            <p className="state-title">No open arenas</p>
            <p className="state-msg">Create one above and wait for players to seal their boards.</p>
          </div>
        )}

        <div className="table-grid">
          {open.map((arena) => (
            <ArenaCard key={arena.id} arena={arena} address={address} onOpen={onOpenArena} />
          ))}
        </div>
      </div>

      {mine.length > 0 && (
        <div>
          <div className="tables-head">
            <h2 className="section-title">Your arenas</h2>
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
