import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { HeartPulse, Plus } from 'lucide-react';
import * as api from '../../lib/api';
import { useAsync } from '../../hooks/useAsync';
import { useAuth } from '../../context/AuthContext';
import { BODY_REGIONS, INJURY_STATUSES, INJURY_TYPES, SEVERITIES } from '../../lib/constants';
import { formatDate } from '../../lib/format';
import { daysLost, inRange, isOpenInjury } from '../../lib/analytics';
import { Button, Card, DemoBadge, ErrorBlock, Modal, PageHeader, SearchInput, Select, Spinner, StatusBadge, Table, Td } from '../../components/ui';
import { DateRangeFilter, useDateRange } from '../../components/DateRangeFilter';

export default function InjuriesPage() {
  const { caps } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const injuries = useAsync(() => api.listInjuries(), []);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [region, setRegion] = useState('');
  const [type, setType] = useState('');
  const [severity, setSeverity] = useState('');
  const dr = useDateRange('all');
  const quickFollowup = params.get('quick') === 'followup';

  const rows = useMemo(() => (injuries.data ?? []).filter((i) => {
    const s = q.trim().toLowerCase();
    if (s && ![i.players?.full_name, i.injury_code, i.diagnosis, i.anatomical_structure].some((x) => (x ?? '').toLowerCase().includes(s))) return false;
    if (status === 'open' ? !isOpenInjury(i) : status && i.status !== status) return false;
    if (region && i.body_region !== region) return false;
    if (type && i.injury_type !== type) return false;
    if (severity && i.severity !== severity) return false;
    return !dr.range.from && !dr.range.to ? true : inRange(i.injury_date, dr.range);
  }), [injuries.data, q, status, region, type, severity, dr.range]);

  const openInjuries = (injuries.data ?? []).filter(isOpenInjury);
  return (
    <div>
      <PageHeader title="Injury Management" subtitle="Injury surveillance, treatment and follow-up" icon={<HeartPulse className="h-6 w-6" />}
        actions={caps.editMedical && <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/injuries/new')}>Record Injury</Button>} />
      <Card>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <SearchInput value={q} onChange={setQ} placeholder="Player, ID, diagnosis…" />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: 'open', label: 'All open injuries' }, ...INJURY_STATUSES.map((s) => ({ value: s, label: s }))]} placeholder="All statuses" />
          <Select value={region} onChange={(e) => setRegion(e.target.value)} options={BODY_REGIONS} placeholder="All body regions" />
          <Select value={type} onChange={(e) => setType(e.target.value)} options={INJURY_TYPES} placeholder="All injury types" />
          <Select value={severity} onChange={(e) => setSeverity(e.target.value)} options={SEVERITIES} placeholder="All severities" />
          <DateRangeFilter state={dr} />
        </div>
        {injuries.loading ? <Spinner /> : injuries.error ? <ErrorBlock message={injuries.error} onRetry={injuries.reload} /> : (
          <Table headers={['Injury ID', 'Date', 'Player', 'Region / Side', 'Type / Diagnosis', 'Setting', 'Severity', 'Status', 'Days lost']} empty={!rows.length}>
            {rows.map((i) => (
              <tr key={i.id} className="cursor-pointer hover:bg-brand-cream/40" onClick={() => navigate(`/injuries/${i.id}`)}>
                <Td className="font-mono text-xs">{i.injury_code} <DemoBadge show={i.is_demo} /></Td>
                <Td>{formatDate(i.injury_date)}</Td>
                <Td className="font-semibold">{i.players?.full_name}<span className="block text-xs font-normal text-neutral-500">#{i.players?.jersey_number ?? '–'} · {i.players?.position}</span></Td>
                <Td>{i.body_region}{i.body_side && <span className="block text-xs text-neutral-500">{i.body_side}</span>}</Td>
                <Td>{i.injury_type}{i.diagnosis && <span className="block text-xs text-neutral-500">{i.diagnosis}</span>}</Td>
                <Td>{i.setting}{i.is_recurrent && <span className="block text-xs font-semibold text-brand-red">Recurrent</span>}</Td>
                <Td><StatusBadge status={i.severity} /></Td>
                <Td><StatusBadge status={i.status} /></Td>
                <Td className="font-semibold">{daysLost(i)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Modal open={quickFollowup} onClose={() => setParams({})} title="Quick Follow-up – select injury">
        {openInjuries.length ? (
          <div className="space-y-2">
            {openInjuries.map((i) => (
              <button key={i.id} onClick={() => navigate(`/injuries/${i.id}?followup=1`)} className="flex w-full items-center gap-3 rounded-xl border border-neutral-200 p-3 text-left hover:border-brand-gold">
                <HeartPulse className="h-5 w-5 text-brand-red" />
                <div className="flex-1"><p className="font-semibold">{i.players?.full_name}</p><p className="text-xs text-neutral-500">{i.injury_code} · {i.body_region} · {i.diagnosis ?? i.injury_type} · {formatDate(i.injury_date)}</p></div>
                <StatusBadge status={i.status} />
              </button>
            ))}
          </div>
        ) : <p className="text-sm text-neutral-600">There are no open injuries.</p>}
      </Modal>
    </div>
  );
}
