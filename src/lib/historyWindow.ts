export function historyWindowUrl(base: string, tableId?: string, gameId?: string) {
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  url.searchParams.set('view', 'history');
  if (tableId) url.searchParams.set('tableId', tableId);
  if (tableId && gameId) url.searchParams.set('gameId', gameId);
  return url.toString();
}

export function openHistoryWindow(tableId?: string, gameId?: string) {
  const popup = window.open(
    historyWindowUrl(window.location.href, tableId, gameId),
    `bridge-history-${gameId ?? tableId ?? 'all'}`,
    'popup=yes,width=1280,height=900,resizable=yes,scrollbars=yes',
  );
  if (popup) {
    popup.opener = null;
    popup.focus();
  } else {
    window.alert('Please allow pop-up windows for this site to open history. Your game will stay open here.');
  }
}

export function doubleDummyWindowUrl(base: string, handId: string) {
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  url.searchParams.set('view', 'double-dummy');
  url.searchParams.set('handId', handId);
  return url.toString();
}

export function openDoubleDummyWindow(handId: string) {
  const popup = window.open(doubleDummyWindowUrl(window.location.href, handId),
    `bridge-double-dummy-${handId}`, 'popup=yes,width=1100,height=900,resizable=yes,scrollbars=yes');
  if (popup) { popup.opener = null; popup.focus(); }
  else window.alert('Please allow pop-up windows for this site to open double-dummy analysis. Your game will stay open here.');
}
