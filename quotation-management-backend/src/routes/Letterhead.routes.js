const express = require("express");
const multer = require("multer"); // npm i multer  (skip if already installed)
const router = express.Router();
const Controller = require("../controllers/Letterhead.controller");
const { protect } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");

const manage = authorize("super_admin", "company_admin", "manager");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (req, file, cb) => (["image/png", "image/jpeg"].includes(file.mimetype) ? cb(null, true) : cb(new Error("Only PNG or JPG images are allowed"))),
});

router.use(protect);

router.get("/", Controller.list);
router.post("/", manage, upload.single("file"), Controller.create);
router.put("/:id", manage, Controller.update);
router.delete("/:id", manage, Controller.remove);

module.exports = router;