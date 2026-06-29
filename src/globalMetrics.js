const axios = require('axios');

const BASE = 'https://pro-api.coinmarketcap.com/public-api';

async function getGlobalMetrics() {
  try {
    const [metricsRes, altcoinRes] = await Promise.all([
      axios.get(`${BASE}/v1/global-metrics/quotes/latest`, { timeout: 10000 }),
      axios.get(`${BASE}/v1/altcoin-season-index/latest`, { timeout: 10000 }),
    ]);

    const d = metricsRes.data.data;
    const usd = d.quote?.USD ?? {};
    const alt = altcoinRes.data.data;
    const altIdx = alt?.altcoin_index ?? null;
    const altLabel = altIdx == null ? null
      : altIdx >= 75 ? 'Altcoin Season'
      : altIdx <= 25 ? 'Bitcoin Season'
      : 'Neutro';

    return {
      btcDominance: d.btc_dominance,
      ethDominance: d.eth_dominance,
      totalMarketCapUsd: usd.total_market_cap,
      totalMarketCapChange24h: usd.total_market_cap_yesterday_percentage_change,
      totalVolume24hUsd: usd.total_volume_24h,
      defiMarketCapUsd: usd.defi_market_cap,
      activeCryptos: d.active_cryptocurrencies,
      altcoinSeasonIndex: altIdx,
      altcoinSeasonLabel: altLabel,
    };
  } catch (err) {
    console.warn('[GlobalMetrics] Skip:', err.message);
    return null;
  }
}

module.exports = { getGlobalMetrics };
