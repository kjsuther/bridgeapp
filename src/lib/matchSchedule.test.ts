import { expect, it } from 'vitest';
import { scheduleHand, INITIAL_ORIGINAL_HANDS, type ScheduledHand } from './matchSchedule';
import { nextSeat, type Seat } from '@/types/bridge';
import { swapSeatForReplay } from './dealing';

function original(number: number, dealer: Seat): ScheduledHand {
  return { id: `hand-${number}`, hand_number: number, hand_role: 'original', phase: 'scoring', original_hand_id: null, dealer };
}
const initial = () => Array.from({ length: 8 }, (_, i) => original(i + 1, (['N', 'E', 'S', 'W'] as Seat[])[i % 4]));

it('starts with eight originals and then selects the oldest dealer-compatible hand', () => {
  for (let hand = 1; hand <= INITIAL_ORIGINAL_HANDS; hand++) {
    expect(scheduleHand(hand, initial())).toMatchObject({ role: 'original', originalHandId: null });
  }
  expect(scheduleHand(9, initial())).toMatchObject({ role: 'replay', dealer: 'N', originalHandNumber: 4 });
});

it('maintains strict dealer rotation and selects the oldest eligible unreplayed hand over a long game', () => {
  const history: ScheduledHand[] = [];
  for (let number = 1; number <= 100; number++) {
    const previous = history[history.length - 1];
    const next = scheduleHand(number, [...history].reverse());
    expect(next.dealer).toBe(previous ? nextSeat(previous.dealer) : 'N');
    const used = new Set(history.filter(hand => hand.hand_role === 'replay').map(hand => hand.original_hand_id));
    const eligible = history.find(hand => hand.hand_role === 'original' && !used.has(hand.id) && swapSeatForReplay(hand.dealer) === next.dealer);
    if (number > INITIAL_ORIGINAL_HANDS && eligible) {
      expect(next.originalHandId).toBe(eligible.id);
      expect(next.role).toBe('replay');
    } else expect(next.role).toBe('original');
    history.push({ ...original(number, next.dealer), hand_role: next.role, original_hand_id: next.originalHandId });
  }
  expect(history.slice(8, 16).map(hand => hand.original_hand_id)).toEqual([
    'hand-4', 'hand-1', 'hand-2', 'hand-3', 'hand-8', 'hand-5', 'hand-6', 'hand-7',
  ]);
});

it('deals fresh when no earlier hand fits and recovers an older skipped hand when its dealer fits later', () => {
  const history: ScheduledHand[] = [original(2, 'E'), { ...original(16, 'S'), hand_role: 'replay', original_hand_id: 'other-original' }];
  expect(scheduleHand(17, history)).toMatchObject({ dealer: 'W', role: 'original', originalHandId: null });
  history.push(original(17, 'W'));
  expect(scheduleHand(18, history)).toMatchObject({ dealer: 'N', originalHandNumber: 17 });
  history.push({ ...original(18, 'N'), hand_role: 'replay', original_hand_id: 'hand-17' });
  expect(scheduleHand(19, history)).toMatchObject({ dealer: 'E', role: 'original' });
  history.push(original(19, 'E'));
  expect(scheduleHand(20, history)).toMatchObject({ dealer: 'S', originalHandNumber: 2 });
});

it('continues from the actual previous dealer in legacy games, not the hand-number formula', () => {
  expect(scheduleHand(26, [original(2, 'E'), original(25, 'E')])).toMatchObject({ dealer: 'S', originalHandNumber: 2 });
});

it('excludes incomplete, already reserved, and future originals without mutating history', () => {
  const history: ScheduledHand[] = [
    { ...original(1, 'W'), phase: 'playing' }, original(2, 'W'),
    { ...original(3, 'N'), hand_role: 'replay', original_hand_id: 'hand-2' },
    original(4, 'W'), original(8, 'W'), original(30, 'W'),
  ];
  const snapshot = JSON.stringify(history);
  expect(scheduleHand(9, history)).toMatchObject({ originalHandNumber: 4, dealer: 'N' });
  expect(JSON.stringify(history)).toBe(snapshot);
});
