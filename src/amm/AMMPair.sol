// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract AMMPair is ERC20, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    uint256 public constant FEE_BPS = 30;
    uint256 public constant BPS = 10_000;
    uint256 public constant MINIMUM_LIQUIDITY = 1_000;
    address public constant DEAD_SHARES = address(0x000000000000000000000000000000000000dEaD);

    IERC20 public token0;
    IERC20 public token1;
    uint256 public reserve0;
    uint256 public reserve1;
    bool public initialized;

    event Initialized(address indexed token0, address indexed token1, address indexed admin);
    event LiquidityAdded(
        address indexed provider,
        address indexed to,
        uint256 amount0,
        uint256 amount1,
        uint256 liquidity
    );
    event LiquidityRemoved(
        address indexed provider,
        address indexed to,
        uint256 amount0,
        uint256 amount1,
        uint256 liquidity
    );
    event Swap(
        address indexed sender,
        address indexed tokenIn,
        address indexed to,
        uint256 amountIn,
        uint256 amountOut
    );

    error AlreadyInitialized();
    error IdenticalTokens();
    error InvalidToken();
    error InsufficientAmount();
    error InsufficientLiquidity();
    error SlippageExceeded();

    constructor() ERC20("DeFi SuperApp LP", "DSLP") {}

    function initialize(address token0_, address token1_, address admin) external {
        if (initialized) revert AlreadyInitialized();
        if (token0_ == token1_) revert IdenticalTokens();
        if (token0_ == address(0) || token1_ == address(0) || admin == address(0)) revert InvalidToken();

        initialized = true;
        token0 = IERC20(token0_);
        token1 = IERC20(token1_);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);

        emit Initialized(token0_, token1_, admin);
    }

    function addLiquidity(
        uint256 amount0Desired,
        uint256 amount1Desired,
        uint256 amount0Min,
        uint256 amount1Min,
        address to
    ) external nonReentrant whenNotPaused returns (uint256 amount0, uint256 amount1, uint256 liquidity) {
        if (to == address(0) || amount0Desired == 0 || amount1Desired == 0) revert InsufficientAmount();

        (amount0, amount1) = _quoteLiquidity(amount0Desired, amount1Desired);
        if (amount0 < amount0Min || amount1 < amount1Min) revert SlippageExceeded();

        // slither-disable-start reentrancy-no-eth
        token0.safeTransferFrom(msg.sender, address(this), amount0);
        token1.safeTransferFrom(msg.sender, address(this), amount1);

        uint256 supply = totalSupply();
        // slither-disable-next-line incorrect-equality
        if (supply == 0) {
            liquidity = Math.sqrt(amount0 * amount1);
            if (liquidity <= MINIMUM_LIQUIDITY) revert InsufficientLiquidity();
            liquidity -= MINIMUM_LIQUIDITY;
            _mint(DEAD_SHARES, MINIMUM_LIQUIDITY);
        } else {
            liquidity = Math.min((amount0 * supply) / reserve0, (amount1 * supply) / reserve1);
        }

        // slither-disable-next-line incorrect-equality
        if (liquidity == 0) revert InsufficientLiquidity();
        _mint(to, liquidity);
        _sync();
        // slither-disable-end reentrancy-no-eth

        emit LiquidityAdded(msg.sender, to, amount0, amount1, liquidity);
    }

    function removeLiquidity(
        uint256 liquidity,
        uint256 amount0Min,
        uint256 amount1Min,
        address to
    ) external nonReentrant whenNotPaused returns (uint256 amount0, uint256 amount1) {
        if (to == address(0) || liquidity == 0) revert InsufficientAmount();

        uint256 supply = totalSupply();
        amount0 = (liquidity * reserve0) / supply;
        amount1 = (liquidity * reserve1) / supply;
        if (amount0 < amount0Min || amount1 < amount1Min) revert SlippageExceeded();
        // slither-disable-next-line incorrect-equality
        if (amount0 == 0 || amount1 == 0) revert InsufficientLiquidity();

        _burn(msg.sender, liquidity);
        // slither-disable-start reentrancy-no-eth
        token0.safeTransfer(to, amount0);
        token1.safeTransfer(to, amount1);
        _sync();
        // slither-disable-end reentrancy-no-eth

        emit LiquidityRemoved(msg.sender, to, amount0, amount1, liquidity);
    }

    function swap(
        address tokenIn,
        uint256 amountIn,
        uint256 amountOutMin,
        address to
    ) external nonReentrant whenNotPaused returns (uint256 amountOut) {
        if (to == address(0) || amountIn == 0) revert InsufficientAmount();
        if (tokenIn != address(token0) && tokenIn != address(token1)) revert InvalidToken();

        bool zeroForOne = tokenIn == address(token0);
        IERC20 input = zeroForOne ? token0 : token1;
        IERC20 output = zeroForOne ? token1 : token0;

        amountOut = getAmountOut(tokenIn, amountIn);
        if (amountOut < amountOutMin) revert SlippageExceeded();

        // slither-disable-start reentrancy-no-eth
        input.safeTransferFrom(msg.sender, address(this), amountIn);
        output.safeTransfer(to, amountOut);
        _sync();
        // slither-disable-end reentrancy-no-eth

        if (reserve0 * reserve1 < (reserve0 - (zeroForOne ? amountIn : 0)) * (reserve1 - (zeroForOne ? 0 : amountIn))) {
            revert InsufficientLiquidity();
        }

        emit Swap(msg.sender, tokenIn, to, amountIn, amountOut);
    }

    function getAmountOut(address tokenIn, uint256 amountIn) public view returns (uint256 amountOut) {
        if (amountIn == 0) revert InsufficientAmount();
        // slither-disable-next-line incorrect-equality
        if (reserve0 == 0 || reserve1 == 0) revert InsufficientLiquidity();
        if (tokenIn != address(token0) && tokenIn != address(token1)) revert InvalidToken();

        bool zeroForOne = tokenIn == address(token0);
        uint256 reserveIn = zeroForOne ? reserve0 : reserve1;
        uint256 reserveOut = zeroForOne ? reserve1 : reserve0;
        uint256 amountInWithFee = amountIn * (BPS - FEE_BPS);
        amountOut = (reserveOut * amountInWithFee) / ((reserveIn * BPS) + amountInWithFee);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _quoteLiquidity(
        uint256 amount0Desired,
        uint256 amount1Desired
    ) internal view returns (uint256 amount0, uint256 amount1) {
        // slither-disable-next-line incorrect-equality
        if (reserve0 == 0 && reserve1 == 0) return (amount0Desired, amount1Desired);

        uint256 amount1Optimal = (amount0Desired * reserve1) / reserve0;
        if (amount1Optimal <= amount1Desired) {
            return (amount0Desired, amount1Optimal);
        }

        uint256 amount0Optimal = (amount1Desired * reserve0) / reserve1;
        return (amount0Optimal, amount1Desired);
    }

    function _sync() internal {
        reserve0 = token0.balanceOf(address(this));
        reserve1 = token1.balanceOf(address(this));
    }

    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
