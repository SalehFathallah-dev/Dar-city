import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Activity, BadgeCheck, ClipboardList, FileText, Flag, HeartPulse, Pencil, Pill, Plus, Search, Stethoscope } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import * as api from '../../lib/api';
import * as reports from '../../lib/reports';
import { useAsync } from '../../hooks/useAsync';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { APP, INJURY_STATUSES, REHAB_PHASES, TREATMENT_TYPES } from '../../lib/constants';
import { formatDate, todayISO } from '../../lib/format';
import { daysLost } from '../../lib/analytics';
import type { Followup, Treatment } from '../../lib/types';
import {
  Badge, Button, Card, DemoBadge, DetailGrid, EmptyState, ErrorBlock, Field, Grid, Input, Modal, PageHeader, Select, Spinner, StatusBadge, Table, Tabs, Td, Textarea,
} from '../../components/ui';
import { Timeline, type TimelineItem } from '../../components/Timeline';
import { DocumentsPanel } from '../../components/DocumentsPanel';
import { FollowupModal } from '../../components/FollowupForm';
import { useReportPreview } from '../../components/PdfPreview';

type Tab = 'overview' | 'timeline' | 'followups' | 'treatments' | 'rehab' | 'rtp' | 'documents';

export default function InjuryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { caps } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get('followup') ? 'followups' : 'overview');
  const [fuOpen, setFuOpen] = useState(params.get('followup') === '1');
  const [txOpen, setTxOpen] = useState(false);
  const [rehabOpen, setRehabOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const pdf = useReportPreview();

  const q = useAsync(async () => {
    const injury = await api.getInjury(id!);
    const [followups, treatments, rehab, rtp] = await Promise.all([api.listFollowups(id), api.listTreatments(id), api.listRehabPrograms({ injuryId: id }), api.listRtp({ injuryId: id })]);
    return { injury, followups, treatments, rehab, rtp };
  }, [id]);
  useEffect(() => { if (params.get('followup')) setParams({}, { replace: true }); }, [params, setParams]);

  const timeline = useMemo<TimelineItem[]>(() => {
    if (!q.data) return [];
    const { injury: i, followups, treatments, rehab, rtp } = q.data;
    const items: TimelineItem[] = [
      { id: 'inj', date: i.injury_date, title: 'Date of injury', description: `${i.setting}${i.match_opponent ? ' vs ' + i.match_opponent : ''} · ${i.mechanism ?? 'mechanism not recorded'}`, tone: 'red', icon: <HeartPulse className="h-3 w-3" /> },
      { id: 'exam', date: i.created_at, title: 'Initial examination & diagnosis', description: [i.diagnosis, i.injury_grade, i.clinical_examination].filter(Boolean).join(' · ') || 'Recorded', tone: 'dark', icon: <Stethoscope className="h-3 w-3" /> },
      ...treatments.map((t) => ({ id: 't' + t.id, date: t.treatment_date, title: `Treatment – ${t.treatment_type}`, description: [t.details, t.medication_name && `${t.medication_name} ${t.dosage ?? ''}`].filter(Boolean).join(' · '), tone: 'beige' as const, icon: <Pill className="h-3 w-3" /> })),
      ...followups.map((f) => ({ id: 'f' + f.id, date: f.followup_date, title: 'Follow-up assessment', description: `Pain ${f.pain_score ?? '—'}/10 · ${f.response_to_treatment ?? ''} ${f.progress_assessment ? '· ' + f.progress_assessment : ''}${f.updated_diagnosis ? ' · Updated diagnosis: ' + f.updated_diagnosis : ''}`, tone: 'orange' as const, icon: <ClipboardList className="h-3 w-3" /> })),
      ...rehab.map((r) => ({ id: 'r' + r.id, date: r.start_date, title: `Rehabilitation started (${r.program_code})`, description: `Current phase: ${r.current_phase}`, tone: 'blue' as const, icon: <Activity className="h-3 w-3" /> })),
      ...rtp.map((r) => ({ id: 'p' + r.id, date: r.decision_date, title: `Return-to-Play decision: ${r.decision}`, description: r.clinical_notes ?? undefined, tone: (r.decision.startsWith('Cleared') ? 'green' : 'red') as TimelineItem['tone'], icon: <BadgeCheck className="h-3 w-3" /> })),
    ];
    if (i.closed_date) items.push({ id: 'closed', date: i.closed_date, title: 'Injury closed', description: i.closure_notes ?? undefined, tone: 'green', icon: <Flag className="h-3 w-3" /> });
    return items.sort((a, b) => a.date.localeCompare(b.date));
  }, [q.data]);

  if (q.loading) return <Spinner />;
  if (q.error || !q.data) return <ErrorBlock message={q.error ?? 'Not found'} onRetry={q.reload} />;
  const { injury: i, followups, treatments, rehab, rtp } = q.data;

  return (
    <div className="space-y-4">
      <PageHeader title={`${i.body_region} ${i.injury_type}`} icon={<HeartPulse className="h-6 w-6" />}
        subtitle={<><Link className="font-semibold text-brand-gold" to={`/players/${i.player_id}`}>{i.players?.full_name}</Link> · #{i.players?.jersey_number ?? '–'} · {i.injury_code} · {formatDate(i.injury_date)} <DemoBadge show={i.is_demo} /></>}
        actions={<>
          {caps.addFollowups && <Button icon={<ClipboardList className="h-4 w-4" />} onClick={() => setFuOpen(true)}>Add Follow-up</Button>}
          {caps.editMedical && <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => navigate(`/injuries/${i.id}/edit`)}>Edit</Button>}
          <Button variant="secondary" icon={<FileText className="h-4 w-4" />} loading={pdf.busy} onClick={() => pdf.run(() => reports.injuryReport(i.id))}>Injury PDF</Button>
        </>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <InfoTile label="Status" value={<StatusBadge status={i.status} />} action={caps.editMedical ? () => setStatusOpen(true) : undefined} />
        <InfoTile label="Severity / grade" value={<>{<StatusBadge status={i.severity} />} <span className="text-sm">{i.injury_grade}</span></>} />
        <InfoTile label="Days lost" value={<span className="font-display text-2xl font-bold">{daysLost(i)}</span>} />
        <InfoTile label="Expected return" value={formatDate(i.expected_return_date)} />
        <InfoTile label="Return to play" value={formatDate(i.return_to_play_date)} />
      </div>
      <Tabs active={tab} onChange={setTab} tabs={[
        { id: 'overview', label: 'Injury Details' }, { id: 'timeline', label: 'Injury Timeline' }, { id: 'followups', label: 'Follow-ups', count: followups.length },
        { id: 'treatments', label: 'Treatments', count: treatments.length }, { id: 'rehab', label: 'Rehabilitation', count: rehab.length },
        { id: 'rtp', label: 'Return to Play', count: rtp.length }, { id: 'documents', label: 'Documents' },
      ]} />

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Injury Registration">
            <DetailGrid cols={2} items={[
              { label: 'Injury ID', value: i.injury_code }, { label: 'Date & time', value: `${formatDate(i.injury_date)} ${i.injury_time?.slice(0, 5) ?? ''}` },
              { label: 'Setting', value: i.setting }, { label: i.setting === 'Match' ? 'Opponent' : 'Session', value: i.match_opponent ?? i.training_session },
              { label: 'Mechanism', value: i.mechanism }, { label: 'Contact / non-contact', value: i.contact_type }, { label: 'Acute / overuse', value: i.onset },
              { label: 'Body region / side', value: `${i.body_region}${i.body_side ? ' – ' + i.body_side : ''}` }, { label: 'Recurrent', value: i.is_recurrent ? 'Yes' : 'No' },
            ]} />
          </Card>
          <Card title="Diagnosis & Clinical Assessment">
            <DetailGrid cols={2} items={[
              { label: 'Injury type', value: i.injury_type }, { label: 'Anatomical structure', value: i.anatomical_structure },
              { label: 'Clinical diagnosis', value: i.diagnosis, wide: true }, { label: 'Clinical examination', value: i.clinical_examination, wide: true },
              { label: 'Special tests', value: i.special_tests }, { label: 'Imaging results', value: i.imaging_results },
              { label: "Physician's assessment", value: i.physician_assessment, wide: true },
              ...(i.closure_notes ? [{ label: 'Closure notes', value: i.closure_notes, wide: true }] : []),
            ]} />
          </Card>
        </div>
      )}
      {tab === 'timeline' && <Card title="Visual Injury Timeline"><Timeline items={timeline} /></Card>}
      {tab === 'followups' && <FollowupsTab followups={followups} onAdd={caps.addFollowups ? () => setFuOpen(true) : undefined} onPdf={() => pdf.run(() => reports.followupReport(i.id))} />}
      {tab === 'treatments' && (
        <Card title="Treatment Record" actions={caps.addFollowups && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setTxOpen(true)}>Add Treatment</Button>} padded={false}>
          <div className="px-5"><Table headers={['Date', 'Type', 'Details', 'Medication / dose', 'Provided by']} empty={!treatments.length}>
            {treatments.map((t) => <tr key={t.id}><Td>{formatDate(t.treatment_date)}</Td><Td><Badge color="beige">{t.treatment_type}</Badge></Td><Td>{t.details}{t.notes && <span className="block text-xs text-neutral-500">{t.notes}</span>}</Td><Td>{[t.medication_name, t.dosage].filter(Boolean).join(' – ') || '—'}</Td><Td>{t.provided_by}</Td></tr>)}
          </Table></div>
        </Card>
      )}
      {tab === 'rehab' && (
        <Card title="Rehabilitation Programmes" actions={caps.editMedical && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setRehabOpen(true)}>Start Rehabilitation</Button>} padded={false}>
          {rehab.length ? rehab.map((r) => (
            <Link key={r.id} to={`/rehabilitation/${r.id}`} className="flex flex-wrap items-center gap-3 border-b border-neutral-100 px-5 py-3 last:border-0 hover:bg-brand-cream/50">
              <Activity className="h-4 w-4 text-sky-600" /><div className="flex-1"><p className="text-sm font-semibold">{r.program_code} · started {formatDate(r.start_date)}</p><p className="text-xs text-neutral-500">{r.goals}</p></div>
              <Badge color="orange">{r.current_phase}</Badge><StatusBadge status={r.status} />
            </Link>
          )) : <EmptyState title="No rehabilitation programme" description="Start a programme to track phases and sessions." />}
        </Card>
      )}
      {tab === 'rtp' && (
        <Card title="Return-to-Play Decisions" actions={caps.editMedical && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => navigate(`/return-to-play/new?injury=${i.id}`)}>New RTP Assessment</Button>} padded={false}>
          <div className="px-5"><Table headers={['Ref', 'Decision date', 'Decision', 'Pain', 'Physician']} empty={!rtp.length}>
            {rtp.map((r) => <tr key={r.id} className="cursor-pointer hover:bg-brand-cream/40" onClick={() => navigate(`/return-to-play/${r.id}`)}><Td className="font-mono text-xs">{r.rtp_code}</Td><Td>{formatDate(r.decision_date)}</Td><Td><StatusBadge status={r.decision} /></Td><Td>{r.pain_score ?? '—'}/10</Td><Td>{r.physician_name}</Td></tr>)}
          </Table></div>
        </Card>
      )}
      {tab === 'documents' && <Card title="Injury Documents & Imaging"><DocumentsPanel playerId={i.player_id} injuryId={i.id} /></Card>}

      <FollowupModal injury={i} open={fuOpen} previous={followups[followups.length - 1] ?? null} onClose={() => setFuOpen(false)} onSaved={() => { setFuOpen(false); setTab('followups'); void q.reload(); }} />
      <TreatmentModal open={txOpen} injuryId={i.id} injuryDate={i.injury_date} onClose={() => setTxOpen(false)} onSaved={() => { setTxOpen(false); void q.reload(); }} />
      <StartRehabModal open={rehabOpen} injuryId={i.id} playerId={i.player_id} onClose={() => setRehabOpen(false)} onSaved={(pid) => { setRehabOpen(false); toast.success('Rehabilitation programme started'); navigate(`/rehabilitation/${pid}`); }} />
      <StatusModal open={statusOpen} current={i.status} onClose={() => setStatusOpen(false)} onSave={async (status, notes) => {
        try { await api.updateInjuryStatus(i.id, status, notes ? { closure_notes: notes } : {}); toast.success('Injury status updated'); setStatusOpen(false); void q.reload(); }
        catch (e) { toast.error((e as Error).message); }
      }} />
      {pdf.modal}
    </div>
  );
}

function InfoTile({ label, value, action }: { label: string; value: React.ReactNode; action?: () => void }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-card">
      <div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{label}</p>
        {action && <button onClick={action} className="text-xs font-semibold text-brand-gold">Change</button>}</div>
      <div className="mt-1">{value}</div>
    </div>
  );
}

function FollowupsTab({ followups, onAdd, onPdf }: { followups: Followup[]; onAdd?: () => void; onPdf: () => void }) {
  const [a, setA] = useState<string>('');
  const [b, setB] = useState<string>('');
  const first = followups.find((f) => f.id === a) ?? followups[0];
  const last = followups.find((f) => f.id === b) ?? followups[followups.length - 1];
  const chart = followups.filter((f) => f.pain_score !== null).map((f) => ({ date: formatDate(f.followup_date).slice(0, 5), pain: f.pain_score }));
  const rows: [string, keyof Followup][] = [['Pain score', 'pain_score'], ['Swelling', 'swelling'], ['Tenderness', 'tenderness'], ['Range of motion', 'range_of_motion'], ['Muscle strength', 'muscle_strength'], ['Functional status', 'functional_status'], ['Response', 'response_to_treatment'], ['Progress', 'progress_assessment']];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Recovery Timeline – Pain Score" actions={<Button size="sm" variant="secondary" icon={<FileText className="h-4 w-4" />} onClick={onPdf}>Follow-up PDF</Button>}>
          {chart.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chart} margin={{ left: -20, right: 10, top: 10 }}>
                <CartesianGrid stroke="#eee" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fontSize: 11 }} />
                <Tooltip /><Line dataKey="pain" name="Pain (0–10)" stroke="#C0283A" strokeWidth={3} dot={{ r: 5, fill: '#9A7634' }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyState title="No follow-ups yet" />}
        </Card>
        <Card title="Compare Assessments" actions={<Search className="h-4 w-4 text-neutral-400" />}>
          {followups.length >= 2 && first && last ? (
            <>
              <div className="mb-3 grid grid-cols-2 gap-2">
                <Select value={first.id} onChange={(e) => setA(e.target.value)} options={followups.map((f) => ({ value: f.id, label: formatDate(f.followup_date) }))} />
                <Select value={last.id} onChange={(e) => setB(e.target.value)} options={followups.map((f) => ({ value: f.id, label: formatDate(f.followup_date) }))} />
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-neutral-100">
                  {rows.map(([label, k]) => {
                    const va = first[k], vb = last[k];
                    const changed = String(va ?? '') !== String(vb ?? '');
                    return <tr key={k}><td className="py-2 text-xs font-semibold uppercase text-neutral-500">{label}</td><td className="py-2">{(va as string | number | null) ?? '—'}</td><td className={changed ? 'py-2 font-semibold text-brand-gold' : 'py-2'}>{(vb as string | number | null) ?? '—'}</td></tr>;
                  })}
                </tbody>
              </table>
            </>
          ) : <EmptyState title="At least two follow-ups are needed to compare" />}
        </Card>
      </div>
      <Card title="Follow-up History (chronological)" actions={onAdd && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={onAdd}>Add Follow-up</Button>}>
        {followups.length ? (
          <div className="space-y-3">
            {[...followups].reverse().map((f) => (
              <div key={f.id} className="rounded-xl border border-neutral-200 p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2"><b className="text-sm">{formatDate(f.followup_date)}</b><Badge color={f.pain_score != null && f.pain_score <= 3 ? 'green' : f.pain_score != null && f.pain_score <= 6 ? 'orange' : 'red'}>Pain {f.pain_score ?? '—'}/10</Badge>{f.response_to_treatment && <StatusBadge status={f.response_to_treatment} />}{f.next_followup_date && <span className="text-xs text-neutral-500">Next: {formatDate(f.next_followup_date)}</span>}</div>
                <DetailGrid cols={4} items={[
                  { label: 'Swelling', value: f.swelling }, { label: 'Tenderness', value: f.tenderness }, { label: 'ROM', value: f.range_of_motion }, { label: 'Strength', value: f.muscle_strength },
                  { label: 'Functional status', value: f.functional_status }, { label: 'Clinical findings', value: f.clinical_findings }, { label: 'Special tests', value: f.special_tests }, { label: 'Treatment provided', value: f.treatment_provided },
                  { label: 'Progress', value: f.progress_assessment }, { label: 'Updated diagnosis', value: f.updated_diagnosis }, { label: 'Notes', value: f.physician_notes, wide: true },
                ]} />
              </div>
            ))}
          </div>
        ) : <EmptyState title="No follow-ups recorded" />}
      </Card>
    </div>
  );
}

function TreatmentModal({ open, injuryId, injuryDate, onClose, onSaved }: { open: boolean; injuryId: string; injuryDate: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { profile } = useAuth();
  const [f, setF] = useState({ treatment_date: todayISO(), treatment_type: '', details: '', medication_name: '', dosage: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!f.treatment_type) return toast.error('Select the treatment type');
    if (f.treatment_date < injuryDate) return toast.error('Treatment date cannot be before the injury');
    setSaving(true);
    try { await api.addTreatments([{ ...f, injury_id: injuryId, provided_by: profile?.full_name ?? APP.physician } as Partial<Treatment>]); toast.success('Treatment recorded'); setF({ ...f, details: '', medication_name: '', dosage: '', notes: '' }); onSaved(); }
    catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add Treatment" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={save}>Save Treatment</Button></>}>
      <div className="space-y-4">
        <Grid>
          <Field label="Date" required><Input type="date" value={f.treatment_date} onChange={(e) => setF({ ...f, treatment_date: e.target.value })} /></Field>
          <Field label="Treatment type" required><Select value={f.treatment_type} onChange={(e) => setF({ ...f, treatment_type: e.target.value })} options={TREATMENT_TYPES} placeholder="Select…" /></Field>
        </Grid>
        <Field label="Details"><Textarea rows={2} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} /></Field>
        {f.treatment_type === 'Medication' && <Grid><Field label="Medication"><Input value={f.medication_name} onChange={(e) => setF({ ...f, medication_name: e.target.value })} /></Field><Field label="Dose / frequency"><Input value={f.dosage} onChange={(e) => setF({ ...f, dosage: e.target.value })} /></Field></Grid>}
        <Field label="Additional treatment notes"><Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function StartRehabModal({ open, injuryId, playerId, onClose, onSaved }: { open: boolean; injuryId: string; playerId: string; onClose: () => void; onSaved: (id: string) => void }) {
  const toast = useToast();
  const [f, setF] = useState({ start_date: todayISO(), current_phase: REHAB_PHASES[0] as string, goals: '', exercises: '', training_load: '' });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!f.goals.trim()) return toast.error('State the rehabilitation goals');
    setSaving(true);
    try { const r = await api.saveRehabProgram({ ...f, injury_id: injuryId, player_id: playerId }); await api.updateInjuryStatus(injuryId, 'Under Rehabilitation'); onSaved(r.id); }
    catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Start Rehabilitation Programme" size="lg" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={save}>Start Programme</Button></>}>
      <div className="space-y-4">
        <Grid>
          <Field label="Start date" required><Input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></Field>
          <Field label="Initial phase"><Select value={f.current_phase} onChange={(e) => setF({ ...f, current_phase: e.target.value })} options={REHAB_PHASES} /></Field>
        </Grid>
        <Field label="Rehabilitation goals" required><Textarea value={f.goals} onChange={(e) => setF({ ...f, goals: e.target.value })} /></Field>
        <Field label="Exercises"><Textarea value={f.exercises} onChange={(e) => setF({ ...f, exercises: e.target.value })} /></Field>
        <Field label="Training load"><Input value={f.training_load} onChange={(e) => setF({ ...f, training_load: e.target.value })} /></Field>
        <p className="text-xs text-neutral-500">The injury status will be set to "Under Rehabilitation".</p>
      </div>
    </Modal>
  );
}

function StatusModal({ open, current, onClose, onSave }: { open: boolean; current: string; onClose: () => void; onSave: (s: string, notes: string) => Promise<void> }) {
  const [s, setS] = useState(current);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => setS(current), [current, open]);
  return (
    <Modal open={open} onClose={onClose} title="Update Injury Status" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={async () => { setSaving(true); await onSave(s, notes); setSaving(false); }}>Update Status</Button></>}>
      <div className="space-y-4">
        <Field label="Status"><Select value={s} onChange={(e) => setS(e.target.value)} options={INJURY_STATUSES} /></Field>
        {['Recovered', 'Closed'].includes(s) && <Field label="Closure notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>}
        <p className="text-xs text-neutral-500">Return-to-play clearance is recorded separately through an RTP assessment.</p>
      </div>
    </Modal>
  );
}
