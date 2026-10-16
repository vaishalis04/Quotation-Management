const moment = require('moment-timezone');
const ApiError = require('../utils/ApiError');
const { Company, Customer, Item, Quotation, QuotationItem, QuotationTemplate, TermsTemplate, AuditLog, sequelize } = require('../models');
const { calculateQuotation } = require('./taxCalculator.service');
const { allocateNumber } = require('./quotationNumber.service');
const { getState, isValidStateCode } = require('../config/states');
const { stateCodeFromGstin } = require('../utils/gstin');
const { GST_RATES_CURRENT, GST_RATES_LEGACY_EXTRA, GST_2_EFFECTIVE_DATE, STATUS_TRANSITIONS } = require('../config/constants');
const { todayStr, financialYearOf } = require('../utils/helpers');
const { cleanSpecs } = require('../utils/specs');

const allowedRatesFor = (quoteDate) =>
  moment(quoteDate).isBefore(GST_2_EFFECTIVE_DATE) ? [...GST_RATES_CURRENT, ...GST_RATES_LEGACY_EXTRA] : GST_RATES_CURRENT;

const companySnapshot = (c) => ({
  name: c.name, legal_name: c.legal_name, email: c.email, phone: c.phone, website: c.website,
  address: c.address, city: c.city, state: c.state, state_code: c.state_code, pincode: c.pincode,
  gstin: c.gstin, pan: c.pan, logo: c.logo,
  bank_name: c.bank_name, bank_account_name: c.bank_account_name, bank_account_no: c.bank_account_no,
  bank_ifsc: c.bank_ifsc, bank_branch: c.bank_branch, upi_id: c.upi_id,
  signatory_name: c.signatory_name, signatory_designation: c.signatory_designation,
});

const customerSnapshot = (c) => ({
  name: c.name, contact_person: c.contact_person, email: c.email, phone: c.phone, gstin: c.gstin, pan: c.pan,
  billing_address: c.billing_address, city: c.city, state: c.state, state_code: c.state_code, pincode: c.pincode,
  shipping_address: c.shipping_address, shipping_state_code: c.shipping_state_code, logo: c.logo,
});

const clean = (v) => (v === undefined || v === null || v === '' ? null : v);

/**
 * Turns a request body into everything needed to save: header fields, calculated lines, totals.
 * Used by create, update, revise AND the live "calculate" preview, so all of them give identical numbers.
 */
const buildQuotationData = async ({ company, body, companyId }) => {
  const quoteDate = body.quote_date || todayStr();
  if (!moment(quoteDate, 'YYYY-MM-DD', true).isValid()) throw new ApiError(400, 'quote_date must be YYYY-MM-DD');

  const customer = await Customer.findOne({ where: { id: body.customer_id, company_id: companyId, is_deleted: false } });
  if (!customer) throw new ApiError(404, 'Customer not found');

  const treatment = body.gst_treatment || company.default_gst_treatment || 'regular';
  const priceMode = body.price_mode || company.default_price_mode || 'exclusive';

  // ---- Place of supply -> intra / inter
  let placeOfSupply = clean(body.place_of_supply_state_code)
    || clean(customer.shipping_state_code) || clean(customer.state_code) || stateCodeFromGstin(customer.gstin);
  let supplyType = null;
  if (treatment === 'regular') {
    if (!company.state_code) throw new ApiError(400, 'Set your company GST state code in the company profile first');
    if (!placeOfSupply) throw new ApiError(400, 'place_of_supply_state_code is required (customer has no state on record)');
    placeOfSupply = String(placeOfSupply).padStart(2, '0');
    if (!isValidStateCode(placeOfSupply)) throw new ApiError(400, `Invalid place of supply state code '${placeOfSupply}'`);
    supplyType = placeOfSupply === company.state_code ? 'intra' : 'inter';
  } else if (placeOfSupply) {
    placeOfSupply = String(placeOfSupply).padStart(2, '0');
  }

  // ---- Resolve lines (master data supplies defaults; anything in the body wins)
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const masterIds = rawItems.map((i) => i.item_id).filter(Boolean);
  const masters = masterIds.length
    ? await Item.findAll({ where: { id: masterIds, company_id: companyId, is_deleted: false } })
    : [];
  const masterMap = new Map(masters.map((m) => [String(m.id), m]));

  const resolved = rawItems.map((it, idx) => {
    const m = it.item_id ? masterMap.get(String(it.item_id)) : null;
    if (it.item_id && !m) throw new ApiError(404, `Item ${idx + 1}: catalogue item ${it.item_id} not found`);
    const name = clean(it.name) || (m && m.name);
    if (!name) throw new ApiError(400, `Item ${idx + 1}: name is required`);
    return {
      item_id: m ? m.id : null,
      name,
      description: it.description !== undefined ? clean(it.description) : (m && m.description) || null,
      brand: it.brand !== undefined ? clean(it.brand) : (m && m.brand) || null,
      model_no: it.model_no !== undefined ? clean(it.model_no) : (m && m.model_no) || null,
      // custom labels: what the client sent wins (an empty list clears them), otherwise the catalogue item's
      specs: it.specs !== undefined ? cleanSpecs(it.specs) : (m && cleanSpecs(m.specs)) || null,
      hsn_sac: clean(it.hsn_sac) || (m && m.hsn_sac) || null,
      unit: clean(it.unit) || (m && m.unit) || 'Nos',
      section: clean(it.section),
      quantity: it.quantity,
      rate: it.rate !== undefined && it.rate !== null && it.rate !== '' ? it.rate : (m ? m.rate : undefined),
      discount_type: clean(it.discount_type),
      discount_value: clean(it.discount_value),
      gst_rate: it.gst_rate !== undefined && it.gst_rate !== null && it.gst_rate !== '' ? it.gst_rate : (m ? m.gst_rate : 0),
    };
  });

  const rawCharges = Array.isArray(body.charges) ? body.charges : [];
  const charges = rawCharges.map((c, idx) => {
    if (!clean(c.name)) throw new ApiError(400, `Charge ${idx + 1}: name is required`);
    return { name: c.name, amount: c.amount, gst_rate: c.gst_rate ?? 18, hsn_sac: clean(c.hsn_sac), description: clean(c.description) };
  });

  const roundOff = body.round_off !== undefined ? body.round_off !== false && body.round_off !== 'false' : company.round_off_enabled;

  const calc = calculateQuotation(
    {
      price_mode: priceMode,
      gst_treatment: treatment,
      supply_type: supplyType,
      discount_type: clean(body.discount_type),
      discount_value: clean(body.discount_value),
      round_off: roundOff,
      items: resolved,
      charges,
    },
    { allowedRates: allowedRatesFor(quoteDate) }
  );

  // ---- Terms: explicit text > chosen terms template > company default
  let terms = body.terms;
  if (terms === undefined && body.terms_template_id) {
    const t = await TermsTemplate.findOne({ where: { id: body.terms_template_id, company_id: companyId, is_deleted: false } });
    if (!t) throw new ApiError(404, 'Terms template not found');
    terms = t.content;
  }
  if (terms === undefined) {
    // company's default terms template, else the plain default text on the company profile
    const def = await TermsTemplate.findOne({ where: { company_id: companyId, is_default: true, is_active: true, is_deleted: false } });
    terms = def ? def.content : company.default_terms;
  }

  let template = null;
  if (body.template_id) {
    template = await QuotationTemplate.findOne({ where: { id: body.template_id, is_deleted: false, is_active: true } });
    if (!template || (template.company_id && String(template.company_id) !== String(companyId))) {
      throw new ApiError(404, 'Quotation layout not found');
    }
  }

  const validUntil = body.valid_until !== undefined
    ? clean(body.valid_until)
    : moment(quoteDate).add(company.default_validity_days || 15, 'days').format('YYYY-MM-DD');
  if (validUntil && moment(validUntil).isBefore(quoteDate)) throw new ApiError(400, 'valid_until cannot be before quote_date');

  const header = {
    customer_id: customer.id,
    quote_date: quoteDate,
    valid_until: validUntil,
    subject: clean(body.subject),
    reference_no: clean(body.reference_no),
    kind_attention: clean(body.kind_attention) || customer.contact_person || null,
    customer_snapshot: customerSnapshot(customer),
    company_snapshot: companySnapshot(company),
    place_of_supply_state_code: placeOfSupply,
    supply_type: supplyType,
    gst_treatment: treatment,
    price_mode: priceMode,
    discount_type: clean(body.discount_type),
    discount_value: clean(body.discount_value),
    round_off_enabled: roundOff,
    terms: clean(terms),
    notes: clean(body.notes),
    template_id: template ? template.id : null,
    items_gross: calc.totals.items_gross,
    line_discount_total: calc.totals.line_discount_total,
    overall_discount: calc.totals.overall_discount,
    taxable_amount: calc.totals.taxable_amount,
    cgst_amount: calc.totals.cgst_amount,
    sgst_amount: calc.totals.sgst_amount,
    igst_amount: calc.totals.igst_amount,
    tax_amount: calc.totals.tax_amount,
    round_off: calc.totals.round_off,
    grand_total: calc.totals.grand_total,
    amount_in_words: calc.totals.amount_in_words,
    tax_summary: calc.tax_summary,
  };

  // calculator output + the descriptive fields (and the discount exactly as typed) for each line
  const lineRows = [
    ...resolved.map((src, i) => ({
      ...src, ...calc.items[i], line_type: 'item', line_no: i + 1,
      discount_type: src.discount_type, discount_value: src.discount_value,
    })),
    ...charges.map((c, i) => ({
      ...calc.charges[i], line_type: 'charge', line_no: i + 1,
      name: c.name, description: c.description || null, hsn_sac: c.hsn_sac, unit: null,
    })),
  ];

  return { header, lineRows, calc, company, customer };
};

const loadCompany = async (companyId) => {
  const company = await Company.findOne({ where: { id: companyId, is_deleted: false, is_active: true } });
  if (!company) throw new ApiError(404, 'Company not found');
  return company;
};

const saveLines = (quotationId, lineRows, transaction) =>
  QuotationItem.bulkCreate(lineRows.map((l) => ({ ...l, quotation_id: quotationId })), { transaction });

const audit = (entry, transaction) => AuditLog.create(entry, { transaction });

const createQuotation = async ({ companyId, body, user }) => {
  const company = await loadCompany(companyId);
  const data = await buildQuotationData({ company, body, companyId });

  return sequelize.transaction(async (t) => {
    const num = await allocateNumber(company, data.header.quote_date, t);
    const q = await Quotation.create({
      ...data.header, ...num, company_id: companyId, version: 1, status: 'draft', is_latest: true, created_by: user.id,
    }, { transaction: t });
    await q.update({ root_quotation_id: q.id }, { transaction: t });
    await saveLines(q.id, data.lineRows, t);
    await audit({ company_id: companyId, entity_type: 'quotation', entity_id: q.id, action: 'created', performed_by: user.id, details: { number: q.display_number, grand_total: q.grand_total } }, t);
    return q.id;
  });
};

// Only drafts can be edited. Anything already issued must go through "revise" so the sent copy is preserved.
const updateQuotation = async ({ quotation, body, user }) => {
  if (quotation.status !== 'draft') {
    throw new ApiError(409, `A ${quotation.status} quotation cannot be edited. Create a revision instead (POST /quotations/${quotation.id}/revise).`);
  }
  const company = await loadCompany(quotation.company_id);
  const existing = await QuotationItem.findAll({ where: { quotation_id: quotation.id }, order: [['line_type', 'ASC'], ['line_no', 'ASC']] });

  // start from what is stored, overlay only the fields the client actually sent (null = clear the field)
  const stored = {
    customer_id: quotation.customer_id, quote_date: quotation.quote_date, valid_until: quotation.valid_until,
    subject: quotation.subject, reference_no: quotation.reference_no, kind_attention: quotation.kind_attention,
    place_of_supply_state_code: quotation.place_of_supply_state_code, gst_treatment: quotation.gst_treatment,
    price_mode: quotation.price_mode, discount_type: quotation.discount_type, discount_value: quotation.discount_value,
    round_off: quotation.round_off_enabled, terms: quotation.terms, notes: quotation.notes, template_id: quotation.template_id,
    items: existing.filter((l) => l.line_type === 'item').map(lineToInput),
    charges: existing.filter((l) => l.line_type === 'charge').map(chargeToInput),
  };
  const sent = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  const merged = { ...stored, ...sent };
  // a different customer means the place of supply must be worked out again (unless the client gave one)
  if (sent.customer_id && String(sent.customer_id) !== String(quotation.customer_id) && sent.place_of_supply_state_code === undefined) {
    merged.place_of_supply_state_code = null;
  }

  const data = await buildQuotationData({ company, body: merged, companyId: quotation.company_id });

  // the number is already allotted for a financial year; the date may not drift into the next one
  if (financialYearOf(data.header.quote_date) !== quotation.financial_year) {
    throw new ApiError(400, `quote_date must stay inside financial year ${quotation.financial_year} (number ${quotation.display_number} is already allotted). Create a new quotation instead.`);
  }

  await sequelize.transaction(async (t) => {
    await quotation.update({ ...data.header, updated_by: user.id }, { transaction: t });
    await QuotationItem.destroy({ where: { quotation_id: quotation.id }, transaction: t });
    await saveLines(quotation.id, data.lineRows, t);
    await audit({ company_id: quotation.company_id, entity_type: 'quotation', entity_id: quotation.id, action: 'updated', performed_by: user.id, details: { grand_total: data.header.grand_total } }, t);
  });
  return quotation.id;
};

const lineToInput = (l) => ({
  item_id: l.item_id, name: l.name, description: l.description, brand: l.brand, model_no: l.model_no, specs: l.specs, hsn_sac: l.hsn_sac,
  unit: l.unit, section: l.section, quantity: l.quantity, rate: l.rate, discount_type: l.discount_type,
  discount_value: l.discount_value, gst_rate: l.gst_rate,
});

// Charges are stored with rate = the entered amount
const chargeToInput = (l) => ({ name: l.name, amount: l.rate, gst_rate: l.gst_rate, hsn_sac: l.hsn_sac, description: l.description });

const reviseQuotation = async ({ quotation, user }) => {
  if (!['sent', 'rejected', 'expired'].includes(quotation.status)) {
    throw new ApiError(409, `Only sent, rejected or expired quotations can be revised (this one is ${quotation.status})`);
  }
  if (!quotation.is_latest) throw new ApiError(409, 'Only the latest version can be revised');

  const company = await loadCompany(quotation.company_id);
  const lines = await QuotationItem.findAll({ where: { quotation_id: quotation.id }, order: [['line_type', 'ASC'], ['line_no', 'ASC']] });
  const body = {
    customer_id: quotation.customer_id,
    // a revision is dated today, unless today already belongs to the next financial year (the number would no longer match)
    quote_date: financialYearOf(todayStr()) === quotation.financial_year ? todayStr() : quotation.quote_date,
    subject: quotation.subject, reference_no: quotation.reference_no, kind_attention: quotation.kind_attention,
    place_of_supply_state_code: quotation.place_of_supply_state_code,
    gst_treatment: quotation.gst_treatment, price_mode: quotation.price_mode,
    discount_type: quotation.discount_type, discount_value: quotation.discount_value,
    round_off: quotation.round_off_enabled, terms: quotation.terms, notes: quotation.notes, template_id: quotation.template_id,
    items: lines.filter((l) => l.line_type === 'item').map(lineToInput),
    charges: lines.filter((l) => l.line_type === 'charge').map(chargeToInput),
  };
  const data = await buildQuotationData({ company, body, companyId: quotation.company_id });

  return sequelize.transaction(async (t) => {
    const fresh = await Quotation.create({
      ...data.header,
      company_id: quotation.company_id, quote_number: quotation.quote_number, financial_year: quotation.financial_year,
      sequence_no: quotation.sequence_no, version: quotation.version + 1,
      root_quotation_id: quotation.root_quotation_id || quotation.id, parent_quotation_id: quotation.id,
      status: 'draft', is_latest: true, created_by: user.id,
    }, { transaction: t });
    await saveLines(fresh.id, data.lineRows, t);
    await quotation.update({ status: 'revised', is_latest: false, updated_by: user.id }, { transaction: t });
    await audit({ company_id: quotation.company_id, entity_type: 'quotation', entity_id: fresh.id, action: 'revised', performed_by: user.id, details: { from: quotation.display_number, to: fresh.display_number } }, t);
    return fresh.id;
  });
};

// Copy any quotation into a brand-new draft with a new number (optionally for another customer)
const duplicateQuotation = async ({ quotation, user, customerId }) => {
  const lines = await QuotationItem.findAll({ where: { quotation_id: quotation.id }, order: [['line_type', 'ASC'], ['line_no', 'ASC']] });
  return createQuotation({
    companyId: quotation.company_id,
    user,
    body: {
      customer_id: customerId || quotation.customer_id,
      subject: quotation.subject, gst_treatment: quotation.gst_treatment, price_mode: quotation.price_mode,
      discount_type: quotation.discount_type, discount_value: quotation.discount_value,
      round_off: quotation.round_off_enabled, terms: quotation.terms, notes: quotation.notes, template_id: quotation.template_id,
      place_of_supply_state_code: customerId ? undefined : quotation.place_of_supply_state_code,
      items: lines.filter((l) => l.line_type === 'item').map(lineToInput),
      charges: lines.filter((l) => l.line_type === 'charge').map(chargeToInput),
    },
  });
};

const changeStatus = async ({ quotation, status, reason, user }) => {
  const allowed = STATUS_TRANSITIONS[quotation.status] || [];
  if (!allowed.includes(status)) {
    throw new ApiError(409, `Cannot move a ${quotation.status} quotation to ${status}${allowed.length ? ` (allowed: ${allowed.join(', ')})` : ''}`);
  }
  if (!quotation.is_latest && status !== 'cancelled') throw new ApiError(409, 'Only the latest version can change status');

  const patch = { status, status_reason: reason || null, updated_by: user.id };
  const now = new Date();
  if (status === 'sent') patch.sent_at = now;
  if (status === 'accepted') patch.accepted_at = now;
  if (status === 'rejected') patch.rejected_at = now;

  await sequelize.transaction(async (t) => {
    await quotation.update(patch, { transaction: t });
    await audit({ company_id: quotation.company_id, entity_type: 'quotation', entity_id: quotation.id, action: `status:${status}`, performed_by: user.id, details: { reason: reason || null } }, t);
  });
};

const getFullQuotation = async (id, companyId) => {
  const where = { id, is_deleted: false };
  if (companyId) where.company_id = companyId;
  const q = await Quotation.findOne({
    where,
    include: [
      { model: QuotationItem, as: 'lines' },
      { model: Customer, as: 'customer', attributes: ['id', 'name', 'gstin', 'phone', 'email'] },
    ],
    order: [[{ model: QuotationItem, as: 'lines' }, 'line_type', 'ASC'], [{ model: QuotationItem, as: 'lines' }, 'line_no', 'ASC']],
  });
  if (!q) throw new ApiError(404, 'Quotation not found');
  return q;
};

// Flip overdue "sent" quotations to "expired"
const expireOverdue = async (companyId = null) => {
  const { Op } = require('sequelize');
  const where = { status: 'sent', is_latest: true, valid_until: { [Op.lt]: todayStr() } };
  if (companyId) where.company_id = companyId;
  const [count] = await Quotation.update({ status: 'expired', status_reason: 'Validity period over' }, { where });
  return count;
};

module.exports = {
  buildQuotationData, createQuotation, updateQuotation, reviseQuotation, duplicateQuotation, changeStatus,
  getFullQuotation, expireOverdue, loadCompany, allowedRatesFor, getState,
};
