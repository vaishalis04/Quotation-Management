const { fn, col, where: sqlWhere, Op } = require('sequelize');
const { Item, ProductMaster, BrandMaster, CategoryMaster } = require('../models');
const ApiError = require('../utils/ApiError');
const { composeItemName } = require('../utils/itemName');

/**
 * Product -> Company -> Category masters.
 *   Product   (required) : Camera, NVR, Cable ...
 *   Company   (optional) : belongs to ONE product (CP Plus under Camera)
 *   Category  (optional) : belongs to a company, or directly to the product when there is no company
 * An item stores the three ids plus the three names as text (product / brand / category) so printing, search and the
 * quotation picker keep working from the names.
 */

const text = (v) => (v === null || v === undefined ? '' : String(v).trim());
const blank = (v) => text(v) === '';
const sameName = (name) => sqlWhere(fn('lower', col('name')), text(name).toLowerCase());

const live = (companyId, extra = {}) => ({ company_id: companyId, is_deleted: false, ...extra });

const findProduct = (companyId, name) => ProductMaster.findOne({ where: live(companyId, { [Op.and]: [sameName(name)] }) });
const findBrand = (companyId, productId, name) => BrandMaster.findOne({ where: live(companyId, { product_id: productId, [Op.and]: [sameName(name)] }) });
const findCategory = (companyId, productId, brandId, name) => CategoryMaster.findOne({ where: live(companyId, { product_id: productId, brand_id: brandId || null, [Op.and]: [sameName(name)] }) });

async function ensureProduct(companyId, name, userId) {
  return (await findProduct(companyId, name)) || ProductMaster.create({ company_id: companyId, name: text(name), created_by: userId || null });
}
async function ensureBrand(companyId, productId, name, userId) {
  return (await findBrand(companyId, productId, name)) || BrandMaster.create({ company_id: companyId, product_id: productId, name: text(name), created_by: userId || null });
}
async function ensureCategory(companyId, productId, brandId, name, userId) {
  return (await findCategory(companyId, productId, brandId, name)) || CategoryMaster.create({ company_id: companyId, product_id: productId, brand_id: brandId || null, name: text(name), created_by: userId || null });
}

/**
 * Works out product / company / category for an item being created or updated, from ids (what the Items form sends)
 * or plain names (API / Excel import: found or created automatically). Writes product_id, brand_id, category_id and the
 * three name columns into `patch`. Rules: product is required (a plain item such as "CCTV Installation" becomes its own
 * product), the company must belong to the product, the category to that company (or to the product when no company).
 */
async function applyMasters({ companyId, userId, patch, existing = null }) {
  const keys = ['product_id', 'brand_id', 'category_id', 'product', 'brand', 'category'];
  if (existing && !keys.some((k) => patch[k] !== undefined)) return patch; // this update does not touch them

  // where each level comes from: an explicit id, an explicit name, or what the item already has
  const source = (level) => {
    if (patch[`${level}_id`] !== undefined) return { kind: 'id', value: patch[`${level}_id`], explicit: true };
    if (patch[level] !== undefined) return { kind: 'name', value: patch[level], explicit: true };
    if (existing) return { kind: 'id', value: existing[`${level}_id`], explicit: false };
    return { kind: 'none', value: null, explicit: false };
  };
  const bad = (msg) => new ApiError(422, msg);

  // ---- product
  let product = null;
  const sp = source('product');
  if (sp.kind === 'id' && !blank(sp.value)) {
    product = await ProductMaster.findOne({ where: live(companyId, { id: sp.value }) });
    if (!product) throw bad('Product not found - create it under Product masters first');
  } else if (sp.kind === 'name' && !blank(sp.value)) {
    product = await ensureProduct(companyId, sp.value, userId);
  } else if (!existing && !blank(patch.name)) {
    product = await ensureProduct(companyId, patch.name, userId); // plain item: it is its own product
  }
  if (!product) throw bad('Product is required');

  // ---- company (optional)
  let brand = null;
  const sb = source('brand');
  if (sb.kind === 'id' && !blank(sb.value)) {
    brand = await BrandMaster.findOne({ where: live(companyId, { id: sb.value }) });
    if (!brand) { if (sb.explicit) throw bad('Company not found'); }
    else if (String(brand.product_id) !== String(product.id)) {
      if (sb.explicit) throw bad(`Company "${brand.name}" does not belong to product "${product.name}"`);
      brand = null; // inherited from before the product was changed
    }
  } else if (sb.kind === 'name' && !blank(sb.value)) {
    brand = await ensureBrand(companyId, product.id, sb.value, userId);
  }

  // ---- category (optional)
  let category = null;
  const sc = source('category');
  if (sc.kind === 'id' && !blank(sc.value)) {
    category = await CategoryMaster.findOne({ where: live(companyId, { id: sc.value }) });
    if (!category) { if (sc.explicit) throw bad('Category not found'); }
    else if (String(category.product_id) !== String(product.id) || String(category.brand_id || '') !== String(brand ? brand.id : '')) {
      if (sc.explicit) throw bad(`Category "${category.name}" does not belong to ${brand ? `company "${brand.name}"` : `product "${product.name}" (without a company)`}`);
      category = null;
    }
  } else if (sc.kind === 'name' && !blank(sc.value)) {
    category = await ensureCategory(companyId, product.id, brand ? brand.id : null, sc.value, userId);
  }

  Object.assign(patch, {
    product_id: product.id, product: product.name,
    brand_id: brand ? brand.id : null, brand: brand ? brand.name : null,
    category_id: category ? category.id : null, category: category ? category.name : null,
  });
  return patch;
}

/** After a master is renamed: update the printed names on its items, and re-build the full name where it was the automatic one. */
async function cascadeRename(level, master, oldName) {
  const field = level; // 'product' | 'brand' | 'category'
  const items = await Item.findAll({ where: { [`${level}_id`]: master.id, is_deleted: false } });
  for (const it of items) {
    const before = { product: it.product, category: it.category, brand: it.brand };
    const after = { ...before, [field]: master.name };
    const patch = { [field]: master.name };
    if (it.name === composeItemName(before)) patch.name = composeItemName(after);
    await it.update(patch);
  }
  return items.length;
}

/** One-off / idempotent: give every existing item its product / company / category master rows (run by `npm run sync-db`). */
async function backfillItemMasters() {
  const items = await Item.findAll({ where: { is_deleted: false, product_id: null } });
  let linked = 0;
  for (const it of items) {
    try {
      const patch = { product: it.product || it.name, brand: it.brand || '', category: it.category || '' };
      await applyMasters({ companyId: it.company_id, userId: null, patch, existing: null });
      await it.update({ product_id: patch.product_id, brand_id: patch.brand_id, category_id: patch.category_id, product: patch.product, brand: patch.brand, category: patch.category });
      linked += 1;
    } catch (e) { console.warn(`Could not link item ${it.id} (${it.name}): ${e.message}`); }
  }
  return linked;
}

module.exports = { applyMasters, ensureProduct, ensureBrand, ensureCategory, cascadeRename, backfillItemMasters, findProduct, findBrand, findCategory };
