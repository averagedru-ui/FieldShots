'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { addPhoto, getSetting } from '@/lib/db';

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

function formatTimestamp(date: Date) {
  return date.toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

function clamp(val: number, min: number, max: number) {
  return Math.min(Math.max(val, min), max);
}

export default function CameraPage() {
  const { id } = useParams<{ id: string }>();
  const jobId = Number(id);
  const router = useRouter();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Pinch zoom state
  const zoomRef = useRef(1);          // current committed zoom
  const pinchStartDist = useRef(0);   // finger distance when pinch started
  const pinchStartZoom = useRef(1);   // zoom when pinch started
  const [zoom, setZoom] = useState(1);

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

  // Pinch-to-zoom touch handlers
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDist.current = Math.hypot(dx, dy);
      pinchStartZoom.current = zoomRef.current;
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const scale = dist / pinchStartDist.current;
      const newZoom = clamp(pinchStartZoom.current * scale, MIN_ZOOM, MAX_ZOOM);
      zoomRef.current = newZoom;
      setZoom(newZoom);
    }
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      pinchStartDist.current = 0;
    }
  }, []);

  const flipCamera = () => {
    const next = facing === 'environment' ? 'user' : 'environment';
    setFacing(next);
    // Reset zoom on flip
    zoomRef.current = 1;
    setZoom(1);
    startCamera(next);
  };

  const takePhoto = async () => {
    if (taking || !videoRef.current || !canvasRef.current) return;
    setTaking(true);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;

    // Apply zoom by cropping the centre of the video frame
    const z = zoomRef.current;
    const cropW = vw / z;
    const cropH = vh / z;
    const cropX = (vw - cropW) / 2;
    const cropY = (vh - cropH) / 2;

    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, vw, vh);

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

        {/* Zoom indicator — only show when zoomed in */}
        {zoom > 1.05 && (
          <div className="bg-black/60 px-3 py-1 rounded-full">
            <span className="text-white text-sm font-bold font-mono">{zoom.toFixed(1)}×</span>
          </div>
        )}

        <button
          onClick={() => setShowTimestamp((v) => !v)}
          className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-opacity ${showTimestamp ? 'bg-white/20' : 'bg-white/10 opacity-40'}`}
        >🕐</button>
      </div>

      {/* Camera feed with pinch-to-zoom */}
      <div
        ref={viewportRef}
        className="relative flex-1 overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ touchAction: 'none' }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            transform: `scale(${zoom})`,
            transformOrigin: 'center center',
            transition: 'transform 0.05s linear',
          }}
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Timestamp overlay */}
        {showTimestamp && (
          <div className="absolute bottom-3 left-3 bg-black/55 px-2 py-1 rounded text-white text-xs font-mono pointer-events-none">
            {formatTimestamp(now)}
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div
        className="flex-shrink-0 bg-black flex items-center justify-around px-8"
        style={{
          paddingTop: 20,
          paddingBottom: 'max(32px, env(safe-area-inset-bottom))',
          minHeight: 130,
        }}
      >
        <button
          onClick={flipCamera}
          className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-2xl text-white flex-shrink-0"
        >⟳</button>

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
