// routes/transfer.js
const express = require("express");
const mongoose = require("mongoose");
const QRCode = require("qrcode");
const nodemailer = require("nodemailer");
const cron = require("node-cron");
const router = express.Router();

const User = require("../models/User");
const Transaction = require("../models/Transaction");
const { convertCurrency } = require("../utils/exchangeRates");
const authMiddleware = require("../middleware/authMiddleware");
const checkKyc = require("../middleware/checkKyc");
const largeAmountCheck = require("../middleware/largeAmountCheck");
const { antiHackMiddleware } = require("../middleware/antiHack");
const { checkAgeRestriction } = require("../middleware/ageRestrictions");

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
});

const sendEmail = async ({ to, subject, name, type, amount, balance, currency = "USD", html }) => {
  const fmt = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

  const defaultHtml = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border-radius: 12px; background:#f7f9fc; color:#111;">
    <h2 style="color:#4B0082; text-align:center; margin:0 0 16px;">Molada Pay</h2>
    <div style="background:#fff; padding:20px; border-radius:12px; box-shadow:0 4px 12px rgba(0,0,0,.06);">
      <p style="margin:0 0 12px; font-size:16px;">Hello <b>${name}</b>,</p>
      <p style="margin:0 0 12px;">You have a new <b>${type}</b> transaction.</p>
      <p style="margin:0 0 6px;"><b>Amount:</b> ${currency} ${fmt(amount)}</p>
      <p style="margin:0 0 6px;"><b>Current Balance:</b> ${currency} ${fmt(balance)}</p>
      <p style="margin:16px 0 0;">Thanks for using <b>Molada Pay</b>.</p>
    </div>
    <div style="text-align:center; font-size:12px; margin-top:12px; color:#777;">
      &copy; ${new Date().getFullYear()} Molada. All rights reserved.
    </div>
  </div>
  `;

  await transporter.sendMail({
    from: `"Molada Pay" <${"nifemidavid11@gmail.com"}>`,
    to,
    subject,
    html: html || defaultHtml,
  });
};

router.get("/generate-qr/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const qrData = { email: user.email, phone: user.phone, name: user.fullName };
    const qrCodeUrl = await QRCode.toDataURL(JSON.stringify(qrData));

    res.json({ success: true, qrCodeUrl });
  } catch (err) {
    console.error("QR Generate Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/preview", async (req, res) => {
  try {
    const { senderId, receiverIdentifier, receiverQrData, amount } = req.body;

    const amt = Number(amount);
    if (!senderId || !amount || isNaN(amt) || amt <= 0) {
      return res.status(400).json({ success: false, message: "Invalid or missing amount/sender" });
    }

    const sender = await User.findById(senderId);
    if (!sender) return res.status(404).json({ success: false, message: "Sender not found" });

    let receiver;
    if (receiverQrData) {
      const parsed = JSON.parse(receiverQrData);
      receiver = await User.findOne({ $or: [{ email: parsed.email }, { phone: parsed.phone }] });
    } else {
      receiver = await User.findOne({ $or: [{ email: receiverIdentifier }, { phone: receiverIdentifier }] });
    }
    if (!receiver) return res.status(404).json({ success: false, message: "Receiver not found" });

    const senderCurrency = sender.currency || "USD";
    const receiverCurrency = receiver.currency || "USD";

    let convertedAmount = amt;
    let fee = 0;
    if (senderCurrency !== receiverCurrency) {
      convertedAmount = await convertCurrency(senderCurrency, receiverCurrency, amt);
      fee = Number((amt * 0.02).toFixed(2)); // 2% fee
    }

    res.json({
      success: true,
      preview: {
        from: senderCurrency,
        to: receiverCurrency,
        originalAmount: amt,
        convertedAmount,
        fee,
        receiver: { name: receiver.fullName, email: receiver.email, phone: receiver.phone },
      },
    });
  } catch (err) {
    console.error("Preview Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/transfer", authMiddleware, checkKyc, checkAgeRestriction('transaction_limit'), checkAgeRestriction('international_transfer'), async (req, res) => {
  try {
    const { senderId, receiverIdentifier, receiverQrData, amount, pin, fingerprint, remark } = req.body;

    // Basic validation
    const amt = Number(amount);
    if (!senderId || !pin || !amount || isNaN(amt) || amt <= 0) {
      return res.status(400).json({ success: false, message: "Sender, valid amount and PIN are required" });
    }

    // Fetch sender
    const sender = await User.findById(senderId);
    if (!sender) return res.status(404).json({ success: false, message: "Sender not found" });

    // Require PIN always
    if (!sender.transactionPin) {
      return res.status(400).json({ success: false, message: "You must set up a transaction PIN before sending money." });
    }
    const isValidPin = await sender.comparePin(pin);
    if (!isValidPin) {
      return res.status(401).json({ success: false, message: "Invalid transaction PIN" });
    }

    // Fingerprint optional
    if (fingerprint) {
      if (!sender.fingerprint || fingerprint !== sender.fingerprint) {
        return res.status(401).json({ success: false, message: "Invalid fingerprint" });
      }
    }

    // Find receiver
    let receiver;
    if (receiverQrData) {
      const parsed = JSON.parse(receiverQrData);
      receiver = await User.findOne({ $or: [{ email: parsed.email }, { phone: parsed.phone }] });
    } else {
      receiver = await User.findOne({ $or: [{ email: receiverIdentifier }, { phone: receiverIdentifier }] });
    }
    if (!receiver) return res.status(404).json({ success: false, message: "Receiver not found" });

    // Check receiver KYC status
    if (receiver.kycStatus !== 'approved') {
      return res.status(403).json({
        success: false,
        message: "Receiver must complete KYC verification to receive funds",
        receiverKycStatus: receiver.kycStatus
      });
    }

    // Block self-transfer
    if (sender._id.toString() === receiver._id.toString() || sender.email === receiver.email) {
      return res.status(400).json({ success: false, message: "You cannot send money to yourself." });
    }

    // Additional age restriction check for international transfers
    const isMinor = sender.age < 18;
    const isInternational = sender.country && receiver.country && sender.country !== receiver.country;

    if (isMinor && isInternational) {
      return res.status(403).json({
        success: false,
        message: `International transfers are not allowed for users under 18 years old. You can only send money to recipients in ${sender.country}.`,
        reason: 'age_restriction',
        senderCountry: sender.country,
        receiverCountry: receiver.country
      });
    }

    // Currency + fee
    const senderCurrency = sender.currency || "USD";
    const receiverCurrency = receiver.currency || "USD";

    let convertedAmount = amt;
    let fee = 0;
    if (senderCurrency !== receiverCurrency) {
      convertedAmount = await convertCurrency(senderCurrency, receiverCurrency, amt);
      fee = Number((amt * 0.02).toFixed(2));
    }

    // Balance check
    const totalDebit = amt + fee;
    if (Number(sender.walletBalance || 0) < totalDebit) {
      return res.status(400).json({
        success: false,
        message: `Insufficient funds. Balance: ${senderCurrency} ${Number(sender.walletBalance).toFixed(2)} | Required: ${senderCurrency} ${totalDebit.toFixed(2)}`
      });
    }

    // Use MongoDB transactions for atomicity
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Update balances
      sender.walletBalance -= totalDebit;
      receiver.walletBalance += Number(convertedAmount);
      await sender.save({ session });
      await receiver.save({ session });

      const transferMethod = receiverQrData ? "qrcode" : "email/phone";

      // Save transaction
      const feeService = require('../services/feeService');
      const adminFee = feeService.calculateFee('transfer', amt); // Use original amount for fee calculation

      const newTx = new Transaction({
        senderId: sender._id,
        receiverId: receiver._id,
        amount: amt, // Original amount sent by user
        senderCurrency: senderCurrency,
        receiverCurrency: receiverCurrency,
        convertedAmount: convertedAmount, // Amount received by receiver after conversion
        fee: fee, // User-facing fee
        adminFee: adminFee, // Platform fee
        type: "transfer",
        method: transferMethod,
        status: "success",
        remark: remark || null // Optional remark/description
      });
      await newTx.save({ session });

      // Collect admin fee
      await feeService.collectFee(newTx._id, session);

      // Send parent notification if sender is a minor
      if (sender.age < 18 && sender.parentEmail) {
        const { notifyParent } = require('../middleware/ageRestrictions');
        await notifyParent(sender, {
          type: 'Transfer (Debit)',
          amount: amt,
          currency: senderCurrency,
          recipient: receiver.fullName
        });
      }

      // Emails with detailed information
      const fmt = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      // Check if email notifications are enabled for sender and receiver
      const senderEmailEnabled = sender.emailNotifications !== false; // Default to true if not explicitly set to false
      const receiverEmailEnabled = receiver.emailNotifications !== false; // Default to true if not explicitly set to false

      // Debit email for sender
      const debitEmailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border-radius: 12px; background:#f7f9fc; color:#111;">
        <div style="text-align:center; margin:0 0 15px;">
          <img src="https://i.ibb.co/jvYtrMv3/IMG-20250711-WA0068.jpg" alt="Molada Pay Logo" style="height: 50px;">
        </div>
        <h2 style="color:#4B0082; text-align:center; margin:0 0 20px;">Molada Pay</h2>
        <div style="background:#fff; padding:25px; border-radius:12px; box-shadow:0 4px 12px rgba(0,0,0,.06);">
          <h3 style="color:#d9534f; margin:0 0 20px; font-size:20px;">Debit Transaction Alert</h3>

          <p style="margin:0 0 20px; font-size:16px; line-height:1.6;">
            Dear <b>${sender.fullName}</b>,<br/>
            Your transfer has been completed successfully.
          </p>

          <div style="background:#f8f9fa; padding:15px; border-radius:8px; margin:20px 0;">
            <table style="width:100%; border-collapse:collapse;">
              <tr>
                <td style="padding:8px 0; color:#666; font-size:14px;">Transaction Type:</td>
                <td style="padding:8px 0; text-align:right; font-weight:600;">Money Transfer (Debit)</td>
              </tr>
              <tr>
                <td style="padding:8px 0; color:#666; font-size:14px;">Sender:</td>
                <td style="padding:8px 0; text-align:right; font-weight:600;">${sender.fullName}</td>
              </tr>
              <tr>
                <td style="padding:8px 0; color:#666; font-size:14px;">Recipient:</td>
                <td style="padding:8px 0; text-align:right; font-weight:600;">${receiver.fullName}</td>
              </tr>
              ${remark ? `<tr>
                <td style="padding:8px 0; color:#666; font-size:14px;">Remark:</td>
                <td style="padding:8px 0; text-align:right; font-weight:600;">${remark}</td>
              </tr>` : ''}
              <tr>
                <td style="padding:8px 0; color:#666; font-size:14px;">Amount Sent:</td>
                <td style="padding:8px 0; text-align:right; font-weight:600; color:#d9534f;">${senderCurrency} ${fmt(amt)}</td>
              </tr>
              ${fee > 0 ? `<tr>
                <td style="padding:8px 0; color:#666; font-size:14px;">Transaction Fee:</td>
                <td style="padding:8px 0; text-align:right; font-weight:600;">${senderCurrency} ${fmt(fee)}</td>
              </tr>` : ''}
              <tr>
                <td style="padding:8px 0; color:#666; font-size:14px;">Total Debited:</td>
                <td style="padding:8px 0; text-align:right; font-weight:600; color:#d9534f;">${senderCurrency} ${fmt(totalDebit)}</td>
              </tr>
              <tr style="border-top:2px solid #e0e0e0;">
                <td style="padding:12px 0 0; color:#666; font-size:14px;">Current Balance:</td>
                <td style="padding:12px 0 0; text-align:right; font-weight:700; font-size:16px; color:#4B0082;">${senderCurrency} ${fmt(sender.walletBalance)}</td>
              </tr>
            </table>
          </div>

          <p style="margin:20px 0 0; font-size:14px; color:#666; line-height:1.6;">
            If you did not authorize this transaction, please contact our support team immediately at <a href="mailto:support@moladapay.com" style="color:#4B0082;">support@moladapay.com</a>
          </p>

          <p style="margin:20px 0 0; font-size:14px;">
            Thank you for using <b>Molada Pay</b> - your trusted payment partner.
          </p>
        </div>
        <div style="text-align:center; font-size:12px; margin-top:15px; color:#777;">
          &copy; ${new Date().getFullYear()} Molada Pay. All rights reserved.<br/>
          This is an automated message, please do not reply.
        </div>
      </div>
      `;

      // Send debit email only if sender has notifications enabled
      if (senderEmailEnabled) {
        await transporter.sendMail({
          from: '"Molada Pay" <nifemidavid11@gmail.com>',
          to: sender.email,
          subject: `Debit Alert: ${fmt(amt)} ${senderCurrency.toUpperCase()} - Molada Pay`,
          html: debitEmailHtml
        });
      } else {
        console.log(` Email notifications disabled for sender ${sender.email}`);
      }

      // Credit email for receiver
      const creditEmailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border-radius: 12px; background:#f7f9fc; color:#111;">
        <div style="text-align:center; margin:0 0 15px;">
          <img src="https://i.ibb.co/jvYtrMv3/IMG-20250711-WA0068.jpg" alt="Molada Pay Logo" style="height: 50px;">
        </div>
        <h2 style="color:#4B0082; text-align:center; margin:0 0 20px;">Molada Pay</h2>
        <div style="background:#fff; padding:25px; border-radius:12px; box-shadow:0 4px 12px rgba(0,0,0,.06);">
          <h3 style="color:#5cb85c; margin:0 0 20px; font-size:20px;">Credit Transaction Alert</h3>

          <p style="margin:0 0 20px; font-size:16px; line-height:1.6;">
            Dear <b>${receiver.fullName}</b>,<br/>
            You have received money in your Molada wallet.
          </p>

          <div style="background:#f8f9fa; padding:15px; border-radius:8px; margin:20px 0;">
            <table style="width:100%; border-collapse:collapse;">
              <tr>
                <td style="padding:8px 0; color:#666; font-size:14px;">Transaction Type:</td>
                <td style="padding:8px 0; text-align:right; font-weight:600;">Money Received (Credit)</td>
              </tr>
              <tr>
                <td style="padding:8px 0; color:#666; font-size:14px;">Sender:</td>
                <td style="padding:8px 0; text-align:right; font-weight:600;">${sender.fullName}</td>
              </tr>
              <tr>
                <td style="padding:8px 0; color:#666; font-size:14px;">Recipient:</td>
                <td style="padding:8px 0; text-align:right; font-weight:600;">${receiver.fullName}</td>
              </tr>
              ${remark ? `<tr>
                <td style="padding:8px 0; color:#666; font-size:14px;">Remark:</td>
                <td style="padding:8px 0; text-align:right; font-weight:600;">${remark}</td>
              </tr>` : ''}
              <tr>
                <td style="padding:8px 0; color:#666; font-size:14px;">Amount Received:</td>
                <td style="padding:8px 0; text-align:right; font-weight:600; color:#5cb85c;">${receiverCurrency} ${fmt(convertedAmount)}</td>
              </tr>
              ${senderCurrency !== receiverCurrency ? `<tr>
                <td style="padding:8px 0; color:#666; font-size:14px;">Original Amount:</td>
                <td style="padding:8px 0; text-align:right; font-weight:600;">${senderCurrency} ${fmt(amt)}</td>
              </tr>` : ''}
              <tr style="border-top:2px solid #e0e0e0;">
                <td style="padding:12px 0 0; color:#666; font-size:14px;">Current Balance:</td>
                <td style="padding:12px 0 0; text-align:right; font-weight:700; font-size:16px; color:#4B0082;">${receiverCurrency} ${fmt(receiver.walletBalance)}</td>
              </tr>
            </table>
          </div>

          <p style="margin:20px 0 0; font-size:14px; color:#666; line-height:1.6;">
            Your funds are now available for use. You can send, spend or withdraw them anytime.
          </p>

          <p style="margin:20px 0 0; font-size:14px;">
            Thank you for using <b>Molada Pay</b> - your trusted payment partner.
          </p>
        </div>
        <div style="text-align:center; font-size:12px; margin-top:15px; color:#777;">
          &copy; ${new Date().getFullYear()} Molada Pay. All rights reserved.<br/>
          This is an automated message, please do not reply.
        </div>
      </div>
      `;

      // Send credit email only if receiver has notifications enabled
      if (receiverEmailEnabled) {
        await transporter.sendMail({
          from: '"Molada Pay" <nifemidavid11@gmail.com>',
          to: receiver.email,
          subject: `Credit Alert: ${fmt(convertedAmount)} ${receiverCurrency.toUpperCase()} - Molada Pay`,
          html: creditEmailHtml
        });
      } else {
        console.log(` Email notifications disabled for receiver ${receiver.email}`);
      }

      // Create in-app notifications
      const { createNotification } = require('../utils/notificationHelper');

      // Notification for sender
      await createNotification({
        userId: sender._id,
        type: 'transaction',
        title: `Sent ${senderCurrency} ${fmt(amt)}`,
        message: `You sent ${senderCurrency} ${fmt(amt)} to ${receiver.fullName}${remark ? ` - ${remark}` : ''}`,
        data: {
          amount: amt,
          currency: senderCurrency,
          fee,
          totalDebited: totalDebit,
          recipient: receiver.fullName,
          recipientEmail: receiver.email,
          transactionId: newTx._id,
          type: 'debit',
          remark: remark || null
        }
      }, session); // Pass session to createNotification

      // Notification for receiver
      await createNotification({
        userId: receiver._id,
        type: 'transaction',
        title: `Received ${receiverCurrency} ${fmt(convertedAmount)}`,
        message: `You received ${receiverCurrency} ${fmt(convertedAmount)} from ${sender.fullName}${remark ? ` - ${remark}` : ''}`,
        data: {
          amount: convertedAmount,
          currency: receiverCurrency,
          sender: sender.fullName,
          senderEmail: sender.email,
          transactionId: newTx._id,
          type: 'credit',
          remark: remark || null
        }
      }, session); // Pass session to createNotification

      await session.commitTransaction();
      session.endSession();

      return res.json({ success: true, message: "Transfer successful", transaction: newTx });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err; // Re-throw the error to be caught by the outer catch block
    }
  } catch (err) {
    console.error("Send Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/history/:userId", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    // Security: Ensure user can only access their own history (or admin access)
    if (req.user.id !== userId) {
      return res.status(403).json({ success: false, message: "Access denied. You can only view your own transaction history." });
    }

    const history = await Transaction.find({
      $or: [
        { senderId: userId },
        { receiverId: userId },
        { userId: userId }  // Include crypto transactions (deposits, withdrawals, swaps)
      ],
    })
      .populate("senderId", "fullName email")
      .populate("receiverId", "fullName email")
      .populate("userId", "fullName email")  // Populate userId field for crypto transactions
      .sort({ createdAt: -1 });

    // Format response to include price data for crypto transactions
    const formattedHistory = history.map(tx => {
      const txObj = tx.toObject();

      // Add human-readable labels for crypto transactions
      if (txObj.method === 'blockchain') {
        txObj.displayCurrency = txObj.currency?.toUpperCase() || 'CRYPTO';
      }

      return txObj;
    });

    res.json({ success: true, history: formattedHistory, count: formattedHistory.length });
  } catch (err) {
    console.error("History Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Runs every Sunday 8AM
cron.schedule("0 8 * * 0", async () => {
  try {
    console.log(" Sending weekly reports...");

    const users = await User.find();
    for (let user of users) {
      // Only send reports if email notifications are enabled
      if (user.emailNotifications === false) {
        console.log(` Weekly report skipped for ${user.email} as notifications are disabled.`);
        continue;
      }

      const transactions = await Transaction.find({
        $or: [{ senderId: user._id }, { receiverId: user._id }],
      })
        .populate("senderId", "fullName email")
        .populate("receiverId", "fullName email")
        .sort({ createdAt: -1 })
        .limit(10);

      let historyHTML = transactions.map(
        (tx) => `
          <tr>
            <td>${tx.type}</td>
            <td>${tx.amount} ${tx.currency}</td>
            <td>${tx.status}</td>
            <td>${tx.createdAt.toDateString()}</td>
          </tr>
        `
      ).join("");

      const html = `
        <h2 style="color:#4B0082;">Molada Weekly Report</h2>
        <p>Hello ${user.fullName},</p>
        <p>Here is your weekly account summary:</p>
        <p><strong>Balance:</strong> ${user.walletBalance} ${user.currency || "USD"}</p>
        <h3>Recent Transactions</h3>
        <table border="1" cellspacing="0" cellpadding="8" style="border-collapse:collapse;">
          <thead style="background:#f0f0f0;">
            <tr><th>Type</th><th>Amount</th><th>Status</th><th>Date</th></tr>
          </thead>
          <tbody>${historyHTML || "<tr><td colspan='4'>No transactions</td></tr>"}</tbody>
        </table>
        <p>Thank you for banking with Molada </p>
      `;

      await sendEmail({
        to: user.email,
        subject: "Your Weekly Molada Report",
        name: user.fullName,
        balance: user.walletBalance,
        html,
      });
    }

    console.log(" Weekly reports sent");
  } catch (err) {
    console.error("Weekly report error:", err);
  }
});

module.exports = router;