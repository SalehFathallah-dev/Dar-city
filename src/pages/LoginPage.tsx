import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Lock, ShieldCheck, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { selfRegister } from '../lib/api';
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
  const [mode, setMode] = useState<'login' | 'reset' | 'signup'>('login');
  const [fullName, setFullName] = useState('');
  const [confirm, setConfirm] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (login.trim().length < 2) return setError('أدخل اسم المستخدم · Enter your username.');
    if (mode === 'login' && !password) return setError('أدخل كلمة المرور · Enter your password.');
    if (mode === 'signup') {
      if (fullName.trim().length < 2) return setError('اكتب اسمك الكامل · Enter your full name.');
      if (!/^[a-z0-9._-]{3,30}$/i.test(login.trim())) return setError('اسم المستخدم: ٣ أحرف أو أرقام على الأقل بدون مسافات · Username: letters/numbers only.');
      if (password.length < 8) return setError('كلمة المرور ٨ أحرف على الأقل · Password: at least 8 characters.');
      if (password !== confirm) return setError('كلمتا المرور غير متطابقتين · Passwords do not match.');
      setLoading(true);
      try { await selfRegister(login.trim().toLowerCase(), password, fullName.trim()); await signIn(login, password); }
      catch (err) { setError((err as Error).message); } finally { setLoading(false); }
      return;
    }
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
            <h2 className="font-display text-3xl font-bold uppercase tracking-wide text-white">{mode === 'login' ? 'Sign In · تسجيل الدخول' : mode === 'signup' ? 'New Account · حساب جديد' : 'Reset Password'}</h2>
            <p className="mt-1 text-sm text-neutral-300">{mode === 'login' ? 'Doctor, staff and players · الطبيب، الطاقم واللاعبون' : mode === 'signup' ? 'لاعب أو عضو طاقم: أنشئ حسابك ثم اختر ناديك واسمك، وينتظر الحساب موافقة الطبيب.' : 'Staff accounts with an e-mail address only.'}</p>
          </div>
          <div className="space-y-4">
            {mode === 'signup' && (
              <Field label="Full name · الاسم الكامل"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" /></Field>
            )}
            <Field label={mode === 'signup' ? 'Choose a username · اختر اسم مستخدم' : 'Username or e-mail · اسم المستخدم'}>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <Input autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} className="pl-9" placeholder="ali7" required />
              </div>
            </Field>
            {mode !== 'reset' && (
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
            {mode === 'signup' && (
              <Field label="Confirm password · تأكيد كلمة المرور"><Input type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
            )}
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-brand-red" role="alert">{error}</p>}
            <Button type="submit" size="lg" loading={loading} className="w-full">{mode === 'login' ? 'Sign In · دخول' : mode === 'signup' ? 'Create account · إنشاء الحساب' : 'Send Reset Link'}</Button>
            {mode === 'login' ? (
              <>
                <button type="button" onClick={() => { setMode('signup'); setError(null); }} className="w-full rounded-lg border border-white/20 py-2.5 text-center text-sm font-semibold text-white hover:bg-white/5">
                  New player or staff? Create an account · حساب جديد
                </button>
                <button type="button" onClick={() => { setMode('reset'); setError(null); }} className="w-full text-center text-sm font-medium text-neutral-300 hover:text-brand-goldLight">
                  Forgot your password? · نسيت كلمة المرور؟
                </button>
              </>
            ) : (
              <button type="button" onClick={() => { setMode('login'); setError(null); }} className="w-full text-center text-sm font-medium text-neutral-300 hover:text-brand-goldLight">
                Back to sign in · رجوع
              </button>
            )}
          </div>
          <p className="mt-8 flex items-center justify-center gap-2 text-xs text-neutral-400"><ShieldCheck className="h-4 w-4" /> Confidential medical information – access is logged.</p>
        </form>
      </div>
    </div>
  );
}
