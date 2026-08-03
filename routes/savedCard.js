/**
 * SAVED CARD ROUTES
 * =================
 * Allows users to save a card for quick future deposits (CVV-only re-charge).
 * Card tokenization and charging are delegated to services/partnerBank.js.
 *
 * Routes:
 *  POST   /api/card/save              - Save (tokenize) a new card
 *  GET    /api/card/list              - List the user's saved cards
 *  DELETE /api/card/remove/:cardId    - Remove a saved card
 *  POST   /api/card/set-default/:cardId - Set a card as the default
 *  POST   /api/card/quick-deposit     - Fund wallet using a saved card (CVV only)
 */

const express     = require("express");
const router      = express.Router();
const SavedCard   = require("../models/SavedCard");
const User        = require("../models/User");
const Transaction = require("../models/Transaction");
const authMiddleware = require("../middleware/authMiddleware");
const feeService     = require("../services/feeService");
const partnerBank    = require("../services/partnerBank");

// Save a new card — tokenizes it with the partner bank so the full number is never stored
router.post("/save", authMiddleware, async (req, res) => {
  try {
    const { card_number, cvv, expiry_month, expiry_year, cardholderName } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Tokenize the card — a small verification charge (e.g. $0.50) is made by the bank
    const tokenResult = await partnerBank.tokenizeCard({
      cardNumber:  card_number,
      cvv,
      expiryMonth: expiry_month,
      expiryYear:  expiry_year,
      currency:    user.currency || "NGN",
      amount:      0.50,
      email:       user.email,
      fullName:    cardholderName,
      tx_ref:      `CARD-VERIFY-${Date.now()}-${user._id}`,
    });

    const cardLast4 = card_number.slice(-4);
    const cardType  = detectCardType(card_number);

    // Reject duplicate cards
    const existing = await SavedCard.findOne({
      userId:      user._id,
      cardLast4,
      expiryMonth: expiry_month,
      expiryYear:  expiry_year,
    });
    if (existing) {
      return res.status(400).json({ success: false, message: "Card already saved" });
    }

    const savedCard = new SavedCard({
      userId:         user._id,
      cardToken:      tokenResult.token,
      cardLast4,
      cardType,
      cardBrand:      tokenResult.issuer || "Unknown",
      expiryMonth:    expiry_month,
      expiryYear:     expiry_year,
      cardholderName,
      isVerified:     true,
      isDefault:      (await SavedCard.countDocuments({ userId: user._id })) === 0,
    });
    await savedCard.save();

    res.json({
      success: true,
      message: "Card saved successfully",
      card: {
        id:       savedCard._id,
        last4:    savedCard.cardLast4,
        type:     savedCard.cardType,
        brand:    savedCard.cardBrand,
        expiry:   `${savedCard.expiryMonth}/${savedCard.expiryYear}`,
        isDefault: savedCard.isDefault,
      },
    });
  } catch (error) {
    console.error("Save card error:", error);
    res.status(500).json({ success: false, message: "Failed to save card", error: error.message });
  }
});

// List all saved cards for the current user
router.get("/list", authMiddleware, async (req, res) => {
  try {
    const cards = await SavedCard.find({ userId: req.user.id }).sort({ isDefault: -1, createdAt: -1 });

    res.json({
      success: true,
      cards: cards.map(card => ({
        id:             card._id,
        last4:          card.cardLast4,
        type:           card.cardType,
        brand:          card.cardBrand,
        expiry:         `${card.expiryMonth}/${card.expiryYear}`,
        cardholderName: card.cardholderName,
        isDefault:      card.isDefault,
        isVerified:     card.isVerified,
        lastUsed:       card.lastUsed,
      })),
    });
  } catch (error) {
    console.error("List cards error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch cards" });
  }
});

// Remove a saved card
router.delete("/remove/:cardId", authMiddleware, async (req, res) => {
  try {
    const card = await SavedCard.findOne({ _id: req.params.cardId, userId: req.user.id });
    if (!card) {
      return res.status(404).json({ success: false, message: "Card not found" });
    }

    await card.deleteOne();

    // If the deleted card was the default, promote the next available card
    if (card.isDefault) {
      const nextCard = await SavedCard.findOne({ userId: req.user.id });
      if (nextCard) {
        nextCard.isDefault = true;
        await nextCard.save();
      }
    }

    res.json({ success: true, message: "Card removed successfully" });
  } catch (error) {
    console.error("Remove card error:", error);
    res.status(500).json({ success: false, message: "Failed to remove card" });
  }
});

// Set a saved card as the user's default
router.post("/set-default/:cardId", authMiddleware, async (req, res) => {
  try {
    const card = await SavedCard.findOne({ _id: req.params.cardId, userId: req.user.id });
    if (!card) {
      return res.status(404).json({ success: false, message: "Card not found" });
    }

    await SavedCard.updateMany({ userId: req.user.id }, { isDefault: false });
    card.isDefault = true;
    await card.save();

    res.json({ success: true, message: "Default card updated" });
  } catch (error) {
    console.error("Set default error:", error);
    res.status(500).json({ success: false, message: "Failed to set default card" });
  }
});

// Fund the wallet using a previously saved card — only CVV is required
router.post("/quick-deposit", authMiddleware, async (req, res) => {
  try {
    const { cardId, cvv, amount } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const savedCard = await SavedCard.findOne({ _id: cardId, userId: user._id });
    if (!savedCard) {
      return res.status(404).json({ success: false, message: "Card not found" });
    }

    // Calculate fees: 1.2% charged to user, 0.4% kept as platform revenue
    const userFee    = amount * 0.012;
    const adminFee   = amount * 0.004;
    const totalCharge = amount + userFee;

    const result = await partnerBank.chargeTokenizedCard({
      token:    savedCard.cardToken,
      cvv,
      amount:   totalCharge,
      currency: user.currency || "NGN",
      email:    user.email,
      tx_ref:   `QUICK-DEPOSIT-${Date.now()}-${user._id}`,
    });

    if (result.status !== "success") {
      return res.status(400).json({ success: false, message: "Deposit failed", error: result.message });
    }

    // Credit the wallet with the amount the user intended (excluding fees)
    user.walletBalance = (user.walletBalance || 0) + amount;
    await user.save();

    await feeService.collectFee(adminFee, user.currency || "NGN", "card_deposit");

    await Transaction.create({
      userId:   user._id,
      amount,
      currency: user.currency || "NGN",
      type:     "deposit",
      method:   "card",
      fee:      userFee,
      adminFee,
      status:   "success",
      metadata: {
        cardLast4: savedCard.cardLast4,
        cardType:  savedCard.cardType,
        reference: result.reference,
      },
    });

    savedCard.lastUsed = new Date();
    await savedCard.save();

    res.json({
      success:   true,
      message:   "Deposit successful",
      balance:   user.walletBalance,
      deposited: amount,
      fee:       userFee,
      total:     totalCharge,
    });
  } catch (error) {
    console.error("Quick deposit error:", error);
    res.status(500).json({ success: false, message: "Deposit failed", error: error.message });
  }
});

// Detect card brand from the card number prefix
function detectCardType(cardNumber) {
  const cleaned = cardNumber.replace(/\s/g, "");
  if (/^4/.test(cleaned))       return "visa";
  if (/^5[1-5]/.test(cleaned))  return "mastercard";
  if (/^506(0|1)/.test(cleaned)) return "verve";
  return "other";
}

module.exports = router;
