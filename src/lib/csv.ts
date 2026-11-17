import { saveFile } from './native';

/** UTF-8 CSV generation compatible with Microsoft Excel (BOM + CRLF + RFC 4180 quoting). */

export interface CsvColumn<T> { header: string; value: (row: T) => unknown }

export function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => escapeCsv(c.header)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => escapeCsv(c.value(row))).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** Downloads (browser) or saves/shares (Android app) a file. */
export function downloadBlob(blob: Blob, filename: string): Promise<void> {
  return saveFile(blob, filename).catch((e: unknown) => {
    // The share sheet being dismissed is not an error.
    if (!/cancel/i.test(String((e as Error)?.message ?? e))) alert(`Unable to save the file: ${(e as Error)?.message ?? e}`);
  });
}

export function downloadCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]) {
  downloadBlob(new Blob([toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' }), filename.endsWith('.csv') ? filename : `${filename}.csv`);
}
