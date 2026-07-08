const axios = require('axios');
const { COINGECKO_IDS, CRYPTOCOM_INSTRUMENTS } = require('./marketData');

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const CRYPTOCOM_V2   = 'https://api.crypto.com/v2/public';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function cdcGet(url, params, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await axios.get(url, { params, timeout: 15000 });
    } catch (err) {
      const status = err.response?.status;
      if (status >= 500 && status < 600 && attempt < retries) {
        const wait = 5000 * attempt;
        console.log(`[Crypto.com] ${status}, attendo ${wait / 1000}s (tentativo ${attempt}/${retries})...`);
        await sleep(wait);
      } else {
        throw err;
      }
    }
  }
}

async function getCryptoComCandles(symbol, timeframe = '1D', count = 200) {
  const instrument = CRYPTOCOM_INSTRUMENTS[symbol];
  if (!instrument) throw new Error(`Strumento Crypto.com non trovato per ${symbol}`);

  const r = await cdcGet(`${CRYPTOCOM_V2}/get-candlestick`, {
    instrument_name: instrument, timeframe, count,
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

// timeframe: '1D' (default), '7D' (settimanale), '4h' (intraday). Il fallback CoinGecko copre solo il giornaliero.
async function getCandles(symbol, timeframe = '1D', count = 200) {
  // Primary: Crypto.com Exchange (no rate limits)
  try {
    return await getCryptoComCandles(symbol, timeframe, count);
  } catch (err) {
    console.log(`[Crypto.com candles] ${symbol} ${timeframe}: ${err.message}, uso CoinGecko...`);
  }

  // Fallback: CoinGecko — solo giornaliero, altri timeframe non disponibili
  if (timeframe !== '1D') {
    console.log(`[candles] ${symbol}: timeframe ${timeframe} non disponibile su fallback CoinGecko`);
    return null;
  }
  const coinId = COINGECKO_IDS[symbol];
  if (!coinId) throw new Error(`Nessuna fonte configurata per ${symbol}`);

  const res = await cgGet(`/coins/${coinId}/market_chart`, { vs_currency: 'usd', days: 200 });
  await sleep(3000); // rate limit CoinGecko tra asset
  return res.data.prices.map(([timestamp, close]) => ({
    timestamp, open: close, high: close, low: close, close, volume: 0,
  }));
}

// Recupera i timeframe rilevanti in un colpo solo (giornaliero + settimanale + 4h).
// Solo il giornaliero è obbligatorio; gli altri degradano a null senza far fallire l'analisi.
async function getMultiTimeframeCandles(symbol) {
  const daily = await getCandles(symbol, '1D', 200);
  const [weekly, fourH] = await Promise.all([
    getCandles(symbol, '7D', 120).catch(() => null),
    getCandles(symbol, '4h', 200).catch(() => null),
  ]);
  return { daily, weekly, fourH };
}

module.exports = { getCandles, getMultiTimeframeCandles };
