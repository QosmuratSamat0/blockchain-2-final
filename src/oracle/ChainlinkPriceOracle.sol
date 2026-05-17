// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {AggregatorV3Interface} from "../interfaces/AggregatorV3Interface.sol";
import {IPriceOracle} from "../interfaces/IPriceOracle.sol";

contract ChainlinkPriceOracle is AccessControl, IPriceOracle {
    bytes32 public constant ORACLE_ADMIN_ROLE = keccak256("ORACLE_ADMIN_ROLE");

    AggregatorV3Interface public immutable feed;
    uint256 public maxStaleness;

    error InvalidPrice();
    error StalePrice();
    error InvalidStaleness();

    event MaxStalenessUpdated(uint256 previousStaleness, uint256 newStaleness);

    constructor(address admin, AggregatorV3Interface feed_, uint256 maxStaleness_) {
        if (address(feed_) == address(0)) revert InvalidPrice();
        if (maxStaleness_ == 0) revert InvalidStaleness();

        feed = feed_;
        maxStaleness = maxStaleness_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ORACLE_ADMIN_ROLE, admin);
    }

    function setMaxStaleness(uint256 newMaxStaleness) external onlyRole(ORACLE_ADMIN_ROLE) {
        if (newMaxStaleness == 0) revert InvalidStaleness();
        emit MaxStalenessUpdated(maxStaleness, newMaxStaleness);
        maxStaleness = newMaxStaleness;
    }

    function latestPrice() public view returns (uint256 priceE18, uint256 updatedAt) {
        (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt_, uint80 answeredInRound) = feed
            .latestRoundData();
        startedAt;

        if (answer <= 0) revert InvalidPrice();
        if (updatedAt_ == 0 || updatedAt_ + maxStaleness < block.timestamp || answeredInRound < roundId) {
            revert StalePrice();
        }

        return (_scaleAnswer(answer), updatedAt_);
    }

    function _scaleAnswer(int256 answer) internal view returns (uint256) {
        uint256 unsignedAnswer = uint256(answer);
        uint8 feedDecimals = feed.decimals();

        if (feedDecimals == 18) return unsignedAnswer;
        if (feedDecimals < 18) return unsignedAnswer * (10 ** (18 - feedDecimals));
        return unsignedAnswer / (10 ** (feedDecimals - 18));
    }
}
