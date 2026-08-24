import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { ArrowLeft, Trophy, Calendar, Layers } from 'lucide-react';

interface HistoryProps {
  onBack: () => void;
}

interface GameRecord {
  id: string;
  table_id: string;
  status: string;
  ns_total: number;
  ew_total: number;
  ns_games_won: number;
  ew_games_won: number;
  hand_number: number;
  created_at: string;
  ended_at: string | null;
  table_name: string;
}

export function History({ onBack }: HistoryProps) {
  const { profile } = useAuth();
  const [games, setGames] = useState<GameRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // Get tables where I'm a player
      const { data: myTables } = await supabase
        .from('table_players')
        .select('table_id')
        .eq('user_id', profile?.id);

      if (!myTables || myTables.length === 0) {
        setLoading(false);
        return;
      }

      const tableIds = myTables.map((t) => t.table_id);

      // Get table names
      const { data: tablesData } = await supabase
        .from('tables')
        .select('id, name')
        .in('id', tableIds);

      const tableNameMap: Record<string, string> = {};
      (tablesData || []).forEach((t) => {
        tableNameMap[t.id] = t.name;
      });

      // Get games for those tables
      const { data: gamesData } = await supabase
        .from('games')
        .select('*')
        .in('table_id', tableIds)
        .order('created_at', { ascending: false });

      if (gamesData) {
        const records: GameRecord[] = gamesData.map((g) => ({
          ...g,
          table_name: tableNameMap[g.table_id] ?? 'Unknown Table',
        }));
        setGames(records);
      }

      setLoading(false);
    })();
  }, [profile]);

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
          <h1 className="text-2xl font-bold text-white">Game History</h1>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : games.length === 0 ? (
          <div className="bg-slate-800/40 rounded-xl border border-slate-700/30 p-12 text-center">
            <p className="text-slate-400">No games played yet. Start a rubber to build your history!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {games.map((game) => {
              const nsWon = game.ns_total > game.ew_total;
              const isFinished = game.status === 'finished';

              return (
                <div
                  key={game.id}
                  className="bg-slate-800/60 backdrop-blur rounded-xl border border-slate-700/50 p-5"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-white font-medium">{game.table_name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        <span className="text-xs text-slate-400">
                          {new Date(game.created_at).toLocaleDateString()} at {new Date(game.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      isFinished ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {isFinished ? 'Complete' : 'In Progress'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className={`rounded-lg p-3 ${nsWon && isFinished ? 'bg-emerald-950/40 border border-emerald-700/30' : 'bg-slate-900/40 border border-slate-700/20'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-emerald-300">North-South</span>
                        {nsWon && isFinished && <Trophy className="w-3 h-3 text-amber-400" />}
                      </div>
                      <div className="text-2xl font-bold text-white">{game.ns_total}</div>
                      <div className="text-xs text-slate-500">Games won: {game.ns_games_won}</div>
                    </div>
                    <div className={`rounded-lg p-3 ${!nsWon && isFinished ? 'bg-blue-950/40 border border-blue-700/30' : 'bg-slate-900/40 border border-slate-700/20'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-blue-300">East-West</span>
                        {!nsWon && isFinished && <Trophy className="w-3 h-3 text-amber-400" />}
                      </div>
                      <div className="text-2xl font-bold text-white">{game.ew_total}</div>
                      <div className="text-xs text-slate-500">Games won: {game.ew_games_won}</div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-500 mt-2">
                    Hands played: {game.hand_number}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
