/**
 * CARD PAYMENT ROUTES
 * ===================
 * Handles direct card charges (one-off payments).
 * Card processing is delegated to services/partnerBank.js.
 *
 * Routes:
 *  POST /api/payment/charge - Charge a card directly
 */

const express     = require("express");
const router      = express.Router();
const nodemailer  = require("nodemailer");
const partnerBank = require("../services/partnerBank");

// Email transporter — sends success/failure notifications to the customer
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Sends a branded HTML email to the customer after a payment attempt
async function sendPaymentEmail(to, subject, title, message, status) {
  const color = status === "success" ? "#6A0DAD" : "#D32F2F";

  const html = `
  <div style="font-family: Arial, sans-serif; background: #f9f9f9; padding: 40px;">
    <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
      <div style="background: ${color}; padding: 20px; text-align: center; color: white;">
        <h1 style="margin: 0; font-size: 24px;">Molada Pay</h1>
      </div>
      <div style="padding: 30px;">
        <h2 style="color: ${color}; margin-top: 0;">${title}</h2>
        <p style="font-size: 15px; line-height: 1.6; color: #444;">${message}</p>
        <div style="text-align: center; margin-top: 25px;">
          <a href="https://molada.com/dashboard" style="background: ${color}; color: white; text-decoration: none; padding: 12px 25px; border-radius: 8px; font-weight: bold;">Go to Dashboard</a>
        </div>
      </div>
      <div style="background: #f1f1f1; padding: 15px; text-align: center; font-size: 13px; color: #888;">
        © ${new Date().getFullYear()} Molada Pay. All rights reserved.
      </div>
    </div>
  </div>
  `;

  await transporter.sendMail({
    from:    `"Molada Pay" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });
}

// Charge a card — delegates to the partner bank for actual processing
router.post("/charge", async (req, res) => {
  const { card_number, cvv, expiry_month, expiry_year, currency, amount, email, fullname, tx_ref } = req.body;

  try {
    const result = await partnerBank.initiateCardCharge({
      cardNumber:  card_number,
      cvv,
      expiryMonth: expiry_month,
      expiryYear:  expiry_year,
      currency,
      amount,
      email,
      fullName:    fullname,
      tx_ref:      tx_ref || "MC-" + Date.now(),
    });

    // Notify the customer of the successful payment
    await sendPaymentEmail(
      email,
      "Molada Pay - Payment Successful",
      "Payment Successful",
      `Your card payment of ${currency} ${amount} has been processed. Transaction Ref: ${tx_ref || result.reference}.`,
      "success"
    );

    return res.status(200).json({ success: true, data: result });

  } catch (error) {
    console.error("Card charge error:", error);

    // Notify the customer that the payment failed
    if (email) {
      await sendPaymentEmail(
        email,
        "Molada Pay - Payment Failed",
        "Payment Failed",
        `We could not process your card payment of ${currency} ${amount}. Please try again or use another method.`,
        "fail"
      ).catch(() => {}); // Don't let email failure mask the real error
    }

    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
