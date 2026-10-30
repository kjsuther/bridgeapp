import type { Deal, Seat } from '@/types/bridge';
import { SEATS } from '@/types/bridge';

export const NORMAL_REVIEW_SEATS: Record<Seat, Seat> = { N: 'N', E: 'E', S: 'S', W: 'W' };

// Map screen positions to actual replay seats by matching the full starting
// hands. Only presentation changes; solver inputs retain their real seats.
export function alignedReplaySeats(original: Deal, replay: Deal): Record<Seat, Seat> {
  const signature = (deal: Deal, seat: Seat) => deal[seat].map(c => c.rank + c.suit).sort().join(',');
  const result = { ...NORMAL_REVIEW_SEATS };
  const used = new Set<Seat>();
  for (const position of SEATS) {
    const actual = SEATS.find(seat => replay[seat].length === 13 && original[position].length === 13
      && signature(original, position) === signature(replay, seat));
    if (!actual || used.has(actual)) return { ...NORMAL_REVIEW_SEATS };
    result[position] = actual;
    used.add(actual);
  }
  return result;
}
