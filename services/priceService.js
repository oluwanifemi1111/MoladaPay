
const axios = require('axios');

// Cache prices to avoid excessive API calls
let priceCache = {
  BTC: { usd: 0, usd_24h_change: 0, lastUpdate: 0 },
  ETH: { usd: 0, usd_24h_change: 0, lastUpdate: 0 },
  TRX: { usd: 0, usd_24h_change: 0, lastUpdate: 0 },
  USDT: { usd: 1, usd_24h_change: 0, lastUpdate: Date.now() } // USDT is always ~$1
};

const CACHE_DURATION = 60000; // 1 minute cache

// Fetch live prices from CoinGecko (free tier)
async function fetchLivePrices() {
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: {
        ids: 'bitcoin,ethereum,tron',
        vs_currencies: 'usd',
        include_24hr_change: 'true'
      }
    });

    const now = Date.now();
    priceCache.BTC = { 
      usd: response.data.bitcoin.usd, 
      usd_24h_change: response.data.bitcoin.usd_24h_change || 0,
      lastUpdate: now 
    };
    priceCache.ETH = { 
      usd: response.data.ethereum.usd, 
      usd_24h_change: response.data.ethereum.usd_24h_change || 0,
      lastUpdate: now 
    };
    priceCache.TRX = { 
      usd: response.data.tron.usd, 
      usd_24h_change: response.data.tron.usd_24h_change || 0,
      lastUpdate: now 
    };

    console.log(' Prices updated:', {
      BTC: `$${priceCache.BTC.usd} (${priceCache.BTC.usd_24h_change.toFixed(2)}%)`,
      ETH: `$${priceCache.ETH.usd} (${priceCache.ETH.usd_24h_change.toFixed(2)}%)`,
      TRX: `$${priceCache.TRX.usd} (${priceCache.TRX.usd_24h_change.toFixed(2)}%)`
    });

    return priceCache;
  } catch (error) {
    console.error(' Price fetch error:', error.message);
    return priceCache; // Return cached prices on error
  }
}

// Get price with caching
async function getPrice(symbol) {
  const cached = priceCache[symbol.toUpperCase()];
  
  // Return cached if fresh (less than 1 minute old)
  if (cached && (Date.now() - cached.lastUpdate) < CACHE_DURATION) {
    return cached.usd;
  }

  // Fetch fresh prices
  await fetchLivePrices();
  return priceCache[symbol.toUpperCase()]?.usd || 0;
}

// Get price with 24h change percentage
async function getPriceWithChange(symbol) {
  const cached = priceCache[symbol.toUpperCase()];
  
  // Return cached if fresh (less than 1 minute old)
  if (cached && (Date.now() - cached.lastUpdate) < CACHE_DURATION) {
    return {
      price: cached.usd,
      change24h: cached.usd_24h_change
    };
  }

  // Fetch fresh prices
  await fetchLivePrices();
  const data = priceCache[symbol.toUpperCase()];
  return {
    price: data?.usd || 0,
    change24h: data?.usd_24h_change || 0
  };
}

// Calculate total portfolio value in USD
async function calculatePortfolioValue(balances) {
  const prices = await Promise.all([
    getPrice('BTC'),
    getPrice('ETH'),
    getPrice('TRX'),
    getPrice('USDT')
  ]);

  return {
    btc: (balances.btc || 0) * prices[0],
    eth: (balances.eth || 0) * prices[1],
    trx: (balances.trx || 0) * prices[2],
    usdt_trc20: (balances.usdt_trc20 || 0) * prices[3],
    usdt_eth: (balances.usdt_eth || 0) * prices[3],
    total: (
      (balances.btc || 0) * prices[0] +
      (balances.eth || 0) * prices[1] +
      (balances.trx || 0) * prices[2] +
      (balances.usdt_trc20 || 0) * prices[3] +
      (balances.usdt_eth || 0) * prices[3]
    ),
    prices: {
      BTC: prices[0],
      ETH: prices[1],
      TRX: prices[2],
      USDT: prices[3]
    }
  };
}

// Start price updater (runs every 1 minute)
function startPriceUpdater() {
  // Initial fetch
  fetchLivePrices();
  
  // Update every minute
  setInterval(fetchLivePrices, 60000);
  console.log(' Live price updater started');
}

module.exports = {
  getPrice,
  getPriceWithChange,
  calculatePortfolioValue,
  startPriceUpdater,
  priceCache
};
