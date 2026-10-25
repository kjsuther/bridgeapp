/**
 * Context-aware bidding reference based on standard American bidding
 * conventions (SAYC-style). Public-domain bridge conventions — not
 * derived from any copyrighted publication.
 *
 * The guide is organized into sections that map to the bidding situation
 * a player finds themselves in during an auction. A lookup function
 * inspects the current auction and seat to determine which section to show.
 */

import type { AuctionEntry, Seat } from '@/types/bridge';

export interface GuideRow {
  bid: string;
  points: string;
  meaning: string;
}

export interface GuideSection {
  id: string;
  title: string;
  context: string;
  rows: GuideRow[];
  note?: string;
}

const SECTIONS: Record<string, GuideSection> = {
  opening: {
    id: 'opening',
    title: 'Opening Bids',
    context: 'You are the first bidder. Choose your opening based on hand strength and distribution.',
    rows: [
      { bid: '1NT', points: '15-17', meaning: 'Balanced hand (no singleton, no void, at most one doubleton). 4-3-3-3, 4-4-3-2, or 5-3-3-2.' },
      { bid: '1♣', points: '12-21', meaning: '3+ clubs. Opening bid when you don\'t qualify for 1NT and don\'t have a 5-card major.' },
      { bid: '1♦', points: '12-21', meaning: '3+ diamonds (4+ if 4-4 in minors). Default minor-suit opening.' },
      { bid: '1♥', points: '12-21', meaning: '5+ hearts.' },
      { bid: '1♠', points: '12-21', meaning: '5+ spades.' },
      { bid: '2♣', points: '22+', meaning: 'Strong artificial opening. Shows a very powerful hand (or 8.5+ playing tricks).' },
      { bid: '2♦', points: 'Weak', meaning: 'Weak two-bid: 6+ diamonds, 5-10 HCP, no 4-card major on the side.' },
      { bid: '2♥', points: 'Weak', meaning: 'Weak two-bid: 6+ hearts, 5-10 HCP.' },
      { bid: '2♠', points: 'Weak', meaning: 'Weak two-bid: 6+ spades, 5-10 HCP.' },
      { bid: '2NT', points: '20-21', meaning: 'Balanced hand, no 5-card major.' },
      { bid: '3NT', points: '25-27', meaning: 'Balanced, gambling — solid minor suit stoppers.' },
      { bid: '3♣/♦/♥/♠', points: 'Weak', meaning: 'Preempt: 7-card suit, 5-10 HCP. Blocks the opponents.' },
      { bid: 'Pass', points: '0-11', meaning: 'Not enough to open.' },
    ],
    note: 'With 12-14 HCP and a balanced hand, open 1 of a minor (not 1NT, which requires 15-17).',
  },

  response_to_1nt: {
    id: 'response_to_1nt',
    title: 'Responding to 1NT Opening',
    context: 'Partner opened 1NT (15-17 balanced). Your responses depend on your points and distribution.',
    rows: [
      { bid: 'Pass', points: '0-7', meaning: 'No game possible. Pass out the partscore.' },
      { bid: '2♣', points: '8+', meaning: 'Stayman — asks partner if they have a 4-card major.' },
      { bid: '2♦', points: '4-10', meaning: 'Jacoby Transfer to hearts (5+ hearts).' },
      { bid: '2♥', points: '4-10', meaning: 'Jacoby Transfer to spades (5+ spades).' },
      { bid: '2♠', points: '5-10', meaning: 'Minor-suited — asks for club/diamond help (both minors).' },
      { bid: '2NT', points: '8-9', meaning: 'Balanced invitation to 3NT.' },
      { bid: '3NT', points: '10-15', meaning: 'Balanced, no 4-card major, no 5-card minor. To play.' },
      { bid: '3♣/♦', points: '10+', meaning: '5+ cards in that minor, slam interest. Forces opener to bid.' },
      { bid: '3♥/♠', points: '10+', meaning: '6+ cards in that major, slam interest. Game forcing.' },
      { bid: '4♥/♠', points: '10-15', meaning: '6+ cards in that major. To play.' },
    ],
    note: 'With 8+ HCP and a 4-card major, use Stayman (2♣) first. With 5+ in a major, transfer.',
  },

  response_to_1_of_suit: {
    id: 'response_to_1_of_suit',
    title: 'Responding to 1-of-a-Suit Opening',
    context: 'Partner opened 1 of a suit (12-21 HCP). You must respond with 6+ HCP.',
    rows: [
      { bid: '1NT', points: '6-10', meaning: 'Semi-balanced, no fit for partner, cannot bid a new suit at the 1-level. Not forcing.' },
      { bid: '1 of new suit', points: '6+', meaning: 'One-over-one: 4+ cards in a suit ranked above partner\'s. Forcing.' },
      { bid: '2 of new suit (lower)', points: '10+', meaning: 'Two-over-one: 4+ cards in a suit ranked below partner\'s (non-jump). Game forcing.' },
      { bid: '2NT', points: '13-15', meaning: 'Balanced, no fit, limit raise equivalent. Invitational.' },
      { bid: '3NT', points: '16-18', meaning: 'Balanced, no fit, strong. Game forcing.' },
      { bid: 'Single raise (2 of partner\'s suit)', points: '6-10', meaning: '3+ card support (4+ for a major). Limit raise — invitational.' },
      { bid: 'Jump raise (3 of partner\'s suit)', points: '11-12', meaning: '4+ card support. Invitational to game.' },
      { bid: 'Jump to game (4♥/4♠)', points: '13-15', meaning: '5+ card support, preemptive or balanced. To play.' },
      { bid: 'Pass', points: '0-5', meaning: 'Too weak to respond.' },
    ],
    note: 'A 2-over-1 response (e.g., 1♠–2♥) is game-forcing when not vulnerable. With less than 10 HCP, use a single raise or 1NT instead.',
  },

  opener_rebid: {
    id: 'opener_rebid',
    title: 'Opener\'s Rebid (Second Call)',
    context: 'You opened the bidding and partner responded. Your rebid describes your hand further.',
    rows: [
      { bid: 'Pass', points: '12-14', meaning: 'Minimum opening, no fit, partner showed 6-9. Pass is fine.' },
      { bid: 'Raise partner\'s suit', points: '12-16', meaning: '3+ card support for partner\'s response suit. Shows a minimum.' },
      { bid: '1NT', points: '12-14', meaning: 'Balanced minimum, does not deny a stopper. Not forcing.' },
      { bid: '2NT', points: '18-19', meaning: 'Balanced, extra strength. Invitational.' },
      { bid: '3NT', points: '19-21', meaning: 'Balanced, strong. To play.' },
      { bid: 'Rebid your suit at 2-level', points: '12-16', meaning: '6+ cards in your opening suit. Minimum, non-forcing.' },
      { bid: 'Rebid your suit at 3-level', points: '17-21', meaning: '6+ cards, strong. Invitational.' },
      { bid: 'New suit at 2-level', points: '12-16', meaning: 'Second suit, shows extra values if reverse. Non-forcing or invitational.' },
      { bid: 'Reverse (new suit that bypasses)', points: '17+', meaning: 'High reverse: bid a higher-ranking second suit, forcing. Shows strong hand.' },
      { bid: 'Jump shift (new suit jump)', points: '17-21', meaning: 'Very strong, game forcing. Shows 4+ cards in new suit.' },
    ],
    note: 'A "reverse" (e.g., 1♦–1♠–2♥) shows extra values because it forces partner to bid at the 3-level to support your first suit.',
  },

  responder_rebid: {
    id: 'responder_rebid',
    title: 'Responder\'s Second Bid',
    context: 'You responded to partner\'s opening and they rebid. Your second call clarifies your range.',
    rows: [
      { bid: 'Pass', points: '6-9', meaning: 'Minimum response, partner showed minimum. No game interest.' },
      { bid: 'Raise opener\'s second suit', points: '6-10', meaning: 'Fit for opener\'s second suit. Shows support and minimum.' },
      { bid: '1NT / 2NT', points: '6-9 / 11-12', meaning: 'Balanced, no fit. Invitational at 2NT, sign-off at 1NT.' },
      { bid: 'New suit at 2-level', points: '6-10', meaning: 'Shows second suit, non-forcing. Helps find a fit.' },
      { bid: 'Rebid your suit at 2-level', points: '6-10', meaning: '6+ cards in your response suit, weak. Non-forcing.' },
      { bid: 'Rebid your suit at 3-level', points: '11-12', meaning: '6+ cards, invitational.' },
      { bid: 'Jump to game (3NT/4♥/4♠)', points: '10-15', meaning: 'Game-forcing. You have the values for game.' },
      { bid: 'Jump shift (new suit)', points: '13+', meaning: 'Strong, game forcing. Slam possible.' },
    ],
    note: 'If opener showed a minimum (e.g., passed or rebid 1NT), you need 10+ HCP to continue bidding.',
  },

  overcall: {
    id: 'overcall',
    title: 'Overcalling (Competing Against Opponents)',
    context: 'The opponents opened the bidding. You can overcall to compete or show a good hand.',
    rows: [
      { bid: '1-level overcall', points: '8-16', meaning: '5+ card suit, good quality (top two honors or better).' },
      { bid: '2-level overcall', points: '10-16', meaning: '5+ card suit, stronger than 1-level overcall.' },
      { bid: '1NT overcall', points: '15-18', meaning: 'Balanced hand with a stopper in opener\'s suit. Direct seat.' },
      { bid: 'Double (takeout)', points: '12+', meaning: 'Short in opener\'s suit, 3+ cards in each other suit. Asks partner to bid.' },
      { bid: 'Jump overcall (2-level over 1)', points: 'Weak', meaning: 'Preemptive — 6+ card suit, 5-10 HCP. Disruptive.' },
      { bid: '3-level overcall', points: 'Weak', meaning: 'Preemptive — 7+ card suit, 5-10 HCP.' },
      { bid: 'Cuebid (opener\'s suit)', points: 'Strong', meaning: 'Artificial — shows a very strong hand, asks partner to bid their best suit.' },
      { bid: 'Pass', points: '0-7', meaning: 'Not enough to compete safely.' },
    ],
    note: 'A takeout double shows support for all unbid suits. Partner should respond with their longest suit unless very strong.',
  },

  response_to_double: {
    id: 'response_to_double',
    title: 'Responding to Partner\'s Takeout Double',
    context: 'Partner made a takeout double. You must bid your longest suit (unless very strong).',
    rows: [
      { bid: '0-1 level (longest suit)', points: '0-8', meaning: 'Bid your longest suit at minimum level. You are forced to bid.' },
      { bid: 'Jump to 2-level', points: '9-11', meaning: 'Good hand, 4+ card suit. Shows extra values.' },
      { bid: 'Jump to 3-level', points: '10-12', meaning: '5+ card suit, strong. Invitational.' },
      { bid: '1NT', points: '6-10', meaning: 'Semi-balanced with a stopper in opener\'s suit.' },
      { bid: '2NT', points: '11-12', meaning: 'Balanced with a good stopper. Invitational.' },
      { bid: '3NT', points: '13-15', meaning: 'Balanced, solid stopper. To play.' },
      { bid: 'Cuebid opener\'s suit', points: '13+', meaning: 'Very strong — asks partner to clarify. Game-forcing.' },
      { bid: 'Pass (convert to penalty)', points: '10+', meaning: 'You have a strong hand in opener\'s suit. Converts double to penalty.' },
    ],
    note: 'You are forced to respond to a takeout double unless you convert to penalty by passing.',
  },

  response_to_overcall: {
    id: 'response_to_overcall',
    title: 'Responding to Partner\'s Overcall',
    context: 'Partner overcalled an opponent\'s opening. Your response shows support or a new suit.',
    rows: [
      { bid: 'Pass', points: '0-7', meaning: 'No fit, not enough to bid further.' },
      { bid: 'Raise partner\'s suit', points: '6-10', meaning: '3+ card support. Competitive, shows limit-raise values at 3-level.' },
      { bid: '1NT', points: '6-10', meaning: 'Semi-balanced with a stopper. Not forcing.' },
      { bid: '2NT', points: '11-12', meaning: 'Balanced with stopper. Invitational.' },
      { bid: '3NT', points: '13-15', meaning: 'Balanced, good stopper. To play.' },
      { bid: 'New suit at 1-level', points: '6+', meaning: '4+ cards, non-forcing. Could be looking for a better fit.' },
      { bid: 'New suit at 2-level', points: '10+', meaning: '4+ cards, competitive. Shows reasonable values.' },
      { bid: 'Cuebid opponent\'s suit', points: '10+', meaning: 'Limit-raise or better in partner\'s suit. Forcing.' },
    ],
    note: 'Overcalls are not forcing. You can pass with a weak hand and no fit.',
  },

  slam_bidding: {
    id: 'slam_bidding',
    title: 'Slam Bidding (Blackwood & Gerber)',
    context: 'When you and partner have 30+ combined HCP, you may explore slam.',
    rows: [
      { bid: '4NT (Blackwood)', points: 'Agreed suit', meaning: 'Asks partner for aces. Response: 5♣=0/4, 5♦=1, 5♥=2, 5♠=3.' },
      { bid: '5NT (after 4NT)', points: 'All aces shown', meaning: 'Asks for kings. Response: 6♣=0/4, 6♦=1, 6♥=2, 6♠=3.' },
      { bid: '4♣ (Gerber)', points: 'After 1NT/2NT', meaning: 'Asks for aces when opener bid NT. Response: 4♦=0/4, 4♥=1, 4♠=2, 4NT=3.' },
      { bid: 'Cuebid (opponent\'s suit)', points: 'Slam try', meaning: 'First-round control (ace or void) in the cuebid suit.' },
      { bid: '5 of agreed suit', points: 'Slam try', meaning: 'Invitational to 6. Asks partner to bid 6 with extra values.' },
      { bid: '6 of agreed suit', points: 'To play', meaning: 'Small slam. 12 tricks needed.' },
      { bid: '7 of agreed suit', points: 'To play', meaning: 'Grand slam. 13 tricks needed.' },
    ],
    note: 'Use Blackwood only with an agreed trump suit. Use Gerber only after a 1NT or 2NT opening.',
  },

  competitive: {
    id: 'competitive',
    title: 'Competitive Bidding (When Both Sides Bid)',
    context: 'Both sides are bidding. Your actions depend on vulnerability and hand strength.',
    rows: [
      { bid: 'Free bid (new suit after opponent\'s bid)', points: '8-12', meaning: 'Shows a real suit, not just a preference. Competitive.' },
      { bid: 'Negative double', points: '6+', meaning: 'Shows 4+ cards in unbid major(s). Asks partner to bid.' },
      { bid: 'Support double', points: 'Opener 12-16', meaning: 'Opener doubles to show 3-card support for responder\'s suit.' },
      { bid: 'Maximal double', points: 'Opener 15-17', meaning: 'Doubles opponent\'s overcall to show extra values, creating a game try.' },
      { bid: 'Pass then double', points: 'Strong', meaning: 'Pass first with a strong hand, double later — shows more values.' },
      { bid: 'Bid game directly', points: '10-12', meaning: 'Preemptive — shuts out opponents. Good fit, limited values.' },
      { bid: 'Redouble', points: '10+', meaning: 'After opponents double your side — shows confidence, may ask partner to bid.' },
    ],
    note: 'A negative double after 1X–(overcall) shows 4+ cards in the other major(s) and is forcing.',
  },
};

const SECTION_ORDER: string[] = [
  'opening',
  'response_to_1nt',
  'response_to_1_of_suit',
  'opener_rebid',
  'responder_rebid',
  'overcall',
  'response_to_double',
  'response_to_overcall',
  'competitive',
  'slam_bidding',
];

function isPartner(seatA: Seat, seatB: Seat): boolean {
  const ns: Seat[] = ['N', 'S'];
  const ew: Seat[] = ['E', 'W'];
  return (ns.includes(seatA) && ns.includes(seatB)) ||
    (ew.includes(seatA) && ew.includes(seatB));
}

function getLastNonPassBidEntry(auction: AuctionEntry[]): AuctionEntry | null {
  for (let i = auction.length - 1; i >= 0; i--) {
    if (auction[i].bid.type === 'bid') return auction[i];
  }
  return null;
}

function hasDouble(auction: AuctionEntry[]): boolean {
  return auction.some(e => e.bid.type === 'double');
}

/**
 * Determine which guide section is most relevant for the player whose
 * turn it is to bid, based on the current auction state.
 *
 * Returns the section ID and a list of "related" section IDs the user
 * can browse to.
 */
export function getGuideContext(
  auction: AuctionEntry[],
  bidderSeat: Seat,
  dealer: Seat,
): { primaryId: string; relatedIds: string[] } {
  const bids = auction.filter(e => e.bid.type === 'bid');
  const totalBids = bids.length;

  // No bids yet — this is an opening bid
  if (totalBids === 0) {
    return { primaryId: 'opening', relatedIds: ['overcall', 'slam_bidding'] };
  }

  const lastBidEntry = getLastNonPassBidEntry(auction);
  if (!lastBidEntry) {
    return { primaryId: 'opening', relatedIds: [] };
  }

  const lastBid = lastBidEntry.bid;
  const lastBidder = lastBidEntry.seat;
  const partnerBidLast = isPartner(bidderSeat, lastBidder);
  const opponentBidLast = !partnerBidLast;

  // Check if there was an intervening opponent bid (competitive auction)
  const hasInterveningOpponent = (() => {
    for (let i = auction.length - 1; i >= 0; i--) {
      if (auction[i].bid.type === 'bid' && auction[i].seat === lastBidder) break;
      if (auction[i].bid.type !== 'pass' && !isPartner(bidderSeat, auction[i].seat)) {
        return true;
      }
    }
    return false;
  })();

  // Was the last bid a double by partner?
  const lastEntry = auction[auction.length - 1];
  const lastWasDouble = lastEntry?.bid.type === 'double' && isPartner(bidderSeat, lastEntry.seat);

  // Partner made a takeout double — respond
  if (lastWasDouble) {
    return { primaryId: 'response_to_double', relatedIds: ['competitive', 'overcall'] };
  }

  // Only 1 bid has been made
  if (totalBids === 1) {
    // Was it partner or opponent?
    if (partnerBidLast) {
      // Partner opened — respond
      if (lastBid.type === 'bid' && lastBid.level === 1 && lastBid.strain === 'NT') {
        return { primaryId: 'response_to_1nt', relatedIds: ['response_to_1_of_suit', 'slam_bidding'] };
      }
      return { primaryId: 'response_to_1_of_suit', relatedIds: ['response_to_1nt', 'opener_rebid'] };
    }
    // Opponent opened — overcall or double
    return { primaryId: 'overcall', relatedIds: ['response_to_overcall', 'competitive'] };
  }

  // 2 bids made — could be opener rebidding or responder rebidding
  if (totalBids === 2) {
    const firstBid = bids[0];
    const secondBid = bids[1];
    const firstWasPartner = isPartner(bidderSeat, firstBid.seat);
    const secondWasPartner = isPartner(bidderSeat, secondBid.seat);

    if (firstWasPartner && !secondWasPartner) {
      // Partner opened, opponent overcalled, you respond
      if (hasInterveningOpponent) {
        return { primaryId: 'response_to_overcall', relatedIds: ['competitive', 'response_to_1_of_suit'] };
      }
      return { primaryId: 'response_to_1_of_suit', relatedIds: ['opener_rebid'] };
    }

    if (!firstWasPartner && secondWasPartner) {
      // Opponent opened, partner overcalled — you respond to overcall
      return { primaryId: 'response_to_overcall', relatedIds: ['overcall', 'competitive'] };
    }

    // Both bids from same side (partner opened, you responded, now opener rebids)
    if (firstWasPartner && secondWasPartner) {
      // This shouldn't happen (3 consecutive same-side bids is unusual)
      return { primaryId: 'opener_rebid', relatedIds: ['responder_rebid'] };
    }

    // Both bids from opponents
    return { primaryId: 'overcall', relatedIds: ['competitive'] };
  }

  // 3+ bids — this is a rebid situation
  if (totalBids >= 3) {
    // Determine if this is opener's rebid or responder's rebid
    // Count how many bids came from the bidder's side vs opponents
    const mySideBids = bids.filter(b => isPartner(bidderSeat, b.seat)).length;
    const opponentBids = bids.filter(b => !isPartner(bidderSeat, b.seat)).length;

    // If there's been a double in the auction, show competitive
    if (hasDouble(auction)) {
      return { primaryId: 'competitive', relatedIds: ['response_to_double', 'slam_bidding'] };
    }

    // If both sides have bid, it's competitive
    if (mySideBids > 0 && opponentBids > 0) {
      return { primaryId: 'competitive', relatedIds: ['responder_rebid', 'opener_rebid'] };
    }

    // Same side has made all bids — figure out whose rebid
    if (mySideBids >= 3) {
      // My side has bid 3 times: opener, response, opener rebid → responder rebids
      return { primaryId: 'responder_rebid', relatedIds: ['opener_rebid', 'slam_bidding'] };
    }

    // Default to opener rebid
    return { primaryId: 'opener_rebid', relatedIds: ['responder_rebid', 'slam_bidding'] };
  }

  return { primaryId: 'opening', relatedIds: [] };
}

export function getSection(id: string): GuideSection | null {
  return SECTIONS[id] ?? null;
}

export function getAllSections(): GuideSection[] {
  return SECTION_ORDER.map(id => SECTIONS[id]).filter(Boolean);
}
