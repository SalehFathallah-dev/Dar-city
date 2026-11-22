import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { Bell, CheckCheck, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as api from '../lib/api';
import { formatDateTime } from '../lib/format';
import type { AppNotification } from '../lib/types';
import { Spinner } from './ui';

/** In-app notifications (polled every 60 s and when the app returns to the foreground). */
export function NotificationBell({ lang = 'en', className }: { lang?: 'ar' | 'en'; className?: string }) {
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const ar = lang === 'ar';

  const refresh = useCallback(() => { void api.unreadNotificationCount().then(setCount).catch(() => undefined); }, []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60_000);
    const onVis = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('dsf-notifications-changed', refresh);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('dsf-notifications-changed', refresh); };
  }, [refresh]);

  const openPanel = async () => {
    setOpen(true); setItems(null);
    try { setItems(await api.listNotifications(60)); } catch { setItems([]); }
  };
  const markAll = async () => {
    await api.markNotificationsRead().catch(() => undefined);
    setItems((x) => x?.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })) ?? null);
    setCount(0);
  };
  const go = async (n: AppNotification) => {
    if (!n.read_at) { await api.markNotificationsRead([n.id]).catch(() => undefined); refresh(); }
    setOpen(false);
    if (n.link && n.link !== '/') navigate(n.link);
  };

  return (
    <>
      <button onClick={() => void openPanel()} className={clsx('relative rounded-lg p-2 text-neutral-500 hover:bg-neutral-100', className)} aria-label={ar ? 'الإشعارات' : 'Notifications'}>
        <Bell className="h-5 w-5" />
        {count > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-brand-red px-1 text-center text-[10px] font-bold leading-[18px] text-white">{count > 99 ? '99+' : count}</span>}
      </button>
      {open && (
        <div className="fixed inset-0 z-[95]" dir={ar ? 'rtl' : 'ltr'}>
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className={clsx('absolute inset-y-0 flex w-full max-w-sm flex-col bg-white shadow-2xl', ar ? 'left-0' : 'right-0')}>
            <div className="flex items-center gap-2 border-b px-4 py-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
              <p className="flex-1 font-bold text-brand-navy">{ar ? 'الإشعارات' : 'Notifications'}</p>
              <button onClick={() => void markAll()} className="flex items-center gap-1 text-xs font-semibold text-brand-gold"><CheckCheck className="h-4 w-4" />{ar ? 'تعليم الكل كمقروء' : 'Mark all read'}</button>
              <button onClick={() => setOpen(false)} className="p-1 text-neutral-500" aria-label="close"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {!items ? <Spinner /> : items.length === 0 ? <p className="p-6 text-center text-sm text-neutral-500">{ar ? 'لا توجد إشعارات' : 'No notifications'}</p> : (
                <ul className="divide-y">
                  {items.map((n) => (
                    <li key={n.id}>
                      <button onClick={() => void go(n)} className={clsx('block w-full px-4 py-3 text-start hover:bg-neutral-50', !n.read_at && 'bg-sky-50/60')}>
                        <p className={clsx('text-sm font-semibold', n.priority === 'urgent' ? 'text-brand-red' : 'text-brand-navy')}>{!n.read_at && <span className="me-1.5 inline-block h-2 w-2 rounded-full bg-brand-red" />}{n.title}</p>
                        {n.body && <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-xs text-neutral-600">{n.body}</p>}
                        <p className="mt-1 text-[11px] text-neutral-400">{formatDateTime(n.created_at)}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
