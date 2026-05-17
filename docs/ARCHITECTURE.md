# Architecture

## System Context

```mermaid
C4Context
  title DeFi SuperApp Context
  Person(user, "Protocol User", "Swaps, lends, borrows, deposits, votes")
  Person(team, "Deployment Team", "Deploys and verifies contracts")
  System(protocol, "DeFi SuperApp", "AMM, lending, vault, governance")
  System_Ext(chainlink, "Chainlink Price Feed", "Collateral pricing")
  System_Ext(graph, "The Graph", "Indexed events and proposal activity")
  System_Ext(l2, "Arbitrum Sepolia", "L2 execution and verification")
  Rel(user, protocol, "Uses wallet")
  Rel(protocol, chainlink, "Reads latestRoundData")
  Rel(protocol, graph, "Emits events")
  Rel(graph, user, "Serves indexed data")
  Rel(team, l2, "Deploys and verifies")
```

## Contract Components

```mermaid
flowchart LR
  User[User Wallet] --> Pair[AMMPair]
  User --> Lending[LendingPool]
  User --> Vault[YieldVault ERC-4626]
  User --> Governor[SuperAppGovernor]
  Factory[AMMFactory] --> Pair
  Lending --> Oracle[ChainlinkPriceOracle]
  Lending --> NFT[PositionNFT ERC-721]
  Governor --> Timelock[TimelockController]
  Timelock --> Treasury[ProtocolTreasury UUPS Proxy]
  Timelock --> Lending
  Timelock --> Vault
  Timelock --> Oracle
  Token[GovernanceToken ERC20Votes Permit] --> Governor
```

## Critical Flows

### Swap

```mermaid
sequenceDiagram
  participant U as User
  participant T as ERC20
  participant P as AMMPair
  U->>T: approve(pair, amountIn)
  U->>P: swap(tokenIn, amountIn, minOut, receiver)
  P->>T: safeTransferFrom(user, pair, amountIn)
  P->>T: safeTransfer(receiver, amountOut)
  P->>P: sync reserves
  P-->>U: Swap event
```

### Borrow and Liquidate

```mermaid
sequenceDiagram
  participant U as Borrower
  participant L as LendingPool
  participant O as Oracle
  participant Q as Liquidator
  U->>L: depositCollateral(amount)
  L->>O: latestPrice()
  U->>L: borrow(amount)
  L->>O: latestPrice()
  Q->>L: liquidate(user, repayAmount)
  L->>O: latestPrice()
  L-->>Q: seized collateral
```

### Governance Execution

```mermaid
sequenceDiagram
  participant H as Token Holder
  participant G as Governor
  participant T as Timelock
  participant L as LendingPool
  H->>G: propose(setRiskParameters)
  H->>G: castVote()
  G->>T: queue()
  T->>L: execute setRiskParameters()
```

## Storage Layout Notes

Upgradeable storage is limited to `ProtocolTreasuryV1`.

| Slot Owner                                                    | Variables                                              |
| ------------------------------------------------------------- | ------------------------------------------------------ |
| OpenZeppelin Initializable/UUPS/AccessControl/ReentrancyGuard | inherited storage                                      |
| `ProtocolTreasuryV1`                                          | no custom mutable state except inherited role mappings |
| Gap                                                           | `uint256[49] private __gap`                            |
| `ProtocolTreasuryV2`                                          | no new storage                                         |

Because V2 adds only a function and no storage variables, no storage collision is introduced.

## Design Patterns

| Pattern                     | Location                                 | Justification                                                |
| --------------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| Factory                     | `AMMFactory`                             | Permissionless pair creation and deterministic addresses     |
| UUPS Proxy                  | `ProtocolTreasuryV1/V2`                  | Treasury can be upgraded only through timelock authorization |
| Checks-Effects-Interactions | AMM, lending, treasury                   | State is updated before risky value release where practical  |
| Access Control              | Oracle, lending, vault, treasury, tokens | Privileged operations are role-gated                         |
| Pausable                    | AMM, lending, vault                      | Emergency stop for user-facing state transitions             |
| Oracle Adapter              | `ChainlinkPriceOracle`                   | Isolates stale-price and decimal normalization logic         |
| Timelock                    | Governor stack                           | Adds a 2-day delay before privileged execution               |
| Reentrancy Guard            | AMM, lending, vault, treasury            | Guards external token and ETH transfer paths                 |

## Trust Assumptions

The Timelock is the long-term administrator for the treasury and protocol parameters. If the timelock proposer path is compromised, malicious proposals can be queued but remain visible during the delay. If a token whale controls quorum, governance can pass harmful proposals; the mitigation is quorum, proposal threshold, voting delay, and the public timelock delay.

## ADR Log

### ADR-001: Hardhat First

Context: Foundry is not installed in the workspace.

Options: wait for Foundry installation, or implement with Hardhat.

Decision: use Hardhat for the first executable implementation.

Consequences: contracts and tests run locally now; Foundry-specific fuzz/invariant tests must be added if required by the instructor.

### ADR-002: Single Collateral Lending Pool

Context: Option A requires lending but not a full multi-asset money market.

Options: multi-collateral architecture or focused single-collateral pool.

Decision: implement one collateral asset and one borrow asset with a Chainlink-style price feed.

Consequences: the risk model is auditable for the capstone and can be generalized later.
