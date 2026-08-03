const express = require("express");
const PDFDocument = require("pdfkit");
const nodemailer = require("nodemailer");
const router = express.Router();
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const path = require("path");

// Email transporter
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
});

// Download single transaction as PDF
router.get("/transaction/:transactionId", authMiddleware, async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { delivery } = req.query; // 'download' or 'email'
    const userId = req.user.id;

    // Fetch transaction and verify ownership
    const transaction = await Transaction.findById(transactionId)
      .populate("senderId", "fullName email")
      .populate("receiverId", "fullName email")
      .populate("userId", "fullName email");

    if (!transaction) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    // Verify user owns this transaction
    const isOwner =
      transaction.senderId?._id.toString() === userId ||
      transaction.receiverId?._id.toString() === userId ||
      transaction.userId?._id.toString() === userId;

    if (!isOwner) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const user = await User.findById(userId);
    const filename = `transaction-${transactionId}.pdf`;

    // Create PDF
    const doc = new PDFDocument({ margin: 50 });

    // If email delivery, collect PDF data in buffer
    if (delivery === 'email') {
      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', async () => {
        const pdfData = Buffer.concat(buffers);

        const mailOptions = {
          from: '"Molada Pay" <no-reply@molada.com>',
          to: user.email,
          subject: "Your Transaction Receipt - Molada Pay",
          html: `<p>Dear ${user.fullName},</p>
                 <p>Please find attached your transaction receipt from Molada Pay.</p>
                 <p>Transaction ID: ${transactionId}</p>
                 <p>Thank you for using Molada Pay.</p>`,
          attachments: [
            {
              filename: filename,
              content: pdfData,
              contentType: 'application/pdf',
            },
          ],
        };

        try {
          await transporter.sendMail(mailOptions);
          res.status(200).json({ success: true, message: "Transaction receipt sent to your email" });
        } catch (emailError) {
          console.error("Email Sending Error:", emailError);
          res.status(500).json({ success: false, message: "Failed to send email" });
        }
      });
    } else {
      // Direct download
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=${filename}`
      );
      doc.pipe(res);
    }

    // Header
    doc.fontSize(24).fillColor("#4B0082").text("Molada Pay", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(18).fillColor("#000").text("Transaction Receipt", { align: "center" });
    doc.moveDown(1);

    // Transaction ID
    doc.fontSize(10).fillColor("#666").text(`Transaction ID: ${transaction._id}`, { align: "right" });
    doc.text(`Date: ${new Date(transaction.createdAt).toLocaleString()}`, { align: "right" });
    doc.moveDown(1);

    // Draw line
    doc.strokeColor("#4B0082").lineWidth(2).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(1);

    // Transaction Details
    doc.fontSize(14).fillColor("#4B0082").text("Transaction Details");
    doc.moveDown(0.5);

    // Format numbers - use 8 decimals for crypto, 2 for fiat
    const fmt = (n, isCrypto = false) => {
      if (isCrypto) {
        return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 });
      }
      return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // Type and Status
    doc.fontSize(11).fillColor("#000");
    doc.text(`Type: ${transaction.type.toUpperCase()}`, { continued: false });
    doc.text(`Status: ${transaction.status.toUpperCase()}`);
    doc.text(`Method: ${transaction.method || "N/A"}`);
    if (transaction.remark) {
      doc.text(`Remark: ${transaction.remark}`);
    }
    doc.moveDown(0.5);

    // Amount Details
    if (transaction.type === "transfer") {
      const isSenderCrypto = transaction.senderCurrency && !['USD', 'EUR', 'GBP'].includes(transaction.senderCurrency); // Basic check for crypto
      const isReceiverCrypto = transaction.receiverCurrency && !['USD', 'EUR', 'GBP'].includes(transaction.receiverCurrency);

      doc.text(`Amount Sent: ${transaction.senderCurrency || "USD"} ${fmt(transaction.amount, isSenderCrypto)}`);
      if (transaction.fee > 0) {
        doc.text(`Transaction Fee: ${transaction.senderCurrency || "USD"} ${fmt(transaction.fee, isSenderCrypto)}`);
      }
      if (transaction.convertedAmount && transaction.senderCurrency !== transaction.receiverCurrency) {
        doc.text(`Amount Received: ${transaction.receiverCurrency} ${fmt(transaction.convertedAmount, isReceiverCrypto)}`);
      }
    } else {
      const isCrypto = transaction.currency && !['USD', 'EUR', 'GBP'].includes(transaction.currency);
      doc.text(`Amount: ${transaction.currency || transaction.senderCurrency || "USD"} ${fmt(transaction.amount, isCrypto)}`);
      if (transaction.fee > 0) {
        doc.text(`Fee: ${transaction.currency || transaction.senderCurrency || "USD"} ${fmt(transaction.fee, isCrypto)}`);
      }
    }

    doc.moveDown(1);

    // Parties Involved
    if (transaction.senderId || transaction.receiverId) {
      doc.fontSize(14).fillColor("#4B0082").text("Parties Involved");
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor("#000");

      if (transaction.senderId) {
        doc.text(`Sender: ${transaction.senderId.fullName}`);
        doc.text(`Email: ${transaction.senderId.email}`);
      }

      if (transaction.receiverId) {
        doc.moveDown(0.3);
        doc.text(`Receiver: ${transaction.receiverId.fullName}`);
        doc.text(`Email: ${transaction.receiverId.email}`);
      }

      doc.moveDown(1);
    }

    // Blockchain Details
    if (transaction.onchainTxHash) {
      doc.fontSize(14).fillColor("#4B0082").text("Blockchain Details");
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor("#000");
      doc.text(`Chain: ${transaction.currency || "N/A"}`);
      doc.text(`Transaction Hash: ${transaction.onchainTxHash}`);
      if (transaction.confirmations) {
        doc.text(`Confirmations: ${transaction.confirmations}`);
      }
      doc.moveDown(1);
    }

    // Footer
    doc.moveDown(2);
    doc.strokeColor("#E5E7EB").lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor("#666").text(
      "This is a computer-generated receipt and does not require a signature.",
      { align: "center" }
    );
    doc.text(`Generated on ${new Date().toLocaleString()}`, { align: "center" });
    doc.moveDown(0.5);
    doc.text("Molada Pay - Secure Digital Wallet & Crypto Platform", { align: "center" });
    doc.text(`© ${new Date().getFullYear()} Molada Pay. All rights reserved.`, { align: "center" });

    doc.end();
  } catch (err) {
    console.error("PDF Generation Error:", err);
    res.status(500).json({ success: false, message: "Failed to generate PDF" });
  }
});

// Download transaction history (multiple transactions) as PDF
router.get("/history/:userId", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate, type, limit = 50, delivery } = req.query; // 'download' or 'email'

    // Security: Ensure user can only download their own history
    if (req.user.id !== userId) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Build query
    const query = {
      $or: [
        { senderId: userId },
        { receiverId: userId },
        { userId: userId }
      ]
    };

    if (type) {
      query.type = type;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const transactions = await Transaction.find(query)
      .populate("senderId", "fullName email")
      .populate("receiverId", "fullName email")
      .populate("userId", "fullName email")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    if (transactions.length === 0) {
      return res.status(404).json({ success: false, message: "No transactions found" });
    }

    // Create PDF
    const doc = new PDFDocument({ margin: 50 });
    const filename = `transaction-history-${userId}-${Date.now()}.pdf`;

    // If delivery is 'email', send via email instead of direct download
    if (delivery === 'email') {
      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', async () => {
        const pdfData = Buffer.concat(buffers);

        const mailOptions = {
          from: '"Molada Pay" <no-reply@molada.com>',
          to: user.email,
          subject: "Your Transaction History - Molada Pay",
          html: `<p>Dear ${user.fullName},</p>
                 <p>Please find attached your transaction history from Molada Pay.</p>
                 <p>This report covers ${transactions.length} transaction(s) from ${startDate || 'the beginning'} to ${endDate || 'now'}.</p>
                 <p>Thank you for using Molada Pay.</p>`,
          attachments: [
            {
              filename: filename,
              content: pdfData,
              contentType: 'application/pdf',
            },
          ],
        };

        try {
          await transporter.sendMail(mailOptions);
          res.status(200).json({ success: true, message: "Transaction history sent to your email" });
        } catch (emailError) {
          console.error("Email Sending Error:", emailError);
          res.status(500).json({ success: false, message: "Failed to send email" });
        }
      });
    } else {
      // Direct download (default)
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=${filename}`
      );
      doc.pipe(res);
    }

    // Header
    doc.fontSize(24).fillColor("#4B0082").text("Molada Pay", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(18).fillColor("#000").text("Transaction History", { align: "center" });
    doc.moveDown(1);

    // User Info
    doc.fontSize(12).fillColor("#000");
    doc.text(`Account Holder: ${user.fullName}`);
    doc.text(`Email: ${user.email}`);
    doc.fontSize(10).fillColor("#666");
    doc.text(`Generated: ${new Date().toLocaleString()}`, { align: "right" });
    doc.text(`Total Transactions: ${transactions.length}`, { align: "right" });
    doc.moveDown(1);

    // Draw line
    doc.strokeColor("#4B0082").lineWidth(2).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(1);

    // Format numbers - use 8 decimals for crypto, 2 for fiat
    const fmt = (n, isCrypto = false) => {
      if (isCrypto) {
        return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 });
      }
      return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // Transactions Table
    transactions.forEach((tx, index) => {
      // Check if we need a new page
      if (doc.y > 700) {
        doc.addPage();
      }

      // Transaction number
      doc.fontSize(12).fillColor("#4B0082").text(`Transaction #${index + 1}`);
      doc.moveDown(0.3);

      doc.fontSize(10).fillColor("#000");
      doc.text(`Date: ${new Date(tx.createdAt).toLocaleString()}`);
      doc.text(`Type: ${tx.type.toUpperCase()} | Status: ${tx.status.toUpperCase()}`);

      // Amount
      const currency = tx.currency || tx.senderCurrency || "USD";
      const isCrypto = currency && !['USD', 'EUR', 'GBP'].includes(currency); // Basic check for crypto
      doc.text(`Amount: ${currency} ${fmt(tx.amount, isCrypto)}`);

      if (tx.fee > 0) {
        doc.text(`Fee: ${currency} ${fmt(tx.fee, isCrypto)}`);
      }

      // Parties
      if (tx.senderId) {
        doc.text(`From: ${tx.senderId.fullName}`);
      }
      if (tx.receiverId) {
        doc.text(`To: ${tx.receiverId.fullName}`);
      }

      // Transaction ID
      doc.fontSize(8).fillColor("#666").text(`ID: ${tx._id}`);

      doc.moveDown(0.5);
      doc.strokeColor("#E5E7EB").lineWidth(0.5).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);
    });

    // Footer
    doc.moveDown(1);
    doc.fontSize(9).fillColor("#666").text(
      "This is a computer-generated document.",
      { align: "center" }
    );
    doc.text("Molada Pay - Secure Digital Wallet & Crypto Platform", { align: "center" });
    doc.text(`© ${new Date().getFullYear()} Molada Pay. All rights reserved.`, { align: "center" });

    doc.end();
  } catch (err) {
    console.error("PDF History Generation Error:", err);
    res.status(500).json({ success: false, message: "Failed to generate PDF" });
  }
});

module.exports = router;