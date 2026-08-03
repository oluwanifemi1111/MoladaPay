/**
 * CRYPTO CONFIGURATION — THIRD-PARTY HANDOFF PENDING
 * ====================================================
 * This file sets up in-house crypto wallets (Bitcoin, Ethereum, Tron/USDT).
 * The plan is to REPLACE this entire module with a third-party crypto
 * provider SDK (e.g. Fireblocks, BitGo, Coinbase Prime, etc.).
 *
 * WHEN THE THIRD-PARTY PROVIDER IS CONFIRMED:
 *  1. Install their SDK
 *  2. Replace the exports below with the provider's client/functions
 *  3. Update config/erc20Abi.json if the provider handles ABI internally
 *  4. Update services/walletServices.js and services/depositWatchers.js accordingly
 *  5. Remove the crypto npm packages (bitcoinjs-lib, bip39, bip32, tronweb, ethers)
 *     if the provider SDK wraps them
 *
 * ENV VARIABLES CURRENTLY USED (will change when provider is set):
 *  BTC_MASTER_MNEMONIC, BTC_NETWORK, BLOCKSTREAM_API
 *  ETH_MASTER_MNEMONIC, ETH_NETWORK, ETH_RPC
 *  TRON_MNEMONIC, TRON_PRIVATE_KEY, TRON_FULL_NODE, TRON_API_KEY
 *  USDT_CONTRACT, USDT_TRC20_CONTRACT
 */

require("dotenv").config();
const axios = require("axios");
const bitcoin = require("bitcoinjs-lib");
const bip39 = require("bip39");
const ecc = require("tiny-secp256k1");
const { BIP32Factory } = require("bip32");
const { ethers } = require("ethers");
const { TronWeb } = require("tronweb"); // correct import

const BTC_NET =
  process.env.BTC_NETWORK === "testnet"
    ? bitcoin.networks.testnet
    : bitcoin.networks.bitcoin;
const BTC_MASTER_MNEMONIC = (process.env.BTC_MASTER_MNEMONIC || "").trim();
if (!bip39.validateMnemonic(BTC_MASTER_MNEMONIC)) {
  throw new Error("BTC_MASTER_MNEMONIC invalid: supply a valid BIP39 phrase");
}
const btcSeed = bip39.mnemonicToSeedSync(BTC_MASTER_MNEMONIC);
const bip32Factory = BIP32Factory(ecc);
const btcRoot = bip32Factory.fromSeed(btcSeed, BTC_NET);
const BLOCKSTREAM_API =
  process.env.BLOCKSTREAM_API ||
  (BTC_NET === bitcoin.networks.testnet
    ? "https://mempool.space/testnet/api"
    : "https://mempool.space/api");

const ETH_NETWORK = process.env.ETH_NETWORK || "mainnet";
const ETH_RPC =
  process.env.ETH_RPC ||
  (ETH_NETWORK === "mainnet"
    ? "https://mainnet.infura.io/v3/YOUR_PROJECT_ID"
    : "https://sepolia.infura.io/v3/YOUR_PROJECT_ID");
const ethProvider = new ethers.JsonRpcProvider(ETH_RPC);
const ETH_MASTER_MNEMONIC = (process.env.ETH_MASTER_MNEMONIC || "").trim();
if (!bip39.validateMnemonic(ETH_MASTER_MNEMONIC)) {
  throw new Error("ETH_MASTER_MNEMONIC invalid: supply a valid BIP39 phrase");
}
const evmRoot = ethers.HDNodeWallet.fromPhrase(ETH_MASTER_MNEMONIC);
const evmHot = evmRoot.connect(ethProvider); // hot wallet for sends

const TRON_FULL_NODE = process.env.TRON_FULL_NODE || "https://api.trongrid.io";
const TRON_API_KEY = process.env.TRON_API_KEY || "";
const TRON_MNEMONIC = process.env.TRON_MNEMONIC;

let tronRoot = null;

if (TRON_MNEMONIC) {
  if (!bip39.validateMnemonic(TRON_MNEMONIC)) {
    console.warn(" Invalid TRON mnemonic provided, tronRoot disabled.");
  } else {
    // use ethers HDNode for derivation
    tronRoot = ethers.HDNodeWallet.fromPhrase(TRON_MNEMONIC);
  }
} else {
  console.warn(" No TRON mnemonic provided. tronRoot disabled.");
}

const tronWeb = new TronWeb({
  fullHost: "https://api.trongrid.io",
  privateKey: process.env.TRON_PRIVATE_KEY || "" // optional
});

const CONTRACTS = {
  USDT: process.env.USDT_CONTRACT || "0xdAC17F958D2ee523a2206206994597C13D831ec7", // ERC20 USDT
  USDT_TRC20: process.env.USDT_TRC20_CONTRACT || "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj", // TRON USDT
};

module.exports = {
  ethProvider,
  evmRoot,
  evmHot,
  btcRoot,
  BTC_NET,
  BLOCKSTREAM_API,
  tronRoot,
  tronWeb,
  CONTRACTS,
};