import { useState } from 'react';
import { Check, UserCheck, X } from 'lucide-react';
import * as api from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../context/ToastContext';
import { formatDateTime } from '../lib/format';
import type { RegistrationRow } from '../lib/types';
import { Badge, Button, Card, EmptyState, ErrorBlock, Field, Input, Modal, PageHeader, Spinner, Tabs } from '../components/ui';

/** Physician: approve or reject the first sign-in of self-registered players and staff. */
export default function RequestsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const list = useAsync(() => api.listRegistrations(tab), [tab]);
  const [reject, setReject] = useState<RegistrationRow | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const decide = async (r: RegistrationRow, approve: boolean, n?: string) => {
    setBusy(r.id);
    try {
      await api.decideRegistration(r.id, approve, n);
      toast.success(approve ? `${r.person_name} can now sign in` : 'Request rejected');
      setReject(null); setNote('');
      void list.reload();
      window.dispatchEvent(new Event('dsf-requests-changed'));
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  const rows = list.data ?? [];
  return (
    <div className="space-y-4">
      <PageHeader title="Access Requests" subtitle="Players and staff who created an account and chose their name – approve their first sign-in" icon={<UserCheck className="h-6 w-6" />} />
      <Tabs tabs={[{ id: 'pending' as const, label: 'Waiting', count: tab === 'pending' ? rows.length : undefined }, { id: 'all' as const, label: 'History' }]} active={tab} onChange={setTab} />
      {list.loading ? <Spinner /> : list.error ? <ErrorBlock message={list.error} onRetry={list.reload} /> : rows.length === 0 ? (
        <Card><EmptyState title={tab === 'pending' ? 'No requests waiting' : 'No requests yet'} description="When a player or staff member creates an account and chooses their name, the request appears here." /></Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((r) => (
            <Card key={r.id}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-bold text-brand-navy">{r.person_name}</p>
                    <Badge color={r.kind === 'athlete' ? 'blue' : 'purple'}>{r.kind === 'athlete' ? 'Player' : 'Staff'}</Badge>
                    {r.status !== 'pending' && <Badge color={r.status === 'approved' ? 'green' : 'red'}>{r.status}</Badge>}
                  </div>
                  <p className="text-sm text-neutral-600">{r.club_name}{r.person_detail ? ` · ${r.person_detail}` : ''}</p>
                  <p className="mt-2 text-sm">Account: <b>{r.login}</b> <span className="text-neutral-500">(“{r.account_name}”)</span></p>
                  {r.message && <p className="mt-1 text-sm text-neutral-600">“{r.message}”</p>}
                  <p className="mt-1 text-xs text-neutral-400">{formatDateTime(r.created_at)}{r.decided_at ? ` · decided ${formatDateTime(r.decided_at)}` : ''}{r.decision_note ? ` · ${r.decision_note}` : ''}</p>
                  {r.status === 'pending' && r.already_linked && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">This person is already linked to another account – approving is not possible.</p>}
                  {r.status === 'pending' && r.account_name.trim().toLowerCase() !== r.person_name.trim().toLowerCase() && (
                    <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">The name typed when creating the account differs from the chosen name – check it is really this person.</p>
                  )}
                </div>
              </div>
              {r.status === 'pending' && (
                <div className="mt-4 flex gap-2">
                  <Button className="flex-1" icon={<Check className="h-4 w-4" />} loading={busy === r.id} disabled={r.already_linked} onClick={() => void decide(r, true)}>Approve</Button>
                  <Button className="flex-1" variant="secondary" icon={<X className="h-4 w-4" />} disabled={busy === r.id} onClick={() => setReject(r)}>Reject</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <Modal open={!!reject} onClose={() => setReject(null)} title={`Reject ${reject?.person_name ?? ''}`}
        footer={<><Button variant="secondary" onClick={() => setReject(null)}>Cancel</Button><Button variant="danger" loading={busy === reject?.id} onClick={() => reject && void decide(reject, false, note)}>Reject</Button></>}>
        <Field label="Reason (shown to the user, optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Wrong name selected" /></Field>
      </Modal>
    </div>
  );
}
