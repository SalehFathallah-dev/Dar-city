import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Plus } from 'lucide-react';
import * as api from '../../lib/api';
import { useAsync } from '../../hooks/useAsync';
import { useAuth } from '../../context/AuthContext';
import { RTP_DECISIONS } from '../../lib/constants';
import { formatDate } from '../../lib/format';
import { Button, Card, DemoBadge, ErrorBlock, PageHeader, SearchInput, Select, Spinner, StatusBadge, Table, Td } from '../../components/ui';

export default function RtpPage() {
  const { caps } = useAuth();
  const navigate = useNavigate();
  const data = useAsync(() => api.listRtp(), []);
  const [q, setQ] = useState('');
  const [decision, setDecision] = useState('');
  const rows = useMemo(() => (data.data ?? []).filter((r) => {
    const s = q.trim().toLowerCase();
    if (s && ![r.players?.full_name, r.rtp_code, r.injuries?.injury_code].some((x) => (x ?? '').toLowerCase().includes(s))) return false;
    return !decision || r.decision === decision;
  }), [data.data, q, decision]);
  return (
    <div>
      <PageHeader title="Return to Play" subtitle="Permanent history of all return-to-play assessments and decisions" icon={<Activity className="h-6 w-6" />}
        actions={caps.editMedical && <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/return-to-play/new')}>New RTP Assessment</Button>} />
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <SearchInput value={q} onChange={setQ} placeholder="Player, RTP or injury ID…" />
          <Select value={decision} onChange={(e) => setDecision(e.target.value)} options={RTP_DECISIONS} placeholder="All decisions" />
        </div>
        {data.loading ? <Spinner /> : data.error ? <ErrorBlock message={data.error} onRetry={data.reload} /> : (
          <Table headers={['Ref', 'Decision date', 'Player', 'Injury', 'Pain', 'Decision', 'Physician']} empty={!rows.length}>
            {rows.map((r) => (
              <tr key={r.id} className="cursor-pointer hover:bg-brand-cream/40" onClick={() => navigate(`/return-to-play/${r.id}`)}>
                <Td className="font-mono text-xs">{r.rtp_code} <DemoBadge show={r.is_demo} /></Td><Td>{formatDate(r.decision_date)}</Td>
                <Td className="font-semibold">{r.players?.full_name}</Td><Td>{r.injuries?.injury_code}<span className="block text-xs text-neutral-500">{r.injuries?.diagnosis ?? r.injuries?.injury_type}</span></Td>
                <Td>{r.pain_score ?? '—'}/10</Td><Td><StatusBadge status={r.decision} /></Td><Td>{r.physician_name}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
