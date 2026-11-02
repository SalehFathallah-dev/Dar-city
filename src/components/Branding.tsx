import clsx from 'clsx';
import { Shield } from 'lucide-react';
import { useBrand } from '../context/BrandContext';
import { useClub } from '../context/ClubContext';
import { initials } from '../lib/format';
import { useEffect, useState } from 'react';
import { resolveClubLogo } from '../lib/api';

/** A. Medical brand logo – Dr. Faraj Lashika (never replaced by a club logo). */
export function BrandLogo({ height = 48, className }: { height?: number; className?: string }) {
  const { logoUrl, brand } = useBrand();
  return <img src={logoUrl} alt={`${brand.name} – ${brand.specialty}`} style={{ height }} className={clsx('w-auto max-w-full select-none object-contain', className)} draggable={false} />;
}

/** B. Club logo – the identity of a club (never replaces the medical brand). */
export function ClubLogo({ logo, name, size = 40, className }: { logo?: string | null; name: string; size?: number; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setFailed(false);
    void resolveClubLogo(logo).then((u) => alive && setUrl(u));
    return () => { alive = false; };
  }, [logo]);
  return (
    <span style={{ width: size, height: size }} className={clsx('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-black/5', className)}>
      {url && !failed
        ? <img src={url} alt={`${name} logo`} onError={() => setFailed(true)} className="h-full w-full object-contain p-0.5" draggable={false} />
        : name ? <span className="font-display font-bold text-brand-navy" style={{ fontSize: size * 0.34 }}>{initials(name)}</span> : <Shield className="h-1/2 w-1/2 text-brand-navy" />}
    </span>
  );
}

/** Current club badge (logo + name). */
export function CurrentClubBadge({ size = 36 }: { size?: number }) {
  const { club } = useClub();
  if (!club) return null;
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <ClubLogo logo={club.logo_url} name={club.short_name} size={size} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-semibold text-brand-navy">{club.name}</span>
        <span className="block truncate text-[11px] text-neutral-500">{[club.country, club.current_season && `Season ${club.current_season}`].filter(Boolean).join(' · ')}</span>
      </span>
    </span>
  );
}
