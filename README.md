# BINGO·P2P — On-chain Bingo on Stellar

[![CI](https://github.com/yeheskieltame/BingoChain-stellar/actions/workflows/ci.yml/badge.svg)](https://github.com/yeheskieltame/BingoChain-stellar/actions/workflows/ci.yml)

**Peer-to-peer Bingo, settled on-chain.** A Soroban smart contract on the
Stellar network runs the whole game — dealing cards, calling balls, and
verifying wins. No server, no house: anyone can open a table, anyone can join,
anyone can draw the next ball, and the contract decides who wins.

## How it works

- **Cards are dealt on-chain.** Joining a game generates a standard 5×5
  B-I-N-G-O card (column ranges 1-15, 16-30, …, 61-75) with a free center cell,
  using the network PRNG.
- **Draws are permissionless.** `draw_number` can be called by anyone — it picks
  the next unused number in 1-75. This is what makes it truly peer-to-peer:
  there's no privileged "caller".
- **Wins are verified by the contract.** `claim_bingo` checks the caller's card
  against the drawn numbers for any complete row, column, or diagonal. A valid
  line ends the game and records the winner.

### Contract API

| Function | Auth | Description |
| --- | --- | --- |
| `create_game(host)` | host | Opens a table; host auto-joins with a card. Returns game id. |
| `join_game(game_id, player)` | player | Joins a table; deals a fresh card. |
| `draw_number(game_id)` | none | Draws the next random ball (1-75, no repeats). |
| `claim_bingo(game_id, player)` | player | Verifies the card; ends the game on a win. |
| `get_game(game_id)` / `get_games()` | none | Read game state / lobby. |

### Live deployment (testnet)

- **Contract:** `CBMENYQVO6SC3AQEKB3EZFII6TSWBFD4IBMF5JXHNZ7TKY6WKKFH2YLA`
- **Explorer:** https://stellar.expert/explorer/testnet/contract/CBMENYQVO6SC3AQEKB3EZFII6TSWBFD4IBMF5JXHNZ7TKY6WKKFH2YLA
- **Network:** Test SDF Network ; September 2015
- **Deployer:** `GABNO2DQP232FHOSHC6NWEI5BP5FE2E75FO6EX4SBPYIB2ABFDDZB7GH`

> ℹ️ The draw uses the Soroban PRNG — perfect for a fun game, but not intended
> for adversarial, high-stakes randomness.

---

## Quickstart (workshop)

### Prerequisites

```bash
# Rust + wasm target
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
rustup target add wasm32v1-none

# Stellar CLI
brew install stellar-cli
```

### 1. Build & test the contract

```bash
cargo test                 # runs the on-chain logic tests
stellar contract build     # → target/wasm32v1-none/release/bingo.wasm
```

### 2. Create & fund a testnet wallet

```bash
stellar keys generate walletdev --fund --network testnet
stellar keys address walletdev   # public key
```

The deployer keys for this project live in `.deployer-secret` (git-ignored).

### 3. Deploy to testnet

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/bingo.wasm \
  --source walletdev \
  --network testnet
```

### 4. Play from the CLI

```bash
CID=CBMENYQVO6SC3AQEKB3EZFII6TSWBFD4IBMF5JXHNZ7TKY6WKKFH2YLA
ME=$(stellar keys address walletdev)

stellar contract invoke --id $CID --source walletdev --network testnet -- create_game --host $ME
stellar contract invoke --id $CID --source walletdev --network testnet -- draw_number --game_id 0
stellar contract invoke --id $CID --source walletdev --network testnet -- get_game --game_id 0
stellar contract invoke --id $CID --source walletdev --network testnet -- claim_bingo --game_id 0 --player $ME
```

### 5. Play in the browser

A neon-arcade React + Vite dapp lives in [`frontend/`](./frontend) — lobby,
live caller, and a tactile bingo card. See its [README](./frontend/README.md).

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
```

## Project layout

```
contracts/bingo/        # the Soroban smart contract (Rust)
  src/lib.rs            # game logic: cards, draws, win-check
  src/test.rs           # unit tests
frontend/               # React + Vite + TypeScript dapp
  src/lib/bingoClient.ts  # generated contract bindings
  src/lib/stellar.ts      # client + signer (dev key / Freighter)
deployment.json         # current testnet deployment info
```

---

**BINGO·P2P** — every card, every call, every win — on Stellar.
