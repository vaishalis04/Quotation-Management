const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const ApiError = require('../utils/ApiError');
const { Company, QuotationTemplate } = require('../models');
const { UPLOAD_DIR } = require('../middleware/upload.middleware');
const { buildRenderContext } = require('./renderContext.service');
const { calculateQuotation } = require('./taxCalculator.service');
const docxEngine = require('./templateEngines/docx.engine');
const xlsxEngine = require('./templateEngines/xlsx.engine');
const htmlEngine = require('./templateEngines/html.engine');
const { officeToPdf, htmlToPdf } = require('./pdf.service');
const { sampleHtml } = require('./sampleTemplate.service');

const MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  html: 'text/html; charset=utf-8',
  pdf: 'application/pdf',
};

const layoutFile = (template) => {
  const full = path.resolve(UPLOAD_DIR, template.file_path || '');
  if (!full.startsWith(UPLOAD_DIR + path.sep) || !fs.existsSync(full)) throw new ApiError(404, 'Layout file is missing on the server - upload it again');
  return fs.readFileSync(full);
};

/**
 * Which layout to use: explicit templateId > the one saved on the quotation > company default >
 * shared default for the company's business type > built-in HTML layout (returns null).
 */
const resolveTemplate = async (quotation, templateId) => {
  const visible = { is_deleted: false, is_active: true, [Op.or]: [{ company_id: quotation.company_id }, { company_id: null }] };

  if (templateId) {
    const t = await QuotationTemplate.findOne({ where: { ...visible, id: templateId } });
    if (!t) throw new ApiError(404, 'Quotation layout not found');
    return t;
  }
  if (quotation.template_id) {
    const t = await QuotationTemplate.findOne({ where: { ...visible, id: quotation.template_id } });
    if (t) return t;
  }
  const own = await QuotationTemplate.findOne({ where: { ...visible, company_id: quotation.company_id, is_default: true } });
  if (own) return own;

  const company = await Company.findByPk(quotation.company_id);
  if (company) {
    const shared = await QuotationTemplate.findOne({ where: { ...visible, company_id: null, business_type: company.business_type, is_default: true } });
    if (shared) return shared;
  }
  return null;
};

/**
 * @param {'native'|'pdf'} output  native = the layout's own format (docx/xlsx/html), pdf = converted
 * @returns {{ buffer: Buffer, contentType: string, ext: string }}
 */
const renderWithTemplate = async ({ quotation, template, output = 'native' }) => {
  const ctx = buildRenderContext(quotation);
  const format = template ? template.format : 'html';
  let buffer;

  if (format === 'docx') {
    buffer = docxEngine.render(layoutFile(template), ctx.formatted);
    return output === 'pdf'
      ? { buffer: await officeToPdf(buffer, 'docx'), contentType: MIME.pdf, ext: 'pdf' }
      : { buffer, contentType: MIME.docx, ext: 'docx' };
  }
  if (format === 'xlsx') {
    buffer = await xlsxEngine.render(layoutFile(template), ctx);
    return output === 'pdf'
      ? { buffer: await officeToPdf(buffer, 'xlsx'), contentType: MIME.pdf, ext: 'pdf' }
      : { buffer, contentType: MIME.xlsx, ext: 'xlsx' };
  }
  const html = htmlEngine.render(template ? template.html_content || '' : sampleHtml(), ctx.formatted);
  return output === 'pdf'
    ? { buffer: await htmlToPdf(html), contentType: MIME.pdf, ext: 'pdf' }
    : { buffer: Buffer.from(html, 'utf8'), contentType: MIME.html, ext: 'html' };
};

// ---- upload-time check: fill the layout with a dummy quotation so tag mistakes are reported immediately
const dummyQuotation = () => {
  const calc = calculateQuotation({
    supply_type: 'intra', discount_type: 'percent', discount_value: 5,
    items: [
      { quantity: 4, rate: 2850, gst_rate: 18, hsn_sac: '8525' },
      { quantity: 1, rate: 12500, discount_type: 'amount', discount_value: 500, gst_rate: 18, hsn_sac: '8521' },
    ],
    charges: [{ name: 'Installation & commissioning', amount: 3000, gst_rate: 18, hsn_sac: '995469' }],
  });
  const line = (src, c, i, type) => ({ ...src, ...c, line_type: type, line_no: i + 1 });
  return {
    display_number: 'QT/2026-27/0001', quote_number: 'QT/2026-27/0001', version: 1, status: 'draft',
    quote_date: '2026-10-14', valid_until: '2026-10-29', subject: 'Supply and installation of CCTV system', reference_no: 'ENQ-101',
    kind_attention: 'Mr. Sharma', place_of_supply_state_code: '23', supply_type: 'intra', gst_treatment: 'regular', price_mode: 'exclusive',
    company_snapshot: { name: 'Sample Security Systems', address: '12 Market Road', city: 'Bhopal', state: 'Madhya Pradesh', state_code: '23', gstin: '23AAAAA0000A1Z5', phone: '9999999999', email: 'sales@example.com', signatory_name: 'Authorised Signatory' },
    customer_snapshot: { name: 'Sample Customer Pvt Ltd', billing_address: '5 Industrial Area', city: 'Indore', state: 'Madhya Pradesh', state_code: '23', gstin: '23BBBBB1111B1Z5' },
    terms: '50% advance with order\nBalance on completion\nWarranty as per manufacturer',
    items_gross: calc.totals.items_gross, line_discount_total: calc.totals.line_discount_total, overall_discount: calc.totals.overall_discount,
    taxable_amount: calc.totals.taxable_amount, cgst_amount: calc.totals.cgst_amount, sgst_amount: calc.totals.sgst_amount,
    igst_amount: calc.totals.igst_amount, tax_amount: calc.totals.tax_amount, round_off: calc.totals.round_off,
    grand_total: calc.totals.grand_total, amount_in_words: calc.totals.amount_in_words, tax_summary: calc.tax_summary,
    lines: [
      line({ name: 'IP Dome Camera 4MP', unit: 'Nos', hsn_sac: '8525', brand: 'Hikvision', model_no: 'DS-2CD' }, calc.items[0], 0, 'item'),
      line({ name: 'NVR 8 Channel', unit: 'Nos', hsn_sac: '8521', description: 'With 2TB surveillance HDD' }, calc.items[1], 1, 'item'),
      line({ name: 'Installation & commissioning', hsn_sac: '995469' }, calc.charges[0], 0, 'charge'),
    ],
  };
};

const validateLayout = async ({ format, buffer, html }) => {
  const q = dummyQuotation();
  const template = { format };
  const ctx = buildRenderContext(q);
  if (format === 'docx') docxEngine.render(buffer, ctx.formatted);
  else if (format === 'xlsx') await xlsxEngine.render(buffer, ctx);
  else htmlEngine.render(html, ctx.formatted);
  return template;
};

module.exports = { resolveTemplate, renderWithTemplate, validateLayout, dummyQuotation, MIME };
