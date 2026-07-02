const axios = require('axios');

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const HEADERS = { 'User-Agent': 'crypto-assistant/1.0' };

async function getGlobalMetrics() {
  try {
    const r = await axios.get(`${COINGECKO_BASE}/global`, { headers: HEADERS, timeout: 10000 });
    const d = r.data.data;
    const btcDom = d.market_cap_percentage?.btc ?? null;
    const ethDom = d.market_cap_percentage?.eth ?? null;

    // Proxy altcoin season da BTC dominance (50%→50, 35%→74, 65%→26)
    const altcoinSeasonIndex = btcDom != null
      ? Math.max(0, Math.min(100, Math.round(130 - btcDom * 1.6)))
      : null;
    const altcoinSeasonLabel = altcoinSeasonIndex == null ? null
      : altcoinSeasonIndex >= 75 ? 'Altcoin Season'
      : altcoinSeasonIndex <= 25 ? 'Bitcoin Season'
      : 'Neutro';

    let defiMarketCapUsd = null;
    try {
      const defiR = await axios.get(`${COINGECKO_BASE}/global/decentralized_finance_defi`, { headers: HEADERS, timeout: 10000 });
      defiMarketCapUsd = parseFloat(defiR.data.data?.defi_market_cap ?? 0) || null;
    } catch (_) {}

    return {
      btcDominance: btcDom,
      ethDominance: ethDom,
      totalMarketCapUsd: d.total_market_cap?.usd ?? null,
      totalMarketCapChange24h: d.market_cap_change_percentage_24h_usd ?? null,
      totalVolume24hUsd: d.total_volume?.usd ?? null,
      defiMarketCapUsd,
      activeCryptos: d.active_cryptocurrencies ?? null,
      altcoinSeasonIndex,
      altcoinSeasonLabel,
    };
  } catch (err) {
    console.warn('[GlobalMetrics] Skip:', err.message);
    return null;
  }
}

module.exports = { getGlobalMetrics };
