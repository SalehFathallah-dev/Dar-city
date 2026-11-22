import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Inbox, Paperclip, ShieldAlert } from 'lucide-react';
import * as api from '../../lib/api';
import { useAsync } from '../../hooks/useAsync';
import { formatDateTime } from '../../lib/format';
import type { MedicalCase } from '../../lib/types';
import { locationLabel } from '../../components/BodyMap';
import { Badge, Card, EmptyState, ErrorBlock, PageHeader, SearchInput, Select, Spinner, Tabs } from '../../components/ui';

export const PRIORITY_COLOR: Record<string, 'red' | 'orange' | 'gray'> = { Urgent: 'red', Priority: 'orange', Routine: 'gray' };
export const CASE_STATUS_COLOR: Record<string, 'blue' | 'orange' | 'green' | 'gray' | 'red'> = {
  New: 'red', 'Under Review': 'blue', 'Information Requested': 'orange', 'Examination Scheduled': 'blue', 'In Treatment': 'blue', Closed: 'gray',
};
const VIS_LABEL: Record<string, string> = { private: 'Private', limited: 'Limited to staff', approved: 'Approved report' };

/** Doctor's medical inbox: athletes' complaints, newest and most urgent first. */
export default function InboxPage() {
  const [tab, setTab] = useState<'open' | 'closed' | 'all'>('open');
  const [priority, setPriority] = useState('');
  const [q, setQ] = useState('');
  const list = useAsync(() => api.listCases({ status: tab }), [tab]);
  const all = useAsync(() => api.listCases({ status: 'all' }), []);
  const countByPlayer = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of all.data ?? []) m.set(c.player_id, (m.get(c.player_id) ?? 0) + 1);
    return m;
  }, [all.data]);
  const rank = (c: MedicalCase) => (c.status === 'New' ? 0 : 1) * 10 + (c.priority === 'Urgent' ? 0 : c.priority === 'Priority' ? 1 : 2) + (c.athlete_urgent ? -1 : 0);
  const rows = (list.data ?? [])
    .filter((c) => !priority || c.priority === priority)
    .filter((c) => !q.trim() || `${c.players?.full_name} ${c.case_code} ${c.category}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (tab === 'open' ? rank(a) - rank(b) : 0) || b.created_at.localeCompare(a.created_at));
  const newCount = (list.data ?? []).filter((c) => c.status === 'New').length;

  return (
    <div className="space-y-4">
      <PageHeader title="Medical Inbox" subtitle="Complaints reported by athletes – review, triage and decide what staff may see" icon={<Inbox className="h-6 w-6" />} />
      <Tabs tabs={[{ id: 'open' as const, label: 'Open', count: tab === 'open' ? (list.data?.length ?? 0) : undefined }, { id: 'closed' as const, label: 'Closed' }, { id: 'all' as const, label: 'All' }]} active={tab} onChange={setTab} />
      <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
        <SearchInput value={q} onChange={setQ} placeholder="Player, case number, category…" />
        <Select value={priority} onChange={(e) => setPriority(e.target.value)} options={['Urgent', 'Priority', 'Routine']} placeholder="All priorities" />
      </div>
      {newCount > 0 && tab === 'open' && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-brand-red">{newCount} new complaint{newCount > 1 ? 's' : ''} not yet reviewed</p>}
      {list.loading ? <Spinner /> : list.error ? <ErrorBlock message={list.error} onRetry={list.reload} /> : rows.length === 0 ? (
        <Card><EmptyState title="No complaints" description="When an athlete reports a medical issue from the app it appears here immediately." /></Card>
      ) : (
        <div className="space-y-2">
          {rows.map((c) => {
            const prev = (countByPlayer.get(c.player_id) ?? 1) - 1;
            return (
              <Link key={c.id} to={`/inbox/${c.id}`} className={clsx('block rounded-2xl border bg-white p-4 shadow-card transition hover:border-brand-gold', c.status === 'New' ? 'border-brand-red/40' : 'border-transparent')}>
                <div className="flex flex-wrap items-center gap-2">
                  {(c.priority === 'Urgent' || c.athlete_urgent) && <ShieldAlert className="h-5 w-5 text-brand-red" />}
                  <p className="font-bold text-brand-navy">{c.players?.full_name}</p>
                  {c.players?.jersey_number != null && <span className="text-xs text-neutral-500">#{c.players.jersey_number}</span>}
                  <Badge color={CASE_STATUS_COLOR[c.status]}>{c.status}</Badge>
                  <Badge color={PRIORITY_COLOR[c.priority]}>{c.priority}</Badge>
                  {c.athlete_urgent && c.priority !== 'Urgent' && <Badge color="red">Athlete: urgent</Badge>}
                  <span className="ms-auto text-xs text-neutral-500">{formatDateTime(c.created_at)}</span>
                </div>
                <p className="mt-1 text-sm"><b>{c.category}</b>{c.pain_score !== null && <> · pain <b className={clsx(c.pain_score >= 7 && 'text-brand-red')}>{c.pain_score}/10</b></>}
                  {c.body_locations.length > 0 && <> · {c.body_locations.map((l) => locationLabel(l)).join(', ')}</>}</p>
                <p className="mt-1 flex flex-wrap gap-3 text-xs text-neutral-500">
                  <span>{c.case_code}</span><span>Sharing: {VIS_LABEL[c.visibility]}</span>
                  {prev > 0 && <span className="font-semibold text-amber-700">{prev} previous complaint{prev > 1 ? 's' : ''}</span>}
                  {c.can_continue === false && <span className="font-semibold text-brand-red">cannot continue training</span>}
                  {c.affects_movement && <span className="font-semibold text-brand-red">movement affected</span>}
                </p>
                {c.description && <p className="mt-1 line-clamp-2 text-sm text-neutral-600"><Paperclip className="hidden" />{c.description}</p>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
