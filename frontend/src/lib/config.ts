// Stellar network config for BingoChain. Testnet only, read from Vite env
// vars with testnet defaults so a plain checkout still runs.

const DEFAULT_CONTRACT_ID = "CBMENYQVO6SC3AQEKB3EZFII6TSWBFD4IBMF5JXHNZ7TKY6WKKFH2YLA";
const DEFAULT_RPC_URL = "https://soroban-testnet.stellar.org";
const DEFAULT_HORIZON_URL = "https://horizon-testnet.stellar.org";
const DEFAULT_NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

export const CONFIG: {
  contractId: string;
  rpcUrl: string;
  horizonUrl: string;
  networkPassphrase: string;
} = {
  contractId: import.meta.env.VITE_CONTRACT_ID || DEFAULT_CONTRACT_ID,
  rpcUrl: import.meta.env.VITE_RPC_URL || DEFAULT_RPC_URL,
  horizonUrl: import.meta.env.VITE_HORIZON_URL || DEFAULT_HORIZON_URL,
  networkPassphrase: import.meta.env.VITE_NETWORK_PASSPHRASE || DEFAULT_NETWORK_PASSPHRASE,
};
