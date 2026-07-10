/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONTRACT_ID?: string;
  readonly VITE_RPC_URL?: string;
  readonly VITE_NETWORK_PASSPHRASE?: string;
  readonly VITE_STELLAR_SECRET?: string;
  readonly VITE_STELLAR_PUBLIC?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
