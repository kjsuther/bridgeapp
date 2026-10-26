import type { Deal, Contract, AuctionEntry, PlayState, Seat, Vulnerability, HandScore } from './bridge';

export interface HandDetail {
  handId: string;
  deal: Deal;
  auction: AuctionEntry[];
  contract: Contract;
  score: HandScore;
  playState: PlayState;
  vulnerability: Vulnerability;
  dealer: Seat;
}

export type SeatNames = Record<Seat, string>;

