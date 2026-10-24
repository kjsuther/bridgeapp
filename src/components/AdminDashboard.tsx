import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { scheduleHand } from '@/lib/matchSchedule';
import { swapSeatForReplay } from '@/lib/dealing';
import type { Contract, HandRole, Phase, Seat, Vulnerability } from '@/types/bridge';
import { SUIT_SYMBOLS, STRAIN_SYMBOLS } from '@/types/bridge';
import { ArrowLeft, Shield, RefreshCw, Layers, AlertCircle, CheckCircle2, Circle, Repeat2 } from 'lucide-react';

const ADMIN_EMAIL = 'kjsuther@gmail.com';

interface AdminTableInfo {
  id: string;
  name: string;
  status: string;
  created_at: string;
  match_imps_a: number;
  match_imps_b: number;
  match_board_number: number;
  new_hands_before_replay: number;
}

interface AdminGameInfo {
  id: string;
  table_id: string;
  status: string;
  hand_number: number;
  created_at: string;
}

interface AdminHandInfo {
  id: string;
  game_id: string;
  hand_number: number;
  hand_role: HandRole;
  original_hand_id: string | null;
  dealer: Seat;
  vulnerability: Vulnerability;
  phase: Phase;
  contract: Contract | null;
  imp_result: { imps: number; netPoints: number } | null;
  state_version: number;
}

interface AdminProps {
  onBack: () => void;
}

export function AdminDashboard({ onBack }: AdminProps) {
  const [tables, setTables] = useState<AdminTableInfo[]>([]);
  const [games, setGames] = useState<AdminGameInfo[]>([]);
  const [hands, setHands] = useState<AdminHandInfo[]>([]);
  const [tableNameMap, setTableNameMap] = useState<Record<string, string>>({});
  const [tableGameMap, setTableGameMap] = useState<Record<string, string>>({});
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);

    const [{ data: tablesData }, { data: gamesData }, { data: handsData }] = await Promise.all([
      supabase.from('tables').select('*').order('created_at', { ascending: false }),
      supabase.from('games').select('id, table_id, status, hand_number, created_at').order('created_at', { ascending: false }),
      supabase.from('hands').select('id, game_id, hand_number, hand_role, original_hand_id, dealer, vulnerability, phase, contract, imp_result, state_version').order('hand_number', { ascending: true }),
    ]);

    const tMap: Record<string, string> = {};
    (tablesData || []).forEach((t) => { tMap[t.id] = t.name; });
    setTableNameMap(tMap);

    const gMap: Record<string, string> = {};
    (gamesData || []).forEach((g) => { gMap[g.id] = g.table_id; });
    setTableGameMap(gMap);

    setTables((tablesData || []) as AdminTableInfo[]);
    setGames((gamesData || []) as AdminGameInfo[]);
    setHands((handsData || []) as AdminHandInfo[]);

    if (isRefresh) setRefreshing(false); else setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const selectedGame = useMemo(() => games.find(g => g.id === selectedGameId) ?? null, [games, selectedGameId]);
  const selectedTable = useMemo(() => selectedGame ? tables.find(t => t.id === selectedGame.table_id) ?? null : null, [tables, selectedGame]);
  const gameHands = useMemo(() => selectedGameId ? hands.filter(h => h.game_id === selectedGameId) : [], [hands, selectedGameId]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900">
      <div className="max-w-[1400px] mx-auto p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 pt-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-700/40 border border-slate-600/40 flex items-center justify-center">
              <Shield className="w-5 h-5 text-slate-300" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Admin Dashboard</h1>
              <p className="text-sm text-slate-500">Game & match inspection</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => loadAll(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={onBack}
              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Lobby
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : games.length === 0 ? (
          <div className="bg-slate-800/40 rounded-xl border border-slate-700/30 p-12 text-center">
            <p className="text-slate-400">No games found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
            {/* Left: games list */}
            <div className="space-y-2 lg:max-h-[calc(100vh-140px)] lg:overflow-y-auto pr-1">
              {games.map(game => {
                const tableName = tableNameMap[game.table_id] ?? 'Unknown';
                const table = tables.find(t => t.id === game.table_id);
                const handCount = hands.filter(h => h.game_id === game.id).length;
                const isSelected = game.id === selectedGameId;

                return (
                  <button
                    key={game.id}
                    onClick={() => setSelectedGameId(game.id)}
                    className={`w-full text-left rounded-xl border p-4 transition-all ${
                      isSelected
                        ? 'bg-slate-800 border-slate-500 shadow-lg'
                        : 'bg-slate-800/40 border-slate-700/30 hover:border-slate-600 hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-white text-sm font-medium truncate">{tableName}</h3>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ml-2 ${
                        game.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                        game.status === 'finished' ? 'bg-slate-600/20 text-slate-400' :
                        'bg-amber-500/20 text-amber-400'
                      }`}>
                        {game.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>{handCount} hand{handCount !== 1 ? 's' : ''}</span>
                      {table && (
                        <span className={table.match_board_number > 0 ? 'text-amber-400' : ''}>
                          {table.match_board_number} board{table.match_board_number !== 1 ? 's' : ''}
                        </span>
                      )}
                      <span className="text-slate-600">#{game.id.slice(0, 6)}</span>
                    </div>
                    {/* Show board numbers for completed hands */}
                    {(() => {
                      const gameHandObjs = hands.filter(h => h.game_id === game.id);
                      const boardNums = gameHandObjs
                        .map(h => h.hand_role === 'replay' && h.original_hand_id
                          ? gameHandObjs.find(o => o.id === h.original_hand_id)?.hand_number ?? h.hand_number
                          : h.hand_number)
                        .filter((n, i, arr) => arr.indexOf(n) === i)
                        .sort((a, b) => a - b);
                      if (boardNums.length === 0) return null;
                      return (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {boardNums.map(n => (
                            <span key={n} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/40 text-slate-400">
                              Board {n}
                            </span>
                          ))}
                        </div>
                      );
                    })()}
                    {table && table.match_board_number > 0 && (
                      <div className="flex items-center gap-3 mt-1.5 text-xs">
                        <span className="text-emerald-400">A: {table.match_imps_a > 0 ? '+' : ''}{table.match_imps_a}</span>
                        <span className="text-blue-400">B: {table.match_imps_b > 0 ? '+' : ''}{table.match_imps_b}</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Right: game details */}
            <div className="min-w-0">
              {!selectedGame || !selectedTable ? (
                <div className="bg-slate-800/40 rounded-xl border border-slate-700/30 p-12 text-center">
                  <Layers className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400">Select a game from the left to inspect its hands and match pairing.</p>
                </div>
              ) : (
                <GameDetail
                  game={selectedGame}
                  table={selectedTable}
                  hands={gameHands}
                  tableName={tableNameMap[selectedGame.table_id] ?? 'Unknown'}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface GameDetailProps {
  game: AdminGameInfo;
  table: AdminTableInfo;
  hands: AdminHandInfo[];
  tableName: string;
}

function GameDetail({ game, table, hands, tableName }: GameDetailProps) {
  const newHandsBeforeReplay = table.new_hands_before_replay;

  // Determine which original hands are completed and replayable
  const completedOriginals = useMemo(() => {
    return hands
      .filter(h => h.hand_role === 'original' && (h.phase === 'scoring' || h.phase === 'finished'))
      .map(h => h.hand_number)
      .sort((a, b) => a - b);
  }, [hands]);

  const replayedOriginals = useMemo(() => {
    const replayed = new Set<number>();
    for (const h of hands) {
      if (h.hand_role === 'replay' && h.original_hand_id) {
        const orig = hands.find(o => o.id === h.original_hand_id);
        if (orig) replayed.add(orig.hand_number);
      }
    }
    return replayed;
  }, [hands]);

  const replayableOriginals = useMemo(() => {
    return completedOriginals.filter(n => !replayedOriginals.has(n));
  }, [completedOriginals, replayedOriginals]);

  // Next hand preview
  const nextHandNumber = game.hand_number + 1;
  const nextSchedule = useMemo(() => {
    return scheduleHand(nextHandNumber, newHandsBeforeReplay, replayableOriginals);
  }, [nextHandNumber, newHandsBeforeReplay, replayableOriginals]);

  // Group hands into original/replay pairs for display
  const handPairs = useMemo(() => {
    const pairs: { original: AdminHandInfo | null; replay: AdminHandInfo | null; originalHandNumber: number }[] = [];

    for (const h of hands) {
      if (h.hand_role === 'original') {
        pairs.push({ original: h, replay: null, originalHandNumber: h.hand_number });
      }
    }

    for (const h of hands) {
      if (h.hand_role === 'replay' && h.original_hand_id) {
        const orig = hands.find(o => o.id === h.original_hand_id);
        if (orig) {
          const pair = pairs.find(p => p.original?.id === orig.id);
          if (pair) {
            pair.replay = h;
          } else {
            pairs.push({ original: null, replay: h, originalHandNumber: orig.hand_number });
          }
        }
      } else if (h.hand_role === 'replay' && !h.original_hand_id) {
        pairs.push({ original: null, replay: h, originalHandNumber: 0 });
      }
    }

    return pairs.sort((a, b) => a.originalHandNumber - b.originalHandNumber);
  }, [hands]);

  return (
    <div className="space-y-4">
      {/* Game header card */}
      <div className="bg-slate-800/60 backdrop-blur rounded-xl border border-slate-700/50 p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">{tableName}</h2>
            <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
              <span>Game status: <span className="text-slate-300">{game.status}</span></span>
              <span>Current hand: <span className="text-slate-300">{game.hand_number}</span></span>
              <span>Replays after: <span className="text-slate-300">{newHandsBeforeReplay} hands</span></span>
            </div>
          </div>
          {table.match_board_number > 0 && (
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-xs text-slate-500">Team A (NS)</div>
                <div className="text-lg font-bold text-emerald-400">{table.match_imps_a > 0 ? '+' : ''}{table.match_imps_a}</div>
              </div>
              <div className="text-slate-600 text-xl">vs</div>
              <div className="text-center">
                <div className="text-xs text-slate-500">Team B (EW)</div>
                <div className="text-lg font-bold text-blue-400">{table.match_imps_b > 0 ? '+' : ''}{table.match_imps_b}</div>
              </div>
            </div>
          )}
        </div>

        {/* Next deal preview */}
        <div className="bg-slate-900/50 rounded-lg border border-slate-700/40 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium text-amber-300">Next Deal Preview (Hand {nextHandNumber})</span>
          </div>
          {nextSchedule.role === 'original' ? (
            <div className="text-sm text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <Circle className="w-3.5 h-3.5 text-emerald-400" />
                New original hand — board {nextSchedule.boardNumber}
              </span>
            </div>
          ) : nextSchedule.originalHandNumber !== null ? (
            <div className="space-y-1">
              <div className="text-sm text-slate-300">
                <span className="inline-flex items-center gap-1.5">
                  <Repeat2 className="w-3.5 h-3.5 text-amber-400" />
                  Replay of hand {nextSchedule.originalHandNumber} (board {nextSchedule.boardNumber})
                </span>
              </div>
              <div className="text-xs text-slate-500 ml-5">
                Cards will be swapped N↔E, S↔W. Dealer and vulnerability will be copied from the original.
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <Repeat2 className="w-3.5 h-3.5 text-amber-400" />
                Replay scheduled but no completed original is available to replay yet.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Hand pairs list */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
          Hands ({hands.length} total, {replayedOriginals.size} replayed)
        </h3>

        {handPairs.map((pair, idx) => (
          <HandPairRow key={idx} pair={pair} />
        ))}
      </div>
    </div>
  );
}

interface HandPairRowProps {
  pair: { original: AdminHandInfo | null; replay: AdminHandInfo | null; originalHandNumber: number };
}

function HandPairRow({ pair }: HandPairRowProps) {
  const { original, replay } = pair;
  const hasReplay = replay !== null;
  const replayComplete = replay && (replay.phase === 'scoring' || replay.phase === 'finished');
  const impValue = replay?.imp_result?.imps;
  const netPoints = replay?.imp_result?.netPoints;
  const boardNumber = pair.originalHandNumber || original?.hand_number || 0;

  return (
    <div className={`rounded-xl border overflow-hidden ${
      hasReplay
        ? replayComplete
          ? 'border-slate-700/50 bg-slate-800/40'
          : 'border-amber-700/30 bg-amber-950/10'
        : 'border-slate-700/30 bg-slate-800/30'
    }`}>
      {/* Board number header */}
      <div className="px-4 py-1.5 bg-slate-900/40 border-b border-slate-700/20 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">Board {boardNumber}</span>
        {replayComplete && impValue !== undefined && impValue !== null && (
          <span className={`text-xs font-bold ${impValue > 0 ? 'text-emerald-400' : impValue < 0 ? 'text-blue-400' : 'text-slate-400'}`}>
            {impValue > 0 ? '+' : ''}{impValue} IMP
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
        {/* Original hand */}
        <div className="p-4 border-b md:border-b-0 md:border-r border-slate-700/30">
          <HandHandSummary
            hand={original}
            label="Original"
            icon={<Circle className="w-3.5 h-3.5 text-emerald-400" />}
            accent="emerald"
          />
        </div>

        {/* Replay hand */}
        <div className="p-4">
          {replay ? (
            <HandHandSummary
              hand={replay}
              label={`Replay of #${pair.originalHandNumber}`}
              icon={<Repeat2 className="w-3.5 h-3.5 text-amber-400" />}
              accent="amber"
              impValue={impValue ?? null}
              netPoints={netPoints ?? null}
            />
          ) : (
            <div className="flex items-center gap-2 text-slate-500 text-sm h-full">
              <Repeat2 className="w-3.5 h-3.5 text-slate-600" />
              <span>Not yet replayed</span>
            </div>
          )}
        </div>
      </div>

      {/* IMP result banner */}
      {replayComplete && impValue !== undefined && impValue !== null && (
        <div className={`px-4 py-2 text-xs font-medium flex items-center justify-between border-t border-slate-700/30 ${
          impValue > 0 ? 'bg-emerald-950/30 text-emerald-300' :
          impValue < 0 ? 'bg-blue-950/30 text-blue-300' :
          'bg-slate-800/40 text-slate-400'
        }`}>
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Board {boardNumber} complete
          </span>
          <span className="flex items-center gap-4">
            <span>Net: {netPoints !== undefined ? `${netPoints > 0 ? '+' : ''}${netPoints} pts` : '—'}</span>
            <span className="font-bold">{impValue > 0 ? '+' : ''}{impValue} IMP</span>
          </span>
        </div>
      )}
    </div>
  );
}

interface HandHandSummaryProps {
  hand: AdminHandInfo | null;
  label: string;
  icon: React.ReactNode;
  accent: 'emerald' | 'amber';
  impValue?: number | null;
  netPoints?: number | null;
}

function HandHandSummary({ hand, label, icon, accent }: HandHandSummaryProps) {
  const accentText = accent === 'emerald' ? 'text-emerald-400' : 'text-amber-400';

  if (!hand) {
    return (
      <div className="flex items-center gap-2 text-slate-500 text-sm h-full">
        {icon}
        <span>{label}</span>
        <span className="text-slate-600 ml-auto">—</span>
      </div>
    );
  }

  const phaseColor = hand.phase === 'finished' || hand.phase === 'scoring'
    ? 'text-emerald-400'
    : hand.phase === 'playing'
    ? 'text-blue-400'
    : 'text-slate-400';

  // Show the dealer that was actually used for this hand
  // For replays, the dealer shown in the DB is the already-swapped dealer
  // (the fix applies swapSeatForReplay before creating the hand)
  const dealerLabel = hand.dealer;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {icon}
        <span className={`text-sm font-medium ${accentText}`}>{label}</span>
        <span className="text-xs text-slate-500 ml-auto">Hand #{hand.hand_number}</span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div className="text-slate-500">
          Dealer: <span className="text-slate-300">{dealerLabel}</span>
        </div>
        <div className="text-slate-500">
          Vul: <span className="text-slate-300">{vulLabel(hand.vulnerability)}</span>
        </div>
        <div className="text-slate-500">
          Phase: <span className={phaseColor}>{hand.phase}</span>
        </div>
        <div className="text-slate-500">
          Role: <span className="text-slate-300">{hand.hand_role}</span>
        </div>
      </div>

      {hand.contract ? (
        <div className="text-sm">
          <span className="text-slate-200 font-medium">{contractText(hand.contract)}</span>
          {hand.contract.tricksMade !== undefined && (
            <span className="text-slate-500 ml-2">
              ({hand.contract.tricksMade} tricks)
            </span>
          )}
        </div>
      ) : (
        <div className="text-xs text-slate-600">No contract yet</div>
      )}

      {hand.hand_role === 'replay' && hand.original_hand_id && (
        <div className="text-xs text-slate-500 flex items-center gap-1">
          <Repeat2 className="w-3 h-3" />
          Replays hand ID: {hand.original_hand_id.slice(0, 8)}
        </div>
      )}
    </div>
  );
}

function contractText(c: Contract): string {
  const strain = c.strain === 'NT' ? 'NT' : SUIT_SYMBOLS[c.strain as keyof typeof SUIT_SYMBOLS] ?? c.strain;
  const dbl = c.doubled === 1 ? 'X' : c.doubled === 2 ? 'XX' : '';
  return `${c.level}${strain}${dbl} by ${c.declarer}`;
}

function vulLabel(vul: Vulnerability): string {
  switch (vul) {
    case 'none': return 'None';
    case 'NS': return 'NS';
    case 'EW': return 'EW';
    case 'both': return 'Both';
  }
}
