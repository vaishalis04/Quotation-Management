import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as api from '../api/endpoints';
import { downloadFrom } from '../api/client';
import { NATIVE_LABEL } from '../api/preview';
import { useAuth } from '../context/AuthContext';
import { useMeta } from '../context/MetaContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../utils/hooks';
import { inr, fmtDate, cap } from '../utils/format';
import { StatusBadge, Spinner, ErrorBox } from '../components/ui';
import PreviewFrame from '../components/PreviewFrame';
import TotalsPanel from '../components/TotalsPanel';

const STATUS_LABEL = { sent: 'Mark as sent', accepted: 'Mark accepted', rejected: 'Mark rejected', expired: 'Mark expired', cancelled: 'Cancel quotation' };
const ASK_REASON = ['rejected', 'cancelled'];

// the saved quotation -> the same shape TotalsPanel shows while building
const calcFromQuotation = (q) => ({
  supply_type: q.supply_type, gst_treatment: q.gst_treatment, tax_summary: q.tax_summary || [],
  totals: {
    items_gross: q.items_gross, line_discount_total: q.line_discount_total, overall_discount: q.overall_discount,
    charges_taxable: q.charges.reduce((a, c) => a + c.taxable_amount, 0), taxable_amount: q.taxable_amount,
    cgst_amount: q.cgst_amount, sgst_amount: q.sgst_amount, igst_amount: q.igst_amount, round_off: q.round_off,
    grand_total: q.grand_total, amount_in_words: q.amount_in_words,
  },
});

export default function QuotationView() {
  const { id } = useParams();
  const nav = useNavigate();
  const { notify } = useToast();
  const { user, canManage } = useAuth();
  const { constants, states } = useMeta();

  const quotation = useAsync(() => api.quotations.get(id), [id]);
  const layouts = useAsync(() => api.layouts.list({}), []);
  const [tab, setTab] = useState('design');
  const [templateId, setTemplateId] = useState('');
  const [native, setNative] = useState(null); // what the layout produces: docx | xlsx | html
  const [busy, setBusy] = useState('');
  const [error, setError] = useState(null);

  const q = quotation.data;
  if (quotation.loading && !q) return <Spinner />;
  if (quotation.error) return <ErrorBox error={quotation.error} />;
  if (!q) return null;

  const mine = canManage || String(q.created_by) === String(user.id);
  const next = (constants?.status_transitions?.[q.status] || []);
  const canRevise = mine && q.is_latest && ['sent', 'rejected', 'expired'].includes(q.status);

  const act = async (label, fn, after) => {
    setBusy(label); setError(null);
    try { const r = await fn(); after ? after(r) : quotation.reload(); } catch (e) { setError(e); } finally { setBusy(''); }
  };

  const changeStatus = (status) => {
    let reason;
    if (ASK_REASON.includes(status)) { reason = window.prompt(`Reason for marking this ${status} (optional):`) ?? undefined; if (reason === undefined) return; }
    act('status', () => api.quotations.setStatus(q.id, status, reason || undefined), () => { notify(`Marked ${status}`); quotation.reload(); });
  };

  // ---- design downloads
  const query = templateId ? { templateId } : {};
  const nativeExt = native && native !== 'file' ? native : 'file';
  const download = (output) => act(`dl-${output}`, async () => {
    const name = await downloadFrom(`/quotations/${q.id}/render`, { query: output === 'pdf' ? { ...query, output: 'pdf' } : query },
      `${q.display_number.replace(/[^\w.-]+/g, '-')}.${output === 'pdf' ? 'pdf' : nativeExt}`);
    notify(`Downloaded ${name}`);
  }, () => {});

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{q.display_number} <StatusBadge status={q.status} /></h1>
          <p className="muted">{q.customer?.name || q.customer_snapshot?.name} · {fmtDate(q.quote_date)}{q.valid_until ? ` · valid until ${fmtDate(q.valid_until)}` : ''} · <strong>₹{inr(q.grand_total)}</strong></p>
        </div>
        <div className="actions">
          {mine && q.status === 'draft' && <Link className="btn" to={`/quotations/${q.id}/edit`}>Edit</Link>}
          {mine && next.map((s) => (
            <button key={s} className={`btn ${s === 'sent' || s === 'accepted' ? 'primary' : s === 'cancelled' || s === 'rejected' ? 'danger-outline' : ''}`}
              disabled={!!busy} onClick={() => changeStatus(s)}>{STATUS_LABEL[s] || cap(s)}</button>
          ))}
          {canRevise && <button className="btn" disabled={!!busy} onClick={() => act('revise', () => api.quotations.revise(q.id), (n) => { notify(`Revision ${n.display_number} created`); nav(`/quotations/${n.id}/edit`); })}>Create revision</button>}
          <button className="btn" disabled={!!busy} onClick={() => act('dup', () => api.quotations.duplicate(q.id), (n) => { notify(`Copied as ${n.display_number}`); nav(`/quotations/${n.id}`); })}>Duplicate</button>
          {mine && q.status === 'draft' && <button className="btn danger-outline" disabled={!!busy} onClick={() => window.confirm('Delete this draft?') && act('del', () => api.quotations.remove(q.id), () => { notify('Draft deleted'); nav('/quotations'); })}>Delete</button>}
        </div>
      </div>
      <ErrorBox error={error} />

      <div className="tabs" role="tablist">
        {['design', 'details', 'versions', 'activity'].map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{cap(t)}</button>
        ))}
      </div>

      {tab === 'design' && (
        <section className="card">
          <div className="download-bar">
            <label className="inline">
              <span className="label">Design</span>
              <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)} aria-label="Design">
                <option value="">{q.template_id ? 'Saved on this quotation' : 'Company default'}</option>
                {(layouts.data || []).map((l) => <option key={l.id} value={l.id}>{l.name} ({l.format})</option>)}
              </select>
            </label>
            <div className="actions">
              <button className="btn primary" disabled={!!busy} onClick={() => download('native')}>
                {busy === 'dl-native' ? 'Preparing…' : `⬇ Download ${native ? NATIVE_LABEL[native] : 'file'}`}
              </button>
              <button className="btn" disabled={!!busy} onClick={() => download('pdf')}>{busy === 'dl-pdf' ? 'Preparing…' : '⬇ Download PDF'}</button>
            </div>
          </div>
          <PreviewFrame path={`/quotations/${q.id}/render`} query={query} onLoaded={(info) => setNative(info.native)} onDownloadNative={() => download('native')} />
          <p className="muted small">The preview is rendered by the server from your uploaded design, so it matches the downloaded file.</p>
        </section>
      )}

      {tab === 'details' && (
        <div className="two-col">
          <section className="card col-main">
            <h3>Items</h3>
            <div className="scroll-x">
              <table className="table">
                <thead><tr><th>#</th><th>Description</th><th>HSN/SAC</th><th className="r">Qty</th><th className="r">Rate</th><th className="r">Discount</th><th className="r">Taxable</th><th className="r">GST %</th><th className="r">Total</th></tr></thead>
                <tbody>
                  {q.items.map((l) => (
                    <tr key={l.id}>
                      <td>{l.line_no}</td>
                      <td><strong>{l.name}</strong>{l.description && <div className="muted small">{l.description}</div>}</td>
                      <td>{l.hsn_sac}</td><td className="r">{l.quantity} {l.unit}</td><td className="r">{inr(l.rate)}</td>
                      <td className="r">{inr(l.line_discount + l.overall_discount_share)}</td><td className="r">{inr(l.taxable_amount)}</td>
                      <td className="r">{l.gst_rate}</td><td className="r">{inr(l.line_total)}</td>
                    </tr>
                  ))}
                  {q.charges.map((l) => (
                    <tr key={`c${l.id}`}><td>+</td><td>{l.name}</td><td>{l.hsn_sac}</td><td /><td /><td /><td className="r">{inr(l.taxable_amount)}</td><td className="r">{l.gst_rate}</td><td className="r">{inr(l.line_total)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            {q.terms && <><h3>Terms & conditions</h3><ol className="terms">{q.terms.split(/\r?\n/).filter(Boolean).map((t, i) => <li key={i}>{t}</li>)}</ol></>}
          </section>
          <aside className="col-side"><div className="card"><h3>Totals</h3>
            <TotalsPanel calc={calcFromQuotation(q)} stateName={states.find((s) => s.code === q.place_of_supply_state_code)?.name} /></div></aside>
        </div>
      )}

      {tab === 'versions' && <Versions id={q.id} />}
      {tab === 'activity' && <Activity id={q.id} />}
    </>
  );
}

function Versions({ id }) {
  const { data, loading, error } = useAsync(() => api.quotations.versions(id), [id]);
  if (loading) return <Spinner />;
  return (
    <section className="card"><ErrorBox error={error} />
      <table className="table"><thead><tr><th>Version</th><th>Number</th><th>Status</th><th>Date</th><th className="r">Total</th></tr></thead>
        <tbody>{(data || []).map((v) => (
          <tr key={v.id}><td>{v.version}{v.is_latest ? ' (latest)' : ''}</td><td><Link to={`/quotations/${v.id}`}>{v.version > 1 ? `${v.quote_number}-R${v.version - 1}` : v.quote_number}</Link></td>
            <td><StatusBadge status={v.status} /></td><td>{fmtDate(v.quote_date)}</td><td className="r">{inr(v.grand_total)}</td></tr>
        ))}</tbody></table>
    </section>
  );
}

function Activity({ id }) {
  const { data, loading, error } = useAsync(() => api.quotations.activity(id), [id]);
  if (loading) return <Spinner />;
  return (
    <section className="card"><ErrorBox error={error} />
      <table className="table"><thead><tr><th>When</th><th>Action</th><th>By</th></tr></thead>
        <tbody>{(data || []).map((a) => (
          <tr key={a.id}><td>{new Date(a.created_at).toLocaleString()}</td><td>{a.action.replace('status:', 'marked ')}</td><td>{a.performer?.name || '—'}</td></tr>
        ))}</tbody></table>
    </section>
  );
}
