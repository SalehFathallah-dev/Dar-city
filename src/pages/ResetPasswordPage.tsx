import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { Button, Field, Input, Logo } from '../components/ui';
import { PasswordRules, passwordOk } from '../components/ChangePasswordModal';

export default function ResetPasswordPage() {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();
  const submit = async () => {
    if (!passwordOk(pw)) return setErr('The new password does not meet all the requirements.');
    if (pw !== pw2) return setErr('Passwords do not match.');
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setSaving(false);
    if (error) return setErr(error.message);
    toast.success('Password updated');
    navigate('/');
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-ink p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        <Logo size={70} className="mx-auto" />
        <h1 className="mt-3 text-center font-display text-2xl font-bold uppercase">Set a new password</h1>
        <div className="mt-6 space-y-4">
          <Field label="New password"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
          <PasswordRules value={pw} />
          <Field label="Confirm password"><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></Field>
          {err && <p className="text-sm text-brand-red">{err}</p>}
          <Button className="w-full" loading={saving} onClick={submit}>Update password</Button>
        </div>
      </div>
    </div>
  );
}
