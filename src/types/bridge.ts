export type Seat = 'N' | 'E' | 'S' | 'W';
export type Suit = 'C' | 'D' | 'H' | 'S';
export type Strain = 'C' | 'D' | 'H' | 'S' | 'NT';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
export type Vulnerability = 'none' | 'NS' | 'EW' | 'both';
export type Doubled = 0 | 1 | 2;
export type Phase = 'bidding' | 'playing' | 'scoring' | 'review' | 'finished';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type Hand = Card[];

export interface Deal {
  N: Hand;
  E: Hand;
  S: Hand;
  W: Hand;
}

export type Bid =
  | { type: 'pass' }
  | { type: 'double' }
  | { type: 'redouble' }
  | { type: 'bid'; level: number; strain: Strain };

export interface AuctionEntry {
  seat: Seat;
  bid: Bid;
}

export interface Contract {
  level: number;
  strain: Strain;
  declarer: Seat;
  doubled: Doubled;
  tricksMade: number;
}

export interface HandScore {
  declarerSide: 'NS' | 'EW';
  declarerVulnerable: boolean;
  belowLine: number;
  aboveLine: number;
  total: number;
  made: boolean;
  overtricks: number;
  undertricks: number;
  contract: Contract;
  summary: string;
}

export interface RubberState {
  nsGamesWon: number;
  ewGamesWon: number;
  nsAbove: number;
  ewAbove: number;
  nsBelowCurrent: number;
  ewBelowCurrent: number;
  nsBelowCompleted: number;
  ewBelowCompleted: number;
  nsTotal: number;
  ewTotal: number;
  rubberComplete: boolean;
  rubberNumber: number;
  overallNsTotal: number;
  overallEwTotal: number;
}

export interface TrickCard {
  seat: Seat;
  card: Card;
}

export interface UndoRequest {
  requestedBy: Seat;
  card?: Card;
  cardSeat?: Seat;
  bid?: Bid;
  bidSeat?: Seat;
  acceptedBy: Seat[];
  declinedBy: Seat[];
}

export interface PlayState {
  currentTrick: TrickCard[];
  tricksWonNS: number;
  tricksWonEW: number;
  currentSeat: Seat;
  trickNumber: number;
  leader: Seat;
  completedTricks: TrickCard[][];
  dummyRevealed: boolean;
  lastCompletedTrick: TrickCard[] | null;
  undoRequest: UndoRequest | null;
}

export interface TablePlayer {
  user_id: string;
  seat: Seat;
  display_name: string;
}

export const SEATS: Seat[] = ['N', 'E', 'S', 'W'];
export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const STRAINS: Strain[] = ['C', 'D', 'H', 'S', 'NT'];

export const SUIT_SYMBOLS: Record<Suit, string> = {
  S: '\u2660',
  H: '\u2665',
  D: '\u2666',
  C: '\u2663',
};

export const STRAIN_SYMBOLS: Record<Strain, string> = {
  S: '\u2660',
  H: '\u2665',
  D: '\u2666',
  C: '\u2663',
  NT: 'NT',
};

export const RANK_VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

export const RANK_DISPLAY: Record<Rank, string> = {
  '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8',
  '9': '9', T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A',
};

export function isPartnership(seatA: Seat, seatB: Seat): boolean {
  const ns: Seat[] = ['N', 'S'];
  const ew: Seat[] = ['E', 'W'];
  return (ns.includes(seatA) && ns.includes(seatB)) ||
    (ew.includes(seatA) && ew.includes(seatB));
}

export function sideOfSeat(seat: Seat): 'NS' | 'EW' {
  return seat === 'N' || seat === 'S' ? 'NS' : 'EW';
}

export function nextSeat(seat: Seat): Seat {
  const idx = SEATS.indexOf(seat);
  return SEATS[(idx + 1) % 4];
}

export function cardToText(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function textToCard(text: string): Card {
  const rank = text[0] as Rank;
  const suit = text[1] as Suit;
  return { rank, suit };
}

export function isVulnerable(seat: Seat, vul: Vulnerability): boolean {
  if (vul === 'both') return true;
  if (vul === 'none') return false;
  if (vul === 'NS') return sideOfSeat(seat) === 'NS';
  return sideOfSeat(seat) === 'EW';
}
