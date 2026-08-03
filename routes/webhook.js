/**
 * WEBHOOK ROUTES
 * ==============
 * Receives payment event notifications from the partner bank.
 * The bank calls this endpoint whenever a deposit is completed.
 *
 * Routes:
 *  POST /api/webhook/webhook - Receives and processes bank payment events
 *
 * HOW IT WORKS:
 *  1. Bank sends an event with a signature header so we can verify it's genuine.
 *  2. We verify the signature using the shared webhook secret.
 *  3. If the event is a successful deposit, we credit the user's wallet.
 *
 * SETUP:
 *  - Register this URL in the partner bank's dashboard:
 *    https://<your-domain>/api/webhook/webhook
 *  - Set PARTNER_BANK_WEBHOOK_SECRET in your .env to match the bank's secret.
 */

const express     = require("express");
const router      = express.Router();
const User        = require("../models/User");
const Transaction = require("../models/Transaction");
const partnerBank = require("../services/partnerBank");

router.post("/webhook", async (req, res) => {
  try {
    // Verify the request genuinely came from the partner bank
    const signature = req.headers["x-bank-signature"] || req.headers["verif-hash"];
    const rawBody   = JSON.stringify(req.body);
    const isValid   = partnerBank.verifyWebhookSignature(rawBody, signature);

    if (!isValid) {
      console.warn("[WEBHOOK] Invalid signature — request rejected");
      return res.status(401).send("Invalid signature");
    }

    const event = req.body;
    console.log("[WEBHOOK] Event received:", event.event);

    // Only process completed charge events
    if (event.event === "charge.completed" && event.data.status === "successful") {
      const { amount, currency, customer, tx_ref } = event.data;

      const user = await User.findOne({ email: customer.email });
      if (!user) {
        console.warn("[WEBHOOK] No user found for email:", customer.email);
        return res.status(200).send("User not found, ignored");
      }

      // Record the transaction
      await new Transaction({
        senderId:         null,
        receiverId:       user._id,
        amount,
        senderCurrency:   currency,
        receiverCurrency: user.currency || currency,
        convertedAmount:  amount,
        fee:              0,
        type:             "fund",
        method:           "bank_transfer",
        status:           "completed",
        reference:        tx_ref,
      }).save();

      // Credit the wallet
      user.walletBalance = (user.walletBalance || 0) + amount;
      await user.save();

      console.log(`[WEBHOOK] Wallet credited: ${user.email} +${currency} ${amount}`);
      return res.status(200).send("Webhook processed successfully");
    }

    // Silently acknowledge any other event types (not relevant to us)
    return res.status(200).send("Event ignored");

  } catch (error) {
    console.error("[WEBHOOK] Processing error:", error);
    return res.status(500).send("Webhook processing failed");
  }
});

module.exports = router;
