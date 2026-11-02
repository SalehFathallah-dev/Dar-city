import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_BRAND, DEFAULT_BRAND_LOGO, getBrand, resolveBrandAsset } from '../lib/api';
import type { BrandSettings } from '../lib/types';
import { setReportBrand } from '../lib/reportContext';
import { useAuth } from './AuthContext';

interface BrandState { brand: BrandSettings; logoUrl: string; signatureUrl: string | null; reload: () => Promise<void> }
const BrandContext = createContext<BrandState>({ brand: DEFAULT_BRAND, logoUrl: DEFAULT_BRAND_LOGO, signatureUrl: null, reload: async () => {} });

/** The medical brand (Dr. Faraj Lashika) – independent from any club identity. */
export function BrandProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [brand, setBrand] = useState<BrandSettings>(DEFAULT_BRAND);
  const [logoUrl, setLogoUrl] = useState(DEFAULT_BRAND_LOGO);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!profile?.is_active) return;
    try {
      const b = await getBrand();
      setBrand(b);
      const [logo, sig] = await Promise.all([resolveBrandAsset(b.logoPath), resolveBrandAsset(b.signaturePath)]);
      setLogoUrl(logo ?? DEFAULT_BRAND_LOGO);
      setSignatureUrl(sig);
      setReportBrand({ ...b, logoUrl: logo ?? DEFAULT_BRAND_LOGO, signatureUrl: sig });
    } catch { /* keep defaults */ }
  }, [profile?.is_active]);
  useEffect(() => { void reload(); }, [reload]);
  return <BrandContext.Provider value={{ brand, logoUrl, signatureUrl, reload }}>{children}</BrandContext.Provider>;
}
export const useBrand = () => useContext(BrandContext);
