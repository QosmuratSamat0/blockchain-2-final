# Documented GraphQL Queries

```graphql
query LatestPairs {
  pairs(first: 10, orderBy: createdAt, orderDirection: desc) {
    id
    token0
    token1
    deterministic
  }
}
```

```graphql
query RecentSwaps {
  swaps(first: 20, orderBy: timestamp, orderDirection: desc) {
    pair {
      id
    }
    sender
    tokenIn
    amountIn
    amountOut
  }
}
```

```graphql
query VaultAccount($owner: ID!) {
  vaultPosition(id: $owner) {
    owner
    shares
    assetsDeposited
    assetsWithdrawn
  }
}
```

```graphql
query LoanAccount($account: ID!) {
  loanPosition(id: $account) {
    collateral
    debt
    liquidations
    updatedAt
  }
}
```

```graphql
query ActiveGovernance {
  governanceProposals(first: 10, orderBy: createdAt, orderDirection: desc) {
    id
    description
    state
    forVotes
    againstVotes
    abstainVotes
  }
}
```
