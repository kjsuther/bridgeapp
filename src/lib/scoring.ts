import type { Contract, HandScore, RubberState, Vulnerability } from '@/types/bridge';
import { isVulnerable, sideOfSeat } from '@/types/bridge';

const SUIT_PER_TRICK: Record<string, number> = { C: 20, D: 20, H: 30, S: 30 };
const NT_FIRST_TRICK = 40;
const NT_EXTRA_TRICK = 30;

function contractTrickScore(strain: string, tricks: number): number {
  if (strain === 'NT') {
    return NT_FIRST_TRICK + NT_EXTRA_TRICK * (tricks - 1);
  }
  return SUIT_PER_TRICK[strain] * tricks;
}

function gameThreshold(belowCurrent: number): boolean {
  return belowCurrent >= 100;
}

export function scoreHand(contract: Contract, vulnerability: Vulnerability): HandScore {
  const declarerSide = sideOfSeat(contract.declarer);
  const declarerVuln = isVulnerable(contract.declarer, vulnerability);
  const tricksRequired = 6 + contract.level;
  const tricksMade = contract.tricksMade;
  const made = tricksMade >= tricksRequired;
  const overtricks = made ? tricksMade - tricksRequired : 0;
  const undertricks = made ? 0 : tricksRequired - tricksMade;

  let belowLine = 0;
  let aboveLine = 0;
  let summary = '';

  if (made) {
    const baseTrickScore = contractTrickScore(contract.strain, contract.level);
    const doubledMultiplier = contract.doubled === 0 ? 1 : contract.doubled === 1 ? 2 : 4;
    belowLine = baseTrickScore * (contract.doubled === 0 ? 1 : 1);

    if (contract.doubled > 0) {
      // Doubled: trick score is doubled, and goes below line
      belowLine = baseTrickScore * doubledMultiplier;
      // Insult bonus
      aboveLine += contract.doubled === 1 ? 50 : 100;
    }

    // Overtrick scoring
    if (contract.doubled === 0) {
      aboveLine += contractTrickScore(contract.strain, 1) * overtricks;
    } else {
      const overtrickValue = declarerVuln ? 200 : 100;
      aboveLine += overtrickValue * overtricks * (contract.doubled === 2 ? 2 : 1);
    }

    // Game bonus (below line >= 100)
    if (belowLine >= 100) {
      aboveLine += declarerVuln ? 500 : 300;
    } else {
      // Part-game bonus
      aboveLine += 50;
    }

    // Slam bonuses
    if (contract.level === 6) {
      aboveLine += declarerVuln ? 750 : 500;
    } else if (contract.level === 7) {
      aboveLine += declarerVuln ? 1500 : 1000;
    }

    summary = `Made ${contract.level}${contract.strain}${contract.doubled === 1 ? 'X' : contract.doubled === 2 ? 'XX' : ''} with ${tricksMade} tricks${overtricks > 0 ? ` (+${overtricks})` : ''}`;
  } else {
    // Undertricks penalty (goes to opponents above line)
    let penalty = 0;
    if (contract.doubled === 0) {
      // Undoubled undertricks
      penalty = declarerVuln ? 100 * undertricks : 50 * undertricks;
    } else {
      // Doubled undertricks
      const doubledMul = contract.doubled === 2 ? 2 : 1;
      if (declarerVuln) {
        // Vulnerable: 200, 300, 300, 300...
        for (let i = 1; i <= undertricks; i++) {
          penalty += (i === 1 ? 200 : 300) * doubledMul;
        }
      } else {
        // Non-vulnerable: 100, 200, 200, 300, 300, 300...
        for (let i = 1; i <= undertricks; i++) {
          let trickPenalty: number;
          if (i === 1) trickPenalty = 100;
          else if (i === 2) trickPenalty = 200;
          else if (i === 3) trickPenalty = 200;
          else trickPenalty = 300;
          penalty += trickPenalty * doubledMul;
        }
      }
      // Insult bonus for making a doubled contract goes to declarer;
      // for going down, the insult doesn't apply (it only applies when made)
    }

    belowLine = 0;
    aboveLine = -penalty; // negative means it goes to opponents

    summary = `Down ${undertricks} in ${contract.level}${contract.strain}${contract.doubled === 1 ? 'X' : contract.doubled === 2 ? 'XX' : ''}`;
  }

  return {
    declarerSide,
    declarerVulnerable: declarerVuln,
    belowLine,
    aboveLine,
    total: belowLine + Math.max(0, aboveLine),
    made,
    overtricks,
    undertricks,
    contract,
    summary,
  };
}

export function updateRubberState(
  state: RubberState,
  score: HandScore,
): { newState: RubberState; rubberComplete: boolean } {
  const newState: RubberState = { ...state };

  if (score.made) {
    if (score.declarerSide === 'NS') {
      newState.nsBelowCurrent += score.belowLine;
      newState.nsAbove += score.aboveLine;
    } else {
      newState.ewBelowCurrent += score.belowLine;
      newState.ewAbove += score.aboveLine;
    }

    // Check if a game has been won
    if (gameThreshold(newState.nsBelowCurrent) && newState.nsGamesWon < 2) {
      newState.nsGamesWon += 1;
      newState.nsBelowCompleted += newState.nsBelowCurrent;
      newState.ewBelowCompleted += newState.ewBelowCurrent;
      newState.nsBelowCurrent = 0;
      newState.ewBelowCurrent = 0;
    } else if (gameThreshold(newState.ewBelowCurrent) && newState.ewGamesWon < 2) {
      newState.ewGamesWon += 1;
      newState.ewBelowCompleted += newState.ewBelowCurrent;
      newState.nsBelowCompleted += newState.nsBelowCurrent;
      newState.nsBelowCurrent = 0;
      newState.ewBelowCurrent = 0;
    }
  } else {
    // Penalty points go to the opponents above the line
    if (score.declarerSide === 'NS') {
      newState.ewAbove += Math.abs(score.aboveLine);
    } else {
      newState.nsAbove += Math.abs(score.aboveLine);
    }
  }

  // Recompute totals from components
  const totals = rubberTotal(newState);
  newState.nsTotal = totals.ns;
  newState.ewTotal = totals.ew;

  // Check if rubber is complete (one side wins 2 games)
  let rubberComplete = false;
  if (newState.nsGamesWon >= 2 || newState.ewGamesWon >= 2) {
    rubberComplete = true;
    newState.rubberComplete = true;

    // Award rubber bonus
    const loserGames = Math.min(newState.nsGamesWon, newState.ewGamesWon);
    const rubberBonus = loserGames === 0 ? 700 : 500;

    if (newState.nsGamesWon >= 2) {
      newState.nsAbove += rubberBonus;
    } else {
      newState.ewAbove += rubberBonus;
    }

    // Recompute totals after rubber bonus
    const finalTotals = rubberTotal(newState);
    newState.nsTotal = finalTotals.ns;
    newState.ewTotal = finalTotals.ew;
  }

  return { newState, rubberComplete };
}

export function createInitialRubberState(): RubberState {
  return {
    nsGamesWon: 0,
    ewGamesWon: 0,
    nsAbove: 0,
    ewAbove: 0,
    nsBelowCurrent: 0,
    ewBelowCurrent: 0,
    nsBelowCompleted: 0,
    ewBelowCompleted: 0,
    nsTotal: 0,
    ewTotal: 0,
    rubberComplete: false,
    rubberNumber: 1,
    overallNsTotal: 0,
    overallEwTotal: 0,
  };
}

export function rubberTotal(state: RubberState): { ns: number; ew: number } {
  return {
    ns: state.nsBelowCompleted + state.nsBelowCurrent + state.nsAbove,
    ew: state.ewBelowCompleted + state.ewBelowCurrent + state.ewAbove,
  };
}
