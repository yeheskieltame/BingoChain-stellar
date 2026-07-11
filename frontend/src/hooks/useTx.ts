import { useCallback, useEffect, useRef, useState } from "react";
import { mapTxError, onTxPhase, type TxState } from "../lib/tx";

export interface UseTxResult {
  state: TxState;
  /** Run a transaction. fn resolves to the tx hash; any throw becomes an error state. */
  run(fn: () => Promise<string>): Promise<void>;
  reset(): void;
}

/**
 * Drives TxState through building, signing, submitting, then success or
 * error. Transport-agnostic: fn can be a classic payment or a Soroban
 * contract call, as long as it resolves to a transaction hash and reports
 * progress via reportTxPhase.
 */
export function useTx(): UseTxResult {
  const [state, setState] = useState<TxState>({ phase: "idle" });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (fn: () => Promise<string>) => {
    setState({ phase: "building" });
    const off = onTxPhase((phase) => {
      if (mounted.current) setState({ phase });
    });
    try {
      const hash = await fn();
      if (mounted.current) setState({ phase: "success", hash });
    } catch (err) {
      if (mounted.current) setState({ phase: "error", message: mapTxError(err) });
    } finally {
      off();
    }
  }, []);

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  return { state, run, reset };
}
