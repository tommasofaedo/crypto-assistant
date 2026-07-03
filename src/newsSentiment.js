// Community sentiment via CoinGecko /coins/{id} — sentiment_votes_up_percentage
// Cache in-memory 1h: zero impatto su rate limit per PM2 (processo persistente).
// GHA (processo fresh) fa 13 call × 2s ≈ 26s al primo avvio — accettabile.
const axios = require('axios');
const { COINGECKO_IDS } = require('./marketData');

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const CACHE = {};
const CACHE_TTL = 3600 * 1000; // 1h

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchUpPct(coinId, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const r = await axios.get(`${COINGECKO_BASE}/coins/${coinId}`, {
        params: { localization: false, tickers: false, market_data: false, community_data: true, developer_data: false },
        headers: { 'User-Agent': 'crypto-assistant/1.0' },
        timeout: 15000,
      });
      return r.data.sentiment_votes_up_percentage ?? null;
    } catch (err) {
      const status = err.response?.status;
      if ((status === 429 || (status >= 500 && status < 600)) && attempt < retries) {
        await sleep(status === 429 ? 20000 * attempt : 5000 * attempt);
      } else {
        throw err;
      }
    }
  }
}

function toScore(upPct) {
  if (upPct == null) return 0;
  if (upPct >= 70)   return +5;
  if (upPct >= 60)   return +3;
  if (upPct >= 50)   return +1;
  if (upPct >= 40)   return -1;
  if (upPct >= 30)   return -3;
  return                    -5;
}

async function getNewsSentiment(symbols) {
  const now = Date.now();
  const result = {};

  for (const sym of symbols) {
    const coinId = COINGECKO_IDS[sym];
    if (!coinId) continue;

    if (CACHE[sym] && now - CACHE[sym].at < CACHE_TTL) {
      result[sym] = CACHE[sym].data;
      continue;
    }

    try {
      const upPct = await fetchUpPct(coinId);
      const score = toScore(upPct);
      const label = upPct != null ? `${upPct.toFixed(0)}% bullish` : 'n/d';
      const data  = { score, label, upPct, headlines: [], count: upPct != null ? 1 : 0 };
      CACHE[sym]  = { at: now, data };
      result[sym] = data;
      await sleep(2000); // ~30 call/min max sul free tier
    } catch (err) {
      console.warn(`[CoinGecko sentiment] ${sym}: ${err.message}`);
    }
  }

  return result;
}

module.exports = { getNewsSentiment };
