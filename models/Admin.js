
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['super_admin', 'support_admin', 'finance_admin', 'customer_support'],
    default: 'support_admin'
  },
  fullName: { type: String, required: true },
  permissions: [{
    type: String,
    enum: [
      'view_users', 'manage_users', 'view_transactions', 'manage_transactions',
      'view_kyc', 'manage_kyc', 'view_support', 'manage_support',
      'view_analytics', 'manage_settings'
    ]
  }],
  lastLogin: { type: Date },
  createdAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
  
  // Platform Revenue Wallet
  revenueWallet: {
    balance: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' },
    cryptoBalances: {
      btc: { type: Number, default: 0 },
      eth: { type: Number, default: 0 },
      trx: { type: Number, default: 0 },
      usdt: { type: Number, default: 0 }
    }
  }
}, { timestamps: true });

// Hash password before saving
adminSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password
adminSchema.methods.comparePassword = async function(password) {
  return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model('Admin', adminSchema);
