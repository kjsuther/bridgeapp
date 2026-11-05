import type { Contract, Phase, Seat } from '@/types/bridge';
import { dummySeat } from '@/lib/play';

export function actingSeat(phase: Phase, currentSeat: Seat | null, contract: Contract | null): Seat | null {
  if (phase === 'bidding') return currentSeat;
  if (phase !== 'playing' || !contract) return null;
  return currentSeat === dummySeat(contract.declarer) ? contract.declarer : currentSeat;
}
