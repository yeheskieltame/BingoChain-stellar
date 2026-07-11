import Backdrop from "./components/Backdrop";
import Header from "./components/Header";
import SendXlmCard from "./components/SendXlmCard";
import { useBalance } from "./hooks/useBalance";
import { useWallet } from "./hooks/useWallet";

// Minimal shell for the wallet foundation level. Wallet and balance state
// lives here so the send flow can refresh the header balance after a
// confirmed payment. The bingo table UI returns in a later build.
export default function App() {
  const wallet = useWallet();
  const balanceState = useBalance(wallet.address);

  return (
    <>
      <Backdrop />
      <div className="shell">
        <Header wallet={wallet} balanceState={balanceState} />
        <main className="placeholder-main">
          <SendXlmCard address={wallet.address} onSuccess={balanceState.refresh} />
          <div className="state">
            <p className="state-title">Bingo tables are next</p>
            <p className="state-msg">
              Wallet layer is live on Stellar testnet. Tables come back in a later build.
            </p>
          </div>
        </main>
      </div>
    </>
  );
}
