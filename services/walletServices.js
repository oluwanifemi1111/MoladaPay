// services/walletServices.js
const { ethers } = require("ethers");
const { Web3 } = require("web3");
const bitcoin = require("bitcoinjs-lib");
const ecc = require("tiny-secp256k1");
const { BIP32Factory } = require("bip32");
const bip32 = BIP32Factory(ecc);
const bip39 = require("bip39");
const { TronWeb } = require("tronweb");
const axios = require("axios");
const { ECPairFactory } = require("ecpair");
bitcoin.initEccLib(ecc);
const EcPair = ECPairFactory(ecc);
const User = require("../models/User");
const ECPair = ECPairFactory(ecc);
const ERC20_ABI = require("../config/erc20Abi.json");
const {
  ethProvider,
  CONTRACTS,
  tronWeb: globalTronWeb,
  MEMPOOL_API,
  BLOCKSTREAM_API,
} = require("../config/crypto");

function toBufferMaybe(u8) {
  return Buffer.isBuffer(u8) ? u8 : Buffer.from(u8);
}

async function generateAddress(userId, chain) {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  let address, privateKey, mnemonic;

  switch (chain.toLowerCase()) {
    case "ethereum": {
      if (user.crypto.ethereum) {
        return { address: user.crypto.ethereum, chain: "ethereum" };
      }
      const wallet = ethers.Wallet.createRandom();
      user.crypto.ethereum = wallet.address; // string
      user.crypto.ethereumPrivateKey = wallet.privateKey; // string
      address = wallet.address;
      privateKey = wallet.privateKey;
      break;
    }

    case "tron": {
      if (user.crypto.tron) {
        return { address: user.crypto.tron, chain: "tron" };
      }
      const tronWeb = new TronWeb({
        fullHost: process.env.TRON_FULL_NODE || "https://api.trongrid.io",
      });
      const acc = await tronWeb.createAccount();
      user.crypto.tron = acc.address.base58; // string
      user.crypto.tronPrivateKey = acc.privateKey; // string
      address = acc.address.base58;
      privateKey = acc.privateKey;
      break;
    }

    case "bitcoin": {
      if (user.crypto.bitcoin) {
        return { address: user.crypto.bitcoin, chain: "bitcoin" };
      }
      mnemonic = bip39.generateMnemonic();
      const seed = await bip39.mnemonicToSeed(mnemonic);
      
      // Use mainnet for production
      const network = bitcoin.networks.bitcoin;
      const root = bip32.fromSeed(seed, network);
      
      // BIP84 path for native SegWit (bc1...)
      const child = root.derivePath("m/84'/0'/0'/0/0");
      
      // Ensure publicKey is a Buffer
      const pubkeyBuffer = Buffer.from(child.publicKey);
      
      // Generate P2WPKH (native SegWit) address
      const { address: btcAddr } = bitcoin.payments.p2wpkh({
        pubkey: pubkeyBuffer,
        network: network,
      });

      if (!btcAddr) {
        throw new Error("Failed to generate Bitcoin address");
      }

      // Store WIF private key (compatible with the network)
      const wif = child.toWIF();
      
      // Verify the generated address and private key match
      const testKeyPair = ECPair.fromWIF(wif, network);
      const testAddress = bitcoin.payments.p2wpkh({
        pubkey: Buffer.from(testKeyPair.publicKey),
        network: network,
      }).address;
      
      if (testAddress !== btcAddr) {
        throw new Error("Address and private key mismatch");
      }

      user.crypto.bitcoin = btcAddr;
      user.crypto.bitcoinPrivateKey = wif;
      user.crypto.mnemonic = mnemonic;
      address = btcAddr;
      privateKey = wif;
      break;
    }

    default:
      throw new Error("Unsupported chain");
  }

  await user.save();

  return { address, privateKey, chain };
}
//user.crypto.bitcoin = btcAddress;
//user.crypto.bitcoinPrivateKey = btcPrivateKey;
//user.crypto.ethereum = ethAddress;
//user.crypto.ethereumPrivateKey = ethPrivateKey;
//user.crypto.tron = tronAddress;
//user.crypto.tronPrivateKey = tronPrivateKey;

//await user.save();

const ETH_RPC = process.env.ETH_RPC || "https://sepolia.infura.io/v3/xxx";
const TRON_FULL_NODE = process.env.TRON_FULL_NODE || "https://api.trongrid.io";

//const CONTRACTS = {
//USDT: process.env.USDT_ERC20_CONTRACT, // ERC20 USDT
// USDT_TRC20: process.env.USDT_TRC20_CONTRACT // TRC20 USDT
//};

//const ethProvider = new ethers.JsonRpcProvider(ETH_RPC);
//let tronWeb = new TronWeb({ fullHost: TRON_FULL_NODE });

// ERC20 ABI
//const ERC20_ABI = [
// "function balanceOf(address) view returns (uint256)",
//"function decimals() view returns (uint8)"
//];

// TRC20 ABI
const TRC20_ABI = [
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "function",
  },
];

async function getETHBalance(address) {
  const b = await ethProvider.getBalance(address);
  return parseFloat(ethers.formatEther(b));
}

async function getUsdtErc20Balance(address) {
  if (!CONTRACTS.USDT) throw new Error("Missing USDT ERC20 contract in .env");
  const contract = new ethers.Contract(CONTRACTS.USDT, ERC20_ABI, ethProvider);
  const decimals = await contract.decimals();
  const bal = await contract.balanceOf(address);
  return parseFloat(ethers.formatUnits(bal, decimals));
}

// Get native TRX balance
async function getTRXBalance(address) {
  if (!globalTronWeb) throw new Error("TronWeb not initialized");
  const sun = await globalTronWeb.trx.getBalance(address); // balance in Sun (1e6)
  return Number(sun) / 1e6; // convert to TRX
}

// USDT (TRC20) balance
async function getUsdtTrc20Balance(address) {
  if (!CONTRACTS.USDT_TRC20) throw new Error("Missing USDT TRC20 contract in .env");
  const t = globalTronWeb || new TronWeb({ fullHost: TRON_FULL_NODE });
  const contract = await t.contract().at(CONTRACTS.USDT_TRC20);
  const bal = await contract.balanceOf(address).call();
  // Debug log
  console.log("TRC20 raw balance response:", bal, typeof bal);
  let rawBalStr;
  if (typeof bal === "bigint") {
    rawBalStr = bal.toString();
  } else if (bal._hex) {
    rawBalStr = BigInt(bal._hex).toString();
  } else if (typeof bal === "object" && bal.toString) {
    rawBalStr = bal.toString();
  } else {
    throw new Error("Unsupported TRC20 balance format: " + JSON.stringify(bal));
  }
  const rawBal = BigInt(rawBalStr);
  const adjusted = rawBal / BigInt(1000000); // Ensure division is done with BigInt
  return Number(adjusted);
}

async function getBTCBalance(address) {
  const base = MEMPOOL_API || BLOCKSTREAM_API;
  if (!base) throw new Error("Block explorer API not configured (MEMPOOL_API or BLOCKSTREAM_API)");
  const url = `${base.replace(/\/$/, "")}/address/${address}`;
  const res = await axios.get(url);
  const confirmed =
    (res.data.chain_stats?.funded_txo_sum || 0) -
    (res.data.chain_stats?.spent_txo_sum || 0);
  const unconfirmed =
    (res.data.mempool_stats?.funded_txo_sum || 0) -
    (res.data.mempool_stats?.spent_txo_sum || 0);
  return (confirmed + unconfirmed) / 1e8;
}

async function getBalance(address, type) {
  if (type === "btc") {
    return await getBTCBalance(address);
  } else if (type === "eth") {
    return await getETHBalance(address);
  } else if (type === "usdt_eth") {
    return await getUsdtErc20Balance(address);
  } else if (type === "trx") {
    return await getTRXBalance(address);
  } else if (type === "usdt_trc20") {
    return await getUsdtTrc20Balance(address);
  }
  return null;
}

function detectChain(to) {
  if (!to || typeof to !== "string") throw new Error("Invalid address");
  console.log(" Detecting chain for address:", to);

  if (to.startsWith("0x") && to.length === 42) return "ethereum";
  if (to.startsWith("T") || to.startsWith("41")) return "tron";
  // bitcoin mainnet
  if (to.startsWith("1") || to.startsWith("3") || to.startsWith("bc1"))
    return "bitcoin";
  // bitcoin testnet
  if (to.startsWith("m") || to.startsWith("n") || to.startsWith("tb1"))
    return "bitcoin";
  throw new Error("Unsupported address format: " + to);
}

async function sendEthereum({ symbol, to, amount, fromPrivKey }) {
  try {
    const provider = new ethers.JsonRpcProvider(process.env.ETH_RPC || process.env.ETH_RPC_URL);
    const wallet = new ethers.Wallet(fromPrivKey, provider);

    if (symbol.toLowerCase() === "eth") {
      const tx = await wallet.sendTransaction({
        to,
        value: ethers.parseEther(String(amount)),
      });
      const receipt = await tx.wait();
      // return normalized object
      return { network: "ethereum", txid: receipt.transactionHash || tx.hash, raw: receipt };
    }

    // ERC20 (USDT usually)
    const tokenAddress = CONTRACTS?.USDT;
    if (!tokenAddress) throw new Error("USDT (ERC20) contract address not set in CONTRACTS.USDT");
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    const decimals = await contract.decimals();
    const tx = await contract.transfer(to, ethers.parseUnits(String(amount), decimals));
    const receipt = await tx.wait();
    return { network: "ethereum", txid: receipt.transactionHash || tx.hash, raw: receipt };
  } catch (err) {
    throw new Error("ETH send failed: " + (err.message || err));
  }
}

async function sendTron({ symbol, to, amount, fromPrivKey }) {
  try {
    // init tronWeb instance with privateKey to sign/send
    const t = globalTronWeb || new TronWeb({ fullHost: process.env.TRON_FULL_NODE || "https://api.trongrid.io", privateKey: fromPrivKey });

    if (symbol.toLowerCase() === "trx") {
      // send TRX (native). tronWeb.trx.sendTransaction returns a tx object
      const tx = await t.trx.sendTransaction(to, Math.round(Number(amount) * 1e6));
      // Note: Might return { result: true, txid: "..." } or raw object depending on node
      const txid = tx.txid || tx;
      return { network: "tron", txid, raw: tx };
    }

    // TRC20 (USDT)
    const trc20Address = CONTRACTS?.USDT_TRC20 || process.env.USDT_TRC20_CONTRACT;
    if (!trc20Address) throw new Error("USDT TRC20 contract not configured (CONTRACTS.USDT_TRC20)");
    const contract = await t.contract().at(trc20Address);

    // TRON contract.transfer typically needs the privateKey to send. Using .send() will sign
    const sendRes = await contract.transfer(to, (Number(amount) * 1e6).toString()).send({ feeLimit: 1_000_000 }, fromPrivKey);
    // sendRes might be txid or transaction object
    const txid = (sendRes && (sendRes.transaction && sendRes.transaction.txID)) || sendRes || null;
    return { network: "tron", txid, raw: sendRes };
  } catch (err) {
    throw new Error("TRX send failed: " + (err.message || JSON.stringify(err)));
  }
}

async function sendBitcoin({ to, amount, fromPrivKey, network = "mainnet", sendMax = false }) {
  try {
    const net = network === "mainnet" ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
    if (!fromPrivKey) throw new Error("Missing BTC WIF private key");
    
    // Validate private key format
    let keyPair;
    try {
      keyPair = ECPair.fromWIF(fromPrivKey, net);
    } catch (err) {
      throw new Error("Invalid Bitcoin private key format: " + err.message);
    }

    // ensure publicKey is Buffer for bitcoinjs
    const pubkeyBuf = Buffer.from(keyPair.publicKey);

    const { address: fromAddress } = bitcoin.payments.p2wpkh({ pubkey: pubkeyBuf, network: net });
    
    if (!fromAddress) {
      throw new Error("Failed to derive sender address from private key");
    }

    const base = MEMPOOL_API || BLOCKSTREAM_API;
    if (!base) throw new Error("Block explorer API not configured (MEMPOOL_API or BLOCKSTREAM_API)");

    const utxosUrl = `${base.replace(/\/$/, "")}/address/${fromAddress}/utxo`;
    const { data: utxos } = await axios.get(utxosUrl);
    if (!utxos || !utxos.length) throw new Error("No UTXOs available for this address");

    // Calculate total input value
    let inputSum = 0;
    for (const utxo of utxos) {
      inputSum += utxo.value;
    }

    // Get recommended fee rate from mempool
    let feeRate = 2; // default satoshis per vbyte
    try {
      const feeUrl = `${base.replace(/\/$/, "")}/v1/fees/recommended`;
      const { data: fees } = await axios.get(feeUrl);
      feeRate = fees.fastestFee || fees.halfHourFee || 2;
    } catch (err) {
      console.warn("Could not fetch fee rates, using default:", err.message);
    }

    // Calculate fee based on transaction size (SegWit vbytes)
    // P2WPKH input: ~68 vbytes, P2WPKH output: ~31 vbytes, overhead: ~10.5 vbytes
    const estimatedVsize = Math.ceil((utxos.length * 68) + (2 * 31) + 10.5);
    const estimatedFee = Math.ceil(estimatedVsize * feeRate);

    // Validate recipient address
    try {
      bitcoin.address.toOutputScript(to, net);
    } catch (err) {
      throw new Error(`Invalid Bitcoin recipient address: ${to}`);
    }

    let satoshis;
    if (sendMax) {
      // Send maximum: total input minus fee
      satoshis = inputSum - estimatedFee;
      if (satoshis <= 546) { // Below dust limit
        throw new Error(`Insufficient funds to send max. After fee deduction, amount would be below dust limit (546 satoshis)`);
      }
    } else {
      // Convert to satoshis with proper rounding to avoid precision issues
      satoshis = Math.round(Number(amount) * 1e8);
      
      // Validate amount is above dust limit
      if (satoshis < 546) {
        throw new Error(`Amount below dust limit (546 satoshis = 0.00000546 BTC)`);
      }

      // Check if we have enough funds
      const totalNeeded = satoshis + estimatedFee;
      if (inputSum < totalNeeded) {
        const available = (inputSum / 1e8).toFixed(8);
        const needed = (totalNeeded / 1e8).toFixed(8);
        const maxSendable = ((inputSum - estimatedFee) / 1e8).toFixed(8);
        throw new Error(`Insufficient funds. Available: ${available} BTC, Required: ${needed} BTC (including ${(estimatedFee / 1e8).toFixed(8)} BTC fee). Maximum you can send: ${maxSendable} BTC`);
      }
    }

    const psbt = new bitcoin.Psbt({ network: net });

    // Add all UTXOs as inputs
    for (const utxo of utxos) {
      const payment = bitcoin.payments.p2wpkh({ pubkey: pubkeyBuf, network: net });
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: { script: payment.output, value: utxo.value },
      });
    }

    // Add recipient output
    psbt.addOutput({ address: to, value: satoshis });

    // Add change output if there's any
    const change = inputSum - satoshis - estimatedFee;
    if (change > 546) { // Dust limit for Bitcoin
      psbt.addOutput({ address: fromAddress, value: change });
    }

    // create Buffer-compatible signer expected by psbt.signInput
    const signer = {
      publicKey: pubkeyBuf,
      sign: (hash) => {
        // keyPair.sign returns a signature (Buffer/Uint8Array)
        const sig = keyPair.sign(hash);
        return Buffer.from(sig);
      },
    };

    for (let i = 0; i < utxos.length; i++) psbt.signInput(i, signer);

    try { psbt.validateSignaturesOfAllInputs(); } catch (e) { /* ignore if lib doesn't support */ }
    psbt.finalizeAllInputs();

    const rawTx = psbt.extractTransaction().toHex();
    const txBroadcastUrl = `${base.replace(/\/$/, "")}/tx`;
    const { data: txid } = await axios.post(txBroadcastUrl, rawTx, { headers: { "Content-Type": "text/plain" } });

    return { network: "bitcoin", txid, raw: rawTx };
  } catch (err) {
    throw new Error("BTC send failed: " + (err.message || err));
  }
}

async function sendCrypto({ chain, symbol, to, amount, fromPrivKey, network, sendMax }) {
  // auto-detect chain if not provided
  if (!chain) chain = detectChain(to);
  console.log(` Sending ${amount} ${symbol} on ${chain} -> ${to}${sendMax ? ' (MAX)' : ''}`);

  const chainLower = (chain || "").toLowerCase();
  if (chainLower === "ethereum" || chainLower === "eth") {
    return sendEthereum({ symbol, to, amount, fromPrivKey });
  } else if (chainLower === "tron") {
    return sendTron({ symbol, to, amount, fromPrivKey });
  } else if (chainLower === "bitcoin" || chainLower === "btc") {
    return sendBitcoin({ to, amount, fromPrivKey, network, sendMax });
  } else {
    throw new Error("Unsupported chain: " + chain);
  }
}

const ZEROX_BASE = process.env.ZEROX_BASE || "https://api.0x.org"; // mainnet by default
const ZEROX_API_KEY = process.env.ZEROX_API_KEY || ""; // v2 requires API key
const MIN_ERC20 = [
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
];
// swapOnEthereum: performs a real swap via 0x API using user's private key
async function swapOnEthereum({ fromSymbol, toSymbol, amount, slippageBps = 50, fromPrivKey, providerUrl }) {
  // providerUrl optional — fallback to process.env.ETH_RPC
  const provider = new ethers.JsonRpcProvider(providerUrl || process.env.ETH_RPC);
  const wallet = new ethers.Wallet(fromPrivKey, provider);

  // Get chain ID from provider to ensure 0x API and provider are aligned
  const network = await provider.getNetwork();
  const chainId = network.chainId.toString();

  // Validate that 0x supports this chain (common supported chains)
  const supportedChains = ['1', '10', '56', '137', '8453', '42161', '43114']; // mainnet, optimism, bsc, polygon, base, arbitrum, avalanche
  if (!supportedChains.includes(chainId)) {
    throw new Error(`Chain ID ${chainId} is not supported by 0x API. Supported chains: ${supportedChains.join(', ')}. Please use a supported network or update your ETH_RPC configuration.`);
  }

  // Map symbol -> address (extend as needed)
  const ERC20_MAP = {
    ETH: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", // 0x protocol ETH address format
    USDT: process.env.USDT_CONTRACT || "0xdAC17F958D2ee523a2206206994597C13D831ec7", // mainnet USDT
    USDC: process.env.USDC_CONTRACT || "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // mainnet USDC
    DAI: process.env.DAI_CONTRACT || "0x6B175474E89094C44Da98b954EedeAC495271d0F", // mainnet DAI
  };

  const sellToken = (ERC20_MAP[fromSymbol.toUpperCase()] || fromSymbol);
  const buyToken = (ERC20_MAP[toSymbol.toUpperCase()] || toSymbol);

  if (!sellToken || !buyToken) throw new Error("Unsupported token mapping for swap");

  // Validate token addresses (all should be valid addresses in 0x v2)
  if (!ethers.isAddress(sellToken)) {
    throw new Error(`Invalid sell token address: ${sellToken}. Please set proper contract address in environment variables.`);
  }
  if (!ethers.isAddress(buyToken)) {
    throw new Error(`Invalid buy token address: ${buyToken}. Please set proper contract address in environment variables.`);
  }

  // resolve sellAmount in base units
  let sellAmountParam;
  if (sellToken === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
    // Native ETH
    sellAmountParam = ethers.parseEther(String(amount)).toString();
  } else {
    // ERC20 token - read decimals
    const erc20 = new ethers.Contract(sellToken, MIN_ERC20, provider);
    const decimals = await erc20.decimals();
    sellAmountParam = ethers.parseUnits(String(amount), decimals).toString();
  }

  // Check if API key is available for v2
  if (!ZEROX_API_KEY || ZEROX_API_KEY === "your_0x_api_key_here") {
    throw new Error("ZEROX_API_KEY is required for 0x API v2. Please set it in your .env file. Get your key from https://dashboard.0x.org/apps");
  }

  // 0x v2 parameters with chainId
  const params = new URLSearchParams({
    chainId: chainId,
    sellToken: sellToken,
    buyToken: buyToken,
    sellAmount: sellAmountParam,
    slippagePercentage: (slippageBps / 10000).toString(), // e.g. 50 bps -> 0.005
    taker: await wallet.getAddress(), // v2 uses 'taker' instead of 'takerAddress'
  });

  // v2 API with required headers (use allowance-holder endpoint for better compatibility)
  const quoteUrl = `${ZEROX_BASE}/swap/allowance-holder/quote?${params.toString()}`;
  const headers = {
    '0x-api-key': ZEROX_API_KEY,
    '0x-version': 'v2'
  };

  // Debug logging
  console.log(` 0x API Request:`);
  console.log(`URL: ${quoteUrl}`);
  console.log(`Headers:`, headers);
  console.log(`Chain ID: ${chainId}, Network: ${network.name}`);
  console.log(`Sell Token: ${sellToken}, Buy Token: ${buyToken}`);
  console.log(`Sell Amount: ${sellAmountParam}`);

  let quote;
  try {
    const response = await axios.get(quoteUrl, { headers });
    quote = response.data;
    console.log(` 0x API Response received:`, JSON.stringify(quote, null, 2));

    // Validate response has required transaction data
    if (!quote.transaction || !quote.transaction.to || !quote.transaction.data) {
      throw new Error('Invalid quote response: missing transaction data');
    }
  } catch (error) {
    if (error.response) {
      throw new Error(`0x API error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }

  // If selling ERC20, ensure allowance to spender (v2 compatibility)
  if (sellToken !== "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
    const tokenContract = new ethers.Contract(sellToken, MIN_ERC20, wallet);
    const owner = await wallet.getAddress();

    // Handle v2 response field variations
    const spender = quote.allowanceTarget || quote.spender;
    const sellAmount = quote.sellAmount || quote.sellTokenAmount;

    if (!spender || !sellAmount) {
      throw new Error('Quote response missing allowance target or sell amount');
    }

    const allowance = await tokenContract.allowance(owner, spender);
    const required = BigInt(sellAmount); // Fixed: use BigInt instead of ethers.BigInt
    if (allowance < required) {
      const approveTx = await tokenContract.approve(spender, required);
      await approveTx.wait();
    }
  }

  // Build transaction with quote.transaction (v2 format)
  const txValue = quote.transaction.value || "0";
  const txRequest = {
    to: quote.transaction.to,
    data: quote.transaction.data,
    value: BigInt(txValue), // Handle hex or decimal strings
    // optionally include gasLimit/gasPrice if returned
    // gasLimit: quote.transaction.gas ? BigInt(quote.transaction.gas) : undefined
  };

  const sent = await wallet.sendTransaction(txRequest);
  const receipt = await sent.wait();
  return {
    network: "ethereum",
    hash: receipt.transactionHash || sent.hash,
    from: await wallet.getAddress(),
    fromSymbol,
    toSymbol,
    amount,
    quote,
  };
}
// swapOnTron: uses a SunSwap-like router contract on Tron
async function swapOnTron({ fromSymbol, toSymbol, amount, slippageBps = 50, fromPrivKey }) {
  const TRON_ROUTER = process.env.SUNSWAP_ROUTER || process.env.SUNSWAP_ROUTER;
  if (!TRON_ROUTER) throw new Error("SUNSWAP_ROUTER not set in .env");

  const tWeb = globalTronWeb || new TronWeb({ fullHost: process.env.TRON_FULL_NODE || "https://api.trongrid.io", privateKey: fromPrivKey });
  const owner = tWeb.address.fromPrivateKey(fromPrivKey);

  // map symbols
  const TRC20_MAP = {
    TRX: "TRX",
    USDT: process.env.USDT_TRC20_CONTRACT || "",
    USDC: process.env.USDC_TRC20_CONTRACT || "",
  };

  const inToken = TRC20_MAP[fromSymbol.toUpperCase()] || fromSymbol;
  const outToken = TRC20_MAP[toSymbol.toUpperCase()] || toSymbol;

  // build path: for SunSwap router may expect addresses; TRX is often represented by 'TRX' or "T..." depending on router ABI. We'll assume router expects addresses and TRX requires wrapper or special function.
  const router = await tWeb.contract().at(TRON_ROUTER);

  const slippageFrac = 1 - slippageBps / 10000;
  // convert amounts
  if (inToken === "TRX") {
    // swapExactTRXForTokens(amountOutMin, path, to, deadline)
    // estimate amountOutMin = 0 (safe for test) — in prod you should call getAmountsOut if available
    const amountSun = Math.round(Number(amount) * 1e6);
    // Build path: TRX -> token
    // many Tron routers accept token addresses, with TRX represented by 'TRX' or special; this differs by router ABI.
    const path = [inToken === "TRX" ? "TT" : inToken, outToken === "TRX" ? "TT" : outToken];
    // Set deadline
    const deadline = Math.floor(Date.now() / 1000) + 1200;
    const tx = await router.swapExactTRXForTokens(0, path, owner, deadline).send({ callValue: amountSun });
    return { network: "tron", hash: tx, from: owner, fromSymbol, toSymbol, amount };
  } else if (outToken === "TRX") {
    // swapExactTokensForTRX(amountIn, amountOutMin, path, to, deadline)
    const tokenInContract = await tWeb.contract().at(inToken);
    const dec = await tokenInContract.decimals().call();
    const amountIn = (Number(amount) * 10 ** Number(dec)).toString();
    // approve router
    await tokenInContract.approve(TRON_ROUTER, amountIn).send({ from: owner });
    const path = [inToken, "TT"]; // token -> TRX
    const deadline = Math.floor(Date.now() / 1000) + 1200;
    const tx = await router.swapExactTokensForTRX(amountIn, 0, path, owner, deadline).send();
    return { network: "tron", hash: tx, from: owner, fromSymbol, toSymbol, amount };
  } else {
    // token -> token: swapExactTokensForTokens
    const tokenInContract = await tWeb.contract().at(inToken);
    const dec = await tokenInContract.decimals().call();
    const amountIn = (Number(amount) * 10 ** Number(dec)).toString();
    // approve router
    await tokenInContract.approve(TRON_ROUTER, amountIn).send({ from: owner });
    const path = [inToken, "TT", outToken]; // token -> TRX -> token
    const deadline = Math.floor(Date.now() / 1000) + 1200;
    const tx = await router.swapExactTokensForTokens(amountIn, 0, path, owner, deadline).send();
    return { network: "tron", hash: tx, from: owner, fromSymbol, toSymbol, amount };
  }
}
// swapCrypto dispatcher
async function swapCrypto({ chain, fromSymbol, toSymbol, amount, slippageBps = 50, fromPrivKey, extra }) {
  const chainLower = (chain || "").toLowerCase();

  console.log(` Initiating swap: ${amount} ${fromSymbol} -> ${toSymbol} on ${chain}`);

  if (chainLower === "ethereum" || chainLower === "eth") {
    return await swapOnEthereum({ fromSymbol, toSymbol, amount, slippageBps, fromPrivKey, providerUrl: extra?.providerUrl });
  }
  if (chainLower === "tron" || chainLower === "trx") {
    return await swapOnTron({ fromSymbol, toSymbol, amount, slippageBps, fromPrivKey });
  }

  throw new Error(`Unsupported chain for swap: ${chain}. Supported chains: ethereum, tron`);
}

module.exports = {
  generateAddress,
  getETHBalance,
  getUsdtErc20Balance,
  getBTCBalance,
  getTRXBalance,
  getUsdtTrc20Balance,
  getBalance,
  getAllBalances: async (user) => ({
    eth: user.crypto?.eth ? await getETHBalance(user.crypto.eth) : 0,
    usdtErc20: user.crypto?.usdtErc20
      ? await getUsdtErc20Balance(user.crypto.usdtErc20)
      : 0,
    btc: user.crypto?.btc ? await getBTCBalance(user.crypto.btc) : 0,
    trx: user.crypto?.trx ? await getTRXBalance(user.crypto.trx) : 0,
    usdtTrc20: user.crypto?.usdtTrc20
      ? await getUsdtTrc20Balance(user.crypto.usdtTrc20)
      : 0,
  }),
  detectChain,
  sendCrypto,
  swapCrypto,
};