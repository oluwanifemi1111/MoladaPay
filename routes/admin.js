
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { adminAuth, checkPermission } = require('../middleware/adminAuth');
const priceService = require('../services/priceService');

// Admin login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if admin email matches
    if (email !== 'moladapayad@gmail.com' && !await Admin.findOne({ email })) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(401).json({ message: 'Admin not found' });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!admin.isActive) {
      return res.status(403).json({ message: 'Admin account suspended' });
    }

    // Update last login
    admin.lastLogin = new Date();
    await admin.save();

    // Generate token
    const token = jwt.sign(
      { id: admin._id, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      success: true,
      token,
      admin: {
        id: admin._id,
        email: admin.email,
        fullName: admin.fullName,
        role: admin.role,
        permissions: admin.permissions
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all users with filters
router.get('/users', adminAuth, checkPermission('view_users'), async (req, res) => {
  try {
    const { verified, kycStatus, country, search, page = 1, limit = 20 } = req.query;
    
    const query = {};
    if (verified) query.verified = verified === 'true';
    if (kycStatus) query.kycStatus = kycStatus;
    if (country) query.country = country;
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { fullName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .select('-password -fingerprint -transactionPin -securityQuestions')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const count = await User.countDocuments(query);

    res.json({
      success: true,
      users,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      total: count
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get accounts under review (frozen for large transactions) - MUST BE BEFORE /:userId route
router.get('/users/under-review', adminAuth, checkPermission('view_users'), async (req, res) => {
  try {
    const users = await User.find({ 
      accountStatus: { $in: ['frozen', 'under_review'] }
    }).select('-password -fingerprint -transactionPin -securityQuestions');

    res.json({
      success: true,
      total: users.length,
      users
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get user details
router.get('/users/:userId', adminAuth, checkPermission('view_users'), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('-password -fingerprint -transactionPin -securityQuestions');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get crypto balances with USD values
    const cryptoBalances = {};
    for (const [coin, balance] of Object.entries(user.balances)) {
      const price = await priceService.getPrice(coin.toUpperCase());
      cryptoBalances[coin] = {
        balance,
        usdValue: balance * price
      };
    }

    res.json({
      success: true,
      user: {
        ...user.toObject(),
        cryptoBalances
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update user account status (suspend/activate/freeze/unfreeze)
router.patch('/users/:userId/status', adminAuth, checkPermission('manage_users'), async (req, res) => {
  try {
    const { action, reason } = req.body; // action: 'suspend', 'activate', 'freeze', 'unfreeze'
    
    if (!action) {
      return res.status(400).json({ message: 'Action is required', validActions: ['suspend', 'activate', 'freeze', 'unfreeze'] });
    }

    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const actionLower = action.toLowerCase().trim();

    switch(actionLower) {
      case 'suspend':
        user.accountStatus = 'suspended';
        user.suspensionReason = reason || 'Account suspended by admin';
        break;
      case 'activate':
        user.accountStatus = 'active';
        user.verified = true;
        user.suspensionReason = null;
        user.freezeReason = null;
        break;
      case 'freeze':
        user.accountStatus = 'frozen';
        user.freezeReason = reason || 'Account frozen by admin';
        user.freezeDate = new Date();
        break;
      case 'unfreeze':
        user.accountStatus = 'active';
        user.freezeReason = null;
        user.freezeDate = null;
        break;
      default:
        return res.status(400).json({ 
          message: `Invalid action: ${action}`, 
          validActions: ['suspend', 'activate', 'freeze', 'unfreeze'] 
        });
    }

    await user.save();

    // TODO: Send email notification to user

    res.json({
      success: true,
      message: `User account ${actionLower}d successfully`,
      accountStatus: user.accountStatus,
      reason: user.suspensionReason || user.freezeReason
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Review and approve/reject frozen account
router.post('/users/:userId/review', adminAuth, checkPermission('manage_users'), async (req, res) => {
  try {
    const { decision, notes } = req.body; // decision: 'approve' or 'reject'
    
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (decision === 'approve') {
      user.accountStatus = 'active';
      user.freezeReason = null;
      user.freezeDate = null;
    } else if (decision === 'reject') {
      user.accountStatus = 'suspended';
      user.suspensionReason = notes || 'Suspicious activity detected';
    }

    await user.save();

    res.json({
      success: true,
      message: `Account review ${decision}d`,
      accountStatus: user.accountStatus
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all transactions
router.get('/transactions', adminAuth, checkPermission('view_transactions'), async (req, res) => {
  try {
    const { type, status, method, page = 1, limit = 50 } = req.query;
    
    const query = {};
    if (type) query.type = type;
    if (status) query.status = status;
    if (method) query.method = method;

    const transactions = await Transaction.find(query)
      .populate('userId', 'fullName email')
      .populate('senderId', 'fullName email')
      .populate('receiverId', 'fullName email')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const count = await Transaction.countDocuments(query);

    res.json({
      success: true,
      transactions,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      total: count
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update transaction status
router.patch('/transactions/:txId/status', adminAuth, checkPermission('manage_transactions'), async (req, res) => {
  try {
    const { status, notes } = req.body;
    
    const transaction = await Transaction.findById(req.params.txId);
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    transaction.status = status;
    await transaction.save();

    res.json({
      success: true,
      message: 'Transaction status updated',
      transaction
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get pending KYC submissions
router.get('/kyc/pending', adminAuth, checkPermission('view_kyc'), async (req, res) => {
  try {
    // Only show KYCs that have been submitted (pending status)
    const users = await User.find({ 
      kycStatus: 'pending',
      'kyc.submittedAt': { $exists: true } // Ensure KYC was actually submitted
    })
      .select('fullName email kyc kycStatus createdAt');

    res.json({
      success: true,
      total: users.length,
      pendingKyc: users
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Approve/reject KYC
router.post('/kyc/:userId/review', adminAuth, checkPermission('manage_kyc'), async (req, res) => {
  try {
    const { status, reason } = req.body; // status: 'approved' or 'rejected'
    
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.kycStatus = status;
    if (user.kyc) {
      user.kyc.status = status;
      if (status === 'rejected') {
        user.kyc.rejectedReason = reason;
      } else {
        user.kyc.verifiedAt = new Date();
      }
    }
    await user.save();

    // TODO: Send email to user

    res.json({
      success: true,
      message: `KYC ${status} successfully`,
      user: {
        id: user._id,
        kycStatus: user.kycStatus
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get platform revenue and fee statistics
router.get('/revenue', adminAuth, checkPermission('view_analytics'), async (req, res) => {
  try {
    const feeService = require('../services/feeService');
    const priceService = require('../services/priceService');
    
    const revenue = await feeService.getPlatformRevenue(req.admin.email);
    
    // Calculate USD value of crypto revenue
    let totalCryptoUSD = 0;
    for (const [coin, balance] of Object.entries(revenue.cryptoBalances)) {
      if (balance > 0) {
        const price = await priceService.getPrice(coin.toUpperCase());
        totalCryptoUSD += balance * price;
      }
    }

    res.json({
      success: true,
      revenue: {
        fiat: revenue.totalFiat,
        crypto: revenue.cryptoBalances,
        totalCryptoUSD,
        totalRevenueUSD: revenue.totalFiat + totalCryptoUSD,
        totalTransactions: revenue.totalTransactions,
        totalFeesCollected: revenue.totalFeesCollected
      },
      feeStructure: feeService.FEE_STRUCTURE
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get revenue breakdown by transaction type
router.get('/revenue/breakdown', adminAuth, checkPermission('view_analytics'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const matchQuery = { feeCollected: true };
    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
      if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
    }

    const breakdown = await Transaction.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$type',
          totalFees: { $sum: '$adminFee' },
          count: { $sum: 1 },
          avgFee: { $avg: '$adminFee' }
        }
      },
      { $sort: { totalFees: -1 } }
    ]);

    res.json({
      success: true,
      breakdown
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Withdraw revenue to admin bank account
router.post('/revenue/withdraw', adminAuth, checkPermission('manage_settings'), async (req, res) => {
  try {
    const { amount, currency = 'NGN', account_number, bank_code } = req.body;
    
    if (!amount || !account_number || !bank_code) {
      return res.status(400).json({ 
        message: 'Amount, account_number, and bank_code are required' 
      });
    }

    const admin = await Admin.findById(req.admin.id);
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    // Check if admin has sufficient balance
    if (!admin.revenueWallet || admin.revenueWallet.balance < amount) {
      return res.status(400).json({ 
        message: `Insufficient revenue balance. Available: ${admin.revenueWallet?.balance || 0}` 
      });
    }

    const reference = `MOLADA-ADMIN-WITHDRAW-${Date.now()}`;

    // Delegate the bank transfer to the partner bank service
    const partnerBank = require('../services/partnerBank');
    const result = await partnerBank.initiateTransfer({
      accountNumber: account_number,
      bankCode:      bank_code,
      amount:        Number(amount),
      currency,
      narration:     'Molada Admin Revenue Withdrawal',
      reference,
    });

    if (result.status === 'success') {
      admin.revenueWallet.balance -= Number(amount);
      await admin.save();

      const AdminWithdrawal = new Transaction({
        userId:        admin._id,
        amount:        Number(amount),
        currency,
        type:          'withdraw',
        method:        'blockchain',
        status:        'success',
        onchainTxHash: result.reference,
      });
      await AdminWithdrawal.save();

      return res.json({
        success:          true,
        message:          'Admin revenue withdrawal successful',
        amount,
        currency,
        reference:        result.reference,
        remainingBalance: admin.revenueWallet.balance,
      });
    } else {
      return res.status(400).json({ 
        success: false, 
        message: 'Withdrawal failed',
        details: result,
      });
    }
  } catch (err) {
    console.error('Admin withdrawal error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Platform statistics
router.get('/analytics/dashboard', adminAuth, checkPermission('view_analytics'), async (req, res) => {
  try {
    // User stats
    const totalUsers = await User.countDocuments();
    const verifiedUsers = await User.countDocuments({ verified: true });
    const kycApproved = await User.countDocuments({ kycStatus: 'approved' });
    
    // Transaction stats
    const totalTransactions = await Transaction.countDocuments();
    const successfulTx = await Transaction.countDocuments({ status: 'success' });
    
    // Calculate total platform balance
    const users = await User.find({}).select('walletBalance balances');
    let totalFiatBalance = 0;
    let totalCryptoUSD = 0;

    for (const user of users) {
      totalFiatBalance += user.walletBalance || 0;
      
      // Calculate crypto USD value
      for (const [coin, balance] of Object.entries(user.balances)) {
        const price = await priceService.getPrice(coin.toUpperCase());
        totalCryptoUSD += balance * price;
      }
    }

    // Transaction volume (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentTransactions = await Transaction.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo }, status: 'success' } },
      { $group: { _id: null, totalVolume: { $sum: '$amount' } } }
    ]);

    const monthlyVolume = recentTransactions[0]?.totalVolume || 0;

    res.json({
      success: true,
      analytics: {
        users: {
          total: totalUsers,
          verified: verifiedUsers,
          kycApproved: kycApproved
        },
        transactions: {
          total: totalTransactions,
          successful: successfulTx,
          monthlyVolume
        },
        balances: {
          totalFiat: totalFiatBalance,
          totalCryptoUSD: totalCryptoUSD,
          platformTotal: totalFiatBalance + totalCryptoUSD
        }
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Transaction volume over time
router.get('/analytics/transactions', adminAuth, checkPermission('view_analytics'), async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const transactions = await Transaction.aggregate([
      { $match: { createdAt: { $gte: startDate }, status: 'success' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
          volume: { $sum: '$amount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      data: transactions
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all pending account reviews
router.get('/reviews/pending', adminAuth, checkPermission('view_users'), async (req, res) => {
  try {
    const AccountReview = require('../models/AccountReview');
    const reviews = await AccountReview.find({ status: 'pending' })
      .populate('userId', 'fullName email accountStatus')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      total: reviews.length,
      reviews
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get review details
router.get('/reviews/:reviewId', adminAuth, checkPermission('view_users'), async (req, res) => {
  try {
    const AccountReview = require('../models/AccountReview');
    const review = await AccountReview.findById(req.params.reviewId)
      .populate('userId', 'fullName email phone accountStatus freezeReason suspiciousActivity');

    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    res.json({
      success: true,
      review
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Review and approve/reject frozen account (UPDATED)
router.post('/users/:userId/review', adminAuth, checkPermission('manage_users'), async (req, res) => {
  try {
    const { decision, notes, reviewId } = req.body; // decision: 'approve' or 'reject'
    
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const AccountReview = require('../models/AccountReview');

    if (decision === 'approve') {
      user.accountStatus = 'active';
      user.freezeReason = null;
      user.freezeDate = null;
      user.suspensionReason = null;
      await user.save();

      // Update review if provided
      if (reviewId) {
        await AccountReview.findByIdAndUpdate(reviewId, {
          status: 'approved',
          adminNotes: notes,
          adminId: req.admin.id,
          reviewedAt: new Date()
        });
      }

      return res.json({
        success: true,
        message: 'Account approved and reactivated',
        accountStatus: user.accountStatus
      });
    } 
    
    if (decision === 'reject') {
      user.accountStatus = 'suspended';
      user.suspensionReason = notes || 'Account review rejected - Suspicious activity confirmed';
      await user.save();

      // Update review if provided
      if (reviewId) {
        await AccountReview.findByIdAndUpdate(reviewId, {
          status: 'rejected',
          adminNotes: notes,
          adminId: req.admin.id,
          reviewedAt: new Date()
        });
      }

      return res.json({
        success: true,
        message: 'Account permanently suspended',
        accountStatus: user.accountStatus,
        reason: user.suspensionReason
      });
    }

    return res.status(400).json({ message: 'Invalid decision. Use "approve" or "reject"' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Support routes are now in /api/support/* with admin authentication
// See routes/supportRoutes.js for admin ticket management

module.exports = router;
