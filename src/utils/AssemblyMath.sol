// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AssemblyMath {
    function sumSolidity(uint256[] calldata values) external pure returns (uint256 total) {
        for (uint256 i = 0; i < values.length; i++) {
            unchecked {
                total += values[i];
            }
        }
    }

    function sumYul(uint256[] calldata values) external pure returns (uint256 total) {
        assembly {
            let offset := values.offset
            let end := add(offset, mul(values.length, 0x20))

            for {

            } lt(offset, end) {
                offset := add(offset, 0x20)
            } {
                total := add(total, calldataload(offset))
            }
        }
    }
}
