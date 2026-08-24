import { useState } from 'react';
import { useGame } from '@/context/GameContext';
import { solveDeal } from '@/lib/doubleDummy';
import type { Suit, Seat } from '@/types/bridge';
import { Eye, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

export function DoubleDummyReview() {
  const { deal, contract, phase } = useGame();
  const [result, setResult] = useState<{ tricksDeclarer: number; tricksDefender: number; description: string } | null>(null);
  const [computing, setComputing] = useState(false);
  const [showAllHands, setShowAllHands] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleAnalyze = async () => {
    if (!deal || !contract) return;
    setComputing(true);
    setExpanded(true);

    // Defer to allow UI update
    await new Promise((r) => setTimeout(r, 50));

    const trump: Suit | null = contract.strain === 'NT' ? null : contract.strain as Suit;
    const leader: Seat = contract.declarer === 'N' ? 'E' :
      contract.declarer === 'E' ? 'S' :
      contract.declarer === 'S' ? 'W' : 'N';

    try {
      const res = solveDeal(deal, trump, contract.declarer, leader);
      const level = Math.max(1, res.tricksDeclarer - 6);
      const strain = contract.strain;
      const description = `${res.tricksDeclarer} tricks possible for ${contract.declarer} (${level}${strain})`;
      setResult({ ...res, description });
    } catch {
      setResult({ tricksDeclarer: 0, tricksDefender: 13, description: 'Analysis failed' });
    }

    setComputing(false);
  };

  if (phase !== 'scoring' && phase !== 'finished' && phase !== 'review') return null;
  if (!deal || !contract) return null;

  return (
    <div className="bg-slate-800/70 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-700/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-amber-400" />
          <h3 className="text-white font-medium text-sm">Double-Dummy Review</h3>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="p-4 pt-0 space-y-3">
          <p className="text-xs text-slate-400">
            See how many tricks were optimally achievable with all four hands visible.
          </p>

          {!result && !computing && (
            <button
              onClick={handleAnalyze}
              className="w-full py-2 bg-amber-600/80 hover:bg-amber-500 text-white text-sm font-medium rounded-lg transition-all"
            >
              Analyze Hand
            </button>
          )}

          {computing && (
            <div className="flex items-center justify-center gap-2 py-4">
              <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
              <span className="text-sm text-slate-400">Computing optimal play...</span>
            </div>
          )}

          {result && (
            <div className="bg-amber-950/30 border border-amber-700/20 rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Optimal tricks for declarer:</span>
                <span className="text-lg font-bold text-amber-300">{result.tricksDeclarer}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Optimal tricks for defenders:</span>
                <span className="text-lg font-bold text-slate-300">{result.tricksDefender}</span>
              </div>
              <p className="text-xs text-slate-400 pt-1 border-t border-slate-700/30">
                {result.description}
              </p>
              {contract.tricksMade !== undefined && (
                <p className="text-xs text-emerald-400">
                  Actual: {contract.tricksMade} tricks | {contract.tricksMade > result.tricksDeclarer ? 'You beat par!' : contract.tricksMade < result.tricksDeclarer ? `${result.tricksDeclarer - contract.tricksMade} trick(s) missed` : 'Perfect play!'}
                </p>
              )}
            </div>
          )}

          <button
            onClick={() => setShowAllHands(!showAllHands)}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <Eye className="w-3 h-3" />
            {showAllHands ? 'Hide' : 'Show'} all hands
          </button>
        </div>
      )}
    </div>
  );
}
