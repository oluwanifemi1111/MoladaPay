
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  from: {
    type: String,
    enum: ['user', 'admin'],
    required: true
  },
  message: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  adminEmail: String // Only for admin messages
}, { _id: false });

const supportTicketSchema = new mongoose.Schema({
  ticketId: {
    type: String,
    required: true,
    unique: true
  },
  userEmail: {
    type: String,
    required: true
  },
  subject: {
    type: String,
    required: true
  },
  messages: [messageSchema],
  status: {
    type: String,
    enum: ['open', 'in_progress', 'closed'],
    default: 'open'
  },
  queueNumber: {
    type: Number,
    required: true
  },
  lastReplyAt: {
    type: Date
  },
  closedAt: {
    type: Date
  }
}, { timestamps: true });

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
