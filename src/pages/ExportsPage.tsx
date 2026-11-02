import { useState } from 'react';
import { Database, Download, FileSpreadsheet, Lock, ShieldAlert } from 'lucide-react';
import * as api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useReference } from '../context/ReferenceContext';
import { useToast } from '../context/ToastContext';
import { downloadBlob, downloadCsv, type CsvColumn } from '../lib/csv';
import { BODY_REGIONS, INJURY_STATUSES, INJURY_TYPES } from '../lib/constants';
import { calculateAge, formatDate, formatDateTime, todayISO } from '../lib/format';
import { daysLost, inRange, injuryAnalytics, incidencePer1000h } from '../lib/analytics';
import type { Injury, Player } from '../lib/types';
import { Button, Card, ConfirmDialog, Field, PageHeader, Select } from '../components/ui';
import { PlayerPicker } from '../components/PlayerPicker';
import { DateRangeFilter, useDateRange } from '../components/DateRangeFilter';
import { supabase } from '../lib/supabase';

const d = formatDate;
const playerCols: CsvColumn<Player>[] = [
  { header: 'Player ID', value: (p) => p.player_code }, { header: 'Full Name', value: (p) => p.full_name }, { header: 'Date of Birth', value: (p) => d(p.date_of_birth) },
  { header: 'Age', value: (p) => calculateAge(p.date_of_birth) }, { header: 'Nationality', value: (p) => p.nationality }, { header: 'Jersey Number', value: (p) => p.jersey_number },
  { header: 'Playing Position', value: (p) => p.position }, { header: 'Height (cm)', value: (p) => p.height_cm }, { header: 'Weight (kg)', value: (p) => p.weight_kg },
  { header: 'BMI', value: (p) => p.bmi }, { header: 'Dominant Hand', value: (p) => p.dominant_hand }, { header: 'Team Category', value: (p) => p.team_category },
  { header: 'Registration Date', value: (p) => d(p.registration_date) }, { header: 'Player Status', value: (p) => p.status }, { header: 'Demo Record', value: (p) => (p.is_demo ? 'Yes' : 'No') },
];

export default function ExportsPage() {
  const { caps } = useAuth();
  const { players, seasons } = useReference();
  const toast = useToast();
  const dr = useDateRange('all');
  const [playerId, setPlayerId] = useState('');
  const [injuryType, setInjuryType] = useState('');
  const [injuryStatus, setInjuryStatus] = useState('');
  const [region, setRegion] = useState('');
  const [seasonId, setSeasonId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmBackup, setConfirmBackup] = useState(false);

  const seasonRange = seasons.find((s) => s.id === seasonId);
  const okDate = (date: string | null | undefined) => {
    if (seasonRange && !inRange(date, { from: seasonRange.start_date, to: seasonRange.end_date })) return false;
    return (!dr.range.from && !dr.range.to) || inRange(date, dr.range);
  };
  const okPlayer = (id: string) => !playerId || id === playerId;
  const stamp = todayISO().replace(/-/g, '');
  const name = (n: string) => `DarCity_${n}_${stamp}.csv`;
  const pName = (id: string) => players.find((p) => p.id === id)?.full_name ?? '';
  const pCode = (id: string) => players.find((p) => p.id === id)?.player_code ?? '';

  const run = async (key: string, fn: () => Promise<number>) => {
    setBusy(key);
    try {
      const n = await fn();
      toast.success(`${n} record(s) exported`);
      void api.logEvent('EXPORT_CSV', key, null, { rows: n, filters: { playerId, injuryType, injuryStatus, region, seasonId, ...dr.range } });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const filterInjuries = (list: Injury[]) => list.filter((i) => okPlayer(i.player_id) && okDate(i.injury_date) && (!injuryType || i.injury_type === injuryType) && (!injuryStatus || i.status === injuryStatus) && (!region || i.body_region === region));

  const exportsList: { key: string; title: string; desc: string; allowed: boolean; fn: () => Promise<number> }[] = [
    { key: 'all_players', title: 'All Players', desc: 'Every registered player including archived', allowed: true, fn: async () => { const r = players.filter((p) => okPlayer(p.id) && (!seasonId || p.season_id === seasonId)); downloadCsv(name('All_Players'), r, playerCols); return r.length; } },
    { key: 'active_players', title: 'Active Players', desc: 'Current active roster', allowed: true, fn: async () => { const r = players.filter((p) => p.status === 'active' && okPlayer(p.id)); downloadCsv(name('Active_Players'), r, playerCols); return r.length; } },
    { key: 'personal_info', title: 'Player Personal Information', desc: 'Contact details and emergency contacts', allowed: caps.viewEmergencyContacts, fn: async () => {
      const contacts = await api.listAllContacts();
      const r = players.filter((p) => okPlayer(p.id));
      downloadCsv(name('Player_Personal_Information'), r, [
        ...playerCols.slice(0, 5), { header: 'Phone Number', value: (p) => p.phone }, { header: 'Email Address', value: (p) => p.email }, { header: 'Residential Address', value: (p) => p.address },
        { header: 'Emergency Contact Name', value: (p) => contacts.find((c) => c.player_id === p.id)?.contact_name }, { header: 'Emergency Contact Relationship', value: (p) => contacts.find((c) => c.player_id === p.id)?.relationship },
        { header: 'Emergency Contact Phone', value: (p) => contacts.find((c) => c.player_id === p.id)?.phone },
      ]);
      return r.length;
    } },
    { key: 'examinations', title: 'Medical Examinations', desc: 'Vital signs, assessment and clearance', allowed: caps.exportMedical, fn: async () => {
      const r = (await api.listExaminations()).filter((e) => okPlayer(e.player_id) && okDate(e.examination_date));
      downloadCsv(name('Medical_Examinations'), r, [
        { header: 'Examination ID', value: (e) => e.exam_code }, { header: 'Player ID', value: (e) => pCode(e.player_id) }, { header: 'Player Name', value: (e) => e.players?.full_name },
        { header: 'Examination Date', value: (e) => d(e.examination_date) }, { header: 'Examination Type', value: (e) => e.examination_type }, { header: 'Physician', value: (e) => e.physician_name },
        { header: 'Blood Pressure (mmHg)', value: (e) => (e.bp_systolic ? `${e.bp_systolic}/${e.bp_diastolic}` : '') }, { header: 'Heart Rate (bpm)', value: (e) => e.heart_rate },
        { header: 'Respiratory Rate (/min)', value: (e) => e.respiratory_rate }, { header: 'Temperature (°C)', value: (e) => e.temperature_c }, { header: 'Oxygen Saturation (%)', value: (e) => e.oxygen_saturation },
        { header: 'Height (cm)', value: (e) => e.height_cm }, { header: 'Weight (kg)', value: (e) => e.weight_kg }, { header: 'BMI', value: (e) => e.bmi },
        { header: 'Laboratory Tests', value: (e) => e.laboratory_tests }, { header: 'ECG', value: (e) => e.ecg }, { header: 'Clinical Summary', value: (e) => e.clinical_summary },
        { header: 'Identified Problems', value: (e) => e.identified_problems }, { header: 'Recommendations', value: (e) => e.recommendations }, { header: 'Follow-up Date', value: (e) => d(e.follow_up_date) },
        { header: 'Clearance Decision', value: (e) => e.clearance_status }, { header: 'Clearance Restrictions', value: (e) => e.clearance_restrictions },
      ]);
      return r.length;
    } },
    { key: 'medical_history', title: 'Medical History', desc: 'Current version per player (all versions in backup)', allowed: caps.exportMedical, fn: async () => {
      const r = (await api.listHistories()).filter((h) => h.is_current && okPlayer(h.player_id));
      downloadCsv(name('Medical_History'), r, [
        { header: 'Player ID', value: (h) => pCode(h.player_id) }, { header: 'Player Name', value: (h) => pName(h.player_id) }, { header: 'Version', value: (h) => h.version },
        { header: 'Previous Medical Conditions', value: (h) => h.previous_conditions }, { header: 'Chronic Diseases', value: (h) => h.chronic_diseases }, { header: 'Previous Injuries', value: (h) => h.previous_injuries },
        { header: 'Previous Surgeries', value: (h) => h.previous_surgeries }, { header: 'Drug Allergies', value: (h) => h.drug_allergies }, { header: 'Food Allergies', value: (h) => h.food_allergies },
        { header: 'Current Medications', value: (h) => h.current_medications }, { header: 'Previous Hospitalizations', value: (h) => h.previous_hospitalizations }, { header: 'Family Medical History', value: (h) => h.family_history },
        { header: 'Relevant Information', value: (h) => h.relevant_information }, { header: 'Physician Notes', value: (h) => h.physician_notes }, { header: 'Recorded', value: (h) => formatDateTime(h.created_at) },
      ]);
      return r.length;
    } },
    { key: 'injuries', title: 'All Injuries', desc: 'Injury register (filters apply)', allowed: caps.exportMedical, fn: async () => {
      const r = filterInjuries(await api.listInjuries({ includeArchived: true }));
      downloadCsv(name('Injuries'), r, [
        { header: 'Injury ID', value: (i) => i.injury_code }, { header: 'Player ID', value: (i) => pCode(i.player_id) }, { header: 'Player Name', value: (i) => i.players?.full_name },
        { header: 'Jersey Number', value: (i) => i.players?.jersey_number }, { header: 'Playing Position', value: (i) => i.players?.position }, { header: 'Date of Injury', value: (i) => d(i.injury_date) },
        { header: 'Time of Injury', value: (i) => i.injury_time?.slice(0, 5) }, { header: 'Setting', value: (i) => i.setting }, { header: 'Match Opponent', value: (i) => i.match_opponent },
        { header: 'Training Session', value: (i) => i.training_session }, { header: 'Mechanism', value: (i) => i.mechanism }, { header: 'Contact / Non-Contact', value: (i) => i.contact_type },
        { header: 'Acute / Overuse', value: (i) => i.onset }, { header: 'Body Region', value: (i) => i.body_region }, { header: 'Body Side', value: (i) => i.body_side },
        { header: 'Injury Type', value: (i) => i.injury_type }, { header: 'Anatomical Structure', value: (i) => i.anatomical_structure }, { header: 'Clinical Diagnosis', value: (i) => i.diagnosis },
        { header: 'Severity', value: (i) => i.severity }, { header: 'Grade', value: (i) => i.injury_grade }, { header: 'Status', value: (i) => i.status }, { header: 'Recurrent', value: (i) => (i.is_recurrent ? 'Yes' : 'No') },
        { header: 'Expected Return', value: (i) => d(i.expected_return_date) }, { header: 'Return-to-Play Date', value: (i) => d(i.return_to_play_date) }, { header: 'Closed Date', value: (i) => d(i.closed_date) },
        { header: 'Days Lost', value: (i) => daysLost(i) },
      ]);
      return r.length;
    } },
    { key: 'followups', title: 'Injury Follow-ups', desc: 'All follow-up assessments', allowed: caps.exportMedical, fn: async () => {
      const injuries = filterInjuries(await api.listInjuries({ includeArchived: true }));
      const byId = new Map(injuries.map((i) => [i.id, i]));
      const r = (await api.listFollowups()).filter((f) => byId.has(f.injury_id));
      downloadCsv(name('Injury_Followups'), r, [
        { header: 'Injury ID', value: (f) => byId.get(f.injury_id)?.injury_code }, { header: 'Player Name', value: (f) => byId.get(f.injury_id)?.players?.full_name },
        { header: 'Follow-up Date', value: (f) => d(f.followup_date) }, { header: 'Pain Score (0-10)', value: (f) => f.pain_score }, { header: 'Swelling', value: (f) => f.swelling },
        { header: 'Tenderness', value: (f) => f.tenderness }, { header: 'Range of Motion', value: (f) => f.range_of_motion }, { header: 'Muscle Strength', value: (f) => f.muscle_strength },
        { header: 'Functional Status', value: (f) => f.functional_status }, { header: 'Clinical Findings', value: (f) => f.clinical_findings }, { header: 'Special Tests', value: (f) => f.special_tests },
        { header: 'Treatment Provided', value: (f) => f.treatment_provided }, { header: 'Response to Treatment', value: (f) => f.response_to_treatment }, { header: 'Progress Assessment', value: (f) => f.progress_assessment },
        { header: 'Updated Diagnosis', value: (f) => f.updated_diagnosis }, { header: 'Next Follow-up', value: (f) => d(f.next_followup_date) }, { header: 'Physician Notes', value: (f) => f.physician_notes },
      ]);
      return r.length;
    } },
    { key: 'rehabilitation', title: 'Rehabilitation Records', desc: 'Programmes and sessions', allowed: caps.exportMedical, fn: async () => {
      const [programs, sessions] = await Promise.all([api.listRehabPrograms(), api.listRehabSessions()]);
      const progs = programs.filter((p) => okPlayer(p.player_id) && okDate(p.start_date));
      const byId = new Map(progs.map((p) => [p.id, p]));
      const r = sessions.filter((s) => byId.has(s.program_id));
      downloadCsv(name('Rehabilitation_Sessions'), r, [
        { header: 'Programme ID', value: (s) => byId.get(s.program_id)?.program_code }, { header: 'Player Name', value: (s) => byId.get(s.program_id)?.players?.full_name },
        { header: 'Injury ID', value: (s) => byId.get(s.program_id)?.injuries?.injury_code }, { header: 'Programme Start', value: (s) => d(byId.get(s.program_id)?.start_date) },
        { header: 'Programme Status', value: (s) => byId.get(s.program_id)?.status }, { header: 'Session Date', value: (s) => d(s.session_date) }, { header: 'Phase', value: (s) => s.phase },
        { header: 'Exercises', value: (s) => s.exercises }, { header: 'Training Load', value: (s) => s.training_load }, { header: 'Pain Score (0-10)', value: (s) => s.pain_score },
        { header: 'Range of Motion', value: (s) => s.range_of_motion }, { header: 'Strength Progress', value: (s) => s.strength_progress }, { header: 'Functional Progress', value: (s) => s.functional_progress },
        { header: 'Physiotherapy Notes', value: (s) => s.physiotherapy_notes }, { header: 'Physician Review', value: (s) => s.physician_review },
      ]);
      return r.length;
    } },
    { key: 'clearances', title: 'Medical Clearance Records', desc: 'All clearance and RTP decisions', allowed: caps.exportMedical, fn: async () => {
      const [cl, rtp] = await Promise.all([api.listClearances(), api.listRtp()]);
      const rows = [
        ...cl.filter((c) => okPlayer(c.player_id) && okDate(c.decision_date)).map((c) => ({ ref: c.clearance_code, kind: 'Medical Clearance', player: c.players?.full_name, date: c.decision_date, decision: c.clearance_status, notes: c.restrictions, physician: c.physician_name })),
        ...rtp.filter((r) => okPlayer(r.player_id) && okDate(r.decision_date)).map((r) => ({ ref: r.rtp_code, kind: 'Return to Play', player: r.players?.full_name, date: r.decision_date, decision: r.decision, notes: r.clinical_notes, physician: r.physician_name })),
      ].sort((a, b) => b.date.localeCompare(a.date));
      downloadCsv(name('Clearance_Records'), rows, [
        { header: 'Reference', value: (r) => r.ref }, { header: 'Record Type', value: (r) => r.kind }, { header: 'Player Name', value: (r) => r.player }, { header: 'Decision Date', value: (r) => d(r.date) },
        { header: 'Decision', value: (r) => r.decision }, { header: 'Restrictions / Notes', value: (r) => r.notes }, { header: 'Physician', value: (r) => r.physician },
      ]);
      return rows.length;
    } },
    { key: 'availability', title: 'Player Availability', desc: caps.viewMedical ? 'Full availability history' : 'Current approved availability', allowed: true, fn: async () => {
      if (!caps.viewMedical) {
        const r = (await api.getTeamAvailability()).filter((x) => okPlayer(x.player_id));
        downloadCsv(name('Availability'), r, [
          { header: 'Player Name', value: (x) => x.full_name }, { header: 'Jersey Number', value: (x) => x.jersey_number }, { header: 'Position', value: (x) => x.position },
          { header: 'Medical Status', value: (x) => x.medical_status }, { header: 'Training Availability', value: (x) => x.availability }, { header: 'Restrictions', value: (x) => x.restrictions },
          { header: 'Effective Date', value: (x) => d(x.effective_date) }, { header: 'Next Follow-up', value: (x) => d(x.next_followup_date) },
        ]);
        return r.length;
      }
      const r = (await api.listAvailability()).filter((a) => okPlayer(a.player_id) && okDate(a.effective_date));
      downloadCsv(name('Availability_History'), r, [
        { header: 'Player Name', value: (a) => pName(a.player_id) }, { header: 'Effective Date', value: (a) => d(a.effective_date) }, { header: 'Training Availability', value: (a) => a.availability },
        { header: 'Medical Status', value: (a) => a.medical_status }, { header: 'Restrictions', value: (a) => a.restrictions }, { header: 'Staff Notes', value: (a) => a.staff_notes },
        { header: 'Internal Notes', value: (a) => a.internal_notes }, { header: 'Shared with Staff', value: (a) => (a.shared_with_staff ? 'Yes' : 'No') }, { header: 'Next Follow-up', value: (a) => d(a.next_followup_date) },
      ]);
      return r.length;
    } },
    { key: 'statistics', title: 'Team Medical Statistics', desc: 'Aggregated injury statistics for the filtered period', allowed: caps.exportMedical, fn: async () => {
      const [injuries, rehab, rtp, exposures] = await Promise.all([api.listInjuries(), api.listRehabPrograms(), api.listRtp(), api.listExposures()]);
      const inj = filterInjuries(injuries);
      const a = injuryAnalytics(inj, players, rehab.filter((r) => okDate(r.start_date)), rtp.filter((r) => okDate(r.decision_date)));
      const inc = incidencePer1000h(inj.length, exposures.filter((e) => okDate(e.session_date)));
      const rows: { metric: string; category: string; value: string | number }[] = [
        { metric: 'Total injuries', category: '', value: a.total }, { metric: 'New injuries', category: '', value: a.newInjuries }, { metric: 'Recurrent injuries', category: '', value: a.recurrent },
        { metric: 'Players injured', category: '', value: a.playersInjured }, { metric: 'Injuries per injured player', category: '', value: a.injuriesPerPlayer },
        { metric: 'Total days lost', category: '', value: a.totalDaysLost }, { metric: 'Average days lost (completed injuries)', category: '', value: a.averageDaysLost },
        { metric: 'Average rehabilitation duration (days)', category: '', value: a.averageRehabDays },
        { metric: 'Exposure (player-hours)', category: '', value: inc ? inc.hours : 'No exposure data' }, { metric: 'Incidence per 1,000 player-hours', category: '', value: inc ? inc.rate : 'Not calculable' },
        ...a.byRegion.map((x) => ({ metric: 'Injuries by body region', category: x.name, value: x.value })),
        ...a.byType.map((x) => ({ metric: 'Injuries by type', category: x.name, value: x.value })),
        ...a.byPosition.map((x) => ({ metric: 'Injuries by position', category: x.name, value: x.value })),
        ...a.byMechanism.map((x) => ({ metric: 'Injuries by mechanism', category: x.name, value: x.value })),
        ...a.contact.map((x) => ({ metric: 'Contact vs non-contact', category: x.name, value: x.value })),
        ...a.setting.map((x) => ({ metric: 'Match vs training', category: x.name, value: x.value })),
        ...a.daysLostByRegion.map((x) => ({ metric: 'Days lost by region', category: x.name, value: x.value })),
        ...a.rtpOutcomes.map((x) => ({ metric: 'Return-to-play outcomes', category: x.name, value: x.value })),
      ];
      downloadCsv(name('Team_Medical_Statistics'), rows, [{ header: 'Metric', value: (r) => r.metric }, { header: 'Category', value: (r) => r.category }, { header: 'Value', value: (r) => r.value }]);
      return rows.length;
    } },
  ];

  const backup = async () => {
    setConfirmBackup(false);
    setBusy('backup');
    try {
      const tables = ['players', 'player_emergency_contacts', 'medical_histories', 'medical_examinations', 'examination_findings', 'injuries', 'injury_followups', 'treatments',
        'rehabilitation_programs', 'rehabilitation_sessions', 'rtp_assessments', 'medical_clearances', 'player_availability', 'medical_documents', 'team_seasons', 'team_exposures'];
      const out: Record<string, unknown> = { generated_at: new Date().toISOString(), application: 'Dar City – Team Medical Management System', note: 'CONFIDENTIAL full medical backup. Document files are stored separately in Supabase Storage.' };
      for (const t of tables) {
        const { data, error } = await supabase.from(t).select('*').limit(100000);
        if (error) throw new Error(`${t}: ${error.message}`);
        out[t] = data;
      }
      downloadBlob(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }), `DarCity_Medical_Backup_${stamp}.json`);
      void api.logEvent('BACKUP_EXPORT', 'all', null, { tables });
      toast.success('Full medical backup downloaded. Store it in an encrypted location.');
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  return (
    <div>
      <PageHeader title="Export Center" subtitle="UTF-8 CSV exports compatible with Microsoft Excel. PDF exports are in Medical Reports." icon={<FileSpreadsheet className="h-6 w-6" />} />
      <Card title="Filters" className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Date range"><DateRangeFilter state={dr} /></Field>
          <Field label="Season"><Select value={seasonId} onChange={(e) => setSeasonId(e.target.value)} options={seasons.map((s) => ({ value: s.id, label: s.name }))} placeholder="All seasons" /></Field>
          <Field label="Player"><PlayerPicker value={playerId} onChange={setPlayerId} includeInactive placeholder="All players" /></Field>
          {caps.exportMedical && <>
            <Field label="Injury type"><Select value={injuryType} onChange={(e) => setInjuryType(e.target.value)} options={INJURY_TYPES} placeholder="All types" /></Field>
            <Field label="Injury status"><Select value={injuryStatus} onChange={(e) => setInjuryStatus(e.target.value)} options={INJURY_STATUSES} placeholder="All statuses" /></Field>
            <Field label="Body region"><Select value={region} onChange={(e) => setRegion(e.target.value)} options={BODY_REGIONS} placeholder="All regions" /></Field>
          </>}
        </div>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {exportsList.map((x) => (
          <Card key={x.key}>
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="font-semibold">{x.title}</h3><p className="text-xs text-neutral-500">{x.desc}</p></div>
              {x.allowed ? <Button size="sm" icon={<Download className="h-4 w-4" />} loading={busy === x.key} onClick={() => run(x.key, x.fn)}>CSV</Button> : <Lock className="h-4 w-4 text-neutral-300" />}
            </div>
          </Card>
        ))}
      </div>
      {caps.fullBackup && (
        <Card className="mt-6 border-brand-red/30" title="Full Medical Backup (Team Physician only)">
          <div className="flex flex-wrap items-center gap-4">
            <ShieldAlert className="h-8 w-8 text-brand-red" />
            <p className="flex-1 text-sm text-neutral-600">Downloads every medical table as a single JSON file. This file contains all confidential medical data – store it only on an encrypted, access-controlled device. Supabase also performs automatic daily database backups.</p>
            <Button variant="danger" icon={<Database className="h-4 w-4" />} loading={busy === 'backup'} onClick={() => setConfirmBackup(true)}>Download Full Backup</Button>
          </div>
        </Card>
      )}
      <ConfirmDialog open={confirmBackup} title="Confidential backup" confirmLabel="Download" danger onConfirm={backup} onCancel={() => setConfirmBackup(false)}
        message="You are about to download the complete confidential medical database. This action is recorded in the audit log. Continue?" />
    </div>
  );
}
