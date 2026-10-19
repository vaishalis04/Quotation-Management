const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { LetterheadImage } = require("../models");
const ApiResponse = require("../utils/ApiResponse");
const ApiError = require("../utils/ApiError");
const { getCompanyId } = require("../utils/helpers");
const { UPLOAD_DIR, readLetterhead } = require("../services/letterhead.service");

const EXT = { "image/png": "png", "image/jpeg": "jpg" };

const scope = (req, extra = {}) => {
  const where = { is_deleted: false, ...extra };
  const companyId = getCompanyId(req);
  if (companyId) where.company_id = companyId;
  return where;
};
const find = async (req) => {
  const row = await LetterheadImage.findOne({ where: scope(req, { id: req.params.id }) });
  if (!row) throw new ApiError(404, "Image not found");
  return row;
};
// the list carries a data: URL so the screen can show a thumbnail without another authenticated request
const withPreview = async (row) => ({ ...row.toJSON(), data_url: (await readLetterhead(row.file_name))?.dataUrl || null });

module.exports = {
  list: async (req, res, next) => {
    try {
      const where = scope(req);
      if (req.query.active !== "all") where.is_active = true;
      if (req.query.kind) where.kind = req.query.kind;
      const rows = await LetterheadImage.findAll({ where, order: [["kind", "ASC"], ["name", "ASC"]] });
      res.json(new ApiResponse(200, await Promise.all(rows.map(withPreview))));
    } catch (e) { next(e); }
  },

  create: async (req, res, next) => {
    try {
      const companyId = getCompanyId(req);
      if (!companyId) throw new ApiError(400, "companyId is required");
      if (!req.file) throw new ApiError(422, "Choose a PNG or JPG image");
      const kind = req.body.kind;
      if (!["header", "footer"].includes(kind)) throw new ApiError(422, "kind must be header or footer");
      const ext = EXT[req.file.mimetype];
      if (!ext) throw new ApiError(422, "Only PNG or JPG images are allowed");

      await fs.mkdir(UPLOAD_DIR, { recursive: true });
      const fileName = `${companyId}-${kind}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
      await fs.writeFile(path.join(UPLOAD_DIR, fileName), req.file.buffer);

      const name = String(req.body.name || "").trim() || path.parse(req.file.originalname).name;
      const row = await LetterheadImage.create({
        company_id: companyId, kind, name, file_name: fileName, mime: req.file.mimetype, size: req.file.size, created_by: req.user.id,
      });
      res.status(201).json(new ApiResponse(201, await withPreview(row), "Image added"));
    } catch (e) { next(e); }
  },

  update: async (req, res, next) => {
    try {
      const row = await find(req);
      const patch = { updated_by: req.user.id };
      if (req.body.name !== undefined) {
        patch.name = String(req.body.name || "").trim();
        if (!patch.name) throw new ApiError(422, "Name is required");
      }
      if (req.body.is_active !== undefined) patch.is_active = !!req.body.is_active;
      await row.update(patch);
      res.json(new ApiResponse(200, await withPreview(row), "Image updated"));
    } catch (e) { next(e); }
  },

  // soft delete only: the file stays on disk because issued quotations still print it
  remove: async (req, res, next) => {
    try {
      const row = await find(req);
      await row.update({ is_active: false, is_deleted: true, updated_by: req.user.id });
      res.json(new ApiResponse(200, null, "Image deleted"));
    } catch (e) { next(e); }
  },
};