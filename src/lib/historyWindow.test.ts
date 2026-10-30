import { afterEach, expect, it, vi } from 'vitest';
import { historyWindowUrl, openHistoryWindow, doubleDummyWindowUrl, openDoubleDummyWindow } from './historyWindow';

afterEach(() => vi.unstubAllGlobals());
it('creates a standalone history URL with the table and game, excluding unrelated query parameters', () => {
  const url = new URL(historyWindowUrl('https://bridge.example/?other=value#old', 'table1', 'game1'));
  expect(url.origin).toBe('https://bridge.example');
  expect([...url.searchParams]).toEqual([['view', 'history'], ['tableId', 'table1'], ['gameId', 'game1']]);
  expect(url.hash).toBe('');
  expect(new URL(historyWindowUrl(url.toString())).searchParams.get('tableId')).toBeNull();
});
it('opens history in a separate window without navigating the game', () => {
  const popup = { opener: {}, focus: vi.fn() };
  const open = vi.fn(() => popup);
  const location = { href: 'https://bridge.example/' };
  vi.stubGlobal('window', { open, location });
  openHistoryWindow('table1', 'game1');
  expect(open).toHaveBeenCalledWith('https://bridge.example/?view=history&tableId=table1&gameId=game1', 'bridge-history-game1', expect.stringContaining('popup=yes'));
  expect(popup.opener).toBeNull();
  expect(popup.focus).toHaveBeenCalledOnce();
  expect(location.href).toBe('https://bridge.example/');
});
it('reports a blocked popup without replacing the game', () => {
  const alert = vi.fn();
  const location = { href: 'https://bridge.example/' };
  vi.stubGlobal('window', { open: () => null, location, alert });
  openHistoryWindow();
  expect(alert).toHaveBeenCalledOnce();
  expect(location.href).toBe('https://bridge.example/');
});

it('opens double-dummy analysis for a fixed completed hand without navigating the game', () => {
  const popup = {opener: {}, focus: vi.fn()};
  const open = vi.fn(() => popup);
  const location = {href: 'https://bridge.example/?view=history&gameId=new-game'};
  vi.stubGlobal('window', {open, location});
  openDoubleDummyWindow('previous-hand');
  expect(open).toHaveBeenCalledWith('https://bridge.example/?view=double-dummy&handId=previous-hand', 'bridge-double-dummy-previous-hand', expect.stringContaining('popup=yes'));
  expect(popup.opener).toBeNull();
  expect(new URL(doubleDummyWindowUrl(location.href, 'previous-hand')).searchParams.has('gameId')).toBe(false);
  expect(location.href).toContain('new-game');
});
