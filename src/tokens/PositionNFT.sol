// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IPositionNFT} from "../interfaces/IPositionNFT.sol";

contract PositionNFT is ERC721, AccessControl, IPositionNFT {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    uint256 private _nextTokenId = 1;
    mapping(uint256 => bytes32) public positionType;

    event PositionMinted(address indexed account, uint256 indexed tokenId, bytes32 indexed kind);

    constructor(address admin) ERC721("DeFi SuperApp Position", "DSPOS") {
        require(admin != address(0), "PositionNFT: admin zero");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
    }

    function mintPosition(address to, bytes32 kind) external onlyRole(MINTER_ROLE) returns (uint256 tokenId) {
        tokenId = _nextTokenId++;
        positionType[tokenId] = kind;
        _safeMint(to, tokenId);
        emit PositionMinted(to, tokenId, kind);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
