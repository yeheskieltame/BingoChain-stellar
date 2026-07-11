// Stellar network config for BingoChain. Testnet only, read from Vite env
// vars with testnet defaults so a plain checkout still runs. The contract id
// and passphrase defaults come from the generated bindings package, so a
// redeploy plus bindings regeneration updates them automatically.

import { networks } from "bingo-client";

const DEFAULT_RPC_URL = "https://soroban-testnet.stellar.org";
const DEFAULT_HORIZON_URL = "https://horizon-testnet.stellar.org";

export const CONFIG: {
  contractId: string;
  rpcUrl: string;
  horizonUrl: string;
  networkPassphrase: string;
} = {
  contractId: import.meta.env.VITE_CONTRACT_ID || networks.testnet.contractId,
  rpcUrl: import.meta.env.VITE_RPC_URL || DEFAULT_RPC_URL,
  horizonUrl: import.meta.env.VITE_HORIZON_URL || DEFAULT_HORIZON_URL,
  networkPassphrase: import.meta.env.VITE_NETWORK_PASSPHRASE || networks.testnet.networkPassphrase,
};
