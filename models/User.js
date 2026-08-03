const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const deviceSchema = new mongoose.Schema(
  {
    deviceId: String,
    ip: String,
    userAgent: String,
    city: String,
    country: String,
    region: String,
    timezone: String,
    loginAt: { type: Date, default: Date.now },
    logoutAt: { type: Date },
    createdAt: { type: Date, default: Date.now },
    warningSent: { type: Boolean, default: false },
  },
  { _id: false }
);

const securityQuestionSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true },
    answerHash: { type: String, required: true },
  },
  { _id: false }
);

const kycSchema = new mongoose.Schema(
  {
    bvn: { type: String },
    nin: { type: String },
    passport: { type: String }, // file path
    idCard: { type: String }, // file path
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending',
    },
    submittedAt: { type: Date },
    verifiedAt: { type: Date },
    rejectedReason: { type: String },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    address: { type: String, required: true },
    postalCode: { type: String, required: true },
    age: { type: Number, required: true },
    dateOfBirth: { type: Date }, // Store actual birthday for age calculation
    email: { type: String, required: true, unique: true },
    parentEmail: { type: String },
    phone: { type: String, required: true },
    referralCode: { type: String },
    password: { type: String, required: true },

    // Email OTP
    otp: { type: String },
    otpExpires: { type: Date },
    verified: { type: Boolean, default: false },

    virtualAccount: {
      accountNumber: String,
      bankName: String,
    },

    // Wallet
    walletBalance: { type: Number, default: 0 },
    currency: { type: String },

    // Password reset
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },

    // OTP rate-limit
    otpRequests: { type: Number, default: 0 },
    otpLastRequest: { type: Date },

    country: { type: String },
    lastLogin: { type: Date },

    // Biometric
    fingerprint: { type: String },
    fingerprintEnabled: { type: Boolean, default: false },

    // Transaction PIN
    transactionPin: { type: String },

    // PIN recovery
    pinResetOtp: { type: String },
    pinResetOtpExpires: { type: Date },

    // Account deletion
    deletionOtp: { type: String },
    deletionOtpExpires: { type: Date },

    // Email change
    emailChangeOtp: { type: String },
    emailChangeOtpExpires: { type: Date },
    pendingNewEmail: { type: String },

    // Security questions
    securityQuestions: [securityQuestionSchema],

    // Devices
    devices: [deviceSchema],

    // KYC
    kyc: kycSchema,
    kycStatus: {
      type: String,
      enum: ['not_submitted', 'pending', 'approved', 'rejected'],
      default: 'not_submitted'
    },

    // Account Status & Security
    accountStatus: {
      type: String,
      enum: ['active', 'suspended', 'frozen', 'under_review'],
      default: 'active'
    },
    freezeReason: { type: String },
    freezeDate: { type: Date },
    suspensionReason: { type: String },
    
    // Anti-hack features
    failedLoginAttempts: { type: Number, default: 0 },
    lastFailedLogin: { type: Date },
    accountLockedUntil: { type: Date },
    suspiciousActivity: [{
      type: { type: String }, // e.g., 'multiple_failed_logins', 'unusual_location', 'large_transaction'
      details: { type: String },
      timestamp: { type: Date, default: Date.now }
    }],

    crypto: {
      evmIndex: { type: Number, default: null },
      btcIndex: { type: Number, default: null },
      trxIndex: { type: Number, default: null },

      bitcoin: { type: String },
    bitcoinPrivateKey: { type: String },
    ethereum: { type: String },
    ethereumPrivateKey: { type: String },
    tron: { type: String },
    tronPrivateKey: { type: String },
    mnemonic: { type: String }
  },

    balances: {
      eth: { type: Number, default: 0 }, // Ethereum
      btc: { type: Number, default: 0 }, // Bitcoin
      trx: { type: Number, default: 0 }, // TRX
      usdt_trc20: { type: Number, default: 0 }, // USDT TRC20
      usdt_eth: { type: Number, default: 0 }, //USDT ERC20
    },

    language: {
      type: String,
      default: 'en',
    },

    emailNotifications: {
      type: Boolean,
      default: true, // Enabled by default
    },
  },
  { timestamps: true }
);

userSchema.pre('save', function (next) {
  if (!this.crypto) {
    this.crypto = {
      evmIndex: null,
      btcIndex: null,
      trxIndex: null,
      eth: null,
      usdt_eth: null,
      usdt_trc20: null,
      btc: null,
      trx: null,
      trxPrivateKey: null,
    };
  }
  if (!this.balances) {
    this.balances = {
      eth: 0,
      usdt_eth: 0,
      btc: 0,
      trx: 0,
      usdt_trc20: 0,
    };
  }
  next();
});

// Compare PIN
userSchema.methods.comparePin = async function (pin) {
  if (!this.transactionPin) return false;
  return bcrypt.compare(pin, this.transactionPin);
};

// Add indexes for performance
userSchema.index({ email: 1 });
userSchema.index({ phone: 1 });
userSchema.index({ walletId: 1 });
userSchema.index({ kycStatus: 1 });
userSchema.index({ accountStatus: 1 });
userSchema.index({ 'crypto.bitcoin': 1 });
userSchema.index({ 'crypto.ethereum': 1 });
userSchema.index({ 'crypto.tron': 1 });

module.exports = mongoose.model('User', userSchema);
