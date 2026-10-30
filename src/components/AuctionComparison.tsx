import type { AuctionEntry, Bid, Seat } from '@/types/bridge';
import { SEATS, SUIT_SYMBOLS } from '@/types/bridge';
import type { HandDetail, SeatNames } from '@/types/review';
import { NORMAL_REVIEW_SEATS } from '@/lib/reviewAlignment';

function bidLabel(bid: Bid): string {
  if (bid.type === 'pass') return 'Pass';
  if (bid.type === 'double') return 'X';
  if (bid.type === 'redouble') return 'XX';
  return `${bid.level}${bid.strain === 'NT' ? 'NT' : SUIT_SYMBOLS[bid.strain]}`;
}

function callsBySeat(auction: AuctionEntry[]) {
  return Object.fromEntries(SEATS.map(seat => [seat, auction
    .map((entry, index) => ({ ...entry, number: index + 1 }))
    .filter(entry => entry.seat === seat)])) as Record<Seat, (AuctionEntry & { number: number })[]>;
}

export function AuctionComparison({ original, replay, seatNames, replaySeats = NORMAL_REVIEW_SEATS }: {
  original: HandDetail; replay: HandDetail; seatNames: SeatNames; replaySeats?: Record<Seat, Seat>;
}) {
  const calls = [callsBySeat(original.auction), callsBySeat(replay.auction)];
  const rounds = Math.max(0, ...SEATS.flatMap(seat => [calls[0][seat].length, calls[1][replaySeats[seat]].length]));
  let differences = 0;
  for (let round = 0; round < rounds; round++) for (const seat of SEATS) {
    const left = calls[0][seat][round];
    const right = calls[1][replaySeats[seat]][round];
    if ((left ? bidLabel(left.bid) : '') !== (right ? bidLabel(right.bid) : '')) differences++;
  }
  return <section aria-label="Bidding comparison" className="mb-4 rounded-xl border border-slate-700 bg-slate-900/70 p-4">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold text-white">Bidding comparison</h2>
      <span className="text-sm text-amber-200">{differences === 0 ? 'Identical bids for matching hands' : `${differences} differing ${differences === 1 ? 'decision' : 'decisions'}`}</span>
    </div>
    <p className="mb-4 text-sm text-slate-300">Each column follows the same original hand in both auctions. Rows show that hand’s first, second, and subsequent calls. Small numbers give the actual auction order. Amber cells mark differences; — means no further call.</p>
    <div className="overflow-x-auto">
      <div className="grid min-w-[720px] grid-cols-2 gap-4">
        {([original, replay] as const).map((detail, side) => {
          const layout = side === 0 ? NORMAL_REVIEW_SEATS : replaySeats;
          return <table key={side} className="w-full table-fixed border-collapse text-center text-sm text-slate-200">
            <caption className="pb-3 text-left">
              <strong className={side === 0 ? 'text-emerald-300' : 'text-blue-300'}>{side === 0 ? 'Original' : 'Replay'}</strong>
              <span className="ml-2">Dealer: {detail.dealer} · {detail.contract.level}{detail.contract.strain === 'NT' ? 'NT' : SUIT_SYMBOLS[detail.contract.strain]}{detail.contract.doubled === 1 ? ' X' : detail.contract.doubled === 2 ? ' XX' : ''} by {detail.contract.declarer}</span>
            </caption>
            <thead><tr>{SEATS.map(position => {
              const seat = layout[position];
              return <th key={position} scope="col" className="border-b border-slate-600 p-2 align-top">
                <div>{seat}</div><div className="break-words text-xs font-normal text-slate-400">{seatNames[seat]}</div>
                <div className="mt-1 text-[10px] font-normal text-slate-500">Original {position} hand</div>
              </th>;
            })}</tr></thead>
            <tbody>{Array.from({ length: rounds }, (_, round) => <tr key={round}>{SEATS.map(position => {
              const own = calls[side][layout[position]][round];
              const other = calls[1 - side][side === 0 ? replaySeats[position] : position][round];
              const different = (own ? bidLabel(own.bid) : '') !== (other ? bidLabel(other.bid) : '');
              return <td key={position} className={`border-b border-slate-700 p-3 ${different ? 'bg-amber-500/15 text-amber-100' : ''}`}>
                {own ? <><span className="text-base font-semibold">{bidLabel(own.bid)}</span><sup className="ml-1 text-[10px] text-slate-400">{own.number}</sup></> : <span aria-label="No further call">—</span>}
                {different && <span className="block text-[10px] text-amber-300">Different</span>}
              </td>;
            })}</tr>)}</tbody>
          </table>;
        })}
      </div>
    </div>
  </section>;
}
