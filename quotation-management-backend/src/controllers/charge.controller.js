const { Op } = require("sequelize");
const { ChargeMaster } = require("../models");
const ApiResponse = require("../utils/ApiResponse");
const ApiError = require("../utils/ApiError");
const { getCompanyId, pick } = require("../utils/helpers");

const FIELDS = ["name", "description", "hsn_sac", "default_amount", "gst_rate", "is_active"];

const scope = (req, extra = {}) => {
  const where = { is_deleted: false, ...extra };
  const companyId = getCompanyId(req);
  if (companyId) where.company_id = companyId;
  return where;
};

// '' -> null for the optional text columns
const clean = (patch) => {
  ["description", "hsn_sac"].forEach((k) => { if (patch[k] === "") patch[k] = null; });
  if (patch.default_amount === "") patch.default_amount = 0;
  return patch;
};

module.exports = {
  getCharges: async (req, res, next) => {
    try {
      const where = scope(req);
      if (req.query.active !== "all") where.is_active = req.query.active === "false" ? false : true;
      if (req.query.q) where.name = { [Op.like]: `%${req.query.q}%` };
      res.json(new ApiResponse(200, await ChargeMaster.findAll({ where, order: [["name", "ASC"]] })));
    } catch (error) {
      next(error);
    }
  },

  createCharge: async (req, res, next) => {
    try {
      const companyId = getCompanyId(req);
      if (!companyId) throw new ApiError(400, "companyId is required");
      const row = await ChargeMaster.create({ ...clean(pick(req.body, FIELDS)), company_id: companyId, created_by: req.user.id });
      res.status(201).json(new ApiResponse(201, row, "Charge created"));
    } catch (error) {
      next(error);
    }
  },

  updateCharge: async (req, res, next) => {
    try {
      const row = await ChargeMaster.findOne({ where: scope(req, { id: req.params.id }) });
      if (!row) throw new ApiError(404, "Charge not found");
      await row.update({ ...clean(pick(req.body, FIELDS)), updated_by: req.user.id });
      res.json(new ApiResponse(200, row, "Charge updated"));
    } catch (error) {
      next(error);
    }
  },

  deleteCharge: async (req, res, next) => {
    try {
      const row = await ChargeMaster.findOne({ where: scope(req, { id: req.params.id }) });
      if (!row) throw new ApiError(404, "Charge not found");
      await row.update({ is_deleted: true, is_active: false, updated_by: req.user.id });
      res.json(new ApiResponse(200, null, "Charge deleted"));
    } catch (error) {
      next(error);
    }
  },
};
