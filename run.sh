#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
CONTRACTS="$ROOT/contracts"
FRONT="$ROOT/frontend"

echo "== Limbo: one-line deploy =="

if [ -z "$PRIVATE_KEY" ] || [ -z "$RPC_URL" ] || [ -z "$CHAIN_ID" ]; then
  echo "Please export PRIVATE_KEY, RPC_URL, CHAIN_ID"
  exit 1
fi
CHAIN_NAME="${CHAIN_NAME:-Zama Devnet}"
CHAIN_SYMBOL="${CHAIN_SYMBOL:-ZAMA}"

echo "Env:"
echo "  RPC_URL=$RPC_URL"
echo "  CHAIN_ID=$CHAIN_ID ($CHAIN_NAME)"
echo "  CHAIN_SYMBOL=$CHAIN_SYMBOL"

# Contracts
echo "Contracts: install deps"
cd "$CONTRACTS"
pnpm i --silent

cat > .env <<EOF
PRIVATE_KEY=$PRIVATE_KEY
RPC_URL=$RPC_URL
CHAIN_ID=$CHAIN_ID
CHAIN_NAME=$CHAIN_NAME
CHAIN_SYMBOL=$CHAIN_SYMBOL
EOF

echo "Compile"
pnpm hardhat compile

echo "Deploy"
ADDR_JSON=$(pnpm hardhat run scripts/deploy.js --network live | tail -n 1)

# Frontend
echo "Frontend: install deps"
cd "$FRONT"
pnpm i --silent

# addresses and ABI
echo "$ADDR_JSON" | jq '.' > src/contract-addresses.json

mkdir -p src/abi
cp "$CONTRACTS/artifacts/contracts/LimboMain.sol/LimboMain.json" src/abi/LimboMain.json
cp "$CONTRACTS/artifacts/contracts/CustomERC20.sol/CustomERC20.json" src/abi/ERC20.json

echo "Build frontend"
pnpm run build

echo "Serve preview on :4174"
pnpm run preview -- --host 0.0.0.0 --port 4174
