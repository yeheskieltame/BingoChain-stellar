import { CONFIG } from "./config";

interface HorizonBalanceLine {
  asset_type: string;
  balance: string;
}

interface HorizonAccount {
  balances: HorizonBalanceLine[];
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
