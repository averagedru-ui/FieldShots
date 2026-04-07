'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getJob, getPhotosForJob, deletePhoto, Photo, Job, blobToUrl } from '@/lib/db';
import { sharePDF, emailPDF } from '@/lib/pdf';

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const jobId = Number(id);
  const router = useRouter();

  const [job, setJob] = useState<Job | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<number, string>>({});
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    const [j, p] = await Promise.all([getJob(jobId), getPhotosForJob(jobId)]);
    setJob(j ?? null);
    setPhotos(p);
    // Create object URLs for display
    const urls: Record<number, string> = {};
    p.forEach((photo) => { urls[photo.id!] = blobToUrl(photo.blob); });
    setPhotoUrls(urls);
  }, [jobId]);

  useEffect(() => {
    load();
    return () => {
      // Revoke URLs on unmount
      Object.values(photoUrls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [load]);

  const confirmDelete = (photo: Photo) => {
    if (!confirm('Delete this photo?')) return;
    deletePhoto(photo.id!).then(load);
  };

  const handleExport = async (method: 'share' | 'email') => {
    if (!job) return;
    setExporting(true);
    try {
      if (method === 'share') await sharePDF(job, photos);
      else await emailPDF(job, photos);
    } catch (e) {
      alert('Failed to generate report.');
    } finally {
      setExporting(false);
    }
  };

  const showExportMenu = () => {
    const choice = window.confirm('Share PDF?\n\nOK = Share sheet\nCancel = Email');
    if (choice) handleExport('share');
    else handleExport('email');
  };

  if (!job) return null;

  return (
    <div className="flex flex-col min-h-screen bg-[#121212]">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 bg-[#1A1A1A] border-b border-[#2A2A2A] sticky top-0 z-10" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))', paddingBottom: '12px' }}>
        <Link href="/jobs" className="text-[#4CAF50] text-sm font-semibold">‹ Jobs</Link>
        <div className="flex-1 min-w-0">
          <p className="font-bold truncate">{job.name}</p>
          <p className="text-[#4CAF50] text-xs font-bold uppercase tracking-widest">{job.referenceCode}</p>
        </div>
        <Link href={`/jobs/${jobId}/edit`} className="text-[#aaa] text-sm px-3 py-1.5 bg-[#2A2A2A] rounded-lg">Edit</Link>
        <button
          onClick={showExportMenu}
          disabled={exporting || photos.length === 0}
          className="text-white text-sm px-3 py-1.5 bg-[#1565C0] rounded-lg disabled:opacity-40"
        >
          {exporting ? '…' : 'PDF'}
        </button>
      </header>

      {/* Photo grid */}
      <main className="flex-1 pb-24">
        {photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <span className="text-5xl">📷</span>
            <p className="text-white font-semibold text-lg">No photos yet</p>
            <p className="text-[#888] text-sm">Tap the camera button to add photos</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-px bg-[#0A0A0A]">
            {photos.map((photo) => (
              <div key={photo.id} className="relative aspect-square">
                <Link href={`/photo/${photo.id}?jobId=${jobId}`}>
                  <img src={photoUrls[photo.id!]} alt="" className="w-full h-full object-cover" />
                  {photo.notes && (
                    <div className="absolute bottom-1 right-1 bg-black/60 rounded-full w-5 h-5 flex items-center justify-center text-xs">✎</div>
                  )}
                </Link>
                <button
                  onClick={() => confirmDelete(photo)}
                  className="absolute top-1 right-1 bg-black/60 rounded-full w-5 h-5 flex items-center justify-center text-xs text-white"
                >✕</button>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Camera FAB */}
      <Link
        href={`/jobs/${jobId}/camera`}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-[#4CAF50] flex items-center justify-center text-2xl shadow-lg"
        style={{ bottom: 'max(24px, env(safe-area-inset-bottom))' }}
      >
        📷
      </Link>
    </div>
  );
}
