
const Admin = require('../models/Admin');
const Transaction = require('../models/Transaction');

// Fee structure (in percentage)
const FEE_STRUCTURE = {
  transfer: 0.5,        // 0.5% for internal transfers
  withdraw: 1.0,        // 1% for withdrawals
  crypto_send: 0.8,     // 0.8% for crypto sends
  crypto_swap: 1.5,     // 1.5% for crypto swaps
  deposit: 0,           // No fee for deposits
  fund: 0               // No fee for funding
};

// Calculate fee for a transaction
function calculateFee(type, amount) {
  const feePercentage = FEE_STRUCTURE[type] || 0;
  return (amount * feePercentage) / 100;
}

// Collect fee and add to admin revenue
async function collectFee(transactionId, adminEmail = 'moladapayad@gmail.com') {
  try {
    const transaction = await Transaction.findById(transactionId);
    if (!transaction || transaction.feeCollected) {
      return { success: false, message: 'Transaction not found or fee already collected' };
    }

    const admin = await Admin.findOne({ email: adminEmail });
    if (!admin) {
      return { success: false, message: 'Admin account not found' };
    }

    // Calculate and collect fee
    const fee = calculateFee(transaction.type, transaction.amount);
    
    if (fee > 0) {
      // Update admin revenue wallet
      if (!admin.revenueWallet) {
        admin.revenueWallet = {
          balance: 0,
          currency: 'USD',
          cryptoBalances: { btc: 0, eth: 0, trx: 0, usdt: 0 }
        };
      }

      // Add to appropriate balance
      if (transaction.currency && ['btc', 'eth', 'trx', 'usdt'].includes(transaction.currency.toLowerCase())) {
        const cryptoCurrency = transaction.currency.toLowerCase();
        admin.revenueWallet.cryptoBalances[cryptoCurrency] += fee;
      } else {
        admin.revenueWallet.balance += fee;
      }

      await admin.save();

      // Mark fee as collected
      transaction.adminFee = fee;
      transaction.feeCollected = true;
      await transaction.save();

      return { 
        success: true, 
        fee, 
        currency: transaction.currency || 'USD',
        adminBalance: admin.revenueWallet.balance 
      };
    }

    return { success: true, fee: 0, message: 'No fee applicable' };
  } catch (err) {
    console.error('Fee collection error:', err);
    return { success: false, message: err.message };
  }
}

// Get total platform revenue
async function getPlatformRevenue(adminEmail = 'moladapayad@gmail.com') {
  try {
    const admin = await Admin.findOne({ email: adminEmail });
    if (!admin || !admin.revenueWallet) {
      return {
        totalFiat: 0,
        cryptoBalances: { btc: 0, eth: 0, trx: 0, usdt: 0 },
        totalTransactions: 0,
        totalFeesCollected: 0
      };
    }

    // Calculate total fees collected
    const feeStats = await Transaction.aggregate([
      { $match: { feeCollected: true } },
      {
        $group: {
          _id: null,
          totalFees: { $sum: '$adminFee' },
          count: { $sum: 1 }
        }
      }
    ]);

    const stats = feeStats[0] || { totalFees: 0, count: 0 };

    return {
      totalFiat: admin.revenueWallet.balance,
      cryptoBalances: admin.revenueWallet.cryptoBalances,
      totalTransactions: stats.count,
      totalFeesCollected: stats.totalFees
    };
  } catch (err) {
    console.error('Revenue stats error:', err);
    throw err;
  }
}

module.exports = {
  calculateFee,
  collectFee,
  getPlatformRevenue,
  FEE_STRUCTURE
};
