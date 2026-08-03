const express = require("express");
const router = express.Router();
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");

// Update preferred language
router.put("/set-language", authMiddleware, async (req, res) => {
  try {
    const { language } = req.body;

    if (!language)
      return res.status(400).json({ message: "Language code is required." });

    // Example valid languages: 'en', 'fr', 'es', 'de', 'ar', etc.
    const supported = ["en", "fr", "es", "de", "pt", "ar", "zh", "hi", "ru"];
    if (!supported.includes(language))
      return res.status(400).json({ message: "Language not supported." });

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { language },
      { new: true }
    );

    res.json({
      message: "Language preference updated successfully.",
      language: user.language,
    });
  } catch (err) {
    console.error("Set language error:", err);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;