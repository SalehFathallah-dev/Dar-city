import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Footprints } from 'lucide-react';
import * as api from '../../lib/api';
import { useAsync } from '../../hooks/useAsync';
import { REHAB_PHASES, REHAB_STATUSES } from '../../lib/constants';
import { daysBetween, formatDate, todayISO } from '../../lib/format';
import { Badge, Card, DemoBadge, ErrorBlock, PageHeader, SearchInput, Select, Spinner, StatusBadge, Table, Td } from '../../components/ui';

export default function RehabPage() {
  const navigate = useNavigate();
  const data = useAsync(async () => ({ programs: await api.listRehabPrograms(), sessions: await api.listRehabSessions() }), []);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('Active');
  const [phase, setPhase] = useState('');
  const rows = useMemo(() => (data.data?.programs ?? []).filter((r) => {
    const s = q.trim().toLowerCase();
    if (s && ![r.players?.full_name, r.program_code, r.injuries?.diagnosis].some((x) => (x ?? '').toLowerCase().includes(s))) return false;
    if (status && r.status !== status) return false;
    if (phase && r.current_phase !== phase) return false;
    return true;
  }), [data.data, q, status, phase]);
  return (
    <div>
      <PageHeader title="Rehabilitation" subtitle="Injury-linked rehabilitation programmes and sessions" icon={<Footprints className="h-6 w-6" />} />
      <p className="mb-4 text-sm text-neutral-500">Start a new programme from the injury record (Injury → Rehabilitation tab).</p>
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <SearchInput value={q} onChange={setQ} placeholder="Player, programme, diagnosis…" />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} options={REHAB_STATUSES} placeholder="All statuses" />
          <Select value={phase} onChange={(e) => setPhase(e.target.value)} options={REHAB_PHASES} placeholder="All phases" />
        </div>
        {data.loading ? <Spinner /> : data.error ? <ErrorBlock message={data.error} onRetry={data.reload} /> : (
          <Table headers={['Programme', 'Player', 'Injury', 'Start', 'Duration', 'Phase', 'Sessions', 'Status']} empty={!rows.length}>
            {rows.map((r) => (
              <tr key={r.id} className="cursor-pointer hover:bg-brand-beigeLight/40" onClick={() => navigate(`/rehabilitation/${r.id}`)}>
                <Td className="font-mono text-xs">{r.program_code} <DemoBadge show={r.is_demo} /></Td>
                <Td className="font-semibold">{r.players?.full_name}</Td>
                <Td>{r.injuries?.injury_code}<span className="block text-xs text-neutral-500">{r.injuries?.diagnosis ?? r.injuries?.injury_type}</span></Td>
                <Td>{formatDate(r.start_date)}</Td>
                <Td>{daysBetween(r.start_date, r.end_date ?? todayISO())} days</Td>
                <Td><Badge color="orange">{r.current_phase}</Badge></Td>
                <Td>{data.data!.sessions.filter((s) => s.program_id === r.id).length}</Td>
                <Td><StatusBadge status={r.status} /></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
