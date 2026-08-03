const bcrypt = require("bcrypt");
const User = require("../models/User");

//  Set PIN
exports.setPin = async (req, res) => {
  try {
    const { userId } = req.user; // assuming JWT decoded user
    const { pin, confirmPin } = req.body;

    if (!pin || !confirmPin) {
      return res.status(400).json({ success: false, message: "PIN and confirmation PIN are required" });
    }

    if (pin !== confirmPin) {
      return res.status(400).json({ success: false, message: "PINs do not match" });
    }

    if (!pin || pin.length < 4 || pin.length > 6) {
      return res.status(400).json({ success: false, message: "PIN must be 4-6 digits" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const salt = await bcrypt.genSalt(10);
    user.transactionPin = await bcrypt.hash(pin, salt);
    await user.save();

    res.json({ success: true, message: "PIN set successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

//  Change PIN
exports.changePin = async (req, res) => {
  try {
    const { userId } = req.user;
    const { oldPin, newPin, confirmNewPin } = req.body;

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
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const isMatch = await user.comparePin(oldPin);
    if (!isMatch) return res.status(400).json({ success: false, message: "Old PIN incorrect" });

    const salt = await bcrypt.genSalt(10);
    user.transactionPin = await bcrypt.hash(newPin, salt);
    await user.save();

    res.json({ success: true, message: "PIN changed successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

//  Verify PIN
exports.verifyPin = async (req, res) => {
  try {
    const { userId } = req.user;
    const { pin } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const isMatch = await user.comparePin(pin);
    if (!isMatch) return res.status(400).json({ success: false, message: "Invalid PIN" });

    res.json({ success: true, message: "PIN verified successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};