import { Buffer } from "buffer";
import { useEffect, useState } from "react";
import type { Arena } from "bingo-client";
import { arenaClient, signAndSubmit, simulationError, unwrapResult } from "../lib/contract";
import { useTx } from "../hooks/useTx";
import { AlertIcon, CheckIcon, TrophyIcon } from "./Icons";
import TxStatus from "./TxStatus";

interface RevealPanelProps {
  arena: Arena;
  address: string | null;
  myReveal: { board: number[]; salt: Uint8Array } | null;
  /** Whether the connected wallet's board is already revealed on chain. */
  revealed: boolean;
  /** Whether every seated player has revealed on chain. */
  allRevealed: boolean;
  /** Called after reveal_board or settle confirms, so the room can refetch
   * immediately instead of waiting for the next event poll. */
  onChanged(): void;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatCountdown(msLeft: number): string {
  if (msLeft <= 0) return "reveal window closed";
  const totalSeconds = Math.floor(msLeft / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)} left to reveal`;
}

/**
 * Shown while an arena is Revealing. Lets the connected player reveal the
 * board they committed (or explains why their stake is forfeited if this
 * device never saved one), and lets anyone close the round out once the
 * contract will accept it.
 */
export default function RevealPanel({ arena, address, myReveal, revealed, allRevealed, onChanged }: RevealPanelProps) {
  const revealTx = useTx();
  const settleTx = useTx();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const deadlineMs = Number(arena.reveal_deadline) * 1000;
  const msLeft = deadlineMs - now;
  const deadlinePassed = msLeft <= 0;
  const isPlayer = !!address && arena.players.includes(address);
  const settleEnabled = allRevealed || deadlinePassed;

  const revealBusy =
    revealTx.state.phase === "building" || revealTx.state.phase === "signing" || revealTx.state.phase === "submitting";
  const settleBusy =
    settleTx.state.phase === "building" || settleTx.state.phase === "signing" || settleTx.state.phase === "submitting";

  function onReveal() {
    if (!address || !myReveal || revealBusy) return;
    void revealTx.run(async (report) => {
      report("building");
      const client = arenaClient(address);
      const tx = await client.reveal_board({
        arena_id: arena.id,
        player: address,
        board: Buffer.from(myReveal.board),
        salt: Buffer.from(myReveal.salt),
      });
      unwrapResult(tx.result, simulationError(tx));

      const { hash, result } = await signAndSubmit(tx, address, report);
      unwrapResult(result);
      onChanged();
      return hash;
    });
  }

  function onSettle() {
    // settle has no per-caller check in the contract: any signed transaction
    // can close the round out once the window allows it. The connected
    // wallet only pays the network fee here, win or lose.
    if (!address || !settleEnabled || settleBusy) return;
    void settleTx.run(async (report) => {
      report("building");
      const client = arenaClient(address);
      const tx = await client.settle({ arena_id: arena.id });
      unwrapResult(tx.result, simulationError(tx));

      const { hash, result } = await signAndSubmit(tx, address, report);
      unwrapResult(result);
      onChanged();
      return hash;
    });
  }

  return (
    <section className="panel">
      <p className="panel-label">reveal phase</p>
      <p className="countdown mono">{formatCountdown(msLeft)}</p>

      {isPlayer &&
        (revealed ? (
          <p className="reveal-ok">
            <CheckIcon size={13} /> your board is revealed on chain.
          </p>
        ) : myReveal ? (
          <>
            <button type="button" className="btn btn--primary btn--block" onClick={onReveal} disabled={revealBusy}>
              {revealBusy ? "revealing..." : "reveal your board"}
            </button>
            <TxStatus state={revealTx.state} onRetry={revealTx.reset} />
          </>
        ) : (
          <p className="board-setup-warn">
            <AlertIcon size={13} /> no saved board was found on this device for this arena. Without the
            board and salt used to seal your commitment, it cannot be revealed and your stake is forfeited
            when this round settles.
          </p>
        ))}

      <div className="settle-row">
        <button
          type="button"
          className="btn btn--ghost btn--block"
          onClick={onSettle}
          disabled={!address || !settleEnabled || settleBusy}
        >
          <TrophyIcon size={14} /> {settleBusy ? "settling..." : "settle arena"}
        </button>
        {!settleEnabled && (
          <p className="board-setup-warn">
            settle unlocks once every player has revealed, or the countdown above runs out.
          </p>
        )}
        <TxStatus state={settleTx.state} onRetry={settleTx.reset} />
      </div>
    </section>
  );
}
