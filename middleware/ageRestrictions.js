
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const nodemailer = require('nodemailer');

// Email transporter for parent notifications
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
});

// Helper: Calculate current age from dateOfBirth
function calculateCurrentAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
}

// Helper: Send parent notification email
async function notifyParent(user, transactionDetails) {
  if (!user.parentEmail || user.emailNotifications === false) return;

  const { type, amount, currency, recipient } = transactionDetails;
  const fmt = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const html = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border-radius: 12px; background:#f7f9fc; color:#111;">
    <div style="text-align:center; margin:0 0 15px;">
      <img src="https://i.ibb.co/jvYtrMv3/IMG-20250711-WA0068.jpg" alt="Molada Pay Logo" style="height: 50px;">
    </div>
    <h2 style="color:#4B0082; text-align:center; margin:0 0 20px;">Minor Account Alert</h2>
    <div style="background:#fff; padding:25px; border-radius:12px; box-shadow:0 4px 12px rgba(0,0,0,.06);">
      <h3 style="color:#ff9800; margin:0 0 20px;">Transaction Notification</h3>
      
      <p style="margin:0 0 20px; font-size:16px;">
        Dear Parent/Guardian,<br/>
        <b>${user.fullName}</b> (minor account) has made a transaction.
      </p>

      <div style="background:#f8f9fa; padding:15px; border-radius:8px; margin:20px 0;">
        <table style="width:100%; border-collapse:collapse;">
          <tr>
            <td style="padding:8px 0; color:#666; font-size:14px;">Account Holder:</td>
            <td style="padding:8px 0; text-align:right; font-weight:600;">${user.fullName}</td>
          </tr>
          <tr>
            <td style="padding:8px 0; color:#666; font-size:14px;">Transaction Type:</td>
            <td style="padding:8px 0; text-align:right; font-weight:600;">${type}</td>
          </tr>
          ${recipient ? `<tr>
            <td style="padding:8px 0; color:#666; font-size:14px;">Recipient:</td>
            <td style="padding:8px 0; text-align:right; font-weight:600;">${recipient}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:8px 0; color:#666; font-size:14px;">Amount:</td>
            <td style="padding:8px 0; text-align:right; font-weight:600; color:#d9534f;">${currency} ${fmt(amount)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0; color:#666; font-size:14px;">Current Balance:</td>
            <td style="padding:8px 0; text-align:right; font-weight:600;">${currency} ${fmt(user.walletBalance)}</td>
          </tr>
        </table>
      </div>

      <p style="margin:20px 0 0; font-size:14px; color:#666;">
        This is an automated notification for monitoring purposes. If you have concerns, please contact support.
      </p>
    </div>
    <div style="text-align:center; font-size:12px; margin-top:15px; color:#777;">
      &copy; ${new Date().getFullYear()} Molada Pay. All rights reserved.
    </div>
  </div>
  `;

  try {
    await transporter.sendMail({
      from: '"Molada Pay" <nifemidavid11@gmail.com>',
      to: user.parentEmail,
      subject: `Minor Account Alert: ${user.fullName} - ${type} Transaction`,
      html
    });
    console.log(` Parent notification sent to ${user.parentEmail}`);
  } catch (err) {
    console.error('Parent notification error:', err);
  }
}

// Age-based transaction limits and restrictions
const AGE_LIMITS = {
  MINOR: { // Under 18
    maxDailyTransfer: 50000, // NGN or equivalent
    maxSingleTransaction: 10000,
    maxMonthlyWithdrawal: 100000,
    cryptoTradingAllowed: false,
    internationalTransferAllowed: false,
    virtualCardAllowed: false,
    allowedBillTypes: ['airtime', 'data'], // Only basic utilities
  },
  ADULT: { // 18 and above
    maxDailyTransfer: Infinity,
    maxSingleTransaction: Infinity,
    maxMonthlyWithdrawal: Infinity,
    cryptoTradingAllowed: true,
    internationalTransferAllowed: true,
    virtualCardAllowed: true,
    allowedBillTypes: ['airtime', 'data', 'electricity', 'cable', 'internet'], // All bills
  }
};

// Check if user meets age requirements for action
const checkAgeRestriction = (restrictionType) => {
  return async (req, res, next) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Use real-time age calculation if dateOfBirth exists
      let currentAge = user.age;
      if (user.dateOfBirth) {
        currentAge = calculateCurrentAge(user.dateOfBirth);
        
        // Update user's stored age if it changed
        if (currentAge !== user.age) {
          user.age = currentAge;
          await user.save();
        }
      }

      const isMinor = currentAge < 18;
      const limits = isMinor ? AGE_LIMITS.MINOR : AGE_LIMITS.ADULT;

      // VELOCITY CHECK: Max transactions per day for minors
      if (isMinor && restrictionType === 'transaction_limit') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todayTransactions = await Transaction.countDocuments({
          $or: [{ senderId: user._id }, { userId: user._id }],
          createdAt: { $gte: today },
          status: 'success'
        });

        const MAX_DAILY_TRANSACTIONS = 10;
        if (todayTransactions >= MAX_DAILY_TRANSACTIONS) {
          return res.status(403).json({
            success: false,
            message: `Daily transaction limit reached. Minors can make maximum ${MAX_DAILY_TRANSACTIONS} transactions per day.`,
            reason: 'age_restriction',
            transactionsToday: todayTransactions,
            limit: MAX_DAILY_TRANSACTIONS
          });
        }

        // Check for rapid transactions (cooling period: 2 minutes)
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
        const recentTransaction = await Transaction.findOne({
          $or: [{ senderId: user._id }, { userId: user._id }],
          createdAt: { $gte: twoMinutesAgo },
          status: 'success'
        }).sort({ createdAt: -1 });

        if (recentTransaction) {
          const waitTime = Math.ceil((120 - (Date.now() - recentTransaction.createdAt) / 1000) / 60);
          return res.status(429).json({
            success: false,
            message: `Please wait ${waitTime} minute(s) before making another transaction.`,
            reason: 'cooling_period',
            waitMinutes: waitTime
          });
        }
      }

      // Check specific restrictions
      switch(restrictionType) {
        case 'crypto':
          if (isMinor && !limits.cryptoTradingAllowed) {
            return res.status(403).json({
              success: false,
              message: 'Crypto trading is not available for users under 18 years old',
              reason: 'age_restriction'
            });
          }
          break;

        case 'international_transfer':
          if (isMinor && !limits.internationalTransferAllowed) {
            // Check if this is an international transfer by comparing sender/receiver countries
            const { receiverIdentifier, receiverQrData } = req.body;
            
            let receiver;
            if (receiverQrData) {
              const parsed = JSON.parse(receiverQrData);
              receiver = await User.findOne({ $or: [{ email: parsed.email }, { phone: parsed.phone }] });
            } else if (receiverIdentifier) {
              receiver = await User.findOne({ $or: [{ email: receiverIdentifier }, { phone: receiverIdentifier }] });
            }

            // If receiver exists and is from different country, block the transfer
            if (receiver && receiver.country && user.country && receiver.country !== user.country) {
              return res.status(403).json({
                success: false,
                message: 'International transfers are not available for users under 18 years old. You can only send money within your country.',
                reason: 'age_restriction',
                allowedCountries: [user.country]
              });
            }
          }
          break;

        case 'virtual_card':
          if (isMinor && !limits.virtualCardAllowed) {
            return res.status(403).json({
              success: false,
              message: 'Virtual card issuance requires parental approval for users under 18',
              reason: 'age_restriction',
              requiresParentApproval: true
            });
          }
          break;

        case 'transaction_limit':
          const amount = req.body.amount || 0;
          if (isMinor) {
            if (amount > limits.maxSingleTransaction) {
              return res.status(403).json({
                success: false,
                message: `Transaction amount exceeds limit for minors. Maximum: ${limits.maxSingleTransaction}`,
                maxAllowed: limits.maxSingleTransaction,
                reason: 'age_restriction'
              });
            }
          }
          break;

        case 'bill_payment':
          const billType = req.body.type || req.body.billType;
          if (isMinor && !limits.allowedBillTypes.includes(billType)) {
            return res.status(403).json({
              success: false,
              message: `Bill type '${billType}' is not available for users under 18`,
              allowedTypes: limits.allowedBillTypes,
              reason: 'age_restriction'
            });
          }
          break;
      }

      // Attach age limits to request for further use
      req.ageLimits = limits;
      req.isMinor = isMinor;
      next();
    } catch (err) {
      console.error('Age restriction check error:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };
};

// Get user's age-based limits
const getAgeLimits = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isMinor = user.age < 18;
    const limits = isMinor ? AGE_LIMITS.MINOR : AGE_LIMITS.ADULT;

    res.json({
      success: true,
      isMinor,
      age: user.age,
      limits,
      parentEmail: user.parentEmail || null
    });
  } catch (err) {
    console.error('Get age limits error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  checkAgeRestriction,
  getAgeLimits,
  AGE_LIMITS,
  notifyParent
};
