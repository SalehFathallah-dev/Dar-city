import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import clsx from 'clsx';
import { AlertTriangle, ChevronDown, Inbox, Loader2, Search, X } from 'lucide-react';
import { getPhotoUrl } from '../../lib/api';
import { initials } from '../../lib/format';

// ---------------------------------------------------------------- Button
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark';
export function Button({ variant = 'primary', size = 'md', loading, icon, children, className, disabled, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: ReactNode }) {
  const v: Record<Variant, string> = {
    primary: 'bg-brand-gold text-white hover:bg-brand-goldDark shadow-sm',
    secondary: 'bg-white text-brand-navy border border-neutral-300 hover:border-brand-gold hover:text-brand-gold',
    ghost: 'text-neutral-600 hover:bg-neutral-100',
    danger: 'bg-brand-red text-white hover:bg-red-700',
    dark: 'bg-brand-navy text-white hover:bg-brand-ink',
  };
  const s = { sm: 'h-8 px-3 text-xs', md: 'h-10 px-4 text-sm', lg: 'h-12 px-5 text-base' }[size];
  return (
    <button type="button" {...rest} disabled={disabled || loading}
      className={clsx('inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold/50 disabled:cursor-not-allowed disabled:opacity-50', v[variant], s, className)}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- Layout bits
export function Card({ children, className, title, actions, padded = true }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode; padded?: boolean }) {
  return (
    <section className={clsx('rounded-2xl border border-neutral-200/80 bg-white shadow-card animate-fade-in', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-5 py-3.5">
          <h3 className="text-sm font-bold uppercase tracking-wide text-brand-navy">{title}</h3>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </header>
      )}
      <div className={clsx(padded && 'p-5')}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, icon }: { title: string; subtitle?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-center gap-3">
        {icon && <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gold/10 text-brand-gold">{icon}</div>}
        <div>
          <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-brand-ink">{title}</h1>
          {subtitle && <p className="text-sm text-neutral-500">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function FormSection({ title, description, children, defaultOpen = true, icon }: { title: string; description?: string; children: ReactNode; defaultOpen?: boolean; icon?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white shadow-card">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
        <div className="flex items-center gap-3">
          {icon && <span className="text-brand-gold">{icon}</span>}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-brand-navy">{title}</h3>
            {description && <p className="text-xs text-neutral-500">{description}</p>}
          </div>
        </div>
        <ChevronDown className={clsx('h-5 w-5 text-neutral-400 transition', open && 'rotate-180')} />
      </button>
      {open && <div className="border-t border-neutral-100 p-5">{children}</div>}
    </section>
  );
}

export function Grid({ children, cols = 2, className }: { children: ReactNode; cols?: 1 | 2 | 3 | 4; className?: string }) {
  const c = { 1: 'grid-cols-1', 2: 'grid-cols-1 sm:grid-cols-2', 3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3', 4: 'grid-cols-2 lg:grid-cols-4' }[cols];
  return <div className={clsx('grid gap-4', c, className)}>{children}</div>;
}

// ---------------------------------------------------------------- Form fields
export function Field({ label, error, hint, required, children, className }: { label: string; error?: string; hint?: string; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-600">
        {label}{required && <span className="text-brand-red"> *</span>}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs text-brand-red">{error}</span> : hint ? <span className="mt-1 block text-xs text-neutral-400">{hint}</span> : null}
    </label>
  );
}

const inputCls = (err?: boolean) => clsx(
  'w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 transition focus:outline-none focus:ring-2',
  err ? 'border-brand-red focus:ring-brand-red/30' : 'border-neutral-300 focus:border-brand-gold focus:ring-brand-gold/25',
);

export function Input({ error, ...rest }: InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) {
  return <input {...rest} className={clsx(inputCls(error), rest.className)} />;
}

export function Select({ options, placeholder, error, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { options: readonly (string | { value: string; label: string })[]; placeholder?: string; error?: boolean }) {
  return (
    <select {...rest} className={clsx(inputCls(error), 'appearance-auto', rest.className)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => typeof o === 'string'
        ? <option key={o} value={o}>{o}</option>
        : <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Textarea({ error, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }) {
  return <textarea rows={3} {...rest} className={clsx(inputCls(error), 'resize-y', rest.className)} />;
}

export function Checkbox({ label, checked, onChange, description }: { label: string; checked: boolean; onChange: (v: boolean) => void; description?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-200 p-3 hover:border-brand-gold/50">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-gold" />
      <span>
        <span className="block text-sm font-medium text-neutral-800">{label}</span>
        {description && <span className="block text-xs text-neutral-500">{description}</span>}
      </span>
    </label>
  );
}

export function SegmentedControl<T extends string>({ value, options, onChange }: { value: T | null | ''; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button type="button" key={o} onClick={() => onChange(o)}
          className={clsx('rounded-lg border px-3 py-2 text-sm font-medium transition',
            value === o ? 'border-brand-gold bg-brand-gold text-white' : 'border-neutral-300 bg-white text-neutral-700 hover:border-brand-gold')}>
          {o}
        </button>
      ))}
    </div>
  );
}

export function PainScale({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: 11 }, (_, n) => (
        <button type="button" key={n} onClick={() => onChange(n)} aria-label={`Pain ${n}`}
          className={clsx('h-9 w-9 rounded-lg border text-sm font-bold transition',
            value === n ? 'border-transparent text-white' : 'border-neutral-300 bg-white text-neutral-700 hover:border-brand-gold')}
          style={value === n ? { background: n <= 3 ? '#16a34a' : n <= 6 ? '#9A7634' : '#C0283A' } : undefined}>
          {n}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={clsx(inputCls(), 'pl-9')} />
    </div>
  );
}

// ---------------------------------------------------------------- Feedback
export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return <div className="flex items-center justify-center gap-2 py-12 text-sm text-neutral-500"><Loader2 className="h-5 w-5 animate-spin text-brand-gold" />{label}</div>;
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-brand-red/30 bg-red-50 p-6 text-center">
      <AlertTriangle className="h-6 w-6 text-brand-red" />
      <p className="text-sm text-brand-red">{message}</p>
      {onRetry && <Button size="sm" variant="secondary" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-brand-cream text-brand-navy">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <p className="font-semibold text-neutral-800">{title}</p>
      {description && <p className="max-w-md text-sm text-neutral-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Badges
const BADGE_COLORS: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  orange: 'bg-orange-50 text-brand-gold ring-brand-gold/25',
  red: 'bg-red-50 text-brand-red ring-brand-red/20',
  gray: 'bg-neutral-100 text-neutral-600 ring-neutral-500/20',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  beige: 'bg-brand-cream text-brand-navy ring-brand-sand',
  purple: 'bg-violet-50 text-violet-700 ring-violet-600/20',
};
export function Badge({ children, color = 'gray', className }: { children: ReactNode; color?: keyof typeof BADGE_COLORS; className?: string }) {
  return <span className={clsx('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', BADGE_COLORS[color], className)}>{children}</span>;
}

export function statusColor(status: string | null | undefined): keyof typeof BADGE_COLORS {
  if (!status) return 'gray';
  const s = status.toLowerCase();
  if (/(fully available|cleared for full|cleared for competition|^fit$|recovered|^active$|completed|normal)/.test(s)) return 'green';
  if (/(not available|not cleared|temporarily not|severe|injured|worsening|discontinued)/.test(s)) return 'red';
  if (/(modified|restriction|individual|moderate|rehabilitation|under treatment|return-to-play|mild)/.test(s)) return 'orange';
  if (/(review|pending|awaiting|investigation|newly|further evaluation|determined)/.test(s)) return 'blue';
  if (/(closed|archived|inactive)/.test(s)) return 'gray';
  return 'beige';
}
export function StatusBadge({ status }: { status: string | null | undefined }) {
  return <Badge color={statusColor(status)}>{status || '—'}</Badge>;
}

export function DemoBadge({ show }: { show?: boolean }) {
  return show ? <Badge color="purple">DEMO</Badge> : null;
}

// ---------------------------------------------------------------- Modal & confirm
export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; size?: 'md' | 'lg' | 'xl' | 'full' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  const w = { md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl', full: 'sm:max-w-6xl' }[size];
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className={clsx('animate-fade-in flex max-h-[94vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl', w)}>
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <h2 className="font-display text-xl font-bold uppercase tracking-wide text-brand-ink">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger, loading, onConfirm, onCancel }:
  { open: boolean; title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal open={open} onClose={onCancel} title={title}
      footer={<><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button></>}>
      <div className="text-sm text-neutral-700">{message}</div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Tabs
export function Tabs<T extends string>({ tabs, active, onChange }: { tabs: { id: T; label: string; count?: number }[]; active: T; onChange: (t: T) => void }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-1 border-b border-neutral-200">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => onChange(t.id)}
            className={clsx('relative whitespace-nowrap px-3.5 py-2.5 text-sm font-semibold transition',
              active === t.id ? 'text-brand-gold' : 'text-neutral-500 hover:text-neutral-800')}>
            {t.label}{t.count !== undefined && <span className="ml-1.5 rounded-full bg-neutral-100 px-1.5 text-xs text-neutral-600">{t.count}</span>}
            {active === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-brand-gold" />}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Data display
export function StatCard({ label, value, icon, tone = 'dark', hint, onClick }: { label: string; value: ReactNode; icon: ReactNode; tone?: 'dark' | 'orange' | 'red' | 'green' | 'beige' | 'blue'; hint?: string; onClick?: () => void }) {
  const tones = {
    dark: 'bg-brand-navy text-white', orange: 'bg-brand-gold/10 text-brand-gold', red: 'bg-brand-red/10 text-brand-red',
    green: 'bg-emerald-50 text-emerald-600', beige: 'bg-brand-cream text-brand-navy', blue: 'bg-sky-50 text-sky-600',
  };
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp onClick={onClick} className={clsx('flex w-full items-center gap-4 rounded-2xl border border-neutral-200/80 bg-white p-4 text-left shadow-card transition animate-fade-in', onClick && 'hover:-translate-y-0.5 hover:border-brand-gold/40')}>
      <div className={clsx('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', tones[tone])}>{icon}</div>
      <div className="min-w-0">
        <div className="font-display text-3xl font-bold leading-none text-brand-ink">{value}</div>
        <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</div>
        {hint && <div className="text-[11px] text-neutral-400">{hint}</div>}
      </div>
    </Comp>
  );
}

export function DetailGrid({ items, cols = 3 }: { items: { label: string; value: ReactNode; wide?: boolean }[]; cols?: 2 | 3 | 4 }) {
  const c = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[cols];
  return (
    <dl className={clsx('grid grid-cols-1 gap-x-6 gap-y-4', c)}>
      {items.map((it) => (
        <div key={it.label} className={clsx(it.wide && 'sm:col-span-full')}>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{it.label}</dt>
          <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm text-neutral-900">{it.value === null || it.value === undefined || it.value === '' ? '—' : it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Table({ headers, children, empty }: { headers: ReactNode[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-y border-neutral-100 bg-neutral-50/70 text-[11px] uppercase tracking-wide text-neutral-500">
            {headers.map((h, i) => <th key={i} className="whitespace-nowrap px-5 py-2.5 font-semibold">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">{children}</tbody>
      </table>
      {empty && <EmptyState title="No records found" description="Try adjusting the filters." />}
    </div>
  );
}
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={clsx('px-5 py-3 align-top', className)}>{children}</td>;

export function PlayerAvatar({ name, photoPath, size = 40, className }: { name: string; photoPath?: string | null; size?: number; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (photoPath) void getPhotoUrl(photoPath).then((u) => alive && setUrl(u));
    else setUrl(null);
    return () => { alive = false; };
  }, [photoPath]);
  return url ? (
    <img src={url} alt={name} style={{ width: size, height: size }} className={clsx('shrink-0 rounded-full object-cover ring-2 ring-brand-sand', className)} />
  ) : (
    <div style={{ width: size, height: size, fontSize: size * 0.36 }} className={clsx('flex shrink-0 items-center justify-center rounded-full bg-brand-navy font-display font-bold text-brand-sand ring-2 ring-brand-sand', className)}>
      {initials(name)}
    </div>
  );
}

/** Official medical brand logo (static default – used before sign-in). */
export function Logo({ size = 40, className, mark }: { size?: number; className?: string; mark?: boolean }) {
  return <img src={mark ? '/brand/medical-mark.png' : '/brand/medical-logo.png'} alt="Dr. Faraj Lashika – Orthopedic & Sports Medicine" style={{ height: size }} className={clsx('w-auto max-w-full select-none object-contain', className)} draggable={false} />;
}
