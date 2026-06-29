const axios = require('axios');

const BASE_URL = 'https://api.crypto.com/exchange/v1';

async function publicRequest(method, params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = `${BASE_URL}/${method}${query ? '?' + query : ''}`;
  const response = await axios.get(url);
  if (response.data.code !== 0) {
    throw new Error(`API error ${response.data.code}: ${response.data.message}`);
  }
  return response.data.result;
}

async function getUsdEurRate() {
  const response = await axios.get('https://api.frankfurter.app/latest?from=USD&to=EUR');
  return response.data.rates.EUR;
}

async function getPrices(symbols) {
  const [tickerResult, eurRate] = await Promise.all([
    publicRequest('public/get-tickers'),
    getUsdEurRate(),
  ]);

  const tickers = tickerResult.data;
  const priceMap = {};

  for (const symbol of symbols) {
    const ticker = tickers.find(t => t.i === `${symbol}_USD` || t.i === `${symbol}_USDT`);
    if (ticker) {
      const priceUsd = parseFloat(ticker.a);
      priceMap[symbol] = {
        priceUsd,
        priceEur: priceUsd * eurRate,
        change24hPct: parseFloat(ticker.c) * 100,
        high24hUsd: parseFloat(ticker.h),
        low24hUsd: parseFloat(ticker.l),
        volume24hUsd: parseFloat(ticker.vv),
      };
    }
  }

  return { prices: priceMap, eurRate };
}

module.exports = { getPrices, publicRequest };
