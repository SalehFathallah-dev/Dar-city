import { useCallback, useEffect, useState } from 'react';
import { Download, ExternalLink, Printer } from 'lucide-react';
import { Button, Modal, Spinner } from './ui';
import { downloadBlob } from '../lib/csv';
import { logEvent } from '../lib/api';
import type { GeneratedReport } from '../lib/reports';
import { useToast } from '../context/ToastContext';

/** Hook: generate a report, then show it in a preview modal before download. */
export function useReportPreview() {
  const toast = useToast();
  const [report, setReport] = useState<GeneratedReport | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (gen: () => Promise<GeneratedReport>) => {
    setBusy(true);
    try {
      const r = await gen();
      setReport(r);
      void logEvent('EXPORT_PDF', 'report', r.ref, { title: r.title });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to generate report');
    } finally { setBusy(false); }
  }, [toast]);
  const modal = <PdfPreviewModal report={report} onClose={() => setReport(null)} />;
  return { run, busy, modal };
}

export function PdfPreviewModal({ report, onClose }: { report: GeneratedReport | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!report) return;
    const u = URL.createObjectURL(report.blob);
    setUrl(u);
    return () => { URL.revokeObjectURL(u); setUrl(null); };
  }, [report]);
  if (!report) return null;
  const print = () => {
    const w = window.open(url!, '_blank');
    w?.addEventListener('load', () => w.print());
  };
  return (
    <Modal open onClose={onClose} title={report.title} size="full"
      footer={<>
        <span className="mr-auto self-center text-xs text-neutral-500">Ref: {report.ref}</span>
        <Button variant="secondary" icon={<ExternalLink className="h-4 w-4" />} onClick={() => window.open(url!, '_blank')}>Open</Button>
        <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={print}>Print</Button>
        <Button icon={<Download className="h-4 w-4" />} onClick={() => downloadBlob(report.blob, report.filename)}>Download PDF</Button>
      </>}>
      {url ? <iframe title="PDF preview" src={url} className="h-[70vh] w-full rounded-lg border border-neutral-200 bg-neutral-100" /> : <Spinner />}
    </Modal>
  );
}
