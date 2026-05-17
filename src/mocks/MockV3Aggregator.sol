// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AggregatorV3Interface} from "../interfaces/AggregatorV3Interface.sol";

contract MockV3Aggregator is AggregatorV3Interface {
    uint8 public immutable override decimals;
    string public override description;
    uint256 public immutable override version = 1;

    uint80 public latestRound;
    mapping(uint80 => int256) private _answers;
    mapping(uint80 => uint256) private _startedAt;
    mapping(uint80 => uint256) private _updatedAt;
    mapping(uint80 => uint80) private _answeredInRound;

    constructor(uint8 decimals_, int256 initialAnswer) {
        decimals = decimals_;
        description = "Mock Chainlink Aggregator";
        updateAnswer(initialAnswer);
    }

    function updateAnswer(int256 answer) public {
        latestRound++;
        _answers[latestRound] = answer;
        _startedAt[latestRound] = block.timestamp;
        _updatedAt[latestRound] = block.timestamp;
        _answeredInRound[latestRound] = latestRound;
    }

    function updateRoundData(uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt) external {
        latestRound = roundId;
        _answers[roundId] = answer;
        _startedAt[roundId] = startedAt;
        _updatedAt[roundId] = updatedAt;
        _answeredInRound[roundId] = roundId;
    }

    function getRoundData(uint80 roundId) external view returns (uint80, int256, uint256, uint256, uint80) {
        return (roundId, _answers[roundId], _startedAt[roundId], _updatedAt[roundId], _answeredInRound[roundId]);
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (
            latestRound,
            _answers[latestRound],
            _startedAt[latestRound],
            _updatedAt[latestRound],
            _answeredInRound[latestRound]
        );
    }
}
