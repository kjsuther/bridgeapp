// Keep one read in flight and remember events arriving during that read.
// The periodic read also recovers changes missed during a socket interruption.
export function createLiveRefresh(load: () => Promise<void>, pollMs = 15000) {
  let disposed = false;
  let running = false;
  let pending = false;

  const refresh = async () => {
    if (disposed) return;
    pending = true;
    if (running) return;
    running = true;
    try {
      while (pending && !disposed) {
        pending = false;
        try {
          await load();
        } catch (error) {
          console.warn('Could not refresh player information', error);
        }
      }
    } finally {
      running = false;
    }
  };
  const wake = () => {
    if (document.visibilityState !== 'hidden') void refresh();
  };
  const timer = setInterval(wake, pollMs);
  window.addEventListener('focus', wake);
  document.addEventListener('visibilitychange', wake);

  return {
    refresh,
    onStatus(status: string) {
      // Fetch after joining as well as reconnecting to close the initial
      // SELECT/subscribe gap.
      if (status === 'SUBSCRIBED') void refresh();
    },
    dispose() {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
    },
  };
}
