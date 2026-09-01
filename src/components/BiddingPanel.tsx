import { useState } from 'react';
import type { Bid, Strain, Suit, Seat } from '@/types/bridge';
import { STRAINS, STRAIN_SYMBOLS } from '@/types/bridge';
import { useGame } from '@/context/GameContext';

const strainColor: Record<Strain, string> = {
  C: 'text-slate-900',
  D: 'text-red-600',
  H: 'text-red-600',
  S: 'text-slate-900',
  NT: 'text-amber-700',
};

export function BiddingPanel() {
  const { isMyTurn, makeBid, error } = useGame();
  const [selectedLevel, setSelectedLevel] = useState<number>(1);

  const levels = [1, 2, 3, 4, 5, 6, 7];

  const handleBid = async (bid: Bid) => {
    await makeBid(bid);
  };

  if (!isMyTurn) {
    return (
      <div className="bg-slate-800/70 backdrop-blur rounded-2xl border border-slate-700/50 p-6 min-w-[280px]">
        <p className="text-center text-slate-400 text-base">
          Waiting for bid...
        </p>
        {error && <p className="text-center text-red-400 text-sm mt-2">{error}</p>}
      </div>
    );
  }

  return (
    <div className="bg-slate-800/80 backdrop-blur rounded-2xl border border-emerald-500/30 p-4 shadow-xl shadow-emerald-600/15 min-w-[360px]">
      <h3 className="text-white font-semibold text-base mb-3 text-center">Your Bid</h3>

      <div className="flex gap-1.5 mb-3 justify-center">
        {levels.map((level) => (
          <button
            key={level}
            onClick={() => setSelectedLevel(level)}
            className={`w-10 h-10 rounded-lg font-bold text-base transition-all ${
              selectedLevel === level
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 scale-110'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {level}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5 mb-3 justify-center">
        {STRAINS.map((strain: Strain) => (
          <button
            key={strain}
            onClick={() => handleBid({ type: 'bid', level: selectedLevel, strain })}
            className="w-14 h-14 rounded-lg font-bold flex flex-col items-center justify-center transition-all bg-white hover:scale-105 shadow-md border border-slate-300"
          >
            <span className={`text-2xl leading-none ${strainColor[strain]}`}>
              {STRAIN_SYMBOLS[strain]}
            </span>
          </button>
        ))}
      </div>

      <div className="flex gap-2 justify-center">
        <button
          onClick={() => handleBid({ type: 'pass' })}
          className="px-5 py-2.5 bg-slate-700 text-slate-200 rounded-lg text-sm font-medium hover:bg-slate-600 transition-all"
        >
          Pass
        </button>
        <button
          onClick={() => handleBid({ type: 'double' })}
          className="px-5 py-2.5 bg-red-900/60 text-red-200 rounded-lg text-sm font-bold hover:bg-red-800/60 transition-all"
        >
          Double (X)
        </button>
        <button
          onClick={() => handleBid({ type: 'redouble' })}
          className="px-5 py-2.5 bg-amber-900/60 text-amber-200 rounded-lg text-sm font-bold hover:bg-amber-800/60 transition-all"
        >
          Redouble (XX)
        </button>
      </div>

      {error && <p className="text-center text-red-400 text-sm mt-3">{error}</p>}
    </div>
  );
}

function BidCell({ bid }: { bid: Bid }) {
  if (bid.type === 'pass') {
    return <span className="text-slate-400 font-medium">P</span>;
  }
  if (bid.type === 'double') {
    return <span className="text-red-400 font-bold">X</span>;
  }
  if (bid.type === 'redouble') {
    return <span className="text-amber-400 font-bold">XX</span>;
  }
  const color = bid.strain === 'H' || bid.strain === 'D' ? 'text-red-600'
    : bid.strain === 'NT' ? 'text-amber-700' : 'text-slate-950';
  return (
    <span className={`inline-flex min-w-8 items-center justify-center rounded bg-white px-1.5 py-0.5 font-bold ${color}`}>
      {bid.level}
      {bid.strain === 'NT' ? 'NT' : STRAIN_SYMBOLS[bid.strain as Suit]}
    </span>
  );
}

export function AuctionHistory() {
  const { auction, players, dealer } = useGame();

  const seatDisplayNames: Record<string, string> = {};
  players.forEach((p) => { seatDisplayNames[p.seat] = p.display_name; });

  const seatOrder: Seat[] = ['N', 'E', 'S', 'W'];

  // Rotate columns so the dealer's column is first (standard auction sheet layout)
  const orderedSeats: Seat[] = (() => {
    const startIdx = seatOrder.indexOf(dealer ?? 'N');
    return [seatOrder[startIdx], seatOrder[(startIdx + 1) % 4], seatOrder[(startIdx + 2) % 4], seatOrder[(startIdx + 3) % 4]];
  })();

  const columns: Record<Seat, typeof auction> = { N: [], E: [], S: [], W: [] };
  for (let i = 0; i < auction.length; i++) {
    const seat = auction[i].seat;
    columns[seat].push(auction[i]);
  }

  const maxRows = Math.max(1, ...orderedSeats.map((s) => columns[s].length));

  return (
    <div className="bg-slate-800/80 backdrop-blur rounded-2xl border border-slate-700/50 p-3 w-full max-w-[260px]">
      <h4 className="text-sm text-slate-400 font-medium mb-2 text-center">Auction</h4>
      <div className="grid grid-cols-4 gap-0.5 text-center">
        {orderedSeats.map((seat) => (
          <div key={seat} className="text-sm font-bold text-slate-400 pb-2 border-b border-slate-700/50">
            {seat}
          </div>
        ))}
        {Array.from({ length: maxRows }).map((_, rowIdx) => (
          orderedSeats.map((seat) => (
            <div key={`${seat}-${rowIdx}`} className="text-sm py-1">
              {columns[seat][rowIdx] ? (
                <BidCell bid={columns[seat][rowIdx].bid} />
              ) : (
                <span className="text-slate-600">–</span>
              )}
            </div>
          ))
        ))}
      </div>
    </div>
  );
}
