const axios = require('axios');

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const CRYPTOCOM_BASE = 'https://api.crypto.com/exchange/v1/public';

const COINGECKO_IDS = {
  BTC:  'bitcoin',
  ETH:  'ethereum',
  SOL:  'solana',
  XRP:  'ripple',
  AAVE: 'aave',
  CRO:  'crypto-com-chain',
  LINK: 'chainlink',
  UNI:  'uniswap',
};

// Crypto.com instrument names for public ticker endpoint
const CRYPTOCOM_INSTRUMENTS = {
  BTC:  'BTC_USD',
  ETH:  'ETH_USD',
  SOL:  'SOL_USD',
  XRP:  'XRP_USD',
  AAVE: 'AAVE_USD',
  CRO:  'CRO_USD',
  LINK: 'LINK_USD',
  UNI:  'UNI_USD',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function cgGet(path, params, retries = 4) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await axios.get(`${COINGECKO_BASE}${path}`, {
        params,
        headers: { 'User-Agent': 'crypto-assistant/1.0' },
        timeout: 15000,
      });
    } catch (err) {
      if (err.response?.status === 429 && attempt < retries) {
        const wait = 15000 * attempt;
        console.log(`CoinGecko rate limit, attendo ${wait / 1000}s...`);
        await sleep(wait);
      } else {
        throw err;
      }
    }
  }
}

async function getUsdEurRate() {
  const r = await axios.get('https://api.frankfurter.app/latest?from=USD&to=EUR', { timeout: 10000 });
  return r.data.rates.EUR;
}

async function getCryptoComPrices(symbols, eurRate) {
  const prices = {};
  const results = await Promise.allSettled(
    symbols.map(async sym => {
      const instrument = CRYPTOCOM_INSTRUMENTS[sym];
      if (!instrument) return;
      const r = await axios.get(`${CRYPTOCOM_BASE}/get-ticker`, {
        params: { instrument_name: instrument },
        timeout: 10000,
      });
      const t = r.data?.result?.data?.[0];
      if (!t) return;
      const priceUsd = parseFloat(t.a); // best ask as current price
      prices[sym] = {
        priceEur: priceUsd * eurRate,
        priceUsd,
        change24hPct: parseFloat(t.c) * 100, // c = change percentage as decimal
        high24hUsd: parseFloat(t.h),
        low24hUsd:  parseFloat(t.l),
        volume24hUsd: parseFloat(t.v) * priceUsd,
      };
    })
  );
  // Log any individual failures silently (partial results are fine)
  results.forEach((r, i) => {
    if (r.status === 'rejected') console.log(`[Crypto.com] ${symbols[i]}: ${r.reason?.message}`);
  });
  return prices;
}

async function getPrices(symbols) {
  const [eurRate] = await Promise.all([getUsdEurRate()]);

  try {
    const ids = symbols.map(s => COINGECKO_IDS[s]).filter(Boolean).join(',');
    const marketRes = await cgGet('/coins/markets', { vs_currency: 'eur', ids, price_change_percentage: '24h' });

    const idToSym = Object.fromEntries(Object.entries(COINGECKO_IDS).map(([s, id]) => [id, s]));
    const prices = {};
    for (const coin of marketRes.data) {
      const sym = idToSym[coin.id];
      if (!sym) continue;
      const priceEur = coin.current_price;
      prices[sym] = {
        priceEur,
        priceUsd: priceEur / eurRate,
        change24hPct: coin.price_change_percentage_24h ?? 0,
        high24hUsd: (coin.high_24h ?? priceEur) / eurRate,
        low24hUsd:  (coin.low_24h  ?? priceEur) / eurRate,
        volume24hUsd: coin.total_volume ?? 0,
      };
    }

    // Fill any missing symbols from Crypto.com
    const missing = symbols.filter(s => !prices[s]);
    if (missing.length > 0) {
      console.log(`[Crypto.com fallback] ${missing.join(', ')}`);
      const fallback = await getCryptoComPrices(missing, eurRate);
      Object.assign(prices, fallback);
    }

    return { prices, eurRate };
  } catch (err) {
    // CoinGecko completely unavailable — fall back entirely to Crypto.com
    console.log(`CoinGecko non disponibile (${err.message}), uso Crypto.com...`);
    const prices = await getCryptoComPrices(symbols, eurRate);
    return { prices, eurRate };
  }
}

module.exports = { getPrices, getCryptoComPrices, COINGECKO_IDS };
