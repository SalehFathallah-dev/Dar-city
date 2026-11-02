import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Archive, ArchiveRestore, Pencil, UserPlus, Users } from 'lucide-react';
import { useReference } from '../../context/ReferenceContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import * as api from '../../lib/api';
import { POSITIONS } from '../../lib/constants';
import { calculateAge, formatDate } from '../../lib/format';
import type { Player } from '../../lib/types';
import { Badge, Button, Card, ConfirmDialog, DemoBadge, EmptyState, PageHeader, PlayerAvatar, SearchInput, Select, Spinner, StatusBadge, Table, Td } from '../../components/ui';

export default function PlayersPage() {
  const { players, loading, reload, seasons } = useReference();
  const { caps } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [position, setPosition] = useState('');
  const [status, setStatus] = useState('active');
  const [season, setSeason] = useState('');
  const [target, setTarget] = useState<{ p: Player; to: Player['status'] } | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => players.filter((p) => {
    const s = q.trim().toLowerCase();
    if (s && !(p.full_name.toLowerCase().includes(s) || p.player_code.toLowerCase().includes(s) || String(p.jersey_number ?? '') === s.replace('#', '') || (p.nationality ?? '').toLowerCase().includes(s))) return false;
    if (position && p.position !== position) return false;
    if (status && p.status !== status) return false;
    if (season && p.season_id !== season) return false;
    return true;
  }), [players, q, position, status, season]);

  const changeStatus = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await api.setPlayerStatus(target.p.id, target.to);
      toast.success(target.to === 'archived' ? 'Player archived – all medical records are retained.' : 'Player restored to the active roster.');
      setTarget(null);
      await reload();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Players" subtitle="Team roster and player registration" icon={<Users className="h-6 w-6" />}
        actions={caps.managePlayers && <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => navigate('/players/new')}>Add Player</Button>} />
      <Card>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput value={q} onChange={setQ} placeholder="Name, ID, jersey, nationality…" />
          <Select value={position} onChange={(e) => setPosition(e.target.value)} options={POSITIONS} placeholder="All positions" />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'archived', label: 'Archived' }]} placeholder="All statuses" />
          <Select value={season} onChange={(e) => setSeason(e.target.value)} options={seasons.map((s) => ({ value: s.id, label: `Season ${s.name}` }))} placeholder="All seasons" />
        </div>
        {loading ? <Spinner /> : !players.length ? (
          <EmptyState title="No players registered yet" description="Add the first player to start building the team medical record."
            action={caps.managePlayers && <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => navigate('/players/new')}>Add Player</Button>} />
        ) : (
          <>
            {/* Mobile cards */}
            <div className="space-y-2 md:hidden">
              {filtered.map((p) => (
                <Link key={p.id} to={`/players/${p.id}`} className="flex items-center gap-3 rounded-xl border border-neutral-200 p-3">
                  <PlayerAvatar name={p.full_name} photoPath={p.photo_path} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{p.full_name} <DemoBadge show={p.is_demo} /></p>
                    <p className="text-xs text-neutral-500">#{p.jersey_number ?? '–'} · {p.position} · {calculateAge(p.date_of_birth)} yrs</p>
                  </div>
                  <StatusBadge status={p.status} />
                </Link>
              ))}
              {!filtered.length && <EmptyState title="No players match the filters" />}
            </div>
            <div className="hidden md:block">
              <Table headers={['Player', 'ID', 'Position', 'Age', 'Height / Weight', 'BMI', 'Registered', 'Status', '']} empty={!filtered.length}>
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-brand-cream/40">
                    <Td>
                      <Link to={`/players/${p.id}`} className="flex items-center gap-3">
                        <PlayerAvatar name={p.full_name} photoPath={p.photo_path} size={36} />
                        <div><p className="font-semibold text-neutral-900 hover:text-brand-gold">{p.full_name}</p><p className="text-xs text-neutral-500">#{p.jersey_number ?? '–'} {p.nationality && `· ${p.nationality}`}</p></div>
                        <DemoBadge show={p.is_demo} />
                      </Link>
                    </Td>
                    <Td className="font-mono text-xs">{p.player_code}</Td>
                    <Td><Badge color="beige">{p.position}</Badge></Td>
                    <Td>{calculateAge(p.date_of_birth)}</Td>
                    <Td>{p.height_cm ?? '—'} cm / {p.weight_kg ?? '—'} kg</Td>
                    <Td>{p.bmi ?? '—'}</Td>
                    <Td>{formatDate(p.registration_date)}</Td>
                    <Td><StatusBadge status={p.status} /></Td>
                    <Td className="whitespace-nowrap text-right">
                      {caps.managePlayers && (
                        <>
                          <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => navigate(`/players/${p.id}/edit`)} aria-label="Edit" />
                          {p.status === 'archived'
                            ? <Button size="sm" variant="ghost" icon={<ArchiveRestore className="h-4 w-4" />} onClick={() => setTarget({ p, to: 'active' })}>Restore</Button>
                            : <Button size="sm" variant="ghost" icon={<Archive className="h-4 w-4" />} onClick={() => setTarget({ p, to: 'archived' })} aria-label="Archive" />}
                        </>
                      )}
                    </Td>
                  </tr>
                ))}
              </Table>
            </div>
          </>
        )}
      </Card>
      <ConfirmDialog open={!!target} loading={busy} danger={target?.to === 'archived'}
        title={target?.to === 'archived' ? 'Archive player' : 'Restore player'}
        confirmLabel={target?.to === 'archived' ? 'Archive' : 'Restore'}
        message={target?.to === 'archived'
          ? <>Archive <b>{target?.p.full_name}</b>? The player is removed from the active roster and the jersey number becomes available. Medical records are never deleted.</>
          : <>Restore <b>{target?.p.full_name}</b> to the active roster? This fails if jersey #{target?.p.jersey_number} is now used by another active player.</>}
        onConfirm={changeStatus} onCancel={() => setTarget(null)} />
    </div>
  );
}
