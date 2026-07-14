import { useCallback, useEffect, useState } from "react";
import { ArrowLeftIcon } from "./components/Icons";
import EarningsCard from "./components/EarningsCard";
import GameRoom from "./components/GameRoom";
import Header from "./components/Header";
import Lobby from "./components/Lobby";
import PracticeRoom from "./components/PracticeRoom";
import SendXlmCard from "./components/SendXlmCard";
import { useArenas } from "./hooks/useArenas";
import { useBalance } from "./hooks/useBalance";
import { useWallet } from "./hooks/useWallet";

type Route =
  | { name: "lobby" }
  | { name: "arena"; id: number }
  | { name: "wallet" }
  | { name: "practice" };

function parseHash(hash: string): Route {
  const match = hash.match(/^#\/arena\/(\d+)$/);
  if (match) return { name: "arena", id: Number(match[1]) };
  if (hash === "#/wallet") return { name: "wallet" };
  if (hash === "#/practice") return { name: "practice" };
  return { name: "lobby" };
}

/** Hand-rolled hash routing: no router dependency for four routes. */
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
      <main className="main-col">
        <EarningsCard address={wallet.address} />
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
          <GameRoom
            key={route.id}
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
        {route.name === "practice" && <PracticeRoom onBack={() => navigate("#/")} />}
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
          <h2>Send XLM</h2>
        </div>
      </div>
      <SendXlmCard address={address} onSuccess={onSuccess} />
    </div>
  );
}
