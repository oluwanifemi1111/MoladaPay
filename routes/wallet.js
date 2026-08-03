/**
 * WALLET ROUTES
 * =============
 * Manages user wallet balances (fiat + crypto) and virtual account generation.
 * Virtual account creation and payment events are delegated to services/partnerBank.js.
 *
 * Routes:
 *  GET  /api/wallet/balance/:userId     - Get fiat + crypto balances for a user
 *  POST /api/wallet/deposit/account     - Generate a virtual bank account for deposits
 *  POST /api/wallet/webhook/bank        - Receive payment event notifications from the bank
 */

const express     = require("express");
const router      = express.Router();
const Transaction = require("../models/Transaction");
const User        = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const partnerBank    = require("../services/partnerBank");

// Get full wallet balance — fiat + all crypto assets
router.get("/balance/:userId", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    req.language = user.language || "en";

    const fiatBalance    = user.walletBalance || 0;
    const walletServices = require("../services/walletServices");
    const priceService   = require("../services/priceService");

    const cryptoBalances     = {};
    let   totalCryptoUsdValue = 0;

    // Bitcoin balance
    if (user.crypto?.bitcoin) {
      try {
        const btcBalance = await walletServices.getBTCBalance(user.crypto.bitcoin);
        const btcPrice   = await priceService.getPrice("BTC");
        cryptoBalances.bitcoin = { address: user.crypto.bitcoin, balance: btcBalance, usdValue: btcBalance * btcPrice, price: btcPrice };
        totalCryptoUsdValue += btcBalance * btcPrice;
      } catch (err) {
        cryptoBalances.bitcoin = { address: user.crypto.bitcoin, error: err.message };
      }
    }

    // Ethereum + USDT (ERC20) balance
    if (user.crypto?.ethereum) {
      try {
        const ethBalance = await walletServices.getETHBalance(user.crypto.ethereum);
        const ethPrice   = await priceService.getPrice("ETH");
        cryptoBalances.ethereum = { address: user.crypto.ethereum, balance: ethBalance, usdValue: ethBalance * ethPrice, price: ethPrice };
        totalCryptoUsdValue += ethBalance * ethPrice;

        const usdtEthBalance = await walletServices.getUsdtErc20Balance(user.crypto.ethereum);
        cryptoBalances.usdt_eth = { address: user.crypto.ethereum, balance: usdtEthBalance, usdValue: usdtEthBalance, price: 1 };
        totalCryptoUsdValue += usdtEthBalance;
      } catch (err) {
        cryptoBalances.ethereum = { address: user.crypto.ethereum, error: err.message };
      }
    }

    // Tron + USDT (TRC20) balance
    if (user.crypto?.tron) {
      try {
        const trxBalance = await walletServices.getTRXBalance(user.crypto.tron);
        const trxPrice   = await priceService.getPrice("TRX");
        cryptoBalances.tron = { address: user.crypto.tron, balance: trxBalance, usdValue: trxBalance * trxPrice, price: trxPrice };
        totalCryptoUsdValue += trxBalance * trxPrice;

        const usdtTrc20Balance = await walletServices.getUsdtTrc20Balance(user.crypto.tron);
        cryptoBalances.usdt_trc20 = { address: user.crypto.tron, balance: usdtTrc20Balance, usdValue: usdtTrc20Balance, price: 1 };
        totalCryptoUsdValue += usdtTrc20Balance;
      } catch (err) {
        cryptoBalances.tron = { address: user.crypto.tron, error: err.message };
      }
    }

    res.json({
      success: true,
      fiatBalance,
      cryptoBalances,
      totalCryptoUsdValue,
      totalBalance: fiatBalance + totalCryptoUsdValue,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Balance error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Generate a virtual bank account number so a user can deposit via bank transfer
router.post("/deposit/account", async (req, res) => {
  try {
    const { userId, bvn, email, phone, firstname, lastname, amount } = req.body;

    if (!amount || amount < 1) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    // Resolve the user's email if not provided directly
    let userEmail = email;
    if (!userEmail && userId) {
      const user = await User.findById(userId);
      if (user) userEmail = user.email;
    }
    if (!userEmail) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    // Ask the partner bank to create a virtual account for this deposit
    const account = await partnerBank.createVirtualAccount({
      email:     userEmail,
      bvn,
      phone,
      firstName: firstname,
      lastName:  lastname,
      amount,
      narration: "Molada Wallet Deposit",
    });

    // Persist the virtual account details on the user's profile
    await User.findByIdAndUpdate(userId, {
      virtualAccount: {
        accountNumber: account.accountNumber,
        bankName:      account.bankName,
      },
    });

    res.json({
      success: true,
      message: "Virtual account generated successfully",
      account: {
        accountNumber: account.accountNumber,
        bankName:      account.bankName,
      },
    });
  } catch (err) {
    console.error("Virtual account error:", err);
    res.status(500).json({ success: false, message: "Failed to generate account" });
  }
});

// Receive payment events from the partner bank (deposit / withdrawal confirmations)
router.post("/webhook/bank", async (req, res) => {
  try {
    const event = req.body;

    // Verify the request came from the partner bank
    const signature = req.headers["x-bank-signature"] || req.headers["verif-hash"];
    const isValid   = partnerBank.verifyWebhookSignature(JSON.stringify(req.body), signature);
    if (!isValid) {
      return res.status(401).json({ success: false, message: "Invalid signature" });
    }

    const { status, tx_ref, customer, amount, currency } = event.data;

    const user = await User.findOne({ email: customer.email });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Map bank status strings to our internal status values
    let transactionStatus = "pending";
    if (status === "successful") transactionStatus = "success";
    else if (status === "failed")    transactionStatus = "failed";
    else if (status === "cancelled") transactionStatus = "cancelled";

    // Credit the wallet for successful deposits
    if (transactionStatus === "success" && event.data.type === "deposit") {
      user.walletBalance = (user.walletBalance || 0) + amount;
      await user.save();
    }

    await new Transaction({
      userId:    user._id,
      type:      event.data.type || "external",
      amount,
      currency,
      status:    transactionStatus,
      reference: tx_ref,
      source:    "external",
      date:      new Date(),
    }).save();

    res.json({ success: true });
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).json({ success: false });
  }
});

module.exports = router;
