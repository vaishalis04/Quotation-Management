const express = require("express");
const router = express.Router();
const Controller = require("../controllers/meta.controller");
const { protect } = require("../middleware/auth.middleware");

router.use(protect);

router.get("/states", Controller.getStates);
router.get("/constants", Controller.getConstants);
router.get("/gst-rates", Controller.getGstRates);
router.get("/validate-gstin", Controller.validateGstin);

module.exports = router;
