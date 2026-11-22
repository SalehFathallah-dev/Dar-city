import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowLeft, Ban, Play, Snowflake, Square, Trash2, UserPlus } from 'lucide-react';
import * as api from '../../lib/api';
import { useAsync } from '../../hooks/useAsync';
import { useAuth } from '../../context/AuthContext';
import { useReference } from '../../context/ReferenceContext';
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../lib/format';
import type { RecoveryAttendance, RecoverySession } from '../../lib/types';
import { Badge, Button, Card, ErrorBlock, Field, Grid, Input, Select, Spinner, Textarea } from '../../components/ui';
import { pct } from './RecoveryPage';

const QUICK: { s: RecoveryAttendance['status']; label: string; cls: string }[] = [
  { s: 'Present', label: 'Present', cls: 'bg-sky-600' }, { s: 'Completed', label: 'Completed', cls: 'bg-emerald-600' },
  { s: 'Partially completed', label: 'Partial', cls: 'bg-amber-500' }, { s: 'Absent', label: 'Absent', cls: 'bg-brand-red' },
  { s: 'Excused', label: 'Excused', cls: 'bg-neutral-500' }, { s: 'Declined', label: 'Declined', cls: 'bg-purple-600' },
];
const nowHHMM = () => new Date().toTimeString().slice(0, 5);

/** Live attendance of one recovery session (e.g. ice bath). */
export default function RecoverySessionPage() {
  const { id } = useParams();
  const { caps } = useAuth();
  const toast = useToast();
  const { players } = useReference();
  const data = useAsync(() => api.getRecoverySession(id!), [id]);
  const flags = useAsync(() => api.getRecoveryFlags(), []);
  const [open, setOpen] = useState<string | null>(null);
  const [add, setAdd] = useState('');
  const [head, setHead] = useState<Partial<RecoverySession> | null>(null);
  if (data.loading) return <Spinner />;
  if (data.error || !data.data) return <ErrorBlock message={data.error ?? 'Not found'} />;
  const { s, attendance } = data.data;
  const h = head ?? s;
  const edit = caps.viewMedical;
  const name = new Map(players.map((p) => [p.id, p.full_name]));
  const assigned = new Set(attendance.map((a) => a.player_id));
  const flagOf = (pid: string) => (flags.data ?? []).find((f) => f.player_id === pid && (f.intervention === s.kind || f.intervention === 'All'));
  const attended = attendance.filter((a) => ['Present', 'Completed', 'Partially completed'].includes(a.status)).length;
  const expected = attendance.filter((a) => a.status !== 'Excused').length;

  const upd = async (a: Partial<RecoveryAttendance> & { player_id: string }) => {
    try { await api.saveAttendance({ session_id: s.id, ...a }); await data.reload(); } catch (e) { toast.error((e as Error).message); }
  };
  const saveHead = async () => {
    try { await api.saveRecoverySession({ id: s.id, actual_temp_c: h.actual_temp_c, status: h.status, supervisor: h.supervisor, notes: h.notes, protocol: h.protocol }); toast.success('Session updated'); setHead(null); void data.reload(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-4">
      <Link to="/recovery" className="inline-flex items-center gap-1 text-sm font-semibold text-neutral-600 hover:text-brand-gold"><ArrowLeft className="h-4 w-4" /> Recovery</Link>
      <div className="flex flex-wrap items-center gap-2">
        <Snowflake className="h-6 w-6 text-sky-500" />
        <h1 className="font-display text-2xl font-bold uppercase text-brand-navy">{s.kind}</h1>
        <span className="text-neutral-600">{formatDate(s.session_date)}{s.start_time ? ` · ${s.start_time.slice(0, 5)}` : ''}</span>
        <Badge color={s.status === 'Completed' ? 'green' : s.status === 'Cancelled' ? 'gray' : 'blue'}>{s.status}</Badge>
        <span className="ms-auto rounded-xl bg-brand-cream px-3 py-1 text-sm font-bold text-brand-navy">Attendance {pct(attended, expected) ?? '—'}{expected ? '%' : ''} ({attended}/{expected})</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card title="Attendance">
          <ul className="space-y-2">
            {attendance.sort((a, b) => (name.get(a.player_id) ?? '').localeCompare(name.get(b.player_id) ?? '')).map((a) => {
              const f = flagOf(a.player_id);
              return (
                <li key={a.id} className="rounded-xl border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button className="font-semibold text-brand-navy" onClick={() => setOpen(open === a.id ? null : a.id)}>{name.get(a.player_id)}</button>
                    <Badge color={a.status === 'Completed' ? 'green' : a.status === 'Absent' ? 'red' : a.status === 'Assigned' ? 'gray' : 'blue'}>{a.status}</Badge>
                    {a.duration_minutes != null && <span className="text-xs text-neutral-500">{a.duration_minutes} min</span>}
                    {a.water_temp_c != null && <span className="text-xs text-neutral-500">{a.water_temp_c} °C</span>}
                    {a.adverse_symptoms && <Badge color="red">Symptoms</Badge>}
                    {f && <Badge color={f.level === 'Contraindicated' ? 'red' : 'orange'}>{f.level}{f.instructions ? `: ${f.instructions}` : ''}</Badge>}
                  </div>
                  {edit && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {QUICK.map((q) => (
                        <button key={q.s} onClick={() => void upd({ player_id: a.player_id, status: q.s, ...(q.s === 'Present' && !a.start_time ? { start_time: nowHHMM() } : {}), ...((q.s === 'Completed' || q.s === 'Partially completed') && a.start_time && !a.end_time ? { end_time: nowHHMM() } : {}) })}
                          className={clsx('rounded-lg px-2.5 py-1 text-xs font-bold', a.status === q.s ? `${q.cls} text-white` : 'border border-neutral-200 bg-white text-neutral-700')}>{q.label}</button>
                      ))}
                      <button onClick={() => setOpen(open === a.id ? null : a.id)} className="rounded-lg px-2 py-1 text-xs font-semibold text-brand-gold">Details</button>
                    </div>
                  )}
                  {open === a.id && edit && <AttendanceDetails a={a} kind={s.kind} onSave={(p) => void upd({ player_id: a.player_id, ...p })} onRemove={() => void api.removeAttendance(s.id, a.player_id).then(() => data.reload()).catch((e) => toast.error((e as Error).message))} />}
                </li>
              );
            })}
          </ul>
          {edit && (
            <div className="mt-3 flex gap-2">
              <Select value={add} onChange={(e) => setAdd(e.target.value)} options={players.filter((p) => p.status === 'active' && !assigned.has(p.id)).map((p) => ({ value: p.id, label: `${p.full_name}${flagOf(p.id)?.level === 'Contraindicated' ? ' (contraindicated)' : ''}` }))} placeholder="Add a player…" />
              <Button variant="secondary" icon={<UserPlus className="h-4 w-4" />} disabled={!add} onClick={() => { void upd({ player_id: add, status: 'Assigned' }); setAdd(''); }}>Add</Button>
            </div>
          )}
        </Card>
        <Card title="Session">
          <div className="space-y-3 text-sm">
            {s.recommended_temp_c != null && <p>Recommended water: <b>{s.recommended_temp_c} °C</b></p>}
            {s.recommended_minutes != null && <p>Recommended duration: <b>{s.recommended_minutes} min</b></p>}
            {s.precautions && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900"><Ban className="mb-0.5 inline h-3.5 w-3.5" /> {s.precautions}</p>}
            {edit ? (
              <>
                <Grid cols={2}>
                  {s.kind === 'Ice bath' && <Field label="Actual water °C"><Input type="number" step="0.5" value={h.actual_temp_c ?? ''} onChange={(e) => setHead({ ...h, actual_temp_c: e.target.value ? Number(e.target.value) : null })} /></Field>}
                  <Field label="Status"><Select value={h.status} onChange={(e) => setHead({ ...h, status: e.target.value as RecoverySession['status'] })} options={['Scheduled', 'Completed', 'Cancelled']} /></Field>
                </Grid>
                <Field label="Supervisor"><Input value={h.supervisor ?? ''} onChange={(e) => setHead({ ...h, supervisor: e.target.value })} /></Field>
                <Field label="Protocol"><Textarea rows={2} value={h.protocol ?? ''} onChange={(e) => setHead({ ...h, protocol: e.target.value })} /></Field>
                <Field label="Notes"><Textarea rows={2} value={h.notes ?? ''} onChange={(e) => setHead({ ...h, notes: e.target.value })} /></Field>
                <Button onClick={() => void saveHead()}>Save session</Button>
              </>
            ) : (
              <>{s.protocol && <p>{s.protocol}</p>}{s.supervisor && <p>Supervisor: {s.supervisor}</p>}</>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function AttendanceDetails({ a, kind, onSave, onRemove }: { a: RecoveryAttendance; kind: string; onSave: (p: Partial<RecoveryAttendance>) => void; onRemove: () => void }) {
  const [f, setF] = useState<Partial<RecoveryAttendance>>(a);
  return (
    <div className="mt-3 space-y-2 rounded-lg bg-neutral-50 p-3">
      <Grid cols={3}>
        <Field label="Start"><div className="flex gap-1"><Input type="time" value={f.start_time?.slice(0, 5) ?? ''} onChange={(e) => setF({ ...f, start_time: e.target.value || null })} /><Button size="sm" variant="ghost" icon={<Play className="h-4 w-4" />} onClick={() => setF({ ...f, start_time: nowHHMM() })} aria-label="Now" /></div></Field>
        <Field label="Finish"><div className="flex gap-1"><Input type="time" value={f.end_time?.slice(0, 5) ?? ''} onChange={(e) => setF({ ...f, end_time: e.target.value || null })} /><Button size="sm" variant="ghost" icon={<Square className="h-4 w-4" />} onClick={() => setF({ ...f, end_time: nowHHMM() })} aria-label="Now" /></div></Field>
        <Field label="Duration (min)" hint="Calculated from start/finish"><Input type="number" step="0.5" value={f.duration_minutes ?? ''} onChange={(e) => setF({ ...f, duration_minutes: e.target.value ? Number(e.target.value) : null })} /></Field>
        {kind === 'Ice bath' && <Field label="Water °C"><Input type="number" step="0.5" value={f.water_temp_c ?? ''} onChange={(e) => setF({ ...f, water_temp_c: e.target.value ? Number(e.target.value) : null })} /></Field>}
        <Field label="Supervisor"><Input value={f.supervisor ?? ''} onChange={(e) => setF({ ...f, supervisor: e.target.value })} /></Field>
      </Grid>
      <Field label="Discomfort / adverse symptoms"><Input value={f.adverse_symptoms ?? ''} onChange={(e) => setF({ ...f, adverse_symptoms: e.target.value })} placeholder="e.g. dizziness, numbness – leave empty if none" /></Field>
      <Field label="Notes"><Input value={f.notes ?? ''} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onSave({ start_time: f.start_time, end_time: f.end_time, duration_minutes: f.duration_minutes, water_temp_c: f.water_temp_c, supervisor: f.supervisor, adverse_symptoms: f.adverse_symptoms, notes: f.notes })}>Save</Button>
        <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={onRemove}>Remove from session</Button>
      </div>
    </div>
  );
}
