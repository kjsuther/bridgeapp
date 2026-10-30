import type { PlayState, TrickCard } from '@/types/bridge';

export function playedCardKey(play: TrickCard) {
  return `${play.seat}-${play.card.rank}${play.card.suit}`;
}

// Optimistic state, database echoes, and stale snapshots can all contain the
// same play. A physical card animates only once per hand, including on undo.
export function createPlayAnimationTracker() {
  let currentHand: string | null = null;
  let seen = new Set<string>();
  return (hand: string, state: PlayState | null): TrickCard[] => {
    if (!state) return [];
    const plays = [...state.completedTricks.flat(), ...state.currentTrick];
    if (currentHand !== hand) {
      currentHand = hand;
      seen = new Set(plays.map(playedCardKey));
      return [];
    }
    const next = plays.filter(play => !seen.has(playedCardKey(play)));
    plays.forEach(play => seen.add(playedCardKey(play)));
    return next;
  };
}
