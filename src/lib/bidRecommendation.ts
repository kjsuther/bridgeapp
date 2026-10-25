import type { AuctionEntry, Bid, Card, Seat, Strain, Suit, Vulnerability } from '@/types/bridge';
import { STRAINS, isVulnerable, sideOfSeat } from '@/types/bridge';
import { highCardPoints } from '@/lib/dealing';
import { bidValue, getLastBid, isValidBid } from '@/lib/bidding';

export interface BidRecommendation {
  bid: Bid;
  title: string;
  rationale: string;
  points: string;
  confidence: 'strong' | 'typical' | 'competitive';
}

interface HandProfile {
  hcp: number;
  lengths: Record<Suit, number>;
  balanced: boolean;
  longestSuit: Suit;
  longestLength: number;
  fiveCardMajor: Suit | null;
  sixCardSuit: Suit | null;
}

const suitOrder: Suit[] = ['S', 'H', 'D', 'C'];
const strainOrder: Record<Strain, number> = { C: 0, D: 1, H: 2, S: 3, NT: 4 };

function partnerOf(seat: Seat, other: Seat): boolean {
  return sideOfSeat(seat) === sideOfSeat(other);
}

function profileHand(hand: Card[]): HandProfile {
  const lengths: Record<Suit, number> = { S: 0, H: 0, D: 0, C: 0 };
  for (const card of hand) lengths[card.suit] += 1;

  const sortedLengths = Object.values(lengths).sort((a, b) => b - a);
  const balanced = sortedLengths[0] <= 5 && sortedLengths[3] >= 2;
  const longestSuit = [...suitOrder].sort((a, b) => lengths[b] - lengths[a])[0];
  const fiveCardMajor = suitOrder.find((suit) => (suit === 'S' || suit === 'H') && lengths[suit] >= 5) ?? null;
  const sixCardSuit = suitOrder.find((suit) => lengths[suit] >= 6) ?? null;

  return {
    hcp: highCardPoints(hand),
    lengths,
    balanced,
    longestSuit,
    longestLength: lengths[longestSuit],
    fiveCardMajor,
    sixCardSuit,
  };
}

function bid(level: number, strain: Strain): Bid {
  return { type: 'bid', level, strain };
}

function cardText(suit: Suit): string {
  return suit === 'S' ? 'spades' : suit === 'H' ? 'hearts' : suit === 'D' ? 'diamonds' : 'clubs';
}

function bidText(value: Bid): string {
  if (value.type === 'pass') return 'Pass';
  if (value.type === 'double') return 'Double';
  if (value.type === 'redouble') return 'Redouble';
  return `${value.level}${value.strain === 'NT' ? 'NT' : cardText(value.strain)}`;
}

function makeRecommendation(
  candidate: Bid,
  rationale: string,
  points: string,
  confidence: BidRecommendation['confidence'],
  auction: AuctionEntry[],
  seat: Seat,
): BidRecommendation | null {
  if (!isValidBid(candidate, auction, seat)) return null;
  return {
    bid: candidate,
    title: bidText(candidate),
    rationale,
    points,
    confidence,
  };
}

function openingRecommendation(profile: HandProfile, auction: AuctionEntry[], seat: Seat): BidRecommendation | null {
  if (profile.hcp >= 22) {
    return makeRecommendation(bid(2, 'C'), 'Very strong opening hand. Standard American uses 2♣ as the artificial strong opening.', '22+ HCP', 'strong', auction, seat);
  }
  if (profile.balanced && profile.hcp >= 20 && profile.hcp <= 21) {
    return makeRecommendation(bid(2, 'NT'), 'Balanced hand in the standard 2NT opening range.', '20–21 HCP', 'strong', auction, seat);
  }
  if (profile.balanced && profile.hcp >= 15 && profile.hcp <= 17) {
    return makeRecommendation(bid(1, 'NT'), 'Balanced hand in the standard 1NT opening range.', '15–17 HCP', 'strong', auction, seat);
  }
  const weakTwoSuit = [...suitOrder].find((suit) => suit !== 'C' && profile.lengths[suit] >= 6);
  if (weakTwoSuit && profile.hcp >= 5 && profile.hcp <= 10) {
    return makeRecommendation(bid(2, weakTwoSuit), `Weak two-bid showing six or more ${cardText(weakTwoSuit)}.`, '5–10 HCP', 'typical', auction, seat);
  }
  if (profile.hcp >= 12 && profile.fiveCardMajor) {
    return makeRecommendation(bid(1, profile.fiveCardMajor), `Opening a five-card ${cardText(profile.fiveCardMajor)} suit with opening values.`, '12+ HCP', 'typical', auction, seat);
  }
  if (profile.hcp >= 12) {
    const minor: Suit = profile.lengths.D >= profile.lengths.C ? 'D' : 'C';
    return makeRecommendation(bid(1, minor), `Opening a minor with a minimum opening hand and no five-card major.`, '12–14+ HCP', 'typical', auction, seat);
  }
  return makeRecommendation({ type: 'pass' }, 'The hand is below a typical opening range.', '0–11 HCP', 'typical', auction, seat);
}

function respondToOneNT(profile: HandProfile, _opening: AuctionEntry, auction: AuctionEntry[], seat: Seat): BidRecommendation | null {
  if (profile.fiveCardMajor) {
    const transferStrain: Strain = profile.fiveCardMajor === 'H' ? 'D' : 'H';
    return makeRecommendation(bid(2, transferStrain), `Jacoby transfer to your five-card ${cardText(profile.fiveCardMajor)} suit after partner's 1NT opening.`, '4+ HCP with 5+ cards in the major', 'typical', auction, seat);
  }
  if (profile.hcp >= 8 && profile.hcp <= 9) {
    return makeRecommendation(bid(2, 'NT'), 'Balanced invitational hand after partner’s 1NT opening.', '8–9 HCP', 'typical', auction, seat);
  }
  if (profile.hcp >= 10) {
    return makeRecommendation(bid(3, 'NT'), 'Enough combined strength for game, with no major-suit transfer required.', '10+ HCP', 'strong', auction, seat);
  }
  return makeRecommendation({ type: 'pass' }, 'Not enough strength for a game try and no five-card major to show.', '0–7 HCP', 'typical', auction, seat);
}

function respondToSuitOpening(profile: HandProfile, opening: AuctionEntry, auction: AuctionEntry[], seat: Seat): BidRecommendation | null {
  if (opening.bid.type !== 'bid') return null;
  const openingStrain = opening.bid.strain;
  if (profile.hcp < 6) {
    return makeRecommendation({ type: 'pass' }, 'The hand is below a typical response range.', '0–5 HCP', 'typical', auction, seat);
  }

  if (opening.bid.type === 'bid' && profile.lengths[openingStrain as Suit] >= 3 && profile.hcp >= 6 && profile.hcp <= 10) {
    return makeRecommendation(bid(2, openingStrain), `Raise partner's suit with a low-level fit and minimum responding values.`, '6–10 HCP with 3+ support', 'typical', auction, seat);
  }

  const newSuit = [...suitOrder]
    .filter((suit) => suit !== openingStrain && profile.lengths[suit] >= 4)
    .sort((a, b) => profile.lengths[b] - profile.lengths[a])[0];
  if (newSuit) {
    const level = bidValue(bid(1, newSuit)) > bidValue(opening.bid) ? 1 : 2;
    const recommendation = makeRecommendation(bid(level, newSuit), `Show your longest unbid suit with a constructive response.`, `${profile.hcp}+ HCP with 4+ ${cardText(newSuit)}`, 'typical', auction, seat);
    if (recommendation) return recommendation;
  }

  if (profile.balanced && profile.hcp >= 6 && profile.hcp <= 9) {
    const recommendation = makeRecommendation(bid(1, 'NT'), 'Balanced responding hand without a clear suit to introduce.', '6–9 HCP', 'typical', auction, seat);
    if (recommendation) return recommendation;
  }

  return makeRecommendation({ type: 'pass' }, 'Pass is the safest available action with this hand shape and auction.', `${profile.hcp} HCP`, 'typical', auction, seat);
}

function competitiveRecommendation(profile: HandProfile, auction: AuctionEntry[], seat: Seat): BidRecommendation | null {
  const lastBid = getLastBid(auction);
  if (!lastBid || lastBid.bid.type !== 'bid') return makeRecommendation({ type: 'pass' }, 'There is not enough auction information for a clear competitive action.', `${profile.hcp} HCP`, 'competitive', auction, seat);

  const opponentSuit = lastBid.bid.strain === 'NT' ? null : lastBid.bid.strain;
  if (profile.hcp >= 12 && opponentSuit && profile.lengths[opponentSuit] <= 2) {
    const recommendation = makeRecommendation({ type: 'double' }, 'Takeout double: opening values, shortness in the opponent’s suit, and support for the other suits.', '12+ HCP', 'competitive', auction, seat);
    if (recommendation) return recommendation;
  }

  if (profile.longestLength >= 5 && profile.hcp >= 8 && profile.hcp <= 16 && profile.longestSuit !== opponentSuit) {
    const level = lastBid.bid.level === 1 ? 1 : 2;
    const recommendation = makeRecommendation(bid(level, profile.longestSuit), `Compete with your five-card ${cardText(profile.longestSuit)} suit.`, '8–16 HCP with a 5+ card suit', 'competitive', auction, seat);
    if (recommendation) return recommendation;
  }

  return makeRecommendation({ type: 'pass' }, 'No safe competitive bid stands out from the current hand and auction.', `${profile.hcp} HCP`, 'competitive', auction, seat);
}

export function recommendBid(
  hand: Card[],
  auction: AuctionEntry[],
  seat: Seat,
  _dealer: Seat,
  vulnerability: Vulnerability,
): BidRecommendation {
  const profile = profileHand(hand);
  const hasOpponentBid = auction.some((entry) => entry.bid.type === 'bid' && !partnerOf(seat, entry.seat));
  const lastBid = getLastBid(auction);
  const partnerOpening = auction.find((entry) => partnerOf(seat, entry.seat) && entry.bid.type === 'bid');
  const isVulnerableHand = isVulnerable(seat, vulnerability);

  let recommendation: BidRecommendation | null = null;
  if (auction.length === 0) {
    recommendation = openingRecommendation(profile, auction, seat);
  } else if (hasOpponentBid) {
    recommendation = competitiveRecommendation(profile, auction, seat);
  } else if (partnerOpening?.bid.type === 'bid' && partnerOpening.bid.level === 1 && partnerOpening.bid.strain === 'NT') {
    recommendation = respondToOneNT(profile, partnerOpening, auction, seat);
  } else if (partnerOpening?.bid.type === 'bid') {
    recommendation = respondToSuitOpening(profile, partnerOpening, auction, seat);
  }

  if (recommendation) {
    const vulnerabilityNote = isVulnerableHand ? ' Vulnerability favors disciplined bidding.' : '';
    return { ...recommendation, rationale: recommendation.rationale + vulnerabilityNote };
  }

  return {
    bid: { type: 'pass' },
    title: 'Pass',
    rationale: lastBid ? 'Pass keeps the auction under control while no clear standard continuation is identified.' : 'Pass is the conservative choice.',
    points: `${profile.hcp} HCP`,
    confidence: 'typical',
  };
}

export function formatRecommendationBid(value: Bid): string {
  return bidText(value);
}

export function isRecommendationBid(value: Bid): value is Extract<Bid, { type: 'bid' }> {
  return value.type === 'bid' && STRAINS.includes(value.strain);
}
