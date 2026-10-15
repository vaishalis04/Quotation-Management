const express = require("express");
const router = express.Router();
const Controller = require("../controllers/quotation.controller");
const { protect } = require("../middleware/auth.middleware");
const { createRules, updateRules, calculateRules, statusRules } = require("../validations/quotation.validation");

router.use(protect);

router.post("/calculate", calculateRules, Controller.calculate);

router.get("/", Controller.getQuotations);
router.post("/", createRules, Controller.createQuotation);

router.get("/:id", Controller.getQuotation);
router.put("/:id", updateRules, Controller.updateQuotation);
router.delete("/:id", Controller.deleteQuotation);

router.patch("/:id/status", statusRules, Controller.changeStatus);
router.post("/:id/revise", Controller.reviseQuotation);
router.post("/:id/duplicate", Controller.duplicateQuotation);
router.get("/:id/versions", Controller.getVersions);
router.get("/:id/activity", Controller.getActivity);
router.get("/:id/render", Controller.renderQuotation);

module.exports = router;
