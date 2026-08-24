let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume();
  }
  return audioCtx;
}

let lastPlayedAt = 0;

export function playTurnNotification() {
  const now = Date.now();
  if (now - lastPlayedAt < 2000) return;
  lastPlayedAt = now;

  const ctx = getAudioContext();
  if (!ctx) return;

  const now2 = ctx.currentTime;

  const playTone = (freq: number, start: number, duration: number, gain: number) => {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now2 + start);
    gainNode.gain.setValueAtTime(0, now2 + start);
    gainNode.gain.linearRampToValueAtTime(gain, now2 + start + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now2 + start + duration);
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start(now2 + start);
    osc.stop(now2 + start + duration + 0.05);
  };

  playTone(880, 0, 0.18, 0.15);
  playTone(1320, 0.08, 0.22, 0.12);
}

export function unlockAudio() {
  getAudioContext();
}
