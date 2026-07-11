// Typed error mapping for the three workshop error classes the UI must
// render distinctly: wallet declined, contract rule rejection (with a human
// hint), network failure. Everything else falls back to a plain unknown
// error so nothing throws unhandled.

import { TxSubmitError } from "./tx";
import { WrongNetworkError } from "./wallet";

export type ContractErrorName =
  | "FeeTooHigh"
  | "InvalidPlayerCount"
  | "StakeTooLow"
  | "ArenaNotFound"
  | "WrongState"
  | "AlreadyJoined"
  | "ArenaFull"
  | "NotAPlayer"
  | "NotYourTurn"
  | "NumberOutOfRange"
  | "NumberAlreadyCalled"
  | "CommitMismatch"
  | "AlreadyRevealed"
  | "RevealWindowClosed"
  | "RevealWindowOpen"
  | "InvalidBoard"
  | "NothingToWithdraw"
  | "CancelNotAllowed";

interface ContractErrorEntry {
  name: ContractErrorName;
  hint: string;
}

// Exact table from the contract's Error enum. Codes are part of the ABI:
// never renumber an existing entry. Hints are short and human, shown next
// to the rule name so a rejected call reads as a reason, not a stack trace.
const CONTRACT_ERRORS: Record<number, ContractErrorEntry> = {
  1: { name: "FeeTooHigh", hint: "Protocol fee exceeds the contract's cap." },
  2: { name: "InvalidPlayerCount", hint: "Choose a player count between 2 and 6." },
  3: { name: "StakeTooLow", hint: "Stake must be at least 1 XLM." },
  4: { name: "ArenaNotFound", hint: "That arena does not exist." },
  5: { name: "WrongState", hint: "That action does not apply to the arena's current state." },
  6: { name: "AlreadyJoined", hint: "You already joined this arena." },
  7: { name: "ArenaFull", hint: "This arena already has all its seats filled." },
  8: { name: "NotAPlayer", hint: "You have not joined this arena." },
  9: { name: "NotYourTurn", hint: "Wait for your turn to call a number." },
  10: { name: "NumberOutOfRange", hint: "Numbers must be between 1 and 25." },
  11: { name: "NumberAlreadyCalled", hint: "That number was already called." },
  12: { name: "CommitMismatch", hint: "Your board does not match your sealed commitment." },
  13: { name: "AlreadyRevealed", hint: "You already revealed your board." },
  14: { name: "RevealWindowClosed", hint: "The reveal window has closed." },
  15: { name: "RevealWindowOpen", hint: "Wait for the reveal window to close first." },
  16: { name: "InvalidBoard", hint: "Board must contain 1 to 25, each exactly once." },
  17: { name: "NothingToWithdraw", hint: "You have no withdrawable earnings." },
  18: { name: "CancelNotAllowed", hint: "This arena cannot be cancelled right now." },
};

const NAME_TO_CODE: Record<string, number> = Object.fromEntries(
  Object.entries(CONTRACT_ERRORS).map(([code, entry]) => [entry.name, Number(code)])
);

export type AppError =
  | { kind: "wallet-declined" }
  | { kind: "wrong-network" }
  | { kind: "contract"; code: number; name: string; hint: string }
  | { kind: "network"; detail: string }
  | { kind: "unknown"; detail: string };

// Soroban RPC reports a trapped contract call as "Error(Contract, #N)"
// somewhere in the simulation or transaction result string.
const CONTRACT_CODE_RE = /Error\(Contract,\s*#(\d+)\)/;
// Freighter decline wording only: "User declined access", "Freighter
// declined to sign...", "The user rejected this request", denied, cancel.
// Deliberately NOT a bare "reject": Horizon submit failures say "Horizon
// rejected the transaction" and must never render as a wallet decline.
const DECLINE_RE = /declin|denied|user reject|user cancel/i;
const NETWORK_RE =
  /network|fetch|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|getaddrinfo|timed? ?out|load failed/i;

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  // Non-Error object throws (Freighter api results, axios-like errors)
  // often carry a message property; prefer it over "[object Object]".
  if (e && typeof e === "object" && "message" in e && typeof e.message === "string") {
    return e.message;
  }
  return String(e);
}

/**
 * Map anything thrown by a wallet call or a contract call to a typed
 * AppError. Order matters: wrong network, Horizon submit rejections, and
 * wallet decline are checked before the generic regexes, since each can
 * otherwise look like a different class.
 */
export function mapError(e: unknown): AppError {
  if (e instanceof WrongNetworkError) return { kind: "wrong-network" };

  // A Horizon rejection of a submitted classic transaction is not a wallet
  // decline, whatever its message says. Classified unknown on purpose:
  // useTx falls back to mapTxError for these, which knows the Horizon
  // result codes (op_underfunded and friends).
  if (e instanceof TxSubmitError) return { kind: "unknown", detail: messageOf(e) };

  const message = messageOf(e);

  const byCode = message.match(CONTRACT_CODE_RE);
  if (byCode) {
    const code = Number(byCode[1]);
    const entry = CONTRACT_ERRORS[code];
    return entry
      ? { kind: "contract", code, name: entry.name, hint: entry.hint }
      : { kind: "contract", code, name: "Unknown", hint: "The contract rejected this call." };
  }

  // Some paths carry the bare contracterror name instead of the numeric
  // "Error(Contract, #N)" form, e.g. a Result::Err({ message: "StakeTooLow" }).
  for (const name of Object.keys(NAME_TO_CODE)) {
    if (message.includes(name)) {
      const code = NAME_TO_CODE[name];
      return { kind: "contract", code, name, hint: CONTRACT_ERRORS[code].hint };
    }
  }

  if (DECLINE_RE.test(message)) return { kind: "wallet-declined" };

  if (e instanceof TypeError || NETWORK_RE.test(message)) {
    return { kind: "network", detail: message };
  }

  return { kind: "unknown", detail: message };
}

/** One human sentence for any AppError, safe to render directly in the UI. */
export function errorMessage(e: AppError): string {
  switch (e.kind) {
    case "wallet-declined":
      return "You declined the request in Freighter.";
    case "wrong-network":
      return "Freighter is on the wrong network. Switch to Stellar testnet and try again.";
    case "contract":
      return `${e.name}: ${e.hint}`;
    case "network":
      return `Network error. ${e.detail}`;
    case "unknown":
      return e.detail || "Something went wrong. Try again.";
  }
}
