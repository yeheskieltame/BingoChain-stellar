import type { TxState } from "../lib/tx";
import { AlertIcon, CheckIcon, LinkIcon, Spinner } from "./Icons";

const PHASE_LABELS: Record<"building" | "signing" | "submitting", string> = {
  building: "Building the transaction",
  signing: "Waiting for your signature in Freighter",
  submitting: "Submitting to the network",
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
    return (
      <div className="tx-status tx-status--error" role="alert">
        <AlertIcon size={15} />
        <div>
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
