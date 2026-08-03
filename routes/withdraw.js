// Withdrawal routes — POST /api/withdraw/withdraw

const express = require("express");
const router  = express.Router();
const User    = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const partnerBank    = require("../services/partnerBank");

// Withdraw money from wallet → user's bank account
router.post("/withdraw", authMiddleware, async (req, res) => {
  try {
    const { amount, account_number, bank_code } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if ((user.walletBalance || 0) < amount) {
      return res.status(400).json({ success: false, message: "Insufficient balance" });
    }

    // Debit the wallet before sending so we don't double-pay on retry
    user.walletBalance -= amount;
    await user.save();

    const reference = `MOLADA-WITHDRAW-${Date.now()}-${user.id}`;

    const result = await partnerBank.initiateTransfer({
      accountNumber: account_number,
      bankCode:      bank_code,
      amount,
      currency:      "NGN",
      narration:     "Molada Wallet Withdrawal",
      reference,
    });

    if (result.status === "success") {
      return res.status(200).json({
        success:   true,
        message:   "Withdrawal initiated successfully",
        reference: result.reference,
        balance:   user.walletBalance,
      });
    } else {
      // Refund if the transfer was rejected by the bank
      user.walletBalance += amount;
      await user.save();
      return res.status(400).json({ success: false, message: "Withdrawal failed" });
    }
  } catch (error) {
    console.error("Withdrawal error:", error);
    return res.status(500).json({ success: false, message: "Withdrawal error" });
  }
});

module.exports = router;
