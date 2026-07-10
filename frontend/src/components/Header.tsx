import { useWallet } from "../hooks/useWallet";
import { AlertIcon, Spinner, WalletIcon } from "./Icons";

function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export default function Header() {
  const { address, connecting, connect, disconnect, error } = useWallet();

  return (
    <header className="masthead">
      <div className="brand">
        <span className="brand-mark">
          <span>B</span>
        </span>
        <div className="brand-text">
          <h1 className="brand-name">BingoChain</h1>
          <p className="brand-sub">stellar testnet</p>
        </div>
      </div>

      <div className="status-cluster">
        {error && (
          <span className="chip chip--warn">
            <AlertIcon size={14} />
            {error}
          </span>
        )}

        {address ? (
          <>
            <span className="chip chip--wallet">
              <WalletIcon size={14} />
              <span className="mono">{truncateAddress(address)}</span>
            </span>
            <button className="chip chip--ghost" onClick={disconnect}>
              disconnect
            </button>
          </>
        ) : (
          <button className="chip chip--cta" onClick={connect} disabled={connecting}>
            {connecting ? <Spinner size={13} /> : <WalletIcon size={14} />} connect wallet
          </button>
        )}
      </div>
    </header>
  );
}
