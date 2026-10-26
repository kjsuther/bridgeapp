import type { DealPbn, FutureTricks } from 'bridge-dds';
import type { Card, Deal, Rank, Seat, Suit, TrickCard } from '@/types/bridge';
import { nextSeat, RANK_VALUES, SEATS, sideOfSeat } from '@/types/bridge';
import { trickWinner } from './play';

export interface AnalysisPosition {
  deal: Deal;
  playedCards: TrickCard[];
  trump: Suit | null;
  declarer: Seat;
  openingLeader: Seat;
}

export interface PositionAnalysis {
  totalTricks: number;
  tricksWonSoFar: number;
  nextPlayer: Seat | null;
  /** Final declarer totals, including tricks already won, for EVERY legal card. */
  cardTotals: Record<string, number>;
}

export interface BoardSolver {
  SolveBoardPBN(deal: DealPbn, target: number, solutions: number, mode: number): FutureTricks;
}

const DDS_SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const RANKS = '23456789TJQKA';
export const cardKey = (card: Card): string => `${card.rank}${card.suit}`;

export function analysisKey(position: AnalysisPosition): string {
  return JSON.stringify([
    position.declarer, position.trump, position.openingLeader,
    SEATS.map(seat => position.deal[seat].map(cardKey).sort()),
    position.playedCards.map(play => `${play.seat}:${cardKey(play.card)}`),
  ]);
}

export function contractBadge(totalTricks: number, contractLevel: number): { label: string; className: string } {
  const difference = totalTricks - (6 + contractLevel);
  return {
    label: difference === 0 ? '=' : difference > 0 ? `+${difference}` : `${difference}`,
    className: difference < 0 ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white',
  };
}

/** One DDS call scores all legal choices, including ranks grouped as equivalents. */
export function analyzePosition(position: AnalysisPosition, solver: BoardSolver): PositionAnalysis {
  const { deal, playedCards, trump, declarer, openingLeader } = position;
  const hands: Deal = { N: [...deal.N], E: [...deal.E], S: [...deal.S], W: [...deal.W] };
  if (SEATS.some(seat => hands[seat].length !== 13)
      || new Set(SEATS.flatMap(seat => hands[seat].map(cardKey))).size !== 52) {
    throw new Error('Analysis requires all four complete hands.');
  }
  if (playedCards.length > 52) throw new Error('Invalid play history.');

  let leader = openingLeader;
  let nextPlayer = openingLeader;
  let tricksWonSoFar = 0;
  let completedTricks = 0;
  let trick: TrickCard[] = [];
  for (const play of playedCards) {
    if (play.seat !== nextPlayer) throw new Error('Play history has an invalid turn order.');
    const hand = hands[play.seat];
    const index = hand.findIndex(card => cardKey(card) === cardKey(play.card));
    if (index < 0) throw new Error('Play history contains a missing or repeated card.');
    const ledSuit = trick[0]?.card.suit;
    if (ledSuit && play.card.suit !== ledSuit && hand.some(card => card.suit === ledSuit)) {
      throw new Error('Play history does not follow suit.');
    }
    hand.splice(index, 1);
    trick.push(play);
    if (trick.length === 4) {
      const winner = trickWinner(trick, trump);
      if (!winner) throw new Error('Could not determine trick winner.');
      if (sideOfSeat(winner) === sideOfSeat(declarer)) tricksWonSoFar++;
      completedTricks++;
      leader = nextPlayer = winner;
      trick = [];
    } else {
      nextPlayer = nextSeat(play.seat);
    }
  }
  if (playedCards.length === 52) {
    return { totalTricks: tricksWonSoFar, tricksWonSoFar, nextPlayer: null, cardTotals: {} };
  }

  const remainingTricks = 13 - completedTricks; // Includes the current partial trick.
  const ledSuit = trick[0]?.card.suit;
  const followSuit = ledSuit ? hands[nextPlayer].filter(card => card.suit === ledSuit) : [];
  const legalCards = followSuit.length > 0 ? followSuit : hands[nextPlayer];
  const remainCards = 'N:' + SEATS.map(seat => DDS_SUITS.map(suit =>
    hands[seat].filter(card => card.suit === suit)
      .sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank])
      .map(card => card.rank).join(''),
  ).join('.')).join(' ');

  const future = solver.SolveBoardPBN({
    trump: trump === null ? 4 : DDS_SUITS.indexOf(trump),
    first: SEATS.indexOf(leader),
    currentTrickSuit: trick.map(play => DDS_SUITS.indexOf(play.card.suit)),
    currentTrickRank: trick.map(play => RANK_VALUES[play.card.rank]),
    remainCards,
  }, -1, 3, 1); // All legal plays; exact scores even for a forced/equivalent card.

  const declarerToPlay = sideOfSeat(nextPlayer) === sideOfSeat(declarer);
  const cardTotals: Record<string, number> = {};
  for (let i = 0; i < future.cards; i++) {
    const score = future.score[i];
    if (!Number.isInteger(score) || score < 0 || score > remainingTricks) {
      throw new Error('The solver did not return an exact trick count.');
    }
    // DDS scores the SIDE TO PLAY; badges always use declarer's perspective.
    const total = tricksWonSoFar + (declarerToPlay ? score : remainingTricks - score);
    const suit = DDS_SUITS[future.suit[i]];
    for (let rank = 2; rank <= 14; rank++) {
      if (rank === future.rank[i] || (future.equals[i] & (1 << rank)) !== 0) {
        const card = { suit, rank: RANKS[rank - 2] as Rank };
        if (legalCards.some(legal => cardKey(legal) === cardKey(card))) cardTotals[cardKey(card)] = total;
      }
    }
  }
  if (legalCards.some(card => cardTotals[cardKey(card)] === undefined)) {
    throw new Error('Analysis did not cover every legal card.');
  }
  const totals = Object.values(cardTotals);
  return {
    totalTricks: declarerToPlay ? Math.max(...totals) : Math.min(...totals),
    tricksWonSoFar, nextPlayer, cardTotals,
  };
}
