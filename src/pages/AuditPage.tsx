import { useState } from 'react';
import { History } from 'lucide-react';
import * as api from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { formatDateTime } from '../lib/format';
import type { AuditLog } from '../lib/types';
import { Badge, Card, Checkbox, ErrorBlock, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td } from '../components/ui';
import { useClub } from '../context/ClubContext';

const TYPES = ['clubs', 'club_members', 'players', 'player_emergency_contacts', 'medical_histories', 'medical_examinations', 'examination_findings', 'injuries', 'injury_followups', 'treatments',
  'rehabilitation_programs', 'rehabilitation_sessions', 'rtp_assessments', 'medical_clearances', 'player_availability', 'medical_documents', 'profiles', 'team_seasons', 'application_settings', 'report', 'session'];

export default function AuditPage() {
  const [recordType, setRecordType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { club, clubs } = useClub();
  const [onlyClub, setOnlyClub] = useState(true);
  const users = useAsync(() => api.listProfiles(), []);
  const logs = useAsync(() => api.listAuditLogs({ limit: 500, recordType: recordType || undefined, from: from || undefined, to: to || undefined, clubId: onlyClub ? club?.id : undefined }), [recordType, from, to, onlyClub, club?.id]);
  const [view, setView] = useState<AuditLog | null>(null);
  const who = (id: string | null) => (id ? users.data?.find((u) => u.id === id)?.full_name ?? id.slice(0, 8) : 'System');
  const color = (a: string) => (a === 'INSERT' ? 'green' : a === 'UPDATE' ? 'orange' : a === 'DELETE' ? 'red' : 'blue');
  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Who changed what, and when – including previous and updated values" icon={<History className="h-6 w-6" />} />
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Field label="Record type"><Select value={recordType} onChange={(e) => setRecordType(e.target.value)} options={TYPES} placeholder="All" /></Field>
          <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        <div className="mb-4 max-w-md"><Checkbox label={`Only ${club?.name ?? 'current club'}`} checked={onlyClub} onChange={setOnlyClub} description="Untick to include all your clubs and system events" /></div>
        {logs.loading ? <Spinner /> : logs.error ? <ErrorBlock message={logs.error} onRetry={logs.reload} /> : (
          <Table headers={['Date & time', 'Club', 'User', 'Action', 'Record type', 'Record ID', 'Changed fields']} empty={!logs.data?.length}>
            {(logs.data ?? []).map((l) => (
              <tr key={l.id} className="cursor-pointer hover:bg-brand-cream/40" onClick={() => setView(l)}>
                <Td className="whitespace-nowrap">{formatDateTime(l.created_at)}</Td><Td className="text-xs">{clubs.find((c) => c.id === l.club_id)?.short_name ?? '—'}</Td><Td>{who(l.user_id)}</Td><Td><Badge color={color(l.action)}>{l.action}</Badge></Td>
                <Td>{l.record_type}</Td><Td className="font-mono text-xs">{l.record_id?.slice(0, 13)}</Td>
                <Td className="max-w-xs truncate text-xs text-neutral-500">{l.action === 'UPDATE' ? Object.keys(l.new_values ?? {}).join(', ') : ''}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Modal open={!!view} onClose={() => setView(null)} title="Audit Entry" size="xl">
        {view && (
          <div className="space-y-3 text-sm">
            <p><b>{view.action}</b> on <b>{view.record_type}</b> ({view.record_id}) by {who(view.user_id)} at {formatDateTime(view.created_at)}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div><p className="mb-1 text-xs font-bold uppercase text-neutral-500">Previous values</p><pre className="max-h-96 overflow-auto rounded-lg bg-neutral-50 p-3 text-xs">{view.old_values ? JSON.stringify(view.old_values, null, 2) : '—'}</pre></div>
              <div><p className="mb-1 text-xs font-bold uppercase text-neutral-500">Updated values</p><pre className="max-h-96 overflow-auto rounded-lg bg-neutral-50 p-3 text-xs">{view.new_values ? JSON.stringify(view.new_values, null, 2) : '—'}</pre></div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
