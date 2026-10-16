import { composeItemName } from '../utils/itemName';

export const NO_COMPANY = '__none__';
const NONE = [];
const sid = (v) => String(v ?? '');

// What can be chosen next, from the Product masters tree (Product > Company > Category).
export function optionsFor(tree, row) {
  const product = tree.find((p) => sid(p.id) === sid(row.product_id)) || null;
  const companies = product ? product.companies : NONE;
  const hasCompanyStep = companies.length > 0;
  const company = hasCompanyStep && row.brand_id ? companies.find((c) => sid(c.id) === sid(row.brand_id)) || null : null;
  const noCompany = !!row.no_company;
  const companyDone = !hasCompanyStep || !!company || noCompany;
  // categories sit under the chosen company, or directly under the product when there is no company
  const categories = !product || !companyDone ? NONE : company ? company.categories : product.categories;
  const showNoCompany = hasCompanyStep && product.categories.length > 0;
  return { product, companies, company, hasCompanyStep, showNoCompany, categories, showCategory: companyDone && categories.length > 0 };
}

// Saved quotation lines only keep the printed name: find the product / company / category that builds exactly that name.
export function matchByName(tree, name) {
  const want = String(name || '').trim().toLowerCase();
  if (!want) return null;
  const nm = (p, c, b) => composeItemName({ product: p, category: c, brand: b }).toLowerCase();
  for (const p of tree) {
    if (nm(p.name) === want) return { product_id: String(p.id), brand_id: '', category_id: '', no_company: false, brand: '' };
    for (const c of p.categories) if (nm(p.name, c.name) === want) return { product_id: String(p.id), brand_id: '', category_id: String(c.id), no_company: true, brand: '' };
    for (const b of p.companies) {
      if (nm(p.name, '', b.name) === want) return { product_id: String(p.id), brand_id: String(b.id), category_id: '', no_company: false, brand: b.name };
      for (const c of b.categories) if (nm(p.name, c.name, b.name) === want) return { product_id: String(p.id), brand_id: String(b.id), category_id: String(c.id), no_company: false, brand: b.name };
    }
  }
  return null;
}

/**
 * Item box of a quotation row: pick Product -> Company -> Category from the Product masters.
 * The printed name (e.g. "Camera ip 4mp dome CP Plus") is built from the choices and can still be adjusted.
 * Rate, HSN/SAC, quantity, discount and GST are typed on the row - nothing is pre-filled from a price list.
 */
export default function ProductPicker({ tree = NONE, row, onChange }) {
  const o = optionsFor(tree, row);
  const name = (patch) => {
    const next = { ...row, ...patch };
    const opt = optionsFor(tree, next);
    const cat = opt.categories.find((c) => sid(c.id) === sid(next.category_id));
    const brand = opt.company ? opt.company.name : '';
    return { ...patch, brand, item_id: '', name: opt.product ? composeItemName({ product: opt.product.name, category: cat ? cat.name : '', brand }) : row.name };
  };

  const pickProduct = (e) => onChange(name({ product_id: e.target.value, brand_id: '', category_id: '', no_company: false }));
  const pickCompany = (e) => {
    const v = e.target.value;
    onChange(name({ brand_id: v === NO_COMPANY ? '' : v, no_company: v === NO_COMPANY, category_id: '' }));
  };
  const pickCategory = (e) => onChange(name({ category_id: e.target.value }));

  return (
    <div className="picker">
      <select className="input" value={row.product_id || ''} aria-label="Product" onChange={pickProduct}>
        <option value="">1. Select product…</option>
        {tree.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {o.product && o.hasCompanyStep && (
        <select className="input sm mt" value={row.brand_id || (row.no_company ? NO_COMPANY : '')} aria-label="Company" onChange={pickCompany}>
          <option value="">2. Select company…</option>
          {o.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          {o.showNoCompany && <option value={NO_COMPANY}>No company (local / third party)</option>}
        </select>
      )}
      {o.showCategory && (
        <select className="input sm mt" value={row.category_id || ''} aria-label="Category" onChange={pickCategory}>
          <option value="">3. Select category…</option>
          {o.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      <input className="input sm mt" value={row.name} placeholder="Name as printed (fills from your selection)" aria-label="Item name"
        onChange={(e) => onChange({ name: e.target.value })} />
      {tree.length === 0 && <span className="hint">No products yet — add them under Product masters.</span>}
    </div>
  );
}
