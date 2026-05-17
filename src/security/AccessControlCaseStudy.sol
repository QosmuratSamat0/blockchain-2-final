// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract VulnerableParameterStore {
    uint256 public feeBps;

    function setFeeBps(uint256 newFeeBps) external {
        require(newFeeBps <= 1_000, "VulnerableParameterStore: too high");
        feeBps = newFeeBps;
    }
}

contract FixedParameterStore is AccessControl {
    bytes32 public constant PARAMETER_ADMIN_ROLE = keccak256("PARAMETER_ADMIN_ROLE");

    uint256 public feeBps;

    constructor(address admin) {
        require(admin != address(0), "FixedParameterStore: admin zero");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PARAMETER_ADMIN_ROLE, admin);
    }

    function setFeeBps(uint256 newFeeBps) external onlyRole(PARAMETER_ADMIN_ROLE) {
        require(newFeeBps <= 1_000, "FixedParameterStore: too high");
        feeBps = newFeeBps;
    }
}
