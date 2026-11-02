import type { ReactNode } from 'react';
import clsx from 'clsx';
import { formatDate } from '../lib/format';

export interface TimelineItem { id: string; date: string; title: string; description?: ReactNode; tone?: 'orange' | 'red' | 'green' | 'dark' | 'beige' | 'blue'; icon?: ReactNode; meta?: ReactNode }

export function Timeline({ items }: { items: TimelineItem[] }) {
  const tones = { orange: 'bg-brand-orange', red: 'bg-brand-red', green: 'bg-emerald-500', dark: 'bg-brand-charcoal', beige: 'bg-brand-beige', blue: 'bg-sky-500' };
  return (
    <ol className="relative ml-3 border-l-2 border-neutral-200">
      {items.map((it) => (
        <li key={it.id} className="mb-6 ml-6 animate-fade-in">
          <span className={clsx('absolute -left-[13px] flex h-6 w-6 items-center justify-center rounded-full text-white ring-4 ring-white', tones[it.tone ?? 'dark'])}>
            {it.icon}
          </span>
          <div className="flex flex-wrap items-baseline gap-x-3">
            <time className="text-xs font-bold uppercase tracking-wide text-neutral-500">{formatDate(it.date)}</time>
            <h4 className="text-sm font-semibold text-neutral-900">{it.title}</h4>
            {it.meta}
          </div>
          {it.description && <div className="mt-1 text-sm text-neutral-600">{it.description}</div>}
        </li>
      ))}
    </ol>
  );
}
