import { Copy, Download, KeyRound, MessageCircle, ShieldAlert } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { downloadCsv } from '../lib/csv';
import { todayISO } from '../lib/format';
import { Button, Modal } from './ui';

export interface Credential { full_name: string; role: string; username: string; password: string; phone?: string | null }

const ROLE_AR: Record<string, string> = { athlete: 'لاعب', head_coach: 'مدرب', team_manager: 'مدير الفريق', assistant_medical_staff: 'الطاقم الطبي', team_physician: 'طبيب' };
const ROLE_EN: Record<string, string> = { athlete: 'Player', head_coach: 'Coach', team_manager: 'Manager', assistant_medical_staff: 'Medical staff', team_physician: 'Physician' };

/** The Arabic message the physician sends to the person (WhatsApp / copy). */
export function credentialMessage(c: Credential) {
  const link = typeof window !== 'undefined' ? window.location.origin : '';
  return `مرحباً ${c.full_name}،\nحسابك في تطبيق د. صالح فتح الله للطب الرياضي (${ROLE_AR[c.role] ?? c.role}):\n\nالرابط: ${link}\nاسم المستخدم: ${c.username}\nكلمة المرور: ${c.password}\n\nعلى الآيفون أو الأندرويد: افتح الرابط ثم «إضافة إلى الشاشة الرئيسية». لا تشارك كلمة المرور مع أحد.`;
}
const waLink = (c: Credential) => {
  const phone = (c.phone ?? '').replace(/[^0-9]/g, '');
  return `https://wa.me/${phone}?text=${encodeURIComponent(credentialMessage(c))}`;
};

/** Shows newly generated sign-in details once (they cannot be displayed again later). */
export function CredentialsModal({ items, onClose, title }: { items: Credential[]; onClose: () => void; title?: string }) {
  const toast = useToast();
  const copy = async (text: string, msg = 'Copied') => {
    try { await navigator.clipboard.writeText(text); toast.success(msg); } catch { toast.error('Copy is not available – select the text instead'); }
  };
  if (!items.length) return null;
  return (
    <Modal open onClose={onClose} size="lg" title={title ?? (items.length === 1 ? 'App account created' : `${items.length} app accounts created`)}
      footer={<>
        {items.length > 1 && <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => downloadCsv(`App_Accounts_${todayISO()}`, items, [
          { header: 'Name', value: (c) => c.full_name }, { header: 'Category', value: (c) => ROLE_EN[c.role] ?? c.role },
          { header: 'Username', value: (c) => c.username }, { header: 'Password', value: (c) => c.password },
        ])}>Download list</Button>}
        {items.length > 1 && <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => void copy(items.map((c) => `${c.full_name} (${ROLE_EN[c.role] ?? c.role}) – ${c.username} / ${c.password}`).join('\n'), 'All accounts copied')}>Copy all</Button>}
        <Button onClick={onClose}>Done</Button>
      </>}>
      <p className="mb-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        Send each person their details now. Passwords are shown only once – if one is lost, use “New password” to generate another.
      </p>
      <ul className="max-h-[55vh] space-y-2 overflow-y-auto">
        {items.map((c) => (
          <li key={c.username} className="rounded-xl border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-bold text-brand-navy">{c.full_name}</p>
              <span className="rounded-full bg-brand-cream px-2 py-0.5 text-xs font-semibold text-brand-navy">{ROLE_EN[c.role] ?? c.role}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm" dir="ltr">
              <div className="rounded-lg bg-neutral-50 px-3 py-2"><p className="text-[10px] uppercase text-neutral-500">Username</p><p className="font-mono font-bold">{c.username}</p></div>
              <div className="rounded-lg bg-neutral-50 px-3 py-2"><p className="text-[10px] uppercase text-neutral-500">Password</p><p className="flex items-center gap-1 font-mono font-bold"><KeyRound className="h-3.5 w-3.5 text-brand-gold" />{c.password}</p></div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => void copy(credentialMessage(c), 'Message copied')}>Copy message</Button>
              <a href={waLink(c)} target="_blank" rel="noreferrer"><Button size="sm" variant="secondary" icon={<MessageCircle className="h-4 w-4 text-emerald-600" />}>WhatsApp</Button></a>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
