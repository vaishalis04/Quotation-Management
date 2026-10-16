/**
 * Starter layouts. A business downloads one, restyles it in Word / Excel / an HTML editor (logo, colours, columns),
 * keeps the {tags}, and uploads it back as its own layout.
 */
const PizZip = require('pizzip');
const ExcelJS = require('exceljs');

// ---------------------------------------------------------------- HTML (Handlebars)
const sampleHtml = () => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Quotation {{quote.number}}</title>
<style>
  @page { size: A4; margin: 12mm 10mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #222; margin: 0; }
  .head { display: flex; justify-content: space-between; border-bottom: 2px solid #1f3a5f; padding-bottom: 8px; }
  .head img { max-height: 60px; max-width: 160px; }
  h1 { font-size: 20px; margin: 0; color: #1f3a5f; } h2 { font-size: 14px; margin: 10px 0 4px; letter-spacing: 1px; }
  .muted { color: #666; } .right { text-align: right; } .center { text-align: center; }
  .grid { display: flex; gap: 12px; margin-top: 10px; } .box { flex: 1; border: 1px solid #ccc; padding: 6px 8px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th { background: #1f3a5f; color: #fff; padding: 5px; font-size: 10px; } td { border: 1px solid #ccc; padding: 4px 5px; vertical-align: top; }
  .totals { width: 55%; margin-left: auto; } .totals td { border: none; border-bottom: 1px solid #eee; } .grand td { font-weight: bold; font-size: 13px; border-top: 2px solid #1f3a5f; }
  small { color: #666; }
</style></head><body>
<div class="head">
  <div>{{#if company.logo_data_uri}}<img src="{{company.logo_data_uri}}" alt="logo">{{/if}}
    <h1>{{company.name}}</h1>
    <div>{{company.full_address}}</div>
    <div>{{#if company.phone}}Ph: {{company.phone}}{{/if}} {{#if company.email}}| {{company.email}}{{/if}}</div>
    {{#if company.gstin}}<div><b>GSTIN:</b> {{company.gstin}}</div>{{/if}}
  </div>
  <div class="right"><h2>QUOTATION</h2>
    <div><b>No:</b> {{quote.number}}</div><div><b>Date:</b> {{quote.date}}</div>
    {{#if quote.valid_until}}<div><b>Valid until:</b> {{quote.valid_until}}</div>{{/if}}
    {{#if quote.reference_no}}<div><b>Your ref:</b> {{quote.reference_no}}</div>{{/if}}
  </div>
</div>
<div class="grid">
  <div class="box"><b>Quotation to</b><br>{{#if customer.logo_data_uri}}<img src="{{customer.logo_data_uri}}" alt="" style="max-height:40px;max-width:120px"><br>{{/if}}{{customer.name}}<br>{{customer.full_address}}
    {{#if customer.gstin}}<br>GSTIN: {{customer.gstin}}{{/if}}
    {{#if quote.kind_attention}}<br>Kind attn: {{quote.kind_attention}}{{/if}}</div>
  <div class="box"><b>Place of supply</b><br>{{quote.place_of_supply}}
    {{#if quote.supply_type}}<br>{{quote.supply_type}} supply{{/if}}<br><span class="muted">{{quote.price_basis}}</span></div>
</div>
{{#if quote.subject}}<p><b>Subject:</b> {{quote.subject}}</p>{{/if}}
<table>
  <thead><tr><th>#</th><th>Description</th><th>HSN/SAC</th><th>Qty</th><th>Unit</th><th>Rate</th>{{#if has_discount}}<th>Disc.</th>{{/if}}<th>Taxable</th>{{#if show_gst}}<th>GST %</th><th>GST</th>{{/if}}<th>Total</th></tr></thead>
  <tbody>
  {{#each items}}
    <tr><td class="center">{{sno}}</td>
      <td><b>{{name}}</b>{{#if brand}} <small>{{brand}} {{model_no}}</small>{{/if}}{{#if description}}<br><small>{{nl2br description}}</small>{{/if}}{{#each specs}}<br><small>{{label}}: {{value}}</small>{{/each}}{{#if section}}<br><small>[{{section}}]</small>{{/if}}</td>
      <td class="center">{{hsn_sac}}</td><td class="right">{{qty}}</td><td class="center">{{unit}}</td><td class="right">{{rate}}</td>
      {{#if @root.has_discount}}<td class="right">{{discount}}</td>{{/if}}<td class="right">{{taxable}}</td>
      {{#if @root.show_gst}}<td class="center">{{gst_rate}}</td><td class="right">{{tax}}</td>{{/if}}<td class="right">{{total}}</td></tr>
  {{/each}}
  {{#each charges}}
    <tr><td class="center">{{sno}}</td><td><b>{{name}}</b></td><td class="center">{{hsn_sac}}</td><td></td><td></td><td></td>
      {{#if @root.has_discount}}<td></td>{{/if}}<td class="right">{{taxable}}</td>
      {{#if @root.show_gst}}<td class="center">{{gst_rate}}</td><td class="right">{{tax}}</td>{{/if}}<td class="right">{{total}}</td></tr>
  {{/each}}
  </tbody>
</table>
<table class="totals"><tbody>
  {{#if has_discount}}<tr><td>Total discount</td><td class="right">- {{totals.total_discount}}</td></tr>{{/if}}
  <tr><td>Taxable value</td><td class="right">{{totals.taxable}}</td></tr>
  {{#if is_intra}}<tr><td>CGST</td><td class="right">{{totals.cgst}}</td></tr><tr><td>{{quote.sgst_label}}</td><td class="right">{{totals.sgst}}</td></tr>{{/if}}
  {{#if is_inter}}<tr><td>IGST</td><td class="right">{{totals.igst}}</td></tr>{{/if}}
  {{#if has_round_off}}<tr><td>Round off</td><td class="right">{{totals.round_off}}</td></tr>{{/if}}
  <tr class="grand"><td>Grand total (INR)</td><td class="right">{{totals.grand_total}}</td></tr>
</tbody></table>
<p><b>Amount in words:</b> {{totals.in_words}}</p>
{{#if show_gst}}<table><thead><tr><th>HSN/SAC</th><th>Taxable</th><th>GST %</th><th>Tax</th></tr></thead><tbody>
  {{#each tax_summary}}<tr><td>{{hsn_sac}}</td><td class="right">{{taxable}}</td><td class="center">{{gst_rate}}</td><td class="right">{{tax}}</td></tr>{{/each}}
</tbody></table>{{/if}}
{{#if has_terms}}<h2>Terms &amp; conditions</h2><ol>{{#each terms}}<li>{{text}}</li>{{/each}}</ol>{{/if}}
{{#if company.bank_account_no}}<p><b>Bank:</b> {{company.bank_account_name}}, {{company.bank_name}}, A/c {{company.bank_account_no}}, IFSC {{company.bank_ifsc}}{{#if company.upi_id}} | UPI: {{company.upi_id}}{{/if}}</p>{{/if}}
<p class="right" style="margin-top:40px">For <b>{{company.name}}</b><br><br><br>{{company.signatory_name}}<br><small>{{company.signatory_designation}}</small></p>
</body></html>`;

// ---------------------------------------------------------------- DOCX (raw WordprocessingML)
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const run = (text, o = {}) =>
  `<w:r><w:rPr>${o.b ? '<w:b/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}<w:sz w:val="${o.sz || 18}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
const para = (text, o = {}) =>
  `<w:p><w:pPr>${o.align ? `<w:jc w:val="${o.align}"/>` : ''}<w:spacing w:after="${o.after ?? 40}"/></w:pPr>${run(text, o)}</w:p>`;
const cell = (text, w, o = {}) =>
  `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : ''}</w:tcPr>${para(text, { sz: 16, ...o })}</w:tc>`;
const trow = (cells) => `<w:tr>${cells.join('')}</w:tr>`;
const BORDER = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="BBBBBB"/>`).join('');
const table = (widths, rows) =>
  `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblBorders>${BORDER}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr>` +
  `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows.join('')}</w:tbl>`;

const sampleDocxBuffer = () => {
  const W = [450, 2700, 850, 600, 550, 950, 850, 1050, 600, 850, 1016]; // = 10466 twips (A4 minus 0.5in margins)
  const head = ['#', 'Description', 'HSN/SAC', 'Qty', 'Unit', 'Rate', 'Disc.', 'Taxable', 'GST %', 'GST', 'Total'];
  const H = { b: true, fill: '1F3A5F', color: 'FFFFFF' };

  const itemRow = trow([
    cell('{#items}{sno}', W[0]), cell('{name}', W[1]), cell('{hsn_sac}', W[2]), cell('{qty}', W[3], { align: 'right' }),
    cell('{unit}', W[4]), cell('{rate}', W[5], { align: 'right' }), cell('{discount}', W[6], { align: 'right' }),
    cell('{taxable}', W[7], { align: 'right' }), cell('{gst_rate}', W[8], { align: 'right' }), cell('{tax}', W[9], { align: 'right' }),
    cell('{total}{/items}', W[10], { align: 'right' }),
  ]);
  const chargeRow = trow([
    cell('{#charges}{sno}', W[0]), cell('{name}', W[1]), cell('{hsn_sac}', W[2]), cell('', W[3]), cell('', W[4]), cell('', W[5]),
    cell('', W[6]), cell('{taxable}', W[7], { align: 'right' }), cell('{gst_rate}', W[8], { align: 'right' }),
    cell('{tax}', W[9], { align: 'right' }), cell('{total}{/charges}', W[10], { align: 'right' }),
  ]);

  const T = [7500, 2966];
  const tot = (label, value, o = {}) => trow([cell(label, T[0], { align: 'right', ...o }), cell(value, T[1], { align: 'right', ...o })]);

  const body = [
    para('{company.name}', { b: true, sz: 32, color: '1F3A5F' }),
    para('{company.full_address}'),
    para('Ph: {company.phone}   Email: {company.email}   GSTIN: {company.gstin}', { after: 120 }),
    para('QUOTATION', { b: true, sz: 26, align: 'center', after: 120 }),
    para('Quotation No: {quote.number}        Date: {quote.date}        Valid until: {quote.valid_until}'),
    para('To: {customer.name}', { b: true }),
    para('{customer.full_address}'),
    para('GSTIN: {customer.gstin}        Kind attn: {quote.kind_attention}'),
    para('Place of supply: {quote.place_of_supply}  ({quote.supply_type})      {quote.price_basis}', { after: 80 }),
    para('Subject: {quote.subject}', { b: true, after: 100 }),
    table(W, [trow(head.map((h, i) => cell(h, W[i], H))), itemRow, chargeRow]),
    para('', { after: 60 }),
    table(T, [
      tot('Total discount', '{totals.total_discount}'),
      tot('Taxable value', '{totals.taxable}'),
      tot('{#is_intra}CGST', '{totals.cgst}{/is_intra}'),
      tot('{#is_intra}{quote.sgst_label}', '{totals.sgst}{/is_intra}'),
      tot('{#is_inter}IGST', '{totals.igst}{/is_inter}'),
      tot('{#has_round_off}Round off', '{totals.round_off}{/has_round_off}'),
      tot('Grand total (INR)', '{totals.grand_total}', { b: true }),
    ]),
    para('Amount in words: {totals.in_words}', { b: true, after: 120 }),
    para('Terms & conditions', { b: true }),
    para('{#terms}'),
    para('{sno}. {text}'),
    para('{/terms}'),
    para('', { after: 200 }),
    para('For {company.name}', { b: true, align: 'right' }),
    para('', { after: 400 }),
    para('{company.signatory_name}', { align: 'right' }),
    para('{company.signatory_designation}', { align: 'right' }),
  ].join('');

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const zip = new PizZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file('word/document.xml', documentXml);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
};

// ---------------------------------------------------------------- XLSX
const sampleXlsxBuffer = async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Quotation');
  ws.columns = [{ width: 6 }, { width: 38 }, { width: 11 }, { width: 8 }, { width: 8 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 8 }, { width: 12 }, { width: 14 }];
  const bold = { bold: true };
  ws.getCell('A1').value = '{{company.name}}'; ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF1F3A5F' } };
  ws.getCell('A2').value = '{{company.full_address}}';
  ws.getCell('A3').value = 'GSTIN: {{company.gstin}}   Ph: {{company.phone}}';
  ws.getCell('A5').value = 'QUOTATION'; ws.getCell('A5').font = { bold: true, size: 14 };
  ws.getCell('A6').value = 'No: {{quote.number}}'; ws.getCell('F6').value = 'Date: {{quote.date}}';
  ws.getCell('A7').value = 'To: {{customer.name}}'; ws.getCell('A7').font = bold;
  ws.getCell('A8').value = '{{customer.full_address}}';
  ws.getCell('A9').value = 'Place of supply: {{quote.place_of_supply}}   {{quote.price_basis}}';

  const heads = ['#', 'Description', 'HSN/SAC', 'Qty', 'Unit', 'Rate', 'Discount', 'Taxable', 'GST %', 'GST', 'Total'];
  heads.forEach((h, i) => {
    const c = ws.getCell(11, i + 1);
    c.value = h; c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } };
  });
  // repeat row (one per item)
  ['{{items.sno}}', '{{items.name_description}}', '{{items.hsn_sac}}', '{{items.qty}}', '{{items.unit}}', '{{items.rate}}',
    '{{items.discount}}', '{{items.taxable}}', '{{items.gst_rate}}', '{{items.tax}}', '{{items.total}}']
    .forEach((t, i) => { const c = ws.getCell(12, i + 1); c.value = t; c.alignment = { wrapText: true, vertical: 'top' }; });
  // repeat row (one per additional charge)
  ['{{charges.sno}}', '{{charges.name}}', '{{charges.hsn_sac}}', '', '', '', '', '{{charges.taxable}}', '{{charges.gst_rate}}', '{{charges.tax}}', '{{charges.total}}']
    .forEach((t, i) => { if (t) ws.getCell(13, i + 1).value = t; });

  // Rule for Excel layouts: a repeat row (one with {{items.x}}, {{charges.x}}, {{terms.x}}...) must contain nothing
  // else, because the whole row is copied once per entry. Totals therefore sit on their own rows, above the terms.
  const totals = [['Taxable value', '{{totals.taxable}}'], ['CGST', '{{totals.cgst}}'], ['SGST / UTGST', '{{totals.sgst}}'],
    ['IGST', '{{totals.igst}}'], ['Round off', '{{totals.round_off}}'], ['Grand total (INR)', '{{totals.grand_total}}']];
  totals.forEach(([label, tag], i) => {
    ws.getCell(15 + i, 10).value = label; ws.getCell(15 + i, 10).font = bold;
    ws.getCell(15 + i, 11).value = tag; ws.getCell(15 + i, 11).font = bold;
  });
  ws.getCell('A21').value = 'In words: {{totals.in_words}}'; ws.getCell('A21').font = bold;
  ws.getCell('A23').value = 'Terms & conditions'; ws.getCell('A23').font = bold;
  ws.getCell('A24').value = '{{terms.sno}}. {{terms.text}}'; // repeat row (one per term) - nothing else on this row
  ws.getCell('J27').value = 'For {{company.name}}'; ws.getCell('J27').font = bold;
  return Buffer.from(await wb.xlsx.writeBuffer());
};

module.exports = { sampleHtml, sampleDocxBuffer, sampleXlsxBuffer };
