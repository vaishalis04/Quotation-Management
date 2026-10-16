const express = require("express");
const router = express.Router();
const C = require("../controllers/catalogueMaster.controller");
const { protect } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");
const multer = require("multer");
const path = require("path");
const ApiError = require("../utils/ApiError");
// the sheet is only read, never stored: memory storage
const uploadSheet = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => (path.extname(file.originalname).toLowerCase() === ".xlsx" ? cb(null, true) : cb(new ApiError(400, "Upload an .xlsx file"), false)),
});
const { productMasterRules, companyMasterRules, categoryMasterRules } = require("../validations/master.validation");

const manage = authorize("super_admin", "company_admin", "manager");
router.use(protect);

// everyone can read (the Items form and quotation pickers use it); only managers / admins change the masters
router.get("/tree", C.getTree);
router.post("/import", manage, uploadSheet.single("file"), C.importExcel);

router.post("/products", manage, productMasterRules, C.createProduct);
router.put("/products/:id", manage, productMasterRules, C.updateProduct);
router.delete("/products/:id", manage, C.deleteProduct);

router.post("/companies", manage, companyMasterRules, C.createCompany);
router.put("/companies/:id", manage, companyMasterRules, C.updateCompany);
router.delete("/companies/:id", manage, C.deleteCompany);

router.post("/categories", manage, categoryMasterRules, C.createCategory);
router.put("/categories/:id", manage, categoryMasterRules, C.updateCategory);
router.delete("/categories/:id", manage, C.deleteCategory);

module.exports = router;
