// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {CreditMath} from "../libraries/CreditMath.sol";

/**
 * @title IMeritrAttestor
 * @notice Read surface over the cross-chain credit facts assembled by the Attestcoin
 *         ingestion layer. Consumed by MeritrVault, MeritrPassport and the DeAI agent.
 */
interface IMeritrAttestor {
    /// @notice Attested facts accumulated for `borrower` across every source chain.
    function factsOf(address borrower) external view returns (CreditMath.CreditFacts memory);

    /// @notice Current ZK-Credit score and its per-component breakdown.
    function scoreOf(address borrower) external view returns (CreditMath.ScoreBreakdown memory);

    /// @notice True once at least one Attestcoin proof has been ingested for `borrower`.
    function hasAttestations(address borrower) external view returns (bool);
}
