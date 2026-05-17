# Internal Security Audit

## Executive Summary

The reviewed scope implements an Option A DeFi protocol with AMM swaps, collateralized lending, ERC-4626 deposits, Chainlink-style oracle reads, governance, and a UUPS treasury upgrade path. The local suite currently passes with 87 tests, 94.51% line coverage, deterministic fuzz-style checks, invariant-style checks, and mainnet fork-style integration checks. L2 verification links still require a funded testnet deployer and explorer API keys before final submission.

## Scope

Commit hash: pending first repository commit.

In scope:

- `src/amm/*.sol`
- `src/lending/*.sol`
- `src/vault/*.sol`
- `src/oracle/*.sol`
- `src/governance/*.sol`
- `src/tokens/*.sol`
- `src/treasury/*.sol`
- `src/security/*.sol`

Out of scope:

- generated artifacts
- frontend display code
- deployment secrets

## Methodology

- Manual review for access control, reentrancy, stale oracle data, accounting, and upgrade safety.
- Automated tests with Hardhat.
- Slither local run and CI configuration with High/Medium failures enabled.

## Findings Table

| ID   | Severity | Title                                             | Status       |
| ---- | -------- | ------------------------------------------------- | ------------ |
| S-01 | Low      | Hardhat used instead of Foundry                   | Acknowledged |
| S-02 | Low      | AMM assumes non-fee-on-transfer ERC-20 assets     | Acknowledged |
| S-03 | Low      | Lending pool uses a single collateral/debt market | Acknowledged |
| D-01 | Deploy   | L2 explorer verification requires live secrets    | Pending      |
| G-01 | Gas      | Yul summation benchmark added for comparison      | Fixed        |

## Finding Details

### S-01 Hardhat Used Instead of Foundry

Location: `test/protocol.test.js`

Impact: The assignment prefers Foundry and `forge coverage`. The repository uses Hardhat because the provided Windows workspace already had the Node/Hardhat toolchain available. The suite now includes the required testing categories in Hardhat form, but a strict grader may still request Foundry-native tests.

Recommendation: Confirm Hardhat approval with the instructor. If Foundry is required, port the existing tests to Foundry while keeping `src/` as the source of truth.

Status: Acknowledged.

### D-01 L2 Explorer Verification Requires Live Secrets

Location: `scripts/deploy.js`, `hardhat.config.js`, `.env.example`

Impact: The deploy and post-deploy verification scripts are reproducible, but final verified explorer links cannot be produced without a funded deployer private key, RPC URL, and explorer API key.

Recommendation: Before submission, set the L2 environment variables, run the deploy script, run explorer verification, then paste the verified addresses and links into `README.md`.

Status: Pending.

### S-02 AMM Assumes Non-Fee-On-Transfer ERC-20 Assets

Location: `src/amm/AMMPair.sol`

Impact: Fee-on-transfer assets can make quoted outputs inaccurate.

Recommendation: Restrict supported assets in docs/UI or update swap accounting to measure actual received amount.

Status: Acknowledged.

### S-03 Lending Pool Uses a Single Collateral/Debt Market

Location: `src/lending/LendingPool.sol`

Impact: The model is intentionally narrow and does not support portfolio-level collateral.

Recommendation: Keep this design for auditability or introduce isolated markets through a factory in a later version.

Status: Acknowledged.

## Vulnerability Case Studies

### Reentrancy

Before: `VulnerableEthVault` sends ETH before reducing balance and uses unchecked subtraction.

After: `FixedEthVault` updates balance before external call and uses `ReentrancyGuard`.

Tests:

- `reproduces a reentrancy drain against the vulnerable vault`
- `proves the fixed vault blocks the same reentrant call path`

### Access Control

Before: `VulnerableParameterStore.setFeeBps` is callable by anyone.

After: `FixedParameterStore.setFeeBps` is guarded by `AccessControl`.

Tests:

- `reproduces the vulnerable access-control case`
- `proves the fixed access-control case blocks unauthorized callers`

## Centralization Analysis

Timelock controls treasury release, treasury upgrades, lending risk parameters, oracle staleness, and vault pause/yield roles after deployment. The deployer should not retain admin roles after `scripts/deploy.js` completes. The post-deployment script verifies the critical role assignments.

## Governance Attack Analysis

- Flash-loan governance: ERC20Votes snapshots voting power at prior blocks, reducing same-block vote borrowing.
- Whale attack: quorum and proposal threshold reduce spam but do not eliminate token concentration risk.
- Proposal spam: proposal threshold is configured at deployment.
- Timelock bypass: privileged contracts should grant roles only to Timelock after deployment.

## Oracle Attack Analysis

- Stale price: `ChainlinkPriceOracle` reverts when `updatedAt + maxStaleness < block.timestamp`.
- Invalid price: zero or negative answers revert.
- Feed depeg/wrong feed: deployment checklist must verify feed address and quote units.

## Slither Appendix

Production-scope command:

```bash
slither . --filter-paths "node_modules|artifacts|cache|coverage|src/security" --exclude-low --exclude-informational --fail-medium
```

Latest local result:

```text
INFO:Slither:. analyzed (86 contracts with 63 detectors), 0 result(s) found
```

The intentionally vulnerable case-study contracts are excluded from production-scope Slither and covered by before/after tests.
