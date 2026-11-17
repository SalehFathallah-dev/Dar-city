/**
 * Data access layer – fully offline. All records are stored on this device only
 * (see localdb.ts). The business rules that the original server enforced with
 * database triggers (record codes, BMI, versioned medical history, clearance
 * history, return-to-play dates, audit trail …) are reproduced here.
 */
import * as db from './localdb';
import type { Row, Table } from './localdb';
import type {
  BrandSettings, Club, ClubMember, Availability, AuditLog, Clearance, EmergencyContact, Examination, ExamFinding, Exposure, Followup, Injury,
  MedicalDocument, MedicalHistory, Player, Profile, RehabProgram, RehabSession, RtpAssessment, Season,
  TeamAvailabilityRow, Treatment,
} from './types';
import { ALLOWED_DOC_TYPES, APP, MAX_DOC_BYTES, MAX_PHOTO_BYTES } from './constants';

export const LOCAL_USER_ID = 'local-physician';

// ---------------- Club scope ----------------
let activeClubId: string | null = null;
export function setActiveClub(id: string | null) { activeClubId = id; }
export function getActiveClub() { return activeClubId; }
/** 'all' = every club (overview, combined exports). */
export type ClubScope = string | 'all' | undefined;
function inScope(club?: ClubScope): (r: Row) => boolean {
  const c = club ?? activeClubId;
  if (c === 'all') return () => true;
  if (!c) throw new Error('No club selected');
  return (r) => r.club_id === c;
}
function requireClub(): string {
  if (!activeClubId) throw new Error('Select a club first');
  return activeClubId;
}

/** Converts empty strings to null so optional fields are stored cleanly. */
export function clean<T extends Row>(obj: T): T {
  const out: Row = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v;
  }
  return out as T;
}

// ---------------- helpers ----------------
type SortKey = [string, ('asc' | 'desc')?];
function cmp(a: unknown, b: unknown): number {
  const an = a === null || a === undefined || a === '';
  const bn = b === null || b === undefined || b === '';
  if (an && bn) return 0;
  if (an) return 1; // nulls last
  if (bn) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return String(a).localeCompare(String(b));
}
function sortRows<T>(rows: T[], ...keys: SortKey[]): T[] {
  return rows.sort((x, y) => {
    for (const [k, dir] of keys) {
      const a = (x as Row)[k]; const b = (y as Row)[k];
      const an = a === null || a === undefined || a === ''; const bn = b === null || b === undefined || b === '';
      if (an || bn) { const c = cmp(a, b); if (c) return c; continue; }
      const c = cmp(a, b);
      if (c) return dir === 'desc' ? -c : c;
    }
    return 0;
  });
}
const pad = (n: number, w: number) => String(n).padStart(w, '0');
const round1 = (n: number) => Math.round(n * 10) / 10;
function bmiOf(h: unknown, w: unknown): number | null {
  const hn = Number(h); const wn = Number(w);
  return hn > 0 && wn > 0 ? round1(wn / ((hn / 100) * (hn / 100))) : null;
}
function playerJoin(id: unknown) {
  const p = db.raw('players').find((x) => x.id === id);
  return p ? { full_name: p.full_name, player_code: p.player_code, jersey_number: p.jersey_number, position: p.position } : undefined;
}
function injuryJoin(id: unknown) {
  const i = db.raw('injuries').find((x) => x.id === id);
  return i ? { injury_code: i.injury_code, diagnosis: i.diagnosis, body_region: i.body_region, injury_type: i.injury_type, injury_date: i.injury_date } : undefined;
}
function clubOfPlayer(playerId: unknown): string {
  const p = db.raw('players').find((x) => x.id === playerId);
  if (!p) throw new Error('Parent record not found');
  return p.club_id as string;
}
function strip(row: Row, ...keys: string[]) { for (const k of keys) delete row[k]; return row; }
function getOne<T>(t: Table, id: string, club?: ClubScope): T {
  const r = db.find<Row>(t, id);
  if (!r || !inScope(club)(r)) throw new Error('Record not found');
  return r as T;
}

// ---------------- Audit trail ----------------
const AUDIT_KEEP = 5000;
async function audit(action: string, recordType: string, recordId: string | number | null | undefined, oldV: Row | null, newV: Row | null, clubId?: unknown) {
  try {
    let o = oldV; let n = newV;
    if (action === 'UPDATE' && oldV && newV) {
      const changed = Object.keys(newV).filter((k) => k !== 'updated_at' && JSON.stringify(newV[k]) !== JSON.stringify(oldV[k]));
      if (!changed.length) return;
      n = Object.fromEntries(changed.map((k) => [k, newV[k]]));
      o = Object.fromEntries(changed.map((k) => [k, oldV[k]]));
    }
    const id = await db.nextSeq('audit_logs');
    await db.insert('audit_logs', {
      id, club_id: (clubId as string) ?? null, user_id: LOCAL_USER_ID, action, record_type: recordType,
      record_id: recordId === null || recordId === undefined ? null : String(recordId), old_values: o, new_values: n,
    });
    const logs = db.raw('audit_logs');
    if (logs.length > AUDIT_KEEP + 500) await db.replaceTable('audit_logs', [...logs].slice(-AUDIT_KEEP));
  } catch { /* audit is best-effort */ }
}
async function ins<T>(t: Table, row: Row): Promise<T> {
  const saved = await db.insert<Row>(t, row);
  await audit('INSERT', t, saved.id as string, null, saved, t === 'clubs' ? saved.id : saved.club_id);
  return saved as T;
}
async function upd<T>(t: Table, id: string, patch: Row): Promise<T> {
  const old = db.find<Row>(t, id);
  if (!old) throw new Error('Record not found');
  const saved = await db.update<Row>(t, id, patch);
  await audit('UPDATE', t, id, old, saved, t === 'clubs' ? id : saved.club_id);
  return saved as T;
}

// ---------------- Bootstrap ----------------
const DEFAULT_SETTINGS: [string, unknown, string][] = [
  ['physician_name', APP.physician, 'Physician name printed on reports'],
  ['department', 'ORTHOPEDIC & SPORTS MEDICINE', 'Department shown on PDF headers'],
  ['default_team_category', 'Senior Men', 'Default roster category for new players'],
  ['report_footer', `CONFIDENTIAL MEDICAL DOCUMENT – ${APP.physician}`, 'Footer printed on every PDF page'],
  ['brand_name', '', 'Medical brand – name (empty = default)'],
  ['brand_specialty', '', 'Medical brand – specialty (empty = default)'],
  ['brand_contact', '', 'Medical brand – contact line'],
  ['brand_logo_path', '', 'Medical brand – uploaded logo (empty = official default logo)'],
  ['brand_signature_path', '', 'Medical brand – signature image'],
];
/** Opens the on-device database and creates default settings on first launch. */
export async function bootstrap() {
  await db.initDb();
  const have = new Set(db.raw('application_settings').map((r) => r.key));
  for (const [key, value, description] of DEFAULT_SETTINGS) {
    if (!have.has(key)) await db.insert('application_settings', { id: key, key, value, description });
  }
}

// ---------------- Profile (single local user) ----------------
function localProfile(): Profile {
  const name = (db.raw('application_settings').find((r) => r.key === 'physician_name')?.value as string) || APP.physician;
  return { id: LOCAL_USER_ID, full_name: name, email: null, title: APP.specialty, role: 'team_physician', is_active: true, created_at: '2026-01-01T00:00:00Z' };
}
export async function getMyProfile(_userId?: string): Promise<Profile | null> { return localProfile(); }
export async function listProfiles(): Promise<Profile[]> { return [localProfile()]; }
export async function updateProfile(_id: string, patch: Partial<Profile>) {
  if (patch.full_name) await saveSetting('physician_name', patch.full_name);
  return localProfile();
}
export async function adminCreateUser(_payload: { email: string; password: string; full_name: string; role: string; title?: string; club_ids?: string[] }): Promise<never> {
  throw new Error('This is a single-user offline application. Additional user accounts are not available.');
}

// ---------------- Seasons & settings ----------------
export async function listSeasons(club?: ClubScope): Promise<Season[]> {
  return sortRows(db.all<Row>('team_seasons').filter(inScope(club)), ['start_date', 'desc']) as unknown as Season[];
}
export async function saveSeason(s: Partial<Season>) {
  const row = clean(s as Row);
  const clubId = (s.id ? db.find<Row>('team_seasons', s.id)?.club_id : requireClub()) as string;
  const dup = db.raw('team_seasons').find((x) => x.club_id === clubId && x.id !== s.id && String(x.name).toLowerCase() === String(row.name ?? '').toLowerCase());
  if (dup) throw new Error('A season with this name already exists for this club.');
  if (row.is_current) {
    for (const x of db.raw('team_seasons').filter((x) => x.club_id === clubId && x.is_current && x.id !== s.id)) await upd('team_seasons', x.id as string, { is_current: false });
  }
  const saved: Season = s.id
    ? await upd('team_seasons', s.id, strip(row, 'club_id'))
    : await ins('team_seasons', { is_current: false, notes: null, ...row, club_id: clubId });
  if (saved.is_current) await upd('clubs', saved.club_id, { current_season: saved.name, updated_at: db.nowIso() });
  return saved;
}
export async function getSettings(): Promise<Record<string, unknown>> {
  return Object.fromEntries(db.raw('application_settings').map((r) => [r.key as string, r.value]));
}
export async function listSettingsRows(): Promise<{ key: string; value: unknown; description: string | null }[]> {
  return sortRows(db.all<Row>('application_settings').filter((r) => !String(r.key).startsWith('brand_')), ['key'])
    .map((r) => ({ key: r.key as string, value: r.value, description: (r.description as string) ?? null }));
}
export async function saveSetting(key: string, value: unknown) {
  if (db.find('application_settings', key)) return upd('application_settings', key, { value });
  return ins('application_settings', { id: key, key, value, description: null });
}

// ---------------- Players ----------------
function validatePlayer(r: Row, id: string | undefined, clubId: string) {
  if (r.date_of_birth) {
    const limit = new Date(); limit.setFullYear(limit.getFullYear() - 10);
    if (new Date(String(r.date_of_birth)) > limit) throw new Error('Date of birth is not valid for a registered player.');
  }
  const status = r.status ?? 'active';
  if (r.jersey_number !== null && r.jersey_number !== undefined && status === 'active') {
    const clash = db.raw('players').find((p) => p.club_id === clubId && p.id !== id && p.status === 'active' && p.jersey_number === r.jersey_number);
    if (clash) throw new Error('This jersey number is already used by another active player in this roster.');
  }
}
export async function listPlayers(opts: { includeArchived?: boolean; club?: ClubScope } = {}): Promise<Player[]> {
  let rows = db.all<Row>('players').filter(inScope(opts.club));
  if (!opts.includeArchived) rows = rows.filter((p) => p.status !== 'archived');
  return sortRows(rows, ['jersey_number'], ['full_name']) as unknown as Player[];
}
export async function getPlayer(id: string): Promise<Player> { return getOne<Player>('players', id); }
export async function savePlayer(p: Partial<Player>): Promise<Player> {
  const row = clean({ ...p } as Row);
  strip(row, 'bmi', 'player_code', 'created_at', 'updated_at', 'archived_at', 'club_id');
  if (p.id) {
    const old = db.find<Row>('players', p.id)!;
    const merged = { ...old, ...row };
    validatePlayer(merged, p.id, old.club_id as string);
    if (merged.full_name) row.full_name = String(merged.full_name).trim();
    row.bmi = bmiOf(merged.height_cm, merged.weight_kg);
    row.updated_at = db.nowIso();
    if (row.status && row.status !== old.status) row.archived_at = row.status === 'archived' ? db.nowIso() : null;
    return upd('players', p.id, row);
  }
  delete row.id;
  const clubId = requireClub();
  validatePlayer(row, undefined, clubId);
  const club = db.find<Row>('clubs', clubId)!;
  const n = Number(club.player_counter ?? 0) + 1;
  await db.update('clubs', clubId, { player_counter: n });
  return ins('players', {
    status: 'active', team_category: 'Senior Men', registration_date: db.today(), season_id: null, photo_path: null, is_demo: false,
    ...row, club_id: clubId, player_code: `${club.player_id_prefix}-${pad(n, 4)}`, bmi: bmiOf(row.height_cm, row.weight_kg),
    archived_at: row.status === 'archived' ? db.nowIso() : null, updated_at: db.nowIso(),
  });
}
export async function setPlayerStatus(id: string, status: Player['status']) {
  const old = db.find<Row>('players', id)!;
  if (status === 'active') validatePlayer({ ...old, status }, id, old.club_id as string);
  return upd('players', id, { status, archived_at: status === 'archived' ? db.nowIso() : null, updated_at: db.nowIso() });
}
export async function uploadPlayerPhoto(playerId: string, file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Photo must be a JPG, PNG or WEBP image.');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('Photo must be smaller than 5 MB.');
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `player-photos/${playerId}/${Date.now()}.${ext}`;
  await db.putFile(path, file);
  await upd('players', playerId, { photo_path: path });
  return path;
}
export async function getPhotoUrl(path: string | null): Promise<string | null> { return db.fileUrl(path); }

export async function listContacts(playerId: string): Promise<EmergencyContact[]> {
  return sortRows(db.all<Row>('player_emergency_contacts').filter((c) => c.player_id === playerId), ['created_at']) as unknown as EmergencyContact[];
}
export async function listAllContacts(club?: ClubScope): Promise<EmergencyContact[]> {
  return db.all<Row>('player_emergency_contacts').filter(inScope(club)) as unknown as EmergencyContact[];
}
export async function saveContact(c: Partial<EmergencyContact>) {
  const row = clean(c as Row);
  if (c.id) return upd('player_emergency_contacts', c.id, strip(row, 'club_id'));
  delete row.id;
  return ins('player_emergency_contacts', { is_primary: true, ...row, club_id: clubOfPlayer(row.player_id) });
}

// ---------------- Medical history ----------------
export async function listHistories(playerId?: string, club?: ClubScope): Promise<MedicalHistory[]> {
  let rows = db.all<Row>('medical_histories').filter(inScope(club));
  if (playerId) rows = rows.filter((h) => h.player_id === playerId);
  return sortRows(rows, ['version', 'desc']) as unknown as MedicalHistory[];
}
export async function addHistoryVersion(h: Partial<MedicalHistory>) {
  const row = clean(h as Row);
  strip(row, 'id', 'version', 'is_current', 'created_at', 'created_by', 'club_id');
  const mine = db.raw('medical_histories').filter((x) => x.player_id === row.player_id);
  const version = mine.reduce((m, x) => Math.max(m, Number(x.version)), 0) + 1;
  for (const x of mine.filter((x) => x.is_current)) await db.update('medical_histories', x.id as string, { is_current: false });
  return ins('medical_histories', { ...row, club_id: clubOfPlayer(row.player_id), version, is_current: true, created_by: LOCAL_USER_ID });
}

// ---------------- Examinations ----------------
export async function listExaminations(playerId?: string, club?: ClubScope): Promise<Examination[]> {
  let rows = db.all<Row>('medical_examinations').filter(inScope(club)).filter((e) => !e.is_archived);
  if (playerId) rows = rows.filter((e) => e.player_id === playerId);
  return sortRows(rows, ['examination_date', 'desc']).map((e) => ({ ...e, players: playerJoin(e.player_id) })) as unknown as Examination[];
}
export async function getExamination(id: string): Promise<{ exam: Examination; findings: ExamFinding[] }> {
  const e = getOne<Row>('medical_examinations', id);
  const exam = { ...e, players: playerJoin(e.player_id) } as unknown as Examination;
  const findings = db.all<Row>('examination_findings').filter((f) => f.examination_id === id) as unknown as ExamFinding[];
  return { exam, findings };
}
async function recordExamClearance(e: Row, old: Row | null) {
  if (e.clearance_status && (!old || e.clearance_status !== old.clearance_status || e.clearance_restrictions !== old.clearance_restrictions)) {
    const n = await db.nextSeq('clearance_code');
    await ins('medical_clearances', {
      clearance_code: `CLR-${pad(n, 5)}`, club_id: e.club_id, player_id: e.player_id, examination_id: e.id, rtp_assessment_id: null,
      clearance_status: e.clearance_status, restrictions: e.clearance_restrictions ?? null, valid_until: null, decision_date: e.examination_date,
      physician_name: e.physician_name, signature: e.physician_signature ?? '', notes: `Recorded from examination ${e.exam_code}`, is_demo: false, created_by: LOCAL_USER_ID,
    });
  }
}
export async function saveExamination(exam: Partial<Examination>, findings: ExamFinding[]): Promise<Examination> {
  const row = clean({ ...exam } as Row);
  strip(row, 'players', 'bmi', 'exam_code', 'created_at', 'club_id');
  if (row.clearance_status && !exam.signed_at) row.signed_at = db.nowIso();
  let saved: Row;
  if (exam.id) {
    const old = db.find<Row>('medical_examinations', exam.id)!;
    const merged = { ...old, ...row };
    saved = await upd('medical_examinations', exam.id, { ...row, bmi: bmiOf(merged.height_cm, merged.weight_kg) });
    await recordExamClearance(saved, old);
  } else {
    delete row.id;
    const n = await db.nextSeq('exam_code');
    saved = await ins('medical_examinations', {
      is_archived: false, is_demo: false, ...row, club_id: clubOfPlayer(row.player_id), exam_code: `EXM-${pad(n, 5)}`, bmi: bmiOf(row.height_cm, row.weight_kg),
    });
    await recordExamClearance(saved, null);
  }
  const meaningful = findings.filter((f) => f.is_normal !== null || f.clinical_findings || f.pain || f.range_of_motion || f.muscle_strength || f.joint_stability || f.special_tests || f.notes);
  for (const f of meaningful) {
    const r = clean({ ...f } as unknown as Row);
    delete r.id;
    const existing = db.raw('examination_findings').find((x) => x.examination_id === saved.id && x.region === f.region);
    if (existing) await db.update('examination_findings', existing.id as string, { ...r, examination_id: saved.id });
    else await db.insert('examination_findings', { ...r, examination_id: saved.id, club_id: saved.club_id });
  }
  return saved as unknown as Examination;
}
export async function archiveExamination(id: string) { return upd('medical_examinations', id, { is_archived: true }); }

// ---------------- Injuries ----------------
export async function listInjuries(opts: { playerId?: string; includeArchived?: boolean; club?: ClubScope } = {}): Promise<Injury[]> {
  let rows = db.all<Row>('injuries').filter(inScope(opts.club));
  if (opts.playerId) rows = rows.filter((i) => i.player_id === opts.playerId);
  if (!opts.includeArchived) rows = rows.filter((i) => !i.is_archived);
  return sortRows(rows, ['injury_date', 'desc']).map((i) => ({ ...i, players: playerJoin(i.player_id) })) as unknown as Injury[];
}
export async function getInjury(id: string): Promise<Injury> {
  const i = getOne<Row>('injuries', id);
  return { ...i, players: playerJoin(i.player_id) } as unknown as Injury;
}
function injuryDates(r: Row, old: Row | null) {
  const status = r.status ?? old?.status;
  if (status === 'Closed') { if (!(r.closed_date ?? old?.closed_date)) r.closed_date = db.today(); }
  else if (status) r.closed_date = null;
  return r;
}
export async function saveInjury(i: Partial<Injury>): Promise<Injury> {
  const row = clean({ ...i } as Row);
  strip(row, 'players', 'injury_code', 'created_at', 'updated_at', 'club_id');
  if (i.id) {
    const old = db.find<Row>('injuries', i.id)!;
    return upd('injuries', i.id, { ...injuryDates(row, old), updated_at: db.nowIso() });
  }
  delete row.id;
  const n = await db.nextSeq('injury_code');
  return ins('injuries', injuryDates({
    severity: 'To Be Determined', status: 'Newly Recorded', is_recurrent: false, is_archived: false, is_demo: false, return_to_play_date: null, closed_date: null,
    ...row, club_id: clubOfPlayer(row.player_id), injury_code: `INJ-${pad(n, 5)}`, updated_at: db.nowIso(),
  }, null));
}
export async function updateInjuryStatus(id: string, status: string, extra: Partial<Injury> = {}) {
  const old = db.find<Row>('injuries', id)!;
  return upd('injuries', id, { ...injuryDates(clean({ status, ...extra } as Row), old), updated_at: db.nowIso() });
}

function clubOfInjury(injuryId: unknown): string {
  const i = db.raw('injuries').find((x) => x.id === injuryId);
  if (!i) throw new Error('Parent record not found');
  return i.club_id as string;
}
export async function listFollowups(injuryId?: string, club?: ClubScope): Promise<Followup[]> {
  let rows = db.all<Row>('injury_followups').filter(inScope(club));
  if (injuryId) rows = rows.filter((f) => f.injury_id === injuryId);
  return sortRows(rows, ['followup_date'], ['created_at']) as unknown as Followup[];
}
export async function saveFollowup(f: Partial<Followup>) {
  const row = clean(f as Row);
  strip(row, 'created_at', 'created_by', 'club_id');
  if (f.id) return upd('injury_followups', f.id, row);
  delete row.id;
  return ins('injury_followups', { ...row, club_id: clubOfInjury(row.injury_id), created_by: LOCAL_USER_ID });
}

export async function listTreatments(injuryId?: string, club?: ClubScope): Promise<Treatment[]> {
  let rows = db.all<Row>('treatments').filter(inScope(club));
  if (injuryId) rows = rows.filter((t) => t.injury_id === injuryId);
  return sortRows(rows, ['treatment_date'], ['created_at']) as unknown as Treatment[];
}
export async function addTreatments(rows: Partial<Treatment>[]) {
  const out: Treatment[] = [];
  for (const r of rows) {
    const row = clean(r as Row);
    out.push(await ins('treatments', { ...row, club_id: clubOfInjury(row.injury_id), created_by: LOCAL_USER_ID }));
  }
  return out;
}

// ---------------- Rehabilitation ----------------
function checkInjuryPlayer(r: Row) {
  if (!db.raw('injuries').some((i) => i.id === r.injury_id && i.player_id === r.player_id)) throw new Error('The selected injury does not belong to this player.');
}
const withPI = (r: Row) => ({ ...r, players: playerJoin(r.player_id), injuries: injuryJoin(r.injury_id) });
export async function listRehabPrograms(opts: { playerId?: string; injuryId?: string; club?: ClubScope } = {}): Promise<RehabProgram[]> {
  let rows = db.all<Row>('rehabilitation_programs').filter(inScope(opts.club));
  if (opts.playerId) rows = rows.filter((r) => r.player_id === opts.playerId);
  if (opts.injuryId) rows = rows.filter((r) => r.injury_id === opts.injuryId);
  return sortRows(rows, ['start_date', 'desc']).map(withPI) as unknown as RehabProgram[];
}
export async function getRehabProgram(id: string): Promise<RehabProgram> { return withPI(getOne<Row>('rehabilitation_programs', id)) as unknown as RehabProgram; }
export async function saveRehabProgram(r: Partial<RehabProgram>): Promise<RehabProgram> {
  const row = clean({ ...r } as Row);
  strip(row, 'players', 'injuries', 'program_code', 'created_at', 'phase_approved_at', 'club_id');
  if (r.id) {
    const old = db.find<Row>('rehabilitation_programs', r.id)!;
    const merged = { ...old, ...row };
    checkInjuryPlayer(merged);
    if (row.current_phase && row.current_phase !== old.current_phase) {
      if (!merged.phase_approved_by || String(merged.phase_approved_by).trim().length < 2) throw new Error('A phase change must be approved by the physician (approver name required).');
      row.phase_approved_at = db.nowIso();
    }
    return upd('rehabilitation_programs', r.id, row);
  }
  delete row.id;
  checkInjuryPlayer(row);
  const n = await db.nextSeq('rehab_code');
  return ins('rehabilitation_programs', {
    current_phase: 'Acute Phase', status: 'Active', is_demo: false, phase_approved_at: null,
    ...row, club_id: clubOfPlayer(row.player_id), program_code: `RHB-${pad(n, 5)}`,
  });
}
export async function listRehabSessions(programId?: string, club?: ClubScope): Promise<RehabSession[]> {
  let rows = db.all<Row>('rehabilitation_sessions').filter(inScope(club));
  if (programId) rows = rows.filter((s) => s.program_id === programId);
  return sortRows(rows, ['session_date'], ['created_at']) as unknown as RehabSession[];
}
export async function saveRehabSession(s: Partial<RehabSession>) {
  const row = clean(s as Row);
  strip(row, 'created_at', 'created_by', 'club_id');
  if (s.id) return upd('rehabilitation_sessions', s.id, row);
  delete row.id;
  const prog = db.raw('rehabilitation_programs').find((p) => p.id === row.program_id);
  if (!prog) throw new Error('Parent record not found');
  return ins('rehabilitation_sessions', { ...row, club_id: prog.club_id, created_by: LOCAL_USER_ID });
}

// ---------------- RTP & clearance ----------------
export async function listRtp(opts: { playerId?: string; injuryId?: string; club?: ClubScope } = {}): Promise<RtpAssessment[]> {
  let rows = db.all<Row>('rtp_assessments').filter(inScope(opts.club));
  if (opts.playerId) rows = rows.filter((r) => r.player_id === opts.playerId);
  if (opts.injuryId) rows = rows.filter((r) => r.injury_id === opts.injuryId);
  return sortRows(rows, ['decision_date', 'desc'], ['created_at', 'desc']).map(withPI) as unknown as RtpAssessment[];
}
export async function getRtp(id: string): Promise<RtpAssessment> { return withPI(getOne<Row>('rtp_assessments', id)) as unknown as RtpAssessment; }
export async function createRtp(r: Partial<RtpAssessment>): Promise<RtpAssessment> {
  const row = clean({ ...r } as Row);
  strip(row, 'id', 'players', 'injuries', 'rtp_code', 'created_at', 'club_id');
  checkInjuryPlayer(row);
  const n = await db.nextSeq('rtp_code');
  const saved = await ins<RtpAssessment>('rtp_assessments', { is_demo: false, ...row, club_id: clubOfPlayer(row.player_id), rtp_code: `RTP-${pad(n, 5)}` });
  if (saved.decision === 'Cleared for Full Training' || saved.decision === 'Cleared for Competition') {
    const inj = db.find<Row>('injuries', saved.injury_id);
    if (inj) {
      const cur = inj.return_to_play_date as string | null;
      const d = !cur || saved.decision_date < cur ? saved.decision_date : cur;
      if (d !== cur) await upd('injuries', inj.id as string, { return_to_play_date: d });
    }
  }
  return saved;
}
export async function listClearances(playerId?: string, club?: ClubScope): Promise<Clearance[]> {
  let rows = db.all<Row>('medical_clearances').filter(inScope(club));
  if (playerId) rows = rows.filter((c) => c.player_id === playerId);
  return sortRows(rows, ['decision_date', 'desc'], ['created_at', 'desc']).map((c) => ({ ...c, players: playerJoin(c.player_id) })) as unknown as Clearance[];
}
export async function createClearance(c: Partial<Clearance>) {
  const row = clean({ ...c } as Row);
  strip(row, 'id', 'players', 'clearance_code', 'created_at', 'club_id');
  const n = await db.nextSeq('clearance_code');
  return ins('medical_clearances', { examination_id: null, rtp_assessment_id: null, is_demo: false, ...row, club_id: clubOfPlayer(row.player_id), clearance_code: `CLR-${pad(n, 5)}`, created_by: LOCAL_USER_ID });
}

// ---------------- Availability ----------------
export async function listAvailability(playerId?: string, club?: ClubScope): Promise<Availability[]> {
  let rows = db.all<Row>('player_availability').filter(inScope(club));
  if (playerId) rows = rows.filter((a) => a.player_id === playerId);
  return sortRows(rows, ['effective_date', 'desc'], ['created_at', 'desc']) as unknown as Availability[];
}
export async function addAvailability(a: Partial<Availability>) {
  const row = clean(a as Row);
  strip(row, 'id', 'created_at', 'created_by', 'club_id');
  return ins('player_availability', { effective_date: db.today(), shared_with_staff: true, ...row, club_id: clubOfPlayer(row.player_id), created_by: LOCAL_USER_ID });
}
export async function getTeamAvailability(club?: ClubScope): Promise<TeamAvailabilityRow[]> {
  const c = club ?? activeClubId;
  const clubs = db.raw('clubs');
  const players = db.raw('players').filter((p) => p.status === 'active' && (c === 'all' || !c || p.club_id === c));
  const maxOf = (vals: unknown[]) => vals.filter(Boolean).map(String).sort().pop() ?? null;
  const rows = players.map((p) => {
    const a = sortRows(db.raw('player_availability').filter((x) => x.player_id === p.id && x.shared_with_staff), ['effective_date', 'desc'], ['created_at', 'desc'])[0];
    const injIds = new Set<unknown>(db.raw('injuries').filter((i) => i.player_id === p.id).map((i) => i.id));
    const last = maxOf([
      maxOf(db.raw('medical_examinations').filter((e) => e.player_id === p.id && !e.is_archived).map((e) => e.examination_date)),
      maxOf(db.raw('injury_followups').filter((f) => injIds.has(f.injury_id)).map((f) => f.followup_date)),
      maxOf(db.raw('rtp_assessments').filter((r) => r.player_id === p.id).map((r) => r.assessment_date)),
    ]);
    return {
      player_id: p.id, club_id: p.club_id, club_name: clubs.find((k) => k.id === p.club_id)?.short_name ?? '', player_code: p.player_code,
      full_name: p.full_name, jersey_number: p.jersey_number ?? null, position: p.position, team_category: p.team_category,
      availability: a?.availability ?? 'UNDER MEDICAL REVIEW', medical_status: a?.medical_status ?? 'Awaiting Assessment',
      restrictions: a?.restrictions ?? null, staff_notes: a?.staff_notes ?? null, effective_date: a?.effective_date ?? null,
      next_followup_date: a?.next_followup_date ?? null, last_assessment_date: last,
    } as Row;
  });
  return sortRows(rows, ['club_name'], ['jersey_number'], ['full_name']) as unknown as TeamAvailabilityRow[];
}

// ---------------- Documents ----------------
export async function listDocuments(opts: { playerId?: string; injuryId?: string; examinationId?: string } = {}): Promise<MedicalDocument[]> {
  let rows = db.all<Row>('medical_documents').filter(inScope()).filter((d) => !d.is_archived);
  if (opts.playerId) rows = rows.filter((d) => d.player_id === opts.playerId);
  if (opts.injuryId) rows = rows.filter((d) => d.injury_id === opts.injuryId);
  if (opts.examinationId) rows = rows.filter((d) => d.examination_id === opts.examinationId);
  return sortRows(rows, ['created_at', 'desc']).map((d) => {
    const p = playerJoin(d.player_id);
    return { ...d, players: p ? { full_name: p.full_name, player_code: p.player_code } : undefined };
  }) as unknown as MedicalDocument[];
}

/** Validates file signature (magic bytes) – not just the reported type. */
export async function sniffFileType(file: File): Promise<string | null> {
  const buf = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  return null;
}

export async function uploadDocument(meta: { player_id: string; injury_id?: string | null; examination_id?: string | null; category: string; title: string; description?: string; document_date?: string }, file: File) {
  const type = await sniffFileType(file);
  if (!type || !ALLOWED_DOC_TYPES[type]) throw new Error('Only PDF, JPG/JPEG and PNG files are accepted.');
  if (file.size > MAX_DOC_BYTES) throw new Error('File is larger than the 10 MB limit.');
  if (meta.injury_id && !db.raw('injuries').some((i) => i.id === meta.injury_id && i.player_id === meta.player_id)) throw new Error('The linked injury does not belong to this player.');
  if (meta.examination_id && !db.raw('medical_examinations').some((e) => e.id === meta.examination_id && e.player_id === meta.player_id)) throw new Error('The linked examination does not belong to this player.');
  const path = `medical-documents/${meta.player_id}/${db.uuid()}.${ALLOWED_DOC_TYPES[type]}`;
  await db.putFile(path, new Blob([await file.arrayBuffer()], { type }));
  try {
    return await ins('medical_documents', clean({
      injury_id: null, examination_id: null, is_archived: false, ...meta, club_id: clubOfPlayer(meta.player_id),
      file_path: path, file_name: file.name.slice(0, 200), mime_type: type, size_bytes: file.size,
    } as Row));
  } catch (e) {
    await db.deleteFile(path);
    throw e;
  }
}
/** Returns the stored file itself (opened/shared with the phone's apps). */
export async function getDocumentBlob(doc: MedicalDocument): Promise<Blob> {
  const b = await db.getFile(doc.file_path);
  if (!b) throw new Error('The file of this document was not found on this device.');
  void logEvent('VIEW_DOCUMENT', 'medical_documents', doc.id);
  return b;
}
export async function archiveDocument(id: string) { return upd('medical_documents', id, { is_archived: true }); }

// ---------------- Exposure, audit ----------------
export async function listExposures(club?: ClubScope): Promise<Exposure[]> {
  return sortRows(db.all<Row>('team_exposures').filter(inScope(club)), ['session_date', 'desc']) as unknown as Exposure[];
}
export async function addExposure(e: Partial<Exposure>) {
  return ins('team_exposures', { season_id: null, notes: null, ...clean(e as Row), club_id: requireClub() });
}
export async function deleteExposure(id: string) {
  const removed = await db.removeWhere('team_exposures', (r) => r.id === id);
  if (removed[0]) await audit('DELETE', 'team_exposures', id, removed[0], null, removed[0].club_id);
  return removed;
}
export async function listAuditLogs(opts: { limit?: number; recordType?: string; from?: string; to?: string; clubId?: string } = {}): Promise<AuditLog[]> {
  let rows = db.all<Row>('audit_logs');
  if (opts.recordType) rows = rows.filter((r) => r.record_type === opts.recordType);
  if (opts.clubId) rows = rows.filter((r) => r.club_id === opts.clubId);
  if (opts.from) rows = rows.filter((r) => String(r.created_at) >= opts.from!);
  if (opts.to) rows = rows.filter((r) => String(r.created_at) <= `${opts.to}T23:59:59`);
  return sortRows(rows, ['created_at', 'desc']).slice(0, opts.limit ?? 200) as unknown as AuditLog[];
}
export async function logEvent(action: string, recordType: string, recordId?: string | null, details?: Record<string, unknown>) {
  await audit(action, recordType, recordId ?? null, null, details ?? null, activeClubId);
}

// ---------------- Clubs ----------------
export async function listClubs(): Promise<Club[]> {
  return sortRows(db.all<Row>('clubs'), ['status'], ['created_at']) as unknown as Club[];
}
export async function getClub(id: string): Promise<Club> {
  const c = db.find<Club>('clubs', id);
  if (!c) throw new Error('Record not found');
  return c;
}
function makePrefix(shortName: string, id: string | undefined): string {
  let base = shortName.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4);
  if (base.length < 2) base = 'CLB';
  let candidate = base; let i = 1;
  while (db.raw('clubs').some((c) => c.player_id_prefix === candidate && c.id !== id)) { i += 1; candidate = base.slice(0, 4) + i; }
  return candidate;
}
export async function saveClub(c: Partial<Club>): Promise<Club> {
  const row = clean({ ...c } as Row);
  strip(row, 'club_code', 'player_counter', 'created_at', 'updated_at', 'is_demo');
  if (row.player_id_prefix) row.player_id_prefix = String(row.player_id_prefix).toUpperCase();
  if (c.id) {
    delete row.id;
    if ('player_id_prefix' in row && !row.player_id_prefix) row.player_id_prefix = makePrefix(String(row.short_name ?? db.find<Row>('clubs', c.id)?.short_name ?? ''), c.id);
    return upd('clubs', c.id, { ...row, updated_at: db.nowIso() });
  }
  delete row.id;
  const id = db.uuid();
  const n = await db.nextSeq('club_code');
  if (row.player_id_prefix && db.raw('clubs').some((x) => x.player_id_prefix === row.player_id_prefix)) throw new Error('This Player ID prefix is already used by another club.');
  return ins('clubs', {
    sport: 'Basketball', status: 'active', registration_date: db.today(), logo_url: null, current_season: null, ...row,
    id, club_code: `CLB-${pad(n, 4)}`, player_counter: 0, is_demo: false, updated_at: db.nowIso(),
    player_id_prefix: row.player_id_prefix || makePrefix(String(row.short_name ?? row.name ?? ''), id),
  });
}
export async function setClubStatus(id: string, status: Club['status']) { return upd('clubs', id, { status, updated_at: db.nowIso() }); }
export async function listClubMembers(clubId?: string): Promise<ClubMember[]> {
  return db.raw('clubs').filter((c) => !clubId || c.id === clubId).map((c) => ({ club_id: c.id as string, user_id: LOCAL_USER_ID, created_at: c.created_at as string }));
}
export async function addClubMember(_clubId: string, _userId: string) { return []; }
export async function removeClubMember(_clubId: string, _userId: string) { return []; }

/** Validates an image logo (PNG/JPG/WEBP, or SVG without scripts). */
export async function validateLogo(file: File): Promise<string> {
  if (file.size > 2 * 1024 * 1024) throw new Error('Logo must be smaller than 2 MB.');
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (head[0] === 0x89 && head[1] === 0x50) return 'image/png';
  if (head[0] === 0xff && head[1] === 0xd8) return 'image/jpeg';
  if (head[0] === 0x52 && head[1] === 0x49 && head[8] === 0x57 && head[9] === 0x45) return 'image/webp';
  const text = (await file.text()).slice(0, 200000);
  if (/<svg[\s>]/i.test(text)) {
    if (/<script|\son[a-z]+\s*=|javascript:|<foreignObject|<iframe|<embed|<object|xlink:href\s*=\s*["'](?!#)/i.test(text)) {
      throw new Error('This SVG contains scripts or external content and cannot be used. Please upload a PNG instead.');
    }
    return 'image/svg+xml';
  }
  throw new Error('Logo must be a PNG, JPG, WEBP or SVG image.');
}
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
export async function uploadClubLogo(clubId: string, file: File): Promise<string> {
  const type = await validateLogo(file);
  const path = `club-logos/${clubId}/logo-${Date.now()}.${EXT[type]}`;
  await db.putFile(path, new Blob([await file.arrayBuffer()], { type }));
  await upd('clubs', clubId, { logo_url: path });
  return path;
}
/** Club logo: a bundled static path or a file stored on this device. */
export async function resolveClubLogo(logo: string | null | undefined): Promise<string | null> {
  if (!logo) return null;
  if (logo.startsWith('/') || logo.startsWith('http') || logo.startsWith('data:')) return logo;
  return db.fileUrl(logo);
}

// ---------------- Medical brand ----------------
export const DEFAULT_BRAND: BrandSettings = { name: APP.physician, specialty: APP.specialty, contact: '', logoPath: '', signaturePath: '' };
export const DEFAULT_BRAND_LOGO = '/brand/medical-logo-wide.png';
export const DEFAULT_BRAND_MARK = '/brand/medical-mark.png';
export async function getBrand(): Promise<BrandSettings> {
  const rows = db.raw('application_settings');
  const v = (k: string) => { const r = rows.find((x) => x.key === k)?.value; return typeof r === 'string' ? r : ''; };
  return {
    name: v('brand_name') || DEFAULT_BRAND.name, specialty: v('brand_specialty') || DEFAULT_BRAND.specialty,
    contact: v('brand_contact'), logoPath: v('brand_logo_path'), signaturePath: v('brand_signature_path'),
  };
}
export async function saveBrand(b: Partial<BrandSettings>) {
  const map: Record<keyof BrandSettings, string> = { name: 'brand_name', specialty: 'brand_specialty', contact: 'brand_contact', logoPath: 'brand_logo_path', signaturePath: 'brand_signature_path' };
  for (const [k, v] of Object.entries(b) as [keyof BrandSettings, string][]) await saveSetting(map[k], v ?? '');
}
export async function uploadBrandAsset(kind: 'logo' | 'signature', file: File): Promise<string> {
  const type = await validateLogo(file);
  const path = `brand-assets/${kind}-${Date.now()}.${EXT[type]}`;
  await db.putFile(path, new Blob([await file.arrayBuffer()], { type }));
  return path;
}
export async function resolveBrandAsset(path: string | null | undefined): Promise<string | null> { return db.fileUrl(path); }

// ---------------- Backup ----------------
export async function exportBackup(): Promise<Blob> {
  const b = await db.exportBackup(`${APP.name} – ${APP.product}`);
  void logEvent('BACKUP_EXPORT', 'all');
  return b;
}
export async function restoreBackup(file: File) {
  const r = await db.importBackup(file);
  await bootstrap();
  await logEvent('BACKUP_RESTORE', 'all', null, r);
  return r;
}
