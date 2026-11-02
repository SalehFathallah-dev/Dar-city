import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, FileText } from 'lucide-react';
import * as api from '../lib/api';
import * as reports from '../lib/reports';
import { useAsync } from '../hooks/useAsync';
import { useReference } from '../context/ReferenceContext';
import { EXAM_CLEARANCE } from '../lib/constants';
import { formatDate, todayISO } from '../lib/format';
import { latestByPlayer } from '../lib/analytics';
import { Button, Card, ErrorBlock, PageHeader, Select, Spinner, StatusBadge, Table, Tabs, Td } from '../components/ui';
import { useReportPreview } from '../components/PdfPreview';

export default function ClearancesPage() {
  const { players } = useReference();
  const data = useAsync(() => api.listClearances(), []);
  const pdf = useReportPreview();
  const [tab, setTab] = useState<'current' | 'history'>('current');
  const [status, setStatus] = useState('');
  const current = useMemo(() => {
    const latest = latestByPlayer(data.data ?? [], 'decision_date');
    return players.filter((p) => p.status === 'active').map((p) => ({ p, c: latest.get(p.id) ?? null }));
  }, [data.data, players]);
  const filteredCurrent = current.filter(({ c }) => !status || (status === 'pending' ? !c : c?.clearance_status === status));
  const history = (data.data ?? []).filter((c) => !status || status === 'pending' || c.clearance_status === status);
  return (
    <div>
      <PageHeader title="Medical Clearance" subtitle="Current clearance per player and the permanent decision history" icon={<BadgeCheck className="h-6 w-6" />} />
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Tabs active={tab} onChange={setTab} tabs={[{ id: 'current', label: 'Current Status' }, { id: 'history', label: 'Decision History', count: data.data?.length }]} />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="!w-auto" options={[{ value: 'pending', label: 'No clearance on record' }, ...EXAM_CLEARANCE.map((c) => ({ value: c, label: c }))]} placeholder="All outcomes" />
        </div>
        {data.loading ? <Spinner /> : data.error ? <ErrorBlock message={data.error} onRetry={data.reload} /> : tab === 'current' ? (
          <Table headers={['Player', 'Current clearance', 'Decision date', 'Restrictions', 'Valid until', '']} empty={!filteredCurrent.length}>
            {filteredCurrent.map(({ p, c }) => (
              <tr key={p.id}>
                <Td><Link to={`/players/${p.id}?tab=clearance`} className="font-semibold hover:text-brand-gold">{p.full_name}</Link><span className="block text-xs text-neutral-500">#{p.jersey_number ?? '–'} · {p.position}</span></Td>
                <Td><StatusBadge status={c?.clearance_status ?? 'Clearance pending'} />{c?.valid_until && c.valid_until < todayISO() && <span className="mt-1 block text-xs font-semibold text-brand-red">Expired</span>}</Td>
                <Td>{formatDate(c?.decision_date)}</Td><Td>{c?.restrictions}</Td><Td>{formatDate(c?.valid_until)}</Td>
                <Td>{c && <Button size="sm" variant="ghost" icon={<FileText className="h-4 w-4" />} onClick={() => pdf.run(() => reports.clearanceCertificate(c.id))}>Certificate</Button>}</Td>
              </tr>
            ))}
          </Table>
        ) : (
          <Table headers={['Ref', 'Date', 'Player', 'Decision', 'Restrictions', 'Source', 'Physician', '']} empty={!history.length}>
            {history.map((c) => (
              <tr key={c.id}>
                <Td className="font-mono text-xs">{c.clearance_code}</Td><Td>{formatDate(c.decision_date)}</Td><Td className="font-semibold">{c.players?.full_name}</Td>
                <Td><StatusBadge status={c.clearance_status} /></Td><Td>{c.restrictions}</Td>
                <Td className="text-xs">{c.examination_id ? <Link className="text-brand-gold" to={`/examinations/${c.examination_id}`}>Examination</Link> : c.rtp_assessment_id ? <Link className="text-brand-gold" to={`/return-to-play/${c.rtp_assessment_id}`}>RTP</Link> : 'Direct decision'}</Td>
                <Td>{c.physician_name}</Td>
                <Td><Button size="sm" variant="ghost" icon={<FileText className="h-4 w-4" />} onClick={() => pdf.run(() => reports.clearanceCertificate(c.id))} aria-label="Certificate" /></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {pdf.modal}
    </div>
  );
}
