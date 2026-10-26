/*
 * IMP (International Matchpoint) scoring for duplicate-style bridge comparison.
 *
 * In a duplicate match, the same hand is played twice with seats swapped
 * between partnerships (NS plays the EW cards and vice versa). The net score
 * difference between the two playings is converted to IMPs using the WBF
 * IMP scale.
 *
 * In this app's team format, "team A" = N+S and "team B" = E+W.
 * When seats are swapped, team A now holds E+W and team B holds N+S.
 * We track scores per team (not per compass direction) so that the
 * comparison is meaningful regardless of which side sat where.
 */

import type { Contract, Vulnerability } from '@/types/bridge';
import { scoreHand } from '@/lib/scoring';

// WBF IMP conversion table: net point difference -> IMPs
// Source: World Bridge Federation IMP scale
const IMP_TABLE: ReadonlyArray<[number, number]> = [
  [0, 0], [20, 1], [50, 2], [90, 3], [130, 4], [170, 5],
  [220, 6], [270, 7], [320, 8], [370, 9], [430, 10],
  [500, 11], [600, 12], [750, 13], [900, 14], [1100, 15],
  [1300, 16], [1500, 17], [1750, 18], [2000, 19], [2250, 20],
  [2500, 21], [3000, 22], [3500, 23], [4000, 24],
];

/**
 * Convert a raw point differential to IMPs using the WBF scale.
 * Handles both positive and negative differentials.
 */
export function pointsToImps(pointDiff: number): number {
  const absDiff = Math.abs(pointDiff);
  let imps = 0;
  for (const [threshold, imp] of IMP_TABLE) {
    if (absDiff >= threshold) {
      imps = imp;
    } else {
      break;
    }
  }
  return pointDiff >= 0 ? imps : -imps;
}

/**
 * The raw bridge score for a single hand from the perspective of the
 * NS partnership. Positive means NS scored points; negative means
 * the opponents (EW) scored points (declarer went down).
 */
export function rawScoreForNS(contract: Contract, vulnerability: Vulnerability): number {
  const score = scoreHand(contract, vulnerability);
  if (score.declarerSide === 'NS') {
    // NS was declarer: belowLine + aboveLine (aboveLine is negative if down)
    return score.belowLine + score.aboveLine;
  }
  // EW was declarer: negate their score
  return -(score.belowLine + score.aboveLine);
}

/**
 * Compute the team-perspective score for a single hand playing.
 *
 * Teams are identified by compass direction at the table: Team A = N+S,
 * Team B = E+W. Players stay in their seats for both playings; only the
 * cards are swapped between partnerships on the replay. So Team A is
 * always N+S, and the raw NS score is the Team A score for both playings.
 *
 * @param contract - the contract result of the hand
 * @param vulnerability - vulnerability for this hand
 * @returns points from Team A's perspective (positive = Team A scored)
 */
export function teamScore(
  contract: Contract,
  vulnerability: Vulnerability,
): number {
  return rawScoreForNS(contract, vulnerability);
}

/**
 * Compute the IMP result for a pair of hands (original + replay).
 *
 * @param originalContract - contract result from the original playing
 * @param replayContract - contract result from the replay playing
 * @param vulnerability - original hand's vulnerability
 * @param replayVulnerability - replay's stored vulnerability; defaults to the
 * original value for legacy replays that did not rotate vulnerability
 * @returns net IMPs from Team A's perspective (positive = Team A wins)
 */
export function computeImpResult(
  originalContract: Contract,
  replayContract: Contract,
  vulnerability: Vulnerability,
  replayVulnerability: Vulnerability = vulnerability,
): number {
  const originalTeamA = teamScore(originalContract, vulnerability);
  const replayTeamA = teamScore(replayContract, replayVulnerability);
  const netPoints = originalTeamA + replayTeamA;
  return pointsToImps(netPoints);
}

/**
 * Handle passed-out hands: they contribute 0 IMPs and don't need a replay.
 */
export function isPassedOutHand(auctionLength: number): boolean {
  return auctionLength === 4;
}
