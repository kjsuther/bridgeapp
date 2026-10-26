import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLiveRefresh } from './liveRefresh';

describe('player information refresh recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('reads saved names on initial subscription and reconnection', async () => {
    let savedName = 'Old name';
    let shownName = savedName;
    const live = createLiveRefresh(async () => { shownName = savedName; });
    savedName = 'New name';
    live.onStatus('SUBSCRIBED');
    await Promise.resolve();
    expect(shownName).toBe('New name');
    savedName = 'Changed while disconnected';
    live.onStatus('CHANNEL_ERROR');
    live.onStatus('SUBSCRIBED');
    await Promise.resolve();
    expect(shownName).toBe(savedName);
    live.dispose();
  });

  it('re-reads an edit arriving during an older query without overlapping queries', async () => {
    let finish!: () => void;
    const load = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }))
      .mockResolvedValue(undefined);
    const live = createLiveRefresh(load);
    const first = live.refresh();
    await live.refresh();
    await live.refresh();
    expect(load).toHaveBeenCalledTimes(1);
    finish();
    await first;
    expect(load).toHaveBeenCalledTimes(2);
    live.dispose();
  });

  it('recovers missed events on focus and periodically, and stops on unmount', async () => {
    const load = vi.fn().mockResolvedValue(undefined);
    const live = createLiveRefresh(load);
    await vi.advanceTimersByTimeAsync(15000);
    expect(load).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(2);
    live.dispose();
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(30000);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('recovers after a failed query and skips polling hidden tabs', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const live = createLiveRefresh(load);
    await live.refresh();
    Object.assign(document, { visibilityState: 'hidden' });
    await vi.advanceTimersByTimeAsync(15000);
    expect(load).toHaveBeenCalledTimes(1);
    Object.assign(document, { visibilityState: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(2);
    live.dispose();
    vi.restoreAllMocks();
  });
});
