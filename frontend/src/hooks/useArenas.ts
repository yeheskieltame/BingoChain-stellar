import { useCallback, useEffect, useRef, useState } from "react";
import type { Arena } from "bingo-client";
import { listArenas } from "../lib/contract";
import { errorMessage, mapError } from "../lib/errors";

export interface UseArenasResult {
  arenas: Arena[];
  loading: boolean;
  error: string | null;
  refresh(): void;
}

/** Loads every arena (arena_count then a batched get_arena) and lets the UI refresh on demand. */
export function useArenas(): UseArenasResult {
  const [arenas, setArenas] = useState<Arena[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(() => {
    const id = ++requestId.current;
    setLoading(true);
    listArenas()
      .then((list) => {
        if (id === requestId.current) {
          setArenas(list);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (id === requestId.current) setError(errorMessage(mapError(err)));
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { arenas, loading, error, refresh: load };
}
