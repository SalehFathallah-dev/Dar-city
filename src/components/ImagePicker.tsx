import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Camera, Images, Loader2, X } from 'lucide-react';
import { prepareImage, type PrepareOptions } from '../lib/image';

const PRESETS: Record<'photo' | 'logo' | 'signature', PrepareOptions> = {
  photo: { maxDim: 1024, format: 'jpeg', quality: 0.86 },
  logo: { maxDim: 800, format: 'png', allowSvg: true },
  signature: { maxDim: 900, format: 'png' },
};

/**
 * Image picker with two choices: the phone gallery (photo library) or the camera.
 * The chosen picture is resized/converted before it is handed back.
 */
export function ImagePicker({ kind, value, onChange, current, label, hint, error }: {
  kind: 'photo' | 'logo' | 'signature';
  value: File | null;
  onChange: (f: File | null) => void;
  current?: ReactNode;
  label?: string;
  hint?: string;
  error?: string;
}) {
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!value) { setPreview(null); return; }
    const u = URL.createObjectURL(value);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [value]);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setLocalError(null);
    setBusy(true);
    try { onChange(await prepareImage(f, PRESETS[kind])); }
    catch (e) { setLocalError((e as Error).message); onChange(null); }
    finally {
      setBusy(false);
      if (gallery.current) gallery.current.value = '';
      if (camera.current) camera.current.value = '';
    }
  };
  const round = kind === 'photo';
  const btn = 'inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold transition hover:border-brand-gold hover:text-brand-gold disabled:opacity-50';

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative">
        {preview
          ? <img src={preview} alt="Selected image" className={`${round ? 'h-20 w-20 rounded-full object-cover' : 'h-20 w-20 rounded-xl bg-white object-contain p-1'} ring-2 ring-brand-gold`} />
          : current}
        {busy && <span className="absolute inset-0 flex items-center justify-center rounded-full bg-white/70"><Loader2 className="h-6 w-6 animate-spin text-brand-gold" /></span>}
      </div>
      <div className="min-w-0">
        {label && <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-600">{label}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} disabled={busy} onClick={() => gallery.current?.click()}>
            <Images className="h-4 w-4" /> Choose from gallery
          </button>
          {kind !== 'logo' && (
            <button type="button" className={btn} disabled={busy} onClick={() => camera.current?.click()}>
              <Camera className="h-4 w-4" /> Take photo
            </button>
          )}
          {value && (
            <button type="button" className="inline-flex items-center gap-1 px-2 text-xs font-semibold text-neutral-500 hover:text-brand-red" onClick={() => onChange(null)}>
              <X className="h-3.5 w-3.5" /> Remove
            </button>
          )}
        </div>
        {/* Gallery: no "capture" attribute, so phones open the photo library */}
        <input ref={gallery} type="file" accept={kind === 'logo' ? 'image/*,.svg' : 'image/*'} className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
        <input ref={camera} type="file" accept="image/*" capture={kind === 'photo' ? 'user' : 'environment'} className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
        {value && <p className="mt-1 text-xs text-emerald-700">Ready to upload · {Math.round(value.size / 1024)} KB</p>}
        {(localError || error) && <p className="mt-1 text-xs text-brand-red">{localError || error}</p>}
        {hint && !value && !localError && !error && <p className="mt-1 text-xs text-neutral-400">{hint}</p>}
      </div>
    </div>
  );
}
