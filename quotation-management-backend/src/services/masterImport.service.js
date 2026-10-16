const { ensureProduct, ensureBrand, ensureCategory } = require('./catalogueMaster.service');

/**
 * Excel import of the Product -> Company -> Category masters (no prices, no items).
 * Sheet columns (by heading, any order, upper/lower case ignored):
 *   Full Version in Quotation | company | category | Product
 * The printed name is the truth: when it reads "<product> <category> <company>" the category is taken from it,
 * so a wrongly pasted category cell cannot create a wrong master.
 */
const low = (s) => String(s).toLowerCase();
const clean = (v) => (v === null || v === undefined ? '' : String(v.text ?? v.result ?? v).replace(/\s+/g, ' ').trim());

// rows: [{ n, full, company, category, product }]  ->  { prepared, warnings }
function prepareRows(rows) {
  // one spelling per company (most used wins): "CP plus" / "CP Plus" / "cp plus" -> the same company
  const spell = new Map();
  rows.forEach((r) => {
    if (!r.company) return;
    const m = spell.get(low(r.company)) || new Map();
    m.set(r.company, (m.get(r.company) || 0) + 1);
    spell.set(low(r.company), m);
  });
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
      const head = full.slice(0, full.length - company.length);
      if (head && !/\s$/.test(head)) full = `${head} ${full.slice(head.length)}`;
    }
    if (low(full).startsWith(low(product))) {
      let mid = full.slice(product.length);
      if (company) mid = low(mid).trimEnd().endsWith(low(company)) ? mid.trimEnd().slice(0, mid.trimEnd().length - company.length) : null;
      if (mid !== null) {
        const derived = mid.trim();
        if (low(derived) !== low(category)) warnings.push(`Row ${r.n}: category "${category || '-'}" in the sheet, but the printed name says "${derived || '-'}" - used the printed name`);
        category = derived;
      }
    }
    return { ...r, full, product, category, company };
  });
  return { prepared, warnings };
}

// Reads the right sheet of an ExcelJS workbook into plain rows
function readRows(wb) {
  const heads = (ws) => { const h = {}; ws.getRow(1).eachCell((c, i) => { h[low(clean(c.value))] = i; }); return h; };
  const find = (h, ...names) => { for (const n of names) { const k = Object.keys(h).find((x) => x === n || x.startsWith(n)); if (k) return h[k]; } return null; };
  // the sheet that has the "Full Version in Quotation" and "Product" headings (the file may hold other sheets too)
  const ws = wb.worksheets.find((s) => { const h = heads(s); return find(h, 'full version') && find(h, 'product'); });
  if (!ws) throw Object.assign(new Error('No sheet with the headings "Full Version in Quotation" and "Product" (and optionally company, category) was found in row 1.'), { status: 400 });
  const h = heads(ws);
  const C = { full: find(h, 'full version'), company: find(h, 'company', 'brand'), category: find(h, 'category'), product: find(h, 'product') };
  const rows = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const g = (i) => (i ? clean(row.getCell(i).value) : '');
    const r = { n, full: g(C.full), company: g(C.company), category: g(C.category), product: g(C.product) };
    if (r.full || r.product) rows.push(r);
  });
  return { rows, sheet: ws.name };
}

// Creates what is missing (nothing is duplicated, nothing existing is changed). dryRun counts without saving.
async function importMasters({ companyId, userId, prepared, dryRun = false }) {
  const stats = { products: 0, companies: 0, categories: 0 };
  const seenP = new Map(); const seenB = new Map(); const seenC = new Set();
  for (const p of prepared) {
    if (!p.product) continue;
    const kp = low(p.product);
    if (!seenP.has(kp)) {
      if (dryRun) { seenP.set(kp, { id: kp, isNew: true }); stats.products += 1; } else {
        const before = await require('./catalogueMaster.service').findProduct(companyId, p.product);
        const row = await ensureProduct(companyId, p.product, userId);
        seenP.set(kp, row); if (!before) stats.products += 1;
      }
    }
    const prod = seenP.get(kp);
    let brand = null; let kb = '';
    if (p.company) {
      kb = `${kp}|${low(p.company)}`;
      if (!seenB.has(kb)) {
        if (dryRun) { seenB.set(kb, { id: kb }); stats.companies += 1; } else {
          const before = await require('./catalogueMaster.service').findBrand(companyId, prod.id, p.company);
          const row = await ensureBrand(companyId, prod.id, p.company, userId);
          seenB.set(kb, row); if (!before) stats.companies += 1;
        }
      }
      brand = seenB.get(kb);
    }
    if (p.category) {
      const kc = `${kp}|${kb}|${low(p.category)}`;
      if (!seenC.has(kc)) {
        seenC.add(kc);
        if (dryRun) stats.categories += 1; else {
          const before = await require('./catalogueMaster.service').findCategory(companyId, prod.id, brand ? brand.id : null, p.category);
          await ensureCategory(companyId, prod.id, brand ? brand.id : null, p.category, userId);
          if (!before) stats.categories += 1;
        }
      }
    }
  }
  return stats;
}

module.exports = { prepareRows, readRows, importMasters };
