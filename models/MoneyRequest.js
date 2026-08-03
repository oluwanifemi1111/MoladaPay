
const mongoose = require('mongoose');

const moneyRequestSchema = new mongoose.Schema({
  requesterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: false // Optional - user can specify or leave blank
  },
  currency: {
    type: String,
    default: 'USD'
  },
  description: {
    type: String,
    required: true,
    maxlength: 500
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'cancelled'],
    default: 'pending'
  },
  respondedAt: {
    type: Date
  },
  rejectionReason: {
    type: String
  },
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction'
  }
}, {
  timestamps: true
});

// Index for efficient queries
moneyRequestSchema.index({ requesterId: 1, status: 1 });
moneyRequestSchema.index({ recipientId: 1, status: 1 });

module.exports = mongoose.model('MoneyRequest', moneyRequestSchema);
