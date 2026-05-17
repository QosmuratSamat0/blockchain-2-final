# Coverage Report

Run:

```bash
npm run coverage
```

Latest local run:

- 87 passing tests
- 94.51% line coverage across instrumented Solidity files
- 93.65% statement coverage
- 93.00% function coverage
- 10 deterministic fuzz-style property tests
- 5 invariant-style tests
- 3 fork-style mainnet integration tests
- AMM create/create2/liquidity/swap/remove coverage
- ERC-4626 deposit/redeem/yield/pause coverage
- Lending collateral/borrow/repay/liquidation/risk-admin coverage
- Chainlink-style oracle stale price coverage
- Full propose -> vote -> queue -> execute governance lifecycle coverage
- UUPS V1 -> V2 upgrade test
- Reentrancy and access-control case studies

The assignment prefers Foundry and `forge coverage`. This repository uses Hardhat with an explicit justification in `docs/HARDHAT_JUSTIFICATION.md`; the suite mirrors the required categories inside Hardhat.

## Latest Coverage Table

| File                                   |   Stmts |  Branch |   Funcs |   Lines |
| -------------------------------------- | ------: | ------: | ------: | ------: |
| `amm/AMMFactory.sol`                   | 100.00% |  91.67% | 100.00% | 100.00% |
| `amm/AMMPair.sol`                      |  89.09% |  47.73% |  90.91% |  88.24% |
| `governance/SuperAppGovernor.sol`      |  72.73% | 100.00% |  75.00% |  72.73% |
| `interfaces/AggregatorV3Interface.sol` | 100.00% | 100.00% | 100.00% | 100.00% |
| `interfaces/IPositionNFT.sol`          | 100.00% | 100.00% | 100.00% | 100.00% |
| `interfaces/IPriceOracle.sol`          | 100.00% | 100.00% | 100.00% | 100.00% |
| `lending/LendingPool.sol`              |  95.89% |  62.50% | 100.00% |  96.33% |
| `mocks/MockV3Aggregator.sol`           | 100.00% | 100.00% | 100.00% | 100.00% |
| `oracle/ChainlinkPriceOracle.sol`      |  94.12% |  75.00% | 100.00% |  95.00% |
| `security/AccessControlCaseStudy.sol`  | 100.00% |  62.50% | 100.00% | 100.00% |
| `security/ReentrancyCaseStudy.sol`     | 100.00% |  68.75% | 100.00% | 100.00% |
| `tokens/GovernanceToken.sol`           |  87.50% | 100.00% |  80.00% |  87.50% |
| `tokens/MockERC20.sol`                 | 100.00% |  50.00% | 100.00% | 100.00% |
| `tokens/PositionNFT.sol`               |  83.33% |  75.00% |  66.67% |  87.50% |
| `treasury/ProtocolTreasuryV1.sol`      | 100.00% |  60.00% | 100.00% | 100.00% |
| `treasury/ProtocolTreasuryV2.sol`      | 100.00% |  50.00% | 100.00% | 100.00% |
| `utils/AssemblyMath.sol`               | 100.00% | 100.00% | 100.00% | 100.00% |
| `vault/YieldVault.sol`                 |  93.33% |  60.71% |  88.89% |  93.33% |
| All files                              |  93.65% |  60.58% |  93.00% |  94.51% |
