# Presentation Outline

## Presenter Split

This deck is structured for 4 presenters under the instructor-approved team-size exception.

## Segment 1: Product and Architecture — Samat

- Option A scope
- Component diagram
- User flows: swap, borrow/liquidate, propose/vote/execute

## Segment 2: Protocol Mechanics — Dauren

- AMM math and LP accounting
- Lending health factor and liquidation
- ERC-4626 rounding behavior
- Oracle stale-price protection

## Segment 3: Governance, Security, and Testing — Arthur

- ERC20Votes and Governor/Timelock lifecycle
- UUPS upgrade path
- Access control model
- Reentrancy and access-control case studies
- Slither findings
- Test results and coverage

## Segment 4: Frontend, Subgraph, Deployment, and Demo — Ernar

- Frontend and subgraph demo
- L2 deployment and verification links
- CI and reproducible scripts
- Final demo flow

## Q&A Prep

Every member should be able to explain:

- why Timelock owns privileged roles
- how the AMM computes output amount
- how the lending health factor is calculated
- why ERC20Votes snapshots help governance
- where stale oracle checks happen
- how storage collision is avoided in the UUPS upgrade
