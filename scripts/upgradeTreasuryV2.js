const fs = require("fs");
const path = require("path");
const { ethers, upgrades, network } = require("hardhat");

async function main() {
  const deploymentPath = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const proxy = deployment.contracts.protocolTreasury;

  const TreasuryV2 = await ethers.getContractFactory("ProtocolTreasuryV2");
  const upgraded = await upgrades.upgradeProxy(proxy, TreasuryV2);
  await upgraded.waitForDeployment();

  deployment.contracts.protocolTreasuryImplementationV2 =
    await upgrades.erc1967.getImplementationAddress(proxy);
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));

  console.log(`Treasury upgraded at proxy ${proxy}; version=${await upgraded.version()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
