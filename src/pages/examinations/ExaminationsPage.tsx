import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Stethoscope } from 'lucide-react';
import * as api from '../../lib/api';
import { useAsync } from '../../hooks/useAsync';
import { useAuth } from '../../context/AuthContext';
import { EXAM_CLEARANCE, EXAM_TYPES } from '../../lib/constants';
import { formatDate } from '../../lib/format';
import { inRange } from '../../lib/analytics';
import { Button, Card, DemoBadge, ErrorBlock, PageHeader, SearchInput, Select, Spinner, StatusBadge, Table, Td } from '../../components/ui';
import { DateRangeFilter, useDateRange } from '../../components/DateRangeFilter';

export default function ExaminationsPage() {
  const { caps } = useAuth();
  const navigate = useNavigate();
  const exams = useAsync(() => api.listExaminations(), []);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [clearance, setClearance] = useState('');
  const dr = useDateRange('all');
  const rows = useMemo(() => (exams.data ?? []).filter((e) => {
    const s = q.trim().toLowerCase();
    if (s && !((e.players?.full_name ?? '').toLowerCase().includes(s) || e.exam_code.toLowerCase().includes(s))) return false;
    if (type && e.examination_type !== type) return false;
    if (clearance === 'pending' ? e.clearance_status : clearance && e.clearance_status !== clearance) return false;
    return inRange(e.examination_date, dr.range) || (!dr.range.from && !dr.range.to);
  }), [exams.data, q, type, clearance, dr.range]);
  return (
    <div>
      <PageHeader title="Medical Examinations" subtitle="Pre-season, periodic, post-injury and return-to-play examinations" icon={<Stethoscope className="h-6 w-6" />}
        actions={caps.editMedical && <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/examinations/new')}>New Examination</Button>} />
      <Card>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput value={q} onChange={setQ} placeholder="Player or exam ID…" />
          <Select value={type} onChange={(e) => setType(e.target.value)} options={EXAM_TYPES} placeholder="All types" />
          <Select value={clearance} onChange={(e) => setClearance(e.target.value)} options={[{ value: 'pending', label: 'Clearance pending' }, ...EXAM_CLEARANCE.map((c) => ({ value: c, label: c }))]} placeholder="All clearance outcomes" />
          <DateRangeFilter state={dr} />
        </div>
        {exams.loading ? <Spinner /> : exams.error ? <ErrorBlock message={exams.error} onRetry={exams.reload} /> : (
          <Table headers={['Exam ID', 'Date', 'Player', 'Type', 'Vitals', 'Clearance', 'Follow-up']} empty={!rows.length}>
            {rows.map((e) => (
              <tr key={e.id} className="cursor-pointer hover:bg-brand-cream/40" onClick={() => navigate(`/examinations/${e.id}`)}>
                <Td className="font-mono text-xs">{e.exam_code} <DemoBadge show={e.is_demo} /></Td>
                <Td>{formatDate(e.examination_date)}</Td>
                <Td className="font-semibold">{e.players?.full_name}<span className="block text-xs font-normal text-neutral-500">#{e.players?.jersey_number ?? '–'} · {e.players?.position}</span></Td>
                <Td>{e.examination_type}</Td>
                <Td className="text-xs">{e.bp_systolic ? `${e.bp_systolic}/${e.bp_diastolic} mmHg` : '—'}{e.heart_rate ? ` · ${e.heart_rate} bpm` : ''}</Td>
                <Td><StatusBadge status={e.clearance_status ?? 'Pending'} /></Td>
                <Td>{formatDate(e.follow_up_date)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
