const mongoose = require("mongoose");

const kycSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    fullName: {
      type: String,
      required: true,
    },
    dob: {
      type: String,
    },
    address: {
      type: String,
    },
    idType: {
      type: String,
      enum: ["BVN", "NIN", "PASSPORT", "DRIVERS_LICENSE", "NATIONAL_ID"],
      required: true,
    },
    idNumber: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    reason: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("KYC", kycSchema);
