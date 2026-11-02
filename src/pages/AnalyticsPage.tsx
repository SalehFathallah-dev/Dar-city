import { useMemo, useState } from 'react';
import { BarChart3, CalendarClock, HeartPulse, Plus, Repeat, Timer, Trash2, Users } from 'lucide-react';
import * as api from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useReference } from '../context/ReferenceContext';
import { useToast } from '../context/ToastContext';
import { daysLost, inRange, incidencePer1000h, injuryAnalytics, monthlyTrend } from '../lib/analytics';
import { formatDate, todayISO } from '../lib/format';
import type { Exposure } from '../lib/types';
import { Button, Card, ConfirmDialog, ErrorBlock, Field, Grid, Input, Modal, PageHeader, SegmentedControl, Select, Spinner, StatCard, Table, Td } from '../components/ui';
import { DateRangeFilter, useDateRange } from '../components/DateRangeFilter';
import { DonutChart, HBarChart, TrendChart, VBarChart } from '../components/charts';

export default function AnalyticsPage() {
  const { caps } = useAuth();
  const { players, seasons, currentSeason } = useReference();
  const toast = useToast();
  const dr = useDateRange('season');
  const [seasonId, setSeasonId] = useState('');
  const data = useAsync(async () => {
    const [injuries, rehab, rtp, exposures] = await Promise.all([api.listInjuries(), api.listRehabPrograms(), api.listRtp(), api.listExposures()]);
    return { injuries, rehab, rtp, exposures };
  }, []);
  const [expOpen, setExpOpen] = useState(false);
  const [delExp, setDelExp] = useState<Exposure | null>(null);

  const range = useMemo(() => {
    const s = seasons.find((x) => x.id === seasonId);
    return s ? { from: s.start_date, to: s.end_date } : dr.range;
  }, [seasonId, seasons, dr.range]);

  const view = useMemo(() => {
    if (!data.data) return null;
    const any = !range.from && !range.to;
    const f = <T,>(list: T[], key: (t: T) => string) => (any ? list : list.filter((x) => inRange(key(x), range)));
    const injuries = f(data.data.injuries, (i) => i.injury_date);
    const a = injuryAnalytics(injuries, players, f(data.data.rehab, (r) => r.start_date), f(data.data.rtp, (r) => r.decision_date));
    const exp = f(data.data.exposures, (e) => e.session_date);
    const perPlayer = new Map<string, { name: string; injuries: number; days: number }>();
    for (const i of injuries) {
      const cur = perPlayer.get(i.player_id) ?? { name: i.players?.full_name ?? '', injuries: 0, days: 0 };
      cur.injuries++; cur.days += daysLost(i); perPlayer.set(i.player_id, cur);
    }
    const matchExp = exp.filter((e) => e.session_type === 'Match'), trainExp = exp.filter((e) => e.session_type === 'Training');
    return {
      a, exp, trend: monthlyTrend(injuries, range),
      perPlayer: [...perPlayer.values()].sort((x, y) => y.injuries - x.injuries || y.days - x.days),
      inc: incidencePer1000h(injuries.length, exp),
      incMatch: incidencePer1000h(injuries.filter((i) => i.setting === 'Match').length, matchExp),
      incTraining: incidencePer1000h(injuries.filter((i) => i.setting === 'Training').length, trainExp),
    };
  }, [data.data, players, range]);

  if (data.loading) return <Spinner />;
  if (data.error) return <ErrorBlock message={data.error} onRetry={data.reload} />;
  if (!view) return null;
  const { a } = view;
  return (
    <div className="space-y-5">
      <PageHeader title="Medical Analytics" subtitle="All statistics are calculated from recorded data" icon={<BarChart3 className="h-6 w-6" />}
        actions={<div className="flex flex-wrap gap-2">
          <Select value={seasonId} onChange={(e) => setSeasonId(e.target.value)} className="!w-auto" options={seasons.map((s) => ({ value: s.id, label: `Season ${s.name}${s.id === currentSeason?.id ? ' (current)' : ''}` }))} placeholder="Filter by date range" />
          {!seasonId && <DateRangeFilter state={dr} />}
        </div>} />
      <p className="text-xs text-neutral-500">Period: {range.from || range.to ? `${formatDate(range.from)} – ${formatDate(range.to)}` : 'All recorded data'}. <b>Injury count</b>, <b>player count</b> and <b>days lost</b> are reported separately.</p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total injuries (count)" value={a.total} icon={<HeartPulse className="h-6 w-6" />} tone="red" />
        <StatCard label="New injuries" value={a.newInjuries} icon={<Plus className="h-6 w-6" />} tone="orange" />
        <StatCard label="Recurrent injuries" value={a.recurrent} icon={<Repeat className="h-6 w-6" />} tone="orange" />
        <StatCard label="Players injured (players)" value={a.playersInjured} icon={<Users className="h-6 w-6" />} hint={`${a.injuriesPerPlayer} injuries per injured player`} />
        <StatCard label="Total days lost (days)" value={a.totalDaysLost} icon={<CalendarClock className="h-6 w-6" />} tone="red" />
        <StatCard label="Average time lost" value={`${a.averageDaysLost} d`} icon={<Timer className="h-6 w-6" />} tone="beige" hint="Completed injuries only" />
        <StatCard label="Average rehabilitation" value={`${a.averageRehabDays} d`} icon={<Timer className="h-6 w-6" />} tone="blue" />
        <StatCard label="Incidence /1000 h" value={view.inc ? view.inc.rate : 'n/a'} icon={<BarChart3 className="h-6 w-6" />} tone="green" hint={view.inc ? `${view.inc.hours} player-hours` : 'No exposure data recorded'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Injuries by Body Region"><HBarChart data={a.byRegion} /></Card>
        <Card title="Injuries by Playing Position"><VBarChart data={a.byPosition} colorful /></Card>
        <Card title="Injuries by Mechanism"><HBarChart data={a.byMechanism} color="#242424" /></Card>
        <Card title="Monthly Injury Trend"><TrendChart data={view.trend} /></Card>
        <Card title="Contact vs Non-Contact"><DonutChart data={a.contact} /></Card>
        <Card title="Match vs Training"><DonutChart data={a.setting} /></Card>
        <Card title="Days Lost by Body Region"><HBarChart data={a.daysLostByRegion} unit="Days lost" color="#D91E36" /></Card>
        <Card title="Return-to-Play Outcomes"><VBarChart data={a.rtpOutcomes} unit="Decisions" colorful /></Card>
      </div>

      <Card title="Injuries per Player" padded={false}>
        <div className="px-5"><Table headers={['Player', 'Injuries (count)', 'Days lost']} empty={!view.perPlayer.length}>
          {view.perPlayer.map((p) => <tr key={p.name}><Td className="font-semibold">{p.name}</Td><Td>{p.injuries}</Td><Td>{p.days}</Td></tr>)}
        </Table></div>
      </Card>

      <Card title="Exposure & Injury Incidence" actions={caps.editMedical && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setExpOpen(true)}>Record Session Exposure</Button>}>
        <p className="mb-3 text-sm text-neutral-600">Incidence = injuries ÷ player-hours × 1,000. It is only calculated from recorded sessions – exposure is never estimated.</p>
        <Grid cols={3}>
          <StatCard label="Overall /1000 h" value={view.inc?.rate ?? 'n/a'} icon={<BarChart3 className="h-5 w-5" />} hint={view.inc ? `${view.inc.hours} h` : 'No data'} />
          <StatCard label="Match /1000 h" value={view.incMatch?.rate ?? 'n/a'} icon={<BarChart3 className="h-5 w-5" />} tone="red" hint={view.incMatch ? `${view.incMatch.hours} h` : 'No match exposure'} />
          <StatCard label="Training /1000 h" value={view.incTraining?.rate ?? 'n/a'} icon={<BarChart3 className="h-5 w-5" />} tone="orange" hint={view.incTraining ? `${view.incTraining.hours} h` : 'No training exposure'} />
        </Grid>
        <div className="mt-4 max-h-72 overflow-y-auto">
          <Table headers={['Date', 'Session', 'Duration (min)', 'Players', 'Player-hours', '']} empty={!view.exp.length}>
            {view.exp.slice(0, 200).map((e) => (
              <tr key={e.id}><Td>{formatDate(e.session_date)}</Td><Td>{e.session_type}</Td><Td>{e.duration_minutes}</Td><Td>{e.players_exposed}</Td><Td>{Math.round((e.duration_minutes * e.players_exposed) / 6) / 10}</Td>
                <Td>{caps.editMedical && <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDelExp(e)} aria-label="Delete" />}</Td></tr>
            ))}
          </Table>
        </div>
      </Card>
      <ExposureModal open={expOpen} seasonId={currentSeason?.id ?? null} onClose={() => setExpOpen(false)} onSaved={() => { setExpOpen(false); void data.reload(); }} />
      <ConfirmDialog open={!!delExp} title="Delete exposure record" danger confirmLabel="Delete" message="Remove this session's exposure data? This affects incidence calculations."
        onCancel={() => setDelExp(null)} onConfirm={async () => { try { await api.deleteExposure(delExp!.id); toast.success('Exposure removed'); setDelExp(null); void data.reload(); } catch (e) { toast.error((e as Error).message); } }} />
    </div>
  );
}

function ExposureModal({ open, seasonId, onClose, onSaved }: { open: boolean; seasonId: string | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ session_date: todayISO(), session_type: 'Training' as 'Match' | 'Training', duration_minutes: '90', players_exposed: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const dur = Number(f.duration_minutes), n = Number(f.players_exposed);
    if (!Number.isInteger(dur) || dur < 1 || dur > 600) return toast.error('Duration must be 1–600 minutes');
    if (!Number.isInteger(n) || n < 1 || n > 40) return toast.error('Players exposed must be 1–40');
    setSaving(true);
    try { await api.addExposure({ ...f, duration_minutes: dur, players_exposed: n, season_id: seasonId }); toast.success('Exposure recorded'); onSaved(); }
    catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Record Session Exposure" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <Grid>
          <Field label="Session date"><Input type="date" value={f.session_date} onChange={(e) => setF({ ...f, session_date: e.target.value })} /></Field>
          <Field label="Session type"><SegmentedControl value={f.session_type} options={['Training', 'Match'] as const} onChange={(v) => setF({ ...f, session_type: v })} /></Field>
          <Field label="Duration (minutes)"><Input type="number" value={f.duration_minutes} onChange={(e) => setF({ ...f, duration_minutes: e.target.value })} /></Field>
          <Field label="Players exposed"><Input type="number" value={f.players_exposed} onChange={(e) => setF({ ...f, players_exposed: e.target.value })} /></Field>
        </Grid>
        <Field label="Notes"><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
