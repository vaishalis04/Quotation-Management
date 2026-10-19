// controllers/clientMaster.controller.js
const simpleMaster = require("../utils/simpleMaster");
const { ClientMaster } = require("../models");
module.exports = simpleMaster({ Model: ClientMaster, label: "Client", fields: ["name", "location", "is_active"], required: "name", order: [["name", "ASC"]], searchFields: ["name", "location"] });

