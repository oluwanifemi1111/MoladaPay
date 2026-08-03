const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  // Core linkage
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  // For deposits/withdrawals
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  // For internal transfers
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

  // Amount and currency
  amount: { type: Number, required: true },
  senderCurrency: { type: String }, // Only for transfers
  receiverCurrency: { type: String }, // Only for transfers
  currency: { type: String }, // For blockchain tx (BTC, ETH, TRX, USDT-ERC20, etc.)
  convertedAmount: { type: Number },
  fee: { type: Number, default: 0 },
  adminFee: { type: Number, default: 0 },
  feeCollected: { type: Boolean, default: false },

  // Transaction type
  type: {
    type: String,
    enum: ["deposit", "fund", "transfer", "withdraw", "molada-to-molada"],
    required: true,
  },
  type: {
    type: String,
    enum: ["deposit", "fund", "transfer", "withdraw", "molada-to-molada"],
    required: true,
  },
  // Method / channel
  method: {
    type: String,
    enum: ["blockchain", "qrcode", "email/phone"],
    default: "email/phone",
  },

  // Status
  status: {
    type: String,
    enum: ["pending", "success", "failed", "pending_review"],
    default: "pending",
  },
  reviewRequired: { type: Boolean, default: false },
  reviewReason: { type: String },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  reviewedAt: { type: Date },

  // On-chain data
  onchainTxHash: { type: String, index: true },
  onchainLogIndex: { type: Number }, // ERC20/TRC20
  utxo: { type: String }, // For BTC
  confirmations: { type: Number, default: 0 },

  // Optional remark/description
  remark: { type: String, maxlength: 500 },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Indexes
transactionSchema.index(
  { onchainTxHash: 1, onchainLogIndex: 1 },
  { unique: true, sparse: true }
);
transactionSchema.index({ utxo: 1 }, { unique: true, sparse: true });

// Auto-update updatedAt
transactionSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Transaction", transactionSchema);