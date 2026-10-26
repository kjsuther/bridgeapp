import { describe, expect, it } from 'vitest';
import { SEATS, isVulnerable, nextSeat, sideOfSeat } from '@/types/bridge';
import type { AuctionEntry, Contract, Vulnerability } from '@/types/bridge';
import { swapSeatForReplay, swapVulnerabilityForReplay } from './dealing';
import { getBidderSeat } from './bidding';
import { applyCardPlay, createInitialPlayState, dummySeat, getOpeningLeader } from './play';
import { computeImpResult } from './impScoring';

describe('replay board rotation', () => {
  it.each(SEATS)('preserves bidding and trick order when %s is dealer/declarer', (seat) => {
    const replaySeat = swapSeatForReplay(seat);
    expect(sideOfSeat(replaySeat)).not.toBe(sideOfSeat(seat));
    expect(dummySeat(replaySeat)).toBe(swapSeatForReplay(dummySeat(seat)));

    const originalAuction: AuctionEntry[] = [];
    const replayAuction: AuctionEntry[] = [];
    for (let turn = 0; turn < 4; turn++) {
      const bidder = getBidderSeat(originalAuction, seat);
      const replayBidder = getBidderSeat(replayAuction, replaySeat);
      expect(replayBidder).toBe(swapSeatForReplay(bidder));
      originalAuction.push({ seat: bidder, bid: { type: 'pass' } });
      replayAuction.push({ seat: replayBidder, bid: { type: 'pass' } });
    }

    let original = createInitialPlayState(getOpeningLeader({ declarer: seat }));
    let replay = createInitialPlayState(getOpeningLeader({ declarer: replaySeat }));
    expect(replay.currentSeat).toBe(swapSeatForReplay(original.currentSeat));
    // The second card wins, exercising the transition to the next trick too.
    for (const rank of ['2', 'A', '3', '4'] as const) {
      expect(replay.currentSeat).toBe(swapSeatForReplay(original.currentSeat));
      const card = { rank, suit: 'H' as const };
      original = applyCardPlay(original, original.currentSeat, card).newPlayState;
      replay = applyCardPlay(replay, replay.currentSeat, card).newPlayState;
    }
    expect(replay.currentSeat).toBe(swapSeatForReplay(original.currentSeat));
    expect(replay.leader).toBe(swapSeatForReplay(original.leader));
    expect(replay.tricksWonNS).toBe(original.tricksWonEW);
    expect(replay.tricksWonEW).toBe(original.tricksWonNS);
    expect(nextSeat(replaySeat)).toBe(swapSeatForReplay(nextSeat(seat)));
  });

  it.each<Vulnerability>(['none', 'NS', 'EW', 'both'])('keeps vulnerability with the cards for %s', (vulnerability) => {
    const replayVulnerability = swapVulnerabilityForReplay(vulnerability);
    for (const seat of SEATS) {
      expect(isVulnerable(swapSeatForReplay(seat), replayVulnerability))
        .toBe(isVulnerable(seat, vulnerability));
      const original: Contract = { level: 4, strain: 'S', declarer: seat, doubled: 1, tricksMade: 9 };
      const replay = { ...original, declarer: swapSeatForReplay(seat) };
      // Identical outcomes with opposite partnerships' cards must cancel,
      // including doubled undertricks on boards where only one side is vulnerable.
      expect(computeImpResult(original, replay, vulnerability, replayVulnerability)).toBe(0);
    }
  });

  it('uses the recorded vulnerability for legacy replays', () => {
    const original: Contract = { level: 4, strain: 'S', declarer: 'N', doubled: 0, tricksMade: 9 };
    const replay: Contract = { ...original, declarer: 'E' };
    expect(computeImpResult(original, replay, 'NS')).toBe(-2);
    expect(computeImpResult(original, replay, 'NS', 'NS')).toBe(-2);
    expect(computeImpResult(original, replay, 'NS', 'EW')).toBe(0);
  });
});
