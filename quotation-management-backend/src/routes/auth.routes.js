const express = require("express");
const router = express.Router();
const Controller = require("../controllers/auth.controller");
const { protect } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");
const { loginRules, registerRules, changePasswordRules } = require("../validations/auth.validation");

router.post("/login", loginRules, Controller.login);
router.post("/register", protect, authorize("super_admin", "company_admin"), registerRules, Controller.register);
router.get("/users", protect, authorize("super_admin", "company_admin"), Controller.listUsers);
router.patch("/users/:id/active", protect, authorize("super_admin", "company_admin"), Controller.setUserActive);
router.get("/me", protect, Controller.getMe);
router.put("/change-password", protect, changePasswordRules, Controller.changePassword);

module.exports = router;
