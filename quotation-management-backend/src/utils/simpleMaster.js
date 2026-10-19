const { Op } = require("sequelize");
const ApiResponse = require("./ApiResponse");
const ApiError = require("./ApiError");
const { getCompanyId, pick } = require("./helpers");

// One CRUD controller factory shared by the simple masters (clients, descriptions).
module.exports = ({ Model, label, fields, required, order, searchFields = [] }) => {
  const scope = (req, extra = {}) => {
    const where = { is_deleted: false, ...extra };
    const companyId = getCompanyId(req);
    if (companyId) where.company_id = companyId;
    return where;
  };
  const find = async (req) => {
    const row = await Model.findOne({ where: scope(req, { id: req.params.id }) });
    if (!row) throw new ApiError(404, `${label} not found`);
    return row;
  };
  const tidy = (patch) => {
    if (patch[required] !== undefined) patch[required] = String(patch[required] || "").trim();
    if (patch[required] === "") throw new ApiError(422, `${label}: ${required} is required`);
    return patch;
  };

  return {
    list: async (req, res, next) => {
      try {
        const where = scope(req);
        if (req.query.active !== "all") where.is_active = true;
        if (req.query.q && searchFields.length) {
          const like = `%${req.query.q}%`;
          where[Op.or] = searchFields.map((f) => ({ [f]: { [Op.like]: like } }));
        }
        res.json(new ApiResponse(200, await Model.findAll({ where, order })));
      } catch (e) { next(e); }
    },
    create: async (req, res, next) => {
      try {
        const companyId = getCompanyId(req);
        if (!companyId) throw new ApiError(400, "companyId is required");
        const patch = pick(req.body, fields);
        if (patch[required] === undefined) throw new ApiError(422, `${label}: ${required} is required`);
        const row = await Model.create({ ...tidy(patch), company_id: companyId, created_by: req.user.id });
        res.status(201).json(new ApiResponse(201, row, `${label} created`));
      } catch (e) { next(e); }
    },
    update: async (req, res, next) => {
      try {
        const row = await find(req);
        await row.update({ ...tidy(pick(req.body, fields)), updated_by: req.user.id });
        res.json(new ApiResponse(200, row, `${label} updated`));
      } catch (e) { next(e); }
    },
    remove: async (req, res, next) => {
      try {
        const row = await find(req);
        await row.update({ is_active: false, is_deleted: true, updated_by: req.user.id });
        res.json(new ApiResponse(200, null, `${label} deleted`));
      } catch (e) { next(e); }
    },
  };
};