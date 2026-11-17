/**
 * On-device database. Every record lives only on this phone, inside the app's private
 * IndexedDB storage (Android app sandbox). Tables are loaded into memory at start-up and
 * written back to IndexedDB after every change. Files (photos, documents, logos) are
 * stored as Blobs in the same database.
 */

const DB_NAME = 'saleh-medical';
const DB_VERSION = 1;
const STORE = 'kv';

export type Row = Record<string, unknown> & { id?: string | number };

export const TABLES = [
  'clubs', 'players', 'player_emergency_contacts', 'medical_histories', 'medical_examinations', 'examination_findings',
  'injuries', 'injury_followups', 'treatments', 'rehabilitation_programs', 'rehabilitation_sessions', 'rtp_assessments',
  'medical_clearances', 'player_availability', 'medical_documents', 'team_seasons', 'team_exposures', 'audit_logs',
  'application_settings', 'sequences',
] as const;
export type Table = (typeof TABLES)[number];

let db: IDBDatabase | null = null;
const mem = new Map<Table, Row[]>();

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Unable to open the on-device database'));
  });
}
function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Database not ready'));
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r.result);
    t.onerror = () => reject(t.error ?? new Error('Database error'));
    t.onabort = () => reject(t.error ?? new Error('Database write was aborted (storage full?)'));
  });
}

let ready: Promise<void> | null = null;
/** Opens the database and loads every table into memory (call once before rendering). */
export function initDb(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      db = await open();
      for (const t of TABLES) {
        const rows = await tx<Row[] | undefined>('readonly', (s) => s.get(`t:${t}`));
        mem.set(t, Array.isArray(rows) ? rows : []);
      }
      // Ask the system not to evict our data under storage pressure.
      try { await navigator.storage?.persist?.(); } catch { /* not supported */ }
    })();
  }
  return ready;
}

const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export function all<T = Row>(t: Table): T[] { return clone(mem.get(t) ?? []) as T[]; }
export function find<T = Row>(t: Table, id: string | number | null | undefined): T | null {
  if (id === null || id === undefined) return null;
  const r = (mem.get(t) ?? []).find((x) => x.id === id);
  return r ? (clone(r) as T) : null;
}
/** Internal (not cloned) rows – for fast read-only lookups. */
export function raw(t: Table): readonly Row[] { return mem.get(t) ?? []; }

async function persist(t: Table) {
  await tx('readwrite', (s) => s.put(mem.get(t) ?? [], `t:${t}`));
}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
export const nowIso = () => new Date().toISOString();
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export async function insert<T = Row>(t: Table, row: Row): Promise<T> {
  const r: Row = { ...row };
  if (r.id === undefined || r.id === null) r.id = uuid();
  if (!('created_at' in r) || !r.created_at) r.created_at = nowIso();
  const list = mem.get(t) ?? [];
  list.push(r);
  mem.set(t, list);
  await persist(t);
  return clone(r) as T;
}
export async function insertMany(t: Table, rows: Row[]): Promise<Row[]> {
  const list = mem.get(t) ?? [];
  const out: Row[] = [];
  for (const row of rows) {
    const r: Row = { ...row };
    if (r.id === undefined || r.id === null) r.id = uuid();
    if (!r.created_at) r.created_at = nowIso();
    list.push(r); out.push(r);
  }
  mem.set(t, list);
  await persist(t);
  return clone(out);
}
export async function update<T = Row>(t: Table, id: string | number, patch: Row): Promise<T> {
  const list = mem.get(t) ?? [];
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) throw new Error('Record not found');
  const { id: _ignore, ...rest } = patch;
  void _ignore;
  list[i] = { ...list[i], ...rest };
  await persist(t);
  return clone(list[i]) as T;
}
export async function removeWhere(t: Table, pred: (r: Row) => boolean): Promise<Row[]> {
  const list = mem.get(t) ?? [];
  const removed = list.filter(pred);
  mem.set(t, list.filter((r) => !pred(r)));
  if (removed.length) await persist(t);
  return clone(removed);
}
export async function replaceTable(t: Table, rows: Row[]) {
  mem.set(t, rows);
  await persist(t);
}

/** Monotonic counters (record codes). */
export async function nextSeq(name: string): Promise<number> {
  const list = mem.get('sequences') ?? [];
  let s = list.find((x) => x.id === name);
  if (!s) { s = { id: name, value: 0 }; list.push(s); mem.set('sequences', list); }
  s.value = Number(s.value) + 1;
  await persist('sequences');
  return s.value as number;
}

// ---------------- Files ----------------
export async function putFile(path: string, blob: Blob) { await tx('readwrite', (s) => s.put(blob, `f:${path}`)); }
export async function getFile(path: string): Promise<Blob | null> {
  const b = await tx<Blob | undefined>('readonly', (s) => s.get(`f:${path}`));
  return b ?? null;
}
export async function deleteFile(path: string) { await tx('readwrite', (s) => s.delete(`f:${path}`)); }
export async function listFileKeys(): Promise<string[]> {
  const keys = await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
  return keys.map(String).filter((k) => k.startsWith('f:')).map((k) => k.slice(2));
}
const urlCache = new Map<string, string>();
/** Object URL for a stored file (cached for the lifetime of the app). */
export async function fileUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const hit = urlCache.get(path);
  if (hit) return hit;
  const b = await getFile(path);
  if (!b) return null;
  const u = URL.createObjectURL(b);
  urlCache.set(path, u);
  return u;
}

// ---------------- Local lock (password) ----------------
export async function getMeta<T>(key: string): Promise<T | null> {
  const v = await tx<T | undefined>('readonly', (s) => s.get(`m:${key}`));
  return v ?? null;
}
export async function setMeta(key: string, value: unknown) { await tx('readwrite', (s) => s.put(value, `m:${key}`)); }

// ---------------- Backup / restore ----------------
async function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}
function dataUrlToBlob(d: string): Blob {
  const [head, data] = d.split(',');
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'application/octet-stream';
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export const BACKUP_FORMAT = 'saleh-fathullah-medical-backup';
export async function exportBackup(app: string): Promise<Blob> {
  const tables: Record<string, Row[]> = {};
  for (const t of TABLES) tables[t] = mem.get(t) ?? [];
  const files: Record<string, string> = {};
  for (const k of await listFileKeys()) {
    const b = await getFile(k);
    if (b) files[k] = await blobToDataUrl(b);
  }
  const payload = { format: BACKUP_FORMAT, version: 1, application: app, generated_at: nowIso(), tables, files };
  return new Blob([JSON.stringify(payload)], { type: 'application/json' });
}

/** Replaces ALL data on this device with the content of a backup file. */
export async function importBackup(file: File): Promise<{ records: number; files: number }> {
  let payload: { format?: string; tables?: Record<string, Row[]>; files?: Record<string, string> };
  try { payload = JSON.parse(await file.text()); } catch { throw new Error('This file is not a valid backup.'); }
  if (payload.format !== BACKUP_FORMAT || !payload.tables) throw new Error('This file is not a backup of this application.');
  let records = 0;
  for (const t of TABLES) {
    const rows = Array.isArray(payload.tables[t]) ? payload.tables[t] : [];
    records += rows.length;
    await replaceTable(t, rows);
  }
  for (const k of await listFileKeys()) await deleteFile(k);
  urlCache.clear();
  const files = Object.entries(payload.files ?? {});
  for (const [k, v] of files) await putFile(k, dataUrlToBlob(v));
  return { records, files: files.length };
}
