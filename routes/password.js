// routes/password.js
// Handles: forgot password, reset password, change password
const express = require("express");
const router = express.Router();
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

function resetPasswordTemplate(name, link) {
    return `
    <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 30px;">
        <div style="max-width: 500px; margin: auto; background-color: white; padding: 20px; border-radius: 10px; border: 1px solid #ddd;">
            <div style="text-align: center; margin-bottom: 20px;">
                <img src="https://i.ibb.co/jvYtrMv3/IMG-20250711-WA0068.jpg" alt="Molada Pay Logo" style="height: 60px; background-color: white; border-radius: 8px; padding: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            </div>
            <h2 style="color: #3b1a5b; text-align: center;">Password Reset Request</h2>
            <p>Hello <strong>${name}</strong>,</p>
            <p>You requested to reset your password. Click the button below to reset it:</p>
            <div style="text-align: center; margin: 20px 0;">
                <a href="${link}" style="background: #3b1a5b; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
            </div>
            <p>This link will expire in 15 minutes. If you did not request this, please ignore this email.</p>
            <p style="font-size: 12px; color: #999; text-align: center;">© ${new Date().getFullYear()} Molada. All rights reserved.</p>
        </div>
    </div>
    `;
}

router.post("/forgot-password", async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user)
            return res.status(404).json({ success: false, message: "User not found." });

        const resetToken = crypto.randomBytes(32).toString("hex");
        const resetTokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");
        user.resetPasswordToken = resetTokenHash;
        user.resetPasswordExpires = Date.now() + 15 * 60 * 1000;
        await user.save();

        const resetLink = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

        await transporter.sendMail({
            from: `"Molada" <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: "Molada Password Reset",
            html: resetPasswordTemplate(user.fullName, resetLink),
        });

        res.json({ success: true, message: "Password reset link sent to email." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

router.post("/reset-password/:token", async (req, res) => {
    try {
        const { password, confirmPassword } = req.body;
        if (password !== confirmPassword) {
            return res.status(400).json({ success: false, message: "Passwords do not match." });
        }

        const resetTokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
        const user = await User.findOne({
            resetPasswordToken: resetTokenHash,
            resetPasswordExpires: { $gt: Date.now() },
        });

        if (!user)
            return res.status(400).json({ success: false, message: "Invalid or expired token." });

        user.password = await bcrypt.hash(password, 10);
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;
        await user.save();

        res.json({ success: true, message: "Password reset successfully." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

router.post("/change-password", async (req, res) => {
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

        const { currentPassword, newPassword, confirmNewPassword } = req.body;

        if (!currentPassword || !newPassword || !confirmNewPassword) {
            return res.status(400).json({ success: false, message: "All fields are required" });
        }

        if (newPassword !== confirmNewPassword) {
            return res.status(400).json({ success: false, message: "New passwords do not match" });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: "Password must be at least 6 characters long" });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: "Current password is incorrect" });
        }

        const isSameAsOld = await bcrypt.compare(newPassword, user.password);
        if (isSameAsOld) {
            return res.status(400).json({ success: false, message: "New password must be different from current password" });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        try {
            await transporter.sendMail({
                from: `"Molada Pay Security" <${process.env.EMAIL_USER}>`,
                to: user.email,
                subject: "Password Changed Successfully - Molada Pay",
                html: `
                <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 30px;">
                    <div style="max-width: 500px; margin: auto; background-color: white; padding: 20px; border-radius: 10px; border: 1px solid #ddd;">
                        <h2 style="color: #3b1a5b; text-align: center;">Password Changed</h2>
                        <p>Hello <strong>${user.fullName}</strong>,</p>
                        <p>Your Molada Pay account password was successfully changed on ${new Date().toLocaleString()}.</p>
                        <p>If you did not make this change, please contact our support team immediately at <a href="mailto:support@moladapay.com">support@moladapay.com</a>.</p>
                        <p style="font-size: 12px; color: #999; text-align: center;">© ${new Date().getFullYear()} Molada. All rights reserved.</p>
                    </div>
                </div>
                `,
            });
        } catch (emailErr) {
            console.error("Failed to send password change email:", emailErr);
        }

        res.json({ success: true, message: "Password changed successfully" });
    } catch (err) {
        console.error("Change password error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

module.exports = router;
