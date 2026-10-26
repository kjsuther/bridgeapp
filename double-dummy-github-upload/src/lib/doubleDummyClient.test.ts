import { afterEach, describe, expect, it, vi } from 'vitest';
import { DoubleDummyClient } from './doubleDummyClient';
import type { AnalysisWorker } from './doubleDummyClient';
import type { AnalysisRequest, AnalysisResponse } from './doubleDummy.worker';
import type { AnalysisPosition, PositionAnalysis } from './ddsPosition';
import { createDeck } from './dealing';
import { SEATS } from '@/types/bridge';
import type { Deal } from '@/types/bridge';

class FakeWorker implements AnalysisWorker {
  onmessage: AnalysisWorker['onmessage'] = null;
  onerror: AnalysisWorker['onerror'] = null;
  sent: AnalysisRequest[] = [];
  terminate = vi.fn();
  postMessage(message: AnalysisRequest) { this.sent.push(message); }
  reply(response: AnalysisResponse) { this.onmessage?.({ data: response } as MessageEvent<AnalysisResponse>); }
}
const deck = createDeck();
const deal = Object.fromEntries(SEATS.map((seat, index) => [seat, deck.slice(index * 13, index * 13 + 13)])) as unknown as Deal;
const position: AnalysisPosition = { deal, trump: 'H', declarer: 'N', openingLeader: 'E', playedCards: [] };
const result: PositionAnalysis = { totalTricks: 9, tricksWonSoFar: 0, nextPlayer: 'E', cardTotals: { AH: 9 } };
afterEach(() => { vi.useRealTimers(); });

describe('background double-dummy queue', () => {
  it('deduplicates a position and serves repeat visits from cache', () => {
    const worker = new FakeWorker();
    const client = new DoubleDummyClient(() => worker);
    const a = vi.fn(); const b = vi.fn(); const failed = vi.fn();
    client.request(position, a, failed);
    client.request(position, b, failed);
    expect(worker.sent).toHaveLength(1);
    worker.reply({ id: worker.sent[0].id, result });
    expect(a).toHaveBeenCalledWith(result);
    expect(b).toHaveBeenCalledWith(result);
    client.request(position, b, failed);
    expect(worker.sent).toHaveLength(1);
    expect(b).toHaveBeenCalledTimes(2);
    client.dispose();
  });

  it('discards cancelled queued work and prevents stale results from updating the view', () => {
    const worker = new FakeWorker();
    const client = new DoubleDummyClient(() => worker);
    const stale = vi.fn(); const latest = vi.fn(); const failed = vi.fn();
    const cancelActive = client.request(position, stale, failed);
    const cancelQueued = client.request({ ...position, declarer: 'E' }, stale, failed);
    cancelActive(); cancelQueued();
    client.request({ ...position, declarer: 'S' }, latest, failed);
    worker.reply({ id: worker.sent[0].id, result });
    expect(worker.sent).toHaveLength(2);
    expect(worker.sent[1].position.declarer).toBe('S');
    expect(stale).not.toHaveBeenCalled();
    worker.reply({ id: worker.sent[0].id, result }); // A late message must not match the next request.
    expect(latest).not.toHaveBeenCalled();
    worker.reply({ id: worker.sent[1].id, result });
    expect(latest).toHaveBeenCalledOnce();
    client.dispose();
  });

  it('times out stalled work, then retries using a fresh worker', () => {
    vi.useFakeTimers();
    const first = new FakeWorker(); const second = new FakeWorker();
    const factory = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const client = new DoubleDummyClient(factory);
    const done = vi.fn(); const failed = vi.fn();
    client.request(position, done, failed);
    vi.advanceTimersByTime(20000);
    expect(failed).toHaveBeenCalledWith('Analysis timed out. Please retry.');
    expect(first.terminate).toHaveBeenCalledOnce();
    client.request(position, done, failed);
    second.reply({ id: second.sent[0].id, result });
    expect(done).toHaveBeenCalledWith(result);
    client.dispose();
  });

  it('isolates cached results across deals and releases resources on exit', () => {
    const worker = new FakeWorker();
    const client = new DoubleDummyClient(() => worker);
    const done = vi.fn(); const failed = vi.fn();
    client.request(position, done, failed);
    worker.reply({ id: worker.sent[0].id, result });
    const other = { ...position, deal: { ...deal, N: deal.S, S: deal.N } };
    expect(client.peek(other)).toBeUndefined();
    client.request(other, done, failed);
    expect(worker.sent).toHaveLength(2);
    client.dispose();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('reports engine errors without caching fake results and can retry', () => {
    const first = new FakeWorker(); const second = new FakeWorker();
    const factory = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const client = new DoubleDummyClient(factory);
    const done = vi.fn(); const failed = vi.fn();
    client.request(position, done, failed);
    first.reply({ id: first.sent[0].id, error: 'Engine failed.' });
    expect(failed).toHaveBeenCalledWith('Engine failed.');
    expect(client.peek(position)).toBeUndefined();
    expect(first.terminate).toHaveBeenCalledOnce();
    client.request(position, done, failed);
    second.reply({ id: second.sent[0].id, result });
    expect(done).toHaveBeenCalledWith(result);
    client.dispose();
  });
});
