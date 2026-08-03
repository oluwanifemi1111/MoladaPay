
const mongoose = require("mongoose");

const savedCardSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  cardToken: {
    type: String,
    required: true, // Partner bank card token (used for re-charging without full card details)
    unique: true
  },
  cardLast4: {
    type: String,
    required: true // Last 4 digits for display
  },
  cardType: {
    type: String,
    required: true, // visa, mastercard, verve
    enum: ["visa", "mastercard", "verve", "other"]
  },
  cardBrand: {
    type: String, // Bank name if available
    default: "Unknown"
  },
  expiryMonth: {
    type: String,
    required: true
  },
  expiryYear: {
    type: String,
    required: true
  },
  cardholderName: {
    type: String,
    required: true
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  lastUsed: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Ensure only one default card per user
savedCardSchema.pre("save", async function(next) {
  if (this.isDefault) {
    await this.constructor.updateMany(
      { userId: this.userId, _id: { $ne: this._id } },
      { isDefault: false }
    );
  }
  next();
});

module.exports = mongoose.model("SavedCard", savedCardSchema);
