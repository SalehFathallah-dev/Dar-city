import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getMyProfile, LOCAL_USER_ID, logEvent } from '../lib/api';
import { getMeta, setMeta } from '../lib/localdb';
import type { Profile } from '../lib/types';
import { capabilities, type Capabilities } from '../lib/permissions';

/** Local session – the app is protected by a password stored (hashed) on this device only. */
export interface LocalSession { user: { id: string; email: string | null } }

interface AuthState {
  session: LocalSession | null;
  profile: Profile | null;
  caps: Capabilities;
  loading: boolean;
  /** true until the first password has been created on this device */
  needsSetup: boolean;
  signIn: (password: string) => Promise<void>;
  createPassword: (password: string) => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const IDLE_LIMIT_MS = 15 * 60 * 1000; // automatic lock after 15 minutes of inactivity
const LOCK_KEY = 'lock';
const UNLOCK_KEY = 'dsf-unlocked-at';
interface LockRecord { salt: string; hash: string; iterations: number }

const toHex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string) => new Uint8Array(h.match(/.{2}/g)!.map((x) => parseInt(x, 16)));
async function derive(password: string, saltHex: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations }, key, 256);
  return toHex(bits);
}
async function makeLock(password: string): Promise<LockRecord> {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const iterations = 150_000;
  return { salt, iterations, hash: await derive(password, salt, iterations) };
}
async function verify(password: string): Promise<boolean> {
  const lock = await getMeta<LockRecord>(LOCK_KEY);
  if (!lock) return false;
  return (await derive(password, lock.salt, lock.iterations)) === lock.hash;
}
export const MIN_PASSWORD = 4;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<LocalSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const lastActivity = useRef(Date.now());

  const loadProfile = useCallback(async () => { setProfile(await getMyProfile()); }, []);

  const open = useCallback(async () => {
    await loadProfile();
    setSession({ user: { id: LOCAL_USER_ID, email: null } });
    lastActivity.current = Date.now();
    try { sessionStorage.setItem(UNLOCK_KEY, String(Date.now())); } catch { /* ignore */ }
  }, [loadProfile]);

  useEffect(() => {
    void (async () => {
      const l = await getMeta<LockRecord>(LOCK_KEY);
      setNeedsSetup(!l);
      // Stay unlocked across in-app reloads (same app session, still within the idle limit).
      let since = 0;
      try { since = Number(sessionStorage.getItem(UNLOCK_KEY) ?? 0); } catch { /* ignore */ }
      if (l && since && Date.now() - since < IDLE_LIMIT_MS) await open();
      setLoading(false);
    })();
  }, [open]);

  const signOut = useCallback(async () => {
    try { sessionStorage.removeItem(UNLOCK_KEY); } catch { /* ignore */ }
    await logEvent('LOCK', 'session');
    setSession(null);
  }, []);

  // Idle lock – protects the records if the phone is left unattended.
  useEffect(() => {
    if (!session) return;
    const bump = () => {
      lastActivity.current = Date.now();
      try { sessionStorage.setItem(UNLOCK_KEY, String(lastActivity.current)); } catch { /* ignore */ }
    };
    const events = ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const timer = setInterval(() => {
      if (Date.now() - lastActivity.current > IDLE_LIMIT_MS) void signOut();
    }, 30_000);
    return () => { events.forEach((e) => window.removeEventListener(e, bump)); clearInterval(timer); };
  }, [session, signOut]);

  const value = useMemo<AuthState>(() => ({
    session, profile, loading, needsSetup,
    caps: capabilities(session && profile?.is_active ? profile.role : null),
    async signIn(password) {
      if (!(await verify(password))) throw new Error('Incorrect password.');
      await open();
      void logEvent('UNLOCK', 'session');
    },
    async createPassword(password) {
      if (password.length < MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters.`);
      await setMeta(LOCK_KEY, await makeLock(password));
      setNeedsSetup(false);
      await open();
    },
    async changePassword(current, next) {
      if (!(await verify(current))) throw new Error('The current password is incorrect.');
      if (next.length < MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters.`);
      await setMeta(LOCK_KEY, await makeLock(next));
      void logEvent('PASSWORD_CHANGE', 'session');
    },
    signOut,
    refreshProfile: loadProfile,
  }), [session, profile, loading, needsSetup, open, signOut, loadProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
