import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Lock, ShieldCheck, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { APP } from '../lib/constants';
import { Button, Field, Input, Logo } from '../components/ui';

export default function LoginPage() {
  const { signIn, resetPassword } = useAuth();
  const toast = useToast();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'login' | 'reset'>('login');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (login.trim().length < 2) return setError('أدخل اسم المستخدم · Enter your username.');
    if (mode === 'login' && !password) return setError('أدخل كلمة المرور · Enter your password.');
    if (mode === 'reset' && !login.includes('@')) return setError('حسابات اسم المستخدم: اطلب من الطبيب إعادة تعيين كلمة المرور · Ask the doctor to reset your password.');
    setLoading(true);
    try {
      if (mode === 'login') await signIn(login, password);
      else { await resetPassword(login); toast.success('If the account exists, a password reset link has been sent.'); setMode('login'); }
    } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <div className="relative flex flex-col items-center justify-center overflow-hidden bg-brand-cream px-8 py-8 text-center lg:w-[55%]">
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand-goldLight/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-brand-navy/10 blur-3xl" />
        <Logo tall size={230} className="relative max-h-[36vh]" />
        <div className="relative mt-5 h-px w-40 bg-gradient-to-r from-transparent via-brand-gold to-transparent" />
        <p className="relative mt-4 text-xs font-bold uppercase tracking-[0.3em] text-brand-navy">{APP.product}</p>
      </div>
      <div className="flex flex-1 items-center justify-center bg-brand-navy px-6 py-10">
        <form onSubmit={submit} className="w-full max-w-sm animate-fade-in [&_label>span]:!text-brand-goldLight">
          <div className="mb-7">
            <h2 className="font-display text-3xl font-bold uppercase tracking-wide text-white">{mode === 'login' ? 'Sign In · تسجيل الدخول' : 'Reset Password'}</h2>
            <p className="mt-1 text-sm text-neutral-300">{mode === 'login' ? 'Doctor, staff and players · الطبيب، الطاقم واللاعبون' : 'Staff accounts with an e-mail address only.'}</p>
          </div>
          <div className="space-y-4">
            <Field label="Username or e-mail · اسم المستخدم">
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <Input autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} className="pl-9" placeholder="ali7" required />
              </div>
            </Field>
            {mode === 'login' && (
              <Field label="Password · كلمة المرور">
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <Input type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-9 pr-10" required />
                  <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400" aria-label={show ? 'Hide password' : 'Show password'}>
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>
            )}
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-brand-red" role="alert">{error}</p>}
            <Button type="submit" size="lg" loading={loading} className="w-full">{mode === 'login' ? 'Sign In · دخول' : 'Send Reset Link'}</Button>
            <button type="button" onClick={() => { setMode(mode === 'login' ? 'reset' : 'login'); setError(null); }} className="w-full text-center text-sm font-medium text-neutral-300 hover:text-brand-goldLight">
              {mode === 'login' ? 'Forgot your password? · نسيت كلمة المرور؟' : 'Back to sign in'}
            </button>
          </div>
          <p className="mt-8 flex items-center justify-center gap-2 text-xs text-neutral-400"><ShieldCheck className="h-4 w-4" /> Confidential medical information – access is logged.</p>
        </form>
      </div>
    </div>
  );
}
