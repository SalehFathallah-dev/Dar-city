import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarCheck2, EyeOff, FileText, History, Pencil, Printer } from 'lucide-react';
import * as api from '../lib/api';
import * as reports from '../lib/reports';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { AVAILABILITY, MEDICAL_STATUSES } from '../lib/constants';
import { formatDate, formatDateTime, todayISO } from '../lib/format';
import { latestByPlayer, isOpenInjury } from '../lib/analytics';
import type { Availability, Injury } from '../lib/types';
import { Badge, Button, Card, Checkbox, ErrorBlock, Field, Grid, Input, Logo, Modal, PageHeader, Select, Spinner, StatCard, StatusBadge, Table, Td, Textarea } from '../components/ui';
import { PlayerPicker } from '../components/PlayerPicker';
import { useReportPreview } from '../components/PdfPreview';
import { APP } from '../lib/constants';

interface Row {
  player_id: string; full_name: string; jersey_number: number | null; position: string; availability: string; medical_status: string;
  restrictions: string | null; staff_notes: string | null; internal_notes?: string | null; shared?: boolean; effective_date: string | null;
  next_followup_date: string | null; last_assessment_date: string | null;
}

export default function AvailabilityPage() {
  const { caps } = useAuth();
  const [params, setParams] = useSearchParams();
  const pdf = useReportPreview();
  const data = useAsync(async () => {
    const team = await api.getTeamAvailability();
    if (!caps.viewMedical) return { rows: team as Row[], history: [] as Availability[], injuries: [] as Injury[] };
    const [history, injuries] = await Promise.all([api.listAvailability(), api.listInjuries()]);
    const latest = latestByPlayer(history, 'effective_date');
    const rows: Row[] = team.map((t) => {
      const l = latest.get(t.player_id);
      return l ? { ...t, availability: l.availability, medical_status: l.medical_status, restrictions: l.restrictions, staff_notes: l.staff_notes, internal_notes: l.internal_notes, shared: l.shared_with_staff, effective_date: l.effective_date, next_followup_date: l.next_followup_date } : t;
    });
    return { rows, history, injuries };
  }, [caps.viewMedical]);
  const [editing, setEditing] = useState<string | null>(params.get('update') ? '' : null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  useEffect(() => { if (params.get('update')) setParams({}, { replace: true }); }, [params, setParams]);

  const rows = useMemo(() => (data.data?.rows ?? []).filter((r) => !filter || r.availability === filter), [data.data, filter]);
  const count = (s: string) => (data.data?.rows ?? []).filter((r) => r.availability === s).length;

  return (
    <div>
      <PageHeader title="Player Availability" subtitle={`Daily team medical availability · ${formatDate(todayISO())}`} icon={<CalendarCheck2 className="h-6 w-6" />}
        actions={<>
          <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Print</Button>
          <Button variant="secondary" icon={<FileText className="h-4 w-4" />} loading={pdf.busy} onClick={() => pdf.run(() => reports.availabilityReport())}>Daily Report PDF</Button>
          {caps.updateAvailability && <Button icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing('')}>Update Availability</Button>}
        </>} />
      <div className="mb-4 hidden items-center gap-4 print:flex"><Logo size={60} /><div><p className="font-display text-xl font-bold">{APP.team}</p><p className="text-sm">Daily Player Availability – {formatDate(todayISO())} – {APP.physician}</p></div></div>
      {data.loading ? <Spinner /> : data.error ? <ErrorBlock message={data.error} onRetry={data.reload} /> : (
        <>
          <div className="no-print mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            {AVAILABILITY.map((s) => (
              <StatCard key={s} label={s} value={count(s)} onClick={() => setFilter(filter === s ? '' : s)}
                icon={<CalendarCheck2 className="h-5 w-5" />} tone={s === 'FULLY AVAILABLE' ? 'green' : s === 'NOT AVAILABLE' ? 'red' : s === 'UNDER MEDICAL REVIEW' ? 'blue' : 'orange'} />
            ))}
          </div>
          <Card padded>
            {filter && <p className="no-print mb-3 text-sm">Filtered: <Badge color="orange">{filter}</Badge> <button className="ml-2 text-brand-orange" onClick={() => setFilter('')}>Clear</button></p>}
            <Table headers={['Player', '#', 'Position', 'Medical Status', 'Training Availability', 'Restrictions', 'Last Assessment', 'Next Follow-up', ...(caps.viewMedical ? [''] : [])]} empty={!rows.length}>
              {rows.map((r) => (
                <tr key={r.player_id}>
                  <Td className="font-semibold">{r.full_name}{r.staff_notes && <span className="block text-xs font-normal text-neutral-500">{r.staff_notes}</span>}
                    {caps.viewMedical && r.internal_notes && <span className="block text-xs font-normal italic text-brand-red">Internal: {r.internal_notes}</span>}</Td>
                  <Td className="font-display text-lg font-bold text-brand-orange">{r.jersey_number ?? '–'}</Td>
                  <Td>{r.position}</Td>
                  <Td>{r.medical_status}</Td>
                  <Td><StatusBadge status={r.availability} />{caps.viewMedical && r.shared === false && <span className="mt-1 flex items-center gap-1 text-[11px] text-neutral-500"><EyeOff className="h-3 w-3" /> Not shared</span>}</Td>
                  <Td className="max-w-xs">{r.restrictions ?? '—'}</Td>
                  <Td>{formatDate(r.last_assessment_date)}</Td>
                  <Td>{formatDate(r.next_followup_date)}</Td>
                  {caps.viewMedical && (
                    <Td className="no-print whitespace-nowrap">
                      {caps.updateAvailability && <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(r.player_id)} aria-label="Update" />}
                      <Button size="sm" variant="ghost" icon={<History className="h-4 w-4" />} onClick={() => setHistoryFor(r.player_id)} aria-label="History" />
                    </Td>
                  )}
                </tr>
              ))}
            </Table>
            {!caps.viewMedical && <p className="mt-4 text-xs text-neutral-500">Only approved availability information is shown. Diagnoses and clinical notes are confidential to the medical team.</p>}
          </Card>
        </>
      )}
      {editing !== null && (
        <UpdateModal playerId={editing} rows={data.data?.rows ?? []} injuries={data.data?.injuries ?? []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void data.reload(); }} />
      )}
      <Modal open={!!historyFor} onClose={() => setHistoryFor(null)} title="Availability History" size="lg">
        <ul className="divide-y divide-neutral-100">
          {(data.data?.history ?? []).filter((h) => h.player_id === historyFor).map((h) => (
            <li key={h.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2"><b>{formatDate(h.effective_date)}</b><StatusBadge status={h.availability} /><span className="text-neutral-500">{h.medical_status}</span>{!h.shared_with_staff && <Badge>Not shared</Badge>}<span className="ml-auto text-xs text-neutral-400">{formatDateTime(h.created_at)}</span></div>
              {h.restrictions && <p className="mt-1 text-neutral-600">Restrictions: {h.restrictions}</p>}
              {h.internal_notes && <p className="mt-1 italic text-neutral-500">Internal: {h.internal_notes}</p>}
            </li>
          ))}
        </ul>
      </Modal>
      {pdf.modal}
    </div>
  );
}

function UpdateModal({ playerId, rows, injuries, onClose, onSaved }: { playerId: string; rows: Row[]; injuries: Injury[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const cur = rows.find((r) => r.player_id === playerId);
  const [f, setF] = useState({
    player_id: playerId, effective_date: todayISO(), availability: cur?.availability ?? 'FULLY AVAILABLE', medical_status: cur?.medical_status ?? 'Fit',
    restrictions: cur?.restrictions ?? '', staff_notes: cur?.staff_notes ?? '', internal_notes: '', shared_with_staff: true, next_followup_date: cur?.next_followup_date ?? '', injury_id: '',
  });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const c = rows.find((r) => r.player_id === f.player_id);
    if (c && f.player_id !== playerId) setF((x) => ({ ...x, availability: c.availability, medical_status: c.medical_status, restrictions: c.restrictions ?? '', staff_notes: c.staff_notes ?? '' }));
  }, [f.player_id, playerId, rows]);
  const openInj = injuries.filter((i) => i.player_id === f.player_id && isOpenInjury(i));
  const save = async () => {
    if (!f.player_id) return toast.error('Select a player');
    if (f.availability !== 'FULLY AVAILABLE' && f.availability !== 'NOT AVAILABLE' && !f.restrictions.trim()) return toast.error('Describe the training restrictions for the coaching staff');
    setSaving(true);
    try {
      await api.addAvailability({ ...f, injury_id: f.injury_id || null, next_followup_date: f.next_followup_date || null } as Partial<Availability>);
      toast.success('Availability updated'); onSaved();
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} title="Update Player Availability" size="lg" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={save}>Save Update</Button></>}>
      <div className="space-y-4">
        <Field label="Player" required><PlayerPicker value={f.player_id} onChange={(v) => setF({ ...f, player_id: v })} /></Field>
        <Grid>
          <Field label="Training availability" required><Select value={f.availability} onChange={(e) => setF({ ...f, availability: e.target.value })} options={AVAILABILITY} /></Field>
          <Field label="Medical status" required><Select value={f.medical_status} onChange={(e) => setF({ ...f, medical_status: e.target.value })} options={MEDICAL_STATUSES} /></Field>
          <Field label="Effective date"><Input type="date" value={f.effective_date} onChange={(e) => setF({ ...f, effective_date: e.target.value })} /></Field>
          <Field label="Next follow-up"><Input type="date" value={f.next_followup_date} onChange={(e) => setF({ ...f, next_followup_date: e.target.value })} /></Field>
        </Grid>
        <Field label="Training restrictions (visible to coach & manager)"><Textarea rows={2} value={f.restrictions} onChange={(e) => setF({ ...f, restrictions: e.target.value })} /></Field>
        <Field label="Note for coaching staff"><Input value={f.staff_notes} onChange={(e) => setF({ ...f, staff_notes: e.target.value })} /></Field>
        <Field label="Internal medical note (medical team only)"><Textarea rows={2} value={f.internal_notes} onChange={(e) => setF({ ...f, internal_notes: e.target.value })} /></Field>
        {openInj.length > 0 && <Field label="Related injury"><Select value={f.injury_id} onChange={(e) => setF({ ...f, injury_id: e.target.value })} options={openInj.map((i) => ({ value: i.id, label: `${i.injury_code} – ${i.body_region}` }))} placeholder="None" /></Field>}
        <Checkbox label="Approve and share with coach & manager" checked={f.shared_with_staff} onChange={(v) => setF({ ...f, shared_with_staff: v })} description="If unticked, staff continue to see the previous approved status." />
      </div>
    </Modal>
  );
}
