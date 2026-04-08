import Dexie, { type Table } from 'dexie';

export interface Job {
  id?: number;
  referenceCode: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface Photo {
  id?: number;
  jobId: number;
  blob: Blob;
  notes: string;
  takenAt: string;
  hasTimestamp: boolean;
  filename: string; // e.g. IMG_4378.jpg
}

export interface Setting {
  key: string;
  value: string;
}

class FieldShotsDB extends Dexie {
  jobs!: Table<Job>;
  photos!: Table<Photo>;
  settings!: Table<Setting>;

  constructor() {
    super('fieldshots');
    this.version(1).stores({
      jobs: '++id, referenceCode, name, updatedAt',
      photos: '++id, jobId, takenAt',
      settings: 'key',
    });
    // v2: add filename field to photos
    this.version(2).stores({
      jobs: '++id, referenceCode, name, updatedAt',
      photos: '++id, jobId, takenAt',
      settings: 'key',
    }).upgrade(async (tx) => {
      // Assign IMG filenames to existing photos based on their id
      await tx.table('photos').toCollection().modify((photo: any) => {
        if (!photo.filename) {
          photo.filename = `IMG_${String(photo.id).padStart(4, '0')}.jpg`;
        }
      });
      // Seed the counter based on highest existing id
      const count = await tx.table('photos').count();
      await tx.table('settings').put({ key: 'imgCounter', value: String(count) });
    });
  }
}

export const db = new FieldShotsDB();

// Seed default settings
db.on('ready', async () => {
  const [ts, counter] = await Promise.all([
    db.settings.get('showTimestamp'),
    db.settings.get('imgCounter'),
  ]);
  if (!ts) await db.settings.put({ key: 'showTimestamp', value: 'true' });
  if (!counter) await db.settings.put({ key: 'imgCounter', value: '0' });
});

async function nextImgFilename(): Promise<string> {
  const row = await db.settings.get('imgCounter');
  const next = (parseInt(row?.value ?? '0', 10) + 1);
  await db.settings.put({ key: 'imgCounter', value: String(next) });
  return `IMG_${String(next).padStart(4, '0')}.jpg`;
}

// --- Jobs ---

export async function getJobs(): Promise<(Job & { photoCount: number })[]> {
  const jobs = await db.jobs.orderBy('updatedAt').reverse().toArray();
  const counts = await Promise.all(
    jobs.map((j) => db.photos.where('jobId').equals(j.id!).count())
  );
  return jobs.map((j, i) => ({ ...j, photoCount: counts[i] }));
}

export async function getJob(id: number) {
  return db.jobs.get(id);
}

export async function createJob(referenceCode: string, name: string, description: string) {
  const now = new Date().toISOString();
  return db.jobs.add({ referenceCode, name, description, createdAt: now, updatedAt: now });
}

export async function updateJob(id: number, referenceCode: string, name: string, description: string) {
  return db.jobs.update(id, { referenceCode, name, description, updatedAt: new Date().toISOString() });
}

export async function deleteJob(id: number) {
  const photos = await db.photos.where('jobId').equals(id).toArray();
  await db.photos.bulkDelete(photos.map((p) => p.id!));
  await db.jobs.delete(id);
}

// --- Photos ---

export async function getPhotosForJob(jobId: number) {
  return db.photos.where('jobId').equals(jobId).reverse().sortBy('takenAt');
}

export async function getPhoto(id: number) {
  return db.photos.get(id);
}

export async function addPhoto(jobId: number, blob: Blob, hasTimestamp: boolean) {
  const now = new Date().toISOString();
  const filename = await nextImgFilename();
  const id = await db.photos.add({ jobId, blob, notes: '', takenAt: now, hasTimestamp, filename });
  await db.jobs.update(jobId, { updatedAt: now });
  return id;
}

export async function addPhotoFromFile(jobId: number, file: File) {
  const takenAt = file.lastModified ? new Date(file.lastModified).toISOString() : new Date().toISOString();
  const filename = await nextImgFilename();
  const id = await db.photos.add({ jobId, blob: file, notes: '', takenAt, hasTimestamp: false, filename });
  await db.jobs.update(jobId, { updatedAt: new Date().toISOString() });
  return id;
}

export async function updatePhotoNotes(id: number, notes: string) {
  return db.photos.update(id, { notes });
}

export async function deletePhoto(id: number) {
  return db.photos.delete(id);
}

export async function searchAll(query: string) {
  const q = query.toLowerCase();
  const [jobs, photos] = await Promise.all([
    db.jobs.filter((j) =>
      j.name.toLowerCase().includes(q) ||
      j.referenceCode.toLowerCase().includes(q) ||
      j.description.toLowerCase().includes(q)
    ).toArray(),
    db.photos.filter((p) => p.notes.toLowerCase().includes(q)).toArray(),
  ]);

  // Attach job info to photos
  const photosWithJob = await Promise.all(
    photos.map(async (p) => {
      const job = await db.jobs.get(p.jobId);
      return { ...p, job };
    })
  );

  return { jobs, photos: photosWithJob };
}

// --- Settings ---

export async function getSetting(key: string): Promise<string> {
  const row = await db.settings.get(key);
  return row?.value ?? 'true';
}

export async function setSetting(key: string, value: string) {
  return db.settings.put({ key, value });
}

// --- Helpers ---

export function blobToUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}
