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
        await videoRef.current.play();
      }
    } catch {
      setError('Camera access denied. Please allow camera access in Safari settings and reload.');
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
    // Always save the raw photo — timestamp is stored as a flag and applied at display/PDF time
    ctx.drawImage(video, 0, 0);

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
    // Use 100dvh so it fills the full dynamic viewport on iOS (excludes browser chrome)
    <div className="flex flex-col bg-black" style={{ height: '100dvh' }}>

      {/* Top controls */}
      <div
        className="flex-shrink-0 flex justify-between items-center px-4 z-10"
        style={{ paddingTop: 'max(16px, env(safe-area-inset-top))', paddingBottom: 12 }}
      >
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white text-lg"
        >✕</button>
        <button
          onClick={() => setShowTimestamp((v) => !v)}
          className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-opacity ${showTimestamp ? 'bg-white/20' : 'bg-white/10 opacity-40'}`}
        >🕐</button>
      </div>

      {/* Camera feed — fills all remaining space */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Timestamp overlay */}
        {showTimestamp && (
          <div className="absolute bottom-3 left-3 bg-black/55 px-2 py-1 rounded text-white text-xs font-mono pointer-events-none">
            {formatTimestamp(now)}
          </div>
        )}
      </div>

      {/* Bottom controls — always fully visible above home indicator */}
      <div
        className="flex-shrink-0 bg-black flex items-center justify-around px-8"
        style={{
          paddingTop: 20,
          paddingBottom: 'max(32px, env(safe-area-inset-bottom))',
          minHeight: 130,
        }}
      >
        {/* Flip */}
        <button
          onClick={flipCamera}
          className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-2xl text-white flex-shrink-0"
        >⟳</button>

        {/* Shutter */}
        <button
          onClick={takePhoto}
          disabled={taking}
          className="rounded-full border-4 border-white flex items-center justify-center disabled:opacity-50 flex-shrink-0"
          style={{ width: 80, height: 80 }}
        >
          <div
            className={`rounded-full flex-shrink-0 transition-opacity ${taking ? 'opacity-50' : 'opacity-100'} bg-white`}
            style={{ width: 62, height: 62 }}
          />
        </button>

        {/* Count */}
        <div className="w-12 h-12 flex flex-col items-center justify-center flex-shrink-0">
          {count > 0 && (
            <>
              <span className="text-white font-bold text-xl leading-none">{count}</span>
              <span className="text-[#aaa] text-xs mt-0.5">taken</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
