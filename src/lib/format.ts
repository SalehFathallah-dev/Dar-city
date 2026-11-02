/** Date helpers. All UI dates use DD/MM/YYYY. ISO (YYYY-MM-DD) is used for storage. */

const pad = (n: number) => String(n).padStart(2, '0');

export function parseISODate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m && value.length <= 10) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value: string | Date | null | undefined): string {
  const d = value instanceof Date ? value : parseISODate(value ?? null);
  if (!d) return '—';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatDateTime(value: string | null | undefined): string {
  const d = parseISODate(value ?? null);
  if (!d) return '—';
  return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso)!;
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Whole days between two ISO dates (b - a). */
export function daysBetween(a: string, b: string): number {
  const da = parseISODate(a), db = parseISODate(b);
  if (!da || !db) return 0;
  return Math.round((Date.UTC(db.getFullYear(), db.getMonth(), db.getDate()) - Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())) / 86400000);
}

export function calculateAge(dob: string | null | undefined, at: Date = new Date()): number | null {
  const d = parseISODate(dob ?? null);
  if (!d) return null;
  let age = at.getFullYear() - d.getFullYear();
  const m = at.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < d.getDate())) age--;
  return age;
}

export function calculateBMI(heightCm: number | null | undefined, weightKg: number | null | undefined): number | null {
  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

export function bmiCategory(bmi: number | null): string {
  if (bmi == null) return '—';
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Normal range';
  if (bmi < 30) return 'Overweight (interpret with muscle mass)';
  return 'Obese range (interpret with muscle mass)';
}

export function fmt(value: unknown, suffix = ''): string {
  if (value === null || value === undefined || value === '') return '—';
  return `${value}${suffix}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function referenceNumber(prefix: string, date = new Date()): string {
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `DCB-${prefix}-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${rand}`;
}

export function initials(name: string): string {
  return name.replace(/^DEMO\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}
