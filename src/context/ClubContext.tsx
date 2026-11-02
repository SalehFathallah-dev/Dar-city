import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { listClubs, resolveClubLogo, setActiveClub } from '../lib/api';
import type { Club } from '../lib/types';
import { setReportClub } from '../lib/reportContext';
import { useAuth } from './AuthContext';

interface ClubState {
  clubs: Club[];
  club: Club | null;
  clubId: string | null;
  logoUrl: string | null;
  loading: boolean;
  error: string | null;
  selectClub: (id: string) => void;
  reload: () => Promise<void>;
}
const ClubContext = createContext<ClubState | null>(null);
const STORAGE_KEY = 'dcb-selected-club'; // only the club id (not sensitive) is remembered on this device

function readStored(): string | null {
  try { return window.localStorage.getItem(STORAGE_KEY); } catch { return null; }
}
function writeStored(id: string) {
  try { window.localStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
}

export function ClubProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [clubId, setClubId] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!profile?.is_active) { setLoading(false); return; }
    try {
      const list = await listClubs();
      setClubs(list);
      setClubId((cur) => {
        const wanted = cur ?? readStored();
        const pick = list.find((c) => c.id === wanted) ?? list.find((c) => c.status === 'active') ?? list[0] ?? null;
        setActiveClub(pick?.id ?? null);
        return pick?.id ?? null;
      });
      setError(null);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [profile?.is_active]);
  useEffect(() => { void reload(); }, [reload]);

  const club = useMemo(() => clubs.find((c) => c.id === clubId) ?? null, [clubs, clubId]);
  useEffect(() => {
    let alive = true;
    setReportClub(club);
    void resolveClubLogo(club?.logo_url).then((u) => alive && setLogoUrl(u));
    return () => { alive = false; };
  }, [club]);

  const selectClub = useCallback((id: string) => {
    setActiveClub(id); // update the query scope synchronously before any page reloads
    writeStored(id);
    setClubId(id);
  }, []);

  return (
    <ClubContext.Provider value={{ clubs, club, clubId, logoUrl, loading, error, selectClub, reload }}>
      {children}
    </ClubContext.Provider>
  );
}
export function useClub() {
  const c = useContext(ClubContext);
  if (!c) throw new Error('useClub outside ClubProvider');
  return c;
}
