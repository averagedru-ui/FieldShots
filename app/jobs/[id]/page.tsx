'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getJob, getPhotosForJob, deletePhoto, Photo, Job, blobToUrl, addPhotoFromFile } from '@/lib/db';
import { sharePDF, emailPDF } from '@/lib/pdf';

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const jobId = Number(id);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [job, setJob] = useState<Job | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<number, string>>({});
  const [exporting, setExporting] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Multi-select
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    const [j, p] = await Promise.all([getJob(jobId), getPhotosForJob(jobId)]);
    setJob(j ?? null);
    setPhotos(p as Photo[]);
    const urls: Record<number, string> = {};
    (p as Photo[]).forEach((photo) => { urls[photo.id!] = blobToUrl(photo.blob); });
    setPhotoUrls(urls);
  }, [jobId]);

  useEffect(() => {
    load();
    return () => { Object.values(photoUrls).forEach((url) => URL.revokeObjectURL(url)); };
  }, [load]);

  // --- Upload from camera roll ---
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    for (const file of files) {
      await addPhotoFromFile(jobId, file);
    }
    await load();
    setUploading(false);
    e.target.value = '';
  };

  // --- Select mode ---
  const toggleSelect = (photoId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(photoId) ? next.delete(photoId) : next.add(photoId);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  // --- Share selected photos via Web Share API ---
  const shareSelected = async () => {
    const selectedPhotos = photos.filter((p) => selected.has(p.id!));
    const files = selectedPhotos.map((p) => new File([p.blob], `fieldshots-${p.id}.jpg`, { type: 'image/jpeg' }));
    try {
      if (navigator.canShare?.({ files })) {
        await navigator.share({ files, title: `FieldShots — ${job?.name}` });
      } else {
        alert('Sharing is not supported on this browser.');
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') alert('Failed to share photos.');
    }
  };

  // --- Delete selected ---
  const deleteSelected = async () => {
    if (!confirm(`Delete ${selected.size} photo(s)? This cannot be undone.`)) return;
    for (const photoId of selected) {
      await deletePhoto(photoId);
    }
    exitSelectMode();
    load();
  };

  // --- PDF export ---
  const handleExport = async (method: 'share' | 'email') => {
    if (!job) return;
    setExporting(true);
    try {
      if (method === 'share') await sharePDF(job, photos);
      else await emailPDF(job, photos);
    } catch { alert('Failed to generate report.'); }
    finally { setExporting(false); }
  };

  const showExportMenu = () => {
    const choice = window.confirm('Share PDF?\n\nOK = Share sheet\nCancel = Email');
    if (choice) handleExport('share');
    else handleExport('email');
  };

  if (!job) return null;

  return (
    <div className="flex flex-col bg-[#121212]" style={{ minHeight: '100dvh' }}>
      {/* Header */}
      <header
        className="flex items-center gap-2 px-4 bg-[#1A1A1A] border-b border-[#2A2A2A] sticky top-0 z-10 flex-shrink-0"
        style={{ paddingTop: 'max(16px, env(safe-area-inset-top))', paddingBottom: '10px' }}
      >
        {selectMode ? (
          <>
            <button onClick={exitSelectMode} className="text-[#4CAF50] text-sm font-semibold">Cancel</button>
            <span className="flex-1 text-center font-bold text-sm">
              {selected.size > 0 ? `${selected.size} selected` : 'Select Photos'}
            </span>
            <button
              onClick={deleteSelected}
              disabled={selected.size === 0}
              className="text-red-400 text-sm font-semibold disabled:opacity-30"
            >Delete</button>
          </>
        ) : (
          <>
            <button onClick={() => router.push('/jobs')} className="text-[#4CAF50] text-sm font-semibold">‹ Jobs</button>
            <div className="flex-1 min-w-0">
              <p className="font-bold truncate text-sm">{job.name}</p>
              <p className="text-[#4CAF50] text-xs font-bold uppercase tracking-widest">{job.referenceCode}</p>
            </div>
            <Link href={`/jobs/${jobId}/edit`} className="text-[#aaa] text-xs px-2.5 py-1.5 bg-[#2A2A2A] rounded-lg">Edit</Link>
            <button
              onClick={showExportMenu}
              disabled={exporting || photos.length === 0}
              className="text-white text-xs px-2.5 py-1.5 bg-[#1565C0] rounded-lg disabled:opacity-40"
            >{exporting ? '…' : 'PDF'}</button>
          </>
        )}
      </header>

      {/* Photo grid — slightly oversized cells so edges clip naturally */}
      <main className="flex-1" style={{ paddingBottom: selectMode ? 80 : 100 }}>
        {photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <span className="text-5xl">📷</span>
            <p className="text-white font-semibold text-lg">No photos yet</p>
            <p className="text-[#888] text-sm">Tap the camera button to add photos</p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 2,
              // Extend slightly beyond right edge
              marginRight: -2,
            }}
          >
            {photos.map((photo) => {
              const isSelected = selected.has(photo.id!);
              return (
                <div
                  key={photo.id}
                  className="relative"
                  style={{ aspectRatio: '1', overflow: 'hidden' }}
                  onClick={() => {
                    if (selectMode) { toggleSelect(photo.id!); }
                    else { router.push(`/photo/${photo.id}?jobId=${jobId}`); }
                  }}
                  onContextMenu={(e) => { e.preventDefault(); setSelectMode(true); toggleSelect(photo.id!); }}
                >
                  <img
                    src={photoUrls[photo.id!]}
                    alt=""
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                      // Scale up slightly so tiles feel bigger and bleed at bottom
                      transform: 'scale(1.04)',
                      transformOrigin: 'center center',
                    }}
                  />

                  {/* Selection overlay */}
                  {selectMode && (
                    <div className={`absolute inset-0 transition-colors ${isSelected ? 'bg-[#4CAF50]/30' : 'bg-transparent'}`} />
                  )}

                  {/* Checkmark */}
                  {selectMode && (
                    <div className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-[#4CAF50] border-[#4CAF50]' : 'bg-black/40 border-white'}`}>
                      {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                    </div>
                  )}

                  {/* Notes badge (non-select mode) */}
                  {!selectMode && photo.notes && (
                    <div className="absolute bottom-1 right-1 bg-black/60 rounded-full w-5 h-5 flex items-center justify-center text-xs">✎</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Hidden file input for camera roll upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Bottom bar — changes based on mode */}
      {selectMode ? (
        <div
          className="fixed bottom-0 left-0 right-0 bg-[#1A1A1A] border-t border-[#2A2A2A] flex items-center justify-around px-6"
          style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))', paddingTop: 12 }}
        >
          <button
            onClick={shareSelected}
            disabled={selected.size === 0}
            className="flex flex-col items-center gap-1 disabled:opacity-30"
          >
            <span className="text-2xl">↗️</span>
            <span className="text-white text-xs font-semibold">Share {selected.size > 0 ? `(${selected.size})` : ''}</span>
          </button>
          <button
            onClick={() => { setSelected(new Set(photos.map((p) => p.id!))); }}
            className="flex flex-col items-center gap-1"
          >
            <span className="text-2xl">☑️</span>
            <span className="text-white text-xs font-semibold">Select All</span>
          </button>
        </div>
      ) : (
        <div
          className="fixed bottom-0 left-0 right-0 flex items-center justify-around px-8"
          style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))', paddingTop: 12 }}
        >
          {/* Upload from camera roll */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-12 h-12 rounded-full bg-[#1E1E1E] border border-[#2A2A2A] flex items-center justify-center text-xl disabled:opacity-40"
          >{uploading ? '…' : '🖼️'}</button>

          {/* Camera FAB */}
          <Link
            href={`/jobs/${jobId}/camera`}
            className="w-16 h-16 rounded-full bg-[#4CAF50] flex items-center justify-center text-2xl shadow-lg"
          >📷</Link>

          {/* Select mode */}
          <button
            onClick={() => setSelectMode(true)}
            disabled={photos.length === 0}
            className="w-12 h-12 rounded-full bg-[#1E1E1E] border border-[#2A2A2A] flex items-center justify-center text-xl disabled:opacity-40"
          >☑️</button>
        </div>
      )}
    </div>
  );
}
