const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

function assertCheck(condition, message) {
  if (!condition) {
    throw new Error(`post-deploy check failed: ${message}`);
  }
}

async function main() {
  const deploymentPath = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const c = deployment.contracts;

  const timelock = await ethers.getContractAt("TimelockController", c.timelock);
  const governor = await ethers.getContractAt("SuperAppGovernor", c.governor);
  const treasury = await ethers.getContractAt("ProtocolTreasuryV1", c.protocolTreasury);
  const lending = await ethers.getContractAt("LendingPool", c.lendingPool);
  const token = await ethers.getContractAt("GovernanceToken", c.governanceToken);

  assertCheck(
    (await timelock.getMinDelay()) === BigInt(deployment.minDelay),
    "timelock delay must be 2 days"
  );
  assertCheck(
    (await governor.votingDelay()) === BigInt(deployment.votingDelayBlocks),
    "voting delay mismatch"
  );
  assertCheck(
    (await governor.votingPeriod()) === BigInt(deployment.votingPeriodBlocks),
    "voting period mismatch"
  );
  assertCheck((await governor.quorumNumerator()) === 4n, "quorum must be 4%");
  assertCheck(
    await treasury.hasRole(await treasury.DEFAULT_ADMIN_ROLE(), c.timelock),
    "treasury admin must be timelock"
  );
  assertCheck(
    await treasury.hasRole(await treasury.TREASURER_ROLE(), c.timelock),
    "treasury treasurer must be timelock"
  );
  assertCheck(
    await treasury.hasRole(await treasury.UPGRADER_ROLE(), c.timelock),
    "treasury upgrader must be timelock"
  );
  assertCheck(
    await lending.hasRole(await lending.RISK_ADMIN_ROLE(), c.timelock),
    "lending risk admin must be timelock"
  );
  assertCheck(
    await token.hasRole(await token.MINTER_ROLE(), c.timelock),
    "governance token minter must be timelock"
  );

  console.log(
    JSON.stringify(
      {
        network: network.name,
        checks: "ok",
        timelock: c.timelock,
        governor: c.governor,
        treasury: c.protocolTreasury
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
