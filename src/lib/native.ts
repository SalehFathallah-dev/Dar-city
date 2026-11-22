/**
 * Saving and opening files in the browser (web app on Render – phones and computers).
 * On phones the system share sheet is used when available (save to Files/Drive, send by
 * WhatsApp or e-mail); otherwise the file is downloaded.
 */

/** Phone or tablet (touch screen) – PDFs cannot be shown inside the page there. */
export const isMobile = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 768);

function browserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Save / send a file: share sheet on phones (when supported), download otherwise. */
export async function saveFile(blob: Blob, filename: string) {
  if (isMobile() && typeof navigator !== 'undefined' && 'canShare' in navigator) {
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return;
    }
  }
  browserDownload(blob, filename);
}

/** Open a file in a new tab (the phone's viewer); downloads it if pop-ups are blocked. */
export async function openFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) browserDownload(blob, filename);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
