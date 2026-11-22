import { CalendarDays, Snowflake, Trophy, Waves } from 'lucide-react';
import { daysBetween, formatDate, todayISO } from '../../lib/format';
import type { MySchedule } from '../../lib/types';

const TYPE_AR: Record<string, string> = {
  'Morning training': 'تدريب صباحي', 'Evening training': 'تدريب مسائي', Gym: 'جيم', Conditioning: 'لياقة', Recovery: 'استشفاء', Match: 'مباراة', Other: 'أخرى',
};
const KIND_AR: Record<string, string> = {
  'Ice bath': 'حمام ثلج', 'Active recovery': 'استشفاء نشط', 'Compression boots': 'أحذية الضغط', Mobility: 'مرونة وحركة', Stretching: 'إطالات',
  Massage: 'مساج', 'Foam rolling': 'فوم رولر', 'Recovery gym': 'جيم استشفاء', Other: 'أخرى',
};
const CAT_AR: Record<string, string> = {
  'Active recovery': 'استشفاء نشط', 'Cold water immersion': 'حمام ثلج', Mobility: 'مرونة', Sleep: 'النوم', Nutrition: 'التغذية', Hydration: 'السوائل',
  Compression: 'الضغط', Massage: 'مساج', 'Training load': 'حِمل التدريب', Other: 'أخرى',
};

/** The athlete's schedule: today's training, recovery sessions, approved recovery plan and next matches. */
export function MyScheduleSection({ s }: { s: MySchedule }) {
  const today = todayISO();
  const training = s.training.filter((t) => t.session_date === today);
  const recovery = s.recovery.filter((r) => r.session_date >= today).slice(0, 4);
  const plan = s.plan.filter((p) => p.item_date === today);
  const matches = s.matches.filter((m) => m.match_date >= today).slice(0, 3);
  if (!training.length && !recovery.length && !plan.length && !matches.length) return null;
  return (
    <section className="rounded-2xl bg-white p-4 shadow-card">
      <h2 className="mb-3 flex items-center gap-2 font-bold text-brand-navy"><CalendarDays className="h-5 w-5 text-brand-gold" /> جدولي</h2>
      <div className="space-y-3 text-sm">
        {training.length > 0 && (
          <div><p className="mb-1 text-xs font-bold text-neutral-500">تدريبات اليوم</p>
            <ul className="space-y-1">{training.map((t) => <li key={t.id} className="rounded-lg bg-brand-cream px-3 py-2"><b>{TYPE_AR[t.session_type] ?? t.session_type}</b>{t.start_time ? ` · ${t.start_time.slice(0, 5)}` : ''} · {t.duration_minutes} دقيقة{t.notes ? <span className="block text-xs text-neutral-600">{t.notes}</span> : null}</li>)}</ul>
          </div>
        )}
        {recovery.length > 0 && (
          <div><p className="mb-1 text-xs font-bold text-neutral-500">جلسات الاستشفاء</p>
            <ul className="space-y-1">{recovery.map((r) => (
              <li key={r.id} className="rounded-lg bg-sky-50 px-3 py-2">
                <p className="flex items-center gap-1.5 font-semibold">{r.kind === 'Ice bath' ? <Snowflake className="h-4 w-4 text-sky-500" /> : <Waves className="h-4 w-4 text-brand-gold" />}{KIND_AR[r.kind] ?? r.kind}
                  <span className="font-normal text-neutral-600">· {r.session_date === today ? 'اليوم' : formatDate(r.session_date)}{r.start_time ? ` ${r.start_time.slice(0, 5)}` : ''}</span></p>
                <p className="text-xs text-neutral-600">{[r.recommended_minutes && `${r.recommended_minutes} دقيقة`, r.recommended_temp_c != null && `${r.recommended_temp_c}°C`, r.protocol].filter(Boolean).join(' · ')}</p>
                {r.precautions && <p className="mt-1 text-[11px] text-amber-800">تنبيه: إذا عندك أي مشكلة صحية أو شعرت بدوخة أو ألم في الصدر أوقف الجلسة وأبلغ الطاقم الطبي.</p>}
              </li>
            ))}</ul>
          </div>
        )}
        {plan.length > 0 && (
          <div><p className="mb-1 text-xs font-bold text-neutral-500">تعليمات الاستشفاء لليوم (معتمدة من الطبيب)</p>
            <ul className="space-y-1">{plan.map((p, i) => <li key={i} className="rounded-lg bg-emerald-50 px-3 py-2"><b>{CAT_AR[p.category] ?? p.category}:</b> <span dir="auto">{p.recommendation}</span></li>)}</ul>
          </div>
        )}
        {matches.length > 0 && (
          <div><p className="mb-1 text-xs font-bold text-neutral-500">المباريات القادمة</p>
            <ul className="space-y-1">{matches.map((m) => { const d = daysBetween(today, m.match_date); return (
              <li key={m.id} className="flex items-center gap-2 rounded-lg border px-3 py-2"><Trophy className="h-4 w-4 text-brand-gold" /><b dir="auto">{m.opponent}</b>
                <span className="text-xs text-neutral-500">{m.home_away === 'Home' ? 'على أرضنا' : m.home_away === 'Away' ? 'خارج الأرض' : 'ملعب محايد'}</span>
                <span className="ms-auto text-xs font-semibold">{d === 0 ? 'اليوم' : d === 1 ? 'غداً' : `بعد ${d} أيام`}{m.match_time ? ` · ${m.match_time.slice(0, 5)}` : ''}</span></li>
            ); })}</ul>
          </div>
        )}
      </div>
    </section>
  );
}
