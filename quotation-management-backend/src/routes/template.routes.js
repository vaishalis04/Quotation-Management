const express = require("express");
const router = express.Router();
const Controller = require("../controllers/template.controller");
const { protect } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");
const { uploadLayout } = require("../middleware/upload.middleware");

const manage = authorize("super_admin", "company_admin", "manager");

router.use(protect);

// reference + starter files (declared before /:id)
router.get("/placeholders", Controller.getPlaceholders);
router.get("/samples/:format", Controller.downloadSample);

router.get("/", Controller.getTemplates);
router.post("/", manage, uploadLayout.single("file"), Controller.uploadTemplate);      // Word / Excel layout
router.post("/html", manage, Controller.createHtmlTemplate);                           // HTML layout as JSON

router.get("/:id", Controller.getTemplate);
router.put("/:id", manage, Controller.updateTemplate);
router.put("/:id/file", manage, uploadLayout.single("file"), Controller.replaceTemplateFile);
router.delete("/:id", manage, Controller.deleteTemplate);
router.get("/:id/download", Controller.downloadTemplate);
router.get("/:id/preview", Controller.previewTemplate);

module.exports = router;
