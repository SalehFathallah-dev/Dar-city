import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Dumbbell, Lightbulb, Pencil, Plus, Trash2, Wand2 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import * as api from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useReference } from '../context/ReferenceContext';
import { useToast } from '../context/ToastContext';
import { addDays, formatDate, todayISO } from '../lib/format';
import { adviseSession, type Readiness } from '../lib/trainingAdvisor';
import { PARTICIPATION, TRAINING_TYPES, type Participation, type TrainingSession } from '../lib/types';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorBlock, Field, Grid, Input, Modal, PageHeader, Select, Spinner, Table, Td, Textarea } from '../components/ui';

const WEEKS = 8;
const monday = (iso: string) => { const d = new Date(`${iso}T00:00:00`); const w = (d.getDay() + 6) % 7; return addDays(iso, -w); };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const COUNTS = new Set(['Full', 'Modified', 'Individual']);

/** Training load: sessions, individual participation and sRPE load (RPE × minutes). */
export default function TrainingLoadPage() {
  const { caps } = useAuth();
  const toast = useToast();
  const { players } = useReference();
  const active = useMemo(() => players.filter((p) => p.status === 'active'), [players]);
  const canEdit = caps.isStaff;
  const [week, setWeek] = useState(monday(todayISO()));
  const from = addDays(week, -7 * (WEEKS - 1));
  const to = addDays(week, 6);
  const data = useAsync(async () => {
    const sessions = await api.listTraining(addDays(from, -7), to);
    const part = await api.listParticipation(sessions.map((s) => s.id));
    return { sessions, part };
  }, [from, to]);
  const [edit, setEdit] = useState<{ s: Partial<TrainingSession>; part: Participation[] } | null>(null);
  const [del, setDel] = useState<TrainingSession | null>(null);
  const sessions = data.data?.sessions ?? [];
  const part = data.data?.part ?? [];
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const loadOf = (pid: string, a: string, b: string) => sum(part.filter((p) => p.player_id === pid && p.session_load && (sessionById.get(p.session_id)?.session_date ?? '') >= a && (sessionById.get(p.session_id)?.session_date ?? '') <= b).map((p) => p.session_load!));
  const thisWeek = sessions.filter((s) => s.session_date >= week && s.session_date <= to);

  const weekly = Array.from({ length: WEEKS }, (_, i) => {
    const ws = addDays(week, -7 * (WEEKS - 1 - i)); const we = addDays(ws, 6);
    const rows = part.filter((p) => { const d = sessionById.get(p.session_id)?.session_date ?? ''; return d >= ws && d <= we && p.session_load; });
    const n = new Set(rows.map((r) => r.player_id)).size;
    return { week: ws.slice(5), avg: n ? Math.round(sum(rows.map((r) => r.session_load!)) / n) : 0 };
  });
  const phaseAvg = (phase: TrainingSession['season_phase']) => {
    const ids = new Set(sessions.filter((s) => s.season_phase === phase).map((s) => s.id));
    const rows = part.filter((p) => ids.has(p.session_id) && p.session_load);
    return rows.length ? Math.round(sum(rows.map((r) => r.session_load!)) / rows.length) : null;
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Training Load" subtitle="Session RPE × duration for each athlete – interpret in context, no single threshold diagnoses overtraining" icon={<Dumbbell className="h-6 w-6" />}
        actions={canEdit && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ s: { session_date: todayISO(), start_time: '18:00', session_type: 'Evening training', duration_minutes: 90, planned_rpe: 6, season_phase: 'In-season' }, part: [] })}>Add session</Button>} />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" icon={<ChevronLeft className="h-4 w-4" />} onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week" />
        <p className="font-semibold text-brand-navy">Week of {formatDate(week)}</p>
        <Button size="sm" variant="secondary" icon={<ChevronRight className="h-4 w-4" />} onClick={() => setWeek(addDays(week, 7))} aria-label="Next week" />
        {week !== monday(todayISO()) && <Button size="sm" variant="ghost" onClick={() => setWeek(monday(todayISO()))}>This week</Button>}
      </div>
      {data.loading ? <Spinner /> : data.error ? <ErrorBlock message={data.error} onRetry={data.reload} /> : (
        <>
          <Card title="Sessions this week">
            {!thisWeek.length ? <EmptyState title="No sessions recorded this week" description="Add each training, gym, conditioning or match session with the players' participation and RPE." /> : (
              <ul className="space-y-2">{thisWeek.map((s) => {
                const ps = part.filter((p) => p.session_id === s.id);
                const counted = ps.filter((p) => COUNTS.has(p.status));
                const loads = counted.filter((p) => p.session_load).map((p) => p.session_load!);
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm">
                    <b className="text-brand-navy">{formatDate(s.session_date)}{s.start_time ? ` ${s.start_time.slice(0, 5)}` : ''}</b>
                    <Badge color={s.session_type === 'Match' ? 'red' : 'blue'}>{s.session_type}</Badge>
                    <span>{s.duration_minutes} min{s.planned_rpe ? ` · planned RPE ${s.planned_rpe}` : ''}</span>
                    <Badge color="beige">{s.season_phase}</Badge>
                    <span className="text-neutral-500">{counted.length}/{ps.length || active.length} participated{loads.length ? ` · avg load ${Math.round(sum(loads) / loads.length)}` : ''}</span>
                    {canEdit && <span className="ms-auto flex gap-1">
                      <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEdit({ s, part: ps })}>Edit</Button>
                      <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDel(s)} aria-label="Delete" />
                    </span>}
                  </li>
                );
              })}</ul>
            )}
          </Card>
          <Card title="Individual load – this week vs previous" padded={false}>
            <div className="px-5"><Table headers={['Player', ...weekDays.map((d) => d.slice(5)), 'Week', 'Prev. week', 'Change', 'Training min', 'Match min']}>
              {active.map((p) => {
                const now = loadOf(p.id, week, to); const prev = loadOf(p.id, addDays(week, -7), addDays(week, -1));
                const ch = prev ? Math.round(((now - prev) / prev) * 100) : null;
                const mine = part.filter((x) => x.player_id === p.id && COUNTS.has(x.status) && (sessionById.get(x.session_id)?.session_date ?? '') >= week && (sessionById.get(x.session_id)?.session_date ?? '') <= to);
                const trainMin = sum(mine.filter((x) => sessionById.get(x.session_id)?.session_type !== 'Match').map((x) => x.duration_minutes ?? 0));
                const matchMin = sum(mine.filter((x) => sessionById.get(x.session_id)?.session_type === 'Match').map((x) => x.minutes_played ?? 0));
                return (
                  <tr key={p.id}><Td className="font-semibold">{p.full_name}</Td>
                    {weekDays.map((d) => { const v = loadOf(p.id, d, d); return <Td key={d} className={clsx('text-center', !v && 'text-neutral-300')}>{v || '·'}</Td>; })}
                    <Td className="font-bold">{now || '—'}</Td><Td>{prev || '—'}</Td>
                    <Td className={clsx(ch !== null && Math.abs(ch) >= 30 && 'font-bold text-amber-700')}>{ch === null ? '—' : `${ch > 0 ? '+' : ''}${ch}%`}</Td>
                    <Td>{trainMin || '—'}</Td><Td>{matchMin || '—'}</Td>
                  </tr>
                );
              })}
            </Table></div>
          </Card>
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <Card title={`Team – average weekly load per player (${WEEKS} weeks)`}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weekly} margin={{ left: -10, right: 10, top: 10 }}><CartesianGrid stroke="#eee" vertical={false} /><XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip />
                  <Bar dataKey="avg" name="Avg load / player" fill="#1E7FC2" radius={[4, 4, 0, 0]} /></BarChart>
              </ResponsiveContainer>
            </Card>
            <Card title="Season phase comparison">
              <p className="text-sm">Average session load (RPE × min) in the {WEEKS}-week window:</p>
              <ul className="mt-2 space-y-1 text-sm">{(['Pre-season', 'In-season', 'Off-season'] as const).map((ph) => <li key={ph} className="flex justify-between"><span>{ph}</span><b>{phaseAvg(ph) ?? '—'}</b></li>)}</ul>
            </Card>
          </div>
        </>
      )}
      {edit && <SessionModal value={edit.s} existing={edit.part} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void data.reload(); }} />}
      <ConfirmDialog open={!!del} danger title="Delete session" confirmLabel="Delete" message="Delete this session and its participation records?"
        onCancel={() => setDel(null)} onConfirm={() => { const s = del!; setDel(null); void api.deleteTraining(s.id).then(() => { toast.success('Session deleted'); void data.reload(); }).catch((e) => toast.error((e as Error).message)); }} />
    </div>
  );
}

function SessionModal({ value, existing, onClose, onSaved }: { value: Partial<TrainingSession>; existing: Participation[]; onClose: () => void; onSaved: () => void }) {
  const { caps } = useAuth();
  const toast = useToast();
  const { players } = useReference();
  const active = players.filter((p) => p.status === 'active');
  const matches = useAsync(() => api.listMatches(addDays(todayISO(), -60), addDays(todayISO(), 60)), []);
  const [s, setS] = useState<Partial<TrainingSession>>(value);
  const [rows, setRows] = useState<Record<string, Partial<Participation>>>(() => Object.fromEntries(active.map((p) => {
    const e = existing.find((x) => x.player_id === p.id);
    return [p.id, e ? { ...e } : { player_id: p.id, status: 'Full', duration_minutes: null, rpe: null, minutes_played: null }];
  })));
  const [saving, setSaving] = useState(false);
  const setRow = (pid: string, patch: Partial<Participation>) => setRows((r) => ({ ...r, [pid]: { ...r[pid], ...patch } }));
  const isMatch = s.session_type === 'Match';
  const date = s.session_date ?? todayISO();
  const history = useAsync(async () => {
    const sessions = await api.listTraining(addDays(date, -28), addDays(date, -1));
    const participation = await api.listParticipation(sessions.map((x) => x.id));
    let readiness: Readiness | null = null;
    if (caps.viewMedical) {
      const w = (await api.listWellness(date, date).catch(() => [])).filter((r) => r.kind === 'pre');
      const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null; };
      const flags = await api.getWellnessFlags(date).catch(() => []);
      readiness = { readiness: avg(w.map((r) => r.readiness)), fatigue: avg(w.map((r) => r.fatigue)), responses: w.length, players: active.length,
        flagged: new Set(flags.filter((f) => f.flag !== 'Missed questionnaires').map((f) => f.player_id)).size };
    }
    return { sessions, participation, readiness };
  }, [date, caps.viewMedical]);
  const advice = matches.data && history.data && s.session_type
    ? adviseSession({ date, type: s.session_type, matches: matches.data, sessions: history.data.sessions, participation: history.data.participation, readiness: history.data.readiness, excludeSessionId: s.id })
    : null;
  const fromQuestionnaires = async () => {
    try {
      const w = (await api.listWellness(s.session_date!, s.session_date!)).filter((r) => r.kind === 'post' && (r.session_type === s.session_type || (isMatch && r.session_type === 'Match')));
      let n = 0;
      for (const r of w) if (rows[r.player_id]) { setRow(r.player_id, { rpe: r.rpe, duration_minutes: r.duration_minutes }); n++; }
      toast.success(n ? `RPE filled for ${n} athlete(s) from their post-training questionnaire` : 'No matching post-training questionnaires for this date and type');
    } catch (e) { toast.error((e as Error).message); }
  };
  const save = async () => {
    if (!s.session_date || !s.duration_minutes) return toast.error('Date and duration are required');
    setSaving(true);
    try {
      const part = Object.values(rows).map((r) => ({
        ...r,
        duration_minutes: COUNTS.has(r.status ?? 'Full') ? (r.duration_minutes ?? s.duration_minutes) : 0,
        rpe: COUNTS.has(r.status ?? 'Full') ? (r.rpe ?? s.planned_rpe ?? null) : null,
      }));
      await api.saveTraining(s, part);
      toast.success('Session saved'); onSaved();
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} size="xl" title={s.id ? 'Edit session' : 'New training session'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={() => void save()}>Save</Button></>}>
      <div className="space-y-4">
        <Grid cols={3}>
          <Field label="Date" required><Input type="date" value={s.session_date ?? ''} onChange={(e) => setS({ ...s, session_date: e.target.value })} /></Field>
          <Field label="Start time"><Input type="time" value={s.start_time?.slice(0, 5) ?? ''} onChange={(e) => setS({ ...s, start_time: e.target.value || null })} /></Field>
          <Field label="Type"><Select value={s.session_type} onChange={(e) => setS({ ...s, session_type: e.target.value as TrainingSession['session_type'] })} options={TRAINING_TYPES} /></Field>
          <Field label="Duration (min)" required><Input type="number" min={1} max={600} value={s.duration_minutes ?? ''} onChange={(e) => setS({ ...s, duration_minutes: Number(e.target.value) || undefined })} /></Field>
          <Field label="Planned RPE (1–10)" hint="Default for players without their own RPE"><Input type="number" min={1} max={10} value={s.planned_rpe ?? ''} onChange={(e) => setS({ ...s, planned_rpe: e.target.value ? Number(e.target.value) : null })} /></Field>
          <Field label="Season phase"><Select value={s.season_phase} onChange={(e) => setS({ ...s, season_phase: e.target.value as TrainingSession['season_phase'] })} options={['Pre-season', 'In-season', 'Off-season']} /></Field>
          {isMatch && <Field label="Match"><Select value={s.match_id ?? ''} onChange={(e) => setS({ ...s, match_id: e.target.value || null })} options={(matches.data ?? []).map((m) => ({ value: m.id, label: `${m.match_date} vs ${m.opponent}` }))} placeholder="Choose…" /></Field>}
        </Grid>
        {advice && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Lightbulb className="h-5 w-5 text-brand-gold" />
              <b className="text-brand-navy">Suggested: {advice.duration} min · RPE {advice.rpe}</b>
              <Badge color="blue">{advice.label}</Badge>
              <span className="text-xs text-neutral-600">≈ {advice.duration * advice.rpe} AU per player</span>
              <Button size="sm" variant="secondary" className="ms-auto" onClick={() => setS({ ...s, duration_minutes: advice.duration, planned_rpe: advice.rpe })}>Apply suggestion</Button>
            </div>
            <ul className="mt-2 list-disc space-y-0.5 ps-5 text-xs text-neutral-700">{advice.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            <p className="mt-1 text-[11px] text-neutral-500">Decision support from the match calendar, recent recorded load{caps.viewMedical ? ' and today\'s questionnaires' : ''}. The coach and physician decide.</p>
          </div>
        )}
        <Field label="Notes"><Textarea rows={2} value={s.notes ?? ''} onChange={(e) => setS({ ...s, notes: e.target.value })} /></Field>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase text-neutral-500">Participation</p>
          {caps.viewMedical && <Button size="sm" variant="secondary" icon={<Wand2 className="h-4 w-4" />} onClick={() => void fromQuestionnaires()}>Fill RPE from athletes' questionnaires</Button>}
        </div>
        <div className="max-h-[45vh] overflow-auto rounded-xl border">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="sticky top-0 bg-neutral-50 text-[11px] uppercase text-neutral-500"><tr><th className="p-2 text-left">Player</th><th className="p-2">Status</th><th className="p-2">Minutes</th><th className="p-2">RPE</th>{isMatch && <th className="p-2">Min. played</th>}<th className="p-2">Load</th></tr></thead>
            <tbody className="divide-y">{active.map((p) => {
              const r = rows[p.id] ?? {}; const counts = COUNTS.has(r.status ?? 'Full');
              const min = counts ? (r.duration_minutes ?? s.duration_minutes ?? 0) : 0; const rpe = counts ? (r.rpe ?? s.planned_rpe ?? null) : null;
              return (
                <tr key={p.id}>
                  <td className="p-2 font-semibold">{p.full_name}</td>
                  <td className="p-1"><select value={r.status ?? 'Full'} onChange={(e) => setRow(p.id, { status: e.target.value as Participation['status'] })} className="w-full rounded-lg border px-2 py-1">{PARTICIPATION.map((x) => <option key={x}>{x}</option>)}</select></td>
                  <td className="p-1"><input type="number" min={0} max={600} disabled={!counts} placeholder={String(s.duration_minutes ?? '')} value={r.duration_minutes ?? ''} onChange={(e) => setRow(p.id, { duration_minutes: e.target.value === '' ? null : Number(e.target.value) })} className="w-20 rounded-lg border px-2 py-1" /></td>
                  <td className="p-1"><input type="number" min={1} max={10} disabled={!counts} placeholder={String(s.planned_rpe ?? '')} value={r.rpe ?? ''} onChange={(e) => setRow(p.id, { rpe: e.target.value === '' ? null : Number(e.target.value) })} className="w-16 rounded-lg border px-2 py-1" /></td>
                  {isMatch && <td className="p-1"><input type="number" min={0} max={80} value={r.minutes_played ?? ''} onChange={(e) => setRow(p.id, { minutes_played: e.target.value === '' ? null : Number(e.target.value) })} className="w-16 rounded-lg border px-2 py-1" /></td>}
                  <td className="p-2 text-center font-semibold">{rpe ? min * rpe : '—'}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
