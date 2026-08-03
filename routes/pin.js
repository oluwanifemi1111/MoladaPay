const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { hashPin, verifyPin } = require("../utils/pin");

//  Set PIN
router.post("/set", async (req, res) => {
  try {
    const { userId, pin, confirmPin } = req.body;
    
    if (!pin || !confirmPin) {
      return res.status(400).json({ success: false, message: "PIN and confirmation PIN are required" });
    }

    if (pin !== confirmPin) {
      return res.status(400).json({ success: false, message: "PINs do not match" });
    }

    if (pin.length < 4 || pin.length > 6) {
      return res.status(400).json({ success: false, message: "PIN must be 4-6 digits" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (user.transactionPin) return res.status(400).json({ success: false, message: "PIN already set" });

    user.transactionPin = await hashPin(pin);
    await user.save();
    res.json({ success: true, message: "PIN set successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

//  Change PIN
router.post("/change", async (req, res) => {
  try {
    const { userId, oldPin, newPin, confirmNewPin } = req.body;
    
    if (!oldPin || !newPin || !confirmNewPin) {
      return res.status(400).json({ success: false, message: "Old PIN, new PIN and confirmation PIN are required" });
    }

    if (newPin !== confirmNewPin) {
      return res.status(400).json({ success: false, message: "New PINs do not match" });
    }

    if (newPin.length < 4 || newPin.length > 6) {
      return res.status(400).json({ success: false, message: "PIN must be 4-6 digits" });
    }

    const user = await User.findById(userId);
    if (!user || !user.transactionPin) return res.status(400).json({ success: false, message: "PIN not set" });

    const valid = await verifyPin(oldPin, user.transactionPin);
    if (!valid) return res.status(401).json({ success: false, message: "Old PIN incorrect" });

    user.transactionPin = await hashPin(newPin);
    await user.save();
    res.json({ success: true, message: "PIN changed successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

//  Verify PIN
router.post("/verify", async (req, res) => {
  try {
    const { userId, pin } = req.body;
    const user = await User.findById(userId);
    if (!user || !user.transactionPin) return res.status(400).json({ success: false, message: "PIN not set" });

    const valid = await verifyPin(pin, user.transactionPin);
    if (!valid) return res.status(401).json({ success: false, message: "Invalid PIN" });

    res.json({ success: true, message: "PIN verified" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;