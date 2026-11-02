import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity, AlertTriangle, BadgeCheck, CalendarClock, ClipboardCheck, Clock, Dumbbell, HeartPulse, ShieldAlert, Stethoscope, UserPlus, Users,
} from 'lucide-react';
import * as api from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useReference } from '../context/ReferenceContext';
import { useClub } from '../context/ClubContext';
import { BrandLogo, ClubLogo } from '../components/Branding';
import { APP, AVAILABILITY } from '../lib/constants';
import { computeDashboardStats, countBy, daysLost, inRange, injuryAnalytics, isOpenInjury, monthlyTrend } from '../lib/analytics';
import { formatDate, todayISO } from '../lib/format';
import { Badge, Card, EmptyState, ErrorBlock, PlayerAvatar, Spinner, StatCard, StatusBadge } from '../components/ui';
import { DateRangeFilter, useDateRange } from '../components/DateRangeFilter';
import { DonutChart, HBarChart, TrendChart, VBarChart } from '../components/charts';

export default function Dashboard() {
  const { caps, profile } = useAuth();
  const { club } = useClub();
  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-black/5">
        <div className="flex flex-col gap-4 bg-brand-cream px-6 py-5 sm:flex-row sm:items-center sm:px-8">
          <BrandLogo height={72} />
          <div className="sm:ml-auto sm:text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-brand-gold">{APP.product}</p>
            <p className="text-sm text-neutral-600">Signed in as <b className="text-brand-navy">{profile?.full_name}</b> · {formatDate(todayISO())}</p>
          </div>
        </div>
        {club && (
          <div className="relative flex items-center gap-4 bg-brand-navy px-6 py-4 text-white sm:px-8">
            <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-brand-gold/20 blur-3xl" />
            <ClubLogo logo={club.logo_url} name={club.short_name} size={56} />
            <div className="relative min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-brand-goldLight">Club medical dashboard – data shown for this club only</p>
              <h1 className="truncate font-display text-2xl font-bold uppercase tracking-wide sm:text-3xl">{club.name}</h1>
              <p className="text-xs text-neutral-300">{[club.country, club.city, club.league, club.current_season && `Season ${club.current_season}`].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
        )}
      </div>
      {caps.viewMedical ? <ClinicalDashboard /> : <StaffDashboard />}
    </div>
  );
}

function ClinicalDashboard() {
  const navigate = useNavigate();
  const { currentSeason, players } = useReference();
  const dr = useDateRange('season');
  const data = useAsync(async () => {
    const [injuries, availability, clearances, examinations, rehab, rtp, followups] = await Promise.all([
      api.listInjuries(), api.listAvailability(), api.listClearances(), api.listExaminations(), api.listRehabPrograms(), api.listRtp(), api.listFollowups(),
    ]);
    return { injuries, availability, clearances, examinations, rehab, rtp, followups };
  }, []);

  const view = useMemo(() => {
    if (!data.data) return null;
    const d = data.data;
    const stats = computeDashboardStats({ players, ...d, season: currentSeason });
    const range = dr.range;
    const injuries = d.injuries.filter((i) => inRange(i.injury_date, range));
    const a = injuryAnalytics(injuries, players, d.rehab.filter((r) => inRange(r.start_date, range)), d.rtp.filter((r) => inRange(r.decision_date, range)));
    const latest = new Map<string, string>();
    for (const av of d.availability) if (!latest.has(av.player_id)) latest.set(av.player_id, av.availability);
    const active = players.filter((p) => p.status === 'active');
    const availabilityDist = AVAILABILITY.map((s) => ({ name: s, value: active.filter((p) => (latest.get(p.id) ?? 'UNDER MEDICAL REVIEW') === s).length })).filter((x) => x.value);
    const injuryById = new Map(d.injuries.map((i) => [i.id, i]));
    const today = todayISO();
    const upcoming = [
      ...d.followups.filter((f) => f.next_followup_date && f.next_followup_date >= today && isOpenInjury(injuryById.get(f.injury_id) ?? { status: 'Closed' }))
        .map((f) => ({ date: f.next_followup_date!, label: 'Injury follow-up', who: injuryById.get(f.injury_id)?.players?.full_name, to: `/injuries/${f.injury_id}` })),
      ...d.examinations.filter((e) => e.follow_up_date && e.follow_up_date >= today).map((e) => ({ date: e.follow_up_date!, label: 'Examination review', who: e.players?.full_name, to: `/examinations/${e.id}` })),
    ].sort((x, y) => x.date.localeCompare(y.date));
    // keep only the next item per player+type
    const seen = new Set<string>();
    const upcomingUnique = upcoming.filter((u) => { const k = `${u.who}|${u.label}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 6);
    return {
      stats, a, availabilityDist, upcoming: upcomingUnique,
      trend: monthlyTrend(injuries, range),
      recentPlayers: [...players].sort((x, y) => y.created_at.localeCompare(x.created_at)).filter((p) => inRange(p.registration_date, range) || !range.from).slice(0, 5),
      recentInjuries: injuries.slice(0, 5),
      recentExams: d.examinations.filter((e) => inRange(e.examination_date, range)).slice(0, 5),
      recentClearances: [...d.clearances.filter((c) => inRange(c.decision_date, range)).map((c) => ({ id: c.id, date: c.decision_date, who: c.players?.full_name, decision: c.clearance_status, to: `/players/${c.player_id}?tab=clearance` })),
        ...d.rtp.filter((r) => inRange(r.decision_date, range)).map((r) => ({ id: r.id, date: r.decision_date, who: r.players?.full_name, decision: `RTP: ${r.decision}`, to: `/return-to-play/${r.id}` }))]
        .sort((x, y) => y.date.localeCompare(x.date)).slice(0, 5),
      positionCounts: countBy(injuries, (i) => players.find((p) => p.id === i.player_id)?.position),
    };
  }, [data.data, players, currentSeason, dr.range]);

  if (data.loading) return <Spinner />;
  if (data.error) return <ErrorBlock message={data.error} onRetry={data.reload} />;
  if (!view) return null;
  const s = view.stats;
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Registered Players" value={s.totalPlayers} icon={<Users className="h-6 w-6" />} tone="dark" onClick={() => navigate('/players')} />
        <StatCard label="Medically Cleared" value={s.cleared} icon={<BadgeCheck className="h-6 w-6" />} tone="green" onClick={() => navigate('/clearances')} />
        <StatCard label="Available – Full Training" value={s.fullTraining} icon={<Dumbbell className="h-6 w-6" />} tone="green" onClick={() => navigate('/availability')} />
        <StatCard label="Injured Players" value={s.injured} icon={<HeartPulse className="h-6 w-6" />} tone="red" onClick={() => navigate('/injuries?status=open')} />
        <StatCard label="Under Rehabilitation" value={s.underRehab} icon={<Activity className="h-6 w-6" />} tone="orange" onClick={() => navigate('/rehabilitation')} />
        <StatCard label="Modified Training" value={s.modifiedTraining} icon={<ShieldAlert className="h-6 w-6" />} tone="orange" onClick={() => navigate('/availability')} />
        <StatCard label="Awaiting Medical Assessment" value={s.awaitingAssessment} icon={<Clock className="h-6 w-6" />} tone="blue" hint="No exam this season or under review" onClick={() => navigate('/examinations')} />
        <StatCard label="Medical Clearance Pending" value={s.clearancePending} icon={<ClipboardCheck className="h-6 w-6" />} tone="beige" onClick={() => navigate('/clearances')} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold uppercase tracking-wide">Injury Analytics</h2>
        <DateRangeFilter state={dr} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Injuries in period" value={view.a.total} icon={<HeartPulse className="h-6 w-6" />} tone="red" />
        <StatCard label="Players injured" value={view.a.playersInjured} icon={<Users className="h-6 w-6" />} tone="dark" />
        <StatCard label="Days lost" value={view.a.totalDaysLost} icon={<CalendarClock className="h-6 w-6" />} tone="orange" hint={`Average ${view.a.averageDaysLost} days per completed injury`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Injury Distribution by Body Region"><HBarChart data={view.a.byRegion} /></Card>
        <Card title="Injury Types Distribution"><DonutChart data={view.a.byType} /></Card>
        <Card title="Monthly Injury Trends"><TrendChart data={view.trend} /></Card>
        <Card title="Injuries by Playing Position"><VBarChart data={view.positionCounts} colorful /></Card>
        <Card title="Days Lost Due to Injuries (by region)"><HBarChart data={view.a.daysLostByRegion} unit="Days lost" color="#C0283A" /></Card>
        <Card title="Player Availability (current)"><DonutChart data={view.availabilityDist} availability /></Card>
        <Card title="Recovery & Return-to-Play Outcomes" className="lg:col-span-2"><VBarChart data={view.a.rtpOutcomes} unit="Decisions" colorful /></Card>
      </div>

      <h2 className="font-display text-xl font-bold uppercase tracking-wide">Recent Activity</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card title="Recently Recorded Injuries" actions={<Link to="/injuries" className="text-xs font-semibold text-brand-gold">View all</Link>} padded={false}>
          {view.recentInjuries.length ? view.recentInjuries.map((i) => (
            <Link key={i.id} to={`/injuries/${i.id}`} className="flex items-center gap-3 border-b border-neutral-100 px-5 py-3 last:border-0 hover:bg-brand-cream/50">
              <HeartPulse className="h-4 w-4 shrink-0 text-brand-red" />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{i.players?.full_name}</p><p className="truncate text-xs text-neutral-500">{i.body_region} · {i.diagnosis ?? i.injury_type} · {daysLost(i)} days</p></div>
              <span className="text-xs text-neutral-400">{formatDate(i.injury_date)}</span>
            </Link>
          )) : <EmptyState title="No injuries in this period" />}
        </Card>
        <Card title="Upcoming Medical Follow-ups" padded={false}>
          {view.upcoming.length ? view.upcoming.map((u, idx) => (
            <Link key={idx} to={u.to} className="flex items-center gap-3 border-b border-neutral-100 px-5 py-3 last:border-0 hover:bg-brand-cream/50">
              <CalendarClock className="h-4 w-4 shrink-0 text-brand-gold" />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{u.who}</p><p className="text-xs text-neutral-500">{u.label}</p></div>
              <Badge color={u.date === todayISO() ? 'red' : 'orange'}>{formatDate(u.date)}</Badge>
            </Link>
          )) : <EmptyState title="No follow-ups scheduled" />}
        </Card>
        <Card title="Recent Medical Examinations" actions={<Link to="/examinations" className="text-xs font-semibold text-brand-gold">View all</Link>} padded={false}>
          {view.recentExams.length ? view.recentExams.map((e) => (
            <Link key={e.id} to={`/examinations/${e.id}`} className="flex items-center gap-3 border-b border-neutral-100 px-5 py-3 last:border-0 hover:bg-brand-cream/50">
              <Stethoscope className="h-4 w-4 shrink-0 text-brand-navy" />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{e.players?.full_name}</p><p className="text-xs text-neutral-500">{e.examination_type} · {e.exam_code}</p></div>
              <span className="text-xs text-neutral-400">{formatDate(e.examination_date)}</span>
            </Link>
          )) : <EmptyState title="No examinations in this period" />}
        </Card>
        <Card title="Recent Clearance Decisions" padded={false}>
          {view.recentClearances.length ? view.recentClearances.map((c) => (
            <Link key={c.id} to={c.to} className="flex items-center gap-3 border-b border-neutral-100 px-5 py-3 last:border-0 hover:bg-brand-cream/50">
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{c.who}</p><p className="text-xs text-neutral-500">{formatDate(c.date)}</p></div>
              <StatusBadge status={c.decision} />
            </Link>
          )) : <EmptyState title="No decisions in this period" />}
        </Card>
        <Card title="Recently Registered Players" actions={<Link to="/players" className="text-xs font-semibold text-brand-gold">View all</Link>} padded={false}>
          {view.recentPlayers.length ? view.recentPlayers.map((p) => (
            <Link key={p.id} to={`/players/${p.id}`} className="flex items-center gap-3 border-b border-neutral-100 px-5 py-3 last:border-0 hover:bg-brand-cream/50">
              <PlayerAvatar name={p.full_name} photoPath={p.photo_path} size={32} />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{p.full_name}</p><p className="text-xs text-neutral-500">#{p.jersey_number ?? '–'} · {p.position}</p></div>
              <span className="text-xs text-neutral-400">{formatDate(p.registration_date)}</span>
            </Link>
          )) : <EmptyState title="No players registered in this period" icon={<UserPlus className="h-6 w-6" />} />}
        </Card>
      </div>
    </>
  );
}

/** Dashboard for the head coach / team manager / super admin – availability only, no clinical data. */
function StaffDashboard() {
  const data = useAsync(() => api.getTeamAvailability(), []);
  if (data.loading) return <Spinner />;
  if (data.error) return <ErrorBlock message={data.error} onRetry={data.reload} />;
  const rows = data.data ?? [];
  const c = (s: string) => rows.filter((r) => r.availability === s).length;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <StatCard label="Squad" value={rows.length} icon={<Users className="h-6 w-6" />} />
        <StatCard label="Fully Available" value={c('FULLY AVAILABLE')} icon={<Dumbbell className="h-6 w-6" />} tone="green" />
        <StatCard label="Modified / Individual" value={c('MODIFIED TRAINING') + c('INDIVIDUAL TRAINING')} icon={<ShieldAlert className="h-6 w-6" />} tone="orange" />
        <StatCard label="Not Available" value={c('NOT AVAILABLE')} icon={<AlertTriangle className="h-6 w-6" />} tone="red" />
        <StatCard label="Under Medical Review" value={c('UNDER MEDICAL REVIEW')} icon={<Clock className="h-6 w-6" />} tone="blue" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Availability Overview"><DonutChart data={AVAILABILITY.map((s) => ({ name: s, value: c(s) })).filter((x) => x.value)} availability /></Card>
        <Card title="Players with Training Restrictions" className="lg:col-span-2" actions={<Link to="/availability" className="text-xs font-semibold text-brand-gold">Full availability</Link>} padded={false}>
          {rows.filter((r) => r.availability !== 'FULLY AVAILABLE').length ? rows.filter((r) => r.availability !== 'FULLY AVAILABLE').map((r) => (
            <div key={r.player_id} className="flex flex-wrap items-center gap-3 border-b border-neutral-100 px-5 py-3 last:border-0">
              <span className="w-8 font-display text-lg font-bold text-brand-gold">#{r.jersey_number ?? '–'}</span>
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{r.full_name}</p><p className="text-xs text-neutral-500">{r.restrictions || 'No specific restrictions recorded'}</p></div>
              <StatusBadge status={r.availability} />
            </div>
          )) : <EmptyState title="All players fully available" />}
        </Card>
      </div>
      <p className="text-xs text-neutral-500">Confidential medical information (diagnoses, medications and clinical notes) is only visible to the medical team.</p>
    </>
  );
}
