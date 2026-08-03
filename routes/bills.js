// routes/bills.js
const express = require("express");
const Wallet = require("../models/Wallet");
const Transaction = require("../models/Transaction");
const { payBill } = require("../services/billService");
const authMiddleware = require("../middleware/authMiddleware");
const router = express.Router();

/**
 * Pay any bill (airtime, data, TV, electricity)
 */
router.post("/pay", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id; // auth middleware
    const { serviceID, amount, phone, billersCode, variation_code } = req.body;

    if (!serviceID || !amount || !phone) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    //  Check wallet balance
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) return res.status(404).json({ error: "Wallet not found" });
    if (wallet.balance < amount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    //  Deduct from wallet
    wallet.balance -= Number(amount);
    wallet.transactions.push({
      type: "debit",
      amount,
      description: `Bill payment for ${serviceID}`,
    });
    await wallet.save();

    //  Call UfitPay API
    const ufitpayRes = await payBill({
      serviceID,
      amount,
      phone,
      billersCode,
      variation_code,
    });

    //  Create transaction log
    const tx = new Transaction({
      userId,
      amount,
      currency: "NGN", // Bills are fiat
      type: "bill",
      method: "email/phone",
      status: ufitpayRes.code === "000" ? "success" : "failed",
      fee: 0,
    });
    await tx.save();

    res.json({
      success: true,
      message: "Bill payment processed",
      walletBalance: wallet.balance,
      transaction: tx,
      ufitpay: ufitpayRes,
    });
  } catch (err) {
    console.error("Bills payment error:", err.message);
    res.status(500).json({ error: err.message || "Bills payment failed" });
  }
});

module.exports = router;