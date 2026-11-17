import { useState } from 'react';
import { Check, Eye, EyeOff, KeyRound, X } from 'lucide-react';
import clsx from 'clsx';
import { MIN_PASSWORD, useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button, Field, Input, Modal } from './ui';

export const PASSWORD_RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: `At least ${MIN_PASSWORD} characters`, test: (p) => p.length >= MIN_PASSWORD },
];
export const passwordOk = (p: string) => PASSWORD_RULES.every((r) => r.test(p));

export function PasswordRules({ value }: { value: string }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(value);
        return (
          <li key={r.label} className={clsx('flex items-center gap-1', ok ? 'text-emerald-700' : 'text-neutral-500')}>
            {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}{r.label}
          </li>
        );
      })}
    </ul>
  );
}

/** Lets the signed-in user change their own password (current password required). */
export function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { changePassword } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => { setCurrent(''); setPw(''); setPw2(''); setErr(null); setShow(false); };
  const close = () => { reset(); onClose(); };

  const save = async () => {
    setErr(null);
    if (!current) return setErr('Enter your current password.');
    if (!passwordOk(pw)) return setErr('The new password does not meet all the requirements.');
    if (pw !== pw2) return setErr('The new passwords do not match.');
    if (pw === current) return setErr('The new password must be different from the current one.');
    setSaving(true);
    try {
      await changePassword(current, pw);
      toast.success('Your password has been changed.');
      close();
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  };

  const type = show ? 'text' : 'password';
  return (
    <Modal open={open} onClose={close} title="Change Password"
      footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button loading={saving} icon={<KeyRound className="h-4 w-4" />} onClick={save}>Change Password</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <p className="text-sm text-neutral-600">This password unlocks the app on this phone.</p>
        <Field label="Current password"><Input type={type} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
        <Field label="New password"><Input type={type} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <PasswordRules value={pw} />
        <Field label="Confirm new password" error={pw2 && pw !== pw2 ? 'Passwords do not match' : undefined}>
          <Input type={type} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} error={!!pw2 && pw !== pw2} />
        </Field>
        <button type="button" onClick={() => setShow(!show)} className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-brand-gold">
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{show ? 'Hide passwords' : 'Show passwords'}
        </button>
        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-brand-red" role="alert">{err}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
