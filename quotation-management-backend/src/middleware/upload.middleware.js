const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const ApiError = require("../utils/ApiError");

const UPLOAD_DIR = process.env.UPLOAD_PATH
  ? path.resolve(process.env.UPLOAD_PATH)
  : path.resolve(process.cwd(), "uploads");

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};
ensureDir(UPLOAD_DIR);

const makeStorage = (folder) =>
  multer.diskStorage({
    destination: (req, file, cb) => {
      const dest = path.join(UPLOAD_DIR, folder);
      ensureDir(dest);
      cb(null, dest);
    },
    // random name: the client's file name is never used on disk
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${path.extname(file.originalname).toLowerCase()}`),
  });

const limits = { fileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 5 * 1024 * 1024 };

const uploadLogo = multer({
  storage: makeStorage("logos"),
  limits,
  fileFilter: (req, file, cb) =>
    ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)
      ? cb(null, true)
      : cb(new ApiError(400, "Only JPEG, PNG, and WEBP images are allowed"), false),
});

// Quotation layouts: Word (.docx) or Excel (.xlsx). Browsers often send octet-stream, so the extension decides.
const uploadLayout = multer({
  storage: makeStorage("layouts"),
  limits,
  fileFilter: (req, file, cb) =>
    [".docx", ".xlsx"].includes(path.extname(file.originalname).toLowerCase())
      ? cb(null, true)
      : cb(new ApiError(400, "Layout must be a .docx or .xlsx file"), false),
});

// zip signature "PK" - docx/xlsx are zip containers
const looksLikeOfficeFile = (filePath) => {
  const fd = fs.openSync(filePath, "r");
  const buf = Buffer.alloc(2);
  fs.readSync(fd, buf, 0, 2, 0);
  fs.closeSync(fd);
  return buf[0] === 0x50 && buf[1] === 0x4b;
};

module.exports = { uploadLogo, uploadLayout, UPLOAD_DIR, looksLikeOfficeFile };
