import { Buffer } from "buffer";
import { useState } from "react";
import { arenaClient, signAndSubmit, simulationError, unwrapResult } from "../lib/contract";
import { useTx } from "../hooks/useTx";
import { CONFIG } from "../lib/config";
import { boardCommitment, loadReveal, newSalt, randomBoard, saveReveal } from "../lib/commit";
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
  // A reveal record saved by an earlier commit attempt for this arena and
  // address. If one exists it is reused verbatim and never overwritten:
  // that commit may have landed on chain even though the client saw an
  // error, and the record holds the only preimage that can reveal it.
  const [saved, setSaved] = useState(() => loadReveal(CONFIG.contractId, arenaId, address));
  const [board, setBoard] = useState<number[]>(() => saved?.board ?? randomBoard());
  const [selected, setSelected] = useState<number | null>(null);

  const busy = state.phase === "building" || state.phase === "signing" || state.phase === "submitting";
  const locked = saved !== null;

  function tapCell(i: number) {
    if (busy || locked) return;
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
    if (busy || locked) return;
    setBoard(randomBoard());
    setSelected(null);
  }

  function onCommit() {
    if (busy) return;
    void run(async (report) => {
      report("building");

      // Reuse the existing reveal record if one exists (re-read here in
      // case another tab wrote one since mount); otherwise mint a fresh
      // salt and save BEFORE the transaction is built, so a crash
      // mid-commit can never strand the stake. An existing record is
      // never overwritten with a new salt.
      const existing = loadReveal(CONFIG.contractId, arenaId, address);
      const commitBoard = existing?.board ?? board;
      const salt = existing?.salt ?? newSalt();
      if (!existing) {
        saveReveal(CONFIG.contractId, arenaId, address, commitBoard, salt);
        setSaved({ board: commitBoard, salt });
      }
      const commitment = await boardCommitment(commitBoard, salt);

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
      <p className="call-note">
        {locked
          ? "This board is already sealed for this table."
          : "Arrange your numbers, then commit. Tap two cells to swap them."}
      </p>

      <div className="card-grid">
        {board.map((n, i) => (
          <button
            type="button"
            key={i}
            className={`cell board-cell ${selected === i ? "cell--selected" : ""}`}
            onClick={() => tapCell(i)}
            disabled={busy || locked}
            aria-pressed={selected === i}
          >
            <span className="cell-num">{n}</span>
          </button>
        ))}
      </div>

      <div className="board-setup-actions">
        <button type="button" className="btn btn--ghost" onClick={shuffle} disabled={busy || locked}>
          <DiceIcon size={14} /> shuffle
        </button>
        <button type="button" className="btn btn--primary" onClick={onCommit} disabled={busy}>
          {busy ? "sealing" : locked ? "retry the commit" : "commit board, stake XLM"}
        </button>
      </div>

      {locked ? (
        <p className="board-setup-warn">
          A sealed board is already saved here for this table, so it is reused as is. A fresh
          salt would orphan the earlier on-chain commit.
        </p>
      ) : (
        <p className="board-setup-warn">
          Your board and its salt live in this browser only. Clear site data before the reveal
          and the stake is forfeit.
        </p>
      )}

      <TxStatus state={state} onRetry={reset} />
    </section>
  );
}
