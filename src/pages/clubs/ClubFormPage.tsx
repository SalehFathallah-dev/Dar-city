import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Building2, ImagePlus, Phone, Save, Stethoscope } from 'lucide-react';
import * as api from '../../lib/api';
import { useClub } from '../../context/ClubContext';
import { useToast } from '../../context/ToastContext';
import { todayISO } from '../../lib/format';
import type { Club } from '../../lib/types';
import { Button, Field, FormSection, Grid, Input, PageHeader, Select, Spinner, Textarea } from '../../components/ui';
import { ClubLogo } from '../../components/Branding';

const SPORTS = ['Basketball', 'Football', 'Volleyball', 'Handball', 'Athletics', 'Rugby', 'Other'];
const empty = {
  name: '', short_name: '', player_id_prefix: '', country: 'Tanzania', city: '', sport: 'Basketball', competition_category: 'Senior Men', league: '',
  current_season: '', contact_person: '', phone: '', email: '', address: '', medical_notes: '', registration_date: todayISO(), status: 'active' as Club['status'],
};

export default function ClubFormPage({ onCreated }: { onCreated?: (c: Club) => void }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { reload, selectClub } = useClub();
  const [form, setForm] = useState(empty);
  const [existing, setExisting] = useState<Club | null>(null);
  const [logo, setLogo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.getClub(id).then((c) => {
      setExisting(c);
      setForm({ name: c.name, short_name: c.short_name, player_id_prefix: c.player_id_prefix, country: c.country ?? '', city: c.city ?? '', sport: c.sport,
        competition_category: c.competition_category ?? '', league: c.league ?? '', current_season: c.current_season ?? '', contact_person: c.contact_person ?? '',
        phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '', medical_notes: c.medical_notes ?? '', registration_date: c.registration_date, status: c.status });
    }).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, [id, toast]);
  useEffect(() => {
    if (!logo) { setPreview(null); return; }
    const u = URL.createObjectURL(logo); setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [logo]);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const save = async () => {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 2) e.name = 'Official club name is required';
    if (form.short_name.trim().length < 2) e.short_name = 'Short name is required';
    if (form.player_id_prefix && !/^[A-Za-z0-9]{2,6}$/.test(form.player_id_prefix)) e.player_id_prefix = '2–6 letters or digits';
    if (form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) e.email = 'Enter a valid e-mail';
    if (form.phone && !/^[0-9+() -]{6,25}$/.test(form.phone)) e.phone = 'Enter a valid phone number';
    if (logo) { try { await api.validateLogo(logo); } catch (err) { e.logo = (err as Error).message; } }
    setErrors(e);
    if (Object.keys(e).length) { toast.error('Please correct the highlighted fields.'); return; }
    setSaving(true);
    try {
      const saved = await api.saveClub({ id, ...form, player_id_prefix: form.player_id_prefix.toUpperCase() || undefined } as Partial<Club>);
      if (logo) {
        try { await api.uploadClubLogo(saved.id, logo); } catch (err) { toast.error(`Club saved, but the logo upload failed: ${(err as Error).message}`); }
      }
      await reload();
      toast.success(id ? 'Club information updated' : `Club registered (${saved.club_code})`);
      if (onCreated) { selectClub(saved.id); onCreated(saved); return; }
      navigate(`/clubs/${saved.id}`);
    } catch (err) {
      const msg = (err as Error).message;
      toast.error(/clubs_name_unique|duplicate/i.test(msg) ? 'A club with this name or Player ID prefix already exists.' : msg);
    } finally { setSaving(false); }
  };

  if (loading) return <Spinner />;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={id ? 'Edit Club' : 'Register New Club'} subtitle={id ? `${existing?.club_code} · ${existing?.name}` : 'A Club ID is generated automatically'} icon={<Building2 className="h-6 w-6" />} />
      <div className="space-y-4">
        <FormSection title="Club Identity" icon={<Building2 className="h-5 w-5" />}>
          <div className="mb-5 flex flex-wrap items-center gap-4">
            {preview ? <img src={preview} alt="Logo preview" className="h-20 w-20 rounded-xl bg-white object-contain p-1 ring-1 ring-neutral-200" />
              : <ClubLogo logo={existing?.logo_url} name={form.short_name || '?'} size={80} />}
            <div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold hover:border-brand-gold">
                <ImagePlus className="h-4 w-4" /> {logo ? logo.name : 'Upload Club Logo'}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg" className="hidden" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
              </label>
              <p className="mt-1 text-xs text-neutral-400">PNG, JPG, WEBP or SVG (scripts not allowed) · max 2 MB · stored privately. This never changes the medical brand logo.</p>
              {errors.logo && <p className="text-xs text-brand-red">{errors.logo}</p>}
            </div>
          </div>
          <Grid>
            <Field label="Official club name" required error={errors.name} className="sm:col-span-2"><Input value={form.name} onChange={(e) => set('name')(e.target.value)} error={!!errors.name} /></Field>
            <Field label="Short club name" required error={errors.short_name}><Input value={form.short_name} onChange={(e) => set('short_name')(e.target.value)} error={!!errors.short_name} /></Field>
            <Field label="Player ID prefix" error={errors.player_id_prefix} hint={id ? 'Changing it only affects newly registered players' : 'Leave blank to generate from the short name (e.g. KILI-0001)'}>
              <Input value={form.player_id_prefix} onChange={(e) => set('player_id_prefix')(e.target.value.toUpperCase())} maxLength={6} error={!!errors.player_id_prefix} />
            </Field>
            <Field label="Country"><Input value={form.country} onChange={(e) => set('country')(e.target.value)} /></Field>
            <Field label="City"><Input value={form.city} onChange={(e) => set('city')(e.target.value)} /></Field>
            <Field label="Sport"><Select value={form.sport} onChange={(e) => set('sport')(e.target.value)} options={SPORTS} /></Field>
            <Field label="Competition category"><Input value={form.competition_category} onChange={(e) => set('competition_category')(e.target.value)} placeholder="e.g. Senior Men" /></Field>
            <Field label="League / Division"><Input value={form.league} onChange={(e) => set('league')(e.target.value)} /></Field>
            <Field label="Season" hint="Shown on reports; manage detailed seasons in Settings"><Input value={form.current_season} onChange={(e) => set('current_season')(e.target.value)} placeholder="e.g. 2026/2027" /></Field>
            <Field label="Registration date"><Input type="date" value={form.registration_date} onChange={(e) => set('registration_date')(e.target.value)} /></Field>
            <Field label="Club status"><Select value={form.status} onChange={(e) => set('status')(e.target.value)} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} /></Field>
          </Grid>
        </FormSection>
        <FormSection title="Club Contact" icon={<Phone className="h-5 w-5" />}>
          <Grid>
            <Field label="Contact person"><Input value={form.contact_person} onChange={(e) => set('contact_person')(e.target.value)} /></Field>
            <Field label="Phone number" error={errors.phone}><Input type="tel" value={form.phone} onChange={(e) => set('phone')(e.target.value)} error={!!errors.phone} /></Field>
            <Field label="E-mail" error={errors.email}><Input type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} error={!!errors.email} /></Field>
            <Field label="Address"><Input value={form.address} onChange={(e) => set('address')(e.target.value)} /></Field>
          </Grid>
        </FormSection>
        <FormSection title="Medical Department Notes" icon={<Stethoscope className="h-5 w-5" />}>
          <Textarea value={form.medical_notes} onChange={(e) => set('medical_notes')(e.target.value)} placeholder="e.g. Club physiotherapist, preferred imaging centre, insurance details" />
        </FormSection>
        <div className="sticky bottom-20 z-20 flex justify-end gap-2 rounded-2xl border border-neutral-200 bg-white/95 p-3 shadow-lg backdrop-blur lg:bottom-4">
          {!onCreated && <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>}
          <Button icon={<Save className="h-4 w-4" />} loading={saving} onClick={save}>{id ? 'Save Changes' : 'Register Club'}</Button>
        </div>
      </div>
    </div>
  );
}
