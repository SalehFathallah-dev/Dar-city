import { Link, useParams } from 'react-router-dom';
import { Activity, FileText } from 'lucide-react';
import * as api from '../../lib/api';
import * as reports from '../../lib/reports';
import { useAsync } from '../../hooks/useAsync';
import { daysBetween, formatDate } from '../../lib/format';
import { Button, Card, DemoBadge, DetailGrid, ErrorBlock, PageHeader, Spinner, StatusBadge } from '../../components/ui';
import { useReportPreview } from '../../components/PdfPreview';

export default function RtpDetailPage() {
  const { id } = useParams<{ id: string }>();
  const pdf = useReportPreview();
  const q = useAsync(() => api.getRtp(id!), [id]);
  if (q.loading) return <Spinner />;
  if (q.error || !q.data) return <ErrorBlock message={q.error ?? 'Not found'} onRetry={q.reload} />;
  const r = q.data;
  return (
    <div className="space-y-4">
      <PageHeader title={`RTP Assessment ${r.rtp_code}`} icon={<Activity className="h-6 w-6" />}
        subtitle={<><Link className="font-semibold text-brand-orange" to={`/players/${r.player_id}`}>{r.players?.full_name}</Link> · <Link className="text-brand-orange" to={`/injuries/${r.injury_id}`}>{r.injuries?.injury_code}</Link> · {formatDate(r.assessment_date)} <DemoBadge show={r.is_demo} /></>}
        actions={<Button icon={<FileText className="h-4 w-4" />} loading={pdf.busy} onClick={() => pdf.run(() => reports.rtpReport(r.id))}>RTP PDF</Button>} />
      <Card title="Decision">
        <div className="flex flex-wrap items-center gap-4">
          <StatusBadge status={r.decision} />
          <span className="text-sm text-neutral-600">{formatDate(r.decision_date)} · {r.physician_name}</span>
          <span className="ml-auto font-serif text-xl italic text-brand-charcoal">{r.signature}</span>
        </div>
        {r.clinical_notes && <p className="mt-3 text-sm">{r.clinical_notes}</p>}
      </Card>
      <Card title="Assessment">
        <DetailGrid items={[
          { label: 'Associated injury', value: `${r.injuries?.injury_code} – ${r.injuries?.diagnosis ?? r.injuries?.injury_type}` }, { label: 'Injury date', value: formatDate(r.injuries?.injury_date) },
          { label: 'Days since injury', value: r.injuries ? daysBetween(r.injuries.injury_date, r.assessment_date) : null },
          { label: 'Current clinical status', value: r.current_clinical_status }, { label: 'Pain score', value: r.pain_score != null ? `${r.pain_score}/10` : null }, { label: 'Pain assessment', value: r.pain_assessment },
          { label: 'Range of motion', value: r.range_of_motion }, { label: 'Muscle strength', value: r.muscle_strength }, { label: 'Functional testing', value: r.functional_testing },
          { label: 'Balance', value: r.balance_assessment }, { label: 'Agility', value: r.agility }, { label: 'Jumping ability', value: r.jumping_ability },
          { label: 'Landing mechanics', value: r.landing_mechanics }, { label: 'Sport-specific tests', value: r.sport_specific_tests }, { label: 'Basketball movement', value: r.basketball_movement },
          { label: 'Training tolerance', value: r.training_tolerance }, { label: "Physician's final assessment", value: r.final_assessment, wide: true },
        ]} />
      </Card>
      {pdf.modal}
    </div>
  );
}
