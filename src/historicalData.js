const axios = require('axios');
const { BINANCE_SYMBOLS, COINGECKO_IDS } = require('./marketData');

const BINANCE_BASE  = 'https://api.binance.com/api/v3';
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

async function getCandles(symbol) {
  // Asset su Binance
  if (BINANCE_SYMBOLS[symbol]) {
    const response = await axios.get(`${BINANCE_BASE}/klines`, {
      params: { symbol: BINANCE_SYMBOLS[symbol], interval: '1d', limit: 200 },
    });
    return response.data.map(c => ({
      timestamp: c[0],
      open:   parseFloat(c[1]),
      high:   parseFloat(c[2]),
      low:    parseFloat(c[3]),
      close:  parseFloat(c[4]),
      volume: parseFloat(c[5]),
    }));
  }

  // Fallback CoinGecko per asset non su Binance (es. CRO)
  if (COINGECKO_IDS[symbol]) {
    const response = await axios.get(
      `${COINGECKO_BASE}/coins/${COINGECKO_IDS[symbol]}/market_chart`,
      {
        params: { vs_currency: 'usd', days: 200 },
        headers: { 'User-Agent': 'crypto-assistant/1.0' },
      }
    );
    return response.data.prices.map(([timestamp, close]) => ({
      timestamp, open: close, high: close, low: close, close, volume: 0,
    }));
  }

  throw new Error(`Nessuna fonte dati configurata per ${symbol}`);
}

module.exports = { getCandles };
