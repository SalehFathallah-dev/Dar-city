import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ClipboardCheck, Pill, ShieldCheck, Users } from 'lucide-react';
import * as api from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { useClub } from '../context/ClubContext';
import { useAuth } from '../context/AuthContext';
import { addDays, formatDate, todayISO } from '../lib/format';
import type { AdherenceRow, TeamSummaryRow } from '../lib/types';
import { Badge, Card, ErrorBlock, Modal, PageHeader, SegmentedControl, Select, Spinner, StatCard, Table, Td, Tabs, statusColor } from '../components/ui';
import { AdherenceGrid, summarize } from '../components/PrescriptionsPanel';
import { RecoveryPanel } from '../components/RecoveryPanel';

const PERIODS = ['Today', '7 days', '14 days'] as const;
const periodDays = (p: (typeof PERIODS)[number]) => (p === 'Today' ? 1 : p === '7 days' ? 7 : 14);

/**
 * Team status for the whole staff (physician, assistants, team manager, head coach):
 * readiness, rehabilitation phase, expected return and whether athletes took
 * their treatment and supplements. No diagnoses or clinical notes.
 */
export default function TeamStatusPage() {
  const { clubId, club } = useClub();
  const { caps } = useAuth();
  const today = todayISO();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>('7 days');
  const days = periodDays(period);
  const summary = useAsync(() => api.getTeamSummary(clubId!), [clubId]);
  const adherence = useAsync(() => api.getTeamAdherence(clubId!, addDays(today, -(days - 1)), today), [clubId, days, today]);
  const [detail, setDetail] = useState<TeamSummaryRow | null>(null);
  const [detailTab, setDetailTab] = useState<'recovery' | 'adherence'>('recovery');
  const [category, setCategory] = useState('');

  const byPlayer = useMemo(() => {
    const m = new Map<string, AdherenceRow[]>();
    for (const r of adherence.data ?? []) { if (!m.has(r.player_id)) m.set(r.player_id, []); m.get(r.player_id)!.push(r); }
    return m;
  }, [adherence.data]);
  const categories = useMemo(() => [...new Set((summary.data ?? []).map((r) => r.team_category))].sort(), [summary.data]);
  const rows = (summary.data ?? []).filter((r) => !category || r.team_category === category);
  const shownIds = new Set(rows.map((r) => r.player_id));
  const team = summarize((adherence.data ?? []).filter((r) => shownIds.has(r.player_id)));
  const count = (a: string) => rows.filter((r) => r.availability === a).length;

  return (
    <div className="space-y-4">
      <PageHeader title="Team Status" subtitle={`${club?.name ?? ''} – readiness, plans and treatment adherence`} icon={<ClipboardCheck className="h-6 w-6" />}
        actions={<SegmentedControl value={period} options={PERIODS} onChange={setPeriod} />} />
      {categories.length > 1 && (
        <div className="max-w-xs"><Select value={category} onChange={(e) => setCategory(e.target.value)} options={categories} placeholder="All categories" /></div>
      )}
      {!caps.viewMedical && <p className="flex items-center gap-2 rounded-xl bg-brand-cream px-4 py-2 text-xs text-neutral-600"><ShieldCheck className="h-4 w-4 text-brand-gold" />Summary view: diagnoses and clinical notes are visible only to the medical team.</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Fully available" value={count('FULLY AVAILABLE')} icon={<Users className="h-5 w-5" />} tone="green" />
        <StatCard label="Modified / individual" value={count('MODIFIED TRAINING') + count('INDIVIDUAL TRAINING')} icon={<Users className="h-5 w-5" />} tone="orange" />
        <StatCard label="Not available" value={count('NOT AVAILABLE')} icon={<Users className="h-5 w-5" />} tone="red" />
        <StatCard label={`Treatment adherence (${period.toLowerCase()})`} value={team.pct === null ? '—' : `${team.pct}%`} icon={<Pill className="h-5 w-5" />} tone="blue"
          hint={team.due ? `${team.taken}/${team.due} doses confirmed` : 'No doses due'} />
      </div>
      <Card title="Players" padded={false}>
        {summary.loading ? <Spinner /> : summary.error ? <ErrorBlock message={summary.error} onRetry={summary.reload} /> : (
          <div className="px-5"><Table headers={['Player', 'Availability', 'Plan', 'Expected return', `Adherence (${period.toLowerCase()})`]} empty={!rows.length}>
            {rows.map((r) => {
              const s = summarize(byPlayer.get(r.player_id) ?? []);
              return (
                <tr key={r.player_id} className="cursor-pointer hover:bg-brand-cream/60" onClick={() => { setDetail(r); setDetailTab('recovery'); }}>
                  <Td><p className="font-semibold">{r.jersey_number != null && <span className="text-brand-gold">#{r.jersey_number} </span>}{r.full_name}</p><p className="text-xs text-neutral-500">{r.position} · {r.team_category}</p></Td>
                  <Td><Badge color={statusColor(r.availability)}>{r.availability}</Badge><p className="mt-1 text-xs text-neutral-500">{r.medical_status}</p>{r.restrictions && <p className="text-xs text-amber-700">{r.restrictions}</p>}</Td>
                  <Td className="text-xs">{r.rehab_phase ? <Badge color="orange">{r.rehab_phase}</Badge> : r.open_injuries ? 'Under medical follow-up' : '—'}{r.staff_notes && <p className="mt-1 text-neutral-600">{r.staff_notes}</p>}</Td>
                  <Td className="text-xs">{r.expected_return_date ? formatDate(r.expected_return_date) : '—'}</Td>
                  <Td>{adherence.loading ? '…' : s.due === 0 ? <span className="text-xs text-neutral-400">No doses</span> : (
                    <div className="text-xs"><b className={clsx('text-sm', s.pct !== null && s.pct < 70 ? 'text-brand-red' : 'text-emerald-700')}>{s.pct}%</b>
                      <span className="text-neutral-500"> · ✓{s.taken}{s.skipped ? ` ✗${s.skipped}` : ''}{s.missed ? ` !${s.missed}` : ''}</span></div>
                  )}</Td>
                </tr>
              );
            })}
          </Table></div>
        )}
      </Card>
      {adherence.error && <ErrorBlock message={adherence.error} onRetry={adherence.reload} />}
      {detail && (
        <Modal open onClose={() => setDetail(null)} title={detail.full_name} size="lg">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2"><Badge color={statusColor(detail.availability)}>{detail.availability}</Badge><span className="text-sm">{detail.medical_status}</span></div>
            {detail.next_followup_date && <p className="text-sm">Next medical review: <b>{formatDate(detail.next_followup_date)}</b></p>}
            <Tabs tabs={[{ id: 'recovery' as const, label: 'Recovery progress' }, { id: 'adherence' as const, label: 'Treatment adherence' }]} active={detailTab} onChange={setDetailTab} />
            {detailTab === 'recovery' ? <RecoveryPanel playerId={detail.player_id} /> : <AdherenceGrid rows={byPlayer.get(detail.player_id) ?? []} days={Math.max(days, 7)} />}
          </div>
        </Modal>
      )}
    </div>
  );
}
