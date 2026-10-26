import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mount just the hook lifecycle. Media devices, peer connections and Realtime
// are simulated; this checks signaling orchestration, not real network/video.
const harness = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  states: [] as unknown[],
  channel: vi.fn(),
  removeChannel: vi.fn(),
}));
vi.mock('react', () => ({
  useRef: (value: unknown) => ({ current: value }),
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => void | (() => void)) => { harness.effects.push(fn); },
  useState: (initial: unknown) => {
    const slot = harness.states.length;
    harness.states.push(initial);
    return [initial, (value: unknown) => {
      harness.states[slot] = typeof value === 'function' ? value(harness.states[slot]) : value;
    }];
  },
}));
vi.mock('@/lib/supabase', () => ({ supabase: {
  channel: harness.channel, removeChannel: harness.removeChannel,
} }));
import { useWebRTC } from './useWebRTC';

class Track {
  enabled = true;
  stopped = false;
  contentHint = '';
  constructor(public kind: string, public id: string) {}
  stop() { this.stopped = true; }
}
class Stream {
  constructor(public tracks: Track[] = []) {}
  getTracks() { return this.tracks; }
  getVideoTracks() { return this.tracks.filter(t => t.kind === 'video'); }
  getAudioTracks() { return this.tracks.filter(t => t.kind === 'audio'); }
  addTrack(track: Track) { this.tracks.push(track); }
}
type Signal = { kind: string; target: string; from: string; data: RTCSessionDescriptionInit };
let channels: Channel[];
let pcs: Peer[];
let signals: Signal[];
let cleanups: Array<() => void>;
let streamQueue: Array<Stream | Promise<Stream>>;

class Channel {
  handlers: Array<{ type: string; event: string; fn: (payload: never) => unknown }> = [];
  session: { sessionId: string } | null = null;
  status!: (status: string) => unknown;
  removed = false;
  constructor(public user: string) { channels.push(this); }
  on(type: string, filter: { event: string }, fn: (payload: never) => unknown) {
    this.handlers.push({ type, event: filter.event, fn }); return this;
  }
  emit(type: string, event: string, payload: unknown = {}) {
    for (const handler of this.handlers) {
      if (handler.type === type && handler.event === event) handler.fn(payload as never);
    }
  }
  subscribe(fn: (status: string) => unknown) { this.status = fn; void fn('SUBSCRIBED'); return this; }
  async track(session: { sessionId: string }) { this.session = session; syncPresence(); }
  presenceState() {
    return Object.fromEntries(channels.filter(c => !c.removed && c.session).map(c => [c.user, [c.session]]));
  }
  async send(packet: { event: string; payload: Signal }) {
    // Intentionally drop every hello: discovery must not depend on its timing.
    if (packet.event !== 'signal') return 'ok';
    signals.push(packet.payload);
    for (const channel of channels) {
      if (!channel.removed && channel.user === packet.payload.target) {
        channel.emit('broadcast', 'signal', { payload: packet.payload });
      }
    }
    return 'ok';
  }
}
function syncPresence() {
  for (const channel of channels) if (!channel.removed) channel.emit('presence', 'sync');
}
class Peer {
  owner = '';
  signalingState = 'stable';
  connectionState = 'new';
  iceConnectionState = 'new';
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  senders: Track[] = [];
  onnegotiationneeded?: () => void;
  ontrack?: (event: { streams: Stream[]; track: Track }) => void;
  oniceconnectionstatechange?: () => void;
  onconnectionstatechange?: () => void;
  onicecandidate?: unknown;
  candidateBeforeDescription = false;
  restartIce = vi.fn();
  constructor() { pcs.push(this); }
  addTrack(track: Track) {
    this.senders.push(track);
    this.owner = track.id.split(':')[0];
    if (this.senders.length === 1) queueMicrotask(() => this.onnegotiationneeded?.());
  }
  async setLocalDescription() {
    await Promise.resolve();
    const type = this.signalingState === 'have-remote-offer' ? 'answer' : 'offer';
    this.localDescription = { type, sdp: this.owner };
    this.signalingState = type === 'offer' ? 'have-local-offer' : 'stable';
    if (type === 'answer') this.connectionState = 'connected';
  }
  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    await Promise.resolve();
    this.remoteDescription = description;
    this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable';
    if (description.type === 'answer') this.connectionState = 'connected';
    const remote = new Stream([new Track('audio', description.sdp + ':audio'), new Track('video', description.sdp + ':video')]);
    for (const track of remote.getTracks()) this.ontrack?.({ streams: [remote], track });
  }
  async addIceCandidate() {
    if (!this.remoteDescription) this.candidateBeforeDescription = true;
  }
  close() { this.connectionState = 'closed'; this.signalingState = 'closed'; }
}
async function settle() { for (let i = 0; i < 100; i++) await Promise.resolve(); }
function HookHarness(user: string, media: Stream | Promise<Stream> = new Stream([
  new Track('audio', user + ':audio'), new Track('video', user + ':video'),
])) {
  streamQueue.push(media);
  harness.effects = [];
  const stateOffset = harness.states.length;
  useWebRTC({ tableId: 'same-table', userId: user, enabled: true });
  const cleanup = harness.effects[0]() as () => void;
  cleanups.push(cleanup);
  return { cleanup, streams: () => harness.states[stateOffset + 1] as Map<string, Stream> };
}
beforeEach(() => {
  vi.useFakeTimers();
  channels = []; pcs = []; signals = []; cleanups = []; streamQueue = [];
  harness.states = [];
  harness.channel.mockImplementation((_name, options) => new Channel(options.config.presence.key));
  harness.removeChannel.mockImplementation(async (channel: Channel) => {
    channel.removed = true; syncPresence();
  });
  vi.stubGlobal('RTCPeerConnection', Peer);
  vi.stubGlobal('MediaStream', Stream);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(() => Promise.resolve(streamQueue.shift())) } });
});
afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks();
});

describe('four-player camera startup', () => {
  it.each([['a', 'b', 'c', 'd'], ['d', 'c', 'b', 'a'], ['b', 'd', 'a', 'c']])(
    'connects all six pairs when joining in order %s %s %s %s without hello broadcasts', async (...order) => {
      const clients = order.map(user => HookHarness(user));
      await settle();
      expect(pcs).toHaveLength(12);
      expect(signals.filter(s => s.kind === 'offer')).toHaveLength(6);
      expect(signals.filter(s => s.kind === 'answer')).toHaveLength(6);
      expect(pcs.every(pc => pc.connectionState === 'connected')).toBe(true);
      for (const client of clients) {
        expect(client.streams().size).toBe(3);
        expect([...client.streams().values()].every(s => s.getVideoTracks().length === 1)).toBe(true);
      }
    },
  );

  it('connects a fourth player joining later and replaces a refreshed player', async () => {
    const first = HookHarness('a'); HookHarness('b'); HookHarness('c');
    await settle();
    const fourth = HookHarness('d');
    await settle();
    expect(first.streams().size).toBe(3);
    fourth.cleanup();
    await settle();
    expect(first.streams().size).toBe(2);
    const replacement = HookHarness('d');
    await settle();
    expect(first.streams().size).toBe(3);
    expect(replacement.streams().size).toBe(3);
    expect(pcs.filter(pc => pc.connectionState !== 'closed')).toHaveLength(12);
  });

  it('queues an ICE candidate behind the offer it belongs to', async () => {
    HookHarness('b'); await settle();
    channels[0].emit('broadcast', 'signal', { payload: { kind: 'offer', target: 'b', from: 'a', data: { type: 'offer', sdp: 'a' } } });
    channels[0].emit('broadcast', 'signal', { payload: { kind: 'ice', target: 'b', from: 'a', data: { candidate: 'candidate' } } });
    await settle();
    expect(pcs[0].remoteDescription?.type).toBe('offer');
    expect(pcs[0].candidateBeforeDescription).toBe(false);
  });

  it('stops media resolving after unmount without joining or touching the next session', async () => {
    let finish!: (stream: Stream) => void;
    const old = new Stream([new Track('video', 'a:old')]);
    const stale = HookHarness('a', new Promise(resolve => { finish = resolve; }));
    stale.cleanup();
    HookHarness('b');
    await settle();
    finish(old); await settle();
    expect(old.getTracks()[0].stopped).toBe(true);
    expect(channels.map(c => c.user)).toEqual(['b']);
  });
});
