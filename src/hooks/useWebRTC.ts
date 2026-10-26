import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface PeerVideo {
  userId: string;
  stream: MediaStream | null;
  videoEl: HTMLVideoElement | null;
}

interface PeerEntry {
  userId: string;
  pc: RTCPeerConnection;
  stream: MediaStream | null;
  makingOffer: boolean;
  ignoreOffer: boolean;
  isSettingRemoteAnswerPending: boolean;
  polite: boolean;
  pendingCandidates: RTCIceCandidateInit[];
  remoteDescriptionSet: boolean;
  retryCount: number;
  signalQueue: Promise<void>;
}

interface UseWebRTCOptions {
  tableId: string;
  userId: string;
  enabled: boolean;
}

function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  ];

  const turnUrls = import.meta.env.VITE_TURN_URLS;
  const username = import.meta.env.VITE_TURN_USERNAME;
  const credential = import.meta.env.VITE_TURN_CREDENTIAL;
  if (turnUrls && username && credential) {
    servers.push({
      urls: turnUrls.split(',').map((url: string) => url.trim()).filter(Boolean),
      username,
      credential,
    });
  }

  return servers;
}

const SPEECH_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: { ideal: true },
  noiseSuppression: { ideal: true },
  autoGainControl: { ideal: true },
  channelCount: { ideal: 1 },
};

const MAX_RETRIES = 3;

export function useWebRTC({ tableId, userId, enabled }: UseWebRTCOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peerStreams, setPeerStreams] = useState<Map<string, MediaStream>>(new Map());
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [outputEnabled, setOutputEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');

  const peersRef = useRef<Map<string, PeerEntry>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const getLocalStream = useCallback(async (isCancelled: () => boolean) => {
    const accept = (stream: MediaStream) => {
      if (isCancelled()) {
        stream.getTracks().forEach(track => track.stop());
        return false;
      }
      localStreamRef.current = stream;
      setLocalStream(stream);
      setStatus('connected');
      return true;
    };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, frameRate: { ideal: 15, max: 20 } },
        audio: SPEECH_AUDIO_CONSTRAINTS,
      });
      accept(stream);
      return stream;
    } catch {
      if (isCancelled()) return new MediaStream();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: SPEECH_AUDIO_CONSTRAINTS,
        });
        accept(stream);
        return stream;
      } catch {
        const stream = new MediaStream();
        if (!accept(stream)) return stream;
        setVideoEnabled(false);
        setAudioEnabled(false);
        setError('Camera and microphone access denied. You can still watch and listen.');
        setStatus('connected');
        return stream;
      }
    }
  }, []);

  const flushPendingCandidates = useCallback((entry: PeerEntry) => {
    if (entry.remoteDescriptionSet && entry.pendingCandidates.length > 0) {
      const candidates = entry.pendingCandidates.splice(0);
      for (const candidate of candidates) {
        entry.pc.addIceCandidate(candidate).catch(() => {});
      }
    }
  }, []);

  const createPeer = useCallback((peerId: string): RTCPeerConnection => {
    const existing = peersRef.current.get(peerId);
    if (existing) return existing.pc;
    const pc = new RTCPeerConnection({ iceServers: getIceServers() });

    const entry: PeerEntry = {
      userId: peerId,
      pc,
      stream: null,
      makingOffer: false,
      ignoreOffer: false,
      isSettingRemoteAnswerPending: false,
      polite: peerId > userIdRef.current,
      pendingCandidates: [],
      remoteDescriptionSet: false,
      retryCount: 0,
      signalQueue: Promise.resolve(),
    };
    peersRef.current.set(peerId, entry);

    const local = localStreamRef.current;
    if (local) {
      local.getTracks().forEach((track) => {
        if (track.kind === 'audio') track.contentHint = 'speech';
        pc.addTrack(track, local);
      });
    }

    pc.ontrack = (event) => {
      if (peersRef.current.get(peerId) !== entry) return;
      const stream = event.streams[0] ?? entry.stream ?? new MediaStream();
      if (!stream.getTracks().some(track => track.id === event.track.id)) {
        stream.addTrack(event.track);
      }
      entry.stream = stream;
      setPeerStreams((prev) => {
        const next = new Map(prev);
        next.set(peerId, stream);
        return next;
      });
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        channelRef.current?.send({
          type: 'broadcast',
          event: 'signal',
          payload: { kind: 'ice', target: peerId, from: userIdRef.current, data: event.candidate },
        });
      }
    };

    const recover = () => {
      if (peersRef.current.get(peerId) !== entry) return;
      if (pc.connectionState === 'connected') entry.retryCount = 0;
      if (pc.connectionState === 'failed' || pc.iceConnectionState === 'failed') {
        // Only one side restarts, avoiding simultaneous restart offers.
        if (userIdRef.current < peerId && entry.retryCount < MAX_RETRIES) {
          entry.retryCount++;
          pc.restartIce();
        }
      }
    };
    pc.oniceconnectionstatechange = recover;
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') entry.retryCount = 0;
    };

    pc.onnegotiationneeded = () => {
      // One initial caller per pair prevents a burst of six competing offers
      // when four people arrive together. Keep perfect negotiation for retries.
      if (!pc.remoteDescription && userIdRef.current > peerId) return;
      entry.signalQueue = entry.signalQueue.then(async () => {
        if (peersRef.current.get(peerId) !== entry || pc.signalingState !== 'stable') return;
        try {
          entry.makingOffer = true;
          await pc.setLocalDescription();
          await channelRef.current?.send({
            type: 'broadcast', event: 'signal',
            payload: { kind: 'offer', target: peerId, from: userIdRef.current, data: pc.localDescription },
          });
        } catch (error) {
          console.warn('Video negotiation failed', error);
        } finally {
          entry.makingOffer = false;
        }
      });
    };

    return pc;
  }, []);

  const handleMessage = useCallback(async (msg: {
    kind: string;
    target: string;
    from: string;
    data: unknown;
  }) => {
    if (msg.target !== userIdRef.current) return;
    if (msg.from === userIdRef.current) return;

    const fromId = msg.from;
    if (!peersRef.current.has(fromId)) createPeer(fromId);
    const entry = peersRef.current.get(fromId)!;

    const pc = entry.pc;
    const currentEntry = entry;
    entry.signalQueue = entry.signalQueue.then(async () => {
      if (peersRef.current.get(fromId) !== currentEntry || pc.signalingState === 'closed') return;
      try {
        if (msg.kind === 'offer') {
          const description = msg.data as RTCSessionDescriptionInit;
          const readyForOffer = !entry.makingOffer &&
            (pc.signalingState === 'stable' || entry.isSettingRemoteAnswerPending);
          const collision = !readyForOffer;
          entry.ignoreOffer = !entry.polite && collision;

          if (entry.ignoreOffer) return;

          await pc.setRemoteDescription(description);
          entry.remoteDescriptionSet = true;
          flushPendingCandidates(entry);

          await pc.setLocalDescription();
          channelRef.current?.send({
            type: 'broadcast',
            event: 'signal',
            payload: { kind: 'answer', target: fromId, from: userIdRef.current, data: pc.localDescription },
          });
        } else if (msg.kind === 'answer') {
          const description = msg.data as RTCSessionDescriptionInit;
          if ((pc.signalingState as string) === 'have-local-offer') {
            entry.isSettingRemoteAnswerPending = true;
            try {
              await pc.setRemoteDescription(description);
            } finally {
              entry.isSettingRemoteAnswerPending = false;
            }
            entry.remoteDescriptionSet = true;
            flushPendingCandidates(entry);
          }
        } else if (msg.kind === 'ice') {
          if (entry.ignoreOffer) return;
          const candidate = msg.data as RTCIceCandidateInit;
          if (entry.remoteDescriptionSet) {
            await pc.addIceCandidate(candidate);
          } else {
            entry.pendingCandidates.push(candidate);
          }
        }
      } catch (error) {
        if (!entry.ignoreOffer) console.warn('Video handshake failed', error);
      }
    });
    await entry.signalQueue;
  }, [createPeer, flushPendingCandidates]);

  const announcePresence = useCallback(async () => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'hello',
      payload: { from: userIdRef.current },
    });
  }, []);

  useEffect(() => {
    if (!enabled || !tableId || !userId) return;

    let cancelled = false;
    let helloTimer: ReturnType<typeof setInterval> | undefined;
    const presenceSessions = new Map<string, string>();
    const sessionId = crypto.randomUUID();
    const peers = peersRef.current;

    (async () => {
      await getLocalStream(() => cancelled);
      if (cancelled) return;

      const channel = supabase.channel(`table-${tableId}-webrtc`, {
        config: { broadcast: { self: false }, presence: { key: userId } },
      });

      channelRef.current = channel;

      channel.on('presence', { event: 'sync' }, () => {
        if (cancelled) return;
        const state = channel.presenceState<{ sessionId?: string }>();
        const removePeer = (peerId: string) => {
          peers.get(peerId)?.pc.close();
          peers.delete(peerId);
          setPeerStreams(prev => {
            const next = new Map(prev);
            next.delete(peerId);
            return next;
          });
        };
        for (const peerId of presenceSessions.keys()) {
          if (!state[peerId]) {
            removePeer(peerId);
            presenceSessions.delete(peerId);
          }
        }
        for (const [peerId, sessions] of Object.entries(state)) {
          if (peerId === userId || sessions.length === 0) continue;
          const peerSession = sessions[sessions.length - 1].sessionId ?? '';
          const previous = presenceSessions.get(peerId);
          if (previous !== undefined && previous !== peerSession) removePeer(peerId);
          presenceSessions.set(peerId, peerSession);
          createPeer(peerId);
        }
      });

      channel.on('broadcast', { event: 'signal' }, (payload) => {
        if (cancelled) return;
        const msg = (payload.payload as { kind: string; target: string; from: string; data: unknown });
        handleMessage(msg);
      });

      channel.on('broadcast', { event: 'hello' }, (payload) => {
        const msg = payload.payload as { from: string };
        if (cancelled || msg.from === userIdRef.current) return;
        if (!peersRef.current.has(msg.from)) {
          createPeer(msg.from);
        }
      });

      channel.subscribe(async (status) => {
        if (cancelled) return;
        if (status === 'SUBSCRIBED') {
          await channel.track({ sessionId });
          if (cancelled) return;
          await announcePresence();
          if (cancelled) return;
          if (!helloTimer) helloTimer = setInterval(() => { void announcePresence(); }, 5000);
          setError(null);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError('Video connection interrupted. Reconnecting...');
        }
      });
    })();

    return () => {
      cancelled = true;
      clearInterval(helloTimer);
      peers.forEach((entry) => {
        entry.pc.close();
      });
      peers.clear();
      setPeerStreams(new Map());

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
      setLocalStream(null);

      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [enabled, tableId, userId, getLocalStream, createPeer, handleMessage, announcePresence]);

  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setVideoEnabled(videoTrack.enabled);
    }
  }, []);

  const toggleAudio = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setAudioEnabled(audioTrack.enabled);
    }
  }, []);

  const toggleOutput = useCallback(() => {
    setOutputEnabled((enabledNow) => !enabledNow);
  }, []);

  return {
    localStream,
    peerStreams,
    videoEnabled,
    audioEnabled,
    outputEnabled,
    toggleVideo,
    toggleAudio,
    toggleOutput,
    error,
    status,
  };
}
