import { useState } from 'react';
import { AlertOctagon, ClipboardList, Lightbulb, Play } from 'lucide-react';
import * as api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { todayISO } from '../lib/format';
import { proposeRehab, proposalToProgramme } from '../lib/rehabAdvisor';
import type { Injury } from '../lib/types';
import { APP } from '../lib/constants';
import { Badge, Button, Card } from './ui';

/** Proposed treatment & rehabilitation protocol for an injury (physician reviews and edits before use). */
export function RehabProposalCard({ injury, onUse, onTreatmentAdded }: { injury: Injury; onUse: (prefill: ReturnType<typeof proposalToProgramme>) => void; onTreatmentAdded: () => void }) {
  const { caps, profile } = useAuth();
  const toast = useToast();
  const p = proposeRehab(injury);
  const [busy, setBusy] = useState(false);
  const recordInitial = async () => {
    setBusy(true);
    try {
      await api.addTreatments([{ injury_id: injury.id, treatment_date: todayISO(), treatment_type: 'Initial Management', details: p.initial.join('\n'), provided_by: profile?.full_name ?? APP.physician }]);
      toast.success('Initial management recorded in the treatment record'); onTreatmentAdded();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <Card title={<span className="flex items-center gap-2"><Lightbulb className="h-5 w-5 text-brand-gold" /> Suggested protocol – {p.title}</span>}>
        <p className="mb-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Decision support generated from the injury type, region and severity. It is a starting point to adapt to your examination and imaging – it does not prescribe medication and never clears an athlete. Recalculated whenever the diagnosis or severity changes.</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <b>Typical time-loss:</b>{p.timeLoss ? <Badge color="blue">{p.timeLoss[0]}–{p.timeLoss[1]} days</Badge> : <span>—</span>}
          <span className="text-xs text-neutral-500">{p.timeLossNote}</span>
        </div>
        <h4 className="mt-4 text-xs font-bold uppercase text-neutral-500">Initial management</h4>
        <ul className="mt-1 list-disc space-y-1 ps-5 text-sm">{p.initial.map((x) => <li key={x}>{x}</li>)}</ul>
        {caps.editMedical && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button icon={<Play className="h-4 w-4" />} onClick={() => onUse(proposalToProgramme(p))}>Start rehabilitation from this protocol</Button>
            <Button variant="secondary" loading={busy} icon={<ClipboardList className="h-4 w-4" />} onClick={() => void recordInitial()}>Record initial management</Button>
          </div>
        )}
      </Card>
      <Card title="Rehabilitation phases (criteria-based)">
        <ol className="space-y-3">{p.phases.map((ph, idx) => (
          <li key={ph.phase} className="rounded-xl border p-3 text-sm">
            <p className="font-bold text-brand-navy">{idx + 1}. {ph.phase}</p>
            <p className="text-neutral-700"><b>Goals:</b> {ph.goals}</p>
            {ph.exercises.length > 0 && <ul className="mt-1 list-disc ps-5 text-neutral-700">{ph.exercises.map((e) => <li key={e}>{e}</li>)}</ul>}
            <p className="mt-1 text-xs text-emerald-800"><b>Progress when:</b> {ph.criteria}</p>
          </li>
        ))}</ol>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Return-to-play criteria"><ul className="list-disc space-y-1 ps-5 text-sm">{p.rtp.map((x) => <li key={x}>{x}</li>)}</ul></Card>
        <Card title={<span className="flex items-center gap-2"><AlertOctagon className="h-5 w-5 text-brand-red" /> Red flags – refer / image</span>}>
          <ul className="list-disc space-y-1 ps-5 text-sm">{p.redFlags.map((x) => <li key={x}>{x}</li>)}</ul>
          {p.notes.length > 0 && <ul className="mt-3 space-y-1 text-xs text-neutral-600">{p.notes.map((x) => <li key={x}>• {x}</li>)}</ul>}
        </Card>
      </div>
    </div>
  );
}
