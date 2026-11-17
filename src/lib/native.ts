/**
 * Saving and opening files. In the Android app, files are written to the app cache and
 * handed to the phone's share sheet (save to Files/Drive, send by WhatsApp/e-mail …) or
 * opened in the phone's viewer app. In a normal browser they are downloaded.
 */
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { FileOpener } from '@capacitor-community/file-opener';

export const isNative = () => Capacitor.isNativePlatform();

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
const safeName = (n: string) => n.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'file';

async function writeCache(blob: Blob, filename: string): Promise<string> {
  const res = await Filesystem.writeFile({ path: `exports/${Date.now()}-${safeName(filename)}`, data: await blobToBase64(blob), directory: Directory.Cache, recursive: true });
  return res.uri;
}

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

/** Save / send a file (share sheet on the phone, download in a browser). */
export async function saveFile(blob: Blob, filename: string) {
  if (!isNative()) return browserDownload(blob, filename);
  const uri = await writeCache(blob, filename);
  await Share.share({ title: filename, files: [uri], dialogTitle: 'Save or send file' });
}

/** Open a file in the phone's viewer (PDF reader, gallery …). */
export async function openFile(blob: Blob, filename: string) {
  if (!isNative()) {
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  const uri = await writeCache(blob, filename);
  try {
    await FileOpener.open({ filePath: uri, contentType: blob.type || 'application/octet-stream', openWithDefault: true });
  } catch {
    await Share.share({ title: filename, files: [uri] });
  }
}
