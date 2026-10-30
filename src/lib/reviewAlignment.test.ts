import { expect, it } from 'vitest';
import { createDeck } from './dealing';
import { alignedReplaySeats, NORMAL_REVIEW_SEATS } from './reviewAlignment';
import { SEATS } from '@/types/bridge';
import type { Deal } from '@/types/bridge';

const deck = createDeck();
const original = Object.fromEntries(SEATS.map((s, i) => [s, deck.slice(i * 13, i * 13 + 13)])) as unknown as Deal;
it.each([0, 1, 2, 3])('aligns matching hands after %s clockwise seat rotations without mutating the deal', offset => {
  const replay = Object.fromEntries(SEATS.map((s, i) => [SEATS[(i + offset) % 4], [...original[s]].reverse()])) as unknown as Deal;
  const before = JSON.stringify(replay);
  const layout = alignedReplaySeats(original, replay);
  for (const position of SEATS) {
    expect(new Set(replay[layout[position]].map(c => c.rank + c.suit)))
      .toEqual(new Set(original[position].map(c => c.rank + c.suit)));
  }
  expect(JSON.stringify(replay)).toBe(before);
});
it('also aligns historical reflected deals and falls back for unrelated boards', () => {
  const reflected = { N: original.E, E: original.N, S: original.W, W: original.S };
  expect(alignedReplaySeats(original, reflected)).toEqual({ N: 'E', E: 'N', S: 'W', W: 'S' });
  expect(alignedReplaySeats(original, { ...original, N: [] })).toEqual(NORMAL_REVIEW_SEATS);
});
