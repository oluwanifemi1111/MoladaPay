/**
 * DEPOSIT ROUTES
 * ==============
 * Handles wallet funding via card or direct credit.
 * Payment processing is delegated to services/partnerBank.js.
 *
 * Routes:
 *  POST /api/deposit/deposit  - Start a card deposit (redirects user to bank checkout)
 *  POST /api/deposit/fund     - Direct wallet credit (admin / testing only)
 *  GET  /api/deposit/verify   - Verify a completed transaction and credit the wallet
 */

const express = require("express");
const router  = express.Router();
const User    = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const partnerBank    = require("../services/partnerBank");

// Initialize a card deposit — returns a checkout URL the client redirects to
router.post("/deposit", authMiddleware, async (req, res) => {
  try {
    const { amount, currency, savedCardId, cvv } = req.body;

    // If the user wants to pay with a saved card, route to the savedCard quick-deposit
    if (savedCardId && cvv) {
      const SavedCard = require("../models/SavedCard");
      const savedCard = await SavedCard.findOne({ _id: savedCardId, userId: req.user.id });
      if (savedCard) {
        req.body.cardId = savedCardId;
        return require("./savedCard").post("/quick-deposit", authMiddleware)(req, res);
      }
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const tx_ref = `MOLADA-${Date.now()}-${user.id}`;

    // Delegate to partner bank — the bank returns a hosted checkout URL
    const { checkoutUrl } = await partnerBank.initiateCardCharge({
      amount,
      currency:    "NGN",
      email:       user.email,
      fullName:    user.fullName || user.username,
      tx_ref,
      redirectUrl: `${process.env.BASE_URL || "http://localhost:3001"}/api/deposit/verify`,
    });

    return res.status(200).json({
      success:      true,
      checkout_url: checkoutUrl,
      tx_ref,
    });

  } catch (error) {
    console.error("Deposit error:", error);
    return res.status(500).json({ success: false, message: "Deposit init failed", error: error.message });
  }
});

// Direct wallet credit — for admin use or internal testing only
router.post("/fund", authMiddleware, async (req, res) => {
  try {
    const { amount, currency } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.walletBalance = (user.walletBalance || 0) + parseFloat(amount);
    await user.save();

    const Transaction = require("../models/Transaction");
    await Transaction.create({
      userId:    user._id,
      amount:    parseFloat(amount),
      currency:  currency || user.currency || "USD",
      type:      "deposit",
      method:    "direct",
      status:    "success",
      createdAt: new Date(),
    });

    return res.status(200).json({
      success: true,
      message: "Wallet funded successfully",
      balance: user.walletBalance,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Funding failed" });
  }
});

// Called by the bank after a card deposit is completed
router.get("/verify", async (req, res) => {
  try {
    const { transaction_id } = req.query;

    // Ask the partner bank to confirm the payment
    const result = await partnerBank.verifyTransaction(transaction_id);

    if (result.status === "successful") {
      const user = await User.findOne({ email: result.customerEmail });
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      user.walletBalance = (user.walletBalance || 0) + parseFloat(result.amount);
      await user.save();

      return res.status(200).json({
        success: true,
        message: "Deposit successful, wallet credited",
        balance: user.walletBalance,
      });
    } else {
      return res.status(400).json({ success: false, message: "Payment not successful" });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Verification failed" });
  }
});

module.exports = router;
