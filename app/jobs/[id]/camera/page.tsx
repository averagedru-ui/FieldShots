'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { addPhoto, getSetting } from '@/lib/db';
import { IconX, IconClock, IconFlipCamera } from '@/components/Icons';

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

  const zoomRef = useRef(1);
  const pinchStartDist = useRef(0);
  const pinchStartZoom = useRef(1);
  const [zoom, setZoom] = useState(1);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showTimestamp, setShowTimestamp] = useState(true);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [count, setCount] = useState(0);
  const [taking, setTaking] = useState(false);
  const [now, setNow] = useState(new Date());
  const [error, setError] = useState('');

  const applyZoomToTrack = useCallback(async (zoomLevel: number) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const caps = track.getCapabilities() as any;
      if (caps.zoom) {
        const min = caps.zoom.min ?? 1;
        const max = caps.zoom.max ?? MAX_ZOOM;
        await track.applyConstraints({ advanced: [{ zoom: clamp(zoomLevel, min, max) } as any] });
      }
    } catch {
      // Hardware zoom not supported — CSS crop fallback is used in takePhoto
    }
  }, []);

  const startCamera = useCallback(async (facingMode: 'environment' | 'user') => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;

      // Enable continuous autofocus if supported
      const track = stream.getVideoTracks()[0];
      try {
        await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] });
      } catch { /* not supported on all devices */ }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setError('Camera access denied. Please allow camera access in Safari settings and reload.');
    }
  }, [applyZoomToTrack]);

  useEffect(() => {
    getSetting('showTimestamp').then((v) => setShowTimestamp(v !== 'false'));
    startCamera('environment');
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearInterval(tick);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (focusTimer.current) clearTimeout(focusTimer.current);
    };
  }, [startCamera]);

  // Tap to focus
  const handleTap = useCallback(async (e: React.TouchEvent) => {
    // Only handle single-finger taps (not pinch end)
    if (e.changedTouches.length !== 1 || pinchStartDist.current > 0) return;

    const rect = viewportRef.current!.getBoundingClientRect();
    const touch = e.changedTouches[0];
    const x = (touch.clientX - rect.left) / rect.width;
    const y = (touch.clientY - rect.top) / rect.height;

    // Show focus indicator
    setFocusPoint({ x: touch.clientX - rect.left, y: touch.clientY - rect.top });
    if (focusTimer.current) clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => setFocusPoint(null), 1200);

    // Apply focus point to camera track if supported
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({
        advanced: [{ focusMode: 'single-shot', focusPointOfInterest: { x, y } } as any],
      });
      // Return to continuous after a moment
      setTimeout(async () => {
        try {
          await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] });
        } catch { /* ok */ }
      }, 1500);
    } catch { /* not supported */ }
  }, []);

  // Pinch zoom
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
      applyZoomToTrack(newZoom);
    }
  }, [applyZoomToTrack]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      pinchStartDist.current = 0;
    }
  }, []);

  const flipCamera = () => {
    const next = facing === 'environment' ? 'user' : 'environment';
    setFacing(next);
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

    // CSS-crop zoom fallback for devices without hardware zoom
    const track = streamRef.current?.getVideoTracks()[0];
    const caps = track?.getCapabilities() as any;
    const hasHardwareZoom = !!caps?.zoom;

    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d')!;

    if (hasHardwareZoom) {
      // Hardware already zoomed — draw full frame
      ctx.drawImage(video, 0, 0);
    } else {
      // Software crop to simulate zoom
      const z = zoomRef.current;
      const cropW = vw / z;
      const cropH = vh / z;
      const cropX = (vw - cropW) / 2;
      const cropY = (vh - cropH) / 2;
      ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, vw, vh);
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
    <div className="flex flex-col bg-black" style={{ height: '100dvh' }}>

      {/* Top controls */}
      <div
        className="flex-shrink-0 flex justify-between items-center px-4 z-10"
        style={{ paddingTop: 'max(16px, env(safe-area-inset-top))', paddingBottom: 12 }}
      >
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white"
        ><IconX size={18} strokeWidth={2.5} /></button>

        {zoom > 1.05 && (
          <div className="bg-black/60 px-3 py-1 rounded-full">
            <span className="text-white text-sm font-bold font-mono">{zoom.toFixed(1)}×</span>
          </div>
        )}

        <button
          onClick={() => setShowTimestamp((v) => !v)}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-opacity ${showTimestamp ? 'bg-white/20 text-white' : 'bg-white/10 text-white opacity-40'}`}
        ><IconClock size={20} strokeWidth={1.75} /></button>
      </div>

      {/* Camera feed */}
      <div
        ref={viewportRef}
        className="relative flex-1 overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={(e) => { onTouchEnd(e); handleTap(e); }}
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

        {/* Tap-to-focus indicator */}
        {focusPoint && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: focusPoint.x - 28,
              top: focusPoint.y - 28,
              width: 56,
              height: 56,
              border: '2px solid #4CAF50',
              borderRadius: 6,
              boxShadow: '0 0 0 1px rgba(0,0,0,0.3)',
            }}
          />
        )}

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
          className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-white flex-shrink-0"
        ><IconFlipCamera size={22} strokeWidth={1.75} /></button>

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
