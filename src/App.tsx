import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { unlockAudio } from '@/lib/sound';
import { AuthScreen } from '@/components/AuthScreen';
import { Lobby } from '@/components/Lobby';
import { TableSetup } from '@/components/TableSetup';
import { GameTable } from '@/components/GameTable';
import { GameProvider } from '@/context/GameContext';
import { History } from '@/components/History';

type View =
  | { type: 'lobby' }
  | { type: 'table-setup'; tableId: string }
  | { type: 'game'; tableId: string; gameId: string }
  | { type: 'history' };

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
        />
      </GameProvider>
    );
  }

  if (view.type === 'history') {
    return <History onBack={() => setView({ type: 'lobby' })} />;
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
