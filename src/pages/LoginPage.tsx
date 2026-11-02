import { useState, type FormEvent } from 'react';
import { Lock, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { APP } from '../lib/constants';
import { Button, Field, Input, Logo } from '../components/ui';

export default function LoginPage() {
  const { signIn, resetPassword } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'login' | 'reset'>('login');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError('Enter a valid e-mail address.');
    if (mode === 'login' && password.length < 6) return setError('Enter your password.');
    setLoading(true);
    try {
      if (mode === 'login') await signIn(email, password);
      else { await resetPassword(email); toast.success('If the account exists, a password reset link has been sent.'); setMode('login'); }
    } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <div className="relative flex flex-col items-center justify-center overflow-hidden bg-brand-cream px-8 py-12 text-center lg:w-[55%]">
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand-goldLight/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-brand-navy/10 blur-3xl" />
        <Logo size={170} className="relative w-full max-w-xl" />
        <div className="relative mt-8 h-px w-40 bg-gradient-to-r from-transparent via-brand-gold to-transparent" />
        <p className="relative mt-5 text-xs font-bold uppercase tracking-[0.3em] text-brand-navy">{APP.product}</p>
        <p className="relative mt-2 max-w-md text-sm text-neutral-500">Secure medical records, injury management and return-to-play decisions for every club under care.</p>
      </div>
      <div className="flex flex-1 items-center justify-center bg-brand-navy px-6 py-12">
        <form onSubmit={submit} className="w-full max-w-sm animate-fade-in [&_label>span]:!text-brand-goldLight">
          <div className="mb-8">
            <h2 className="font-display text-3xl font-bold uppercase tracking-wide text-white">{mode === 'login' ? 'Secure Sign In' : 'Reset Password'}</h2>
            <p className="mt-1 text-sm text-neutral-300">{mode === 'login' ? 'Authorised medical and team staff only.' : 'We will e-mail you a secure reset link.'}</p>
          </div>
          <div className="space-y-4">
            <Field label="E-mail address">
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" placeholder="name@darcity.co.tz" required />
              </div>
            </Field>
            {mode === 'login' && (
              <Field label="Password">
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-9" required />
                </div>
              </Field>
            )}
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-brand-red" role="alert">{error}</p>}
            <Button type="submit" size="lg" loading={loading} className="w-full">{mode === 'login' ? 'Sign In' : 'Send Reset Link'}</Button>
            <button type="button" onClick={() => { setMode(mode === 'login' ? 'reset' : 'login'); setError(null); }} className="w-full text-center text-sm font-medium text-neutral-300 hover:text-brand-goldLight">
              {mode === 'login' ? 'Forgot your password?' : 'Back to sign in'}
            </button>
          </div>
          <p className="mt-10 flex items-center justify-center gap-2 text-xs text-neutral-400"><ShieldCheck className="h-4 w-4" /> Confidential medical information – access is logged.</p>
        </form>
      </div>
    </div>
  );
}
