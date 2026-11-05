import type { HandRole, Phase, Seat } from '@/types/bridge';
import { nextSeat } from '@/types/bridge';
import { swapSeatForReplay } from '@/lib/dealing';

export const INITIAL_ORIGINAL_HANDS = 8;

export interface ScheduledHand {
  id: string;
  hand_number: number;
  hand_role: HandRole;
  phase: Phase;
  original_hand_id: string | null;
  dealer: Seat;
}

export interface HandSchedule {
  role: HandRole;
  originalHandNumber: number | null;
  originalHandId: string | null;
  boardNumber: number;
  dealer: Seat;
}

// Dealer always advances from the last hand actually played, including legacy
// games with irregular dealer history. Only compatible originals may be replayed.
export function scheduleHand(handNumber: number, history: ScheduledHand[]): HandSchedule {
  const previous = history.filter(hand => hand.hand_number < handNumber)
    .sort((a, b) => a.hand_number - b.hand_number);
  const dealer = previous.length ? nextSeat(previous[previous.length - 1].dealer) : 'N';
  const used = new Set(previous.filter(hand => hand.hand_role === 'replay').map(hand => hand.original_hand_id));
  const original = handNumber > INITIAL_ORIGINAL_HANDS ? previous.find(hand =>
    hand.hand_role === 'original' && (hand.phase === 'scoring' || hand.phase === 'finished') &&
    !used.has(hand.id) && swapSeatForReplay(hand.dealer) === dealer,
  ) : undefined;
  return {
    role: original ? 'replay' : 'original',
    originalHandNumber: original?.hand_number ?? null,
    originalHandId: original?.id ?? null,
    boardNumber: original?.hand_number ?? handNumber,
    dealer,
  };
}
