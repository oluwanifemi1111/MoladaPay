// middleware/checkKyc.js
const User = require("../models/User");

const checkKyc = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.kycStatus !== "approved") {
      return res.status(403).json({ message: "KYC not verified. Please complete KYC." });
    }

    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = checkKyc; //  not in curly braces