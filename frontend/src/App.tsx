import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Backdrop from "./components/Backdrop";
import BingoBall from "./components/BingoBall";
import CardGrid from "./components/CardGrid";
import Toasts from "./components/Toasts";
import {
  ArrowLeftIcon,
  CheckIcon,
  DiceIcon,
  LinkIcon,
  PlusIcon,
  RefreshIcon,
  Spinner,
  SparkleIcon,
  TrophyIcon,
  UsersIcon,
  WalletIcon,
} from "./components/Icons";
import {
  CONTRACT_ID,
  EXPLORER_BASE,
  NETWORK_LABEL,
  cardHasBingo,
  devSigner,
  freighterSigner,
  makeClient,
  truncate,
  type Game,
  type Signer,
} from "./lib/stellar";
import { ToastProvider, useToasts } from "./hooks/useToasts";

function extractHash(sent: unknown): string | undefined {
  const s = sent as {
    sendTransactionResponse?: { hash?: string };
    getTransactionResponse?: { txHash?: string };
  };
  return s?.sendTransactionResponse?.hash ?? s?.getTransactionResponse?.txHash;
}
const txLink = (h?: string) => (h ? `${EXPLORER_BASE}/tx/${h}` : undefined);

function statusOf(g: Game) {
  return g.status.tag;
}

function AppInner() {
  const { push, update } = useToasts();

  const [signer, setSigner] = useState<Signer | null>(() => devSigner());
  const [connecting, setConnecting] = useState(false);

  const [games, setGames] = useState<Game[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [activeGame, setActiveGame] = useState<Game | null>(null);

  const [loadingLobby, setLoadingLobby] = useState(true);
  const [creating, setCreating] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [joining, setJoining] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const client = useMemo(() => makeClient(signer), [signer]);
  const me = signer?.publicKey ?? null;
  const lastDraw = useRef<number | null>(null);

  // ----- data loading -----
  const loadGames = useCallback(async () => {
    try {
      const tx = await client.get_games();
      setGames(((tx.result ?? []) as Game[]).slice().reverse());
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingLobby(false);
    }
  }, [client]);

  const loadGame = useCallback(
    async (id: number) => {
      try {
        const tx = await client.get_game({ game_id: id });
        setActiveGame(tx.result as Game);
      } catch (err) {
        console.error(err);
      }
    },
    [client]
  );

  useEffect(() => {
    loadGames();
  }, [loadGames]);

  // poll the open room so others' draws/joins show up (P2P liveness)
  useEffect(() => {
    if (activeId === null) return;
    loadGame(activeId);
    const t = setInterval(() => loadGame(activeId), 5000);
    return () => clearInterval(t);
  }, [activeId, loadGame]);

  // ----- actions -----
  const createGame = useCallback(async () => {
    if (!me) return;
    setCreating(true);
    const tid = push({ kind: "pending", title: "Opening a new table…" });
    try {
      const tx = await client.create_game({ host: me });
      const sent = await tx.signAndSend();
      const id = typeof sent.result === "number" ? sent.result : undefined;
      update(tid, { kind: "success", title: `Table #${id ?? "?"} is open`, href: txLink(extractHash(sent)), hrefLabel: "View tx" });
      await loadGames();
      if (id !== undefined) setActiveId(id);
    } catch (err) {
      update(tid, { kind: "error", title: "Couldn't open table", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setCreating(false);
    }
  }, [client, me, push, update, loadGames]);

  const joinGame = useCallback(async () => {
    if (!me || activeId === null) return;
    setJoining(true);
    const tid = push({ kind: "pending", title: "Taking a seat…" });
    try {
      const tx = await client.join_game({ game_id: activeId, player: me });
      const sent = await tx.signAndSend();
      update(tid, { kind: "success", title: "You're in — card dealt", href: txLink(extractHash(sent)), hrefLabel: "View tx" });
      await loadGame(activeId);
    } catch (err) {
      update(tid, { kind: "error", title: "Couldn't join", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setJoining(false);
    }
  }, [client, me, activeId, push, update, loadGame]);

  const drawNumber = useCallback(async () => {
    if (activeId === null) return;
    setDrawing(true);
    const tid = push({ kind: "pending", title: "Drawing a ball…" });
    try {
      const tx = await client.draw_number({ game_id: activeId });
      const sent = await tx.signAndSend();
      const ball = typeof sent.result === "number" ? sent.result : undefined;
      lastDraw.current = ball ?? null;
      update(tid, { kind: "success", title: ball ? `Called: ${ball}` : "Number drawn", href: txLink(extractHash(sent)), hrefLabel: "View tx" });
      await loadGame(activeId);
    } catch (err) {
      update(tid, { kind: "error", title: "Couldn't draw", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setDrawing(false);
    }
  }, [client, activeId, push, update, loadGame]);

  const claimBingo = useCallback(async () => {
    if (!me || activeId === null) return;
    setClaiming(true);
    const tid = push({ kind: "pending", title: "Verifying your card on-chain…" });
    try {
      const tx = await client.claim_bingo({ game_id: activeId, player: me });
      const sent = await tx.signAndSend();
      const won = sent.result === true;
      update(tid, {
        kind: won ? "success" : "info",
        title: won ? "BINGO! You win 🎉" : "No line yet — keep going",
        href: txLink(extractHash(sent)),
        hrefLabel: "View tx",
      });
      await loadGame(activeId);
      await loadGames();
    } catch (err) {
      update(tid, { kind: "error", title: "Claim failed", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setClaiming(false);
    }
  }, [client, me, activeId, push, update, loadGame, loadGames]);

  const connectFreighter = useCallback(async () => {
    setConnecting(true);
    try {
      const s = await freighterSigner();
      setSigner(s);
      push({ kind: "success", title: "Freighter connected", message: truncate(s.publicKey, 6, 6) });
    } catch (err) {
      push({ kind: "error", title: "Freighter unavailable", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setConnecting(false);
    }
  }, [push]);

  // ----- derived -----
  const myPlayer = activeGame?.players.find((p) => p.addr === me) ?? null;
  const drawnSet = useMemo(() => new Set(activeGame?.drawn ?? []), [activeGame]);
  const iCanClaim = !!myPlayer && cardHasBingo(myPlayer.card as number[], drawnSet);
  const winner = activeGame?.winner ?? null;
  const lastCalled = activeGame?.drawn?.length ? activeGame.drawn[activeGame.drawn.length - 1] : null;

  return (
    <>
      <Backdrop />
      <Toasts />

      <div className="shell">
        <header className="masthead">
          <button className="brand" onClick={() => setActiveId(null)}>
            <span className="brand-mark">
              <span>B</span>
            </span>
            <div className="brand-text">
              <h1 className="brand-name">BINGO·P2P</h1>
              <p className="brand-sub">on-chain bingo · soroban</p>
            </div>
          </button>

          <div className="status-cluster">
            <span className="chip chip--live">
              <span className="live-dot" />
              {NETWORK_LABEL}
            </span>
            <a className="chip chip--link" href={`${EXPLORER_BASE}/contract/${CONTRACT_ID}`} target="_blank" rel="noreferrer" title={CONTRACT_ID}>
              <span className="chip-key">game</span>
              <span className="mono">{truncate(CONTRACT_ID, 4, 4)}</span>
              <LinkIcon size={12} />
            </a>
            {signer ? (
              <a className="chip chip--wallet" href={`${EXPLORER_BASE}/account/${signer.publicKey}`} target="_blank" rel="noreferrer" title={`${signer.kind} · ${signer.publicKey}`}>
                <WalletIcon size={14} />
                <span className="mono">{truncate(signer.publicKey, 4, 4)}</span>
                <span className={`tag tag--${signer.kind}`}>{signer.kind}</span>
              </a>
            ) : (
              <button className="chip chip--cta" onClick={connectFreighter} disabled={connecting}>
                {connecting ? <Spinner size={13} /> : <WalletIcon size={14} />} connect
              </button>
            )}
          </div>
        </header>

        {activeId === null ? (
          /* ----------------------------- LOBBY ----------------------------- */
          <main className="lobby">
            <section className="hero">
              <p className="hero-eyebrow">peer-to-peer · no server · provably fair*</p>
              <h2 className="hero-title">
                Bingo, <span className="hero-accent">settled on-chain.</span>
              </h2>
              <p className="hero-lede">
                Open a table, deal cards, and call balls — every move is a Stellar transaction
                verified by a Soroban smart contract. Anyone can draw, anyone can win.
              </p>
              <div className="hero-actions">
                <button className="btn btn--primary btn--lg" onClick={createGame} disabled={!me || creating}>
                  {creating ? <Spinner size={18} /> : <PlusIcon size={18} />}
                  <span>New table</span>
                </button>
                <button className="btn btn--ghost btn--lg" onClick={loadGames} disabled={loadingLobby}>
                  <RefreshIcon size={16} className={loadingLobby ? "spin" : ""} />
                  <span>Refresh</span>
                </button>
              </div>
            </section>

            <section className="tables">
              <div className="tables-head">
                <h3 className="section-title">Open tables</h3>
                <span className="section-count">{games.length}</span>
              </div>

              {loadingLobby ? (
                <div className="state"><Spinner size={22} /><p>Loading tables…</p></div>
              ) : games.length === 0 ? (
                <div className="state">
                  <div className="state-orbit"><DiceIcon size={26} /></div>
                  <p className="state-title">No tables yet</p>
                  <p className="state-msg">Be the first — open a new table to start a game.</p>
                </div>
              ) : (
                <div className="table-grid">
                  {games.map((g) => {
                    const st = statusOf(g);
                    return (
                      <button key={g.id} className="table-card" onClick={() => setActiveId(g.id)}>
                        <div className="table-card-top">
                          <span className="table-id">TABLE #{g.id}</span>
                          <span className={`badge badge--${st.toLowerCase()}`}>{st}</span>
                        </div>
                        <div className="table-stats">
                          <span className="tstat"><UsersIcon size={14} /> {g.players.length} players</span>
                          <span className="tstat"><DiceIcon size={14} /> {g.drawn.length} called</span>
                        </div>
                        <div className="table-host">
                          host <span className="mono">{truncate(g.host, 4, 4)}</span>
                          {g.winner && <span className="table-win"><TrophyIcon size={12} /> {truncate(g.winner, 4, 4)}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <p className="footnote">
              *Numbers use the network PRNG — great for play, not for adversarial high-stakes draws.
            </p>
          </main>
        ) : (
          /* ----------------------------- ROOM ------------------------------ */
          <main className="room">
            <div className="room-bar">
              <button className="btn btn--ghost" onClick={() => setActiveId(null)}>
                <ArrowLeftIcon size={16} /> Lobby
              </button>
              <div className="room-title">
                <h2>Table #{activeId}</h2>
                {activeGame && <span className={`badge badge--${statusOf(activeGame).toLowerCase()}`}>{statusOf(activeGame)}</span>}
              </div>
              <button className="btn btn--icon" onClick={() => activeId !== null && loadGame(activeId)} title="Refresh">
                <RefreshIcon size={16} />
              </button>
            </div>

            {!activeGame ? (
              <div className="state"><Spinner size={22} /><p>Loading table…</p></div>
            ) : (
              <>
                {winner && (
                  <div className="winner-banner">
                    <TrophyIcon size={20} />
                    <span>
                      {winner === me ? "You won this table! 🎉" : <>Winner: <span className="mono">{truncate(winner, 6, 6)}</span></>}
                    </span>
                  </div>
                )}

                <div className="room-grid">
                  {/* The Caller */}
                  <section className="panel caller">
                    <div className="panel-label"><DiceIcon size={14} /> The Caller</div>
                    <div className="caller-stage">
                      {lastCalled !== null ? (
                        <BingoBall n={lastCalled} size={120} latest />
                      ) : (
                        <div className="caller-empty">No balls called yet</div>
                      )}
                    </div>
                    <button className="btn btn--primary btn--block" onClick={drawNumber} disabled={drawing || statusOf(activeGame) === "Finished"}>
                      {drawing ? <Spinner size={18} /> : <DiceIcon size={18} />}
                      <span>Draw next ball</span>
                    </button>
                    <p className="caller-count">{activeGame.drawn.length} / 75 called</p>

                    <div className="called-board">
                      {Array.from({ length: 75 }, (_, i) => i + 1).map((n) => (
                        <BingoBall key={n} n={n} size={26} muted={!drawnSet.has(n)} />
                      ))}
                    </div>
                  </section>

                  {/* Your card + players */}
                  <section className="panel">
                    <div className="panel-label"><SparkleIcon size={13} /> Your card</div>
                    {myPlayer ? (
                      <>
                        <CardGrid card={myPlayer.card as number[]} drawn={drawnSet} latest={lastCalled} />
                        <button
                          className={`btn btn--block ${iCanClaim ? "btn--win" : "btn--ghost"}`}
                          onClick={claimBingo}
                          disabled={claiming || statusOf(activeGame) === "Finished"}
                        >
                          {claiming ? <Spinner size={18} /> : <CheckIcon size={18} />}
                          <span>{iCanClaim ? "Claim BINGO!" : "Claim BINGO"}</span>
                        </button>
                        {iCanClaim && <p className="claim-hint">You have a line — claim it!</p>}
                      </>
                    ) : (
                      <div className="join-box">
                        <p>You're spectating. Take a seat to get a card.</p>
                        <button className="btn btn--primary btn--block" onClick={joinGame} disabled={joining || !me || statusOf(activeGame) === "Finished"}>
                          {joining ? <Spinner size={18} /> : <PlusIcon size={18} />}
                          <span>Join table</span>
                        </button>
                      </div>
                    )}

                    <div className="players">
                      <div className="players-head"><UsersIcon size={14} /> {activeGame.players.length} players</div>
                      <ul className="players-list">
                        {activeGame.players.map((p) => (
                          <li key={p.addr} className={`player ${p.addr === me ? "player--me" : ""} ${p.addr === winner ? "player--win" : ""}`}>
                            <span className="mono">{truncate(p.addr, 5, 5)}</span>
                            {p.addr === me && <span className="player-you">you</span>}
                            {p.addr === winner && <TrophyIcon size={13} />}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </section>
                </div>
              </>
            )}
          </main>
        )}

        <footer className="footer">
          <span className="mono">{truncate(CONTRACT_ID, 6, 6)}</span>
          <span className="footer-dot">·</span>
          <span>Stellar Soroban {NETWORK_LABEL}</span>
          <span className="footer-dot">·</span>
          <a href={`${EXPLORER_BASE}/contract/${CONTRACT_ID}`} target="_blank" rel="noreferrer">
            stellar.expert <LinkIcon size={11} />
          </a>
        </footer>
      </div>
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}
