import { useState } from 'react';
import * as api from '../lib/api';
import { SEVERITY_SCALE, TREATMENT_RESPONSES } from '../lib/constants';
import { todayISO } from '../lib/format';
import type { Followup, Injury } from '../lib/types';
import { useToast } from '../context/ToastContext';
import { Button, Field, Grid, Input, Modal, PainScale, SegmentedControl, Textarea } from './ui';

/** Adds a new follow-up – previous assessments are never overwritten. */
export function FollowupModal({ injury, open, onClose, onSaved, previous }: { injury: Injury; open: boolean; onClose: () => void; onSaved: () => void; previous?: Followup | null }) {
  const toast = useToast();
  const [f, setF] = useState({
    followup_date: todayISO(), pain_score: null as number | null, swelling: '', tenderness: '', range_of_motion: '', muscle_strength: '', functional_status: '',
    clinical_findings: '', special_tests: '', treatment_provided: '', response_to_treatment: '', progress_assessment: '', updated_diagnosis: '', next_followup_date: '', physician_notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    const e: Record<string, string> = {};
    if (!f.followup_date) e.followup_date = 'Required';
    else if (f.followup_date < injury.injury_date) e.followup_date = 'Cannot be before the injury date';
    else if (f.followup_date > todayISO()) e.followup_date = 'Cannot be in the future';
    if (f.pain_score === null) e.pain_score = 'Record the pain score (0–10)';
    if (f.next_followup_date && f.next_followup_date <= f.followup_date) e.next_followup_date = 'Must be after this follow-up';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      await api.saveFollowup({ ...f, injury_id: injury.id, swelling: f.swelling || null, tenderness: f.tenderness || null, response_to_treatment: f.response_to_treatment || null, next_followup_date: f.next_followup_date || null } as Partial<Followup>);
      toast.success('Follow-up recorded');
      onSaved();
    } catch (err) { toast.error((err as Error).message); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={`Follow-up · ${injury.injury_code}`} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={save}>Save Follow-up</Button></>}>
      <div className="space-y-4">
        {previous && <p className="rounded-lg bg-brand-cream p-3 text-xs text-neutral-700">Previous follow-up: pain {previous.pain_score ?? '—'}/10, swelling {previous.swelling ?? '—'}, ROM {previous.range_of_motion ?? '—'}, strength {previous.muscle_strength ?? '—'}.</p>}
        <Grid>
          <Field label="Follow-up date" required error={errors.followup_date}><Input type="date" value={f.followup_date} max={todayISO()} onChange={(e) => set('followup_date')(e.target.value)} error={!!errors.followup_date} /></Field>
          <Field label="Next follow-up date" error={errors.next_followup_date}><Input type="date" value={f.next_followup_date} onChange={(e) => set('next_followup_date')(e.target.value)} error={!!errors.next_followup_date} /></Field>
        </Grid>
        <Field label="Pain score (0–10)" required error={errors.pain_score}><PainScale value={f.pain_score} onChange={(v) => setF((x) => ({ ...x, pain_score: v }))} /></Field>
        <Grid>
          <Field label="Swelling"><SegmentedControl value={f.swelling} options={SEVERITY_SCALE} onChange={set('swelling')} /></Field>
          <Field label="Tenderness"><SegmentedControl value={f.tenderness} options={SEVERITY_SCALE} onChange={set('tenderness')} /></Field>
          <Field label="Range of motion"><Input value={f.range_of_motion} onChange={(e) => set('range_of_motion')(e.target.value)} /></Field>
          <Field label="Muscle strength"><Input value={f.muscle_strength} onChange={(e) => set('muscle_strength')(e.target.value)} /></Field>
          <Field label="Functional status" className="sm:col-span-2"><Input value={f.functional_status} onChange={(e) => set('functional_status')(e.target.value)} placeholder="e.g. Jogging pain-free" /></Field>
          <Field label="Clinical findings"><Textarea rows={2} value={f.clinical_findings} onChange={(e) => set('clinical_findings')(e.target.value)} /></Field>
          <Field label="Special tests"><Textarea rows={2} value={f.special_tests} onChange={(e) => set('special_tests')(e.target.value)} /></Field>
          <Field label="Treatment provided"><Textarea rows={2} value={f.treatment_provided} onChange={(e) => set('treatment_provided')(e.target.value)} /></Field>
          <Field label="Progress assessment"><Textarea rows={2} value={f.progress_assessment} onChange={(e) => set('progress_assessment')(e.target.value)} /></Field>
          <Field label="Response to treatment" className="sm:col-span-2"><SegmentedControl value={f.response_to_treatment} options={TREATMENT_RESPONSES} onChange={set('response_to_treatment')} /></Field>
          <Field label="Updated diagnosis (if applicable)"><Input value={f.updated_diagnosis} onChange={(e) => set('updated_diagnosis')(e.target.value)} /></Field>
          <Field label="Physician notes"><Textarea rows={2} value={f.physician_notes} onChange={(e) => set('physician_notes')(e.target.value)} /></Field>
        </Grid>
      </div>
    </Modal>
  );
}
