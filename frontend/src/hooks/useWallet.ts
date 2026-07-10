import { useCallback, useEffect, useState } from "react";
import { connectWallet, disconnectWallet, getConnectedAddress } from "../lib/wallet";

export interface UseWalletResult {
  address: string | null;
  connecting: boolean;
  connect(): void;
  disconnect(): void;
  error: string | null;
}

export function useWallet(): UseWalletResult {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Silent reconnect: if the user connected before on this device, pick the
  // wallet back up without prompting Freighter again.
  useEffect(() => {
    let cancelled = false;
    getConnectedAddress().then((addr) => {
      if (!cancelled && addr) setAddress(addr);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(() => {
    setConnecting(true);
    setError(null);
    connectWallet()
      .then(({ address: addr }) => setAddress(addr))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setConnecting(false));
  }, []);

  const disconnect = useCallback(() => {
    disconnectWallet().then(() => {
      setAddress(null);
      setError(null);
    });
  }, []);

  return { address, connecting, connect, disconnect, error };
}
