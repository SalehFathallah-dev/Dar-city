import type { Availability, Clearance, Examination, Exposure, Injury, Player, RehabProgram, RtpAssessment } from './types';
import { CLEARED_STATUSES, OPEN_INJURY_STATUSES } from './constants';
import { addDays, daysBetween, parseISODate, toISODate, todayISO } from './format';

export type RangePreset = '7d' | '30d' | 'month' | 'season' | 'all' | 'custom';
export interface DateRange { from: string | null; to: string | null }

export function rangeFromPreset(preset: RangePreset, opts: { season?: { start_date: string; end_date: string } | null; custom?: DateRange; today?: string } = {}): DateRange {
  const today = opts.today ?? todayISO();
  switch (preset) {
    case '7d': return { from: addDays(today, -6), to: today };
    case '30d': return { from: addDays(today, -29), to: today };
    case 'month': { const d = parseISODate(today)!; return { from: toISODate(new Date(d.getFullYear(), d.getMonth(), 1)), to: today }; }
    case 'season': return opts.season ? { from: opts.season.start_date, to: opts.season.end_date } : { from: null, to: null };
    case 'custom': return opts.custom ?? { from: null, to: null };
    default: return { from: null, to: null };
  }
}

export function inRange(date: string | null | undefined, range: DateRange): boolean {
  if (!date) return false;
  const d = date.slice(0, 10);
  if (range.from && d < range.from) return false;
  if (range.to && d > range.to) return false;
  return true;
}

export const isOpenInjury = (i: Pick<Injury, 'status'>) => (OPEN_INJURY_STATUSES as readonly string[]).includes(i.status);

/** Days lost = injury date → return-to-play date (or closure, or today if still out). */
export function daysLost(i: Pick<Injury, 'injury_date' | 'return_to_play_date' | 'closed_date' | 'status'>, today = todayISO()): number {
  const end = i.return_to_play_date ?? i.closed_date ?? (isOpenInjury(i) ? today : null);
  if (!end) return 0;
  return Math.max(0, daysBetween(i.injury_date, end));
}

export function countBy<T>(items: T[], key: (t: T) => string | null | undefined): { name: string; value: number }[] {
  const map = new Map<string, number>();
  for (const it of items) {
    const k = key(it) || 'Not specified';
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

export function sumBy<T>(items: T[], key: (t: T) => string | null | undefined, val: (t: T) => number) {
  const map = new Map<string, number>();
  for (const it of items) {
    const k = key(it) || 'Not specified';
    map.set(k, (map.get(k) ?? 0) + val(it));
  }
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

export function monthlyTrend(injuries: Pick<Injury, 'injury_date'>[], range: DateRange): { month: string; injuries: number }[] {
  const dates = injuries.map((i) => i.injury_date).sort();
  const from = range.from ?? dates[0];
  const to = range.to ?? dates[dates.length - 1] ?? todayISO();
  if (!from) return [];
  const start = parseISODate(from)!; const end = parseISODate(to)!;
  const out: { month: string; injuries: number }[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  let guard = 0;
  while (cur <= end && guard++ < 60) {
    const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
    out.push({
      month: cur.toLocaleString('en-GB', { month: 'short', year: '2-digit' }),
      injuries: injuries.filter((i) => i.injury_date.startsWith(key)).length,
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

/** Latest record per player using the given date + created_at ordering. */
export function latestByPlayer<T extends { player_id: string; created_at: string }>(rows: T[], dateKey: keyof T): Map<string, T> {
  const map = new Map<string, T>();
  for (const r of rows) {
    const cur = map.get(r.player_id);
    const a = `${String(r[dateKey] ?? '')}|${r.created_at}`;
    const b = cur ? `${String(cur[dateKey] ?? '')}|${cur.created_at}` : '';
    if (!cur || a > b) map.set(r.player_id, r);
  }
  return map;
}

export interface DashboardStats {
  totalPlayers: number; cleared: number; fullTraining: number; injured: number; underRehab: number;
  modifiedTraining: number; awaitingAssessment: number; clearancePending: number;
}

export function computeDashboardStats(input: {
  players: Pick<Player, 'id' | 'status'>[]; injuries: Injury[]; availability: Availability[]; clearances: Clearance[];
  examinations: Pick<Examination, 'player_id' | 'examination_date' | 'is_archived'>[]; rehab: Pick<RehabProgram, 'player_id' | 'status'>[];
  season?: { start_date: string } | null;
}): DashboardStats {
  const active = input.players.filter((p) => p.status === 'active');
  const ids = new Set(active.map((p) => p.id));
  const avail = latestByPlayer(input.availability.filter((a) => ids.has(a.player_id)), 'effective_date');
  const clr = latestByPlayer(input.clearances.filter((c) => ids.has(c.player_id)), 'decision_date');
  const injured = new Set(input.injuries.filter((i) => ids.has(i.player_id) && !i.is_archived && isOpenInjury(i)).map((i) => i.player_id));
  const rehab = new Set([
    ...input.rehab.filter((r) => r.status === 'Active' && ids.has(r.player_id)).map((r) => r.player_id),
    ...input.injuries.filter((i) => ids.has(i.player_id) && i.status === 'Under Rehabilitation').map((i) => i.player_id),
  ]);
  const seasonStart = input.season?.start_date ?? null;
  const examined = new Set(input.examinations.filter((e) => !e.is_archived && (!seasonStart || e.examination_date >= seasonStart)).map((e) => e.player_id));
  let fullTraining = 0, modified = 0, cleared = 0, pending = 0, awaiting = 0;
  for (const p of active) {
    const a = avail.get(p.id);
    if (a?.availability === 'FULLY AVAILABLE') fullTraining++;
    if (a?.availability === 'MODIFIED TRAINING') modified++;
    const c = clr.get(p.id);
    if (c && CLEARED_STATUSES.includes(c.clearance_status)) cleared++;
    if (!c || c.clearance_status === 'Further Evaluation Required') pending++;
    if (!examined.has(p.id) || a?.availability === 'UNDER MEDICAL REVIEW') awaiting++;
  }
  return {
    totalPlayers: active.length, cleared, fullTraining, injured: injured.size, underRehab: rehab.size,
    modifiedTraining: modified, awaitingAssessment: awaiting, clearancePending: pending,
  };
}

/** Injury incidence per 1,000 player-hours. Returns null when no exposure data exists (never invented). */
export function incidencePer1000h(injuryCount: number, exposures: Pick<Exposure, 'duration_minutes' | 'players_exposed'>[]): { hours: number; rate: number } | null {
  const hours = exposures.reduce((s, e) => s + (e.duration_minutes * e.players_exposed) / 60, 0);
  if (hours <= 0) return null;
  return { hours: Math.round(hours * 10) / 10, rate: Math.round((injuryCount / hours) * 1000 * 100) / 100 };
}

export function injuryAnalytics(injuries: Injury[], players: Pick<Player, 'id' | 'position'>[], rehab: RehabProgram[], rtp: RtpAssessment[], today = todayISO()) {
  const posOf = new Map(players.map((p) => [p.id, p.position]));
  const playerIds = new Set(injuries.map((i) => i.player_id));
  const finished = injuries.filter((i) => i.return_to_play_date || i.closed_date);
  const totalDaysLost = injuries.reduce((s, i) => s + daysLost(i, today), 0);
  const rehabDurations = rehab.map((r) => daysBetween(r.start_date, r.end_date ?? today)).filter((d) => d >= 0);
  return {
    total: injuries.length,
    newInjuries: injuries.filter((i) => !i.is_recurrent).length,
    recurrent: injuries.filter((i) => i.is_recurrent).length,
    playersInjured: playerIds.size,
    injuriesPerPlayer: playerIds.size ? Math.round((injuries.length / playerIds.size) * 100) / 100 : 0,
    totalDaysLost,
    averageDaysLost: finished.length ? Math.round((finished.reduce((s, i) => s + daysLost(i, today), 0) / finished.length) * 10) / 10 : 0,
    averageRehabDays: rehabDurations.length ? Math.round((rehabDurations.reduce((a, b) => a + b, 0) / rehabDurations.length) * 10) / 10 : 0,
    byRegion: countBy(injuries, (i) => i.body_region),
    byType: countBy(injuries, (i) => i.injury_type),
    byPosition: countBy(injuries, (i) => posOf.get(i.player_id)),
    byMechanism: countBy(injuries, (i) => i.mechanism),
    contact: countBy(injuries, (i) => i.contact_type),
    setting: countBy(injuries, (i) => i.setting),
    severity: countBy(injuries, (i) => i.severity),
    daysLostByRegion: sumBy(injuries, (i) => i.body_region, (i) => daysLost(i, today)),
    rtpOutcomes: countBy(rtp, (r) => r.decision),
  };
}
