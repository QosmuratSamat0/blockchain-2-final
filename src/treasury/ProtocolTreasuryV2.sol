// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ProtocolTreasuryV1} from "./ProtocolTreasuryV1.sol";

contract ProtocolTreasuryV2 is ProtocolTreasuryV1 {
    using SafeERC20 for IERC20;

    function sweepToken(IERC20 token, address to) external onlyRole(TREASURER_ROLE) nonReentrant {
        require(to != address(0), "ProtocolTreasury: to zero");
        uint256 amount = token.balanceOf(address(this));
        token.safeTransfer(to, amount);
        emit TokenReleased(address(token), to, amount);
    }

    function version() public pure override returns (string memory) {
        return "2.0.0";
    }
}
