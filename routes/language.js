
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const User = require('../models/User');
const languages = require('../config/languages');

// Get all available languages
router.get('/list', (req, res) => {
  res.json({
    success: true,
    languages: Object.entries(languages).map(([code, info]) => ({
      code,
      ...info
    }))
  });
});

// Get user's current language
router.get('/current', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('language');
    res.json({
      success: true,
      language: user.language || 'en'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Set user's language preference
router.post('/set', authMiddleware, async (req, res) => {
  try {
    const { language } = req.body;

    if (!languages[language]) {
      return res.status(400).json({
        success: false,
        message: 'Invalid language code'
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { language },
      { new: true }
    ).select('language');

    res.json({
      success: true,
      message: 'Language updated successfully',
      language: user.language
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Translate text on-demand
router.post('/translate', async (req, res) => {
  try {
    const { text, targetLang, sourceLang = 'en' } = req.body;
    const translationService = require('../services/translationService');
    
    const translated = await translationService.translate(text, targetLang, sourceLang);
    
    res.json({
      success: true,
      original: text,
      translated,
      targetLang
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
