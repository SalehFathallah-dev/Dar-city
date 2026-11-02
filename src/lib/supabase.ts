import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey && !url.includes('your-project-ref'));

/**
 * Session tokens are kept in sessionStorage (cleared when the browser closes)
 * rather than localStorage. No medical data is ever persisted in the browser.
 */
export const supabase: SupabaseClient = createClient(url || 'http://localhost:54321', anonKey || 'missing-anon-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
    storageKey: 'dcb-medical-auth',
  },
});

/** Converts Supabase/PostgREST errors into clear messages for clinicians. */
export function friendlyError(error: unknown): string {
  const e = error as { message?: string; code?: string; details?: string } | null;
  if (!e) return 'Unknown error';
  const msg = e.message || String(error);
  if (e.code === '23505' || /duplicate key/i.test(msg)) {
    if (/jersey/i.test(msg)) return 'This jersey number is already used by another active player in this roster.';
    return 'A record with the same unique value already exists.';
  }
  if (e.code === '42501' || /row-level security|permission denied|not authorized/i.test(msg)) {
    return 'You do not have permission to perform this action.';
  }
  if (e.code === '23514') return msg.replace(/^new row.*violates check constraint/, 'A value is outside the allowed range:');
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Network error – check your internet connection and try again.';
  return msg;
}

/** Throws a readable Error when a Supabase response contains an error. */
export function unwrap<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw new Error(friendlyError(res.error));
  return res.data as T;
}
