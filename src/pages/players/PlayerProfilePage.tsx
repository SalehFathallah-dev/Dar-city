import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Activity, BadgeCheck, CalendarCheck2, Camera, ClipboardList, FileText, HeartPulse, History, Pencil, Pill, Plus, Stethoscope, User } from 'lucide-react';
import { ImagePicker } from '../../components/ImagePicker';
import * as api from '../../lib/api';
import * as reports from '../../lib/reports';
import { useAsync } from '../../hooks/useAsync';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useClub } from '../../context/ClubContext';
import { ClubLogo } from '../../components/Branding';
import { APP, EXAM_CLEARANCE } from '../../lib/constants';
import { bmiCategory, calculateAge, formatDate, formatDateTime, todayISO } from '../../lib/format';
import { daysLost } from '../../lib/analytics';
import type { MedicalHistory } from '../../lib/types';
import {
  Badge, Button, Card, DemoBadge, DetailGrid, EmptyState, ErrorBlock, Field, Grid, Input, Modal, PlayerAvatar, Select, Spinner, StatusBadge, Table, Tabs, Td, Textarea,
} from '../../components/ui';
import { Timeline, type TimelineItem } from '../../components/Timeline';
import { DocumentsPanel } from '../../components/DocumentsPanel';
import { useReportPreview } from '../../components/PdfPreview';

type TabId = 'overview' | 'personal' | 'history' | 'exams' | 'injuries' | 'treatments' | 'rehab' | 'clearance' | 'documents' | 'timeline';

export default function PlayerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { caps } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabId) || 'overview';
  const setTab = (t: TabId) => setParams({ tab: t }, { replace: true });
  const pdf = useReportPreview();
  const { club } = useClub();
  const [photoOpen, setPhotoOpen] = useState(false);

  const player = useAsync(() => api.getPlayer(id!), [id]);
  const contacts = useAsync(() => caps.viewEmergencyContacts ? api.listContacts(id!) : Promise.resolve([]), [id, caps.viewEmergencyContacts]);
  const staffAvail = useAsync(async () => (await api.getTeamAvailability()).find((r) => r.player_id === id) ?? null, [id]);
  const med = useAsync(async () => {
    if (!caps.viewMedical) return null;
    const [histories, exams, injuries, clearances, availability, rehab, rtp] = await Promise.all([
      api.listHistories(id), api.listExaminations(id), api.listInjuries({ playerId: id, includeArchived: true }), api.listClearances(id),
      api.listAvailability(id), api.listRehabPrograms({ playerId: id }), api.listRtp({ playerId: id }),
    ]);
    const injuryIds = new Set(injuries.map((i) => i.id));
    const [followups, treatments, sessions] = await Promise.all([api.listFollowups(), api.listTreatments(), api.listRehabSessions()]);
    const progIds = new Set(rehab.map((r) => r.id));
    return {
      histories, exams, injuries, clearances, availability, rehab, rtp,
      followups: followups.filter((f) => injuryIds.has(f.injury_id)),
      treatments: treatments.filter((t) => injuryIds.has(t.injury_id)),
      sessions: sessions.filter((s) => progIds.has(s.program_id)),
    };
  }, [id, caps.viewMedical]);

  if (player.loading) return <Spinner />;
  if (player.error || !player.data) return <ErrorBlock message={player.error ?? 'Player not found'} onRetry={player.reload} />;
  const p = player.data;
  const m = med.data;
  const currentAvail = m?.availability[0] ?? null;
  const availability = currentAvail?.availability ?? staffAvail.data?.availability ?? 'UNDER MEDICAL REVIEW';

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' }, { id: 'personal', label: 'Personal Information' },
    ...(caps.viewMedical ? [
      { id: 'history' as TabId, label: 'Medical History' }, { id: 'exams' as TabId, label: 'Medical Examinations', count: m?.exams.length },
      { id: 'injuries' as TabId, label: 'Injuries', count: m?.injuries.length }, { id: 'treatments' as TabId, label: 'Treatments', count: m?.treatments.length },
      { id: 'rehab' as TabId, label: 'Rehabilitation', count: m?.rehab.length }, { id: 'clearance' as TabId, label: 'Medical Clearance', count: m?.clearances.length },
      { id: 'documents' as TabId, label: 'Documents' }, { id: 'timeline' as TabId, label: 'Activity Timeline' },
    ] : []),
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl bg-brand-navy p-5 text-white shadow-xl sm:p-6">
        <ClubLogo logo={club?.logo_url} name={club?.short_name ?? ''} size={110} className="pointer-events-none absolute -right-3 -top-3 opacity-15" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="relative shrink-0">
            <PlayerAvatar name={p.full_name} photoPath={p.photo_path} size={96} />
            {caps.managePlayers && (
              <button onClick={() => setPhotoOpen(true)} aria-label="Change photo" title="Change photo"
                className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-brand-gold text-white shadow-lg ring-2 ring-brand-navy hover:bg-brand-goldDark">
                <Camera className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-4xl font-extrabold text-brand-gold">#{p.jersey_number ?? '–'}</span>
              <h1 className="font-display text-3xl font-bold uppercase tracking-wide">{p.full_name}</h1>
              <DemoBadge show={p.is_demo} />
            </div>
            <p className="text-sm text-brand-sand">{p.position} · {p.player_code} · {p.team_category}</p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
              {[['Age', `${calculateAge(p.date_of_birth) ?? '—'} yrs`], ['Height', p.height_cm ? `${p.height_cm} cm` : '—'], ['Weight', p.weight_kg ? `${p.weight_kg} kg` : '—'], ['BMI', p.bmi ?? '—'], ['Status', p.status.toUpperCase()]].map(([k, v]) => (
                <div key={k as string}><p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">{k}</p><p className="font-semibold">{v}</p></div>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">Current availability</span>
            <StatusBadge status={availability} />
            <div className="mt-2 flex flex-wrap gap-2">
              {caps.managePlayers && <Button size="sm" variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => navigate(`/players/${p.id}/edit`)}>Edit</Button>}
              {caps.viewMedical
                ? <Button size="sm" icon={<FileText className="h-4 w-4" />} loading={pdf.busy} onClick={() => pdf.run(() => reports.playerMedicalProfile(p.id))}>Medical Profile PDF</Button>
                : <Button size="sm" icon={<FileText className="h-4 w-4" />} loading={pdf.busy} onClick={() => pdf.run(() => reports.playerRegistration(p.id))}>Registration PDF</Button>}
            </div>
          </div>
        </div>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {caps.viewMedical && med.loading ? <Spinner /> : med.error ? <ErrorBlock message={med.error} onRetry={med.reload} /> : (
        <div className="animate-fade-in">
          {tab === 'overview' && (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card title="Availability" className="lg:col-span-1">
                <DetailGrid cols={2} items={[
                  { label: 'Training availability', value: <StatusBadge status={availability} /> },
                  { label: 'Medical status', value: currentAvail?.medical_status ?? staffAvail.data?.medical_status },
                  { label: 'Restrictions', value: currentAvail?.restrictions ?? staffAvail.data?.restrictions, wide: true },
                  { label: 'Effective', value: formatDate(currentAvail?.effective_date ?? staffAvail.data?.effective_date) },
                  { label: 'Next follow-up', value: formatDate(currentAvail?.next_followup_date ?? staffAvail.data?.next_followup_date) },
                ]} />
              </Card>
              {m ? (
                <>
                  <Card title="Medical Summary" className="lg:col-span-2">
                    <DetailGrid items={[
                      { label: 'Latest clearance', value: m.clearances[0] ? <><StatusBadge status={m.clearances[0].clearance_status} /> <span className="text-xs text-neutral-500">{formatDate(m.clearances[0].decision_date)}</span></> : 'No clearance on record' },
                      { label: 'Open injuries', value: m.injuries.filter((i) => !['Recovered', 'Closed'].includes(i.status)).length },
                      { label: 'Total injuries', value: m.injuries.length },
                      { label: 'Drug allergies', value: <span className="font-semibold text-brand-red">{m.histories.find((h) => h.is_current)?.drug_allergies || 'None recorded'}</span> },
                      { label: 'Current medications', value: m.histories.find((h) => h.is_current)?.current_medications },
                      { label: 'Last examination', value: m.exams[0] ? `${formatDate(m.exams[0].examination_date)} (${m.exams[0].examination_type})` : 'None' },
                    ]} />
                  </Card>
                  <Card title="Active Injuries" className="lg:col-span-3" padded={false}>
                    {m.injuries.filter((i) => !['Recovered', 'Closed'].includes(i.status)).length ? m.injuries.filter((i) => !['Recovered', 'Closed'].includes(i.status)).map((i) => (
                      <Link key={i.id} to={`/injuries/${i.id}`} className="flex flex-wrap items-center gap-3 border-b border-neutral-100 px-5 py-3 last:border-0 hover:bg-brand-cream/50">
                        <HeartPulse className="h-4 w-4 text-brand-red" />
                        <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{i.diagnosis ?? i.injury_type} – {i.body_region} {i.body_side && `(${i.body_side})`}</p><p className="text-xs text-neutral-500">{i.injury_code} · {formatDate(i.injury_date)} · {daysLost(i)} days</p></div>
                        <StatusBadge status={i.status} />
                      </Link>
                    )) : <EmptyState title="No active injuries" />}
                  </Card>
                </>
              ) : (
                <Card title="Notice" className="lg:col-span-2"><p className="text-sm text-neutral-600">Confidential medical information is only visible to the medical team.</p></Card>
              )}
            </div>
          )}
          {tab === 'personal' && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Personal Information">
                <DetailGrid cols={2} items={[
                  { label: 'Player ID', value: p.player_code }, { label: 'Full name', value: p.full_name },
                  { label: 'Date of birth', value: formatDate(p.date_of_birth) }, { label: 'Age', value: calculateAge(p.date_of_birth) },
                  { label: 'Nationality', value: p.nationality }, { label: 'Phone', value: p.phone }, { label: 'Email', value: p.email },
                  { label: 'Address', value: p.address, wide: true },
                ]} />
              </Card>
              <Card title="Basketball Information">
                <DetailGrid cols={2} items={[
                  { label: 'Jersey number', value: p.jersey_number != null ? `#${p.jersey_number}` : null }, { label: 'Position', value: p.position },
                  { label: 'Height', value: p.height_cm ? `${p.height_cm} cm` : null }, { label: 'Weight', value: p.weight_kg ? `${p.weight_kg} kg` : null },
                  { label: 'BMI', value: p.bmi ? `${p.bmi} – ${bmiCategory(p.bmi)}` : null }, { label: 'Dominant hand', value: p.dominant_hand },
                  { label: 'Team category', value: p.team_category }, { label: 'Registration date', value: formatDate(p.registration_date) },
                ]} />
              </Card>
              {caps.viewEmergencyContacts && (
                <Card title="Emergency Contacts" className="lg:col-span-2">
                  {contacts.data?.length ? <DetailGrid items={contacts.data.flatMap((c) => [{ label: 'Name', value: c.contact_name }, { label: 'Relationship', value: c.relationship }, { label: 'Phone', value: c.phone }])} />
                    : <EmptyState title="No emergency contact recorded" />}
                </Card>
              )}
            </div>
          )}
          {m && tab === 'history' && <HistoryTab playerId={p.id} histories={m.histories} onSaved={med.reload} />}
          {m && tab === 'exams' && (
            <Card title="Medical Examinations" actions={caps.editMedical && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => navigate(`/examinations/new?player=${p.id}`)}>New Examination</Button>} padded={false}>
              <div className="px-5"><Table headers={['Exam ID', 'Date', 'Type', 'Physician', 'Clearance', 'Follow-up']} empty={!m.exams.length}>
                {m.exams.map((e) => (
                  <tr key={e.id} className="cursor-pointer hover:bg-brand-cream/40" onClick={() => navigate(`/examinations/${e.id}`)}>
                    <Td className="font-mono text-xs">{e.exam_code}</Td><Td>{formatDate(e.examination_date)}</Td><Td>{e.examination_type}</Td><Td>{e.physician_name}</Td>
                    <Td><StatusBadge status={e.clearance_status ?? 'Pending'} /></Td><Td>{formatDate(e.follow_up_date)}</Td>
                  </tr>
                ))}
              </Table></div>
            </Card>
          )}
          {m && tab === 'injuries' && (
            <Card title="Injury Record" actions={caps.editMedical && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => navigate(`/injuries/new?player=${p.id}`)}>Record Injury</Button>} padded={false}>
              <div className="px-5"><Table headers={['Injury ID', 'Date', 'Region', 'Type / Diagnosis', 'Severity', 'Status', 'Days Lost']} empty={!m.injuries.length}>
                {m.injuries.map((i) => (
                  <tr key={i.id} className="cursor-pointer hover:bg-brand-cream/40" onClick={() => navigate(`/injuries/${i.id}`)}>
                    <Td className="font-mono text-xs">{i.injury_code}</Td><Td>{formatDate(i.injury_date)}</Td><Td>{i.body_region} {i.body_side && <span className="text-neutral-400">({i.body_side})</span>}</Td>
                    <Td>{i.injury_type}{i.diagnosis && <span className="block text-xs text-neutral-500">{i.diagnosis}</span>}</Td><Td><StatusBadge status={i.severity} /></Td><Td><StatusBadge status={i.status} /></Td><Td>{daysLost(i)}</Td>
                  </tr>
                ))}
              </Table></div>
            </Card>
          )}
          {m && tab === 'treatments' && (
            <Card title="Treatments" padded={false}>
              <div className="px-5"><Table headers={['Date', 'Injury', 'Type', 'Details', 'Medication', 'Provided by']} empty={!m.treatments.length}>
                {[...m.treatments].reverse().map((t) => {
                  const inj = m.injuries.find((i) => i.id === t.injury_id);
                  return (
                    <tr key={t.id}>
                      <Td>{formatDate(t.treatment_date)}</Td><Td><Link className="text-brand-gold" to={`/injuries/${t.injury_id}`}>{inj?.injury_code}</Link></Td>
                      <Td><Badge color="beige">{t.treatment_type}</Badge></Td><Td>{t.details}</Td><Td>{[t.medication_name, t.dosage].filter(Boolean).join(' – ') || '—'}</Td><Td>{t.provided_by}</Td>
                    </tr>
                  );
                })}
              </Table></div>
            </Card>
          )}
          {m && tab === 'rehab' && (
            <Card title="Rehabilitation Programmes" padded={false}>
              <div className="px-5"><Table headers={['Programme', 'Injury', 'Start', 'Current Phase', 'Sessions', 'Status']} empty={!m.rehab.length}>
                {m.rehab.map((r) => (
                  <tr key={r.id} className="cursor-pointer hover:bg-brand-cream/40" onClick={() => navigate(`/rehabilitation/${r.id}`)}>
                    <Td className="font-mono text-xs">{r.program_code}</Td><Td>{r.injuries?.injury_code} – {r.injuries?.diagnosis ?? r.injuries?.injury_type}</Td><Td>{formatDate(r.start_date)}</Td>
                    <Td><Badge color="orange">{r.current_phase}</Badge></Td><Td>{m.sessions.filter((s) => s.program_id === r.id).length}</Td><Td><StatusBadge status={r.status} /></Td>
                  </tr>
                ))}
              </Table></div>
            </Card>
          )}
          {m && tab === 'clearance' && <ClearanceTab playerId={p.id} clearances={m.clearances} rtp={m.rtp} onSaved={med.reload} pdfRun={pdf.run} />}
          {tab === 'documents' && caps.viewMedical && <Card title="Medical Documents"><DocumentsPanel playerId={p.id} /></Card>}
          {m && tab === 'timeline' && <Card title="Activity Timeline"><PlayerTimeline data={m} /></Card>}
        </div>
      )}
      {photoOpen && <PhotoModal playerId={p.id} name={p.full_name} photoPath={p.photo_path} onClose={() => setPhotoOpen(false)} onSaved={() => { setPhotoOpen(false); void player.reload(); }} />}
      {pdf.modal}
    </div>
  );
}

function PhotoModal({ playerId, name, photoPath, onClose, onSaved }: { playerId: string; name: string; photoPath: string | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!file) return;
    setSaving(true);
    try { await api.uploadPlayerPhoto(playerId, file); toast.success('Player photo updated'); onSaved(); }
    catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} title="Player Photo"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} disabled={!file} onClick={save}>Save Photo</Button></>}>
      <ImagePicker kind="photo" value={file} onChange={setFile} current={<PlayerAvatar name={name} photoPath={photoPath} size={80} />}
        hint="Choose a picture from the phone gallery or take a new one." />
    </Modal>
  );
}

const HISTORY_FIELDS: [keyof MedicalHistory, string][] = [
  ['previous_conditions', 'Previous Medical Conditions'], ['chronic_diseases', 'Chronic Diseases'], ['previous_injuries', 'Previous Injuries'],
  ['previous_surgeries', 'Previous Surgeries'], ['drug_allergies', 'Drug Allergies'], ['food_allergies', 'Food Allergies'],
  ['current_medications', 'Current Medications'], ['previous_hospitalizations', 'Previous Hospitalizations'], ['family_history', 'Family Medical History'],
  ['relevant_information', 'Relevant Medical Information'], ['physician_notes', 'Additional Physician Notes'],
];

function HistoryTab({ playerId, histories, onSaved }: { playerId: string; histories: MedicalHistory[]; onSaved: () => void }) {
  const { caps } = useAuth();
  const toast = useToast();
  const current = histories.find((h) => h.is_current) ?? null;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [viewVersion, setViewVersion] = useState<MedicalHistory | null>(null);

  const start = () => {
    setForm({ ...Object.fromEntries(HISTORY_FIELDS.map(([k]) => [k, (current?.[k] as string) ?? ''])), change_reason: '' });
    setEditing(true);
  };
  const save = async () => {
    if (current && !form.change_reason?.trim()) { toast.error('Please state the reason for this update.'); return; }
    setSaving(true);
    try {
      await api.addHistoryVersion({ player_id: playerId, ...form, change_reason: form.change_reason || 'Initial record' } as Partial<MedicalHistory>);
      toast.success('Medical history saved. Previous version preserved.');
      setEditing(false); onSaved();
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title={current ? `Current Medical History (version ${current.version})` : 'Medical History'} className="lg:col-span-2"
        actions={caps.editMedical && !editing && <Button size="sm" icon={<Pencil className="h-4 w-4" />} onClick={start}>{current ? 'Update History' : 'Record History'}</Button>}>
        {editing ? (
          <div className="space-y-4">
            <Grid>
              {HISTORY_FIELDS.map(([k, label]) => (
                <Field key={k} label={label}><Textarea rows={2} value={form[k] ?? ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></Field>
              ))}
            </Grid>
            <Field label="Reason for update" required={!!current}><Input value={form.change_reason ?? ''} onChange={(e) => setForm({ ...form, change_reason: e.target.value })} placeholder="e.g. New drug allergy identified" /></Field>
            <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button><Button loading={saving} onClick={save}>Save New Version</Button></div>
          </div>
        ) : current ? (
          <DetailGrid cols={2} items={HISTORY_FIELDS.map(([k, label]) => ({ label, value: current[k] as string, wide: k === 'physician_notes' }))} />
        ) : <EmptyState title="No medical history recorded" description="Record the player's medical background, allergies and medications." />}
      </Card>
      <Card title="Version History" padded={false}>
        {histories.length ? histories.map((h) => (
          <button key={h.id} onClick={() => setViewVersion(h)} className="flex w-full items-center gap-3 border-b border-neutral-100 px-5 py-3 text-left last:border-0 hover:bg-brand-cream/50">
            <History className="h-4 w-4 text-neutral-400" />
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Version {h.version} {h.is_current && <Badge color="green">Current</Badge>}</p><p className="truncate text-xs text-neutral-500">{h.change_reason}</p></div>
            <span className="text-xs text-neutral-400">{formatDateTime(h.created_at)}</span>
          </button>
        )) : <EmptyState title="No versions" />}
      </Card>
      <Modal open={!!viewVersion} onClose={() => setViewVersion(null)} title={`Medical History – Version ${viewVersion?.version}`} size="lg">
        {viewVersion && <><p className="mb-4 text-sm text-neutral-500">Recorded {formatDateTime(viewVersion.created_at)} · {viewVersion.change_reason}</p>
          <DetailGrid cols={2} items={HISTORY_FIELDS.map(([k, label]) => ({ label, value: viewVersion[k] as string }))} /></>}
      </Modal>
    </div>
  );
}

function ClearanceTab({ playerId, clearances, rtp, onSaved, pdfRun }: { playerId: string; clearances: Awaited<ReturnType<typeof api.listClearances>>; rtp: Awaited<ReturnType<typeof api.listRtp>>; onSaved: () => void; pdfRun: ReturnType<typeof useReportPreview>['run'] }) {
  const { caps, profile } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ clearance_status: '', restrictions: '', valid_until: '', decision_date: todayISO(), notes: '', signature: '', rtp_assessment_id: '' });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!form.clearance_status) return toast.error('Select the clearance decision.');
    if (form.clearance_status === 'Cleared with Restrictions' && !form.restrictions.trim()) return toast.error('Describe the restrictions.');
    if (form.signature.trim().length < 2) return toast.error('The physician must sign the decision (type full name).');
    setSaving(true);
    try {
      await api.createClearance({ ...form, player_id: playerId, physician_name: profile?.full_name ?? APP.physician, rtp_assessment_id: form.rtp_assessment_id || null, valid_until: form.valid_until || null });
      toast.success('Clearance decision recorded');
      setOpen(false); onSaved();
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <Card title="Medical Clearance History" actions={caps.editMedical && <Button size="sm" icon={<BadgeCheck className="h-4 w-4" />} onClick={() => setOpen(true)}>Issue Clearance Decision</Button>} padded={false}>
      <div className="px-5"><Table headers={['Ref', 'Decision date', 'Decision', 'Restrictions', 'Valid until', 'Physician', '']} empty={!clearances.length}>
        {clearances.map((c) => (
          <tr key={c.id}>
            <Td className="font-mono text-xs">{c.clearance_code}</Td><Td>{formatDate(c.decision_date)}</Td><Td><StatusBadge status={c.clearance_status} /></Td>
            <Td>{c.restrictions}</Td><Td>{formatDate(c.valid_until)}</Td><Td>{c.physician_name}</Td>
            <Td><Button size="sm" variant="ghost" icon={<FileText className="h-4 w-4" />} onClick={() => pdfRun(() => reports.clearanceCertificate(c.id))}>Certificate</Button></Td>
          </tr>
        ))}
      </Table></div>
      <Modal open={open} onClose={() => setOpen(false)} title="Issue Medical Clearance Decision" size="lg"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={saving} onClick={save}>Sign & Record Decision</Button></>}>
        <div className="space-y-4">
          <p className="rounded-lg bg-brand-cream p-3 text-xs text-neutral-700">Clearance is never generated automatically. This decision is recorded permanently under your name and cannot be edited – a new decision supersedes it.</p>
          <Field label="Clearance decision" required><Select value={form.clearance_status} onChange={(e) => setForm({ ...form, clearance_status: e.target.value })} options={EXAM_CLEARANCE} placeholder="Select…" /></Field>
          <Field label="Restrictions / conditions"><Textarea value={form.restrictions} onChange={(e) => setForm({ ...form, restrictions: e.target.value })} /></Field>
          <Grid>
            <Field label="Decision date" required><Input type="date" value={form.decision_date} onChange={(e) => setForm({ ...form, decision_date: e.target.value })} /></Field>
            <Field label="Valid until"><Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} /></Field>
          </Grid>
          {rtp.length > 0 && <Field label="Linked RTP assessment"><Select value={form.rtp_assessment_id} onChange={(e) => setForm({ ...form, rtp_assessment_id: e.target.value })} options={rtp.map((r) => ({ value: r.id, label: `${r.rtp_code} – ${r.decision} (${formatDate(r.decision_date)})` }))} placeholder="None" /></Field>}
          <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <Field label="Physician signature (type full name)" required><Input value={form.signature} onChange={(e) => setForm({ ...form, signature: e.target.value })} placeholder={profile?.full_name} className="font-serif italic" /></Field>
        </div>
      </Modal>
    </Card>
  );
}

function PlayerTimeline({ data }: { data: PlayerMedData }) {
  const items = useMemo<TimelineItem[]>(() => {
    const injuryCode = new Map(data.injuries.map((i) => [i.id, i.injury_code]));
    const list: TimelineItem[] = [
      ...data.exams.map((e) => ({ id: 'e' + e.id, date: e.examination_date, title: `${e.examination_type} examination`, description: e.clinical_summary ?? undefined, tone: 'dark' as const, icon: <Stethoscope className="h-3 w-3" /> })),
      ...data.injuries.map((i) => ({ id: 'i' + i.id, date: i.injury_date, title: `Injury recorded – ${i.body_region} ${i.injury_type}`, description: i.diagnosis ?? undefined, tone: 'red' as const, icon: <HeartPulse className="h-3 w-3" /> })),
      ...data.followups.map((f) => ({ id: 'f' + f.id, date: f.followup_date, title: `Follow-up (${injuryCode.get(f.injury_id)})`, description: `Pain ${f.pain_score ?? '—'}/10 · ${f.response_to_treatment ?? ''} ${f.progress_assessment ? '· ' + f.progress_assessment : ''}`, tone: 'orange' as const, icon: <ClipboardList className="h-3 w-3" /> })),
      ...data.treatments.map((t) => ({ id: 't' + t.id, date: t.treatment_date, title: `Treatment – ${t.treatment_type}`, description: t.details ?? undefined, tone: 'beige' as const, icon: <Pill className="h-3 w-3" /> })),
      ...data.sessions.map((s) => ({ id: 's' + s.id, date: s.session_date, title: `Rehabilitation session – ${s.phase}`, description: s.functional_progress ?? undefined, tone: 'blue' as const, icon: <Activity className="h-3 w-3" /> })),
      ...data.rtp.map((r) => ({ id: 'r' + r.id, date: r.decision_date, title: `Return-to-Play decision: ${r.decision}`, tone: 'green' as const, icon: <BadgeCheck className="h-3 w-3" /> })),
      ...data.clearances.map((c) => ({ id: 'c' + c.id, date: c.decision_date, title: `Clearance: ${c.clearance_status}`, description: c.restrictions ?? undefined, tone: 'green' as const, icon: <BadgeCheck className="h-3 w-3" /> })),
      ...data.availability.map((a) => ({ id: 'a' + a.id, date: a.effective_date, title: `Availability: ${a.availability}`, description: a.restrictions ?? undefined, tone: 'orange' as const, icon: <CalendarCheck2 className="h-3 w-3" /> })),
      ...data.histories.map((h) => ({ id: 'h' + h.id, date: h.created_at, title: `Medical history v${h.version} recorded`, description: h.change_reason ?? undefined, tone: 'beige' as const, icon: <User className="h-3 w-3" /> })),
    ];
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [data]);
  return items.length ? <Timeline items={items} /> : <EmptyState title="No activity yet" />;
}
type Awaited2<T extends (...a: never[]) => Promise<unknown>> = Awaited<ReturnType<T>>;
interface PlayerMedData {
  histories: MedicalHistory[]; exams: Awaited2<typeof api.listExaminations>; injuries: Awaited2<typeof api.listInjuries>;
  clearances: Awaited2<typeof api.listClearances>; availability: Awaited2<typeof api.listAvailability>;
  rehab: Awaited2<typeof api.listRehabPrograms>; rtp: Awaited2<typeof api.listRtp>;
  followups: Awaited2<typeof api.listFollowups>; treatments: Awaited2<typeof api.listTreatments>; sessions: Awaited2<typeof api.listRehabSessions>;
}
