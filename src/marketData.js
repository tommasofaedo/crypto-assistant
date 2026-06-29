const axios = require('axios');

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

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

async function getPrices(symbols) {
  const ids = symbols.map(s => COINGECKO_IDS[s]).filter(Boolean).join(',');
  const [marketRes, eurRate] = await Promise.all([
    cgGet('/coins/markets', { vs_currency: 'eur', ids, price_change_percentage: '24h' }),
    getUsdEurRate(),
  ]);

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
  return { prices, eurRate };
}

module.exports = { getPrices, COINGECKO_IDS };
