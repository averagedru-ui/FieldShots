'use client';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { getPhoto, updatePhotoNotes, deletePhoto, blobToUrl, Photo, db } from '@/lib/db';
import { Suspense } from 'react';

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

function PhotoDetailInner() {
  const { id } = useParams<{ id: string }>();
  const photoId = Number(id);
  const searchParams = useSearchParams();
  const jobId = searchParams.get('jobId');
  const router = useRouter();

  const [photo, setPhoto] = useState<Photo | null>(null);
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getPhoto(photoId).then((p) => {
      if (p) {
        setPhoto(p);
        setNotes(p.notes ?? '');
        setUrl(blobToUrl(p.blob));
      }
    });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [photoId]);

  const saveNotes = async () => {
    await updatePhotoNotes(photoId, notes);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const toggleTimestamp = async () => {
    if (!photo) return;
    const next = !photo.hasTimestamp;
    await db.photos.update(photoId, { hasTimestamp: next });
    setPhoto({ ...photo, hasTimestamp: next });
  };

  const confirmDelete = () => {
    if (!confirm('Delete this photo permanently?')) return;
    deletePhoto(photoId).then(() => router.back());
  };

  if (!photo || !url) return null;

  return (
    <div className="flex flex-col min-h-screen bg-[#121212]">
      <header className="flex items-center gap-3 px-4 bg-[#1A1A1A] border-b border-[#2A2A2A] sticky top-0 z-10" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))', paddingBottom: '12px' }}>
        <button onClick={() => router.back()} className="text-[#4CAF50] text-sm font-semibold">‹ Back</button>
        <h1 className="flex-1 text-center font-bold">Photo</h1>
        <button onClick={confirmDelete} className="text-red-400 text-sm font-semibold">Delete</button>
      </header>

      <main className="flex-1 pb-8">
        {/* Photo with optional timestamp overlay */}
        <div className="bg-black relative">
          <img src={url} alt="" className="w-full object-contain" style={{ maxHeight: '60vh' }} />
          {photo.hasTimestamp && (
            <div className="absolute bottom-2 left-2 bg-black/55 px-2 py-1 rounded text-white text-xs font-mono pointer-events-none">
              {formatTimestamp(photo.takenAt)}
            </div>
          )}
        </div>

        {/* Meta row */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#2A2A2A]">
          <span className="text-[#888] text-sm">
            {new Date(photo.takenAt).toLocaleString('en-GB', {
              day: '2-digit', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit', hour12: false,
            })}
          </span>
          {/* Timestamp toggle */}
          <button
            onClick={toggleTimestamp}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${
              photo.hasTimestamp
                ? 'bg-[#1E3A2F] text-[#4CAF50]'
                : 'bg-[#2A2A2A] text-[#666]'
            }`}
          >
            🕐 {photo.hasTimestamp ? 'Timestamp on' : 'Timestamp off'}
          </button>
        </div>

        {/* Notes */}
        <div className="p-4 space-y-3">
          <label className="text-[#aaa] text-xs font-bold uppercase tracking-wider block">Notes</label>
          <textarea
            className="w-full bg-[#1E1E1E] text-white rounded-xl px-4 py-3.5 text-base border border-[#2A2A2A] outline-none focus:border-[#4CAF50] min-h-[120px] resize-none"
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setSaved(false); }}
            placeholder="Add notes about this photo…"
          />
          <button
            onClick={saveNotes}
            className={`w-full rounded-xl py-4 font-bold text-base text-white transition-colors ${saved ? 'bg-[#2E7D32]' : 'bg-[#4CAF50]'}`}
          >
            {saved ? '✓ Saved' : 'Save Notes'}
          </button>
        </div>
      </main>
    </div>
  );
}

export default function PhotoDetailPage() {
  return (
    <Suspense>
      <PhotoDetailInner />
    </Suspense>
  );
}
