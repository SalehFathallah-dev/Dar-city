/**
 * Dose reminders on the athlete's phone (Android local notifications).
 * Each prescription time becomes a weekly repeating notification on the
 * prescribed weekdays. Re-synchronised every time the portal loads.
 */
import { LocalNotifications } from '@capacitor/local-notifications';
import { isNative } from './native';
import { KIND_LABEL_AR } from './constants';
import type { AthletePortal } from './types';
import { todayISO } from './format';

const PREF_KEY = 'dsf-reminders';
export const remindersWanted = () => { try { return localStorage.getItem(PREF_KEY) !== 'off'; } catch { return true; } };
export const setRemindersWanted = (on: boolean) => { try { localStorage.setItem(PREF_KEY, on ? 'on' : 'off'); } catch { /* ignore */ } };

/** Stable 31-bit id from a string. */
function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 2_000_000_000;
}

export async function syncReminders(portal: AthletePortal): Promise<'scheduled' | 'off' | 'denied' | 'unsupported'> {
  if (!isNative()) return 'unsupported';
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  if (!remindersWanted()) return 'off';
  let perm = await LocalNotifications.checkPermissions();
  if (perm.display !== 'granted') perm = await LocalNotifications.requestPermissions();
  if (perm.display !== 'granted') return 'denied';

  const today = todayISO();
  const notifications = [];
  for (const rx of portal.prescriptions) {
    if (rx.end_date && rx.end_date < today) continue;
    for (const time of rx.schedule_times) {
      const [hour, minute] = time.split(':').map(Number);
      for (const dow of rx.days_of_week) {
        notifications.push({
          id: hashId(`${rx.id}|${time}|${dow}`),
          title: `⏰ ${KIND_LABEL_AR[rx.kind] ?? rx.kind}: ${rx.name}`,
          body: `${rx.dose ? rx.dose + ' – ' : ''}الموعد ${time}. افتح التطبيق واضغط «أخذته ✓».`,
          schedule: { on: { weekday: dow + 1, hour, minute }, allowWhileIdle: true },
          extra: { prescriptionId: rx.id, time },
        });
      }
    }
  }
  if (notifications.length) await LocalNotifications.schedule({ notifications: notifications.slice(0, 400) });
  return 'scheduled';
}

export async function cancelAllReminders() {
  if (!isNative()) return;
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
}
