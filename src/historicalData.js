const axios = require('axios');
const { COINGECKO_IDS } = require('./marketData');

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

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
        console.log(`[${path}] rate limit, attendo ${wait / 1000}s...`);
        await sleep(wait);
      } else {
        throw err;
      }
    }
  }
}

async function getCandles(symbol) {
  const coinId = COINGECKO_IDS[symbol];
  if (!coinId) throw new Error(`Nessuna fonte configurata per ${symbol}`);

  // market_chart con days>90 restituisce dati giornalieri automaticamente
  const res = await cgGet(`/coins/${coinId}/market_chart`, { vs_currency: 'usd', days: 200 });

  // Pausa tra asset per rispettare il rate limit (in produzione: 1 run/giorno, nessun problema)
  await sleep(3000);

  return res.data.prices.map(([timestamp, close]) => ({
    timestamp, open: close, high: close, low: close, close, volume: 0,
  }));
}

module.exports = { getCandles };
