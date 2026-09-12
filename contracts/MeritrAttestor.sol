// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {ASCBase} from "@gluwa/asc-contracts/contracts/readability/ASCBase.sol";
import {INativeQueryVerifier} from
    "@gluwa/asc-contracts/contracts/write-ability/common/INativeQueryVerifier.sol";
import {EvmV1Decoder} from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {CreditMath} from "./libraries/CreditMath.sol";
import {IMeritrAttestor} from "./interfaces/IMeritrAttestor.sol";

/**
 * @title MeritrAttestor
 * @author Meritr (Ifeanyichukwu Onwo)
 * @notice Subsystem 1 of 4 - Attestcoin Protocol cross-chain credit ingestion.
 *
 * @dev Inherits Creditcoin's canonical readability base (`ASCBase`), which verifies a
 *      foreign-chain transaction against the **native query verifier precompile at
 *      `0x0000000000000000000000000000000000000FD2`** and deduplicates by query id. There is
 *      no oracle operator, no multisig relayer and no trusted price poster in this path: a
 *      submission either carries a Merkle-inclusion + continuity proof the Creditcoin runtime
 *      itself accepts, or it reverts.
 *
 *      Ingestion is therefore **permissionless**. Anyone may submit a proof for anyone; the
 *      borrower credited is the address decoded out of the proven event log, never the caller.
 *      That lets relayers and the borrowers themselves backfill history without either being
 *      able to forge it.
 *
 *      What the contract *does* need governance for is knowing how to read a foreign
 *      protocol's logs. Rather than hard-coding Aave's ABI, Meritr keeps an onchain
 *      **event schema registry**: an admin registers `(chainKey, emitter, topic0)` triples
 *      describing where in a log the borrower and the amount live. Supporting Compound,
 *      Morpho or a new Aave deployment is a registry write, not a redeploy. Crucially, an
 *      unregistered emitter is ignored, so a proof of a log from an attacker's own contract
 *      contributes nothing.
 */
contract MeritrAttestor is ASCBase, AccessControl, IMeritrAttestor {
    using EvmV1Decoder for bytes;

    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");

    // ---------------------------------------------------------------------
    // Action discriminators
    // ---------------------------------------------------------------------

    uint8 public constant ACTION_REPAYMENT = 1;
    uint8 public constant ACTION_COLLATERAL = 2;
    uint8 public constant ACTION_LIQUIDATION = 3;
    uint8 public constant ACTION_BORROW = 4;

    /// @dev Guard against a single absurd log value overflowing USD normalisation.
    uint256 private constant MAX_SANE_AMOUNT = 1e30;

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    /**
     * @notice A supported source chain, keyed by the Attestcoin `chainKey`.
     * @dev `genesisTimestamp` + `blockTimeSeconds` let the contract derive an approximate
     *      wall-clock time for a *proven* block height, which is what feeds the wallet-maturity
     *      component of the score. It is an approximation - deliberately so, because the
     *      prover exposes a verified height but not a verified timestamp - and it is always
     *      clamped to `block.timestamp` so a height can never manufacture future history.
     */
    struct SourceChain {
        bool enabled;
        uint64 genesisTimestamp;
        uint32 blockTimeSeconds;
        string name;
    }

    /**
     * @notice How to read one event from one protocol on one chain.
     * @param action        What this event means to the credit model (ACTION_* above).
     * @param subjectTopic  Index (1-3) of the indexed topic holding the borrower address.
     *                      Zero means "read the borrower from `subjectWord` of the data blob".
     * @param subjectWord   Data word index of the borrower when `subjectTopic == 0`.
     * @param reserveTopic  Index (1-3) of the topic holding the reserve/asset address.
     *                      Zero means "this event has no asset; use `fallbackAsset`".
     * @param amountWord    Data word index holding the raw token amount.
     * @param fallbackAsset Asset used for decimals/price when `reserveTopic == 0`.
     */
    struct EventSchema {
        bool enabled;
        uint8 action;
        uint8 subjectTopic;
        uint8 subjectWord;
        uint8 reserveTopic;
        uint8 amountWord;
        address fallbackAsset;
    }

    /// @notice Decimals and USD price for a source-chain asset, used to normalise amounts.
    struct AssetConfig {
        bool set;
        uint8 decimals;
        uint64 priceE8;
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    mapping(uint64 chainKey => SourceChain) public sourceChains;
    mapping(uint64 chainKey => mapping(address emitter => mapping(bytes32 topic0 => EventSchema)))
        public schemas;
    mapping(uint64 chainKey => mapping(address asset => AssetConfig)) public assetConfigs;

    mapping(address borrower => CreditMath.CreditFacts) private _facts;
    mapping(address borrower => mapping(uint64 chainKey => bool)) public seenOnChain;

    /// @dev Set for the duration of one `ingest` call so `_processAndEmitEvent` - whose
    ///      signature is fixed by ASCBase and does not carry the chain key - can attribute
    ///      the proof to its source chain. Non-zero only mid-ingest, which also means a
    ///      direct call to the inherited `execute` reverts instead of silently mis-attributing.
    uint64 private _activeChainKey;
    uint64 private _activeBlockHeight;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event SourceChainConfigured(uint64 indexed chainKey, string name, bool enabled);
    event SchemaRegistered(
        uint64 indexed chainKey, address indexed emitter, bytes32 indexed topic0, uint8 action
    );
    event SchemaRevoked(uint64 indexed chainKey, address indexed emitter, bytes32 indexed topic0);
    event AssetConfigured(uint64 indexed chainKey, address indexed asset, uint8 decimals, uint64 priceE8);

    /// @notice One credit-relevant fact proven from a foreign chain and folded into a borrower's memory.
    event CreditFactAttested(
        address indexed borrower,
        uint64 indexed chainKey,
        uint8 indexed action,
        bytes32 queryId,
        address asset,
        uint256 rawAmount,
        uint256 usdE8
    );

    /// @notice Emitted once per ingested proof after all of its logs have been folded in.
    event CreditMemoryUpdated(address indexed borrower, uint16 newScore, uint32 attestationCount);

    /// @notice A proof was verified but contained no logs matching a registered schema.
    event NoRecognisedFacts(uint64 indexed chainKey, bytes32 indexed queryId);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error ChainNotEnabled(uint64 chainKey);
    error DirectExecuteForbidden();
    error SourceTxReverted();
    error InvalidSchema();

    // ---------------------------------------------------------------------
    // Construction
    // ---------------------------------------------------------------------

    constructor(address admin) ASCBase() {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGISTRAR_ROLE, admin);
    }

    // ---------------------------------------------------------------------
    // Ingestion
    // ---------------------------------------------------------------------

    /**
     * @notice Verify a foreign-chain transaction through the Attestcoin precompile and fold any
     *         credit-relevant events it contains into the subject's cross-chain credit memory.
     * @dev Permissionless. The proof is self-validating; `msg.sender` earns nothing by calling.
     *      Delegates to the inherited `ASCBase.execute`, which performs proof verification and
     *      query-id deduplication before calling back into `_processAndEmitEvent`.
     *
     * @param action            Caller-supplied hint, forwarded to the base. The authoritative
     *                          action for each log comes from its registered schema, not this.
     * @param chainKey          Attestcoin source-chain key.
     * @param blockHeight       Height of the block containing the proven transaction.
     * @param encodedTransaction Prover `txBytes` - `abi.encode(uint8 txType, bytes[] chunks)`.
     * @param merkleRoot        Transaction-trie root committed by the proof.
     * @param siblings          Merkle inclusion path.
     * @param lowerEndpointDigest Continuity-proof lower endpoint.
     * @param continuityRoots   Continuity-proof chain.
     */
    function ingest(
        uint8 action,
        uint64 chainKey,
        uint64 blockHeight,
        bytes calldata encodedTransaction,
        bytes32 merkleRoot,
        INativeQueryVerifier.MerkleProofEntry[] calldata siblings,
        bytes32 lowerEndpointDigest,
        bytes32[] calldata continuityRoots
    ) external returns (bool) {
        if (!sourceChains[chainKey].enabled) revert ChainNotEnabled(chainKey);

        _activeChainKey = chainKey;
        _activeBlockHeight = blockHeight;

        // `execute` is external and non-virtual on ASCBase, so this self-call is how Meritr
        // layers its own pre-checks on top of the canonical verification path without forking it.
        bool ok = this.execute(
            action,
            chainKey,
            blockHeight,
            encodedTransaction,
            merkleRoot,
            siblings,
            lowerEndpointDigest,
            continuityRoots
        );

        _activeChainKey = 0;
        _activeBlockHeight = 0;
        return ok;
    }

    /**
     * @inheritdoc ASCBase
     * @dev Invoked by `ASCBase.execute` only after the precompile has accepted the proof and
     *      the query id has been marked processed, so everything below operates on data the
     *      Creditcoin runtime has already vouched for.
     */
    function _processAndEmitEvent(uint8, bytes32 queryId, bytes memory encodedTransaction)
        internal
        override
    {
        uint64 chainKey = _activeChainKey;
        // Non-zero only inside `ingest`; a direct `execute` call lands here with zero.
        if (chainKey == 0) revert DirectExecuteForbidden();

        EvmV1Decoder.ReceiptFields memory receipt = encodedTransaction.decodeReceiptFields();
        // A reverted source transaction repaid nothing and collateralised nothing.
        if (receipt.receiptStatus != 1) revert SourceTxReverted();

        uint256 recognised;
        address lastSubject;

        uint256 logCount = receipt.receiptLogs.length;
        for (uint256 i; i < logCount; ++i) {
            EvmV1Decoder.LogEntry memory log = receipt.receiptLogs[i];
            if (log.topics.length == 0) continue;

            EventSchema memory schema = schemas[chainKey][log.address_][log.topics[0]];
            // Unregistered emitter or unrecognised event: proven, but not credit-relevant.
            if (!schema.enabled) continue;

            address subject = _readSubject(log, schema);
            if (subject == address(0)) continue;

            (address asset, uint256 rawAmount, uint256 usdE8) = _readAmount(chainKey, log, schema);

            _applyFact(subject, chainKey, schema.action, usdE8);

            emit CreditFactAttested(
                subject, chainKey, schema.action, queryId, asset, rawAmount, usdE8
            );

            lastSubject = subject;
            unchecked {
                ++recognised;
            }
        }

        if (recognised == 0) {
            emit NoRecognisedFacts(chainKey, queryId);
            return;
        }

        CreditMath.CreditFacts memory f = _facts[lastSubject];
        emit CreditMemoryUpdated(
            lastSubject, CreditMath.score(f, block.timestamp).score, f.attestationCount
        );
    }

    // ---------------------------------------------------------------------
    // Fact folding
    // ---------------------------------------------------------------------

    function _applyFact(address subject, uint64 chainKey, uint8 action, uint256 usdE8) private {
        CreditMath.CreditFacts storage f = _facts[subject];

        uint64 sourceTime = _approximateSourceTime(chainKey, _activeBlockHeight);
        if (f.firstActivityAt == 0 || sourceTime < f.firstActivityAt) f.firstActivityAt = sourceTime;
        if (sourceTime > f.lastActivityAt) f.lastActivityAt = sourceTime;

        if (!seenOnChain[subject][chainKey]) {
            seenOnChain[subject][chainKey] = true;
            unchecked {
                ++f.chainCount;
            }
        }

        unchecked {
            ++f.attestationCount;
        }

        if (action == ACTION_REPAYMENT) {
            f.totalRepaidE8 += uint128(usdE8);
            unchecked {
                ++f.repaymentCount;
            }
        } else if (action == ACTION_COLLATERAL) {
            f.totalCollateralE8 += uint128(usdE8);
        } else if (action == ACTION_LIQUIDATION) {
            unchecked {
                ++f.liquidationCount;
            }
        }
        // ACTION_BORROW records activity, chain presence and recency only - drawing credit is
        // neither creditworthy nor disqualifying on its own.
    }

    /**
     * @dev Approximate wall-clock time of a proven source block. Monotone in height and
     *      clamped to the current Creditcoin block time, so a borrower cannot fabricate
     *      maturity by proving a far-future height.
     */
    function _approximateSourceTime(uint64 chainKey, uint64 height) private view returns (uint64) {
        SourceChain memory sc = sourceChains[chainKey];
        if (sc.blockTimeSeconds == 0) return uint64(block.timestamp);

        uint256 estimated = uint256(sc.genesisTimestamp) + uint256(height) * sc.blockTimeSeconds;
        if (estimated >= block.timestamp) return uint64(block.timestamp);
        return uint64(estimated);
    }

    // ---------------------------------------------------------------------
    // Log decoding
    // ---------------------------------------------------------------------

    function _readSubject(EvmV1Decoder.LogEntry memory log, EventSchema memory schema)
        private
        pure
        returns (address)
    {
        if (schema.subjectTopic != 0) {
            if (log.topics.length <= schema.subjectTopic) return address(0);
            return address(uint160(uint256(log.topics[schema.subjectTopic])));
        }
        (bool ok, uint256 raw) = _dataWord(log.data, schema.subjectWord);
        if (!ok) return address(0);
        return address(uint160(raw));
    }

    function _readAmount(uint64 chainKey, EvmV1Decoder.LogEntry memory log, EventSchema memory schema)
        private
        view
        returns (address asset, uint256 rawAmount, uint256 usdE8)
    {
        asset = schema.fallbackAsset;
        if (schema.reserveTopic != 0 && log.topics.length > schema.reserveTopic) {
            asset = address(uint160(uint256(log.topics[schema.reserveTopic])));
        }

        (bool ok, uint256 raw) = _dataWord(log.data, schema.amountWord);
        if (!ok || raw > MAX_SANE_AMOUNT) return (asset, 0, 0);
        rawAmount = raw;

        AssetConfig memory cfg = assetConfigs[chainKey][asset];
        // An asset nobody has priced contributes activity and recency, but no dollar value.
        if (!cfg.set) return (asset, rawAmount, 0);

        usdE8 = (rawAmount * cfg.priceE8) / (10 ** cfg.decimals);
    }

    /// @dev Read the 32-byte word at `idx` from an ABI-encoded log data blob.
    function _dataWord(bytes memory data, uint256 idx) private pure returns (bool ok, uint256 value) {
        uint256 end = (idx + 1) * 32;
        if (data.length < end) return (false, 0);
        // solhint-disable-next-line no-inline-assembly
        assembly {
            value := mload(add(add(data, 32), mul(idx, 32)))
        }
        ok = true;
    }

    // ---------------------------------------------------------------------
    // Registry administration
    // ---------------------------------------------------------------------

    function configureSourceChain(
        uint64 chainKey,
        string calldata name,
        uint64 genesisTimestamp,
        uint32 blockTimeSeconds,
        bool enabled
    ) external onlyRole(REGISTRAR_ROLE) {
        sourceChains[chainKey] =
            SourceChain({enabled: enabled, genesisTimestamp: genesisTimestamp, blockTimeSeconds: blockTimeSeconds, name: name});
        emit SourceChainConfigured(chainKey, name, enabled);
    }

    function registerSchema(uint64 chainKey, address emitter, bytes32 topic0, EventSchema calldata schema)
        external
        onlyRole(REGISTRAR_ROLE)
    {
        if (
            emitter == address(0) || topic0 == bytes32(0) || schema.action == 0
                || schema.action > ACTION_BORROW || schema.subjectTopic > 3 || schema.reserveTopic > 3
        ) revert InvalidSchema();

        schemas[chainKey][emitter][topic0] = schema;
        emit SchemaRegistered(chainKey, emitter, topic0, schema.action);
    }

    function revokeSchema(uint64 chainKey, address emitter, bytes32 topic0)
        external
        onlyRole(REGISTRAR_ROLE)
    {
        delete schemas[chainKey][emitter][topic0];
        emit SchemaRevoked(chainKey, emitter, topic0);
    }

    function configureAsset(uint64 chainKey, address asset, uint8 decimals, uint64 priceE8)
        external
        onlyRole(REGISTRAR_ROLE)
    {
        assetConfigs[chainKey][asset] = AssetConfig({set: true, decimals: decimals, priceE8: priceE8});
        emit AssetConfigured(chainKey, asset, decimals, priceE8);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @inheritdoc IMeritrAttestor
    function factsOf(address borrower) external view returns (CreditMath.CreditFacts memory) {
        return _facts[borrower];
    }

    /// @inheritdoc IMeritrAttestor
    function scoreOf(address borrower) external view returns (CreditMath.ScoreBreakdown memory) {
        return CreditMath.score(_facts[borrower], block.timestamp);
    }

    /// @inheritdoc IMeritrAttestor
    function hasAttestations(address borrower) external view returns (bool) {
        return _facts[borrower].attestationCount > 0;
    }

    /// @notice Address of the Attestcoin native query verifier precompile this contract trusts.
    function verifierPrecompile() external view returns (address) {
        return address(VERIFIER);
    }
}
