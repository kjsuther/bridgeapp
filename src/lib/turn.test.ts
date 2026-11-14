import { expect, it } from 'vitest';
import { actingSeat } from './turn';
import { dummySeat } from './play';
import type { Contract, Seat } from '@/types/bridge';
const contract: Contract = { level: 4, strain: 'H', declarer: 'S', doubled: 0, tricksMade: 0 };
it('routes dummy turns to declarer and other card turns to the actual player', () => {
  expect(actingSeat('playing', 'N', contract)).toBe('S');
  expect(actingSeat('playing', 'S', contract)).toBe('S');
  expect(actingSeat('playing', 'E', contract)).toBe('E');
  expect(actingSeat('playing', 'W', contract)).toBe('W');
});
it('notifies the actual bidder before a dummy exists', () => {
  for (const seat of ['N', 'E', 'S', 'W'] as Seat[]) expect(actingSeat('bidding', seat, null)).toBe(seat);
});
it('never treats a completed hand as a turn to act', () => {
  expect(actingSeat('scoring', 'N', contract)).toBeNull();
  expect(actingSeat('finished', 'S', contract)).toBeNull();
  expect(actingSeat('playing', null, contract)).toBeNull();
});

it('attributes dummy card-play time to the declarer, not the dummy', () => {
  for (const declarer of ['N', 'E', 'S', 'W'] as Seat[]) {
    const c: Contract = { level: 3, strain: 'N', declarer, doubled: 0, tricksMade: 0 };
    const dummy = dummySeat(declarer);
    expect(actingSeat('playing', dummy, c)).toBe(declarer);
  }
});

it('attributes card-play time to the actual player when they are not the dummy', () => {
  for (const declarer of ['N', 'E', 'S', 'W'] as Seat[]) {
    const c: Contract = { level: 3, strain: 'N', declarer, doubled: 0, tricksMade: 0 };
    const dummy = dummySeat(declarer);
    for (const seat of ['N', 'E', 'S', 'W'] as Seat[]) {
      if (seat === dummy) continue;
      expect(actingSeat('playing', seat, c)).toBe(seat);
    }
  }
});

it('attributes bidding time to the bidder regardless of eventual contract', () => {
  for (const seat of ['N', 'E', 'S', 'W'] as Seat[]) {
    expect(actingSeat('bidding', seat, contract)).toBe(seat);
    expect(actingSeat('bidding', seat, null)).toBe(seat);
  }
});
