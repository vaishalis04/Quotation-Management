const express = require("express");
const router = express.Router();
const Controller = require("../controllers/terms.controller");
const { protect } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");
const { termsRules } = require("../validations/master.validation");

const manage = authorize("super_admin", "company_admin", "manager");

router.use(protect);

router.get("/", Controller.getTerms);
router.post("/", manage, termsRules, Controller.createTerms);
router.put("/:id", manage, termsRules, Controller.updateTerms);
router.delete("/:id", manage, Controller.deleteTerms);

module.exports = router;
