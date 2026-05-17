const fs = require("fs");
const path = require("path");
const { ethers, upgrades, network } = require("hardhat");

const DAY = 24 * 60 * 60;
const MIN_DELAY = 2 * DAY;
const DEFAULT_VOTING_DELAY_BLOCKS = 7200;
const DEFAULT_VOTING_PERIOD_BLOCKS = 50400;

async function deployContract(name, args = []) {
  const Factory = await ethers.getContractFactory(name);
  const contract = await Factory.deploy(...args);
  await contract.waitForDeployment();
  return contract;
}

async function grantIfMissing(contract, role, grantee) {
  if (!(await contract.hasRole(role, grantee))) {
    await (await contract.grantRole(role, grantee)).wait();
  }
}

async function revokeIfPresent(contract, role, account) {
  if (await contract.hasRole(role, account)) {
    await (await contract.revokeRole(role, account)).wait();
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = deployer.address;
  const useMocks = process.env.USE_MOCKS !== "false";

  let collateral;
  let stable;
  let feed;

  if (useMocks) {
    collateral = await deployContract("MockERC20", ["Wrapped Ether", "WETH", 18, deployerAddress]);
    stable = await deployContract("MockERC20", ["Mock USD", "mUSD", 18, deployerAddress]);
    feed = await deployContract("MockV3Aggregator", [8, 2000n * 10n ** 8n]);
    await (await collateral.mint(deployerAddress, ethers.parseEther("1000000"))).wait();
    await (await stable.mint(deployerAddress, ethers.parseEther("100000000"))).wait();
  } else {
    collateral = await ethers.getContractAt("IERC20", process.env.COLLATERAL_TOKEN);
    stable = await ethers.getContractAt("IERC20", process.env.STABLE_TOKEN);
    feed = await ethers.getContractAt("AggregatorV3Interface", process.env.CHAINLINK_PRICE_FEED);
  }

  const governanceToken = await deployContract("GovernanceToken", [
    deployerAddress,
    ethers.parseEther("1000000")
  ]);
  const timelock = await deployContract("TimelockController", [
    MIN_DELAY,
    [],
    [ethers.ZeroAddress],
    deployerAddress
  ]);
  const governor = await deployContract("SuperAppGovernor", [
    await governanceToken.getAddress(),
    await timelock.getAddress(),
    DEFAULT_VOTING_DELAY_BLOCKS,
    DEFAULT_VOTING_PERIOD_BLOCKS,
    ethers.parseEther("10000")
  ]);

  const oracle = await deployContract("ChainlinkPriceOracle", [
    deployerAddress,
    await feed.getAddress(),
    Number(process.env.ORACLE_MAX_STALENESS || 3600)
  ]);
  const position = await deployContract("PositionNFT", [deployerAddress]);
  const lending = await deployContract("LendingPool", [
    await collateral.getAddress(),
    await stable.getAddress(),
    await oracle.getAddress(),
    await position.getAddress(),
    deployerAddress
  ]);
  const vault = await deployContract("YieldVault", [await stable.getAddress(), deployerAddress]);
  const ammFactory = await deployContract("AMMFactory", [deployerAddress]);

  const treasuryFactory = await ethers.getContractFactory("ProtocolTreasuryV1");
  const treasury = await upgrades.deployProxy(treasuryFactory, [await timelock.getAddress()], {
    kind: "uups"
  });
  await treasury.waitForDeployment();

  await (await position.grantRole(await position.MINTER_ROLE(), await lending.getAddress())).wait();
  await (
    await timelock.grantRole(await timelock.PROPOSER_ROLE(), await governor.getAddress())
  ).wait();
  await (await timelock.grantRole(await timelock.EXECUTOR_ROLE(), ethers.ZeroAddress)).wait();

  await grantIfMissing(
    governanceToken,
    await governanceToken.DEFAULT_ADMIN_ROLE(),
    await timelock.getAddress()
  );
  await grantIfMissing(
    governanceToken,
    await governanceToken.MINTER_ROLE(),
    await timelock.getAddress()
  );
  await grantIfMissing(oracle, await oracle.DEFAULT_ADMIN_ROLE(), await timelock.getAddress());
  await grantIfMissing(oracle, await oracle.ORACLE_ADMIN_ROLE(), await timelock.getAddress());
  await grantIfMissing(position, await position.DEFAULT_ADMIN_ROLE(), await timelock.getAddress());
  await grantIfMissing(vault, await vault.DEFAULT_ADMIN_ROLE(), await timelock.getAddress());
  await grantIfMissing(vault, await vault.YIELD_MANAGER_ROLE(), await timelock.getAddress());
  await grantIfMissing(vault, await vault.PAUSER_ROLE(), await timelock.getAddress());
  await grantIfMissing(lending, await lending.DEFAULT_ADMIN_ROLE(), await timelock.getAddress());
  await grantIfMissing(lending, await lending.RISK_ADMIN_ROLE(), await timelock.getAddress());
  await grantIfMissing(lending, await lending.PAUSER_ROLE(), await timelock.getAddress());

  await revokeIfPresent(governanceToken, await governanceToken.MINTER_ROLE(), deployerAddress);
  await revokeIfPresent(
    governanceToken,
    await governanceToken.DEFAULT_ADMIN_ROLE(),
    deployerAddress
  );
  await revokeIfPresent(oracle, await oracle.ORACLE_ADMIN_ROLE(), deployerAddress);
  await revokeIfPresent(oracle, await oracle.DEFAULT_ADMIN_ROLE(), deployerAddress);
  await revokeIfPresent(position, await position.DEFAULT_ADMIN_ROLE(), deployerAddress);
  await revokeIfPresent(vault, await vault.YIELD_MANAGER_ROLE(), deployerAddress);
  await revokeIfPresent(vault, await vault.PAUSER_ROLE(), deployerAddress);
  await revokeIfPresent(vault, await vault.DEFAULT_ADMIN_ROLE(), deployerAddress);
  await revokeIfPresent(lending, await lending.RISK_ADMIN_ROLE(), deployerAddress);
  await revokeIfPresent(lending, await lending.PAUSER_ROLE(), deployerAddress);
  await revokeIfPresent(lending, await lending.DEFAULT_ADMIN_ROLE(), deployerAddress);

  await (await timelock.revokeRole(await timelock.DEFAULT_ADMIN_ROLE(), deployerAddress)).wait();

  const deployment = {
    network: network.name,
    chainId: network.config.chainId,
    deployer: deployerAddress,
    useMocks,
    minDelay: MIN_DELAY,
    votingDelayBlocks: DEFAULT_VOTING_DELAY_BLOCKS,
    votingPeriodBlocks: DEFAULT_VOTING_PERIOD_BLOCKS,
    contracts: {
      collateral: await collateral.getAddress(),
      stable: await stable.getAddress(),
      priceFeed: await feed.getAddress(),
      oracle: await oracle.getAddress(),
      governanceToken: await governanceToken.getAddress(),
      timelock: await timelock.getAddress(),
      governor: await governor.getAddress(),
      positionNFT: await position.getAddress(),
      lendingPool: await lending.getAddress(),
      yieldVault: await vault.getAddress(),
      ammFactory: await ammFactory.getAddress(),
      protocolTreasury: await treasury.getAddress()
    }
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(deploymentsDir, `${network.name}.json`),
    JSON.stringify(deployment, null, 2)
  );

  console.log(JSON.stringify(deployment, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
