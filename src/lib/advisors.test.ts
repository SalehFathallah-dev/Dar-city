import { describe, expect, it } from 'vitest';
import { adviseSession } from './trainingAdvisor';
import { individualise, loadBand } from './recoveryAdvisor';
import { proposeRehab } from './rehabAdvisor';
import { proposeRecoveryPlan } from './recoveryPlanner';
import type { Match, Participation, RecoveryFlag } from './types';

const match = (d: string, id = 'm1'): Match => ({ id, club_id: 'c', opponent: 'X', competition: null, match_date: d, match_time: '18:00', venue: null, home_away: 'Home', travel: null, status: 'Scheduled', result: null, category: null, notes: null, created_at: '' });
const part = (pid: string, min: number | null, rpe: number | null, status: Participation['status'] = 'Full'): Participation =>
  ({ id: pid, session_id: 's', club_id: 'c', player_id: pid, status, duration_minutes: min == null ? 20 : min + 20, rpe, session_load: rpe ? rpe * ((min ?? 0) + 20) : null, minutes_played: min, notes: null });

describe('training advisor', () => {
  it('MD-1 is short and light', () => {
    const a = adviseSession({ date: '2026-12-01', type: 'Evening training', matches: [match('2026-12-02')], sessions: [], participation: [] });
    expect(a.label).toBe('MD-1'); expect(a.duration).toBeLessThanOrEqual(60); expect(a.rpe).toBeLessThanOrEqual(4);
  });
  it('MD-3 is the main loading day', () => {
    const a = adviseSession({ date: '2026-12-01', type: 'Evening training', matches: [match('2026-12-04')], sessions: [], participation: [] });
    expect(a.label).toBe('MD-3'); expect(a.rpe).toBeGreaterThanOrEqual(7);
  });
  it('low readiness lowers intensity', () => {
    const base = adviseSession({ date: '2026-12-01', type: 'Evening training', matches: [], sessions: [], participation: [] });
    const low = adviseSession({ date: '2026-12-01', type: 'Evening training', matches: [], sessions: [], participation: [], readiness: { readiness: 4, fatigue: 8, responses: 5, players: 10, flagged: 1 } });
    expect(low.rpe).toBe(base.rpe - 1); expect(low.duration).toBeLessThan(base.duration);
  });
  it('a load spike shortens the session', () => {
    const sessions = Array.from({ length: 28 }, (_, i) => ({ id: `s${i}`, session_date: new Date(Date.UTC(2026, 10, 3 + i)).toISOString().slice(0, 10) })) as never[];
    const participation = (sessions as { id: string; session_date: string }[]).map((s) => ({ ...part('p1', 0, 5), session_id: s.id, session_load: s.session_date >= '2026-11-24' ? 900 : 200 }));
    const a = adviseSession({ date: '2026-12-01', type: 'Evening training', matches: [], sessions, participation });
    expect(a.duration).toBeLessThan(90);
  });
});

describe('post-match recovery advisor', () => {
  it('bands minutes played', () => {
    expect(loadBand(part('a', 32, 8))).toBe('High');
    expect(loadBand(part('a', 15, 7))).toBe('Moderate');
    expect(loadBand(part('a', 4, 6))).toBe('Low');
    expect(loadBand(part('a', null, 3))).toBe('Did not play');
  });
  it('individualises the plan and respects contraindications', () => {
    const m = match('2026-12-01');
    const { items } = proposeRecoveryPlan(m, [m]);
    const flags: RecoveryFlag[] = [{ player_id: 'hi', intervention: 'Ice bath', level: 'Contraindicated', instructions: null, valid_until: null }];
    const res = individualise(items, [part('hi', 35, 8), part('lo', 2, 5), part('inj', null, null, 'Injured')], flags);
    const md1Load = res.items.find((i) => i.day_label === 'MD+1' && i.category === 'Training load')!;
    expect(md1Load.player_overrides.hi).toMatch(/recovery only/);
    expect(md1Load.player_overrides.lo).toMatch(/compensatory/);
    expect(md1Load.player_overrides.inj).toMatch(/rehabilitation/);
    const ice = res.items.find((i) => i.day_label === 'MD' && i.category === 'Cold water immersion')!;
    expect(ice.player_overrides.hi).toBe('EXCLUDED');
    expect(res.items.find((i) => i.day_label === 'MD+1' && i.category === 'Active recovery')!.player_overrides.hi).toMatch(/contraindicated/);
  });
});

describe('rehab advisor', () => {
  it('proposes a hamstring protocol with phases and RTP criteria', () => {
    const p = proposeRehab({ body_region: 'Hamstring', injury_type: 'Muscle strain', severity: 'Moderate', injury_grade: 'Grade 2', body_side: 'Left', onset: 'Acute' });
    expect(p.phases.length).toBeGreaterThan(2); expect(p.rtp.length).toBeGreaterThan(0); expect(p.redFlags.length).toBeGreaterThan(0);
  });
  it('concussion uses graded return', () => {
    const p = proposeRehab({ body_region: 'Head', injury_type: 'Concussion', severity: 'Mild', injury_grade: null, body_side: null, onset: 'Acute' });
    expect(JSON.stringify(p).toLowerCase()).toMatch(/concussion|symptom/);
  });
});
