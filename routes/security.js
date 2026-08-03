const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

const router = express.Router();

// SEND OTP FOR FORGOT PIN

router.post("/forgot-pin/send-otp", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Save OTP in user temporarily
    user.resetPinOtp = otp;
    user.resetPinOtpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    // Setup mail transport
    const transporter = nodemailer.createTransport({
      service: "gmail", // or use SMTP
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "Molada Pay - Reset PIN",
      text: `Your OTP code for resetting your PIN is: ${otp}`,
    });

    res.json({ success: true, message: "OTP sent to your email" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// VERIFY OTP & RESET PIN

router.post("/forgot-pin/reset", async (req, res) => {
  try {
    const { email, otp, newPin } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // Check OTP
    if (user.resetPinOtp !== otp || Date.now() > user.resetPinOtpExpiry) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }

    // Encrypt new PIN
    const hashedPin = await bcrypt.hash(newPin, 10);
    user.pin = hashedPin;

    // Clear OTP
    user.resetPinOtp = undefined;
    user.resetPinOtpExpiry = undefined;

    await user.save();

    res.json({ success: true, message: "PIN reset successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;