import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  Activity, BarChart3, CalendarCheck2, ClipboardList, Download, FileStack, FileText, HeartPulse, LayoutDashboard,
  LogOut, Menu, Plus, Search, Settings, ShieldCheck, Stethoscope, UserPlus, Users, X, Zap, History, BadgeCheck, WifiOff, Footprints, Layers, Shield, KeyRound,
} from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useAuth } from '../../context/AuthContext';
import { useReference } from '../../context/ReferenceContext';
import { ROLE_LABELS } from '../../lib/constants';
import { Button, Logo, PlayerAvatar } from '../ui';
import { BrandLogo, CurrentClubBadge } from '../Branding';
import { ClubSwitcher } from '../ClubSwitcher';
import { useBrand } from '../../context/BrandContext';
import { ChangePasswordModal } from '../ChangePasswordModal';
import { useOnline } from '../../hooks/useOnline';
import type { Capabilities } from '../../lib/permissions';

interface NavItem { to: string; label: string; icon: ReactNode; show: (c: Capabilities) => boolean }
const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Clubs', items: [
    { to: '/overview', label: 'All Clubs Overview', icon: <Layers className="h-[18px] w-[18px]" />, show: (c) => c.viewOverview },
    { to: '/clubs', label: 'Club Management', icon: <Shield className="h-[18px] w-[18px]" />, show: () => true },
  ] },
  { group: 'Club Dashboard', items: [
    { to: '/', label: 'Dashboard', icon: <LayoutDashboard className="h-[18px] w-[18px]" />, show: () => true },
    { to: '/availability', label: 'Player Availability', icon: <CalendarCheck2 className="h-[18px] w-[18px]" />, show: () => true },
    { to: '/players', label: 'Players', icon: <Users className="h-[18px] w-[18px]" />, show: () => true },
  ] },
  { group: 'Clinical', items: [
    { to: '/examinations', label: 'Medical Examinations', icon: <Stethoscope className="h-[18px] w-[18px]" />, show: (c) => c.viewMedical },
    { to: '/injuries', label: 'Injury Management', icon: <HeartPulse className="h-[18px] w-[18px]" />, show: (c) => c.viewMedical },
    { to: '/rehabilitation', label: 'Rehabilitation', icon: <Footprints className="h-[18px] w-[18px]" />, show: (c) => c.viewMedical },
    { to: '/return-to-play', label: 'Return to Play', icon: <Activity className="h-[18px] w-[18px]" />, show: (c) => c.viewMedical },
    { to: '/clearances', label: 'Medical Clearance', icon: <BadgeCheck className="h-[18px] w-[18px]" />, show: (c) => c.viewMedical },
    { to: '/documents', label: 'Documents', icon: <FileStack className="h-[18px] w-[18px]" />, show: (c) => c.viewMedical },
  ] },
  { group: 'Insights', items: [
    { to: '/analytics', label: 'Medical Analytics', icon: <BarChart3 className="h-[18px] w-[18px]" />, show: (c) => c.viewAnalytics },
    { to: '/reports', label: 'Medical Reports', icon: <FileText className="h-[18px] w-[18px]" />, show: () => true },
    { to: '/exports', label: 'Export Center', icon: <Download className="h-[18px] w-[18px]" />, show: () => true },
  ] },
  { group: 'Administration', items: [
    { to: '/admin', label: 'Settings', icon: <Settings className="h-[18px] w-[18px]" />, show: (c) => c.manageUsers || c.manageSeasons },
    { to: '/audit', label: 'Audit Log', icon: <History className="h-[18px] w-[18px]" />, show: (c) => c.viewAudit },
  ] },
];

export function AppLayout() {
  const { profile, caps, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const location = useLocation();
  const online = useOnline();
  useEffect(() => setMobileOpen(false), [location.pathname]);

  const sidebar = (
    <div className="flex h-full flex-col bg-brand-navy text-neutral-300">
      <div className="space-y-3 border-b border-white/10 px-4 pb-4 pt-4">
        <div className="rounded-2xl bg-brand-cream px-3 py-2.5 shadow-inner">
          <BrandLogo height={58} className="mx-auto" />
        </div>
        <ClubSwitcher />
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
        {NAV.map((g) => {
          const items = g.items.filter((i) => i.show(caps));
          if (!items.length) return null;
          return (
            <div key={g.group}>
              <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">{g.group}</p>
              {items.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.to === '/'}
                  className={({ isActive }) => clsx('group mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
                    isActive ? 'bg-brand-gold text-white shadow-md shadow-black/20' : 'hover:bg-white/5 hover:text-white')}>
                  {i.icon}{i.label}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-white/5 p-4">
        <div className="flex items-center gap-3">
          <PlayerAvatar name={profile?.full_name ?? '?'} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{profile?.full_name}</p>
            <p className="truncate text-xs text-brand-goldLight">{profile?.role ? ROLE_LABELS[profile.role] : ''}</p>
          </div>
          <button onClick={() => setPwOpen(true)} className="rounded-lg p-2 text-neutral-400 hover:bg-white/5 hover:text-white" aria-label="Change password" title="Change password"><KeyRound className="h-4 w-4" /></button>
          <button onClick={() => void signOut()} className="rounded-lg p-2 text-neutral-400 hover:bg-white/5 hover:text-white" aria-label="Sign out" title="Sign out"><LogOut className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F6F5F0]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">{sidebar}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 animate-fade-in">{sidebar}</div>
          <button className="absolute right-4 top-4 rounded-full bg-white p-2" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
        </div>
      )}
      <div className="lg:pl-64">
        <TopBar onMenu={() => setMobileOpen(true)} />
        {!online && (
          <div className="flex items-center gap-2 bg-brand-red px-4 py-2 text-sm font-medium text-white">
            <WifiOff className="h-4 w-4" /> You are offline. Medical records are not stored on this device – changes cannot be saved until the connection returns.
          </div>
        )}
        <UpdatePrompt />
        <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12">
          <Outlet />
        </main>
      </div>
      <MobileNav />
      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { caps, profile } = useAuth();
  const { brand } = useBrand();
  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200/70 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button onClick={onMenu} className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 lg:hidden" aria-label="Open menu"><Menu className="h-5 w-5" /></button>
        <div className="flex shrink-0 items-center lg:hidden"><Logo mark size={36} /></div>
        <div className="hidden shrink-0 items-center gap-2 xl:flex">
          <Logo mark size={36} />
          <div className="flex flex-col leading-tight">
            <span className="font-display text-base font-bold uppercase tracking-wide text-brand-navy">{brand.name}</span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-gold">{brand.specialty}</span>
          </div>
        </div>
        <div className="hidden h-8 w-px bg-neutral-200 xl:block" />
        <div className="hidden min-w-0 md:block"><CurrentClubBadge size={34} /></div>
        <div className="min-w-0 flex-1 md:hidden"><div className="max-w-[12rem]"><ClubSwitcher variant="light" /></div></div>
        <div className="hidden flex-1 md:block" />
        <GlobalSearch />
        {caps.editMedical || caps.managePlayers ? <QuickActions /> : null}
        <div className="hidden items-center gap-2 border-l border-neutral-200 pl-3 2xl:flex">
          <PlayerAvatar name={profile?.full_name ?? '?'} size={32} />
          <div className="leading-tight">
            <p className="max-w-[9rem] truncate text-xs font-semibold text-brand-navy">{profile?.full_name}</p>
            <p className="text-[10px] text-neutral-500">{profile?.role ? ROLE_LABELS[profile.role] : ''}</p>
          </div>
        </div>
      </div>
    </header>
  );
}

function GlobalSearch() {
  const { players } = useReference();
  const { caps } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 1) return [];
    return players.filter((p) => p.full_name.toLowerCase().includes(s) || p.player_code.toLowerCase().includes(s) || String(p.jersey_number ?? '') === s.replace('#', '')).slice(0, 8);
  }, [q, players]);
  const pages = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return NAV.flatMap((g) => g.items).filter((i) => i.show(caps) && i.label.toLowerCase().includes(s)).slice(0, 4);
  }, [q, caps]);
  const go = (to: string) => { setQ(''); setOpen(false); navigate(to); };
  return (
    <div ref={ref} className="relative hidden w-full max-w-[14rem] sm:block sm:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
      <input value={q} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) go(`/players/${results[0].id}`); if (e.key === 'Escape') setOpen(false); }}
        placeholder="Search players, #jersey, ID…" aria-label="Global search"
        className="h-10 w-full rounded-full border border-neutral-200 bg-neutral-50 pl-9 pr-3 text-sm focus:border-brand-gold focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-gold/20" />
      {open && (results.length > 0 || pages.length > 0) && (
        <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl">
          {results.map((p) => (
            <button key={p.id} onClick={() => go(`/players/${p.id}`)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-brand-cream">
              <PlayerAvatar name={p.full_name} photoPath={p.photo_path} size={32} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{p.full_name}</p>
                <p className="text-xs text-neutral-500">#{p.jersey_number ?? '–'} · {p.position} · {p.player_code}{p.status !== 'active' ? ` · ${p.status}` : ''}</p>
              </div>
            </button>
          ))}
          {pages.map((i) => (
            <button key={i.to} onClick={() => go(i.to)} className="flex w-full items-center gap-3 border-t border-neutral-100 px-4 py-2.5 text-left text-sm hover:bg-brand-cream">
              <span className="text-brand-gold">{i.icon}</span> Go to {i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function QuickActions() {
  const { caps } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const actions = [
    { label: 'Quick Record Injury', to: '/injuries/new', icon: <HeartPulse className="h-4 w-4" />, show: caps.editMedical },
    { label: 'Quick Follow-up', to: '/injuries?quick=followup', icon: <ClipboardList className="h-4 w-4" />, show: caps.addFollowups },
    { label: 'Quick Medical Examination', to: '/examinations/new', icon: <Stethoscope className="h-4 w-4" />, show: caps.editMedical },
    { label: 'Quick Availability Update', to: '/availability?update=1', icon: <CalendarCheck2 className="h-4 w-4" />, show: caps.updateAvailability },
    { label: 'Quick Add Player', to: '/players/new', icon: <UserPlus className="h-4 w-4" />, show: caps.managePlayers },
  ].filter((a) => a.show);
  return (
    <div ref={ref} className="relative">
      <Button onClick={() => setOpen(!open)} icon={<Zap className="h-4 w-4" />} className="!px-3 sm:!px-4"><span className="hidden sm:inline">Quick Actions</span></Button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 shadow-xl">
          {actions.map((a) => (
            <button key={a.to} onClick={() => { setOpen(false); navigate(a.to); }} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium hover:bg-brand-cream">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gold/10 text-brand-gold">{a.icon}</span>{a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MobileNav() {
  const { caps } = useAuth();
  const items = [
    { to: '/', label: 'Home', icon: <LayoutDashboard className="h-5 w-5" /> },
    { to: '/availability', label: 'Availability', icon: <CalendarCheck2 className="h-5 w-5" /> },
    ...(caps.editMedical ? [{ to: '/injuries/new', label: 'Injury', icon: <Plus className="h-6 w-6" />, primary: true }] : []),
    caps.viewMedical ? { to: '/injuries', label: 'Injuries', icon: <HeartPulse className="h-5 w-5" /> } : { to: '/reports', label: 'Reports', icon: <FileText className="h-5 w-5" /> },
    { to: '/players', label: 'Players', icon: <Users className="h-5 w-5" /> },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <div className="flex items-end justify-around px-2">
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end
            className={({ isActive }) => clsx('flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold uppercase tracking-wide',
              'primary' in i && i.primary ? 'text-white' : isActive ? 'text-brand-gold' : 'text-neutral-500')}>
            {'primary' in i && i.primary
              ? <span className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-brand-gold shadow-lg shadow-brand-gold/30 ring-4 ring-white">{i.icon}</span>
              : i.icon}
            <span className={clsx('primary' in i && i.primary && 'text-brand-gold')}>{i.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function UpdatePrompt() {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 bg-brand-navy px-4 py-2 text-sm text-white">
      <ShieldCheck className="h-4 w-4 text-brand-gold" /> A new version of the application is available.
      <Button size="sm" onClick={() => void updateServiceWorker(true)}>Update now</Button>
      <button className="text-neutral-400 hover:text-white" onClick={() => setNeedRefresh(false)}>Later</button>
    </div>
  );
}
