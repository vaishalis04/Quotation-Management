/**
 * OPTIONAL helper: loads a product list from Excel into Items and creates the Product / Company / Category masters it needs.
 *
 *   node import-catalogue.js quotation_data.xlsx --company=1 [--sheet=Sheet11] [--dry-run]
 *
 * Reads these columns by their heading (any order, upper/lower case does not matter):
 *   Full Version in Quotation | company | category | Product          (needed)
 *   Rate | HSN | GST | Unit                                            (optional - add them to the sheet to import prices)
 * Items are matched by their full name, so running it again updates instead of duplicating (rate is only
 * overwritten when the sheet has a Rate column). Only the chosen sheet is read.
 */
require('dotenv').config();
const ExcelJS = require('exceljs');
const { sequelize, Item, Company } = require('./src/models');
const { applyMasters } = require('./src/services/catalogueMaster.service');

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (n, d) => (args.find((a) => a.startsWith(`--${n}=`)) || '').split('=')[1] || d;
const dry = args.includes('--dry-run');
const clean = (v) => (v === null || v === undefined ? '' : String(v.text ?? v.result ?? v).replace(/\s+/g, ' ').trim());
const low = (s) => s.toLowerCase();

(async () => {
  if (!file) { console.log('Usage: node import-catalogue.js <file.xlsx> --company=<id> [--sheet=Sheet11] [--dry-run]'); process.exit(1); }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const wanted = opt('sheet', '');
  const ws = wanted ? wb.getWorksheet(wanted) : wb.worksheets.find((s) => /full version/i.test(clean(s.getRow(1).values.join(' ')))) || wb.worksheets[0];
  if (!ws) throw new Error(`Sheet "${wanted}" not found. Sheets: ${wb.worksheets.map((s) => s.name).join(', ')}`);

  const head = {};
  ws.getRow(1).eachCell((c, i) => { head[low(clean(c.value))] = i; });
  const col = (...names) => { for (const n of names) { const k = Object.keys(head).find((h) => h === n || h.startsWith(n)); if (k) return head[k]; } return null; };
  const C = { full: col('full version'), company: col('company', 'brand'), category: col('category'), product: col('product'),
    rate: col('rate', 'price', 'selling'), hsn: col('hsn'), gst: col('gst'), unit: col('unit') };
  if (!C.full || !C.product) throw new Error('Could not find the "Full Version in Quotation" and "Product" headings in row 1');

  let rows = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const g = (i) => (i ? clean(row.getCell(i).value) : '');
    const r = { n, full: g(C.full), company: g(C.company), category: g(C.category), product: g(C.product), rate: g(C.rate), hsn: g(C.hsn), gst: g(C.gst), unit: g(C.unit) };
    if (r.full || r.product) rows.push(r);
  });

  // one spelling per company (most used wins): "CP plus" / "CP Plus" / "cp plus" -> same company
  const spell = new Map();
  rows.forEach((r) => { if (r.company) { const m = spell.get(low(r.company)) || new Map(); m.set(r.company, (m.get(r.company) || 0) + 1); spell.set(low(r.company), m); } });
  const canon = (c) => (c ? [...spell.get(low(c))].sort((a, b) => b[1] - a[1])[0][0] : '');

  const warnings = [];
  const prepared = rows.map((r) => {
    let { full, product, category } = r;
    const company = canon(r.company);
    if (!product) product = full;
    // "Router AC 10 Tenda" typed as the product while Tenda is also the company -> product "Router AC 10"
    if (company && low(product).endsWith(low(company)) && low(product) !== low(company)) product = product.slice(0, product.length - company.length).trim();
    if (!full) full = [product, category, company].filter(Boolean).join(' ');
    // glued text such as "...audioCP Plus"
    if (company && low(full).endsWith(low(company))) {
      const head2 = full.slice(0, full.length - company.length);
      if (head2 && !/\s$/.test(head2)) full = `${head2} ${full.slice(head2.length)}`;
    }
    // the printed name is the truth: when it reads "<product> <category> <company>", take the category from it
    if (low(full).startsWith(low(product))) {
      let mid = full.slice(product.length);
      if (company) mid = low(mid).trimEnd().endsWith(low(company)) ? mid.trimEnd().slice(0, mid.trimEnd().length - company.length) : null;
      if (mid !== null) {
        const derived = mid.trim();
        if (low(derived) !== low(category)) warnings.push(`row ${r.n}: category "${category || '-'}" in the sheet, but the full name says "${derived || '-'}" - used the full name`);
        category = derived;
      }
    }
    return { ...r, full, product, category, company };
  });

  // same product + company + category twice = the picker will ask to choose by name
  const seen = new Map();
  prepared.forEach((p) => { const k = [p.product, p.company, p.category].map(low).join('|'); (seen.get(k) || seen.set(k, []).get(k)).push(p); });
  seen.forEach((list) => { if (list.length > 1) warnings.push(`rows ${list.map((x) => x.n).join(', ')}: same product/company/category ("${list[0].full}" ...) - check the sheet`); });

  console.log(`${prepared.length} rows read from sheet "${ws.name}"`);
  if (warnings.length) console.log(`\nPlease check:\n - ${warnings.join('\n - ')}\n`);
  if (dry) { console.log('Dry run - nothing saved. Examples:'); prepared.slice(0, 8).forEach((p) => console.log(`  ${p.product} | ${p.company || '(no company)'} | ${p.category || '(no category)'}  =>  ${p.full}`)); return; }

  await sequelize.authenticate();
  const company_id = Number(opt('company', 0)) || (await Company.findOne({ order: [['id', 'ASC']] }))?.id;
  if (!company_id) throw new Error('No company found - pass --company=<id>');
  let created = 0, updated = 0;
  for (const p of prepared) {
    const existing = await Item.findOne({ where: { company_id, name: p.full, is_deleted: false } });
    // find-or-create Product > Company > Category (a company belongs to its product, a category to its company)
    const data = await applyMasters({ companyId: company_id, userId: null, patch: { product: p.product, brand: p.company, category: p.category }, existing: existing ? existing.toJSON() : null });
    data.name = p.full;
    if (C.rate && p.rate !== '') data.rate = Number(p.rate) || 0;
    if (C.hsn && p.hsn) data.hsn_sac = p.hsn;
    if (C.gst && p.gst !== '') data.gst_rate = Number(String(p.gst).replace('%', '')) || 18;
    if (C.unit && p.unit) data.unit = p.unit;
    if (existing) { await existing.update(data); updated += 1; } else { await Item.create({ ...data, company_id, rate: data.rate ?? 0 }); created += 1; }
  }
  console.log(`Done: ${created} added, ${updated} updated (company id ${company_id}).${C.rate ? '' : ' No Rate column in the sheet, so new items have rate 0 - set the prices in Items.'}`);
})().catch((e) => { console.error('Import failed:', e.message); process.exitCode = 1; }).finally(() => sequelize.close());
