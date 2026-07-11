import { Buffer } from "buffer";
import { useState } from "react";
import { arenaClient, signAndSubmit, simulationError, unwrapResult } from "../lib/contract";
import { useTx } from "../hooks/useTx";
import { CONFIG } from "../lib/config";
import { boardCommitment, newSalt, randomBoard, saveReveal } from "../lib/commit";
import { DiceIcon } from "./Icons";
import TxStatus from "./TxStatus";

interface BoardSetupProps {
  arenaId: number;
  address: string;
  /** Called right after commit_board confirms, so the caller can refetch the arena. */
  onCommitted(): void;
}

/** 5x5 board picker: tap two cells to swap them, or shuffle for a fresh layout. */
export default function BoardSetup({ arenaId, address, onCommitted }: BoardSetupProps) {
  const { state, run, reset } = useTx();
  const [board, setBoard] = useState<number[]>(() => randomBoard());
  const [selected, setSelected] = useState<number | null>(null);

  const busy = state.phase === "building" || state.phase === "signing" || state.phase === "submitting";

  function tapCell(i: number) {
    if (busy) return;
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

  function shuffle() {
    if (busy) return;
    setBoard(randomBoard());
    setSelected(null);
  }

  function onCommit() {
    if (busy) return;
    void run(async (report) => {
      report("building");

      const salt = newSalt();
      // Saved before the transaction is even built: a crash mid-commit can
      // never strand the stake. Only clearing site data after this point
      // does, since the salt would be gone.
      saveReveal(CONFIG.contractId, arenaId, address, board, salt);
      const commitment = await boardCommitment(board, salt);

      const client = arenaClient(address);
      const tx = await client.commit_board({
        arena_id: arenaId,
        player: address,
        commitment: Buffer.from(commitment),
      });
      // Check the simulation before ever prompting Freighter: a call that
      // is already known to fail should not ask for a signature.
      unwrapResult(tx.result, simulationError(tx));

      const { hash, result } = await signAndSubmit(tx, address, report);
      unwrapResult(result);
      onCommitted();
      return hash;
    });
  }

  return (
    <section className="panel board-setup">
      <p className="panel-label">seal your board</p>

      <div className="card-grid">
        {board.map((n, i) => (
          <button
            type="button"
            key={i}
            className={`cell board-cell ${selected === i ? "cell--selected" : ""}`}
            onClick={() => tapCell(i)}
            disabled={busy}
            aria-pressed={selected === i}
          >
            <span className="cell-num">{n}</span>
          </button>
        ))}
      </div>

      <div className="board-setup-actions">
        <button type="button" className="btn btn--ghost" onClick={shuffle} disabled={busy}>
          <DiceIcon size={14} /> shuffle
        </button>
        <button type="button" className="btn btn--primary" onClick={onCommit} disabled={busy}>
          {busy ? "sealing..." : "commit board and stake"}
        </button>
      </div>

      <p className="board-setup-warn">
        The board and salt are saved on this device only. Clearing site data before the
        reveal phase forfeits your stake.
      </p>

      <TxStatus state={state} onRetry={reset} />
    </section>
  );
}
