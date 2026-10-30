import { describe, expect, it } from 'vitest';
import { createPlayAnimationTracker } from './playAnimation';
import { applyCardPlay, createInitialPlayState } from './play';
import type { TrickCard } from '@/types/bridge';

const plays: TrickCard[] = [
  { seat: 'N', card: { rank: 'A', suit: 'S' } },
  { seat: 'E', card: { rank: 'K', suit: 'S' } },
  { seat: 'S', card: { rank: 'Q', suit: 'S' } },
  { seat: 'W', card: { rank: 'J', suit: 'S' } },
];
describe('card animation identity', () => {
  it('animates each play once, including the fourth card that completes a trick', () => {
    const track = createPlayAnimationTracker();
    let state = createInitialPlayState('N');
    track('hand1', state);
    for (const play of plays) {
      state = applyCardPlay(state, play.seat, play.card).newPlayState;
      expect(track('hand1', state)).toEqual([play]);
      expect(track('hand1', JSON.parse(JSON.stringify(state)))).toEqual([]);
    }
    expect(state.currentTrick).toHaveLength(0);
  });

  it('does not replay animations for a stale reload, undo, or rejoining a hand', () => {
    const track = createPlayAnimationTracker();
    const start = createInitialPlayState('N');
    const played = applyCardPlay(start, plays[0].seat, plays[0].card).newPlayState;
    track('hand1', start);
    expect(track('hand1', played)).toHaveLength(1);
    expect(track('hand1', start)).toEqual([]);
    expect(track('hand1', played)).toEqual([]);
    expect(createPlayAnimationTracker()('hand1', played)).toEqual([]);
  });

  it('resets identities for a new hand and handles a multi-card catch-up once', () => {
    const track = createPlayAnimationTracker();
    const start = createInitialPlayState('N');
    let state = start;
    track('hand1', start);
    for (const play of plays) state = applyCardPlay(state, play.seat, play.card).newPlayState;
    expect(track('hand1', state)).toEqual(plays);
    expect(track('hand1', state)).toEqual([]);
    track('hand2', start);
    expect(track('hand2', state)).toEqual(plays);
  });
});
