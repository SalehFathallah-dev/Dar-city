import { describe, expect, it } from 'vitest';
import { computeDashboardStats, daysLost, incidencePer1000h, monthlyTrend, rangeFromPreset } from './analytics';
import { calculateAge, calculateBMI, daysBetween, formatDate } from './format';
import { escapeCsv, toCsv } from './csv';

describe('format', () => {
  it('formats DD/MM/YYYY', () => { expect(formatDate('2026-03-07')).toBe('07/03/2026'); expect(formatDate(null)).toBe('—'); });
  it('calculates age', () => {
    expect(calculateAge('2000-11-03', new Date(2026, 10, 2))).toBe(25);
    expect(calculateAge('2000-11-02', new Date(2026, 10, 2))).toBe(26);
  });
  it('calculates BMI', () => { expect(calculateBMI(200, 100)).toBe(25); expect(calculateBMI(null, 80)).toBeNull(); });
  it('counts days', () => { expect(daysBetween('2026-10-01', '2026-10-15')).toBe(14); });
});

describe('csv', () => {
  it('quotes and protects against formula injection', () => {
    expect(escapeCsv('a,b')).toBe('"a,b"');
    expect(escapeCsv('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(escapeCsv(-5)).toBe('-5');
    const csv = toCsv([{ n: 'Jöhn "J"' }], [{ header: 'Name', value: (r) => r.n }]);
    expect(csv.startsWith('﻿Name\r\n')).toBe(true);
    expect(csv).toContain('"Jöhn ""J"""');
  });
});

describe('analytics', () => {
  it('computes days lost', () => {
    expect(daysLost({ injury_date: '2026-10-01', return_to_play_date: '2026-10-11', closed_date: null, status: 'Recovered' })).toBe(10);
    expect(daysLost({ injury_date: '2026-10-01', return_to_play_date: null, closed_date: null, status: 'Under Treatment' }, '2026-10-05')).toBe(4);
  });
  it('never invents exposure', () => {
    expect(incidencePer1000h(3, [])).toBeNull();
    expect(incidencePer1000h(2, [{ duration_minutes: 60, players_exposed: 10 }])).toEqual({ hours: 10, rate: 200 });
  });
  it('builds date ranges', () => {
    expect(rangeFromPreset('7d', { today: '2026-11-02' })).toEqual({ from: '2026-10-27', to: '2026-11-02' });
    expect(rangeFromPreset('month', { today: '2026-11-02' })).toEqual({ from: '2026-11-01', to: '2026-11-02' });
  });
  it('builds monthly trend', () => {
    const t = monthlyTrend([{ injury_date: '2026-09-10' }, { injury_date: '2026-10-01' }, { injury_date: '2026-10-20' }], { from: '2026-09-01', to: '2026-11-02' });
    expect(t.map((m) => m.injuries)).toEqual([1, 2, 0]);
  });
  it('computes dashboard stats from records', () => {
    const s = computeDashboardStats({
      players: [{ id: 'a', status: 'active' }, { id: 'b', status: 'active' }, { id: 'c', status: 'archived' }],
      injuries: [{ player_id: 'b', status: 'Under Treatment', is_archived: false } as never],
      availability: [
        { player_id: 'a', effective_date: '2026-10-01', created_at: '1', availability: 'NOT AVAILABLE' } as never,
        { player_id: 'a', effective_date: '2026-10-05', created_at: '2', availability: 'FULLY AVAILABLE' } as never,
        { player_id: 'b', effective_date: '2026-10-05', created_at: '2', availability: 'MODIFIED TRAINING' } as never,
      ],
      clearances: [{ player_id: 'a', decision_date: '2026-09-01', created_at: '1', clearance_status: 'Cleared for Full Participation' } as never],
      examinations: [{ player_id: 'a', examination_date: '2026-09-01', is_archived: false }],
      rehab: [], season: { start_date: '2026-09-01' },
    });
    expect(s).toEqual({ totalPlayers: 2, cleared: 1, fullTraining: 1, injured: 1, underRehab: 0, modifiedTraining: 1, awaitingAssessment: 1, clearancePending: 1 });
  });
});
