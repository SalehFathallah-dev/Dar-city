import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Activity, Save, Signature } from 'lucide-react';
import * as api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { APP, RTP_DECISIONS } from '../../lib/constants';
import { daysBetween, formatDate, todayISO } from '../../lib/format';
import { isOpenInjury } from '../../lib/analytics';
import type { RtpAssessment } from '../../lib/types';
import { Button, Checkbox, Field, FormSection, Grid, Input, PageHeader, PainScale, Select, Spinner, Textarea } from '../../components/ui';

const AVAIL_FOR_DECISION: Record<string, string> = {
  'Not Cleared': 'NOT AVAILABLE', 'Rehabilitation Required': 'INDIVIDUAL TRAINING', 'Cleared for Modified Training': 'MODIFIED TRAINING',
  'Cleared for Full Training': 'FULLY AVAILABLE', 'Cleared for Competition': 'FULLY AVAILABLE',
};

export default function RtpFormPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { profile } = useAuth();
  const injuries = useAsync(() => api.listInjuries(), []);
  const [injuryId, setInjuryId] = useState(params.get('injury') ?? '');
  const [f, setF] = useState({
    assessment_date: todayISO(), current_clinical_status: '', pain_score: null as number | null, pain_assessment: '', range_of_motion: '', muscle_strength: '',
    functional_testing: '', balance_assessment: '', agility: '', jumping_ability: '', landing_mechanics: '', sport_specific_tests: '', basketball_movement: '',
    training_tolerance: '', final_assessment: '', decision: '', decision_date: todayISO(), physician_name: profile?.full_name ?? APP.physician, clinical_notes: '', signature: '',
  });
  const [updateAvail, setUpdateAvail] = useState(true);
  const [restrictions, setRestrictions] = useState('');
  const [closeInjury, setCloseInjury] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const injury = useMemo(() => injuries.data?.find((i) => i.id === injuryId), [injuries.data, injuryId]);
  useEffect(() => { setCloseInjury(f.decision === 'Cleared for Competition'); }, [f.decision]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    const e: Record<string, string> = {};
    if (!injury) e.injury = 'Select the associated injury';
    if (!f.decision) e.decision = 'The physician must select a decision';
    if (f.signature.trim().length < 2) e.signature = 'Signature required';
    if (injury && f.decision_date < injury.injury_date) e.decision_date = 'Decision date is before the injury';
    if (f.decision_date > todayISO()) e.decision_date = 'Cannot be in the future';
    setErrors(e);
    if (Object.keys(e).length) { toast.error('Please complete the required fields.'); return; }
    setSaving(true);
    try {
      const saved = await api.createRtp({ ...f, injury_id: injury!.id, player_id: injury!.player_id } as Partial<RtpAssessment>);
      const warn: string[] = [];
      if (updateAvail) {
        try {
          await api.addAvailability({ player_id: injury!.player_id, injury_id: injury!.id, effective_date: f.decision_date, availability: AVAIL_FOR_DECISION[f.decision],
            medical_status: f.decision.startsWith('Cleared for') && f.decision !== 'Cleared for Modified Training' ? 'Fit' : f.decision === 'Not Cleared' ? 'Injured' : 'Return-to-Play Phase',
            restrictions: restrictions || null, shared_with_staff: true });
        } catch (err) { warn.push((err as Error).message); }
      }
      try {
        if (closeInjury) await api.updateInjuryStatus(injury!.id, 'Closed', { closure_notes: `Cleared for competition (${saved.rtp_code})` });
        else if (f.decision === 'Cleared for Full Training') await api.updateInjuryStatus(injury!.id, 'Recovered');
        else if (f.decision === 'Cleared for Modified Training') await api.updateInjuryStatus(injury!.id, 'Modified Training');
        else if (injury!.status !== 'Under Rehabilitation') await api.updateInjuryStatus(injury!.id, 'Return-to-Play Assessment');
      } catch (err) { warn.push((err as Error).message); }
      if (warn.length) toast.error(`RTP saved, but: ${warn.join('; ')}`); else toast.success(`RTP decision ${saved.rtp_code} recorded`);
      navigate(`/return-to-play/${saved.id}`);
    } catch (err) { toast.error((err as Error).message); } finally { setSaving(false); }
  };

  if (injuries.loading) return <Spinner />;
  const candidates = (injuries.data ?? []).filter((i) => isOpenInjury(i) || i.id === injuryId);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Return-to-Play Assessment" subtitle="Criteria-based assessment – the decision is always made by the physician" icon={<Activity className="h-6 w-6" />} />
      <div className="space-y-4">
        <FormSection title="Player & Injury">
          <Field label="Associated injury" required error={errors.injury}>
            <Select value={injuryId} onChange={(e) => setInjuryId(e.target.value)} placeholder="Select open injury…" error={!!errors.injury}
              options={candidates.map((i) => ({ value: i.id, label: `${i.players?.full_name} – ${i.injury_code} ${i.body_region} ${i.diagnosis ?? i.injury_type} (${formatDate(i.injury_date)})` }))} />
          </Field>
          {injury && <p className="mt-2 text-sm text-neutral-600">Injury date {formatDate(injury.injury_date)} · {daysBetween(injury.injury_date, f.assessment_date)} days since injury · status <b>{injury.status}</b></p>}
          <Grid className="mt-4">
            <Field label="Assessment date"><Input type="date" value={f.assessment_date} onChange={set('assessment_date')} /></Field>
            <Field label="Current clinical status"><Input value={f.current_clinical_status} onChange={set('current_clinical_status')} /></Field>
          </Grid>
        </FormSection>
        <FormSection title="Clinical & Functional Testing">
          <Field label="Pain score (0–10)"><PainScale value={f.pain_score} onChange={(v) => setF({ ...f, pain_score: v })} /></Field>
          <Grid className="mt-4">
            <Field label="Pain assessment"><Input value={f.pain_assessment} onChange={set('pain_assessment')} /></Field>
            <Field label="Range of motion"><Input value={f.range_of_motion} onChange={set('range_of_motion')} /></Field>
            <Field label="Muscle strength"><Input value={f.muscle_strength} onChange={set('muscle_strength')} placeholder="e.g. LSI 95%" /></Field>
            <Field label="Functional testing"><Input value={f.functional_testing} onChange={set('functional_testing')} placeholder="e.g. Hop tests LSI" /></Field>
            <Field label="Balance assessment"><Input value={f.balance_assessment} onChange={set('balance_assessment')} placeholder="e.g. Y-balance" /></Field>
            <Field label="Agility"><Input value={f.agility} onChange={set('agility')} placeholder="e.g. T-test, lane agility" /></Field>
            <Field label="Jumping ability"><Input value={f.jumping_ability} onChange={set('jumping_ability')} placeholder="e.g. CMJ vs baseline" /></Field>
            <Field label="Landing mechanics"><Input value={f.landing_mechanics} onChange={set('landing_mechanics')} /></Field>
            <Field label="Sport-specific functional tests"><Input value={f.sport_specific_tests} onChange={set('sport_specific_tests')} /></Field>
            <Field label="Basketball-specific movement"><Input value={f.basketball_movement} onChange={set('basketball_movement')} placeholder="Cutting, defensive slides, rebounding" /></Field>
            <Field label="Training tolerance" className="sm:col-span-2"><Input value={f.training_tolerance} onChange={set('training_tolerance')} /></Field>
            <Field label="Physician's final assessment" className="sm:col-span-2"><Textarea value={f.final_assessment} onChange={set('final_assessment')} /></Field>
          </Grid>
        </FormSection>
        <FormSection title="Return-to-Play Decision" icon={<Signature className="h-5 w-5" />}>
          <p className="mb-4 rounded-lg bg-brand-cream p-3 text-xs text-neutral-700">No decision is generated automatically. Your decision is permanently stored in the RTP history.</p>
          <Grid>
            <Field label="Decision" required error={errors.decision} className="sm:col-span-2"><Select value={f.decision} onChange={set('decision')} options={RTP_DECISIONS} placeholder="Select decision…" error={!!errors.decision} /></Field>
            <Field label="Decision date" required error={errors.decision_date}><Input type="date" value={f.decision_date} onChange={set('decision_date')} error={!!errors.decision_date} /></Field>
            <Field label="Physician name"><Input value={f.physician_name} onChange={set('physician_name')} /></Field>
            <Field label="Clinical notes" className="sm:col-span-2"><Textarea value={f.clinical_notes} onChange={set('clinical_notes')} /></Field>
            <Field label="Signature (type full name)" required error={errors.signature}><Input value={f.signature} onChange={set('signature')} className="font-serif italic" placeholder={f.physician_name} error={!!errors.signature} /></Field>
          </Grid>
          {f.decision && (
            <div className="mt-4 space-y-3">
              <Checkbox label={`Update availability to ${AVAIL_FOR_DECISION[f.decision]}`} checked={updateAvail} onChange={setUpdateAvail} description="Shared with coaches and managers (no diagnosis)." />
              {updateAvail && f.decision !== 'Cleared for Competition' && f.decision !== 'Cleared for Full Training' && <Field label="Training restrictions (visible to coaches)"><Input value={restrictions} onChange={(e) => setRestrictions(e.target.value)} /></Field>}
              {f.decision === 'Cleared for Competition' && <Checkbox label="Close the injury record" checked={closeInjury} onChange={setCloseInjury} />}
            </div>
          )}
        </FormSection>
        <div className="sticky bottom-20 z-20 flex justify-end gap-2 rounded-2xl border border-neutral-200 bg-white/95 p-3 shadow-lg backdrop-blur lg:bottom-4">
          <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
          <Button icon={<Save className="h-4 w-4" />} loading={saving} onClick={save}>Sign & Save Decision</Button>
        </div>
      </div>
    </div>
  );
}
