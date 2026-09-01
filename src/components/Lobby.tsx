import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Seat, TablePlayer } from '@/types/bridge';
import { SEATS } from '@/types/bridge';
import { LogOut, Plus, Users, ArrowRight, History as HistoryIcon } from 'lucide-react';

interface TableInfo {
  id: string;
  name: string;
  host_id: string;
  status: string;
  created_at: string;
}

interface LobbyProps {
  onJoinTable: (tableId: string) => void;
  onShowHistory: () => void;
}

export function Lobby({ onJoinTable, onShowHistory }: LobbyProps) {
  const { profile, signOut } = useAuth();
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [playersByTable, setPlayersByTable] = useState<Record<string, TablePlayer[]>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [tableName, setTableName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allProfiles, setAllProfiles] = useState<Record<string, string>>({});
  const lastKnownTableIds = useRef<Set<string>>(new Set());

  const loadTables = useCallback(async () => {
    if (!profile) return;

    const { data } = await supabase
      .from('tables')
      .select('*')
      .order('created_at', { ascending: false });

    if (data) {
      setTables(data as TableInfo[]);

      const playerMap: Record<string, TablePlayer[]> = {};
      for (const t of data) {
        const { data: players } = await supabase
          .from('table_players')
          .select('user_id, seat')
          .eq('table_id', t.id);

        playerMap[t.id] = (players || []).map((p) => ({
          user_id: p.user_id,
          seat: p.seat as Seat,
          display_name: '',
        }));
      }
      setPlayersByTable(playerMap);

      const allUserIds = new Set<string>();
      Object.values(playerMap).forEach((players) => {
        players.forEach((p) => allUserIds.add(p.user_id));
      });
      allUserIds.add(profile.id);

      if (allUserIds.size > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', [...allUserIds]);

        const profMap: Record<string, string> = {};
        (profs || []).forEach((p) => {
          profMap[p.id] = p.display_name;
        });
        setAllProfiles(profMap);
      }

      // Auto-join: only auto-navigate to WAITING tables we haven't seen before.
      // In-progress tables are NOT auto-joined — the player sees them in the
      // lobby list and can choose to resume via the "Resume" button.
      const myWaitingTableIds = new Set<string>();
      const myAllTableIds = new Set<string>();
      for (const t of data) {
        const players = playerMap[t.id] || [];
        if (players.some((p) => p.user_id === profile.id)) {
          myAllTableIds.add(t.id);
          if (t.status === 'waiting') {
            myWaitingTableIds.add(t.id);
          }
        }
      }

      // If there's a new WAITING table I'm in, auto-navigate to it
      for (const tid of myWaitingTableIds) {
        if (!lastKnownTableIds.current.has(tid)) {
          lastKnownTableIds.current.add(tid);
          onJoinTable(tid);
          return;
        }
      }
      // Update known set to all tables I'm in (waiting + playing)
      lastKnownTableIds.current = myAllTableIds;
    }
  }, [profile, onJoinTable]);

  useEffect(() => {
    loadTables();

    const channel = supabase.channel('lobby-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, () => loadTables())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_players' }, () => loadTables())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadTables]);

  const handleCreate = async () => {
    if (!tableName.trim() || !profile) return;
    setBusy(true);
    setError(null);

    const { data, error: createError } = await supabase
      .from('tables')
      .insert({ name: tableName.trim(), host_id: profile.id })
      .select('id')
      .maybeSingle();

    if (createError || !data) {
      setError('Could not create the table. Please try again.');
      setBusy(false);
      return;
    }

    lastKnownTableIds.current.add(data.id);
    onJoinTable(data.id);
    setBusy(false);
    setShowCreate(false);
    setTableName('');
  };

  const getPlayerName = (userId: string) => allProfiles[userId] ?? 'Unknown';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-8 pt-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center">
              <Users className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Bridge Club</h1>
              <p className="text-sm text-slate-400">Welcome, {profile?.display_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={onShowHistory}
              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
              <HistoryIcon className="w-4 h-4" />
              History
            </button>
            <button
              onClick={() => signOut()}
              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Your Tables</h2>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-all shadow-lg shadow-emerald-600/20"
          >
            <Plus className="w-4 h-4" />
            New Table
          </button>
        </div>

        {showCreate && (
          <div className="bg-slate-800/60 backdrop-blur rounded-xl border border-slate-700/50 p-4 mb-6">
            <div className="flex gap-3">
              <input
                type="text"
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                placeholder="Table name (e.g. Friday Night Bridge)"
                className="flex-1 px-4 py-2.5 bg-slate-900/70 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                maxLength={50}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
              <button
                onClick={handleCreate}
                disabled={busy || !tableName.trim()}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-all disabled:opacity-50"
              >
                Create
              </button>
            </div>
            {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
          </div>
        )}

        <div className="space-y-3">
          {tables.length === 0 && (
            <div className="bg-slate-800/40 rounded-xl border border-slate-700/30 p-12 text-center">
              <p className="text-slate-400">No tables yet. Create one to get started!</p>
              <p className="text-slate-500 text-sm mt-2">
                You can assign players to seats once you've created a table.
              </p>
            </div>
          )}
          {tables.map((table) => {
            const players = playersByTable[table.id] || [];
            const isHost = table.host_id === profile?.id;

            const mySeatHere = players.find((p) => p.user_id === profile?.id);
            const isMyTable = !!mySeatHere;

            return (
              <div
                key={table.id}
                className={`backdrop-blur rounded-xl border p-5 flex items-center justify-between transition-all ${
                  isMyTable && table.status === 'playing'
                    ? 'bg-emerald-900/30 border-emerald-600/40 shadow-lg shadow-emerald-900/20'
                    : 'bg-slate-800/60 border-slate-700/50'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-white font-medium">{table.name}</h3>
                    {isHost && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-600/20 text-emerald-400 font-medium">
                        Host
                      </span>
                    )}
                    {isMyTable && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-medium">
                        You're seated
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      table.status === 'waiting' ? 'bg-amber-500/20 text-amber-400' :
                      table.status === 'playing' ? 'bg-emerald-500/20 text-emerald-400' :
                      'bg-slate-600/20 text-slate-400'
                    }`}>
                      {table.status === 'waiting' ? 'Waiting' : table.status === 'playing' ? 'In Progress' : 'Finished'}
                    </span>
                    <span className="text-sm text-slate-400">
                      {players.length}/4 players
                    </span>
                    <div className="flex gap-1 ml-2">
                      {SEATS.map((seat) => {
                        const player = players.find((p) => p.seat === seat);
                        return (
                          <span
                            key={seat}
                            className={`text-xs px-1.5 py-0.5 rounded ${
                              player ? 'bg-emerald-600/30 text-emerald-300' : 'bg-slate-700/30 text-slate-500'
                            }`}
                            title={player ? getPlayerName(player.user_id) : 'Empty'}
                          >
                            {seat}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => onJoinTable(table.id)}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-all"
                >
                  {table.status === 'playing' ? 'Resume' : 'Open'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
