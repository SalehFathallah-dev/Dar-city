import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, FileText, MessageSquare, Send, Stethoscope } from 'lucide-react';
import * as api from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../lib/format';
import type { MyCase } from '../../lib/types';
import { locationLabel } from '../../components/BodyMap';
import { categoryAr } from './ReportIssue';
import { Button } from '../../components/ui';
import { openFile } from '../../lib/native';

const STATUS_AR: Record<string, string> = {
  New: 'جديد', 'Under Review': 'قيد المراجعة', 'Information Requested': 'الطبيب يطلب معلومات', 'Examination Scheduled': 'موعد فحص',
  'In Treatment': 'قيد العلاج', Closed: 'مغلق',
};
const statusTone = (s: string) => s === 'Closed' ? 'bg-neutral-100 text-neutral-600' : s === 'Information Requested' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800';

/** The athlete's own medical reports, the doctor's requests/instructions and replies. */
export function MyCasesSection({ cases, onChanged }: { cases: MyCase[]; onChanged: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(cases.find((c) => c.status === 'Information Requested')?.id ?? null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  // Open the report the doctor is waiting on as soon as it arrives (cases load after the first render).
  const waitingId = cases.find((c) => c.status === 'Information Requested')?.id ?? null;
  useEffect(() => { if (waitingId) setOpen((o) => o ?? waitingId); }, [waitingId]);
  if (!cases.length) return null;
  const send = async (c: MyCase) => {
    if (!reply.trim()) return;
    setBusy(true);
    try { await api.athleteCaseReply(c.id, reply.trim()); setReply(''); toast.success('تم إرسال ردك للطبيب'); onChanged(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <section className="rounded-2xl bg-white p-4 shadow-card">
      <h2 className="mb-3 flex items-center gap-2 font-bold text-brand-navy"><Stethoscope className="h-5 w-5 text-brand-gold" /> بلاغاتي الطبية</h2>
      <ul className="space-y-2">
        {cases.map((c) => {
          const isOpen = open === c.id;
          const waiting = c.status === 'Information Requested';
          return (
            <li key={c.id} className={clsx('rounded-xl border', waiting ? 'border-amber-300' : 'border-neutral-200')}>
              <button onClick={() => setOpen(isOpen ? null : c.id)} className="flex w-full items-center gap-2 p-3 text-right">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-brand-navy">{categoryAr(c.category)}{c.pain_score !== null && <span className="text-xs text-neutral-500"> · ألم {c.pain_score}/10</span>}</p>
                  <p className="text-xs text-neutral-500">{c.case_code} · {formatDateTime(c.created_at)}</p>
                </div>
                <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-bold', statusTone(c.status))}>{STATUS_AR[c.status] ?? c.status}</span>
                <ChevronDown className={clsx('h-4 w-4 text-neutral-400 transition', isOpen && 'rotate-180')} />
              </button>
              {isOpen && (
                <div className="space-y-2 border-t p-3 text-sm">
                  {c.body_locations.length > 0 && <p className="text-xs text-neutral-600">المكان: {c.body_locations.map((l) => locationLabel(l, 'ar')).join('، ')}</p>}
                  {c.description && <p className="text-neutral-700">{c.description}</p>}
                  {c.files.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">{c.files.map((f) => (
                      <button key={f.file_path} onClick={() => void api.getCaseFileBlob(f.file_path).then((b) => openFile(b, f.file_name)).catch((e) => toast.error((e as Error).message))}
                        className="inline-flex items-center gap-1 rounded-lg bg-neutral-100 px-2 py-1 text-xs"><FileText className="h-3.5 w-3.5" />{f.file_name}</button>
                    ))}</div>
                  )}
                  {c.messages.length > 0 && (
                    <ul className="space-y-1.5">
                      {c.messages.map((m, i) => (
                        <li key={i} className={clsx('rounded-xl p-2.5', m.kind === 'athlete_reply' ? 'mr-6 bg-sky-50' : 'ml-6 bg-amber-50')}>
                          <p className="text-[11px] font-bold text-neutral-500"><MessageSquare className="mb-0.5 inline h-3 w-3" /> {m.kind === 'athlete_reply' ? 'أنت' : m.kind === 'request_info' ? 'الطبيب يطلب معلومات' : 'تعليمات الطبيب'}</p>
                          <p className="whitespace-pre-line">{m.body}</p>
                          <p className="text-[10px] text-neutral-400">{formatDateTime(m.created_at)}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                  {c.status !== 'Closed' && (
                    <div className="flex gap-2">
                      <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder={waiting ? 'اكتب ردك للطبيب…' : 'إضافة معلومة للطبيب…'} className="flex-1 rounded-xl border border-neutral-200 px-3 py-2" />
                      <Button size="sm" loading={busy} icon={<Send className="h-4 w-4" />} onClick={() => void send(c)}>إرسال</Button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
