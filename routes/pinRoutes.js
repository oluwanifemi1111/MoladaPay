const express = require("express");
const { setPin, changePin, verifyPin } = require("../controllers/pinController");
const { registerDevice } = require("../controllers/deviceController");
const auth = require("../middleware/auth");

const router = express.Router();

router.post("/set-pin", auth, setPin);
router.post("/change-pin", auth, changePin);
router.post("/verify-pin", auth, verifyPin);
router.post("/register-device", auth, registerDevice);

module.exports = router;