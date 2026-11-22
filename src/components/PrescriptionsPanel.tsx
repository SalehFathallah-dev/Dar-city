import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Check, KeyRound, Pencil, Plus, Smartphone, UserPlus, X } from 'lucide-react';
import * as api from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { addDays, formatDate, todayISO } from '../lib/format';
import { PRESCRIPTION_KINDS, WEEKDAYS } from '../lib/constants';
import type { AdherenceRow, Injury, Prescription } from '../lib/types';
import { Badge, Button, Card, Checkbox, EmptyState, ErrorBlock, Field, Grid, Input, Modal, Select, Spinner, Table, Td, Textarea } from './ui';
import { CredentialsModal, type Credential } from './CredentialsModal';

const ADHERENCE_DAYS = 14;

/** Physician: medications, supplements, home exercises and their adherence for one player, plus the player's app account. */
export function PrescriptionsPanel({ playerId, clubId, injuries }: { playerId: string; clubId: string; injuries: Injury[] }) {
  const { caps } = useAuth();
  const today = todayISO();
  const list = useAsync(() => api.listPrescriptions(playerId), [playerId]);
  const adherence = useAsync(async () => (await api.getTeamAdherence(clubId, addDays(today, -(ADHERENCE_DAYS - 1)), today)).filter((r) => r.player_id === playerId), [clubId, playerId, today]);
  const [edit, setEdit] = useState<Partial<Prescription> | null>(null);

  return (
    <div className="space-y-4">
      <AthleteAccountCard playerId={playerId} />
      <Card title="Programme, Medications & Supplements" padded={false}
        actions={caps.managePrescriptions && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ kind: 'Supplement', schedule_times: ['08:00'], days_of_week: [0, 1, 2, 3, 4, 5, 6], start_date: today, is_active: true, share_with_staff: true })}>Add</Button>}>
        {list.loading ? <Spinner /> : list.error ? <ErrorBlock message={list.error} /> : !list.data?.length ? (
          <div className="p-5"><EmptyState title="Nothing prescribed yet" description="Add medications, supplements or home exercises – the player sees them in the app and confirms each dose." /></div>
        ) : (
          <div className="px-5"><Table headers={['Item', 'Dose', 'Schedule', 'Period', 'Visible to staff', '']}>
            {list.data.map((r) => (
              <tr key={r.id} className={clsx(!r.is_active && 'opacity-50')}>
                <Td><p className="font-semibold">{r.name}</p><Badge color={r.kind === 'Medication' ? 'red' : r.kind === 'Supplement' ? 'green' : 'blue'}>{r.kind}</Badge>{!r.is_active && <Badge color="gray" className="ml-1">Stopped</Badge>}</Td>
                <Td>{r.dose ?? '—'}</Td>
                <Td className="text-xs">{r.schedule_times.length ? r.schedule_times.join(', ') : 'Once a day (any time)'}<br />{r.days_of_week.length === 7 ? 'Every day' : r.days_of_week.map((d) => WEEKDAYS[d]).join(', ')}</Td>
                <Td className="text-xs">{formatDate(r.start_date)} → {r.end_date ? formatDate(r.end_date) : 'ongoing'}</Td>
                <Td>{r.share_with_staff ? 'Yes' : <span className="text-neutral-500">Hidden</span>}</Td>
                <Td>{caps.managePrescriptions && <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(r)}>Edit</Button>}</Td>
              </tr>
            ))}
          </Table></div>
        )}
      </Card>
      <Card title={`Adherence – last ${ADHERENCE_DAYS} days`}>
        {adherence.loading ? <Spinner /> : adherence.error ? <ErrorBlock message={adherence.error} /> : <AdherenceGrid rows={adherence.data ?? []} days={ADHERENCE_DAYS} />}
      </Card>
      {edit && <PrescriptionModal value={edit} playerId={playerId} injuries={injuries} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void list.reload(); void adherence.reload(); }} />}
    </div>
  );
}

/** Day-by-day dose grid for one player. */
export function AdherenceGrid({ rows, days }: { rows: AdherenceRow[]; days: number }) {
  const today = todayISO();
  const dates = Array.from({ length: days }, (_, i) => addDays(today, -(days - 1) + i));
  const items = useMemo(() => {
    const m = new Map<string, { name: string; kind: string; time: string; cells: Map<string, AdherenceRow> }>();
    for (const r of rows) {
      const k = `${r.prescription_id}|${r.scheduled_time}`;
      if (!m.has(k)) m.set(k, { name: r.name, kind: r.kind, time: r.scheduled_time, cells: new Map() });
      m.get(k)!.cells.set(r.scheduled_date, r);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name) || a.time.localeCompare(b.time));
  }, [rows]);
  const s = summarize(rows);
  if (!items.length) return <p className="text-sm text-neutral-500">No doses scheduled in this period.</p>;
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-3 text-sm">
        <span className="font-semibold">Adherence: <b className={clsx(s.pct !== null && s.pct < 70 ? 'text-brand-red' : 'text-emerald-700')}>{s.pct === null ? '—' : `${s.pct}%`}</b></span>
        <span className="text-emerald-700">✓ {s.taken} taken</span><span className="text-brand-red">✗ {s.skipped} not taken</span><span className="text-amber-700">! {s.missed} not confirmed</span>
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead><tr><th className="sticky left-0 bg-white pr-3 text-left font-semibold">Item</th>{dates.map((d) => <th key={d} className="w-7 px-0.5 text-center font-normal text-neutral-500">{d.slice(8)}</th>)}</tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.name + it.time}>
                <td className="sticky left-0 max-w-[180px] truncate bg-white py-1 pr-3"><b>{it.name}</b> <span className="text-neutral-500">{it.time === 'any' ? '' : it.time}</span></td>
                {dates.map((d) => <td key={d} className="px-0.5 py-1 text-center"><DoseCell r={it.cells.get(d)} today={today} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-neutral-500">✓ taken · ✗ player reported not taken · ! past dose not confirmed · empty = not scheduled</p>
    </div>
  );
}
function DoseCell({ r, today }: { r?: AdherenceRow; today: string }) {
  if (!r) return <span className="inline-block h-5 w-5" />;
  const pending = !r.status && r.scheduled_date >= today;
  const cls = r.status === 'taken' ? 'bg-emerald-500 text-white' : r.status === 'skipped' ? 'bg-brand-red text-white' : pending ? 'bg-neutral-100 text-neutral-400' : 'bg-amber-400 text-white';
  return <span title={`${r.scheduled_date} ${r.scheduled_time}${r.note ? ' – ' + r.note : ''}`} className={clsx('inline-flex h-5 w-5 items-center justify-center rounded font-bold', cls)}>{r.status === 'taken' ? '✓' : r.status === 'skipped' ? '✗' : pending ? '·' : '!'}</span>;
}
export function summarize(rows: AdherenceRow[]) {
  const today = todayISO();
  const due = rows.filter((r) => r.status || r.scheduled_date < today);
  const taken = due.filter((r) => r.status === 'taken').length;
  const skipped = due.filter((r) => r.status === 'skipped').length;
  return { due: due.length, taken, skipped, missed: due.length - taken - skipped, pct: due.length ? Math.round((taken / due.length) * 100) : null };
}

function PrescriptionModal({ value, playerId, injuries, onClose, onSaved }: { value: Partial<Prescription>; playerId: string; injuries: Injury[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<Partial<Prescription>>(value);
  const [newTime, setNewTime] = useState('');
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Prescription>(k: K, v: Prescription[K]) => setF((x) => ({ ...x, [k]: v }));
  const times = f.schedule_times ?? [];
  const days = f.days_of_week ?? [];
  const save = async () => {
    if (!f.name || f.name.trim().length < 2) return toast.error('Enter the name of the item');
    if (!days.length) return toast.error('Select at least one day');
    if (f.end_date && f.start_date && f.end_date < f.start_date) return toast.error('End date is before start date');
    setSaving(true);
    try {
      await api.savePrescription({ ...f, player_id: playerId, injury_id: f.injury_id || null });
      toast.success('Saved – the player sees it in the app');
      onSaved();
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} title={f.id ? 'Edit item' : 'Prescribe medication / supplement / exercise'} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <Grid>
          <Field label="Type" required><Select value={f.kind} onChange={(e) => set('kind', e.target.value as Prescription['kind'])} options={PRESCRIPTION_KINDS} /></Field>
          <Field label="Name" required><Input value={f.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Vitamin D3 5000 IU" /></Field>
          <Field label="Dose / amount"><Input value={f.dose ?? ''} onChange={(e) => set('dose', e.target.value)} placeholder="e.g. 1 capsule · 3 × 12 reps" /></Field>
          <Field label="Related injury"><Select value={f.injury_id ?? ''} onChange={(e) => set('injury_id', e.target.value || null)} options={injuries.map((i) => ({ value: i.id, label: `${i.injury_code} – ${i.body_region} ${i.injury_type}` }))} placeholder="None" /></Field>
        </Grid>
        <Field label="Instructions for the player" hint="Shown in the player's app (Arabic is fine)"><Textarea rows={2} value={f.instructions ?? ''} onChange={(e) => set('instructions', e.target.value)} placeholder="مثال: بعد الأكل مع كوب ماء" /></Field>
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-600">Times</p>
          <div className="flex flex-wrap items-center gap-2">
            {times.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-brand-cream px-3 py-1 text-sm font-semibold text-brand-navy">{t}
                <button onClick={() => set('schedule_times', times.filter((x) => x !== t))} aria-label={`Remove ${t}`}><X className="h-3.5 w-3.5" /></button></span>
            ))}
            <Input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="!w-32" />
            <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => { if (newTime && !times.includes(newTime)) set('schedule_times', [...times, newTime].sort()); setNewTime(''); }}>Add time</Button>
          </div>
          <p className="mt-1 text-xs text-neutral-500">No time = once a day at any time. The player sees each dose time in the app and confirms it.</p>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-600">Days</p>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d, i) => (
              <button key={d} type="button" onClick={() => set('days_of_week', days.includes(i) ? days.filter((x) => x !== i) : [...days, i].sort())}
                className={clsx('rounded-lg border px-3 py-1.5 text-sm font-semibold', days.includes(i) ? 'border-brand-gold bg-brand-gold text-white' : 'border-neutral-200 bg-white')}>{d}</button>
            ))}
          </div>
        </div>
        <Grid>
          <Field label="Start date" required><Input type="date" value={f.start_date ?? ''} onChange={(e) => set('start_date', e.target.value)} /></Field>
          <Field label="End date" hint="Leave empty if ongoing"><Input type="date" value={f.end_date ?? ''} onChange={(e) => set('end_date', e.target.value || null)} /></Field>
        </Grid>
        <Checkbox label="Visible to team staff (manager / coach)" checked={!!f.share_with_staff} onChange={(v) => set('share_with_staff', v)}
          description="If unticked, staff only see “Medication” and whether it was taken – not the name or dose." />
        {f.id && <Checkbox label="Active" checked={!!f.is_active} onChange={(v) => set('is_active', v)} description="Untick to stop the item (history is kept)." />}
      </div>
    </Modal>
  );
}

/** The player's sign-in for the mobile app. */
function AthleteAccountCard({ playerId }: { playerId: string }) {
  const { caps } = useAuth();
  const toast = useToast();
  const accounts = useAsync(() => (caps.manageUsers ? api.listAthleteAccounts() : Promise.resolve([])), [caps.manageUsers]);
  const acc = (accounts.data ?? []).find((a) => a.player_id === playerId);
  const [busy, setBusy] = useState<string | null>(null);
  const [creds, setCreds] = useState<Credential[]>([]);
  if (!caps.manageUsers) return null;
  const create = async () => {
    setBusy('create');
    try {
      const a = await api.provisionAccount({ player_id: playerId });
      setCreds([{ full_name: a.full_name, role: a.role, username: a.username, password: a.password }]);
      void accounts.reload();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const newPassword = async () => {
    if (!acc) return;
    setBusy('reset');
    try {
      const r = await api.generateNewPassword(acc.user_id);
      setCreds([{ full_name: acc.full_name, role: 'athlete', username: r.username, password: r.password }]);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const setActive = async (active: boolean) => {
    if (!acc) return;
    try { await api.updateProfile(acc.user_id, { is_active: active }); toast.success(active ? 'Account enabled' : 'Account disabled'); void accounts.reload(); }
    catch (e) { toast.error((e as Error).message); }
  };
  return (
    <Card title={<span className="flex items-center gap-2"><Smartphone className="h-5 w-5 text-brand-gold" /> Player app account</span>}>
      {accounts.loading ? <Spinner /> : acc ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 text-sm">Username: <b className="font-mono">{acc.email.replace('@dsf.local', '')}</b> {acc.is_active ? <Badge color="green">Active</Badge> : <Badge color="red">Disabled</Badge>}
            <p className="text-xs text-neutral-500">The player signs in with this username and sees only their own information.</p></div>
          <Button size="sm" variant="secondary" loading={busy === 'reset'} icon={<KeyRound className="h-4 w-4" />} onClick={() => void newPassword()}>New password</Button>
          <Button size="sm" variant={acc.is_active ? 'ghost' : 'secondary'} icon={acc.is_active ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />} onClick={() => void setActive(!acc.is_active)}>{acc.is_active ? 'Disable' : 'Enable'}</Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 text-sm text-neutral-600">No app account yet. One tap creates it with a generated username and password.</p>
          <Button size="sm" loading={busy === 'create'} icon={<UserPlus className="h-4 w-4" />} onClick={() => void create()}>Create account</Button>
        </div>
      )}
      <CredentialsModal items={creds} onClose={() => setCreds([])} title={creds.length && acc ? 'New password generated' : undefined} />
    </Card>
  );
}
