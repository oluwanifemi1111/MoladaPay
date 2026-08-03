// models/CryptoBalance.js
const mongoose = require("mongoose");

const cryptoBalanceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  asset: { type: String, enum: ["ETH","USDT","BTC","MLD"], index: true },
  balance: { type: Number, default: 0 }, // human units (e.g., ETH, BTC, USDT)
  hold: { type: Number, default: 0 }, // held for withdrawals/swaps
  updatedAt: { type: Date, default: Date.now },
}, { indexes: [{ userId: 1, asset: 1, unique: true }] });

module.exports = mongoose.model("CryptoBalance", cryptoBalanceSchema);