/*
 * Duplicate IMP match hand scheduling.
 *
 * Match structure (with configurable N = newHandsBeforeReplay):
 *   Hands 1..N:     all new "original" hands, dealt fresh
 *   Hands N+1 onward: alternating — first a replay of the oldest unreplayed
 *                     original, then a new original, then a replay, then new...
 *
 * Example with N=10:
 *   hand 1-10  = new originals (boards 1-10)
 *   hand 11    = replay of hand 1
 *   hand 12    = new original (board 11)
 *   hand 13    = replay of hand 2
 *   hand 14    = new original (board 12)
 *   ...forever
 */

import type { HandRole } from '@/types/bridge';

export interface HandSchedule {
  role: HandRole;
  originalHandNumber: number | null;
  boardNumber: number;
}

/**
 * Given the current hand number (1-indexed), the number of new hands that must
 * be played before replays start, and the list of original hand numbers that
 * have been played but not yet replayed (oldest first), determine what the
 * next hand should be.
 *
 * @param handNumber - the hand about to be created (1-indexed)
 * @param newHandsBeforeReplay - how many new hands before replays begin
 * @param replayableOriginals - original hand numbers played but not yet replayed,
 *   in chronological order (oldest first)
 */
export function scheduleHand(
  handNumber: number,
  newHandsBeforeReplay: number,
  replayableOriginals: number[],
): HandSchedule {
  // Phase 1: first N hands are all new originals
  if (handNumber <= newHandsBeforeReplay) {
    return {
      role: 'original',
      originalHandNumber: null,
      boardNumber: handNumber,
    };
  }

  // Phase 2: alternating replay / new, starting with a replay
  const altIndex = handNumber - newHandsBeforeReplay - 1; // 0-indexed
  const isReplay = altIndex % 2 === 0;

  if (isReplay) {
    const replayIdx = Math.floor(altIndex / 2); // 0, 1, 2, ...
    const origNum = replayableOriginals[replayIdx] ?? null;
    return {
      role: 'replay',
      originalHandNumber: origNum,
      boardNumber: origNum ?? 0,
    };
  }

  // New original: board number continues after the initial N
  const newCount = Math.floor(altIndex / 2) + 1; // 1, 2, 3, ...
  const boardNum = newHandsBeforeReplay + newCount;
  return {
    role: 'original',
    originalHandNumber: null,
    boardNumber: boardNum,
  };
}
