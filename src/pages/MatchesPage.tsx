import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { CalendarDays, ChevronLeft, ChevronRight, List, Pencil, Plus, Trash2, Trophy, Wand2 } from 'lucide-react';
import * as api from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { addDays, daysBetween, formatDate, todayISO } from '../lib/format';
import { matchContext, proposeRecoveryPlan } from '../lib/recoveryPlanner';
import type { Match } from '../lib/types';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorBlock, Field, Grid, Input, Modal, PageHeader, SegmentedControl, Select, Spinner, Textarea } from '../components/ui';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function matchBadges(m: Match, all: Match[]) {
  const today = todayISO();
  const days = daysBetween(today, m.match_date);
  const ctx = matchContext(m, all);
  const out: { label: string; color: 'red' | 'orange' | 'blue' | 'gray' | 'green' }[] = [];
  if (m.status !== 'Scheduled') out.push({ label: m.status, color: m.status === 'Played' ? 'green' : 'gray' });
  else if (days === 0) out.push({ label: 'Today', color: 'red' });
  else if (days > 0) out.push({ label: `In ${days} day${days > 1 ? 's' : ''}`, color: days <= 2 ? 'red' : days <= 3 ? 'orange' : 'blue' });
  if (ctx.hoursFromPrev !== null && ctx.hoursFromPrev < 48) out.push({ label: '< 48 h after previous', color: 'red' });
  else if (ctx.hoursFromPrev !== null && ctx.hoursFromPrev < 72) out.push({ label: '< 72 h after previous', color: 'orange' });
  if (ctx.congested) out.push({ label: 'Congested period', color: 'orange' });
  return { out, ctx };
}

/** Match calendar: list and month views, gaps between matches, recovery plan generation. */
export default function MatchesPage() {
  const { caps } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const canEdit = caps.isStaff && caps.role !== 'athlete';
  const matches = useAsync(() => api.listMatches(addDays(todayISO(), -365), addDays(todayISO(), 365)), []);
  const plans = useAsync(() => api.listPlans().catch(() => []), []);
  const [view, setView] = useState<'List' | 'Calendar'>('List');
  const [edit, setEdit] = useState<Partial<Match> | null>(null);
  const [del, setDel] = useState<Match | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const all = matches.data ?? [];
  const today = todayISO();
  const upcoming = all.filter((m) => m.match_date >= today);
  const past = all.filter((m) => m.match_date < today).reverse();
  const planOf = (id: string) => (plans.data ?? []).find((p) => p.match_id === id);

  const generate = async (m: Match) => {
    const existing = planOf(m.id);
    if (existing) return navigate(`/recovery/plans/${existing.id}`);
    setBusy(m.id);
    try {
      const p = proposeRecoveryPlan(m, all);
      const saved = await api.createPlan({ match_id: m.id, title: p.title, interval_label: p.interval_label }, p.items);
      toast.success('Proposed recovery plan created – review and approve it');
      navigate(`/recovery/plans/${saved.id}`);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  const row = (m: Match) => {
    const { out } = matchBadges(m, all);
    const plan = planOf(m.id);
    return (
      <li key={m.id} className="rounded-2xl border bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <Trophy className="h-5 w-5 text-brand-gold" />
          <p className="font-bold text-brand-navy">vs {m.opponent}</p>
          <Badge color={m.home_away === 'Home' ? 'blue' : 'beige'}>{m.home_away}</Badge>
          {out.map((b) => <Badge key={b.label} color={b.color}>{b.label}</Badge>)}
          <span className="ms-auto text-sm text-neutral-600">{formatDate(m.match_date)}{m.match_time ? ` · ${m.match_time.slice(0, 5)}` : ''}</span>
        </div>
        <p className="mt-1 text-xs text-neutral-500">{[m.competition, m.venue, m.category, m.travel && `Travel: ${m.travel}`, m.result && `Result: ${m.result}`].filter(Boolean).join(' · ')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {caps.viewMedical && <Button size="sm" variant={plan ? 'secondary' : 'primary'} loading={busy === m.id} icon={<Wand2 className="h-4 w-4" />} onClick={() => void generate(m)}>{plan ? `Recovery plan (${plan.status})` : 'Generate recovery plan'}</Button>}
          {!caps.viewMedical && plan?.status === 'Approved' && <Button size="sm" variant="secondary" onClick={() => navigate(`/recovery/plans/${plan.id}`)}>Recovery plan</Button>}
          {canEdit && <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(m)}>Edit</Button>}
          {canEdit && <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDel(m)}>Delete</Button>}
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Matches" subtitle="Calendar, gaps between matches and recovery planning" icon={<Trophy className="h-6 w-6" />}
        actions={<div className="flex gap-2"><SegmentedControl value={view} options={['List', 'Calendar'] as const} onChange={setView} />
          {canEdit && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ match_date: todayISO(), match_time: '18:00', home_away: 'Home', status: 'Scheduled' })}>Add match</Button>}</div>} />
      {matches.loading ? <Spinner /> : matches.error ? <ErrorBlock message={matches.error} onRetry={matches.reload} /> : view === 'Calendar' ? <MonthView matches={all} onPick={(m) => setEdit(m)} /> : (
        <>
          <Card title={<span className="flex items-center gap-2"><List className="h-5 w-5 text-brand-gold" /> Upcoming</span>}>
            {upcoming.length ? <ul className="space-y-2">{upcoming.map(row)}</ul> : <EmptyState title="No upcoming matches" description="Add the fixtures to see days until each match, congested periods and recovery plans." />}
          </Card>
          {past.length > 0 && <Card title="Previous matches"><ul className="space-y-2">{past.slice(0, 20).map(row)}</ul></Card>}
        </>
      )}
      {edit && <MatchModal value={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void matches.reload(); }} readOnly={!canEdit} />}
      <ConfirmDialog open={!!del} title="Delete match" danger confirmLabel="Delete" message={`Delete the match against ${del?.opponent}? Its recovery plan is deleted too.`}
        onCancel={() => setDel(null)} onConfirm={() => { const m = del!; setDel(null); void api.deleteMatch(m.id).then(() => { toast.success('Match deleted'); void matches.reload(); void plans.reload(); }).catch((e) => toast.error((e as Error).message)); }} />
    </div>
  );
}

function MonthView({ matches, onPick }: { matches: Match[]; onPick: (m: Match) => void }) {
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  const first = new Date(`${month}-01T00:00:00`);
  const startOffset = first.getDay();
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((startOffset + daysInMonth) / 7) * 7 }, (_, i) => {
    const d = i - startOffset + 1;
    return d >= 1 && d <= daysInMonth ? `${month}-${String(d).padStart(2, '0')}` : null;
  });
  const byDay = useMemo(() => { const m = new Map<string, Match[]>(); for (const x of matches) { m.set(x.match_date, [...(m.get(x.match_date) ?? []), x]); } return m; }, [matches]);
  const shift = (n: number) => { const d = new Date(first); d.setMonth(d.getMonth() + n); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };
  return (
    <Card title={<span className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-brand-gold" />{first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>}
      actions={<div className="flex gap-1"><Button size="sm" variant="ghost" icon={<ChevronLeft className="h-4 w-4" />} onClick={() => shift(-1)} aria-label="Previous month" /><Button size="sm" variant="ghost" icon={<ChevronRight className="h-4 w-4" />} onClick={() => shift(1)} aria-label="Next month" /></div>}>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-neutral-500">{WEEKDAYS.map((d) => <div key={d}>{d}</div>)}</div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) => (
          <div key={i} className={clsx('min-h-[64px] rounded-lg border p-1 text-left', !d && 'border-transparent', d === todayISO() && 'border-brand-gold bg-brand-cream')}>
            {d && <p className="text-[11px] text-neutral-500">{Number(d.slice(8))}</p>}
            {d && (byDay.get(d) ?? []).map((m) => (
              <button key={m.id} onClick={() => onPick(m)} className={clsx('mt-0.5 block w-full truncate rounded px-1 text-left text-[10px] font-semibold text-white', m.status === 'Cancelled' ? 'bg-neutral-400' : m.home_away === 'Home' ? 'bg-brand-gold' : 'bg-brand-navy')}>
                {m.match_time?.slice(0, 5)} {m.opponent}
              </button>
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}

function MatchModal({ value, onClose, onSaved, readOnly }: { value: Partial<Match>; onClose: () => void; onSaved: () => void; readOnly: boolean }) {
  const toast = useToast();
  const [f, setF] = useState<Partial<Match>>(value);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Match>(k: K, v: Match[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    if (!f.opponent || f.opponent.trim().length < 2) return toast.error('Enter the opponent');
    if (!f.match_date) return toast.error('Choose the date');
    setSaving(true);
    try { await api.saveMatch(f); toast.success('Match saved'); onSaved(); } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} title={f.id ? `Match vs ${f.opponent}` : 'Add match'} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Close</Button>{!readOnly && <Button loading={saving} onClick={() => void save()}>Save</Button>}</>}>
      <fieldset disabled={readOnly} className="space-y-4">
        <Grid>
          <Field label="Opponent" required><Input value={f.opponent ?? ''} onChange={(e) => set('opponent', e.target.value)} /></Field>
          <Field label="Competition"><Input value={f.competition ?? ''} onChange={(e) => set('competition', e.target.value)} placeholder="League, Cup…" /></Field>
          <Field label="Date" required><Input type="date" value={f.match_date ?? ''} onChange={(e) => set('match_date', e.target.value)} /></Field>
          <Field label="Time"><Input type="time" value={f.match_time?.slice(0, 5) ?? ''} onChange={(e) => set('match_time', e.target.value || null)} /></Field>
          <Field label="Venue"><Input value={f.venue ?? ''} onChange={(e) => set('venue', e.target.value)} /></Field>
          <Field label="Home / away"><Select value={f.home_away} onChange={(e) => set('home_away', e.target.value as Match['home_away'])} options={['Home', 'Away', 'Neutral']} /></Field>
          <Field label="Expected travel"><Input value={f.travel ?? ''} onChange={(e) => set('travel', e.target.value)} placeholder="e.g. Bus 4 h, depart MD-1 10:00" /></Field>
          <Field label="Status"><Select value={f.status} onChange={(e) => set('status', e.target.value as Match['status'])} options={['Scheduled', 'Played', 'Postponed', 'Cancelled']} /></Field>
          <Field label="Result"><Input value={f.result ?? ''} onChange={(e) => set('result', e.target.value)} placeholder="e.g. 82–75" /></Field>
          <Field label="Age category"><Input value={f.category ?? ''} onChange={(e) => set('category', e.target.value)} placeholder="Empty = all" /></Field>
        </Grid>
        <Field label="Notes"><Textarea rows={2} value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
      </fieldset>
    </Modal>
  );
}
