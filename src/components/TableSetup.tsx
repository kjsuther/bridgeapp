import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Seat } from '@/types/bridge';
import { SEATS, SUIT_SYMBOLS } from '@/types/bridge';
import { ArrowLeft, Compass, X, Lock } from 'lucide-react';

interface TableSetupProps {
  tableId: string;
  onGameStart: (gameId: string) => void;
  onBack: () => void;
}

interface SeatAssignment {
  user_id: string;
  seat: Seat;
  display_name: string;
}

interface ProfileOption {
  id: string;
  display_name: string;
}

export function TableSetup({ tableId, onGameStart, onBack }: TableSetupProps) {
  const { profile } = useAuth();
  const [tableName, setTableName] = useState('');
  const [tableStatus, setTableStatus] = useState('waiting');
  const [hostId, setHostId] = useState('');
  const [hostName, setHostName] = useState('');
  const [seats, setSeats] = useState<Record<Seat, SeatAssignment | null>>({
    N: null, E: null, S: null, W: null,
  });
  const [allProfiles, setAllProfiles] = useState<ProfileOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isHost = hostId === profile?.id;

  const loadState = useCallback(async () => {
    const { data: tableData } = await supabase
      .from('tables')
      .select('name, status, host_id')
      .eq('id', tableId)
      .maybeSingle();

    if (tableData) {
      setTableName(tableData.name);
      setTableStatus(tableData.status);
      setHostId(tableData.host_id);

      // Get host display name
      const { data: hostProfile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', tableData.host_id)
        .maybeSingle();
      setHostName(hostProfile?.display_name ?? 'Host');

      // If the table has moved to "playing", auto-navigate to the active game
      if (tableData.status === 'playing') {
        const { data: activeGame } = await supabase
          .from('games')
          .select('id')
          .eq('table_id', tableId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (activeGame) {
          onGameStart(activeGame.id);
          return;
        }
      }
    }

    const { data: players } = await supabase
      .from('table_players')
      .select('user_id, seat')
      .eq('table_id', tableId);

    if (players) {
      const userIds = players.map((p) => p.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', userIds);

      const profMap: Record<string, string> = {};
      (profiles || []).forEach((p) => {
        profMap[p.id] = p.display_name;
      });

      const seatMap: Record<Seat, SeatAssignment | null> = { N: null, E: null, S: null, W: null };
      players.forEach((p) => {
        seatMap[p.seat as Seat] = {
          user_id: p.user_id,
          seat: p.seat as Seat,
          display_name: profMap[p.user_id] ?? 'Unknown',
        };
      });
      setSeats(seatMap);
    }
  }, [tableId, onGameStart]);

  // Load all profiles for the dropdown
  useEffect(() => {
    (async () => {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name')
        .order('display_name', { ascending: true });

      if (profiles) {
        setAllProfiles(profiles as ProfileOption[]);
      }
    })();
  }, []);

  useEffect(() => {
    loadState();

    const channel = supabase.channel(`table-setup-${tableId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'table_players',
        filter: `table_id=eq.${tableId}`,
      }, () => loadState())
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tables',
        filter: `id=eq.${tableId}`,
      }, () => loadState())
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'games',
        filter: `table_id=eq.${tableId}`,
      }, () => loadState())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tableId, loadState]);

  const assignSeat = async (seat: Seat, userId: string | null) => {
    if (!isHost) return;
    setBusy(true);

    if (userId === null) {
      await supabase
        .from('table_players')
        .delete()
        .eq('table_id', tableId)
        .eq('seat', seat);
    } else {
      await supabase
        .from('table_players')
        .delete()
        .eq('table_id', tableId)
        .eq('user_id', userId);

      if (seats[seat] && seats[seat]!.user_id !== userId) {
        await supabase
          .from('table_players')
          .delete()
          .eq('table_id', tableId)
          .eq('seat', seat);
      }

      await supabase
        .from('table_players')
        .insert({ table_id: tableId, user_id: userId, seat });
    }

    setBusy(false);
    loadState();
  };

  const allSeatsFilled = SEATS.every((s) => seats[s] !== null);
  const mySeat = SEATS.find((s) => seats[s]?.user_id === profile?.id);

  const handleStartTable = async () => {
    if (!allSeatsFilled || !isHost || busy) return;
    setBusy(true);
    setActionError(null);

    const { data: game, error: gameError } = await supabase
      .from('games')
      .insert({
        table_id: tableId,
        status: 'active',
        hand_number: 1,
        rubber_number: 1,
      })
      .select('id')
      .maybeSingle();

    if (gameError || !game) {
      setActionError(gameError?.message ?? 'The table could not be started. Please try again.');
      setBusy(false);
      return;
    }

    const { error: tableError } = await supabase
      .from('tables')
      .update({ status: 'playing', rubber_number: 1 })
      .eq('id', tableId);

    if (tableError) {
      setActionError(tableError.message);
      setBusy(false);
      return;
    }

    onGameStart(game.id);
    setBusy(false);
  };

  const seatColors: Record<Seat, string> = {
    N: 'border-emerald-500/40 bg-emerald-950/30',
    S: 'border-emerald-500/40 bg-emerald-950/30',
    E: 'border-blue-500/40 bg-blue-950/30',
    W: 'border-blue-500/40 bg-blue-950/30',
  };

  const getDropdownOptions = (currentSeat: Seat): ProfileOption[] => {
    const seatedElsewhere = new Set<string>();
    SEATS.forEach((s) => {
      if (s !== currentSeat && seats[s]) {
        seatedElsewhere.add(seats[s]!.user_id);
      }
    });
    return allProfiles.filter((p) => !seatedElsewhere.has(p.id));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900">
      <div className="max-w-2xl mx-auto p-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Lobby
        </button>

        <div className="flex items-center gap-3 mb-6">
          <Compass className="w-6 h-6 text-emerald-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">{tableName}</h1>
            <p className="text-sm text-slate-400">
              {isHost
                ? 'Assign players to each seat, then start the table'
                : `Waiting for ${hostName} to assign seats and start the table...`}
            </p>
          </div>
        </div>

        <div className="bg-slate-900/50 rounded-2xl border border-slate-700/50 p-8">
          {actionError && (
            <div className="mb-5 rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              {actionError}
            </div>
          )}
          <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
            {/* North */}
            <div className="col-span-3">
              <SeatSlot
                seat="N"
                assignment={seats.N}
                isHost={isHost}
                options={getDropdownOptions('N')}
                onAssign={(uid) => assignSeat('N', uid)}
                colorClass={seatColors.N}
                teamLabel="NS"
                busy={busy}
                myUserId={profile?.id ?? ''}
              />
            </div>

            {/* West */}
            <div>
              <SeatSlot
                seat="W"
                assignment={seats.W}
                isHost={isHost}
                options={getDropdownOptions('W')}
                onAssign={(uid) => assignSeat('W', uid)}
                colorClass={seatColors.W}
                teamLabel="EW"
                busy={busy}
                myUserId={profile?.id ?? ''}
              />
            </div>

            {/* Center table */}
            <div className="flex flex-col items-center justify-center">
              <div className="text-center">
                <div className="text-4xl mb-1">{SUIT_SYMBOLS.S} {SUIT_SYMBOLS.H}</div>
                <div className="text-4xl mb-2">{SUIT_SYMBOLS.D} {SUIT_SYMBOLS.C}</div>
                <p className="text-xs text-slate-500">Bridge Table</p>
              </div>
            </div>

            {/* East */}
            <div>
              <SeatSlot
                seat="E"
                assignment={seats.E}
                isHost={isHost}
                options={getDropdownOptions('E')}
                onAssign={(uid) => assignSeat('E', uid)}
                colorClass={seatColors.E}
                teamLabel="EW"
                busy={busy}
                myUserId={profile?.id ?? ''}
              />
            </div>

            {/* South */}
            <div className="col-span-3">
              <SeatSlot
                seat="S"
                assignment={seats.S}
                isHost={isHost}
                options={getDropdownOptions('S')}
                onAssign={(uid) => assignSeat('S', uid)}
                colorClass={seatColors.S}
                teamLabel="NS"
                busy={busy}
                myUserId={profile?.id ?? ''}
              />
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between">
            <div className="text-sm text-slate-400">
              {allSeatsFilled ? (
                <span className="text-emerald-400">All seats filled! Ready to start.</span>
              ) : (
                <span>{SEATS.filter((s) => seats[s]).length}/4 seats assigned</span>
              )}
            </div>
            {mySeat && (
              <span className="text-sm text-slate-400">
                You are seated at <span className="text-emerald-400 font-medium">{mySeat}</span>
              </span>
            )}
          </div>

          {isHost ? (
            <button
              onClick={handleStartTable}
              disabled={!allSeatsFilled || busy || tableStatus === 'playing'}
              className="w-full mt-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
            >
              {tableStatus === 'playing' ? (
                <>
                  <Lock className="w-4 h-4" />
                  Table Locked — Game In Progress
                </>
              ) : (
                'Start Table'
              )}
            </button>
          ) : (
            <div className="w-full mt-6 py-3 bg-slate-800/50 text-slate-400 font-medium rounded-xl text-center">
              Waiting for {hostName} to start the table...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface SeatSlotProps {
  seat: Seat;
  assignment: SeatAssignment | null;
  isHost: boolean;
  options: ProfileOption[];
  onAssign: (userId: string | null) => void;
  colorClass: string;
  teamLabel: string;
  busy: boolean;
  myUserId: string;
}

function SeatSlot({
  seat,
  assignment,
  isHost,
  options,
  onAssign,
  colorClass,
  teamLabel,
  busy,
  myUserId,
}: SeatSlotProps) {
  const isMe = assignment?.user_id === myUserId;

  return (
    <div className={`w-full p-4 rounded-xl border-2 transition-all ${colorClass}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-slate-400">{seat} ({teamLabel})</span>
        {isMe && <span className="text-xs text-emerald-400 font-medium">You</span>}
      </div>

      {isHost ? (
        <div className="flex min-w-0 items-center gap-2">
          <select
            value={assignment?.user_id ?? ''}
            onChange={(e) => onAssign(e.target.value || null)}
            disabled={busy}
            className="min-w-0 w-full flex-1 px-3 py-2 bg-slate-900/70 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:opacity-50"
          >
            <option value="">— Empty —</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
            {assignment && !options.find((o) => o.id === assignment.user_id) && (
              <option value={assignment.user_id}>{assignment.display_name}</option>
            )}
          </select>
          {assignment && (
            <button
              onClick={() => onAssign(null)}
              disabled={busy}
              className="p-1.5 text-slate-500 hover:text-red-400 transition-colors rounded"
              title="Remove from seat"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      ) : (
        <div className="text-center py-2">
          {assignment ? (
            <span className="text-white font-medium flex items-center justify-center gap-1.5">
              {assignment.display_name}
            </span>
          ) : (
            <span className="text-slate-500 text-sm">Empty</span>
          )}
        </div>
      )}
    </div>
  );
}
