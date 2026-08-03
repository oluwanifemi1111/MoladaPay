// routes/auth.js
// Handles: register, verify OTP, resend OTP, login, logout
const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Wallet = require("../models/Wallet");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const generateFingerprint = require("../utils/fingerprint");
const geoip = require("geoip-lite");
const countryToCurrency = require("../utils/countryToCurrency");
const axios = require("axios");
const os = require("os");
const { detectCountryAndCurrency } = require("../utils/phoneUtils.js");
const { detectVPN } = require("../services/vpnDetectionService");

const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

function otpEmailTemplate(name, otp) {
    return `
    <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 30px;">
        <div style="max-width: 500px; margin: auto; background-color: white; padding: 20px; border-radius: 10px; border: 1px solid #ddd;">
            <div style="text-align: center; margin-bottom: 20px;">
                <img src="https://i.ibb.co/jvYtrMv3/IMG-20250711-WA0068.jpg" alt="Molada Pay Logo" style="height: 60px; background-color: white; border-radius: 8px; padding: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            </div>
            <h2 style="color: #3b1a5b; text-align: center;">Verify Your Email</h2>
            <p>Hello <strong>${name}</strong>,</p>
            <p>Your One-Time Password (OTP) to verify your account is:</p>
            <div style="text-align: center; font-size: 24px; font-weight: bold; background: #3b1a5b; color: white; padding: 10px; border-radius: 5px;">
                ${otp}
            </div>
            <p>This code will expire in 10 minutes. If you didn't request this, please ignore this email.</p>
            <p style="font-size: 12px; color: #999; text-align: center;">© ${new Date().getFullYear()} Molada. All rights reserved.</p>
        </div>
    </div>
    `;
}

function parentNotificationTemplate(childName, childAge) {
    return `
    <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 30px;">
        <div style="max-width: 500px; margin: auto; background-color: white; padding: 20px; border-radius: 10px; border: 1px solid #ddd;">
            <div style="text-align: center; margin-bottom: 20px;">
                <img src="https://i.ibb.co/jvYtrMv3/IMG-20250711-WA0068.jpg" alt="Molada Pay Logo" style="height: 60px; background-color: white; border-radius: 8px; padding: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            </div>
            <h2 style="color: #3b1a5b;">Your Child Has Registered on Molada Pay</h2>
            <p>Dear Parent/Guardian,</p>
            <p>This is to inform you that your child <strong>${childName}</strong>, aged <strong>${childAge}</strong>, has successfully registered for a Molada Pay account.</p>
            <p>Molada Pay is a secure wallet service that enables money transfers, online payments, and account management. We encourage parents to be aware of their child's activity.</p>
            <p>If you have any questions, please contact our support team at <a href="mailto:support@moladapay.com">support@moladapay.com</a>.</p>
            <p>Thank you,<br>Molada Pay Security Team</p>
            <p style="font-size: 12px; color: #999; text-align: center;">© ${new Date().getFullYear()} Molada. All rights reserved.</p>
        </div>
    </div>
    `;
}

function newDeviceLoginTemplate(name, ip, location, userAgent, time, locationData = {}) {
    const isMobile = /mobile|android|iphone|ipad|ipod/i.test(userAgent);
    const isTablet = /tablet|ipad/i.test(userAgent);
    const deviceInfo = isMobile ? (isTablet ? "Tablet" : "Mobile Device") : "Desktop/Laptop";

    let browserInfo = "Unknown Browser";
    if (userAgent.includes("Edg")) browserInfo = "Microsoft Edge";
    else if (userAgent.includes("Chrome")) browserInfo = "Google Chrome";
    else if (userAgent.includes("Firefox")) browserInfo = "Mozilla Firefox";
    else if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) browserInfo = "Safari";
    else if (userAgent.includes("Opera") || userAgent.includes("OPR")) browserInfo = "Opera";

    let osInfo = "Unknown OS";
    if (userAgent.includes("Windows NT 10.0")) osInfo = "Windows 10/11";
    else if (userAgent.includes("Windows NT 6.3")) osInfo = "Windows 8.1";
    else if (userAgent.includes("Windows NT 6.2")) osInfo = "Windows 8";
    else if (userAgent.includes("Windows NT 6.1")) osInfo = "Windows 7";
    else if (userAgent.includes("Windows")) osInfo = "Windows";
    else if (userAgent.includes("Mac OS X")) {
        const macVersion = userAgent.match(/Mac OS X (\d+[._]\d+)/);
        osInfo = macVersion ? `macOS ${macVersion[1].replace("_", ".")}` : "macOS";
    } else if (userAgent.includes("Linux")) osInfo = "Linux";
    else if (userAgent.includes("Android")) {
        const androidVersion = userAgent.match(/Android (\d+(\.\d+)?)/);
        osInfo = androidVersion ? `Android ${androidVersion[1]}` : "Android";
    } else if (userAgent.includes("iPhone") || userAgent.includes("iPad")) {
        const iosVersion = userAgent.match(/OS (\d+[._]\d+)/);
        osInfo = iosVersion ? `iOS ${iosVersion[1].replace("_", ".")}` : "iOS";
    }

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#f0f2f5;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f2f5;padding:20px 0;">
            <tr><td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
                    <tr>
                        <td style="text-align:center;padding:20px 30px 10px 30px;">
                            <img src="https://i.ibb.co/jvYtrMv3/IMG-20250711-WA0068.jpg" alt="Molada Pay Logo" style="height:60px;background-color:white;border-radius:8px;padding:5px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
                        </td>
                    </tr>
                    <tr>
                        <td style="background:linear-gradient(135deg,#3b1a5b 0%,#6b46c1 100%);padding:30px;text-align:center;border-radius:10px 10px 0 0;">
                            <h1 style="color:white;margin:0;font-size:26px;font-weight:700;">New Device Login Alert</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:40px 30px;">
                            <p style="font-size:18px;color:#1a1a1a;margin:0 0 10px 0;font-weight:600;">Hello ${name},</p>
                            <p style="font-size:15px;color:#4a4a4a;line-height:1.6;margin:0 0 25px 0;">
                                We detected a new login to your <strong>Molada Pay</strong> account from a device we haven't seen before. Please review the details below.
                            </p>
                            <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(to right,#f8f9fa,#e9ecef);border-radius:8px;margin-bottom:25px;border:1px solid #dee2e6;">
                                <tr><td style="padding:20px;">
                                    <h3 style="color:#3b1a5b;margin:0 0 15px 0;font-size:16px;font-weight:700;border-bottom:2px solid #3b1a5b;padding-bottom:8px;">Login Location & Time</h3>
                                    <table width="100%" cellpadding="6" cellspacing="0">
                                        <tr><td style="color:#6c757d;font-size:14px;width:35%;font-weight:600;">Date & Time:</td><td style="color:#212529;font-size:14px;font-weight:500;">${time}</td></tr>
                                        <tr><td style="color:#6c757d;font-size:14px;font-weight:600;">City:</td><td style="color:#212529;font-size:14px;font-weight:500;">${locationData.city || "Unknown"}</td></tr>
                                        <tr><td style="color:#6c757d;font-size:14px;font-weight:600;">Region:</td><td style="color:#212529;font-size:14px;font-weight:500;">${locationData.region || "Unknown"}</td></tr>
                                        <tr><td style="color:#6c757d;font-size:14px;font-weight:600;">Country:</td><td style="color:#212529;font-size:14px;font-weight:500;">${locationData.country_name || "Unknown"}</td></tr>
                                        ${locationData.timezone && locationData.timezone !== "Unknown" ? `<tr><td style="color:#6c757d;font-size:14px;font-weight:600;">Timezone:</td><td style="color:#212529;font-size:14px;font-weight:500;">${locationData.timezone} (${locationData.utc_offset || "UTC"})</td></tr>` : ""}
                                    </table>
                                </td></tr>
                            </table>
                            <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(to right,#f8f9fa,#e9ecef);border-radius:8px;margin-bottom:25px;border:1px solid #dee2e6;">
                                <tr><td style="padding:20px;">
                                    <h3 style="color:#3b1a5b;margin:0 0 15px 0;font-size:16px;font-weight:700;border-bottom:2px solid #3b1a5b;padding-bottom:8px;">Device & Network Information</h3>
                                    <table width="100%" cellpadding="6" cellspacing="0">
                                        <tr><td style="color:#6c757d;font-size:14px;width:35%;font-weight:600;">Device Type:</td><td style="color:#212529;font-size:14px;font-weight:500;">${deviceInfo}</td></tr>
                                        <tr><td style="color:#6c757d;font-size:14px;font-weight:600;">Browser:</td><td style="color:#212529;font-size:14px;font-weight:500;">${browserInfo}</td></tr>
                                        <tr><td style="color:#6c757d;font-size:14px;font-weight:600;">Operating System:</td><td style="color:#212529;font-size:14px;font-weight:500;">${osInfo}</td></tr>
                                        <tr><td style="color:#6c757d;font-size:14px;font-weight:600;">IP Address:</td><td style="color:#212529;font-size:14px;font-family:'Courier New',monospace;font-weight:500;">${ip}</td></tr>
                                        ${locationData.org && locationData.org !== "Unknown" ? `<tr><td style="color:#6c757d;font-size:14px;font-weight:600;">ISP/Network:</td><td style="color:#212529;font-size:14px;font-weight:500;">${locationData.org}</td></tr>` : ""}
                                    </table>
                                </td></tr>
                            </table>
                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fff3cd;border-left:4px solid #ffc107;border-radius:6px;margin-bottom:20px;">
                                <tr><td style="padding:18px;">
                                    <p style="margin:0;font-size:15px;color:#856404;font-weight:600;">Was this you?</p>
                                    <p style="margin:8px 0 0 0;font-size:14px;color:#856404;line-height:1.5;">If you recognize this activity, you can safely ignore this email.</p>
                                </td></tr>
                            </table>
                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8d7da;border-left:4px solid #dc3545;border-radius:6px;margin-bottom:25px;">
                                <tr><td style="padding:18px;">
                                    <p style="margin:0;font-size:15px;color:#721c24;font-weight:700;">Don't recognize this login?</p>
                                    <p style="margin:10px 0;font-size:14px;color:#721c24;line-height:1.5;">If this wasn't you, your account may be compromised. Take immediate action:</p>
                                    <ol style="margin:10px 0 0 20px;padding:0;font-size:14px;color:#721c24;line-height:1.8;">
                                        <li>Reset your password immediately</li>
                                        <li>Review your recent account activity</li>
                                        <li>Contact our support team</li>
                                    </ol>
                                </td></tr>
                            </table>
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr><td align="center" style="padding:10px 0 30px 0;">
                                    <a href="${process.env.FRONTEND_URL}/reset-password" style="display:inline-block;background:linear-gradient(135deg,#3b1a5b 0%,#5e2ced 100%);color:#ffffff;padding:16px 40px;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">Secure My Account</a>
                                </td></tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color:#f8f9fa;padding:25px 30px;text-align:center;border-top:1px solid #dee2e6;">
                            <p style="font-size:13px;color:#6c757d;margin:0 0 10px 0;">Need help? Contact us at <a href="mailto:support@moladapay.com" style="color:#3b1a5b;text-decoration:none;font-weight:600;">support@moladapay.com</a></p>
                            <p style="font-size:12px;color:#adb5bd;margin:0;line-height:1.5;">© ${new Date().getFullYear()} Molada Pay. All rights reserved.</p>
                        </td>
                    </tr>
                </table>
            </td></tr>
        </table>
    </body>
    </html>
    `;
}

function generateWalletId() {
    return `WAL-${uuidv4()}`;
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
    try {
        const {
            fullName, address, postalCode, age, dateOfBirth, email,
            parentEmail, phone, referralCode, password, confirmPassword, country,
        } = req.body;

        let ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
            req.headers["x-real-ip"] || req.connection.remoteAddress ||
            req.socket.remoteAddress || "0.0.0.0";

        if (ip === "::1" || ip === "::ffff:127.0.0.1") ip = "127.0.0.1";
        ip = ip.replace(/^::ffff:/, "");

        if (ip !== "127.0.0.1" && ip !== "0.0.0.0") {
            try {
                const vpnCheck = await detectVPN(ip);
                if (vpnCheck.isVpn && vpnCheck.confidence > 0) {
                    return res.status(403).json({
                        success: false,
                        message: "VPN/Proxy detected. Please disable your VPN and try again.",
                        details: `We detected VPN usage from ${vpnCheck.provider}. VPN connections are not allowed during registration.`,
                        vpnDetected: true,
                    });
                }
            } catch (vpnErr) {
                console.warn("VPN detection failed, allowing registration:", vpnErr.message);
            }
        }

        if (age < 3) {
            return res.status(400).json({ success: false, message: "You must be at least 3 years old to register." });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ success: false, message: "Passwords do not match." });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            const now = new Date();
            if (!existingUser.verified) {
                if (existingUser.otpLastRequest && now - existingUser.otpLastRequest > 60 * 60 * 1000) {
                    existingUser.otpRequests = 0;
                }
                if (existingUser.otpRequests >= 5) {
                    return res.status(429).json({
                        success: false,
                        message: "Too many registration attempts. Please try again in 1 hour or verify your existing account.",
                    });
                }
            } else {
                return res.status(400).json({ success: false, message: "Email already registered." });
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = crypto.randomInt(100000, 999999).toString();
        const walletId = generateWalletId();
        const { country: detectedCountry, currency } = detectCountryAndCurrency(phone, country);

        let userDateOfBirth = null;
        if (dateOfBirth) {
            const parsedDate = new Date(dateOfBirth);
            if (!isNaN(parsedDate.getTime())) {
                userDateOfBirth = new Date(Date.UTC(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate()));
            } else {
                return res.status(400).json({ success: false, message: "Invalid date format. Please use YYYY-MM-DD format." });
            }
        } else if (age) {
            const estimatedBirthYear = new Date().getFullYear() - age;
            userDateOfBirth = new Date(Date.UTC(estimatedBirthYear, 0, 1));
        }

        const newUser = new User({
            fullName, address, postalCode, age,
            dateOfBirth: userDateOfBirth, email,
            parentEmail: age < 18 ? parentEmail : null,
            phone, referralCode,
            password: hashedPassword, walletId, otp,
            otpExpiresAt: Date.now() + 10 * 60 * 1000,
            otpUsed: false, verified: false,
            country: detectedCountry, currency,
            accountStatus: "active",
            failedLoginAttempts: 0,
            otpRequests: 1,
            otpLastRequest: new Date(),
        });

        const savedUser = await newUser.save();

        try {
            await transporter.sendMail({
                from: `"Molada Pay" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: "Molada Email Verification",
                html: otpEmailTemplate(fullName, otp),
            });

            if (age < 18 && parentEmail) {
                await transporter.sendMail({
                    from: `"Molada Pay" <${process.env.EMAIL_USER}>`,
                    to: parentEmail,
                    subject: "Notification: Your Child Registered on Molada Pay",
                    html: parentNotificationTemplate(fullName, age),
                });
            }
        } catch (emailErr) {
            await User.deleteOne({ _id: savedUser._id });
            console.error("Email sending failed:", emailErr);
            return res.status(500).json({ success: false, message: "Failed to send email(s). Please try again." });
        }

        res.status(201).json({
            success: true,
            message: "User registered successfully. Relevant emails sent.",
            walletId,
            country: detectedCountry,
            currency,
        });
    } catch (err) {
        console.error("Registration error:", err);
        res.status(500).json({ success: false, message: err.message || "Server error" });
    }
});

// POST /api/auth/verify
router.post("/verify", async (req, res) => {
    try {
        const { email, otp } = req.body;
        const user = await User.findOne({ email });

        if (!user)
            return res.status(404).json({ success: false, message: "User not found" });

        if (user.otp !== otp || user.otpUsed) {
            return res.status(400).json({ success: false, message: "Invalid or already used OTP" });
        }

        if (user.otpExpiresAt < Date.now()) {
            return res.status(400).json({ success: false, message: "OTP expired" });
        }

        user.otp = undefined;
        user.verified = true;
        user.otpUsed = true;
        user.otpExpiresAt = undefined;
        user.accountStatus = "active";
        user.failedLoginAttempts = 0;

        let wallet = await Wallet.findOne({ user: user._id });
        if (!wallet) {
            wallet = new Wallet({ user: user._id, balance: 0 });
            await wallet.save().catch((err) => {
                console.error("Wallet save failed:", err);
                throw err;
            });
            user.wallet = wallet._id;
        }

        await user.save();
        res.json({ success: true, message: "OTP verified, wallet created", wallet });
    } catch (error) {
        console.error("Verify OTP error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// POST /api/auth/resend-otp
router.post("/resend-otp", async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const now = new Date();
        if (user.otpLastRequest && now - user.otpLastRequest > 60 * 60 * 1000) {
            user.otpRequests = 0;
        }

        if (user.otpRequests >= 3) {
            return res.status(429).json({ success: false, message: "Too many OTP requests. Please try again in 1 hour." });
        }

        const otp = crypto.randomInt(100000, 999999).toString();
        user.otp = otp;
        user.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
        user.otpRequests += 1;
        user.otpLastRequest = now;
        await user.save();

        try {
            await transporter.sendMail({
                from: `"Molada Pay" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: "Molada Pay Email Verification",
                html: otpEmailTemplate(user.fullName, otp),
            });
        } catch (emailErr) {
            console.error("Email sending failed:", emailErr);
            return res.status(500).json({ success: false, message: "Failed to send email. Please try again." });
        }

        res.json({ success: true, message: "OTP resent successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const { trackFailedLogin, resetFailedAttempts } = require("../middleware/antiHack");

        const user = await User.findOne({ email });
        if (!user) {
            await trackFailedLogin(email);
            return res.status(400).json({ message: "User not found" });
        }

        if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
            const minutesLeft = Math.ceil((user.accountLockedUntil - new Date()) / 60000);
            return res.status(423).json({
                message: `Account locked due to multiple failed login attempts. Try again in ${minutesLeft} minutes.`,
            });
        }

        if (user.accountStatus === "suspended") {
            return res.status(403).json({ message: "Account suspended", reason: user.suspensionReason });
        }

        if (user.accountStatus === "frozen" || user.accountStatus === "under_review") {
            return res.status(403).json({
                message: "Account frozen for security review. Please contact support.",
                reason: user.freezeReason,
            });
        }

        if (!user.verified) {
            return res.status(403).json({ success: false, message: "Account not verified. Please verify your OTP." });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            await trackFailedLogin(email);
            return res.status(400).json({ message: "Invalid credentials" });
        }

        await resetFailedAttempts(user._id);

        user.lastLogin = new Date();
        user.accountStatus = "active";
        user.accountLockedUntil = null;

        let ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
            req.headers["x-real-ip"] || req.connection.remoteAddress ||
            req.socket.remoteAddress || "0.0.0.0";

        if (ip === "::1" || ip === "::ffff:127.0.0.1") ip = "127.0.0.1";
        ip = ip.replace(/^::ffff:/, "");

        const userAgent = req.headers["user-agent"] || "unknown";

        const { country: phoneCountry, currency: phoneCurrency } = detectCountryAndCurrency(user.phone, user.country);
        if (phoneCountry !== "UNKNOWN" && (!user.country || !user.currency)) {
            user.country = phoneCountry;
            user.currency = phoneCurrency;
        }

        let locationData = {
            city: "Unknown", region: "Unknown", country_name: "Unknown",
            country_code: "Unknown", postal: "Unknown", latitude: null,
            longitude: null, timezone: "Unknown", utc_offset: "Unknown",
            org: "Unknown", asn: "Unknown", currency: user.currency || "Unknown",
        };

        if (ip !== "127.0.0.1" && ip !== "0.0.0.0") {
            try {
                const response = await axios.get(
                    `http://ip-api.com/json/${ip}?fields=status,country,countryCode,region,regionName,city,zip,lat,lon,timezone,offset,currency,isp,org,as`,
                    { timeout: 5000 }
                );
                if (response.data && response.data.status === "success") {
                    locationData.city = response.data.city?.trim() || "Unknown";
                    locationData.region = response.data.regionName?.trim() || response.data.region || "Unknown";
                    locationData.country_name = response.data.country || "Unknown";
                    locationData.country_code = response.data.countryCode || "Unknown";
                    locationData.postal = response.data.zip || user.postalCode || "Unknown";
                    locationData.latitude = response.data.lat || null;
                    locationData.longitude = response.data.lon || null;
                    locationData.timezone = response.data.timezone || "Unknown";
                    locationData.org = response.data.org || response.data.isp || "Unknown";
                    locationData.asn = response.data.as || "Unknown";
                    if (response.data.offset !== undefined) {
                        locationData.utc_offset = `UTC${response.data.offset >= 0 ? "+" : ""}${response.data.offset / 3600}`;
                    }
                    locationData.currency = response.data.currency || countryToCurrency[response.data.countryCode] || user.currency || "Unknown";
                }
            } catch (err) {
                console.warn("ip-api failed:", err.message);
            }

            if (locationData.city === "Unknown" || locationData.region === "Unknown") {
                try {
                    const ipapiResponse = await axios.get(`https://ipapi.co/${ip}/json/`, { timeout: 5000 });
                    if (ipapiResponse.data) {
                        if (locationData.city === "Unknown" && ipapiResponse.data.city) locationData.city = ipapiResponse.data.city;
                        if (locationData.region === "Unknown" && ipapiResponse.data.region) locationData.region = ipapiResponse.data.region;
                        if (locationData.postal === "Unknown" && ipapiResponse.data.postal) locationData.postal = ipapiResponse.data.postal;
                        if (locationData.timezone === "Unknown" && ipapiResponse.data.timezone) locationData.timezone = ipapiResponse.data.timezone;
                        if (!locationData.org || locationData.org === "Unknown") locationData.org = ipapiResponse.data.org || "Unknown";
                    }
                } catch (ipapiErr) {
                    console.warn("ipapi.co failed:", ipapiErr.message);
                }
            }

            if (locationData.city === "Unknown" || locationData.region === "Unknown") {
                const geoData = geoip.lookup(ip);
                if (geoData) {
                    if (locationData.city === "Unknown") locationData.city = geoData.city || "Unknown";
                    if (locationData.region === "Unknown") locationData.region = geoData.region || "Unknown";
                    if (locationData.country_code === "Unknown") locationData.country_code = geoData.country || "Unknown";
                    if (locationData.timezone === "Unknown") locationData.timezone = geoData.timezone || "Unknown";
                    if (!locationData.latitude) locationData.latitude = geoData.ll?.[0] || null;
                    if (!locationData.longitude) locationData.longitude = geoData.ll?.[1] || null;
                    if (locationData.currency === "Unknown") locationData.currency = countryToCurrency[geoData.country] || user.currency || "Unknown";
                }
            }

            if (locationData.country_code === "Unknown") locationData.country_code = user.country || "Unknown";
            if (locationData.postal === "Unknown") locationData.postal = user.postalCode || "Unknown";
            if (locationData.currency === "Unknown") locationData.currency = user.currency || "Unknown";
        } else {
            locationData.city = "Local";
            locationData.region = "Development";
            locationData.country_name = "Development Environment";
            locationData.org = "Local Network";
            locationData.timezone = "UTC";
            locationData.utc_offset = "UTC+0";
        }

        if (locationData.utc_offset === "Unknown" && locationData.timezone !== "Unknown") {
            try {
                const now = new Date();
                const tzDate = new Date(now.toLocaleString("en-US", { timeZone: locationData.timezone }));
                const utcDate = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
                const offsetHours = (tzDate - utcDate) / 3600000;
                locationData.utc_offset = `UTC${offsetHours >= 0 ? "+" : ""}${offsetHours}`;
            } catch (tzErr) {
                console.warn("Could not calculate UTC offset:", tzErr.message);
            }
        }

        const locationString = `${locationData.city || "Unknown"}, ${locationData.region || "Unknown"}, ${locationData.country_name || "Unknown"}`;
        const loginTime = new Date();
        let formattedTime;
        let localTime;

        try {
            if (locationData.timezone && locationData.timezone !== "Unknown") {
                formattedTime = loginTime.toLocaleString("en-US", {
                    timeZone: locationData.timezone,
                    weekday: "long", year: "numeric", month: "long", day: "numeric",
                    hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "long",
                });
                localTime = loginTime.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "medium" });
            } else {
                formattedTime = loginTime.toUTCString();
                localTime = loginTime.toISOString();
            }
        } catch (tzErr) {
            console.error("Timezone formatting error:", tzErr.message);
            formattedTime = loginTime.toUTCString();
            localTime = loginTime.toISOString();
        }

        const fingerprint = generateFingerprint({ ip, userAgent, os: os.platform() || "unknown" });

        if (!Array.isArray(user.devices)) user.devices = [];

        const deviceExists = user.devices.find((d) => d.fingerprint === fingerprint);

        if (!deviceExists) {
            user.devices.push({ fingerprint, ip, userAgent, createdAt: new Date() });
            await user.save();

            try {
                await transporter.sendMail({
                    from: `"Molada Pay Security" <${process.env.EMAIL_USER}>`,
                    to: user.email,
                    subject: "New Device Login Detected - Molada Pay",
                    html: newDeviceLoginTemplate(user.fullName, ip, locationString, userAgent, formattedTime, locationData),
                });
            } catch (mailErr) {
                console.error("Failed to send new device email:", mailErr.message);
            }

            const { createNotification } = require("../utils/notificationHelper");
            await createNotification({
                userId: user._id,
                type: "security",
                title: "New Device Login Detected",
                message: `Login from ${locationString} at ${localTime}`,
                data: { ip, location: locationString, city: locationData.city, country: locationData.country_name, loginTime: formattedTime, fingerprint },
            });
        }

        if (!Array.isArray(user.loginHistory)) user.loginHistory = [];
        user.loginHistory.push({
            ip, userAgent,
            city: locationData.city || "Unknown",
            region: locationData.region || "Unknown",
            country: locationData.country_name || "Unknown",
            countryCode: locationData.country_code || "Unknown",
            postal: locationData.postal || "Unknown",
            timezone: locationData.timezone || "Unknown",
            utcOffset: locationData.utc_offset || "Unknown",
            org: locationData.org || "Unknown",
            currency: locationData.currency || "Unknown",
            loginAt: loginTime,
            formattedTime,
            localTime,
        });

        const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "7d" });
        await user.save();

        res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                walletId: user.walletId,
                country: user.country,
                currency: user.currency,
                lastLogin: user.lastLogin,
                accountStatus: user.accountStatus,
                verified: user.verified,
                kycStatus: user.kycStatus,
            },
        });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// POST /api/auth/logout
router.post("/logout", async (req, res) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) {
            return res.status(400).json({ success: false, message: "No token provided" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        if (user.devices && user.devices.length > 0) {
            user.devices[user.devices.length - 1].logoutAt = new Date();
        }

        await user.save();
        return res.status(200).json({ success: true, message: "Logged out successfully" });
    } catch (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});

module.exports = router;
