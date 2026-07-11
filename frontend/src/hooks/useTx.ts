import { useCallback, useEffect, useRef, useState } from "react";
import { mapTxError, type ReportPhase, type TxState } from "../lib/tx";

export interface UseTxResult {
  state: TxState;
  /**
   * Run a transaction. fn resolves to the tx hash; any throw becomes an
   * error state. fn receives a scoped report callback to advance the phase
   * (transports that never report simply stay in "building" until settled).
   * A second call while a run is in flight is rejected and returns early.
   */
  run(fn: (report: ReportPhase) => Promise<string>): Promise<void>;
  reset(): void;
}

/**
 * Drives TxState through building, signing, submitting, then success or
 * error. Transport-agnostic: fn can be a classic payment or a Soroban
 * contract call, as long as it resolves to a transaction hash. Each run
 * gets its own report callback, so multiple useTx instances (lobby, game
 * room, withdraw card) can operate concurrently without crosstalk.
 */
export function useTx(): UseTxResult {
  const [state, setState] = useState<TxState>({ phase: "idle" });
  const mounted = useRef(true);
  const inFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (fn: (report: ReportPhase) => Promise<string>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState({ phase: "building" });

    // Scoped to this run: ignored once settled, so a transport holding a
    // stale reference cannot disturb a later run's state.
    let settled = false;
    const report: ReportPhase = (phase) => {
      if (!settled && mounted.current) setState({ phase });
    };

    try {
      const hash = await fn(report);
      if (mounted.current) setState({ phase: "success", hash });
    } catch (err) {
      if (mounted.current) setState({ phase: "error", message: mapTxError(err) });
    } finally {
      settled = true;
      inFlight.current = false;
    }
  }, []);

  const reset = useCallback(() => {
    if (inFlight.current) return;
    setState({ phase: "idle" });
  }, []);

  return { state, run, reset };
}
