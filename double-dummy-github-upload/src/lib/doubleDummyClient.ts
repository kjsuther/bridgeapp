import { analysisKey } from './ddsPosition';
import type { AnalysisPosition, PositionAnalysis } from './ddsPosition';
import type { AnalysisRequest, AnalysisResponse } from './doubleDummy.worker';

export interface AnalysisWorker {
  onmessage: ((event: MessageEvent<AnalysisResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: AnalysisRequest): void;
  terminate(): void;
}

interface Subscriber { done: (result: PositionAnalysis) => void; failed: (message: string) => void }
interface Job { id: number; key: string; position: AnalysisPosition; subscribers: Set<Subscriber> }

/** One background worker per comparison panel. Drop obsolete queued positions. */
export class DoubleDummyClient {
  private worker: AnalysisWorker | null = null;
  private active: Job | null = null;
  private pending: Job[] = [];
  private cache = new Map<string, PositionAnalysis>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private nextId = 0;
  private disposed = false;

  constructor(private factory: () => AnalysisWorker = () => new Worker(
    new URL('./doubleDummy.worker.ts', import.meta.url), { type: 'module' },
  )) {}

  peek(position: AnalysisPosition): PositionAnalysis | undefined {
    return this.cache.get(analysisKey(position));
  }

  request(position: AnalysisPosition, done: Subscriber['done'], failed: Subscriber['failed']): () => void {
    if (this.disposed) return () => {};
    const key = analysisKey(position);
    const cached = this.cache.get(key);
    if (cached) { done(cached); return () => {}; }
    const subscriber = { done, failed };
    let job = this.active?.key === key ? this.active : this.pending.find(candidate => candidate.key === key);
    if (!job) {
      job = { id: ++this.nextId, key, position, subscribers: new Set() };
      this.pending.push(job);
    }
    job.subscribers.add(subscriber);
    this.pump();
    return () => {
      job.subscribers.delete(subscriber);
      this.pending = this.pending.filter(candidate => candidate.subscribers.size > 0);
    };
  }

  private pump(): void {
    if (this.disposed || this.active) return;
    const job = this.pending.shift();
    if (!job) return;
    this.active = job;
    try {
      if (!this.worker) {
        this.worker = this.factory();
        this.worker.onmessage = event => this.complete(event.data);
        this.worker.onerror = () => this.fail('Could not load the analysis engine. Please retry.');
      }
      // Bound pathological deals and recover the worker without blocking navigation.
      this.timer = setTimeout(() => this.fail('Analysis timed out. Please retry.'), 20000);
      this.worker.postMessage({ id: job.id, position: job.position });
    } catch {
      this.fail('Could not start the analysis engine. Please retry.');
    }
  }

  private complete(response: AnalysisResponse): void {
    const job = this.active;
    if (!job || response.id !== job.id) return;
    clearTimeout(this.timer);
    this.active = null;
    if ('result' in response) {
      this.cache.set(job.key, response.result);
      if (this.cache.size > 128) this.cache.delete(this.cache.keys().next().value!);
      for (const subscriber of job.subscribers) subscriber.done(response.result);
    } else {
      this.worker?.terminate();
      this.worker = null;
      for (const subscriber of job.subscribers) subscriber.failed(response.error);
    }
    this.pump();
  }

  private fail(message: string): void {
    clearTimeout(this.timer);
    this.worker?.terminate();
    this.worker = null;
    const job = this.active;
    this.active = null;
    if (job) for (const subscriber of job.subscribers) subscriber.failed(message);
    this.pump();
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.timer);
    this.worker?.terminate();
    this.worker = null;
    this.active = null;
    this.pending = [];
    this.cache.clear();
  }
}
