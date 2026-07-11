import { useCallback, useEffect, useState } from "react";
import type { Arena } from "bingo-client";
import { ArrowLeftIcon } from "./components/Icons";
import BoardSetup from "./components/BoardSetup";
import Header from "./components/Header";
import Lobby from "./components/Lobby";
import SendXlmCard from "./components/SendXlmCard";
import { useArenas } from "./hooks/useArenas";
import { useBalance } from "./hooks/useBalance";
import { useWallet } from "./hooks/useWallet";
import { readArena } from "./lib/contract";
import { errorMessage, mapError } from "./lib/errors";

type Route = { name: "lobby" } | { name: "arena"; id: number } | { name: "wallet" };

function parseHash(hash: string): Route {
  const match = hash.match(/^#\/arena\/(\d+)$/);
  if (match) return { name: "arena", id: Number(match[1]) };
  if (hash === "#/wallet") return { name: "wallet" };
  return { name: "lobby" };
}

/** Hand-rolled hash routing: no router dependency for three routes. */
function useHashRoute(): [Route, (hash: string) => void] {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = useCallback((hash: string) => {
    window.location.hash = hash;
  }, []);

  return [route, navigate];
}

export default function App() {
  const wallet = useWallet();
  const balanceState = useBalance(wallet.address);
  const [route, navigate] = useHashRoute();
  const arenasState = useArenas();

  return (
    <div className="shell">
      <Header wallet={wallet} balanceState={balanceState} />
      <main className="placeholder-main">
        {route.name === "lobby" && (
          <Lobby
            address={wallet.address}
            arenas={arenasState.arenas}
            loading={arenasState.loading}
            error={arenasState.error}
            onRefresh={arenasState.refresh}
            onOpenArena={(id) => navigate(`#/arena/${id}`)}
            onCreated={(id) => {
              arenasState.refresh();
              navigate(`#/arena/${id}`);
            }}
          />
        )}
        {route.name === "arena" && (
          <ArenaRoom
            arenaId={route.id}
            address={wallet.address}
            onBack={() => navigate("#/")}
            onChanged={arenasState.refresh}
          />
        )}
        {route.name === "wallet" && (
          <WalletView
            address={wallet.address}
            onBack={() => navigate("#/")}
            onSuccess={balanceState.refresh}
          />
        )}
      </main>
    </div>
  );
}

interface WalletViewProps {
  address: string | null;
  onBack(): void;
  /** Refreshes the header balance after a confirmed payment. */
  onSuccess(): void;
}

/** The Level 1 send-XLM flow, kept reachable from the header at #/wallet. */
function WalletView({ address, onBack, onSuccess }: WalletViewProps) {
  return (
    <div>
      <div className="room-bar">
        <button type="button" className="btn btn--icon" onClick={onBack} aria-label="Back to lobby">
          <ArrowLeftIcon size={16} />
        </button>
        <div className="room-title">
          <h2>Wallet</h2>
        </div>
      </div>
      <SendXlmCard address={address} onSuccess={onSuccess} />
    </div>
  );
}

interface ArenaRoomProps {
  arenaId: number;
  address: string | null;
  onBack(): void;
  onChanged(): void;
}

/**
 * Placeholder room view for Task 6: shows the arena and, for a seat still
 * open to the connected wallet, the sealed board commit flow. Full
 * gameplay (calling numbers, claiming bingo, revealing) lands in Task 7.
 */
function ArenaRoom({ arenaId, address, onBack, onChanged }: ArenaRoomProps) {
  const [arena, setArena] = useState<Arena | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    readArena(arenaId)
      .then((a) => {
        setArena(a);
        setError(a ? null : "That arena does not exist.");
      })
      .catch((e: unknown) => setError(errorMessage(mapError(e))))
      .finally(() => setLoading(false));
  }, [arenaId]);

  useEffect(() => {
    load();
  }, [load]);

  const hasJoined = !!(arena && address && arena.players.includes(address));

  return (
    <div>
      <div className="room-bar">
        <button type="button" className="btn btn--icon" onClick={onBack} aria-label="Back to lobby">
          <ArrowLeftIcon size={16} />
        </button>
        <div className="room-title">
          <h2>Arena #{arenaId}</h2>
        </div>
      </div>

      {loading && <p className="state-msg">Loading arena...</p>}
      {!loading && error && <p className="field-error">{error}</p>}

      {arena && !address && (
        <div className="state">
          <p className="state-title">Connect your wallet</p>
          <p className="state-msg">You need a connected wallet to join this arena.</p>
        </div>
      )}

      {arena && address && !hasJoined && arena.state.tag === "Created" && (
        <BoardSetup
          arenaId={arenaId}
          address={address}
          onCommitted={() => {
            load();
            onChanged();
          }}
        />
      )}

      {arena && address && !hasJoined && arena.state.tag !== "Created" && (
        <div className="state">
          <p className="state-title">Seats are sealed</p>
          <p className="state-msg">This arena already moved past joining.</p>
        </div>
      )}

      {arena && hasJoined && (
        <div className="state">
          <p className="state-title">Board sealed</p>
          <p className="state-msg">
            Your commitment is on chain. Calling numbers and revealing arrive in a later build.
          </p>
        </div>
      )}
    </div>
  );
}
