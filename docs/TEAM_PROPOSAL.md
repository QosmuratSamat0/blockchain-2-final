# Week 6 Proposal

## Scenario

Option A — DeFi Super-App.

The protocol combines a constant-product AMM, collateralized lending pool, ERC-4626 yield vault, Chainlink-style price oracle integration, and OpenZeppelin Governor + Timelock governance. It is intended for Arbitrum Sepolia deployment.

## Team Size Approval

The standard assignment team size is 2-3 students. This submission is prepared for a 4-person team because the instructor approved the exception. The extra team member is assigned a distinct delivery track rather than overlapping ownership.

## Team Ownership

| Member | Primary Ownership               | Concrete Responsibilities                                                                 |
| ------ | ------------------------------- | ----------------------------------------------------------------------------------------- |
| Samat  | AMM and protocol math           | AMM pair, factory, CREATE/CREATE2, LP accounting, swap fee math, gas benchmark inputs     |
| Dauren | Lending, vault, and oracle      | Lending LTV/health factor/liquidation, ERC-4626 vault behavior, Chainlink adapter, mocks  |
| Arthur | Governance, security, and tests | ERC20Votes, Governor/Timelock lifecycle, UUPS treasury, vulnerability case studies, tests |
| Ernar  | Frontend, subgraph, and DevOps  | Ethers dApp, The Graph schema/mappings/queries, CI, deployment scripts, demo docs/slides  |

Every member must still understand the whole architecture for Q&A.

## Cross-Review Rules

- Samat reviews AMM-related frontend and subgraph changes.
- Dauren reviews all oracle, liquidation, and ERC-4626 test cases.
- Arthur reviews privileged role assignments, Timelock ownership, Slither output, and audit notes.
- Ernar reviews deploy reproducibility, README commands, frontend error handling, and presentation flow.

No feature is considered final until at least one non-owner has reviewed it.

## Milestones

| Week    | Target                                                              |
| ------- | ------------------------------------------------------------------- |
| End W6  | Repo created, scenario approved, proposal committed                 |
| End W7  | Core contracts compile, first tests and CI green                    |
| End W8  | AMM, lending, vault, and token tests reach 50%+ coverage            |
| End W9  | Governance, oracle, L2 deployment, and subgraph live                |
| End W10 | Audit, gas report, coverage report, frontend, presentation complete |
