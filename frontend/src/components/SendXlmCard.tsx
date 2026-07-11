import { useEffect, useState, type FormEvent } from "react";
import { StrKey } from "@stellar/stellar-sdk";
import { useTx } from "../hooks/useTx";
import { sendXlm } from "../lib/horizon";
import { signTx } from "../lib/wallet";
import TxStatus from "./TxStatus";

const AMOUNT_RE = /^\d+(\.\d{1,7})?$/;

interface SendXlmCardProps {
  address: string | null;
  /** Called after a confirmed payment so the header balance refreshes. */
  onSuccess(): void;
}

export default function SendXlmCard({ address, onSuccess }: SendXlmCardProps) {
  const { state, run, reset } = useTx();
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [touched, setTouched] = useState({ destination: false, amount: false });

  const busy =
    state.phase === "building" || state.phase === "signing" || state.phase === "submitting";

  const destValid = StrKey.isValidEd25519PublicKey(destination.trim());
  const amountValid = AMOUNT_RE.test(amount) && Number(amount) > 0;

  const destError =
    touched.destination && destination && !destValid
      ? "Enter a valid Stellar address (starts with G)."
      : null;
  const amountError =
    touched.amount && amount && !amountValid
      ? "Enter a positive amount with at most 7 decimal places."
      : null;

  useEffect(() => {
    if (state.phase === "success") onSuccess();
  }, [state, onSuccess]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!address || !destValid || !amountValid || busy) return;
    void run((report) =>
      sendXlm(address, destination.trim(), amount, (xdr) => signTx(xdr, address), report)
    );
  }

  if (!address) {
    return (
      <section className="panel send-card">
        <p className="panel-label">send xlm</p>
        <p className="send-hint">Connect your wallet to send XLM on testnet.</p>
      </section>
    );
  }

  return (
    <section className="panel send-card">
      <p className="panel-label">send xlm</p>
      <form className="send-form" onSubmit={onSubmit}>
        <div className="field">
          <label className="field-label" htmlFor="send-destination">
            destination
          </label>
          <input
            id="send-destination"
            className="field-input"
            placeholder="G..."
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, destination: true }))}
            disabled={busy}
            autoComplete="off"
            spellCheck={false}
          />
          {destError && <p className="field-error">{destError}</p>}
        </div>

        <div className="field">
          <label className="field-label" htmlFor="send-amount">
            amount (xlm)
          </label>
          <input
            id="send-amount"
            className="field-input"
            placeholder="1"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, amount: true }))}
            disabled={busy}
            autoComplete="off"
          />
          {amountError && <p className="field-error">{amountError}</p>}
        </div>

        <button
          type="submit"
          className="btn btn--primary btn--block"
          disabled={busy || !destValid || !amountValid}
        >
          {busy ? "sending" : "send payment"}
        </button>

        <TxStatus state={state} onRetry={reset} />
      </form>
    </section>
  );
}
