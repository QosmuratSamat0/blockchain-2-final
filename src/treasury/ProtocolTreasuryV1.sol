// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract ProtocolTreasuryV1 is Initializable, AccessControlUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    bytes32 public constant TREASURER_ROLE = keccak256("TREASURER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    event NativeReceived(address indexed sender, uint256 amount);
    event NativeReleased(address indexed to, uint256 amount);
    event TokenReleased(address indexed token, address indexed to, uint256 amount);

    error NativeTransferFailed();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin) public initializer {
        require(admin != address(0), "ProtocolTreasury: admin zero");
        __AccessControl_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(TREASURER_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
    }

    receive() external payable {
        emit NativeReceived(msg.sender, msg.value);
    }

    function releaseToken(IERC20 token, address to, uint256 amount) external onlyRole(TREASURER_ROLE) nonReentrant {
        require(to != address(0), "ProtocolTreasury: to zero");
        token.safeTransfer(to, amount);
        emit TokenReleased(address(token), to, amount);
    }

    function releaseNative(address payable to, uint256 amount) external onlyRole(TREASURER_ROLE) nonReentrant {
        require(to != address(0), "ProtocolTreasury: to zero");
        // slither-disable-next-line arbitrary-send-eth,low-level-calls
        (bool success, ) = to.call{value: amount}("");
        if (!success) revert NativeTransferFailed();
        emit NativeReleased(to, amount);
    }

    function version() public pure virtual returns (string memory) {
        return "1.0.0";
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    uint256[49] private __gap;
}
