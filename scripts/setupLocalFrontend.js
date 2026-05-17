const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

async function main() {
  const deploymentPath = path.join(__dirname, "..", "deployments", "localhost.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const { contracts } = deployment;
  const [deployer] = await ethers.getSigners();

  const factory = await ethers.getContractAt("AMMFactory", contracts.ammFactory);
  let pairAddress = await factory.getPair(contracts.collateral, contracts.stable);
  if (pairAddress === ethers.ZeroAddress) {
    await (await factory.createPair(contracts.collateral, contracts.stable)).wait();
    pairAddress = await factory.getPair(contracts.collateral, contracts.stable);
  }

  const pair = await ethers.getContractAt("AMMPair", pairAddress);
  const collateral = await ethers.getContractAt("MockERC20", contracts.collateral);
  const stable = await ethers.getContractAt("MockERC20", contracts.stable);
  const lending = await ethers.getContractAt("LendingPool", contracts.lendingPool);

  const token0 = await pair.token0();
  const collateralLiquidity = ethers.parseEther("1000");
  const stableLiquidity = ethers.parseEther("2000000");
  const amount0 =
    token0.toLowerCase() === contracts.collateral.toLowerCase()
      ? collateralLiquidity
      : stableLiquidity;
  const amount1 =
    token0.toLowerCase() === contracts.collateral.toLowerCase()
      ? stableLiquidity
      : collateralLiquidity;

  if ((await pair.reserve0()) === 0n && (await pair.reserve1()) === 0n) {
    await (await collateral.approve(pairAddress, collateralLiquidity)).wait();
    await (await stable.approve(pairAddress, stableLiquidity)).wait();
    await (await pair.addLiquidity(amount0, amount1, 0, 0, deployer.address)).wait();
  }

  const lendingLiquidity = ethers.parseEther("1000000");
  if ((await stable.balanceOf(contracts.lendingPool)) === 0n) {
    await (await stable.approve(contracts.lendingPool, lendingLiquidity)).wait();
    await (await lending.supplyLiquidity(lendingLiquidity)).wait();
  }

  deployment.chainId = 31337;
  deployment.contracts.ammPair = pairAddress;
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));

  const frontendConfig = `window.DAPP_CONFIG = {
  expectedChainId: 31337,
  chainName: "Local Hardhat",
  rpcUrl: "http://127.0.0.1:8545",
  blockExplorerUrl: "",
  subgraphUrl: "",
  contracts: {
    governanceToken: "${contracts.governanceToken}",
    governor: "${contracts.governor}",
    lendingPool: "${contracts.lendingPool}",
    yieldVault: "${contracts.yieldVault}",
    ammPair: "${pairAddress}",
    stable: "${contracts.stable}"
  }
};
`;
  fs.writeFileSync(path.join(__dirname, "..", "frontend", "config.js"), frontendConfig);

  console.log(
    JSON.stringify(
      {
        chainId: 31337,
        rpcUrl: "http://127.0.0.1:8545",
        frontendConfig: "frontend/config.js",
        ammPair: pairAddress,
        deployer: deployer.address
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
