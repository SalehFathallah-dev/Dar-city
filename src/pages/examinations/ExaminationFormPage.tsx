import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CheckCheck, ClipboardCheck, FlaskConical, HeartPulse, Save, Signature, Stethoscope, User } from 'lucide-react';
import clsx from 'clsx';
import * as api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useReference } from '../../context/ReferenceContext';
import { useToast } from '../../context/ToastContext';
import { APP, EXAM_CLEARANCE, EXAM_TYPES, ORTHOPEDIC_REGIONS, SYSTEMATIC_REGIONS } from '../../lib/constants';
import { bmiCategory, calculateBMI, todayISO } from '../../lib/format';
import type { ExamFinding, Examination } from '../../lib/types';
import { Button, Field, FormSection, Grid, Input, PageHeader, SegmentedControl, Select, Spinner, Textarea } from '../../components/ui';
import { PlayerPicker } from '../../components/PlayerPicker';

type Num = string;
interface Form {
  player_id: string; examination_date: string; physician_name: string; examination_type: string;
  bp_systolic: Num; bp_diastolic: Num; heart_rate: Num; respiratory_rate: Num; temperature_c: Num; oxygen_saturation: Num; height_cm: Num; weight_kg: Num;
  laboratory_tests: string; ecg: string; xray: string; mri: string; ultrasound: string; other_investigations: string;
  clinical_summary: string; identified_problems: string; recommendations: string; further_investigations: string; follow_up_date: string;
  clearance_status: string; clearance_restrictions: string; physician_signature: string;
}

const blankFinding = (category: ExamFinding['category'], region: string): ExamFinding => ({ category, region, is_normal: null, clinical_findings: null, pain: null, range_of_motion: null, muscle_strength: null, joint_stability: null, special_tests: null, notes: null });

const VITAL_LIMITS: Record<string, [number, number, string]> = {
  bp_systolic: [60, 260, 'Systolic'], bp_diastolic: [30, 160, 'Diastolic'], heart_rate: [25, 230, 'Heart rate'], respiratory_rate: [5, 60, 'Respiratory rate'],
  temperature_c: [30, 43, 'Temperature'], oxygen_saturation: [50, 100, 'SpO₂'], height_cm: [120, 250, 'Height'], weight_kg: [35, 200, 'Weight'],
};

export default function ExaminationFormPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { profile } = useAuth();
  const { players, currentSeason } = useReference();
  const [form, setForm] = useState<Form>({
    player_id: params.get('player') ?? '', examination_date: todayISO(), physician_name: profile?.full_name ?? APP.physician, examination_type: params.get('type') ?? 'Pre-Season',
    bp_systolic: '', bp_diastolic: '', heart_rate: '', respiratory_rate: '', temperature_c: '', oxygen_saturation: '', height_cm: '', weight_kg: '',
    laboratory_tests: '', ecg: '', xray: '', mri: '', ultrasound: '', other_investigations: '',
    clinical_summary: '', identified_problems: '', recommendations: '', further_investigations: '', follow_up_date: '',
    clearance_status: '', clearance_restrictions: '', physician_signature: '',
  });
  const [findings, setFindings] = useState<ExamFinding[]>([
    ...SYSTEMATIC_REGIONS.map((r) => blankFinding('Systematic', r)), ...ORTHOPEDIC_REGIONS.map((r) => blankFinding('Orthopedic', r)),
  ]);
  const [openRegion, setOpenRegion] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState<Examination | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const { exam, findings: f } = await api.getExamination(id);
        setExisting(exam);
        const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
        setForm(Object.fromEntries(Object.keys(form).map((k) => [k, s((exam as unknown as Record<string, unknown>)[k])])) as unknown as Form);
        setFindings((prev) => prev.map((b) => f.find((x) => x.region === b.region) ?? b));
      } catch (e) { toast.error((e as Error).message); } finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Pre-fill height/weight from player profile
  useEffect(() => {
    if (id || !form.player_id) return;
    const p = players.find((x) => x.id === form.player_id);
    if (p) setForm((f) => ({ ...f, height_cm: f.height_cm || (p.height_cm?.toString() ?? ''), weight_kg: f.weight_kg || (p.weight_kg?.toString() ?? '') }));
  }, [form.player_id, players, id]);

  const set = (k: keyof Form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const setFinding = (region: string, patch: Partial<ExamFinding>) => setFindings((fs) => fs.map((f) => (f.region === region ? { ...f, ...patch } : f)));
  const markAllNormal = (cat: ExamFinding['category']) => setFindings((fs) => fs.map((f) => (f.category === cat && f.is_normal === null ? { ...f, is_normal: true } : f)));
  const bmi = calculateBMI(Number(form.height_cm) || null, Number(form.weight_kg) || null);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.player_id) e.player_id = 'Select a player';
    if (!form.examination_date) e.examination_date = 'Required';
    if (form.examination_date > todayISO()) e.examination_date = 'Examination date cannot be in the future';
    if (form.physician_name.trim().length < 2) e.physician_name = 'Required';
    for (const [k, [min, max, label]] of Object.entries(VITAL_LIMITS)) {
      const v = form[k as keyof Form];
      if (v !== '' && (Number.isNaN(Number(v)) || Number(v) < min || Number(v) > max)) e[k] = `${label} must be ${min}–${max}`;
    }
    if ((form.bp_systolic === '') !== (form.bp_diastolic === '')) e.bp_systolic = 'Enter both systolic and diastolic values';
    else if (form.bp_systolic && Number(form.bp_systolic) <= Number(form.bp_diastolic)) e.bp_systolic = 'Systolic must be higher than diastolic';
    if (form.clearance_status) {
      if (form.physician_signature.trim().length < 2) e.physician_signature = 'The physician must sign the clearance decision';
      if (form.clearance_status === 'Cleared with Restrictions' && !form.clearance_restrictions.trim()) e.clearance_restrictions = 'Describe the restrictions';
    }
    if (form.follow_up_date && form.follow_up_date < form.examination_date) e.follow_up_date = 'Follow-up must be after the examination';
    return e;
  };

  const save = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) { toast.error('Please correct the highlighted fields.'); return; }
    setSaving(true);
    try {
      const num = (v: string) => (v === '' ? null : Number(v));
      const payload: Partial<Examination> = {
        ...(form as unknown as Partial<Examination>), id: id ?? undefined, season_id: existing?.season_id ?? currentSeason?.id ?? null,
        bp_systolic: num(form.bp_systolic), bp_diastolic: num(form.bp_diastolic), heart_rate: num(form.heart_rate), respiratory_rate: num(form.respiratory_rate),
        temperature_c: num(form.temperature_c), oxygen_saturation: num(form.oxygen_saturation), height_cm: num(form.height_cm), weight_kg: num(form.weight_kg),
        clearance_status: form.clearance_status || null, follow_up_date: form.follow_up_date || null,
        signed_at: existing?.clearance_status === form.clearance_status ? existing?.signed_at ?? undefined : undefined,
      };
      const saved = await api.saveExamination(payload, findings);
      toast.success(form.clearance_status ? 'Examination saved and clearance decision recorded' : 'Examination saved');
      navigate(`/examinations/${saved.id}`);
    } catch (err) { toast.error((err as Error).message); } finally { setSaving(false); }
  };

  if (loading) return <Spinner />;

  const renderFinding = (f: ExamFinding, detailed: boolean) => {
    const isOpen = openRegion === f.region;
    return (
      <div key={f.region} className={clsx('rounded-xl border', f.is_normal === false ? 'border-brand-red/40 bg-red-50/30' : 'border-neutral-200')}>
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          <button type="button" className="flex-1 text-left text-sm font-semibold" onClick={() => setOpenRegion(isOpen ? null : f.region)}>{f.region}</button>
          <div className="flex gap-1">
            {([['Normal', true], ['Abnormal', false]] as const).map(([label, val]) => (
              <button type="button" key={label} onClick={() => { setFinding(f.region, { is_normal: f.is_normal === val ? null : val }); if (!val) setOpenRegion(f.region); }}
                className={clsx('rounded-md px-2.5 py-1 text-xs font-semibold transition', f.is_normal === val ? (val ? 'bg-emerald-600 text-white' : 'bg-brand-red text-white') : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200')}>{label}</button>
            ))}
          </div>
        </div>
        {isOpen && (
          <div className="grid grid-cols-1 gap-3 border-t border-neutral-100 p-3 sm:grid-cols-2">
            <Field label="Clinical findings" className="sm:col-span-2"><Textarea rows={2} value={f.clinical_findings ?? ''} onChange={(e) => setFinding(f.region, { clinical_findings: e.target.value })} /></Field>
            {detailed && (<>
              <Field label="Pain"><Input value={f.pain ?? ''} onChange={(e) => setFinding(f.region, { pain: e.target.value })} placeholder="e.g. None / 3/10 on palpation" /></Field>
              <Field label="Range of motion"><Input value={f.range_of_motion ?? ''} onChange={(e) => setFinding(f.region, { range_of_motion: e.target.value })} placeholder="e.g. Full / Flexion 120°" /></Field>
              <Field label="Muscle strength"><Input value={f.muscle_strength ?? ''} onChange={(e) => setFinding(f.region, { muscle_strength: e.target.value })} placeholder="e.g. 5/5" /></Field>
              <Field label="Joint stability"><Input value={f.joint_stability ?? ''} onChange={(e) => setFinding(f.region, { joint_stability: e.target.value })} placeholder="e.g. Stable" /></Field>
              <Field label="Special tests" className="sm:col-span-2"><Input value={f.special_tests ?? ''} onChange={(e) => setFinding(f.region, { special_tests: e.target.value })} placeholder="e.g. Lachman negative, McMurray negative" /></Field>
            </>)}
            <Field label="Additional notes" className="sm:col-span-2"><Input value={f.notes ?? ''} onChange={(e) => setFinding(f.region, { notes: e.target.value })} /></Field>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={id ? `Edit Examination ${existing?.exam_code ?? ''}` : 'New Medical Examination'} subtitle="Structured pre-season and periodic medical assessment" icon={<Stethoscope className="h-6 w-6" />} />
      <div className="space-y-4">
        <FormSection title="General Information" icon={<User className="h-5 w-5" />}>
          <Grid>
            <Field label="Player" required error={errors.player_id} className="sm:col-span-2"><PlayerPicker value={form.player_id} onChange={set('player_id')} error={!!errors.player_id} disabled={!!id} /></Field>
            <Field label="Examination date" required error={errors.examination_date}><Input type="date" value={form.examination_date} max={todayISO()} onChange={(e) => set('examination_date')(e.target.value)} error={!!errors.examination_date} /></Field>
            <Field label="Physician name" required error={errors.physician_name}><Input value={form.physician_name} onChange={(e) => set('physician_name')(e.target.value)} /></Field>
            <Field label="Examination type" required className="sm:col-span-2"><SegmentedControl value={form.examination_type} options={EXAM_TYPES} onChange={set('examination_type')} /></Field>
          </Grid>
        </FormSection>

        <FormSection title="Vital Signs" icon={<HeartPulse className="h-5 w-5" />}>
          <Grid cols={4}>
            <Field label="BP systolic (mmHg)" error={errors.bp_systolic}><Input type="number" inputMode="numeric" value={form.bp_systolic} onChange={(e) => set('bp_systolic')(e.target.value)} error={!!errors.bp_systolic} /></Field>
            <Field label="BP diastolic (mmHg)" error={errors.bp_diastolic}><Input type="number" inputMode="numeric" value={form.bp_diastolic} onChange={(e) => set('bp_diastolic')(e.target.value)} error={!!errors.bp_diastolic} /></Field>
            <Field label="Heart rate (bpm)" error={errors.heart_rate}><Input type="number" inputMode="numeric" value={form.heart_rate} onChange={(e) => set('heart_rate')(e.target.value)} error={!!errors.heart_rate} /></Field>
            <Field label="Resp. rate (/min)" error={errors.respiratory_rate}><Input type="number" inputMode="numeric" value={form.respiratory_rate} onChange={(e) => set('respiratory_rate')(e.target.value)} error={!!errors.respiratory_rate} /></Field>
            <Field label="Temperature (°C)" error={errors.temperature_c}><Input type="number" inputMode="decimal" step="0.1" value={form.temperature_c} onChange={(e) => set('temperature_c')(e.target.value)} error={!!errors.temperature_c} /></Field>
            <Field label="SpO₂ (%)" error={errors.oxygen_saturation}><Input type="number" inputMode="numeric" value={form.oxygen_saturation} onChange={(e) => set('oxygen_saturation')(e.target.value)} error={!!errors.oxygen_saturation} /></Field>
            <Field label="Height (cm)" error={errors.height_cm}><Input type="number" inputMode="decimal" step="0.1" value={form.height_cm} onChange={(e) => set('height_cm')(e.target.value)} error={!!errors.height_cm} /></Field>
            <Field label="Weight (kg)" error={errors.weight_kg}><Input type="number" inputMode="decimal" step="0.1" value={form.weight_kg} onChange={(e) => set('weight_kg')(e.target.value)} error={!!errors.weight_kg} /></Field>
          </Grid>
          <p className="mt-3 text-sm text-neutral-600">BMI: <b>{bmi ?? '—'}</b>{bmi && <span className="text-neutral-500"> kg/m² · {bmiCategory(bmi)}</span>}</p>
        </FormSection>

        <FormSection title="Systematic Examination" icon={<Stethoscope className="h-5 w-5" />} description="Tap a region to record findings">
          <div className="mb-3 flex justify-end"><Button size="sm" variant="secondary" icon={<CheckCheck className="h-4 w-4" />} onClick={() => markAllNormal('Systematic')}>Mark unrecorded as normal</Button></div>
          <div className="grid gap-2">{findings.filter((f) => f.category === 'Systematic').map((f) => renderFinding(f, false))}</div>
        </FormSection>

        <FormSection title="Orthopedic & Sports Examination" icon={<ClipboardCheck className="h-5 w-5" />} description="Pain, ROM, strength, stability and special tests per region" defaultOpen={false}>
          <div className="mb-3 flex justify-end"><Button size="sm" variant="secondary" icon={<CheckCheck className="h-4 w-4" />} onClick={() => markAllNormal('Orthopedic')}>Mark unrecorded as normal</Button></div>
          <div className="grid gap-2">{findings.filter((f) => f.category === 'Orthopedic').map((f) => renderFinding(f, true))}</div>
        </FormSection>

        <FormSection title="Additional Investigations" icon={<FlaskConical className="h-5 w-5" />} defaultOpen={false} description="Upload reports and images from the examination page after saving">
          <Grid>
            <Field label="Laboratory tests"><Textarea rows={2} value={form.laboratory_tests} onChange={(e) => set('laboratory_tests')(e.target.value)} /></Field>
            <Field label="ECG"><Textarea rows={2} value={form.ecg} onChange={(e) => set('ecg')(e.target.value)} /></Field>
            <Field label="X-Ray"><Textarea rows={2} value={form.xray} onChange={(e) => set('xray')(e.target.value)} /></Field>
            <Field label="MRI"><Textarea rows={2} value={form.mri} onChange={(e) => set('mri')(e.target.value)} /></Field>
            <Field label="Ultrasound"><Textarea rows={2} value={form.ultrasound} onChange={(e) => set('ultrasound')(e.target.value)} /></Field>
            <Field label="Other investigations"><Textarea rows={2} value={form.other_investigations} onChange={(e) => set('other_investigations')(e.target.value)} /></Field>
          </Grid>
        </FormSection>

        <FormSection title="Final Medical Assessment" icon={<ClipboardCheck className="h-5 w-5" />}>
          <Grid>
            <Field label="Clinical summary" className="sm:col-span-2"><Textarea value={form.clinical_summary} onChange={(e) => set('clinical_summary')(e.target.value)} /></Field>
            <Field label="Identified medical problems"><Textarea rows={2} value={form.identified_problems} onChange={(e) => set('identified_problems')(e.target.value)} /></Field>
            <Field label="Recommendations"><Textarea rows={2} value={form.recommendations} onChange={(e) => set('recommendations')(e.target.value)} /></Field>
            <Field label="Further investigations required"><Textarea rows={2} value={form.further_investigations} onChange={(e) => set('further_investigations')(e.target.value)} /></Field>
            <Field label="Follow-up date" error={errors.follow_up_date}><Input type="date" value={form.follow_up_date} onChange={(e) => set('follow_up_date')(e.target.value)} error={!!errors.follow_up_date} /></Field>
          </Grid>
        </FormSection>

        <FormSection title="Medical Clearance & Signature" icon={<Signature className="h-5 w-5" />}>
          <p className="mb-4 rounded-lg bg-brand-beigeLight p-3 text-xs text-neutral-700">Clearance is a clinical decision made and documented by the physician. It is never approved automatically based on normal values. Leave blank if the decision is still pending.</p>
          <Grid>
            <Field label="Clearance decision" className="sm:col-span-2"><Select value={form.clearance_status} onChange={(e) => set('clearance_status')(e.target.value)} options={EXAM_CLEARANCE} placeholder="Decision pending" /></Field>
            {form.clearance_status && (<>
              <Field label="Restrictions / conditions" className="sm:col-span-2" error={errors.clearance_restrictions}><Textarea rows={2} value={form.clearance_restrictions} onChange={(e) => set('clearance_restrictions')(e.target.value)} error={!!errors.clearance_restrictions} /></Field>
              <Field label="Physician signature (type full name)" required error={errors.physician_signature}><Input value={form.physician_signature} onChange={(e) => set('physician_signature')(e.target.value)} placeholder={form.physician_name} className="font-serif italic" error={!!errors.physician_signature} /></Field>
              <Field label="Signature date"><Input value={form.examination_date} readOnly disabled /></Field>
            </>)}
          </Grid>
        </FormSection>

        <div className="sticky bottom-20 z-20 flex justify-end gap-2 rounded-2xl border border-neutral-200 bg-white/95 p-3 shadow-lg backdrop-blur lg:bottom-4">
          <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
          <Button icon={<Save className="h-4 w-4" />} loading={saving} onClick={save}>Save Examination</Button>
        </div>
      </div>
    </div>
  );
}
