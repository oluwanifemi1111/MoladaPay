const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const authMiddleware = require('../middleware/authMiddleware');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// Email transporter
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Account deletion OTP email template
function deletionOtpTemplate(fullName, otp) {
  return `
  <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 30px;">
    <div style="max-width: 500px; margin: auto; background-color: white; padding: 20px; border-radius: 10px; border: 1px solid #ddd;">
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="https://i.ibb.co/jvYtrMv3/IMG-20250711-WA0068.jpg" alt="Molada Pay Logo" style="height: 60px; background-color: white; border-radius: 8px; padding: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      </div>
      <h2 style="color: #dc3545; text-align: center;"> Account Deletion Request</h2>
      <h2 style="color: #dc3545; text-align: center;">Confirm Account Deletion</h2>
      <p>Hello <strong>${fullName}</strong>,</p>
      <p>You requested to permanently delete your Molada Pay account. This action cannot be undone.</p>
      <p><strong style="color: #dc3545;">Warning:</strong> Deleting your account will:</p>
      <ul style="color: #555;">
        <li>Remove all your personal information</li>
        <li>Delete your wallet and transaction history</li>
        <li>Revoke access to all services</li>
        <li>Clear all saved payment methods</li>
      </ul>
      <p>If you're sure you want to proceed, use this OTP to confirm deletion:</p>
      <div style="text-align: center; font-size: 28px; font-weight: bold; background: #dc3545; color: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
        ${otp}
      </div>
      <p style="font-size: 14px; color: #666;">This code will expire in 10 minutes.</p>
      <p style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <strong>Did not request this?</strong><br/>
        If you didn't request account deletion, please ignore this email and secure your account immediately by changing your password.
      </p>
      <p style="font-size: 12px; color: #999; text-align: center;">© ${new Date().getFullYear()} Molada Pay. All rights reserved.</p>
    </div>
  </div>
  `;
}

// Step 1: Request account deletion (sends OTP)
router.post('/request-deletion', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Check if user has pending balance
    if (user.walletBalance > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete account with remaining balance. Please withdraw all funds first.',
        balance: user.walletBalance
      });
    }

    // Check for crypto balances
    const hasCryptoBalance = (
      (user.balances?.eth || 0) > 0 ||
      (user.balances?.btc || 0) > 0 ||
      (user.balances?.trx || 0) > 0 ||
      (user.balances?.usdt_trc20 || 0) > 0 ||
      (user.balances?.usdt_eth || 0) > 0
    );

    if (hasCryptoBalance) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete account with crypto balances. Please withdraw all crypto assets first.',
        balances: user.balances
      });
    }

    // Generate deletion OTP
    const deletionOtp = crypto.randomInt(100000, 999999).toString();

    user.deletionOtp = deletionOtp;
    user.deletionOtpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    // Send deletion OTP email
    await transporter.sendMail({
      from: '"Molada Pay Security" <nifemidavid11@gmail.com>',
      to: user.email,
      subject: ' Account Deletion Confirmation - Molada Pay',
      html: deletionOtpTemplate(user.fullName, deletionOtp)
    });

    res.json({
      success: true,
      message: 'Deletion OTP sent to your email. Please check your inbox.',
      expiresIn: '10 minutes'
    });

  } catch (err) {
    console.error('Request deletion error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error. Please try again later.' 
    });
  }
});

// Step 2: Confirm and delete account
router.post('/confirm-deletion', authMiddleware, async (req, res) => {
  try {
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({ 
        success: false, 
        message: 'OTP is required' 
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Verify OTP
    if (user.deletionOtp !== otp) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid OTP' 
      });
    }

    if (!user.deletionOtpExpires || user.deletionOtpExpires < Date.now()) {
      return res.status(400).json({ 
        success: false, 
        message: 'OTP has expired. Please request a new one.' 
      });
    }

    // Store email for confirmation
    const userEmail = user.email;
    const userName = user.fullName;

    // Delete associated wallet
    await Wallet.deleteOne({ user: user._id });

    // Delete all transactions
    await Transaction.deleteMany({ userId: user._id });

    // Delete user account
    await User.deleteOne({ _id: user._id });

    // Send confirmation email
    const confirmationEmail = `
      <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 30px;">
        <div style="max-width: 500px; margin: auto; background-color: white; padding: 20px; border-radius: 10px; border: 1px solid #ddd;">
          <h2 style="color: #28a745; text-align: center;">Account Successfully Deleted</h2>
          <p>Hello <strong>${userName}</strong>,</p>
          <p>Your Molada Pay account has been permanently deleted as requested.</p>
          <p>All your data, including:</p>
          <ul>
            <li>Personal information</li>
            <li>Wallet and balances</li>
            <li>Transaction history</li>
            <li>Saved preferences</li>
          </ul>
          <p>...has been removed from our system.</p>
          <p>We're sorry to see you go. If you change your mind, you can always create a new account.</p>
          <p style="margin-top: 30px;">Thank you for using Molada Pay.</p>
          <p style="font-size: 12px; color: #999; text-align: center; margin-top: 30px;">© ${new Date().getFullYear()} Molada Pay. All rights reserved.</p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: '"Molada Pay" <nifemidavid11@gmail.com>',
      to: userEmail,
      subject: 'Account Deleted - Molada Pay',
      html: confirmationEmail
    });

    res.json({
      success: true,
      message: 'Your account has been permanently deleted. You will be logged out.',
      redirect: '/login'
    });

  } catch (err) {
    console.error('Confirm deletion error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error. Please try again later.' 
    });
  }
});

// Cancel deletion request
router.post('/cancel-deletion', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Clear deletion OTP
    user.deletionOtp = undefined;
    user.deletionOtpExpires = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Account deletion request cancelled successfully'
    });

  } catch (err) {
    console.error('Cancel deletion error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

module.exports = router;