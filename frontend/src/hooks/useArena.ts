import { useCallback, useEffect, useRef, useState } from "react";
import type { Arena } from "bingo-client";
import { readArena } from "../lib/contract";
import { CONFIG } from "../lib/config";
import { loadReveal } from "../lib/commit";
import { mapError, type AppError } from "../lib/errors";
import { subscribeArenaEvents } from "../lib/events";

export interface UseArenaResult {
  arena: Arena | null;
  loading: boolean;
  error: AppError | null;
  myReveal: { board: number[]; salt: Uint8Array } | null;
  refresh(): void;
}

/**
 * Loads a single arena and keeps it live from the contract's event stream:
 * any ("arena", *, id) event for this id triggers a refetch, so the room
 * never has to poll get_arena on a timer of its own. A manual refresh() is
 * exposed too, for a caller that wants to reflect its own just-sent
 * transaction before the next event tick lands.
 *
 * myReveal reads back the board and salt this device saved for `address`
 * when it committed to this arena (see lib/commit.ts). It is null before a
 * wallet is connected and whenever this device never saved a record for
 * this arena/address pair, most commonly because the board was committed
 * from a different device. The brief's stated signature is `useArena(id)`;
 * address is added here since myReveal cannot be computed without it, the
 * same way useBalance(address) takes it as a plain parameter elsewhere in
 * this codebase rather than reading the wallet hook internally.
 */
export function useArena(id: number, address: string | null): UseArenaResult {
  const [arena, setArena] = useState<Arena | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(() => {
    const reqId = ++requestId.current;
    setLoading(true);
    readArena(id)
      .then((a) => {
        if (reqId !== requestId.current) return;
        setArena(a);
        setError(null);
      })
      .catch((e: unknown) => {
        if (reqId !== requestId.current) return;
        setError(mapError(e));
      })
      .finally(() => {
        if (reqId === requestId.current) setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const unsubscribe = subscribeArenaEvents((event) => {
      if (event.arenaId === id) refresh();
    });
    return unsubscribe;
  }, [id, refresh]);

  const myReveal = address ? loadReveal(CONFIG.contractId, id, address) : null;

  return { arena, loading, error, myReveal, refresh };
}
