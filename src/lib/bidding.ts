import type { AuctionEntry, Bid, Contract, Seat, Strain } from '@/types/bridge';
import { STRAINS } from '@/types/bridge';

export function bidValue(bid: Bid): number {
  if (bid.type !== 'bid') return -1;
  const strainOrder: Record<Strain, number> = { C: 0, D: 1, H: 2, S: 3, NT: 4 };
  return bid.level * 5 + strainOrder[bid.strain];
}

export function bidLabel(bid: Bid): string {
  switch (bid.type) {
    case 'pass': return 'Pass';
    case 'double': return 'X';
    case 'redouble': return 'XX';
    case 'bid': return `${bid.level}${bid.strain === 'NT' ? 'NT' : bid.strain}`;
  }
}

export function getLastBid(auction: AuctionEntry[]): AuctionEntry | null {
  for (let i = auction.length - 1; i >= 0; i--) {
    if (auction[i].bid.type === 'bid') return auction[i];
  }
  return null;
}

export function getLastNonPassBid(auction: AuctionEntry[]): AuctionEntry | null {
  return getLastBid(auction);
}

export function getCurrentDoubleState(auction: AuctionEntry[]): 'none' | 'doubled' | 'redoubled' {
  const lastBidIdx = (() => {
    for (let i = auction.length - 1; i >= 0; i--) {
      if (auction[i].bid.type === 'bid') return i;
    }
    return -1;
  })();

  if (lastBidIdx === -1) return 'none';

  let state: 'none' | 'doubled' | 'redoubled' = 'none';
  for (let i = lastBidIdx + 1; i < auction.length; i++) {
    if (auction[i].bid.type === 'double') state = 'doubled';
    else if (auction[i].bid.type === 'redouble') state = 'redoubled';
  }
  return state;
}

export function isValidBid(bid: Bid, auction: AuctionEntry[], currentSeat: Seat): boolean {
  const lastBid = getLastBid(auction);

  if (bid.type === 'pass') return true;

  if (bid.type === 'bid') {
    if (bid.level < 1 || bid.level > 7) return false;
    if (!STRAINS.includes(bid.strain)) return false;
    if (!lastBid) return true;
    return bidValue(bid) > bidValue(lastBid.bid);
  }

  if (bid.type === 'double') {
    if (!lastBid) return false;
    // Can only double an opponent's bid
    const lastBidder = lastBid.seat;
    const isOpponent = !isPartner(currentSeat, lastBidder);
    if (!isOpponent) return false;
    // Can't double if already doubled or redoubled
    const state = getCurrentDoubleState(auction);
    return state === 'none';
  }

  if (bid.type === 'redouble') {
    if (!lastBid) return false;
    // Can only redouble your own partner's doubled bid
    const lastBidder = lastBid.seat;
    const isPartner_ = isPartner(currentSeat, lastBidder);
    if (!isPartner_) return false;
    const state = getCurrentDoubleState(auction);
    return state === 'doubled';
  }

  return false;
}

function isPartner(seatA: Seat, seatB: Seat): boolean {
  const ns: Seat[] = ['N', 'S'];
  const ew: Seat[] = ['E', 'W'];
  return (ns.includes(seatA) && ns.includes(seatB)) ||
    (ew.includes(seatA) && ew.includes(seatB));
}

export function isAuctionComplete(auction: AuctionEntry[]): boolean {
  if (auction.length < 4) return false;
  const lastThree = auction.slice(-3);
  if (lastThree.length < 3) return false;

  // Auction ends with 3 consecutive passes after a bid, or 4 passes at the start
  const allPass = lastThree.every((e) => e.bid.type === 'pass');
  if (!allPass) return false;

  // Check if there was at least one bid
  const hasBid = auction.some((e) => e.bid.type === 'bid');
  if (!hasBid) {
    // 4 passes = passed out
    return auction.length >= 4 && auction.slice(-4).every((e) => e.bid.type === 'pass');
  }

  return true;
}

export function isPassedOut(auction: AuctionEntry[]): boolean {
  return auction.length === 4 && auction.every((e) => e.bid.type === 'pass');
}

export function determineContract(auction: AuctionEntry[]): Contract | null {
  if (isPassedOut(auction)) return null;

  const lastBid = getLastBid(auction);
  if (!lastBid || lastBid.bid.type !== 'bid') return null;

  // Find the first bidder of this strain on the declarer's side
  const declarerSide = isPartner('N', lastBid.seat) ? ['N', 'S'] as Seat[] : ['E', 'W'] as Seat[];
  const strain = lastBid.bid.strain;

  let declarer: Seat = lastBid.seat;
  for (const entry of auction) {
    if (entry.bid.type === 'bid' && entry.bid.strain === strain && declarerSide.includes(entry.seat)) {
      declarer = entry.seat;
      break;
    }
  }

  const doubleState = getCurrentDoubleState(auction);
  const doubled: 0 | 1 | 2 = doubleState === 'none' ? 0 : doubleState === 'doubled' ? 1 : 2;

  return {
    level: lastBid.bid.level,
    strain,
    declarer,
    doubled,
    tricksMade: 0,
  };
}

export function getBidderSeat(auction: AuctionEntry[], dealer: Seat): Seat {
  if (auction.length === 0) return dealer;
  const lastSeat = auction[auction.length - 1].seat;
  const idx = ['N', 'E', 'S', 'W'].indexOf(lastSeat);
  return ['N', 'E', 'S', 'W'][(idx + 1) % 4] as Seat;
}
