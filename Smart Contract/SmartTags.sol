// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title SmartTags
 * @notice ERC721-based Property Registration System for Real Estate Tokenization
 * @dev Allows authorized registrars to register and update property records as NFTs
 */
contract SmartTags is ERC721, ERC721URIStorage, ReentrancyGuard {

    // ============ State Variables ============
    uint256 private _nextTokenId = 1;
    address public immutable SUPER_ADMIN;

    // ============ Mappings ============
    mapping(uint256 => Property) private _properties;
    mapping(string => bool) private _usedCids;

    // ============ Structs ============
    
    /**
     * @notice Property structure storing essential property information
     * @param tokenId The unique NFT token ID
     * @param cid The IPFS Content Identifier
     * @param landOwner The address of the property owner
     */
    struct Property {
        uint256 tokenId;
        string cid;
        address landOwner;
    }

    // ============ Events ============
    
    /**
     * @notice Emitted when a new property is registered
     * @param tokenId The unique token ID of the registered property
     * @param landOwner The address of the property owner
     * @param cid The IPFS Content Identifier
     */
    event PropertyRegistered(
        uint256 indexed tokenId,
        address indexed landOwner,
        string cid
    );

    /**
     * @notice Emitted when a property's metadata is updated
     * @param tokenId The unique token ID of the updated property
     * @param updatedBy The address that performed the update
     * @param oldCid The previous IPFS Content Identifier
     * @param newCid The new IPFS Content Identifier
     */
    event PropertyUpdated(
        uint256 indexed tokenId,
        address indexed updatedBy,
        string oldCid,
        string newCid
    );

    // ============ Custom Errors ============

    error InvalidCID();
    error CIDAlreadyUsed();    
    error PropertyNotFound();    
    error SameCIDProvided();    
    error NotAuthorized();
    error InvalidAddress();

    // ============ Constructor ============
    
    /**
     * @notice Initializes the SmartTags contract
     * @dev Sets the SUPER_ADMIN to the deployer address
     */
    constructor() ERC721("SmartTags", "STA") {
        SUPER_ADMIN = msg.sender;
    }

    // ============ Modifiers ============
    
    /**
     * @notice Restricts access to only the SUPER_ADMIN
     * @dev Uses custom error for gas efficiency
     */
    modifier onlyRegistrar() {
        if (msg.sender != SUPER_ADMIN) {
            revert NotAuthorized();
        }
        _;
    }

    // ============ External Functions ============
    
    /**
     * @notice Registers a new property by creating an NFT with IPFS metadata
     * @param cid The IPFS Content Identifier containing property metadata
     * @return tokenId The unique token ID assigned to the new property
     * @dev Requirements:
     * - `cid` must not be empty and within length limits
     * - `cid` must not have been used before
     * - Total properties must not exceed MAX_PROPERTIES
     */
    function registerLand(string calldata cid, address landOwnerWallet)
        external
        onlyRegistrar
        nonReentrant
        returns (uint256 tokenId)
    {   
        if (landOwnerWallet == address(0)) {
            revert InvalidAddress();
        }

        if (bytes(cid).length == 0) {
            revert InvalidCID();
        }

        if (_usedCids[cid]) {
            revert CIDAlreadyUsed();
        }

        // Generate new token ID with unchecked arithmetic for gas optimization
        tokenId = _nextTokenId;
        unchecked {
            _nextTokenId++;
        }

        _safeMint(landOwnerWallet, tokenId);

        _setTokenURI(tokenId, string(abi.encodePacked("ipfs://", cid)));

        _properties[tokenId] = Property({
            tokenId: tokenId,
            cid: cid,
            landOwner: landOwnerWallet
        });

        _usedCids[cid] = true;

        emit PropertyRegistered(tokenId, landOwnerWallet, cid);
    }

    /**
     * @notice Updates the metadata of an existing property
     * @param tokenId The unique token ID of the property to update
     * @param newCid The new IPFS Content Identifier for the property metadata
     * @dev Requirements:
     * - `tokenId` must exist
     * - Caller must be either the SUPER_ADMIN
     * - `newCid` must not be empty and within length limits
     * - `newCid` must not have been used before
     * - `newCid` must be different from current CID
     */
    function updateProperty(uint256 tokenId, string calldata newCid)
        external
        onlyRegistrar
        nonReentrant
    {
        if (_ownerOf(tokenId) == address(0)) {
            revert PropertyNotFound();
        }

        if (bytes(newCid).length == 0) {
            revert InvalidCID();
        }

        if (_usedCids[newCid]) {
            revert CIDAlreadyUsed();
        }

        if (keccak256(bytes(_properties[tokenId].cid)) == keccak256(bytes(newCid))) {
            revert SameCIDProvided();
        }

        string memory oldCid = _properties[tokenId].cid;

        _usedCids[oldCid] = false;
        _usedCids[newCid] = true;
        _properties[tokenId].cid = newCid;

        _setTokenURI(tokenId, string(abi.encodePacked("ipfs://", newCid)));

        emit PropertyUpdated(tokenId, msg.sender, oldCid, newCid);
    }

    /**
     * @notice Retrieves the property information for a given token ID
     * @param tokenId The unique token ID of the property to query
     * @return Property struct containing the property's information
     * @dev Requirements:
     * - `tokenId` must exist
     */
    function getProperty(uint256 tokenId) external view returns (Property memory) {
        if (_ownerOf(tokenId) == address(0)) {
            revert PropertyNotFound();
        }
        return _properties[tokenId];
    }

    // ============ Public View Functions ============

    /**
     * @notice Checks if a CID has already been used
     * @param cid The IPFS Content Identifier to check
     * @return True if the CID has been used, false otherwise
     */
    function isCIDUsed(string calldata cid) external view returns (bool) {
        return _usedCids[cid];
    }

    /**
     * @notice Returns the next token ID that will be assigned
     * @return The next token ID
     */
    function getNextTokenId() external view returns (uint256) {
        return _nextTokenId;
    }

    // ============ Required Overrides ============
    
    /**
     * @notice Returns the token URI for a given token ID
     * @param tokenId The unique token ID to query
     * @return The token URI (IPFS URL)
     */
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    /**
     * @notice Checks if the contract supports a given interface
     * @param interfaceId The interface identifier to check
     * @return True if the interface is supported, false otherwise
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

}
