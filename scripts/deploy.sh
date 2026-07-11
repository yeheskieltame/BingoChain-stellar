#!/usr/bin/env bash
set -euo pipefail

# Deploys the bingo arena contract to Stellar testnet and regenerates the
# TypeScript client bindings. Safe to rerun: the deployer key import is
# guarded on stellar keys address, and both deployment.json and the
# bindings output directory are overwritten in place.
#
# Requires .deployer-secret at repo root (git-ignored) with a line
# SECRET_KEY=S... for the funded testnet deployer account. The secret is
# read once into a shell variable, piped to stellar keys add on stdin, and
# unset immediately after. It is never passed as an argv, logged, or
# written to deployment.json.

cd "$(dirname "$0")/.."

NETWORK="testnet"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
RPC_URL="https://soroban-testnet.stellar.org"
DEPLOYER_ALIAS="deployer"
SECRET_FILE=".deployer-secret"
WASM_PATH="target/wasm32v1-none/release/bingo.wasm"
FEE_BPS=200
BINDINGS_DIR="frontend/packages/bingo-client"
DEPLOYMENT_FILE="deployment.json"

if ! stellar keys address "$DEPLOYER_ALIAS" >/dev/null 2>&1; then
  if [ ! -f "$SECRET_FILE" ]; then
    echo "missing $SECRET_FILE, cannot import deployer key" >&2
    exit 1
  fi
  SECRET_KEY=$(grep '^SECRET_KEY=' "$SECRET_FILE" | cut -d= -f2-)
  if [ -z "$SECRET_KEY" ]; then
    echo "no SECRET_KEY= line found in $SECRET_FILE" >&2
    exit 1
  fi
  echo "$SECRET_KEY" | stellar keys add "$DEPLOYER_ALIAS" --secret-key
  unset SECRET_KEY
fi

DEPLOYER_ADDRESS=$(stellar keys address "$DEPLOYER_ALIAS")

echo "building contract"
stellar contract build

WASM_HASH=$(stellar contract info hash --wasm "$WASM_PATH")

echo "resolving native token id"
TOKEN_ID=$(stellar contract id asset --asset native --network "$NETWORK")

echo "deploying contract"
CONTRACT_ID=$(stellar contract deploy \
  --wasm "$WASM_PATH" \
  --source-account "$DEPLOYER_ALIAS" \
  --network "$NETWORK" \
  -- \
  --admin "$DEPLOYER_ADDRESS" \
  --token "$TOKEN_ID" \
  --fee_bps "$FEE_BPS")

DEPLOYED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

cat > "$DEPLOYMENT_FILE" <<EOF
{
  "project": "p2p-bingo",
  "network": "$NETWORK",
  "networkPassphrase": "$NETWORK_PASSPHRASE",
  "rpcUrl": "$RPC_URL",
  "contractId": "$CONTRACT_ID",
  "wasmHash": "$WASM_HASH",
  "deployer": "$DEPLOYER_ADDRESS",
  "token": "$TOKEN_ID",
  "feeBps": $FEE_BPS,
  "explorer": "https://stellar.expert/explorer/testnet/contract/$CONTRACT_ID",
  "functions": ["create_arena", "commit_board", "cancel_arena", "call_number", "claim_bingo", "reveal_board", "settle", "withdraw", "get_arena", "arena_count", "commit_of", "earnings_of", "config", "revealed_board_of"],
  "deployedAt": "$DEPLOYED_AT"
}
EOF

echo "regenerating typescript bindings"
stellar contract bindings typescript \
  --contract-id "$CONTRACT_ID" \
  --network "$NETWORK" \
  --output-dir "$BINDINGS_DIR" \
  --overwrite

echo "$CONTRACT_ID"
