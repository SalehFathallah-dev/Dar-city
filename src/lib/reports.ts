import { ReportBuilder } from './pdf';
import * as api from './api';
import { calculateAge, fmt, formatDate, todayISO, daysBetween } from './format';
import { daysLost, inRange, injuryAnalytics, isOpenInjury, incidencePer1000h, latestByPlayer, type DateRange } from './analytics';
import { ORTHOPEDIC_REGIONS, SYSTEMATIC_REGIONS } from './constants';
import type { Examination, Injury, Player } from './types';

export interface GeneratedReport { blob: Blob; filename: string; ref: string; title: string }

const safe = (s: string) => s.replace(/^DEMO\s+/i, 'DEMO-').replace(/[^a-z0-9-]+/gi, '_').replace(/_+/g, '_');
const done = (r: ReportBuilder, name: string): GeneratedReport => ({ blob: r.finish(), filename: `${safe(name)}_${r.ref}.pdf`, ref: r.ref, title: r.title });

function playerBlock(r: ReportBuilder, p: Player, extra: [string, unknown][] = []) {
  r.section('Player Information');
  r.keyValues([
    ['Player Name', p.full_name], ['Player ID', p.player_code],
    ['Jersey Number', p.jersey_number != null ? `#${p.jersey_number}` : null], ['Playing Position', p.position],
    ['Date of Birth', formatDate(p.date_of_birth)], ['Age', calculateAge(p.date_of_birth)],
    ...extra,
  ], 2);
}

function injurySummaryPairs(i: Injury): [string, unknown][] {
  return [
    ['Injury ID', i.injury_code], ['Date of Injury', `${formatDate(i.injury_date)}${i.injury_time ? ' ' + i.injury_time.slice(0, 5) : ''}`],
    ['Setting', [i.setting, i.match_opponent && `vs ${i.match_opponent}`, i.training_session].filter(Boolean).join(' – ')],
    ['Mechanism', i.mechanism], ['Contact / Non-Contact', i.contact_type], ['Acute / Overuse', i.onset],
    ['Body Region', i.body_region], ['Body Side', i.body_side], ['Injury Type', i.injury_type],
    ['Anatomical Structure', i.anatomical_structure], ['Clinical Diagnosis', i.diagnosis],
    ['Severity', i.severity], ['Grade', i.injury_grade], ['Status', i.status], ['Recurrent Injury', i.is_recurrent],
    ['Expected Return', formatDate(i.expected_return_date)], ['Return-to-Play Date', formatDate(i.return_to_play_date)],
    ['Days Lost', daysLost(i)],
  ];
}

function examFindingsTable(r: ReportBuilder, findings: Awaited<ReturnType<typeof api.getExamination>>['findings']) {
  const order = [...SYSTEMATIC_REGIONS, ...ORTHOPEDIC_REGIONS] as string[];
  const sorted = [...findings].sort((a, b) => order.indexOf(a.region) - order.indexOf(b.region));
  const sys = sorted.filter((f) => f.category === 'Systematic');
  const ortho = sorted.filter((f) => f.category === 'Orthopedic');
  r.section('Systematic Examination');
  r.table(['Region', 'Result', 'Clinical Findings', 'Notes'],
    sys.map((f) => [f.region, f.is_normal == null ? '—' : f.is_normal ? 'Normal' : 'Abnormal', fmt(f.clinical_findings), fmt(f.notes)]),
    { columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: 20 } } });
  r.section('Orthopedic & Sports Examination');
  r.table(['Region', 'Result', 'Findings', 'Pain', 'ROM', 'Strength', 'Stability', 'Special Tests'],
    ortho.map((f) => [f.region.replace(' Examination', ''), f.is_normal == null ? '—' : f.is_normal ? 'Normal' : 'Abnormal', fmt(f.clinical_findings), fmt(f.pain), fmt(f.range_of_motion), fmt(f.muscle_strength), fmt(f.joint_stability), fmt(f.special_tests)]),
    { fontSize: 7.4, columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 16 } } });
}

function examContent(r: ReportBuilder, e: Examination) {
  r.section('Vital Signs & Anthropometry');
  r.keyValues([
    ['Blood Pressure', e.bp_systolic ? `${e.bp_systolic}/${e.bp_diastolic} mmHg` : null], ['Heart Rate', fmt(e.heart_rate, ' bpm')],
    ['Respiratory Rate', fmt(e.respiratory_rate, ' /min')], ['Temperature', fmt(e.temperature_c, ' °C')],
    ['Oxygen Saturation', fmt(e.oxygen_saturation, ' %')], ['Height', fmt(e.height_cm, ' cm')],
    ['Weight', fmt(e.weight_kg, ' kg')], ['BMI', fmt(e.bmi, ' kg/m²')],
  ], 4);
}

// 1. Individual player medical profile
export async function playerMedicalProfile(playerId: string): Promise<GeneratedReport> {
  const [p, hist, exams, injuries, clearances, avail] = await Promise.all([
    api.getPlayer(playerId), api.listHistories(playerId), api.listExaminations(playerId),
    api.listInjuries({ playerId }), api.listClearances(playerId), api.listAvailability(playerId),
  ]);
  const r = await new ReportBuilder({ title: 'Individual Player Medical Profile', refPrefix: 'MPR', subtitle: p.full_name }).start();
  playerBlock(r, p, [['Height', fmt(p.height_cm, ' cm')], ['Weight', fmt(p.weight_kg, ' kg')], ['BMI', fmt(p.bmi)], ['Dominant Hand', p.dominant_hand], ['Nationality', p.nationality], ['Status', p.status]]);
  const a = avail[0]; const c = clearances[0];
  r.section('Current Status');
  r.keyValues([['Training Availability', a?.availability ?? 'Not recorded'], ['Medical Status', a?.medical_status], ['Restrictions', a?.restrictions],
    ['Latest Clearance', c ? `${c.clearance_status} (${formatDate(c.decision_date)})` : 'No clearance on record']], 2);
  const h = hist.find((x) => x.is_current);
  r.section('Medical History');
  if (h) {
    r.keyValues([
      ['Previous Medical Conditions', h.previous_conditions], ['Chronic Diseases', h.chronic_diseases], ['Previous Injuries', h.previous_injuries],
      ['Previous Surgeries', h.previous_surgeries], ['Drug Allergies', h.drug_allergies], ['Food Allergies', h.food_allergies],
      ['Current Medications', h.current_medications], ['Previous Hospitalizations', h.previous_hospitalizations],
      ['Family Medical History', h.family_history], ['Relevant Information', h.relevant_information],
    ], 2);
    r.paragraph('Physician Notes', h.physician_notes);
    r.note(`Medical history version ${h.version}, recorded ${formatDate(h.created_at)}.`);
  } else r.paragraph(null, 'No medical history recorded.');
  r.section('Medical Examinations');
  r.table(['Exam ID', 'Date', 'Type', 'Physician', 'Clearance'], exams.map((e) => [e.exam_code, formatDate(e.examination_date), e.examination_type, e.physician_name, fmt(e.clearance_status)]));
  r.section('Injury Record');
  r.table(['Injury ID', 'Date', 'Region', 'Type / Diagnosis', 'Severity', 'Status', 'Days Lost'],
    injuries.map((i) => [i.injury_code, formatDate(i.injury_date), `${i.body_region}${i.body_side ? ' (' + i.body_side + ')' : ''}`, `${i.injury_type}${i.diagnosis ? ' – ' + i.diagnosis : ''}`, i.severity, i.status, daysLost(i)]));
  r.section('Clearance History');
  r.table(['Ref', 'Date', 'Decision', 'Restrictions', 'Physician'], clearances.map((x) => [x.clearance_code, formatDate(x.decision_date), x.clearance_status, fmt(x.restrictions), x.physician_name]));
  r.signature({ date: todayISO() });
  return done(r, `Medical_Profile_${p.full_name}`);
}

// 2. Player registration report (non-clinical)
export async function playerRegistration(playerId: string): Promise<GeneratedReport> {
  const [p, contacts, seasons] = await Promise.all([api.getPlayer(playerId), api.listContacts(playerId).catch(() => []), api.listSeasons()]);
  const r = await new ReportBuilder({ title: 'Player Registration Report', refPrefix: 'REG', subtitle: p.full_name }).start();
  r.section('Personal Information');
  r.keyValues([
    ['Player ID', p.player_code], ['Full Name', p.full_name], ['Date of Birth', formatDate(p.date_of_birth)], ['Age', calculateAge(p.date_of_birth)],
    ['Nationality', p.nationality], ['Phone Number', p.phone], ['Email Address', p.email], ['Residential Address', p.address],
  ], 2);
  r.section('Emergency Contacts');
  r.table(['Name', 'Relationship', 'Phone'], contacts.map((c) => [c.contact_name, fmt(c.relationship), c.phone]));
  r.section('Basketball Information');
  r.keyValues([
    ['Jersey Number', p.jersey_number != null ? `#${p.jersey_number}` : null], ['Playing Position', p.position],
    ['Height', fmt(p.height_cm, ' cm')], ['Weight', fmt(p.weight_kg, ' kg')], ['BMI', fmt(p.bmi)], ['Dominant Hand', p.dominant_hand],
    ['Team Category', p.team_category], ['Registration Date', formatDate(p.registration_date)],
    ['Season', seasons.find((s) => s.id === p.season_id)?.name], ['Player Status', p.status.toUpperCase()],
  ], 2);
  r.signature({ date: todayISO(), label: 'Registering Officer – Signature' });
  return done(r, `Registration_${p.full_name}`);
}

// 3 & 4. Pre-season / periodic (and other) examination
export async function examinationReport(examId: string): Promise<GeneratedReport> {
  const { exam: e, findings } = await api.getExamination(examId);
  const p = await api.getPlayer(e.player_id);
  const title = e.examination_type === 'Pre-Season' ? 'Pre-Season Medical Examination'
    : e.examination_type === 'Periodic' ? 'Periodic Medical Examination' : `${e.examination_type} Medical Examination`;
  const r = await new ReportBuilder({ title, refPrefix: 'EXM', subtitle: `${p.full_name} · ${e.exam_code}` }).start();
  playerBlock(r, p, [['Examination ID', e.exam_code], ['Examination Date', formatDate(e.examination_date)], ['Examination Type', e.examination_type], ['Physician', e.physician_name]]);
  examContent(r, e);
  examFindingsTable(r, findings);
  r.section('Additional Investigations');
  r.keyValues([['Laboratory Tests', e.laboratory_tests], ['ECG', e.ecg], ['X-Ray', e.xray], ['MRI', e.mri], ['Ultrasound', e.ultrasound], ['Other', e.other_investigations]], 2);
  r.section('Final Medical Assessment');
  r.paragraph('Clinical Summary', e.clinical_summary);
  r.paragraph('Identified Medical Problems', e.identified_problems);
  r.paragraph('Recommendations', e.recommendations);
  r.paragraph('Further Investigations Required', e.further_investigations);
  r.keyValues([['Follow-up Date', formatDate(e.follow_up_date)]], 2);
  r.section('Medical Clearance');
  if (e.clearance_status) {
    r.highlight('Physician decision', e.clearance_status, e.clearance_status.startsWith('Cleared for Full') ? 'green' : e.clearance_status.startsWith('Cleared') ? 'orange' : 'red');
    if (e.clearance_restrictions) r.paragraph('Restrictions', e.clearance_restrictions);
  } else r.paragraph(null, 'Clearance decision not yet documented by the physician.');
  r.signature({ name: e.physician_name, date: e.examination_date, signedText: e.physician_signature });
  return done(r, `Examination_${p.full_name}_${e.exam_code}`);
}

// 5. Individual injury report
export async function injuryReport(injuryId: string): Promise<GeneratedReport> {
  const i = await api.getInjury(injuryId);
  const [p, treatments, followups, rtp] = await Promise.all([api.getPlayer(i.player_id), api.listTreatments(injuryId), api.listFollowups(injuryId), api.listRtp({ injuryId })]);
  const r = await new ReportBuilder({ title: 'Individual Injury Report', refPrefix: 'INJ', subtitle: `${p.full_name} · ${i.injury_code}` }).start();
  playerBlock(r, p);
  r.section('Injury Details');
  r.keyValues(injurySummaryPairs(i), 2);
  r.section('Clinical Assessment');
  r.paragraph('Clinical Examination', i.clinical_examination);
  r.paragraph('Special Tests', i.special_tests);
  r.paragraph('Imaging Results', i.imaging_results);
  r.paragraph("Physician's Assessment", i.physician_assessment);
  r.section('Treatment');
  r.table(['Date', 'Type', 'Details', 'Medication / Dose', 'Provided By'], treatments.map((t) => [formatDate(t.treatment_date), t.treatment_type, fmt(t.details), [t.medication_name, t.dosage].filter(Boolean).join(' – ') || '—', fmt(t.provided_by)]));
  r.section('Follow-up Summary');
  r.table(['Date', 'Pain', 'Swelling', 'Response', 'Progress'], followups.map((f) => [formatDate(f.followup_date), fmt(f.pain_score, '/10'), fmt(f.swelling), fmt(f.response_to_treatment), fmt(f.progress_assessment)]));
  r.section('Return-to-Play Decisions');
  r.table(['Ref', 'Date', 'Decision', 'Physician'], rtp.map((x) => [x.rtp_code, formatDate(x.decision_date), x.decision, x.physician_name]));
  if (i.closure_notes) r.paragraph('Closure Notes', i.closure_notes);
  r.signature({ date: todayISO() });
  return done(r, `Injury_${p.full_name}_${i.injury_code}`);
}

// 6. Injury follow-up report
export async function followupReport(injuryId: string): Promise<GeneratedReport> {
  const i = await api.getInjury(injuryId);
  const [p, followups] = await Promise.all([api.getPlayer(i.player_id), api.listFollowups(injuryId)]);
  const r = await new ReportBuilder({ title: 'Injury Follow-up Report', refPrefix: 'IFU', subtitle: `${p.full_name} · ${i.injury_code} · ${i.diagnosis ?? i.injury_type}` }).start();
  playerBlock(r, p, [['Injury', `${i.injury_code} – ${i.body_region} ${i.injury_type}`], ['Date of Injury', formatDate(i.injury_date)]]);
  if (followups.length >= 2) {
    const first = followups[0]!, last = followups[followups.length - 1]!;
    r.section('Progress Comparison (first vs latest)');
    r.table(['Parameter', formatDate(first.followup_date), formatDate(last.followup_date)], [
      ['Pain Score', fmt(first.pain_score, '/10'), fmt(last.pain_score, '/10')], ['Swelling', fmt(first.swelling), fmt(last.swelling)],
      ['Tenderness', fmt(first.tenderness), fmt(last.tenderness)], ['Range of Motion', fmt(first.range_of_motion), fmt(last.range_of_motion)],
      ['Muscle Strength', fmt(first.muscle_strength), fmt(last.muscle_strength)], ['Functional Status', fmt(first.functional_status), fmt(last.functional_status)],
    ]);
  }
  followups.forEach((f, idx) => {
    r.section(`Follow-up ${idx + 1} – ${formatDate(f.followup_date)}`);
    r.keyValues([
      ['Pain Score', fmt(f.pain_score, '/10')], ['Swelling', f.swelling], ['Tenderness', f.tenderness], ['Range of Motion', f.range_of_motion],
      ['Muscle Strength', f.muscle_strength], ['Functional Status', f.functional_status], ['Response to Treatment', f.response_to_treatment], ['Next Follow-up', formatDate(f.next_followup_date)],
    ], 4);
    r.keyValues([['Clinical Findings', f.clinical_findings], ['Special Tests', f.special_tests], ['Treatment Provided', f.treatment_provided], ['Progress Assessment', f.progress_assessment], ['Updated Diagnosis', f.updated_diagnosis], ['Physician Notes', f.physician_notes]], 2);
  });
  if (!followups.length) r.paragraph(null, 'No follow-up assessments recorded.');
  r.signature({ date: todayISO() });
  return done(r, `Followups_${p.full_name}_${i.injury_code}`);
}

// 7. Rehabilitation progress report
export async function rehabReport(programId: string): Promise<GeneratedReport> {
  const prog = await api.getRehabProgram(programId);
  const [p, sessions] = await Promise.all([api.getPlayer(prog.player_id), api.listRehabSessions(programId)]);
  const r = await new ReportBuilder({ title: 'Rehabilitation Progress Report', refPrefix: 'RHB', subtitle: `${p.full_name} · ${prog.program_code}` }).start();
  playerBlock(r, p);
  r.section('Programme');
  r.keyValues([
    ['Programme ID', prog.program_code], ['Associated Injury', `${prog.injuries?.injury_code} – ${prog.injuries?.diagnosis ?? prog.injuries?.injury_type}`],
    ['Start Date', formatDate(prog.start_date)], ['Duration', `${daysBetween(prog.start_date, prog.end_date ?? todayISO())} days`],
    ['Current Phase', prog.current_phase], ['Phase Approved By', prog.phase_approved_by ? `${prog.phase_approved_by} (${formatDate(prog.phase_approved_at)})` : null],
    ['Status', prog.status], ['End Date', formatDate(prog.end_date)],
  ], 2);
  r.paragraph('Rehabilitation Goals', prog.goals);
  r.paragraph('Exercises', prog.exercises);
  r.paragraph('Training Load', prog.training_load);
  r.section('Treatment Sessions');
  r.table(['Date', 'Phase', 'Exercises / Load', 'Pain', 'ROM', 'Strength', 'Function', 'Notes'],
    sessions.map((s) => [formatDate(s.session_date), s.phase, [s.exercises, s.training_load].filter(Boolean).join(' · ') || '—', fmt(s.pain_score, '/10'), fmt(s.range_of_motion), fmt(s.strength_progress), fmt(s.functional_progress), [s.physiotherapy_notes, s.physician_review && `Physician: ${s.physician_review}`].filter(Boolean).join(' · ') || '—']),
    { fontSize: 7.4 });
  r.paragraph('Physician Review', prog.physician_review);
  r.signature({ date: todayISO() });
  return done(r, `Rehabilitation_${p.full_name}_${prog.program_code}`);
}

// 8. Return-to-play assessment
export async function rtpReport(rtpId: string): Promise<GeneratedReport> {
  const x = await api.getRtp(rtpId);
  const p = await api.getPlayer(x.player_id);
  const r = await new ReportBuilder({ title: 'Return-to-Play Assessment', refPrefix: 'RTP', subtitle: `${p.full_name} · ${x.rtp_code}` }).start();
  playerBlock(r, p, [['Associated Injury', `${x.injuries?.injury_code} – ${x.injuries?.diagnosis ?? x.injuries?.injury_type}`], ['Injury Date', formatDate(x.injuries?.injury_date)], ['Assessment Date', formatDate(x.assessment_date)], ['Days Since Injury', x.injuries ? daysBetween(x.injuries.injury_date, x.assessment_date) : null]]);
  r.section('Clinical & Functional Assessment');
  r.keyValues([
    ['Current Clinical Status', x.current_clinical_status], ['Pain Score', fmt(x.pain_score, '/10')], ['Pain Assessment', x.pain_assessment],
    ['Range of Motion', x.range_of_motion], ['Muscle Strength', x.muscle_strength], ['Functional Testing', x.functional_testing],
    ['Balance', x.balance_assessment], ['Agility', x.agility], ['Jumping Ability', x.jumping_ability], ['Landing Mechanics', x.landing_mechanics],
    ['Sport-Specific Tests', x.sport_specific_tests], ['Basketball Movement', x.basketball_movement], ['Training Tolerance', x.training_tolerance],
  ], 2);
  r.paragraph("Physician's Final Assessment", x.final_assessment);
  r.section('Return-to-Play Decision');
  r.highlight(`Decision – ${formatDate(x.decision_date)}`, x.decision, x.decision.startsWith('Cleared for Full') || x.decision === 'Cleared for Competition' ? 'green' : x.decision.startsWith('Cleared') ? 'orange' : 'red');
  r.paragraph('Clinical Notes', x.clinical_notes);
  r.signature({ name: x.physician_name, date: x.decision_date, signedText: x.signature });
  return done(r, `RTP_${p.full_name}_${x.rtp_code}`);
}

// 9. Medical clearance certificate
export async function clearanceCertificate(clearanceId: string): Promise<GeneratedReport> {
  const all = await api.listClearances();
  const c = all.find((x) => x.id === clearanceId);
  if (!c) throw new Error('Clearance record not found');
  const p = await api.getPlayer(c.player_id);
  const r = await new ReportBuilder({ title: 'Medical Clearance Certificate', refPrefix: 'CLR', subtitle: c.clearance_code }).start();
  r.paragraph(null, `This is to certify that the player named below was medically assessed by the Team Physician of Dar City Basketball Team and the following clearance decision was made on ${formatDate(c.decision_date)}.`);
  playerBlock(r, p);
  r.section('Clearance Decision');
  r.highlight('Medical clearance status', c.clearance_status, c.clearance_status === 'Cleared for Full Participation' ? 'green' : c.clearance_status === 'Cleared with Restrictions' ? 'orange' : 'red');
  r.keyValues([['Clearance Ref', c.clearance_code], ['Decision Date', formatDate(c.decision_date)], ['Valid Until', formatDate(c.valid_until)], ['Physician', c.physician_name]], 2);
  if (c.restrictions) r.paragraph('Restrictions / Conditions', c.restrictions);
  if (c.notes) r.paragraph('Notes', c.notes);
  r.note('This certificate reflects the clinical judgement of the Team Physician at the date of assessment. Any new injury, illness or symptom invalidates this clearance until the player is re-assessed.');
  r.signature({ name: c.physician_name, date: c.decision_date, signedText: c.signature });
  return done(r, `Clearance_Certificate_${p.full_name}`);
}

// 10. Daily availability report (uses the restricted RPC – safe for coaches/managers)
export async function availabilityReport(): Promise<GeneratedReport> {
  const rows = await api.getTeamAvailability();
  const r = await new ReportBuilder({ title: 'Daily Player Availability Report', refPrefix: 'AVL', subtitle: `Team status for ${formatDate(todayISO())}` }).start();
  const count = (s: string) => rows.filter((x) => x.availability === s).length;
  r.statRow([['Squad', rows.length], ['Fully Available', count('FULLY AVAILABLE')], ['Modified', count('MODIFIED TRAINING')], ['Individual', count('INDIVIDUAL TRAINING')], ['Not Available', count('NOT AVAILABLE')], ['Under Review', count('UNDER MEDICAL REVIEW')]]);
  r.section('Squad Availability');
  r.table(['#', 'Player', 'Position', 'Medical Status', 'Training Availability', 'Restrictions', 'Last Assessment', 'Next Follow-up'],
    rows.map((x) => [fmt(x.jersey_number), x.full_name, x.position, x.medical_status, x.availability, fmt(x.restrictions), formatDate(x.last_assessment_date), formatDate(x.next_followup_date)]),
    { fontSize: 7.6, columnStyles: { 0: { cellWidth: 8 } } });
  r.note('This report contains approved availability information only. Confidential diagnoses and clinical notes are excluded.');
  r.signature({ date: todayISO() });
  return done(r, `Availability_${todayISO()}`);
}

async function loadTeamData() {
  const [players, injuries, rehab, rtp, exposures, exams, clearances, avail] = await Promise.all([
    api.listPlayers({ includeArchived: true }), api.listInjuries(), api.listRehabPrograms(), api.listRtp(), api.listExposures(),
    api.listExaminations(), api.listClearances(), api.listAvailability(),
  ]);
  return { players, injuries, rehab, rtp, exposures, exams, clearances, avail };
}

function analyticsSections(r: ReportBuilder, data: Awaited<ReturnType<typeof loadTeamData>>, range: DateRange) {
  const injuries = data.injuries.filter((i) => inRange(i.injury_date, range));
  const rtp = data.rtp.filter((x) => inRange(x.decision_date, range));
  const rehab = data.rehab.filter((x) => inRange(x.start_date, range));
  const a = injuryAnalytics(injuries, data.players, rehab, rtp);
  const inc = incidencePer1000h(injuries.length, data.exposures.filter((e) => inRange(e.session_date, range)));
  r.statRow([['Total Injuries', a.total], ['Players Injured', a.playersInjured], ['Recurrent', a.recurrent], ['Total Days Lost', a.totalDaysLost], ['Avg Days Lost', a.averageDaysLost], ['Per 1000 h', inc ? inc.rate : 'n/a']]);
  if (!inc) r.note('Injury incidence per 1,000 player-hours is not shown because no exposure data was recorded for this period.');
  else r.note(`Exposure: ${inc.hours} player-hours recorded. Incidence = injuries ÷ player-hours × 1,000.`);
  const two = (title: string, rows: { name: string; value: number }[], valueLabel = 'Injuries') => {
    r.section(title);
    r.table(['Category', valueLabel, '%'], rows.map((x) => [x.name, x.value, a.total ? `${Math.round((x.value / (valueLabel === 'Injuries' ? a.total : Math.max(1, rows.reduce((s, y) => s + y.value, 0)))) * 100)}%` : '—']));
  };
  two('Injuries by Body Region', a.byRegion);
  two('Injuries by Type', a.byType);
  two('Injuries by Playing Position', a.byPosition);
  two('Injuries by Mechanism', a.byMechanism);
  two('Contact vs Non-Contact', a.contact);
  two('Match vs Training', a.setting);
  two('Days Lost by Body Region', a.daysLostByRegion, 'Days Lost');
  two('Return-to-Play Outcomes', a.rtpOutcomes, 'Decisions');
  return injuries;
}

// 11. Complete team injury report
export async function teamInjuryReport(range: DateRange): Promise<GeneratedReport> {
  const data = await loadTeamData();
  const label = range.from || range.to ? `${formatDate(range.from)} – ${formatDate(range.to)}` : 'All recorded injuries';
  const r = await new ReportBuilder({ title: 'Complete Team Injury Report', refPrefix: 'TIR', subtitle: label }).start();
  const injuries = data.injuries.filter((i) => inRange(i.injury_date, range));
  r.section('Injury Register');
  r.table(['ID', 'Date', 'Player', 'Region / Side', 'Type – Diagnosis', 'Severity', 'Status', 'Days Lost'],
    injuries.map((i) => [i.injury_code, formatDate(i.injury_date), i.players?.full_name ?? '', `${i.body_region}${i.body_side ? ' (' + i.body_side + ')' : ''}`, `${i.injury_type}${i.diagnosis ? ' – ' + i.diagnosis : ''}`, i.severity, i.status, daysLost(i)]),
    { fontSize: 7.4 });
  r.newPage();
  analyticsSections(r, data, range);
  r.signature({ date: todayISO() });
  return done(r, `Team_Injury_Report`);
}

// 12. Monthly medical statistics
export async function monthlyStatistics(month: string /* YYYY-MM */): Promise<GeneratedReport> {
  const data = await loadTeamData();
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y!, m!, 0).getDate();
  const range = { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
  const label = new Date(y!, m! - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  const r = await new ReportBuilder({ title: 'Monthly Medical Statistics', refPrefix: 'MMS', subtitle: label }).start();
  const exams = data.exams.filter((e) => inRange(e.examination_date, range));
  const clearances = data.clearances.filter((c) => inRange(c.decision_date, range));
  r.section('Medical Activity');
  r.keyValues([['Medical Examinations', exams.length], ['Clearance Decisions', clearances.length], ['RTP Assessments', data.rtp.filter((x) => inRange(x.decision_date, range)).length], ['Rehabilitation Programmes Started', data.rehab.filter((x) => inRange(x.start_date, range)).length]], 4);
  analyticsSections(r, data, range);
  r.signature({ date: todayISO() });
  return done(r, `Monthly_Statistics_${month}`);
}

// 13. Season-end medical report
export async function seasonEndReport(seasonId: string): Promise<GeneratedReport> {
  const [data, seasons] = await Promise.all([loadTeamData(), api.listSeasons()]);
  const season = seasons.find((s) => s.id === seasonId);
  if (!season) throw new Error('Season not found');
  const range = { from: season.start_date, to: season.end_date };
  const r = await new ReportBuilder({ title: 'Season-End Medical Report', refPrefix: 'SER', subtitle: `Season ${season.name} (${formatDate(season.start_date)} – ${formatDate(season.end_date)})` }).start();
  const roster = data.players.filter((p) => p.season_id === seasonId || (p.registration_date <= season.end_date && p.status !== 'archived'));
  const exams = data.exams.filter((e) => inRange(e.examination_date, range));
  r.section('Squad Overview');
  r.keyValues([['Registered Players', roster.length], ['Medical Examinations', exams.length], ['Pre-Season Examinations', exams.filter((e) => e.examination_type === 'Pre-Season').length], ['Clearance Decisions', data.clearances.filter((c) => inRange(c.decision_date, range)).length]], 4);
  const injuries = analyticsSections(r, data, range);
  r.section('Injury Burden per Player');
  const byPlayer = new Map<string, { name: string; count: number; days: number; open: number }>();
  for (const i of injuries) {
    const cur = byPlayer.get(i.player_id) ?? { name: i.players?.full_name ?? '', count: 0, days: 0, open: 0 };
    cur.count++; cur.days += daysLost(i); if (isOpenInjury(i)) cur.open++;
    byPlayer.set(i.player_id, cur);
  }
  r.table(['Player', 'Injuries', 'Days Lost', 'Still Open'], [...byPlayer.values()].sort((a, b) => b.days - a.days).map((x) => [x.name, x.count, x.days, x.open]));
  const latestAvail = latestByPlayer(data.avail, 'effective_date');
  r.section('End-of-Season Availability');
  r.table(['Player', 'Availability', 'Medical Status'], roster.filter((p) => p.status === 'active').map((p) => [p.full_name, latestAvail.get(p.id)?.availability ?? 'Not recorded', latestAvail.get(p.id)?.medical_status ?? '—']));
  r.signature({ date: todayISO() });
  return done(r, `Season_End_Report_${season.name}`);
}
