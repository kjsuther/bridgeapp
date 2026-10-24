import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { unlockAudio } from '@/lib/sound';
import { AuthScreen } from '@/components/AuthScreen';
import { Lobby } from '@/components/Lobby';
import { TableSetup } from '@/components/TableSetup';
import { GameTable } from '@/components/GameTable';
import { GameProvider } from '@/context/GameContext';
import { History } from '@/components/History';
import { AdminDashboard } from '@/components/AdminDashboard';

type View =
  | { type: 'lobby' }
  | { type: 'table-setup'; tableId: string }
  | { type: 'game'; tableId: string; gameId: string }
  | { type: 'history' }
  | { type: 'table-history'; tableId: string; gameId?: string; returnToGame?: boolean }
  | { type: 'admin' };

function AppContent() {
  const { user, loading } = useAuth();
  const [view, setView] = useState<View>({ type: 'lobby' });

  useEffect(() => {
    const handler = () => unlockAudio();
    window.addEventListener('click', handler, { once: true });
    window.addEventListener('keydown', handler, { once: true });
    return () => {
      window.removeEventListener('click', handler);
      window.removeEventListener('keydown', handler);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  if (view.type === 'lobby') {
    return (
      <Lobby
        onJoinTable={(tableId) => setView({ type: 'table-setup', tableId })}
        onShowHistory={() => setView({ type: 'history' })}
        onShowAdmin={() => setView({ type: 'admin' })}
      />
    );
  }

  if (view.type === 'table-setup') {
    return (
      <TableSetup
        tableId={view.tableId}
        onGameStart={(gameId) => setView({ type: 'game', tableId: view.tableId, gameId })}
        onBack={() => setView({ type: 'lobby' })}
      />
    );
  }

  if (view.type === 'game') {
    return (
      <GameProvider tableId={view.tableId} gameId={view.gameId}>
        <GameTable
          tableId={view.tableId}
          onLeave={() => setView({ type: 'lobby' })}
          onShowHistory={() => setView({ type: 'table-history', tableId: view.tableId, gameId: view.gameId, returnToGame: true })}
        />
      </GameProvider>
    );
  }

  if (view.type === 'history') {
    return <History onBack={() => setView({ type: 'lobby' })} />;
  }

  if (view.type === 'table-history') {
    const backTarget = view.returnToGame
      ? () => setView({ type: 'game', tableId: view.tableId, gameId: view.gameId! })
      : () => setView({ type: 'lobby' });
    return (
      <History
        onBack={backTarget}
        tableId={view.tableId}
        gameId={view.gameId}
      />
    );
  }

  if (view.type === 'admin') {
    return <AdminDashboard onBack={() => setView({ type: 'lobby' })} />;
  }

  return null;
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
