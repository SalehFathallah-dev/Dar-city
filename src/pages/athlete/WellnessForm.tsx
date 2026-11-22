import { useState } from 'react';
import clsx from 'clsx';
import { CheckCircle2, X } from 'lucide-react';
import * as api from '../../lib/api';
import { todayISO } from '../../lib/format';
import { Button } from '../../components/ui';

export const SESSION_TYPES: { value: string; ar: string }[] = [
  { value: 'Morning training', ar: 'تدريب صباحي' }, { value: 'Evening training', ar: 'تدريب مسائي' }, { value: 'Gym', ar: 'جيم' },
  { value: 'Conditioning', ar: 'لياقة' }, { value: 'Recovery', ar: 'استشفاء' }, { value: 'Match', ar: 'مباراة' },
];

function Scale({ min, max, value, onChange, low, high, invert }: { min: number; max: number; value: number | null; onChange: (v: number) => void; low: string; high: string; invert?: boolean }) {
  const n = max - min + 1;
  return (
    <div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} dir="ltr">
        {Array.from({ length: n }, (_, i) => {
          const v = min + i; const ratio = i / (n - 1); const bad = invert ? 1 - ratio : ratio;
          return (
            <button key={v} type="button" onClick={() => onChange(v)} aria-label={String(v)}
              className={clsx('rounded-lg py-2.5 text-sm font-bold', value === v ? (bad > 0.66 ? 'bg-brand-red text-white' : bad > 0.33 ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white') : 'border border-neutral-200 bg-white')}>{v}</button>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-neutral-500" dir="ltr"><span>{invert ? high : low}</span><span>{invert ? low : high}</span></div>
    </div>
  );
}
function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {[true, false].map((v) => <button key={String(v)} type="button" onClick={() => onChange(v)} className={clsx('rounded-xl border py-2.5 font-semibold', value === v ? 'border-brand-gold bg-brand-gold text-white' : 'border-neutral-200 bg-white')}>{v ? 'نعم' : 'لا'}</button>)}
    </div>
  );
}
const Q = ({ label, children }: { label: string; children: React.ReactNode }) => <div><p className="mb-1.5 text-sm font-bold text-brand-navy">{label}</p>{children}</div>;

type A = Record<string, string | number | boolean | null>;

/** Short daily questionnaire (pre- or post-training). */
export function WellnessForm({ kind, onClose, onDone }: { kind: 'pre' | 'post'; onClose: () => void; onDone: () => void }) {
  const [a, setA] = useState<A>(kind === 'pre' ? { sleep_hours: null, sleep_quality: null, fatigue: null, soreness: null, energy: null, pain: null, readiness: null, unwell: null } : { rpe: null, duration_minutes: null, fatigue: null, soreness: null, pain: null, completed_full: null });
  const [session, setSession] = useState(kind === 'pre' ? 'Day' : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const set = (k: string) => (v: string | number | boolean | null) => setA((x) => ({ ...x, [k]: v }));
  const num = (k: string) => (a[k] as number | null) ?? null;
  const bool = (k: string) => (a[k] as boolean | null) ?? null;

  const submit = async () => {
    setError(null);
    const required = kind === 'pre' ? ['sleep_hours', 'sleep_quality', 'fatigue', 'soreness', 'energy', 'pain', 'readiness', 'unwell'] : ['rpe', 'duration_minutes', 'fatigue', 'soreness', 'pain', 'completed_full'];
    if (kind === 'post' && !session) return setError('اختر نوع الحصة.');
    if (required.some((k) => a[k] === null || a[k] === '')) return setError('أجب على كل الأسئلة.');
    if (kind === 'pre' && a.pain && (a.pain_severity === null || a.pain_severity === undefined)) return setError('حدّد شدة الألم.');
    setBusy(true);
    try { await api.submitWellness(kind, todayISO(), session || 'Day', a); setDone(true); onDone(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div dir="rtl" className="fixed inset-0 z-[90] overflow-y-auto bg-[#F6F7FA]">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-white px-4 py-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <h1 className="flex-1 text-lg font-bold text-brand-navy">{kind === 'pre' ? 'استبيان قبل التدريب' : 'استبيان بعد التدريب'}</h1>
        <button onClick={onClose} className="rounded-lg p-2 text-neutral-500" aria-label="إغلاق"><X className="h-5 w-5" /></button>
      </header>
      {done ? (
        <div className="p-6 text-center">
          <CheckCircle2 className="mx-auto mt-10 h-14 w-14 text-emerald-600" />
          <h2 className="mt-3 text-xl font-bold text-brand-navy">شكراً، تم الحفظ</h2>
          {kind === 'post' && num('rpe') && num('duration_minutes') && <p className="mt-2 text-sm text-neutral-600">حِمل الحصة: <b>{(num('rpe') ?? 0) * (num('duration_minutes') ?? 0)}</b> (المدة × الشدة)</p>}
          <Button className="mt-8 w-full" onClick={onClose}>رجوع</Button>
        </div>
      ) : (
        <div className="mx-auto max-w-xl space-y-5 p-4 pb-16">
          {kind === 'pre' ? (
            <>
              <Q label="١. كم ساعة نمت؟">
                <div className="grid grid-cols-6 gap-1" dir="ltr">{[5, 6, 7, 8, 9, 10].map((h) => <button key={h} type="button" onClick={() => set('sleep_hours')(h)} className={clsx('rounded-lg py-2.5 font-bold', num('sleep_hours') === h ? 'bg-brand-gold text-white' : 'border border-neutral-200 bg-white')}>{h}</button>)}</div>
                <input type="number" step="0.5" min={0} max={16} value={num('sleep_hours') ?? ''} onChange={(e) => set('sleep_hours')(e.target.value === '' ? null : Number(e.target.value))} className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-2" placeholder="أو اكتب العدد" dir="ltr" />
              </Q>
              <Q label="٢. جودة النوم"><Scale min={1} max={5} value={num('sleep_quality')} onChange={set('sleep_quality')} low="سيئة جداً" high="ممتازة" invert /></Q>
              <Q label="٣. درجة الإرهاق"><Scale min={1} max={10} value={num('fatigue')} onChange={set('fatigue')} low="مرتاح" high="مرهق جداً" /></Q>
              <Q label="٤. ألم / تيبّس العضلات"><Scale min={1} max={10} value={num('soreness')} onChange={set('soreness')} low="لا يوجد" high="شديد" /></Q>
              <Q label="٥. مستوى الطاقة"><Scale min={1} max={10} value={num('energy')} onChange={set('energy')} low="منخفضة" high="عالية" invert /></Q>
              <Q label="٦. هل عندك ألم؟"><YesNo value={bool('pain')} onChange={set('pain')} /></Q>
              {a.pain === true && (
                <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
                  <Q label="مكان الألم"><input value={(a.pain_location as string) ?? ''} onChange={(e) => set('pain_location')(e.target.value)} className="w-full rounded-xl border border-neutral-200 px-3 py-2" placeholder="مثال: الركبة اليمنى" /></Q>
                  <Q label="شدة الألم"><Scale min={0} max={10} value={num('pain_severity')} onChange={set('pain_severity')} low="خفيف" high="شديد" /></Q>
                  <Q label="منذ متى؟"><div className="grid grid-cols-3 gap-2">{['اليوم', '٢–٣ أيام', 'أكثر من أسبوع'].map((d) => <button key={d} type="button" onClick={() => set('pain_duration')(d)} className={clsx('rounded-xl border py-2 text-sm font-semibold', a.pain_duration === d ? 'border-brand-gold bg-brand-gold text-white' : 'border-neutral-200 bg-white')}>{d}</button>)}</div></Q>
                  <Q label="ألم جديد؟ (لا = متكرر)"><YesNo value={bool('pain_new')} onChange={set('pain_new')} /></Q>
                  <Q label="هل يؤثر على الحركة؟"><YesNo value={bool('movement_affected')} onChange={set('movement_affected')} /></Q>
                </div>
              )}
              <Q label="٧. هل أنت جاهز للتدريب؟"><Scale min={1} max={10} value={num('readiness')} onChange={set('readiness')} low="غير جاهز" high="جاهز تماماً" invert /></Q>
              <Q label="٨. هل تشعر بتوعّك أو أعراض مرض؟"><YesNo value={bool('unwell')} onChange={set('unwell')} /></Q>
              {a.unwell === true && <input value={(a.illness_symptoms as string) ?? ''} onChange={(e) => set('illness_symptoms')(e.target.value)} className="w-full rounded-xl border border-neutral-200 px-3 py-2" placeholder="الأعراض: حرارة، كحة، إسهال…" />}
            </>
          ) : (
            <>
              <Q label="نوع الحصة"><div className="grid grid-cols-3 gap-2">{SESSION_TYPES.map((s) => <button key={s.value} type="button" onClick={() => setSession(s.value)} className={clsx('rounded-xl border py-2 text-sm font-semibold', session === s.value ? 'border-brand-gold bg-brand-gold text-white' : 'border-neutral-200 bg-white')}>{s.ar}</button>)}</div></Q>
              <Q label="١. مدى صعوبة الحصة (RPE)"><Scale min={1} max={10} value={num('rpe')} onChange={set('rpe')} low="سهلة جداً" high="أقصى مجهود" /></Q>
              <Q label="٢. مدة الحصة بالدقائق">
                <div className="grid grid-cols-5 gap-1" dir="ltr">{[45, 60, 75, 90, 120].map((m) => <button key={m} type="button" onClick={() => set('duration_minutes')(m)} className={clsx('rounded-lg py-2.5 text-sm font-bold', num('duration_minutes') === m ? 'bg-brand-gold text-white' : 'border border-neutral-200 bg-white')}>{m}</button>)}</div>
                <input type="number" min={1} max={600} value={num('duration_minutes') ?? ''} onChange={(e) => set('duration_minutes')(e.target.value === '' ? null : Number(e.target.value))} className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-2" placeholder="أو اكتب المدة" dir="ltr" />
              </Q>
              <Q label="٣. الإرهاق العام"><Scale min={1} max={10} value={num('fatigue')} onChange={set('fatigue')} low="مرتاح" high="مرهق جداً" /></Q>
              <Q label="٤. ألم العضلات"><Scale min={1} max={10} value={num('soreness')} onChange={set('soreness')} low="لا يوجد" high="شديد" /></Q>
              <Q label="٥. هل حدث ألم أو إصابة جديدة؟"><YesNo value={bool('pain')} onChange={set('pain')} /></Q>
              {a.pain === true && <input value={(a.pain_location as string) ?? ''} onChange={(e) => set('pain_location')(e.target.value)} className="w-full rounded-xl border border-neutral-200 px-3 py-2" placeholder="أين؟" />}
              <Q label="٦. هل أكملت الحصة كاملة؟"><YesNo value={bool('completed_full')} onChange={set('completed_full')} /></Q>
              <Q label="٧. أعراض غير عادية؟ (اختياري)"><input value={(a.unusual_symptoms as string) ?? ''} onChange={(e) => set('unusual_symptoms')(e.target.value)} className="w-full rounded-xl border border-neutral-200 px-3 py-2" placeholder="دوخة، خفقان، ضيق تنفس…" /></Q>
            </>
          )}
          {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-brand-red" role="alert">{error}</p>}
          <Button size="lg" className="w-full" loading={busy} onClick={() => void submit()}>حفظ</Button>
          <p className="text-center text-xs text-neutral-500">إذا عندك ألم شديد أو أعراض خطيرة، استخدم «الإبلاغ عن مشكلة طبية» أو اتصل بالطبيب مباشرة.</p>
        </div>
      )}
    </div>
  );
}
