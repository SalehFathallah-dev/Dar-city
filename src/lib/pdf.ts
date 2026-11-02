import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import { formatDate, formatDateTime, referenceNumber, todayISO } from './format';
import { getReportBrand, getReportClub } from './reportContext';
import type { Club } from './types';

// Medical brand palette (navy & gold)
const NAVY: [number, number, number] = [20, 35, 71];
const GOLD: [number, number, number] = [154, 118, 52];
const GOLD_LIGHT: [number, number, number] = [201, 168, 102];
const CREAM: [number, number, number] = [247, 243, 234];
const RED: [number, number, number] = [192, 40, 58];
const BLACK: [number, number, number] = [20, 24, 36];
const GREY: [number, number, number] = [105, 110, 122];
const BEIGE = GOLD_LIGHT;
const ORANGE = GOLD;
const CHARCOAL = NAVY;

const PAGE_W = 210, PAGE_H = 297, MARGIN = 15, CONTENT_W = PAGE_W - MARGIN * 2;
const TOP_CONT = 30, BOTTOM = PAGE_H - 24;

interface Img { data: string; w: number; h: number }
const imgCache = new Map<string, Promise<Img | null>>();
/** Loads any image (PNG/JPG/WEBP/SVG) and rasterises it to PNG, preserving its aspect ratio. */
function loadImage(url: string | null | undefined): Promise<Img | null> {
  if (!url) return Promise.resolve(null);
  if (!imgCache.has(url)) {
    imgCache.set(url, new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          let w = img.naturalWidth || 600, h = img.naturalHeight || 600;
          const scale = Math.min(1, 900 / Math.max(w, h)) || 1;
          w = Math.round(w * scale); h = Math.round(h * scale);
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d')!.drawImage(img, 0, 0, w, h);
          resolve({ data: c.toDataURL('image/png'), w, h });
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    }));
  }
  return imgCache.get(url)!;
}

/** Draws an image inside a box (contain) – never stretched. */
function drawContained(d: jsPDF, img: Img, x: number, y: number, boxW: number, boxH: number, align: 'left' | 'center' = 'center') {
  const ratio = img.w / img.h;
  let w = boxW, h = boxW / ratio;
  if (h > boxH) { h = boxH; w = boxH * ratio; }
  const dx = align === 'center' ? x + (boxW - w) / 2 : x;
  d.addImage(img.data, 'PNG', dx, y + (boxH - h) / 2, w, h, undefined, 'FAST');
  return w;
}

export interface ReportOptions { title: string; refPrefix: string; subtitle?: string; physician?: string; club?: Club | null; landscape?: boolean }

export class ReportBuilder {
  doc: jsPDF;
  y = 0;
  readonly ref: string;
  readonly title: string;
  private physician: string;
  private subtitle?: string;
  private club: Club | null;
  private brandLogo: Img | null = null;
  private clubLogo: Img | null = null;
  private signatureImg: Img | null = null;

  constructor(opts: ReportOptions) {
    const brand = getReportBrand();
    this.doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    this.ref = referenceNumber(opts.refPrefix);
    this.title = opts.title;
    this.subtitle = opts.subtitle;
    this.club = opts.club === undefined ? getReportClub() : opts.club;
    this.physician = opts.physician ?? brand.name;
    this.doc.setProperties({ title: `${opts.title} – ${this.ref}`, author: brand.name, creator: `${brand.name} – ${brand.specialty}`, subject: 'Confidential medical document' });
  }

  async start() {
    const brand = getReportBrand();
    const { resolveClubLogo } = await import('./api');
    const clubLogoUrl = await resolveClubLogo(this.club?.logo_url).catch(() => null);
    [this.brandLogo, this.clubLogo, this.signatureImg] = await Promise.all([loadImage(brand.logoUrl), loadImage(clubLogoUrl), loadImage(brand.signatureUrl)]);
    this.drawFullHeader();
    return this;
  }

  private drawFullHeader() {
    const d = this.doc;
    const brand = getReportBrand();
    // A. Medical brand
    if (this.brandLogo) drawContained(d, this.brandLogo, MARGIN, 7, 78, 22, 'left');
    d.setTextColor(...NAVY); d.setFont('helvetica', 'bold'); d.setFontSize(14);
    d.text(brand.name.toUpperCase(), PAGE_W - MARGIN, 14, { align: 'right' });
    d.setTextColor(...GOLD); d.setFontSize(8.5);
    d.text(brand.specialty.toUpperCase(), PAGE_W - MARGIN, 19.5, { align: 'right' });
    if (brand.contact) {
      d.setFont('helvetica', 'normal'); d.setFontSize(7.2); d.setTextColor(...GREY);
      d.text(d.splitTextToSize(brand.contact, 90).slice(0, 2), PAGE_W - MARGIN, 24, { align: 'right' });
    }
    d.setDrawColor(...GOLD); d.setLineWidth(0.5);
    d.line(MARGIN, 32, PAGE_W - MARGIN, 32);
    // B. Club identity (separate band)
    d.setFillColor(...NAVY);
    d.rect(0, 35, PAGE_W, 19, 'F');
    d.setFillColor(255, 255, 255);
    d.roundedRect(MARGIN, 36.5, 16, 16, 1.5, 1.5, 'F');
    if (this.clubLogo) drawContained(d, this.clubLogo, MARGIN + 1, 37.5, 14, 14);
    else if (this.club) {
      d.setTextColor(...NAVY); d.setFont('helvetica', 'bold'); d.setFontSize(9);
      d.text(this.club.short_name.slice(0, 3).toUpperCase(), MARGIN + 8, 46, { align: 'center' });
    }
    d.setFont('helvetica', 'bold'); d.setFontSize(6.5); d.setTextColor(...GOLD_LIGHT);
    d.text('CLUB', MARGIN + 20, 40.5);
    d.setFontSize(11); d.setTextColor(255, 255, 255);
    d.text((this.club?.name ?? 'No club selected').toUpperCase(), MARGIN + 20, 45.8, { maxWidth: 110 });
    d.setFont('helvetica', 'normal'); d.setFontSize(7.8); d.setTextColor(...GOLD_LIGHT);
    const clubLine = [this.club?.country, this.club?.city, this.club?.current_season && `Season ${this.club.current_season}`].filter(Boolean).join('  ·  ');
    if (clubLine) d.text(clubLine.toUpperCase(), MARGIN + 20, 50.5);
    d.setFontSize(6.8); d.setTextColor(...GOLD_LIGHT);
    d.text('REFERENCE NO.', PAGE_W - MARGIN, 40, { align: 'right' });
    d.text('DATE OF ISSUE', PAGE_W - MARGIN, 47.5, { align: 'right' });
    d.setFont('helvetica', 'bold'); d.setFontSize(8.5); d.setTextColor(255, 255, 255);
    d.text(this.ref, PAGE_W - MARGIN, 44, { align: 'right' });
    d.text(formatDate(todayISO()), PAGE_W - MARGIN, 51.5, { align: 'right' });
    d.setFillColor(...GOLD);
    d.rect(0, 54, PAGE_W, 0.9, 'F');
    // Title
    this.y = 66;
    d.setTextColor(...NAVY); d.setFont('helvetica', 'bold'); d.setFontSize(15);
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
    let x = MARGIN;
    if (this.brandLogo) x += drawContained(d, this.brandLogo, MARGIN, 5, 36, 12, 'left') + 4;
    d.setDrawColor(...GOLD_LIGHT); d.setLineWidth(0.2);
    d.line(x, 6, x, 17);
    x += 4;
    if (this.clubLogo) x += drawContained(d, this.clubLogo, x, 6, 11, 11, 'left') + 3;
    d.setFont('helvetica', 'bold'); d.setFontSize(8.5); d.setTextColor(...NAVY);
    d.text(this.club?.short_name ?? '', x, 10.5);
    d.setFont('helvetica', 'normal'); d.setFontSize(7.5); d.setTextColor(...GREY);
    d.text(`${this.title}  ·  ${this.ref}`, PAGE_W - MARGIN, 10.5, { align: 'right' });
    d.setDrawColor(...GOLD); d.setLineWidth(0.5);
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
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: (opts.fontSize ?? 8.2) - 0.2 },
      alternateRowStyles: { fillColor: CREAM },
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
      d.setFillColor(...CREAM); d.setDrawColor(...BEIGE);
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
    if (this.signatureImg && opts.signedText !== null) {
      drawContained(d, this.signatureImg, MARGIN + 1, this.y - 1, 60, 12, 'left');
    } else if (opts.signedText) {
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
    d.text(opts.label ?? `${getReportBrand().specialty} – Physician Signature`, MARGIN, this.y + 21);
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

  /** Adds continuation headers, the official footer and "Page X of Y" numbering. */
  finish(): Blob {
    const d = this.doc;
    const brand = getReportBrand();
    const total = d.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      d.setPage(p);
      if (p > 1) this.drawContinuationHeader();
      d.setDrawColor(...GOLD); d.setLineWidth(0.4);
      d.line(MARGIN, PAGE_H - 17, PAGE_W - MARGIN, PAGE_H - 17);
      d.setFont('helvetica', 'bold'); d.setFontSize(7.4); d.setTextColor(...NAVY);
      d.text(`${brand.name}  ·  ${brand.specialty}  ·  Official Team Medical Records`, MARGIN, PAGE_H - 12.5);
      d.setFont('helvetica', 'normal'); d.setFontSize(6.6); d.setTextColor(...GREY);
      d.text(`Confidential medical document${this.club ? ` – ${this.club.name}` : ''}. Unauthorised disclosure is prohibited.`, MARGIN, PAGE_H - 9);
      d.text(`Ref: ${this.ref}  ·  Issued ${formatDateTime(new Date().toISOString())}`, MARGIN, PAGE_H - 5.8);
      d.setFont('helvetica', 'bold'); d.setFontSize(7.4); d.setTextColor(...NAVY);
      d.text(`Page ${p} of ${total}`, PAGE_W - MARGIN, PAGE_H - 12.5, { align: 'right' });
    }
    return d.output('blob');
  }
}

export function display(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}
