const express = require("express");
const router = express.Router();
const Controller = require("../controllers/clientMaster.controller");
const { protect } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");

const manage = authorize("super_admin", "company_admin", "manager");

router.use(protect);

router.get("/", Controller.list);
router.post("/", manage, Controller.create);
router.put("/:id", manage, Controller.update);
router.delete("/:id", manage, Controller.remove);

module.exports = router;