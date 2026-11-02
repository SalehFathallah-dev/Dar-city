import { Link, useNavigate, useParams } from 'react-router-dom';
import { Archive, FileText, Pencil, Stethoscope } from 'lucide-react';
import { useState } from 'react';
import * as api from '../../lib/api';
import * as reports from '../../lib/reports';
import { useAsync } from '../../hooks/useAsync';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { fmt, formatDate, formatDateTime } from '../../lib/format';
import { Badge, Button, Card, ConfirmDialog, DemoBadge, DetailGrid, ErrorBlock, PageHeader, Spinner, StatusBadge, Table, Td } from '../../components/ui';
import { DocumentsPanel } from '../../components/DocumentsPanel';
import { useReportPreview } from '../../components/PdfPreview';

export default function ExaminationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { caps } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const pdf = useReportPreview();
  const q = useAsync(() => api.getExamination(id!), [id]);
  const [archiving, setArchiving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  if (q.loading) return <Spinner />;
  if (q.error || !q.data) return <ErrorBlock message={q.error ?? 'Not found'} onRetry={q.reload} />;
  const { exam: e, findings } = q.data;
  const sys = findings.filter((f) => f.category === 'Systematic');
  const ortho = findings.filter((f) => f.category === 'Orthopedic');
  const archive = async () => {
    setArchiving(true);
    try { await api.archiveExamination(e.id); toast.success('Examination archived (retained in audit history)'); navigate('/examinations'); }
    catch (err) { toast.error((err as Error).message); } finally { setArchiving(false); }
  };
  return (
    <div className="space-y-4">
      <PageHeader title={`${e.examination_type} Examination`} icon={<Stethoscope className="h-6 w-6" />}
        subtitle={<><Link className="font-semibold text-brand-orange" to={`/players/${e.player_id}`}>{e.players?.full_name}</Link> · {e.exam_code} · {formatDate(e.examination_date)} <DemoBadge show={e.is_demo} /></>}
        actions={<>
          {caps.editMedical && <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => navigate(`/examinations/${e.id}/edit`)}>Edit</Button>}
          {caps.editMedical && <Button variant="ghost" icon={<Archive className="h-4 w-4" />} onClick={() => setConfirm(true)}>Archive</Button>}
          <Button icon={<FileText className="h-4 w-4" />} loading={pdf.busy} onClick={() => pdf.run(() => reports.examinationReport(e.id))}>PDF Report</Button>
        </>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Vital Signs" className="lg:col-span-2">
          <DetailGrid cols={4} items={[
            { label: 'Blood pressure', value: e.bp_systolic ? `${e.bp_systolic}/${e.bp_diastolic} mmHg` : null }, { label: 'Heart rate', value: fmt(e.heart_rate, ' bpm') },
            { label: 'Respiratory rate', value: fmt(e.respiratory_rate, ' /min') }, { label: 'Temperature', value: fmt(e.temperature_c, ' °C') },
            { label: 'SpO₂', value: fmt(e.oxygen_saturation, ' %') }, { label: 'Height', value: fmt(e.height_cm, ' cm') }, { label: 'Weight', value: fmt(e.weight_kg, ' kg') }, { label: 'BMI', value: fmt(e.bmi) },
          ]} />
        </Card>
        <Card title="Medical Clearance">
          <div className="space-y-2">
            <StatusBadge status={e.clearance_status ?? 'Decision pending'} />
            {e.clearance_restrictions && <p className="text-sm">{e.clearance_restrictions}</p>}
            {e.physician_signature && <p className="pt-2 font-serif text-lg italic text-brand-charcoal">{e.physician_signature}</p>}
            <p className="text-xs text-neutral-500">{e.physician_name}{e.signed_at && ` · signed ${formatDateTime(e.signed_at)}`}</p>
          </div>
        </Card>
      </div>
      <Card title="Systematic Examination" padded={false}>
        <div className="px-5"><Table headers={['Region', 'Result', 'Clinical findings', 'Notes']} empty={!sys.length}>
          {sys.map((f) => <tr key={f.region}><Td className="font-semibold">{f.region}</Td><Td>{f.is_normal == null ? '—' : <Badge color={f.is_normal ? 'green' : 'red'}>{f.is_normal ? 'Normal' : 'Abnormal'}</Badge>}</Td><Td>{f.clinical_findings}</Td><Td>{f.notes}</Td></tr>)}
        </Table></div>
      </Card>
      <Card title="Orthopedic & Sports Examination" padded={false}>
        <div className="px-5"><Table headers={['Region', 'Result', 'Findings', 'Pain', 'ROM', 'Strength', 'Stability', 'Special tests']} empty={!ortho.length}>
          {ortho.map((f) => <tr key={f.region}><Td className="font-semibold">{f.region}</Td><Td>{f.is_normal == null ? '—' : <Badge color={f.is_normal ? 'green' : 'red'}>{f.is_normal ? 'Normal' : 'Abnormal'}</Badge>}</Td><Td>{f.clinical_findings}</Td><Td>{f.pain}</Td><Td>{f.range_of_motion}</Td><Td>{f.muscle_strength}</Td><Td>{f.joint_stability}</Td><Td>{f.special_tests}</Td></tr>)}
        </Table></div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Additional Investigations">
          <DetailGrid cols={2} items={[{ label: 'Laboratory tests', value: e.laboratory_tests }, { label: 'ECG', value: e.ecg }, { label: 'X-Ray', value: e.xray }, { label: 'MRI', value: e.mri }, { label: 'Ultrasound', value: e.ultrasound }, { label: 'Other', value: e.other_investigations }]} />
        </Card>
        <Card title="Final Medical Assessment">
          <DetailGrid cols={2} items={[{ label: 'Clinical summary', value: e.clinical_summary, wide: true }, { label: 'Identified problems', value: e.identified_problems }, { label: 'Recommendations', value: e.recommendations }, { label: 'Further investigations', value: e.further_investigations }, { label: 'Follow-up date', value: formatDate(e.follow_up_date) }]} />
        </Card>
      </div>
      <Card title="Investigation Documents & Images"><DocumentsPanel playerId={e.player_id} examinationId={e.id} /></Card>
      <ConfirmDialog open={confirm} title="Archive examination" danger confirmLabel="Archive" loading={archiving}
        message="The examination will be hidden from lists. It is not deleted and remains in the audit history." onConfirm={archive} onCancel={() => setConfirm(false)} />
      {pdf.modal}
    </div>
  );
}
