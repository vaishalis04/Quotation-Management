const simpleMaster = require("../utils/simpleMaster");
const { LetterMaster } = require("../models");

module.exports = simpleMaster({
  Model: LetterMaster, label: "Letter", fields: ["title", "content", "is_active"],
  required: "title", order: [["title", "ASC"]], searchFields: ["title", "content"],
});