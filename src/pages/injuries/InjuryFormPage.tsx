import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { CalendarCheck2, ClipboardList, HeartPulse, Pill, Save, User } from 'lucide-react';
import * as api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useReference } from '../../context/ReferenceContext';
import { useToast } from '../../context/ToastContext';
import {
  APP, AVAILABILITY, BODY_REGIONS, BODY_SIDES, CONTACT_TYPES, INJURY_SETTINGS, INJURY_STATUSES, INJURY_TYPES, MECHANISMS, ONSET_TYPES, SEVERITIES, TREATMENT_TYPES,
} from '../../lib/constants';
import { formatDate, todayISO } from '../../lib/format';
import type { Injury, Treatment } from '../../lib/types';
import { Button, Checkbox, Field, FormSection, Grid, Input, PageHeader, SegmentedControl, Select, Spinner, Textarea } from '../../components/ui';
import { PlayerPicker } from '../../components/PlayerPicker';

const nowTime = () => new Date().toTimeString().slice(0, 5);

export default function InjuryFormPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { profile } = useAuth();
  const { currentSeason } = useReference();
  const [form, setForm] = useState({
    player_id: params.get('player') ?? '', injury_date: todayISO(), injury_time: nowTime(), setting: 'Training', match_opponent: '', training_session: '',
    mechanism: '', contact_type: '', onset: 'Acute', body_region: '', body_side: '', injury_type: '', custom_type: '', anatomical_structure: '', diagnosis: '',
    severity: 'To Be Determined', injury_grade: '', clinical_examination: '', special_tests: '', imaging_results: '', physician_assessment: '',
    status: 'Newly Recorded', is_recurrent: false, previous_injury_id: '', expected_return_date: '', closure_notes: '',
  });
  const [mechCustom, setMechCustom] = useState('');
  const [treatments, setTreatments] = useState<Record<string, { on: boolean; details: string; medication_name?: string; dosage?: string }>>({});
  const [avail, setAvail] = useState({ on: true, availability: 'NOT AVAILABLE', restrictions: '', staff_notes: '' });
  const [previous, setPrevious] = useState<Injury[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const i = await api.getInjury(id);
        const known = (INJURY_TYPES as readonly string[]).includes(i.injury_type);
        const knownMech = !i.mechanism || (MECHANISMS as readonly string[]).includes(i.mechanism);
        if (!knownMech) setMechCustom(i.mechanism ?? '');
        setForm({
          player_id: i.player_id, injury_date: i.injury_date, injury_time: i.injury_time?.slice(0, 5) ?? '', setting: i.setting, match_opponent: i.match_opponent ?? '', training_session: i.training_session ?? '',
          mechanism: knownMech ? i.mechanism ?? '' : 'Other', contact_type: i.contact_type ?? '', onset: i.onset ?? '', body_region: i.body_region, body_side: i.body_side ?? '',
          injury_type: known ? i.injury_type : 'Other', custom_type: known ? '' : i.injury_type, anatomical_structure: i.anatomical_structure ?? '', diagnosis: i.diagnosis ?? '',
          severity: i.severity, injury_grade: i.injury_grade ?? '', clinical_examination: i.clinical_examination ?? '', special_tests: i.special_tests ?? '', imaging_results: i.imaging_results ?? '',
          physician_assessment: i.physician_assessment ?? '', status: i.status, is_recurrent: i.is_recurrent, previous_injury_id: i.previous_injury_id ?? '', expected_return_date: i.expected_return_date ?? '', closure_notes: i.closure_notes ?? '',
        });
      } catch (e) { toast.error((e as Error).message); } finally { setLoading(false); }
    })();
  }, [id, toast]);

  useEffect(() => {
    if (!form.player_id) { setPrevious([]); return; }
    void api.listInjuries({ playerId: form.player_id, includeArchived: true }).then((l) => setPrevious(l.filter((x) => x.id !== id))).catch(() => setPrevious([]));
  }, [form.player_id, id]);

  // Suggest recurrence when the same region/side was injured before (physician confirms).
  const possibleRecurrence = useMemo(() => previous.find((p) => p.body_region === form.body_region && (!form.body_side || p.body_side === form.body_side)), [previous, form.body_region, form.body_side]);

  const set = <K extends keyof typeof form>(k: K) => (v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    const e: Record<string, string> = {};
    if (!form.player_id) e.player_id = 'Select the player';
    if (!form.injury_date) e.injury_date = 'Required';
    else if (form.injury_date > todayISO()) e.injury_date = 'Date cannot be in the future';
    if (!form.body_region) e.body_region = 'Select the anatomical location';
    if (!form.injury_type) e.injury_type = 'Select the injury type';
    if (form.injury_type === 'Other' && form.custom_type.trim().length < 2) e.custom_type = 'Describe the injury type';
    if (form.expected_return_date && form.expected_return_date < form.injury_date) e.expected_return_date = 'Must be after the injury date';
    setErrors(e);
    if (Object.keys(e).length) { toast.error('Please complete the required fields.'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    setSaving(true);
    try {
      const saved = await api.saveInjury({
        id: id ?? undefined, player_id: form.player_id, season_id: currentSeason?.id ?? null, injury_date: form.injury_date, injury_time: form.injury_time || null,
        setting: form.setting, match_opponent: form.setting === 'Match' ? form.match_opponent : null, training_session: form.setting === 'Training' ? form.training_session : null,
        mechanism: form.mechanism === 'Other' ? mechCustom || 'Other' : form.mechanism || null, contact_type: form.contact_type || null, onset: form.onset || null,
        body_region: form.body_region, body_side: form.body_side || null, injury_type: form.injury_type === 'Other' ? form.custom_type.trim() : form.injury_type,
        anatomical_structure: form.anatomical_structure, diagnosis: form.diagnosis, severity: form.severity, injury_grade: form.injury_grade,
        clinical_examination: form.clinical_examination, special_tests: form.special_tests, imaging_results: form.imaging_results, physician_assessment: form.physician_assessment,
        status: form.status, is_recurrent: form.is_recurrent, previous_injury_id: form.is_recurrent ? form.previous_injury_id || null : null,
        expected_return_date: form.expected_return_date || null, closure_notes: form.closure_notes,
      } as Partial<Injury>);
      if (!id) {
        const rows: Partial<Treatment>[] = Object.entries(treatments).filter(([, t]) => t.on).map(([type, t]) => ({
          injury_id: saved.id, treatment_date: form.injury_date, treatment_type: type, details: t.details, medication_name: t.medication_name, dosage: t.dosage, provided_by: profile?.full_name ?? APP.physician,
        }));
        const warn: string[] = [];
        try { await api.addTreatments(rows); } catch (err) { warn.push(`treatments (${(err as Error).message})`); }
        if (avail.on) {
          try {
            await api.addAvailability({ player_id: form.player_id, injury_id: saved.id, effective_date: form.injury_date, availability: avail.availability,
              medical_status: 'Injured', restrictions: avail.restrictions, staff_notes: avail.staff_notes, shared_with_staff: true });
          } catch (err) { warn.push(`availability (${(err as Error).message})`); }
        }
        if (warn.length) toast.error(`Injury saved, but some items failed: ${warn.join(', ')}`);
        else toast.success(`Injury ${saved.injury_code} recorded`);
      } else toast.success('Injury record updated');
      navigate(`/injuries/${saved.id}`);
    } catch (err) { toast.error((err as Error).message); } finally { setSaving(false); }
  };

  if (loading) return <Spinner />;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={id ? 'Edit Injury Record' : 'Record New Injury'} subtitle={id ? 'Previous follow-ups are never overwritten' : 'Required fields first – clinical detail can be completed later'} icon={<HeartPulse className="h-6 w-6" />} />
      <div className="space-y-4">
        <FormSection title="1 · Player & Event" icon={<User className="h-5 w-5" />}>
          <Grid>
            <Field label="Player" required error={errors.player_id} className="sm:col-span-2"><PlayerPicker value={form.player_id} onChange={set('player_id')} error={!!errors.player_id} disabled={!!id} /></Field>
            <Field label="Date of injury" required error={errors.injury_date}><Input type="date" max={todayISO()} value={form.injury_date} onChange={(e) => set('injury_date')(e.target.value)} error={!!errors.injury_date} /></Field>
            <Field label="Time of injury"><Input type="time" value={form.injury_time} onChange={(e) => set('injury_time')(e.target.value)} /></Field>
            <Field label="Occurred during" required><SegmentedControl value={form.setting} options={INJURY_SETTINGS} onChange={set('setting')} /></Field>
            {form.setting === 'Match' && <Field label="Match opponent (optional)"><Input value={form.match_opponent} onChange={(e) => set('match_opponent')(e.target.value)} /></Field>}
            {form.setting === 'Training' && <Field label="Training session (optional)"><Input value={form.training_session} onChange={(e) => set('training_session')(e.target.value)} placeholder="e.g. Morning conditioning" /></Field>}
            <Field label="Injury mechanism"><Select value={form.mechanism} onChange={(e) => set('mechanism')(e.target.value)} options={MECHANISMS} placeholder="Select…" /></Field>
            {form.mechanism === 'Other' && <Field label="Describe mechanism"><Input value={mechCustom} onChange={(e) => setMechCustom(e.target.value)} /></Field>}
            <Field label="Contact / Non-contact"><SegmentedControl value={form.contact_type} options={CONTACT_TYPES} onChange={set('contact_type')} /></Field>
            <Field label="Acute / Overuse"><SegmentedControl value={form.onset} options={ONSET_TYPES} onChange={set('onset')} /></Field>
          </Grid>
        </FormSection>

        <FormSection title="2 · Injury" icon={<HeartPulse className="h-5 w-5" />}>
          <Field label="Anatomical location" required error={errors.body_region}>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-8">
              {BODY_REGIONS.map((r) => (
                <button type="button" key={r} onClick={() => set('body_region')(r)}
                  className={clsx('rounded-lg border px-2 py-2 text-xs font-semibold transition', form.body_region === r ? 'border-brand-gold bg-brand-gold text-white' : 'border-neutral-200 bg-white hover:border-brand-gold')}>{r}</button>
              ))}
            </div>
          </Field>
          <Grid className="mt-4">
            <Field label="Body side"><SegmentedControl value={form.body_side} options={BODY_SIDES} onChange={set('body_side')} /></Field>
            <Field label="Injury type" required error={errors.injury_type}><Select value={form.injury_type} onChange={(e) => set('injury_type')(e.target.value)} options={INJURY_TYPES} placeholder="Select…" error={!!errors.injury_type} /></Field>
            {form.injury_type === 'Other' && <Field label="Custom injury type" required error={errors.custom_type}><Input value={form.custom_type} onChange={(e) => set('custom_type')(e.target.value)} error={!!errors.custom_type} /></Field>}
            <Field label="Specific anatomical structure"><Input value={form.anatomical_structure} onChange={(e) => set('anatomical_structure')(e.target.value)} placeholder="e.g. Anterior talofibular ligament" /></Field>
            <Field label="Clinical diagnosis"><Input value={form.diagnosis} onChange={(e) => set('diagnosis')(e.target.value)} placeholder="Physician's diagnosis (free text)" /></Field>
            <Field label="Severity" hint="Determined by the physician"><SegmentedControl value={form.severity} options={SEVERITIES} onChange={set('severity')} /></Field>
            <Field label="Injury grade" hint="Entered by the physician – never auto-assigned"><Input value={form.injury_grade} onChange={(e) => set('injury_grade')(e.target.value)} placeholder="e.g. Grade II" /></Field>
            <div className="sm:col-span-2">
              <Checkbox label="Recurrent injury" checked={form.is_recurrent} onChange={set('is_recurrent')}
                description={possibleRecurrence && !form.is_recurrent ? `Note: previous ${possibleRecurrence.body_region} injury on ${formatDate(possibleRecurrence.injury_date)} (${possibleRecurrence.injury_code}). Confirm if this is a recurrence.` : 'Same type and site as a previous injury'} />
            </div>
            {form.is_recurrent && previous.length > 0 && (
              <Field label="Previous related injury" className="sm:col-span-2"><Select value={form.previous_injury_id} onChange={(e) => set('previous_injury_id')(e.target.value)} options={previous.map((p) => ({ value: p.id, label: `${p.injury_code} – ${p.body_region} ${p.injury_type} (${formatDate(p.injury_date)})` }))} placeholder="Select…" /></Field>
            )}
          </Grid>
        </FormSection>

        <FormSection title="3 · Clinical Assessment" icon={<ClipboardList className="h-5 w-5" />} defaultOpen={!!id}>
          <Grid>
            <Field label="Clinical examination"><Textarea value={form.clinical_examination} onChange={(e) => set('clinical_examination')(e.target.value)} /></Field>
            <Field label="Special tests"><Textarea value={form.special_tests} onChange={(e) => set('special_tests')(e.target.value)} /></Field>
            <Field label="Imaging results"><Textarea value={form.imaging_results} onChange={(e) => set('imaging_results')(e.target.value)} /></Field>
            <Field label="Physician's assessment"><Textarea value={form.physician_assessment} onChange={(e) => set('physician_assessment')(e.target.value)} /></Field>
          </Grid>
        </FormSection>

        {!id && (
          <FormSection title="4 · Initial Treatment" icon={<Pill className="h-5 w-5" />} description="Tick what was provided" defaultOpen={false}>
            <div className="grid gap-2 sm:grid-cols-2">
              {TREATMENT_TYPES.map((t) => {
                const cur = treatments[t] ?? { on: false, details: '' };
                return (
                  <div key={t} className={clsx('rounded-xl border p-3', cur.on ? 'border-brand-gold bg-orange-50/40' : 'border-neutral-200')}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                      <input type="checkbox" className="h-4 w-4 accent-brand-gold" checked={cur.on} onChange={(e) => setTreatments({ ...treatments, [t]: { ...cur, on: e.target.checked } })} /> {t}
                    </label>
                    {cur.on && (
                      <div className="mt-2 space-y-2">
                        <Input value={cur.details} onChange={(e) => setTreatments({ ...treatments, [t]: { ...cur, details: e.target.value } })} placeholder="Details" />
                        {t === 'Medication' && (
                          <div className="grid grid-cols-2 gap-2">
                            <Input value={cur.medication_name ?? ''} onChange={(e) => setTreatments({ ...treatments, [t]: { ...cur, medication_name: e.target.value } })} placeholder="Medication" />
                            <Input value={cur.dosage ?? ''} onChange={(e) => setTreatments({ ...treatments, [t]: { ...cur, dosage: e.target.value } })} placeholder="Dose / frequency" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </FormSection>
        )}

        <FormSection title={id ? '4 · Status' : '5 · Status & Availability'} icon={<CalendarCheck2 className="h-5 w-5" />}>
          <Grid>
            <Field label="Injury status"><Select value={form.status} onChange={(e) => set('status')(e.target.value)} options={INJURY_STATUSES} /></Field>
            <Field label="Expected return date" error={errors.expected_return_date}><Input type="date" value={form.expected_return_date} onChange={(e) => set('expected_return_date')(e.target.value)} error={!!errors.expected_return_date} /></Field>
            {id && ['Recovered', 'Closed'].includes(form.status) && <Field label="Closure notes" className="sm:col-span-2"><Textarea rows={2} value={form.closure_notes} onChange={(e) => set('closure_notes')(e.target.value)} /></Field>}
          </Grid>
          {!id && (
            <div className="mt-4 space-y-3">
              <Checkbox label="Update player availability now" checked={avail.on} onChange={(v) => setAvail({ ...avail, on: v })} description="Coaches and managers will see the availability and restrictions only – never the diagnosis." />
              {avail.on && (
                <Grid>
                  <Field label="Training availability"><Select value={avail.availability} onChange={(e) => setAvail({ ...avail, availability: e.target.value })} options={AVAILABILITY} /></Field>
                  <Field label="Restrictions (visible to coaches)"><Input value={avail.restrictions} onChange={(e) => setAvail({ ...avail, restrictions: e.target.value })} placeholder="e.g. No jumping or contact drills" /></Field>
                </Grid>
              )}
            </div>
          )}
        </FormSection>

        <div className="sticky bottom-20 z-20 flex justify-end gap-2 rounded-2xl border border-neutral-200 bg-white/95 p-3 shadow-lg backdrop-blur lg:bottom-4">
          <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
          <Button icon={<Save className="h-4 w-4" />} loading={saving} onClick={save}>{id ? 'Save Changes' : 'Record Injury'}</Button>
        </div>
      </div>
    </div>
  );
}
