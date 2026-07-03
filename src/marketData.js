const axios = require('axios');

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const CRYPTOCOM_V2   = 'https://api.crypto.com/v2/public';

const COINGECKO_IDS = {
  BTC:  'bitcoin',
  ETH:  'ethereum',
  SOL:  'solana',
  XRP:  'ripple',
  AAVE: 'aave',
  CRO:  'crypto-com-chain',
  LINK: 'chainlink',
  UNI:  'uniswap',
  // watchlist
  DOT:  'polkadot',
  ADA:  'cardano',
  AVAX: 'avalanche-2',
  ATOM: 'cosmos',
  NEAR: 'near',
};

const CRYPTOCOM_INSTRUMENTS = {
  BTC:  'BTC_USD',
  ETH:  'ETH_USD',
  SOL:  'SOL_USD',
  XRP:  'XRP_USD',
  AAVE: 'AAVE_USD',
  CRO:  'CRO_USD',
  LINK: 'LINK_USD',
  UNI:  'UNI_USD',
  // watchlist
  DOT:  'DOT_USD',
  ADA:  'ADA_USD',
  AVAX: 'AVAX_USD',
  ATOM: 'ATOM_USD',
  NEAR: 'NEAR_USD',
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
      const status = err.response?.status;
      if ((status === 429 || (status >= 500 && status < 600)) && attempt < retries) {
        const wait = status === 429 ? 15000 * attempt : 5000 * attempt;
        console.log(`CoinGecko ${status}, attendo ${wait / 1000}s (tentativo ${attempt}/${retries})...`);
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
  // Fetch all tickers in one call, then filter — no per-symbol rate limit risk
  const r = await axios.get(`${CRYPTOCOM_V2}/get-ticker`, { timeout: 15000 });
  const allTickers = r.data?.result?.data ?? [];
  const byInstrument = Object.fromEntries(allTickers.map(t => [t.i, t]));

  const prices = {};
  for (const sym of symbols) {
    const instrument = CRYPTOCOM_INSTRUMENTS[sym];
    const t = instrument ? byInstrument[instrument] : null;
    if (!t) { console.log(`[Crypto.com] ${sym}: strumento non trovato`); continue; }
    const priceUsd = parseFloat(t.a);
    prices[sym] = {
      priceEur:     priceUsd * eurRate,
      priceUsd,
      change24hPct: parseFloat(t.c) * 100,
      high24hUsd:   parseFloat(t.h),
      low24hUsd:    parseFloat(t.l),
      volume24hUsd: parseFloat(t.v) * priceUsd,
    };
  }
  return prices;
}

async function getPrices(symbols) {
  const eurRate = await getUsdEurRate();

  // Primary: Crypto.com Exchange (no rate limit issues)
  const prices = await getCryptoComPrices(symbols, eurRate);

  // Fallback: CoinGecko for any symbols Crypto.com didn't return
  const missing = symbols.filter(s => !prices[s]);
  if (missing.length > 0) {
    console.log(`[CoinGecko fallback] ${missing.join(', ')}`);
    try {
      const ids = missing.map(s => COINGECKO_IDS[s]).filter(Boolean).join(',');
      const marketRes = await cgGet('/coins/markets', { vs_currency: 'eur', ids, price_change_percentage: '24h' });
      const idToSym = Object.fromEntries(Object.entries(COINGECKO_IDS).map(([s, id]) => [id, s]));
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
    } catch (err) {
      console.log(`CoinGecko non disponibile: ${err.message}`);
    }
  }

  return { prices, eurRate };
}

async function getCoinGeckoEnrichment(symbols) {
  const ids = symbols.map(s => COINGECKO_IDS[s]).filter(Boolean).join(',');
  if (!ids) return {};
  try {
    const r = await cgGet('/coins/markets', {
      vs_currency: 'usd',
      ids,
      price_change_percentage: '7d',
      sparkline: false,
    });
    const idToSym = Object.fromEntries(Object.entries(COINGECKO_IDS).map(([s, id]) => [id, s]));
    const result = {};
    for (const coin of r.data) {
      const sym = idToSym[coin.id];
      if (!sym) continue;
      result[sym] = {
        athUsd:          coin.ath ?? null,
        athChangePct:    coin.ath_change_percentage ?? null,
        marketCapRank:   coin.market_cap_rank ?? null,
        priceChange7dPct: coin.price_change_percentage_7d_in_currency ?? null,
      };
    }
    return result;
  } catch (err) {
    console.warn('[CoinGecko enrichment] Skip:', err.message);
    return {};
  }
}

module.exports = { getPrices, getCryptoComPrices, getCoinGeckoEnrichment, COINGECKO_IDS, CRYPTOCOM_INSTRUMENTS };
