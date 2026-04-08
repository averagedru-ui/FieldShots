'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getJobs, deleteJob, Job } from '@/lib/db';
import { IconSettings, IconSearch, IconPlus, IconX } from '@/components/Icons';

export default function JobsPage() {
  const [jobs, setJobs] = useState<(Job & { photoCount: number })[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    const data = await getJobs();
    setJobs(data);
    setLoaded(true);
  };

  useEffect(() => { load(); }, []);

  const confirmDelete = (job: Job & { photoCount: number }) => {
    if (!confirm(`Delete "${job.name}" and all ${job.photoCount} photo(s)? This cannot be undone.`)) return;
    deleteJob(job.id!).then(load);
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#121212]">
      <header className="flex items-center justify-between px-4 bg-[#1A1A1A] border-b border-[#2A2A2A] sticky top-0 z-10" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))', paddingBottom: 12 }}>
        <Link href="/settings" className="p-2 text-white">
          <IconSettings size={22} />
        </Link>
        <h1 className="text-lg font-bold tracking-tight">FieldShots</h1>
        <Link href="/search" className="p-2 text-white">
          <IconSearch size={22} />
        </Link>
      </header>

      <main className="flex-1 p-4 space-y-3 pb-24">
        {loaded && jobs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
            <span className="text-5xl">📋</span>
            <p className="text-white font-semibold text-lg">No jobs yet</p>
            <p className="text-[#888] text-sm">Tap + to create your first job</p>
          </div>
        )}
        {jobs.map((job) => (
          <div key={job.id} className="bg-[#1E1E1E] rounded-xl p-4 flex items-start justify-between gap-3">
            <Link href={`/jobs/${job.id}`} className="flex-1 min-w-0">
              <p className="text-[#4CAF50] text-xs font-bold uppercase tracking-widest">{job.referenceCode}</p>
              <p className="text-white font-semibold text-base mt-0.5 truncate">{job.name}</p>
              {job.description && <p className="text-[#888] text-sm mt-0.5 truncate">{job.description}</p>}
              <p className="text-[#555] text-xs mt-2">{new Date(job.updatedAt).toLocaleDateString()}</p>
            </Link>
            <div className="flex flex-col items-center gap-1">
              <span className="text-white font-bold text-xl">{job.photoCount}</span>
              <span className="text-[#888] text-xs">photos</span>
              <button onClick={() => confirmDelete(job)} className="mt-1 text-[#555] p-1 rounded hover:text-red-400">
                <IconX size={14} strokeWidth={2} />
              </button>
            </div>
          </div>
        ))}
      </main>

      <Link
        href="/jobs/new"
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-[#4CAF50] flex items-center justify-center text-white shadow-lg"
        style={{ bottom: 'max(24px, env(safe-area-inset-bottom))' }}
      >
        <IconPlus size={28} strokeWidth={2} />
      </Link>
    </div>
  );
}
