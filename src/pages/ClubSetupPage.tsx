import { useState } from 'react';
import { Layers, Pencil, Plus, Trash2, Users } from 'lucide-react';
import * as api from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { useClub } from '../context/ClubContext';
import { useToast } from '../context/ToastContext';
import { ROLE_LABELS } from '../lib/constants';
import type { ClubCategory, StaffMember } from '../lib/types';
import { Badge, Button, Card, Checkbox, EmptyState, ErrorBlock, Field, Grid, Input, Modal, PageHeader, Select, Spinner, Table, Td, Textarea } from '../components/ui';

const STAFF_ROLES: StaffMember['app_role'][] = ['head_coach', 'team_manager', 'assistant_medical_staff'];
const ROLE_HINT: Record<StaffMember['app_role'], string> = {
  head_coach: 'Coaches: availability, team status, recovery progress (no diagnoses)',
  team_manager: 'Managers: registration info, availability, team status',
  assistant_medical_staff: 'Medical team (physio, nurse): medical records, follow-ups, rehab sessions',
};

/** Physician: age categories and the staff register of the current club. */
export default function ClubSetupPage() {
  const { club } = useClub();
  return (
    <div className="space-y-4">
      <PageHeader title="Categories & Staff" subtitle={`${club?.name ?? ''} – age categories and staff register (staff can then create an account and choose their name)`} icon={<Layers className="h-6 w-6" />} />
      <div className="grid gap-4 xl:grid-cols-[1fr_2fr]">
        <CategoriesCard />
        <StaffCard />
      </div>
    </div>
  );
}

function CategoriesCard() {
  const toast = useToast();
  const list = useAsync(() => api.listCategories(), []);
  const [edit, setEdit] = useState<Partial<ClubCategory> | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!edit?.name?.trim()) return toast.error('Enter the category name');
    setSaving(true);
    try { await api.saveCategory(edit); setEdit(null); void list.reload(); toast.success('Category saved'); }
    catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  const remove = async (c: ClubCategory) => {
    try { await api.deleteCategory(c.id); void list.reload(); toast.success('Category removed'); } catch (e) { toast.error((e as Error).message); }
  };
  const rows = list.data ?? [];
  return (
    <Card title={<span className="flex items-center gap-2"><Layers className="h-5 w-5 text-brand-gold" /> Age categories</span>}
      actions={<Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ name: '', sort_order: rows.length + 1, is_active: true })}>Add</Button>}>
      {list.loading ? <Spinner /> : list.error ? <ErrorBlock message={list.error} /> : rows.length === 0 ? (
        <EmptyState title="No categories yet" description="e.g. U14, U16, U18, First Team" />
      ) : (
        <ul className="divide-y divide-neutral-100">
          {rows.map((c) => (
            <li key={c.id} className="flex items-center gap-2 py-2">
              <span className="flex-1 font-semibold">{c.name}</span>{!c.is_active && <Badge color="gray">Hidden</Badge>}
              <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(c)}>Edit</Button>
              <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => void remove(c)} aria-label="Delete" />
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit category' : 'New category'}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button loading={saving} onClick={save}>Save</Button></>}>
        <div className="space-y-4">
          <Field label="Name" required hint="Renaming also renames it on the players"><Input value={edit?.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="U18" /></Field>
          <Field label="Order"><Input type="number" value={edit?.sort_order ?? 0} onChange={(e) => setEdit({ ...edit, sort_order: Number(e.target.value) })} /></Field>
          <Checkbox label="Active" checked={edit?.is_active ?? true} onChange={(v) => setEdit({ ...edit, is_active: v })} description="Inactive categories are hidden from new registrations." />
        </div>
      </Modal>
    </Card>
  );
}

function StaffCard() {
  const toast = useToast();
  const list = useAsync(() => api.listStaff(), []);
  const cats = useAsync(() => api.listCategories(), []);
  const [edit, setEdit] = useState<Partial<StaffMember> | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!edit?.full_name || edit.full_name.trim().length < 2) return toast.error('Enter the full name');
    setSaving(true);
    try { await api.saveStaff(edit); setEdit(null); void list.reload(); toast.success('Staff member saved'); }
    catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  const rows = list.data ?? [];
  return (
    <Card title={<span className="flex items-center gap-2"><Users className="h-5 w-5 text-brand-gold" /> Staff register</span>} padded={false}
      actions={<Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => { void cats.reload(); setEdit({ app_role: 'head_coach', is_active: true }); }}>Add staff</Button>}>
      {list.loading ? <Spinner /> : list.error ? <ErrorBlock message={list.error} /> : rows.length === 0 ? (
        <div className="p-5"><EmptyState title="No staff yet" description="Add coaches, managers, physiotherapists… They can then create an account in the app, choose their name and you approve them." /></div>
      ) : (
        <div className="px-5"><Table headers={['Name', 'Access', 'Category', 'App account', '']}>
          {rows.map((s) => (
            <tr key={s.id} className={s.is_active ? '' : 'opacity-50'}>
              <Td><p className="font-semibold">{s.full_name}</p><p className="text-xs text-neutral-500">{s.title}</p></Td>
              <Td><Badge color={s.app_role === 'assistant_medical_staff' ? 'orange' : 'beige'}>{ROLE_LABELS[s.app_role]}</Badge></Td>
              <Td>{s.category ?? 'All'}</Td>
              <Td>{s.profile_id ? <Badge color="green">Linked</Badge> : <span className="text-xs text-neutral-500">Not registered yet</span>}</Td>
              <Td><Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => { void cats.reload(); setEdit(s); }}>Edit</Button></Td>
            </tr>
          ))}
        </Table></div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit staff member' : 'New staff member'} size="lg"
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button loading={saving} onClick={save}>Save</Button></>}>
        {edit && (
          <div className="space-y-4">
            <Grid>
              <Field label="Full name" required><Input value={edit.full_name ?? ''} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} /></Field>
              <Field label="Job title"><Input value={edit.title ?? ''} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="e.g. Fitness coach, Physiotherapist" /></Field>
              <Field label="App access" required hint={ROLE_HINT[edit.app_role ?? 'head_coach']}>
                <Select value={edit.app_role} onChange={(e) => setEdit({ ...edit, app_role: e.target.value as StaffMember['app_role'] })} options={STAFF_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
              </Field>
              <Field label="Category"><Select value={edit.category ?? ''} onChange={(e) => setEdit({ ...edit, category: e.target.value || null })} options={(cats.data ?? []).map((c) => c.name)} placeholder="All categories" /></Field>
              <Field label="Phone"><Input type="tel" value={edit.phone ?? ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
              <Field label="E-mail"><Input type="email" value={edit.email ?? ''} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
            </Grid>
            <Field label="Notes"><Textarea rows={2} value={edit.notes ?? ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
            {edit.id && <Checkbox label="Active" checked={!!edit.is_active} onChange={(v) => setEdit({ ...edit, is_active: v })} description="Inactive staff cannot be chosen when registering." />}
          </div>
        )}
      </Modal>
    </Card>
  );
}
