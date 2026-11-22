/**
 * Individualises the post-match recovery plan from each player's minutes played, match load
 * (sRPE = RPE × minutes), post-match soreness and active medical restrictions.
 * Output = per-player overrides on the proposed plan; the physician reviews and approves.
 */
import type { Participation, RecoveryFlag, RecoveryPlanItem, WellnessResponse } from './types';

type Item = Pick<RecoveryPlanItem, 'day_label' | 'category' | 'player_overrides'> & Partial<Pick<RecoveryPlanItem, 'id'>>;
export type MatchLoadBand = 'High' | 'Moderate' | 'Low' | 'Did not play';
export interface PlayerRecovery { player_id: string; band: MatchLoadBand; minutes: number | null; load: number | null; soreness: number | null; notes: string[] }

export function loadBand(p: Pick<Participation, 'status' | 'minutes_played' | 'rpe' | 'session_load'>): MatchLoadBand {
  if (p.status && !['Full', 'Modified', 'Individual'].includes(p.status)) return 'Did not play';
  const min = p.minutes_played;
  const load = p.session_load ?? (p.rpe && min ? p.rpe * min : null);
  if (min == null || min === 0) return 'Did not play';
  if (min >= 25 || (load ?? 0) >= 600) return 'High';
  if (min >= 10) return 'Moderate';
  return 'Low';
}
export const BAND_COLOR: Record<MatchLoadBand, 'red' | 'orange' | 'blue' | 'gray'> = { High: 'red', Moderate: 'orange', Low: 'blue', 'Did not play': 'gray' };

const contraindicated = (flags: RecoveryFlag[], pid: string, kind: string) =>
  flags.find((f) => f.player_id === pid && f.level === 'Contraindicated' && (f.intervention === kind || f.intervention === 'All'));
const modified = (flags: RecoveryFlag[], pid: string, kind: string) =>
  flags.find((f) => f.player_id === pid && f.level === 'Modified' && (f.intervention === kind || f.intervention === 'All'));

/** Returns new player_overrides for each plan item plus a per-player summary. */
export function individualise(items: Item[], part: Participation[], flags: RecoveryFlag[], wellness: WellnessResponse[] = []) {
  const out = items.map((i) => ({ ...i, player_overrides: { ...(i.player_overrides ?? {}) } }));
  const find = (day: string, cat: string) => out.filter((i) => i.day_label === day && i.category === cat);
  const set = (day: string, cat: string, pid: string, text: string) => find(day, cat).forEach((i) => { i.player_overrides[pid] = text; });
  const summary: PlayerRecovery[] = [];

  for (const p of part) {
    const band = loadBand(p);
    const load = p.session_load ?? (p.rpe && p.minutes_played ? p.rpe * p.minutes_played : null);
    const sor = wellness.filter((w) => w.player_id === p.player_id && w.soreness != null).map((w) => w.soreness!).sort((a, b) => b - a)[0] ?? null;
    const notes: string[] = [];
    const pid = p.player_id;
    const m = p.minutes_played ?? 0;
    if (p.status === 'Injured') {
      set('MD+1', 'Training load', pid, 'Injured: follow the individual treatment / rehabilitation programme (no team recovery protocol).');
      for (const c of ['Cold water immersion', 'Active recovery', 'Massage', 'Compression']) { set('MD', c, pid, 'EXCLUDED'); set('MD+1', c, pid, 'EXCLUDED'); }
      summary.push({ player_id: pid, band, minutes: p.minutes_played, load: null, soreness: null, notes: ['Injured – rehab programme'] });
      continue;
    }
    if (p.status === 'Absent' || p.status === 'Excused') { summary.push({ player_id: pid, band, minutes: null, load: null, soreness: null, notes: ['Not with the squad – no change'] }); continue; }

    if (band === 'High') {
      set('MD+1', 'Training load', pid, `High match load (${m} min${load ? `, ${load} AU` : ''}): recovery only – no conditioning or high-intensity work.`);
      set('MD+1', 'Active recovery', pid, `Active recovery 20–30 min (bike / pool / walk) at very low intensity.`);
      set('MD+1', 'Massage', pid, 'Massage / soft-tissue work recommended (physio).');
      set('MD', 'Compression', pid, 'Compression garments 2–3 h after the match / overnight if tolerated.');
      notes.push('Full recovery protocol');
    } else if (band === 'Moderate') {
      set('MD+1', 'Training load', pid, `Moderate minutes (${m} min): light session – technical work + short low-intensity conditioning (≤ 20 min, RPE ≤ 5).`);
      set('MD+1', 'Active recovery', pid, 'Active recovery 15–20 min.');
      set('MD+1', 'Massage', pid, 'Massage only if soreness is high.');
      notes.push('Light recovery + light top-up');
    } else {
      const why = band === 'Low' ? `Low minutes (${m} min)` : 'Did not play';
      set('MD+1', 'Training load', pid, `${why}: compensatory conditioning session (e.g. 20–30 min high-intensity intervals / small-sided games, RPE 7–8) to maintain fitness.`);
      set('MD+1', 'Active recovery', pid, 'EXCLUDED');
      set('MD+1', 'Massage', pid, 'EXCLUDED');
      set('MD', 'Cold water immersion', pid, 'EXCLUDED');
      set('MD+1', 'Cold water immersion', pid, 'EXCLUDED');
      notes.push('Compensatory conditioning');
    }
    if (band === 'High' || band === 'Moderate') {
      if (sor !== null && sor >= 7) {
        set('MD+1', 'Massage', pid, `High soreness (${sor}/10): massage / soft-tissue work recommended; review by physio.`);
        set('MD+1', 'Training load', pid, `High soreness (${sor}/10) after ${m} min: recovery only; physio review before training.`);
        notes.push(`High soreness ${sor}/10`);
      }
    }
    // Medical restrictions override everything
    const ice = contraindicated(flags, pid, 'Ice bath');
    if (ice) {
      set('MD', 'Cold water immersion', pid, 'EXCLUDED');
      set('MD+1', 'Cold water immersion', pid, 'EXCLUDED');
      if (band === 'High' || band === 'Moderate') set('MD+1', 'Active recovery', pid, `Ice bath contraindicated${ice.instructions ? ` (${ice.instructions})` : ''}: active recovery 20–30 min + compression instead.`);
      notes.push('Ice bath contraindicated');
    } else if (band === 'High' || band === 'Moderate') {
      const iceMod = modified(flags, pid, 'Ice bath');
      if (iceMod) { set('MD', 'Cold water immersion', pid, `Modified ice bath: ${iceMod.instructions ?? 'follow the physician\'s instructions'}.`); notes.push('Modified ice bath'); }
    }
    for (const [kind, cat] of [['Massage', 'Massage'], ['Active recovery', 'Active recovery'], ['Compression boots', 'Compression']] as const) {
      if (contraindicated(flags, pid, kind)) { find('MD', cat).concat(find('MD+1', cat)).forEach((i) => { i.player_overrides[pid] = 'EXCLUDED'; }); notes.push(`${kind} contraindicated`); }
    }
    summary.push({ player_id: pid, band, minutes: p.minutes_played, load, soreness: sor, notes });
  }
  return { items: out, summary };
}
