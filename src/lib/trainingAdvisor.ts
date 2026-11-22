/**
 * Suggests duration and intensity (session RPE) for a planned session.
 * Inputs: position in the match week (MD-x / MD+x), recent team load (7-day vs 4-week
 * average) and, when available to the medical team, today's readiness questionnaires.
 * Decision support only: coaches and the physician decide; no single number predicts injury.
 */
import { addDays, daysBetween } from './format';
import type { Match, Participation, TrainingSession } from './types';

export interface TrainingAdvice { duration: number; rpe: number; label: string; reasons: string[] }
export interface Readiness { readiness: number | null; fatigue: number | null; responses: number; players: number; flagged: number }

const round5 = (n: number) => Math.max(15, Math.round(n / 5) * 5);
const clampRpe = (n: number) => Math.min(10, Math.max(1, Math.round(n)));

export function adviseSession(opts: {
  date: string; type: TrainingSession['session_type']; matches: Match[]; sessions: TrainingSession[]; participation: Participation[];
  readiness?: Readiness | null; excludeSessionId?: string;
}): TrainingAdvice {
  const { date, type, matches } = opts;
  const reasons: string[] = [];
  const active = matches.filter((m) => m.status !== 'Cancelled');
  const next = active.filter((m) => m.match_date >= date).sort((a, b) => a.match_date.localeCompare(b.match_date))[0];
  const prev = active.filter((m) => m.match_date < date).sort((a, b) => b.match_date.localeCompare(a.match_date))[0];
  const dNext = next ? daysBetween(date, next.match_date) : null;
  const dPrev = prev ? daysBetween(prev.match_date, date) : null;

  if (type === 'Match') return { duration: 120, rpe: 8, label: 'Match', reasons: ['Match session: warm-up + game; record each player\'s minutes played and RPE afterwards.'] };
  if (type === 'Recovery') return { duration: 30, rpe: 2, label: 'Recovery', reasons: ['Recovery session: low intensity (RPE 1–3).'] };

  const base: Record<string, [number, number]> = { Gym: [60, 6], Conditioning: [45, 7], 'Morning training': [90, 6], 'Evening training': [90, 6], Other: [75, 5] };
  let [duration, rpe] = base[type] ?? [90, 6];
  let label = 'No match within a week';
  const gymLike = type === 'Gym' || type === 'Conditioning';

  if (dNext === 0) {
    label = 'Match day (MD)'; [duration, rpe] = gymLike ? [20, 3] : [45, 3];
    reasons.push(`Match today vs ${next!.opponent}: shoot-around / activation only.`);
  } else if (dNext === 1) {
    label = 'MD-1'; [duration, rpe] = gymLike ? [30, 4] : [60, 4];
    reasons.push(`Match tomorrow vs ${next!.opponent}: short, sharp, low volume (RPE ≤ 5), no heavy gym or conditioning.`);
  } else if (dPrev === 1) {
    label = 'MD+1'; [duration, rpe] = gymLike ? [30, 3] : [45, 3];
    reasons.push(`Day after the match vs ${prev!.opponent}: recovery emphasis for players with high minutes; compensatory work for players with low minutes.`);
  } else if (dNext === 2) {
    label = 'MD-2'; [duration, rpe] = gymLike ? [45, 6] : [80, 6];
    reasons.push(`Match in 2 days vs ${next!.opponent}: main tactical session, moderate–high intensity, normal volume.`);
  } else if (dNext !== null && dNext <= 4) {
    label = `MD-${dNext}`; [duration, rpe] = gymLike ? [60, 7] : [100, 7];
    reasons.push(`Match in ${dNext} days: main loading day of the week (highest intensity / volume).`);
  } else if (dPrev === 2) {
    label = 'MD+2'; [duration, rpe] = gymLike ? [45, 5] : [75, 5];
    reasons.push('Two days after the match: return to normal training at moderate intensity.');
  } else {
    reasons.push(next ? `Next match in ${dNext} days: normal development training.` : 'No match scheduled: normal development training.');
  }

  // ---- Recent team load (average per player) ----
  const sessDate = new Map(opts.sessions.filter((s) => s.id !== opts.excludeSessionId).map((s) => [s.id, s.session_date]));
  const loadIn = (from: string, to: string) => {
    const rows = opts.participation.filter((p) => { const d = sessDate.get(p.session_id); return d && d >= from && d <= to && p.session_load; });
    const players = new Set(rows.map((r) => r.player_id)).size;
    return players ? rows.reduce((s, r) => s + (r.session_load ?? 0), 0) / players : 0;
  };
  const acute = loadIn(addDays(date, -6), addDays(date, -1));
  const chronicWeekly = loadIn(addDays(date, -28), addDays(date, -1)) / 4;
  if (chronicWeekly > 0) {
    const planned = duration * rpe;
    const ratio = (acute + planned) / chronicWeekly;
    if (ratio > 1.3 && !['MD', 'MD-1', 'MD+1'].includes(label)) {
      const target = Math.max(chronicWeekly * 1.25 - acute, 15 * rpe);
      const newDur = round5(Math.min(duration, target / rpe));
      if (newDur < duration) {
        reasons.push(`The team's 7-day load would be ${Math.round(ratio * 100)} % of its 4-week weekly average: duration reduced to keep the weekly increase moderate.`);
        duration = newDur;
      }
    } else if (ratio < 0.8 && (dNext === null || dNext >= 3)) {
      reasons.push(`7-day load is low (${Math.round(ratio * 100)} % of the 4-week average): load can be progressed gradually (≈ 10–15 % per week).`);
    } else {
      reasons.push(`7-day load ≈ ${Math.round(ratio * 100)} % of the 4-week weekly average (within the usual range).`);
    }
  } else {
    reasons.push('Not enough recorded sessions yet to compare with recent weeks.');
  }

  // ---- Today's readiness (medical team only) ----
  const r = opts.readiness;
  if (r && r.responses > 0) {
    if (r.readiness !== null && r.readiness < 6) { rpe -= 1; reasons.push(`Team readiness today is low (avg ${r.readiness}/10): intensity reduced by 1.`); }
    if (r.fatigue !== null && r.fatigue >= 7) { duration = round5(duration * 0.85); reasons.push(`High average fatigue today (${r.fatigue}/10): volume reduced ~15 %.`); }
    if (r.flagged > 0) reasons.push(`${r.flagged} athlete(s) flagged in today's questionnaires – review individually (modified or individual training).`);
  }
  return { duration: round5(duration), rpe: clampRpe(rpe), label, reasons };
}
