// Wraps the generated bingo-client bindings with CONFIG and Freighter
// signing. Reads simulate through client.method() directly; writes go
// through signAndSubmit so callers (routed through useTx) get building,
// signing, submitting phases and a final transaction hash.

import { Client, type Arena } from "bingo-client";
import type { AssembledTransaction, Result } from "@stellar/stellar-sdk/contract";
import { Api } from "@stellar/stellar-sdk/rpc";
import { CONFIG } from "./config";
import { signTx } from "./wallet";
import type { ReportPhase } from "./tx";
import { mapError } from "./errors";

/**
 * Build a client bound to the deployed arena contract. Pass the connected
 * wallet address to enable writes (create_arena, commit_board, ...); omit
 * it for read-only calls like readArena/listArenas.
 */
export function arenaClient(publicKey?: string): Client {
  return new Client({
    contractId: CONFIG.contractId,
    networkPassphrase: CONFIG.networkPassphrase,
    rpcUrl: CONFIG.rpcUrl,
    publicKey,
    signTransaction: publicKey
      ? async (xdr, opts) => {
          const signedTxXdr = await signTx(xdr, opts?.address ?? publicKey);
          return { signedTxXdr };
        }
      : undefined,
  });
}

/**
 * Sign and submit an already-simulated write call. Reports "signing" while
 * Freighter prompts, then "submitting" while the network confirms. Returns
 * the transaction hash plus the contract's parsed return value.
 */
export async function signAndSubmit<T>(
  tx: AssembledTransaction<T>,
  address: string,
  report?: ReportPhase
): Promise<{ hash: string; result: T }> {
  report?.("signing");
  await tx.sign({
    signTransaction: async (xdrStr, opts) => {
      const signedTxXdr = await signTx(xdrStr, opts?.address ?? address);
      return { signedTxXdr };
    },
  });

  report?.("submitting");
  const sent = await tx.send();

  const hash = sent.sendTransactionResponse?.hash;
  if (!hash) throw new Error("The network did not return a transaction hash.");

  return { hash, result: sent.result };
}

/**
 * The raw diagnostic string from a failed simulation, e.g.
 * "HostError: Error(Contract, #3)\n\nEvent log...". undefined when the
 * simulation succeeded (or hasn't run).
 */
export function simulationError(tx: { simulation?: Api.SimulateTransactionResponse }): string | undefined {
  return tx.simulation && Api.isSimulationError(tx.simulation) ? tx.simulation.error : undefined;
}

/**
 * Unwrap a contract call's Result, throwing a mapper-friendly Error if it
 * is Err. Prefers the raw simulation diagnostic (which carries the
 * "Error(Contract, #N)" text mapError looks for) over the Result's own
 * message: this contract's Error enum has no per-variant Rust doc comment,
 * and the SDK derives Result::Err.message from that doc comment, so it is
 * always empty here regardless of which rule actually failed.
 */
export function unwrapResult<T>(result: Result<T>, diagnostic?: string): T {
  if (result.isErr()) {
    throw new Error(diagnostic || result.unwrapErr().message || "The contract rejected this call.");
  }
  return result.unwrap();
}

/** Read a single arena, or null if it does not exist (ArenaNotFound). */
export async function readArena(id: number): Promise<Arena | null> {
  const client = arenaClient();
  try {
    const tx = await client.get_arena({ arena_id: id });
    return unwrapResult(tx.result, simulationError(tx));
  } catch (e) {
    const mapped = mapError(e);
    if (mapped.kind === "contract" && mapped.name === "ArenaNotFound") return null;
    throw e;
  }
}

/** All arenas ever created, newest first. arena_count() then a batched get_arena. */
export async function listArenas(): Promise<Arena[]> {
  const client = arenaClient();
  const countTx = await client.arena_count();
  const count = countTx.result;
  if (count === 0) return [];

  const ids = Array.from({ length: count }, (_, i) => count - i);
  const arenas = await Promise.all(ids.map((id) => readArena(id)));
  return arenas.filter((a): a is Arena => a !== null);
}
