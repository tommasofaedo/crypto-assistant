const axios = require('axios');
const { COINGECKO_IDS, CRYPTOCOM_INSTRUMENTS } = require('./marketData');

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const CRYPTOCOM_V2   = 'https://api.crypto.com/v2/public';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getCryptoComCandles(symbol) {
  const instrument = CRYPTOCOM_INSTRUMENTS[symbol];
  if (!instrument) throw new Error(`Strumento Crypto.com non trovato per ${symbol}`);

  const r = await axios.get(`${CRYPTOCOM_V2}/get-candlestick`, {
    params: { instrument_name: instrument, timeframe: '1D', count: 200 },
    timeout: 15000,
  });

  const candles = r.data?.result?.data;
  if (!candles || candles.length === 0) throw new Error(`Nessun dato da Crypto.com per ${symbol}`);

  return candles.map(c => ({
    timestamp: c.t,
    open:   parseFloat(c.o),
    high:   parseFloat(c.h),
    low:    parseFloat(c.l),
    close:  parseFloat(c.c),
    volume: parseFloat(c.v),
  }));
}

async function cgGet(path, params, retries = 4) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await axios.get(`${COINGECKO_BASE}${path}`, {
        params,
        headers: { 'User-Agent': 'crypto-assistant/1.0' },
        timeout: 15000,
      });
    } catch (err) {
      const status = err.response?.status;
      if ((status === 429 || (status >= 500 && status < 600)) && attempt < retries) {
        const wait = status === 429 ? 15000 * attempt : 5000 * attempt;
        console.log(`[${path}] ${status}, attendo ${wait / 1000}s (tentativo ${attempt}/${retries})...`);
        await sleep(wait);
      } else {
        throw err;
      }
    }
  }
}

async function getCandles(symbol) {
  // Primary: Crypto.com Exchange (no rate limits)
  try {
    return await getCryptoComCandles(symbol);
  } catch (err) {
    console.log(`[Crypto.com candles] ${symbol}: ${err.message}, uso CoinGecko...`);
  }

  // Fallback: CoinGecko
  const coinId = COINGECKO_IDS[symbol];
  if (!coinId) throw new Error(`Nessuna fonte configurata per ${symbol}`);

  const res = await cgGet(`/coins/${coinId}/market_chart`, { vs_currency: 'usd', days: 200 });
  await sleep(3000); // rate limit CoinGecko tra asset
  return res.data.prices.map(([timestamp, close]) => ({
    timestamp, open: close, high: close, low: close, close, volume: 0,
  }));
}

module.exports = { getCandles };
