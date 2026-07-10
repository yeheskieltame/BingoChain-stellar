import { useCallback, useEffect, useRef, useState } from "react";
import { fetchXlmBalance } from "../lib/horizon";

export interface UseBalanceResult {
  balance: string | null;
  loading: boolean;
  /** True when the last fetch failed outright (network error, bad Horizon
   * response). False for the unfunded case, where fetchXlmBalance resolves
   * to null instead of throwing. */
  error: boolean;
  refresh(): void;
}

const POLL_MS = 30_000;

export function useBalance(address: string | null): UseBalanceResult {
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const requestId = useRef(0);

  const load = useCallback((addr: string) => {
    const id = ++requestId.current;
    setLoading(true);
    fetchXlmBalance(addr)
      .then((bal) => {
        if (id === requestId.current) {
          setBalance(bal);
          setError(false);
        }
      })
      .catch((err: unknown) => {
        if (id === requestId.current) {
          setBalance(null);
          setError(true);
          console.error("Failed to fetch XLM balance:", err);
        }
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, []);

  const refresh = useCallback(() => {
    if (address) load(address);
  }, [address, load]);

  useEffect(() => {
    if (!address) {
      setBalance(null);
      setError(false);
      return;
    }

    load(address);

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load(address);
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [address, load]);

  return { balance, loading, error, refresh };
}
