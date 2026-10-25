import { useState } from 'react';
import type { Bid, Strain, Suit, Seat } from '@/types/bridge';
import { STRAINS, STRAIN_SYMBOLS } from '@/types/bridge';
import { useGame } from '@/context/GameContext';
import { highCardPoints } from '@/lib/dealing';
import { formatRecommendationBid, recommendBid, type BidRecommendation } from '@/lib/bidRecommendation';
import { Lightbulb, Check } from 'lucide-react';

const strainColor: Record<Strain, string> = {
  C: 'text-slate-900',
  D: 'text-red-600',
  H: 'text-red-600',
  S: 'text-slate-900',
  NT: 'text-amber-700',
};

export function BiddingPanel() {
  const { isMyTurn, makeBid, error, deal, mySeat, auction, dealer, vulnerability } = useGame();
  const [selectedLevel, setSelectedLevel] = useState<number>(1);
  const [selectedStrain, setSelectedStrain] = useState<Strain | null>(null);
  const [recommendation, setRecommendation] = useState<BidRecommendation | null>(null);

  const levels = [1, 2, 3, 4, 5, 6, 7];

  const handleBid = async (bid: Bid) => {
    await makeBid(bid);
  };

  const handleRecommend = () => {
    if (!deal || !mySeat || !dealer) return;
    const nextRecommendation = recommendBid(deal[mySeat], auction, mySeat, dealer, vulnerability);
    setRecommendation(nextRecommendation);
    if (nextRecommendation.bid.type === 'bid') {
      setSelectedLevel(nextRecommendation.bid.level);
      setSelectedStrain(nextRecommendation.bid.strain);
    }
  };

  const placeRecommendation = async () => {
    if (!recommendation) return;
    await handleBid(recommendation.bid);
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
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-white font-semibold text-base">Your Bid</h3>
          {deal && mySeat && <span className="text-xs text-emerald-300">{highCardPoints(deal[mySeat])} HCP</span>}
        </div>
        <button
          onClick={handleRecommend}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-amber-200 bg-amber-500/15 border border-amber-400/30 hover:bg-amber-500/25 transition-colors"
          title="Suggest a bid based on your hand and the auction"
        >
          <Lightbulb className="w-3.5 h-3.5" />
          Recommend a bid
        </button>
      </div>

      {recommendation && (
        <div className="mb-3 rounded-xl border border-amber-400/30 bg-amber-950/30 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wide text-amber-300/80">Proposed</span>
                <span className="text-lg font-bold text-amber-200">{formatRecommendationBid(recommendation.bid)}</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-200">{recommendation.rationale}</p>
              <p className="mt-1 text-[11px] text-amber-300/80">Typical range: {recommendation.points}</p>
            </div>
            <button
              onClick={placeRecommendation}
              className="shrink-0 flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              Place bid
            </button>
          </div>
        </div>
      )}

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
            onClick={() => {
              setSelectedStrain(strain);
              void handleBid({ type: 'bid', level: selectedLevel, strain });
            }}
            className={`w-14 h-14 rounded-lg font-bold flex flex-col items-center justify-center transition-all bg-white hover:scale-105 shadow-md border-2 ${selectedStrain === strain ? 'border-emerald-500 ring-2 ring-emerald-400/40' : 'border-slate-300'}`}
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
      {recommendation && <p className="text-center text-[10px] text-slate-500 mt-2">The recommendation is a teaching suggestion. Review it before placing the bid.</p>}
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
