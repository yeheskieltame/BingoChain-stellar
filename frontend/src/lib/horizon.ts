import { Account, Asset, BASE_FEE, Operation, StrKey, TransactionBuilder } from "@stellar/stellar-sdk";
import { CONFIG } from "./config";
import { reportTxPhase, TxSubmitError } from "./tx";

interface HorizonBalanceLine {
  asset_type: string;
  balance: string;
}

interface HorizonAccount {
  sequence: string;
  balances: HorizonBalanceLine[];
}

interface HorizonProblem {
  extras?: {
    result_codes?: {
      transaction?: string;
      operations?: string[];
    };
  };
}

/**
 * Fetch the native XLM balance for an address from Horizon, e.g. "123.4567890".
 * Returns null when the account is unfunded (Horizon 404s an account that has
 * never received XLM) or has no native balance line.
 */
export async function fetchXlmBalance(address: string): Promise<string | null> {
  const res = await fetch(`${CONFIG.horizonUrl}/accounts/${address}`);

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Horizon returned ${res.status} while fetching the balance.`);
  }

  const account = (await res.json()) as HorizonAccount;
  const native = account.balances.find((b) => b.asset_type === "native");
  return native ? native.balance : null;
}

/** Up to 7 decimal places, the Stellar amount precision. */
const AMOUNT_RE = /^\d+(\.\d{1,7})?$/;

/**
 * Send a classic native-XLM payment on testnet. Builds the transaction from
 * the sender's current sequence number, hands the envelope XDR to the sign
 * callback (Freighter in the app), submits the signed XDR to Horizon, and
 * returns the transaction hash.
 */
export async function sendXlm(
  from: string,
  to: string,
  amount: string,
  sign: (xdr: string) => Promise<string>
): Promise<string> {
  if (!StrKey.isValidEd25519PublicKey(to)) {
    throw new Error("The destination is not a valid Stellar address.");
  }
  if (!AMOUNT_RE.test(amount) || Number(amount) <= 0) {
    throw new Error("The amount must be a positive number with at most 7 decimal places.");
  }

  reportTxPhase("building");

  const accountRes = await fetch(`${CONFIG.horizonUrl}/accounts/${from}`);
  if (accountRes.status === 404) {
    throw new Error("Your account is unfunded. Get testnet XLM from friendbot first.");
  }
  if (!accountRes.ok) {
    throw new Error(`Horizon returned ${accountRes.status} while loading your account.`);
  }
  const { sequence } = (await accountRes.json()) as HorizonAccount;

  const tx = new TransactionBuilder(new Account(from, sequence), {
    fee: BASE_FEE,
    networkPassphrase: CONFIG.networkPassphrase,
  })
    .addOperation(Operation.payment({ destination: to, asset: Asset.native(), amount }))
    .setTimeout(60)
    .build();

  reportTxPhase("signing");
  const signedXdr = await sign(tx.toXDR());

  reportTxPhase("submitting");
  const submitRes = await fetch(`${CONFIG.horizonUrl}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ tx: signedXdr }),
  });

  if (!submitRes.ok) {
    let problem: HorizonProblem = {};
    try {
      problem = (await submitRes.json()) as HorizonProblem;
    } catch {
      // Non-JSON body (gateway timeout page etc.); fall through with no codes.
    }
    const codes = problem.extras?.result_codes;
    throw new TxSubmitError(codes?.transaction ?? null, codes?.operations ?? []);
  }

  const { hash } = (await submitRes.json()) as { hash: string };
  return hash;
}
