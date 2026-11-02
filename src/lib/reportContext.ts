import type { BrandSettings, Club } from './types';
import { DEFAULT_BRAND, DEFAULT_BRAND_LOGO } from './api';

/** Branding used by every PDF: the medical brand and the currently selected club. */
export interface ReportBrand extends BrandSettings { logoUrl: string; signatureUrl: string | null }
let brand: ReportBrand = { ...DEFAULT_BRAND, logoUrl: DEFAULT_BRAND_LOGO, signatureUrl: null };
let club: Club | null = null;
export const setReportBrand = (b: ReportBrand) => { brand = b; };
export const setReportClub = (c: Club | null) => { club = c; };
export const getReportBrand = () => brand;
export const getReportClub = () => club;
