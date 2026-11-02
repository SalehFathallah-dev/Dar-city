import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import { APP } from './constants';
import { formatDate, formatDateTime, referenceNumber } from './format';

const ORANGE: [number, number, number] = [244, 81, 30];
const RED: [number, number, number] = [217, 30, 54];
const BLACK: [number, number, number] = [23, 23, 23];
const CHARCOAL: [number, number, number] = [36, 36, 36];
const BEIGE: [number, number, number] = [216, 204, 174];
const GREY: [number, number, number] = [110, 110, 110];

const PAGE_W = 210, PAGE_H = 297, MARGIN = 15, CONTENT_W = PAGE_W - MARGIN * 2;
const TOP_CONT = 30, BOTTOM = PAGE_H - 22;

let logoCache: { data: string; w: number; h: number } | null = null;
async function loadLogo() {
  if (logoCache) return logoCache;
  const res = await fetch('/logo.png');
  const blob = await res.blob();
  const data: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
  const dims: { w: number; h: number } = await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 356, h: 379 });
    img.src = data;
  });
  logoCache = { data, ...dims };
  return logoCache;
}

export interface ReportOptions { title: string; refPrefix: string; subtitle?: string; physician?: string; landscape?: boolean }

export class ReportBuilder {
  doc: jsPDF;
  y = 0;
  readonly ref: string;
  readonly title: string;
  private physician: string;
  private logo: { data: string; w: number; h: number } | null = null;
  private subtitle?: string;

  constructor(opts: ReportOptions) {
    this.doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    this.ref = referenceNumber(opts.refPrefix);
    this.title = opts.title;
    this.subtitle = opts.subtitle;
    this.physician = opts.physician ?? APP.physician;
    this.doc.setProperties({ title: `${opts.title} – ${this.ref}`, author: this.physician, creator: APP.name, subject: 'Confidential medical document' });
  }

  async start() {
    try { this.logo = await loadLogo(); } catch { this.logo = null; }
    this.drawFullHeader();
    return this;
  }

  private drawFullHeader() {
    const d = this.doc;
    d.setFillColor(...BLACK);
    d.rect(0, 0, PAGE_W, 36, 'F');
    d.setFillColor(...ORANGE);
    d.rect(0, 36, PAGE_W, 1.6, 'F');
    d.setFillColor(...RED);
    d.rect(0, 37.6, PAGE_W, 0.8, 'F');
    if (this.logo) {
      const h = 28, w = (this.logo.w / this.logo.h) * h;
      d.addImage(this.logo.data, 'PNG', MARGIN, 4, w, h);
    }
    d.setTextColor(255, 255, 255);
    d.setFont('helvetica', 'bold'); d.setFontSize(15);
    d.text(APP.team, 48, 13);
    d.setFontSize(9.5); d.setTextColor(...BEIGE);
    d.text(APP.department, 48, 19);
    d.text(APP.system, 48, 24.5);
    d.setFont('helvetica', 'normal'); d.setFontSize(8.5); d.setTextColor(255, 255, 255);
    d.text(`Physician: ${this.physician}`, 48, 30.5);
    d.setFontSize(8); d.setTextColor(...BEIGE);
    d.text('Reference No.', PAGE_W - MARGIN, 12, { align: 'right' });
    d.setTextColor(255, 255, 255); d.setFont('helvetica', 'bold');
    d.text(this.ref, PAGE_W - MARGIN, 17, { align: 'right' });
    d.setFont('helvetica', 'normal'); d.setTextColor(...BEIGE);
    d.text('Generated', PAGE_W - MARGIN, 24, { align: 'right' });
    d.setTextColor(255, 255, 255);
    d.text(formatDateTime(new Date().toISOString()), PAGE_W - MARGIN, 29, { align: 'right' });
    // Title
    this.y = 49;
    d.setTextColor(...BLACK); d.setFont('helvetica', 'bold'); d.setFontSize(15);
    d.text(this.title.toUpperCase(), MARGIN, this.y);
    if (this.subtitle) {
      this.y += 5.5;
      d.setFont('helvetica', 'normal'); d.setFontSize(9.5); d.setTextColor(...GREY);
      d.text(this.subtitle, MARGIN, this.y);
    }
    this.y += 7;
  }

  private drawContinuationHeader() {
    const d = this.doc;
    if (this.logo) {
      const h = 13, w = (this.logo.w / this.logo.h) * h;
      d.addImage(this.logo.data, 'PNG', MARGIN, 5, w, h);
    }
    d.setFont('helvetica', 'bold'); d.setFontSize(9.5); d.setTextColor(...BLACK);
    d.text(APP.team, MARGIN + 16, 10);
    d.setFont('helvetica', 'normal'); d.setFontSize(8); d.setTextColor(...GREY);
    d.text(`${this.title}  ·  ${this.ref}`, MARGIN + 16, 15);
    d.setDrawColor(...ORANGE); d.setLineWidth(0.6);
    d.line(MARGIN, 21, PAGE_W - MARGIN, 21);
  }

  newPage() {
    this.doc.addPage();
    this.y = TOP_CONT;
  }

  ensure(space: number) {
    if (this.y + space > BOTTOM) this.newPage();
  }

  section(title: string) {
    this.ensure(16);
    const d = this.doc;
    this.y += 2;
    d.setFillColor(...CHARCOAL);
    d.roundedRect(MARGIN, this.y - 4.6, CONTENT_W, 7, 1.2, 1.2, 'F');
    d.setFillColor(...ORANGE);
    d.rect(MARGIN, this.y - 4.6, 1.6, 7, 'F');
    d.setTextColor(255, 255, 255); d.setFont('helvetica', 'bold'); d.setFontSize(9.5);
    d.text(title.toUpperCase(), MARGIN + 4, this.y);
    this.y += 6;
  }

  /** Label/value pairs in a 2- or 3-column grid. */
  keyValues(pairs: [string, unknown][], cols = 2) {
    const d = this.doc;
    const colW = CONTENT_W / cols;
    for (let i = 0; i < pairs.length; i += cols) {
      const row = pairs.slice(i, i + cols);
      const heights = row.map(([, v]) => d.splitTextToSize(display(v), colW - 4).length);
      const h = 4 + Math.max(...heights) * 4.2 + 1.5;
      this.ensure(h);
      row.forEach(([label, v], j) => {
        const x = MARGIN + j * colW;
        d.setFont('helvetica', 'bold'); d.setFontSize(7.2); d.setTextColor(...GREY);
        d.text(label.toUpperCase(), x, this.y);
        d.setFont('helvetica', 'normal'); d.setFontSize(9.2); d.setTextColor(...BLACK);
        d.text(d.splitTextToSize(display(v), colW - 4), x, this.y + 4.2);
      });
      this.y += h;
    }
    this.y += 1;
  }

  paragraph(label: string | null, text: unknown) {
    const d = this.doc;
    const lines = d.splitTextToSize(display(text), CONTENT_W);
    if (label) {
      this.ensure(10);
      d.setFont('helvetica', 'bold'); d.setFontSize(7.2); d.setTextColor(...GREY);
      d.text(label.toUpperCase(), MARGIN, this.y);
      this.y += 4.2;
    }
    d.setFont('helvetica', 'normal'); d.setFontSize(9.2); d.setTextColor(...BLACK);
    for (const line of lines) {
      this.ensure(5);
      d.text(line, MARGIN, this.y);
      this.y += 4.2;
    }
    this.y += 2;
  }

  table(head: string[], body: RowInput[], opts: { columnStyles?: Record<number, { cellWidth?: number | 'auto'; halign?: 'left' | 'center' | 'right' }>; fontSize?: number } = {}) {
    if (!body.length) { this.paragraph(null, 'No records.'); return; }
    autoTable(this.doc, {
      startY: this.y,
      head: [head],
      body,
      margin: { left: MARGIN, right: MARGIN, top: TOP_CONT, bottom: 24 },
      styles: { font: 'helvetica', fontSize: opts.fontSize ?? 8.2, cellPadding: 1.8, textColor: BLACK, lineColor: [225, 225, 225], lineWidth: 0.1, overflow: 'linebreak' },
      headStyles: { fillColor: BLACK, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: (opts.fontSize ?? 8.2) - 0.2 },
      alternateRowStyles: { fillColor: [247, 244, 236] },
      columnStyles: opts.columnStyles,
    });
    this.y = ((this.doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY) + 6;
  }

  statRow(stats: [string, string | number][]) {
    this.ensure(20);
    const d = this.doc;
    const w = (CONTENT_W - (stats.length - 1) * 3) / stats.length;
    stats.forEach(([label, value], i) => {
      const x = MARGIN + i * (w + 3);
      d.setFillColor(247, 244, 236); d.setDrawColor(...BEIGE);
      d.roundedRect(x, this.y, w, 16, 1.5, 1.5, 'FD');
      d.setFont('helvetica', 'bold'); d.setFontSize(14); d.setTextColor(...ORANGE);
      d.text(String(value), x + w / 2, this.y + 7.5, { align: 'center' });
      d.setFontSize(6.6); d.setTextColor(...GREY);
      d.text(d.splitTextToSize(label.toUpperCase(), w - 2), x + w / 2, this.y + 12, { align: 'center' });
    });
    this.y += 21;
  }

  highlight(label: string, value: string, tone: 'green' | 'orange' | 'red' = 'orange') {
    this.ensure(16);
    const d = this.doc;
    const color: [number, number, number] = tone === 'green' ? [22, 130, 70] : tone === 'red' ? RED : ORANGE;
    d.setDrawColor(...color); d.setLineWidth(0.6);
    d.setFillColor(252, 250, 245);
    d.roundedRect(MARGIN, this.y, CONTENT_W, 13, 1.5, 1.5, 'FD');
    d.setFont('helvetica', 'bold'); d.setFontSize(7.2); d.setTextColor(...GREY);
    d.text(label.toUpperCase(), MARGIN + 4, this.y + 4.8);
    d.setFontSize(12); d.setTextColor(...color);
    d.text(value.toUpperCase(), MARGIN + 4, this.y + 10.3);
    this.y += 18;
  }

  signature(opts: { name?: string; date?: string | null; signedText?: string | null; label?: string } = {}) {
    this.ensure(34);
    const d = this.doc;
    this.y += 6;
    const name = opts.name ?? this.physician;
    d.setDrawColor(...BLACK); d.setLineWidth(0.3);
    d.line(MARGIN, this.y + 12, MARGIN + 75, this.y + 12);
    d.line(PAGE_W - MARGIN - 50, this.y + 12, PAGE_W - MARGIN, this.y + 12);
    if (opts.signedText) {
      d.setFont('times', 'italic'); d.setFontSize(13); d.setTextColor(...CHARCOAL);
      d.text(opts.signedText, MARGIN + 2, this.y + 10);
    }
    if (opts.date) {
      d.setFont('helvetica', 'normal'); d.setFontSize(10); d.setTextColor(...BLACK);
      d.text(formatDate(opts.date), PAGE_W - MARGIN - 48, this.y + 10);
    }
    d.setFont('helvetica', 'bold'); d.setFontSize(8.5); d.setTextColor(...BLACK);
    d.text(name, MARGIN, this.y + 17);
    d.setFont('helvetica', 'normal'); d.setFontSize(7.5); d.setTextColor(...GREY);
    d.text(opts.label ?? 'Team Physician – Signature', MARGIN, this.y + 21);
    d.text('Date', PAGE_W - MARGIN - 50, this.y + 17);
    this.y += 28;
  }

  note(text: string) {
    this.ensure(10);
    const d = this.doc;
    d.setFont('helvetica', 'italic'); d.setFontSize(7.8); d.setTextColor(...GREY);
    for (const line of d.splitTextToSize(text, CONTENT_W)) { this.ensure(4); d.text(line, MARGIN, this.y); this.y += 3.6; }
    this.y += 2;
  }

  /** Adds continuation headers, footers and "Page X of Y" numbering. */
  finish(): Blob {
    const d = this.doc;
    const total = d.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      d.setPage(p);
      if (p > 1) this.drawContinuationHeader();
      d.setDrawColor(...BEIGE); d.setLineWidth(0.3);
      d.line(MARGIN, PAGE_H - 15, PAGE_W - MARGIN, PAGE_H - 15);
      d.setFont('helvetica', 'normal'); d.setFontSize(7); d.setTextColor(...GREY);
      d.text('CONFIDENTIAL MEDICAL DOCUMENT – Dar City Basketball Team, Tanzania. Unauthorised disclosure is prohibited.', MARGIN, PAGE_H - 10.5);
      d.text(`Ref: ${this.ref}`, MARGIN, PAGE_H - 7);
      d.setFont('helvetica', 'bold');
      d.text(`Page ${p} of ${total}`, PAGE_W - MARGIN, PAGE_H - 10.5, { align: 'right' });
    }
    return d.output('blob');
  }
}

export function display(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}
