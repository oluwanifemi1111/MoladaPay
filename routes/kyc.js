// KYC routes — submit verification, admin review

const express    = require("express");
const router     = express.Router();
const KYC        = require("../models/KYC");
const User       = require("../models/User");
const nodemailer = require("nodemailer");
const authMiddleware = require("../middleware/auth");
const partnerBank    = require("../services/partnerBank");

// Email transporter for sending KYC result notifications
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Submit KYC — verifies BVN or NIN via the partner bank, then records the result
router.post("/submit", async (req, res) => {
  try {
    const { userId, fullName, dob, address, idType, idNumber, email } = req.body;

    let verificationStatus = "pending";

    // Call the partner bank's KYC endpoint for the given ID type
    try {
      let result;
      if (idType === "BVN") {
        result = await partnerBank.verifyBVN(idNumber);
      } else if (idType === "NIN") {
        result = await partnerBank.verifyNIN(idNumber);
      }

      verificationStatus = result?.status === "success" ? "approved" : "rejected";
    } catch (kycErr) {
      // If the bank call fails, leave the record as "pending" for manual admin review
      console.warn("[KYC] Bank verification call failed, defaulting to pending:", kycErr.message);
      verificationStatus = "pending";
    }

    // Save the KYC record to the database
    const newKYC = new KYC({ userId, fullName, dob, address, idType, idNumber, status: verificationStatus });
    await newKYC.save();

    // Update the user's KYC status
    const user = await User.findById(userId);
    if (user) {
      user.kycStatus = verificationStatus === "approved" ? "approved" : "pending";
      await user.save();
    }

    // Email the user about the outcome
    await transporter.sendMail({
      from:    `"Molada Pay" <${process.env.EMAIL_USER}>`,
      to:      email,
      subject: `KYC Verification - ${verificationStatus.toUpperCase()}`,
      text:
        verificationStatus === "approved"
          ? "Congratulations! Your KYC has been approved. You can now access all wallet features."
          : "Sorry, your KYC verification could not be confirmed automatically. Our team will review it shortly.",
    });

    res.status(200).json({ success: true, status: verificationStatus });
  } catch (err) {
    console.error("KYC submission error:", err.message);
    res.status(500).json({ success: false, message: "KYC submission failed" });
  }
});

// Admin manually reviews a KYC record and approves or rejects it
router.post("/review/:kycId", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied. Admin only." });
    }

    const { status, reason } = req.body; // "approved" or "rejected"

    const kyc = await KYC.findById(req.params.kycId).populate("userId");
    if (!kyc) {
      return res.status(404).json({ success: false, message: "KYC record not found" });
    }

    kyc.status = status;
    if (reason) kyc.reason = reason;
    await kyc.save();

    // Mark the user as verified if approved
    if (status === "approved") {
      kyc.userId.isVerified = true;
      await kyc.userId.save();
    }

    await transporter.sendMail({
      from:    `"Molada Pay" <${process.env.EMAIL_USER}>`,
      to:      kyc.userId.email,
      subject: status === "approved" ? "KYC Verification Approved" : "KYC Verification Rejected",
      text:
        status === "approved"
          ? "Congratulations! Your KYC verification has been approved. You now have full access to Molada Pay."
          : `Sorry, your KYC verification was rejected. Reason: ${reason || "Not specified"}. Please re-submit.`,
    });

    res.json({ success: true, message: `KYC ${status} and notification sent.` });
  } catch (err) {
    console.error("KYC review error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
