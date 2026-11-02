import { useState, type ReactNode } from 'react';
import { FileText, Lock } from 'lucide-react';
import * as api from '../lib/api';
import * as reports from '../lib/reports';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useReference } from '../context/ReferenceContext';
import { formatDate, todayISO } from '../lib/format';
import { Button, Card, Field, Input, PageHeader, Select } from '../components/ui';
import { PlayerPicker } from '../components/PlayerPicker';
import { DateRangeFilter, useDateRange } from '../components/DateRangeFilter';
import { useReportPreview } from '../components/PdfPreview';
import type { GeneratedReport } from '../lib/reports';

export default function ReportsPage() {
  const { caps } = useAuth();
  const { seasons, currentSeason } = useReference();
  const pdf = useReportPreview();
  const lists = useAsync(async () => {
    if (!caps.viewMedical) return null;
    const [exams, injuries, rehab, rtp, clearances] = await Promise.all([api.listExaminations(), api.listInjuries(), api.listRehabPrograms(), api.listRtp(), api.listClearances()]);
    return { exams, injuries, rehab, rtp, clearances };
  }, [caps.viewMedical]);
  const [sel, setSel] = useState<Record<string, string>>({ month: todayISO().slice(0, 7), season: currentSeason?.id ?? '' });
  const set = (k: string) => (v: string) => setSel((s) => ({ ...s, [k]: v }));
  const dr = useDateRange('season');
  const l = lists.data;

  const item = (n: number, title: string, desc: string, control: ReactNode, gen: (() => Promise<GeneratedReport>) | null, allowed = true) => (
    <Card key={title} className="flex flex-col">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-charcoal font-display text-lg font-bold text-brand-orange">{n}</span>
        <div className="min-w-0"><h3 className="font-semibold text-neutral-900">{title}</h3><p className="text-xs text-neutral-500">{desc}</p></div>
      </div>
      {allowed ? (
        <div className="mt-4 flex flex-1 flex-col justify-end gap-3">
          {control}
          <Button icon={<FileText className="h-4 w-4" />} disabled={!gen} loading={pdf.busy} onClick={() => gen && pdf.run(gen)}>Preview PDF</Button>
        </div>
      ) : <p className="mt-4 flex items-center gap-2 text-xs text-neutral-400"><Lock className="h-4 w-4" /> Medical team only</p>}
    </Card>
  );
  const med = caps.viewMedical;
  const opt = <T,>(arr: T[] | undefined, map: (t: T) => { value: string; label: string }) => (arr ?? []).map(map);

  return (
    <div>
      <PageHeader title="Medical Reports" subtitle="Professional A4 PDF reports with the official Dar City logo – preview before downloading" icon={<FileText className="h-6 w-6" />} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {item(1, 'Individual Player Medical Profile', 'Complete medical summary for one player', <PlayerPicker value={sel.p1 ?? ''} onChange={set('p1')} includeInactive />, sel.p1 ? () => reports.playerMedicalProfile(sel.p1!) : null, med)}
        {item(2, 'Player Registration Report', 'Personal and basketball registration details', <PlayerPicker value={sel.p2 ?? ''} onChange={set('p2')} includeInactive />, sel.p2 ? () => reports.playerRegistration(sel.p2!) : null, caps.viewEmergencyContacts || med)}
        {item(3, 'Pre-Season Medical Examination', 'Full structured examination report', <Select value={sel.e1 ?? ''} onChange={(e) => set('e1')(e.target.value)} placeholder="Select examination…" options={opt(l?.exams.filter((e) => e.examination_type === 'Pre-Season'), (e) => ({ value: e.id, label: `${e.players?.full_name} – ${formatDate(e.examination_date)}` }))} />, sel.e1 ? () => reports.examinationReport(sel.e1!) : null, med)}
        {item(4, 'Periodic Medical Examination', 'Periodic, post-injury and other examinations', <Select value={sel.e2 ?? ''} onChange={(e) => set('e2')(e.target.value)} placeholder="Select examination…" options={opt(l?.exams.filter((e) => e.examination_type !== 'Pre-Season'), (e) => ({ value: e.id, label: `${e.players?.full_name} – ${e.examination_type} ${formatDate(e.examination_date)}` }))} />, sel.e2 ? () => reports.examinationReport(sel.e2!) : null, med)}
        {item(5, 'Individual Injury Report', 'Injury details, treatment and RTP decisions', <Select value={sel.i1 ?? ''} onChange={(e) => set('i1')(e.target.value)} placeholder="Select injury…" options={opt(l?.injuries, (i) => ({ value: i.id, label: `${i.players?.full_name} – ${i.injury_code} ${i.body_region}` }))} />, sel.i1 ? () => reports.injuryReport(sel.i1!) : null, med)}
        {item(6, 'Injury Follow-up Report', 'Chronological follow-ups with comparison', <Select value={sel.i2 ?? ''} onChange={(e) => set('i2')(e.target.value)} placeholder="Select injury…" options={opt(l?.injuries, (i) => ({ value: i.id, label: `${i.players?.full_name} – ${i.injury_code} ${i.body_region}` }))} />, sel.i2 ? () => reports.followupReport(sel.i2!) : null, med)}
        {item(7, 'Rehabilitation Progress Report', 'Programme, phases and session progress', <Select value={sel.r1 ?? ''} onChange={(e) => set('r1')(e.target.value)} placeholder="Select programme…" options={opt(l?.rehab, (r) => ({ value: r.id, label: `${r.players?.full_name} – ${r.program_code}` }))} />, sel.r1 ? () => reports.rehabReport(sel.r1!) : null, med)}
        {item(8, 'Return-to-Play Assessment', 'Functional testing and the physician decision', <Select value={sel.t1 ?? ''} onChange={(e) => set('t1')(e.target.value)} placeholder="Select RTP assessment…" options={opt(l?.rtp, (r) => ({ value: r.id, label: `${r.players?.full_name} – ${r.rtp_code} ${r.decision}` }))} />, sel.t1 ? () => reports.rtpReport(sel.t1!) : null, med)}
        {item(9, 'Medical Clearance Certificate', 'Signed clearance certificate', <Select value={sel.c1 ?? ''} onChange={(e) => set('c1')(e.target.value)} placeholder="Select clearance decision…" options={opt(l?.clearances, (c) => ({ value: c.id, label: `${c.players?.full_name} – ${c.clearance_status} (${formatDate(c.decision_date)})` }))} />, sel.c1 ? () => reports.clearanceCertificate(sel.c1!) : null, med)}
        {item(10, 'Daily Player Availability Report', 'Approved availability for coaching staff', <p className="text-xs text-neutral-500">Generated for {formatDate(todayISO())}</p>, () => reports.availabilityReport())}
        {item(11, 'Complete Team Injury Report', 'Injury register with full statistics', <DateRangeFilter state={dr} />, () => reports.teamInjuryReport(dr.range), med)}
        {item(12, 'Monthly Medical Statistics', 'Medical activity and injury statistics for a month', <Field label="Month"><Input type="month" value={sel.month} onChange={(e) => set('month')(e.target.value)} /></Field>, sel.month ? () => reports.monthlyStatistics(sel.month!) : null, med)}
        {item(13, 'Season-End Medical Report', 'Season summary, injury burden and outcomes', <Select value={sel.season ?? ''} onChange={(e) => set('season')(e.target.value)} placeholder="Select season…" options={seasons.map((s) => ({ value: s.id, label: s.name }))} />, sel.season ? () => reports.seasonEndReport(sel.season!) : null, med)}
      </div>
      {pdf.modal}
    </div>
  );
}
