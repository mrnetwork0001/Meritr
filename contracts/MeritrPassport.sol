// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

import {CreditMath} from "./libraries/CreditMath.sol";
import {IMeritrAttestor} from "./interfaces/IMeritrAttestor.sol";

/**
 * @title MeritrPassport
 * @author Meritr (Ifeanyichukwu Onwo)
 * @notice Subsystem 4 of 4 - the Soulbound Cross-Chain Credit Passport.
 *
 * @dev A non-transferable ERC-721 that carries a borrower's cross-chain credit memory as
 *      onchain state. One passport per address, forever bound to it.
 *
 *      **Why soulbound matters here, and not just as a buzzword:** a transferable credit NFT
 *      is a credit score with a market price. Anyone could farm a pristine score on a clean
 *      wallet and sell it to a defaulter, which is precisely the attack that makes
 *      collateral-free lending impossible onchain today. Meritr enforces non-transferability
 *      at the `_update` hook, the single chokepoint every ERC-721 movement passes through, so
 *      mint and burn work while every transfer path - `transferFrom`, `safeTransferFrom`,
 *      operator or not - reverts.
 *
 *      **Privacy.** The passport publishes a coarse *tier* and a commitment to the underlying
 *      facts, not the raw cross-chain balances. `factsCommitment` is a keccak256 binding of the
 *      exact attested inputs used at refresh time. A holder can disclose their facts to a
 *      counterparty off-chain and that counterparty can verify the commitment matches what the
 *      chain recorded - selective disclosure without publishing a borrower's whole financial
 *      position. This is a hash commitment, not a zero-knowledge proof: it hides the values but
 *      proves nothing about them on its own. It is the intended substitution point for a
 *      SNARK-based range proof, which is future work and is not claimed here.
 */
contract MeritrPassport is ERC721, AccessControl {
    using Strings for uint256;

    bytes32 public constant REFRESHER_ROLE = keccak256("REFRESHER_ROLE");

    /// @notice Onchain credit memory carried by a passport.
    struct PassportData {
        uint16 score;
        uint8 tier; // 0 Bronze .. 4 Diamond
        uint32 attestationCount;
        uint32 chainCount;
        uint64 mintedAt;
        uint64 refreshedAt;
        bytes32 factsCommitment;
    }

    IMeritrAttestor public immutable ATTESTOR;

    uint256 private _nextId = 1;

    mapping(uint256 tokenId => PassportData) private _data;
    mapping(address holder => uint256 tokenId) public passportOf;

    event PassportMinted(address indexed holder, uint256 indexed tokenId, uint16 score);
    event PassportRefreshed(
        uint256 indexed tokenId, uint16 previousScore, uint16 newScore, bytes32 factsCommitment
    );

    error SoulboundTransferDisabled();
    error PassportAlreadyIssued(address holder);
    error NoAttestationsYet(address holder);
    error NoPassport(address holder);

    constructor(address admin, IMeritrAttestor attestor) ERC721("Meritr Credit Passport", "MERITR") {
        ATTESTOR = attestor;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REFRESHER_ROLE, admin);
    }

    // ---------------------------------------------------------------------
    // Issuance
    // ---------------------------------------------------------------------

    /**
     * @notice Mint the caller's passport. Permissionless, but earned: an address with no
     *         Attestcoin-verified history has nothing to put on a passport and is rejected.
     */
    function mint() external returns (uint256 tokenId) {
        return _mintFor(msg.sender);
    }

    /// @notice Mint on behalf of `holder`, so a relayer can onboard a borrower gaslessly.
    function mintFor(address holder) external onlyRole(REFRESHER_ROLE) returns (uint256 tokenId) {
        return _mintFor(holder);
    }

    function _mintFor(address holder) private returns (uint256 tokenId) {
        if (passportOf[holder] != 0) revert PassportAlreadyIssued(holder);
        if (!ATTESTOR.hasAttestations(holder)) revert NoAttestationsYet(holder);

        tokenId = _nextId++;
        _safeMint(holder, tokenId);
        passportOf[holder] = tokenId;

        _data[tokenId].mintedAt = uint64(block.timestamp);
        _refresh(tokenId, holder);

        emit PassportMinted(holder, tokenId, _data[tokenId].score);
    }

    // ---------------------------------------------------------------------
    // Refresh
    // ---------------------------------------------------------------------

    /**
     * @notice Pull the holder's latest attested facts from the attestor and restamp the
     *         passport. Permissionless by design - refreshing reads only from the
     *         proof-verified attestor, so there is nothing for a caller to manipulate, and
     *         leaving it open means a stale passport is always somebody's cheap fix.
     */
    function refresh(address holder) external returns (uint16 newScore) {
        uint256 tokenId = passportOf[holder];
        if (tokenId == 0) revert NoPassport(holder);
        return _refresh(tokenId, holder);
    }

    function _refresh(uint256 tokenId, address holder) private returns (uint16 newScore) {
        CreditMath.CreditFacts memory f = ATTESTOR.factsOf(holder);
        CreditMath.ScoreBreakdown memory b = ATTESTOR.scoreOf(holder);

        PassportData storage d = _data[tokenId];
        uint16 previous = d.score;

        d.score = b.score;
        d.tier = _tierOf(b.score);
        d.attestationCount = f.attestationCount;
        d.chainCount = f.chainCount;
        d.refreshedAt = uint64(block.timestamp);
        d.factsCommitment = commitFacts(f);

        emit PassportRefreshed(tokenId, previous, b.score, d.factsCommitment);
        return b.score;
    }

    /**
     * @notice Binding commitment to a borrower's exact attested facts.
     * @dev Anyone handed the underlying `CreditFacts` off-chain can recompute this and check it
     *      against the passport, confirming the disclosure is the same data the chain scored.
     */
    function commitFacts(CreditMath.CreditFacts memory f) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                f.totalRepaidE8,
                f.totalCollateralE8,
                f.firstActivityAt,
                f.lastActivityAt,
                f.repaymentCount,
                f.liquidationCount,
                f.chainCount,
                f.attestationCount
            )
        );
    }

    // ---------------------------------------------------------------------
    // Soulbound enforcement
    // ---------------------------------------------------------------------

    /**
     * @dev Every ERC-721 balance movement in OpenZeppelin v5 funnels through `_update`.
     *      Allowing only `from == 0` (mint) and `to == 0` (burn) closes all of them at once,
     *      including operator-driven and safe-transfer paths.
     */
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address from)
    {
        from = super._update(to, tokenId, auth);
        if (from != address(0) && to != address(0)) revert SoulboundTransferDisabled();
    }

    /// @dev Approvals are meaningless on a token that cannot move; reject them outright so no
    ///      integrator builds against a marketplace listing that could never settle.
    function approve(address, uint256) public pure override {
        revert SoulboundTransferDisabled();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert SoulboundTransferDisabled();
    }

    // ---------------------------------------------------------------------
    // Views & metadata
    // ---------------------------------------------------------------------

    function dataOf(address holder) external view returns (PassportData memory) {
        return _data[passportOf[holder]];
    }

    function dataOfToken(uint256 tokenId) external view returns (PassportData memory) {
        return _data[tokenId];
    }

    function totalIssued() external view returns (uint256) {
        return _nextId - 1;
    }

    function _tierOf(uint16 s) private pure returns (uint8) {
        if (s >= 820) return 4; // Diamond
        if (s >= 740) return 3; // Platinum
        if (s >= 650) return 2; // Gold
        if (s >= 520) return 1; // Silver
        return 0; // Bronze
    }

    function _tierName(uint8 t) private pure returns (string memory) {
        if (t == 4) return "Diamond";
        if (t == 3) return "Platinum";
        if (t == 2) return "Gold";
        if (t == 1) return "Silver";
        return "Bronze";
    }

    function _tierColor(uint8 t) private pure returns (string memory) {
        if (t == 4) return "#7DF9FF";
        if (t == 3) return "#C0C6D4";
        if (t == 2) return "#E8B33C";
        if (t == 1) return "#9AA3B2";
        return "#B87333";
    }

    /**
     * @notice Fully onchain metadata. No IPFS pin, no gateway, no server: a credit passport
     *         whose art disappears when a hackathon's hosting lapses is not a credit record.
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        PassportData memory d = _data[tokenId];
        string memory tier = _tierName(d.tier);

        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300">',
            '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
            '<stop offset="0%" stop-color="#0B1120"/><stop offset="100%" stop-color="#1E293B"/>',
            "</linearGradient></defs>",
            '<rect width="480" height="300" rx="20" fill="url(#g)"/>',
            '<rect x="10" y="10" width="460" height="280" rx="14" fill="none" stroke="',
            _tierColor(d.tier),
            '" stroke-width="1.5" opacity="0.7"/>',
            '<text x="34" y="58" fill="#94A3B8" font-family="monospace" font-size="13" letter-spacing="3">MERITR CREDIT PASSPORT</text>',
            '<text x="34" y="140" fill="#F8FAFC" font-family="monospace" font-size="72" font-weight="bold">',
            uint256(d.score).toString(),
            "</text>",
            '<text x="34" y="172" fill="',
            _tierColor(d.tier),
            '" font-family="monospace" font-size="20" letter-spacing="2">',
            tier,
            "</text>",
            '<text x="34" y="232" fill="#64748B" font-family="monospace" font-size="12">CHAINS ATTESTED: ',
            uint256(d.chainCount).toString(),
            "</text>",
            '<text x="34" y="252" fill="#64748B" font-family="monospace" font-size="12">PROOFS INGESTED: ',
            uint256(d.attestationCount).toString(),
            "</text>",
            '<text x="34" y="272" fill="#475569" font-family="monospace" font-size="11">SOULBOUND &#183; CREDITCOIN &#183; ATTESTCOIN 0xFD2</text>',
            "</svg>"
        );

        string memory json = string.concat(
            '{"name":"Meritr Credit Passport #',
            tokenId.toString(),
            '","description":"Non-transferable cross-chain credit memory. Score derived solely from transactions proven through the Creditcoin Attestcoin native query verifier precompile (0xFD2).",',
            '"image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg)),
            '","attributes":[',
            '{"trait_type":"ZK-Credit Score","value":',
            uint256(d.score).toString(),
            "},",
            '{"trait_type":"Tier","value":"',
            tier,
            '"},',
            '{"trait_type":"Chains Attested","value":',
            uint256(d.chainCount).toString(),
            "},",
            '{"trait_type":"Proofs Ingested","value":',
            uint256(d.attestationCount).toString(),
            "},",
            '{"trait_type":"Soulbound","value":"true"}',
            "]}"
        );

        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
