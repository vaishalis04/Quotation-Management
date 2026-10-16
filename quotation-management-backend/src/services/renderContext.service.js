/**
 * Builds the data a quotation layout can use. Returns { formatted, raw }:
 *   formatted - every number already a string in Indian format ("1,23,456.00")  -> docx / html layouts
 *   raw       - real numbers                                                      -> xlsx layouts (cells stay numeric)
 * The tag names below are the contract with layout authors - see GET /api/v1/quotation-templates/placeholders.
 */
const path = require('path');
const fs = require('fs');
const { getState } = require('../config/states');
const { formatINR, formatQty, formatPercent, formatDate } = require('../utils/format');
const { specsToText } = require('../utils/specs');

const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));

const joinAddress = (...parts) => parts.filter(Boolean).join(', ');

const logoDataUri = (logo) => {
  try {
    if (!logo) return '';
    const { UPLOAD_DIR } = require('../middleware/upload.middleware');
    const file = path.join(UPLOAD_DIR, logo);
    if (!file.startsWith(UPLOAD_DIR) || !fs.existsSync(file)) return '';
    const ext = path.extname(file).slice(1).toLowerCase().replace('jpg', 'jpeg');
    return `data:image/${ext};base64,${fs.readFileSync(file).toString('base64')}`;
  } catch {
    return '';
  }
};

const build = (q, mode) => {
  const f = mode === 'formatted';
  const money = (v) => (f ? formatINR(num(v)) : num(v));
  const qty = (v) => (f ? formatQty(v) : num(v));
  const pct = (v) => (f ? formatPercent(v) : num(v));
  const date = (v) => (f ? formatDate(v) : v || '');

  const co = q.company_snapshot || {};
  const cu = q.customer_snapshot || {};
  const pos = getState(q.place_of_supply_state_code);
  const coState = getState(co.state_code);
  const isRegular = q.gst_treatment === 'regular';
  const isIntra = isRegular && q.supply_type === 'intra';
  const isInter = isRegular && q.supply_type === 'inter';
  // UTs without a legislature charge UTGST in place of SGST - same amount, different name on the document
  const sgstLabel = isIntra && coState && coState.ut ? 'UTGST' : 'SGST';

  const lines = (q.lines || []).slice().sort((a, b) => (a.line_type === b.line_type ? a.line_no - b.line_no : a.line_type < b.line_type ? -1 : 1));
  const mapLine = (l, i) => ({
    sno: l.line_no,
    section: l.section || '',
    name: l.name,
    description: l.description || '',
    name_description: [l.name, l.description, specsToText(l.specs)].filter(Boolean).join('\n'),
    brand: l.brand || '',
    model_no: l.model_no || '',
    // custom labels: loop with {#specs}{label}: {value}{/specs} (docx) / {{#each specs}} (html), or print them all with specs_text
    specs: Array.isArray(l.specs) ? l.specs.filter((s) => s && s.label).map((s) => ({ label: s.label, value: s.value || '' })) : [],
    specs_text: specsToText(l.specs),
    hsn_sac: l.hsn_sac || '',
    unit: l.unit || '',
    qty: qty(l.quantity),
    rate: money(l.rate),
    gross: money(l.gross_amount),
    // everything taken off this line: its own discount + its share of the overall discount (gross - discount = taxable when prices exclude GST)
    discount: money(num(l.line_discount) + num(l.overall_discount_share)),
    line_discount: money(l.line_discount),
    discount_share: money(l.overall_discount_share),
    discount_percent: l.discount_type === 'percent' ? pct(l.discount_value) : (f ? '' : 0),
    taxable: money(l.taxable_amount),
    gst_rate: pct(l.gst_rate),
    cgst_rate: pct(l.cgst_rate), cgst: money(l.cgst_amount),
    sgst_rate: pct(l.sgst_rate), sgst: money(l.sgst_amount),
    igst_rate: pct(l.igst_rate), igst: money(l.igst_amount),
    tax: money(l.tax_amount),
    total: money(l.line_total),
  });
  const items = lines.filter((l) => l.line_type === 'item').map(mapLine);
  const charges = lines.filter((l) => l.line_type === 'charge').map(mapLine);

  const termLines = String(q.terms || '').split(/\r?\n/).map((t) => t.trim()).filter(Boolean);

  return {
    company: {
      name: co.name || '', legal_name: co.legal_name || co.name || '', gstin: co.gstin || '', pan: co.pan || '',
      phone: co.phone || '', email: co.email || '', website: co.website || '',
      address: co.address || '', city: co.city || '', state: co.state || '', state_code: co.state_code || '', pincode: co.pincode || '',
      full_address: joinAddress(co.address, co.city, co.state, co.pincode),
      bank_name: co.bank_name || '', bank_account_name: co.bank_account_name || '', bank_account_no: co.bank_account_no || '',
      bank_ifsc: co.bank_ifsc || '', bank_branch: co.bank_branch || '', upi_id: co.upi_id || '',
      signatory_name: co.signatory_name || '', signatory_designation: co.signatory_designation || '',
      logo_data_uri: f ? logoDataUri(co.logo) : '',
    },
    customer: {
      name: cu.name || '', contact_person: q.kind_attention || cu.contact_person || '', phone: cu.phone || '', email: cu.email || '',
      gstin: cu.gstin || '', pan: cu.pan || '',
      billing_address: cu.billing_address || '', shipping_address: cu.shipping_address || cu.billing_address || '',
      city: cu.city || '', state: cu.state || '', state_code: cu.state_code || '', pincode: cu.pincode || '',
      full_address: joinAddress(cu.billing_address, cu.city, cu.state, cu.pincode),
      logo_data_uri: f ? logoDataUri(cu.logo) : '',
    },
    quote: {
      number: q.display_number || q.quote_number, base_number: q.quote_number, version: q.version,
      date: date(q.quote_date), valid_until: date(q.valid_until),
      subject: q.subject || '', reference_no: q.reference_no || '', kind_attention: q.kind_attention || cu.contact_person || '',
      status: q.status, notes: q.notes || '',
      place_of_supply: pos ? `${pos.name} (${pos.code})` : '',
      place_of_supply_name: pos ? pos.name : '', place_of_supply_code: q.place_of_supply_state_code || '',
      supply_type: isIntra ? 'Intra-State' : isInter ? 'Inter-State' : '',
      price_basis: !isRegular ? 'No GST charged' : q.price_mode === 'inclusive' ? 'Prices are inclusive of GST' : 'Prices are exclusive of GST',
      sgst_label: sgstLabel,
    },
    items,
    charges,
    tax_summary: (q.tax_summary || []).map((s) => ({
      hsn_sac: s.hsn_sac || '', gst_rate: pct(s.gst_rate), taxable: money(s.taxable_amount),
      cgst_rate: pct(s.cgst_rate), cgst: money(s.cgst_amount), sgst_rate: pct(s.sgst_rate), sgst: money(s.sgst_amount),
      igst_rate: pct(s.igst_rate), igst: money(s.igst_amount), tax: money(s.tax_amount),
    })),
    totals: {
      gross: money(q.items_gross),
      line_discount: money(q.line_discount_total),
      discount: money(q.overall_discount),
      total_discount: money(num(q.line_discount_total) + num(q.overall_discount)),
      taxable: money(q.taxable_amount),
      cgst: money(q.cgst_amount), sgst: money(q.sgst_amount), igst: money(q.igst_amount),
      tax: money(q.tax_amount),
      round_off: money(q.round_off),
      grand_total: money(q.grand_total),
      in_words: q.amount_in_words || '',
    },
    terms: termLines.map((t, i) => ({ sno: i + 1, text: t })),
    terms_text: termLines.join('\n'),
    // flags for {#flag}...{/flag} sections (docx) and {{#if flag}} (html)
    is_intra: isIntra,
    is_inter: isInter,
    show_gst: isRegular,
    has_discount: num(q.line_discount_total) + num(q.overall_discount) > 0,
    has_charges: charges.length > 0,
    has_terms: termLines.length > 0,
    has_round_off: num(q.round_off) !== 0,
    has_notes: !!q.notes,
  };
};

const buildRenderContext = (quotation) => ({ formatted: build(quotation, 'formatted'), raw: build(quotation, 'raw') });

module.exports = { buildRenderContext };
