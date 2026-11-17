import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { getMyProfile, logEvent } from '../lib/api';
import type { Profile } from '../lib/types';
import { capabilities, type Capabilities } from '../lib/permissions';
import { USERNAME_DOMAIN } from '../lib/constants';

/** "ali7" → "ali7@dsf.local"; a full e-mail is used as is. */
export const toLogin = (v: string) => { const s = v.trim().toLowerCase(); return s.includes('@') ? s : `${s}@${USERNAME_DOMAIN}`; };

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  caps: Capabilities;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const IDLE_LIMIT_MS = 30 * 60 * 1000; // staff: automatic sign-out after 30 minutes of inactivity (athletes stay signed in)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const lastActivity = useRef(Date.now());

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) { setProfile(null); return; }
    try { setProfile(await getMyProfile(s.user.id)); } catch { setProfile(null); }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // Defer to avoid deadlocks inside the auth callback.
      setTimeout(() => void loadProfile(s), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await logEvent('LOGOUT', 'session');
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  // Idle timeout – protects sessions on shared devices at the courtside.
  const isAthlete = profile?.role === 'athlete';
  useEffect(() => {
    if (!session || !profile || isAthlete) return;
    // Staff sessions are remembered on the device, so also enforce the limit across app restarts.
    const KEY = 'dsf-last-activity';
    try {
      const last = Number(localStorage.getItem(KEY) ?? 0);
      if (last && Date.now() - last > IDLE_LIMIT_MS) { void signOut(); return; }
    } catch { /* ignore */ }
    let lastWrite = 0;
    const bump = () => {
      lastActivity.current = Date.now();
      if (lastActivity.current - lastWrite > 15_000) { lastWrite = lastActivity.current; try { localStorage.setItem(KEY, String(lastWrite)); } catch { /* ignore */ } }
    };
    bump();
    const events = ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const timer = setInterval(() => {
      if (Date.now() - lastActivity.current > IDLE_LIMIT_MS) void signOut();
    }, 60_000);
    return () => { events.forEach((e) => window.removeEventListener(e, bump)); clearInterval(timer); };
  }, [session, profile, signOut, isAthlete]);

  const value = useMemo<AuthState>(() => ({
    session, profile, loading,
    caps: capabilities(profile?.is_active ? profile.role : null),
    async signIn(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({ email: toLogin(email), password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Incorrect username or password.' : error.message);
      try { localStorage.setItem('dsf-last-activity', String(Date.now())); } catch { /* ignore */ }
      await loadProfile(data.session);
      void logEvent('LOGIN', 'session');
    },
    signOut,
    refreshProfile: () => loadProfile(session),
    async resetPassword(email) {
      const { error } = await supabase.auth.resetPasswordForEmail(toLogin(email), { redirectTo: `${window.location.origin}/reset-password` });
      if (error) throw new Error(error.message);
    },
  }), [session, profile, loading, loadProfile, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
