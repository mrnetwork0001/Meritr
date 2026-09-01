// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {INativeQueryVerifier} from
    "@gluwa/asc-contracts/contracts/write-ability/common/INativeQueryVerifier.sol";

/**
 * @notice Test-only stand-in for the Creditcoin native query verifier precompile at `0xFD2`.
 *
 * @dev On Creditcoin the precompile is implemented by the node runtime, so local Hardhat runs
 *      have no code at that address. Tests deploy this and `hardhat_setCode` it to `0xFD2`,
 *      which exercises the *real* `ASCBase` verification path - the same external call, the
 *      same struct encoding, the same `calculateTxIndex` dedupe - against a controllable
 *      verifier. Only the runtime's cryptography is substituted; none of Meritr's own logic is.
 *
 *      `shouldVerify` lets a test assert that Meritr genuinely refuses unproven data.
 */
contract MockNativeQueryVerifier is INativeQueryVerifier {
    bool public shouldVerify = true;
    uint64 public txIndex;

    function setShouldVerify(bool v) external {
        shouldVerify = v;
    }

    function setTxIndex(uint64 v) external {
        txIndex = v;
    }

    function verifyAndEmit(
        uint64 chainKey,
        uint64 height,
        bytes calldata,
        MerkleProof calldata,
        ContinuityProof calldata
    ) external returns (bool) {
        if (shouldVerify) emit TransactionVerified(chainKey, height, txIndex);
        return shouldVerify;
    }

    function verifyAndEmit(
        uint64 chainKey,
        uint64[] calldata heights,
        bytes[] calldata,
        MerkleProof[] calldata,
        ContinuityProof calldata
    ) external returns (bool) {
        if (shouldVerify && heights.length > 0) {
            emit TransactionVerified(chainKey, heights[0], txIndex);
        }
        return shouldVerify;
    }

    function verify(uint64, uint64, bytes calldata, MerkleProof calldata, ContinuityProof calldata)
        external
        view
        returns (bool)
    {
        return shouldVerify;
    }

    function verify(
        uint64,
        uint64[] calldata,
        bytes[] calldata,
        MerkleProof[] calldata,
        ContinuityProof calldata
    ) external view returns (bool) {
        return shouldVerify;
    }

    /// @dev Mirrors the runtime's index derivation closely enough for dedupe tests: distinct
    ///      Merkle paths must yield distinct indices.
    function calculateTxIndex(MerkleProof calldata merkleProof) external view returns (uint64) {
        if (txIndex != 0) return txIndex;
        uint64 idx;
        uint256 n = merkleProof.siblings.length;
        for (uint256 i; i < n; ++i) {
            if (!merkleProof.siblings[i].isLeft) idx |= uint64(1) << uint64(i);
        }
        return idx;
    }
}
