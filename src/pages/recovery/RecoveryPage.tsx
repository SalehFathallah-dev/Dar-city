import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Ban, Plus, Snowflake, Waves } from 'lucide-react';
import * as api from '../../lib/api';
import { useAsync } from '../../hooks/useAsync';
import { useAuth } from '../../context/AuthContext';
import { useReference } from '../../context/ReferenceContext';
import { useToast } from '../../context/ToastContext';
import { addDays, formatDate, todayISO } from '../../lib/format';
import { ICE_BATH_PRECAUTIONS } from '../../lib/recoveryPlanner';
import { RECOVERY_KINDS, type RecoveryAttendance, type RecoveryRestriction, type RecoverySession } from '../../lib/types';
import { Badge, Button, Card, Checkbox, EmptyState, ErrorBlock, Field, Grid, Input, Modal, PageHeader, Select, Spinner, Table, Tabs, Td, Textarea } from '../../components/ui';

const ATTENDED = new Set(['Present', 'Completed', 'Partially completed']);
const EXPECTED = new Set(['Assigned', 'Present', 'Absent', 'Completed', 'Partially completed', 'Declined']);
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);

/** Recovery management: sessions (ice bath …), plans, compliance and individual restrictions. */
export default function RecoveryPage() {
  const { caps } = useAuth();
  const [tab, setTab] = useState<'sessions' | 'plans' | 'compliance' | 'restrictions'>('sessions');
  return (
    <div className="space-y-4">
      <PageHeader title="Recovery" subtitle="Recovery sessions and attendance, match recovery plans, compliance and restrictions" icon={<Waves className="h-6 w-6" />} />
      <Tabs tabs={[{ id: 'sessions' as const, label: 'Sessions' }, { id: 'plans' as const, label: 'Recovery plans' }, { id: 'compliance' as const, label: 'Compliance' },
        ...(caps.viewMedical ? [{ id: 'restrictions' as const, label: 'Restrictions' }] : [])]} active={tab} onChange={setTab} />
      {tab === 'sessions' && <SessionsTab />}
      {tab === 'plans' && <PlansTab />}
      {tab === 'compliance' && <ComplianceTab />}
      {tab === 'restrictions' && caps.viewMedical && <RestrictionsTab />}
    </div>
  );
}

function SessionsTab() {
  const { caps } = useAuth();
  const navigate = useNavigate();
  const today = todayISO();
  const data = useAsync(async () => {
    const sessions = await api.listRecoverySessions(addDays(today, -60), addDays(today, 30));
    return { sessions, att: await api.listAttendance(sessions.map((s) => s.id)) };
  }, [today]);
  const [create, setCreate] = useState(false);
  if (data.loading) return <Spinner />;
  if (data.error) return <ErrorBlock message={data.error} onRetry={data.reload} />;
  const { sessions, att } = data.data!;
  return (
    <Card title="Recovery sessions" actions={caps.viewMedical && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setCreate(true)}>New session</Button>}>
      {!sessions.length ? <EmptyState title="No recovery sessions" description="Create an ice bath, active recovery, compression or massage session and record attendance live." /> : (
        <ul className="space-y-2">{sessions.map((s) => {
          const a = att.filter((x) => x.session_id === s.id);
          const done = a.filter((x) => ATTENDED.has(x.status)).length; const exp = a.filter((x) => EXPECTED.has(x.status)).length;
          return (
            <li key={s.id}><Link to={`/recovery/sessions/${s.id}`} className="flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm hover:border-brand-gold">
              {s.kind === 'Ice bath' ? <Snowflake className="h-5 w-5 text-sky-500" /> : <Waves className="h-5 w-5 text-brand-gold" />}
              <b className="text-brand-navy">{s.kind}</b><span>{formatDate(s.session_date)}{s.start_time ? ` · ${s.start_time.slice(0, 5)}` : ''}</span>
              <Badge color={s.status === 'Completed' ? 'green' : s.status === 'Cancelled' ? 'gray' : s.session_date === today ? 'red' : 'blue'}>{s.session_date === today && s.status === 'Scheduled' ? 'Today' : s.status}</Badge>
              <span className="ms-auto text-neutral-600">{a.length} assigned · attendance {pct(done, exp) ?? '—'}{exp ? '%' : ''}</span>
            </Link></li>
          );
        })}</ul>
      )}
      {create && <NewSessionModal onClose={() => setCreate(false)} onSaved={(id) => navigate(`/recovery/sessions/${id}`)} />}
    </Card>
  );
}

export function NewSessionModal({ onClose, onSaved, planId, defaults }: { onClose: () => void; onSaved: (id: string) => void; planId?: string; defaults?: Partial<RecoverySession> }) {
  const toast = useToast();
  const { players } = useReference();
  const active = players.filter((p) => p.status === 'active');
  const flags = useAsync(() => api.getRecoveryFlags(), []);
  const [s, setS] = useState<Partial<RecoverySession>>({ kind: 'Ice bath', session_date: todayISO(), start_time: '20:00', recommended_temp_c: 12, recommended_minutes: 10, precautions: ICE_BATH_PRECAUTIONS, plan_id: planId ?? null, ...defaults });
  const [selected, setSelected] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const flagOf = (pid: string) => (flags.data ?? []).find((f) => f.player_id === pid && (f.intervention === s.kind || f.intervention === 'All'));
  const eligible = active.filter((p) => flagOf(p.id)?.level !== 'Contraindicated');
  const chosen = selected ?? eligible.map((p) => p.id);
  const changeKind = (kind: RecoverySession['kind']) => setS({ ...s, kind, ...(kind === 'Ice bath' ? { recommended_temp_c: 12, recommended_minutes: 10, precautions: ICE_BATH_PRECAUTIONS } : { recommended_temp_c: null, precautions: null }) });
  const save = async () => {
    setSaving(true);
    try { const saved = await api.saveRecoverySession(s, chosen); toast.success(`Session created – ${chosen.length} player(s) assigned and notified`); onSaved(saved.id); }
    catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title="New recovery session" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={() => void save()}>Create</Button></>}>
      <div className="space-y-4">
        <Grid cols={3}>
          <Field label="Intervention"><Select value={s.kind} onChange={(e) => changeKind(e.target.value as RecoverySession['kind'])} options={RECOVERY_KINDS} /></Field>
          <Field label="Date"><Input type="date" value={s.session_date ?? ''} onChange={(e) => setS({ ...s, session_date: e.target.value })} /></Field>
          <Field label="Start time"><Input type="time" value={s.start_time?.slice(0, 5) ?? ''} onChange={(e) => setS({ ...s, start_time: e.target.value || null })} /></Field>
          {s.kind === 'Ice bath' && <Field label="Recommended water °C"><Input type="number" step="0.5" value={s.recommended_temp_c ?? ''} onChange={(e) => setS({ ...s, recommended_temp_c: e.target.value ? Number(e.target.value) : null })} /></Field>}
          <Field label="Recommended duration (min)"><Input type="number" value={s.recommended_minutes ?? ''} onChange={(e) => setS({ ...s, recommended_minutes: e.target.value ? Number(e.target.value) : null })} /></Field>
          <Field label="Supervisor"><Input value={s.supervisor ?? ''} onChange={(e) => setS({ ...s, supervisor: e.target.value })} /></Field>
        </Grid>
        <Field label="Protocol"><Textarea rows={2} value={s.protocol ?? ''} onChange={(e) => setS({ ...s, protocol: e.target.value })} placeholder="e.g. Immersion to waist, 2 × 5 min with 1 min out" /></Field>
        <Field label="Medical precautions"><Textarea rows={2} value={s.precautions ?? ''} onChange={(e) => setS({ ...s, precautions: e.target.value })} /></Field>
        <div>
          <p className="mb-2 text-xs font-bold uppercase text-neutral-500">Assigned players ({chosen.length})</p>
          <div className="grid max-h-56 gap-1 overflow-y-auto rounded-xl border p-2 sm:grid-cols-2">
            {active.map((p) => {
              const f = flagOf(p.id); const blocked = f?.level === 'Contraindicated';
              return (
                <div key={p.id} className={clsx('rounded-lg px-1', blocked && 'opacity-60')}>
                  {blocked ? <p className="flex items-center gap-2 py-1.5 text-sm"><Ban className="h-4 w-4 text-brand-red" />{p.full_name} <Badge color="red">Contraindicated</Badge></p>
                    : <Checkbox label={p.full_name} checked={chosen.includes(p.id)} onChange={(v) => setSelected(v ? [...chosen, p.id] : chosen.filter((x) => x !== p.id))}
                        description={f ? `Modified: ${f.instructions ?? ''}` : undefined} />}
                </div>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-neutral-500">Players with a contraindication for this intervention cannot be assigned.</p>
        </div>
      </div>
    </Modal>
  );
}

function PlansTab() {
  const plans = useAsync(() => api.listPlans(), []);
  const matches = useAsync(() => api.listMatches(addDays(todayISO(), -120), addDays(todayISO(), 365)), []);
  if (plans.loading) return <Spinner />;
  const m = new Map((matches.data ?? []).map((x) => [x.id, x]));
  return (
    <Card title="Recovery plans" actions={<Link to="/matches" className="text-sm font-semibold text-brand-gold">Generate from a match →</Link>}>
      {!(plans.data ?? []).length ? <EmptyState title="No recovery plans" description="Open Matches and use “Generate recovery plan” on a match." /> : (
        <ul className="space-y-2">{plans.data!.map((p) => (
          <li key={p.id}><Link to={`/recovery/plans/${p.id}`} className="flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm hover:border-brand-gold">
            <b className="text-brand-navy">{p.title}</b><Badge color={p.status === 'Approved' ? 'green' : 'orange'}>{p.status}</Badge>
            {p.match_id && m.get(p.match_id) && <span className="text-neutral-500">{formatDate(m.get(p.match_id)!.match_date)}</span>}
            <span className="ms-auto text-xs text-neutral-500">{p.interval_label}</span>
          </Link></li>
        ))}</ul>
      )}
    </Card>
  );
}

function ComplianceTab() {
  const { players } = useReference();
  const active = players.filter((p) => p.status === 'active');
  const [days, setDays] = useState(30);
  const today = todayISO();
  const data = useAsync(async () => {
    const sessions = (await api.listRecoverySessions(addDays(today, -days), today)).filter((s) => s.status !== 'Cancelled');
    return { sessions, att: await api.listAttendance(sessions.map((s) => s.id)) };
  }, [days, today]);
  const rows = useMemo(() => active.map((p) => {
    const a = (data.data?.att ?? []).filter((x) => x.player_id === p.id);
    const exp = a.filter((x) => EXPECTED.has(x.status)).length; const done = a.filter((x) => ATTENDED.has(x.status)).length;
    return { p, exp, done, missed: a.filter((x) => x.status === 'Absent').length, declined: a.filter((x) => x.status === 'Declined').length, excused: a.filter((x) => x.status === 'Excused').length, adverse: a.filter((x: RecoveryAttendance) => x.adverse_symptoms).length };
  }), [active, data.data]);
  const team = pct(rows.reduce((s, r) => s + r.done, 0), rows.reduce((s, r) => s + r.exp, 0));
  return (
    <Card title={`Recovery compliance – last ${days} days · team ${team ?? '—'}${team !== null ? '%' : ''}`} padded={false}
      actions={<Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />}>
      {data.loading ? <Spinner /> : (
        <div className="px-5"><Table headers={['Player', 'Expected', 'Attended', 'Compliance', 'Missed', 'Declined', 'Excused', 'Adverse symptoms']}>
          {rows.map((r) => { const c = pct(r.done, r.exp); return (
            <tr key={r.p.id}><Td className="font-semibold">{r.p.full_name}</Td><Td>{r.exp}</Td><Td>{r.done}</Td>
              <Td className={clsx(c !== null && c < 70 && 'font-bold text-brand-red')}>{c === null ? '—' : `${c}%`}</Td><Td>{r.missed || '—'}</Td><Td>{r.declined || '—'}</Td><Td>{r.excused || '—'}</Td><Td>{r.adverse || '—'}</Td></tr>
          ); })}
        </Table></div>
      )}
    </Card>
  );
}

function RestrictionsTab() {
  const { caps } = useAuth();
  const toast = useToast();
  const { players } = useReference();
  const list = useAsync(() => api.listRestrictions(), []);
  const [edit, setEdit] = useState<Partial<RecoveryRestriction> | null>(null);
  const name = new Map(players.map((p) => [p.id, p.full_name]));
  const save = async () => {
    if (!edit?.player_id) return toast.error('Choose the player');
    try { await api.saveRestriction(edit); toast.success('Restriction saved'); setEdit(null); void list.reload(); } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <Card title="Individual recovery restrictions" actions={caps.isPhysician && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ intervention: 'Ice bath', level: 'Contraindicated', is_active: true })}>Add</Button>} padded={false}>
      {list.loading ? <Spinner /> : !(list.data ?? []).length ? <div className="p-5"><EmptyState title="No restrictions" description="Mark interventions that are contraindicated or must be modified for a player. Staff see the restriction and instructions, not the medical reason." /></div> : (
        <div className="px-5"><Table headers={['Player', 'Intervention', 'Level', 'Instructions (visible to staff)', 'Reason (medical only)', 'Valid until', '']}>
          {list.data!.map((r) => (
            <tr key={r.id} className={clsx(!r.is_active && 'opacity-50')}><Td className="font-semibold">{name.get(r.player_id)}</Td><Td>{r.intervention}</Td>
              <Td><Badge color={r.level === 'Contraindicated' ? 'red' : 'orange'}>{r.level}</Badge></Td><Td>{r.instructions ?? '—'}</Td><Td>{r.reason ?? '—'}</Td>
              <Td>{r.valid_until ? formatDate(r.valid_until) : 'Until removed'}</Td><Td>{caps.isPhysician && <Button size="sm" variant="ghost" onClick={() => setEdit(r)}>Edit</Button>}</Td></tr>
          ))}
        </Table></div>
      )}
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? 'Edit restriction' : 'New restriction'} footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={() => void save()}>Save</Button></>}>
          <div className="space-y-3">
            <Field label="Player"><Select value={edit.player_id ?? ''} onChange={(e) => setEdit({ ...edit, player_id: e.target.value })} options={players.filter((p) => p.status === 'active').map((p) => ({ value: p.id, label: p.full_name }))} placeholder="Choose…" /></Field>
            <Field label="Intervention"><Select value={edit.intervention} onChange={(e) => setEdit({ ...edit, intervention: e.target.value })} options={[...RECOVERY_KINDS, 'All']} /></Field>
            <Field label="Level"><Select value={edit.level} onChange={(e) => setEdit({ ...edit, level: e.target.value as RecoveryRestriction['level'] })} options={['Contraindicated', 'Modified']} /></Field>
            <Field label="Instructions for staff"><Input value={edit.instructions ?? ''} onChange={(e) => setEdit({ ...edit, instructions: e.target.value })} placeholder="e.g. No cold-water immersion; use active recovery instead" /></Field>
            <Field label="Medical reason (never shown to staff)"><Textarea rows={2} value={edit.reason ?? ''} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} /></Field>
            <Field label="Valid until"><Input type="date" value={edit.valid_until ?? ''} onChange={(e) => setEdit({ ...edit, valid_until: e.target.value || null })} /></Field>
            {edit.id && <Checkbox label="Active" checked={!!edit.is_active} onChange={(v) => setEdit({ ...edit, is_active: v })} />}
          </div>
        </Modal>
      )}
    </Card>
  );
}
