import { uid } from './format';

export const blankRow = () => ({
  key: uid(), item_id: '', name: '', description: '', hsn_sac: '', unit: 'Nos', quantity: '1', rate: '',
  discount_type: '', discount_value: '', gst_rate: '18', section: '', specs: [],
  product_id: '', brand_id: '', category_id: '', no_company: false, brand: '',
});
export const blankCharge = () => ({ key: uid(), name: '', amount: '', gst_rate: '18', hsn_sac: '' });

const hasValue = (v) => v !== '' && v !== null && v !== undefined;
const n = (v) => Number(v);

export const isRowFilled = (r) => !!r.name.trim() && hasValue(r.quantity) && hasValue(r.rate);
export const isChargeFilled = (c) => !!c.name.trim() && hasValue(c.amount);

/**
 * Turns the form state into the API body. Returns null while it is not complete enough to calculate
 * (no customer, or no complete item row). `editing` matters because an UPDATE must send explicit nulls to clear fields.
 * The body is used for BOTH /quotations/calculate and save, so the preview and the saved quotation can never differ.
 */
export function buildPayload(form, rows, charges, { editing = false } = {}) {
  if (!form.customer_id) return null;
  const items = rows.filter(isRowFilled).map((r) => ({
    ...(r.item_id ? { item_id: r.item_id } : {}),
    name: r.name.trim(),
    ...(r.brand ? { brand: r.brand } : {}),
    description: r.description,
    hsn_sac: r.hsn_sac,
    unit: r.unit,
    section: r.section,
    // custom labels; always sent so removing them all on a row really clears them
    specs: (r.specs || []).filter((s) => s.label && s.label.trim()).map((s) => ({ label: s.label.trim(), value: (s.value || '').trim() })),
    quantity: n(r.quantity),
    rate: n(r.rate),
    gst_rate: n(r.gst_rate),
    ...(r.discount_type && hasValue(r.discount_value) ? { discount_type: r.discount_type, discount_value: n(r.discount_value) } : {}),
  }));
  if (items.length === 0) return null;

  const payload = {
    customer_id: form.customer_id,
    quote_date: form.quote_date,
    subject: form.subject,
    reference_no: form.reference_no,
    kind_attention: form.kind_attention,
    gst_treatment: form.gst_treatment,
    price_mode: form.price_mode,
    round_off: !!form.round_off,
    notes: form.notes,
    items,
    charges: charges.filter(isChargeFilled).map((c) => ({
      name: c.name.trim(), amount: n(c.amount), gst_rate: n(c.gst_rate), hsn_sac: c.hsn_sac,
    })),
    discount_type: form.discount_type && hasValue(form.discount_value) ? form.discount_type : null,
    discount_value: form.discount_type && hasValue(form.discount_value) ? n(form.discount_value) : null,
  };

  // optional fields: omitted on create (the server applies its defaults), sent as null/'' on edit so they can be cleared
  if (form.valid_until) payload.valid_until = form.valid_until; else if (editing) payload.valid_until = null;
  if (form.place_of_supply_state_code) payload.place_of_supply_state_code = form.place_of_supply_state_code; else if (editing) payload.place_of_supply_state_code = null;
  if (form.template_id) payload.template_id = form.template_id; else if (editing) payload.template_id = null;
  if (form.terms.trim() || editing) payload.terms = form.terms;
  return payload;
}

// existing quotation (API shape) -> form state
export function formFromQuotation(q) {
  const rows = q.items.map((l) => ({
    key: uid(), item_id: l.item_id ? String(l.item_id) : '', name: l.name, description: l.description || '', hsn_sac: l.hsn_sac || '', unit: l.unit || 'Nos',
    quantity: String(l.quantity), rate: String(l.rate), discount_type: l.discount_type || '',
    discount_value: l.discount_value === null || l.discount_value === undefined ? '' : String(l.discount_value),
    gst_rate: String(l.gst_rate), section: l.section || '',
    specs: Array.isArray(l.specs) ? l.specs.map((s) => ({ label: s.label || '', value: s.value || '' })) : [],
    product_id: '', brand_id: '', category_id: '', no_company: false, brand: l.brand || '',
  }));
  const charges = q.charges.map((c) => ({ key: uid(), name: c.name, amount: String(c.rate), gst_rate: String(c.gst_rate), hsn_sac: c.hsn_sac || '' }));
  const form = {
    customer_id: String(q.customer_id), quote_date: q.quote_date, valid_until: q.valid_until || '', subject: q.subject || '',
    reference_no: q.reference_no || '', kind_attention: q.kind_attention || '', place_of_supply_state_code: q.place_of_supply_state_code || '',
    gst_treatment: q.gst_treatment, price_mode: q.price_mode, round_off: q.round_off_enabled,
    discount_type: q.discount_type || '', discount_value: q.discount_value === null || q.discount_value === undefined ? '' : String(q.discount_value),
    terms: q.terms || '', notes: q.notes || '', template_id: q.template_id ? String(q.template_id) : '',
  };
  return { form, rows: rows.length ? rows : [blankRow()], charges };
}

// Instant, per-line figures shown while the server is still calculating (the saved/printed figures always come from the server).
// Covers qty x rate, line discount, GST and price mode. The overall discount is applied by the server a moment later.
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
export function estimateLine(r, { gst_treatment: treatment, price_mode: mode } = {}) {
  if (!hasValue(r.quantity) || !hasValue(r.rate)) return null;
  const q = n(r.quantity); const rate = n(r.rate);
  if (!Number.isFinite(q) || !Number.isFinite(rate)) return null;
  const gross = round2(q * rate);
  let disc = 0;
  if (r.discount_type && hasValue(r.discount_value)) disc = r.discount_type === 'percent' ? (gross * n(r.discount_value)) / 100 : n(r.discount_value);
  disc = Math.min(Math.max(Number.isFinite(disc) ? disc : 0, 0), gross);
  const net = gross - disc;
  const taxed = treatment !== 'no_gst';
  const g = taxed ? n(r.gst_rate) || 0 : 0;
  const inclusive = mode === 'inclusive' && taxed;
  const taxable = inclusive ? net / (1 + g / 100) : net;
  const total = inclusive ? net : taxable * (1 + g / 100);
  return { taxable_amount: round2(taxable), line_total: round2(total) };
}
