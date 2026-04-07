'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { getJob, updateJob } from '@/lib/db';

export default function EditJobPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const jobId = Number(id);

  const [refCode, setRefCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getJob(jobId).then((job) => {
      if (job) {
        setRefCode(job.referenceCode);
        setName(job.name);
        setDescription(job.description ?? '');
      }
    });
  }, [jobId]);

  const save = async () => {
    if (!refCode.trim()) return alert('Please enter a reference code.');
    if (!name.trim()) return alert('Please enter a job name.');
    setSaving(true);
    await updateJob(jobId, refCode.trim(), name.trim(), description.trim());
    router.back();
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#121212]">
      <header className="flex items-center gap-3 px-4 bg-[#1A1A1A] border-b border-[#2A2A2A] sticky top-0 z-10" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))', paddingBottom: '12px' }}>
        <button onClick={() => router.back()} className="text-[#4CAF50] text-sm font-semibold">Cancel</button>
        <h1 className="flex-1 text-center font-bold">Edit Job</h1>
        <button onClick={save} disabled={saving} className="text-[#4CAF50] text-sm font-semibold disabled:opacity-40">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </header>

      <main className="flex-1 p-4 space-y-5">
        <div className="space-y-1.5">
          <label className="text-[#aaa] text-xs font-bold uppercase tracking-wider">Reference Code *</label>
          <input
            className="w-full bg-[#1E1E1E] text-white rounded-xl px-4 py-3.5 text-base border border-[#2A2A2A] outline-none focus:border-[#4CAF50]"
            value={refCode}
            onChange={(e) => setRefCode(e.target.value.toUpperCase())}
            autoCapitalize="characters"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[#aaa] text-xs font-bold uppercase tracking-wider">Job Name *</label>
          <input
            className="w-full bg-[#1E1E1E] text-white rounded-xl px-4 py-3.5 text-base border border-[#2A2A2A] outline-none focus:border-[#4CAF50]"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[#aaa] text-xs font-bold uppercase tracking-wider">Description</label>
          <textarea
            className="w-full bg-[#1E1E1E] text-white rounded-xl px-4 py-3.5 text-base border border-[#2A2A2A] outline-none focus:border-[#4CAF50] min-h-[100px] resize-none"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <button onClick={save} disabled={saving} className="w-full bg-[#4CAF50] text-white rounded-xl py-4 font-bold text-base disabled:opacity-40">
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </main>
    </div>
  );
}
