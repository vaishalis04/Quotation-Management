const { TermsTemplate } = require("../models");
const ApiResponse = require("../utils/ApiResponse");
const ApiError = require("../utils/ApiError");
const { getCompanyId, pick } = require("../utils/helpers");

const FIELDS = ["name", "business_type", "content", "is_default", "is_active"];
const scope = (req, extra = {}) => {
  const where = { is_deleted: false, ...extra };
  const companyId = getCompanyId(req);
  if (companyId) where.company_id = companyId;
  return where;
};

// only one default per company
const clearOtherDefaults = (companyId, exceptId) => {
  const { Op } = require("sequelize");
  return TermsTemplate.update({ is_default: false }, { where: { company_id: companyId, ...(exceptId && { id: { [Op.ne]: exceptId } }) } });
};

module.exports = {
  getTerms: async (req, res, next) => {
    try {
      const where = scope(req);
      if (req.query.business_type) where.business_type = req.query.business_type;
      res.json(new ApiResponse(200, await TermsTemplate.findAll({ where, order: [["name", "ASC"]] })));
    } catch (error) {
      next(error);
    }
  },

  createTerms: async (req, res, next) => {
    try {
      const companyId = getCompanyId(req);
      if (!companyId) throw new ApiError(400, "companyId is required");
      const row = await TermsTemplate.create({ ...pick(req.body, FIELDS), company_id: companyId, created_by: req.user.id });
      if (row.is_default) await clearOtherDefaults(companyId, row.id);
      res.status(201).json(new ApiResponse(201, row, "Terms template created"));
    } catch (error) {
      next(error);
    }
  },

  updateTerms: async (req, res, next) => {
    try {
      const row = await TermsTemplate.findOne({ where: scope(req, { id: req.params.id }) });
      if (!row) throw new ApiError(404, "Terms template not found");
      await row.update({ ...pick(req.body, FIELDS), updated_by: req.user.id });
      if (row.is_default) await clearOtherDefaults(row.company_id, row.id);
      res.json(new ApiResponse(200, row, "Terms template updated"));
    } catch (error) {
      next(error);
    }
  },

  deleteTerms: async (req, res, next) => {
    try {
      const row = await TermsTemplate.findOne({ where: scope(req, { id: req.params.id }) });
      if (!row) throw new ApiError(404, "Terms template not found");
      await row.update({ is_deleted: true, is_active: false, updated_by: req.user.id });
      res.json(new ApiResponse(200, null, "Terms template deleted"));
    } catch (error) {
      next(error);
    }
  },
};
