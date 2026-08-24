import { useEffect, useRef } from 'react';

interface VideoTileProps {
  stream: MediaStream | null;
  displayName: string;
  seat: string;
  isLocal: boolean;
  muted?: boolean;
  className?: string;
}

export function VideoTile({ stream, displayName, seat, isLocal, muted, className = '' }: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (stream) {
      video.srcObject = stream;
      // For local streams, mute to prevent echo feedback
      if (isLocal) {
        video.muted = true;
      }
      // Ensure autoplay works — play after srcObject is set
      video.play().catch(() => {
        // Autoplay can fail if not user-gesture initiated; the playsInline + muted attrs handle most cases
      });
    } else {
      video.srcObject = null;
    }
  }, [stream, isLocal]);

  return (
    <div className={`relative rounded-xl overflow-hidden bg-slate-800 shadow-lg ring-1 ring-slate-700/50 ${className}`}>
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted || isLocal}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-slate-800">
          <div className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 rounded-full bg-slate-600 flex items-center justify-center text-white font-medium text-2xl">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs text-slate-400">No camera</span>
          </div>
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2">
        <span className="text-sm text-white font-medium">{displayName}</span>
        <span className="text-sm text-emerald-300 ml-2">[{seat}]</span>
      </div>
    </div>
  );
}
