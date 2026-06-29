const axios = require('axios');

const BINANCE_BASE = 'https://api.binance.com/api/v3';
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

// Asset su Binance
const BINANCE_SYMBOLS = {
  BTC:  'BTCUSDT',
  ETH:  'ETHUSDT',
  SOL:  'SOLUSDT',
  XRP:  'XRPUSDT',
  AAVE: 'AAVEUSDT',
  LINK: 'LINKUSDT',
  UNI:  'UNIUSDT',
};

// Asset non su Binance → CoinGecko
const COINGECKO_IDS = {
  CRO: 'crypto-com-chain',
};

async function getUsdEurRate() {
  const response = await axios.get('https://api.frankfurter.app/latest?from=USD&to=EUR');
  return response.data.rates.EUR;
}

async function getPrices(symbols) {
  const binanceSyms = symbols.filter(s => BINANCE_SYMBOLS[s]);
  const geckoSyms   = symbols.filter(s => COINGECKO_IDS[s]);

  const requests = [getUsdEurRate()];

  if (binanceSyms.length > 0) {
    requests.push(
      axios.get(`${BINANCE_BASE}/ticker/24hr`, {
        params: { symbols: JSON.stringify(binanceSyms.map(s => BINANCE_SYMBOLS[s])) },
      })
    );
  }

  if (geckoSyms.length > 0) {
    const ids = geckoSyms.map(s => COINGECKO_IDS[s]).join(',');
    requests.push(
      axios.get(`${COINGECKO_BASE}/coins/markets`, {
        params: { vs_currency: 'eur', ids },
        headers: { 'User-Agent': 'crypto-assistant/1.0' },
      })
    );
  }

  const results = await Promise.all(requests);
  const eurRate = results[0];
  const prices  = {};

  // Binance
  if (binanceSyms.length > 0) {
    const binanceToSym = Object.fromEntries(Object.entries(BINANCE_SYMBOLS).map(([s, b]) => [b, s]));
    for (const ticker of results[1].data) {
      const symbol = binanceToSym[ticker.symbol];
      if (!symbol) continue;
      const priceUsd = parseFloat(ticker.lastPrice);
      prices[symbol] = {
        priceUsd,
        priceEur: priceUsd * eurRate,
        change24hPct: parseFloat(ticker.priceChangePercent),
        high24hUsd: parseFloat(ticker.highPrice),
        low24hUsd: parseFloat(ticker.lowPrice),
        volume24hUsd: parseFloat(ticker.quoteVolume),
      };
    }
  }

  // CoinGecko (solo per asset non su Binance)
  if (geckoSyms.length > 0) {
    const geckoToSym = Object.fromEntries(Object.entries(COINGECKO_IDS).map(([s, id]) => [id, s]));
    const geckoResult = results[binanceSyms.length > 0 ? 2 : 1];
    for (const coin of geckoResult.data) {
      const symbol = geckoToSym[coin.id];
      if (!symbol) continue;
      const priceEur = coin.current_price;
      prices[symbol] = {
        priceEur,
        priceUsd: priceEur / eurRate,
        change24hPct: coin.price_change_percentage_24h ?? 0,
        high24hUsd: (coin.high_24h ?? priceEur) / eurRate,
        low24hUsd: (coin.low_24h ?? priceEur) / eurRate,
        volume24hUsd: coin.total_volume ?? 0,
      };
    }
  }

  return { prices, eurRate };
}

module.exports = { getPrices, BINANCE_SYMBOLS, COINGECKO_IDS };
