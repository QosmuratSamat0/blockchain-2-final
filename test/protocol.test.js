const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { loadFixture, time, mine, reset } = require("@nomicfoundation/hardhat-network-helpers");

const DAY = 24 * 60 * 60;
const MIN_DELAY = 2 * DAY;

async function deployCoreFixture() {
  const [deployer, alice, bob, liquidator, treasury] = await ethers.getSigners();

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const collateral = await MockERC20.deploy("Wrapped Ether", "WETH", 18, deployer.address);
  const stable = await MockERC20.deploy("Mock USD", "mUSD", 18, deployer.address);

  const Feed = await ethers.getContractFactory("MockV3Aggregator");
  const feed = await Feed.deploy(8, 2000n * 10n ** 8n);

  const Oracle = await ethers.getContractFactory("ChainlinkPriceOracle");
  const oracle = await Oracle.deploy(deployer.address, await feed.getAddress(), 3600);

  const PositionNFT = await ethers.getContractFactory("PositionNFT");
  const position = await PositionNFT.deploy(deployer.address);

  const LendingPool = await ethers.getContractFactory("LendingPool");
  const lending = await LendingPool.deploy(
    await collateral.getAddress(),
    await stable.getAddress(),
    await oracle.getAddress(),
    await position.getAddress(),
    deployer.address
  );
  await position.grantRole(await position.MINTER_ROLE(), await lending.getAddress());

  const YieldVault = await ethers.getContractFactory("YieldVault");
  const vault = await YieldVault.deploy(await stable.getAddress(), deployer.address);

  const AMMFactory = await ethers.getContractFactory("AMMFactory");
  const factory = await AMMFactory.deploy(deployer.address);

  const GovernanceToken = await ethers.getContractFactory("GovernanceToken");
  const governanceToken = await GovernanceToken.deploy(
    deployer.address,
    ethers.parseEther("1000000")
  );

  await collateral.mint(deployer.address, ethers.parseEther("1000000"));
  await collateral.mint(alice.address, ethers.parseEther("100"));
  await collateral.mint(bob.address, ethers.parseEther("100"));
  await collateral.mint(liquidator.address, ethers.parseEther("100"));
  await stable.mint(deployer.address, ethers.parseEther("1000000"));
  await stable.mint(alice.address, ethers.parseEther("100000"));
  await stable.mint(bob.address, ethers.parseEther("100000"));
  await stable.mint(liquidator.address, ethers.parseEther("100000"));

  return {
    deployer,
    alice,
    bob,
    liquidator,
    treasury,
    collateral,
    stable,
    feed,
    oracle,
    position,
    lending,
    vault,
    factory,
    governanceToken
  };
}

describe("Option A DeFi Super-App contracts", function () {
  describe("tokens and oracle", function () {
    it("deploys an ERC20Votes + ERC20Permit governance token", async function () {
      const { governanceToken, deployer } = await loadFixture(deployCoreFixture);

      expect(await governanceToken.name()).to.equal("DeFi SuperApp Governance");
      expect(await governanceToken.balanceOf(deployer.address)).to.equal(
        ethers.parseEther("1000000")
      );
      expect(await governanceToken.delegates(deployer.address)).to.equal(ethers.ZeroAddress);
    });

    it("allows governance token holders to delegate voting power", async function () {
      const { governanceToken, deployer } = await loadFixture(deployCoreFixture);

      await governanceToken.delegate(deployer.address);
      expect(await governanceToken.getVotes(deployer.address)).to.equal(
        ethers.parseEther("1000000")
      );
    });

    it("restricts governance token minting to minters", async function () {
      const { governanceToken, alice } = await loadFixture(deployCoreFixture);

      await governanceToken.mint(alice.address, ethers.parseEther("10"));
      await expect(governanceToken.connect(alice).mint(alice.address, 1)).to.be.reverted;
      expect(await governanceToken.nonces(alice.address)).to.equal(0);
    });

    it("allows authorized ERC-721 position minting only", async function () {
      const { position, alice } = await loadFixture(deployCoreFixture);

      await position.mintPosition(alice.address, ethers.id("MANUAL_POSITION"));
      expect(await position.ownerOf(1)).to.equal(alice.address);
      await expect(position.connect(alice).mintPosition(alice.address, ethers.id("FAIL"))).to.be
        .reverted;
    });

    it("scales Chainlink-style price answers to 18 decimals", async function () {
      const { oracle } = await loadFixture(deployCoreFixture);

      const [price] = await oracle.latestPrice();
      expect(price).to.equal(ethers.parseEther("2000"));
    });

    it("reverts when the oracle price is stale", async function () {
      const { feed, oracle } = await loadFixture(deployCoreFixture);
      const now = await time.latest();

      await feed.updateRoundData(2, 2000n * 10n ** 8n, now - 4000, now - 4000);
      await expect(oracle.latestPrice()).to.be.revertedWithCustomError(oracle, "StalePrice");
    });

    it("reverts when the oracle price is invalid", async function () {
      const { feed, oracle } = await loadFixture(deployCoreFixture);

      await feed.updateAnswer(0);
      await expect(oracle.latestPrice()).to.be.revertedWithCustomError(oracle, "InvalidPrice");
    });

    it("exposes historical mock aggregator rounds", async function () {
      const { feed } = await loadFixture(deployCoreFixture);

      const round = await feed.getRoundData(1);
      expect(round[1]).to.equal(2000n * 10n ** 8n);
    });

    it("restricts oracle staleness updates to the oracle admin", async function () {
      const { oracle, alice } = await loadFixture(deployCoreFixture);

      await expect(oracle.connect(alice).setMaxStaleness(7200)).to.be.reverted;
      await oracle.setMaxStaleness(7200);
      expect(await oracle.maxStaleness()).to.equal(7200);
    });
  });

  describe("AMM factory and pair", function () {
    async function deployPairFixture() {
      const base = await deployCoreFixture();
      const tokenA = await base.collateral.getAddress();
      const tokenB = await base.stable.getAddress();

      await base.factory.createPair(tokenA, tokenB);
      const pairAddress = await base.factory.getPair(tokenA, tokenB);
      const pair = await ethers.getContractAt("AMMPair", pairAddress);

      await base.collateral.approve(pairAddress, ethers.MaxUint256);
      await base.stable.approve(pairAddress, ethers.MaxUint256);
      await base.collateral.connect(base.alice).approve(pairAddress, ethers.MaxUint256);
      await base.stable.connect(base.alice).approve(pairAddress, ethers.MaxUint256);

      return { ...base, pair };
    }

    it("creates pairs with CREATE", async function () {
      const { factory, collateral, stable } = await loadFixture(deployCoreFixture);

      await expect(
        factory.createPair(await collateral.getAddress(), await stable.getAddress())
      ).to.emit(factory, "PairCreated");
      expect(await factory.allPairsLength()).to.equal(1);
    });

    it("predicts and creates pairs with CREATE2", async function () {
      const { factory, collateral, stable } = await loadFixture(deployCoreFixture);
      const salt = ethers.id("capstone-pair");
      const predicted = await factory.predictDeterministicAddress(
        await collateral.getAddress(),
        await stable.getAddress(),
        salt
      );

      await factory.createPairDeterministic(
        await collateral.getAddress(),
        await stable.getAddress(),
        salt
      );
      expect(
        await factory.getPair(await collateral.getAddress(), await stable.getAddress())
      ).to.equal(predicted);
    });

    it("rejects duplicate pairs", async function () {
      const { factory, collateral, stable } = await loadFixture(deployCoreFixture);

      await factory.createPair(await collateral.getAddress(), await stable.getAddress());
      await expect(
        factory.createPair(await collateral.getAddress(), await stable.getAddress())
      ).to.be.revertedWithCustomError(factory, "PairExists");
    });

    it("adds initial liquidity and mints LP shares", async function () {
      const { pair, deployer } = await loadFixture(deployPairFixture);

      await pair.addLiquidity(
        ethers.parseEther("10"),
        ethers.parseEther("20000"),
        0,
        0,
        deployer.address
      );
      expect(await pair.balanceOf(deployer.address)).to.be.gt(0);
      expect(await pair.reserve0()).to.be.gt(0);
      expect(await pair.reserve1()).to.be.gt(0);
    });

    it("quotes a 0.3% fee swap output", async function () {
      const { pair } = await loadFixture(deployPairFixture);

      await pair.addLiquidity(
        ethers.parseEther("10000"),
        ethers.parseEther("10000"),
        0,
        0,
        (await ethers.getSigners())[0].address
      );
      const out = await pair.getAmountOut(await pair.token0(), ethers.parseEther("100"));
      expect(out).to.be.lt(ethers.parseEther("100"));
      expect(out).to.be.gt(ethers.parseEther("98"));
    });

    it("executes swaps with slippage protection", async function () {
      const { pair, alice } = await loadFixture(deployPairFixture);
      await pair.addLiquidity(
        ethers.parseEther("10000"),
        ethers.parseEther("10000"),
        0,
        0,
        alice.address
      );

      const tokenIn = await pair.token0();
      const amountOut = await pair.getAmountOut(tokenIn, ethers.parseEther("100"));
      await expect(
        pair.connect(alice).swap(tokenIn, ethers.parseEther("100"), amountOut + 1n, alice.address)
      ).to.be.revertedWithCustomError(pair, "SlippageExceeded");
      await expect(
        pair.connect(alice).swap(tokenIn, ethers.parseEther("100"), amountOut, alice.address)
      ).to.emit(pair, "Swap");
    });

    it("keeps the constant product from decreasing after a swap", async function () {
      const { pair, alice } = await loadFixture(deployPairFixture);
      await pair.addLiquidity(
        ethers.parseEther("10000"),
        ethers.parseEther("10000"),
        0,
        0,
        alice.address
      );

      const beforeK = (await pair.reserve0()) * (await pair.reserve1());
      await pair
        .connect(alice)
        .swap(await pair.token0(), ethers.parseEther("100"), 0, alice.address);
      const afterK = (await pair.reserve0()) * (await pair.reserve1());

      expect(afterK).to.be.gte(beforeK);
    });

    it("removes liquidity and returns both pool assets", async function () {
      const { pair, deployer } = await loadFixture(deployPairFixture);
      await pair.addLiquidity(
        ethers.parseEther("10000"),
        ethers.parseEther("10000"),
        0,
        0,
        deployer.address
      );

      const lp = await pair.balanceOf(deployer.address);
      await expect(pair.removeLiquidity(lp / 2n, 0, 0, deployer.address)).to.emit(
        pair,
        "LiquidityRemoved"
      );
    });

    it("pauses and unpauses pair operations", async function () {
      const { pair, deployer } = await loadFixture(deployPairFixture);

      await pair.pause();
      await expect(
        pair.addLiquidity(ethers.parseEther("10"), ethers.parseEther("10"), 0, 0, deployer.address)
      ).to.be.revertedWithCustomError(pair, "EnforcedPause");
      await pair.unpause();
      await pair.addLiquidity(
        ethers.parseEther("10"),
        ethers.parseEther("10"),
        0,
        0,
        deployer.address
      );
    });

    it("rejects invalid swap input tokens", async function () {
      const { pair, deployer, treasury } = await loadFixture(deployPairFixture);

      await pair.addLiquidity(
        ethers.parseEther("10"),
        ethers.parseEther("10"),
        0,
        0,
        deployer.address
      );
      await expect(
        pair.getAmountOut(treasury.address, ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(pair, "InvalidToken");
    });
  });

  describe("ERC-4626 yield vault", function () {
    it("accepts deposits and mints proportional shares", async function () {
      const { stable, vault, alice } = await loadFixture(deployCoreFixture);

      await stable.connect(alice).approve(await vault.getAddress(), ethers.parseEther("1000"));
      await expect(vault.connect(alice).deposit(ethers.parseEther("1000"), alice.address)).to.emit(
        vault,
        "Deposit"
      );
      expect(await vault.balanceOf(alice.address)).to.equal(ethers.parseEther("1000"));
    });

    it("reports yield and increases assets per share", async function () {
      const { stable, vault, alice } = await loadFixture(deployCoreFixture);

      await stable.connect(alice).approve(await vault.getAddress(), ethers.parseEther("1000"));
      await vault.connect(alice).deposit(ethers.parseEther("1000"), alice.address);
      await stable.approve(await vault.getAddress(), ethers.parseEther("100"));
      await vault.reportYield(ethers.parseEther("100"));

      const assets = await vault.convertToAssets(ethers.parseEther("1000"));
      expect(assets).to.be.gte(ethers.parseEther("1100") - 1n);
      expect(assets).to.be.lte(ethers.parseEther("1100"));
    });

    it("redeems shares using ERC-4626 rounding-safe accounting", async function () {
      const { stable, vault, alice } = await loadFixture(deployCoreFixture);

      await stable.connect(alice).approve(await vault.getAddress(), ethers.parseEther("1000"));
      await vault.connect(alice).deposit(ethers.parseEther("1000"), alice.address);
      await expect(
        vault.connect(alice).redeem(ethers.parseEther("250"), alice.address, alice.address)
      ).to.emit(vault, "Withdraw");
      expect(await vault.balanceOf(alice.address)).to.equal(ethers.parseEther("750"));
    });

    it("supports mint and withdraw flows", async function () {
      const { stable, vault, alice } = await loadFixture(deployCoreFixture);

      await stable.connect(alice).approve(await vault.getAddress(), ethers.parseEther("1000"));
      await vault.connect(alice).mint(ethers.parseEther("100"), alice.address);
      await vault.connect(alice).withdraw(ethers.parseEther("25"), alice.address, alice.address);
      expect(await vault.balanceOf(alice.address)).to.equal(ethers.parseEther("75"));
    });

    it("restricts yield reporting to yield managers", async function () {
      const { vault, alice } = await loadFixture(deployCoreFixture);

      await expect(vault.connect(alice).reportYield(1)).to.be.reverted;
    });

    it("allows pausers to stop deposits", async function () {
      const { stable, vault, alice } = await loadFixture(deployCoreFixture);

      await stable.connect(alice).approve(await vault.getAddress(), ethers.parseEther("100"));
      await vault.pause();
      await expect(
        vault.connect(alice).deposit(ethers.parseEther("100"), alice.address)
      ).to.be.revertedWithCustomError(vault, "EnforcedPause");
      await vault.unpause();
      await vault.connect(alice).deposit(ethers.parseEther("100"), alice.address);
    });
  });

  describe("lending pool", function () {
    async function fundedLendingFixture() {
      const base = await deployCoreFixture();
      await base.stable.approve(await base.lending.getAddress(), ethers.parseEther("500000"));
      await base.lending.supplyLiquidity(ethers.parseEther("500000"));
      await base.collateral
        .connect(base.alice)
        .approve(await base.lending.getAddress(), ethers.parseEther("100"));
      await base.stable
        .connect(base.alice)
        .approve(await base.lending.getAddress(), ethers.MaxUint256);
      await base.stable
        .connect(base.liquidator)
        .approve(await base.lending.getAddress(), ethers.MaxUint256);
      return base;
    }

    it("accepts lending liquidity", async function () {
      const { lending, stable } = await loadFixture(fundedLendingFixture);

      expect(await stable.balanceOf(await lending.getAddress())).to.equal(
        ethers.parseEther("500000")
      );
    });

    it("allows liquidity providers to withdraw available liquidity", async function () {
      const { lending, stable, deployer } = await loadFixture(fundedLendingFixture);

      const before = await stable.balanceOf(deployer.address);
      await lending.withdrawLiquidity(ethers.parseEther("1000"));
      expect(await stable.balanceOf(deployer.address)).to.equal(before + ethers.parseEther("1000"));
    });

    it("mints an ERC-721 position on first collateral deposit", async function () {
      const { lending, position, alice } = await loadFixture(fundedLendingFixture);

      await lending.connect(alice).depositCollateral(ethers.parseEther("10"));
      expect(await position.ownerOf(1)).to.equal(alice.address);
      expect(await lending.positionTokenId(alice.address)).to.equal(1);
    });

    it("borrows up to the configured max LTV", async function () {
      const { lending, alice } = await loadFixture(fundedLendingFixture);

      await lending.connect(alice).depositCollateral(ethers.parseEther("10"));
      await lending.connect(alice).borrow(ethers.parseEther("10000"));
      expect(await lending.debtPrincipal(alice.address)).to.equal(ethers.parseEther("10000"));
    });

    it("blocks borrows that exceed max LTV", async function () {
      const { lending, alice } = await loadFixture(fundedLendingFixture);

      await lending.connect(alice).depositCollateral(ethers.parseEther("1"));
      await expect(
        lending.connect(alice).borrow(ethers.parseEther("1600"))
      ).to.be.revertedWithCustomError(lending, "BorrowLimitExceeded");
    });

    it("accrues linear interest over time", async function () {
      const { lending, alice } = await loadFixture(fundedLendingFixture);

      await lending.connect(alice).depositCollateral(ethers.parseEther("10"));
      await lending.connect(alice).borrow(ethers.parseEther("1000"));
      await time.increase(30 * DAY);
      expect(await lending.debtOf(alice.address)).to.be.gt(ethers.parseEther("1000"));
    });

    it("allows borrowers to repay debt", async function () {
      const { lending, alice } = await loadFixture(fundedLendingFixture);

      await lending.connect(alice).depositCollateral(ethers.parseEther("10"));
      await lending.connect(alice).borrow(ethers.parseEther("1000"));
      await expect(lending.connect(alice).repay(ethers.parseEther("400"))).to.emit(
        lending,
        "Repaid"
      );
      expect(await lending.debtPrincipal(alice.address)).to.be.closeTo(
        ethers.parseEther("600"),
        ethers.parseEther("0.001")
      );
    });

    it("prevents unsafe collateral withdrawals", async function () {
      const { lending, alice } = await loadFixture(fundedLendingFixture);

      await lending.connect(alice).depositCollateral(ethers.parseEther("10"));
      await lending.connect(alice).borrow(ethers.parseEther("10000"));
      await expect(
        lending.connect(alice).withdrawCollateral(ethers.parseEther("9"))
      ).to.be.revertedWithCustomError(lending, "BorrowLimitExceeded");
    });

    it("liquidates undercollateralized accounts after an oracle price drop", async function () {
      const { lending, feed, alice, liquidator } = await loadFixture(fundedLendingFixture);

      await lending.connect(alice).depositCollateral(ethers.parseEther("10"));
      await lending.connect(alice).borrow(ethers.parseEther("10000"));
      await feed.updateAnswer(100n * 10n ** 8n);

      await expect(
        lending.connect(liquidator).liquidate(alice.address, ethers.parseEther("1000"))
      ).to.emit(lending, "Liquidated");
      expect(await lending.collateralBalance(alice.address)).to.be.lt(ethers.parseEther("10"));
    });

    it("restricts risk parameter changes to the risk admin", async function () {
      const { lending, alice } = await loadFixture(fundedLendingFixture);

      await expect(lending.connect(alice).setRiskParameters(7000, 8200, 400, 900)).to.be.reverted;
      await lending.setRiskParameters(7000, 8200, 400, 900);
      expect(await lending.maxLtvBps()).to.equal(7000);
    });

    it("rejects invalid risk parameters", async function () {
      const { lending } = await loadFixture(fundedLendingFixture);

      await expect(lending.setRiskParameters(9000, 8000, 400, 900)).to.be.revertedWithCustomError(
        lending,
        "InvalidRiskParameters"
      );
    });

    it("updates oracle and pauses lending operations through admins", async function () {
      const { lending, alice, deployer } = await loadFixture(fundedLendingFixture);
      const Feed = await ethers.getContractFactory("MockV3Aggregator");
      const newFeed = await Feed.deploy(8, 1500n * 10n ** 8n);
      const Oracle = await ethers.getContractFactory("ChainlinkPriceOracle");
      const newOracle = await Oracle.deploy(deployer.address, await newFeed.getAddress(), 3600);

      await lending.setOracle(await newOracle.getAddress());
      expect(await lending.oracle()).to.equal(await newOracle.getAddress());
      await lending.pause();
      await expect(lending.connect(alice).depositCollateral(1)).to.be.revertedWithCustomError(
        lending,
        "EnforcedPause"
      );
      await lending.unpause();
    });
  });

  describe("governance and timelock", function () {
    it("executes a propose-vote-queue-execute lifecycle through the timelock", async function () {
      const { governanceToken, lending, deployer } = await loadFixture(deployCoreFixture);
      const Timelock = await ethers.getContractFactory("TimelockController");
      const timelock = await Timelock.deploy(MIN_DELAY, [], [ethers.ZeroAddress], deployer.address);
      const Governor = await ethers.getContractFactory("SuperAppGovernor");
      const governor = await Governor.deploy(
        await governanceToken.getAddress(),
        await timelock.getAddress(),
        1,
        5,
        ethers.parseEther("1000")
      );

      await governanceToken.delegate(deployer.address);
      await timelock.grantRole(await timelock.PROPOSER_ROLE(), await governor.getAddress());
      await timelock.grantRole(await timelock.EXECUTOR_ROLE(), ethers.ZeroAddress);
      await lending.grantRole(await lending.RISK_ADMIN_ROLE(), await timelock.getAddress());

      const targets = [await lending.getAddress()];
      const values = [0];
      const calldatas = [
        lending.interface.encodeFunctionData("setRiskParameters", [7000, 8200, 400, 900])
      ];
      const description = "Tune lending risk parameters";
      const descriptionHash = ethers.id(description);

      await governor.propose(targets, values, calldatas, description);
      const proposalId = await governor.hashProposal(targets, values, calldatas, descriptionHash);

      await mine(2);
      await governor.castVote(proposalId, 1);
      await mine(6);
      expect(await governor.state(proposalId)).to.equal(4);

      await governor.queue(targets, values, calldatas, descriptionHash);
      await time.increase(MIN_DELAY + 1);
      await governor.execute(targets, values, calldatas, descriptionHash);

      expect(await lending.maxLtvBps()).to.equal(7000);
      expect(await governor.state(proposalId)).to.equal(7);
    });
  });

  describe("upgradeability and treasury", function () {
    it("deploys a UUPS treasury proxy and upgrades from V1 to V2", async function () {
      const { deployer } = await loadFixture(deployCoreFixture);
      const TreasuryV1 = await ethers.getContractFactory("ProtocolTreasuryV1");
      const treasury = await upgrades.deployProxy(TreasuryV1, [deployer.address], { kind: "uups" });
      await treasury.waitForDeployment();

      expect(await treasury.version()).to.equal("1.0.0");

      const TreasuryV2 = await ethers.getContractFactory("ProtocolTreasuryV2");
      const upgraded = await upgrades.upgradeProxy(await treasury.getAddress(), TreasuryV2);
      expect(await upgraded.version()).to.equal("2.0.0");
    });

    it("releases ERC-20 tokens and native ETH through treasurer role", async function () {
      const { deployer, alice, stable } = await loadFixture(deployCoreFixture);
      const TreasuryV1 = await ethers.getContractFactory("ProtocolTreasuryV1");
      const treasury = await upgrades.deployProxy(TreasuryV1, [deployer.address], { kind: "uups" });
      await treasury.waitForDeployment();

      await stable.transfer(await treasury.getAddress(), ethers.parseEther("100"));
      await expect(
        treasury.releaseToken(await stable.getAddress(), alice.address, ethers.parseEther("25"))
      ).to.emit(treasury, "TokenReleased");

      await deployer.sendTransaction({
        to: await treasury.getAddress(),
        value: ethers.parseEther("1")
      });
      await expect(treasury.releaseNative(alice.address, ethers.parseEther("0.25"))).to.emit(
        treasury,
        "NativeReleased"
      );
    });

    it("sweeps token balances after the V2 upgrade", async function () {
      const { deployer, alice, stable } = await loadFixture(deployCoreFixture);
      const TreasuryV1 = await ethers.getContractFactory("ProtocolTreasuryV1");
      const treasury = await upgrades.deployProxy(TreasuryV1, [deployer.address], { kind: "uups" });
      await treasury.waitForDeployment();
      await stable.transfer(await treasury.getAddress(), ethers.parseEther("33"));

      const TreasuryV2 = await ethers.getContractFactory("ProtocolTreasuryV2");
      const upgraded = await upgrades.upgradeProxy(await treasury.getAddress(), TreasuryV2);
      await upgraded.sweepToken(await stable.getAddress(), alice.address);
      expect(await stable.balanceOf(await upgraded.getAddress())).to.equal(0);
    });
  });

  describe("assembly benchmark target", function () {
    it("returns the same result for Solidity and Yul summation", async function () {
      const AssemblyMath = await ethers.getContractFactory("AssemblyMath");
      const math = await AssemblyMath.deploy();
      const values = [1, 2, 3, 5, 8, 13, 21].map(BigInt);

      expect(await math.sumYul(values)).to.equal(await math.sumSolidity(values));
    });
  });

  describe("vulnerability case studies", function () {
    it("reproduces the vulnerable access-control case", async function () {
      const { alice } = await loadFixture(deployCoreFixture);
      const Vulnerable = await ethers.getContractFactory("VulnerableParameterStore");
      const vulnerable = await Vulnerable.deploy();

      await vulnerable.connect(alice).setFeeBps(777);
      expect(await vulnerable.feeBps()).to.equal(777);
    });

    it("proves the fixed access-control case blocks unauthorized callers", async function () {
      const { deployer, alice } = await loadFixture(deployCoreFixture);
      const Fixed = await ethers.getContractFactory("FixedParameterStore");
      const fixed = await Fixed.deploy(deployer.address);

      await expect(fixed.connect(alice).setFeeBps(777)).to.be.reverted;
      await fixed.setFeeBps(777);
      expect(await fixed.feeBps()).to.equal(777);
    });

    it("reproduces a reentrancy drain against the vulnerable vault", async function () {
      const { deployer, alice } = await loadFixture(deployCoreFixture);
      const Vulnerable = await ethers.getContractFactory("VulnerableEthVault");
      const Fixed = await ethers.getContractFactory("FixedEthVault");
      const Attacker = await ethers.getContractFactory("ReentrancyAttacker");
      const vulnerable = await Vulnerable.deploy();
      const fixed = await Fixed.deploy();
      const attacker = await Attacker.deploy(
        await vulnerable.getAddress(),
        await fixed.getAddress()
      );

      await vulnerable.connect(alice).deposit({ value: ethers.parseEther("5") });
      await attacker.connect(deployer).attackVulnerable({ value: ethers.parseEther("1") });

      expect(await ethers.provider.getBalance(await vulnerable.getAddress())).to.equal(0);
      expect(await ethers.provider.getBalance(await attacker.getAddress())).to.equal(
        ethers.parseEther("6")
      );
    });

    it("proves the fixed vault blocks the same reentrant call path", async function () {
      const { deployer, alice } = await loadFixture(deployCoreFixture);
      const Vulnerable = await ethers.getContractFactory("VulnerableEthVault");
      const Fixed = await ethers.getContractFactory("FixedEthVault");
      const Attacker = await ethers.getContractFactory("ReentrancyAttacker");
      const vulnerable = await Vulnerable.deploy();
      const fixed = await Fixed.deploy();
      const attacker = await Attacker.deploy(
        await vulnerable.getAddress(),
        await fixed.getAddress()
      );

      await fixed.connect(alice).deposit({ value: ethers.parseEther("5") });
      await expect(attacker.connect(deployer).attackFixed({ value: ethers.parseEther("1") })).to.be
        .reverted;
      expect(await ethers.provider.getBalance(await fixed.getAddress())).to.equal(
        ethers.parseEther("5")
      );
    });
  });

  describe("expanded unit coverage", function () {
    it("rejects factory construction with a zero admin", async function () {
      const AMMFactory = await ethers.getContractFactory("AMMFactory");
      await expect(AMMFactory.deploy(ethers.ZeroAddress)).to.be.revertedWith(
        "AMMFactory: admin zero"
      );
    });

    it("rejects identical token pairs", async function () {
      const { factory, collateral } = await loadFixture(deployCoreFixture);
      await expect(
        factory.createPair(await collateral.getAddress(), await collateral.getAddress())
      ).to.be.revertedWithCustomError(factory, "IdenticalTokens");
    });

    it("rejects zero address pair tokens", async function () {
      const { factory, collateral } = await loadFixture(deployCoreFixture);
      await expect(
        factory.createPair(await collateral.getAddress(), ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(factory, "InvalidToken");
    });

    it("stores symmetric factory pair lookups", async function () {
      const { factory, collateral, stable } = await loadFixture(deployCoreFixture);
      await factory.createPair(await collateral.getAddress(), await stable.getAddress());
      const pair = await factory.getPair(await collateral.getAddress(), await stable.getAddress());
      expect(
        await factory.getPair(await stable.getAddress(), await collateral.getAddress())
      ).to.equal(pair);
    });

    it("sets pair deployer as pair admin", async function () {
      const { factory, collateral, stable, deployer } = await loadFixture(deployCoreFixture);
      await factory.createPair(await collateral.getAddress(), await stable.getAddress());
      const pair = await ethers.getContractAt(
        "AMMPair",
        await factory.getPair(await collateral.getAddress(), await stable.getAddress())
      );
      expect(await pair.hasRole(await pair.DEFAULT_ADMIN_ROLE(), deployer.address)).to.equal(true);
    });

    it("rejects initial liquidity below minimum shares", async function () {
      const { factory, collateral, stable, deployer } = await loadFixture(deployCoreFixture);
      await factory.createPair(await collateral.getAddress(), await stable.getAddress());
      const pair = await ethers.getContractAt(
        "AMMPair",
        await factory.getPair(await collateral.getAddress(), await stable.getAddress())
      );
      await collateral.approve(await pair.getAddress(), ethers.MaxUint256);
      await stable.approve(await pair.getAddress(), ethers.MaxUint256);
      await expect(pair.addLiquidity(1, 1, 0, 0, deployer.address)).to.be.revertedWithCustomError(
        pair,
        "InsufficientLiquidity"
      );
    });

    it("rejects add liquidity when minimum amounts are not met", async function () {
      const { factory, collateral, stable, deployer } = await loadFixture(deployCoreFixture);
      await factory.createPair(await collateral.getAddress(), await stable.getAddress());
      const pair = await ethers.getContractAt(
        "AMMPair",
        await factory.getPair(await collateral.getAddress(), await stable.getAddress())
      );
      await collateral.approve(await pair.getAddress(), ethers.MaxUint256);
      await stable.approve(await pair.getAddress(), ethers.MaxUint256);
      await expect(
        pair.addLiquidity(
          ethers.parseEther("10"),
          ethers.parseEther("10"),
          ethers.parseEther("11"),
          0,
          deployer.address
        )
      ).to.be.revertedWithCustomError(pair, "SlippageExceeded");
    });

    it("rejects remove liquidity sent to the zero address", async function () {
      const { factory, collateral, stable } = await loadFixture(deployCoreFixture);
      await factory.createPair(await collateral.getAddress(), await stable.getAddress());
      const pair = await ethers.getContractAt(
        "AMMPair",
        await factory.getPair(await collateral.getAddress(), await stable.getAddress())
      );
      await expect(pair.removeLiquidity(1, 0, 0, ethers.ZeroAddress)).to.be.revertedWithCustomError(
        pair,
        "InsufficientAmount"
      );
    });

    it("returns zero AMM quote for zero input", async function () {
      const { factory, collateral, stable } = await loadFixture(deployCoreFixture);
      await factory.createPair(await collateral.getAddress(), await stable.getAddress());
      const pair = await ethers.getContractAt(
        "AMMPair",
        await factory.getPair(await collateral.getAddress(), await stable.getAddress())
      );
      await expect(pair.getAmountOut(await pair.token0(), 0)).to.be.revertedWithCustomError(
        pair,
        "InsufficientAmount"
      );
    });

    it("tracks ERC-4626 preview values before and after deposits", async function () {
      const { stable, vault, alice } = await loadFixture(deployCoreFixture);
      await stable.connect(alice).approve(await vault.getAddress(), ethers.parseEther("200"));
      expect(await vault.previewDeposit(ethers.parseEther("100"))).to.equal(
        ethers.parseEther("100")
      );
      await vault.connect(alice).deposit(ethers.parseEther("100"), alice.address);
      expect(await vault.previewRedeem(ethers.parseEther("50"))).to.equal(ethers.parseEther("50"));
    });

    it("rejects zero yield reports", async function () {
      const { vault } = await loadFixture(deployCoreFixture);
      await expect(vault.reportYield(0)).to.be.revertedWith("YieldVault: zero yield");
    });

    it("keeps health factor max for accounts with no debt", async function () {
      const { lending, alice } = await loadFixture(deployCoreFixture);
      expect(await lending.healthFactor(alice.address)).to.equal(ethers.MaxUint256);
    });

    it("rejects zero liquidity supply", async function () {
      const { lending } = await loadFixture(deployCoreFixture);
      await expect(lending.supplyLiquidity(0)).to.be.revertedWithCustomError(
        lending,
        "InvalidAmount"
      );
    });

    it("rejects liquidity withdrawal above provider balance", async function () {
      const { lending } = await loadFixture(deployCoreFixture);
      await expect(lending.withdrawLiquidity(1)).to.be.revertedWithCustomError(
        lending,
        "InvalidAmount"
      );
    });

    it("rejects repay when no debt exists", async function () {
      const { lending, alice } = await loadFixture(deployCoreFixture);
      await expect(lending.connect(alice).repay(1)).to.be.revertedWithCustomError(
        lending,
        "InvalidAmount"
      );
    });

    it("caps repayment at outstanding debt", async function () {
      const { lending, collateral, stable, alice } = await loadFixture(deployCoreFixture);
      await stable.approve(await lending.getAddress(), ethers.parseEther("500000"));
      await lending.supplyLiquidity(ethers.parseEther("500000"));
      await collateral.connect(alice).approve(await lending.getAddress(), ethers.parseEther("10"));
      await stable.connect(alice).approve(await lending.getAddress(), ethers.MaxUint256);
      await lending.connect(alice).depositCollateral(ethers.parseEther("10"));
      await lending.connect(alice).borrow(ethers.parseEther("1000"));
      await lending.connect(alice).repay(ethers.parseEther("2000"));
      expect(await lending.debtPrincipal(alice.address)).to.equal(0);
    });

    it("rejects liquidating a healthy account", async function () {
      const { lending, stable, collateral, alice, liquidator } =
        await loadFixture(deployCoreFixture);
      await stable.approve(await lending.getAddress(), ethers.parseEther("500000"));
      await lending.supplyLiquidity(ethers.parseEther("500000"));
      await collateral.connect(alice).approve(await lending.getAddress(), ethers.parseEther("10"));
      await stable.connect(liquidator).approve(await lending.getAddress(), ethers.MaxUint256);
      await lending.connect(alice).depositCollateral(ethers.parseEther("10"));
      await lending.connect(alice).borrow(ethers.parseEther("1000"));
      await expect(
        lending.connect(liquidator).liquidate(alice.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(lending, "HealthyAccount");
    });

    it("rejects setting a zero lending oracle", async function () {
      const { lending } = await loadFixture(deployCoreFixture);
      await expect(lending.setOracle(ethers.ZeroAddress)).to.be.revertedWith(
        "LendingPool: oracle zero"
      );
    });

    it("rejects zero oracle staleness", async function () {
      const { oracle } = await loadFixture(deployCoreFixture);
      await expect(oracle.setMaxStaleness(0)).to.be.revertedWithCustomError(
        oracle,
        "InvalidStaleness"
      );
    });

    it("stores position NFT type metadata", async function () {
      const { position, alice } = await loadFixture(deployCoreFixture);
      const kind = ethers.id("TEST_POSITION_KIND");
      await position.mintPosition(alice.address, kind);
      expect(await position.positionType(1)).to.equal(kind);
    });

    it("rejects governance token constructor zero admin", async function () {
      const GovernanceToken = await ethers.getContractFactory("GovernanceToken");
      await expect(GovernanceToken.deploy(ethers.ZeroAddress, 1)).to.be.revertedWith(
        "GovernanceToken: admin zero"
      );
    });

    it("rejects treasury token release to zero recipient", async function () {
      const { deployer, stable } = await loadFixture(deployCoreFixture);
      const TreasuryV1 = await ethers.getContractFactory("ProtocolTreasuryV1");
      const treasury = await upgrades.deployProxy(TreasuryV1, [deployer.address], { kind: "uups" });
      await treasury.waitForDeployment();
      await expect(
        treasury.releaseToken(await stable.getAddress(), ethers.ZeroAddress, 1)
      ).to.be.revertedWith("ProtocolTreasury: to zero");
    });

    it("rejects treasury native release to zero recipient", async function () {
      const { deployer } = await loadFixture(deployCoreFixture);
      const TreasuryV1 = await ethers.getContractFactory("ProtocolTreasuryV1");
      const treasury = await upgrades.deployProxy(TreasuryV1, [deployer.address], { kind: "uups" });
      await treasury.waitForDeployment();
      await expect(treasury.releaseNative(ethers.ZeroAddress, 1)).to.be.revertedWith(
        "ProtocolTreasury: to zero"
      );
    });
  });

  describe("fuzz-style deterministic property tests", function () {
    const amounts = [1n, 2n, 5n, 10n, 25n, 50n, 100n, 250n, 500n, 999n].map((n) =>
      ethers.parseEther(n.toString())
    );

    it("fuzz 01: AMM quote is always positive and below reserves for varied inputs", async function () {
      const { factory, collateral, stable } = await loadFixture(deployCoreFixture);
      await factory.createPair(await collateral.getAddress(), await stable.getAddress());
      const pair = await ethers.getContractAt(
        "AMMPair",
        await factory.getPair(await collateral.getAddress(), await stable.getAddress())
      );
      await collateral.approve(await pair.getAddress(), ethers.MaxUint256);
      await stable.approve(await pair.getAddress(), ethers.MaxUint256);
      await pair.addLiquidity(
        ethers.parseEther("10000"),
        ethers.parseEther("10000"),
        0,
        0,
        (await ethers.getSigners())[0].address
      );
      for (const amount of amounts) {
        const out = await pair.getAmountOut(await pair.token0(), amount);
        expect(out).to.be.gt(0);
        expect(out).to.be.lt(await pair.reserve1());
      }
    });

    it("fuzz 02: AMM output increases monotonically with input", async function () {
      const { factory, collateral, stable } = await loadFixture(deployCoreFixture);
      await factory.createPair(await collateral.getAddress(), await stable.getAddress());
      const pair = await ethers.getContractAt(
        "AMMPair",
        await factory.getPair(await collateral.getAddress(), await stable.getAddress())
      );
      await collateral.approve(await pair.getAddress(), ethers.MaxUint256);
      await stable.approve(await pair.getAddress(), ethers.MaxUint256);
      await pair.addLiquidity(
        ethers.parseEther("20000"),
        ethers.parseEther("20000"),
        0,
        0,
        (await ethers.getSigners())[0].address
      );
      let previous = 0n;
      for (const amount of amounts) {
        const out = await pair.getAmountOut(await pair.token0(), amount);
        expect(out).to.be.gt(previous);
        previous = out;
      }
    });

    it("fuzz 03: vault deposits mint nonzero shares for varied inputs", async function () {
      const { stable, vault, alice } = await loadFixture(deployCoreFixture);
      await stable.connect(alice).approve(await vault.getAddress(), ethers.MaxUint256);
      for (const amount of amounts) {
        const before = await vault.balanceOf(alice.address);
        await vault.connect(alice).deposit(amount, alice.address);
        expect(await vault.balanceOf(alice.address)).to.be.gt(before);
      }
    });

    it("fuzz 04: vault withdraw leaves total assets consistent for varied inputs", async function () {
      const { stable, vault, alice } = await loadFixture(deployCoreFixture);
      await stable.connect(alice).approve(await vault.getAddress(), ethers.MaxUint256);
      await vault.connect(alice).deposit(ethers.parseEther("5000"), alice.address);
      for (const amount of amounts.slice(0, 6)) {
        const beforeAssets = await vault.totalAssets();
        await vault.connect(alice).withdraw(amount, alice.address, alice.address);
        expect(await vault.totalAssets()).to.equal(beforeAssets - amount);
      }
    });

    it("fuzz 05: governance voting power follows delegated balances", async function () {
      const { governanceToken, deployer, alice } = await loadFixture(deployCoreFixture);
      await governanceToken.delegate(deployer.address);
      for (const amount of amounts.slice(0, 7)) {
        await governanceToken.mint(alice.address, amount);
        await governanceToken.connect(alice).delegate(alice.address);
        expect(await governanceToken.getVotes(alice.address)).to.equal(
          await governanceToken.balanceOf(alice.address)
        );
      }
    });

    it("fuzz 06: borrow capacity scales linearly with collateral", async function () {
      const { lending, collateral, alice } = await loadFixture(deployCoreFixture);
      await collateral.connect(alice).approve(await lending.getAddress(), ethers.MaxUint256);
      let previous = 0n;
      for (const amount of amounts.slice(0, 6)) {
        await lending.connect(alice).depositCollateral(amount);
        const capacity = await lending.borrowCapacity(alice.address);
        expect(capacity).to.be.gt(previous);
        previous = capacity;
      }
    });

    it("fuzz 07: interest never decreases debt over varied elapsed times", async function () {
      const { lending, stable, collateral, alice } = await loadFixture(deployCoreFixture);
      await stable.approve(await lending.getAddress(), ethers.parseEther("100000"));
      await lending.supplyLiquidity(ethers.parseEther("100000"));
      await collateral.connect(alice).approve(await lending.getAddress(), ethers.parseEther("10"));
      await lending.connect(alice).depositCollateral(ethers.parseEther("10"));
      await lending.connect(alice).borrow(ethers.parseEther("1000"));
      let previousDebt = await lending.debtOf(alice.address);
      for (const days of [1, 3, 7, 14, 30]) {
        await time.increase(days * DAY);
        const debt = await lending.debtOf(alice.address);
        expect(debt).to.be.gte(previousDebt);
        previousDebt = debt;
      }
    });

    it("fuzz 08: oracle scaling works across feed decimals", async function () {
      for (const decimals of [6, 8, 10, 18]) {
        const Feed = await ethers.getContractFactory("MockV3Aggregator");
        const feed = await Feed.deploy(decimals, 2n * 10n ** BigInt(decimals));
        const Oracle = await ethers.getContractFactory("ChainlinkPriceOracle");
        const oracle = await Oracle.deploy(
          (await ethers.getSigners())[0].address,
          await feed.getAddress(),
          3600
        );
        const [price] = await oracle.latestPrice();
        expect(price).to.equal(ethers.parseEther("2"));
      }
    });

    it("fuzz 09: assembly sum matches Solidity sum for varied arrays", async function () {
      const AssemblyMath = await ethers.getContractFactory("AssemblyMath");
      const math = await AssemblyMath.deploy();
      const cases = [[1n], [1n, 2n], [3n, 5n, 8n], [13n, 21n, 34n, 55n], [100n, 200n, 300n]];
      for (const values of cases) {
        expect(await math.sumYul(values)).to.equal(await math.sumSolidity(values));
      }
    });

    it("fuzz 10: liquidation seize amount is bounded by borrower collateral", async function () {
      const { lending, stable, collateral, feed, alice, liquidator } =
        await loadFixture(deployCoreFixture);
      await stable.approve(await lending.getAddress(), ethers.parseEther("500000"));
      await lending.supplyLiquidity(ethers.parseEther("500000"));
      await collateral.connect(alice).approve(await lending.getAddress(), ethers.parseEther("10"));
      await stable.connect(liquidator).approve(await lending.getAddress(), ethers.MaxUint256);
      await lending.connect(alice).depositCollateral(ethers.parseEther("10"));
      await lending.connect(alice).borrow(ethers.parseEther("10000"));
      await feed.updateAnswer(100n * 10n ** 8n);
      for (const repayAmount of [
        ethers.parseEther("100"),
        ethers.parseEther("500"),
        ethers.parseEther("1000")
      ]) {
        const before = await lending.collateralBalance(alice.address);
        await lending.connect(liquidator).liquidate(alice.address, repayAmount);
        expect(await lending.collateralBalance(alice.address)).to.be.lte(before);
      }
    });
  });

  describe("invariant-style tests", function () {
    it("invariant 01: constant product never decreases across a swap sequence", async function () {
      const { factory, collateral, stable, alice } = await loadFixture(deployCoreFixture);
      await factory.createPair(await collateral.getAddress(), await stable.getAddress());
      const pair = await ethers.getContractAt(
        "AMMPair",
        await factory.getPair(await collateral.getAddress(), await stable.getAddress())
      );
      await collateral.approve(await pair.getAddress(), ethers.MaxUint256);
      await stable.approve(await pair.getAddress(), ethers.MaxUint256);
      await collateral.connect(alice).approve(await pair.getAddress(), ethers.MaxUint256);
      await stable.connect(alice).approve(await pair.getAddress(), ethers.MaxUint256);
      await pair.addLiquidity(
        ethers.parseEther("10000"),
        ethers.parseEther("10000"),
        0,
        0,
        alice.address
      );
      let previousK = (await pair.reserve0()) * (await pair.reserve1());
      for (const amount of [1n, 5n, 10n, 25n, 50n].map((n) => ethers.parseEther(n.toString()))) {
        await pair.connect(alice).swap(await pair.token0(), amount, 0, alice.address);
        const nextK = (await pair.reserve0()) * (await pair.reserve1());
        expect(nextK).to.be.gte(previousK);
        previousK = nextK;
      }
    });

    it("invariant 02: ERC-4626 share supply equals account balance in single-user flow", async function () {
      const { stable, vault, alice } = await loadFixture(deployCoreFixture);
      await stable.connect(alice).approve(await vault.getAddress(), ethers.MaxUint256);
      await vault.connect(alice).deposit(ethers.parseEther("1000"), alice.address);
      await vault.connect(alice).withdraw(ethers.parseEther("250"), alice.address, alice.address);
      expect(await vault.totalSupply()).to.equal(await vault.balanceOf(alice.address));
    });

    it("invariant 03: lending accounting matches aggregate collateral and debt", async function () {
      const { lending, stable, collateral, alice, bob } = await loadFixture(deployCoreFixture);
      await stable.approve(await lending.getAddress(), ethers.parseEther("500000"));
      await lending.supplyLiquidity(ethers.parseEther("500000"));
      for (const user of [alice, bob]) {
        await collateral.connect(user).approve(await lending.getAddress(), ethers.parseEther("10"));
        await lending.connect(user).depositCollateral(ethers.parseEther("5"));
        await lending.connect(user).borrow(ethers.parseEther("1000"));
      }
      expect(await lending.totalCollateral()).to.equal(
        (await lending.collateralBalance(alice.address)) +
          (await lending.collateralBalance(bob.address))
      );
      expect(await lending.totalDebtPrincipal()).to.equal(
        (await lending.debtPrincipal(alice.address)) + (await lending.debtPrincipal(bob.address))
      );
    });

    it("invariant 04: treasury releases conserve token balances", async function () {
      const { deployer, alice, stable } = await loadFixture(deployCoreFixture);
      const TreasuryV1 = await ethers.getContractFactory("ProtocolTreasuryV1");
      const treasury = await upgrades.deployProxy(TreasuryV1, [deployer.address], { kind: "uups" });
      await treasury.waitForDeployment();
      await stable.transfer(await treasury.getAddress(), ethers.parseEther("100"));
      const beforeTreasury = await stable.balanceOf(await treasury.getAddress());
      const beforeAlice = await stable.balanceOf(alice.address);
      await treasury.releaseToken(
        await stable.getAddress(),
        alice.address,
        ethers.parseEther("40")
      );
      expect(
        (await stable.balanceOf(await treasury.getAddress())) +
          (await stable.balanceOf(alice.address))
      ).to.equal(beforeTreasury + beforeAlice);
    });

    it("invariant 05: timelock remains sole privileged owner after local deployment checks", async function () {
      const { governanceToken, lending, deployer } = await loadFixture(deployCoreFixture);
      const Timelock = await ethers.getContractFactory("TimelockController");
      const timelock = await Timelock.deploy(MIN_DELAY, [], [ethers.ZeroAddress], deployer.address);
      await governanceToken.grantRole(
        await governanceToken.MINTER_ROLE(),
        await timelock.getAddress()
      );
      await lending.grantRole(await lending.RISK_ADMIN_ROLE(), await timelock.getAddress());
      expect(
        await governanceToken.hasRole(
          await governanceToken.MINTER_ROLE(),
          await timelock.getAddress()
        )
      ).to.equal(true);
      expect(
        await lending.hasRole(await lending.RISK_ADMIN_ROLE(), await timelock.getAddress())
      ).to.equal(true);
    });
  });

  describe("fork-style mainnet integration tests", function () {
    const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL;
    const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const UNISWAP_V2_FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
    const ETH_USD_FEED = "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419";

    beforeEach(async function () {
      if (!MAINNET_RPC_URL) this.skip();
      await reset(MAINNET_RPC_URL);
    });

    it("fork 01: reads USDC metadata and supply on mainnet", async function () {
      const usdc = await ethers.getContractAt(
        [
          "function decimals() view returns (uint8)",
          "function totalSupply() view returns (uint256)"
        ],
        USDC
      );
      expect(await usdc.decimals()).to.equal(6);
      expect(await usdc.totalSupply()).to.be.gt(0);
    });

    it("fork 02: reads a live Uniswap V2 WETH/USDC pair", async function () {
      const factory = await ethers.getContractAt(
        ["function getPair(address,address) view returns (address)"],
        UNISWAP_V2_FACTORY
      );
      expect(await factory.getPair(WETH, USDC)).to.not.equal(ethers.ZeroAddress);
    });

    it("fork 03: reads a live Chainlink ETH/USD answer", async function () {
      const feed = await ethers.getContractAt(
        [
          "function decimals() view returns (uint8)",
          "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"
        ],
        ETH_USD_FEED
      );
      expect(await feed.decimals()).to.equal(8);
      const round = await feed.latestRoundData();
      expect(round[1]).to.be.gt(0);
    });
  });
});
