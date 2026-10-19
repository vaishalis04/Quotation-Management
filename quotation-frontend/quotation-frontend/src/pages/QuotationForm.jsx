import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as api from '../api/endpoints';
import { useMeta } from '../context/MetaContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAsync, useDebounced } from '../utils/hooks';
import { today, addDays, inr } from '../utils/format';
import { blankRow, blankCharge, buildPayload, formFromQuotation, isRowFilled, estimateLine } from '../utils/quotationPayload';
import { ErrorBox, Spinner, Field } from '../components/ui';
import ProductPicker, { matchByName } from '../components/ProductPicker';
import CustomerModal from '../components/CustomerModal';
import SpecsEditor, { DEFAULT_SPEC_LABELS } from '../components/SpecsEditor';
import TotalsPanel from '../components/TotalsPanel';

const emptyForm = () => ({
  customer_id: '', quote_date: today(), valid_until: addDays(today(), 15), subject: '', reference_no: '', kind_attention: '',
  place_of_supply_state_code: '', gst_treatment: 'regular', price_mode: 'exclusive', round_off: true,
  discount_type: '', discount_value: '', terms: '', notes: '', template_id: '',
  header_text: '', footer_text: '', client_ids: [], gst_scope: 'item', overall_gst_rate: '18',
  letter_text: '', header_image_id: '', footer_image_id: '',
});

const NONE_PRODUCTS = []; // stable empty list while the product masters load
const MASTERS_PATH = '/catalogue-masters'; // <- the route where CatalogueMasters is mounted in your router

export default function QuotationForm() {
  const { id } = useParams();
  const editing = !!id;
  const nav = useNavigate();
  const { notify } = useToast();
  const { states } = useMeta();
  const { canManage } = useAuth();

  const [form, setForm] = useState(emptyForm);
  const [rows, setRows] = useState([blankRow()]);
  const [charges, setCharges] = useState([]);
  const [customerLabel, setCustomerLabel] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [newCustomer, setNewCustomer] = useState(false);
  const [calc, setCalc] = useState(null);
  const [calcKey, setCalcKey] = useState(''); // the payload the current `calc` belongs to
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
  const clientMasters = useAsync(() => api.clientMasters.list({}), []); // "Our clients" master
  const descMasters = useAsync(() => api.descriptionMasters.list({}), []); // saved descriptions master
  const letterMasters = useAsync(() => api.letterMasters.list({}), []); // saved covering letters
  const letterheads = useAsync(() => api.letterheads.list({}), []); // wide header / footer images
  const tree = useAsync(() => api.catalogueMasters.tree(), []); // Product masters: Product -> Company -> Category
  const chargeMaster = useAsync(() => api.charges.list({}), []); // saved additional charges
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
  // custom-label suggestions
  const specSuggestions = DEFAULT_SPEC_LABELS;
  // a customer created from this screen is saved to Customers and selected straight away
  const onCustomerSaved = (c) => {
    setForm((f) => ({ ...f, customer_id: String(c.id) }));
    setCustomerLabel(c.name); setCustomerSearch('');
    customers.reload();
    notify(`Customer ${c.name} added and selected`);
  };

  // pick a saved charge: it becomes a normal, fully editable charge row
  const addSavedCharge = (chargeId) => {
    const c = (chargeMaster.data || []).find((x) => String(x.id) === String(chargeId));
    if (!c) return;
    setCharges((x) => [...x, { ...blankCharge(), name: c.name, hsn_sac: c.hsn_sac || '', amount: String(Number(c.default_amount)), gst_rate: String(Number(c.gst_rate)) }]);
  };

  // tick / untick a client from the client master
  const toggleClient = (cid) => setForm((f) => {
    const s = String(cid);
    const has = f.client_ids.map(String).includes(s);
    return { ...f, client_ids: has ? f.client_ids.filter((x) => String(x) !== s) : [...f.client_ids, s] };
  });

  // pick a saved letter: placeholders are filled from the form, then the text stays freely editable
  const pickLetter = (letterId) => {
    const l = (letterMasters.data || []).find((x) => String(x.id) === String(letterId));
    if (!l) return;
    const cust = (customers.data?.customers || []).find((c) => String(c.id) === String(form.customer_id));
    const [y, m, d] = String(form.quote_date || '').split('-');
    const vars = { customer: cust?.name || customerLabel || '', attention: form.kind_attention || '', subject: form.subject || '', date: y ? `${d}-${m}-${y}` : '' };
    const text = Object.entries(vars).reduce((t, [k, v]) => t.split(`{{${k}}}`).join(v), l.content);
    setForm((f) => ({ ...f, letter_text: text }));
  };

  // ---- live totals: the SAME body that will be saved is sent to /calculate (debounced)
  // editing: lines of a saved quotation only keep their printed name - show the matching product / company / category again
  useEffect(() => {
    const products = tree.data?.products;
    if (!products || !existing.data) return;
    setRows((rs) => rs.map((r) => {
      if (r.product_id || !r.name) return r;
      const m = matchByName(products, r.name);
      return m ? { ...r, ...m, brand: r.brand || m.brand } : r;
    }));
  }, [tree.data, existing.data]);

  const payload = useMemo(() => buildPayload(form, rows, charges, { editing }), [form, rows, charges, editing]);
  const payloadKey = JSON.stringify(payload);
  useEffect(() => {
    if (!payload) { setCalc(null); setCalcKey(''); setCalcError(null); return undefined; }
    const my = ++seq.current;
    const t = setTimeout(async () => {
      setCalculating(true);
      try {
        const r = await api.quotations.calculate(payload);
        if (my === seq.current) { setCalc(r); setCalcKey(payloadKey); setCalcError(null); }
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
  // GST on the overall total: one rate for the whole quotation, so the per-line GST pickers are hidden
  const overall = form.gst_treatment === 'regular' && form.gst_scope === 'overall';

  const headerImages = (letterheads.data || []).filter((x) => x.kind === 'header');
  const footerImages = (letterheads.data || []).filter((x) => x.kind === 'footer');
  const headerPreview = headerImages.find((x) => String(x.id) === String(form.header_image_id));
  const footerPreview = footerImages.find((x) => String(x.id) === String(form.footer_image_id));

  const filledRows = rows.filter(isRowFilled);
  // server figures when they belong to what is on screen; otherwise an instant estimate so qty / rate changes show at once
  const lineCalc = (r) => {
    const i = filledRows.indexOf(r);
    if (i >= 0 && calc && calcKey === payloadKey && calc.items[i]) return calc.items[i];
    return isRowFilled(r) ? estimateLine(overall ? { ...r, gst_rate: form.overall_gst_rate } : r, form) : null;
  };
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
                <span className="hint">Not in the list? <button type="button" className="btn sm" onClick={() => setNewCustomer(true)}>+ New customer</button></span>
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
              {form.gst_treatment === 'regular' && (
                <Field label="GST applied">
                  <select className="input" value={form.gst_scope} onChange={set('gst_scope')}>
                    <option value="item">On each item</option>
                    <option value="overall">On the overall total</option>
                  </select>
                </Field>
              )}
              {overall && (
                <Field label="GST % on total">
                  <select className="input" value={form.overall_gst_rate} onChange={set('overall_gst_rate')}>
                    {rateOptions(form.overall_gst_rate).map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </Field>
              )}
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

          {/* ---------- header & footer (optional) */}
          <section className="card">
            <h3>Header & footer <span className="muted small">· optional</span></h3>
            <div className="grid2">
              <Field label="Header image (printed on every page)" hint="Wide image, uploaded under Masters › Header/Footer images.">
                <select className="input" value={form.header_image_id} onChange={set('header_image_id')} aria-label="Header image">
                  <option value="">No header image</option>
                  {headerImages.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                {headerPreview?.data_url && <img src={headerPreview.data_url} alt="Header preview" style={{ maxWidth: '100%', maxHeight: 70, marginTop: 6 }} />}
              </Field>
              <Field label="Footer image (printed on every page)">
                <select className="input" value={form.footer_image_id} onChange={set('footer_image_id')} aria-label="Footer image">
                  <option value="">No footer image</option>
                  {footerImages.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                {footerPreview?.data_url && <img src={footerPreview.data_url} alt="Footer preview" style={{ maxWidth: '100%', maxHeight: 70, marginTop: 6 }} />}
              </Field>
              <Field label="Header text (top of quotation)" wide hint="Leave empty to print no header text.">
                <textarea className="input" rows={2} value={form.header_text} onChange={set('header_text')} />
              </Field>
              <Field label="Footer text (bottom of quotation)" wide hint="Leave empty to print no footer text.">
                <textarea className="input" rows={2} value={form.footer_text} onChange={set('footer_text')} />
              </Field>
            </div>
            {canManage && <Link to={`${MASTERS_PATH}?tab=letterheads`} className="small">Manage header / footer images</Link>}
          </section>

          {/* ---------- covering letter (optional) */}
          <section className="card">
            <h3>Letter <span className="muted small">· optional, printed before the items</span></h3>
            {(letterMasters.data || []).length > 0 && (
              <select className="input mb" value="" onChange={(e) => pickLetter(e.target.value)} aria-label="Saved letter">
                <option value="">— load a saved letter —</option>
                {letterMasters.data.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
              </select>
            )}
            <Field label="Letter text" wide hint="Leave empty to print no letter. Placeholders {{customer}} {{attention}} {{subject}} {{date}} are filled when you load a saved letter.">
              <textarea className="input" rows={7} value={form.letter_text} onChange={set('letter_text')} placeholder={'Dear Sir,\n\nWith reference to your enquiry...'} />
            </Field>
            {canManage && <Link to={`${MASTERS_PATH}?tab=letters`} className="small">Manage saved letters</Link>}
          </section>

          {/* ---------- our clients (printed before the items) */}
          <section className="card">
            <h3>Our clients <span className="muted small">· optional, printed before the items</span></h3>
            {(clientMasters.data || []).length === 0 ? (
              <span className="hint">No clients saved yet{canManage ? ' — add them under Clients.' : '.'}</span>
            ) : (
              <div className="inline wrap">
                {clientMasters.data.map((c) => (
                  <label key={c.id} className="check-inline">
                    <input type="checkbox" checked={form.client_ids.map(String).includes(String(c.id))} onChange={() => toggleClient(c.id)} /> {c.name}{c.location ? ` (${c.location})` : ''}
                  </label>
                ))}
              </div>
            )}
            {canManage && <Link to={`${MASTERS_PATH}?tab=clients`} className="small">Manage clients</Link>}
          </section>

          {/* ---------- items */}
          <section className="card">
            <h3>Items</h3>
            <div className="scroll-x">
              <table className="table items-table">
                <thead>
                  <tr><th style={{ width: 28 }}>#</th><th style={{ minWidth: 240 }}>Item</th><th>HSN/SAC</th><th>Qty</th><th>Unit</th><th>Rate</th>
                    <th>Discount</th>{!overall && <th>GST %</th>}<th className="r">Taxable</th><th className="r">Total</th><th /></tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const lc = lineCalc(r);
                    return (
                      <tr key={r.key}>
                        <td>{i + 1}</td>
                        <td>
                          <ProductPicker tree={tree.data?.products || NONE_PRODUCTS} row={r} onChange={(patch) => updateRow(r.key, patch)} />
                          <input className="input sm mt" placeholder="Description / specification (optional)" value={r.description} onChange={(e) => updateRow(r.key, { description: e.target.value })} aria-label="Description" />
                          {(descMasters.data || []).length > 0 && (
                            <select className="input sm mt" value="" aria-label="Saved description"
                              onChange={(e) => { const d = descMasters.data.find((x) => String(x.id) === e.target.value); if (d) updateRow(r.key, { description: d.content }); }}>
                              <option value="">— saved description —</option>
                              {descMasters.data.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                            </select>
                          )}
                          <SpecsEditor compact value={r.specs} onChange={(v) => updateRow(r.key, { specs: v })} suggestions={specSuggestions} />
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
                        {!overall && (
                          <td>
                            <select className="input w70" value={r.gst_rate} onChange={(e) => updateRow(r.key, { gst_rate: e.target.value })} disabled={form.gst_treatment === 'no_gst'} aria-label="GST rate">
                              {rateOptions(r.gst_rate).map((g) => <option key={g} value={g}>{g}</option>)}
                            </select>
                          </td>
                        )}
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
            <p className="muted small">
              {overall
                ? 'Charges such as freight or installation are taxed at the same overall GST rate and are not discounted.'
                : 'Charges such as freight or installation are taxed with their own rate and are not discounted.'}
            </p>
            {charges.map((c) => (
              <div className="inline mb" key={c.key}>
                <input className="input grow" placeholder="Charge name (e.g. Installation)" value={c.name} onChange={(e) => updateCharge(c.key, { name: e.target.value })} aria-label="Charge name" />
                <input className="input w90" placeholder="HSN/SAC" value={c.hsn_sac} onChange={(e) => updateCharge(c.key, { hsn_sac: e.target.value })} aria-label="Charge HSN" />
                <input className="input w100" type="number" min="0" step="any" placeholder="Amount" value={c.amount} onChange={(e) => updateCharge(c.key, { amount: e.target.value })} aria-label="Charge amount" />
                {!overall && (
                  <select className="input w70" value={c.gst_rate} onChange={(e) => updateCharge(c.key, { gst_rate: e.target.value })} disabled={form.gst_treatment === 'no_gst'} aria-label="Charge GST">
                    {rateOptions(c.gst_rate).map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                )}
                <button className="btn ghost sm" onClick={() => setCharges((x) => x.filter((y) => y.key !== c.key))} aria-label="Remove charge">✕</button>
              </div>
            ))}
            <div className="inline">
              <select className="input" style={{ width: "auto", minWidth: 260 }} value="" onChange={(e) => addSavedCharge(e.target.value)} aria-label="Pick saved charge">
                <option value="">— choose a saved charge —</option>
                {(chargeMaster.data || []).map((c) => <option key={c.id} value={c.id}>{c.name} · ₹{inr(c.default_amount)} · {Number(c.gst_rate)}%</option>)}
              </select>
              <button className="btn" onClick={() => setCharges((x) => [...x, blankCharge()])}>+ Add charge</button>
              {canManage && <Link to="/charges" className="small">Manage saved charges</Link>}
            </div>
            {chargeMaster.data?.length === 0 && <span className="hint">No saved charges yet{canManage ? ' — create them under Charges.' : '.'}</span>}
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
      {newCustomer && <CustomerModal onSaved={onCustomerSaved} onClose={() => setNewCustomer(false)} />}
    </>
  );
}