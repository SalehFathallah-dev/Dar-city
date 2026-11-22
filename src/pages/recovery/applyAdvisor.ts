import * as api from '../../lib/api';
import { addDays } from '../../lib/format';
import { individualise } from '../../lib/recoveryAdvisor';
import { proposeRecoveryPlan } from '../../lib/recoveryPlanner';
import type { Match, Participation } from '../../lib/types';

/** Loads the match's recorded minutes and returns its Match session participation. */
export async function matchParticipation(m: Match): Promise<{ sessionId: string | null; part: Participation[] }> {
  const sessions = (await api.listTraining(m.match_date, m.match_date)).filter((s) => s.match_id === m.id || (s.session_type === 'Match' && !s.match_id));
  const s = sessions.find((x) => x.match_id === m.id) ?? sessions[0];
  return { sessionId: s?.id ?? null, part: s ? await api.listParticipation([s.id]) : [] };
}

/**
 * Creates (or updates) the match's proposed recovery plan with per-player recommendations from
 * minutes played, match load, soreness and medical restrictions. Returns the plan id.
 */
export async function proposeIndividualRecovery(m: Match, all: Match[], part: Participation[]): Promise<{ planId: string; created: boolean; approved: boolean }> {
  if (!part.some((p) => p.minutes_played != null || p.status === 'Injured')) throw new Error('No minutes played recorded for this match yet');
  const [flags, wellness, plans] = await Promise.all([
    api.getRecoveryFlags(m.match_date).catch(() => []),
    api.listWellness(m.match_date, addDays(m.match_date, 1)).catch(() => []),
    api.listPlans().catch(() => []),
  ]);
  const existing = plans.find((p) => p.match_id === m.id);
  if (existing) {
    const { items } = await api.getPlan(existing.id);
    const res = individualise(items, part, flags, wellness);
    for (const it of res.items) {
      const before = items.find((x) => x.id === it.id)!;
      if (JSON.stringify(before.player_overrides ?? {}) !== JSON.stringify(it.player_overrides)) await api.savePlanItem({ id: it.id, player_overrides: it.player_overrides });
    }
    return { planId: existing.id, created: false, approved: existing.status === 'Approved' };
  }
  const p = proposeRecoveryPlan(m, all);
  const res = individualise(p.items, part, flags, wellness);
  const saved = await api.createPlan({ match_id: m.id, title: p.title, interval_label: p.interval_label }, res.items.map((i, idx) => ({ ...p.items[idx], player_overrides: i.player_overrides })));
  return { planId: saved.id, created: true, approved: false };
}
