// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {CreditMath} from "../libraries/CreditMath.sol";

/**
 * @notice Test-only view harness exposing the internal `CreditMath` library.
 *
 * @dev Exists so the cross-language parity suite can call the *exact* onchain implementation
 *      and compare it against `agents/scoring.py`. The agent predicts terms the vault will
 *      derive independently, so a silent divergence between the two would make every agent
 *      decision unreliable while every individual test still passed.
 */
contract CreditMathHarness {
    function score(CreditMath.CreditFacts calldata f, uint256 nowTs)
        external
        pure
        returns (CreditMath.ScoreBreakdown memory)
    {
        return CreditMath.score(f, nowTs);
    }

    function aprBps(uint16 s) external pure returns (uint256) {
        return CreditMath.aprBps(s);
    }

    function maxLtvBps(uint16 s) external pure returns (uint256) {
        return CreditMath.maxLtvBps(s);
    }

    function healthFactor(uint256 collateralE8, uint256 debtE8, uint256 liqThresholdBps)
        external
        pure
        returns (uint256)
    {
        return CreditMath.healthFactor(collateralE8, debtE8, liqThresholdBps);
    }

    function accrueInterest(uint256 principalE8, uint256 rateBps, uint256 elapsed)
        external
        pure
        returns (uint256)
    {
        return CreditMath.accrueInterest(principalE8, rateBps, elapsed);
    }

    function sustainableDebtE8(uint256 collateralE8, uint256 liqThresholdBps, uint256 targetHf)
        external
        pure
        returns (uint256)
    {
        return CreditMath.sustainableDebtE8(collateralE8, liqThresholdBps, targetHf);
    }
}
