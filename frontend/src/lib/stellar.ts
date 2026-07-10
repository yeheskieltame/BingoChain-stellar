import { Keypair } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import { Client, networks, type Game, type Player, type Status } from "./bingoClient";

export const CONTRACT_ID =
  (import.meta.env.VITE_CONTRACT_ID as string) || networks.testnet.contractId;
export const RPC_URL =
  (import.meta.env.VITE_RPC_URL as string) || "https://soroban-testnet.stellar.org";
export const NETWORK_PASSPHRASE =
  (import.meta.env.VITE_NETWORK_PASSPHRASE as string) ||
  networks.testnet.networkPassphrase;
export const NETWORK_LABEL = "Testnet";
export const EXPLORER_BASE = "https://stellar.expert/explorer/testnet";

export type SignerKind = "dev" | "freighter";

export interface Signer {
  publicKey: string;
  kind: SignerKind;
  signTransaction: (
    xdr: string,
    opts?: unknown
  ) => Promise<{ signedTxXdr: string; signerAddress?: string }>;
}

/** A read-only account used purely as the source for read simulations. */
const READ_ONLY_PUBLIC =
  (import.meta.env.VITE_STELLAR_PUBLIC as string) ||
  "GABNO2DQP232FHOSHC6NWEI5BP5FE2E75FO6EX4SBPYIB2ABFDDZB7GH";

/**
 * Build a signer from the dev testnet secret in the environment.
 * For local workshop/dev use only — never ship a secret to production.
 */
export function devSigner(): Signer | null {
  const secret = import.meta.env.VITE_STELLAR_SECRET as string | undefined;
  if (!secret) return null;
  try {
    const kp = Keypair.fromSecret(secret.trim());
    const { signTransaction } = basicNodeSigner(kp, NETWORK_PASSPHRASE);
    return {
      publicKey: kp.publicKey(),
      kind: "dev",
      signTransaction: signTransaction as Signer["signTransaction"],
    };
  } catch (err) {
    console.error("Invalid VITE_STELLAR_SECRET", err);
    return null;
  }
}

/** Build a signer backed by the Freighter browser extension (loaded on demand). */
export async function freighterSigner(): Promise<Signer> {
  const fre = await import("@stellar/freighter-api");

  const connected = await fre.isConnected();
  if (!("isConnected" in connected) || !connected.isConnected) {
    throw new Error("Freighter is not installed in this browser.");
  }

  const access = await fre.requestAccess();
  if ("error" in access && access.error) throw new Error(String(access.error));
  const address = (access as { address: string }).address;

  return {
    publicKey: address,
    kind: "freighter",
    signTransaction: async (xdr: string) => {
      const res = await fre.signTransaction(xdr, {
        networkPassphrase: NETWORK_PASSPHRASE,
        address,
      });
      if ("error" in res && res.error) throw new Error(String(res.error));
      return {
        signedTxXdr: (res as { signedTxXdr: string }).signedTxXdr,
        signerAddress: address,
      };
    },
  };
}

/** Create a contract client bound to the active signer (or read-only). */
export function makeClient(signer: Signer | null): Client {
  return new Client({
    contractId: CONTRACT_ID,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
    publicKey: signer?.publicKey ?? READ_ONLY_PUBLIC,
    signTransaction: signer?.signTransaction,
    allowHttp: RPC_URL.startsWith("http://"),
  });
}

export function truncate(addr: string, head = 4, tail = 4): string {
  if (!addr) return "";
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

// --------------------------- bingo domain helpers ---------------------------

export const COLS = ["B", "I", "N", "G", "O"] as const;

/** The B-I-N-G-O column letter for a drawn number (1..75). */
export function ballColumn(n: number): string {
  if (n < 1 || n > 75) return "";
  return COLS[Math.floor((n - 1) / 15)];
}

export function statusTag(s: Status): "Open" | "Playing" | "Finished" {
  return s.tag;
}

/** Has this card completed any row, column, or diagonal given the drawn set? */
export function cardHasBingo(card: number[], drawn: Set<number>): boolean {
  const marked = (i: number) => card[i] === 0 || drawn.has(card[i]);
  for (let r = 0; r < 5; r++) {
    let all = true;
    for (let c = 0; c < 5; c++) if (!marked(r * 5 + c)) all = false;
    if (all) return true;
  }
  for (let c = 0; c < 5; c++) {
    let all = true;
    for (let r = 0; r < 5; r++) if (!marked(r * 5 + c)) all = false;
    if (all) return true;
  }
  let d1 = true;
  for (let i = 0; i < 5; i++) if (!marked(i * 5 + i)) d1 = false;
  if (d1) return true;
  let d2 = true;
  for (let i = 0; i < 5; i++) if (!marked(i * 5 + (4 - i))) d2 = false;
  return d2;
}

export type { Game, Player, Status };
