const express = require("express");
const router = express.Router();
const Controller = require("../controllers/charge.controller");
const { protect } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");
const { chargeRules } = require("../validations/master.validation");

const manage = authorize("super_admin", "company_admin", "manager");

router.use(protect);

// everyone can read (sales users pick charges into quotations); only managers/admins change the master
router.get("/", Controller.getCharges);
router.post("/", manage, chargeRules, Controller.createCharge);
router.put("/:id", manage, chargeRules, Controller.updateCharge);
router.delete("/:id", manage, Controller.deleteCharge);

module.exports = router;
