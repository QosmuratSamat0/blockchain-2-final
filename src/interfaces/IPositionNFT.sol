// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPositionNFT {
    function mintPosition(address to, bytes32 kind) external returns (uint256);
}
