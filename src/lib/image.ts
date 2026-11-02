/**
 * Prepares an image picked from the phone gallery or camera for upload:
 * decodes any format the browser supports (JPG, PNG, WEBP, HEIC on iPhone…),
 * applies the correct orientation, scales it down and re-encodes it.
 * This keeps uploads small and avoids "file too large / unsupported" errors.
 */
export interface PrepareOptions { maxDim: number; format: 'jpeg' | 'png'; quality?: number; allowSvg?: boolean }

export async function prepareImage(file: File, opts: PrepareOptions): Promise<File> {
  if (opts.allowSvg && (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name))) return file;
  if (file.size > 40 * 1024 * 1024) throw new Error('This image is too large (over 40 MB).');
  const bitmap = await decode(file);
  const scale = Math.min(1, opts.maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  if (opts.format === 'jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);
  if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();
  const type = opts.format === 'png' ? 'image/png' : 'image/jpeg';
  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, type, opts.quality ?? 0.86));
  if (!blob) throw new Error('Unable to process this image.');
  const base = (file.name.replace(/\.[^.]+$/, '') || 'image').slice(0, 80);
  return new File([blob], `${base}.${opts.format === 'png' ? 'png' : 'jpg'}`, { type });
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions); } catch { /* fall back */ }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('This image format is not supported by your browser. Please choose a JPG or PNG photo.'));
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
