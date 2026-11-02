import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRightLeft, BarChart3, Download, FileText, Pencil, Power, Shield, UserMinus, UserPlus } from 'lucide-react';
import * as api from '../../lib/api';
import { useAsync } from '../../hooks/useAsync';
import { useAuth } from '../../context/AuthContext';
import { useClub } from '../../context/ClubContext';
import { useToast } from '../../context/ToastContext';
import { ROLE_LABELS } from '../../lib/constants';
import { formatDate } from '../../lib/format';
import { isOpenInjury } from '../../lib/analytics';
import { Badge, Button, Card, ConfirmDialog, DemoBadge, DetailGrid, EmptyState, ErrorBlock, Field, Modal, Select, Spinner, StatCard, StatusBadge } from '../../components/ui';
import { ClubLogo } from '../../components/Branding';

export default function ClubProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { caps, profile } = useAuth();
  const { club: current, selectClub, reload: reloadClubs } = useClub();
  const toast = useToast();
  const navigate = useNavigate();
  const data = useAsync(async () => {
    const club = await api.getClub(id!);
    const [players, availability, injuries] = await Promise.all([
      api.listPlayers({ club: id, includeArchived: true }), api.getTeamAvailability(id),
      caps.viewMedical ? api.listInjuries({ club: id }) : Promise.resolve([]),
    ]);
    return { club, players, availability, injuries };
  }, [id, caps.viewMedical]);
  const canSeeMembers = caps.isAdmin || caps.isPhysician;
  const members = useAsync(async () => {
    if (!canSeeMembers) return null;
    const [m, profiles] = await Promise.all([api.listClubMembers(id), api.listProfiles()]);
    return { members: m, profiles };
  }, [id, canSeeMembers]);
  const [addOpen, setAddOpen] = useState(false);
  const [userToAdd, setUserToAdd] = useState('');
  const [statusConfirm, setStatusConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const memberProfiles = useMemo(() => {
    if (!members.data) return [];
    const ids = new Set(members.data.members.map((m) => m.user_id));
    return members.data.profiles.filter((p) => ids.has(p.id));
  }, [members.data]);

  if (data.loading) return <Spinner />;
  if (data.error || !data.data) return <ErrorBlock message={data.error ?? 'Club not found'} onRetry={data.reload} />;
  const { club, players, availability, injuries } = data.data;
  const active = players.filter((p) => p.status === 'active');
  const switchTo = (to: string) => { if (club.id !== current?.id) selectClub(club.id); navigate(to); };

  const toggleStatus = async () => {
    setBusy(true);
    try {
      await api.setClubStatus(club.id, club.status === 'active' ? 'inactive' : 'active');
      toast.success(club.status === 'active' ? 'Club deactivated – records are kept, new registrations are blocked.' : 'Club activated');
      setStatusConfirm(false); await reloadClubs(); void data.reload();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const addMember = async () => {
    if (!userToAdd) return;
    try { await api.addClubMember(club.id, userToAdd); toast.success('Access granted'); setAddOpen(false); setUserToAdd(''); void members.reload(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const removeMember = async (uid: string) => {
    try { await api.removeClubMember(club.id, uid); toast.success('Access removed'); void members.reload(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-card sm:flex-row sm:items-center">
        <ClubLogo logo={club.logo_url} name={club.short_name} size={96} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-gold">Club profile · {club.club_code}</p>
          <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-brand-navy">{club.name} <DemoBadge show={club.is_demo} /></h1>
          <p className="text-sm text-neutral-500">{[club.sport, club.competition_category, club.league, club.city, club.country].filter(Boolean).join(' · ')}</p>
          <div className="mt-2 flex flex-wrap gap-2"><StatusBadge status={club.status} />{club.id === current?.id && <Badge color="orange">Currently selected</Badge>}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {club.id !== current?.id && <Button icon={<ArrowRightLeft className="h-4 w-4" />} onClick={() => switchTo('/')}>Switch to club</Button>}
          {caps.manageClubs && <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => navigate(`/clubs/${club.id}/edit`)}>Edit</Button>}
          {caps.manageClubs && <Button variant="ghost" icon={<Power className="h-4 w-4" />} onClick={() => setStatusConfirm(true)}>{club.status === 'active' ? 'Deactivate' : 'Activate'}</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active players" value={active.length} icon={<Shield className="h-6 w-6" />} />
        <StatCard label="Fully available" value={availability.filter((a) => a.availability === 'FULLY AVAILABLE').length} icon={<Shield className="h-6 w-6" />} tone="green" />
        {caps.viewMedical && <StatCard label="Open injuries" value={injuries.filter(isOpenInjury).length} icon={<Shield className="h-6 w-6" />} tone="red" />}
        {caps.viewMedical && <StatCard label="Total injuries" value={injuries.length} icon={<Shield className="h-6 w-6" />} tone="orange" />}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" icon={<BarChart3 className="h-4 w-4" />} onClick={() => switchTo('/')}>Club dashboard</Button>
        <Button variant="secondary" icon={<FileText className="h-4 w-4" />} onClick={() => switchTo('/reports')}>Club reports</Button>
        <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => switchTo('/exports')}>Export club data</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Club Information">
          <DetailGrid cols={2} items={[
            { label: 'Club ID', value: club.club_code }, { label: 'Player ID prefix', value: `${club.player_id_prefix}-0001` },
            { label: 'Official name', value: club.name }, { label: 'Short name', value: club.short_name },
            { label: 'Country', value: club.country }, { label: 'City', value: club.city }, { label: 'Sport', value: club.sport },
            { label: 'Competition category', value: club.competition_category }, { label: 'League / division', value: club.league },
            { label: 'Season', value: club.current_season }, { label: 'Registration date', value: formatDate(club.registration_date) },
          ]} />
        </Card>
        <Card title="Contact & Medical Department">
          <DetailGrid cols={2} items={[
            { label: 'Contact person', value: club.contact_person }, { label: 'Phone', value: club.phone }, { label: 'E-mail', value: club.email },
            { label: 'Address', value: club.address }, { label: 'Medical department notes', value: club.medical_notes, wide: true },
          ]} />
        </Card>
      </div>

      {canSeeMembers && (
        <Card title="Club Users (access)" actions={<Button size="sm" icon={<UserPlus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>Grant Access</Button>} padded={false}>
          {members.loading ? <Spinner /> : memberProfiles.length ? memberProfiles.map((u) => (
            <div key={u.id} className="flex items-center gap-3 border-b border-neutral-100 px-5 py-3 last:border-0">
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{u.full_name}</p><p className="text-xs text-neutral-500">{u.email}</p></div>
              {u.role && <Badge color="beige">{ROLE_LABELS[u.role]}</Badge>}
              {!u.is_active && <Badge color="red">Inactive</Badge>}
              {u.id !== profile?.id && <Button size="sm" variant="ghost" icon={<UserMinus className="h-4 w-4" />} onClick={() => removeMember(u.id)} aria-label="Remove access" />}
            </div>
          )) : <EmptyState title="No users assigned" />}
          <p className="px-5 py-3 text-xs text-neutral-500">Users only see clubs they are assigned to. Coaches and managers never see confidential medical information.</p>
        </Card>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Grant Club Access" footer={<><Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button><Button onClick={addMember} disabled={!userToAdd}>Grant Access</Button></>}>
        <Field label="User">
          <Select value={userToAdd} onChange={(e) => setUserToAdd(e.target.value)} placeholder="Select user…"
            options={(members.data?.profiles ?? []).filter((p) => !memberProfiles.some((m) => m.id === p.id)).map((p) => ({ value: p.id, label: `${p.full_name} – ${p.role ? ROLE_LABELS[p.role] : 'no role'}` }))} />
        </Field>
      </Modal>
      <ConfirmDialog open={statusConfirm} loading={busy} danger={club.status === 'active'} title={club.status === 'active' ? 'Deactivate club' : 'Activate club'}
        confirmLabel={club.status === 'active' ? 'Deactivate' : 'Activate'}
        message={club.status === 'active' ? 'All records are kept and remain readable, but new players cannot be registered.' : 'The club becomes active again.'}
        onConfirm={toggleStatus} onCancel={() => setStatusConfirm(false)} />
    </div>
  );
}
