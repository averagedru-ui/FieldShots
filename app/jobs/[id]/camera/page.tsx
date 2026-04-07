'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { addPhoto, getSetting } from '@/lib/db';

function formatTimestamp(date: Date) {
  return date.toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

export default function CameraPage() {
  const { id } = useParams<{ id: string }>();
  const jobId = Number(id);
  const router = useRouter();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [showTimestamp, setShowTimestamp] = useState(true);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [count, setCount] = useState(0);
  const [taking, setTaking] = useState(false);
  const [now, setNow] = useState(new Date());
  const [error, setError] = useState('');

  const startCamera = useCallback(async (facingMode: 'environment' | 'user') => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setError('Camera access denied. Please allow camera access and reload.');
    }
  }, []);

  useEffect(() => {
    getSetting('showTimestamp').then((v) => setShowTimestamp(v !== 'false'));
    startCamera('environment');

    const tick = setInterval(() => setNow(new Date()), 1000);

    return () => {
      clearInterval(tick);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [startCamera]);

  const flipCamera = () => {
    const next = facing === 'environment' ? 'user' : 'environment';
    setFacing(next);
    startCamera(next);
  };

  const takePhoto = async () => {
    if (taking || !videoRef.current || !canvasRef.current) return;
    setTaking(true);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);

    // Stamp timestamp on the canvas if enabled
    if (showTimestamp) {
      const ts = formatTimestamp(new Date());
      const fontSize = Math.round(canvas.width * 0.022);
      ctx.font = `bold ${fontSize}px monospace`;
      const padding = Math.round(fontSize * 0.5);
      const textW = ctx.measureText(ts).width;
      const boxX = padding;
      const boxY = canvas.height - padding - fontSize * 2;

      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(boxX - 6, boxY - fontSize, textW + 12, fontSize * 1.6);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(ts, boxX, boxY + fontSize * 0.4);
    }

    canvas.toBlob(async (blob) => {
      if (blob) {
        await addPhoto(jobId, blob, showTimestamp);
        setCount((c) => c + 1);
      }
      setTaking(false);
    }, 'image/jpeg', 0.88);
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black gap-4 p-8 text-center">
        <p className="text-white text-base">{error}</p>
        <button onClick={() => router.back()} className="bg-[#4CAF50] text-white px-6 py-3 rounded-xl font-semibold">Go Back</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-black overflow-hidden">
      {/* Camera feed */}
      <div className="relative flex-1">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover absolute inset-0" />
        <canvas ref={canvasRef} className="hidden" />

        {/* Timestamp overlay (display only) */}
        {showTimestamp && (
          <div className="absolute bottom-28 left-3 bg-black/55 px-2 py-1 rounded text-white text-xs font-mono pointer-events-none">
            {formatTimestamp(now)}
          </div>
        )}

        {/* Top controls */}
        <div className="absolute top-0 left-0 right-0 flex justify-between items-center p-4" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
          <button onClick={() => router.back()} className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-white text-lg">✕</button>
          <button
            onClick={() => setShowTimestamp((v) => !v)}
            className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${showTimestamp ? 'bg-black/50' : 'bg-black/20 opacity-40'}`}
          >
            🕐
          </button>
        </div>

        {/* Bottom controls */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-around px-8 pb-safe" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
          <button onClick={flipCamera} className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center text-2xl">⟳</button>

          <button
            onClick={takePhoto}
            disabled={taking}
            className="w-18 h-18 rounded-full border-4 border-white flex items-center justify-center disabled:opacity-50"
            style={{ width: 72, height: 72 }}
          >
            <div className={`w-14 h-14 rounded-full ${taking ? 'bg-white/60' : 'bg-white'}`} />
          </button>

          <div className="w-12 h-12 flex flex-col items-center justify-center">
            {count > 0 && (
              <>
                <span className="text-white font-bold text-lg leading-none">{count}</span>
                <span className="text-[#aaa] text-xs">taken</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
