// controllers/descriptionMaster.controller.js
const simpleMaster = require("../utils/simpleMaster");
const { DescriptionMaster } = require("../models");
module.exports = simpleMaster({ Model: DescriptionMaster, label: "Description", fields: ["title", "content", "is_active"], required: "title", order: [["title", "ASC"]], searchFields: ["title", "content"] });