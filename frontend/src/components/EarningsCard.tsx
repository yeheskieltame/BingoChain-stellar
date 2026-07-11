import { useCallback, useEffect, useRef, useState } from "react";
import { arenaClient, signAndSubmit, simulationError, unwrapResult } from "../lib/contract";
import { subscribeArenaEvents } from "../lib/events";
import { useTx } from "../hooks/useTx";
import { errorMessage, mapError } from "../lib/errors";
import { stroopsToXlm } from "../lib/format";
import { TrophyIcon } from "./Icons";
import TxStatus from "./TxStatus";

interface EarningsCardProps {
  address: string | null;
}

/**
 * Global withdrawable balance for the connected wallet: settlement shares
 * and cancel refunds land here (see the contract's Earnings ledger), pulled
 * out on demand with withdraw. Shown once in the shell so it reads the same
 * on the lobby and inside a room. Stays live off the arena event stream
 * (any settled, paid, or cancel event anywhere can credit this wallet)
 * instead of polling earnings_of on a timer.
 */
export default function EarningsCard({ address }: EarningsCardProps) {
  const [earnings, setEarnings] = useState<bigint | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const tx = useTx();
  const requestId = useRef(0);

  const refresh = useCallback(() => {
    if (!address) {
      setEarnings(null);
      setLoadError(null);
      return;
    }
    const reqId = ++requestId.current;
    arenaClient()
      .earnings_of({ player: address })
      .then((res) => {
        if (reqId !== requestId.current) return;
        setEarnings(res.result);
        setLoadError(null);
      })
      .catch((e: unknown) => {
        if (reqId !== requestId.current) return;
        setLoadError(errorMessage(mapError(e)));
      });
  }, [address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    // No point polling the network while nobody is connected to be credited.
    if (!address) return;
    const unsubscribe = subscribeArenaEvents((event) => {
      if (event.type === "paid" || event.type === "settled" || event.type === "cancel") refresh();
    });
    return unsubscribe;
  }, [address, refresh]);

  if (!address) return null;

  const busy = tx.state.phase === "building" || tx.state.phase === "signing" || tx.state.phase === "submitting";
  const withdrawable = earnings !== null && earnings > 0n;

  function onWithdraw() {
    if (!address || !withdrawable || busy) return;
    void tx.run(async (report) => {
      report("building");
      const client = arenaClient(address);
      const call = await client.withdraw({ account: address });
      unwrapResult(call.result, simulationError(call));

      const { hash, result } = await signAndSubmit(call, address, report);
      unwrapResult(result);
      refresh();
      return hash;
    });
  }

  return (
    <section className="panel earnings-card">
      <div className="earnings-row">
        <div>
          <p className="panel-label">earnings</p>
          {loadError ? (
            <p className="field-error">{loadError}</p>
          ) : (
            <p className="earnings-amount mono">{earnings === null ? "..." : `${stroopsToXlm(earnings)} XLM`}</p>
          )}
        </div>
        <button type="button" className="btn btn--primary" onClick={onWithdraw} disabled={!withdrawable || busy}>
          <TrophyIcon size={14} /> {busy ? "withdrawing..." : "withdraw"}
        </button>
      </div>
      <TxStatus state={tx.state} onRetry={tx.reset} />
    </section>
  );
}
