import clsx from 'clsx';
import { Activity, CalendarClock, CheckCircle2, Flag } from 'lucide-react';
import * as api from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { formatDate } from '../lib/format';
import type { RecoveryEpisode } from '../lib/types';
import { Badge, ErrorBlock, Spinner, statusColor } from './ui';

/** Simplified recovery progress for coaches / managers: stage, progress and dates only. */
const STAGES = ['Injured', 'Treatment', 'Rehabilitation', 'Return to training', 'Return to competition'] as const;
function stageOf(e: RecoveryEpisode): number {
  if (['Recovered', 'Closed'].includes(e.status)) return 4;
  if (e.rtp.some((r) => r.decision === 'Cleared for Competition')) return 4;
  if (e.status === 'Modified Training' || e.status === 'Return-to-Play Assessment' || e.rtp.some((r) => r.decision.startsWith('Cleared for'))) return 3;
  if (e.rehab || e.status === 'Under Rehabilitation') return 2;
  if (e.status === 'Under Treatment' || e.status === 'Under Investigation') return 1;
  return 0;
}

export function RecoveryPanel({ playerId }: { playerId: string }) {
  const data = useAsync(() => api.getPlayerRecovery(playerId), [playerId]);
  if (data.loading) return <Spinner />;
  if (data.error) return <ErrorBlock message={data.error} />;
  const episodes = data.data?.episodes ?? [];
  if (!episodes.length) return <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> No current injuries – no recovery in progress.</p>;
  return (
    <div className="space-y-4">
      {episodes.map((e) => {
        const stage = stageOf(e);
        const pct = e.rehab?.phase_number && stage === 2 ? Math.round(40 + (e.rehab.phase_number / e.rehab.phase_total) * 35) : [10, 25, 40, 80, 100][stage];
        const done = stage === 4;
        return (
          <div key={e.injury_id} className="rounded-xl border border-neutral-200 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-brand-navy">{e.body_region}{e.body_side && e.body_side !== 'Not Applicable' ? ` (${e.body_side})` : ''}</p>
              <Badge color={statusColor(e.status)}>{e.status}</Badge>
              <span className="text-xs text-neutral-500">since {formatDate(e.injury_date)} · {e.days_out} day{e.days_out === 1 ? '' : 's'}{done ? '' : ' so far'}</span>
            </div>
            <div className="mt-3">
              <div className="h-2.5 overflow-hidden rounded-full bg-neutral-100"><div className={clsx('h-full rounded-full', done ? 'bg-emerald-500' : 'bg-brand-gold')} style={{ width: `${pct}%` }} /></div>
              <div className="mt-1.5 grid grid-cols-5 gap-1 text-center text-[10px] leading-tight">
                {STAGES.map((s, i) => <span key={s} className={clsx(i <= stage ? 'font-bold text-brand-navy' : 'text-neutral-400')}>{s}</span>)}
              </div>
            </div>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              {e.rehab && (
                <p className="flex items-start gap-2"><Activity className="mt-0.5 h-4 w-4 text-brand-gold" />
                  <span>Rehab phase <b>{e.rehab.phase_number ?? '–'}/{e.rehab.phase_total}</b>: {e.rehab.current_phase}
                    <span className="block text-xs text-neutral-500">{e.rehab.sessions} session{e.rehab.sessions === 1 ? '' : 's'}{e.rehab.last_session_date ? ` · last ${formatDate(e.rehab.last_session_date)}` : ''}</span></span></p>
              )}
              <p className="flex items-start gap-2"><CalendarClock className="mt-0.5 h-4 w-4 text-brand-gold" />
                <span>{e.return_to_play_date ? <>Returned to play <b>{formatDate(e.return_to_play_date)}</b></> : e.expected_return_date ? <>Expected return <b>{formatDate(e.expected_return_date)}</b></> : 'Return date not set yet'}</span></p>
            </div>
            {(e.rehab?.phase_history.length || e.rtp.length) ? (
              <ol className="mt-3 space-y-1 border-s-2 border-neutral-200 ps-3 text-xs text-neutral-600">
                {[...(e.rehab?.phase_history ?? []).map((h) => ({ d: h.from, t: `Rehab: ${h.phase}` })), ...e.rtp.map((r) => ({ d: r.decision_date, t: `Return-to-play decision: ${r.decision}` }))]
                  .sort((a, b) => a.d.localeCompare(b.d))
                  .map((x, i) => <li key={i} className="flex gap-2"><Flag className="h-3.5 w-3.5 shrink-0 text-neutral-400" /><span className="font-semibold">{formatDate(x.d)}</span> {x.t}</li>)}
              </ol>
            ) : null}
          </div>
        );
      })}
      <p className="text-[11px] text-neutral-400">Diagnoses and clinical details are visible only to the medical team.</p>
    </div>
  );
}
