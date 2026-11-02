import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Check, ChevronsUpDown, Layers, Plus, Settings2 } from 'lucide-react';
import { useClub } from '../context/ClubContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ClubLogo } from './Branding';
import { Badge } from './ui';

/** Elegant club selector – switching applies the new club to every query and page. */
export function ClubSwitcher({ variant = 'dark' }: { variant?: 'dark' | 'light' }) {
  const { clubs, club, selectClub } = useClub();
  const { caps } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const choose = (id: string) => {
    setOpen(false);
    if (id === club?.id) return;
    selectClub(id);
    // Detail pages belong to the previous club – return to the equivalent list.
    const parts = location.pathname.split('/').filter(Boolean);
    if (parts.length > 1 && parts[0] !== 'clubs') navigate(`/${parts[0]}`);
    toast.info(`Now viewing ${clubs.find((c) => c.id === id)?.name}`);
  };
  if (!club) return null;
  const dark = variant === 'dark';
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open}
        className={clsx('flex w-full items-center gap-3 rounded-xl p-2 text-left transition',
          dark ? 'bg-white/5 ring-1 ring-white/10 hover:bg-white/10' : 'bg-white ring-1 ring-neutral-200 hover:ring-brand-gold')}>
        <ClubLogo logo={club.logo_url} name={club.short_name} size={dark ? 42 : 34} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className={clsx('block text-[10px] font-bold uppercase tracking-[0.16em]', dark ? 'text-brand-goldLight' : 'text-brand-gold')}>Current club</span>
          <span className={clsx('block truncate text-sm font-semibold', dark ? 'text-white' : 'text-brand-navy')}>{club.name}</span>
          {club.country && <span className={clsx('block truncate text-[11px]', dark ? 'text-neutral-400' : 'text-neutral-500')}>{club.country}</span>}
        </span>
        <ChevronsUpDown className={clsx('h-4 w-4 shrink-0', dark ? 'text-neutral-400' : 'text-neutral-500')} />
      </button>
      {open && (
        <div className={clsx('absolute z-[95] mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl', dark ? 'left-0' : 'right-0')} role="listbox">
          <p className="border-b border-neutral-100 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-500">Switch club</p>
          <div className="max-h-80 overflow-y-auto py-1">
            {clubs.map((c) => (
              <button key={c.id} role="option" aria-selected={c.id === club.id} onClick={() => choose(c.id)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-brand-cream">
                <ClubLogo logo={c.logo_url} name={c.short_name} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-brand-navy">{c.name}</span>
                  <span className="block truncate text-xs text-neutral-500">{[c.country, c.city].filter(Boolean).join(' · ')} {c.status === 'inactive' && <Badge color="gray">Inactive</Badge>}</span>
                </span>
                {c.id === club.id && <Check className="h-4 w-4 text-brand-gold" />}
              </button>
            ))}
          </div>
          <div className="border-t border-neutral-100 py-1">
            {caps.viewOverview && <button onClick={() => { setOpen(false); navigate('/overview'); }} className="flex w-full items-center gap-3 px-4 py-2 text-sm hover:bg-brand-cream"><Layers className="h-4 w-4 text-brand-gold" />All clubs overview</button>}
            <button onClick={() => { setOpen(false); navigate('/clubs'); }} className="flex w-full items-center gap-3 px-4 py-2 text-sm hover:bg-brand-cream"><Settings2 className="h-4 w-4 text-brand-gold" />Club management</button>
            {caps.manageClubs && <button onClick={() => { setOpen(false); navigate('/clubs/new'); }} className="flex w-full items-center gap-3 px-4 py-2 text-sm hover:bg-brand-cream"><Plus className="h-4 w-4 text-brand-gold" />Add a new club</button>}
          </div>
        </div>
      )}
    </div>
  );
}
