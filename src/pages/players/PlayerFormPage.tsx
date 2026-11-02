import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Camera, Contact, Dumbbell, Save, User } from 'lucide-react';
import * as api from '../../lib/api';
import { useReference } from '../../context/ReferenceContext';
import { useToast } from '../../context/ToastContext';
import { DOMINANT_HANDS, MAX_PHOTO_BYTES, POSITIONS } from '../../lib/constants';
import { bmiCategory, calculateAge, calculateBMI, todayISO } from '../../lib/format';
import type { EmergencyContact, Player } from '../../lib/types';
import { Button, Field, FormSection, Grid, Input, PageHeader, PlayerAvatar, SegmentedControl, Select, Spinner, Textarea } from '../../components/ui';

type Form = {
  full_name: string; date_of_birth: string; nationality: string; phone: string; email: string; address: string;
  jersey_number: string; position: string; height_cm: string; weight_kg: string; dominant_hand: string;
  team_category: string; registration_date: string; season_id: string; status: Player['status'];
};
const empty: Form = { full_name: '', date_of_birth: '', nationality: 'Tanzanian', phone: '', email: '', address: '', jersey_number: '', position: '', height_cm: '', weight_kg: '', dominant_hand: 'Right', team_category: 'Senior Men', registration_date: todayISO(), season_id: '', status: 'active' };

export function validatePlayer(f: Form, players: Player[], id?: string) {
  const e: Record<string, string> = {};
  if (f.full_name.trim().length < 2) e.full_name = 'Full name is required';
  if (!f.date_of_birth) e.date_of_birth = 'Date of birth is required';
  else { const age = calculateAge(f.date_of_birth); if (age === null || age < 10 || age > 70) e.date_of_birth = 'Enter a valid date of birth'; }
  if (!f.position) e.position = 'Select a playing position';
  if (f.jersey_number !== '') {
    const n = Number(f.jersey_number);
    if (!Number.isInteger(n) || n < 0 || n > 99) e.jersey_number = 'Jersey number must be 0–99';
    else if (f.status === 'active' && players.some((p) => p.id !== id && p.status === 'active' && p.team_category === f.team_category && p.jersey_number === n)) {
      e.jersey_number = `#${n} is already used by an active player`;
    }
  }
  if (f.height_cm && (Number(f.height_cm) < 120 || Number(f.height_cm) > 250)) e.height_cm = 'Height must be 120–250 cm';
  if (f.weight_kg && (Number(f.weight_kg) < 35 || Number(f.weight_kg) > 200)) e.weight_kg = 'Weight must be 35–200 kg';
  if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) e.email = 'Enter a valid e-mail address';
  if (f.phone && !/^[0-9+() -]{6,25}$/.test(f.phone)) e.phone = 'Enter a valid phone number';
  return e;
}

export default function PlayerFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { players, seasons, currentSeason, reload } = useReference();
  const [form, setForm] = useState<Form>(empty);
  const [contact, setContact] = useState<Partial<EmergencyContact>>({ contact_name: '', relationship: '', phone: '' });
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) { setForm((f) => ({ ...f, season_id: currentSeason?.id ?? '' })); return; }
    (async () => {
      try {
        const [p, contacts] = await Promise.all([api.getPlayer(id), api.listContacts(id)]);
        setForm({
          full_name: p.full_name, date_of_birth: p.date_of_birth, nationality: p.nationality ?? '', phone: p.phone ?? '', email: p.email ?? '', address: p.address ?? '',
          jersey_number: p.jersey_number?.toString() ?? '', position: p.position, height_cm: p.height_cm?.toString() ?? '', weight_kg: p.weight_kg?.toString() ?? '',
          dominant_hand: p.dominant_hand ?? '', team_category: p.team_category, registration_date: p.registration_date, season_id: p.season_id ?? '', status: p.status,
        });
        setPhotoPath(p.photo_path);
        if (contacts[0]) setContact(contacts[0]);
      } catch (e) { toast.error((e as Error).message); } finally { setLoading(false); }
    })();
  }, [id, currentSeason?.id, toast]);

  const set = (k: keyof Form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const bmi = calculateBMI(Number(form.height_cm) || null, Number(form.weight_kg) || null);

  const save = async () => {
    const e = validatePlayer(form, players, id);
    if (contact.phone && !/^[0-9+() -]{6,25}$/.test(contact.phone)) e.contact_phone = 'Enter a valid phone number';
    if (contact.contact_name && !contact.phone) e.contact_phone = 'Phone is required for the emergency contact';
    if (photo && photo.size > MAX_PHOTO_BYTES) e.photo = 'Photo must be under 5 MB';
    setErrors(e);
    if (Object.keys(e).length) { toast.error('Please correct the highlighted fields.'); return; }
    setSaving(true);
    try {
      const saved = await api.savePlayer({
        id, ...form,
        jersey_number: form.jersey_number === '' ? null : Number(form.jersey_number),
        height_cm: form.height_cm ? Number(form.height_cm) : null, weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
        season_id: form.season_id || null, dominant_hand: form.dominant_hand || null,
      } as Partial<Player>);
      if (contact.contact_name && contact.phone) await api.saveContact({ ...contact, player_id: saved.id, is_primary: true });
      if (photo) {
        try { await api.uploadPlayerPhoto(saved.id, photo); } catch (err) { toast.error(`Player saved, but photo upload failed: ${(err as Error).message}`); }
      }
      await reload();
      toast.success(id ? 'Player information updated' : `Player registered with ID ${saved.player_code}`);
      navigate(`/players/${saved.id}`);
    } catch (err) { toast.error((err as Error).message); } finally { setSaving(false); }
  };

  if (loading) return <Spinner />;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={id ? 'Edit Player' : 'Add New Player'} subtitle={id ? form.full_name : 'A unique Player ID is generated automatically'} icon={<User className="h-6 w-6" />} />
      <div className="space-y-4">
        <FormSection title="Personal Information" icon={<User className="h-5 w-5" />}>
          <div className="mb-5 flex items-center gap-4">
            <PlayerAvatar name={form.full_name || '?'} photoPath={photo ? null : photoPath} size={72} />
            <div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold hover:border-brand-orange">
                <Camera className="h-4 w-4" /> {photo ? photo.name : 'Player Photograph'}
                <input type="file" accept="image/jpeg,image/png,image/webp" capture="user" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
              </label>
              <p className="mt-1 text-xs text-neutral-400">JPG/PNG/WEBP up to 5 MB. Stored privately.</p>
              {errors.photo && <p className="text-xs text-brand-red">{errors.photo}</p>}
            </div>
          </div>
          <Grid>
            <Field label="Full Name" required error={errors.full_name} className="sm:col-span-2"><Input value={form.full_name} onChange={(e) => set('full_name')(e.target.value)} error={!!errors.full_name} /></Field>
            <Field label="Date of Birth" required error={errors.date_of_birth} hint={form.date_of_birth ? `Age: ${calculateAge(form.date_of_birth) ?? '—'} years` : undefined}>
              <Input type="date" value={form.date_of_birth} onChange={(e) => set('date_of_birth')(e.target.value)} error={!!errors.date_of_birth} max={todayISO()} />
            </Field>
            <Field label="Nationality"><Input value={form.nationality} onChange={(e) => set('nationality')(e.target.value)} /></Field>
            <Field label="Phone Number" error={errors.phone}><Input type="tel" value={form.phone} onChange={(e) => set('phone')(e.target.value)} placeholder="+255 …" error={!!errors.phone} /></Field>
            <Field label="Email Address" error={errors.email}><Input type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} error={!!errors.email} /></Field>
            <Field label="Residential Address" className="sm:col-span-2"><Textarea rows={2} value={form.address} onChange={(e) => set('address')(e.target.value)} /></Field>
          </Grid>
        </FormSection>
        <FormSection title="Emergency Contact" icon={<Contact className="h-5 w-5" />}>
          <Grid cols={3}>
            <Field label="Contact Name"><Input value={contact.contact_name ?? ''} onChange={(e) => setContact({ ...contact, contact_name: e.target.value })} /></Field>
            <Field label="Relationship"><Input value={contact.relationship ?? ''} onChange={(e) => setContact({ ...contact, relationship: e.target.value })} placeholder="e.g. Mother" /></Field>
            <Field label="Contact Phone" error={errors.contact_phone}><Input type="tel" value={contact.phone ?? ''} onChange={(e) => setContact({ ...contact, phone: e.target.value })} error={!!errors.contact_phone} /></Field>
          </Grid>
        </FormSection>
        <FormSection title="Basketball Information" icon={<Dumbbell className="h-5 w-5" />}>
          <Grid>
            <Field label="Jersey Number" error={errors.jersey_number}><Input type="number" inputMode="numeric" min={0} max={99} value={form.jersey_number} onChange={(e) => set('jersey_number')(e.target.value)} error={!!errors.jersey_number} /></Field>
            <Field label="Team Category"><Input value={form.team_category} onChange={(e) => set('team_category')(e.target.value)} /></Field>
            <Field label="Playing Position" required error={errors.position} className="sm:col-span-2"><SegmentedControl value={form.position} options={POSITIONS} onChange={set('position')} /></Field>
            <Field label="Height (cm)" error={errors.height_cm}><Input type="number" inputMode="decimal" step="0.1" value={form.height_cm} onChange={(e) => set('height_cm')(e.target.value)} error={!!errors.height_cm} /></Field>
            <Field label="Weight (kg)" error={errors.weight_kg}><Input type="number" inputMode="decimal" step="0.1" value={form.weight_kg} onChange={(e) => set('weight_kg')(e.target.value)} error={!!errors.weight_kg} /></Field>
            <Field label="BMI (automatically calculated)"><div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-3 py-2.5 text-sm">{bmi ? <><b>{bmi}</b> kg/m² <span className="text-neutral-500">· {bmiCategory(bmi)}</span></> : '—'}</div></Field>
            <Field label="Dominant Hand"><SegmentedControl value={form.dominant_hand} options={DOMINANT_HANDS} onChange={set('dominant_hand')} /></Field>
            <Field label="Registration Date"><Input type="date" value={form.registration_date} onChange={(e) => set('registration_date')(e.target.value)} /></Field>
            <Field label="Season"><Select value={form.season_id} onChange={(e) => set('season_id')(e.target.value)} options={seasons.map((s) => ({ value: s.id, label: s.name }))} placeholder="No season" /></Field>
            <Field label="Player Status"><Select value={form.status} onChange={(e) => set('status')(e.target.value)} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'archived', label: 'Archived' }]} /></Field>
          </Grid>
        </FormSection>
        <div className="sticky bottom-20 z-20 flex justify-end gap-2 rounded-2xl border border-neutral-200 bg-white/95 p-3 shadow-lg backdrop-blur lg:bottom-4">
          <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
          <Button icon={<Save className="h-4 w-4" />} loading={saving} onClick={save}>{id ? 'Save Changes' : 'Register Player'}</Button>
        </div>
      </div>
    </div>
  );
}
