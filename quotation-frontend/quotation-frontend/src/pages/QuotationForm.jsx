import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as api from '../api/endpoints';
import { useMeta } from '../context/MetaContext';
import { useToast } from '../context/ToastContext';
import { useAsync, useDebounced } from '../utils/hooks';
import { today, addDays, inr } from '../utils/format';
import { blankRow, blankCharge, buildPayload, formFromQuotation, isRowFilled } from '../utils/quotationPayload';
import { ErrorBox, Spinner, Field } from '../components/ui';
import ItemPicker from '../components/ItemPicker';
import TotalsPanel from '../components/TotalsPanel';

const emptyForm = () => ({
  customer_id: '', quote_date: today(), valid_until: addDays(today(), 15), subject: '', reference_no: '', kind_attention: '',
  place_of_supply_state_code: '', gst_treatment: 'regular', price_mode: 'exclusive', round_off: true,
  discount_type: '', discount_value: '', terms: '', notes: '', template_id: '',
});

export default function QuotationForm() {
  const { id } = useParams();
  const editing = !!id;
  const nav = useNavigate();
  const { notify } = useToast();
  const { states } = useMeta();

  const [form, setForm] = useState(emptyForm);
  const [rows, setRows] = useState([blankRow()]);
  const [charges, setCharges] = useState([]);
  const [customerLabel, setCustomerLabel] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [calc, setCalc] = useState(null);
  const [calcError, setCalcError] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const seq = useRef(0);

  // ---- data for dropdowns
  const cs = useDebounced(customerSearch);
  const customers = useAsync(() => api.customers.list({ q: cs, limit: 50 }), [cs]);
  const layouts = useAsync(() => api.layouts.list({}), []);
  const termsList = useAsync(() => api.terms.list({}), []);
  const rates = useAsync(() => api.meta.gstRates(form.quote_date), [form.quote_date]);

  // ---- editing: load the quotation into the form
  const existing = useAsync(() => (editing ? api.quotations.get(id) : Promise.resolve(null)), [id]);
  useEffect(() => {
    const q = existing.data;
    if (!q) return;
    const loaded = formFromQuotation(q);
    setForm(loaded.form); setRows(loaded.rows); setCharges(loaded.charges);
    setCustomerLabel(q.customer?.name || q.customer_snapshot?.name || '');
  }, [existing.data]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const updateRow = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const updateCharge = (key, patch) => setCharges((cs2) => cs2.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const pickItem = (key, it) => updateRow(key, {
    item_id: String(it.id), name: it.name, description: it.description || '', hsn_sac: it.hsn_sac || '', unit: it.unit || 'Nos',
    rate: String(Number(it.rate)), gst_rate: String(Number(it.gst_rate)), section: it.category || '',
  });

  // ---- live totals: the SAME body that will be saved is sent to /calculate (debounced)
  const payload = useMemo(() => buildPayload(form, rows, charges, { editing }), [form, rows, charges, editing]);
  const payloadKey = JSON.stringify(payload);
  useEffect(() => {
    if (!payload) { setCalc(null); setCalcError(null); return undefined; }
    const my = ++seq.current;
    const t = setTimeout(async () => {
      setCalculating(true);
      try {
        const r = await api.quotations.calculate(payload);
        if (my === seq.current) { setCalc(r); setCalcError(null); }
      } catch (e) {
        if (my === seq.current) { setCalc(null); setCalcError(e); }
      } finally {
        if (my === seq.current) setCalculating(false);
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadKey]);

  const save = async () => {
    setSaving(true); setSaveError(null);
    try {
      const saved = editing ? await api.quotations.update(id, payload) : await api.quotations.create(payload);
      notify(editing ? 'Quotation updated' : `Quotation ${saved.display_number} created`);
      nav(`/quotations/${saved.id}`);
    } catch (e) { setSaveError(e); } finally { setSaving(false); }
  };

  const rateOptions = (current) => {
    const list = rates.data?.rates || [0, 5, 18, 40];
    const cur = Number(current);
    return list.includes(cur) || Number.isNaN(cur) ? list : [...list, cur].sort((a, b) => a - b);
  };
  const filledRows = rows.filter(isRowFilled);
  const lineCalc = (r) => { const i = filledRows.indexOf(r); return i >= 0 && calc ? calc.items[i] : null; };
  const stateName = states.find((s) => s.code === calc?.place_of_supply_state_code)?.name;

  if (editing && existing.loading) return <Spinner />;
  if (editing && existing.error) return <ErrorBox error={existing.error} />;
  if (editing && existing.data && existing.data.status !== 'draft') {
    return <div className="notice">Only drafts can be edited. <Link to={`/quotations/${id}`}>Open the quotation</Link> and use “Create revision”.</div>;
  }

  const custOptions = customers.data?.customers || [];
  const hasSelected = custOptions.some((c) => String(c.id) === String(form.customer_id));

  return (
    <>
      <div className="page-head">
        <h1>{editing ? `Edit ${existing.data?.display_number || ''}` : 'New quotation'}</h1>
      </div>

      <div className="two-col">
        <div className="col-main">
          {/* ---------- customer & details */}
          <section className="card">
            <h3>Customer & details</h3>
            <div className="grid2">
              <Field label="Customer *" wide>
                <div className="inline">
                  <input className="input" placeholder="Search customer…" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} aria-label="Search customer" />
                  <select className="input" value={form.customer_id} onChange={set('customer_id')} aria-label="Customer">
                    <option value="">— select —</option>
                    {!hasSelected && form.customer_id && <option value={form.customer_id}>{customerLabel || `Customer #${form.customer_id}`}</option>}
                    {custOptions.map((c) => <option key={c.id} value={c.id}>{c.name}{c.gstin ? ` · ${c.gstin}` : ''}</option>)}
                  </select>
                </div>
                <span className="hint">New customer? <Link to="/customers">Add it first</Link></span>
              </Field>
              <Field label="Quotation date"><input className="input" type="date" value={form.quote_date} onChange={set('quote_date')} /></Field>
              <Field label="Valid until"><input className="input" type="date" value={form.valid_until} onChange={set('valid_until')} /></Field>
              <Field label="Subject" wide><input className="input" value={form.subject} onChange={set('subject')} placeholder="e.g. Supply and installation of CCTV system" /></Field>
              <Field label="Customer reference / enquiry no."><input className="input" value={form.reference_no} onChange={set('reference_no')} /></Field>
              <Field label="Kind attention"><input className="input" value={form.kind_attention} onChange={set('kind_attention')} /></Field>
              <Field label="Place of supply" hint="Leave on Auto to use the customer's state. Decides CGST+SGST or IGST.">
                <select className="input" value={form.place_of_supply_state_code} onChange={set('place_of_supply_state_code')}>
                  <option value="">Auto (customer's state)</option>
                  {states.map((s) => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
                </select>
              </Field>
              <Field label="GST">
                <select className="input" value={form.gst_treatment} onChange={set('gst_treatment')}>
                  <option value="regular">Charge GST</option>
                  <option value="no_gst">No GST (composition / exempt)</option>
                </select>
              </Field>
              <Field label="Prices entered">
                <select className="input" value={form.price_mode} onChange={set('price_mode')}>
                  <option value="exclusive">Excluding GST</option>
                  <option value="inclusive">Including GST</option>
                </select>
              </Field>
              <Field label="Design (layout) for this quotation">
                <select className="input" value={form.template_id} onChange={set('template_id')}>
                  <option value="">Company default</option>
                  {(layouts.data || []).map((l) => <option key={l.id} value={l.id}>{l.name} ({l.format})</option>)}
                </select>
              </Field>
            </div>
          </section>

          {/* ---------- items */}
          <section className="card">
            <h3>Items</h3>
            <div className="scroll-x">
              <table className="table items-table">
                <thead>
                  <tr><th style={{ width: 28 }}>#</th><th style={{ minWidth: 240 }}>Item</th><th>HSN/SAC</th><th>Qty</th><th>Unit</th><th>Rate</th>
                    <th>Discount</th><th>GST %</th><th className="r">Taxable</th><th className="r">Total</th><th /></tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const lc = lineCalc(r);
                    return (
                      <tr key={r.key}>
                        <td>{i + 1}</td>
                        <td>
                          <ItemPicker value={r.name} onType={(v) => updateRow(r.key, { name: v, item_id: '' })} onPick={(it) => pickItem(r.key, it)} />
                          <input className="input sm mt" placeholder="Description / specification (optional)" value={r.description} onChange={(e) => updateRow(r.key, { description: e.target.value })} aria-label="Description" />
                        </td>
                        <td><input className="input w90" value={r.hsn_sac} onChange={(e) => updateRow(r.key, { hsn_sac: e.target.value })} aria-label="HSN/SAC" /></td>
                        <td><input className="input w70" type="number" min="0" step="any" value={r.quantity} onChange={(e) => updateRow(r.key, { quantity: e.target.value })} aria-label="Quantity" /></td>
                        <td><input className="input w70" value={r.unit} onChange={(e) => updateRow(r.key, { unit: e.target.value })} aria-label="Unit" /></td>
                        <td><input className="input w100" type="number" min="0" step="any" value={r.rate} onChange={(e) => updateRow(r.key, { rate: e.target.value })} aria-label="Rate" /></td>
                        <td>
                          <div className="inline nowrap">
                            <select className="input w70" value={r.discount_type} onChange={(e) => updateRow(r.key, { discount_type: e.target.value })} aria-label="Discount type">
                              <option value="">—</option><option value="percent">%</option><option value="amount">₹</option>
                            </select>
                            {r.discount_type && <input className="input w70" type="number" min="0" step="any" value={r.discount_value} onChange={(e) => updateRow(r.key, { discount_value: e.target.value })} aria-label="Discount value" />}
                          </div>
                        </td>
                        <td>
                          <select className="input w70" value={r.gst_rate} onChange={(e) => updateRow(r.key, { gst_rate: e.target.value })} disabled={form.gst_treatment === 'no_gst'} aria-label="GST rate">
                            {rateOptions(r.gst_rate).map((g) => <option key={g} value={g}>{g}</option>)}
                          </select>
                        </td>
                        <td className="r">{lc ? inr(lc.taxable_amount) : '—'}</td>
                        <td className="r"><strong>{lc ? inr(lc.line_total) : '—'}</strong></td>
                        <td><button className="btn ghost sm" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [blankRow()]))} aria-label="Remove item">✕</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button className="btn" onClick={() => setRows((rs) => [...rs, blankRow()])}>+ Add item</button>
          </section>

          {/* ---------- charges & discount */}
          <section className="card">
            <h3>Additional charges & overall discount</h3>
            <p className="muted small">Charges such as freight or installation are taxed with their own rate and are not discounted.</p>
            {charges.map((c) => (
              <div className="inline mb" key={c.key}>
                <input className="input grow" placeholder="Charge name (e.g. Installation)" value={c.name} onChange={(e) => updateCharge(c.key, { name: e.target.value })} aria-label="Charge name" />
                <input className="input w90" placeholder="HSN/SAC" value={c.hsn_sac} onChange={(e) => updateCharge(c.key, { hsn_sac: e.target.value })} aria-label="Charge HSN" />
                <input className="input w100" type="number" min="0" step="any" placeholder="Amount" value={c.amount} onChange={(e) => updateCharge(c.key, { amount: e.target.value })} aria-label="Charge amount" />
                <select className="input w70" value={c.gst_rate} onChange={(e) => updateCharge(c.key, { gst_rate: e.target.value })} disabled={form.gst_treatment === 'no_gst'} aria-label="Charge GST">
                  {rateOptions(c.gst_rate).map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <button className="btn ghost sm" onClick={() => setCharges((x) => x.filter((y) => y.key !== c.key))} aria-label="Remove charge">✕</button>
              </div>
            ))}
            <button className="btn" onClick={() => setCharges((x) => [...x, blankCharge()])}>+ Add charge</button>
            <hr />
            <div className="inline">
              <span className="label">Overall discount</span>
              <select className="input w120" value={form.discount_type} onChange={set('discount_type')} aria-label="Overall discount type">
                <option value="">None</option><option value="percent">Percent %</option><option value="amount">Amount ₹</option>
              </select>
              {form.discount_type && <input className="input w100" type="number" min="0" step="any" value={form.discount_value} onChange={set('discount_value')} aria-label="Overall discount value" />}
              <label className="check-inline"><input type="checkbox" checked={form.round_off} onChange={set('round_off')} /> Round off to nearest rupee</label>
            </div>
          </section>

          {/* ---------- terms */}
          <section className="card">
            <h3>Terms & notes</h3>
            <div className="grid2">
              <Field label="Load a saved terms template">
                <select className="input" value="" onChange={(e) => { const t = (termsList.data || []).find((x) => String(x.id) === e.target.value); if (t) setForm((f) => ({ ...f, terms: t.content })); }}>
                  <option value="">— choose to fill below —</option>
                  {(termsList.data || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <span />
              <Field label="Terms & conditions (one per line)" wide hint={editing ? '' : 'Leave empty to use your default terms.'}>
                <textarea className="input" rows={5} value={form.terms} onChange={set('terms')} />
              </Field>
              <Field label="Internal notes (printed only if your layout shows them)" wide>
                <textarea className="input" rows={2} value={form.notes} onChange={set('notes')} />
              </Field>
            </div>
          </section>
        </div>

        {/* ---------- totals (sticky) */}
        <aside className="col-side">
          <div className="card sticky">
            <h3>Totals {calculating && <span className="muted small">· calculating…</span>}</h3>
            <ErrorBox error={calcError} />
            <TotalsPanel calc={calc} stateName={stateName} />
            <ErrorBox error={saveError} />
            <button className="btn primary block" disabled={!calc || saving || !!calcError} onClick={save}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Save as draft'}
            </button>
            <p className="muted small">Figures are calculated by the server. What you see here is exactly what is saved and printed.</p>
          </div>
        </aside>
      </div>
    </>
  );
}
