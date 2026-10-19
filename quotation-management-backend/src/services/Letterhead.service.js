const fs = require("fs/promises");
const path = require("path");

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "letterheads");
const MIME_BY_EXT = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };

// Reads one stored image. Only a bare file name is accepted (no folders), so nothing outside UPLOAD_DIR can be read.
const readLetterhead = async (fileName) => {
  if (!fileName) return null;
  const safe = path.basename(String(fileName));
  try {
    const buffer = await fs.readFile(path.join(UPLOAD_DIR, safe));
    const mime = MIME_BY_EXT[path.extname(safe).slice(1).toLowerCase()] || "image/png";
    return { fileName: safe, buffer, mime, dataUrl: `data:${mime};base64,${buffer.toString("base64")}` };
  } catch (e) {
    return null;
  }
};

// For the render service: the header / footer image of a quotation (null when it has none or the file is gone).
const getQuotationLetterheads = async (quotation) => ({
  header: await readLetterhead(quotation.header_image_file),
  footer: await readLetterhead(quotation.footer_image_file),
});

module.exports = { UPLOAD_DIR, readLetterhead, getQuotationLetterheads };