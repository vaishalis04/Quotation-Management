const express = require("express");
const router = express.Router();
const Controller = require("../controllers/report.controller");
const { protect } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");

router.use(protect);
router.get("/summary", authorize("super_admin", "company_admin", "manager"), Controller.summary);

module.exports = router;
