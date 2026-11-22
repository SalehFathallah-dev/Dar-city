import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowLeft, CalendarCheck2, Eye, EyeOff, FileText, HeartPulse, Lock, MessageSquare, Paperclip, Send, Share2, Stethoscope, Users } from 'lucide-react';
import * as api from '../../lib/api';
import { useAsync } from '../../hooks/useAsync';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../lib/format';
import type { CaseMessage, CaseVisibility, MedicalCase } from '../../lib/types';
import { BodyMap } from '../../components/BodyMap';
import { openFile } from '../../lib/native';
import { Badge, Button, Card, DetailGrid, ErrorBlock, Field, Select, Spinner, Textarea, Input } from '../../components/ui';
import { CASE_STATUS_COLOR, PRIORITY_COLOR } from './InboxPage';

const STATUSES = ['New', 'Under Review', 'Information Requested', 'Examination Scheduled', 'In Treatment', 'Closed'] as const;
const STAFF_STATUSES = ['Available', 'Modified training', 'Unavailable', 'Medical assessment pending'] as const;
const MSG: Record<CaseMessage['kind'], { label: string; cls: string }> = {
  private_note: { label: 'Private note (medical team only)', cls: 'bg-neutral-100' },
  request_info: { label: 'Information request → athlete', cls: 'bg-amber-50' },
  instruction: { label: 'Instruction → athlete', cls: 'bg-sky-50' },
  athlete_reply: { label: 'Athlete reply', cls: 'bg-emerald-50' },
};
const yn = (v: boolean | null) => (v === null ? '—' : v ? 'Yes' : 'No');

export default function CaseDetailPage() {
  const { id } = useParams();
  const { caps } = useAuth();
  const toast = useToast();
  const data = useAsync(() => api.getCase(id!), [id]);
  const related = useAsync(async () => (data.data ? (await api.listCases({ status: 'all', playerId: data.data.c.player_id })).filter((x) => x.id !== id) : []), [data.data?.c.player_id, id]);
  const [triage, setTriage] = useState<Partial<MedicalCase>>({});
  const [share, setShare] = useState<{ visibility: CaseVisibility; staff_status: string; shared_summary: string }>({ visibility: 'private', staff_status: '', shared_summary: '' });
  const [msgKind, setMsgKind] = useState<'private_note' | 'request_info' | 'instruction'>('private_note');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const c = data.data?.c;
    if (!c) return;
    setTriage({ priority: c.priority, status: c.status, diagnosis: c.diagnosis ?? '' });
    setShare({ visibility: c.visibility, staff_status: c.staff_status ?? '', shared_summary: c.shared_summary ?? '' });
    if (c.status === 'New') void api.updateCase(c.id, { status: 'Under Review' }).then(() => setTriage((t) => ({ ...t, status: 'Under Review' }))).catch(() => undefined);
  }, [data.data?.c]); // eslint-disable-line react-hooks/exhaustive-deps

  if (data.loading) return <Spinner />;
  if (data.error || !data.data) return <ErrorBlock message={data.error ?? 'Not found'} />;
  const { c, messages, files, disclosures } = data.data;

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try { await fn(); toast.success(ok); await data.reload(); window.dispatchEvent(new Event('dsf-notifications-changed')); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const saveTriage = () => run('triage', () => api.updateCase(c.id, triage), 'Case updated');
  const saveShare = () => {
    if (share.visibility !== 'private' && !share.staff_status) return toast.error('Choose the functional status staff will see');
    if (share.visibility === 'approved' && !share.shared_summary.trim()) return toast.error('Write the approved information for staff');
    return run('share', () => api.updateCase(c.id, { visibility: share.visibility, staff_status: share.visibility === 'private' ? null : share.staff_status, shared_summary: share.visibility === 'approved' ? share.shared_summary : null }), 'Sharing decision saved');
  };
  const sendMsg = () => { if (msg.trim()) void run('msg', async () => { await api.addCaseMessage(c.id, msgKind, msg.trim()); setMsg(''); }, msgKind === 'private_note' ? 'Note added' : 'Sent to the athlete'); };
  const upload = (f: File) => run('upload', () => api.uploadCaseFile(c, f), 'File attached');
  const closed = c.status === 'Closed';

  return (
    <div className="space-y-4">
      <Link to="/inbox" className="inline-flex items-center gap-1 text-sm font-semibold text-neutral-600 hover:text-brand-gold"><ArrowLeft className="h-4 w-4" /> Medical Inbox</Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-2xl font-bold uppercase text-brand-navy">{c.players?.full_name}</h1>
        <Badge color={CASE_STATUS_COLOR[c.status]}>{c.status}</Badge><Badge color={PRIORITY_COLOR[c.priority]}>{c.priority}</Badge>
        {c.athlete_urgent && <Badge color="red">Athlete marked urgent</Badge>}
        <span className="text-sm text-neutral-500">{c.case_code} · {formatDateTime(c.created_at)}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          <Card title="Complaint">
            <DetailGrid cols={2} items={[
              { label: 'Category', value: c.category }, { label: 'Pain', value: c.pain_score !== null ? `${c.pain_score}/10` : '—' },
              { label: 'Onset', value: c.onset_at ? formatDateTime(c.onset_at) : '—' }, { label: 'Context', value: c.context ?? '—' },
              { label: 'Can continue training', value: yn(c.can_continue) }, { label: 'Affects walking / movement', value: yn(c.affects_movement) },
              { label: 'How it started', value: c.how_started ?? '—', wide: true }, { label: 'Description', value: c.description ?? '—', wide: true },
            ]} />
            {c.body_locations.length > 0 && <div className="mt-4"><BodyMap value={c.body_locations} readOnly lang="en" /></div>}
          </Card>
          <Card title={<span className="flex items-center gap-2"><Paperclip className="h-5 w-5 text-brand-gold" /> Attachments</span>}
            actions={<label className="cursor-pointer text-sm font-semibold text-brand-gold">+ Attach<input type="file" className="hidden" accept="image/*,video/mp4,video/quicktime,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f); }} /></label>}>
            {files.length === 0 ? <p className="text-sm text-neutral-500">No attachments.</p> : (
              <div className="flex flex-wrap gap-2">{files.map((f) => (
                <button key={f.id} onClick={() => void api.getCaseFileBlob(f.file_path).then((b) => openFile(b, f.file_name)).catch((e) => toast.error((e as Error).message))}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:border-brand-gold"><FileText className="h-4 w-4" />{f.file_name}</button>
              ))}</div>
            )}
          </Card>
          <Card title={<span className="flex items-center gap-2"><MessageSquare className="h-5 w-5 text-brand-gold" /> Notes & communication</span>}>
            {messages.length === 0 && <p className="mb-3 text-sm text-neutral-500">No notes yet.</p>}
            <ul className="mb-4 space-y-2">{messages.map((m) => (
              <li key={m.id} className={clsx('rounded-xl p-3 text-sm', MSG[m.kind].cls)}>
                <p className="text-xs font-bold text-neutral-500">{m.kind === 'private_note' && <Lock className="mb-0.5 inline h-3 w-3" />} {MSG[m.kind].label} · {formatDateTime(m.created_at)}</p>
                <p className="mt-1 whitespace-pre-line">{m.body}</p>
              </li>
            ))}</ul>
            <div className="space-y-2">
              <Select value={msgKind} onChange={(e) => setMsgKind(e.target.value as typeof msgKind)} options={[
                { value: 'private_note', label: 'Private medical note (never shown to athlete or staff)' },
                { value: 'request_info', label: 'Request more information from the athlete' },
                { value: 'instruction', label: 'Send an instruction to the athlete' },
              ]} />
              <Textarea rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={msgKind === 'private_note' ? 'Clinical findings, impression…' : 'Written to the athlete (Arabic is fine)'} />
              <Button icon={<Send className="h-4 w-4" />} loading={busy === 'msg'} onClick={sendMsg}>{msgKind === 'private_note' ? 'Add note' : 'Send to athlete'}</Button>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title={<span className="flex items-center gap-2"><Stethoscope className="h-5 w-5 text-brand-gold" /> Triage & decision</span>}>
            <div className="space-y-3">
              <Field label="Priority"><Select value={triage.priority} onChange={(e) => setTriage({ ...triage, priority: e.target.value as MedicalCase['priority'] })} options={['Routine', 'Priority', 'Urgent']} /></Field>
              <Field label="Status"><Select value={triage.status} onChange={(e) => setTriage({ ...triage, status: e.target.value as MedicalCase['status'] })} options={STATUSES} /></Field>
              <Field label="Diagnosis / clinical impression (private)"><Input value={triage.diagnosis ?? ''} onChange={(e) => setTriage({ ...triage, diagnosis: e.target.value })} /></Field>
              <Button loading={busy === 'triage'} onClick={() => void saveTriage()}>Save</Button>
              {triage.priority === 'Urgent' && c.priority !== 'Urgent' && <p className="text-xs text-brand-red">Saving as Urgent immediately tells the athlete to contact you directly or emergency services.</p>}
            </div>
          </Card>
          <Card title="Next steps">
            <div className="grid gap-2">
              <Link to={`/examinations/new?player=${c.player_id}&type=Post-Injury`}><Button variant="secondary" className="w-full" icon={<Stethoscope className="h-4 w-4" />}>Create examination</Button></Link>
              <Link to={`/injuries/new?player=${c.player_id}`}><Button variant="secondary" className="w-full" icon={<HeartPulse className="h-4 w-4" />}>Record injury</Button></Link>
              <Link to="/availability?update=1"><Button variant="secondary" className="w-full" icon={<CalendarCheck2 className="h-4 w-4" />}>Change availability</Button></Link>
              {closed
                ? <Button variant="secondary" loading={busy === 'close'} onClick={() => void run('close', () => api.updateCase(c.id, { status: 'Under Review' }), 'Case reopened')}>Reopen case</Button>
                : <Button variant="dark" loading={busy === 'close'} onClick={() => void run('close', () => api.updateCase(c.id, { status: 'Closed' }), 'Case closed')}>Close case</Button>}
            </div>
          </Card>
          <Card title={<span className="flex items-center gap-2"><Share2 className="h-5 w-5 text-brand-gold" /> What coaching staff may see</span>}>
            {!caps.isPhysician ? <p className="text-sm text-neutral-500">Only the team physician decides what is shared.</p> : (
              <div className="space-y-3">
                {([
                  ['private', 'Private medical record', 'Only the medical team sees this case. Staff see nothing.', EyeOff],
                  ['limited', 'Limited staff information', 'Staff see only the functional status below.', Users],
                  ['approved', 'Approved medical report', 'Staff see the functional status and the text you approve.', Eye],
                ] as const).map(([v, t, d, Icon]) => (
                  <label key={v} className={clsx('flex cursor-pointer gap-3 rounded-xl border p-3', share.visibility === v ? 'border-brand-gold bg-brand-cream' : 'border-neutral-200')}>
                    <input type="radio" className="mt-1" checked={share.visibility === v} onChange={() => setShare({ ...share, visibility: v })} />
                    <span><span className="flex items-center gap-1.5 text-sm font-bold"><Icon className="h-4 w-4" />{t}</span><span className="text-xs text-neutral-500">{d}</span></span>
                  </label>
                ))}
                {share.visibility !== 'private' && <Field label="Functional status for staff"><Select value={share.staff_status} onChange={(e) => setShare({ ...share, staff_status: e.target.value })} options={STAFF_STATUSES} placeholder="Choose…" /></Field>}
                {share.visibility === 'approved' && <Field label="Approved information (exactly what staff will read)"><Textarea rows={3} value={share.shared_summary} onChange={(e) => setShare({ ...share, shared_summary: e.target.value })} placeholder="e.g. No sprinting or jumping for 7 days; individual programme" /></Field>}
                <Button loading={busy === 'share'} onClick={() => void saveShare()}>Approve sharing decision</Button>
                {disclosures.length > 0 && (
                  <div className="border-t pt-3">
                    <p className="mb-1 text-xs font-bold uppercase text-neutral-500">Disclosure log</p>
                    <ul className="space-y-1 text-xs text-neutral-600">{disclosures.map((d) => (
                      <li key={d.id}>{formatDateTime(d.created_at)} – <b>{d.visibility}</b>{d.staff_status ? ` · ${d.staff_status}` : ''}{d.shared_summary ? ` · “${d.shared_summary}”` : ''}</li>
                    ))}</ul>
                  </div>
                )}
              </div>
            )}
          </Card>
          <Card title="Previous complaints of this athlete">
            {related.loading ? <Spinner /> : !(related.data ?? []).length ? <p className="text-sm text-neutral-500">None.</p> : (
              <ul className="space-y-1.5 text-sm">{related.data!.map((r) => (
                <li key={r.id}><Link to={`/inbox/${r.id}`} className="hover:text-brand-gold"><b>{r.category}</b> · {formatDateTime(r.created_at)} · <span className="text-neutral-500">{r.status}</span></Link></li>
              ))}</ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
