import type { Card, Deal, Seat, Suit } from '@/types/bridge';
import { RANK_VALUES, SEATS } from '@/types/bridge';

const SUIT_ORDER: Record<Suit, number> = { S: 0, H: 1, D: 2, C: 3 };

function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    if (a.suit !== b.suit) return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
    return RANK_VALUES[b.rank] - RANK_VALUES[a.rank];
  });
}

function nextSeat(seat: Seat): Seat {
  const idx = SEATS.indexOf(seat);
  return SEATS[(idx + 1) % 4];
}

function isNS(seat: Seat): boolean {
  return seat === 'N' || seat === 'S';
}

function trickWinner(trick: { seat: Seat; card: Card }[], trump: Suit | null): Seat {
  if (trick.length === 0) return 'N';
  let winner = trick[0];

  for (let i = 1; i < trick.length; i++) {
    const card = trick[i].card;
    // Trump beats non-trump
    if (trump && card.suit === trump && winner.card.suit !== trump) {
      winner = trick[i];
    } else if (card.suit === winner.card.suit && RANK_VALUES[card.rank] > RANK_VALUES[winner.card.rank]) {
      winner = trick[i];
    }
  }
  return winner.seat;
}

function getLegalCards(hand: Card[], ledSuit: Suit | null): Card[] {
  if (!ledSuit) return hand;
  const ledSuitCards = hand.filter((c) => c.suit === ledSuit);
  if (ledSuitCards.length > 0) return ledSuitCards;
  return hand;
}

function removeCard(hand: Card[], card: Card): Card[] {
  return hand.filter((c) => !(c.suit === card.suit && c.rank === card.rank));
}

interface SolveResult {
  tricksDeclarer: number;
  tricksDefender: number;
}

function solveDoubleDummy(
  hands: Record<Seat, Card[]>,
  trump: Suit | null,
  declarer: Seat,
  leader: Seat,
  declarerTricks: number,
  defenderTricks: number,
  depth: number,
  alpha: number,
  beta: number,
  memo: Map<string, number>,
): number {
  // Returns the number of tricks the declarer's side can win from this position
  if (depth === 0 || hands[leader].length === 0) {
    return declarerTricks;
  }

  // Memoization key
  const handKey = SEATS.map((s) => hands[s].map((c) => `${c.rank}${c.suit}`).join(',')).join('|') + `:${leader}:${declarerTricks}:${defenderTricks}`;
  if (memo.has(handKey)) {
    return memo.get(handKey)!;
  }

  const isDeclarerTurn = isNS(leader) === isNS(declarer);
  const legalCards = getLegalCards(hands[leader], null);

  let bestTricks: number;
  if (isDeclarerTurn) {
    bestTricks = -1;
  } else {
    bestTricks = 14;
  }

  for (const card of legalCards) {
    const newHands: Record<Seat, Card[]> = { ...hands };
    newHands[leader] = removeCard(hands[leader], card);

    // For simplicity, play one card at a time and complete trick when 4 cards played
    // We need to simulate the full trick
    const result = playTrick(newHands, trump, leader, card, declarer, declarerTricks, defenderTricks, depth, alpha, beta, memo);

    if (isDeclarerTurn) {
      if (result > bestTricks) {
        bestTricks = result;
        alpha = Math.max(alpha, bestTricks);
      }
    } else {
      if (result < bestTricks) {
        bestTricks = result;
        beta = Math.min(beta, bestTricks);
      }
    }

    if (beta <= alpha) break;
  }

  memo.set(handKey, bestTricks);
  return bestTricks;
}

function playTrick(
  hands: Record<Seat, Card[]>,
  trump: Suit | null,
  leader: Seat,
  firstCard: Card,
  declarer: Seat,
  declarerTricks: number,
  defenderTricks: number,
  depth: number,
  alpha: number,
  beta: number,
  memo: Map<string, number>,
): number {
  const trick: { seat: Seat; card: Card }[] = [{ seat: leader, card: firstCard }];

  function playNext(currentSeat: Seat): number {
    if (trick.length === 4) {
      // Trick complete
      const winner = trickWinner(trick, trump);
      const wonForDeclarer = isNS(winner) === isNS(declarer);
      const newDeclarerTricks = declarerTricks + (wonForDeclarer ? 1 : 0);
      const newDefenderTricks = defenderTricks + (wonForDeclarer ? 0 : 1);

      return solveDoubleDummy(hands, trump, declarer, winner, newDeclarerTricks, newDefenderTricks, depth - 1, alpha, beta, memo);
    }

    const next = nextSeat(currentSeat);
    const ledSuit = trick[0].card.suit;
    const legalCards = getLegalCards(hands[next], ledSuit);
    const isDeclarerTurn = isNS(next) === isNS(declarer);

    let bestTricks: number;
    if (isDeclarerTurn) {
      bestTricks = -1;
    } else {
      bestTricks = 14;
    }

    for (const card of legalCards) {
      const savedHand = hands[next];
      hands[next] = removeCard(hands[next], card);
      trick.push({ seat: next, card });

      const result = playNext(next);

      trick.pop();
      hands[next] = savedHand;

      if (isDeclarerTurn) {
        if (result > bestTricks) bestTricks = result;
        alpha = Math.max(alpha, bestTricks);
      } else {
        if (result < bestTricks) bestTricks = result;
        beta = Math.min(beta, bestTricks);
      }

      if (beta <= alpha) break;
    }

    return bestTricks;
  }

  // Save first card's hand modification
  const savedLeaderHand = hands[leader];
  hands[leader] = removeCard(hands[leader], firstCard);

  const result = playNext(leader);

  hands[leader] = savedLeaderHand;
  return result;
}

export function solveDeal(
  deal: Deal,
  trump: Suit | null,
  declarer: Seat,
  leader: Seat,
): SolveResult {
  const hands: Record<Seat, Card[]> = {
    N: sortCards([...deal.N]),
    E: sortCards([...deal.E]),
    S: sortCards([...deal.S]),
    W: sortCards([...deal.W]),
  };

  const memo = new Map<string, number>();
  const declarerTricks = solveDoubleDummy(hands, trump, declarer, leader, 0, 0, 13, -1, 14, memo);

  return {
    tricksDeclarer: declarerTricks,
    tricksDefender: 13 - declarerTricks,
  };
}

/**
 * Complete a partially-played trick with optimal play from both sides,
 * then continue with full double-dummy search for remaining tricks.
 *
 * The cards already played in the partial trick are fixed (removed from hands
 * before calling). Only the remaining players choose optimally via alpha-beta.
 */
function completePartialTrick(
  hands: Record<Seat, Card[]>,
  trump: Suit | null,
  declarer: Seat,
  partialTrick: { seat: Seat; card: Card }[],
  declarerTricks: number,
  defenderTricks: number,
  remainingDepth: number,
  alpha: number,
  beta: number,
  memo: Map<string, number>,
): number {
  const trick = [...partialTrick];
  const ledSuit = trick[0].card.suit;

  function playNext(currentSeat: Seat): number {
    if (trick.length === 4) {
      const winner = trickWinner(trick, trump);
      const wonForDeclarer = isNS(winner) === isNS(declarer);
      const newDeclarerTricks = declarerTricks + (wonForDeclarer ? 1 : 0);
      const newDefenderTricks = defenderTricks + (wonForDeclarer ? 0 : 1);
      return solveDoubleDummy(hands, trump, declarer, winner, newDeclarerTricks, newDefenderTricks, remainingDepth, alpha, beta, memo);
    }

    const next = nextSeat(currentSeat);
    const legalCards = getLegalCards(hands[next], ledSuit);
    if (legalCards.length === 0) return declarerTricks;

    const isDeclarerTurn = isNS(next) === isNS(declarer);
    let bestTricks = isDeclarerTurn ? -1 : 14;

    for (const card of legalCards) {
      const savedHand = hands[next];
      hands[next] = removeCard(hands[next], card);
      trick.push({ seat: next, card });

      const result = playNext(next);

      trick.pop();
      hands[next] = savedHand;

      if (isDeclarerTurn) {
        if (result > bestTricks) bestTricks = result;
        alpha = Math.max(alpha, bestTricks);
      } else {
        if (result < bestTricks) bestTricks = result;
        beta = Math.min(beta, bestTricks);
      }

      if (beta <= alpha) break;
    }

    return bestTricks;
  }

  const lastPlayedSeat = partialTrick[partialTrick.length - 1].seat;
  return playNext(lastPlayedSeat);
}

/**
 * Solve a double-dummy position from a partial play state.
 *
 * Given the original deal and the cards played so far (in order), computes
 * the total tricks the declarer can win with optimal play from both sides
 * from the current position forward.
 *
 * @param deal - the original 52-card deal
 * @param playedCards - cards played so far, in play order (each has seat + card)
 * @param trump - trump suit, or null for NT
 * @param declarer - declarer's seat
 * @returns total tricks declarer will win (already won + optimal remaining)
 */
export function solveFromPosition(
  deal: Deal,
  playedCards: { seat: Seat; card: Card }[],
  trump: Suit | null,
  declarer: Seat,
): { totalTricksDeclarer: number; tricksWonSoFar: number; remainingTricks: number } {
  const hands: Record<Seat, Card[]> = {
    N: sortCards([...deal.N]),
    E: sortCards([...deal.E]),
    S: sortCards([...deal.S]),
    W: sortCards([...deal.W]),
  };

  for (const tc of playedCards) {
    hands[tc.seat] = removeCard(hands[tc.seat], tc.card);
  }

  let declarerTricks = 0;
  let defenderTricks = 0;
  let lastWinner: Seat | null = null;

  const completedTrickCount = Math.floor(playedCards.length / 4);
  const partialTrickSize = playedCards.length % 4;

  for (let t = 0; t < completedTrickCount; t++) {
    const trickCards = playedCards.slice(t * 4, t * 4 + 4);
    const winner = trickWinner(trickCards, trump);
    if (isNS(winner) === isNS(declarer)) declarerTricks++;
    else defenderTricks++;
    lastWinner = winner;
  }

  const partialTrick = partialTrickSize > 0
    ? playedCards.slice(completedTrickCount * 4)
    : [];

  const memo = new Map<string, number>();
  const remainingFullTricks = 13 - completedTrickCount - (partialTrickSize > 0 ? 1 : 0);

  let optimalTotal: number;

  if (partialTrickSize === 0) {
    if (remainingFullTricks === 0) {
      optimalTotal = declarerTricks;
    } else {
      const leader = lastWinner ?? playedCards[0]?.seat ?? nextSeat(declarer);
      optimalTotal = solveDoubleDummy(hands, trump, declarer, leader, declarerTricks, defenderTricks, remainingFullTricks, -1, 14, memo);
    }
  } else {
    optimalTotal = completePartialTrick(hands, trump, declarer, partialTrick, declarerTricks, defenderTricks, remainingFullTricks, -1, 14, memo);
  }

  return {
    totalTricksDeclarer: optimalTotal,
    tricksWonSoFar: declarerTricks,
    remainingTricks: optimalTotal - declarerTricks,
  };
}

export function parScore(
  deal: Deal,
  trump: Suit | null,
  declarer: Seat,
  leader: Seat,
  vulnerable: boolean,
): { tricks: number; score: number; description: string } {
  const result = solveDeal(deal, trump, declarer, leader);
  const tricks = result.tricksDeclarer;

  // Compute score for the par contract (level = tricks - 6)
  const level = Math.max(1, tricks - 6);
  const strain = trump ?? 'NT';

  let score = 0;
  const trickScore = strain === 'NT' ? 40 + 30 * (level - 1) : (strain === 'H' || strain === 'S' ? 30 * level : 20 * level);

  if (tricks >= 6 + level) {
    score = trickScore;
    if (trickScore >= 100) {
      score += vulnerable ? 500 : 300;
    } else {
      score += 50;
    }
  } else {
    score = 0;
  }

  return {
    tricks,
    score,
    description: `${tricks} tricks for ${declarer} (${level}${strain})`,
  };
}
