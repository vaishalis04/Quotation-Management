const jwt = require("jsonwebtoken");
const { User, Company } = require("../models");
const ApiResponse = require("../utils/ApiResponse");
const ApiError = require("../utils/ApiError");

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "7d" });

module.exports = {
  login: async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const user = await User.scope("withPassword").findOne({
        where: { email: String(email).trim().toLowerCase(), is_active: true, is_deleted: false },
      });
      if (!user || !(await user.comparePassword(password))) throw new ApiError(401, "Invalid email or password");

      await user.update({ last_login: new Date() });

      const userData = user.toJSON();
      delete userData.password;
      userData.company = user.company_id ? (await Company.findByPk(user.company_id))?.toJSON() || null : null;

      res.json(new ApiResponse(200, { user: userData, token: generateToken(user.id) }, "Login successful"));
    } catch (error) {
      next(error);
    }
  },

  // Admin creates login accounts. super_admin can create anything; company_admin only inside own company.
  register: async (req, res, next) => {
    try {
      const { name, email, password, role, phone } = req.body;
      const companyId = req.user.role === "super_admin" ? req.body.companyId || null : req.user.company_id;
      if (req.user.role !== "super_admin" && !companyId) throw new ApiError(400, "Your account has no company");
      if (req.user.role !== "super_admin" && role === "company_admin" && req.user.role !== "company_admin") {
        throw new ApiError(403, "Only a company admin can create another company admin");
      }

      const existing = await User.findOne({ where: { email: email.toLowerCase() } });
      if (existing) throw new ApiError(400, "User with this email already exists");

      const user = await User.create({
        name, email: email.toLowerCase(), phone, password, role: role || "sales", company_id: companyId, created_by: req.user.id,
      });
      res.status(201).json(new ApiResponse(201, user, "User created"));
    } catch (error) {
      next(error);
    }
  },

  listUsers: async (req, res, next) => {
    try {
      const where = { is_deleted: false };
      if (req.user.role !== "super_admin") where.company_id = req.user.company_id;
      else if (req.query.companyId) where.company_id = req.query.companyId;
      const users = await User.findAll({ where, order: [["name", "ASC"]] });
      res.json(new ApiResponse(200, users));
    } catch (error) {
      next(error);
    }
  },

  setUserActive: async (req, res, next) => {
    try {
      const where = { id: req.params.id, is_deleted: false };
      if (req.user.role !== "super_admin") where.company_id = req.user.company_id;
      const user = await User.findOne({ where });
      if (!user) throw new ApiError(404, "User not found");
      if (String(user.id) === String(req.user.id)) throw new ApiError(400, "You cannot change your own active status");
      await user.update({ is_active: !!req.body.is_active, updated_by: req.user.id });
      res.json(new ApiResponse(200, user, user.is_active ? "User activated" : "User deactivated"));
    } catch (error) {
      next(error);
    }
  },

  getMe: async (req, res, next) => {
    try {
      const company = req.user.company_id ? await Company.findByPk(req.user.company_id) : null;
      res.json(new ApiResponse(200, { user: req.user, company }));
    } catch (error) {
      next(error);
    }
  },

  changePassword: async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const user = await User.scope("withPassword").findByPk(req.user.id);
      if (!(await user.comparePassword(currentPassword))) throw new ApiError(400, "Current password is incorrect");
      user.password = newPassword; // hashed by the beforeUpdate hook
      await user.save();
      res.json(new ApiResponse(200, null, "Password changed"));
    } catch (error) {
      next(error);
    }
  },
};
