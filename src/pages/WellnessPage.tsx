import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Activity, AlertTriangle, Settings2 } from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import * as api from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useReference } from '../context/ReferenceContext';
import { useToast } from '../context/ToastContext';
import { addDays, formatDate, todayISO } from '../lib/format';
import type { WellnessResponse, WellnessSettings } from '../lib/types';
import { Badge, Button, Card, Checkbox, ErrorBlock, Field, Grid, Input, PageHeader, Select, Spinner, Table, Tabs, Td } from '../components/ui';

const DAYS = 28;
const avg = (xs: (number | null | undefined)[]) => { const v = xs.filter((x): x is number => typeof x === 'number'); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null; };
const tone = (v: number | null | undefined, bad: number, warn: number, invert = false) => {
  if (v === null || v === undefined) return '';
  const x = invert ? -v : v; return x >= (invert ? -bad : bad) ? 'bg-red-100 text-brand-red font-bold' : x >= (invert ? -warn : warn) ? 'bg-amber-100 text-amber-800' : '';
};

/** Daily athlete wellness: questionnaires, baseline-based decision-support flags and trends. */
export default function WellnessPage() {
  const { caps } = useAuth();
  const { players } = useReference();
  const active = useMemo(() => players.filter((p) => p.status === 'active'), [players]);
  const [date, setDate] = useState(todayISO());
  const [tab, setTab] = useState<'today' | 'player' | 'team' | 'missing' | 'settings'>('today');
  const data = useAsync(() => api.listWellness(addDays(date, -(DAYS - 1)), date), [date]);
  const flags = useAsync(() => api.getWellnessFlags(date), [date]);
  const settings = useAsync(() => api.getWellnessSettings(), []);
  const rows = data.data ?? [];
  const day = rows.filter((r) => r.response_date === date);
  useEffect(() => { void api.logEvent('VIEW_WELLNESS', 'wellness_responses', date); }, [date]);

  return (
    <div className="space-y-4">
      <PageHeader title="Athlete Wellness" subtitle="Daily questionnaires compared with each athlete's own baseline" icon={<Activity className="h-6 w-6" />}
        actions={<Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value || todayISO())} className="!w-44" />} />
      {settings.data && !settings.data.pre_enabled && !settings.data.post_enabled && (
        <p className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900">Questionnaires are switched off – athletes do not see them. Turn them on in <button className="font-bold underline" onClick={() => setTab('settings')}>Settings</button>.</p>
      )}
      <Tabs tabs={[
        { id: 'today' as const, label: 'Daily dashboard', count: flags.data?.length },
        { id: 'player' as const, label: 'Player trends' }, { id: 'team' as const, label: 'Team & weekly load' },
        { id: 'missing' as const, label: 'Missing questionnaires' }, ...(caps.isPhysician ? [{ id: 'settings' as const, label: 'Settings' }] : []),
      ]} active={tab} onChange={setTab} />
      {data.error && <ErrorBlock message={data.error} onRetry={data.reload} />}

      {tab === 'today' && (
        <>
          <Card title={<span className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" /> Flags for medical review – {formatDate(date)}</span>}>
            <p className="mb-3 text-xs text-neutral-500">Decision-support alerts based on each athlete's own baseline (configurable). They are not diagnoses or injury predictions and require clinical interpretation.</p>
            {flags.loading ? <Spinner /> : flags.error ? <ErrorBlock message={flags.error} /> : !flags.data?.length ? <p className="text-sm text-emerald-700">No flags.</p> : (
              <ul className="grid gap-2 sm:grid-cols-2">{flags.data.map((f, i) => (
                <li key={i} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"><b>{f.full_name}</b> · <span className="font-semibold text-amber-800">{f.flag}</span><p className="text-xs text-neutral-600">{f.detail}</p></li>
              ))}</ul>
            )}
          </Card>
          <Card title={`Responses – ${formatDate(date)} (${new Set(day.filter((r) => r.kind === 'pre').map((r) => r.player_id)).size}/${active.length} pre-training)`} padded={false}>
            {data.loading ? <Spinner /> : (
              <div className="overflow-x-auto px-5"><Table headers={['Player', 'Sleep h', 'Sleep q.', 'Fatigue', 'Soreness', 'Energy', 'Readiness', 'Pain / illness', 'Sessions (load)']}>
                {active.map((p) => {
                  const pre = day.find((r) => r.player_id === p.id && r.kind === 'pre');
                  const posts = day.filter((r) => r.player_id === p.id && r.kind === 'post');
                  return (
                    <tr key={p.id} className={clsx(!pre && 'text-neutral-400')}>
                      <Td className="font-semibold">{p.full_name}</Td>
                      {pre ? <>
                        <Td className={tone(pre.sleep_hours, -6, -7, true)}>{pre.sleep_hours}</Td><Td>{pre.sleep_quality}/5</Td>
                        <Td className={tone(pre.fatigue, 8, 6)}>{pre.fatigue}</Td><Td className={tone(pre.soreness, 8, 6)}>{pre.soreness}</Td>
                        <Td>{pre.energy}</Td><Td className={tone(pre.readiness, -4, -6, true)}>{pre.readiness}</Td>
                        <Td>{pre.pain && <Badge color="red">Pain {pre.pain_severity ?? ''}{pre.pain_location ? ` · ${pre.pain_location}` : ''}</Badge>} {pre.unwell && <Badge color="orange">Unwell</Badge>}{!pre.pain && !pre.unwell && '—'}</Td>
                      </> : <td colSpan={7} className="px-5 py-3 text-xs">Not completed</td>}
                      <Td className="text-xs">{posts.length ? posts.map((s) => `${s.session_type}: ${s.session_load}`).join(' · ') : '—'}</Td>
                    </tr>
                  );
                })}
              </Table></div>
            )}
          </Card>
        </>
      )}
      {tab === 'player' && <PlayerTrends rows={rows} players={active} />}
      {tab === 'team' && <TeamView rows={rows} players={active} date={date} />}
      {tab === 'missing' && <MissingReport rows={rows} players={active} date={date} />}
      {tab === 'settings' && caps.isPhysician && <SettingsCard value={settings.data} onSaved={() => { void settings.reload(); void flags.reload(); }} />}
    </div>
  );
}

type P = { id: string; full_name: string };
function PlayerTrends({ rows, players }: { rows: WellnessResponse[]; players: P[] }) {
  const [pid, setPid] = useState(players[0]?.id ?? '');
  const mine = rows.filter((r) => r.player_id === pid);
  const dates = [...new Set(mine.map((r) => r.response_date))].sort();
  const series = dates.map((d) => {
    const pre = mine.find((r) => r.response_date === d && r.kind === 'pre');
    const load = mine.filter((r) => r.response_date === d && r.kind === 'post').reduce((s, r) => s + (r.session_load ?? 0), 0);
    return { date: d.slice(5), fatigue: pre?.fatigue ?? null, soreness: pre?.soreness ?? null, readiness: pre?.readiness ?? null, sleep: pre?.sleep_hours ?? null, load: load || null };
  });
  return (
    <Card title="Individual trend (last 28 days)" actions={<Select value={pid} onChange={(e) => setPid(e.target.value)} options={players.map((p) => ({ value: p.id, label: p.full_name }))} />}>
      {!series.length ? <p className="text-sm text-neutral-500">No questionnaires for this athlete in the period.</p> : (
        <div className="space-y-6">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={series} margin={{ left: -20, right: 10, top: 10 }}>
              <CartesianGrid stroke="#eee" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis domain={[0, 10]} tick={{ fontSize: 11 }} /><Tooltip /><Legend />
              <Line dataKey="fatigue" name="Fatigue" stroke="#C0283A" strokeWidth={2} connectNulls />
              <Line dataKey="soreness" name="Soreness" stroke="#D97706" strokeWidth={2} connectNulls />
              <Line dataKey="readiness" name="Readiness" stroke="#1E7FC2" strokeWidth={2} connectNulls />
              <Line dataKey="sleep" name="Sleep (h)" stroke="#182A5C" strokeDasharray="4 3" strokeWidth={2} connectNulls />
            </LineChart>
          </ResponsiveContainer>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={series} margin={{ left: -10, right: 10 }}>
              <CartesianGrid stroke="#eee" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip />
              <Bar dataKey="load" name="Daily load (RPE × min)" fill="#4DB6E6" radius={[4, 4, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function TeamView({ rows, players, date }: { rows: WellnessResponse[]; players: P[]; date: string }) {
  const days = Array.from({ length: 14 }, (_, i) => addDays(date, -13 + i));
  const daily = days.map((d) => {
    const pre = rows.filter((r) => r.response_date === d && r.kind === 'pre');
    return { date: d.slice(5), fatigue: avg(pre.map((r) => r.fatigue)), soreness: avg(pre.map((r) => r.soreness)), readiness: avg(pre.map((r) => r.readiness)),
      completion: players.length ? Math.round((new Set(pre.map((r) => r.player_id)).size / players.length) * 100) : 0 };
  });
  const week = (from: string, to: string, pid: string) => rows.filter((r) => r.player_id === pid && r.kind === 'post' && r.response_date >= from && r.response_date <= to).reduce((s, r) => s + (r.session_load ?? 0), 0);
  const thisFrom = addDays(date, -6); const prevFrom = addDays(date, -13); const prevTo = addDays(date, -7);
  return (
    <div className="space-y-4">
      <Card title="Team wellness – daily averages (14 days)">
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={daily} margin={{ left: -20, right: 10, top: 10 }}>
            <CartesianGrid stroke="#eee" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis yAxisId="s" domain={[0, 10]} tick={{ fontSize: 11 }} /><YAxis yAxisId="c" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} hide /><Tooltip /><Legend />
            <Bar yAxisId="c" dataKey="completion" name="Completion %" fill="#E5EEF8" />
            <Line yAxisId="s" dataKey="fatigue" name="Fatigue" stroke="#C0283A" strokeWidth={2} connectNulls />
            <Line yAxisId="s" dataKey="soreness" name="Soreness" stroke="#D97706" strokeWidth={2} connectNulls />
            <Line yAxisId="s" dataKey="readiness" name="Readiness" stroke="#1E7FC2" strokeWidth={2} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>
      <Card title="Weekly fatigue & load report" padded={false}>
        <div className="overflow-x-auto px-5"><Table headers={['Player', 'Avg fatigue (7 d)', 'Avg soreness (7 d)', 'Load this week', 'Load previous week', 'Change']}>
          {players.map((p) => {
            const last7 = rows.filter((r) => r.player_id === p.id && r.kind === 'pre' && r.response_date >= thisFrom && r.response_date <= date);
            const now = week(thisFrom, date, p.id); const prev = week(prevFrom, prevTo, p.id);
            const ch = prev ? Math.round(((now - prev) / prev) * 100) : null;
            return (
              <tr key={p.id}><Td className="font-semibold">{p.full_name}</Td><Td>{avg(last7.map((r) => r.fatigue)) ?? '—'}</Td><Td>{avg(last7.map((r) => r.soreness)) ?? '—'}</Td>
                <Td>{now || '—'}</Td><Td>{prev || '—'}</Td><Td className={clsx(ch !== null && Math.abs(ch) >= 30 && 'font-bold text-amber-700')}>{ch === null ? '—' : `${ch > 0 ? '+' : ''}${ch}%`}</Td></tr>
            );
          })}
        </Table></div>
        <p className="px-5 pb-4 text-xs text-neutral-500">Load = session RPE × duration (minutes), from post-training questionnaires. Interpret week-to-week changes in context; no single threshold diagnoses overtraining.</p>
      </Card>
    </div>
  );
}

function MissingReport({ rows, players, date }: { rows: WellnessResponse[]; players: P[]; date: string }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(date, -6 + i));
  return (
    <Card title="Pre-training questionnaires – last 7 days" padded={false}>
      <div className="overflow-x-auto px-5"><Table headers={['Player', ...days.map((d) => d.slice(5)), 'Completed']}>
        {players.map((p) => {
          const done = days.map((d) => rows.some((r) => r.player_id === p.id && r.kind === 'pre' && r.response_date === d));
          const n = done.filter(Boolean).length;
          return (
            <tr key={p.id}><Td className="font-semibold">{p.full_name}</Td>{done.map((x, i) => <Td key={i} className="text-center">{x ? <span className="text-emerald-600">✓</span> : <span className="text-brand-red">✗</span>}</Td>)}
              <Td className={clsx(n < 4 && 'font-bold text-brand-red')}>{n}/7</Td></tr>
          );
        })}
      </Table></div>
      <p className="px-5 pb-4 text-xs text-neutral-500">Athletes without an app account cannot complete questionnaires – create accounts from the player profile or approve their access requests.</p>
    </Card>
  );
}

function SettingsCard({ value, onSaved }: { value: WellnessSettings | null | undefined; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<Partial<WellnessSettings>>(value ?? { pre_enabled: false, post_enabled: false, reminder_time: '09:00', baseline_days: 28, min_baseline: 5, fatigue_rise: 2, soreness_rise: 2, readiness_drop: 2, sleep_drop: 1.5, sleep_min: 6, high_score: 8, missed_days: 2 });
  useEffect(() => { if (value) setF(value); }, [value]);
  const [saving, setSaving] = useState(false);
  const n = (k: keyof WellnessSettings) => ({ value: (f[k] as number | undefined) ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value === '' ? undefined : Number(e.target.value) }) });
  const save = async () => {
    setSaving(true);
    try { await api.saveWellnessSettings(f); toast.success('Wellness settings saved'); onSaved(); } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <Card title={<span className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-brand-gold" /> Questionnaire settings</span>}>
      <div className="space-y-4">
        <Checkbox label="Daily pre-training questionnaire" checked={!!f.pre_enabled} onChange={(v) => setF({ ...f, pre_enabled: v })} description="Athletes see it every day at the top of their screen in the app." />
        <Checkbox label="Post-training questionnaire (session RPE)" checked={!!f.post_enabled} onChange={(v) => setF({ ...f, post_enabled: v })} description="One entry per session: morning, evening, gym, conditioning, recovery, match." />
        <Grid cols={3}>
          <Field label="Baseline window (days)"><Input type="number" min={7} max={120} {...n('baseline_days')} /></Field>
          <Field label="Minimum answers for a baseline"><Input type="number" min={3} max={60} {...n('min_baseline')} /></Field>
          <Field label="Flag: fatigue above baseline by"><Input type="number" step="0.5" {...n('fatigue_rise')} /></Field>
          <Field label="Flag: soreness above baseline by"><Input type="number" step="0.5" {...n('soreness_rise')} /></Field>
          <Field label="Flag: readiness below baseline by"><Input type="number" step="0.5" {...n('readiness_drop')} /></Field>
          <Field label="Flag: sleep below baseline by (h)"><Input type="number" step="0.5" {...n('sleep_drop')} /></Field>
          <Field label="Flag: sleep under (h)"><Input type="number" step="0.5" {...n('sleep_min')} /></Field>
          <Field label="Flag: any score ≥"><Input type="number" min={5} max={10} {...n('high_score')} /></Field>
          <Field label="Flag: missed questionnaires (days)"><Input type="number" min={1} max={14} {...n('missed_days')} /></Field>
        </Grid>
        <Button loading={saving} onClick={() => void save()}>Save settings</Button>
      </div>
    </Card>
  );
}
