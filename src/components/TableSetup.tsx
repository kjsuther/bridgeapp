import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { createLiveRefresh } from '@/lib/liveRefresh';
import { assignSeatByEmail } from '@/lib/seatAssignment';
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
  email: string | null;
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
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [newHandsBeforeReplay, setNewHandsBeforeReplay] = useState(10);

  const isHost = hostId === profile?.id;

  const loadState = useCallback(async () => {
    const { data: tableData } = await supabase
      .from('tables')
      .select('name, status, host_id, new_hands_before_replay')
      .eq('id', tableId)
      .maybeSingle();

    if (tableData) {
      setTableName(tableData.name);
      setTableStatus(tableData.status);
      setHostId(tableData.host_id);
      setNewHandsBeforeReplay(tableData.new_hands_before_replay ?? 10);

      // Get host display name
      const { data: hostProfile } = await supabase
        .from('profiles')
        .select('display_name, email')
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
        .select('id, display_name, email')
        .in('id', userIds);

      const profMap: Record<string, { display_name: string; email: string | null }> = {};
      (profiles || []).forEach((p) => {
        profMap[p.id] = { display_name: p.display_name, email: p.email };
      });

      const seatMap: Record<Seat, SeatAssignment | null> = { N: null, E: null, S: null, W: null };
      players.forEach((p) => {
        seatMap[p.seat as Seat] = {
          user_id: p.user_id,
          seat: p.seat as Seat,
          display_name: profMap[p.user_id]?.display_name ?? 'Unknown',
          email: profMap[p.user_id]?.email ?? null,
        };
      });
      setSeats(seatMap);
    }
  }, [tableId, onGameStart]);

  useEffect(() => {
    const live = createLiveRefresh(loadState);
    void live.refresh();

    const channel = supabase.channel(`table-setup-${tableId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'table_players',
        filter: `table_id=eq.${tableId}`,
      }, live.refresh)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tables',
        filter: `id=eq.${tableId}`,
      }, live.refresh)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'games',
        filter: `table_id=eq.${tableId}`,
      }, live.refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, live.refresh)
      .subscribe(live.onStatus);

    return () => {
      live.dispose();
      supabase.removeChannel(channel);
    };
  }, [tableId, loadState]);

  const assignSeat = async (seat: Seat, email: string | null) => {
    if (!isHost || busy || tableStatus === 'playing') return;
    setBusy(true);
    setActionError(null);
    try {
      if (email === null) {
        const { error } = await supabase.from('table_players').delete()
          .eq('table_id', tableId).eq('seat', seat);
        if (error) throw new Error('Could not remove this player. Please try again.');
      } else {
        await assignSeatByEmail(tableId, seat, email);
      }
      await loadState();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not update this seat. Please try again.');
    } finally {
      setBusy(false);
    }
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900">
      <div className="max-w-4xl mx-auto p-6">
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
                ? 'Enter the account email for each seat, including your own, then start the table'
                : `Waiting for ${hostName} to assign seats and start the table...`}
            </p>
          </div>
        </div>

        <div className="bg-slate-900/50 rounded-2xl border border-slate-700/50 p-8">
          {actionError && (
            <div role="alert" className="mb-5 rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              {actionError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
            {/* North */}
            <div className="sm:col-span-3">
              <SeatSlot
                seat="N"
                assignment={seats.N}
                isHost={isHost}
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
                onAssign={(uid) => assignSeat('W', uid)}
                colorClass={seatColors.W}
                teamLabel="EW"
                busy={busy}
                myUserId={profile?.id ?? ''}
              />
            </div>

            {/* Center table */}
            <div className="hidden sm:flex flex-col items-center justify-center text-slate-200">
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
                onAssign={(uid) => assignSeat('E', uid)}
                colorClass={seatColors.E}
                teamLabel="EW"
                busy={busy}
                myUserId={profile?.id ?? ''}
              />
            </div>

            {/* South */}
            <div className="sm:col-span-3">
              <SeatSlot
                seat="S"
                assignment={seats.S}
                isHost={isHost}
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

          {isHost && tableStatus !== 'playing' && (
            <div className="mt-4 flex items-center gap-3 bg-slate-900/40 rounded-lg border border-slate-700/30 px-4 py-3">
              <label htmlFor="newHandsInput" className="text-sm text-slate-300 whitespace-nowrap">
                New hands before replays:
              </label>
              <select
                id="newHandsInput"
                value={newHandsBeforeReplay}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v)) {
                    setNewHandsBeforeReplay(v);
                    supabase
                      .from('tables')
                      .update({ new_hands_before_replay: v })
                      .eq('id', tableId)
                      .then(() => loadState());
                  }
                }}
                className="w-24 px-3 py-1.5 bg-slate-900/70 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                {[4, 8, 12, 16, 20, 24, 28, 32].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <span className="text-xs text-slate-500">
                Must be a multiple of 4 so dealer and vulnerability cycle in sync with replays. After this many new hands, the match alternates between replaying old deals (with seats swapped) and new ones.
              </span>
            </div>
          )}

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
  onAssign: (email: string | null) => void;
  colorClass: string;
  teamLabel: string;
  busy: boolean;
  myUserId: string;
}

function SeatSlot({
  seat,
  assignment,
  isHost,
  onAssign,
  colorClass,
  teamLabel,
  busy,
  myUserId,
}: SeatSlotProps) {
  const isMe = assignment?.user_id === myUserId;
  const [email, setEmail] = useState('');

  return (
    <div className={`w-full p-4 rounded-xl border-2 transition-all ${colorClass}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-slate-400">{seat} ({teamLabel})</span>
        {isMe && <span className="text-xs text-emerald-400 font-medium">You</span>}
      </div>

      {isHost ? (
        assignment ? <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white break-words">{assignment.display_name}</p>
            <p className="text-xs text-slate-400 break-all">{assignment.email}</p>
          </div>
          <button onClick={() => onAssign(null)} disabled={busy}
            className="p-1.5 text-slate-400 hover:text-red-400 disabled:opacity-50"
            aria-label={`Remove player from ${seat}`}><X className="w-4 h-4" /></button>
        </div> : <form className="flex min-w-0 flex-col gap-2" onSubmit={event => {
          event.preventDefault();
          onAssign(email);
        }}>
          <label htmlFor={`seat-email-${seat}`} className="text-xs text-slate-300">Player email</label>
          <input id={`seat-email-${seat}`} type="email" required value={email}
            onChange={event => setEmail(event.target.value)} disabled={busy}
            placeholder="name@example.com" autoCapitalize="none" spellCheck={false}
            className="min-w-0 w-full px-2 py-2 bg-slate-900/70 border border-slate-700 rounded-lg text-white text-sm disabled:opacity-50" />
          <button type="submit" disabled={busy || !email.trim()}
            className="rounded-lg bg-emerald-700 px-2 py-2 text-sm text-white disabled:opacity-40">Assign seat</button>
        </form>
      ) : (
        <div className="text-center py-2">
          {assignment ? (
            <span className="text-white font-medium flex items-center justify-center gap-1.5">
              <span>{assignment.display_name}</span>
              {assignment.email && <span className="text-xs font-normal text-slate-400">{assignment.email}</span>}
            </span>
          ) : (
            <span className="text-slate-500 text-sm">Empty</span>
          )}
        </div>
      )}
    </div>
  );
}
