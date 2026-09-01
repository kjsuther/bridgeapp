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

  const getLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240 },
        audio: SPEECH_AUDIO_CONSTRAINTS,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setStatus('connected');
      return stream;
    } catch {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: SPEECH_AUDIO_CONSTRAINTS,
        });
        localStreamRef.current = stream;
        setLocalStream(stream);
        setStatus('connected');
        return stream;
      } catch {
        const stream = new MediaStream();
        localStreamRef.current = stream;
        setLocalStream(stream);
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
      const [stream] = event.streams;
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

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        if (entry.retryCount < MAX_RETRIES) {
          entry.retryCount++;
          pc.restartIce();
        }
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        if (entry.retryCount < MAX_RETRIES) {
          entry.retryCount++;
          pc.restartIce();
        }
      }
    };

    pc.onnegotiationneeded = async () => {
      try {
        entry.makingOffer = true;
        await pc.setLocalDescription();
        channelRef.current?.send({
          type: 'broadcast',
          event: 'signal',
          payload: { kind: 'offer', target: peerId, from: userIdRef.current, data: pc.localDescription },
        });
      } catch {
        // A later negotiationneeded event or ICE restart can recover.
      } finally {
        entry.makingOffer = false;
      }
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
    let entry = peersRef.current.get(fromId);

    if (!entry) {
      const pc = createPeer(fromId);
      entry = peersRef.current.get(fromId)!;
      void pc;
    }

    const pc = entry.pc;

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
        const candidate = msg.data as RTCIceCandidateInit;
        if (entry.remoteDescriptionSet) {
          await pc.addIceCandidate(candidate);
        } else {
          entry.pendingCandidates.push(candidate);
        }
      }
    } catch {
      // ICE/handshake errors are recoverable
    }
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
    const peers = peersRef.current;

    (async () => {
      await getLocalStream();
      if (cancelled) return;

      const channel = supabase.channel(`table-${tableId}-webrtc`, {
        config: { broadcast: { self: false } },
      });

      channelRef.current = channel;

      channel.on('broadcast', { event: 'signal' }, (payload) => {
        const msg = (payload.payload as { kind: string; target: string; from: string; data: unknown });
        handleMessage(msg);
      });

      channel.on('broadcast', { event: 'hello' }, (payload) => {
        const msg = payload.payload as { from: string };
        if (msg.from === userIdRef.current) return;
        if (!peersRef.current.has(msg.from)) {
          createPeer(msg.from);
        }
      });

      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await announcePresence();
        }
      });
    })();

    return () => {
      cancelled = true;
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
