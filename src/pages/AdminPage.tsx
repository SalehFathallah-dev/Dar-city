import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, CalendarRange, Plus, Settings, ShieldCheck, Stethoscope, UserPlus, Users } from 'lucide-react';
import { useClub } from '../context/ClubContext';
import { useBrand } from '../context/BrandContext';
import { BrandLogo, ClubLogo } from '../components/Branding';
import { ImagePicker } from '../components/ImagePicker';
import * as api from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useReference } from '../context/ReferenceContext';
import { useToast } from '../context/ToastContext';
import { ROLE_LABELS, type AppRole } from '../lib/constants';
import { formatDate, formatDateTime } from '../lib/format';
import type { Profile, Season } from '../lib/types';
import { Badge, Button, Card, Checkbox, ErrorBlock, Field, Grid, Input, Modal, PageHeader, Select, Spinner, Table, Tabs, Td, Textarea } from '../components/ui';

const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as AppRole[]).map((r) => ({ value: r, label: ROLE_LABELS[r] }));

export default function AdminPage() {
  const { caps } = useAuth();
  const [tab, setTab] = useState<'brand' | 'club' | 'users' | 'settings' | 'security'>(caps.manageBrand ? 'brand' : 'club');
  const tabs = [
    ...(caps.manageBrand ? [{ id: 'brand' as const, label: 'Medical Brand' }] : []),
    { id: 'club' as const, label: 'Club Settings' },
    ...(caps.manageUsers ? [{ id: 'users' as const, label: 'Users & Roles' }] : []),
    ...(caps.manageSettings ? [{ id: 'settings' as const, label: 'Application Settings' }] : []),
    { id: 'security' as const, label: 'Security & Backup' },
  ];
  return (
    <div className="space-y-4">
      <PageHeader title="Application Settings" subtitle="Medical brand, clubs, seasons, users and access permissions" icon={<Settings className="h-6 w-6" />} />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'brand' && caps.manageBrand && <BrandTab />}
      {tab === 'club' && <ClubSettingsTab />}
      {tab === 'users' && caps.manageUsers && <UsersTab />}
      {tab === 'settings' && caps.manageSettings && <SettingsTab />}
      {tab === 'security' && <SecurityTab />}
    </div>
  );
}

function UsersTab() {
  const { profile: me } = useAuth();
  const toast = useToast();
  const users = useAsync(() => api.listProfiles(), []);
  const members = useAsync(() => api.listClubMembers(), []);
  const { clubs } = useClub();
  const clubsOf = (uid: string) => (members.data ?? []).filter((m) => m.user_id === uid).map((m) => clubs.find((c) => c.id === m.club_id)?.short_name).filter(Boolean);
  const [edit, setEdit] = useState<Profile | null>(null);
  const [create, setCreate] = useState(false);
  return (
    <Card title="User Accounts" actions={<Button size="sm" icon={<UserPlus className="h-4 w-4" />} onClick={() => setCreate(true)}>Create User</Button>} padded={false}>
      {users.loading ? <Spinner /> : users.error ? <ErrorBlock message={users.error} /> : (
        <div className="px-5"><Table headers={['Name', 'E-mail', 'Role', 'Clubs', 'Status', 'Created', '']}>
          {(users.data ?? []).map((u) => (
            <tr key={u.id}>
              <Td className="font-semibold">{u.full_name}{u.title && <span className="block text-xs font-normal text-neutral-500">{u.title}</span>}</Td>
              <Td>{u.email}</Td>
              <Td>{u.role ? <Badge color={u.role === 'team_physician' ? 'orange' : u.role === 'super_admin' ? 'purple' : 'beige'}>{ROLE_LABELS[u.role]}</Badge> : <Badge color="blue">No role</Badge>}</Td>
              <Td className="text-xs">{u.role === 'super_admin' ? 'All clubs' : clubsOf(u.id).join(', ') || <span className="text-brand-red">None</span>}</Td>
              <Td>{u.is_active ? <Badge color="green">Active</Badge> : <Badge color="red">Inactive / pending</Badge>}</Td>
              <Td>{formatDate(u.created_at)}</Td>
              <Td>{u.id !== me?.id && <Button size="sm" variant="ghost" onClick={() => setEdit(u)}>Manage</Button>}</Td>
            </tr>
          ))}
        </Table></div>
      )}
      {edit && <EditUserModal user={edit} memberOf={(members.data ?? []).filter((m) => m.user_id === edit.id).map((m) => m.club_id)} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); toast.success('User updated'); void users.reload(); void members.reload(); }} />}
      {create && <CreateUserModal onClose={() => setCreate(false)} onSaved={() => { setCreate(false); void users.reload(); void members.reload(); }} />}
    </Card>
  );
}

function EditUserModal({ user, memberOf, onClose, onSaved }: { user: Profile; memberOf: string[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { clubs } = useClub();
  const [f, setF] = useState({ full_name: user.full_name, title: user.title ?? '', role: user.role ?? '', is_active: user.is_active });
  const [clubIds, setClubIds] = useState<string[]>(memberOf);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (f.is_active && !f.role) return toast.error('Assign a role before activating the account');
    setSaving(true);
    try {
      await api.updateProfile(user.id, { full_name: f.full_name, title: f.title, role: (f.role || null) as AppRole | null, is_active: f.is_active });
      for (const c of clubIds.filter((c) => !memberOf.includes(c))) await api.addClubMember(c, user.id);
      for (const c of memberOf.filter((c) => !clubIds.includes(c))) await api.removeClubMember(c, user.id);
      onSaved();
    }
    catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} title="Manage User" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-neutral-500">{user.email}</p>
        <Field label="Full name"><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Role"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} options={ROLE_OPTIONS} placeholder="No role" /></Field>
        <Checkbox label="Account active" checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} description="Inactive accounts cannot access any data." />
        {f.role !== 'super_admin' && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-600">Club access</p>
            <div className="grid gap-2">
              {clubs.map((c) => (
                <Checkbox key={c.id} label={c.name} checked={clubIds.includes(c.id)} onChange={(v) => setClubIds(v ? [...clubIds, c.id] : clubIds.filter((x) => x !== c.id))} />
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function CreateUserModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { clubs, clubId } = useClub();
  const [f, setF] = useState({ email: '', full_name: '', title: '', role: 'head_coach', password: '' });
  const [clubIds, setClubIds] = useState<string[]>(clubId ? [clubId] : []);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) return toast.error('Enter a valid e-mail');
    if (f.full_name.trim().length < 2) return toast.error('Enter the full name');
    if (f.password.length < 10 || !/[A-Z]/.test(f.password) || !/[0-9]/.test(f.password)) return toast.error('Temporary password: at least 10 characters with an upper-case letter and a number');
    setSaving(true);
    try { await api.adminCreateUser({ ...f, club_ids: clubIds }); toast.success('User created. Share the temporary password securely and ask them to change it.'); onSaved(); }
    catch (e) { toast.error(`${(e as Error).message}. If the "admin-users" Edge Function is not deployed, create the user in the Supabase dashboard and assign the role here.`); }
    finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} title="Create User" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={save}>Create</Button></>}>
      <div className="space-y-4">
        <Field label="E-mail" required><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Full name" required><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Role" required><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} options={ROLE_OPTIONS} /></Field>
        <Field label="Temporary password" required><Input type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        {f.role !== 'super_admin' && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-600">Club access</p>
            <div className="grid gap-2">{clubs.map((c) => <Checkbox key={c.id} label={c.name} checked={clubIds.includes(c.id)} onChange={(v) => setClubIds(v ? [...clubIds, c.id] : clubIds.filter((x) => x !== c.id))} />)}</div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function SeasonsTab() {
  const { seasons, reload } = useReference();
  const { reload: reloadClubs } = useClub();
  const toast = useToast();
  const [edit, setEdit] = useState<Partial<Season> | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!edit?.name || !edit.start_date || !edit.end_date) return toast.error('Name, start and end dates are required');
    if (edit.end_date <= edit.start_date) return toast.error('End date must be after start date');
    setSaving(true);
    try { await api.saveSeason(edit); toast.success('Season saved'); setEdit(null); await reload(); await reloadClubs(); }
    catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <Card title={`Seasons – ${useClub().club?.short_name ?? ''}`} actions={<Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ name: '', start_date: '', end_date: '', is_current: !seasons.length })}>Add Season</Button>} padded={false}>
      <div className="px-5"><Table headers={['Season', 'Start', 'End', 'Current', '']} empty={!seasons.length}>
        {seasons.map((s) => (
          <tr key={s.id}><Td className="font-semibold"><CalendarRange className="mr-2 inline h-4 w-4 text-brand-gold" />{s.name}</Td><Td>{formatDate(s.start_date)}</Td><Td>{formatDate(s.end_date)}</Td>
            <Td>{s.is_current && <Badge color="green">Current</Badge>}</Td><Td><Button size="sm" variant="ghost" onClick={() => setEdit(s)}>Edit</Button></Td></tr>
        ))}
      </Table></div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit Season' : 'Add Season'} footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button loading={saving} onClick={save}>Save</Button></>}>
        {edit && <div className="space-y-4">
          <Field label="Season name" required hint="e.g. 2026/2027"><Input value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Grid><Field label="Start date" required><Input type="date" value={edit.start_date ?? ''} onChange={(e) => setEdit({ ...edit, start_date: e.target.value })} /></Field>
            <Field label="End date" required><Input type="date" value={edit.end_date ?? ''} onChange={(e) => setEdit({ ...edit, end_date: e.target.value })} /></Field></Grid>
          <Checkbox label="Current season" checked={!!edit.is_current} onChange={(v) => setEdit({ ...edit, is_current: v })} />
          <Field label="Notes"><Textarea rows={2} value={edit.notes ?? ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
        </div>}
      </Modal>
    </Card>
  );
}

function SettingsTab() {
  const toast = useToast();
  const rows = useAsync(() => api.listSettingsRows(), []);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  if (rows.loading) return <Spinner />;
  if (rows.error) return <ErrorBlock message={rows.error} />;
  return (
    <Card title="Application Settings">
      <div className="space-y-4">
        {(rows.data ?? []).map((r) => {
          const v = values[r.key] ?? String(r.value ?? '');
          return (
            <div key={r.key} className="flex flex-wrap items-end gap-3">
              <Field label={r.description ?? r.key} className="min-w-[16rem] flex-1"><Input value={v} onChange={(e) => setValues({ ...values, [r.key]: e.target.value })} /></Field>
              <Button variant="secondary" loading={saving === r.key} disabled={v === String(r.value ?? '') || !v.trim()} onClick={async () => {
                setSaving(r.key);
                try { await api.saveSetting(r.key, v.trim()); toast.success('Setting saved'); void rows.reload(); } catch (e) { toast.error((e as Error).message); } finally { setSaving(null); }
              }}>Save</Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function SecurityTab() {
  const { profile } = useAuth();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Access Control Model">
        <ul className="space-y-2 text-sm text-neutral-700">
          <li className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />Every table is protected by PostgreSQL Row Level Security – permissions are enforced by the database, not the browser.</li>
          <li className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />Team Physician: full clinical access. Assistant Medical Staff: read + add follow-ups, treatments, rehab sessions and documents.</li>
          <li className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />Team Manager & Head Coach: roster and approved availability only (no diagnoses, medications or clinical notes).</li>
          <li className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />Documents and photos are in private storage buckets and opened through short-lived signed links.</li>
          <li className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />All changes are recorded in the audit log with previous and updated values. Sessions end after 30 minutes of inactivity.</li>
        </ul>
      </Card>
      <Card title="Backup Strategy">
        <ul className="space-y-2 text-sm text-neutral-700">
          <li><b>Automatic:</b> Supabase performs daily database backups (Point-in-Time Recovery is available on paid plans).</li>
          <li><b>Manual:</b> The Team Physician can download a full JSON backup from the Export Center.</li>
          <li><b>Records are archived, not deleted:</b> players, examinations, injuries and documents are archived and remain recoverable.</li>
        </ul>
        <p className="mt-4 text-xs text-neutral-500">Signed in as {profile?.full_name} · {formatDateTime(new Date().toISOString())}</p>
      </Card>
      <Card title="Users and roles" className="lg:col-span-2"><p className="text-sm text-neutral-600"><Users className="mr-2 inline h-4 w-4" />New accounts are inactive with no role until a Super Administrator approves them. Users cannot change their own role.</p></Card>
    </div>
  );
}

function BrandTab() {
  const toast = useToast();
  const { brand, signatureUrl, reload } = useBrand();
  const [f, setF] = useState({ name: brand.name, specialty: brand.specialty, contact: brand.contact });
  const [logo, setLogo] = useState<File | null>(null);
  const [sig, setSig] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (f.name.trim().length < 2 || f.specialty.trim().length < 2) return toast.error('Physician name and specialty are required');
    setSaving(true);
    try {
      const patch: Record<string, string> = { name: f.name.trim(), specialty: f.specialty.trim(), contact: f.contact.trim() };
      if (logo) patch.logoPath = await api.uploadBrandAsset('logo', logo);
      if (sig) patch.signaturePath = await api.uploadBrandAsset('signature', sig);
      await api.saveBrand(patch);
      await reload();
      setLogo(null); setSig(null);
      toast.success('Medical brand updated');
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  const resetLogo = async () => {
    try { await api.saveBrand({ logoPath: '' }); await reload(); toast.success('Official default logo restored'); } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Medical Brand Identity" className="lg:col-span-2">
        <p className="mb-4 rounded-lg bg-brand-cream p-3 text-xs text-neutral-700">The medical brand is the primary identity of the application and every report. It is controlled separately from club settings – changing a club logo never changes it.</p>
        <div className="space-y-4">
          <Grid>
            <Field label="Physician name" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Specialty" required><Input value={f.specialty} onChange={(e) => setF({ ...f, specialty: e.target.value })} /></Field>
          </Grid>
          <Field label="Contact information" hint="Printed under the brand name on reports"><Textarea rows={2} value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} placeholder="Phone · E-mail · Address" /></Field>
          <ImagePicker kind="logo" value={logo} onChange={setLogo} label="Personal medical logo"
            current={<div className="flex h-20 w-28 items-center justify-center rounded-xl bg-brand-cream p-1"><BrandLogo height={60} /></div>}
            hint="Choose from the gallery – PNG, JPG, WEBP or SVG." />
          <ImagePicker kind="signature" value={sig} onChange={setSig} label="Signature image (optional)"
            current={signatureUrl ? <img src={signatureUrl} alt="Signature" className="h-20 w-28 rounded-xl bg-white object-contain p-1 ring-1 ring-neutral-200" /> : <div className="flex h-20 w-28 items-center justify-center rounded-xl border border-dashed border-neutral-300 text-xs text-neutral-400">No signature</div>}
            hint="Photograph your signature on white paper, or choose it from the gallery." />
          <div className="flex flex-wrap justify-end gap-2">
            {brand.logoPath && <Button variant="ghost" onClick={resetLogo}>Restore official logo</Button>}
            {brand.signaturePath && <Button variant="ghost" onClick={async () => { await api.saveBrand({ signaturePath: '' }); await reload(); }}>Remove signature</Button>}
            <Button loading={saving} onClick={save}>Save Medical Brand</Button>
          </div>
        </div>
      </Card>
      <Card title="Preview">
        <div className="rounded-xl bg-brand-cream p-4"><BrandLogo height={90} className="mx-auto" /></div>
        <p className="mt-3 text-center font-display text-lg font-bold uppercase text-brand-navy">{brand.name}</p>
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-brand-gold">{brand.specialty}</p>
        {brand.contact && <p className="mt-1 whitespace-pre-wrap text-center text-xs text-neutral-500">{brand.contact}</p>}
        {signatureUrl && <img src={signatureUrl} alt="Signature" className="mx-auto mt-4 h-12 object-contain" />}
        <p className="mt-4 flex items-center justify-center gap-2 text-xs text-neutral-400"><Stethoscope className="h-4 w-4" />Shown on every page and report</p>
      </Card>
    </div>
  );
}

function ClubSettingsTab() {
  const { club, clubs } = useClub();
  const { caps } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      {club && (
        <Card title="Current Club" actions={<Button size="sm" variant="secondary" icon={<Building2 className="h-4 w-4" />} onClick={() => navigate('/clubs')}>All clubs ({clubs.length})</Button>}>
          <div className="flex flex-wrap items-center gap-4">
            <ClubLogo logo={club.logo_url} name={club.short_name} size={64} />
            <div className="min-w-0 flex-1"><p className="font-semibold text-brand-navy">{club.name}</p><p className="text-xs text-neutral-500">{club.club_code} · {[club.city, club.country].filter(Boolean).join(', ')} · {club.status}</p></div>
            <div className="flex flex-wrap gap-2">
              {caps.manageClubs && <Button size="sm" variant="secondary" onClick={() => navigate(`/clubs/${club.id}/edit`)}>Edit club / logo</Button>}
              <Button size="sm" variant="secondary" onClick={() => navigate(`/clubs/${club.id}`)}>Club users & status</Button>
              {caps.manageClubs && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/clubs/new')}>Add club</Button>}
            </div>
          </div>
        </Card>
      )}
      <SeasonsTab />
    </div>
  );
}
