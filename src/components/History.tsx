import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { jsonToDeal, sortHand } from '@/lib/dealing';
import type { Deal, Contract, AuctionEntry, PlayState, Seat, Vulnerability, Card, TrickCard, HandScore } from '@/types/bridge';
import { SEATS, SUIT_SYMBOLS } from '@/types/bridge';
import { ArrowLeft, Scale, ChevronRight, ChevronLeft, Layers } from 'lucide-react';
import { CardDisplay, HandDisplay } from '@/components/CardDisplay';

interface HistoryProps {
  onBack: () => void;
}

interface CompletedBoard {
  boardNumber: number;
  originalHandId: string;
  replayHandId: string;
  vulnerability: Vulnerability;
  originalContract: Contract;
  replayContract: Contract;
  originalScore: HandScore;
  replayScore: HandScore;
  imps: number;
  netPoints: number;
  tableName: string;
  createdAt: string;
}

interface HandDetail {
  handId: string;
  deal: Deal;
  auction: AuctionEntry[];
  contract: Contract;
  score: HandScore;
  playState: PlayState;
  vulnerability: Vulnerability;
  dealer: Seat;
}

export function History({ onBack }: HistoryProps) {
  const { profile } = useAuth();
  const [boards, setBoards] = useState<CompletedBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBoard, setSelectedBoard] = useState<CompletedBoard | null>(null);

  useEffect(() => {
    (async () => {
      if (!profile?.id) {
        setLoading(false);
        return;
      }

      const { data: myTables } = await supabase
        .from('table_players')
        .select('table_id')
        .eq('user_id', profile.id);

      if (!myTables || myTables.length === 0) {
        setLoading(false);
        return;
      }

      const tableIds = myTables.map((t) => t.table_id);

      const { data: tablesData } = await supabase
        .from('tables')
        .select('id, name')
        .in('id', tableIds);

      const tableNameMap: Record<string, string> = {};
      (tablesData || []).forEach((t) => { tableNameMap[t.id] = t.name; });

      const { data: games } = await supabase
        .from('games')
        .select('id, table_id, created_at')
        .in('table_id', tableIds)
        .order('created_at', { ascending: false });

      if (!games || games.length === 0) {
        setLoading(false);
        return;
      }

      const gameIds = games.map((g) => g.id);
      const gameTableMap: Record<string, { tableId: string; tableName: string; createdAt: string }> = {};
      for (const g of games) {
        gameTableMap[g.id] = {
          tableId: g.table_id,
          tableName: tableNameMap[g.table_id] ?? 'Unknown Table',
          createdAt: g.created_at,
        };
      }

      const { data: hands } = await supabase
        .from('hands')
        .select('id, game_id, hand_number, hand_role, original_hand_id, contract, score, imp_result, vulnerability, phase')
        .in('game_id', gameIds)
        .order('hand_number', { ascending: true });

      if (!hands) {
        setLoading(false);
        return;
      }

      const completedBoards: CompletedBoard[] = [];

      for (const hand of hands) {
        if (hand.hand_role !== 'replay' || !hand.original_hand_id || !hand.contract || !hand.score) continue;
        if (hand.phase !== 'scoring' && hand.phase !== 'finished') continue;

        const origHand = hands.find((h) => h.id === hand.original_hand_id);
        if (!origHand || !origHand.contract || !origHand.score) continue;
        if (origHand.phase !== 'scoring' && origHand.phase !== 'finished') continue;

        const gameInfo = gameTableMap[hand.game_id];
        if (!gameInfo) continue;

        const impResult = hand.imp_result as { imps: number; netPoints: number } | null;

        completedBoards.push({
          boardNumber: origHand.hand_number,
          originalHandId: origHand.id,
          replayHandId: hand.id,
          vulnerability: hand.vulnerability as Vulnerability,
          originalContract: origHand.contract as Contract,
          replayContract: hand.contract as Contract,
          originalScore: origHand.score as HandScore,
          replayScore: hand.score as HandScore,
          imps: impResult?.imps ?? 0,
          netPoints: impResult?.netPoints ?? 0,
          tableName: gameInfo.tableName,
          createdAt: gameInfo.createdAt,
        });
      }

      completedBoards.sort((a, b) => b.boardNumber - a.boardNumber);
      setBoards(completedBoards);
      setLoading(false);
    })();
  }, [profile]);

  if (selectedBoard) {
    return (
      <BoardComparison
        board={selectedBoard}
        onBack={() => setSelectedBoard(null)}
      />
    );
  }

  const totalImpsA = boards.reduce((sum, b) => sum + b.imps, 0);
  const totalImpsB = boards.reduce((sum, b) => sum - b.imps, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900">
      <div className="max-w-3xl mx-auto p-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Lobby
        </button>

        <div className="flex items-center gap-3 mb-6">
          <Layers className="w-6 h-6 text-emerald-400" />
          <h1 className="text-2xl font-bold text-white">Match History</h1>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : boards.length === 0 ? (
          <div className="bg-slate-800/40 rounded-xl border border-slate-700/30 p-12 text-center">
            <p className="text-slate-400">No completed boards yet. Boards appear here after they've been played twice (original + replay).</p>
          </div>
        ) : (
          <>
            <div className="bg-slate-800/60 backdrop-blur rounded-xl border border-amber-700/30 p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Scale className="w-4 h-4 text-amber-400" />
                <h2 className="text-white font-medium text-sm">Running IMP Total</h2>
                <span className="text-xs text-slate-500 ml-auto">{boards.length} board{boards.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex justify-between text-lg">
                <span className="text-emerald-300">Team A: <span className="font-bold">{totalImpsA > 0 ? '+' : ''}{totalImpsA}</span></span>
                <span className="text-blue-300">Team B: <span className="font-bold">{totalImpsB > 0 ? '+' : ''}{totalImpsB}</span></span>
              </div>
            </div>

            <div className="space-y-3">
              {boards.map((board) => (
                <button
                  key={`${board.originalHandId}-${board.replayHandId}`}
                  onClick={() => setSelectedBoard(board)}
                  className="w-full text-left bg-slate-800/60 backdrop-blur rounded-xl border border-slate-700/50 p-5 hover:border-emerald-600/50 hover:bg-slate-800/80 transition-all group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-white font-medium">Board {board.boardNumber}</h3>
                      <span className="text-xs text-slate-400">{board.tableName}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-lg font-bold ${board.imps > 0 ? 'text-emerald-400' : board.imps < 0 ? 'text-blue-400' : 'text-slate-400'}`}>
                        {board.imps > 0 ? '+' : ''}{board.imps} IMP
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-slate-900/40 rounded-lg p-2.5 border border-slate-700/20">
                      <div className="text-slate-500 mb-1">Original</div>
                      <div className="text-slate-200 font-medium">
                        {contractText(board.originalContract)}
                      </div>
                      <div className="text-slate-500 mt-0.5">{board.originalScore.summary}</div>
                    </div>
                    <div className="bg-slate-900/40 rounded-lg p-2.5 border border-slate-700/20">
                      <div className="text-slate-500 mb-1">Replay (swapped)</div>
                      <div className="text-slate-200 font-medium">
                        {contractText(board.replayContract)}
                      </div>
                      <div className="text-slate-500 mt-0.5">{board.replayScore.summary}</div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-500 mt-2 flex items-center gap-3">
                    <span>Vul: <span className="text-slate-300">{vulLabel(board.vulnerability)}</span></span>
                    <span>Net: <span className="text-slate-300">{board.netPoints > 0 ? '+' : ''}{board.netPoints} pts</span></span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function BoardComparison({ board, onBack }: { board: CompletedBoard; onBack: () => void }) {
  const [original, setOriginal] = useState<HandDetail | null>(null);
  const [replay, setReplay] = useState<HandDetail | null>(null);
  const [trickIndex, setTrickIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [origData, replayData] = await Promise.all([
        loadHandDetail(board.originalHandId),
        loadHandDetail(board.replayHandId),
      ]);
      setOriginal(origData);
      setReplay(replayData);
      setLoading(false);
    })();
  }, [board.originalHandId, board.replayHandId]);

  const maxTricks = useMemo(() => {
    const o = original?.playState.completedTricks.length ?? 0;
    const r = replay?.playState.completedTricks.length ?? 0;
    return Math.max(o, r);
  }, [original, replay]);

  const currentTrickIndex = Math.min(trickIndex, Math.max(0, maxTricks - 1));

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!original || !replay) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 flex items-center justify-center">
        <p className="text-slate-400">Could not load hand details.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900">
      <div className="max-w-7xl mx-auto p-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to History
        </button>

        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-white">Board {board.boardNumber} Comparison</h1>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-400">Vul: <span className="text-slate-200">{vulLabel(board.vulnerability)}</span></span>
            <span className={`text-lg font-bold ${board.imps > 0 ? 'text-emerald-400' : board.imps < 0 ? 'text-blue-400' : 'text-slate-400'}`}>
              {board.imps > 0 ? '+' : ''}{board.imps} IMP
            </span>
          </div>
        </div>

        {/* Trick navigation */}
        <div className="flex items-center justify-center gap-4 mb-4 bg-slate-800/60 rounded-xl border border-slate-700/50 p-3">
          <button
            onClick={() => setTrickIndex(i => Math.max(0, i - 1))}
            disabled={currentTrickIndex === 0}
            className="p-2 rounded-lg bg-slate-700 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-600 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center min-w-[140px]">
            <div className="text-sm text-white font-medium">
              {currentTrickIndex < maxTricks ? `Trick ${currentTrickIndex + 1}` : 'All Tricks'}
            </div>
            <div className="text-xs text-slate-500">
              {currentTrickIndex + 1} / {maxTricks}
            </div>
          </div>
          <button
            onClick={() => setTrickIndex(i => Math.min(maxTricks - 1, i + 1))}
            disabled={currentTrickIndex >= maxTricks - 1}
            className="p-2 rounded-lg bg-slate-700 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-600 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Side-by-side comparison */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <HandPanel
            title="Original"
            subtitle="N+S vs E+W (normal seats)"
            detail={original}
            trickIndex={currentTrickIndex}
            accent="emerald"
          />
          <HandPanel
            title="Replay (Swapped)"
            subtitle="N+S swapped with E+W"
            detail={replay}
            trickIndex={currentTrickIndex}
            accent="blue"
          />
        </div>
      </div>
    </div>
  );
}

function HandPanel({
  title, subtitle, detail, trickIndex, accent,
}: {
  title: string;
  subtitle: string;
  detail: HandDetail;
  trickIndex: number;
  accent: 'emerald' | 'blue';
}) {
  const accentText = accent === 'emerald' ? 'text-emerald-400' : 'text-blue-400';
  const accentBorder = accent === 'emerald' ? 'border-emerald-700/40' : 'border-blue-700/40';
  const accentBg = accent === 'emerald' ? 'bg-emerald-950/30' : 'bg-blue-950/30';

  const tricks = detail.playState.completedTricks;
  const currentTrick = trickIndex < tricks.length ? tricks[trickIndex] : [];
  const playedUpTo = useMemo(() => {
    const played: Record<Seat, Card[]> = { N: [], E: [], S: [], W: [] };
    for (let i = 0; i <= trickIndex && i < tricks.length; i++) {
      for (const tc of tricks[i]) {
        played[tc.seat].push(tc.card);
      }
    }
    return played;
  }, [tricks, trickIndex]);

  const getRemainingHand = (seat: Seat): Card[] => {
    const full = sortHand(detail.deal[seat], detail.contract.strain);
    const played = playedUpTo[seat] ?? [];
    return full.filter(c => !played.some(p => p.suit === c.suit && p.rank === c.rank));
  };

  const trumpStrain = detail.contract.strain;

  return (
    <div className={`rounded-xl border ${accentBorder} ${accentBg} backdrop-blur overflow-hidden`}>
      <div className="px-4 py-3 border-b border-slate-700/40">
        <div className="flex items-center justify-between">
          <h3 className={`text-sm font-bold ${accentText}`}>{title}</h3>
          <span className="text-xs text-slate-500">{subtitle}</span>
        </div>
        <div className="mt-2 flex items-center gap-3 text-xs">
          <span className="text-slate-300 font-medium">
            {contractText(detail.contract)}
          </span>
          <span className="text-slate-500">{detail.score.summary}</span>
        </div>
      </div>

      {/* Four hands layout */}
      <div className="p-4">
        <div className="grid grid-areas-4h grid-cols-1 gap-2">
          {/* North */}
          <div className="flex justify-center">
            <HandDisplay hand={getRemainingHand('N')} seat="N" label="N" cardWidth={36} trumpStrain={trumpStrain} />
          </div>
          {/* West + trick + East */}
          <div className="flex items-center justify-between gap-2">
            <HandDisplay hand={getRemainingHand('W')} seat="W" label="W" cardWidth={36} trumpStrain={trumpStrain} />
            <div className="flex-shrink-0">
              {currentTrick.length > 0 ? (
                <TrickDisplay trick={currentTrick} />
              ) : (
                <div className="w-24 h-24 flex items-center justify-center text-xs text-slate-600">
                  {trickIndex >= tricks.length ? 'Complete' : '—'}
                </div>
              )}
            </div>
            <HandDisplay hand={getRemainingHand('E')} seat="E" label="E" cardWidth={36} trumpStrain={trumpStrain} />
          </div>
          {/* South */}
          <div className="flex justify-center">
            <HandDisplay hand={getRemainingHand('S')} seat="S" label="S" cardWidth={36} trumpStrain={trumpStrain} />
          </div>
        </div>

        {/* Auction summary */}
        <div className="mt-3 pt-3 border-t border-slate-700/30">
          <div className="text-xs text-slate-500 mb-1">Auction</div>
          <div className="flex flex-wrap gap-1">
            {detail.auction.map((entry, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-300">
                {entry.seat}: {bidText(entry.bid)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TrickDisplay({ trick }: { trick: TrickCard[] }) {
  const positionClasses: Record<Seat, string> = {
    N: 'self-center',
    S: 'self-center',
    E: 'self-center',
    W: 'self-center',
  };

  return (
    <div className="grid grid-cols-3 grid-rows-3 gap-0.5 w-24 h-24">
      {SEATS.map((seat) => {
        const tc = trick.find(c => c.seat === seat);
        return (
          <div
            key={seat}
            className={`flex items-center justify-center ${seatPosClass(seat)}`}
          >
            {tc && (
              <CardDisplay card={tc.card} cardWidth={44} />
            )}
            {!tc && <span className="text-[9px] text-slate-700">{seat}</span>}
          </div>
        );
      })}
    </div>
  );
}

function seatPosClass(seat: Seat): string {
  switch (seat) {
    case 'N': return 'col-start-2 row-start-1';
    case 'E': return 'col-start-3 row-start-2';
    case 'S': return 'col-start-2 row-start-3';
    case 'W': return 'col-start-1 row-start-2';
  }
}

async function loadHandDetail(handId: string): Promise<HandDetail | null> {
  const { data: hand, error } = await supabase
    .from('hands')
    .select('id, dealer, vulnerability, auction, contract, score, play_state')
    .eq('id', handId)
    .maybeSingle();

  if (error || !hand) return null;

  const { data: cardRows } = await supabase
    .from('hand_cards')
    .select('seat, cards')
    .eq('hand_id', handId);

  if (!cardRows) return null;

  const cardMap: Record<string, string[]> = { N: [], E: [], S: [], W: [] };
  for (const row of cardRows) {
    cardMap[row.seat as Seat] = row.cards as string[];
  }

  return {
    handId: hand.id,
    deal: jsonToDeal(cardMap),
    auction: (hand.auction as AuctionEntry[]) || [],
    contract: hand.contract as Contract,
    score: hand.score as HandScore,
    playState: hand.play_state as PlayState,
    vulnerability: hand.vulnerability as Vulnerability,
    dealer: hand.dealer as Seat,
  };
}

function contractText(c: Contract): string {
  const strain = c.strain === 'NT' ? 'NT' : SUIT_SYMBOLS[c.strain as keyof typeof SUIT_SYMBOLS] ?? c.strain;
  const dbl = c.doubled === 1 ? 'X' : c.doubled === 2 ? 'XX' : '';
  return `${c.level}${strain}${dbl} by ${c.declarer}`;
}

function bidText(bid: AuctionEntry['bid']): string {
  if (bid.type === 'pass') return 'Pass';
  if (bid.type === 'double') return 'X';
  if (bid.type === 'redouble') return 'XX';
  const strain = bid.strain === 'NT' ? 'NT' : SUIT_SYMBOLS[bid.strain as keyof typeof SUIT_SYMBOLS] ?? bid.strain;
  return `${bid.level}${strain}`;
}

function vulLabel(vul: Vulnerability): string {
  switch (vul) {
    case 'none': return 'None';
    case 'NS': return 'NS';
    case 'EW': return 'EW';
    case 'both': return 'Both';
  }
}
