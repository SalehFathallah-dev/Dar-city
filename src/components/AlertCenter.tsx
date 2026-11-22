import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Activity, AlertTriangle, CalendarClock, ClipboardX, Inbox, Pill, ShieldAlert, UserX } from 'lucide-react';
import * as api from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { useClub } from '../context/ClubContext';
import { addDays, todayISO } from '../lib/format';
import { Card, Spinner } from './ui';

interface Alert { key: string; icon: React.ReactNode; tone: 'red' | 'amber' | 'blue'; title: string; detail: string; to: string }

/** Doctor's command centre: what needs a medical decision today. Every item comes from live data. */
export function AlertCenter() {
  const { clubId } = useClub();
  const today = todayISO();
  const data = useAsync(async () => {
    const [cases, flags, doses, team] = await Promise.all([
      api.listCases({ status: 'open' }).catch(() => []),
      api.getWellnessFlags(today).catch(() => []),
      api.getTeamAdherence(clubId!, today, today).catch(() => []),
      api.getTeamAvailability().catch(() => []),
    ]);
    return { cases, flags, doses, team };
  }, [clubId, today]);
  if (data.loading) return <Card title="Alerts"><Spinner /></Card>;
  const d = data.data;
  if (!d) return null;
  const now = new Date().toTimeString().slice(0, 5);
  const alerts: Alert[] = [];
  const urgent = d.cases.filter((c) => c.priority === 'Urgent' || c.athlete_urgent);
  const fresh = d.cases.filter((c) => c.status === 'New');
  const waiting = d.cases.filter((c) => c.status === 'Under Review');
  if (urgent.length) alerts.push({ key: 'urgent', icon: <ShieldAlert className="h-5 w-5" />, tone: 'red', title: `${urgent.length} urgent complaint${urgent.length > 1 ? 's' : ''}`, detail: urgent.map((c) => c.players?.full_name).join(', '), to: '/inbox' });
  if (fresh.length) alerts.push({ key: 'new', icon: <Inbox className="h-5 w-5" />, tone: 'red', title: `${fresh.length} new medical complaint${fresh.length > 1 ? 's' : ''}`, detail: fresh.map((c) => `${c.players?.full_name} (${c.category})`).join(', '), to: '/inbox' });
  if (waiting.length) alerts.push({ key: 'review', icon: <Inbox className="h-5 w-5" />, tone: 'amber', title: `${waiting.length} complaint${waiting.length > 1 ? 's' : ''} pending review`, detail: waiting.map((c) => c.players?.full_name).join(', '), to: '/inbox' });
  const pain = d.flags.filter((f) => /pain|Illness/i.test(f.flag));
  const trend = d.flags.filter((f) => /fatigue|soreness|sleep|readiness/i.test(f.flag));
  const missed = d.flags.filter((f) => f.flag === 'Missed questionnaires');
  if (pain.length) alerts.push({ key: 'pain', icon: <AlertTriangle className="h-5 w-5" />, tone: 'red', title: `${pain.length} new pain / illness report${pain.length > 1 ? 's' : ''} in questionnaires`, detail: pain.map((f) => `${f.full_name}: ${f.detail}`).join(' · '), to: '/wellness' });
  if (trend.length) alerts.push({ key: 'trend', icon: <Activity className="h-5 w-5" />, tone: 'amber', title: `${new Set(trend.map((f) => f.player_id)).size} athlete(s) outside their usual wellness range`, detail: trend.map((f) => `${f.full_name}: ${f.flag}`).join(' · '), to: '/wellness' });
  if (missed.length) alerts.push({ key: 'missed', icon: <ClipboardX className="h-5 w-5" />, tone: 'blue', title: `${missed.length} missed questionnaire${missed.length > 1 ? 's' : ''}`, detail: missed.map((f) => f.full_name).join(', '), to: '/wellness' });
  const dueNow = d.doses.filter((r) => !r.status && r.scheduled_time !== 'any' && r.scheduled_time <= now);
  if (dueNow.length) alerts.push({ key: 'doses', icon: <Pill className="h-5 w-5" />, tone: 'amber', title: `${dueNow.length} dose${dueNow.length > 1 ? 's' : ''} due today not confirmed yet`, detail: [...new Set(dueNow.map((r) => `${r.full_name}: ${r.name}`))].join(' · '), to: '/team-status' });
  const out = d.team.filter((p) => p.availability === 'NOT AVAILABLE');
  if (out.length) alerts.push({ key: 'out', icon: <UserX className="h-5 w-5" />, tone: 'blue', title: `${out.length} player${out.length > 1 ? 's' : ''} unavailable`, detail: out.map((p) => p.full_name).join(', '), to: '/availability' });
  const soon = addDays(today, 2);
  const followups = d.team.filter((p) => p.next_followup_date && p.next_followup_date <= soon);
  if (followups.length) alerts.push({ key: 'fu', icon: <CalendarClock className="h-5 w-5" />, tone: 'blue', title: `${followups.length} medical review${followups.length > 1 ? 's' : ''} due within 2 days`, detail: followups.map((p) => p.full_name).join(', '), to: '/availability' });

  return (
    <Card title={<span className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-brand-red" /> Today's alerts</span>}>
      {alerts.length === 0 ? <p className="text-sm text-emerald-700">Nothing needs your attention right now.</p> : (
        <ul className="grid gap-2 md:grid-cols-2">
          {alerts.map((a) => (
            <li key={a.key}>
              <Link to={a.to} className={clsx('flex gap-3 rounded-xl border p-3 transition hover:shadow-card',
                a.tone === 'red' ? 'border-red-200 bg-red-50' : a.tone === 'amber' ? 'border-amber-200 bg-amber-50' : 'border-sky-200 bg-sky-50')}>
                <span className={clsx('mt-0.5', a.tone === 'red' ? 'text-brand-red' : a.tone === 'amber' ? 'text-amber-600' : 'text-sky-700')}>{a.icon}</span>
                <span className="min-w-0"><span className="block text-sm font-bold text-brand-navy">{a.title}</span><span className="line-clamp-2 text-xs text-neutral-600">{a.detail}</span></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-neutral-400">Wellness alerts are decision support based on each athlete's own baseline, not diagnoses.</p>
    </Card>
  );
}
