const { Op } = require("sequelize");
const { Item } = require("../models");
const ApiResponse = require("../utils/ApiResponse");
const ApiError = require("../utils/ApiError");
const { getCompanyId, getPagination, paginationMeta, pick } = require("../utils/helpers");

const FIELDS = ["item_type", "category", "sku", "name", "description", "brand", "model_no", "hsn_sac", "unit", "rate",
  "cost_price", "gst_rate", "warranty", "is_active"];

const scope = (req, extra = {}) => {
  const where = { is_deleted: false, ...extra };
  const companyId = getCompanyId(req);
  if (companyId) where.company_id = companyId;
  return where;
};

module.exports = {
  getItems: async (req, res, next) => {
    try {
      const { page, limit, offset } = getPagination(req.query);
      const where = scope(req);
      if (req.query.active !== "all") where.is_active = req.query.active === "false" ? false : true;
      if (req.query.item_type) where.item_type = req.query.item_type;
      if (req.query.category) where.category = req.query.category;
      if (req.query.q) {
        const like = `%${req.query.q}%`;
        where[Op.or] = [{ name: { [Op.like]: like } }, { sku: { [Op.like]: like } }, { brand: { [Op.like]: like } },
          { model_no: { [Op.like]: like } }, { hsn_sac: { [Op.like]: like } }];
      }
      const { rows, count } = await Item.findAndCountAll({ where, order: [["name", "ASC"]], limit, offset });
      // purchase price is internal: only managers and admins see it
      const canSeeCost = ["super_admin", "company_admin", "manager"].includes(req.user.role);
      const items = rows.map((r) => { const j = r.toJSON(); if (!canSeeCost) delete j.cost_price; return j; });
      res.json(new ApiResponse(200, { items, pagination: paginationMeta(count, page, limit) }));
    } catch (error) {
      next(error);
    }
  },

  getCategories: async (req, res, next) => {
    try {
      const rows = await Item.findAll({ where: scope(req, { category: { [Op.ne]: null } }), attributes: ["category"], group: ["category"], order: [["category", "ASC"]], raw: true });
      res.json(new ApiResponse(200, rows.map((r) => r.category)));
    } catch (error) {
      next(error);
    }
  },

  getItem: async (req, res, next) => {
    try {
      const item = await Item.findOne({ where: scope(req, { id: req.params.id }) });
      if (!item) throw new ApiError(404, "Item not found");
      const j = item.toJSON();
      if (!["super_admin", "company_admin", "manager"].includes(req.user.role)) delete j.cost_price;
      res.json(new ApiResponse(200, j));
    } catch (error) {
      next(error);
    }
  },

  createItem: async (req, res, next) => {
    try {
      const companyId = getCompanyId(req);
      if (!companyId) throw new ApiError(400, "companyId is required");
      const patch = pick(req.body, FIELDS);
      if (patch.sku === "") patch.sku = null;
      const item = await Item.create({ ...patch, company_id: companyId, created_by: req.user.id });
      res.status(201).json(new ApiResponse(201, item, "Item created"));
    } catch (error) {
      next(error);
    }
  },

  updateItem: async (req, res, next) => {
    try {
      const item = await Item.findOne({ where: scope(req, { id: req.params.id }) });
      if (!item) throw new ApiError(404, "Item not found");
      const patch = pick(req.body, FIELDS);
      if (patch.sku === "") patch.sku = null;
      // quotations already made keep the price they were issued at - only new quotations see the new rate
      await item.update({ ...patch, updated_by: req.user.id });
      res.json(new ApiResponse(200, item, "Item updated"));
    } catch (error) {
      next(error);
    }
  },

  deleteItem: async (req, res, next) => {
    try {
      const item = await Item.findOne({ where: scope(req, { id: req.params.id }) });
      if (!item) throw new ApiError(404, "Item not found");
      await item.update({ is_active: false, is_deleted: true, updated_by: req.user.id });
      res.json(new ApiResponse(200, null, "Item deleted"));
    } catch (error) {
      next(error);
    }
  },
};
