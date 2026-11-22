import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowLeft, CheckCircle2, Pencil, Plus, Snowflake, Timer, Trash2, Users } from 'lucide-react';
import * as api from '../../lib/api';
import { useAsync } from '../../hooks/useAsync';
import { useAuth } from '../../context/AuthContext';
import { useReference } from '../../context/ReferenceContext';
import { useToast } from '../../context/ToastContext';
import { addDays, formatDate } from '../../lib/format';
import { PLAN_CATEGORIES, PLAN_DAYS, type RecoveryPlanItem } from '../../lib/types';
import { Badge, Button, Card, Checkbox, ConfirmDialog, ErrorBlock, Field, Grid, Input, Modal, Select, Spinner, Textarea } from '../../components/ui';
import { NewSessionModal } from './RecoveryPage';
import { matchParticipation, proposeIndividualRecovery } from './applyAdvisor';

const OFFSET: Record<string, number> = { 'MD-3': -3, 'MD-2': -2, 'MD-1': -1, MD: 0, 'MD+1': 1, 'MD+2': 2, 'MD+3': 3 };

/** Review, edit, individualise and approve a recovery plan. */
export default function PlanPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { caps } = useAuth();
  const toast = useToast();
  const { players } = useReference();
  const active = players.filter((p) => p.status === 'active');
  const data = useAsync(() => api.getPlan(id!), [id]);
  const match = useAsync(async () => (data.data?.plan.match_id ? (await api.listMatches()).find((m) => m.id === data.data!.plan.match_id) ?? null : null), [data.data?.plan.match_id]);
  const [edit, setEdit] = useState<Partial<RecoveryPlanItem> | null>(null);
  const [audience, setAudience] = useState(false);
  const [sessionFor, setSessionFor] = useState<RecoveryPlanItem | null>(null);
  const [del, setDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const name = useMemo(() => new Map(players.map((p) => [p.id, p.full_name])), [players]);
  if (data.loading) return <Spinner />;
  if (data.error || !data.data) return <ErrorBlock message={data.error ?? 'Not found'} />;
  const { plan, items } = data.data;
  const clinical = caps.viewMedical;
  const approved = plan.status === 'Approved';
  const md = match.data?.match_date;

  const run = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); try { await fn(); toast.success(ok); await data.reload(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } };
  const minutesAdjust = () => run(async () => {
    const all = await api.listMatches();
    const { part } = await matchParticipation(match.data!);
    await proposeIndividualRecovery(match.data!, all, part);
  }, 'Plan individualised by minutes played, match load, soreness and restrictions');

  const days = PLAN_DAYS.filter((d) => items.some((i) => i.day_label === d));
  return (
    <div className="space-y-4">
      <Link to="/recovery" className="inline-flex items-center gap-1 text-sm font-semibold text-neutral-600 hover:text-brand-gold"><ArrowLeft className="h-4 w-4" /> Recovery</Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-2xl font-bold uppercase text-brand-navy">{plan.title}</h1>
        <Badge color={approved ? 'green' : 'orange'}>{approved ? 'Approved – visible to athletes and staff' : 'Proposed – not visible to athletes'}</Badge>
      </div>
      <p className="text-sm text-neutral-600">{plan.interval_label}{md ? ` · match ${formatDate(md)}${match.data?.match_time ? ` ${match.data.match_time.slice(0, 5)}` : ''}` : ''} · Applies to: <b>{plan.player_ids ? plan.player_ids.map((p) => name.get(p)).join(', ') : 'whole team'}</b></p>
      {!approved && <p className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900">These are proposed recommendations generated from the match calendar. Review and edit them; they become instructions only after the physician approves the plan.</p>}
      {clinical && (
        <div className="flex flex-wrap gap-2">
          {caps.isPhysician && (approved
            ? <Button variant="secondary" loading={busy} onClick={() => void run(() => api.updatePlan(plan.id, { status: 'Proposed' }), 'Plan withdrawn – back to proposed')}>Withdraw approval</Button>
            : <Button loading={busy} icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => void run(() => api.updatePlan(plan.id, { status: 'Approved' }), 'Plan approved – athletes and staff can see it')}>Approve plan</Button>)}
          <Button variant="secondary" icon={<Users className="h-4 w-4" />} onClick={() => setAudience(true)}>Team / selected players</Button>
          <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ plan_id: plan.id, day_label: 'MD+1', item_date: md ? addDays(md, 1) : undefined, category: 'Other', recommendation: '', player_overrides: {}, sort_order: items.length })}>Add recommendation</Button>
          {md && match.data && <Button variant="secondary" loading={busy} icon={<Timer className="h-4 w-4" />} onClick={() => void minutesAdjust()}>Adjust by minutes played</Button>}
          {caps.isPhysician && <Button variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDel(true)}>Delete plan</Button>}
        </div>
      )}
      {days.map((d) => (
        <Card key={d} title={`${d}${items.find((i) => i.day_label === d) ? ` · ${formatDate(items.find((i) => i.day_label === d)!.item_date)}` : ''}`}>
          <ul className="space-y-2">{items.filter((i) => i.day_label === d).map((i) => {
            const ov = Object.entries(i.player_overrides ?? {});
            return (
              <li key={i.id} className="rounded-xl border p-3 text-sm">
                <div className="flex flex-wrap items-start gap-2">
                  <Badge color={i.category === 'Cold water immersion' ? 'blue' : i.category === 'Training load' ? 'orange' : 'beige'}>{i.category}</Badge>
                  <p className="min-w-0 flex-1">{i.recommendation}</p>
                  {clinical && <span className="flex gap-1">
                    {i.category === 'Cold water immersion' && <Button size="sm" variant="ghost" icon={<Snowflake className="h-4 w-4" />} onClick={() => setSessionFor(i)}>Schedule</Button>}
                    <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(i)} aria-label="Edit" />
                    <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => void run(() => api.deletePlanItem(i.id), 'Recommendation removed')} aria-label="Delete" />
                  </span>}
                </div>
                {ov.length > 0 && <ul className="mt-2 space-y-0.5 text-xs">{ov.map(([pid, txt]) => (
                  <li key={pid} className={clsx(txt === 'EXCLUDED' ? 'text-brand-red' : 'text-sky-800')}><b>{name.get(pid) ?? pid}:</b> {txt === 'EXCLUDED' ? 'excluded' : txt}</li>
                ))}</ul>}
              </li>
            );
          })}</ul>
        </Card>
      ))}
      {edit && <ItemModal value={edit} matchDate={md} players={active} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void data.reload(); }} />}
      {audience && <AudienceModal current={plan.player_ids} players={active} onClose={() => setAudience(false)} onSave={(ids) => { setAudience(false); void run(() => api.updatePlan(plan.id, { player_ids: ids }), 'Assignment saved'); }} />}
      {sessionFor && <NewSessionModal planId={plan.id} defaults={{ kind: 'Ice bath', session_date: sessionFor.item_date, protocol: sessionFor.recommendation }} onClose={() => setSessionFor(null)} onSaved={(sid) => navigate(`/recovery/sessions/${sid}`)} />}
      <ConfirmDialog open={del} danger title="Delete plan" confirmLabel="Delete" message="Delete this recovery plan and all its recommendations?" onCancel={() => setDel(false)}
        onConfirm={() => { setDel(false); void api.deletePlan(plan.id).then(() => { toast.success('Plan deleted'); navigate('/recovery'); }).catch((e) => toast.error((e as Error).message)); }} />
    </div>
  );
}

function ItemModal({ value, matchDate, players, onClose, onSaved }: { value: Partial<RecoveryPlanItem>; matchDate?: string; players: { id: string; full_name: string }[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<Partial<RecoveryPlanItem>>(value);
  const [pid, setPid] = useState('');
  const [ovText, setOvText] = useState('');
  const ov = f.player_overrides ?? {};
  const save = async () => {
    if (!f.recommendation || f.recommendation.trim().length < 2) return toast.error('Write the recommendation');
    if (!f.item_date) return toast.error('Choose the date');
    try { await api.savePlanItem(f); toast.success('Saved'); onSaved(); } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title={f.id ? 'Edit recommendation' : 'Add recommendation'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => void save()}>Save</Button></>}>
      <div className="space-y-3">
        <Grid cols={3}>
          <Field label="Day"><Select value={f.day_label} onChange={(e) => { const d = e.target.value as RecoveryPlanItem['day_label']; setF({ ...f, day_label: d, item_date: matchDate ? addDays(matchDate, OFFSET[d]) : f.item_date }); }} options={PLAN_DAYS} /></Field>
          <Field label="Date"><Input type="date" value={f.item_date ?? ''} onChange={(e) => setF({ ...f, item_date: e.target.value })} /></Field>
          <Field label="Category"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as RecoveryPlanItem['category'] })} options={PLAN_CATEGORIES} /></Field>
        </Grid>
        <Field label="Recommendation (for the team)"><Textarea rows={3} value={f.recommendation ?? ''} onChange={(e) => setF({ ...f, recommendation: e.target.value })} /></Field>
        <div>
          <p className="mb-1 text-xs font-bold uppercase text-neutral-500">Individual overrides</p>
          {Object.entries(ov).map(([k, v]) => (
            <p key={k} className="flex items-center gap-2 text-sm"><b>{players.find((p) => p.id === k)?.full_name}:</b> {v === 'EXCLUDED' ? 'excluded' : v}
              <button className="text-xs text-brand-red" onClick={() => { const n = { ...ov }; delete n[k]; setF({ ...f, player_overrides: n }); }}>remove</button></p>
          ))}
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_2fr_auto_auto]">
            <Select value={pid} onChange={(e) => setPid(e.target.value)} options={players.map((p) => ({ value: p.id, label: p.full_name }))} placeholder="Player…" />
            <Input value={ovText} onChange={(e) => setOvText(e.target.value)} placeholder="Individual instruction" />
            <Button variant="secondary" disabled={!pid || !ovText.trim()} onClick={() => { setF({ ...f, player_overrides: { ...ov, [pid]: ovText.trim() } }); setPid(''); setOvText(''); }}>Set</Button>
            <Button variant="secondary" disabled={!pid} onClick={() => { setF({ ...f, player_overrides: { ...ov, [pid]: 'EXCLUDED' } }); setPid(''); }}>Exclude</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function AudienceModal({ current, players, onClose, onSave }: { current: string[] | null; players: { id: string; full_name: string }[]; onClose: () => void; onSave: (ids: string[] | null) => void }) {
  const [team, setTeam] = useState(current === null);
  const [sel, setSel] = useState<string[]>(current ?? []);
  return (
    <Modal open onClose={onClose} title="Who does this plan apply to?" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => onSave(team ? null : sel)} disabled={!team && !sel.length}>Save</Button></>}>
      <div className="space-y-3">
        <Checkbox label="Whole team" checked={team} onChange={setTeam} />
        {!team && <div className="grid max-h-64 gap-1 overflow-y-auto rounded-xl border p-2 sm:grid-cols-2">{players.map((p) => (
          <Checkbox key={p.id} label={p.full_name} checked={sel.includes(p.id)} onChange={(v) => setSel(v ? [...sel, p.id] : sel.filter((x) => x !== p.id))} />
        ))}</div>}
      </div>
    </Modal>
  );
}
