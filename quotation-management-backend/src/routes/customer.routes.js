const express = require("express");
const router = express.Router();
const Controller = require("../controllers/customer.controller");
const { protect } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");
const { customerRules } = require("../validations/master.validation");

router.use(protect);

router.get("/", Controller.getCustomers);
router.get("/:id", Controller.getCustomer);
router.post("/", customerRules, Controller.createCustomer);
router.put("/:id", customerRules, Controller.updateCustomer);
router.delete("/:id", authorize("super_admin", "company_admin", "manager"), Controller.deleteCustomer);

module.exports = router;
