# BINGO·P2P — Frontend

A neon-arcade single-page dapp (React + Vite + TypeScript) for the `bingo`
Soroban smart contract on **Stellar testnet**.

- **Lobby** — list open tables (`get_games`), open a new one (`create_game`).
- **Room** — the live caller (`draw_number`, permissionless), your dealt card,
  and `claim_bingo` to win. Polls the chain every few seconds so other players'
  draws and joins show up.
- **Read** needs no wallet. **Writes** sign with the dev testnet keypair, or
  with **Freighter** if you connect it.

## Run it

```bash
cd frontend
npm install
npm run dev
# open http://localhost:5173
```

Config is in `.env` (already filled in for this workshop; git-ignored). See
`.env.example`:

```env
VITE_CONTRACT_ID=CBMENYQVO6SC3AQEKB3EZFII6TSWBFD4IBMF5JXHNZ7TKY6WKKFH2YLA
VITE_RPC_URL=https://soroban-testnet.stellar.org
VITE_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
VITE_STELLAR_PUBLIC=G...
VITE_STELLAR_SECRET=S...      # testnet dev key only
```

## Build

```bash
npm run build      # outputs to dist/
npm run preview    # serve the production build
```

## How it works

- `src/lib/bingoClient.ts` — TypeScript bindings generated from the on-chain
  contract spec (`stellar contract bindings typescript`).
- `src/lib/stellar.ts` — contract client, signers, and bingo helpers
  (`ballColumn`, `cardHasBingo`).
- `src/App.tsx` — lobby + room flows with toast feedback and explorer links.
- `src/components/` — `BingoBall`, `CardGrid`, `Backdrop` (neon/halftone), etc.

### Playing peer-to-peer

Open the app in two browsers, each with its own wallet (e.g. Freighter), enter
the same table id, and take turns drawing — every action is a real testnet
transaction. With a single dev wallet you can also play solo end-to-end.

> ⚠️ A secret in a `VITE_` variable is bundled into the public frontend. Fine
> for a throwaway **testnet** key, never for mainnet. Use Freighter for real apps.
