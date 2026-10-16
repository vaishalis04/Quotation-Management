const { Op } = require("sequelize");
const { Customer, Quotation } = require("../models");
const ApiResponse = require("../utils/ApiResponse");
const ApiError = require("../utils/ApiError");
const { getCompanyId, getPagination, paginationMeta, pick } = require("../utils/helpers");
const { normalizeGstin, stateCodeFromGstin } = require("../utils/gstin");
const { getState } = require("../config/states");

const FIELDS = ["name", "contact_person", "email", "phone", "gstin", "pan", "billing_address", "city", "state", "state_code",
  "pincode", "shipping_address", "shipping_state_code", "notes"];

const normalise = (patch) => {
  if (patch.gstin !== undefined) patch.gstin = patch.gstin ? normalizeGstin(patch.gstin) : null;
  if (patch.pan) patch.pan = String(patch.pan).toUpperCase();
  for (const k of ["state_code", "shipping_state_code"]) if (patch[k]) patch[k] = String(patch[k]).padStart(2, "0");
  if (patch.gstin && !patch.state_code) patch.state_code = stateCodeFromGstin(patch.gstin);
  if (patch.state_code && !patch.state) patch.state = getState(patch.state_code)?.name;
  return patch;
};

module.exports = {
  getCustomers: async (req, res, next) => {
    try {
      const { page, limit, offset } = getPagination(req.query);
      const where = { is_deleted: false };
      const companyId = getCompanyId(req);
      if (companyId) where.company_id = companyId;
      if (req.query.active !== "all") where.is_active = req.query.active === "false" ? false : true;
      if (req.query.q) {
        const like = `%${req.query.q}%`;
        where[Op.or] = [{ name: { [Op.like]: like } }, { gstin: { [Op.like]: like } }, { phone: { [Op.like]: like } }, { contact_person: { [Op.like]: like } }];
      }
      const { rows, count } = await Customer.findAndCountAll({ where, order: [["name", "ASC"]], limit, offset });
      res.json(new ApiResponse(200, { customers: rows, pagination: paginationMeta(count, page, limit) }));
    } catch (error) {
      next(error);
    }
  },

  getCustomer: async (req, res, next) => {
    try {
      const where = { id: req.params.id, is_deleted: false };
      const companyId = getCompanyId(req);
      if (companyId) where.company_id = companyId;
      const customer = await Customer.findOne({ where });
      if (!customer) throw new ApiError(404, "Customer not found");
      res.json(new ApiResponse(200, customer));
    } catch (error) {
      next(error);
    }
  },

  createCustomer: async (req, res, next) => {
    try {
      const companyId = getCompanyId(req);
      if (!companyId) throw new ApiError(400, "companyId is required");
      const customer = await Customer.create({ ...normalise(pick(req.body, FIELDS)), company_id: companyId, created_by: req.user.id });
      res.status(201).json(new ApiResponse(201, customer, "Customer created"));
    } catch (error) {
      next(error);
    }
  },

  updateCustomer: async (req, res, next) => {
    try {
      const where = { id: req.params.id, is_deleted: false };
      const companyId = getCompanyId(req);
      if (companyId) where.company_id = companyId;
      const customer = await Customer.findOne({ where });
      if (!customer) throw new ApiError(404, "Customer not found");
      // old quotations keep their own frozen copy of the customer, so editing here never rewrites history
      await customer.update({ ...normalise(pick(req.body, FIELDS)), updated_by: req.user.id });
      res.json(new ApiResponse(200, customer, "Customer updated"));
    } catch (error) {
      next(error);
    }
  },

  // logo of the customer (shown on quotation layouts that use {{customer.logo_data_uri}})
  uploadLogo: async (req, res, next) => {
    try {
      if (!req.file) throw new ApiError(400, "Logo image is required (field name: logo)");
      const where = { id: req.params.id, is_deleted: false };
      const companyId = getCompanyId(req);
      if (companyId) where.company_id = companyId;
      const customer = await Customer.findOne({ where });
      if (!customer) throw new ApiError(404, "Customer not found");
      await customer.update({ logo: `logos/${req.file.filename}`, updated_by: req.user.id });
      res.json(new ApiResponse(200, customer, "Logo uploaded"));
    } catch (error) {
      next(error);
    }
  },

  removeLogo: async (req, res, next) => {
    try {
      const where = { id: req.params.id, is_deleted: false };
      const companyId = getCompanyId(req);
      if (companyId) where.company_id = companyId;
      const customer = await Customer.findOne({ where });
      if (!customer) throw new ApiError(404, "Customer not found");
      await customer.update({ logo: null, updated_by: req.user.id });
      res.json(new ApiResponse(200, customer, "Logo removed"));
    } catch (error) {
      next(error);
    }
  },

  deleteCustomer: async (req, res, next) => {
    try {
      const where = { id: req.params.id, is_deleted: false };
      const companyId = getCompanyId(req);
      if (companyId) where.company_id = companyId;
      const customer = await Customer.findOne({ where });
      if (!customer) throw new ApiError(404, "Customer not found");
      const used = await Quotation.count({ where: { customer_id: customer.id, is_deleted: false } });
      await customer.update(used ? { is_active: false, updated_by: req.user.id } : { is_active: false, is_deleted: true, updated_by: req.user.id });
      res.json(new ApiResponse(200, null, used ? "Customer deactivated (has quotations)" : "Customer deleted"));
    } catch (error) {
      next(error);
    }
  },
};
