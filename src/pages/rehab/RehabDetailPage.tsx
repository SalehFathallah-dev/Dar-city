import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { CheckCircle2, FileText, Footprints, Pencil, Plus } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import * as api from '../../lib/api';
import * as reports from '../../lib/reports';
import { useAsync } from '../../hooks/useAsync';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { REHAB_PHASES, REHAB_STATUSES } from '../../lib/constants';
import { daysBetween, formatDate, formatDateTime, todayISO } from '../../lib/format';
import type { RehabProgram, RehabSession } from '../../lib/types';
import { Button, Card, DemoBadge, DetailGrid, EmptyState, ErrorBlock, Field, Grid, Input, Modal, PageHeader, PainScale, Select, Spinner, StatusBadge, Textarea } from '../../components/ui';
import { useReportPreview } from '../../components/PdfPreview';

export default function RehabDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { caps, profile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const pdf = useReportPreview();
  const q = useAsync(async () => ({ program: await api.getRehabProgram(id!), sessions: await api.listRehabSessions(id) }), [id]);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [phaseOpen, setPhaseOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  if (q.loading) return <Spinner />;
  if (q.error || !q.data) return <ErrorBlock message={q.error ?? 'Not found'} onRetry={q.reload} />;
  const { program: p, sessions } = q.data;
  const phaseIdx = REHAB_PHASES.indexOf(p.current_phase as (typeof REHAB_PHASES)[number]);
  const chart = sessions.filter((s) => s.pain_score !== null).map((s) => ({ date: formatDate(s.session_date).slice(0, 5), pain: s.pain_score }));

  return (
    <div className="space-y-4">
      <PageHeader title={`Rehabilitation ${p.program_code}`} icon={<Footprints className="h-6 w-6" />}
        subtitle={<><Link className="font-semibold text-brand-orange" to={`/players/${p.player_id}`}>{p.players?.full_name}</Link> · <Link className="text-brand-orange" to={`/injuries/${p.injury_id}`}>{p.injuries?.injury_code}</Link> {p.injuries?.diagnosis ?? p.injuries?.injury_type} <DemoBadge show={p.is_demo} /></>}
        actions={<>
          {caps.addFollowups && p.status === 'Active' && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setSessionOpen(true)}>Add Session</Button>}
          {caps.editMedical && <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditOpen(true)}>Edit Programme</Button>}
          <Button variant="secondary" icon={<FileText className="h-4 w-4" />} loading={pdf.busy} onClick={() => pdf.run(() => reports.rehabReport(p.id))}>Progress PDF</Button>
        </>} />

      <Card title="Rehabilitation Phase" actions={caps.editMedical && p.status === 'Active' && <Button size="sm" onClick={() => setPhaseOpen(true)}>Approve Phase Change</Button>}>
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-7">
          {REHAB_PHASES.map((ph, idx) => (
            <li key={ph} className={clsx('rounded-xl border p-3 text-center text-xs font-semibold',
              idx < phaseIdx ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : idx === phaseIdx ? 'border-brand-orange bg-brand-orange text-white shadow-md' : 'border-neutral-200 text-neutral-400')}>
              <span className="block font-display text-lg">{idx + 1}</span>{ph}
              {idx < phaseIdx && <CheckCircle2 className="mx-auto mt-1 h-4 w-4" />}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-neutral-500">Players are never advanced automatically. {p.phase_approved_by ? `Current phase approved by ${p.phase_approved_by} on ${formatDateTime(p.phase_approved_at)}.` : ''}</p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Programme" className="lg:col-span-2">
          <DetailGrid cols={3} items={[
            { label: 'Start date', value: formatDate(p.start_date) }, { label: 'Duration', value: `${daysBetween(p.start_date, p.end_date ?? todayISO())} days` }, { label: 'Status', value: <StatusBadge status={p.status} /> },
            { label: 'Goals', value: p.goals, wide: true }, { label: 'Exercises', value: p.exercises, wide: true }, { label: 'Training load', value: p.training_load }, { label: 'Physician review', value: p.physician_review, wide: true },
          ]} />
        </Card>
        <Card title="Pain Trend">
          {chart.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chart} margin={{ left: -20, right: 10, top: 10 }}><CartesianGrid stroke="#eee" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis domain={[0, 10]} tick={{ fontSize: 11 }} /><Tooltip /><Line dataKey="pain" stroke="#F4511E" strokeWidth={3} /></LineChart>
            </ResponsiveContainer>
          ) : <EmptyState title="No sessions yet" />}
        </Card>
      </div>

      <Card title={`Treatment Sessions (${sessions.length})`}>
        {sessions.length ? (
          <div className="space-y-3">
            {[...sessions].reverse().map((s) => (
              <div key={s.id} className="rounded-xl border border-neutral-200 p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2"><b className="text-sm">{formatDate(s.session_date)}</b><StatusBadge status={s.phase} />{s.pain_score != null && <span className="text-xs text-neutral-500">Pain {s.pain_score}/10</span>}</div>
                <DetailGrid cols={3} items={[
                  { label: 'Exercises', value: s.exercises }, { label: 'Training load', value: s.training_load }, { label: 'Range of motion', value: s.range_of_motion },
                  { label: 'Strength progress', value: s.strength_progress }, { label: 'Functional progress', value: s.functional_progress }, { label: 'Physiotherapy notes', value: s.physiotherapy_notes },
                  { label: 'Physician review', value: s.physician_review, wide: true },
                ]} />
              </div>
            ))}
          </div>
        ) : <EmptyState title="No sessions recorded" />}
      </Card>

      <SessionModal open={sessionOpen} program={p} onClose={() => setSessionOpen(false)} onSaved={() => { setSessionOpen(false); void q.reload(); }} />
      <PhaseModal open={phaseOpen} program={p} physician={profile?.full_name ?? ''} onClose={() => setPhaseOpen(false)} onSaved={() => { setPhaseOpen(false); void q.reload(); }} />
      <EditProgramModal open={editOpen} program={p} onClose={() => setEditOpen(false)} onSaved={(rtp) => { setEditOpen(false); void q.reload(); if (rtp) { toast.info('Programme completed – record the Return-to-Play decision.'); navigate(`/return-to-play/new?injury=${p.injury_id}`); } }} />
      {pdf.modal}
    </div>
  );
}

function SessionModal({ open, program, onClose, onSaved }: { open: boolean; program: RehabProgram; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { caps } = useAuth();
  const [f, setF] = useState({ session_date: todayISO(), exercises: '', training_load: '', pain_score: null as number | null, range_of_motion: '', strength_progress: '', functional_progress: '', physiotherapy_notes: '', physician_review: '' });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (f.session_date < program.start_date) return toast.error('Session date is before the programme start');
    if (f.session_date > todayISO()) return toast.error('Session date cannot be in the future');
    setSaving(true);
    try { await api.saveRehabSession({ ...f, program_id: program.id, phase: program.current_phase } as Partial<RehabSession>); toast.success('Session recorded'); onSaved(); }
    catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open={open} onClose={onClose} title="Rehabilitation Session" size="lg" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={save}>Save Session</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-neutral-600">Phase: <b>{program.current_phase}</b></p>
        <Grid>
          <Field label="Session date" required><Input type="date" value={f.session_date} onChange={set('session_date')} /></Field>
          <Field label="Training load"><Input value={f.training_load} onChange={set('training_load')} placeholder="e.g. 3×12 @ RPE 6" /></Field>
        </Grid>
        <Field label="Pain score (0–10)"><PainScale value={f.pain_score} onChange={(v) => setF({ ...f, pain_score: v })} /></Field>
        <Grid>
          <Field label="Exercises" className="sm:col-span-2"><Textarea rows={2} value={f.exercises} onChange={set('exercises')} /></Field>
          <Field label="Range of motion"><Input value={f.range_of_motion} onChange={set('range_of_motion')} /></Field>
          <Field label="Strength progress"><Input value={f.strength_progress} onChange={set('strength_progress')} /></Field>
          <Field label="Functional progress"><Input value={f.functional_progress} onChange={set('functional_progress')} /></Field>
          <Field label="Physiotherapy notes"><Input value={f.physiotherapy_notes} onChange={set('physiotherapy_notes')} /></Field>
          {caps.editMedical && <Field label="Physician review" className="sm:col-span-2"><Textarea rows={2} value={f.physician_review} onChange={set('physician_review')} /></Field>}
        </Grid>
      </div>
    </Modal>
  );
}

function PhaseModal({ open, program, physician, onClose, onSaved }: { open: boolean; program: RehabProgram; physician: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [phase, setPhase] = useState(program.current_phase);
  const [approver, setApprover] = useState(physician);
  const [review, setReview] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (phase === program.current_phase) return toast.error('Select a different phase');
    if (approver.trim().length < 2) return toast.error('Physician approval (name) is required');
    setSaving(true);
    try {
      await api.saveRehabProgram({ id: program.id, current_phase: phase, phase_approved_by: approver, physician_review: review ? `${formatDate(todayISO())}: ${review}${program.physician_review ? '\n' + program.physician_review : ''}` : program.physician_review });
      toast.success(`Phase changed to ${phase}`); onSaved();
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Approve Phase Change" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={save}>Approve</Button></>}>
      <div className="space-y-4">
        <Field label="New phase"><Select value={phase} onChange={(e) => setPhase(e.target.value)} options={REHAB_PHASES} /></Field>
        <Field label="Clinical justification"><Textarea value={review} onChange={(e) => setReview(e.target.value)} placeholder="Criteria met for progression…" /></Field>
        <Field label="Approved by (physician)" required><Input value={approver} onChange={(e) => setApprover(e.target.value)} className="font-serif italic" /></Field>
      </div>
    </Modal>
  );
}

function EditProgramModal({ open, program, onClose, onSaved }: { open: boolean; program: RehabProgram; onClose: () => void; onSaved: (goRtp: boolean) => void }) {
  const toast = useToast();
  const [f, setF] = useState({ goals: program.goals ?? '', exercises: program.exercises ?? '', training_load: program.training_load ?? '', physician_review: program.physician_review ?? '', status: program.status, end_date: program.end_date ?? '' });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (f.status !== 'Active' && !f.end_date) return toast.error('Enter the end date');
    setSaving(true);
    try { await api.saveRehabProgram({ id: program.id, ...f, end_date: f.end_date || null }); toast.success('Programme updated'); onSaved(f.status === 'Completed' && program.status !== 'Completed'); }
    catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Edit Programme" size="lg" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Goals"><Textarea value={f.goals} onChange={(e) => setF({ ...f, goals: e.target.value })} /></Field>
        <Field label="Exercises"><Textarea value={f.exercises} onChange={(e) => setF({ ...f, exercises: e.target.value })} /></Field>
        <Field label="Training load"><Input value={f.training_load} onChange={(e) => setF({ ...f, training_load: e.target.value })} /></Field>
        <Field label="Physician review"><Textarea value={f.physician_review} onChange={(e) => setF({ ...f, physician_review: e.target.value })} /></Field>
        <Grid>
          <Field label="Status"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} options={REHAB_STATUSES} /></Field>
          <Field label="End date"><Input type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></Field>
        </Grid>
      </div>
    </Modal>
  );
}
