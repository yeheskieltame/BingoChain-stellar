// Transaction state machine shared by every flow that submits a transaction,
// classic payments now, Soroban contract calls later. Each useTx run passes
// its transport a scoped ReportPhase callback, so concurrent consumers
// (lobby, game room, withdraw card) cannot cross wires.

export type TxState =
  | { phase: "idle" }
  | { phase: "building" }
  | { phase: "signing" }
  | { phase: "submitting" }
  | { phase: "success"; hash: string }
  | { phase: "error"; message: string };

export type TxPhase = "building" | "signing" | "submitting";

/**
 * Per-run progress callback. useTx hands one to the transport function
 * (sendXlm, later Soroban invokes) so it can advance the UI from building
 * to signing to submitting. Scoped to a single run; never shared.
 */
export type ReportPhase = (phase: TxPhase) => void;

/**
 * Thrown when Horizon rejects a submitted transaction. Carries the result
 * codes from the problem response so the UI can explain what went wrong.
 */
export class TxSubmitError extends Error {
  txCode: string | null;
  opCodes: string[];

  constructor(txCode: string | null, opCodes: string[]) {
    super(
      `Horizon rejected the transaction (${[txCode, ...opCodes].filter(Boolean).join(", ") || "no result codes"}).`
    );
    this.name = "TxSubmitError";
    this.txCode = txCode;
    this.opCodes = opCodes;
  }
}

const OP_CODE_MESSAGES: Record<string, string> = {
  op_underfunded: "Your balance is too low to cover that amount plus the network fee.",
  op_no_destination: "The destination account does not exist on testnet. Fund it with friendbot first.",
};

const TX_CODE_MESSAGES: Record<string, string> = {
  tx_bad_seq: "Your account sequence number was out of date. Try again.",
  tx_too_late: "The transaction expired before it reached the ledger. Try again.",
  tx_insufficient_fee: "The network is congested and the fee was too low. Try again.",
};

/** Map any error thrown during a transaction run to one human sentence. */
export function mapTxError(err: unknown): string {
  if (err instanceof TxSubmitError) {
    for (const code of err.opCodes) {
      const msg = OP_CODE_MESSAGES[code];
      if (msg) return msg;
    }
    if (err.txCode) {
      const msg = TX_CODE_MESSAGES[err.txCode];
      if (msg) return msg;
    }
    return err.message;
  }
  // fetch throws TypeError when the request never reaches the server.
  if (err instanceof TypeError) {
    return "Network error. Check your connection and try again.";
  }
  if (err instanceof Error) {
    if (/declin|reject|denied/i.test(err.message)) {
      return "You declined the request in Freighter.";
    }
    return err.message;
  }
  return "Something went wrong. Try again.";
}
