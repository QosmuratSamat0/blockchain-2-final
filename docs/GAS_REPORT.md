# Gas Optimization Report

Gas reporting is configured through `hardhat-gas-reporter`.

Run:

```bash
npm run gas
```

## Yul Benchmark

`src/utils/AssemblyMath.sol` includes:

- `sumSolidity(uint256[] calldata)`
- `sumYul(uint256[] calldata)`

The Yul version reads calldata directly in a tight loop. The test suite verifies output equivalence across fixed and fuzz-style input arrays.

## Latest Local Gas Snapshot

| Operation                     | Local Hardhat Avg Gas |
| ----------------------------- | --------------------: |
| AMM create pair               |             1,851,368 |
| AMM deterministic create pair |             1,853,684 |
| AMM add liquidity             |               225,459 |
| AMM swap                      |                84,685 |
| Vault deposit                 |                87,721 |
| Lending borrow                |               141,531 |
| Governance vote               |                83,472 |
| Treasury upgrade              |                37,895 |

## L1 vs L2 Gas Comparison

The table below is ready for the required final testnet transaction data. It must be filled after deploying with a funded testnet key and running the same operations on the selected L2.

| Operation                     | L1 / Hardhat Gas | L2 Testnet Gas | Delta | Notes                            |
| ----------------------------- | ---------------: | -------------: | ----: | -------------------------------- |
| AMM create pair               |        1,851,368 |            TBD |   TBD | Factory CREATE                   |
| AMM deterministic create pair |        1,853,684 |            TBD |   TBD | Factory CREATE2                  |
| AMM add liquidity             |          225,459 |            TBD |   TBD | Two ERC-20 transfers and LP mint |
| AMM swap                      |           84,685 |            TBD |   TBD | 0.3% fee CPMM                    |
| Vault deposit                 |           87,721 |            TBD |   TBD | ERC-4626 deposit                 |
| Lending borrow                |          141,531 |            TBD |   TBD | Oracle read and debt update      |
| Governance vote               |           83,472 |            TBD |   TBD | ERC20Votes checkpoint read       |
| Treasury upgrade              |           37,895 |            TBD |   TBD | UUPS via timelock                |

## Before/After Optimization Log

| Area               | Before                 | After                       | Result                                |
| ------------------ | ---------------------- | --------------------------- | ------------------------------------- |
| Assembly summation | Solidity loop          | Yul calldata loop           | Equivalent outputs, benchmarked path  |
| AMM reserves       | repeated balance reads | cached reserves + `_sync()` | Reduced duplicate reads in core paths |
| Lending interest   | eager global accrual   | per-account lazy accrual    | Avoids touching inactive accounts     |
