    // SPDX-License-Identifier: MIT
    pragma solidity ^0.8.29;

    import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
    import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

    /**
    * @title SmartTags - ERC721-based Property Registration System
    * @notice This contract allows authorized registrars to register and update property records represented as NFTs
    */
    contract SmartTags is ERC721, ERC721URIStorage {
        uint256 private _nextTokenId = 1;
        address public immutable SUPER_ADMIN;

        /**
        * @notice Property structure storing token metadata
        */
        struct Property {
            uint256 tokenId;
            string cid;
            address landOwner;
        }

        mapping(uint256 => Property) private _properties;

        event PropertyRegistered(
            uint256 indexed tokenId,
            address indexed landOwner
        );

        event PropertyUpdated(
            uint256 indexed tokenId,
            address indexed updatedBy
        );

        /**
        * @dev Sets the SUPER_ADMIN to contract deployer and initializes ERC721 token
        */
        constructor() ERC721("SmartTags", "STA") {
            SUPER_ADMIN = msg.sender;
        }

        /**
        * @dev Restricts access to only the SUPER_ADMIN
        */
        modifier onlyRegistrar() {
            require(msg.sender == SUPER_ADMIN, "Not authorized");
            _;
        }

        /**
        * @notice Registers new land property with IPFS metadata
        * @param cid IPFS Content Identifier for property metadata
        * @return tokenId ID of the newly minted NFT
        */
        function registerLand(string calldata cid)
            external
            onlyRegistrar
            returns (uint256 tokenId)
        {
            require(bytes(cid).length != 0, "CID required");

            tokenId = _nextTokenId++;
            _safeMint(msg.sender, tokenId);

            // Set the token URI to ipfs://CID
            _setTokenURI(tokenId, string(abi.encodePacked("ipfs://", cid)));

            _properties[tokenId] = Property({
                tokenId: tokenId,
                cid: cid,
                landOwner: msg.sender
            });

            emit PropertyRegistered(tokenId, msg.sender);
        }

        /**
        * @notice Updates existing property metadata
        * @param tokenId ID of the property NFT to update
        * @param newCid New IPFS Content Identifier
        */
        function updateProperty(uint256 tokenId, string calldata newCid)
            external
            onlyRegistrar
        {
            require(_ownerOf(tokenId) != address(0), "Invalid tokenId");
            require(bytes(newCid).length != 0, "CID required");

            _setTokenURI(tokenId, string(abi.encodePacked("ipfs://", newCid)));
            _properties[tokenId].cid = newCid;

            emit PropertyUpdated(tokenId, msg.sender);
        }

        /**
        * @notice Retrieves property details by token ID
        * @param tokenId ID of the property NFT
        * @return Property structure containing token metadata
        */
        function getProperty(uint256 tokenId) external view returns (Property memory) {
            require(_ownerOf(tokenId) != address(0), "Invalid tokenId");
            return _properties[tokenId];
        }

        // Required overrides for multiple inheritance
        function tokenURI(uint256 tokenId)
            public
            view
            override(ERC721, ERC721URIStorage)
            returns (string memory)
        {
            return super.tokenURI(tokenId);
        }

        function supportsInterface(bytes4 interfaceId)
            public
            view
            override(ERC721, ERC721URIStorage)
            returns (bool)
        {
            return super.supportsInterface(interfaceId);
        }
    }
