import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { listPlayers, listSeasons } from '../lib/api';
import type { Player, Season } from '../lib/types';
import { useAuth } from './AuthContext';

interface RefState { players: Player[]; seasons: Season[]; currentSeason: Season | null; loading: boolean; reload: () => Promise<void> }
const RefContext = createContext<RefState | null>(null);

/** Shared roster + seasons used by pickers and filters across the app. */
export function ReferenceProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [players, setPlayers] = useState<Player[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    if (!profile?.is_active) { setLoading(false); return; }
    try {
      const [p, s] = await Promise.all([listPlayers({ includeArchived: true }), listSeasons()]);
      setPlayers(p); setSeasons(s);
    } finally { setLoading(false); }
  }, [profile?.is_active]);
  useEffect(() => { void reload(); }, [reload]);
  return (
    <RefContext.Provider value={{ players, seasons, currentSeason: seasons.find((s) => s.is_current) ?? null, loading, reload }}>
      {children}
    </RefContext.Provider>
  );
}
export function useReference() {
  const c = useContext(RefContext);
  if (!c) throw new Error('useReference outside provider');
  return c;
}
