// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IPositionNFT} from "../interfaces/IPositionNFT.sol";
import {IPriceOracle} from "../interfaces/IPriceOracle.sol";

contract LendingPool is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant RISK_ADMIN_ROLE = keccak256("RISK_ADMIN_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant LENDING_POSITION = keccak256("LENDING_POSITION");

    uint256 public constant BPS = 10_000;
    uint256 public constant WAD = 1e18;
    uint256 public constant YEAR = 365 days;

    IERC20 public immutable collateralAsset;
    IERC20 public immutable debtAsset;
    IPriceOracle public oracle;
    IPositionNFT public immutable positionNFT;

    uint256 public maxLtvBps = 7_500;
    uint256 public liquidationThresholdBps = 8_500;
    uint256 public liquidationBonusBps = 500;
    uint256 public annualInterestBps = 800;

    mapping(address => uint256) public collateralBalance;
    mapping(address => uint256) public debtPrincipal;
    mapping(address => uint256) public lastAccrual;
    mapping(address => uint256) public liquidityDeposits;
    mapping(address => uint256) public positionTokenId;

    uint256 public totalCollateral;
    uint256 public totalDebtPrincipal;
    uint256 public totalSuppliedLiquidity;

    event CollateralDeposited(address indexed account, uint256 amount);
    event CollateralWithdrawn(address indexed account, uint256 amount);
    event Borrowed(address indexed account, uint256 amount);
    event Repaid(address indexed account, uint256 amount);
    event Liquidated(address indexed liquidator, address indexed account, uint256 repaid, uint256 collateralSeized);
    event LiquiditySupplied(address indexed lender, uint256 amount);
    event LiquidityWithdrawn(address indexed lender, uint256 amount);
    event RiskParametersUpdated(
        uint256 maxLtvBps,
        uint256 liquidationThresholdBps,
        uint256 liquidationBonusBps,
        uint256 annualInterestBps
    );
    event OracleUpdated(address indexed newOracle);

    error InvalidAmount();
    error InvalidRiskParameters();
    error InsufficientLiquidity();
    error BorrowLimitExceeded();
    error HealthyAccount();

    constructor(
        IERC20 collateralAsset_,
        IERC20 debtAsset_,
        IPriceOracle oracle_,
        IPositionNFT positionNFT_,
        address admin
    ) {
        require(address(collateralAsset_) != address(0), "LendingPool: collateral zero");
        require(address(debtAsset_) != address(0), "LendingPool: debt zero");
        require(address(oracle_) != address(0), "LendingPool: oracle zero");
        require(admin != address(0), "LendingPool: admin zero");

        collateralAsset = collateralAsset_;
        debtAsset = debtAsset_;
        oracle = oracle_;
        positionNFT = positionNFT_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RISK_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    function supplyLiquidity(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert InvalidAmount();
        liquidityDeposits[msg.sender] += amount;
        totalSuppliedLiquidity += amount;
        debtAsset.safeTransferFrom(msg.sender, address(this), amount);
        emit LiquiditySupplied(msg.sender, amount);
    }

    function withdrawLiquidity(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0 || amount > liquidityDeposits[msg.sender]) revert InvalidAmount();
        if (amount > debtAsset.balanceOf(address(this))) revert InsufficientLiquidity();

        liquidityDeposits[msg.sender] -= amount;
        totalSuppliedLiquidity -= amount;
        debtAsset.safeTransfer(msg.sender, amount);
        emit LiquidityWithdrawn(msg.sender, amount);
    }

    function depositCollateral(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert InvalidAmount();

        collateralBalance[msg.sender] += amount;
        totalCollateral += amount;
        collateralAsset.safeTransferFrom(msg.sender, address(this), amount);

        if (positionTokenId[msg.sender] == 0 && address(positionNFT) != address(0)) {
            positionTokenId[msg.sender] = positionNFT.mintPosition(msg.sender, LENDING_POSITION);
        }

        emit CollateralDeposited(msg.sender, amount);
    }

    function withdrawCollateral(uint256 amount) external nonReentrant whenNotPaused {
        _accrue(msg.sender);
        if (amount == 0 || amount > collateralBalance[msg.sender]) revert InvalidAmount();

        collateralBalance[msg.sender] -= amount;
        totalCollateral -= amount;
        if (!_withinMaxLtv(msg.sender)) revert BorrowLimitExceeded();

        collateralAsset.safeTransfer(msg.sender, amount);
        emit CollateralWithdrawn(msg.sender, amount);
    }

    function borrow(uint256 amount) external nonReentrant whenNotPaused {
        _accrue(msg.sender);
        if (amount == 0) revert InvalidAmount();
        if (amount > debtAsset.balanceOf(address(this))) revert InsufficientLiquidity();

        debtPrincipal[msg.sender] += amount;
        totalDebtPrincipal += amount;
        if (!_withinMaxLtv(msg.sender)) revert BorrowLimitExceeded();

        debtAsset.safeTransfer(msg.sender, amount);
        emit Borrowed(msg.sender, amount);
    }

    function repay(uint256 amount) external nonReentrant whenNotPaused returns (uint256 repaid) {
        _accrue(msg.sender);
        uint256 debt = debtPrincipal[msg.sender];
        // slither-disable-next-line incorrect-equality
        if (amount == 0 || debt == 0) revert InvalidAmount();

        repaid = amount > debt ? debt : amount;
        debtPrincipal[msg.sender] = debt - repaid;
        totalDebtPrincipal -= repaid;
        debtAsset.safeTransferFrom(msg.sender, address(this), repaid);
        emit Repaid(msg.sender, repaid);
    }

    function liquidate(
        address account,
        uint256 repayAmount
    ) external nonReentrant whenNotPaused returns (uint256 repaid, uint256 seizedCollateral) {
        _accrue(account);
        if (healthFactor(account) >= WAD) revert HealthyAccount();
        if (repayAmount == 0) revert InvalidAmount();

        uint256 debt = debtPrincipal[account];
        repaid = repayAmount > debt ? debt : repayAmount;
        uint256 price = _price();
        seizedCollateral = Math.mulDiv(repaid, WAD * (BPS + liquidationBonusBps), price * BPS);

        if (seizedCollateral > collateralBalance[account]) {
            seizedCollateral = collateralBalance[account];
        }

        debtPrincipal[account] = debt - repaid;
        totalDebtPrincipal -= repaid;
        collateralBalance[account] -= seizedCollateral;
        totalCollateral -= seizedCollateral;

        debtAsset.safeTransferFrom(msg.sender, address(this), repaid);
        collateralAsset.safeTransfer(msg.sender, seizedCollateral);

        emit Liquidated(msg.sender, account, repaid, seizedCollateral);
    }

    function setRiskParameters(
        uint256 maxLtvBps_,
        uint256 liquidationThresholdBps_,
        uint256 liquidationBonusBps_,
        uint256 annualInterestBps_
    ) external onlyRole(RISK_ADMIN_ROLE) {
        if (maxLtvBps_ == 0 || maxLtvBps_ >= liquidationThresholdBps_ || liquidationThresholdBps_ > BPS) {
            revert InvalidRiskParameters();
        }
        if (liquidationBonusBps_ > 2_000 || annualInterestBps_ > 5_000) revert InvalidRiskParameters();

        maxLtvBps = maxLtvBps_;
        liquidationThresholdBps = liquidationThresholdBps_;
        liquidationBonusBps = liquidationBonusBps_;
        annualInterestBps = annualInterestBps_;

        emit RiskParametersUpdated(maxLtvBps_, liquidationThresholdBps_, liquidationBonusBps_, annualInterestBps_);
    }

    function setOracle(IPriceOracle newOracle) external onlyRole(RISK_ADMIN_ROLE) {
        require(address(newOracle) != address(0), "LendingPool: oracle zero");
        oracle = newOracle;
        emit OracleUpdated(address(newOracle));
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function debtOf(address account) public view returns (uint256) {
        uint256 principal = debtPrincipal[account];
        // slither-disable-next-line incorrect-equality
        if (principal == 0) return 0;

        uint256 elapsed = block.timestamp - lastAccrual[account];
        uint256 interest = (principal * annualInterestBps * elapsed) / (BPS * YEAR);
        return principal + interest;
    }

    function collateralValue(address account) public view returns (uint256) {
        return (collateralBalance[account] * _price()) / WAD;
    }

    function borrowCapacity(address account) public view returns (uint256) {
        return (collateralValue(account) * maxLtvBps) / BPS;
    }

    function healthFactor(address account) public view returns (uint256) {
        uint256 debt = debtOf(account);
        // slither-disable-next-line incorrect-equality
        if (debt == 0) return type(uint256).max;
        return (collateralValue(account) * liquidationThresholdBps * WAD) / (debt * BPS);
    }

    function _withinMaxLtv(address account) internal view returns (bool) {
        return debtOf(account) <= borrowCapacity(account);
    }

    function _accrue(address account) internal {
        uint256 last = lastAccrual[account];
        // slither-disable-next-line incorrect-equality
        if (last == 0) {
            lastAccrual[account] = block.timestamp;
            return;
        }

        uint256 principal = debtPrincipal[account];
        // slither-disable-next-line incorrect-equality
        if (principal == 0) {
            lastAccrual[account] = block.timestamp;
            return;
        }

        uint256 elapsed = block.timestamp - last;
        uint256 interest = (principal * annualInterestBps * elapsed) / (BPS * YEAR);
        if (interest != 0) {
            debtPrincipal[account] = principal + interest;
            totalDebtPrincipal += interest;
        }
        lastAccrual[account] = block.timestamp;
    }

    function _price() internal view returns (uint256 priceE18) {
        uint256 updatedAt;
        (priceE18, updatedAt) = oracle.latestPrice();
        updatedAt;
    }
}
