import { useState, type FormEvent } from "react";
import { arenaClient, signAndSubmit, simulationError, unwrapResult } from "../lib/contract";
import { useTx } from "../hooks/useTx";
import { PlusIcon } from "./Icons";
import TxStatus from "./TxStatus";

const SEATS = [2, 3, 4, 5, 6];
const AMOUNT_RE = /^\d+(\.\d{1,7})?$/;
const MIN_STAKE_XLM = 1;

/** Parse a decimal XLM string to stroops without floating point rounding. */
function xlmToStroops(amount: string): bigint {
  const [whole, frac = ""] = amount.split(".");
  const fracPadded = (frac + "0000000").slice(0, 7);
  return BigInt(whole || "0") * 10_000_000n + BigInt(fracPadded);
}

interface CreateArenaFormProps {
  address: string | null;
  /** Called with the new arena's id right after create_arena confirms. */
  onCreated(id: number): void;
}

export default function CreateArenaForm({ address, onCreated }: CreateArenaFormProps) {
  const { state, run, reset } = useTx();
  const [stake, setStake] = useState("1");
  const [seats, setSeats] = useState(2);

  const busy = state.phase === "building" || state.phase === "signing" || state.phase === "submitting";
  const stakeValid = AMOUNT_RE.test(stake) && Number(stake) >= MIN_STAKE_XLM;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!address || !stakeValid || busy) return;

    void run(async (report) => {
      report("building");
      const client = arenaClient(address);
      const tx = await client.create_arena({
        creator: address,
        stake: xlmToStroops(stake),
        max_players: seats,
      });
      // Check the simulation before ever prompting Freighter: a call that
      // is already known to fail should not ask for a signature.
      unwrapResult(tx.result, simulationError(tx));

      const { hash, result } = await signAndSubmit(tx, address, report);
      onCreated(unwrapResult(result));
      return hash;
    });
  }

  if (!address) {
    return (
      <section className="panel create-card">
        <p className="panel-label">open an arena</p>
        <p className="send-hint">Connect your wallet to create a staked arena.</p>
      </section>
    );
  }

  return (
    <section className="panel create-card">
      <p className="panel-label">open an arena</p>
      <form className="send-form" onSubmit={onSubmit}>
        <div className="field">
          <label className="field-label" htmlFor="create-stake">
            stake per player (xlm)
          </label>
          <input
            id="create-stake"
            className="field-input"
            inputMode="decimal"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            disabled={busy}
            autoComplete="off"
          />
          {stake && !stakeValid && <p className="field-error">Stake must be at least 1 XLM.</p>}
        </div>

        <div className="field">
          <span className="field-label">seats</span>
          <div className="seat-picker" role="radiogroup" aria-label="Seats">
            {SEATS.map((n) => (
              <button
                type="button"
                key={n}
                role="radio"
                aria-checked={seats === n}
                className={`seat-opt ${seats === n ? "seat-opt--active" : ""}`}
                onClick={() => setSeats(n)}
                disabled={busy}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <button type="submit" className="btn btn--primary btn--block" disabled={busy || !stakeValid}>
          {busy ? (
            "creating..."
          ) : (
            <>
              <PlusIcon size={14} /> create arena
            </>
          )}
        </button>

        <TxStatus state={state} onRetry={reset} />
      </form>
    </section>
  );
}
