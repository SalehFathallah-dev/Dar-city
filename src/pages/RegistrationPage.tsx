import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { CheckCircle2, ChevronLeft, Clock, LogOut, RefreshCw, Search, Shield, User, Users, XCircle } from 'lucide-react';
import * as api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatDateTime } from '../lib/format';
import type { MyRegistration } from '../lib/types';
import { Button, Input, Logo, Spinner } from '../components/ui';

type Club = Awaited<ReturnType<typeof api.registrationClubs>>[number];
type Person = Awaited<ReturnType<typeof api.registrationPeople>>[number];

/**
 * A new account with no role yet: choose the club, choose yourself from the list,
 * then wait for the physician's approval. Nothing else is visible before approval.
 */
export default function RegistrationPage() {
  const { profile, signOut, refreshProfile } = useAuth();
  const toast = useToast();
  const [mine, setMine] = useState<MyRegistration | null | undefined>(undefined);
  const [step, setStep] = useState<'club' | 'kind' | 'category' | 'person'>('club');
  const [clubs, setClubs] = useState<Club[] | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const [kind, setKind] = useState<'athlete' | 'staff'>('athlete');
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Person | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setMine(await api.myRegistration()); } catch (e) { setError((e as Error).message); setMine(null); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (mine === undefined || (mine && mine.status === 'pending')) return;
    void api.registrationClubs().then(setClubs).catch((e) => setError((e as Error).message));
  }, [mine]);

  // While waiting, check every 20 s whether the physician approved.
  useEffect(() => {
    if (mine?.status !== 'pending') return;
    const t = setInterval(() => { void refreshProfile(); void load(); }, 20_000);
    return () => clearInterval(t);
  }, [mine?.status, refreshProfile, load]);

  const chooseClub = async (c: Club) => {
    setClub(c); setStep('kind'); setError(null);
  };
  const chooseKind = async (k: 'athlete' | 'staff') => {
    setKind(k); setPeople(null); setPicked(null);
    if (k === 'athlete') {
      const cats = await api.registrationCategories(club!.id).catch(() => []);
      setCategories(cats);
      if (cats.length > 1) { setStep('category'); return; }
    }
    await loadPeople(k, null);
  };
  const loadPeople = async (k: 'athlete' | 'staff', cat: string | null) => {
    setCategory(cat); setStep('person'); setPeople(null);
    try { setPeople(await api.registrationPeople(club!.id, k, cat)); } catch (e) { setError((e as Error).message); setPeople([]); }
  };
  const submit = async () => {
    if (!club || !picked) return;
    setBusy(true);
    try {
      await api.submitRegistration(club.id, kind, picked.id);
      toast.success('تم إرسال الطلب – بانتظار موافقة الطبيب');
      await load();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const cancel = async () => {
    setBusy(true);
    try { await api.cancelMyRegistration(); setStep('club'); setClub(null); setPicked(null); await load(); } finally { setBusy(false); }
  };

  const filtered = useMemo(() => (people ?? []).filter((p) => p.full_name.toLowerCase().includes(q.trim().toLowerCase())), [people, q]);

  const shell = (children: React.ReactNode) => (
    <div dir="rtl" className="min-h-screen bg-brand-cream pb-10">
      <header className="flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <Logo mark size={34} />
        <div className="flex-1 leading-tight"><p className="font-bold text-brand-navy">تفعيل الحساب</p><p className="text-xs text-neutral-500">{profile?.full_name}</p></div>
        <button onClick={() => void signOut()} className="rounded-lg p-2 text-neutral-500" aria-label="خروج"><LogOut className="h-5 w-5" /></button>
      </header>
      <main className="mx-auto max-w-md px-4 pt-5">{children}</main>
    </div>
  );

  if (mine === undefined) return <div className="flex min-h-screen items-center justify-center bg-brand-cream"><Spinner label="جاري التحميل…" /></div>;

  if (mine?.status === 'pending') {
    return shell(
      <div className="rounded-2xl bg-white p-6 text-center shadow-card">
        <Clock className="mx-auto h-10 w-10 text-brand-gold" />
        <h1 className="mt-3 text-xl font-bold text-brand-navy">بانتظار موافقة الطبيب</h1>
        <p className="mt-2 text-sm text-neutral-600">طلبت الدخول باسم <b>{mine.person_name}</b> ({mine.kind === 'athlete' ? 'لاعب' : 'طاقم'}) في <b>{mine.club_name}</b>.</p>
        <p className="mt-1 text-xs text-neutral-400">{formatDateTime(mine.created_at)}</p>
        <p className="mt-4 text-sm text-neutral-600">سيفتح التطبيق تلقائياً عند الموافقة.</p>
        <div className="mt-6 grid gap-2">
          <Button icon={<RefreshCw className="h-4 w-4" />} onClick={() => { void refreshProfile(); void load(); }}>تحقّق الآن</Button>
          <Button variant="secondary" loading={busy} onClick={() => void cancel()}>إلغاء الطلب واختيار اسم آخر</Button>
        </div>
      </div>,
    );
  }

  return shell(
    <div className="space-y-4">
      {mine?.status === 'rejected' && (
        <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-brand-red">
          <XCircle className="h-5 w-5 shrink-0" />
          <div>لم تتم الموافقة على طلبك السابق ({mine.person_name}).{mine.decision_note && <> السبب: {mine.decision_note}</>} يمكنك المحاولة مرة أخرى أو التواصل مع الطبيب.</div>
        </div>
      )}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-brand-red">{error}</p>}

      {step !== 'club' && (
        <button onClick={() => setStep(step === 'person' ? (kind === 'athlete' && categories.length > 1 ? 'category' : 'kind') : step === 'category' ? 'kind' : 'club')}
          className="flex items-center gap-1 text-sm font-semibold text-neutral-600"><ChevronLeft className="h-4 w-4 rotate-180" /> رجوع</button>
      )}

      {step === 'club' && (
        <section className="rounded-2xl bg-white p-4 shadow-card">
          <h1 className="text-lg font-bold text-brand-navy">١. اختر ناديك</h1>
          {!clubs ? <Spinner /> : clubs.length === 0 ? <p className="py-4 text-sm text-neutral-500">لا توجد أندية متاحة بعد.</p> : (
            <ul className="mt-3 space-y-2">
              {clubs.map((c) => (
                <li key={c.id}><button onClick={() => void chooseClub(c)} className="flex w-full items-center gap-3 rounded-xl border border-neutral-200 p-3 text-right hover:border-brand-gold">
                  <Shield className="h-6 w-6 text-brand-gold" /><span className="flex-1"><b className="block text-brand-navy">{c.name}</b><span className="text-xs text-neutral-500">{[c.city, c.country].filter(Boolean).join('، ')}</span></span>
                </button></li>
              ))}
            </ul>
          )}
        </section>
      )}

      {step === 'kind' && club && (
        <section className="rounded-2xl bg-white p-4 shadow-card">
          <h1 className="text-lg font-bold text-brand-navy">٢. أنا في {club.name}…</h1>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button onClick={() => void chooseKind('athlete')} className="rounded-xl border border-neutral-200 p-5 text-center hover:border-brand-gold"><User className="mx-auto h-8 w-8 text-brand-gold" /><b className="mt-2 block text-brand-navy">لاعب</b></button>
            <button onClick={() => void chooseKind('staff')} className="rounded-xl border border-neutral-200 p-5 text-center hover:border-brand-gold"><Users className="mx-auto h-8 w-8 text-brand-gold" /><b className="mt-2 block text-brand-navy">طاقم فني / إداري</b></button>
          </div>
        </section>
      )}

      {step === 'category' && (
        <section className="rounded-2xl bg-white p-4 shadow-card">
          <h1 className="text-lg font-bold text-brand-navy">٣. الفئة السنية</h1>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {categories.map((c) => <button key={c} onClick={() => void loadPeople('athlete', c)} className="rounded-xl border border-neutral-200 p-3 font-semibold text-brand-navy hover:border-brand-gold">{c}</button>)}
            <button onClick={() => void loadPeople('athlete', null)} className="rounded-xl border border-dashed border-neutral-300 p-3 text-sm text-neutral-600">كل الفئات</button>
          </div>
        </section>
      )}

      {step === 'person' && (
        <section className="rounded-2xl bg-white p-4 shadow-card">
          <h1 className="text-lg font-bold text-brand-navy">اختر اسمك</h1>
          <p className="text-xs text-neutral-500">{club?.name}{category ? ` · ${category}` : ''} – إذا لم تجد اسمك اطلب من الطبيب إضافته.</p>
          <div className="relative mt-3"><Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن اسمك" className="pr-9" /></div>
          {!people ? <Spinner /> : filtered.length === 0 ? <p className="py-4 text-center text-sm text-neutral-500">لا توجد أسماء متاحة.</p> : (
            <ul className="mt-3 max-h-[50vh] space-y-1.5 overflow-y-auto">
              {filtered.map((p) => (
                <li key={p.id}><button onClick={() => setPicked(p)} className={clsx('flex w-full items-center gap-3 rounded-xl border p-3 text-right', picked?.id === p.id ? 'border-brand-gold bg-brand-cream' : 'border-neutral-200')}>
                  {picked?.id === p.id ? <CheckCircle2 className="h-5 w-5 text-brand-gold" /> : <User className="h-5 w-5 text-neutral-400" />}
                  <span className="flex-1 font-semibold text-brand-navy">{p.full_name}</span>{p.detail && <span className="text-xs text-neutral-500">{p.detail}</span>}
                </button></li>
              ))}
            </ul>
          )}
          <Button className="mt-4 w-full" disabled={!picked} loading={busy} onClick={() => void submit()}>إرسال طلب الدخول</Button>
          <p className="mt-2 text-center text-xs text-neutral-500">لن يُفتح الحساب إلا بعد موافقة الطبيب.</p>
        </section>
      )}
    </div>,
  );
}
