import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";
import { PairCreated } from "../generated/AMMFactory/AMMFactory";
import {
  LiquidityAdded,
  LiquidityRemoved,
  Swap as SwapEvent
} from "../generated/templates/AMMPair/AMMPair";
import {
  Borrowed,
  CollateralDeposited,
  CollateralWithdrawn,
  Liquidated,
  Repaid
} from "../generated/LendingPool/LendingPool";
import { Deposit, Withdraw } from "../generated/YieldVault/YieldVault";
import {
  ProposalCreated,
  ProposalExecuted,
  ProposalQueued,
  VoteCast
} from "../generated/Governor/SuperAppGovernor";
import { AMMPair as PairTemplate } from "../generated/templates";
import {
  GovernanceProposal,
  LiquidityEvent,
  LoanPosition,
  Pair,
  Swap,
  VaultActivity,
  VaultPosition
} from "../generated/schema";

const ZERO = BigInt.zero();

export function handlePairCreated(event: PairCreated): void {
  const pair = new Pair(event.params.pair.toHexString());
  pair.token0 = event.params.token0;
  pair.token1 = event.params.token1;
  pair.deterministic = event.params.deterministic;
  pair.createdAt = event.block.timestamp;
  pair.createdTx = event.transaction.hash;
  pair.save();

  PairTemplate.create(event.params.pair);
}

export function handleSwap(event: SwapEvent): void {
  const entity = new Swap(event.transaction.hash.toHexString() + "-" + event.logIndex.toString());
  entity.pair = event.address.toHexString();
  entity.sender = event.params.sender;
  entity.tokenIn = event.params.tokenIn;
  entity.recipient = event.params.to;
  entity.amountIn = event.params.amountIn;
  entity.amountOut = event.params.amountOut;
  entity.timestamp = event.block.timestamp;
  entity.txHash = event.transaction.hash;
  entity.save();
}

export function handleLiquidityAdded(event: LiquidityAdded): void {
  saveLiquidity(
    event.address,
    event.params.provider,
    event.params.to,
    "ADD",
    event.params.amount0,
    event.params.amount1,
    event.params.liquidity,
    event
  );
}

export function handleLiquidityRemoved(event: LiquidityRemoved): void {
  saveLiquidity(
    event.address,
    event.params.provider,
    event.params.to,
    "REMOVE",
    event.params.amount0,
    event.params.amount1,
    event.params.liquidity,
    event
  );
}

function saveLiquidity(
  pairAddress: Address,
  provider: Address,
  recipient: Address,
  action: string,
  amount0: BigInt,
  amount1: BigInt,
  liquidity: BigInt,
  event: ethereum.Event
): void {
  const entity = new LiquidityEvent(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  );
  entity.pair = pairAddress.toHexString();
  entity.provider = provider;
  entity.recipient = recipient;
  entity.action = action;
  entity.amount0 = amount0;
  entity.amount1 = amount1;
  entity.liquidity = liquidity;
  entity.timestamp = event.block.timestamp;
  entity.txHash = event.transaction.hash;
  entity.save();
}

export function handleVaultDeposit(event: Deposit): void {
  const position = getVaultPosition(event.params.owner);
  position.shares = position.shares.plus(event.params.shares);
  position.assetsDeposited = position.assetsDeposited.plus(event.params.assets);
  position.updatedAt = event.block.timestamp;
  position.save();
  saveVaultActivity(event.params.owner, "DEPOSIT", event.params.assets, event.params.shares, event);
}

export function handleVaultWithdraw(event: Withdraw): void {
  const position = getVaultPosition(event.params.owner);
  position.shares = position.shares.minus(event.params.shares);
  position.assetsWithdrawn = position.assetsWithdrawn.plus(event.params.assets);
  position.updatedAt = event.block.timestamp;
  position.save();
  saveVaultActivity(
    event.params.owner,
    "WITHDRAW",
    event.params.assets,
    event.params.shares,
    event
  );
}

function getVaultPosition(owner: Address): VaultPosition {
  let position = VaultPosition.load(owner.toHexString());
  if (position == null) {
    position = new VaultPosition(owner.toHexString());
    position.owner = owner;
    position.shares = ZERO;
    position.assetsDeposited = ZERO;
    position.assetsWithdrawn = ZERO;
    position.updatedAt = ZERO;
  }
  return position;
}

function saveVaultActivity(
  owner: Address,
  action: string,
  assets: BigInt,
  shares: BigInt,
  event: ethereum.Event
): void {
  const activity = new VaultActivity(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  );
  activity.owner = owner;
  activity.action = action;
  activity.assets = assets;
  activity.shares = shares;
  activity.timestamp = event.block.timestamp;
  activity.txHash = event.transaction.hash;
  activity.save();
}

export function handleCollateralDeposited(event: CollateralDeposited): void {
  const position = getLoanPosition(event.params.account);
  position.collateral = position.collateral.plus(event.params.amount);
  position.updatedAt = event.block.timestamp;
  position.save();
}

export function handleCollateralWithdrawn(event: CollateralWithdrawn): void {
  const position = getLoanPosition(event.params.account);
  position.collateral = position.collateral.minus(event.params.amount);
  position.updatedAt = event.block.timestamp;
  position.save();
}

export function handleBorrowed(event: Borrowed): void {
  const position = getLoanPosition(event.params.account);
  position.debt = position.debt.plus(event.params.amount);
  position.updatedAt = event.block.timestamp;
  position.save();
}

export function handleRepaid(event: Repaid): void {
  const position = getLoanPosition(event.params.account);
  position.debt = position.debt.minus(event.params.amount);
  position.updatedAt = event.block.timestamp;
  position.save();
}

export function handleLiquidated(event: Liquidated): void {
  const position = getLoanPosition(event.params.account);
  position.debt = position.debt.minus(event.params.repaid);
  position.collateral = position.collateral.minus(event.params.collateralSeized);
  position.liquidations = position.liquidations.plus(BigInt.fromI32(1));
  position.updatedAt = event.block.timestamp;
  position.save();
}

function getLoanPosition(account: Address): LoanPosition {
  let position = LoanPosition.load(account.toHexString());
  if (position == null) {
    position = new LoanPosition(account.toHexString());
    position.account = account;
    position.collateral = ZERO;
    position.debt = ZERO;
    position.liquidations = ZERO;
    position.updatedAt = ZERO;
  }
  return position;
}

export function handleProposalCreated(event: ProposalCreated): void {
  const proposal = new GovernanceProposal(event.params.proposalId.toString());
  proposal.proposer = event.params.proposer;
  proposal.description = event.params.description;
  proposal.startBlock = event.params.voteStart;
  proposal.endBlock = event.params.voteEnd;
  proposal.state = "Pending";
  proposal.forVotes = ZERO;
  proposal.againstVotes = ZERO;
  proposal.abstainVotes = ZERO;
  proposal.createdAt = event.block.timestamp;
  proposal.save();
}

export function handleVoteCast(event: VoteCast): void {
  const proposal = GovernanceProposal.load(event.params.proposalId.toString());
  if (proposal == null) return;

  if (event.params.support == 0) {
    proposal.againstVotes = proposal.againstVotes.plus(event.params.weight);
  } else if (event.params.support == 1) {
    proposal.forVotes = proposal.forVotes.plus(event.params.weight);
  } else {
    proposal.abstainVotes = proposal.abstainVotes.plus(event.params.weight);
  }
  proposal.state = "Active";
  proposal.save();
}

export function handleProposalQueued(event: ProposalQueued): void {
  const proposal = GovernanceProposal.load(event.params.proposalId.toString());
  if (proposal == null) return;
  proposal.state = "Queued";
  proposal.save();
}

export function handleProposalExecuted(event: ProposalExecuted): void {
  const proposal = GovernanceProposal.load(event.params.proposalId.toString());
  if (proposal == null) return;
  proposal.state = "Executed";
  proposal.save();
}
