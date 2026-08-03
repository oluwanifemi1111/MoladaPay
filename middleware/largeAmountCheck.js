
const User = require('../models/User');
const Transaction = require('../models/Transaction');

// Check for large transactions and auto-freeze account for review
const largeAmountCheck = async (req, res, next) => {
  try {
    const { amount } = req.body;
    const userId = req.user?.id;

    if (!userId || !amount) return next();

    const user = await User.findById(userId);
    if (!user) return next();

    // Define threshold for large amounts (e.g., $10,000 or equivalent)
    const LARGE_AMOUNT_THRESHOLD = 10000;

    // Convert crypto to USD if needed
    let usdAmount = amount;
    const { currency } = req.body;
    
    if (currency && ['btc', 'eth', 'trx'].includes(currency.toLowerCase())) {
      const priceService = require('../services/priceService');
      const price = await priceService.getPrice(currency.toUpperCase());
      usdAmount = amount * price;
    }

    // Check if amount exceeds threshold
    if (usdAmount >= LARGE_AMOUNT_THRESHOLD) {
      // Freeze account and flag for review
      user.accountStatus = 'under_review';
      user.freezeReason = `Large transaction detected: $${usdAmount.toFixed(2)}`;
      user.freezeDate = new Date();
      user.suspiciousActivity.push({
        type: 'large_transaction',
        details: `Attempted ${currency || 'USD'} ${amount} transaction (≈$${usdAmount.toFixed(2)})`,
        timestamp: new Date()
      });
      await user.save();

      // Create a pending transaction record
      await Transaction.create({
        userId: user._id,
        amount: amount,
        currency: currency || 'usd',
        type: req.body.type || 'transfer',
        method: req.body.method || 'wallet',
        status: 'pending_review',
        reviewRequired: true,
        reviewReason: 'Large amount transaction'
      });

      return res.status(403).json({
        success: false,
        message: 'Transaction flagged for review due to large amount',
        accountStatus: 'under_review',
        freezeReason: user.freezeReason,
        action: 'Please contact customer support for verification'
      });
    }

    next();
  } catch (err) {
    console.error('Large amount check error:', err);
    next();
  }
};

module.exports = largeAmountCheck;
