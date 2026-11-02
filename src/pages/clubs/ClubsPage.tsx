import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRightLeft, Plus, Shield } from 'lucide-react';
import { useClub } from '../../context/ClubContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import * as api from '../../lib/api';
import { useAsync } from '../../hooks/useAsync';
import { formatDate } from '../../lib/format';
import { Badge, Button, Card, DemoBadge, EmptyState, PageHeader, StatusBadge } from '../../components/ui';
import { ClubLogo } from '../../components/Branding';

export default function ClubsPage() {
  const { clubs, club: current, selectClub } = useClub();
  const { caps } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const players = useAsync(() => api.listPlayers({ club: 'all' }), []);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of players.data ?? []) if (p.status === 'active') m.set(p.club_id, (m.get(p.club_id) ?? 0) + 1);
    return m;
  }, [players.data]);
  return (
    <div>
      <PageHeader title="Club Management" subtitle="Every club has its own roster, medical records, seasons and reports" icon={<Shield className="h-6 w-6" />}
        actions={caps.manageClubs && <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/clubs/new')}>Add Club</Button>} />
      {!clubs.length ? <EmptyState title="No clubs yet" /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {clubs.map((c) => (
            <Card key={c.id} className={c.id === current?.id ? 'ring-2 ring-brand-gold' : ''}>
              <div className="flex items-start gap-4">
                <ClubLogo logo={c.logo_url} name={c.short_name} size={64} />
                <div className="min-w-0 flex-1">
                  <Link to={`/clubs/${c.id}`} className="block font-semibold text-brand-navy hover:text-brand-gold">{c.name}</Link>
                  <p className="text-xs text-neutral-500">{c.club_code} · {[c.city, c.country].filter(Boolean).join(', ')}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <StatusBadge status={c.status} /><Badge color="beige">{c.sport}</Badge><DemoBadge show={c.is_demo} />
                    {c.id === current?.id && <Badge color="orange">Current</Badge>}
                  </div>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-neutral-100 pt-3 text-center">
                <div><dt className="text-[10px] uppercase tracking-wide text-neutral-500">Active players</dt><dd className="font-display text-xl font-bold text-brand-navy">{counts.get(c.id) ?? 0}</dd></div>
                <div><dt className="text-[10px] uppercase tracking-wide text-neutral-500">Season</dt><dd className="text-sm font-semibold">{c.current_season ?? '—'}</dd></div>
                <div><dt className="text-[10px] uppercase tracking-wide text-neutral-500">Registered</dt><dd className="text-sm font-semibold">{formatDate(c.registration_date)}</dd></div>
              </dl>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="secondary" className="flex-1" onClick={() => navigate(`/clubs/${c.id}`)}>Club profile</Button>
                {c.id !== current?.id && <Button size="sm" className="flex-1" icon={<ArrowRightLeft className="h-4 w-4" />} onClick={() => { selectClub(c.id); toast.info(`Now viewing ${c.name}`); navigate('/'); }}>Switch</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
