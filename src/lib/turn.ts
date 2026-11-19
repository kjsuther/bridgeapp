import type { Contract, Phase, Seat } from '@/types/bridge';
import { dummySeat } from '@/lib/play';

export function actingSeat(phase: Phase, currentSeat: Seat | null, contract: Contract | null): Seat | null {
  if (phase === 'bidding') return currentSeat;
  if (phase !== 'playing' || !contract) return null;
  return currentSeat === dummySeat(contract.declarer) ? contract.declarer : currentSeat;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return '0.0s';
  const totalSeconds = Math.floor(ms / 1000);
  const tenths = Math.floor((ms % 1000) / 100);
  if (totalSeconds < 60) return `${totalSeconds}.${tenths}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}
