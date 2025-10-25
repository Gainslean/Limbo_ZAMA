NATIVE SITE http://81.94.158.100:4174



# Limbo — DeFi with Bunnies

Deposit ETH → LETH (1:1). Borrow LUSDT under LETH collateral. APR 5% (linear), LTV 75%.
One-line deploy and build on a clean Ubuntu server.

## Quick Start

```bash
# 1) Set env
export PRIVATE_KEY="0xYOUR_PRIVATE_KEY"
export RPC_URL="https://ethereum-sepolia.publicnode.com"   # or your Zama RPC
export CHAIN_ID="11155111"                                  # sepolia; Zama devnet=9000
export CHAIN_NAME="Sepolia Testnet"
export CHAIN_SYMBOL="SEP"

# 2) Run
bash run.sh
```

The script will:
- install deps (contracts + frontend)
- compile & deploy contracts
- write `frontend/src/contract-addresses.json`
- copy ABIs to `frontend/src/abi/`
- build frontend and serve preview on port **4174**

Open: `http://<server-ip>:4174`

### Keep your current deployed contracts
If you already deployed and want to preserve the same on-chain addresses:
- copy **from your server** into this repo before running the frontend:
  - `frontend/src/contract-addresses.json`
  - `frontend/src/abi/LimboMain.json`
  - `frontend/src/abi/ERC20.json`
Then run only the frontend build:
```bash
cd frontend
pnpm i
pnpm run build
pnpm run preview -- --host 0.0.0.0 --port 4174
```

### PM2 (optional)
```bash
npm i -g pm2
pm2 start "pnpm --dir frontend run preview -- --host 0.0.0.0 --port 4174" --name limbo-frontend
pm2 save
```
