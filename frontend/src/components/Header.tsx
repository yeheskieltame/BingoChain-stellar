import type { UseBalanceResult } from "../hooks/useBalance";
import type { UseWalletResult } from "../hooks/useWallet";
import { AlertIcon, RefreshIcon, Spinner, WalletIcon } from "./Icons";

function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

interface HeaderProps {
  // Wallet and balance state lives in App so the send flow can refresh the
  // header balance after a confirmed payment.
  wallet: UseWalletResult;
  balanceState: UseBalanceResult;
}

export default function Header({ wallet, balanceState }: HeaderProps) {
  const { address, connecting, connect, disconnect, error } = wallet;
  const { balance, loading, error: balanceError, refresh } = balanceState;

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

        <a className="chip chip--link" href="#/wallet">
          send xlm
        </a>

        {address ? (
          <>
            <button
              className={`chip ${balanceError ? "chip--warn" : "chip--balance"}`}
              onClick={refresh}
              title="Refresh balance"
              disabled={loading}
            >
              {loading && balance === null ? (
                <Spinner size={13} />
              ) : balanceError ? (
                "couldn't load balance, retry"
              ) : balance === null ? (
                "unfunded account, use friendbot"
              ) : (
                `${balance} XLM`
              )}
              <RefreshIcon size={12} className={loading ? "spin" : ""} />
            </button>
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
