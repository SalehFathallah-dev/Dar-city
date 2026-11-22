import { useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Paperclip, Phone, X } from 'lucide-react';
import * as api from '../../lib/api';
import { BodyMap } from '../../components/BodyMap';
import type { BodyLocation } from '../../lib/types';
import { Button } from '../../components/ui';

export const CASE_CATEGORIES: { value: string; ar: string }[] = [
  { value: 'Muscle pain', ar: 'ألم عضلي' }, { value: 'Joint pain', ar: 'ألم في المفصل' }, { value: 'Acute injury', ar: 'إصابة مفاجئة' },
  { value: 'Chronic pain', ar: 'ألم مزمن' }, { value: 'Illness', ar: 'مرض / حرارة / زكام' }, { value: 'Fatigue', ar: 'إرهاق' },
  { value: 'Swelling', ar: 'تورم' }, { value: 'Training-related problem', ar: 'مشكلة متعلقة بالتدريب' }, { value: 'Other', ar: 'أخرى' },
];
export const categoryAr = (v: string) => CASE_CATEGORIES.find((c) => c.value === v)?.ar ?? v;
const CONTEXTS = [{ value: 'Training', ar: 'أثناء التدريب' }, { value: 'Competition', ar: 'أثناء مباراة' }, { value: 'Outside sport', ar: 'خارج الرياضة' }, { value: 'Unknown', ar: 'لا أعرف' }];
const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {[true, false].map((v) => (
        <button key={String(v)} type="button" onClick={() => onChange(v)}
          className={clsx('rounded-xl border py-2.5 font-semibold', value === v ? 'border-brand-gold bg-brand-gold text-white' : 'border-neutral-200 bg-white text-neutral-700')}>{v ? 'نعم' : 'لا'}</button>
      ))}
    </div>
  );
}
const Q = ({ n, label, children }: { n: number; label: string; children: React.ReactNode }) => (
  <div><p className="mb-1.5 text-sm font-bold text-brand-navy"><span className="text-brand-gold">{n}. </span>{label}</p>{children}</div>
);

/** Full-screen form: an athlete reports a medical problem to the team doctor. */
export function ReportIssue({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [category, setCategory] = useState('');
  const [locations, setLocations] = useState<BodyLocation[]>([]);
  const [onset, setOnset] = useState(nowLocal());
  const [pain, setPain] = useState<number | null>(null);
  const [how, setHow] = useState('');
  const [context, setContext] = useState('');
  const [canContinue, setCanContinue] = useState<boolean | null>(null);
  const [movement, setMovement] = useState<boolean | null>(null);
  const [description, setDescription] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ code: string; failed: number } | null>(null);

  const serious = urgent || (pain ?? 0) >= 8 || movement === true || category === 'Acute injury';
  const submit = async () => {
    setError(null);
    if (!category) return setError('اختر نوع المشكلة.');
    if (pain === null) return setError('حدّد شدة الألم من 0 إلى 10.');
    if (category !== 'Illness' && category !== 'Fatigue' && locations.length === 0) return setError('حدّد مكان الألم على الجسم.');
    setBusy(true);
    try {
      const c = await api.submitMedicalCase({
        category, body_locations: locations, onset_at: onset ? new Date(onset).toISOString() : null, pain_score: pain,
        how_started: how, context, can_continue: canContinue, affects_movement: movement, description, athlete_urgent: urgent,
      });
      let failed = 0;
      for (const f of files) { try { await api.uploadCaseFile(c, f); } catch { failed += 1; } }
      setDone({ code: c.case_code, failed });
      onDone();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div dir="rtl" className="fixed inset-0 z-[90] overflow-y-auto bg-white p-6 text-center">
        <CheckCircle2 className="mx-auto mt-10 h-16 w-16 text-emerald-600" />
        <h1 className="mt-4 text-2xl font-bold text-brand-navy">تم إرسال البلاغ</h1>
        <p className="mt-2 text-neutral-600">رقم البلاغ <b>{done.code}</b>. وصل للطبيب وسيتابع حالتك، وستصلك الردود هنا.</p>
        {done.failed > 0 && <p className="mt-2 text-sm text-amber-700">تعذّر رفع {done.failed} ملف. يمكنك إرسالها للطبيب لاحقاً.</p>}
        {serious && <EmergencyNotice />}
        <Button className="mt-8 w-full" onClick={onClose}>رجوع</Button>
      </div>
    );
  }

  return (
    <div dir="rtl" className="fixed inset-0 z-[90] overflow-y-auto bg-[#F6F7FA]">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-white px-4 py-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <h1 className="flex-1 text-lg font-bold text-brand-red">الإبلاغ عن مشكلة طبية</h1>
        <button onClick={onClose} className="rounded-lg p-2 text-neutral-500" aria-label="إغلاق"><X className="h-5 w-5" /></button>
      </header>
      <div className="mx-auto max-w-xl space-y-5 p-4 pb-16">
        <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">هذا النموذج لا يغني عن الإسعاف. في حالة الخطر (إغماء، صعوبة تنفّس، ألم صدر، نزيف شديد، إصابة رأس) اتصل بالإسعاف فوراً.</p>
        <Q n={1} label="نوع المشكلة">
          <div className="grid grid-cols-2 gap-2">
            {CASE_CATEGORIES.map((c) => (
              <button key={c.value} type="button" onClick={() => setCategory(c.value)}
                className={clsx('rounded-xl border px-2 py-2.5 text-sm font-semibold', category === c.value ? 'border-brand-gold bg-brand-gold text-white' : 'border-neutral-200 bg-white')}>{c.ar}</button>
            ))}
          </div>
        </Q>
        <Q n={2} label="مكان الألم (يمكن اختيار أكثر من مكان)"><div className="rounded-xl bg-white p-2"><BodyMap value={locations} onChange={setLocations} /></div></Q>
        <Q n={3} label="متى بدأت المشكلة؟"><input type="datetime-local" value={onset} max={nowLocal()} onChange={(e) => setOnset(e.target.value)} className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5" dir="ltr" /></Q>
        <Q n={4} label="شدة الألم (0 = لا ألم، 10 = أقصى ألم)">
          <div className="grid grid-cols-11 gap-1" dir="ltr">
            {Array.from({ length: 11 }, (_, i) => (
              <button key={i} type="button" onClick={() => setPain(i)} aria-label={`pain ${i}`}
                className={clsx('rounded-lg py-2 text-sm font-bold', pain === i ? (i >= 7 ? 'bg-brand-red text-white' : i >= 4 ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white') : 'border border-neutral-200 bg-white')}>{i}</button>
            ))}
          </div>
        </Q>
        <Q n={5} label="كيف بدأت المشكلة؟"><textarea rows={2} value={how} onChange={(e) => setHow(e.target.value)} className="w-full rounded-xl border border-neutral-200 p-3" placeholder="مثال: أثناء القفز والهبوط على القدم" /></Q>
        <Q n={6} label="متى حدثت؟">
          <div className="grid grid-cols-2 gap-2">
            {CONTEXTS.map((c) => <button key={c.value} type="button" onClick={() => setContext(c.value)} className={clsx('rounded-xl border py-2.5 text-sm font-semibold', context === c.value ? 'border-brand-gold bg-brand-gold text-white' : 'border-neutral-200 bg-white')}>{c.ar}</button>)}
          </div>
        </Q>
        <Q n={7} label="هل تستطيع مواصلة التدريب؟"><YesNo value={canContinue} onChange={setCanContinue} /></Q>
        <Q n={8} label="هل تؤثر على المشي أو الحركة العادية؟"><YesNo value={movement} onChange={setMovement} /></Q>
        <Q n={9} label="وصف إضافي"><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-xl border border-neutral-200 p-3" /></Q>
        <Q n={10} label="صور، فيديو أو تقارير (اختياري)">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 bg-white py-3 text-sm font-semibold text-neutral-600">
            <Paperclip className="h-4 w-4" /> إرفاق ملفات
            <input type="file" multiple accept="image/*,video/mp4,video/quicktime,application/pdf" className="hidden"
              onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 6)); e.target.value = ''; }} />
          </label>
          {files.length > 0 && <ul className="mt-2 space-y-1 text-xs">{files.map((f, i) => (
            <li key={i} className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5"><span className="truncate">{f.name}</span><button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="remove"><X className="h-4 w-4" /></button></li>
          ))}</ul>}
        </Q>
        <label className={clsx('flex items-center gap-3 rounded-xl border p-3', urgent ? 'border-brand-red bg-red-50' : 'border-neutral-200 bg-white')}>
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="h-5 w-5 accent-brand-red" />
          <span className="text-sm font-bold text-brand-red">أعتقد أن الحالة عاجلة</span>
        </label>
        {serious && <EmergencyNotice />}
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-brand-red" role="alert">{error}</p>}
        <Button size="lg" className="w-full !bg-brand-red" loading={busy} onClick={() => void submit()}>إرسال البلاغ للطبيب</Button>
      </div>
    </div>
  );
}

export function EmergencyNotice() {
  return (
    <div className="mt-4 rounded-xl border-2 border-brand-red bg-red-50 p-4 text-right text-sm text-brand-red">
      <p className="flex items-center gap-2 font-bold"><AlertTriangle className="h-5 w-5" /> حالة قد تكون عاجلة</p>
      <p className="mt-1">اتصل بالطبيب مباشرة الآن ولا تنتظر الرد على التطبيق.</p>
      <p className="mt-1 flex items-center gap-2 font-semibold"><Phone className="h-4 w-4" /> في حالة الخطر اتصل بالإسعاف أو توجّه لأقرب قسم طوارئ.</p>
      <p className="mt-1 text-xs">إرسال النموذج لا يغني عن الفحص الطبي الطارئ.</p>
    </div>
  );
}
