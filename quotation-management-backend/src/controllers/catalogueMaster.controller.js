const { fn, col } = require("sequelize");
const { Item, ProductMaster, BrandMaster, CategoryMaster } = require("../models");
const ApiResponse = require("../utils/ApiResponse");
const ApiError = require("../utils/ApiError");
const { getCompanyId } = require("../utils/helpers");
const svc = require("../services/catalogueMaster.service");
const ExcelJS = require("exceljs");
const importSvc = require("../services/masterImport.service");

const text = (v) => (v === null || v === undefined ? "" : String(v).trim());
const scope = (req, extra = {}) => {
  const where = { is_deleted: false, ...extra };
  const companyId = getCompanyId(req);
  if (companyId) where.company_id = companyId;
  return where;
};
const needCompany = (req) => {
  const id = getCompanyId(req);
  if (!id) throw new ApiError(400, "companyId is required");
  return id;
};
const exists = (name) => new ApiError(400, `${name} already exists`);

// the three masters as one nested tree (Product > Company > Category), with how many items use each
const getTree = async (req, res, next) => {
  try {
    const all = req.query.all === "1" || req.query.all === "true";
    const w = (extra = {}) => scope(req, all ? extra : { ...extra, is_active: true });
    const [products, brands, categories, used] = await Promise.all([
      ProductMaster.findAll({ where: w(), order: [["name", "ASC"]] }),
      BrandMaster.findAll({ where: w(), order: [["name", "ASC"]] }),
      CategoryMaster.findAll({ where: w(), order: [["name", "ASC"]] }),
      Item.findAll({ where: scope(req), attributes: ["product_id", "brand_id", "category_id", [fn("count", col("id")), "n"]], group: ["product_id", "brand_id", "category_id"], raw: true }),
    ]);
    const n = { product: {}, brand: {}, category: {} };
    used.forEach((r) => {
      const c = Number(r.n);
      if (r.product_id) n.product[r.product_id] = (n.product[r.product_id] || 0) + c;
      if (r.brand_id) n.brand[r.brand_id] = (n.brand[r.brand_id] || 0) + c;
      if (r.category_id) n.category[r.category_id] = (n.category[r.category_id] || 0) + c;
    });
    const cat = (c) => ({ id: c.id, name: c.name, is_active: c.is_active, product_id: c.product_id, brand_id: c.brand_id, item_count: n.category[c.id] || 0 });
    const tree = products.map((p) => ({
      id: p.id, name: p.name, is_active: p.is_active, item_count: n.product[p.id] || 0,
      companies: brands.filter((b) => String(b.product_id) === String(p.id)).map((b) => ({
        id: b.id, name: b.name, is_active: b.is_active, product_id: b.product_id, item_count: n.brand[b.id] || 0,
        categories: categories.filter((c) => String(c.brand_id) === String(b.id)).map(cat),
      })),
      categories: categories.filter((c) => String(c.product_id) === String(p.id) && !c.brand_id).map(cat), // no company: local / third-party
    }));
    res.json(new ApiResponse(200, { products: tree }));
  } catch (error) { next(error); }
};

// ---------- Product
const createProduct = async (req, res, next) => {
  try {
    const companyId = needCompany(req);
    const name = text(req.body.name);
    if (await svc.findProduct(companyId, name)) throw exists(`Product "${name}"`);
    const row = await ProductMaster.create({ company_id: companyId, name, is_active: req.body.is_active !== false, created_by: req.user.id });
    res.status(201).json(new ApiResponse(201, row, "Product created"));
  } catch (error) { next(error); }
};
const updateProduct = async (req, res, next) => {
  try {
    const row = await ProductMaster.findOne({ where: scope(req, { id: req.params.id }) });
    if (!row) throw new ApiError(404, "Product not found");
    const patch = { updated_by: req.user.id };
    if (req.body.is_active !== undefined) patch.is_active = !!req.body.is_active;
    const old = row.name;
    if (req.body.name !== undefined) {
      const name = text(req.body.name);
      const dup = await svc.findProduct(row.company_id, name);
      if (dup && dup.id !== row.id) throw exists(`Product "${name}"`);
      patch.name = name;
    }
    await row.update(patch);
    if (patch.name && patch.name !== old) await svc.cascadeRename("product", row, old);
    res.json(new ApiResponse(200, row, "Product updated"));
  } catch (error) { next(error); }
};
const deleteProduct = async (req, res, next) => {
  try {
    const row = await ProductMaster.findOne({ where: scope(req, { id: req.params.id }) });
    if (!row) throw new ApiError(404, "Product not found");
    const items = await Item.count({ where: { product_id: row.id, is_deleted: false } });
    if (items) throw new ApiError(409, `${items} item(s) use this product. Move or delete them first, or switch it to inactive.`);
    const kids = (await BrandMaster.count({ where: { product_id: row.id, is_deleted: false } })) + (await CategoryMaster.count({ where: { product_id: row.id, is_deleted: false } }));
    if (kids) throw new ApiError(409, "Delete the companies and categories under this product first.");
    await row.update({ is_deleted: true, is_active: false, updated_by: req.user.id });
    res.json(new ApiResponse(200, null, "Product deleted"));
  } catch (error) { next(error); }
};

// ---------- Company (under a product)
const createCompany = async (req, res, next) => {
  try {
    const companyId = needCompany(req);
    const product = await ProductMaster.findOne({ where: scope(req, { id: req.body.product_id }) });
    if (!product) throw new ApiError(422, "Select the product this company belongs to");
    const name = text(req.body.name);
    if (await svc.findBrand(companyId, product.id, name)) throw exists(`Company "${name}" under ${product.name}`);
    const row = await BrandMaster.create({ company_id: companyId, product_id: product.id, name, is_active: req.body.is_active !== false, created_by: req.user.id });
    res.status(201).json(new ApiResponse(201, row, "Company created"));
  } catch (error) { next(error); }
};
const updateCompany = async (req, res, next) => {
  try {
    const row = await BrandMaster.findOne({ where: scope(req, { id: req.params.id }) });
    if (!row) throw new ApiError(404, "Company not found");
    const patch = { updated_by: req.user.id };
    if (req.body.is_active !== undefined) patch.is_active = !!req.body.is_active;
    const old = row.name;
    if (req.body.name !== undefined) {
      const name = text(req.body.name);
      const dup = await svc.findBrand(row.company_id, row.product_id, name);
      if (dup && dup.id !== row.id) throw exists(`Company "${name}" under this product`);
      patch.name = name;
    }
    await row.update(patch);
    if (patch.name && patch.name !== old) await svc.cascadeRename("brand", row, old);
    res.json(new ApiResponse(200, row, "Company updated"));
  } catch (error) { next(error); }
};
const deleteCompany = async (req, res, next) => {
  try {
    const row = await BrandMaster.findOne({ where: scope(req, { id: req.params.id }) });
    if (!row) throw new ApiError(404, "Company not found");
    const items = await Item.count({ where: { brand_id: row.id, is_deleted: false } });
    if (items) throw new ApiError(409, `${items} item(s) use this company. Move or delete them first, or switch it to inactive.`);
    if (await CategoryMaster.count({ where: { brand_id: row.id, is_deleted: false } })) throw new ApiError(409, "Delete the categories under this company first.");
    await row.update({ is_deleted: true, is_active: false, updated_by: req.user.id });
    res.json(new ApiResponse(200, null, "Company deleted"));
  } catch (error) { next(error); }
};

// ---------- Category (under a company, or directly under a product)
const createCategory = async (req, res, next) => {
  try {
    const companyId = needCompany(req);
    const product = await ProductMaster.findOne({ where: scope(req, { id: req.body.product_id }) });
    if (!product) throw new ApiError(422, "Select the product this category belongs to");
    let brand = null;
    if (text(req.body.brand_id)) {
      brand = await BrandMaster.findOne({ where: scope(req, { id: req.body.brand_id, product_id: product.id }) });
      if (!brand) throw new ApiError(422, "That company does not belong to the selected product");
    }
    const name = text(req.body.name);
    if (await svc.findCategory(companyId, product.id, brand && brand.id, name)) throw exists(`Category "${name}" under ${brand ? brand.name : product.name}`);
    const row = await CategoryMaster.create({ company_id: companyId, product_id: product.id, brand_id: brand ? brand.id : null, name, is_active: req.body.is_active !== false, created_by: req.user.id });
    res.status(201).json(new ApiResponse(201, row, "Category created"));
  } catch (error) { next(error); }
};
const updateCategory = async (req, res, next) => {
  try {
    const row = await CategoryMaster.findOne({ where: scope(req, { id: req.params.id }) });
    if (!row) throw new ApiError(404, "Category not found");
    const patch = { updated_by: req.user.id };
    if (req.body.is_active !== undefined) patch.is_active = !!req.body.is_active;
    const old = row.name;
    if (req.body.name !== undefined) {
      const name = text(req.body.name);
      const dup = await svc.findCategory(row.company_id, row.product_id, row.brand_id, name);
      if (dup && dup.id !== row.id) throw exists(`Category "${name}" here`);
      patch.name = name;
    }
    await row.update(patch);
    if (patch.name && patch.name !== old) await svc.cascadeRename("category", row, old);
    res.json(new ApiResponse(200, row, "Category updated"));
  } catch (error) { next(error); }
};
const deleteCategory = async (req, res, next) => {
  try {
    const row = await CategoryMaster.findOne({ where: scope(req, { id: req.params.id }) });
    if (!row) throw new ApiError(404, "Category not found");
    const items = await Item.count({ where: { category_id: row.id, is_deleted: false } });
    if (items) throw new ApiError(409, `${items} item(s) use this category. Move or delete them first, or switch it to inactive.`);
    await row.update({ is_deleted: true, is_active: false, updated_by: req.user.id });
    res.json(new ApiResponse(200, null, "Category deleted"));
  } catch (error) { next(error); }
};

// ---------- Excel import: Product > Company > Category from a sheet (?dry_run=1 only counts)
const importExcel = async (req, res, next) => {
  try {
    const companyId = needCompany(req);
    if (!req.file) throw new ApiError(400, "Choose an Excel (.xlsx) file");
    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load(req.file.buffer); } catch (e) { throw new ApiError(400, "That file could not be read as an .xlsx workbook"); }
    let read;
    try { read = importSvc.readRows(wb); } catch (e) { throw new ApiError(e.status || 400, e.message); }
    const { prepared, warnings } = importSvc.prepareRows(read.rows);
    const dryRun = req.query.dry_run === "1" || req.query.dry_run === "true";
    const added = await importSvc.importMasters({ companyId, userId: req.user.id, prepared, dryRun });
    res.json(new ApiResponse(200, { sheet: read.sheet, rows: prepared.length, added, warnings, dry_run: dryRun }, dryRun ? "Preview only - nothing saved" : "Import finished"));
  } catch (error) { next(error); }
};

module.exports = { importExcel, getTree, createProduct, updateProduct, deleteProduct, createCompany, updateCompany, deleteCompany, createCategory, updateCategory, deleteCategory };
