'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSetting, setSetting } from '@/lib/db';

export default function SettingsPage() {
  const router = useRouter();
  const [showTimestamp, setShowTimestamp] = useState(true);

  useEffect(() => {
    getSetting('showTimestamp').then((v) => setShowTimestamp(v !== 'false'));
  }, []);

  const toggle = async (value: boolean) => {
    setShowTimestamp(value);
    await setSetting('showTimestamp', value ? 'true' : 'false');
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#121212]">
      <header className="flex items-center gap-3 px-4 bg-[#1A1A1A] border-b border-[#2A2A2A] sticky top-0 z-10" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))', paddingBottom: '12px' }}>
        <button onClick={() => router.back()} className="text-[#4CAF50] text-sm font-semibold">‹ Back</button>
        <h1 className="flex-1 text-center font-bold">Settings</h1>
        <div className="w-12" />
      </header>

      <main className="p-4 space-y-6">
        {/* Camera section */}
        <div>
          <p className="text-[#4CAF50] text-xs font-bold uppercase tracking-widest mb-2 px-1">Camera</p>
          <div className="bg-[#1E1E1E] rounded-xl p-4 flex items-center justify-between gap-3">
            <div className="flex-1">
              <p className="text-white font-medium">Timestamp Overlay</p>
              <p className="text-[#666] text-sm mt-0.5">Stamp the date & time onto photos when taken</p>
            </div>
            {/* Toggle switch */}
            <button
              role="switch"
              aria-checked={showTimestamp}
              onClick={() => toggle(!showTimestamp)}
              className={`relative w-12 h-7 rounded-full transition-colors duration-200 flex-shrink-0 ${showTimestamp ? 'bg-[#4CAF50]' : 'bg-[#2A2A2A]'}`}
            >
              <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform duration-200 ${showTimestamp ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>

        {/* About section */}
        <div>
          <p className="text-[#4CAF50] text-xs font-bold uppercase tracking-widest mb-2 px-1">About</p>
          <div className="bg-[#1E1E1E] rounded-xl p-4 space-y-2">
            <p className="text-[#4CAF50] font-bold text-lg">FieldShots</p>
            <p className="text-[#777] text-sm leading-relaxed">
              Job photo management for field workers. Photos are stored privately in your browser and never saved to your photo library.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
