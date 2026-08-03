/**
 * DEPOSIT WATCHERS — THIRD-PARTY HANDOFF PENDING
 * ===============================================
 * These watchers poll/listen to blockchain networks (ETH, BTC, TRX) directly
 * and credit user wallets when on-chain deposits are detected.
 *
 * This entire file will be REPLACED once a third-party crypto provider
 * (e.g. Fireblocks, BitGo, Coinbase Prime) is integrated. The provider will
 * send webhook events for deposits instead of us polling the chain ourselves.
 *
 * WHAT TO DO WHEN THE PROVIDER IS CONFIRMED:
 *  1. Remove startEthWatcher, startBtcWatcher, startTrxWatcher, watchEthereum
 *  2. Add a webhook endpoint that the provider calls for deposit events
 *  3. Call creditDeposit() from that webhook handler
 *  4. Remove tronweb, ethers, and axios blockchain calls from this file
 */

// services/depositWatchers.js
const { ethers } = require("ethers");
const { TronWeb } = require("tronweb");
const axios = require("axios");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const walletServices = require("./walletServices"); // Assuming walletServices contains getETHBalance and getUsdtErc20Balance

const ETH_RPC = process.env.ETH_RPC;
const USDT_CONTRACT = process.env.USDT_CONTRACT; // ERC20 USDT
const TRON_FULL_NODE = process.env.TRON_FULL_NODE || "https://api.trongrid.io";
const TRON_API_KEY = process.env.TRON_API_KEY || "";
const TRON_PRIVATE_KEY =
  process.env.TRON_PRIVATE_KEY ||
  "0x0000000000000000000000000000000000000000000000000000000000000000"; // fallback
const USDT_TRC20_CONTRACT = process.env.USDT_TRC20_CONTRACT;

const ethProvider = new ethers.JsonRpcProvider(ETH_RPC);

// ERC20 ABI
const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];
const usdtContract = new ethers.Contract(USDT_CONTRACT, ERC20_ABI, ethProvider);

// TronWeb
const tronWeb = new TronWeb({
  fullHost: TRON_FULL_NODE,
  headers: TRON_API_KEY ? { "TRON-PRO-API-KEY": TRON_API_KEY } : {},
  privateKey: TRON_PRIVATE_KEY,
});

async function creditDeposit({ user, address, currency, amount, txId, from, network }) {
  try {
    user.balances[currency] = (user.balances[currency] || 0) + amount;
    await user.save();

    await Transaction.create({
      user: user._id,
      txId,
      from,
      to: address,
      amount,
      currency,
      network,
      type: "deposit",
      status: "success",
    });

    console.log(`[CREDITED] ${amount} ${currency.toUpperCase()} → ${user.email}`);
  } catch (err) {
    console.error(`[ERROR] creditDeposit ${currency}:`, err.message);
  }
}

function startEthWatcher() {
  ethProvider.on("block", async (blockNumber) => {
    const block = await ethProvider.getBlock(blockNumber, true);
    if (!block?.transactions) return;

    for (const tx of block.transactions) {
      if (!tx.to) continue;

      const user = await User.findOne({ "crypto.ethereum": tx.to.toLowerCase() });
      if (user) {
        const amount = parseFloat(ethers.formatEther(tx.value));
        if (amount > 0) {
          await creditDeposit({
            user,
            address: tx.to.toLowerCase(),
            currency: "eth",
            amount,
            txId: tx.hash,
            from: tx.from,
            network: "ethereum",
          });

          // Send credit email for ETH deposit
          const { sendCryptoEmail } = require('../utils/cryptoEmailTemplates');
          await sendCryptoEmail({
            to: user.email,
            type: 'credit',
            fullName: user.fullName,
            amount: amount,
            currency: 'ETH',
            fromAddress: tx.from,
            toAddress: tx.to.toLowerCase(),
            txHash: tx.hash,
            chain: 'ETHEREUM',
            balance: user.balances.eth || 0
          });
        }
      }
    }
  });

  // USDT ERC20 Transfers
  usdtContract.on("Transfer", async (from, to, value, event) => {
    const user = await User.findOne({ "crypto.ethereum": to.toLowerCase() });
    if (user) {
      const decimals = await usdtContract.decimals();
      const amount = parseFloat(ethers.formatUnits(value, decimals));
      if (amount > 0) {
        await creditDeposit({
          user,
          address: to.toLowerCase(),
          currency: "usdt_eth",
          amount,
          txId: event.transactionHash,
          from,
          network: "ethereum",
        });

        // Send credit email for USDT ERC20 deposit
        const { sendCryptoEmail } = require('../utils/cryptoEmailTemplates');
        await sendCryptoEmail({
          to: user.email,
          type: 'credit',
          fullName: user.fullName,
          amount: amount,
          currency: 'USDT',
          fromAddress: from,
          toAddress: to.toLowerCase(),
          txHash: event.transactionHash,
          chain: 'ETHEREUM',
          balance: user.balances.usdt_eth || 0
        });
      }
    }
  });
}

function getMempoolApi(address) {
  return address.startsWith("tb1")
    ? "https://mempool.space/testnet/api"
    : "https://mempool.space/api";
}

async function startBtcWatcher() {
  async function watchBTCDeposits() {
    try {
      const users = await User.find({ "crypto.bitcoin": { $ne: null } });

      for (const user of users) {
        const address = user.crypto.bitcoin;
        if (!address) continue;

        const url = `${getMempoolApi(address)}/address/${address}`;
        const { data } = await axios.get(url);

        const confirmed = data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum;
        const unconfirmed = data.mempool_stats.funded_txo_sum - data.mempool_stats.spent_txo_sum;
        const balance = (confirmed + unconfirmed) / 1e8;

        if (balance > (user.balances.btc || 0)) {
          const deposit = balance - (user.balances.btc || 0);

          user.balances.btc = balance;
          await user.save();

          await Transaction.create({
            user: user._id,
            txId: null,
            from: null,
            to: address,
            amount: deposit,
            currency: "btc",
            network: "bitcoin",
            type: "deposit",
            status: "success",
          });

          console.log(` BTC deposit detected for ${user.email}: +${deposit} BTC`);

          // Send credit email for BTC deposit
          const { sendCryptoEmail } = require('../utils/cryptoEmailTemplates');
          await sendCryptoEmail({
            to: user.email,
            type: 'credit',
            fullName: user.fullName,
            amount: deposit,
            currency: 'BTC',
            fromAddress: 'External Wallet',
            toAddress: address,
            txHash: null,
            chain: 'BITCOIN',
            balance: user.balances.btc || 0
          });
        }
      }
    } catch (err) {
      console.error("BTC watcher error:", err.message);
    }
  }

  setInterval(watchBTCDeposits, 120000);
}

function startTrxWatcher() {
  setInterval(async () => {
    try {
      const users = await User.find({ "crypto.tron": { $exists: true, $ne: null } });

      for (const user of users) {
        const address = user.crypto.tron;
        if (!tronWeb.isAddress(address)) continue;

        // TRX native balance
        const balance = await tronWeb.trx.getBalance(address);
        const trxBalance = balance / 1e6;

        if (trxBalance > (user.balances.trx || 0)) {
          const deposit = trxBalance - (user.balances.trx || 0);
          user.balances.trx = trxBalance;
          await user.save();

          await Transaction.create({
            user: user._id,
            txId: null,
            from: null,
            to: address,
            amount: deposit,
            currency: "trx",
            network: "tron",
            type: "deposit",
            status: "success",
          });

          console.log(`[CREDITED] ${deposit} TRX → ${user.email}`);

          // Send credit email for TRX deposit
          const { sendCryptoEmail } = require('../utils/cryptoEmailTemplates');
          await sendCryptoEmail({
            to: user.email,
            type: 'credit',
            fullName: user.fullName,
            amount: deposit,
            currency: 'TRX',
            fromAddress: 'External Wallet',
            toAddress: address,
            txHash: null,
            chain: 'TRON',
            balance: user.balances.trx || 0
          });
        }

        //  USDT TRC20 balance
        if (USDT_TRC20_CONTRACT) {
          const contract = await tronWeb.contract().at(USDT_TRC20_CONTRACT);
          const bal = await contract.balanceOf(address).call({
            from: tronWeb.defaultAddress.base58, //  ensures owner_address is set
          });
          const usdtBalance = parseFloat(bal.toString()) / 1e6;

          if (usdtBalance > (user.balances.usdt_trc20 || 0)) {
            const deposit = usdtBalance - (user.balances.usdt_trc20 || 0);
            user.balances.usdt_trc20 = usdtBalance;
            await user.save();

            await Transaction.create({
              user: user._id,
              txId: null,
              from: null,
              to: address,
              amount: deposit,
              currency: "usdt_trc20",
              network: "tron",
              type: "deposit",
              status: "success",
            });

            console.log(`[CREDITED] ${deposit} USDT(TRC20) → ${user.email}`);

            // Send credit email for USDT TRC20 deposit
            const { sendCryptoEmail } = require('../utils/cryptoEmailTemplates');
            await sendCryptoEmail({
              to: user.email,
              type: 'credit',
              fullName: user.fullName,
              amount: deposit,
              currency: 'USDT',
              fromAddress: 'External Wallet',
              toAddress: address,
              txHash: null,
              chain: 'TRON',
              balance: user.balances.usdt_trc20 || 0
            });
          }
        } else {
          console.warn(" USDT_TRC20_CONTRACT is not set in .env");
        }
      }
    } catch (err) {
      console.error("TRX watcher error:", err);
    }
  }, 20000);
}

function watchEthereum() {
  setInterval(async () => {
    try {
      const users = await User.find({ "crypto.ethereum": { $exists: true, $ne: null } });

      for (const user of users) {
        const address = user.crypto.ethereum;
        if (!address) continue;

        try {
          // ETH balance with retry
          const ethBalance = await walletServices.getETHBalance(address);
          if (ethBalance > (user.balances.eth || 0)) {
            const deposit = ethBalance - (user.balances.eth || 0);
            user.balances.eth = ethBalance;
            await user.save();
            console.log(`[CREDITED] ${deposit} ETH → ${user.email}`);

            // Send credit email for ETH deposit
            const { sendCryptoEmail } = require('../utils/cryptoEmailTemplates');
            await sendCryptoEmail({
              to: user.email,
              type: 'credit',
              fullName: user.fullName,
              amount: deposit,
              currency: 'ETH',
              fromAddress: 'External Wallet',
              toAddress: address,
              txHash: null,
              chain: 'ETHEREUM',
              balance: user.balances.eth || 0
            });
          }

          // USDT (ERC20) balance
          const usdtBalance = await walletServices.getUsdtErc20Balance(address);
          if (usdtBalance > (user.balances.usdt_eth || 0)) {
            const deposit = usdtBalance - (user.balances.usdt_eth || 0);
            user.balances.usdt_eth = usdtBalance;
            await user.save();
            console.log(`[CREDITED] ${deposit} USDT(ERC20) → ${user.email}`);

            // Send credit email for USDT ERC20 deposit
            const { sendCryptoEmail } = require('../utils/cryptoEmailTemplates');
            await sendCryptoEmail({
              to: user.email,
              type: 'credit',
              fullName: user.fullName,
              amount: deposit,
              currency: 'USDT',
              fromAddress: 'External Wallet',
              toAddress: address,
              txHash: null,
              chain: 'ETHEREUM',
              balance: user.balances.usdt_eth || 0
            });
          }
        } catch (userErr) {
          console.warn(` Error checking balance for ${user.email}:`, userErr.message);
        }
      }
    } catch (err) {
      if (err.message?.includes('not valid JSON')) {
        console.error(" RPC provider returned invalid response. Check your ETH_RPC_URL in .env");
      } else {
        console.error("ETH watcher error:", err.message);
      }
    }
  }, 15000);
}

function startDepositWatchers() {
  console.log(" Deposit watchers started...");
  startEthWatcher();
  startBtcWatcher();
  startTrxWatcher();
  watchEthereum(); // Start the new Ethereum watcher
}

module.exports = { startDepositWatchers };