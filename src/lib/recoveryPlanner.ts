/**
 * Proposes a recovery schedule around a match (MD-2 … MD+2). The output is a PROPOSAL for the
 * physician to review, edit and approve – never a medical order. Recommendations follow common
 * sports-medicine practice and must be individualised (contraindications, minutes played, injuries).
 */
import { addDays, daysBetween } from './format';
import type { Match, RecoveryPlanItem } from './types';

type Item = Omit<RecoveryPlanItem, 'id' | 'plan_id' | 'club_id'>;
export type Interval = 'congested' | 'short' | 'standard';

const hoursBetween = (a: Match, b: Match) => {
  const t = (m: Match) => new Date(`${m.match_date}T${m.match_time ?? '18:00'}`).getTime();
  return Math.abs(t(b) - t(a)) / 3_600_000;
};
export function matchContext(match: Match, all: Match[]) {
  const active = all.filter((m) => m.status !== 'Cancelled' && m.id !== match.id).sort((a, b) => a.match_date.localeCompare(b.match_date));
  const prev = [...active].reverse().find((m) => m.match_date < match.match_date || (m.match_date === match.match_date && (m.match_time ?? '') < (match.match_time ?? '')));
  const next = active.find((m) => m.match_date > match.match_date || (m.match_date === match.match_date && (m.match_time ?? '') > (match.match_time ?? '')));
  const hoursToNext = next ? hoursBetween(match, next) : null;
  const hoursFromPrev = prev ? hoursBetween(prev, match) : null;
  const sevenDay = active.filter((m) => Math.abs(daysBetween(match.match_date, m.match_date)) <= 3).length + 1;
  const interval: Interval = hoursToNext !== null && hoursToNext < 48 ? 'congested' : hoursToNext !== null && hoursToNext < 72 ? 'short' : 'standard';
  return { prev, next, hoursToNext, hoursFromPrev, interval, congested: sevenDay >= 3 || interval !== 'standard' || (hoursFromPrev !== null && hoursFromPrev < 72) };
}
export const INTERVAL_LABEL: Record<Interval, string> = {
  congested: 'Congested – next match in < 48 h', short: 'Short – next match in 48–72 h', standard: 'Standard – next match in > 72 h or none',
};

export function proposeRecoveryPlan(match: Match, all: Match[]): { title: string; interval_label: string; items: Item[] } {
  const { prev, next, interval, hoursFromPrev } = matchContext(match, all);
  const md = match.match_date;
  const evening = (match.match_time ?? '18:00') >= '17:00';
  const items: Item[] = [];
  let order = 0;
  const add = (day: Item['day_label'], offset: number, category: Item['category'], recommendation: string) =>
    items.push({ day_label: day, item_date: addDays(md, offset), category, recommendation, sort_order: order++, player_overrides: {} });

  // ---- Before the match (skipped when the days are the recovery of a previous match) ----
  const prevClose = hoursFromPrev !== null && hoursFromPrev < 72;
  if (!prevClose) {
    add('MD-2', -2, 'Training load', 'Main tactical session, moderate–high intensity, normal volume. Avoid new high-load exercises.');
    add('MD-2', -2, 'Sleep', 'Target 8–9 h of sleep; consistent bedtime.');
  } else {
    add('MD-2', -2, 'Training load', `Recovery from the previous match (${prev?.opponent ?? ''}): low-intensity session, starters limited.`);
  }
  add('MD-1', -1, 'Training load', 'Short activation session (≤ 60 min, RPE ≤ 5): shooting, set plays, short sprints. No heavy gym.');
  add('MD-1', -1, 'Nutrition', 'Carbohydrate-rich meals (pasta, rice, bread, fruit) through the day; familiar foods only.');
  add('MD-1', -1, 'Hydration', 'Drink regularly through the day (~35–40 ml/kg); pale urine is the target.');
  add('MD-1', -1, 'Sleep', 'Sleep 8–9 h; screens off 60 min before bed; avoid caffeine after 16:00.');
  if (match.home_away === 'Away' && match.travel) add('MD-1', -1, 'Other', `Travel day: ${match.travel}. Stand and walk every 60–90 min, compression socks, water and snacks on the journey.`);

  // ---- Match day ----
  add('MD', 0, 'Nutrition', 'Pre-match meal 3–4 h before tip-off (carbohydrate + lean protein, low fat/fibre). After the match: carbohydrate + protein within 60 min.');
  add('MD', 0, 'Hydration', 'Pre-match 5–7 ml/kg 2–4 h before; sip during breaks; after the match rehydrate ~150 % of fluid lost.');
  if (interval !== 'standard') {
    add('MD', 0, 'Cold water immersion', 'Post-match ice bath 11–15 °C for 10–12 min (after cool-down), supervised. Exclude players with a cold-related contraindication.');
    add('MD', 0, 'Compression', 'Compression garments for 2–3 h after the match / overnight if tolerated.');
  } else {
    add('MD', 0, 'Cold water immersion', 'Optional post-match ice bath 11–15 °C for 10 min for players with high minutes or high soreness.');
  }
  if (evening) add('MD', 0, 'Sleep', 'Evening match: wind-down routine, dim lights, no caffeine/energy drinks after the match; aim for the usual wake-up time.');

  // ---- After the match ----
  add('MD+1', 1, 'Active recovery', 'Active recovery 20–30 min low intensity (bike, pool or walk) for players with high minutes.');
  add('MD+1', 1, 'Mobility', 'Mobility, stretching and foam rolling 15–20 min.');
  add('MD+1', 1, 'Training load', 'Starters: recovery only. Players with low minutes: compensatory conditioning session.');
  add('MD+1', 1, 'Massage', 'Light massage for players with high minutes or high soreness (physio decision).');
  add('MD+1', 1, 'Nutrition', 'Recovery nutrition: protein at every meal (~0.3–0.4 g/kg), replenish carbohydrates.');
  if (interval === 'congested') {
    add('MD+1', 1, 'Cold water immersion', `Next match (${next?.opponent ?? 'next game'}) in < 48 h: second ice bath 11–15 °C 10 min if soreness is high.`);
    add('MD+1', 1, 'Sleep', 'Prioritise sleep; a 20–30 min nap early afternoon is allowed.');
  } else if (interval === 'short') {
    add('MD+2', 2, 'Training load', `Next match (${next?.opponent ?? ''}) in 48–72 h: this day is MD-1 – short activation only.`);
    add('MD+2', 2, 'Mobility', 'Mobility 15 min before the activation session.');
  } else {
    add('MD+2', 2, 'Training load', 'Return to normal training, moderate intensity; reintroduce gym work.');
    add('MD+2', 2, 'Mobility', 'Mobility routine 15 min.');
  }
  return { title: `Recovery plan – ${match.opponent} (${md})`, interval_label: INTERVAL_LABEL[interval], items };
}

export const ICE_BATH_PRECAUTIONS = 'Exclude: cold urticaria, Raynaud\'s, open wounds, cardiac conditions, illness/fever. Never alone; supervised. Stop immediately for dizziness, chest pain, breathing difficulty or numbness. Enter gradually.';
