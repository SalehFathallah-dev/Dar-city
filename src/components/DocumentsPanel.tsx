import { useState } from 'react';
import { Archive, Download, Eye, FileText, Image as ImageIcon, Upload } from 'lucide-react';
import * as api from '../lib/api';
import { DOCUMENT_CATEGORIES, MAX_DOC_BYTES } from '../lib/constants';
import { formatBytes, formatDate, todayISO } from '../lib/format';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { MedicalDocument } from '../lib/types';
import { Badge, Button, ConfirmDialog, EmptyState, ErrorBlock, Field, Grid, Input, Modal, Select, Spinner, Textarea } from './ui';
import { PlayerPicker } from './PlayerPicker';

export function DocumentsPanel({ playerId, injuryId, examinationId, showPlayer }: { playerId?: string; injuryId?: string; examinationId?: string; showPlayer?: boolean }) {
  const { caps } = useAuth();
  const toast = useToast();
  const docs = useAsync(() => api.listDocuments({ playerId, injuryId, examinationId }), [playerId, injuryId, examinationId]);
  const [open, setOpen] = useState(false);
  const [toArchive, setToArchive] = useState<MedicalDocument | null>(null);
  const [archiving, setArchiving] = useState(false);

  const view = async (d: MedicalDocument, download = false) => {
    try { window.open(await api.getDocumentUrl(d, download), '_blank', 'noopener'); } catch (e) { toast.error((e as Error).message); }
  };
  const archive = async () => {
    if (!toArchive) return;
    setArchiving(true);
    try { await api.archiveDocument(toArchive.id); toast.success('Document archived'); setToArchive(null); void docs.reload(); }
    catch (e) { toast.error((e as Error).message); } finally { setArchiving(false); }
  };

  return (
    <div>
      {caps.uploadDocuments && (
        <div className="mb-4 flex justify-end"><Button icon={<Upload className="h-4 w-4" />} onClick={() => setOpen(true)}>Upload Document</Button></div>
      )}
      {docs.loading ? <Spinner /> : docs.error ? <ErrorBlock message={docs.error} onRetry={docs.reload} /> : !docs.data?.length ? (
        <EmptyState title="No documents" description="Upload laboratory results, imaging reports, certificates and other medical files (PDF, JPG, PNG)." />
      ) : (
        <ul className="divide-y divide-neutral-100">
          {docs.data.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-cream text-brand-navy">
                {d.mime_type === 'application/pdf' ? <FileText className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-neutral-900">{d.title}</p>
                <p className="text-xs text-neutral-500">
                  {showPlayer && d.players ? `${d.players.full_name} · ` : ''}{formatDate(d.document_date ?? d.created_at)} · {formatBytes(d.size_bytes)} · {d.file_name}
                </p>
              </div>
              <Badge color="beige">{d.category}</Badge>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" icon={<Eye className="h-4 w-4" />} onClick={() => view(d)}>View</Button>
                <Button size="sm" variant="ghost" icon={<Download className="h-4 w-4" />} onClick={() => view(d, true)} aria-label="Download" />
                {caps.editMedical && <Button size="sm" variant="ghost" icon={<Archive className="h-4 w-4" />} onClick={() => setToArchive(d)} aria-label="Archive" />}
              </div>
            </li>
          ))}
        </ul>
      )}
      <UploadModal open={open} onClose={() => setOpen(false)} playerId={playerId} injuryId={injuryId} examinationId={examinationId} onDone={() => { setOpen(false); void docs.reload(); }} />
      <ConfirmDialog open={!!toArchive} title="Archive document" danger confirmLabel="Archive" loading={archiving}
        message={<>Archive <b>{toArchive?.title}</b>? It will be hidden from lists but retained securely for the medical record.</>}
        onConfirm={archive} onCancel={() => setToArchive(null)} />
    </div>
  );
}

function UploadModal({ open, onClose, playerId, injuryId, examinationId, onDone }: { open: boolean; onClose: () => void; playerId?: string; injuryId?: string; examinationId?: string; onDone: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ player_id: playerId ?? '', category: '', title: '', description: '', document_date: todayISO() });
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!form.player_id) e.player_id = 'Select a player';
    if (!form.category) e.category = 'Select a category';
    if (form.title.trim().length < 2) e.title = 'Enter a title';
    if (!file) e.file = 'Choose a file';
    else if (file.size > MAX_DOC_BYTES) e.file = 'Maximum file size is 10 MB';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      await api.uploadDocument({ ...form, injury_id: injuryId ?? null, examination_id: examinationId ?? null }, file!);
      toast.success('Document uploaded securely');
      setFile(null); setForm((f) => ({ ...f, title: '', description: '' }));
      onDone();
    } catch (err) { toast.error((err as Error).message); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Upload Medical Document"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={submit} icon={<Upload className="h-4 w-4" />}>Upload</Button></>}>
      <div className="space-y-4">
        {!playerId && <Field label="Player" required error={errors.player_id}><PlayerPicker value={form.player_id} onChange={set('player_id')} error={!!errors.player_id} includeInactive /></Field>}
        <Grid>
          <Field label="Category" required error={errors.category}><Select value={form.category} onChange={(e) => set('category')(e.target.value)} options={DOCUMENT_CATEGORIES} placeholder="Select…" error={!!errors.category} /></Field>
          <Field label="Document Date"><Input type="date" value={form.document_date} onChange={(e) => set('document_date')(e.target.value)} /></Field>
        </Grid>
        <Field label="Title" required error={errors.title}><Input value={form.title} onChange={(e) => set('title')(e.target.value)} placeholder="e.g. Right ankle X-ray report" error={!!errors.title} /></Field>
        <Field label="Description"><Textarea value={form.description} onChange={(e) => set('description')(e.target.value)} rows={2} /></Field>
        <Field label="File (PDF, JPG, JPEG, PNG – max 10 MB)" required error={errors.file}>
          <input type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-navy file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white" />
        </Field>
        <p className="text-xs text-neutral-500">Files are stored in a private, access-controlled bucket and are never publicly accessible.</p>
      </div>
    </Modal>
  );
}
