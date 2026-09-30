// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Axora is ERC721, ReentrancyGuard {
    using Strings for uint256;

    // =============================================================
    //                       COLLECTION
    // =============================================================

    uint256 public constant MAX_SUPPLY = 900;
    uint256 public constant EPOCH_SIZE = 300;

    uint256 public constant EPOCH_1_PRICE = 0.0005 ether;
    uint256 public constant EPOCH_2_PRICE = 0.001 ether;
    uint256 public constant EPOCH_3_PRICE = 0.002 ether;

    uint256 public constant CLAIM_WINDOW = 60 seconds;

    // =============================================================
    //                         PAYOUT
    // =============================================================

    address payable public immutable payoutWallet;

    // =============================================================
    //                         MINING
    // =============================================================

    /*
     * Each discovered block gets a unique block ID.
     *
     * Once claimed, the same block ID cannot be used again.
     */
    mapping(bytes32 => bool) public claimedBlocks;

    // =============================================================
    //                           STATE
    // =============================================================

    uint256 public totalMinted;

    // =============================================================
    //                           EVENTS
    // =============================================================

    event BlockMinted(
        bytes32 indexed blockId,
        address indexed minter,
        uint256 indexed tokenId,
        uint256 epoch,
        uint256 price
    );

    // =============================================================
    //                         CONSTRUCTOR
    // =============================================================

    constructor(
        address payable payoutWallet_
    )
        ERC721("AXORA", "AXR")
    {
        require(
            payoutWallet_ != address(0),
            "Invalid payout wallet"
        );

        payoutWallet = payoutWallet_;
    }

    // =============================================================
    //                           MINT
    // =============================================================

    /**
     * @notice Mint 1 AXORA NFT after finding a block.
     *
     * The frontend/mining engine supplies:
     *
     * blockId  = discovered block identifier
     * deadline = timestamp before which the mint must happen
     *
     * The contract only accepts a deadline that is:
     *
     * now <= deadline <= now + 60 seconds
     *
     * NOTE:
     * This contract intentionally does NOT perform expensive
     * proof-of-work verification on-chain. The mining engine is
     * handled by the website.
     */
    function mintWithBlock(
        bytes32 blockId,
        uint256 deadline
    )
        external
        payable
        nonReentrant
    {
        require(
            totalMinted < MAX_SUPPLY,
            "AXORA sold out"
        );

        require(
            blockId != bytes32(0),
            "Invalid block"
        );

        require(
            !claimedBlocks[blockId],
            "Block already claimed"
        );

        require(
            deadline >= block.timestamp,
            "Claim expired"
        );

        require(
            deadline <= block.timestamp + CLAIM_WINDOW,
            "Invalid claim window"
        );

        uint256 epoch = currentEpoch();
        uint256 price = currentPrice();

        require(
            msg.value == price,
            "Incorrect mint fee"
        );

        /*
         * Mark block as claimed BEFORE minting.
         */
        claimedBlocks[blockId] = true;

        totalMinted++;

        uint256 tokenId = totalMinted;

        _safeMint(msg.sender, tokenId);

        /*
         * Immediately send the mint payment
         * to the configured payout wallet.
         */
        (bool success, ) = payoutWallet.call{
            value: msg.value
        }("");

        require(
            success,
            "Payment transfer failed"
        );

        emit BlockMinted(
            blockId,
            msg.sender,
            tokenId,
            epoch,
            price
        );
    }

    // =============================================================
    //                         EPOCH LOGIC
    // =============================================================

    function currentEpoch()
        public
        view
        returns (uint256)
    {
        if (totalMinted < 300) {
            return 1;
        }

        if (totalMinted < 600) {
            return 2;
        }

        if (totalMinted < 900) {
            return 3;
        }

        revert("AXORA sold out");
    }

    function currentPrice()
        public
        view
        returns (uint256)
    {
        uint256 epoch = currentEpoch();

        if (epoch == 1) {
            return EPOCH_1_PRICE;
        }

        if (epoch == 2) {
            return EPOCH_2_PRICE;
        }

        return EPOCH_3_PRICE;
    }

    function epochPrice(
        uint256 epoch
    )
        public
        pure
        returns (uint256)
    {
        if (epoch == 1) {
            return EPOCH_1_PRICE;
        }

        if (epoch == 2) {
            return EPOCH_2_PRICE;
        }

        if (epoch == 3) {
            return EPOCH_3_PRICE;
        }

        revert("Invalid epoch");
    }

    function epochMinted(
        uint256 epoch
    )
        public
        view
        returns (uint256)
    {
        require(
            epoch >= 1 && epoch <= 3,
            "Invalid epoch"
        );

        if (epoch == 1) {
            return totalMinted > 300
                ? 300
                : totalMinted;
        }

        if (epoch == 2) {
            if (totalMinted <= 300) {
                return 0;
            }

            return totalMinted > 600
                ? 300
                : totalMinted - 300;
        }

        if (totalMinted <= 600) {
            return 0;
        }

        return totalMinted - 600;
    }

    // =============================================================
    //                         SUPPLY
    // =============================================================

    function remainingSupply()
        external
        view
        returns (uint256)
    {
        return MAX_SUPPLY - totalMinted;
    }

    // =============================================================
    //                         METADATA
    // =============================================================

    /**
     * @notice Metadata is generated directly on-chain.
     *
     * All 900 NFTs use the same artwork.
     * Each token still has its own token ID/name.
     */
    function tokenURI(
        uint256 tokenId
    )
        public
        view
        override
        returns (string memory)
    {
        require(
            _ownerOf(tokenId) != address(0),
            "Token does not exist"
        );

        string memory json = string(
            abi.encodePacked(
                '{"name":"AXORA #',
                tokenId.toString(),
                '",',
                '"description":"AXORA is an onchain collectible on Robinhood Chain.",',
                '"image":"ipfs://bafkreieae5u77f6p4puvwzk6e256g6aerz3wd5dixrpo7bhu7d323ievqe"',
                '}'
            )
        );

        return string(
            abi.encodePacked(
                "data:application/json;base64,",
                Base64.encode(
                    bytes(json)
                )
            )
        );
    }

    // =============================================================
    //                       CONTRACT BALANCE
    // =============================================================

    /*
     * Mint payments are forwarded immediately to payoutWallet.
     *
     * This fallback exists only so the contract can safely receive
     * ETH sent directly to it.
     */
    receive() external payable {}
}
