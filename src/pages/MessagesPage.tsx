import { useState } from 'react';
import { Megaphone, Send } from 'lucide-react';
import * as api from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { useReference } from '../context/ReferenceContext';
import { useToast } from '../context/ToastContext';
import { formatDateTime } from '../lib/format';
import { Badge, Button, Card, Checkbox, EmptyState, ErrorBlock, Field, Input, PageHeader, SegmentedControl, Spinner, Textarea } from '../components/ui';

/** Physician: team announcements and medical instructions to one, several or all athletes. */
export default function MessagesPage() {
  const toast = useToast();
  const { players } = useReference();
  const active = players.filter((p) => p.status === 'active');
  const history = useAsync(() => api.listAnnouncements(), []);
  const [kind, setKind] = useState<'Announcement' | 'Medical instruction'>('Announcement');
  const [audience, setAudience] = useState<'Whole team' | 'Selected players'>('Whole team');
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [staff, setStaff] = useState(false);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (title.trim().length < 2 || !body.trim()) return toast.error('Write a title and a message');
    if (audience === 'Selected players' && !selected.length) return toast.error('Select at least one player');
    setBusy(true);
    try {
      const a = await api.sendAnnouncement(kind === 'Announcement' ? 'announcement' : 'instruction', title, body, audience === 'Whole team' ? null : selected, kind === 'Announcement' && staff);
      toast.success(`Sent to ${a.recipients} account${a.recipients === 1 ? '' : 's'}`);
      setTitle(''); setBody(''); setSelected([]); void history.reload();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const names = new Map(players.map((p) => [p.id, p.full_name]));
  return (
    <div className="space-y-4">
      <PageHeader title="Messages" subtitle="Announcements and medical instructions – delivered as in-app notifications" icon={<Megaphone className="h-6 w-6" />} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="New message">
          <div className="space-y-3">
            <SegmentedControl value={kind} options={['Announcement', 'Medical instruction'] as const} onChange={setKind} />
            <SegmentedControl value={audience} options={['Whole team', 'Selected players'] as const} onChange={setAudience} />
            {audience === 'Selected players' && (
              <div className="grid max-h-56 gap-1 overflow-y-auto rounded-xl border p-2 sm:grid-cols-2">
                {active.map((p) => <Checkbox key={p.id} label={p.full_name} checked={selected.includes(p.id)} onChange={(v) => setSelected(v ? [...selected, p.id] : selected.filter((x) => x !== p.id))} />)}
              </div>
            )}
            <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Hydration before tomorrow's match" /></Field>
            <Field label="Message"><Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Arabic or English" /></Field>
            {kind === 'Announcement' && <Checkbox label="Also send to coaching staff" checked={staff} onChange={setStaff} />}
            {kind === 'Medical instruction' && <p className="text-xs text-neutral-500">Instructions go only to the selected athletes – never to staff.</p>}
            <Button icon={<Send className="h-4 w-4" />} loading={busy} onClick={() => void send()}>Send</Button>
            <p className="text-xs text-neutral-500">Only athletes with an active app account receive messages.</p>
          </div>
        </Card>
        <Card title="Sent">
          {history.loading ? <Spinner /> : history.error ? <ErrorBlock message={history.error} /> : !history.data?.length ? <EmptyState title="Nothing sent yet" /> : (
            <ul className="space-y-2">{history.data.map((a) => (
              <li key={a.id} className="rounded-xl border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2"><b>{a.title}</b><Badge color={a.kind === 'instruction' ? 'blue' : 'beige'}>{a.kind}</Badge><span className="ms-auto text-xs text-neutral-500">{formatDateTime(a.created_at)}</span></div>
                <p className="mt-1 whitespace-pre-line text-neutral-700">{a.body}</p>
                <p className="mt-1 text-xs text-neutral-500">{a.player_ids ? a.player_ids.map((id) => names.get(id) ?? '?').join(', ') : 'Whole team'}{a.include_staff ? ' + staff' : ''} · {a.recipients} recipient(s)</p>
              </li>
            ))}</ul>
          )}
        </Card>
      </div>
    </div>
  );
}
