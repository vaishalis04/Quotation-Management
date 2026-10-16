const express = require("express");
const router = express.Router();
const Controller = require("../controllers/item.controller");
const { protect } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");
const { itemRules } = require("../validations/master.validation");

const manage = authorize("super_admin", "company_admin", "manager");

router.use(protect);

router.get("/", Controller.getItems);
router.get("/categories", Controller.getCategories);
router.get("/spec-labels", Controller.getSpecLabels);
router.get("/products", Controller.getProducts);
router.get("/catalogue", Controller.getCatalogue);
router.get("/:id", Controller.getItem);
router.post("/", manage, itemRules, Controller.createItem);
router.put("/:id", manage, itemRules, Controller.updateItem);
router.delete("/:id", manage, Controller.deleteItem);

module.exports = router;
