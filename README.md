# DeFi SuperApp Capstone

Option A implementation for Blockchain Technologies 2: AMM, lending pool, ERC-4626 yield vault, Chainlink-style oracle adapter, DAO governance, subgraph, frontend, and L2 deployment scripts.

This submission is organized for an instructor-approved 4-person team. Ownership is documented in `docs/TEAM_PROPOSAL.md`.

## Current Status

- Smart contracts compile with Hardhat.
- `npm test` passes with 87 automated tests.
- The test suite includes 10 deterministic fuzz-style tests, 5 invariant-style tests, and 3 fork-style mainnet integration tests.
- `npm run coverage` reports 94.51% line coverage.
- `npm run slither` reports 0 High/Medium findings for production scope.
- UUPS V1 -> V2 treasury upgrade path is implemented and tested.
- AMM factory supports both `CREATE` and `CREATE2`.
- The frontend is a static Ethers.js dApp in `frontend/`.
- The Graph schema, mappings, and documented queries are in `subgraph/`.
- Deployment and post-deployment verification scripts are in `scripts/`.

The assignment prefers Foundry. This repo currently uses Hardhat because Foundry is not installed in the provided Windows workspace. The justification is documented in `docs/HARDHAT_JUSTIFICATION.md`.

## Contracts

| Area                   | Contract                                                                     |
| ---------------------- | ---------------------------------------------------------------------------- |
| Governance token       | `src/tokens/GovernanceToken.sol`                                             |
| ERC-721 position token | `src/tokens/PositionNFT.sol`                                                 |
| AMM                    | `src/amm/AMMFactory.sol`, `src/amm/AMMPair.sol`                              |
| Lending                | `src/lending/LendingPool.sol`                                                |
| ERC-4626 vault         | `src/vault/YieldVault.sol`                                                   |
| Oracle                 | `src/oracle/ChainlinkPriceOracle.sol`                                        |
| Governor               | `src/governance/SuperAppGovernor.sol`                                        |
| Upgradeable treasury   | `src/treasury/ProtocolTreasuryV1.sol`, `src/treasury/ProtocolTreasuryV2.sol` |
| Assembly benchmark     | `src/utils/AssemblyMath.sol`                                                 |
| Vulnerability studies  | `src/security/*.sol`                                                         |

## Setup

```bash
npm install
npm run compile
npm test
npm run coverage
npm run slither
```

To run the local demo:

```bash
npx hardhat node --hostname 127.0.0.1
npx hardhat run scripts/deploy.js --network localhost
npm run local:setup
npm run frontend:serve
```

Open `http://127.0.0.1:5173/` and connect MetaMask to chain ID `31337`.

## Deployment

Create `.env` with:

```bash
PRIVATE_KEY=
ARBITRUM_SEPOLIA_RPC_URL=
ARBISCAN_API_KEY=
```

Deploy with mocks:

```bash
npm run deploy:sepolia
npm run verify:post
```

The scripts also support `optimismSepolia` and `baseSepolia`:

```bash
npm run deploy:optimism
npm run verify:post:optimism
npm run deploy:base
npm run verify:post:base
```

Verified L2 addresses must be added here after running with a funded deployer and explorer API key:

| Network          | Deployment JSON                    | Explorer Links      |
| ---------------- | ---------------------------------- | ------------------- |
| Arbitrum Sepolia | `deployments/arbitrumSepolia.json` | Pending live deploy |
| Optimism Sepolia | `deployments/optimismSepolia.json` | Pending live deploy |
| Base Sepolia     | `deployments/baseSepolia.json`     | Pending live deploy |

To deploy with existing testnet tokens/feed, set `USE_MOCKS=false`, `COLLATERAL_TOKEN`, `STABLE_TOKEN`, and `CHAINLINK_PRICE_FEED`.

## Frontend

Open `frontend/index.html` or serve the `frontend/` folder. Update `frontend/config.js` with deployed addresses and a live subgraph URL after deployment. For local demos, `npm run local:setup` writes localhost contract addresses into the config.

## Subgraph

Update addresses and `startBlock` values in `subgraph/subgraph.yaml`, then run:

```bash
cd subgraph
npm install
npm run codegen
npm run build
```

## Documentation

- Architecture: `docs/ARCHITECTURE.md`
- Security audit: `docs/SECURITY_AUDIT.md`
- Gas report: `docs/GAS_REPORT.md`
- Coverage report: `docs/COVERAGE.md`
- Team proposal: `docs/TEAM_PROPOSAL.md`
- Presentation outline: `docs/PRESENTATION_OUTLINE.md`
