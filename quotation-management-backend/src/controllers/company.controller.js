const { Company, User, sequelize } = require("../models");
const ApiResponse = require("../utils/ApiResponse");
const ApiError = require("../utils/ApiError");
const { getPagination, paginationMeta, pick } = require("../utils/helpers");
const { stateCodeFromGstin, normalizeGstin } = require("../utils/gstin");
const { getState } = require("../config/states");

const FIELDS = [
  "name", "legal_name", "business_type", "email", "phone", "website", "address", "city", "state", "state_code", "pincode",
  "gstin", "pan", "bank_name", "bank_account_name", "bank_account_no", "bank_ifsc", "bank_branch", "upi_id",
  "signatory_name", "signatory_designation", "quote_prefix", "quote_number_padding", "default_validity_days",
  "default_gst_treatment", "default_price_mode", "round_off_enabled", "default_terms",
];

// GSTIN is the best source for the state code; keep state name and code consistent
const normalise = (patch, current = {}) => {
  if (patch.gstin !== undefined) patch.gstin = patch.gstin ? normalizeGstin(patch.gstin) : null;
  if (patch.pan) patch.pan = String(patch.pan).toUpperCase();
  if (patch.quote_prefix) patch.quote_prefix = String(patch.quote_prefix).trim();
  if (patch.state_code) patch.state_code = String(patch.state_code).padStart(2, "0");
  const gstin = patch.gstin !== undefined ? patch.gstin : current.gstin;
  if (gstin && !patch.state_code) patch.state_code = stateCodeFromGstin(gstin);
  const code = patch.state_code || current.state_code;
  if (code && !patch.state) {
    const s = getState(code);
    if (s) patch.state = s.name;
  }
  return patch;
};

module.exports = {
  // ---- super admin
  listCompanies: async (req, res, next) => {
    try {
      const { page, limit, offset } = getPagination(req.query);
      const { rows, count } = await Company.findAndCountAll({ where: { is_deleted: false }, order: [["name", "ASC"]], limit, offset });
      res.json(new ApiResponse(200, { companies: rows, pagination: paginationMeta(count, page, limit) }));
    } catch (error) {
      next(error);
    }
  },

  // Creates the company and (optionally) its first admin login in one go
  createCompany: async (req, res, next) => {
    try {
      const { admin_name, admin_email, admin_password } = req.body;
      const patch = normalise(pick(req.body, FIELDS));

      const result = await sequelize.transaction(async (t) => {
        const company = await Company.create({ ...patch, created_by: req.user.id }, { transaction: t });
        let admin = null;
        if (admin_email && admin_password) {
          if (await User.findOne({ where: { email: admin_email.toLowerCase() }, transaction: t })) {
            throw new ApiError(400, "User with this email already exists");
          }
          admin = await User.create({
            name: admin_name || company.name, email: admin_email.toLowerCase(), password: admin_password,
            role: "company_admin", company_id: company.id, created_by: req.user.id,
          }, { transaction: t });
        }
        return { company, admin };
      });
      res.status(201).json(new ApiResponse(201, result, "Company created"));
    } catch (error) {
      next(error);
    }
  },

  updateCompany: async (req, res, next) => {
    try {
      const company = await Company.findOne({ where: { id: req.params.id, is_deleted: false } });
      if (!company) throw new ApiError(404, "Company not found");
      const patch = normalise(pick(req.body, FIELDS), company);
      if (req.body.is_active !== undefined) patch.is_active = !!req.body.is_active;
      await company.update({ ...patch, updated_by: req.user.id });
      res.json(new ApiResponse(200, company, "Company updated"));
    } catch (error) {
      next(error);
    }
  },

  // ---- the logged-in user's own company
  getMyCompany: async (req, res, next) => {
    try {
      const id = req.user.role === "super_admin" ? req.query.companyId : req.user.company_id;
      const company = id ? await Company.findOne({ where: { id, is_deleted: false } }) : null;
      if (!company) throw new ApiError(404, "Company not found");
      res.json(new ApiResponse(200, company));
    } catch (error) {
      next(error);
    }
  },

  updateMyCompany: async (req, res, next) => {
    try {
      const id = req.user.role === "super_admin" ? req.query.companyId || req.body.companyId : req.user.company_id;
      const company = id ? await Company.findOne({ where: { id, is_deleted: false } }) : null;
      if (!company) throw new ApiError(404, "Company not found");
      await company.update({ ...normalise(pick(req.body, FIELDS), company), updated_by: req.user.id });
      res.json(new ApiResponse(200, company, "Company profile updated"));
    } catch (error) {
      next(error);
    }
  },

  uploadLogo: async (req, res, next) => {
    try {
      if (!req.file) throw new ApiError(400, "Logo image is required (field name: logo)");
      const id = req.user.role === "super_admin" ? req.query.companyId : req.user.company_id;
      const company = id ? await Company.findOne({ where: { id, is_deleted: false } }) : null;
      if (!company) throw new ApiError(404, "Company not found");
      await company.update({ logo: `logos/${req.file.filename}`, updated_by: req.user.id });
      res.json(new ApiResponse(200, { logo: company.logo }, "Logo uploaded"));
    } catch (error) {
      next(error);
    }
  },
};
