// routes/profile.js
// Handles: user profile, email change, age limits, PIN setup, fingerprint, diagnostics
const express = require("express");
const router = express.Router();
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { detectCountryAndCurrency } = require("../utils/phoneUtils.js");

const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

router.get("/profile", async (req, res) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) {
            return res.status(400).json({ success: false, message: "No token provided" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select("-password");

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        return res.status(200).json({ success: true, user });
    } catch (err) {
        console.error("Profile error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});

router.post("/change-email/request-otp", async (req, res) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) {
            return res.status(401).json({ success: false, message: "No token provided" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const { newEmail } = req.body;

        if (!newEmail) {
            return res.status(400).json({ success: false, message: "New email is required" });
        }

        if (newEmail.toLowerCase() === user.email.toLowerCase()) {
            return res.status(400).json({ success: false, message: "New email must be different from current email" });
        }

        const existingUser = await User.findOne({ email: newEmail.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ success: false, message: "Email already registered to another account" });
        }

        const otp = crypto.randomInt(100000, 999999).toString();
        user.emailChangeOtp = otp;
        user.emailChangeOtpExpires = Date.now() + 10 * 60 * 1000;
        user.pendingNewEmail = newEmail.toLowerCase();
        await user.save();

        try {
            await transporter.sendMail({
                from: `"Molada Pay Security" <${process.env.EMAIL_USER}>`,
                to: user.email,
                subject: "Verify Email Change - Molada Pay",
                html: `
                <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 30px;">
                    <div style="max-width: 500px; margin: auto; background-color: white; padding: 20px; border-radius: 10px; border: 1px solid #ddd;">
                        <h2 style="color: #3b1a5b; text-align: center;">Email Change Request</h2>
                        <p>Hello <strong>${user.fullName}</strong>,</p>
                        <p>A request was made to change your email from <strong>${user.email}</strong> to <strong>${newEmail}</strong>.</p>
                        <p>Your One-Time Password (OTP) to verify this change is:</p>
                        <div style="text-align: center; font-size: 24px; font-weight: bold; background: #3b1a5b; color: white; padding: 10px; border-radius: 5px;">${otp}</div>
                        <p>This code will expire in 10 minutes.</p>
                        <p><strong>If you did not request this change, please ignore this email and contact support immediately.</strong></p>
                        <p style="font-size: 12px; color: #999; text-align: center;">© ${new Date().getFullYear()} Molada. All rights reserved.</p>
                    </div>
                </div>
                `,
            });
        } catch (emailErr) {
            console.error("Failed to send email change OTP:", emailErr);
            return res.status(500).json({ success: false, message: "Failed to send verification email. Please try again." });
        }

        res.json({
            success: true,
            message: `Verification OTP sent to your current email: ${user.email}`,
            expiresIn: "10 minutes",
        });
    } catch (err) {
        console.error("Change email request error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

router.post("/change-email/verify", async (req, res) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) {
            return res.status(401).json({ success: false, message: "No token provided" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const { otp } = req.body;
        if (!otp) {
            return res.status(400).json({ success: false, message: "OTP is required" });
        }

        if (user.emailChangeOtp !== otp) {
            return res.status(400).json({ success: false, message: "Invalid OTP" });
        }

        if (!user.emailChangeOtpExpires || user.emailChangeOtpExpires < Date.now()) {
            return res.status(400).json({ success: false, message: "OTP has expired. Please request a new one." });
        }

        if (!user.pendingNewEmail) {
            return res.status(400).json({ success: false, message: "No pending email change found" });
        }

        const oldEmail = user.email;
        const newEmail = user.pendingNewEmail;

        user.email = newEmail;
        user.emailChangeOtp = undefined;
        user.emailChangeOtpExpires = undefined;
        user.pendingNewEmail = undefined;
        await user.save();

        try {
            await transporter.sendMail({
                from: `"Molada Pay Security" <${process.env.EMAIL_USER}>`,
                to: oldEmail,
                subject: "Email Changed - Molada Pay",
                html: `
                <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 30px;">
                    <div style="max-width: 500px; margin: auto; background-color: white; padding: 20px; border-radius: 10px; border: 1px solid #ddd;">
                        <h2 style="color: #3b1a5b; text-align: center;">Email Changed</h2>
                        <p>Hello <strong>${user.fullName}</strong>,</p>
                        <p>Your Molada Pay account email has been changed from <strong>${oldEmail}</strong> to <strong>${newEmail}</strong> on ${new Date().toLocaleString()}.</p>
                        <p>If you did not make this change, please contact support immediately at <a href="mailto:support@moladapay.com">support@moladapay.com</a>.</p>
                        <p style="font-size: 12px; color: #999; text-align: center;">© ${new Date().getFullYear()} Molada. All rights reserved.</p>
                    </div>
                </div>
                `,
            });

            await transporter.sendMail({
                from: `"Molada Pay" <${process.env.EMAIL_USER}>`,
                to: newEmail,
                subject: "Welcome to Your New Email - Molada Pay",
                html: `
                <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 30px;">
                    <div style="max-width: 500px; margin: auto; background-color: white; padding: 20px; border-radius: 10px; border: 1px solid #ddd;">
                        <h2 style="color: #3b1a5b; text-align: center;">Email Successfully Updated</h2>
                        <p>Hello <strong>${user.fullName}</strong>,</p>
                        <p>Your Molada Pay account email has been successfully changed to this address.</p>
                        <p>You can now use <strong>${newEmail}</strong> to log in to your account.</p>
                        <p style="font-size: 12px; color: #999; text-align: center;">© ${new Date().getFullYear()} Molada. All rights reserved.</p>
                    </div>
                </div>
                `,
            });
        } catch (emailErr) {
            console.error("Failed to send confirmation emails:", emailErr);
        }

        res.json({ success: true, message: "Email changed successfully", newEmail });
    } catch (err) {
        console.error("Verify email change error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

router.get("/age-limits", async (req, res) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) {
            return res.status(401).json({ success: false, message: "No token provided" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const isMinor = user.age < 18;

        const limits = isMinor ? {
            maxDailyTransfer: 50000,
            maxSingleTransaction: 10000,
            maxMonthlyWithdrawal: 100000,
            cryptoTradingAllowed: false,
            internationalTransferAllowed: false,
            virtualCardAllowed: false,
            allowedBillTypes: ["airtime", "data"],
        } : {
            maxDailyTransfer: null,
            maxSingleTransaction: null,
            maxMonthlyWithdrawal: null,
            cryptoTradingAllowed: true,
            internationalTransferAllowed: true,
            virtualCardAllowed: true,
            allowedBillTypes: ["airtime", "data", "electricity", "cable", "internet"],
        };

        res.json({
            success: true,
            isMinor,
            age: user.age,
            limits,
            parentEmail: user.parentEmail || null,
            requiresParentApproval: isMinor,
        });
    } catch (err) {
        console.error("Age limits error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

router.post("/set-pin", async (req, res) => {
    try {
        const { userId, pin } = req.body;
        if (!pin || pin.length < 4) {
            return res.status(400).json({ success: false, message: "PIN must be at least 4 digits" });
        }

        const user = await User.findById(userId);
        if (!user)
            return res.status(404).json({ success: false, message: "User not found" });

        const salt = await bcrypt.genSalt(10);
        user.transactionPin = await bcrypt.hash(pin, salt);
        await user.save();

        res.json({ success: true, message: "Transaction PIN set successfully" });
    } catch (err) {
        console.error("Set PIN Error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

router.post("/set-fingerprint", async (req, res) => {
    try {
        const { userId, fingerprint } = req.body;

        if (!userId || !fingerprint) {
            return res.status(400).json({ success: false, message: "User ID and fingerprint are required" });
        }

        const user = await User.findById(userId);
        if (!user)
            return res.status(404).json({ success: false, message: "User not found" });

        user.fingerprint = fingerprint;
        await user.save();

        res.json({ success: true, message: "Fingerprint set/updated successfully" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error", error: err.message });
    }
});

router.get("/diagnostic/phone-check", async (req, res) => {
    try {
        const users = await User.find({ phone: { $exists: true } }).select("phone country currency email");

        const results = users.map((user) => {
            const { country: detectedCountry, currency: detectedCurrency } =
                detectCountryAndCurrency(user.phone, null);

            return {
                email: user.email,
                phone: user.phone,
                storedCountry: user.country || "NOT_SET",
                storedCurrency: user.currency || "NOT_SET",
                detectedCountry,
                detectedCurrency,
                matches: user.country === detectedCountry && user.currency === detectedCurrency,
            };
        });

        const correctCount = results.filter((r) => r.matches).length;
        const incorrectCount = results.filter((r) => !r.matches).length;

        res.json({
            success: true,
            total: results.length,
            correct: correctCount,
            incorrect: incorrectCount,
            accuracy: results.length > 0 ? `${((correctCount / results.length) * 100).toFixed(2)}%` : "0%",
            details: results,
        });
    } catch (err) {
        console.error("Phone check error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

module.exports = router;
