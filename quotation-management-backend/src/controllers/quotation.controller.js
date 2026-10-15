const { Op } = require("sequelize");
const { Quotation, QuotationItem, Customer, AuditLog, User } = require("../models");
const ApiResponse = require("../utils/ApiResponse");
const ApiError = require("../utils/ApiError");
const { getCompanyId, getPagination, paginationMeta } = require("../utils/helpers");
const svc = require("../services/quotation.service");
const { resolveTemplate, renderWithTemplate } = require("../services/render.service");

const PRIVILEGED = ["super_admin", "company_admin", "manager"];

const requireCompany = (req) => {
  const id = getCompanyId(req);
  if (!id) throw new ApiError(400, "companyId is required");
  return id;
};

const scopeWhere = (req, extra = {}) => {
  const where = { is_deleted: false, ...extra };
  const companyId = getCompanyId(req);
  if (companyId) where.company_id = companyId;
  return where;
};

// sales people may change only their own quotations; managers and admins may change any
const assertCanModify = (req, q) => {
  if (!PRIVILEGED.includes(req.user.role) && String(q.created_by) !== String(req.user.id)) {
    throw new ApiError(403, "You can only change quotations you created");
  }
};

// MySQL hands DECIMAL columns back as strings ("25230.00"); the API always returns real numbers
const QUOTE_NUMBERS = ["items_gross", "line_discount_total", "overall_discount", "taxable_amount", "cgst_amount", "sgst_amount",
  "igst_amount", "tax_amount", "round_off", "grand_total", "discount_value"];
const LINE_NUMBERS = ["quantity", "rate", "discount_value", "gross_amount", "line_discount", "overall_discount_share", "taxable_amount",
  "gst_rate", "cgst_rate", "cgst_amount", "sgst_rate", "sgst_amount", "igst_rate", "igst_amount", "tax_amount", "line_total"];
const numify = (obj, keys) => keys.forEach((k) => { if (obj[k] !== null && obj[k] !== undefined) obj[k] = Number(obj[k]); });

const shape = (q) => {
  const j = q.toJSON();
  numify(j, QUOTE_NUMBERS);
  (j.lines || []).forEach((l) => numify(l, LINE_NUMBERS));
  const lines = (j.lines || []).sort((a, b) => (a.line_type === b.line_type ? a.line_no - b.line_no : a.line_type < b.line_type ? -1 : 1));
  j.items = lines.filter((l) => l.line_type === "item");
  j.charges = lines.filter((l) => l.line_type === "charge");
  delete j.lines;
  return j;
};

const loadOwn = (req) => svc.getFullQuotation(req.params.id, getCompanyId(req));

module.exports = {
  // Live totals for the entry screen: same engine as saving, nothing is stored and no number is used
  calculate: async (req, res, next) => {
    try {
      const companyId = requireCompany(req);
      const company = await svc.loadCompany(companyId);
      const data = await svc.buildQuotationData({ company, body: req.body, companyId });
      res.json(new ApiResponse(200, {
        supply_type: data.header.supply_type,
        place_of_supply_state_code: data.header.place_of_supply_state_code,
        gst_treatment: data.header.gst_treatment,
        price_mode: data.header.price_mode,
        items: data.calc.items,
        charges: data.calc.charges,
        tax_summary: data.calc.tax_summary,
        totals: data.calc.totals,
      }));
    } catch (error) {
      next(error);
    }
  },

  getQuotations: async (req, res, next) => {
    try {
      const { page, limit, offset } = getPagination(req.query);
      const companyId = getCompanyId(req);
      await svc.expireOverdue(companyId);

      const where = scopeWhere(req);
      if (req.query.all_versions !== "true") where.is_latest = true;
      if (req.query.status) where.status = req.query.status;
      if (req.query.customer_id) where.customer_id = req.query.customer_id;
      if (req.query.created_by) where.created_by = req.query.created_by;
      if (req.query.from || req.query.to) {
        where.quote_date = {};
        if (req.query.from) where.quote_date[Op.gte] = req.query.from;
        if (req.query.to) where.quote_date[Op.lte] = req.query.to;
      }
      if (req.query.q) {
        const like = `%${req.query.q}%`;
        where[Op.or] = [{ quote_number: { [Op.like]: like } }, { subject: { [Op.like]: like } }, { reference_no: { [Op.like]: like } }, { "$customer.name$": { [Op.like]: like } }];
      }

      const { rows, count } = await Quotation.findAndCountAll({
        where,
        attributes: { exclude: ["customer_snapshot", "company_snapshot", "tax_summary", "terms", "notes"] },
        include: [{ model: Customer, as: "customer", attributes: ["id", "name", "gstin"] }],
        order: [["quote_date", "DESC"], ["id", "DESC"]],
        limit, offset, distinct: true,
      });
      res.json(new ApiResponse(200, { quotations: rows, pagination: paginationMeta(count, page, limit) }));
    } catch (error) {
      next(error);
    }
  },

  getQuotation: async (req, res, next) => {
    try {
      res.json(new ApiResponse(200, shape(await loadOwn(req))));
    } catch (error) {
      next(error);
    }
  },

  createQuotation: async (req, res, next) => {
    try {
      const companyId = requireCompany(req);
      const id = await svc.createQuotation({ companyId, body: req.body, user: req.user });
      res.status(201).json(new ApiResponse(201, shape(await svc.getFullQuotation(id, companyId)), "Quotation created"));
    } catch (error) {
      next(error);
    }
  },

  updateQuotation: async (req, res, next) => {
    try {
      const q = await loadOwn(req);
      assertCanModify(req, q);
      await svc.updateQuotation({ quotation: q, body: req.body, user: req.user });
      res.json(new ApiResponse(200, shape(await svc.getFullQuotation(q.id, q.company_id)), "Quotation updated"));
    } catch (error) {
      next(error);
    }
  },

  deleteQuotation: async (req, res, next) => {
    try {
      const q = await Quotation.findOne({ where: scopeWhere(req, { id: req.params.id }) });
      if (!q) throw new ApiError(404, "Quotation not found");
      assertCanModify(req, q);
      if (q.status !== "draft") throw new ApiError(409, "Only draft quotations can be deleted. Cancel it instead.");
      await q.update({ is_deleted: true, updated_by: req.user.id });
      res.json(new ApiResponse(200, null, "Quotation deleted"));
    } catch (error) {
      next(error);
    }
  },

  changeStatus: async (req, res, next) => {
    try {
      const q = await loadOwn(req);
      assertCanModify(req, q);
      await svc.changeStatus({ quotation: q, status: req.body.status, reason: req.body.reason, user: req.user });
      res.json(new ApiResponse(200, shape(await svc.getFullQuotation(q.id, q.company_id)), `Quotation marked ${req.body.status}`));
    } catch (error) {
      next(error);
    }
  },

  reviseQuotation: async (req, res, next) => {
    try {
      const q = await loadOwn(req);
      assertCanModify(req, q);
      const id = await svc.reviseQuotation({ quotation: q, user: req.user });
      res.status(201).json(new ApiResponse(201, shape(await svc.getFullQuotation(id, q.company_id)), "Revision created as a draft"));
    } catch (error) {
      next(error);
    }
  },

  duplicateQuotation: async (req, res, next) => {
    try {
      const q = await loadOwn(req);
      const id = await svc.duplicateQuotation({ quotation: q, user: req.user, customerId: req.body?.customer_id });
      res.status(201).json(new ApiResponse(201, shape(await svc.getFullQuotation(id, q.company_id)), "Quotation duplicated as a new draft"));
    } catch (error) {
      next(error);
    }
  },

  // every version of one quotation
  getVersions: async (req, res, next) => {
    try {
      const q = await Quotation.findOne({ where: scopeWhere(req, { id: req.params.id }) });
      if (!q) throw new ApiError(404, "Quotation not found");
      const rootId = q.root_quotation_id || q.id;
      const versions = await Quotation.findAll({
        where: { company_id: q.company_id, is_deleted: false, [Op.or]: [{ id: rootId }, { root_quotation_id: rootId }] },
        attributes: ["id", "quote_number", "version", "status", "is_latest", "quote_date", "grand_total", "created_at"],
        order: [["version", "ASC"]],
      });
      res.json(new ApiResponse(200, versions));
    } catch (error) {
      next(error);
    }
  },

  getActivity: async (req, res, next) => {
    try {
      const q = await Quotation.findOne({ where: scopeWhere(req, { id: req.params.id }) });
      if (!q) throw new ApiError(404, "Quotation not found");
      const rows = await AuditLog.findAll({
        where: { entity_type: "quotation", entity_id: q.id },
        include: [{ model: User, as: "performer", attributes: ["id", "name"] }],
        order: [["id", "DESC"]],
      });
      res.json(new ApiResponse(200, rows));
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /quotations/:id/render?templateId=&output=native|pdf
   * Fills the company's layout (docx / xlsx / html) with this quotation's calculated figures.
   */
  renderQuotation: async (req, res, next) => {
    try {
      const q = await loadOwn(req);
      const template = await resolveTemplate(q, req.query.templateId);
      const out = await renderWithTemplate({ quotation: q, template, output: req.query.output === "pdf" ? "pdf" : "native" });
      const filename = `${q.display_number.replace(/[^\w.-]+/g, "-")}.${out.ext}`;

      if (out.ext === "html") {
        // an uploaded layout is untrusted markup: no scripts, no network, nothing but inline styles and data: images
        res.setHeader("Content-Security-Policy", "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:");
      }
      res.setHeader("Content-Type", out.contentType);
      res.setHeader("Content-Disposition", `${req.query.inline === "true" ? "inline" : "attachment"}; filename="${filename}"`);
      res.send(out.buffer);
    } catch (error) {
      next(error);
    }
  },
};
