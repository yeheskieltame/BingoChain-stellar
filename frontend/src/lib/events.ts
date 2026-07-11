// Live gameplay driver: polls the contract's event stream instead of
// re-fetching get_arena on a timer. subscribeArenaEvents decodes the fixed
// topic/data layout the contract publishes (see lib.rs's env.events().publish
// calls) into a typed ArenaEvent and hands each one to the caller as it is
// observed.
//
// Cursor based polling: the first tick starts at the network's latest ledger
// (so a fresh subscriber never replays days of history), every later tick
// continues from the previous response's cursor, kept in this closure. A
// transient RPC failure (timeout, restart) is swallowed and retried on the
// next tick without touching the cursor, so a single flaky poll can neither
// re-deliver nor drop an event.

import { Api, Server } from "@stellar/stellar-sdk/rpc";
import { scValToNative } from "@stellar/stellar-sdk";
import { CONFIG } from "./config";

const POLL_INTERVAL_MS = 4_000;
const PAGE_LIMIT = 100;
// Safety cap on same-tick pages: draining bursts fully (rather than waiting
// out extra 4 s ticks) without ever looping forever on a misbehaving RPC.
const MAX_PAGES_PER_TICK = 20;

const ARENA_EVENT_TYPES = [
  "created",
  "joined",
  "ready",
  "called",
  "claimed",
  "reveal",
  "revealed",
  "settled",
  "paid",
  "cancel",
] as const;

export type ArenaEventType = (typeof ARENA_EVENT_TYPES)[number];

export interface ArenaEvent {
  type: ArenaEventType;
  arenaId: number;
  ledger: number;
  data: unknown;
}

const ARENA_EVENT_TYPE_SET: ReadonlySet<string> = new Set(ARENA_EVENT_TYPES);

/**
 * Decode one RPC event into an ArenaEvent, or null if it is not one of this
 * contract's ("arena", <type>, id) events. The contract also publishes a
 * ("withdraw", account) event with a different topic shape (two topics, an
 * address instead of an arena id); this decoder intentionally does not
 * recognize it, so a withdraw never reaches an arena subscriber. Callers that
 * care about withdrawals read earnings_of instead (see EarningsCard).
 */
function decodeArenaEvent(event: Api.EventResponse): ArenaEvent | null {
  if (event.topic.length < 3) return null;

  const [rawKind, rawType, rawId] = event.topic;
  if (scValToNative(rawKind) !== "arena") return null;

  const type = scValToNative(rawType);
  if (typeof type !== "string" || !ARENA_EVENT_TYPE_SET.has(type)) return null;

  const arenaId = scValToNative(rawId);
  if (typeof arenaId !== "number") return null;

  return {
    type: type as ArenaEventType,
    arenaId,
    ledger: event.ledger,
    data: scValToNative(event.value),
  };
}

/**
 * Subscribe to this contract's arena lifecycle events. Polls getEvents every
 * 4 s and calls onEvent once per decoded event, oldest first. Returns an
 * unsubscribe function; calling it stops the poll loop (an in-flight
 * request is left to finish, but its results are discarded).
 */
export function subscribeArenaEvents(onEvent: (e: ArenaEvent) => void): () => void {
  const server = new Server(CONFIG.rpcUrl);
  const filters: Api.EventFilter[] = [{ type: "contract", contractIds: [CONFIG.contractId] }];

  let cursor: string | null = null;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function fetchPage(): Promise<Api.GetEventsResponse> {
    if (cursor === null) {
      const latest = await server.getLatestLedger();
      return server.getEvents({ filters, startLedger: latest.sequence, limit: PAGE_LIMIT });
    }
    return server.getEvents({ filters, cursor, limit: PAGE_LIMIT });
  }

  async function tick() {
    if (stopped) return;
    try {
      for (let page = 0; page < MAX_PAGES_PER_TICK; page++) {
        const response = await fetchPage();
        if (stopped) return;

        for (const event of response.events) {
          const decoded = decodeArenaEvent(event);
          if (decoded) onEvent(decoded);
        }
        // Advancing the cursor only after a page is fully handled means a
        // throw partway through a page (a malformed single event, say)
        // leaves the cursor at the start of that page, so nothing is lost.
        cursor = response.cursor;

        if (response.events.length < PAGE_LIMIT) break;
      }
    } catch {
      // Transient RPC hiccup: keep whatever cursor we already have and
      // retry on the next tick instead of restarting from latest ledger.
    } finally {
      if (!stopped) timer = setTimeout(tick, POLL_INTERVAL_MS);
    }
  }

  void tick();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
