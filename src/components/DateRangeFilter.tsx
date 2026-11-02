import { useMemo, useState } from 'react';
import { rangeFromPreset, type DateRange, type RangePreset } from '../lib/analytics';
import { useReference } from '../context/ReferenceContext';
import { Input, Select } from './ui';

const PRESETS: { value: RangePreset; label: string }[] = [
  { value: '7d', label: 'Last 7 Days' }, { value: '30d', label: 'Last 30 Days' }, { value: 'month', label: 'Current Month' },
  { value: 'season', label: 'Current Season' }, { value: 'all', label: 'All Time' }, { value: 'custom', label: 'Custom Date Range' },
];

export function useDateRange(initial: RangePreset = 'season') {
  const { currentSeason } = useReference();
  const [preset, setPreset] = useState<RangePreset>(initial);
  const [custom, setCustom] = useState<DateRange>({ from: null, to: null });
  const range = useMemo(() => {
    if (preset === 'season' && !currentSeason) return rangeFromPreset('all');
    return rangeFromPreset(preset, { season: currentSeason, custom });
  }, [preset, custom, currentSeason]);
  return { preset, setPreset, custom, setCustom, range };
}

export function DateRangeFilter({ state }: { state: ReturnType<typeof useDateRange> }) {
  const { preset, setPreset, custom, setCustom } = state;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={preset} onChange={(e) => setPreset(e.target.value as RangePreset)} options={PRESETS} className="!w-auto" aria-label="Date range" />
      {preset === 'custom' && (
        <>
          <Input type="date" value={custom.from ?? ''} onChange={(e) => setCustom({ ...custom, from: e.target.value || null })} className="!w-auto" aria-label="From" />
          <span className="text-neutral-400">–</span>
          <Input type="date" value={custom.to ?? ''} onChange={(e) => setCustom({ ...custom, to: e.target.value || null })} className="!w-auto" aria-label="To" />
        </>
      )}
    </div>
  );
}
