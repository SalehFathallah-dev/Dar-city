import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Activity, Check, ChevronLeft, ChevronRight, Clock, Dumbbell, HeartPulse, KeyRound, LogOut, Pill, RefreshCw, Undo2, X,
} from 'lucide-react';
import * as api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { addDays, formatDate, todayISO } from '../../lib/format';
import { KIND_LABEL_AR, WEEKDAYS_AR } from '../../lib/constants';
import type { AthletePortal, DoseEntry } from '../../lib/types';
import { Badge, Button, ErrorBlock, Logo, Spinner, statusColor } from '../../components/ui';
import { ChangePasswordModal } from '../../components/ChangePasswordModal';
import { NotificationBell } from '../../components/NotificationBell';
import { ReportIssue } from './ReportIssue';
import { WellnessForm } from './WellnessForm';
import { MyCasesSection } from './MyCasesSection';
import { MyScheduleSection } from './MyScheduleSection';
import type { MyCase, MySchedule, WellnessResponse } from '../../lib/types';
import { AlertTriangle, ClipboardList } from 'lucide-react';

const DAYS_BACK = 6;
type Rx = AthletePortal['prescriptions'][number];

const kindIcon = (k: string) => k === 'Exercise' ? <Dumbbell className="h-5 w-5" /> : k === 'Treatment' ? <HeartPulse className="h-5 w-5" /> : <Pill className="h-5 w-5" />;
const timeLabel = (t: string) => (t === 'any' ? 'خلال اليوم' : t);

/** The athlete's own screen: today's doses, confirmation, programme and status. */
export default function AthletePortalPage() {
  const { profile, signOut } = useAuth();
  const toast = useToast();
  const today = todayISO();
  const [day, setDay] = useState(today);
  const [data, setData] = useState<AthletePortal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [cases, setCases] = useState<MyCase[]>([]);
  const [wellness, setWellness] = useState<{ settings: { pre_enabled: boolean; post_enabled: boolean; reminder_time: string }; responses: WellnessResponse[] } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [schedule, setSchedule] = useState<MySchedule | null>(null);
  const [formKind, setFormKind] = useState<'pre' | 'post' | null>(null);
  const loadExtras = useCallback(async () => {
    const [c, w, sc] = await Promise.all([api.myCases().catch(() => []), api.myWellness(today, today).catch(() => null), api.mySchedule(today, addDays(today, 7)).catch(() => null)]);
    setCases(c); setWellness(w); setSchedule(sc);
    return w;
  }, [today]);

  const load = useCallback(async () => {
    try {
      const p = await api.getMyPortal(addDays(today, -DAYS_BACK), today);
      setData(p);
      setError(null);
      return p;
    } catch (e) { setError((e as Error).message); return null; }
  }, [today]);

  useEffect(() => {
    void load();
    void loadExtras();
    // Refresh when the app comes back to the foreground.
    const onVis = () => { if (document.visibilityState === 'visible') { void load(); void loadExtras(); } };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load, loadExtras, toast]);

  const rxById = useMemo(() => new Map((data?.prescriptions ?? []).map((r) => [r.id, r])), [data]);
  const dayDoses = useMemo(() => (data?.doses ?? []).filter((d) => d.scheduled_date === day && rxById.has(d.prescription_id))
    .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time)), [data, day, rxById]);
  const week = useMemo(() => {
    const due = (data?.doses ?? []).filter((d) => d.scheduled_date < today || d.status);
    const taken = due.filter((d) => d.status === 'taken').length;
    return { due: due.length, taken, pct: due.length ? Math.round((taken / due.length) * 100) : null };
  }, [data, today]);

  const mark = async (d: DoseEntry, status: 'taken' | 'skipped' | null) => {
    const key = `${d.prescription_id}|${d.scheduled_date}|${d.scheduled_time}`;
    setBusy(key);
    try {
      if (status) await api.logDose(d.prescription_id, d.scheduled_date, d.scheduled_time, status);
      else await api.clearDose(d.prescription_id, d.scheduled_date, d.scheduled_time);
      if (status === 'taken') toast.success('تم التسجيل ✓ بالتوفيق');
      await load();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  if (error && !data) return <div className="p-6" dir="rtl"><ErrorBlock message={error} onRetry={() => void load()} /><Button className="mt-4" variant="secondary" onClick={() => void signOut()}>تسجيل الخروج</Button></div>;
  if (!data) return <div className="flex min-h-screen items-center justify-center bg-brand-cream"><Spinner label="جاري التحميل…" /></div>;

  const p = data.player;
  const a = data.availability;
  const dayLabel = day === today ? 'اليوم' : day === addDays(today, -1) ? 'أمس' : WEEKDAYS_AR[new Date(day).getDay()];

  return (
    <div dir="rtl" className="min-h-screen bg-[#F6F7FA] pb-10 font-sans">
      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-neutral-200 bg-white/95 px-4 py-2.5 backdrop-blur" style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}>
        <Logo mark size={34} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate font-display text-lg font-bold uppercase text-brand-navy">{p?.full_name ?? profile?.full_name}</p>
          <p className="truncate text-xs text-neutral-500">{[p?.club_short_name, p?.jersey_number != null && `#${p.jersey_number}`, p?.player_code].filter(Boolean).join(' · ')}</p>
        </div>
        <NotificationBell lang="ar" />
        <button onClick={() => { void load(); void loadExtras(); }} className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100" aria-label="تحديث"><RefreshCw className="h-5 w-5" /></button>
        <button onClick={() => setPwOpen(true)} className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100" aria-label="تغيير كلمة المرور"><KeyRound className="h-5 w-5" /></button>
        <button onClick={() => void signOut()} className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100" aria-label="خروج"><LogOut className="h-5 w-5" /></button>
      </header>

      <main className="mx-auto max-w-xl space-y-4 px-4 pt-4">
        <button onClick={() => setReportOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-red px-4 py-4 text-lg font-bold text-white shadow-lg shadow-brand-red/25 active:scale-[0.99]">
          <AlertTriangle className="h-6 w-6" /> الإبلاغ عن مشكلة طبية
        </button>
        {wellness && (wellness.settings.pre_enabled || wellness.settings.post_enabled) && (() => {
          const preDone = wellness.responses.some((r) => r.kind === 'pre' && r.response_date === today);
          const posts = wellness.responses.filter((r) => r.kind === 'post' && r.response_date === today);
          return (
            <section className="rounded-2xl bg-white p-4 shadow-card">
              <h2 className="mb-3 flex items-center gap-2 font-bold text-brand-navy"><ClipboardList className="h-5 w-5 text-brand-gold" /> استبيانات اليوم</h2>
              <div className="grid gap-2">
                {wellness.settings.pre_enabled && (preDone
                  ? <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700"><Check className="h-4 w-4" /> استبيان قبل التدريب – تم</p>
                  : <Button onClick={() => setFormKind('pre')}>املأ استبيان قبل التدريب (دقيقة واحدة)</Button>)}
                {wellness.settings.post_enabled && (
                  <Button variant="secondary" onClick={() => setFormKind('post')}>استبيان بعد التدريب{posts.length ? ` (تم ${posts.length})` : ''}</Button>
                )}
              </div>
            </section>
          );
        })()}
        {schedule && <MyScheduleSection s={schedule} />}
        <MyCasesSection cases={cases} onChanged={() => void loadExtras()} />
        {/* Status */}
        <section className="overflow-hidden rounded-2xl bg-brand-navy text-white shadow-card">
          <div className="p-4">
            <p className="text-xs font-semibold text-brand-goldLight">حالتي الطبية</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge color={statusColor(a?.availability ?? 'UNDER MEDICAL REVIEW')}>{a?.availability ?? 'UNDER MEDICAL REVIEW'}</Badge>
              <span className="text-sm text-neutral-200">{a?.medical_status ?? 'Awaiting Assessment'}</span>
            </div>
            {a?.restrictions && <p className="mt-3 rounded-lg bg-white/10 p-2.5 text-sm"><b className="text-brand-goldLight">القيود: </b>{a.restrictions}</p>}
            {a?.staff_notes && <p className="mt-2 text-sm text-neutral-200">{a.staff_notes}</p>}
            {a?.next_followup_date && <p className="mt-2 text-xs text-neutral-300">المراجعة القادمة: <b className="text-white">{formatDate(a.next_followup_date)}</b></p>}
          </div>
          <div className="grid grid-cols-2 divide-x divide-x-reverse divide-white/10 border-t border-white/10 text-center">
            <div className="p-3"><p className="font-display text-2xl font-bold">{week.pct === null ? '—' : `${week.pct}%`}</p><p className="text-[11px] text-neutral-300">الالتزام آخر ٧ أيام</p></div>
            <div className="p-3"><p className="font-display text-2xl font-bold">{week.taken}/{week.due}</p><p className="text-[11px] text-neutral-300">جرعات مؤكدة</p></div>
          </div>
        </section>

        {/* Doses of the selected day */}
        <section className="rounded-2xl bg-white p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <button disabled={day <= addDays(today, -DAYS_BACK)} onClick={() => setDay(addDays(day, -1))} className="rounded-lg p-1.5 text-neutral-500 disabled:opacity-30" aria-label="اليوم السابق"><ChevronRight className="h-5 w-5" /></button>
            <div className="text-center">
              <h2 className="font-bold text-brand-navy">جرعات {dayLabel}</h2>
              <p className="text-xs text-neutral-500">{formatDate(day)}</p>
            </div>
            <button disabled={day >= today} onClick={() => setDay(addDays(day, 1))} className="rounded-lg p-1.5 text-neutral-500 disabled:opacity-30" aria-label="اليوم التالي"><ChevronLeft className="h-5 w-5" /></button>
          </div>
          {dayDoses.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-500">لا توجد جرعات في هذا اليوم.</p>
          ) : (
            <ul className="space-y-2.5">
              {dayDoses.map((d) => {
                const rx = rxById.get(d.prescription_id) as Rx;
                const key = `${d.prescription_id}|${d.scheduled_date}|${d.scheduled_time}`;
                const late = !d.status && (d.scheduled_date < today || (d.scheduled_time !== 'any' && d.scheduled_date === today && d.scheduled_time < new Date().toTimeString().slice(0, 5)));
                return (
                  <li key={key} className={clsx('rounded-xl border p-3', d.status === 'taken' ? 'border-emerald-200 bg-emerald-50' : d.status === 'skipped' ? 'border-red-200 bg-red-50' : late ? 'border-amber-300 bg-amber-50' : 'border-neutral-200')}>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 rounded-lg bg-brand-cream p-2 text-brand-gold">{kindIcon(rx.kind)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-brand-navy">{rx.name}</p>
                        <p className="text-xs text-neutral-500">{KIND_LABEL_AR[rx.kind] ?? rx.kind}{rx.dose ? ` · ${rx.dose}` : ''}</p>
                        <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-neutral-600"><Clock className="h-3.5 w-3.5" />{timeLabel(d.scheduled_time)}{late && <span className="text-amber-700"> · متأخرة</span>}</p>
                        {rx.instructions && <p className="mt-1.5 text-xs text-neutral-600">{rx.instructions}</p>}
                      </div>
                    </div>
                    {d.status ? (
                      <div className="mt-2.5 flex items-center justify-between">
                        <span className={clsx('flex items-center gap-1 text-sm font-bold', d.status === 'taken' ? 'text-emerald-700' : 'text-brand-red')}>
                          {d.status === 'taken' ? <><Check className="h-4 w-4" /> أخذتها</> : <><X className="h-4 w-4" /> لم آخذها</>}
                        </span>
                        {d.scheduled_date >= addDays(today, -1) && (
                          <button disabled={busy === key} onClick={() => void mark(d, null)} className="flex items-center gap-1 text-xs text-neutral-500 hover:text-brand-navy"><Undo2 className="h-3.5 w-3.5" /> تراجع</button>
                        )}
                      </div>
                    ) : (
                      <div className="mt-2.5 grid grid-cols-[2fr_1fr] gap-2">
                        <Button loading={busy === key} icon={<Check className="h-4 w-4" />} onClick={() => void mark(d, 'taken')}>أخذتها ✓</Button>
                        <Button variant="secondary" disabled={busy === key} onClick={() => void mark(d, 'skipped')}>لم آخذها</Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Rehabilitation programme */}
        {data.rehab.length > 0 && (
          <section className="rounded-2xl bg-white p-4 shadow-card">
            <h2 className="mb-3 flex items-center gap-2 font-bold text-brand-navy"><Activity className="h-5 w-5 text-brand-gold" /> برنامجي التأهيلي</h2>
            {data.rehab.map((r) => (
              <div key={r.id} className="mb-3 rounded-xl bg-brand-cream p-3 last:mb-0">
                <div className="flex flex-wrap items-center gap-2"><Badge color="orange">{r.current_phase}</Badge><span className="text-xs text-neutral-500">{r.body_region} · {r.injury_type} · منذ {formatDate(r.start_date)}</span></div>
                {r.goals && <><p className="mt-2 text-xs font-bold text-brand-navy">الأهداف</p><p className="whitespace-pre-line text-sm text-neutral-700">{r.goals}</p></>}
                {r.exercises && <><p className="mt-2 text-xs font-bold text-brand-navy">التمارين</p><p className="whitespace-pre-line text-sm text-neutral-700">{r.exercises}</p></>}
                {r.training_load && <><p className="mt-2 text-xs font-bold text-brand-navy">حِمل التدريب</p><p className="whitespace-pre-line text-sm text-neutral-700">{r.training_load}</p></>}
              </div>
            ))}
          </section>
        )}

        {/* Current injuries */}
        {data.injuries.length > 0 && (
          <section className="rounded-2xl bg-white p-4 shadow-card">
            <h2 className="mb-3 flex items-center gap-2 font-bold text-brand-navy"><HeartPulse className="h-5 w-5 text-brand-red" /> إصاباتي الحالية</h2>
            <ul className="space-y-2">
              {data.injuries.map((i) => (
                <li key={i.id} className="rounded-xl border border-neutral-200 p-3 text-sm">
                  <p className="font-semibold text-brand-navy">{i.diagnosis || `${i.body_region} – ${i.injury_type}`}</p>
                  <p className="text-xs text-neutral-500">{formatDate(i.injury_date)} · <span className="font-semibold">{i.status}</span></p>
                  {i.expected_return_date && <p className="mt-1 text-xs">العودة المتوقعة: <b>{formatDate(i.expected_return_date)}</b></p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* All prescriptions */}
        <section className="rounded-2xl bg-white p-4 shadow-card">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-brand-navy"><Pill className="h-5 w-5 text-brand-gold" /> العلاج والمكملات</h2>
          {data.prescriptions.length === 0 ? <p className="text-sm text-neutral-500">لا يوجد علاج أو مكملات حالياً.</p> : (
            <ul className="space-y-2">
              {data.prescriptions.map((r) => (
                <li key={r.id} className="rounded-xl border border-neutral-200 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2"><p className="font-semibold text-brand-navy">{r.name}</p><Badge color="beige">{KIND_LABEL_AR[r.kind] ?? r.kind}</Badge></div>
                  {r.dose && <p className="text-xs text-neutral-600">الجرعة: {r.dose}</p>}
                  <p className="text-xs text-neutral-600">المواعيد: {r.schedule_times.length ? r.schedule_times.join('، ') : 'مرة خلال اليوم'}
                    {r.days_of_week.length < 7 && ` · ${r.days_of_week.map((x) => WEEKDAYS_AR[x]).join('، ')}`}</p>
                  <p className="text-xs text-neutral-500">من {formatDate(r.start_date)}{r.end_date ? ` إلى ${formatDate(r.end_date)}` : ''}</p>
                  {r.instructions && <p className="mt-1 text-xs text-neutral-700">{r.instructions}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
        <p className="pb-4 text-center text-[11px] text-neutral-400">Dr. Saleh Fathullah · Orthopedic & Sports Medicine</p>
      </main>
      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
      {reportOpen && <ReportIssue onClose={() => setReportOpen(false)} onDone={() => void loadExtras()} />}
      {formKind && <WellnessForm kind={formKind} onClose={() => setFormKind(null)} onDone={() => void loadExtras()} />}
    </div>
  );
}
