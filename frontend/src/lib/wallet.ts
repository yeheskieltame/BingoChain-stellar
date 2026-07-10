import {
  getAddress,
  getNetworkDetails,
  isConnected,
  requestAccess,
  signTransaction,
} from "@stellar/freighter-api";
import { CONFIG } from "./config";

// Flag in localStorage: "the user asked to stay connected on this device."
// Used to silently reconnect on page load, see getConnectedAddress below.
const STORAGE_KEY = "app:wallet";

export class WrongNetworkError extends Error {
  constructor(actualPassphrase: string) {
    super(
      `Freighter is set to "${actualPassphrase || "an unknown network"}". ` +
        `Switch Freighter to Testnet and try again.`
    );
    this.name = "WrongNetworkError";
  }
}

/** Throws WrongNetworkError if Freighter's active network is not our testnet. */
export async function assertTestnet(): Promise<void> {
  const details = await getNetworkDetails();
  if (details.error) {
    throw new Error(details.error.message || "Could not read the network from Freighter.");
  }
  if (details.networkPassphrase !== CONFIG.networkPassphrase) {
    throw new WrongNetworkError(details.networkPassphrase);
  }
}

/** Request account access from Freighter and confirm it is on testnet. */
export async function connectWallet(): Promise<{ address: string }> {
  const connected = await isConnected();
  if (connected.error || !connected.isConnected) {
    throw new Error("Freighter is not installed. Get it at https://freighter.app.");
  }

  const access = await requestAccess();
  if (access.error) {
    throw new Error(access.error.message || "Freighter access request was rejected.");
  }

  await assertTestnet();

  localStorage.setItem(STORAGE_KEY, "1");
  return { address: access.address };
}

/**
 * Clear the local "stay connected" flag so the app stops auto-reconnecting on
 * load. Freighter has no programmatic revoke or disconnect call: the site
 * stays allowed inside the extension until the user removes it from
 * Freighter's own settings.
 */
export async function disconnectWallet(): Promise<void> {
  localStorage.removeItem(STORAGE_KEY);
}

/** Silently look up an already-granted connection, used to reconnect on load. */
export async function getConnectedAddress(): Promise<string | null> {
  if (localStorage.getItem(STORAGE_KEY) !== "1") return null;

  const connected = await isConnected();
  if (connected.error || !connected.isConnected) return null;

  const res = await getAddress();
  if (res.error || !res.address) return null;

  return res.address;
}

/** Ask Freighter to sign a transaction envelope XDR. Returns the signed XDR. */
export async function signTx(xdr: string, address: string): Promise<string> {
  const res = await signTransaction(xdr, {
    networkPassphrase: CONFIG.networkPassphrase,
    address,
  });
  if (res.error) {
    throw new Error(res.error.message || "Freighter declined to sign the transaction.");
  }
  return res.signedTxXdr;
}
