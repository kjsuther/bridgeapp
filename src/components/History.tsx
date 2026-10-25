import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { jsonToDeal, sortHand } from '@/lib/dealing';
import { solveFromPosition } from '@/lib/doubleDummy';
import type { Deal, Contract, AuctionEntry, PlayState, Seat, Vulnerability, Card, TrickCard, HandScore, Suit } from '@/types/bridge';
import { SEATS, SUIT_SYMBOLS } from '@/types/bridge';
import { ArrowLeft, Scale, ChevronRight, ChevronLeft, Layers, Compass, Eye } from 'lucide-react';
import { CardDisplay, HandDisplay } from '@/components/CardDisplay';

interface HistoryProps {
  onBack: () => void;
  /** When provided, show only boards for this table. When omitted, show a table picker. */
  tableId?: string;
  /** When provided alongside tableId, show only boards for this specific game. */
  gameId?: string;
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
  tableId: string;
  createdAt: string;
}

interface TableSummary {
  tableId: string;
  tableName: string;
  boardCount: number;
  totalImpsA: number;
  totalImpsB: number;
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

type SeatNames = Record<Seat, string>;

export function History({ onBack, tableId, gameId }: HistoryProps) {
  const { profile } = useAuth();
  const [selectedBoard, setSelectedBoard] = useState<CompletedBoard | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(tableId ?? null);

  if (selectedBoard) {
    return (
      <BoardComparison
        board={selectedBoard}
        onBack={() => setSelectedBoard(null)}
      />
    );
  }

  if (selectedTable) {
    return (
      <TableHistory
        tableId={selectedTable}
        gameId={gameId}
        onBack={() => {
          if (tableId) {
            onBack();
          } else {
            setSelectedTable(null);
          }
        }}
      />
    );
  }

  return (
    <TablePicker
      profileId={profile?.id ?? ''}
      onSelectTable={(tid) => setSelectedTable(tid)}
      onBack={onBack}
    />
  );
}

/** Lobby entry point: shows a list of tables with completed boards. */
function TablePicker({
  profileId,
  onSelectTable,
  onBack,
}: {
  profileId: string;
  onSelectTable: (tableId: string) => void;
  onBack: () => void;
}) {
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!profileId) {
        setLoading(false);
        return;
      }

      const { data: myTables } = await supabase
        .from('table_players')
        .select('table_id')
        .eq('user_id', profileId);

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

      const gameIdToTable: Record<string, { tableId: string; tableName: string; createdAt: string }> = {};
      for (const g of games) {
        gameIdToTable[g.id] = {
          tableId: g.table_id,
          tableName: tableNameMap[g.table_id] ?? 'Unknown Table',
          createdAt: g.created_at,
        };
      }

      const gameIds = games.map((g) => g.id);

      const { data: hands } = await supabase
        .from('hands')
        .select('id, game_id, hand_number, hand_role, original_hand_id, contract, score, imp_result, phase')
        .in('game_id', gameIds)
        .order('hand_number', { ascending: true });

      if (!hands) {
        setLoading(false);
        return;
      }

      const byTable: Record<string, TableSummary> = {};
      for (const hand of hands) {
        if (hand.hand_role !== 'replay' || !hand.original_hand_id || !hand.contract || !hand.score) continue;
        if (hand.phase !== 'scoring' && hand.phase !== 'finished') continue;

        const origHand = hands.find((h) => h.id === hand.original_hand_id);
        if (!origHand || !origHand.contract || !origHand.score) continue;
        if (origHand.phase !== 'scoring' && origHand.phase !== 'finished') continue;

        const gameInfo = gameIdToTable[hand.game_id];
        if (!gameInfo) continue;

        const impResult = hand.imp_result as { imps: number; netPoints: number } | null;
        const imps = impResult?.imps ?? 0;

        if (!byTable[gameInfo.tableId]) {
          byTable[gameInfo.tableId] = {
            tableId: gameInfo.tableId,
            tableName: gameInfo.tableName,
            boardCount: 0,
            totalImpsA: 0,
            totalImpsB: 0,
          };
        }
        byTable[gameInfo.tableId].boardCount += 1;
        byTable[gameInfo.tableId].totalImpsA += imps;
        byTable[gameInfo.tableId].totalImpsB -= imps;
      }

      const tableList = Object.values(byTable).sort((a, b) => b.boardCount - a.boardCount);
      setTables(tableList);
      setLoading(false);
    })();
  }, [profileId]);

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
        ) : tables.length === 0 ? (
          <div className="bg-slate-800/40 rounded-xl border border-slate-700/30 p-12 text-center">
            <p className="text-slate-400">No completed boards yet. Boards appear here after they've been played twice (original + replay).</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tables.map((t) => (
              <button
                key={t.tableId}
                onClick={() => onSelectTable(t.tableId)}
                className="w-full text-left bg-slate-800/60 backdrop-blur rounded-xl border border-slate-700/50 p-5 hover:border-emerald-600/50 hover:bg-slate-800/80 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Compass className="w-5 h-5 text-emerald-400" />
                    <div>
                      <h3 className="text-white font-medium">{t.tableName}</h3>
                      <span className="text-xs text-slate-400">{t.boardCount} board{t.boardCount !== 1 ? 's' : ''} completed</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm">
                        <span className="text-emerald-300">A: <span className="font-bold">{t.totalImpsA > 0 ? '+' : ''}{t.totalImpsA}</span></span>
                      </div>
                      <div className="text-sm">
                        <span className="text-blue-300">B: <span className="font-bold">{t.totalImpsB > 0 ? '+' : ''}{t.totalImpsB}</span></span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Shows completed boards for a single table. */
function TableHistory({
  tableId,
  gameId,
  onBack,
}: {
  tableId: string;
  gameId?: string;
  onBack: () => void;
}) {
  const { profile } = useAuth();
  const [boards, setBoards] = useState<CompletedBoard[]>([]);
  const [tableName, setTableName] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedBoard, setSelectedBoard] = useState<CompletedBoard | null>(null);

  useEffect(() => {
    (async () => {
      const { data: tableData } = await supabase
        .from('tables')
        .select('name')
        .eq('id', tableId)
        .maybeSingle();

      setTableName(tableData?.name ?? 'Table');

      let gameQuery = supabase
        .from('games')
        .select('id, table_id, created_at')
        .eq('table_id', tableId)
        .order('created_at', { ascending: false });

      if (gameId) {
        gameQuery = gameQuery.eq('id', gameId);
      }

      const { data: games } = await gameQuery;

      if (!games || games.length === 0) {
        setLoading(false);
        return;
      }

      const gameIds = games.map((g) => g.id);

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

        const gameInfo = games.find((g) => g.id === hand.game_id);
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
          tableName,
          tableId,
          createdAt: gameInfo.created_at,
        });
      }

      completedBoards.sort((a, b) => b.boardNumber - a.boardNumber);
      setBoards(completedBoards);
      setLoading(false);
    })();
  }, [tableId, gameId, tableName]);

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
          Back
        </button>

        <div className="flex items-center gap-3 mb-6">
          <Compass className="w-6 h-6 text-emerald-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">{tableName}</h1>
            <p className="text-sm text-slate-400">Match History</p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : boards.length === 0 ? (
          <div className="bg-slate-800/40 rounded-xl border border-slate-700/30 p-12 text-center">
            <p className="text-slate-400">No completed boards yet for this table. Boards appear here after they've been played twice (original + replay).</p>
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

/** Flatten completed tricks into a single ordered list of cards as they were played. */
function flattenPlayedCards(tricks: TrickCard[][]): TrickCard[] {
  const all: TrickCard[] = [];
  for (const trick of tricks) {
    for (const tc of trick) {
      all.push(tc);
    }
  }
  return all;
}

function BoardComparison({ board, onBack }: { board: CompletedBoard; onBack: () => void }) {
  const [original, setOriginal] = useState<HandDetail | null>(null);
  const [replay, setReplay] = useState<HandDetail | null>(null);
  const [seatNames, setSeatNames] = useState<SeatNames>({ N: 'N', E: 'E', S: 'S', W: 'W' });
  const [cardIndex, setCardIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [origData, replayData, namesData] = await Promise.all([
        loadHandDetail(board.originalHandId),
        loadHandDetail(board.replayHandId),
        loadSeatNames(board.tableId),
      ]);
      setOriginal(origData);
      setReplay(replayData);
      setSeatNames(namesData);
      setLoading(false);
    })();
  }, [board.originalHandId, board.replayHandId, board.tableId]);

  const maxCards = useMemo(() => {
    const o = original?.playState.completedTricks.length ?? 0;
    const r = replay?.playState.completedTricks.length ?? 0;
    return Math.max(o, r) * 4;
  }, [original, replay]);

  const currentCardIndex = Math.min(cardIndex, Math.max(0, maxCards - 1));
  const currentTrickNumber = Math.floor(currentCardIndex / 4);
  const cardInTrick = currentCardIndex % 4;

  const stepBack = useCallback(() => {
    setCardIndex(i => Math.max(0, i - 1));
  }, []);

  const stepForward = useCallback(() => {
    setCardIndex(i => Math.min(maxCards - 1, i + 1));
  }, [maxCards]);

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

        {/* Card-by-card navigation */}
        <div className="flex items-center justify-center gap-4 mb-4 bg-slate-800/60 rounded-xl border border-slate-700/50 p-3">
          <button
            onClick={stepBack}
            disabled={currentCardIndex === 0}
            className="p-2 rounded-lg bg-slate-700 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-600 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center min-w-[160px]">
            <div className="text-sm text-white font-medium">
              Trick {currentTrickNumber + 1} · Card {cardInTrick + 1}
            </div>
            <div className="text-xs text-slate-500">
              Card {currentCardIndex + 1} / {maxCards}
            </div>
          </div>
          <button
            onClick={stepForward}
            disabled={currentCardIndex >= maxCards - 1}
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
            cardIndex={currentCardIndex}
            accent="emerald"
            seatNames={seatNames}
          />
          <HandPanel
            title="Replay (Swapped)"
            subtitle="N+S swapped with E+W"
            detail={replay}
            cardIndex={currentCardIndex}
            accent="blue"
            seatNames={seatNames}
          />
        </div>
      </div>
    </div>
  );
}

function HandPanel({
  title, subtitle, detail, cardIndex, accent, seatNames,
}: {
  title: string;
  subtitle: string;
  detail: HandDetail;
  cardIndex: number;
  accent: 'emerald' | 'blue';
  seatNames: SeatNames;
}) {
  const accentText = accent === 'emerald' ? 'text-emerald-400' : 'text-blue-400';
  const accentBorder = accent === 'emerald' ? 'border-emerald-700/40' : 'border-blue-700/40';
  const accentBg = accent === 'emerald' ? 'bg-emerald-950/30' : 'bg-blue-950/30';

  const tricks = detail.playState.completedTricks;
  const allCards = useMemo(() => flattenPlayedCards(tricks), [tricks]);

  const playedUpTo = useMemo(() => {
    const played: Record<Seat, Card[]> = { N: [], E: [], S: [], W: [] };
    for (let i = 0; i <= cardIndex && i < allCards.length; i++) {
      const tc = allCards[i];
      played[tc.seat].push(tc.card);
    }
    return played;
  }, [allCards, cardIndex]);

  const currentTrickNumber = Math.floor(cardIndex / 4);
  const cardInTrick = cardIndex % 4;

  const currentTrickCards = useMemo(() => {
    if (currentTrickNumber >= tricks.length) return [];
    const fullTrick = tricks[currentTrickNumber];
    return fullTrick.slice(0, cardInTrick + 1);
  }, [tricks, currentTrickNumber, cardInTrick]);

  const getRemainingHand = (seat: Seat): Card[] => {
    const full = sortHand(detail.deal[seat], detail.contract.strain);
    const played = playedUpTo[seat] ?? [];
    return full.filter(c => !played.some(p => p.suit === c.suit && p.rank === c.rank));
  };

  const trumpStrain = detail.contract.strain;

  const seatLabel = (seat: Seat): string => {
    const name = seatNames[seat] ?? seat;
    return `${seat} · ${name}`;
  };

  // Double-dummy analysis: always-on, computed asynchronously with caching.
  const [ddResult, setDdResult] = useState<{
    totalTricks: number;
    tricksWonSoFar: number;
    cardIndex: number;
  } | null>(null);
  const [ddComputing, setDdComputing] = useState(false);
  const ddCacheRef = useRef<Map<number, { totalTricks: number; tricksWonSoFar: number }>>(new Map());
  const ddRunIdRef = useRef(0);

  useEffect(() => {
    const playedCount = Math.min(cardIndex + 1, allCards.length);
    if (playedCount === 0) {
      setDdResult(null);
      return;
    }

    const cached = ddCacheRef.current.get(cardIndex);
    if (cached) {
      setDdResult({ totalTricks: cached.totalTricks, tricksWonSoFar: cached.tricksWonSoFar, cardIndex });
      return;
    }

    const runId = ++ddRunIdRef.current;
    setDdComputing(true);

    // Defer to next tick so the UI can update before the synchronous solver runs.
    const timer = setTimeout(() => {
      const playedCards = allCards.slice(0, playedCount).map(tc => ({ seat: tc.seat, card: tc.card }));
      const trump: Suit | null = trumpStrain === 'NT' ? null : (trumpStrain as Suit);
      try {
        const result = solveFromPosition(detail.deal, playedCards, trump, detail.contract.declarer);
        if (runId !== ddRunIdRef.current) return;
        ddCacheRef.current.set(cardIndex, { totalTricks: result.totalTricksDeclarer, tricksWonSoFar: result.tricksWonSoFar });
        setDdResult({ totalTricks: result.totalTricksDeclarer, tricksWonSoFar: result.tricksWonSoFar, cardIndex });
      } catch {
        if (runId !== ddRunIdRef.current) return;
        setDdResult(null);
      }
      setDdComputing(false);
    }, 30);

    return () => clearTimeout(timer);
  }, [cardIndex, allCards, detail.deal, detail.contract.declarer, trumpStrain]);

  const tricksNeeded = 6 + detail.contract.level;
  const ddVerdict = ddResult
    ? (() => {
        const optimal = ddResult.totalTricks;
        const diff = optimal - tricksNeeded;
        if (diff > 0) return { text: `+${diff} overtrick${diff !== 1 ? 's' : ''} possible`, color: 'text-emerald-400' };
        if (diff === 0) return { text: 'Contract makes exactly', color: 'text-amber-300' };
        return { text: `Down ${Math.abs(diff)} with best play`, color: 'text-blue-400' };
      })()
    : null;

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

      <div className="p-4">
        <div className="grid grid-areas-4h grid-cols-1 gap-2">
          <div className="flex justify-center">
            <HandDisplay hand={getRemainingHand('N')} seat="N" label={seatLabel('N')} cardWidth={36} trumpStrain={trumpStrain} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <HandDisplay hand={getRemainingHand('W')} seat="W" label={seatLabel('W')} cardWidth={36} trumpStrain={trumpStrain} />
            <div className="flex-shrink-0">
              {currentTrickCards.length > 0 ? (
                <TrickDisplay trick={currentTrickCards} seatNames={seatNames} />
              ) : (
                <div className="w-24 h-24 flex items-center justify-center text-xs text-slate-600">
                  {currentTrickNumber >= tricks.length ? 'Complete' : '—'}
                </div>
              )}
            </div>
            <HandDisplay hand={getRemainingHand('E')} seat="E" label={seatLabel('E')} cardWidth={36} trumpStrain={trumpStrain} />
          </div>
          <div className="flex justify-center">
            <HandDisplay hand={getRemainingHand('S')} seat="S" label={seatLabel('S')} cardWidth={36} trumpStrain={trumpStrain} />
          </div>
        </div>

        {/* Always-on double-dummy analysis for the current position */}
        <div className="mt-3 bg-slate-900/50 border border-amber-800/30 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Eye className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-medium text-amber-300">Double-Dummy</span>
            <span className="text-[10px] text-slate-500 ml-auto">optimal play from here</span>
          </div>
          {ddComputing ? (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <div className="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin" />
              Analyzing position...
            </div>
          ) : ddResult ? (
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Best possible for declarer:</span>
                <span className="text-white font-bold">{ddResult.totalTricks} tricks</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Tricks won so far:</span>
                <span className="text-slate-300">{ddResult.tricksWonSoFar}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Contract needs:</span>
                <span className="text-slate-300">{tricksNeeded} tricks</span>
              </div>
              {ddVerdict && (
                <div className={`text-xs font-medium pt-1 border-t border-slate-700/30 ${ddVerdict.color}`}>
                  {ddVerdict.text}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500">Step forward to analyze the position.</p>
          )}
        </div>

        <div className="mt-3 pt-3 border-t border-slate-700/30">
          <div className="text-xs text-slate-500 mb-1">Auction</div>
          <div className="flex flex-wrap gap-1">
            {detail.auction.map((entry, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-300">
                {seatNames[entry.seat] ?? entry.seat}: {bidText(entry.bid)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TrickDisplay({ trick, seatNames }: { trick: TrickCard[]; seatNames: SeatNames }) {
  return (
    <div className="grid grid-cols-3 grid-rows-3 gap-0.5 w-28 h-28">
      {SEATS.map((seat) => {
        const tc = trick.find(c => c.seat === seat);
        return (
          <div
            key={seat}
            className={`flex flex-col items-center justify-center ${seatPosClass(seat)}`}
          >
            {tc && (
              <CardDisplay card={tc.card} cardWidth={40} />
            )}
            {!tc && <span className="text-[9px] text-slate-700">{seatNames[seat] ?? seat}</span>}
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

async function loadSeatNames(tableId: string): Promise<SeatNames> {
  const { data: players } = await supabase
    .from('table_players')
    .select('seat, user_id')
    .eq('table_id', tableId);

  if (!players || players.length === 0) {
    return { N: 'N', E: 'E', S: 'S', W: 'W' };
  }

  const userIds = players.map((p) => p.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', userIds);

  const nameMap: Record<string, string> = {};
  (profiles || []).forEach((p) => { nameMap[p.id] = p.display_name; });

  const result: SeatNames = { N: 'N', E: 'E', S: 'S', W: 'W' };
  for (const p of players) {
    const seat = p.seat as Seat;
    result[seat] = nameMap[p.user_id] ?? seat;
  }
  return result;
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
