import Backdrop from "./components/Backdrop";
import Header from "./components/Header";

// Minimal shell for the wallet foundation level. The bingo table UI
// (Backdrop stays, the rest lives in components/ on disk) returns in a
// later build once the game contract wiring is back in place.
export default function App() {
  return (
    <>
      <Backdrop />
      <div className="shell">
        <Header />
        <main className="placeholder-main">
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
