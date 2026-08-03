
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const AccountReview = require('../models/AccountReview');
const authMiddleware = require('../middleware/authMiddleware');

// Check if user can submit review (only if account is frozen/under_review)
router.get('/can-submit', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const canSubmit = ['frozen', 'under_review'].includes(user.accountStatus);
    
    res.json({
      success: true,
      canSubmit,
      accountStatus: user.accountStatus,
      freezeReason: user.freezeReason
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Submit account review request (only if frozen)
router.post('/submit', authMiddleware, async (req, res) => {
  try {
    const { explanation } = req.body;

    if (!explanation || explanation.trim().length < 10) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide a detailed explanation (minimum 10 characters)' 
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check if account is frozen or under review
    if (!['frozen', 'under_review'].includes(user.accountStatus)) {
      return res.status(403).json({ 
        success: false, 
        message: 'You can only submit a review when your account is frozen' 
      });
    }

    // Check if already has pending review
    const existingReview = await AccountReview.findOne({ 
      userId: user._id, 
      status: 'pending' 
    });

    if (existingReview) {
      return res.status(400).json({ 
        success: false, 
        message: 'You already have a pending review request' 
      });
    }

    // Create review request
    const review = new AccountReview({
      userId: user._id,
      userEmail: user.email,
      userName: user.fullName,
      freezeReason: user.freezeReason,
      userExplanation: explanation,
      status: 'pending'
    });

    await review.save();

    res.json({
      success: true,
      message: 'Review request submitted successfully. An admin will review your case shortly.',
      reviewId: review._id
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get user's review status
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const reviews = await AccountReview.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      success: true,
      reviews: reviews.map(r => ({
        id: r._id,
        status: r.status,
        userExplanation: r.userExplanation,
        adminNotes: r.adminNotes,
        submittedAt: r.submittedAt,
        reviewedAt: r.reviewedAt
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
