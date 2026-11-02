import { useState } from 'react';
import { CalendarRange, Plus, Settings, ShieldCheck, UserPlus, Users } from 'lucide-react';
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
  const [tab, setTab] = useState<'users' | 'seasons' | 'settings' | 'security'>(caps.manageUsers ? 'users' : 'seasons');
  const tabs = [
    ...(caps.manageUsers ? [{ id: 'users' as const, label: 'Users & Roles' }] : []),
    { id: 'seasons' as const, label: 'Seasons' },
    ...(caps.manageSettings ? [{ id: 'settings' as const, label: 'Application Settings' }] : []),
    { id: 'security' as const, label: 'Security & Backup' },
  ];
  return (
    <div className="space-y-4">
      <PageHeader title="Settings & Users" subtitle="Users, access permissions, seasons and application settings" icon={<Settings className="h-6 w-6" />} />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'users' && caps.manageUsers && <UsersTab />}
      {tab === 'seasons' && <SeasonsTab />}
      {tab === 'settings' && caps.manageSettings && <SettingsTab />}
      {tab === 'security' && <SecurityTab />}
    </div>
  );
}

function UsersTab() {
  const { profile: me } = useAuth();
  const toast = useToast();
  const users = useAsync(() => api.listProfiles(), []);
  const [edit, setEdit] = useState<Profile | null>(null);
  const [create, setCreate] = useState(false);
  return (
    <Card title="User Accounts" actions={<Button size="sm" icon={<UserPlus className="h-4 w-4" />} onClick={() => setCreate(true)}>Create User</Button>} padded={false}>
      {users.loading ? <Spinner /> : users.error ? <ErrorBlock message={users.error} /> : (
        <div className="px-5"><Table headers={['Name', 'E-mail', 'Role', 'Status', 'Created', '']}>
          {(users.data ?? []).map((u) => (
            <tr key={u.id}>
              <Td className="font-semibold">{u.full_name}{u.title && <span className="block text-xs font-normal text-neutral-500">{u.title}</span>}</Td>
              <Td>{u.email}</Td>
              <Td>{u.role ? <Badge color={u.role === 'team_physician' ? 'orange' : u.role === 'super_admin' ? 'purple' : 'beige'}>{ROLE_LABELS[u.role]}</Badge> : <Badge color="blue">No role</Badge>}</Td>
              <Td>{u.is_active ? <Badge color="green">Active</Badge> : <Badge color="red">Inactive / pending</Badge>}</Td>
              <Td>{formatDate(u.created_at)}</Td>
              <Td>{u.id !== me?.id && <Button size="sm" variant="ghost" onClick={() => setEdit(u)}>Manage</Button>}</Td>
            </tr>
          ))}
        </Table></div>
      )}
      {edit && <EditUserModal user={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); toast.success('User updated'); void users.reload(); }} />}
      {create && <CreateUserModal onClose={() => setCreate(false)} onSaved={() => { setCreate(false); void users.reload(); }} />}
    </Card>
  );
}

function EditUserModal({ user, onClose, onSaved }: { user: Profile; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ full_name: user.full_name, title: user.title ?? '', role: user.role ?? '', is_active: user.is_active });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (f.is_active && !f.role) return toast.error('Assign a role before activating the account');
    setSaving(true);
    try { await api.updateProfile(user.id, { full_name: f.full_name, title: f.title, role: (f.role || null) as AppRole | null, is_active: f.is_active }); onSaved(); }
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
      </div>
    </Modal>
  );
}

function CreateUserModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ email: '', full_name: '', title: '', role: 'head_coach', password: '' });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) return toast.error('Enter a valid e-mail');
    if (f.full_name.trim().length < 2) return toast.error('Enter the full name');
    if (f.password.length < 10 || !/[A-Z]/.test(f.password) || !/[0-9]/.test(f.password)) return toast.error('Temporary password: at least 10 characters with an upper-case letter and a number');
    setSaving(true);
    try { await api.adminCreateUser(f); toast.success('User created. Share the temporary password securely and ask them to change it.'); onSaved(); }
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
      </div>
    </Modal>
  );
}

function SeasonsTab() {
  const { seasons, reload } = useReference();
  const toast = useToast();
  const [edit, setEdit] = useState<Partial<Season> | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!edit?.name || !edit.start_date || !edit.end_date) return toast.error('Name, start and end dates are required');
    if (edit.end_date <= edit.start_date) return toast.error('End date must be after start date');
    setSaving(true);
    try { await api.saveSeason(edit); toast.success('Season saved'); setEdit(null); await reload(); }
    catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <Card title="Team Seasons" actions={<Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ name: '', start_date: '', end_date: '', is_current: !seasons.length })}>Add Season</Button>} padded={false}>
      <div className="px-5"><Table headers={['Season', 'Start', 'End', 'Current', '']} empty={!seasons.length}>
        {seasons.map((s) => (
          <tr key={s.id}><Td className="font-semibold"><CalendarRange className="mr-2 inline h-4 w-4 text-brand-orange" />{s.name}</Td><Td>{formatDate(s.start_date)}</Td><Td>{formatDate(s.end_date)}</Td>
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
