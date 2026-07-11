import type { TxState } from "../lib/tx";
import { AlertIcon, CheckIcon, LinkIcon, Spinner, WalletIcon } from "./Icons";

const PHASE_LABELS: Record<"building" | "signing" | "submitting", string> = {
  building: "Building the transaction",
  signing: "Waiting for your signature in Freighter",
  submitting: "Submitting to the network",
};

// The three workshop error classes render with distinct styling and copy so
// a rejected signature never looks like a broken network, and a contract
// rule never looks like a bug.
const ERROR_STYLE: Record<string, { cls: string; label: string; icon: "wallet" | "alert" }> = {
  "wallet-declined": { cls: "tx-status--declined", label: "Signature declined", icon: "wallet" },
  "wrong-network": { cls: "tx-status--declined", label: "Wrong network", icon: "wallet" },
  contract: { cls: "tx-status--contract", label: "Rejected by the contract", icon: "alert" },
  network: { cls: "tx-status--network", label: "Network failure", icon: "alert" },
};

function shortHash(hash: string): string {
  return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
}

interface TxStatusProps {
  state: TxState;
  /** Invoked from the error state so the user can adjust and resubmit. */
  onRetry(): void;
}

export default function TxStatus({ state, onRetry }: TxStatusProps) {
  if (state.phase === "idle") return null;

  if (state.phase === "success") {
    return (
      <div className="tx-status tx-status--success" role="status">
        <CheckIcon size={15} />
        <div>
          <p className="tx-status-msg">Payment confirmed on testnet.</p>
          <a
            className="tx-status-link"
            href={`https://stellar.expert/explorer/testnet/tx/${state.hash}`}
            target="_blank"
            rel="noreferrer"
          >
            {shortHash(state.hash)} <LinkIcon size={12} />
          </a>
        </div>
      </div>
    );
  }

  if (state.phase === "error") {
    const style = state.kind ? ERROR_STYLE[state.kind] : undefined;
    return (
      <div className={`tx-status tx-status--error ${style?.cls ?? ""}`} role="alert">
        {style?.icon === "wallet" ? <WalletIcon size={15} /> : <AlertIcon size={15} />}
        <div>
          {style && <p className="tx-status-label">{style.label}</p>}
          <p className="tx-status-msg">{state.message}</p>
          <button type="button" className="chip chip--ghost tx-retry" onClick={onRetry}>
            try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tx-status" role="status">
      <Spinner size={15} />
      <p className="tx-status-msg">{PHASE_LABELS[state.phase]}</p>
    </div>
  );
}
