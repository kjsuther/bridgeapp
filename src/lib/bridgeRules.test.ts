import { describe, expect, it } from 'vitest';
import { isAuctionComplete, isPassedOut, isValidBid } from './bidding';
import { createDeck, dealHands } from './dealing';
import { createInitialPlayState, getLegalCards, trickWinner } from './play';
import { createInitialRubberState, scoreHand, updateRubberState } from './scoring';
import type { AuctionEntry, Card, Contract } from '@/types/bridge';

describe('dealing', () => {
  it('creates 52 unique cards and four 13-card hands', () => {
    const deck = createDeck();
    expect(new Set(deck.map((card) => `${card.rank}${card.suit}`)).size).toBe(52);

    const deal = dealHands();
    expect(Object.values(deal).every((hand) => hand.length === 13)).toBe(true);
    expect(new Set(Object.values(deal).flat().map((card) => `${card.rank}${card.suit}`)).size).toBe(52);
  });
});

describe('auction rules', () => {
  it('recognizes a passed-out hand and rejects a lower bid', () => {
    const passes: AuctionEntry[] = ['N', 'E', 'S', 'W'].map((seat) => ({
      seat: seat as AuctionEntry['seat'],
      bid: { type: 'pass' },
    }));
    expect(isPassedOut(passes)).toBe(true);
    expect(isAuctionComplete(passes)).toBe(true);

    const auction: AuctionEntry[] = [{ seat: 'N', bid: { type: 'bid', level: 2, strain: 'H' } }];
    expect(isValidBid({ type: 'bid', level: 2, strain: 'D' }, auction, 'E')).toBe(false);
    expect(isValidBid({ type: 'bid', level: 2, strain: 'S' }, auction, 'E')).toBe(true);
  });
});

describe('play rules', () => {
  it('requires following the led suit and identifies the winning trump', () => {
    const state = createInitialPlayState('N');
    state.currentTrick = [{ seat: 'N', card: { rank: 'A', suit: 'H' } }];
    state.currentSeat = 'E';
    const hand: Card[] = [
      { rank: '2', suit: 'H' },
      { rank: 'A', suit: 'S' },
    ];
    expect(getLegalCards(hand, state, 'E')).toEqual([{ rank: '2', suit: 'H' }]);

    expect(trickWinner([
      { seat: 'N', card: { rank: 'A', suit: 'H' } },
      { seat: 'E', card: { rank: '2', suit: 'S' } },
      { seat: 'S', card: { rank: 'K', suit: 'H' } },
      { seat: 'W', card: { rank: '3', suit: 'H' } },
    ], 'S')).toBe('E');
  });
});

describe('rubber scoring', () => {
  const contract = (overrides: Partial<Contract> = {}): Contract => ({
    level: 1,
    strain: 'NT',
    declarer: 'N',
    doubled: 0,
    tricksMade: 7,
    ...overrides,
  });

  it('scores trick points without duplicate-style game or partscore bonuses', () => {
    expect(scoreHand(contract(), 'none')).toMatchObject({ belowLine: 40, aboveLine: 0 });
    expect(scoreHand(contract({ level: 3, tricksMade: 9 }), 'none'))
      .toMatchObject({ belowLine: 100, aboveLine: 0 });
    expect(scoreHand(contract({ level: 4, strain: 'S', tricksMade: 11 }), 'none'))
      .toMatchObject({ belowLine: 120, aboveLine: 30 });
  });

  it('awards the rubber premium after a side wins its second game', () => {
    const state = { ...createInitialRubberState(), nsGamesWon: 1 };
    const result = updateRubberState(
      state,
      scoreHand(contract({ level: 3, tricksMade: 9 }), 'NS'),
    );
    expect(result.rubberComplete).toBe(true);
    expect(result.newState.nsGamesWon).toBe(2);
    expect(result.newState.nsAbove).toBe(700);
  });
});
