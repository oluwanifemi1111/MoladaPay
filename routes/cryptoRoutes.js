/**
 * CRYPTO ROUTES — THIRD-PARTY HANDOFF PENDING
 * =============================================
 * Handles wallet generation, balance checks, QR code generation, and
 * crypto sends for Bitcoin, Ethereum, and Tron (including USDT).
 *
 * These routes currently use in-house key management (see config/crypto.js).
 * Once a third-party crypto provider is integrated, the wallet and signing
 * logic inside services/walletServices.js will be swapped out, but these
 * route definitions and their API contracts should remain the same.
 *
 * Routes:
 *  GET  /api/crypto/prices              - Live prices for BTC, ETH, TRX, USDT
 *  GET  /api/crypto/generate-qr/:userId/:chain - QR code for receiving crypto
 *  POST /api/crypto/send-qr             - Send crypto by scanning a QR code
 *  POST /api/crypto/sync-balance        - Sync on-chain balances into the database
 *  POST /api/crypto/generate            - Generate a new wallet address for a chain
 *  GET  /api/crypto/wallets             - Get the user's wallet addresses
 *  GET  /api/crypto/balance/:userId     - Full portfolio balance with USD values
 *  POST /api/crypto/send                - Send crypto to an external address
 */

// routes/cryptoRoutes.js
const express = require("express");
const router = express.Router();
const QRCode = require("qrcode");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const { checkAgeRestriction } = require("../middleware/ageRestrictions");
const { generateAddress } = require("../services/walletServices");
const walletServices = require("../services/walletServices");

router.get("/prices", async (req, res) => {
  try {
    const priceService = require('../services/priceService');
    const prices = {
      BTC: await priceService.getPriceWithChange('BTC'),
      ETH: await priceService.getPriceWithChange('ETH'),
      TRX: await priceService.getPriceWithChange('TRX'),
      USDT: await priceService.getPriceWithChange('USDT')
    };
    
    res.json({
      success: true,
      prices,
      cache: priceService.priceCache,
      lastUpdate: new Date(priceService.priceCache.BTC.lastUpdate).toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Generate QR code for receiving crypto
 * GET /api/crypto/generate-qr/:userId/:chain
 * Query params: amount (optional), currency (optional for USDT chains)
 */
router.get("/generate-qr/:userId/:chain", authMiddleware, async (req, res) => {
  try {
    const { userId, chain } = req.params;
    const { amount, currency } = req.query;

    // Security: Ensure user can only generate their own QR
    if (req.user.id !== userId) {
      return res.status(403).json({ 
        success: false, 
        message: "Access denied. You can only generate QR codes for your own wallet." 
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Get the wallet address for the specified chain
    let address;
    let chainName;
    let symbol;

    switch (chain.toLowerCase()) {
      case 'bitcoin':
      case 'btc':
        address = user.crypto?.bitcoin;
        chainName = 'Bitcoin';
        symbol = 'BTC';
        break;
      case 'ethereum':
      case 'eth':
        address = user.crypto?.ethereum;
        chainName = 'Ethereum';
        symbol = currency?.toUpperCase() === 'USDT' ? 'USDT (ERC20)' : 'ETH';
        break;
      case 'tron':
      case 'trx':
        address = user.crypto?.tron;
        chainName = 'Tron';
        symbol = currency?.toUpperCase() === 'USDT' ? 'USDT (TRC20)' : 'TRX';
        break;
      default:
        return res.status(400).json({ 
          success: false, 
          message: "Invalid chain. Use: bitcoin, ethereum, or tron" 
        });
    }

    if (!address) {
      return res.status(404).json({ 
        success: false, 
        message: `No ${chainName} wallet found. Please generate one first.` 
      });
    }

    // Create QR data object
    const qrData = {
      type: 'crypto',
      chain: chain.toLowerCase(),
      address,
      name: user.fullName,
      ...(amount && { amount: Number(amount) }),
      ...(currency && { currency: currency.toUpperCase() })
    };

    // Generate QR code as data URL
    const qrCodeUrl = await QRCode.toDataURL(JSON.stringify(qrData));

    res.json({ 
      success: true, 
      qrCodeUrl,
      address,
      chain: chainName,
      symbol,
      recipient: user.fullName,
      ...(amount && { amount: Number(amount) }),
      ...(currency && { currency: currency.toUpperCase() })
    });
  } catch (err) {
    console.error("Crypto QR Generate Error:", err);
    res.status(500).json({ success: false, message: "Server error generating QR code" });
  }
});

/**
 * Send crypto by scanning QR code
 * POST /api/crypto/send-qr
 * Body: { qrData: "scanned QR string", amount?: number, symbol?: string }
 */
router.post("/send-qr", authMiddleware, checkAgeRestriction('crypto'), async (req, res) => {
  try {
    const { qrData, amount: overrideAmount, symbol: overrideSymbol } = req.body;

    if (!qrData) {
      return res.status(400).json({ error: "QR data is required" });
    }

    // Parse QR data
    let parsedData;
    try {
      parsedData = JSON.parse(qrData);
    } catch (e) {
      return res.status(400).json({ error: "Invalid QR code format" });
    }

    // Validate it's a crypto QR code
    if (parsedData.type !== 'crypto' || !parsedData.address || !parsedData.chain) {
      return res.status(400).json({ 
        error: "Invalid crypto QR code. Must contain type, address, and chain." 
      });
    }

    const { chain, address, amount: qrAmount, currency: qrCurrency } = parsedData;

    // Determine final amount and symbol
    const finalAmount = overrideAmount || qrAmount;
    const finalSymbol = overrideSymbol || qrCurrency;

    if (!finalAmount) {
      return res.status(400).json({ 
        error: "Amount is required (either in QR code or as override)" 
      });
    }

    if (!finalSymbol) {
      // Default symbol based on chain
      const defaultSymbols = {
        bitcoin: 'BTC',
        btc: 'BTC',
        ethereum: 'ETH',
        eth: 'ETH',
        tron: 'TRX',
        trx: 'TRX'
      };
      finalSymbol = defaultSymbols[chain.toLowerCase()] || 'BTC';
    }

    // Get sender user
    const sender = await User.findById(req.user.id);
    if (!sender) {
      return res.status(404).json({ error: "Sender not found" });
    }

    // Determine which private key to use
    let fromPrivKey;
    let fromAddress;
    const normalizedChain = chain.toLowerCase();

    if (normalizedChain === 'ethereum' || normalizedChain === 'eth') {
      fromPrivKey = sender.crypto?.ethereumPrivateKey || sender.crypto?.ethPrivateKey;
      fromAddress = sender.crypto?.ethereum;
    } else if (normalizedChain === 'tron' || normalizedChain === 'trx') {
      fromPrivKey = sender.crypto?.tronPrivateKey || sender.crypto?.trxPrivateKey;
      fromAddress = sender.crypto?.tron;
    } else if (normalizedChain === 'bitcoin' || normalizedChain === 'btc') {
      fromPrivKey = sender.crypto?.bitcoinPrivateKey || sender.crypto?.btcPrivateKey;
      fromAddress = sender.crypto?.bitcoin;
    }

    if (!fromPrivKey) {
      return res.status(400).json({ 
        error: `You don't have a ${chain} wallet. Please generate one first.` 
      });
    }

    // Check balance
    const balanceFieldMap = {
      ethereum: 'eth',
      eth: 'eth',
      tron: 'trx',
      trx: 'trx',
      bitcoin: 'btc',
      btc: 'btc'
    };
    const balField = balanceFieldMap[normalizedChain];
    const currentBalance = balField ? (sender.balances?.[balField] || 0) : null;

    if (currentBalance != null && Number(currentBalance) < Number(finalAmount)) {
      return res.status(400).json({ 
        error: `Insufficient ${finalSymbol} balance. You have: ${currentBalance}, required: ${finalAmount}` 
      });
    }

    // Send the transaction
    const result = await walletServices.sendCrypto({
      chain: normalizedChain,
      symbol: finalSymbol,
      to: address,
      amount: finalAmount,
      fromPrivKey,
      sendMax: false
    });

    const txid = result?.txid || result?.hash || result?.txHash || 
                 (result?.raw && result.raw.transactionHash) || null;

    console.log(`[QR SEND] user=${sender.email} chain=${chain} symbol=${finalSymbol} amount=${finalAmount} to=${address} txid=${txid}`);

    // Update sender balance
    if (balField) {
      if (!sender.balances) sender.balances = {};
      const newBalance = parseFloat(((sender.balances[balField] || 0) - Number(finalAmount)).toFixed(8));
      sender.balances[balField] = Math.max(0, newBalance);
      await sender.save();
    }

    // Create transaction record
    const Transaction = require("../models/Transaction");
    const feeService = require('../services/feeService');
    const adminFee = feeService.calculateFee('crypto_send', Number(finalAmount));
    
    const withdrawTx = new Transaction({
      userId: sender._id,
      amount: Number(finalAmount),
      currency: finalSymbol.toLowerCase(),
      type: "withdraw",
      method: "qrcode",
      status: "pending",
      onchainTxHash: txid,
      adminFee
    });
    await withdrawTx.save();
    
    if (txid) {
      await feeService.collectFee(withdrawTx._id);
    }

    // Send email notification
    const { sendCryptoEmail } = require('../utils/cryptoEmailTemplates');
    await sendCryptoEmail({
      to: sender.email,
      type: 'debit',
      fullName: sender.fullName,
      amount: Number(finalAmount),
      currency: finalSymbol.toUpperCase(),
      fromAddress,
      toAddress: address,
      txHash: txid,
      chain: chain.toUpperCase(),
      balance: sender.balances[balField] || 0
    });

    // Check if recipient is internal user and credit them
    const normalizeChain = (chain) => {
      const chainMap = {
        'eth': 'ethereum',
        'ethereum': 'ethereum',
        'trx': 'tron', 
        'tron': 'tron',
        'btc': 'bitcoin',
        'bitcoin': 'bitcoin'
      };
      return chainMap[chain.toLowerCase()] || null;
    };

    const canonicalChain = normalizeChain(normalizedChain);
    let recipient = null;
    
    if (canonicalChain) {
      const recipientQueryFields = {
        ethereum: { "crypto.ethereum": address },
        tron: { "crypto.tron": address },
        bitcoin: { "crypto.bitcoin": address },
      };
      recipient = await User.findOne(recipientQueryFields[canonicalChain]);
    }

    if (recipient) {
      const recipientBalanceKey = balanceFieldMap[normalizedChain];
      if (!recipient.balances) recipient.balances = {};
      if (recipientBalanceKey) {
        recipient.balances[recipientBalanceKey] = parseFloat(
          ((recipient.balances[recipientBalanceKey] || 0) + Number(finalAmount)).toFixed(8)
        );
      }
      await recipient.save();

      await Transaction.create({
        userId: recipient._id,
        amount: Number(finalAmount),
        currency: finalSymbol.toLowerCase(),
        type: "deposit",
        method: "qrcode",
        status: "success"
      });

      console.log(`[QR CREDITED] internal recipient ${recipient.email} +${finalAmount} ${finalSymbol}`);

      // Send credit email to recipient
      await sendCryptoEmail({
        to: recipient.email,
        type: 'credit',
        fullName: recipient.fullName,
        amount: Number(finalAmount),
        currency: finalSymbol.toUpperCase(),
        fromAddress,
        toAddress: address,
        txHash: txid,
        chain: chain.toUpperCase(),
        balance: recipient.balances[recipientBalanceKey] || 0
      });

      // Recipient notification
      const { createNotification } = require('../utils/notificationHelper');
      await createNotification({
        userId: recipient._id,
        type: 'crypto',
        title: `Received ${finalAmount} ${finalSymbol}`,
        message: `You received ${finalAmount} ${finalSymbol} via QR code on ${chain.toUpperCase()} network`,
        data: {
          amount: Number(finalAmount),
          currency: finalSymbol.toUpperCase(),
          chain: chain.toUpperCase(),
          fromAddress,
          toAddress: address,
          txHash: txid,
          method: 'qrcode',
          type: 'receive'
        }
      });
    }

    // Sender notification
    const { createNotification } = require('../utils/notificationHelper');
    await createNotification({
      userId: sender._id,
      type: 'crypto',
      title: `Sent ${finalAmount} ${finalSymbol}`,
      message: `You sent ${finalAmount} ${finalSymbol} via QR code on ${chain.toUpperCase()} network`,
      data: {
        amount: Number(finalAmount),
        currency: finalSymbol.toUpperCase(),
        chain: chain.toUpperCase(),
        fromAddress,
        toAddress: address,
        txHash: txid,
        fee: adminFee,
        method: 'qrcode',
        type: 'send'
      }
    });

    return res.json({ 
      success: true, 
      message: "Crypto sent successfully via QR code",
      chain: normalizedChain,
      txid,
      amount: finalAmount,
      symbol: finalSymbol,
      recipient: parsedData.name || address,
      raw: result.raw || null 
    });

  } catch (err) {
    console.error("QR Send Error:", err);
    return res.status(500).json({ error: err.message || String(err) });
  }
});

router.post("/sync-balance", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const synced = {};

    // Sync Bitcoin
    if (user.crypto.bitcoin) {
      const onchainBtc = await walletServices.getBTCBalance(user.crypto.bitcoin);
      const dbBtc = user.balances.btc || 0;
      user.balances.btc = parseFloat(onchainBtc.toFixed(8));
      synced.btc = { onchain: onchainBtc, db: dbBtc, updated: user.balances.btc };
    }

    // Sync Ethereum
    if (user.crypto.ethereum) {
      const onchainEth = await walletServices.getETHBalance(user.crypto.ethereum);
      const dbEth = user.balances.eth || 0;
      user.balances.eth = parseFloat(onchainEth.toFixed(8));
      synced.eth = { onchain: onchainEth, db: dbEth, updated: user.balances.eth };

      // Sync USDT ERC20
      const onchainUsdtEth = await walletServices.getUsdtErc20Balance(user.crypto.ethereum);
      const dbUsdtEth = user.balances.usdt_eth || 0;
      user.balances.usdt_eth = parseFloat(onchainUsdtEth.toFixed(8));
      synced.usdt_eth = { onchain: onchainUsdtEth, db: dbUsdtEth, updated: user.balances.usdt_eth };
    }

    // Sync Tron
    if (user.crypto.tron) {
      const onchainTrx = await walletServices.getTRXBalance(user.crypto.tron);
      const dbTrx = user.balances.trx || 0;
      user.balances.trx = parseFloat(onchainTrx.toFixed(8));
      synced.trx = { onchain: onchainTrx, db: dbTrx, updated: user.balances.trx };

      // Sync USDT TRC20
      const onchainUsdtTrc20 = await walletServices.getUsdtTrc20Balance(user.crypto.tron);
      const dbUsdtTrc20 = user.balances.usdt_trc20 || 0;
      user.balances.usdt_trc20 = parseFloat(onchainUsdtTrc20.toFixed(8));
      synced.usdt_trc20 = { onchain: onchainUsdtTrc20, db: dbUsdtTrc20, updated: user.balances.usdt_trc20 };
    }

    await user.save();

    res.json({
      success: true,
      message: "Balances synced with blockchain",
      synced
    });
  } catch (err) {
    console.error("Balance sync error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/generate", authMiddleware, async (req, res) => {
  try {
    const { chain } = req.body;
    const userId = req.user.id;

    if (!chain) {
      return res.status(400).json({ error: "Chain is required (bitcoin | ethereum | tron)" });
    }

    const wallet = await generateAddress(userId, chain);
    return res.json({
      success: true,
      message: `${chain} address ready`,
      wallet,
    });
  } catch (err) {
    console.error("Error generating address:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/wallets", authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.crypto) {
      return res.status(404).json({ error: "No wallets found" });
    }

    return res.json({
      success: true,
      wallets: {
        bitcoin: user.crypto.bitcoin,
        ethereum: user.crypto.ethereum,
        tron: user.crypto.tron,
      },
    });
  } catch (err) {
    console.error("Error fetching wallets:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/balance/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const balances = {};
    const priceService = require('../services/priceService');

    // Bitcoin
    if (user.crypto.bitcoin) {
      try {
        const btcBalance = await walletServices.getBTCBalance(user.crypto.bitcoin);
        const btcPriceData = await priceService.getPriceWithChange('BTC');
        balances.bitcoin = { 
          symbol: 'BTC',
          name: 'Bitcoin',
          address: user.crypto.bitcoin, 
          balance: btcBalance,
          usdValue: btcBalance * btcPriceData.price,
          price: btcPriceData.price,
          change24h: btcPriceData.change24h,
          changeDirection: btcPriceData.change24h >= 0 ? 'up' : 'down'
        };
      } catch (err) {
        balances.bitcoin = { address: user.crypto.bitcoin, error: err.message };
      }
    }

    // Ethereum
    if (user.crypto.ethereum) {
      try {
        const ethBalance = await walletServices.getETHBalance(user.crypto.ethereum);
        const ethPriceData = await priceService.getPriceWithChange('ETH');
        balances.ethereum = { 
          symbol: 'ETH',
          name: 'Ethereum',
          address: user.crypto.ethereum, 
          balance: ethBalance,
          usdValue: ethBalance * ethPriceData.price,
          price: ethPriceData.price,
          change24h: ethPriceData.change24h,
          changeDirection: ethPriceData.change24h >= 0 ? 'up' : 'down'
        };

        // USDT (ERC20)
        const usdtEthBalance = await walletServices.getUsdtErc20Balance(user.crypto.ethereum);
        const usdtPriceData = await priceService.getPriceWithChange('USDT');
        balances.usdt_eth = { 
          symbol: 'USDT',
          name: 'Tether (ERC20)',
          address: user.crypto.ethereum, 
          balance: usdtEthBalance,
          usdValue: usdtEthBalance,
          price: usdtPriceData.price,
          change24h: usdtPriceData.change24h,
          changeDirection: usdtPriceData.change24h >= 0 ? 'up' : 'down'
        };
      } catch (err) {
        balances.ethereum = { address: user.crypto.ethereum, error: err.message };
        balances.usdt_eth = { address: user.crypto.ethereum, error: err.message };
      }
    }

    // Tron
    if (user.crypto.tron) {
      try {
        const trxBalance = await walletServices.getTRXBalance(user.crypto.tron);
        const trxPriceData = await priceService.getPriceWithChange('TRX');
        balances.tron = { 
          symbol: 'TRX',
          name: 'Tron',
          address: user.crypto.tron, 
          balance: trxBalance,
          usdValue: trxBalance * trxPriceData.price,
          price: trxPriceData.price,
          change24h: trxPriceData.change24h,
          changeDirection: trxPriceData.change24h >= 0 ? 'up' : 'down'
        };
      } catch (err) {
        balances.tron = { address: user.crypto.tron, error: err.message };
      }

      // USDT TRC20
      try {
        const usdtTrc20Balance = await walletServices.getUsdtTrc20Balance(user.crypto.tron);
        const usdtPriceData = await priceService.getPriceWithChange('USDT');
        balances.usdt_trc20 = { 
          symbol: 'USDT',
          name: 'Tether (TRC20)',
          address: user.crypto.tron, 
          balance: usdtTrc20Balance,
          usdValue: usdtTrc20Balance,
          price: usdtPriceData.price,
          change24h: usdtPriceData.change24h,
          changeDirection: usdtPriceData.change24h >= 0 ? 'up' : 'down'
        };
      } catch (err) {
        balances.usdt_trc20 = { address: user.crypto.tron, error: err.message };
      }
    }

    // Calculate total portfolio value
    const totalUsdValue = Object.values(balances).reduce((sum, asset) => {
      return sum + (asset.usdValue || 0);
    }, 0);

    return res.json({ 
      success: true, 
      balances,
      totalUsdValue,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("Balance error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/send", authMiddleware, checkAgeRestriction('crypto'), async (req, res) => {
  try {
    const { symbol, to, amount, chain: providedChain, sendMax } = req.body;
    if (!symbol || !to) {
      return res.status(400).json({ error: "symbol and to are required" });
    }
    if (!sendMax && !amount) {
      return res.status(400).json({ error: "amount is required (or set sendMax=true)" });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const chain = providedChain || walletServices.detectChain(to);

    let fromPrivKey;
    let fromAddress;
    if (chain === "ethereum" || chain === "eth") {
      fromPrivKey = user.crypto?.ethereumPrivateKey || user.crypto?.ethPrivateKey;
      fromAddress = user.crypto?.ethereum;
    }
    if (chain === "tron") {
      fromPrivKey = user.crypto?.tronPrivateKey || user.crypto?.trxPrivateKey;
      fromAddress = user.crypto?.tron;
    }
    if (chain === "bitcoin" || chain === "btc") {
      fromPrivKey = user.crypto?.bitcoinPrivateKey || user.crypto?.btcPrivateKey;
      fromAddress = user.crypto?.bitcoin;
    }

    if (!fromPrivKey) return res.status(400).json({ error: `User missing ${chain} private key` });

    const balanceFieldMap = {
      ethereum: "eth",
      eth: "eth",
      tron: "trx",
      bitcoin: "btc",
      btc: "btc",
    };
    const balField = balanceFieldMap[chain] || null;
    const currentBalance = balField ? (user.balances?.[balField] || 0) : null;
    if (currentBalance != null && Number(currentBalance) < Number(amount)) {
      return res.status(400).json({ error: `Insufficient ${balField} balance. Local: ${currentBalance}, required: ${amount}` });
    }

    const result = await walletServices.sendCrypto({
      chain,
      symbol,
      to,
      amount,
      fromPrivKey,
      sendMax: sendMax || false,
    });

    const txid = result?.txid || result?.hash || result?.txHash || (result?.raw && result.raw.transactionHash) || null;
    console.log(`[SENT] user=${user.email} chain=${chain} symbol=${symbol} amount=${amount} to=${to} txid=${txid}`);

    if (balField) {
      if (!user.balances) user.balances = {};
      const newBalance = parseFloat(((user.balances[balField] || 0) - Number(amount)).toFixed(8));
      user.balances[balField] = Math.max(0, newBalance);
      await user.save();
    }

    const Transaction = require("../models/Transaction");
    const feeService = require('../services/feeService');
    const adminFee = feeService.calculateFee('crypto_send', Number(amount));
    
    const withdrawTx = new Transaction({
      userId: user._id,
      amount: Number(amount),
      currency: symbol.toLowerCase(),
      type: "withdraw",
      method: "blockchain",
      status: "pending",
      onchainTxHash: txid,
      adminFee: adminFee
    });
    await withdrawTx.save();
    
    if (txid) {
      await feeService.collectFee(withdrawTx._id);
    }

    const { sendCryptoEmail } = require('../utils/cryptoEmailTemplates');
    await sendCryptoEmail({
      to: user.email,
      type: 'debit',
      fullName: user.fullName,
      amount: Number(amount),
      currency: symbol.toUpperCase(),
      fromAddress: fromAddress,
      toAddress: to,
      txHash: txid,
      chain: chain.toUpperCase(),
      balance: user.balances[balField] || 0
    });

    const normalizeChain = (chain) => {
      const chainMap = {
        'eth': 'ethereum',
        'ethereum': 'ethereum',
        'trx': 'tron', 
        'tron': 'tron',
        'btc': 'bitcoin',
        'bitcoin': 'bitcoin'
      };
      return chainMap[chain.toLowerCase()] || null;
    };

    const normalizedChain = normalizeChain(chain);
    let recipient = null;
    
    if (normalizedChain) {
      const recipientQueryFields = {
        ethereum: { "crypto.ethereum": to },
        tron: { "crypto.tron": to },
        bitcoin: { "crypto.bitcoin": to },
      };
      recipient = await User.findOne(recipientQueryFields[normalizedChain]);
    }
    if (recipient) {
      const recipientBalanceKey = balanceFieldMap[chain] || null;
      if (!recipient.balances) recipient.balances = {};
      if (recipientBalanceKey) {
        recipient.balances[recipientBalanceKey] = parseFloat(((recipient.balances[recipientBalanceKey] || 0) + Number(amount)).toFixed(8));
      }
      await recipient.save();

      await Transaction.create({
        userId: recipient._id,
        amount: Number(amount),
        currency: symbol.toLowerCase(),
        type: "deposit",
        method: "blockchain",
        status: "success"
      });
      console.log(`[CREDITED] internal recipient ${recipient.email} +${amount} ${symbol}`);

      await sendCryptoEmail({
        to: recipient.email,
        type: 'credit',
        fullName: recipient.fullName,
        amount: Number(amount),
        currency: symbol.toUpperCase(),
        fromAddress: fromAddress,
        toAddress: to,
        txHash: txid,
        chain: chain.toUpperCase(),
        balance: recipient.balances[recipientBalanceKey] || 0
      });

      const { createNotification } = require('../utils/notificationHelper');
      await createNotification({
        userId: recipient._id,
        type: 'crypto',
        title: `Received ${amount} ${symbol.toUpperCase()}`,
        message: `You received ${amount} ${symbol.toUpperCase()} on ${chain.toUpperCase()} network`,
        data: {
          amount: Number(amount),
          currency: symbol.toUpperCase(),
          chain: chain.toUpperCase(),
          fromAddress,
          toAddress: to,
          txHash: txid,
          type: 'receive'
        }
      });
    }

    const { createNotification } = require('../utils/notificationHelper');
    await createNotification({
      userId: user._id,
      type: 'crypto',
      title: `Sent ${amount} ${symbol.toUpperCase()}`,
      message: `You sent ${amount} ${symbol.toUpperCase()} on ${chain.toUpperCase()} network`,
      data: {
        amount: Number(amount),
        currency: symbol.toUpperCase(),
        chain: chain.toUpperCase(),
        fromAddress,
        toAddress: to,
        txHash: txid,
        fee: adminFee,
        type: 'send'
      }
    });

    return res.json({ success: true, chain, txid, raw: result.raw || null });
  } catch (err) {
    console.error("Send error:", err);
    return res.status(500).json({ error: err.message || String(err) });
  }
});

router.post("/swap", authMiddleware, checkAgeRestriction('crypto'), async (req, res) => {
  try {
    const { chain, fromSymbol, toSymbol, amount, slippageBps } = req.body;
    if (!chain || !fromSymbol || !toSymbol || !amount) {
      return res.status(400).json({ error: "chain, fromSymbol, toSymbol, amount required" });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    let fromPrivKey;
    if (chain.toLowerCase() === "ethereum") fromPrivKey = user.crypto?.ethereumPrivateKey || user.crypto?.ethPrivateKey;
    if (chain.toLowerCase() === "tron") fromPrivKey = user.crypto?.tronPrivateKey || user.crypto?.trxPrivateKey;

    if (!fromPrivKey) {
      return res.status(400).json({ error: `User missing ${chain} private key` });
    }

    const result = await walletServices.swapCrypto({
      chain,
      fromSymbol,
      toSymbol,
      amount,
      slippageBps: slippageBps || 50,
      fromPrivKey,
    });

    const Transaction = require("../models/Transaction");
    await Transaction.create({
      userId: user._id,
      amount,
      currency: `${fromSymbol}->${toSymbol}`,
      type: "transfer",
      method: "blockchain",
      status: "success",
      onchainTxHash: result.hash || result.txid || null
    });

    const { createNotification } = require('../utils/notificationHelper');
    await createNotification({
      userId: user._id,
      type: 'crypto',
      title: `Swapped ${fromSymbol} to ${toSymbol}`,
      message: `You swapped ${amount} ${fromSymbol} to ${toSymbol} on ${chain} network`,
      data: {
        amount,
        fromSymbol,
        toSymbol,
        chain,
        txHash: result.hash || result.txid || null,
        type: 'swap'
      }
    });

    return res.json({ success: true, swap: result });
  } catch (err) {
    console.error("Swap error:", err);
    return res.status(500).json({ error: err.message || String(err) });
  }
});

module.exports = router;
