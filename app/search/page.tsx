'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { searchAll, blobToUrl, Job, Photo } from '@/lib/db';
import { IconSearch, IconX, IconClipboard } from '@/components/Icons';

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [photos, setPhotos] = useState<(Photo & { job?: Job; url?: string })[]>([]);
  const [searched, setSearched] = useState(false);

  const doSearch = async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) { setJobs([]); setPhotos([]); setSearched(false); return; }
    const results = await searchAll(q.trim());
    setJobs(results.jobs);
    setPhotos(results.photos.map((p) => ({ ...p, url: blobToUrl(p.blob) })));
    setSearched(true);
  };

  const total = jobs.length + photos.length;

  return (
    <div className="flex flex-col min-h-screen bg-[#121212]">
      <header className="flex items-center gap-3 px-4 bg-[#1A1A1A] border-b border-[#2A2A2A] sticky top-0 z-10" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))', paddingBottom: '12px' }}>
        <div className="flex-1 flex items-center gap-2 bg-[#2A2A2A] rounded-xl px-3 py-2">
          <IconSearch size={16} className="text-[#888] flex-shrink-0" />
          <input
            autoFocus
            className="flex-1 bg-transparent text-white text-base outline-none placeholder-[#555]"
            placeholder="Search jobs, photos, notes…"
            value={query}
            onChange={(e) => doSearch(e.target.value)}
          />
          {query && (
            <button onClick={() => doSearch('')} className="text-[#555]">
              <IconX size={16} strokeWidth={2.5} />
            </button>
          )}
        </div>
        <button onClick={() => router.back()} className="text-[#4CAF50] text-sm font-semibold">Done</button>
      </header>

      <main className="flex-1 pb-8">
        {searched && total === 0 && (
          <div className="flex items-center justify-center h-40">
            <p className="text-[#555]">No results for "{query}"</p>
          </div>
        )}

        {jobs.length > 0 && (
          <div>
            <p className="text-[#aaa] text-xs font-bold uppercase tracking-widest px-4 py-3">Jobs ({jobs.length})</p>
            {jobs.map((job) => (
              <Link key={job.id} href={`/jobs/${job.id}`} className="flex items-center gap-3 px-4 py-3 bg-[#1A1A1A] mx-4 mb-2 rounded-xl">
                <div className="w-10 h-10 rounded-xl bg-[#1E3A2F] flex items-center justify-center text-[#4CAF50]">
                  <IconClipboard size={20} strokeWidth={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[#4CAF50] text-xs font-bold uppercase tracking-widest">{job.referenceCode}</p>
                  <p className="text-white font-medium truncate">{job.name}</p>
                </div>
              </Link>
            ))}
          </div>
        )}

        {photos.length > 0 && (
          <div>
            <p className="text-[#aaa] text-xs font-bold uppercase tracking-widest px-4 py-3">Photos ({photos.length})</p>
            {photos.map((photo) => (
              <Link key={photo.id} href={`/photo/${photo.id}?jobId=${photo.jobId}`} className="flex items-center gap-3 px-4 py-3 bg-[#1A1A1A] mx-4 mb-2 rounded-xl">
                {photo.url && <img src={photo.url} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  {photo.job && <p className="text-[#4CAF50] text-xs font-bold uppercase tracking-widest">{photo.job.referenceCode} · {photo.job.name}</p>}
                  {photo.notes && <p className="text-[#ccc] text-sm truncate mt-0.5">{photo.notes}</p>}
                  <p className="text-[#555] text-xs mt-0.5">{new Date(photo.takenAt).toLocaleDateString()}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
