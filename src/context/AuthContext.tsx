import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { getMyProfile, logEvent } from '../lib/api';
import type { Profile } from '../lib/types';
import { capabilities, type Capabilities } from '../lib/permissions';

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
const IDLE_LIMIT_MS = 30 * 60 * 1000; // automatic sign-out after 30 minutes of inactivity

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
  useEffect(() => {
    if (!session) return;
    const bump = () => { lastActivity.current = Date.now(); };
    const events = ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const timer = setInterval(() => {
      if (Date.now() - lastActivity.current > IDLE_LIMIT_MS) void signOut();
    }, 60_000);
    return () => { events.forEach((e) => window.removeEventListener(e, bump)); clearInterval(timer); };
  }, [session, signOut]);

  const value = useMemo<AuthState>(() => ({
    session, profile, loading,
    caps: capabilities(profile?.is_active ? profile.role : null),
    async signIn(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Incorrect e-mail or password.' : error.message);
      await loadProfile(data.session);
      void logEvent('LOGIN', 'session');
    },
    signOut,
    refreshProfile: () => loadProfile(session),
    async resetPassword(email) {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
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
