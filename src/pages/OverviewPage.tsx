import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowRightLeft, Dumbbell, HeartPulse, Layers, Shield, Stethoscope, UserCheck, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import * as api from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { useClub } from '../context/ClubContext';
import { useBrand } from '../context/BrandContext';
import { daysLost, isOpenInjury } from '../lib/analytics';
import { Button, Card, ErrorBlock, PageHeader, Spinner, StatCard, Table, Td } from '../components/ui';
import { BrandLogo, ClubLogo } from '../components/Branding';

/** Combined medical overview across every club the user is authorised for. */
export default function OverviewPage() {
  const { clubs, selectClub } = useClub();
  const { brand } = useBrand();
  const navigate = useNavigate();
  const data = useAsync(async () => {
    const [players, injuries, exams, rehab, availability] = await Promise.all([
      api.listPlayers({ club: 'all', includeArchived: true }), api.listInjuries({ club: 'all' }), api.listExaminations(undefined, 'all'),
      api.listRehabPrograms({ club: 'all' }), api.getTeamAvailability('all'),
    ]);
    return { players, injuries, exams, rehab, availability };
  }, []);

  const view = useMemo(() => {
    if (!data.data) return null;
    const { players, injuries, exams, rehab, availability } = data.data;
    const active = players.filter((p) => p.status === 'active');
    const injuredSet = new Set(injuries.filter(isOpenInjury).map((i) => i.player_id));
    const rehabSet = new Set([...rehab.filter((r) => r.status === 'Active').map((r) => r.player_id), ...injuries.filter((i) => i.status === 'Under Rehabilitation').map((i) => i.player_id)]);
    const perClub = clubs.map((c) => {
      const cp = active.filter((p) => p.club_id === c.id);
      const ci = injuries.filter((i) => i.club_id === c.id);
      return {
        club: c, players: cp.length,
        available: availability.filter((a) => a.club_id === c.id && a.availability === 'FULLY AVAILABLE').length,
        injuries: ci.length, injured: new Set(ci.filter(isOpenInjury).map((i) => i.player_id)).size,
        rehab: [...rehabSet].filter((pid) => cp.some((p) => p.id === pid)).length,
        exams: exams.filter((e) => e.club_id === c.id).length,
        daysLost: ci.reduce((s, i) => s + daysLost(i), 0),
      };
    });
    return {
      totals: {
        clubs: clubs.length, players: players.filter((p) => p.status !== 'archived').length, active: active.length, injuries: injuries.length,
        injured: injuredSet.size, rehab: rehabSet.size, available: availability.filter((a) => a.availability === 'FULLY AVAILABLE').length, exams: exams.length,
      },
      perClub,
      chart: perClub.map((x) => ({ name: x.club.short_name, Players: x.players, Injuries: x.injuries, 'Currently injured': x.injured, Available: x.available })),
    };
  }, [data.data, clubs]);

  if (data.loading) return <Spinner />;
  if (data.error) return <ErrorBlock message={data.error} onRetry={data.reload} />;
  if (!view) return null;
  const t = view.totals;
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-card sm:flex-row sm:items-center">
        <BrandLogo height={70} />
        <div className="sm:ml-auto sm:text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-gold">Overall medical dashboard</p>
          <p className="font-display text-2xl font-bold uppercase text-brand-navy">All authorised clubs</p>
          <p className="text-sm text-neutral-500">{brand.name} · {brand.specialty}</p>
        </div>
      </div>
      <PageHeader title="All Clubs Overview" subtitle="Combined statistics – each club's records remain separate" icon={<Layers className="h-6 w-6" />} />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Total clubs" value={t.clubs} icon={<Shield className="h-6 w-6" />} tone="dark" onClick={() => navigate('/clubs')} />
        <StatCard label="Total players" value={t.players} icon={<Users className="h-6 w-6" />} tone="beige" />
        <StatCard label="Active players" value={t.active} icon={<UserCheck className="h-6 w-6" />} tone="green" />
        <StatCard label="Total injuries" value={t.injuries} icon={<HeartPulse className="h-6 w-6" />} tone="red" />
        <StatCard label="Players currently injured" value={t.injured} icon={<HeartPulse className="h-6 w-6" />} tone="red" />
        <StatCard label="Under rehabilitation" value={t.rehab} icon={<Activity className="h-6 w-6" />} tone="orange" />
        <StatCard label="Players available" value={t.available} icon={<Dumbbell className="h-6 w-6" />} tone="green" />
        <StatCard label="Medical examinations" value={t.exams} icon={<Stethoscope className="h-6 w-6" />} tone="blue" />
      </div>
      <Card title="Club Comparison">
        {view.chart.length ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={view.chart} margin={{ left: -16, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} stroke="#eee" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} /><Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              <Bar dataKey="Players" fill="#142347" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="Available" fill="#2f855a" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="Injuries" fill="#9A7634" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="Currently injured" fill="#C0283A" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        ) : null}
      </Card>
      <Card title="Per-Club Summary" padded={false}>
        <div className="px-5"><Table headers={['Club', 'Active players', 'Available', 'Injuries', 'Currently injured', 'Under rehab', 'Examinations', 'Days lost', '']}>
          {view.perClub.map((x) => (
            <tr key={x.club.id}>
              <Td><span className="flex items-center gap-3"><ClubLogo logo={x.club.logo_url} name={x.club.short_name} size={32} /><span className="font-semibold">{x.club.name}</span></span></Td>
              <Td>{x.players}</Td><Td>{x.available}</Td><Td>{x.injuries}</Td><Td>{x.injured}</Td><Td>{x.rehab}</Td><Td>{x.exams}</Td><Td>{x.daysLost}</Td>
              <Td><Button size="sm" variant="ghost" icon={<ArrowRightLeft className="h-4 w-4" />} onClick={() => { selectClub(x.club.id); navigate('/'); }}>Open</Button></Td>
            </tr>
          ))}
        </Table></div>
      </Card>
    </div>
  );
}
