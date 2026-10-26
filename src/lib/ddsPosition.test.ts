import { beforeAll, describe, expect, it } from 'vitest';
import { Dds, loadDds } from 'bridge-dds';
import { analyzePosition, cardKey, contractBadge } from './ddsPosition';
import type { AnalysisPosition } from './ddsPosition';
import { createDeck } from './dealing';
import { trickWinner } from './play';
import { nextSeat, SEATS, sideOfSeat } from '@/types/bridge';
import type { Card, Deal, Seat, Suit, TrickCard } from '@/types/bridge';

let solver: Dds;
beforeAll(async () => { solver = new Dds(await loadDds()); }, 30000);

export function seededDeal(seed: number): Deal {
  const deck = createDeck();
  for (let index = deck.length - 1; index > 0; index--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const swap = seed % (index + 1);
    [deck[index], deck[swap]] = [deck[swap], deck[index]];
  }
  return Object.fromEntries(SEATS.map((seat, index) => [seat, deck.slice(index * 13, index * 13 + 13)])) as unknown as Deal;
}

function legalCards(hand: Card[], trick: TrickCard[]): Card[] {
  const following = hand.filter(card => card.suit === trick[0]?.card.suit);
  return following.length > 0 ? following : hand;
}

export function historyFor(deal: Deal, trump: Suit | null, leader: Seat): TrickCard[] {
  const hands = structuredClone(deal);
  const history: TrickCard[] = [];
  let trick: TrickCard[] = [];
  let seat = leader;
  while (history.length < 52) {
    const legal = legalCards(hands[seat], trick);
    const card = legal[(history.length * 7 + 3) % legal.length];
    hands[seat] = hands[seat].filter(candidate => cardKey(candidate) !== cardKey(card));
    const played = { seat, card };
    history.push(played);
    trick.push(played);
    if (trick.length === 4) { seat = trickWinner(trick, trump)!; trick = []; }
    else seat = nextSeat(seat);
  }
  return history;
}

// Independent exhaustive minimax for small endgames: no memoization or pruning.
function exhaustive(position: AnalysisPosition): Record<string, number> {
  const hands = structuredClone(position.deal);
  let won = 0;
  let seat = position.openingLeader;
  let trick: TrickCard[] = [];
  for (const play of position.playedCards) {
    hands[play.seat] = hands[play.seat].filter(card => cardKey(card) !== cardKey(play.card));
    trick.push(play);
    if (trick.length === 4) {
      seat = trickWinner(trick, position.trump)!;
      if (sideOfSeat(seat) === sideOfSeat(position.declarer)) won++;
      trick = [];
    } else seat = nextSeat(play.seat);
  }
  const isDeclarer = (turn: Seat) => sideOfSeat(turn) === sideOfSeat(position.declarer);
  function afterCard(turn: Seat, card: Card, current: TrickCard[], total: number): number {
    const previous = hands[turn];
    hands[turn] = previous.filter(candidate => cardKey(candidate) !== cardKey(card));
    const newTrick = [...current, { seat: turn, card }];
    let next = nextSeat(turn);
    if (newTrick.length === 4) {
      next = trickWinner(newTrick, position.trump)!;
      if (isDeclarer(next)) total++;
      newTrick.length = 0;
    }
    let result = total;
    if (hands[next].length > 0) {
      const choices = legalCards(hands[next], newTrick).map(candidate => afterCard(next, candidate, newTrick, total));
      result = isDeclarer(next) ? Math.max(...choices) : Math.min(...choices);
    }
    hands[turn] = previous;
    return result;
  }
  return Object.fromEntries(legalCards(hands[seat], trick).map(card => [cardKey(card), afterCard(seat, card, trick, won)]));
}

describe('DDS comparison analysis', () => {
  it('expands equivalent ranks so every opening card has a result', () => {
    const deck = createDeck();
    const deal = Object.fromEntries(SEATS.map((seat, index) => [seat, deck.slice(index * 13, index * 13 + 13)])) as unknown as Deal;
    for (const [trump, total] of [['S', 13], ['C', 0]] as const) {
      const result = analyzePosition({ deal, playedCards: [], declarer: 'N', openingLeader: 'E', trump }, solver);
      expect(Object.keys(result.cardTotals)).toHaveLength(13);
      expect(new Set(Object.values(result.cardTotals))).toEqual(new Set([total]));
      expect(result.totalTricks).toBe(total);
    }
  });

  it.each([null, 'S', 'H', 'D', 'C'] as const)('matches exhaustive endgames in %s, including partial tricks and defender choices', (trump) => {
    const deal = seededDeal(87);
    for (const declarer of SEATS) {
      const openingLeader = nextSeat(declarer);
      const history = historyFor(deal, trump, openingLeader);
      for (const count of [40, 41, 42, 43, 44, 49, 51]) {
        const position = { deal, trump, declarer, openingLeader, playedCards: history.slice(0, count) };
        const actual = analyzePosition(position, solver);
        const expected = exhaustive(position);
        expect(actual.cardTotals).toEqual(expected);
        const best = sideOfSeat(actual.nextPlayer!) === sideOfSeat(declarer) ? Math.max : Math.min;
        expect(actual.totalTricks).toBe(best(...Object.values(expected)));
      }
      const complete = analyzePosition({ deal, trump, declarer, openingLeader, playedCards: history }, solver);
      expect(complete.nextPlayer).toBeNull();
      expect(complete.cardTotals).toEqual({});
      expect(complete.totalTricks).toBe(complete.tricksWonSoFar);
    }
  });

  it('keeps the played-card value when analysis advances to the following turn', () => {
    const deal = seededDeal(519);
    const position: AnalysisPosition = { deal, playedCards: [], trump: 'H', declarer: 'S', openingLeader: 'W' };
    const history = historyFor(deal, 'H', 'W');
    for (let count = 40; count < 52; count++) {
      const before = analyzePosition({ ...position, playedCards: history.slice(0, count) }, solver);
      const after = analyzePosition({ ...position, playedCards: history.slice(0, count + 1) }, solver);
      expect(before.cardTotals[cardKey(history[count].card)]).toBe(after.totalTricks);
    }
  });

  it('rejects incomplete hands and invalid play history instead of returning misleading scores', () => {
    const deal = seededDeal(87);
    const base: AnalysisPosition = { deal, playedCards: [], trump: null, declarer: 'N', openingLeader: 'E' };
    expect(() => analyzePosition({ ...base, deal: { ...deal, N: [] } }, solver)).toThrow('all four complete hands');
    expect(() => analyzePosition({ ...base, playedCards: [{ seat: 'N', card: deal.N[0] }] }, solver)).toThrow('turn order');
  });

  it('analyzes all choices on realistic full deals and stepped positions', () => {
    const timings: number[] = [];
    for (const seed of [17, 87, 519, 20261025]) {
      const deal = seededDeal(seed);
      const history = historyFor(deal, 'H', 'E');
      for (const count of [0, 1, 2, 3, 4, 20, 40]) {
        const start = performance.now();
        const result = analyzePosition({ deal, playedCards: history.slice(0, count), trump: 'H', declarer: 'N', openingLeader: 'E' }, solver);
        timings.push(performance.now() - start);
        expect(result.totalTricks).toBeGreaterThanOrEqual(0);
        expect(result.totalTricks).toBeLessThanOrEqual(13);
        if (count === 0) expect(Object.keys(result.cardTotals)).toHaveLength(13);
      }
    }
    console.info('DDS benchmark (28 positions, including 4 full deals):', JSON.stringify({
      totalMs: Math.round(timings.reduce((sum, value) => sum + value, 0)),
      maxMs: Math.round(Math.max(...timings)),
    }));
  }, 30000);
});

describe('contract-relative dots', () => {
  it('shows the requested 4H outcomes', () => {
    expect(contractBadge(9, 4)).toEqual({ label: '-1', className: 'bg-red-600 text-white' });
    expect(contractBadge(10, 4)).toEqual({ label: '=', className: 'bg-emerald-600 text-white' });
    expect(contractBadge(12, 4)).toEqual({ label: '+2', className: 'bg-emerald-600 text-white' });
  });
});
