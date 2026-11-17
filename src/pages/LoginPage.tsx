import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Lock, ShieldCheck, Smartphone } from 'lucide-react';
import { MIN_PASSWORD, useAuth } from '../context/AuthContext';
import { APP } from '../lib/constants';
import { Button, Field, Input, Logo } from '../components/ui';

/** Unlock screen. On first launch it asks the doctor to create the device password. */
export default function LoginPage() {
  const { signIn, createPassword, needsSetup } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (needsSetup) {
      if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`);
      if (password !== confirm) return setError('The two passwords do not match.');
    } else if (!password) return setError('Enter your password.');
    setLoading(true);
    try {
      if (needsSetup) await createPassword(password);
      else await signIn(password);
    } catch (err) { setError((err as Error).message); setPassword(''); } finally { setLoading(false); }
  };
  const type = show ? 'text' : 'password';

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <div className="relative flex flex-col items-center justify-center overflow-hidden bg-brand-cream px-8 py-10 text-center lg:w-[55%]">
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand-goldLight/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-brand-navy/10 blur-3xl" />
        <Logo tall size={260} className="relative max-h-[42vh]" />
        <div className="relative mt-6 h-px w-40 bg-gradient-to-r from-transparent via-brand-gold to-transparent" />
        <p className="relative mt-4 text-xs font-bold uppercase tracking-[0.3em] text-brand-navy">{APP.product}</p>
      </div>
      <div className="flex flex-1 items-center justify-center bg-brand-navy px-6 py-10">
        <form onSubmit={submit} className="w-full max-w-sm animate-fade-in [&_label>span]:!text-brand-goldLight">
          <div className="mb-8">
            <h2 className="font-display text-3xl font-bold uppercase tracking-wide text-white">{needsSetup ? 'Create Password' : 'Unlock'}</h2>
            <p className="mt-1 text-sm text-neutral-300">
              {needsSetup ? 'Choose a password (or PIN) that protects the medical records on this phone.' : APP.physician}
            </p>
          </div>
          <div className="space-y-4">
            <Field label={needsSetup ? 'New password' : 'Password'}>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <Input type={type} autoFocus autoComplete={needsSetup ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} className="pl-9 pr-10" />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400" aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            {needsSetup && (
              <Field label="Confirm password">
                <Input type={type} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </Field>
            )}
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-brand-red" role="alert">{error}</p>}
            <Button type="submit" size="lg" loading={loading} className="w-full">{needsSetup ? 'Create & Open' : 'Unlock'}</Button>
            {needsSetup && <p className="text-xs text-neutral-400">This password cannot be recovered. Keep regular backups from Export Center → Full Backup.</p>}
          </div>
          <p className="mt-10 flex items-center justify-center gap-2 text-xs text-neutral-400"><Smartphone className="h-4 w-4" /> All records are stored only on this phone.</p>
          <p className="mt-2 flex items-center justify-center gap-2 text-xs text-neutral-400"><ShieldCheck className="h-4 w-4" /> Confidential medical information.</p>
        </form>
      </div>
    </div>
  );
}
