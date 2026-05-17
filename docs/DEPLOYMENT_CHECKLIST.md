# Deployment Checklist

The repository contains reproducible deployment and post-deployment verification scripts. Final L2 deployment still requires secrets and testnet funds.

## Required Secrets

Copy `.env.example` to `.env` and fill:

- `PRIVATE_KEY`: funded L2 testnet deployer
- one RPC URL: `ARBITRUM_SEPOLIA_RPC_URL`, `OPTIMISM_SEPOLIA_RPC_URL`, or `BASE_SEPOLIA_RPC_URL`
- matching explorer API key: `ARBISCAN_API_KEY`, `OPTIMISM_API_KEY`, or `BASESCAN_API_KEY`

## Deploy

```bash
npm run deploy:sepolia
npm run verify:post
```

Alternative networks:

```bash
npm run deploy:optimism
npm run verify:post:optimism
npm run deploy:base
npm run verify:post:base
```

## Manual Finalization

After the live L2 deployment:

1. Run explorer verification for each implementation/proxy where applicable.
2. Paste verified explorer URLs into `README.md`.
3. Replace `frontend/config.js` addresses and `subgraph/subgraph.yaml` addresses/start blocks with the L2 values.
4. Deploy the subgraph through Graph Studio.
5. Replace `subgraphUrl` in `frontend/config.js` with the live Graph endpoint.
6. Run `scripts/postDeployCheck.js` and paste the output into this document.

## Latest Local Post-Deploy Check

```json
{
  "network": "localhost",
  "checks": "ok",
  "timelock": "0x0165878A594ca255338adfa4d48449f69242Eb8F",
  "governor": "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853",
  "treasury": "0x9A676e781A523b5d0C0e43731313A708CB607508"
}
```
