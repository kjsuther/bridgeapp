/*
 * Duplicate IMP match hand scheduling.
 *
 * Match structure:
 *   Hands 1-10:  original hands (freshly dealt, played normally)
 *   Hands 11-20: replay hands — hand N+10 replays hand N with seats swapped
 *   Hands 21+:   alternating — odd hands are new originals; the next even hand
 *                replays the oldest played original that hasn't been replayed yet
 *
 * In the "alternating" phase (hand 21+):
 *   hand 21 = new original (board 11)
 *   hand 22 = replay of hand 1 (oldest unreplayed original)
 *   hand 23 = new original (board 12)
 *   hand 24 = replay of hand 2
 *   ...and so on
 */

import type { HandRole } from '@/types/bridge';

export interface HandSchedule {
  role: HandRole;
  originalHandNumber: number | null;
  boardNumber: number;
}

/**
 * Given the current hand number (1-indexed) and the number of original hands
 * that have already been played and are available for replay, determine what
 * the next hand should be.
 *
 * @param handNumber - the hand about to be created (1-indexed)
 * @param replayableOriginals - array of original hand numbers that have been
 *   played but not yet replayed, in chronological order (oldest first)
 */
export function scheduleHand(
  handNumber: number,
  replayableOriginals: number[],
): HandSchedule {
  // Phase 1: hands 1-10 are all originals
  if (handNumber <= 10) {
    return {
      role: 'original',
      originalHandNumber: null,
      boardNumber: handNumber,
    };
  }

  // Phase 2: hands 11-20 replay hands 1-10 respectively
  if (handNumber >= 11 && handNumber <= 20) {
    const origNum = handNumber - 10;
    return {
      role: 'replay',
      originalHandNumber: origNum,
      boardNumber: origNum,
    };
  }

  // Phase 3: hands 21+ alternate new original / replay oldest
  const phase3Hand = handNumber - 20; // 1-indexed within phase 3
  const isOdd = phase3Hand % 2 === 1;

  if (isOdd) {
    // New original: board number = 10 + (phase3Hand + 1) / 2
    const boardNum = 10 + (phase3Hand + 1) / 2;
    return {
      role: 'original',
      originalHandNumber: null,
      boardNumber: boardNum,
    };
  }

  // Replay: pick the oldest unreplayed original from the queue
  const replayIdx = phase3Hand / 2 - 1; // 0-indexed: 0, 1, 2, ...
  const origNum = replayableOriginals[replayIdx] ?? null;
  return {
    role: 'replay',
    originalHandNumber: origNum,
    boardNumber: origNum ?? 0,
  };
}

/**
 * After a replay hand completes, compute the board number for display.
 * The board number is just the original hand's number.
 */
export function boardNumberForReplay(originalHandNumber: number): number {
  return originalHandNumber;
}
