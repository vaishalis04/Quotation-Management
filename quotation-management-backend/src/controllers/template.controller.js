const fs = require("fs");
const path = require("path");
const { Op } = require("sequelize");
const { QuotationTemplate } = require("../models");
const ApiResponse = require("../utils/ApiResponse");
const ApiError = require("../utils/ApiError");
const { getCompanyId, pick } = require("../utils/helpers");
const { UPLOAD_DIR, looksLikeOfficeFile } = require("../middleware/upload.middleware");
const { validateLayout, renderWithTemplate, dummyQuotation, MIME } = require("../services/render.service");
const { buildRenderContext } = require("../services/renderContext.service");
const { sampleHtml, sampleDocxBuffer, sampleXlsxBuffer } = require("../services/sampleTemplate.service");

const LIGHT = { exclude: ["html_content"] }; // keep list responses small

const removeFile = (rel) => {
  try {
    const full = path.resolve(UPLOAD_DIR, rel || "");
    if (rel && full.startsWith(UPLOAD_DIR + path.sep) && fs.existsSync(full)) fs.unlinkSync(full);
  } catch { /* best effort */ }
};

// Which company does a write belong to? super_admin may create shared layouts (company_id NULL) with ?shared=true
const writeOwner = (req) => {
  if (req.user.role === "super_admin") return req.query.shared === "true" ? null : getCompanyId(req);
  return req.user.company_id;
};

const findWritable = async (req) => {
  const t = await QuotationTemplate.findOne({ where: { id: req.params.id, is_deleted: false } });
  if (!t) throw new ApiError(404, "Layout not found");
  if (t.company_id === null ? req.user.role !== "super_admin" : req.user.role !== "super_admin" && String(t.company_id) !== String(req.user.company_id)) {
    throw new ApiError(403, "You cannot change this layout");
  }
  return t;
};

const makeDefault = async (t) => {
  await QuotationTemplate.update({ is_default: false }, {
    where: { company_id: t.company_id, ...(t.company_id === null && { business_type: t.business_type }), id: { [Op.ne]: t.id } },
  });
};

const flatten = (obj, prefix = "", out = []) => {
  Object.entries(obj).forEach(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v)) { if (v[0] && typeof v[0] === "object") out.push({ loop: key, fields: Object.keys(v[0]).map((f) => ({ tag: f, example: v[0][f] })) }); }
    else if (v && typeof v === "object") flatten(v, key, out);
    else out.push({ tag: key, example: v });
  });
  return out;
};

module.exports = {
  getTemplates: async (req, res, next) => {
    try {
      const companyId = getCompanyId(req);
      const where = { is_deleted: false };
      where[Op.or] = companyId ? [{ company_id: companyId }, { company_id: null }] : [{ company_id: null }, { company_id: { [Op.ne]: null } }];
      if (req.query.format) where.format = req.query.format;
      if (req.query.business_type) where.business_type = req.query.business_type;
      if (req.query.active !== "all") where.is_active = req.query.active === "false" ? false : true;
      res.json(new ApiResponse(200, await QuotationTemplate.findAll({ where, attributes: LIGHT, order: [["name", "ASC"]] })));
    } catch (error) {
      next(error);
    }
  },

  getTemplate: async (req, res, next) => {
    try {
      const companyId = getCompanyId(req);
      const where = { id: req.params.id, is_deleted: false };
      if (companyId) where[Op.or] = [{ company_id: companyId }, { company_id: null }];
      const t = await QuotationTemplate.findOne({ where });
      if (!t) throw new ApiError(404, "Layout not found");
      res.json(new ApiResponse(200, t));
    } catch (error) {
      next(error);
    }
  },

  // multipart: file (.docx / .xlsx) + name, business_type, description, is_default
  uploadTemplate: async (req, res, next) => {
    const file = req.file;
    try {
      if (!file) throw new ApiError(400, "Layout file is required (field name: file)");
      if (!looksLikeOfficeFile(file.path)) throw new ApiError(400, "This file is not a valid Word/Excel document");
      const format = path.extname(file.originalname).toLowerCase().slice(1); // docx | xlsx
      const owner = writeOwner(req);
      if (owner === undefined || (owner === null && req.query.shared !== "true")) throw new ApiError(400, "companyId is required");

      await validateLayout({ format, buffer: fs.readFileSync(file.path) }); // throws 400 with the exact tag problem

      const t = await QuotationTemplate.create({
        company_id: owner,
        name: req.body.name || path.basename(file.originalname, path.extname(file.originalname)),
        business_type: req.body.business_type || "other",
        description: req.body.description || null,
        format, file_path: `layouts/${file.filename}`, original_name: file.originalname,
        is_default: req.body.is_default === "true" || req.body.is_default === true,
        created_by: req.user.id,
      });
      if (t.is_default) await makeDefault(t);
      res.status(201).json(new ApiResponse(201, t, "Layout uploaded and checked"));
    } catch (error) {
      if (file) removeFile(`layouts/${file.filename}`);
      next(error);
    }
  },

  // JSON: { name, html_content, business_type, description, is_default }
  createHtmlTemplate: async (req, res, next) => {
    try {
      const { name, html_content } = req.body;
      if (!name || !html_content) throw new ApiError(400, "name and html_content are required");
      const owner = writeOwner(req);
      if (owner === undefined || (owner === null && req.query.shared !== "true")) throw new ApiError(400, "companyId is required");
      await validateLayout({ format: "html", html: html_content });
      const t = await QuotationTemplate.create({
        company_id: owner, name, format: "html", html_content,
        business_type: req.body.business_type || "other", description: req.body.description || null,
        is_default: !!req.body.is_default, created_by: req.user.id,
      });
      if (t.is_default) await makeDefault(t);
      res.status(201).json(new ApiResponse(201, t, "Layout created and checked"));
    } catch (error) {
      next(error);
    }
  },

  updateTemplate: async (req, res, next) => {
    try {
      const t = await findWritable(req);
      const patch = pick(req.body, ["name", "description", "business_type", "is_default", "is_active"]);
      if (req.body.html_content !== undefined) {
        if (t.format !== "html") throw new ApiError(400, "Only HTML layouts have inline content - upload a new file for Word/Excel layouts");
        await validateLayout({ format: "html", html: req.body.html_content });
        patch.html_content = req.body.html_content;
      }
      await t.update({ ...patch, updated_by: req.user.id });
      if (t.is_default) await makeDefault(t);
      res.json(new ApiResponse(200, t, "Layout updated"));
    } catch (error) {
      next(error);
    }
  },

  // multipart: file - replaces the file of an existing docx/xlsx layout (same format only)
  replaceTemplateFile: async (req, res, next) => {
    const file = req.file;
    try {
      const t = await findWritable(req);
      if (!file) throw new ApiError(400, "Layout file is required (field name: file)");
      const format = path.extname(file.originalname).toLowerCase().slice(1);
      if (t.format === "html" || format !== t.format) throw new ApiError(400, `Upload a .${t.format} file to replace this layout`);
      if (!looksLikeOfficeFile(file.path)) throw new ApiError(400, "This file is not a valid Word/Excel document");
      await validateLayout({ format, buffer: fs.readFileSync(file.path) });
      const old = t.file_path;
      await t.update({ file_path: `layouts/${file.filename}`, original_name: file.originalname, updated_by: req.user.id });
      removeFile(old);
      res.json(new ApiResponse(200, t, "Layout file replaced and checked"));
    } catch (error) {
      if (file) removeFile(`layouts/${file.filename}`);
      next(error);
    }
  },

  deleteTemplate: async (req, res, next) => {
    try {
      const t = await findWritable(req);
      await t.update({ is_deleted: true, is_active: false, is_default: false, updated_by: req.user.id });
      removeFile(t.file_path);
      res.json(new ApiResponse(200, null, "Layout deleted"));
    } catch (error) {
      next(error);
    }
  },

  // the original layout file (so a user can edit it and upload it again)
  downloadTemplate: async (req, res, next) => {
    try {
      const companyId = getCompanyId(req);
      const where = { id: req.params.id, is_deleted: false };
      if (companyId) where[Op.or] = [{ company_id: companyId }, { company_id: null }];
      const t = await QuotationTemplate.findOne({ where });
      if (!t) throw new ApiError(404, "Layout not found");
      const safe = t.name.replace(/[^\w.-]+/g, "_");
      if (t.format === "html") {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${safe}.html"`);
        return res.send(t.html_content);
      }
      const full = path.resolve(UPLOAD_DIR, t.file_path || "");
      if (!full.startsWith(UPLOAD_DIR + path.sep) || !fs.existsSync(full)) throw new ApiError(404, "Layout file is missing on the server");
      res.setHeader("Content-Type", MIME[t.format]);
      res.setHeader("Content-Disposition", `attachment; filename="${safe}.${t.format}"`);
      res.send(fs.readFileSync(full));
    } catch (error) {
      next(error);
    }
  },

  // render the layout with dummy data - lets the author see the result before using it on a real quotation
  previewTemplate: async (req, res, next) => {
    try {
      const companyId = getCompanyId(req);
      const where = { id: req.params.id, is_deleted: false };
      if (companyId) where[Op.or] = [{ company_id: companyId }, { company_id: null }];
      const t = await QuotationTemplate.findOne({ where });
      if (!t) throw new ApiError(404, "Layout not found");
      const out = await renderWithTemplate({ quotation: dummyQuotation(), template: t, output: req.query.output === "pdf" ? "pdf" : "native" });
      if (out.ext === "html") res.setHeader("Content-Security-Policy", "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:");
      res.setHeader("Content-Type", out.contentType);
      res.setHeader("Content-Disposition", `${out.ext === "html" ? "inline" : "attachment"}; filename="preview.${out.ext}"`);
      res.send(out.buffer);
    } catch (error) {
      next(error);
    }
  },

  // every tag a layout may use - generated from the real context builder so it can never go out of date
  getPlaceholders: async (req, res, next) => {
    try {
      const ctx = buildRenderContext(dummyQuotation()).formatted;
      const all = flatten(ctx);
      res.json(new ApiResponse(200, {
        how_to_use: {
          docx: "Write {company.name} for a value, {#items}...{/items} around a table row or paragraphs to repeat, {#is_intra}...{/is_intra} to show something only when true. Put {#items} in the first cell and {/items} in the last cell of one table row to repeat that row.",
          xlsx: "Write {{company.name}} in a cell. A row containing {{items.name}} (or charges./tax_summary./terms.) is repeated once per entry - keep that row free of anything else. A cell holding only one tag gets a real number.",
          html: "Handlebars: {{company.name}}, {{#each items}}...{{/each}}, {{#if is_intra}}...{{/if}}. Use {{@root.has_discount}} inside {{#each}}. {{nl2br text}} keeps line breaks.",
        },
        tags: all.filter((x) => x.tag),
        loops: all.filter((x) => x.loop),
      }));
    } catch (error) {
      next(error);
    }
  },

  downloadSample: async (req, res, next) => {
    try {
      const { format } = req.params;
      if (format === "docx") {
        res.setHeader("Content-Type", MIME.docx);
        res.setHeader("Content-Disposition", 'attachment; filename="sample-quotation-layout.docx"');
        return res.send(sampleDocxBuffer());
      }
      if (format === "xlsx") {
        res.setHeader("Content-Type", MIME.xlsx);
        res.setHeader("Content-Disposition", 'attachment; filename="sample-quotation-layout.xlsx"');
        return res.send(await sampleXlsxBuffer());
      }
      if (format === "html") {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="sample-quotation-layout.html"');
        return res.send(sampleHtml());
      }
      throw new ApiError(404, "Sample formats: docx, xlsx, html");
    } catch (error) {
      next(error);
    }
  },
};
