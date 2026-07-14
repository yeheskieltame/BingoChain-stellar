# BingoChain Stellar

[![CI](https://github.com/yeheskieltame/BingoChain-stellar/actions/workflows/ci.yml/badge.svg)](https://github.com/yeheskieltame/BingoChain-stellar/actions/workflows/ci.yml)

Live app: https://bingochain-stellar.vercel.app (try the free practice table at [/#/practice](https://bingochain-stellar.vercel.app/#/practice), no wallet needed)

BingoChain Stellar is a two to six player bingo game that settles entirely on
a Soroban smart contract on Stellar testnet. Every player arranges the same
25 numbers on their own 5x5 board and seals it with a commitment before play
starts, then players take turns calling numbers from a shared pool of 1 to
25, and whoever's arrangement completes five lines earliest against that
shared call sequence takes the pot. There is no dealer and no server: the
contract holds the stakes, runs the turn order, and settles the winner by
replaying the calls itself.

## Why cheating loses

A board is only useful if it is fixed before anyone knows which numbers will
be called. `commit_board` accepts a `sha256(board_bytes || salt)` commitment,
not the board itself, so nobody, including the contract, sees your layout
until you choose to reveal it. Once calling starts you cannot rearrange
anything: `reveal_board` recomputes the hash from the board and salt you
provide and rejects it outright (`CommitMismatch`) if it does not match what
you committed at the start.

Claiming bingo does not decide the outcome either. `claim_bingo` only freezes
the round into the reveal phase, the same as running out of numbers to call.
The actual winner is decided in `settle`, which replays the recorded call
sequence against every revealed board and finds whoever reached five
completed lines first, or, if nobody did, whoever has the most completed
lines. A false claim costs you nothing and gains you nothing. Not revealing
costs you your stake: `settle` can go ahead once the reveal window closes,
and a player with no revealed board simply cannot win.

## Architecture

```
  Player A: Freighter           Player B: Freighter
           |  sign                       |  sign
           v                             v
 +--------------------------------------------------+
 |           frontend (React + Vite + TS)           |
 | lib/wallet.ts    lib/commit.ts    lib/errors.ts  |
 | lib/horizon.ts   lib/contract.ts  lib/events.ts  |
 +---------+-----------------------------+----------+
           |                             |
  balance, classic payments   simulate, sign, submit,
           |                      poll getEvents
           v                             v
  +------------------+        +----------------------+
  |     Horizon      |        |     Soroban RPC      |
  |    (testnet)     |        |      (testnet)       |
  +------------------+        +-----------+----------+
                                          |
                                          v
                        +----------------------------------+
                        |      bingo contract (Rust)       |
                        |   create_arena, commit_board,    |
                        |    call_number, claim_bingo,     |
                        |  reveal_board, settle, withdraw  |
                        +---------------+------------------+
                                        |  token::Client transfer
                                        v
                        +----------------------------------+
                        |     native XLM Stellar Asset     |
                        |   Contract (escrow and payout)   |
                        +----------------------------------+
```

Level 1 traffic (wallet connect, balance, plain XLM sends) goes through
Horizon and never touches the bingo contract. Level 2 and 3 traffic (arena
calls, event streaming) goes through Soroban RPC. Every stake and payout is a
real call from the bingo contract into the native XLM Stellar Asset Contract,
not a number the bingo contract just tracks internally.

## Quickstart

### Prerequisites

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
rustup target add wasm32v1-none
brew install stellar-cli
```

You also need Node 22 or newer, pnpm, and the Freighter browser extension set
to Stellar testnet.

### Build and test the contract

```bash
cargo test                                     # 36 tests, contracts/bingo/src/test.rs and board.rs
cargo build --target wasm32v1-none --release -p bingo
```

### Build and test the frontend

```bash
cd frontend
pnpm install
pnpm test        # vitest, frontend/src/lib/commit.test.ts and errors.test.ts
pnpm typecheck
pnpm build
```

### Deploy (optional, a contract is already live on testnet)

```bash
stellar keys generate deployer --fund --network testnet
stellar keys secret deployer   # copy the secret key
```

Put the secret in a git-ignored `.deployer-secret` file at the repo root as
`SECRET_KEY=S...`, then run:

```bash
./scripts/deploy.sh
```

This builds the wasm, resolves the native token's contract id, deploys with
`--admin`, `--token`, and `--fee_bps 200`, writes `deployment.json`, and
regenerates the TypeScript bindings in `frontend/packages/bingo-client`.

### Run the frontend

```bash
cd frontend
pnpm install
cp .env.example .env   # already points at the live testnet contract below
pnpm dev
# open http://localhost:5173
```

## Practice mode (no wallet)

`#/practice` is the zero-risk front door: a full round against a bot with no
wallet, no stake, and no transactions, running entirely in the browser. The
engine (`frontend/src/lib/practice.ts`) mirrors the contract's rules exactly,
same 12 line masks, same replay-based settlement, same false-claim and
most-lines outcomes, and a dismissible coach hint on each phase explains what
the real game does on chain at that moment: the hash commitment and stake
escrow, calls as public transactions, the claim freeze and reveal window, and
the settlement replay. Start there before staking anything.

## Workshop level checklist

### Level 1: wallet basics

| Requirement | Where it lives |
| --- | --- |
| Connect and disconnect Freighter, confirm testnet | `frontend/src/lib/wallet.ts`, `frontend/src/hooks/useWallet.ts`, `frontend/src/components/Header.tsx` |
| Live XLM balance for the connected address | `frontend/src/lib/horizon.ts` (`fetchXlmBalance`), `frontend/src/hooks/useBalance.ts` |
| Send XLM with a real transaction, success state with an explorer link, and a visible error path | `frontend/src/lib/tx.ts`, `frontend/src/hooks/useTx.ts`, `frontend/src/components/SendXlmCard.tsx`, `frontend/src/components/TxStatus.tsx`, reachable at `#/wallet` |

### Level 2: contract on testnet, called from the frontend

| Requirement | Where it lives |
| --- | --- |
| A deployed Soroban contract with a real lifecycle | `contracts/bingo/src/lib.rs`, `types.rs`; `scripts/deploy.sh`; `deployment.json` |
| Frontend calls the contract through generated bindings | `frontend/packages/bingo-client` (generated), `frontend/src/lib/contract.ts` |
| Three or more distinct, human-readable error classes | `frontend/src/lib/errors.ts`: wallet declined, wrong network, 18 named contract errors, network failure, unknown |
| Transaction status through build, sign, submit | `frontend/src/lib/tx.ts`, `frontend/src/hooks/useTx.ts` (shared with Level 1) |
| A lobby that creates and lists staked arenas, and a sealed board commitment before joining | `frontend/src/components/Lobby.tsx`, `CreateArenaForm.tsx`, `BoardSetup.tsx`, `frontend/src/lib/commit.ts` |

### Level 3: gameplay, events, ops, and tests

| Requirement | Where it lives |
| --- | --- |
| Advanced contract logic: turn-based calls, claim, commit-reveal verification, replay-based settlement, pull-payment withdrawals | `contracts/bingo/src/lib.rs`, `board.rs` |
| Inter-contract communication: stakes and payouts move through the native XLM Stellar Asset Contract | `token::Client::new(...).transfer` calls inside `commit_board` (stake escrow in) and `withdraw` (payout out); `settle` only assigns earnings that `withdraw` then pays |
| Live event streaming drives the UI instead of polling game state | `frontend/src/lib/events.ts`, `frontend/src/hooks/useArena.ts`, `frontend/src/components/GameRoom.tsx` |
| CI on every push and pull request: format, lint, test, build for contract and frontend | `.github/workflows/ci.yml` |
| A repeatable, idempotent deploy workflow | `scripts/deploy.sh` |
| Mobile-first responsive design, loading and error states, no layout jumps | `frontend/src/styles.css`, component markup across `frontend/src/components` |
| Contract tests and frontend unit tests | `contracts/bingo/src/test.rs` (36 tests), `frontend/src/lib/commit.test.ts`, `frontend/src/lib/errors.test.ts`, `frontend/src/lib/practice.test.ts` |
| Documentation and a working demo script | this file |

## Live deployment (testnet)

- Contract: `CDI5BKQK23UBJFWOO2T5UUVYKYA3ARIO7WXADVVU3HBL4ODCDORWQZBW`
- Explorer: https://stellar.expert/explorer/testnet/contract/CDI5BKQK23UBJFWOO2T5UUVYKYA3ARIO7WXADVVU3HBL4ODCDORWQZBW
- Network: `Test SDF Network ; September 2015`
- Native XLM token contract: `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`
- Protocol fee: 200 basis points (2 percent), capped in the contract at 500 (5 percent)
- Minimum stake per player: 10,000,000 stroops (1 XLM)

`create_arena`, `commit_board`, `call_number`, `claim_bingo`,
`reveal_board`, `settle`, and `withdraw` were exercised end to end against
this exact deployment on arena id 1, and a rejected early `cancel_arena`
(`CancelNotAllowed`) was probed on arena id 2.

## Demo script (two players)

Two funded testnet accounts, each with Freighter (two browser profiles, or
one browser with two Freighter accounts you switch between). New to the
game entirely: play a free practice round at `#/practice` first, no wallet
needed, and let the coach hints walk you through the phases.

1. Both players open the app and connect Freighter from the header. If
   Freighter is on the wrong network, the header shows a wrong-network state
   until you switch it to testnet.
2. Player A opens the lobby (`#/`), sets a stake and a seat count in "open a
   table", and submits. This calls `create_arena` and navigates to
   `#/arena/<id>`.
3. Player A arranges their board (tap two cells to swap, or "shuffle"), then
   presses "commit board, stake XLM". The board and salt are saved to this
   device before the transaction is sent, then `commit_board` escrows the
   stake through the native token.
4. Player B opens the same arena id from the lobby and repeats step 3 with
   their own board. Once the last seat fills, the arena moves to Committed.
5. The first `call_number` moves the arena to Playing. Players take turns
   calling numbers from the 1 to 25 grid; the UI disables the grid for
   whoever is not seated and for whoever is not on turn, and a call out of
   turn is rejected with `NotYourTurn`.
6. Whoever completes five lines can press "claim bingo", or play continues
   until all 25 numbers are called. Either way the arena moves to Revealing
   with a 24 hour countdown.
7. Both players press "reveal your board". Each `reveal_board` call is
   checked against that player's original commitment.
8. Once both have revealed (or the window closes), either player presses
   "settle the table". `settle` replays the calls against both boards and
   credits the winner's (or winners') earnings ledger.
9. The winner presses "withdraw" on the earnings card. `withdraw` pays the
   XLM out and zeroes the ledger entry.
10. Optional: visit `#/wallet` and send XLM directly between the two
    accounts to see the Level 1 payment flow, or decline a Freighter prompt
    on purpose to see the wallet-declined error state.

## Limitations

- Reveal data lives on one device. `saveReveal`/`loadReveal` write the board
  and salt to that browser's `localStorage` only. Clear site data, switch
  browsers, or switch devices before you reveal, and there is no way to
  reconstruct the salt: the stake is forfeit at settlement.
- The reveal window has no notifications. The 24 hour countdown is shown in
  the UI, but nothing pings a player who does not come back to the tab.
- A table that stalls before the first call is not stuck forever, but it is
  slow to unwind: once the 24 hour join window passes, anyone can call
  `cancel_arena` on a Created or Committed table and every seated stake goes
  back to its player's earnings balance.
- Testnet only. The deployed contract, its stakes, and its keys have no real
  value. This has not had a security review and should not be pointed at
  mainnet as is.
- No randomness anywhere, on purpose. The contract never generates a board
  or a call: players choose their own board layout and choose which number
  to call on their turn. That removes any need for an on-chain PRNG or an
  oracle, but it also means the game is a turn-based information game, not a
  game of chance in the traditional bingo sense.

## Frontend

The dapp itself lives in [`frontend/`](./frontend). See its
[README](./frontend/README.md) for the day-to-day commands.
