import type { Card, Deal, Hand, Rank, Seat, Suit, Vulnerability } from '@/types/bridge';
import { RANK_VALUES, SEATS, SUITS } from '@/types/bridge';

const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function dealHands(): Deal {
  const deck = shuffleDeck(createDeck());
  return {
    N: deck.slice(0, 13),
    E: deck.slice(13, 26),
    S: deck.slice(26, 39),
    W: deck.slice(39, 52),
  };
}

export function sortHand(hand: Hand, trumpStrain?: string): Hand {
  const baseOrder: Record<Suit, number> = { S: 0, H: 1, D: 2, C: 3 };
  const suitOrder: Record<Suit, number> = { S: 0, H: 1, D: 2, C: 3 };
  if (trumpStrain && trumpStrain !== 'NT' && (trumpStrain === 'S' || trumpStrain === 'H' || trumpStrain === 'D' || trumpStrain === 'C')) {
    const trump = trumpStrain as Suit;
    const others = (['S', 'H', 'D', 'C'] as Suit[]).filter((s) => s !== trump);
    suitOrder[trump] = 0;
    suitOrder[others[0]] = 1;
    suitOrder[others[1]] = 2;
    suitOrder[others[2]] = 3;
  } else {
    Object.assign(suitOrder, baseOrder);
  }
  return [...hand].sort((a, b) => {
    if (a.suit !== b.suit) return suitOrder[a.suit] - suitOrder[b.suit];
    return RANK_VALUES[b.rank] - RANK_VALUES[a.rank];
  });
}

export function highCardPoints(hand: Hand): number {
  const points: Partial<Record<Rank, number>> = { A: 4, K: 3, Q: 2, J: 1 };
  return hand.reduce((sum, card) => sum + (points[card.rank] ?? 0), 0);
}

export function distributionPoints(hand: Hand): number {
  const suitLengths: Record<Suit, number> = { S: 0, H: 0, D: 0, C: 0 };
  for (const card of hand) suitLengths[card.suit]++;
  let points = 0;
  for (const suit of SUITS) {
    const len = suitLengths[suit];
    if (len === 0) points += 3;
    else if (len === 1) points += 2;
    else if (len === 2) points += 1;
  }
  return points;
}

export function dealToString(deal: Deal): string {
  const parts: string[] = [];
  for (const seat of SEATS) {
    parts.push(`${seat}:${deal[seat].map((c) => `${c.rank}${c.suit}`).join(',')}`);
  }
  return parts.join('|');
}

export function stringToDeal(str: string): Deal {
  const deal = { N: [], E: [], S: [], W: [] } as unknown as Deal;
  for (const part of str.split('|')) {
    const [seat, cards] = part.split(':');
    const hand: Hand = cards.split(',').map((c) => ({
      rank: c[0] as Rank,
      suit: c[1] as Suit,
    }));
    deal[seat as Seat] = hand;
  }
  return deal;
}

export function dealToJSON(deal: Deal): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const seat of SEATS) {
    result[seat] = deal[seat].map((c) => `${c.rank}${c.suit}`);
  }
  return result;
}

export function jsonToDeal(json: Record<string, string[]>): Deal {
  const deal = { N: [], E: [], S: [], W: [] } as unknown as Deal;
  for (const seat of SEATS) {
    deal[seat] = (json[seat] || []).map((s) => ({
      rank: s[0] as Rank,
      suit: s[1] as Suit,
    }));
  }
  return deal;
}

export const VULNERABILITY_CYCLE: Vulnerability[] = [
  'none', 'NS', 'EW', 'both', 'NS', 'EW', 'both', 'none',
  'EW', 'both', 'none', 'NS', 'both', 'none', 'NS', 'EW',
];

export function vulnerabilityForHand(handNumber: number): Vulnerability {
  const idx = (handNumber - 1) % VULNERABILITY_CYCLE.length;
  return VULNERABILITY_CYCLE[idx];
}

export function dealerForHand(handNumber: number, firstDealer: Seat): Seat {
  const dealerIdx = SEATS.indexOf(firstDealer);
  const offset = (handNumber - 1) % 4;
  return SEATS[(dealerIdx + offset) % 4];
}
