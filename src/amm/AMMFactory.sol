// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {AMMPair} from "./AMMPair.sol";

contract AMMFactory is AccessControl {
    bytes32 public constant FACTORY_ADMIN_ROLE = keccak256("FACTORY_ADMIN_ROLE");

    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    event PairCreated(
        address indexed token0,
        address indexed token1,
        address indexed pair,
        bytes32 salt,
        bool deterministic
    );

    error IdenticalTokens();
    error InvalidToken();
    error PairExists();

    constructor(address admin) {
        require(admin != address(0), "AMMFactory: admin zero");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(FACTORY_ADMIN_ROLE, admin);
    }

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    function createPair(address tokenA, address tokenB) external returns (address pair) {
        (address token0, address token1) = _sortTokens(tokenA, tokenB);
        _requirePairDoesNotExist(token0, token1);

        AMMPair deployedPair = new AMMPair();
        // slither-disable-next-line reentrancy-no-eth,reentrancy-benign,reentrancy-events
        deployedPair.initialize(token0, token1, msg.sender);
        pair = address(deployedPair);
        _registerPair(token0, token1, pair, bytes32(0), false);
    }

    function createPairDeterministic(address tokenA, address tokenB, bytes32 salt) external returns (address pair) {
        (address token0, address token1) = _sortTokens(tokenA, tokenB);
        _requirePairDoesNotExist(token0, token1);

        bytes32 finalSalt = _pairSalt(token0, token1, salt);
        AMMPair deployedPair = new AMMPair{salt: finalSalt}();
        // slither-disable-next-line reentrancy-no-eth,reentrancy-benign,reentrancy-events
        deployedPair.initialize(token0, token1, msg.sender);
        pair = address(deployedPair);
        _registerPair(token0, token1, pair, finalSalt, true);
    }

    function predictDeterministicAddress(
        address tokenA,
        address tokenB,
        bytes32 salt
    ) external view returns (address predicted) {
        (address token0, address token1) = _sortTokens(tokenA, tokenB);
        bytes32 finalSalt = _pairSalt(token0, token1, salt);
        bytes32 bytecodeHash = keccak256(type(AMMPair).creationCode);
        bytes32 digest = keccak256(abi.encodePacked(bytes1(0xff), address(this), finalSalt, bytecodeHash));
        predicted = address(uint160(uint256(digest)));
    }

    function _registerPair(address token0, address token1, address pair, bytes32 salt, bool deterministic) internal {
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        allPairs.push(pair);
        emit PairCreated(token0, token1, pair, salt, deterministic);
    }

    function _requirePairDoesNotExist(address token0, address token1) internal view {
        if (getPair[token0][token1] != address(0)) revert PairExists();
    }

    function _sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        if (tokenA == tokenB) revert IdenticalTokens();
        if (tokenA == address(0) || tokenB == address(0)) revert InvalidToken();
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    }

    function _pairSalt(address token0, address token1, bytes32 salt) internal pure returns (bytes32) {
        return keccak256(abi.encode(token0, token1, salt));
    }
}
