import { supabase, unwrap } from './supabase';
import type {
  BrandSettings, Club, ClubMember, Availability, AuditLog, Clearance, EmergencyContact, Examination, ExamFinding, Exposure, Followup, Injury,
  MedicalDocument, MedicalHistory, Player, Profile, RehabProgram, RehabSession, RtpAssessment, Season,
  TeamAvailabilityRow, Treatment,
} from './types';
import { ALLOWED_DOC_TYPES, MAX_DOC_BYTES, MAX_PHOTO_BYTES } from './constants';

const PLAYER_JOIN = 'players(full_name, player_code, jersey_number, position)';
const INJURY_JOIN = 'injuries(injury_code, diagnosis, body_region, injury_type, injury_date)';

type Row = Record<string, unknown>;

// ---------------- Club scope ----------------
/**
 * The selected club. Every list/detail query on club-scoped tables is filtered by it,
 * so records of different clubs are never mixed in the UI. Isolation itself is enforced
 * by Row Level Security in the database.
 */
let activeClubId: string | null = null;
export function setActiveClub(id: string | null) { activeClubId = id; }
export function getActiveClub() { return activeClubId; }
/** 'all' = every club the user is authorised for (overview, combined exports). */
export type ClubScope = string | 'all' | undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scoped<Q extends { eq: (c: string, v: string) => Q }>(q: Q, club?: ClubScope): Q {
  const c = club ?? activeClubId;
  if (c === 'all') return q;
  if (!c) throw new Error('No club selected');
  return q.eq('club_id', c);
}
function requireClub(): string {
  if (!activeClubId) throw new Error('Select a club first');
  return activeClubId;
}

/** Converts empty strings to null so optional columns are stored cleanly. */
export function clean<T extends Row>(obj: T): T {
  const out: Row = {};
  for (const [k, v] of Object.entries(obj)) out[k] = typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v;
  return out as T;
}

// ---------------- Profiles / users ----------------
export async function getMyProfile(userId: string): Promise<Profile | null> {
  return unwrap(await supabase.from('profiles').select('*').eq('id', userId).maybeSingle());
}
export async function listProfiles(): Promise<Profile[]> {
  return unwrap(await supabase.from('profiles').select('*').order('created_at'));
}
export async function updateProfile(id: string, patch: Partial<Profile>) {
  return unwrap(await supabase.from('profiles').update(clean(patch as Row)).eq('id', id).select().single());
}
export async function adminCreateUser(payload: { email: string; password: string; full_name: string; role: string; title?: string; club_ids?: string[] }) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body: { action: 'create', ...payload } });
  if (error) {
    let msg = error.message;
    try { const body = await (error as { context?: Response }).context?.json(); if (body?.error) msg = body.error; } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

// ---------------- Seasons & settings ----------------
export async function listSeasons(club?: ClubScope): Promise<Season[]> {
  return unwrap(await scoped(supabase.from('team_seasons').select('*'), club).order('start_date', { ascending: false }));
}
export async function saveSeason(s: Partial<Season>) {
  const row = clean(s as Row);
  if (!s.id) row.club_id = requireClub();
  const clubId = (s.club_id ?? row.club_id) as string;
  if (row.is_current) {
    // only one current season per club
    const q = supabase.from('team_seasons').update({ is_current: false }).eq('club_id', clubId).eq('is_current', true);
    unwrap(await (s.id ? q.neq('id', s.id) : q));
  }
  const saved: Season = s.id
    ? unwrap(await supabase.from('team_seasons').update(row).eq('id', s.id).select().single())
    : unwrap(await supabase.from('team_seasons').insert(row).select().single());
  // Keep the season shown on the club profile and reports in sync.
  if (saved.is_current) await supabase.from('clubs').update({ current_season: saved.name }).eq('id', saved.club_id);
  return saved;
}
export async function getSettings(): Promise<Record<string, unknown>> {
  const rows: { key: string; value: unknown }[] = unwrap(await supabase.from('application_settings').select('key, value'));
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
export async function listSettingsRows(): Promise<{ key: string; value: unknown; description: string | null }[]> {
  return unwrap(await supabase.from('application_settings').select('key, value, description').order('key'));
}
export async function saveSetting(key: string, value: unknown) {
  return unwrap(await supabase.from('application_settings').update({ value }).eq('key', key).select().single());
}

// ---------------- Players ----------------
export async function listPlayers(opts: { includeArchived?: boolean; club?: ClubScope } = {}): Promise<Player[]> {
  let q = scoped(supabase.from('players').select('*'), opts.club).order('jersey_number', { nullsFirst: false }).order('full_name');
  if (!opts.includeArchived) q = q.neq('status', 'archived');
  return unwrap(await q);
}
export async function getPlayer(id: string): Promise<Player> {
  return unwrap(await scoped(supabase.from('players').select('*').eq('id', id)).single());
}
export async function savePlayer(p: Partial<Player>): Promise<Player> {
  const row = clean({ ...p } as Row);
  delete row.bmi; delete row.player_code; delete row.created_at; delete row.updated_at; delete row.archived_at; delete row.club_id;
  if (p.id) return unwrap(await supabase.from('players').update(row).eq('id', p.id).select().single());
  delete row.id;
  row.club_id = requireClub();
  return unwrap(await supabase.from('players').insert(row).select().single());
}
export async function setPlayerStatus(id: string, status: Player['status']) {
  return unwrap(await supabase.from('players').update({ status }).eq('id', id).select().single());
}
export async function uploadPlayerPhoto(playerId: string, file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Photo must be a JPG, PNG or WEBP image.');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('Photo must be smaller than 5 MB.');
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${playerId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('player-photos').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  unwrap(await supabase.from('players').update({ photo_path: path }).eq('id', playerId).select('id').single());
  return path;
}
const photoCache = new Map<string, { url: string; exp: number }>();
export async function getPhotoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const hit = photoCache.get(path);
  if (hit && hit.exp > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from('player-photos').createSignedUrl(path, 3600);
  if (error || !data) return null;
  photoCache.set(path, { url: data.signedUrl, exp: Date.now() + 3300_000 });
  return data.signedUrl;
}

export async function listContacts(playerId: string): Promise<EmergencyContact[]> {
  return unwrap(await supabase.from('player_emergency_contacts').select('*').eq('player_id', playerId).order('created_at'));
}
export async function listAllContacts(club?: ClubScope): Promise<EmergencyContact[]> {
  return unwrap(await scoped(supabase.from('player_emergency_contacts').select('*'), club));
}
export async function saveContact(c: Partial<EmergencyContact>) {
  const row = clean(c as Row);
  if (c.id) return unwrap(await supabase.from('player_emergency_contacts').update(row).eq('id', c.id).select().single());
  delete row.id;
  return unwrap(await supabase.from('player_emergency_contacts').insert(row).select().single());
}

// ---------------- Medical history ----------------
export async function listHistories(playerId?: string, club?: ClubScope): Promise<MedicalHistory[]> {
  let q = scoped(supabase.from('medical_histories').select('*'), club).order('version', { ascending: false });
  if (playerId) q = q.eq('player_id', playerId);
  return unwrap(await q);
}
export async function addHistoryVersion(h: Partial<MedicalHistory>) {
  const row = clean(h as Row);
  delete row.id; delete row.version; delete row.is_current; delete row.created_at; delete row.created_by;
  return unwrap(await supabase.from('medical_histories').insert(row).select().single());
}

// ---------------- Examinations ----------------
export async function listExaminations(playerId?: string, club?: ClubScope): Promise<Examination[]> {
  let q = scoped(supabase.from('medical_examinations').select(`*, ${PLAYER_JOIN}`), club).eq('is_archived', false).order('examination_date', { ascending: false });
  if (playerId) q = q.eq('player_id', playerId);
  return unwrap(await q);
}
export async function getExamination(id: string): Promise<{ exam: Examination; findings: ExamFinding[] }> {
  const exam = unwrap(await scoped(supabase.from('medical_examinations').select(`*, ${PLAYER_JOIN}`).eq('id', id)).single()) as Examination;
  const findings = unwrap(await supabase.from('examination_findings').select('*').eq('examination_id', id)) as ExamFinding[];
  return { exam, findings };
}
export async function saveExamination(exam: Partial<Examination>, findings: ExamFinding[]): Promise<Examination> {
  const row = clean({ ...exam } as Row);
  delete row.players; delete row.bmi; delete row.exam_code; delete row.created_at; delete row.club_id;
  if (row.clearance_status && !exam.signed_at) row.signed_at = new Date().toISOString();
  let saved: Examination;
  if (exam.id) saved = unwrap(await supabase.from('medical_examinations').update(row).eq('id', exam.id).select().single());
  else { delete row.id; saved = unwrap(await supabase.from('medical_examinations').insert(row).select().single()); }
  const meaningful = findings.filter((f) => f.is_normal !== null || f.clinical_findings || f.pain || f.range_of_motion || f.muscle_strength || f.joint_stability || f.special_tests || f.notes);
  if (meaningful.length) {
    const rows = meaningful.map((f) => clean({ ...f, id: undefined, examination_id: saved.id } as Row));
    rows.forEach((r) => delete r.id);
    unwrap(await supabase.from('examination_findings').upsert(rows, { onConflict: 'examination_id,region' }).select('id'));
  }
  return saved;
}
export async function archiveExamination(id: string) {
  return unwrap(await supabase.from('medical_examinations').update({ is_archived: true }).eq('id', id).select('id').single());
}

// ---------------- Injuries ----------------
export async function listInjuries(opts: { playerId?: string; includeArchived?: boolean; club?: ClubScope } = {}): Promise<Injury[]> {
  let q = scoped(supabase.from('injuries').select(`*, ${PLAYER_JOIN}`), opts.club).order('injury_date', { ascending: false });
  if (opts.playerId) q = q.eq('player_id', opts.playerId);
  if (!opts.includeArchived) q = q.eq('is_archived', false);
  return unwrap(await q);
}
export async function getInjury(id: string): Promise<Injury> {
  return unwrap(await scoped(supabase.from('injuries').select(`*, ${PLAYER_JOIN}`).eq('id', id)).single());
}
export async function saveInjury(i: Partial<Injury>): Promise<Injury> {
  const row = clean({ ...i } as Row);
  delete row.players; delete row.injury_code; delete row.created_at; delete row.updated_at; delete row.club_id;
  if (i.id) return unwrap(await supabase.from('injuries').update(row).eq('id', i.id).select().single());
  delete row.id;
  return unwrap(await supabase.from('injuries').insert(row).select().single());
}
export async function updateInjuryStatus(id: string, status: string, extra: Partial<Injury> = {}) {
  return unwrap(await supabase.from('injuries').update(clean({ status, ...extra } as Row)).eq('id', id).select().single());
}

export async function listFollowups(injuryId?: string, club?: ClubScope): Promise<Followup[]> {
  let q = scoped(supabase.from('injury_followups').select('*'), club).order('followup_date').order('created_at');
  if (injuryId) q = q.eq('injury_id', injuryId);
  return unwrap(await q);
}
export async function saveFollowup(f: Partial<Followup>) {
  const row = clean(f as Row);
  delete row.created_at; delete row.created_by;
  if (f.id) return unwrap(await supabase.from('injury_followups').update(row).eq('id', f.id).select().single());
  delete row.id;
  return unwrap(await supabase.from('injury_followups').insert(row).select().single());
}

export async function listTreatments(injuryId?: string, club?: ClubScope): Promise<Treatment[]> {
  let q = scoped(supabase.from('treatments').select('*'), club).order('treatment_date').order('created_at');
  if (injuryId) q = q.eq('injury_id', injuryId);
  return unwrap(await q);
}
export async function addTreatments(rows: Partial<Treatment>[]) {
  if (!rows.length) return [];
  return unwrap(await supabase.from('treatments').insert(rows.map((r) => clean(r as Row))).select());
}

// ---------------- Rehabilitation ----------------
export async function listRehabPrograms(opts: { playerId?: string; injuryId?: string; club?: ClubScope } = {}): Promise<RehabProgram[]> {
  let q = scoped(supabase.from('rehabilitation_programs').select(`*, ${PLAYER_JOIN}, ${INJURY_JOIN}`), opts.club).order('start_date', { ascending: false });
  if (opts.playerId) q = q.eq('player_id', opts.playerId);
  if (opts.injuryId) q = q.eq('injury_id', opts.injuryId);
  return unwrap(await q);
}
export async function getRehabProgram(id: string): Promise<RehabProgram> {
  return unwrap(await scoped(supabase.from('rehabilitation_programs').select(`*, ${PLAYER_JOIN}, ${INJURY_JOIN}`).eq('id', id)).single());
}
export async function saveRehabProgram(r: Partial<RehabProgram>): Promise<RehabProgram> {
  const row = clean({ ...r } as Row);
  delete row.players; delete row.injuries; delete row.program_code; delete row.created_at; delete row.phase_approved_at; delete row.club_id;
  if (r.id) return unwrap(await supabase.from('rehabilitation_programs').update(row).eq('id', r.id).select().single());
  delete row.id;
  return unwrap(await supabase.from('rehabilitation_programs').insert(row).select().single());
}
export async function listRehabSessions(programId?: string, club?: ClubScope): Promise<RehabSession[]> {
  let q = scoped(supabase.from('rehabilitation_sessions').select('*'), club).order('session_date').order('created_at');
  if (programId) q = q.eq('program_id', programId);
  return unwrap(await q);
}
export async function saveRehabSession(s: Partial<RehabSession>) {
  const row = clean(s as Row);
  delete row.created_at; delete row.created_by;
  if (s.id) return unwrap(await supabase.from('rehabilitation_sessions').update(row).eq('id', s.id).select().single());
  delete row.id;
  return unwrap(await supabase.from('rehabilitation_sessions').insert(row).select().single());
}

// ---------------- RTP & clearance ----------------
export async function listRtp(opts: { playerId?: string; injuryId?: string; club?: ClubScope } = {}): Promise<RtpAssessment[]> {
  let q = scoped(supabase.from('rtp_assessments').select(`*, ${PLAYER_JOIN}, ${INJURY_JOIN}`), opts.club).order('decision_date', { ascending: false }).order('created_at', { ascending: false });
  if (opts.playerId) q = q.eq('player_id', opts.playerId);
  if (opts.injuryId) q = q.eq('injury_id', opts.injuryId);
  return unwrap(await q);
}
export async function getRtp(id: string): Promise<RtpAssessment> {
  return unwrap(await scoped(supabase.from('rtp_assessments').select(`*, ${PLAYER_JOIN}, ${INJURY_JOIN}`).eq('id', id)).single());
}
export async function createRtp(r: Partial<RtpAssessment>): Promise<RtpAssessment> {
  const row = clean({ ...r } as Row);
  delete row.id; delete row.players; delete row.injuries; delete row.rtp_code; delete row.created_at; delete row.club_id;
  return unwrap(await supabase.from('rtp_assessments').insert(row).select().single());
}
export async function listClearances(playerId?: string, club?: ClubScope): Promise<Clearance[]> {
  let q = scoped(supabase.from('medical_clearances').select(`*, ${PLAYER_JOIN}`), club).order('decision_date', { ascending: false }).order('created_at', { ascending: false });
  if (playerId) q = q.eq('player_id', playerId);
  return unwrap(await q);
}
export async function createClearance(c: Partial<Clearance>) {
  const row = clean({ ...c } as Row);
  delete row.id; delete row.players; delete row.clearance_code; delete row.created_at; delete row.club_id;
  return unwrap(await supabase.from('medical_clearances').insert(row).select().single());
}

// ---------------- Availability ----------------
export async function listAvailability(playerId?: string, club?: ClubScope): Promise<Availability[]> {
  let q = scoped(supabase.from('player_availability').select('*'), club).order('effective_date', { ascending: false }).order('created_at', { ascending: false });
  if (playerId) q = q.eq('player_id', playerId);
  return unwrap(await q);
}
export async function addAvailability(a: Partial<Availability>) {
  const row = clean(a as Row);
  delete row.id; delete row.created_at; delete row.created_by;
  return unwrap(await supabase.from('player_availability').insert(row).select().single());
}
export async function getTeamAvailability(club?: ClubScope): Promise<TeamAvailabilityRow[]> {
  const c = club ?? activeClubId;
  return unwrap(await supabase.rpc('get_team_availability', { p_club_id: c === 'all' ? null : c }));
}

// ---------------- Documents ----------------
export async function listDocuments(opts: { playerId?: string; injuryId?: string; examinationId?: string } = {}): Promise<MedicalDocument[]> {
  let q = scoped(supabase.from('medical_documents').select('*, players(full_name, player_code)')).eq('is_archived', false).order('created_at', { ascending: false });
  if (opts.playerId) q = q.eq('player_id', opts.playerId);
  if (opts.injuryId) q = q.eq('injury_id', opts.injuryId);
  if (opts.examinationId) q = q.eq('examination_id', opts.examinationId);
  return unwrap(await q);
}

/** Validates file signature (magic bytes) – not just the browser-reported type. */
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
  const path = `${meta.player_id}/${crypto.randomUUID()}.${ALLOWED_DOC_TYPES[type]}`;
  const { error } = await supabase.storage.from('medical-documents').upload(path, file, { contentType: type, upsert: false });
  if (error) throw new Error(error.message);
  try {
    return unwrap(await supabase.from('medical_documents').insert(clean({
      ...meta, file_path: path, file_name: file.name.slice(0, 200), mime_type: type, size_bytes: file.size,
    } as Row)).select().single());
  } catch (e) {
    await supabase.storage.from('medical-documents').remove([path]);
    throw e;
  }
}
export async function getDocumentUrl(doc: MedicalDocument, download = false): Promise<string> {
  const { data, error } = await supabase.storage.from('medical-documents').createSignedUrl(doc.file_path, 120, download ? { download: doc.file_name } : undefined);
  if (error || !data) throw new Error(error?.message || 'Unable to open document');
  void logEvent('VIEW_DOCUMENT', 'medical_documents', doc.id);
  return data.signedUrl;
}
export async function archiveDocument(id: string) {
  return unwrap(await supabase.from('medical_documents').update({ is_archived: true }).eq('id', id).select('id').single());
}

// ---------------- Exposure, audit ----------------
export async function listExposures(club?: ClubScope): Promise<Exposure[]> {
  return unwrap(await scoped(supabase.from('team_exposures').select('*'), club).order('session_date', { ascending: false }));
}
export async function addExposure(e: Partial<Exposure>) {
  return unwrap(await supabase.from('team_exposures').insert({ ...clean(e as Row), club_id: requireClub() }).select().single());
}
export async function deleteExposure(id: string) {
  return unwrap(await supabase.from('team_exposures').delete().eq('id', id).select('id'));
}
export async function listAuditLogs(opts: { limit?: number; recordType?: string; from?: string; to?: string; clubId?: string } = {}): Promise<AuditLog[]> {
  let q = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(opts.limit ?? 200);
  if (opts.recordType) q = q.eq('record_type', opts.recordType);
  if (opts.clubId) q = q.eq('club_id', opts.clubId);
  if (opts.from) q = q.gte('created_at', opts.from);
  if (opts.to) q = q.lte('created_at', `${opts.to}T23:59:59`);
  return unwrap(await q);
}
export async function logEvent(action: string, recordType: string, recordId?: string | null, details?: Record<string, unknown>) {
  try { await supabase.rpc('log_event', { p_action: action, p_record_type: recordType, p_record_id: recordId ?? null, p_details: details ?? null }); } catch { /* audit is best-effort from the client */ }
}

// ---------------- Clubs ----------------
export async function listClubs(): Promise<Club[]> {
  return unwrap(await supabase.from('clubs').select('*').order('status').order('created_at'));
}
export async function getClub(id: string): Promise<Club> {
  return unwrap(await supabase.from('clubs').select('*').eq('id', id).single());
}
export async function saveClub(c: Partial<Club>): Promise<Club> {
  const row = clean({ ...c } as Row);
  delete row.club_code; delete row.player_counter; delete row.created_at; delete row.updated_at; delete row.is_demo;
  if (c.id) { delete row.id; return unwrap(await supabase.from('clubs').update(row).eq('id', c.id).select().single()); }
  delete row.id;
  return unwrap(await supabase.from('clubs').insert(row).select().single());
}
export async function setClubStatus(id: string, status: Club['status']) {
  return unwrap(await supabase.from('clubs').update({ status }).eq('id', id).select().single());
}
export async function listClubMembers(clubId?: string): Promise<ClubMember[]> {
  let q = supabase.from('club_members').select('*');
  if (clubId) q = q.eq('club_id', clubId);
  return unwrap(await q);
}
export async function addClubMember(clubId: string, userId: string) {
  return unwrap(await supabase.from('club_members').insert({ club_id: clubId, user_id: userId }).select());
}
export async function removeClubMember(clubId: string, userId: string) {
  return unwrap(await supabase.from('club_members').delete().eq('club_id', clubId).eq('user_id', userId).select());
}

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
  const path = `${clubId}/logo-${Date.now()}.${EXT[type]}`;
  const { error } = await supabase.storage.from('club-logos').upload(path, file, { contentType: type, upsert: false });
  if (error) throw new Error(error.message);
  unwrap(await supabase.from('clubs').update({ logo_url: path }).eq('id', clubId).select('id').single());
  return path;
}
const signedCache = new Map<string, { url: string; exp: number }>();
async function signed(bucket: string, path: string): Promise<string | null> {
  const k = `${bucket}/${path}`;
  const hit = signedCache.get(k);
  if (hit && hit.exp > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error || !data) return null;
  signedCache.set(k, { url: data.signedUrl, exp: Date.now() + 3300_000 });
  return data.signedUrl;
}
/** Club logo: a bundled static path (e.g. /clubs/dar-city.png) or a private storage object. */
export async function resolveClubLogo(logo: string | null | undefined): Promise<string | null> {
  if (!logo) return null;
  if (logo.startsWith('/') || logo.startsWith('http')) return logo;
  return signed('club-logos', logo);
}

// ---------------- Medical brand ----------------
export const DEFAULT_BRAND: BrandSettings = { name: 'Dr. Faraj Lashika', specialty: 'Orthopedic & Sports Medicine', contact: '', logoPath: '', signaturePath: '' };
export const DEFAULT_BRAND_LOGO = '/brand/medical-logo.png';
export const DEFAULT_BRAND_MARK = '/brand/medical-mark.png';
export async function getBrand(): Promise<BrandSettings> {
  const rows: { key: string; value: unknown }[] = unwrap(await supabase.from('application_settings').select('key, value').like('key', 'brand\\_%'));
  const v = (k: string) => { const r = rows.find((x) => x.key === k)?.value; return typeof r === 'string' ? r : ''; };
  return {
    name: v('brand_name') || DEFAULT_BRAND.name, specialty: v('brand_specialty') || DEFAULT_BRAND.specialty,
    contact: v('brand_contact'), logoPath: v('brand_logo_path'), signaturePath: v('brand_signature_path'),
  };
}
export async function saveBrand(b: Partial<BrandSettings>) {
  const map: Record<keyof BrandSettings, string> = { name: 'brand_name', specialty: 'brand_specialty', contact: 'brand_contact', logoPath: 'brand_logo_path', signaturePath: 'brand_signature_path' };
  for (const [k, v] of Object.entries(b) as [keyof BrandSettings, string][]) {
    unwrap(await supabase.from('application_settings').upsert({ key: map[k], value: v ?? '' }).select('key'));
  }
}
export async function uploadBrandAsset(kind: 'logo' | 'signature', file: File): Promise<string> {
  const type = await validateLogo(file);
  const path = `${kind}-${Date.now()}.${EXT[type]}`;
  const { error } = await supabase.storage.from('brand-assets').upload(path, file, { contentType: type, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}
export async function resolveBrandAsset(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  return signed('brand-assets', path);
}
