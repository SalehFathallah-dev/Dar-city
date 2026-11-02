import { useReference } from '../context/ReferenceContext';
import { Select } from './ui';

export function PlayerPicker({ value, onChange, error, includeInactive, placeholder = 'Select player…', disabled }:
  { value: string; onChange: (id: string) => void; error?: boolean; includeInactive?: boolean; placeholder?: string; disabled?: boolean }) {
  const { players } = useReference();
  const list = players.filter((p) => p.status === 'active' || (includeInactive && p.status !== 'archived') || p.id === value);
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} error={error} disabled={disabled} placeholder={placeholder}
      options={list.map((p) => ({ value: p.id, label: `${p.jersey_number != null ? '#' + p.jersey_number + ' ' : ''}${p.full_name} · ${p.position}` }))} />
  );
}
