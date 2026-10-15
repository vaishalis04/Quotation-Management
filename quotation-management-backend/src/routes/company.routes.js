const express = require("express");
const router = express.Router();
const Controller = require("../controllers/company.controller");
const { protect } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");
const { uploadLogo } = require("../middleware/upload.middleware");
const { companyRules, createCompanyRules } = require("../validations/master.validation");

router.use(protect);

// own company (company admin edits GSTIN, bank, numbering, defaults...)
router.get("/me", Controller.getMyCompany);
router.put("/me", authorize("super_admin", "company_admin"), companyRules, Controller.updateMyCompany);
router.post("/me/logo", authorize("super_admin", "company_admin"), uploadLogo.single("logo"), Controller.uploadLogo);

// platform owner
router.get("/", authorize("super_admin"), Controller.listCompanies);
router.post("/", authorize("super_admin"), createCompanyRules, Controller.createCompany);
router.put("/:id", authorize("super_admin"), companyRules, Controller.updateCompany);

module.exports = router;
