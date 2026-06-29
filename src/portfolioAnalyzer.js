const fs = require('fs');
const path = require('path');
const { getPrices } = require('./marketData');

function loadPortfolio() {
  const filePath = path.join(__dirname, '../data/portfolio.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

async function analyzePortfolio() {
  const portfolio = loadPortfolio();
  const symbols = portfolio.holdings.map(h => h.symbol);
  const { prices, eurRate } = await getPrices(symbols);

  const enriched = portfolio.holdings.map(h => {
    const market = prices[h.symbol];
    if (!market) return { ...h, error: 'prezzo non disponibile' };

    const valueEur = h.quantity * market.priceEur;
    const pnlEur = h.avgBuyPrice > 0
      ? (market.priceEur - h.avgBuyPrice) * h.quantity
      : null;
    const pnlPct = h.avgBuyPrice > 0
      ? ((market.priceEur - h.avgBuyPrice) / h.avgBuyPrice) * 100
      : null;

    return {
      symbol: h.symbol,
      name: h.name,
      quantity: h.quantity,
      priceEur: market.priceEur,
      priceUsd: market.priceUsd,
      valueEur,
      change24hPct: market.change24hPct,
      high24hUsd: market.high24hUsd,
      low24hUsd: market.low24hUsd,
      pnlEur,
      pnlPct,
    };
  });

  const totalValueEur = enriched.reduce((sum, h) => sum + (h.valueEur || 0), 0);

  const withAllocation = enriched.map(h => ({
    ...h,
    allocationPct: h.valueEur ? (h.valueEur / totalValueEur) * 100 : 0,
  }));

  withAllocation.sort((a, b) => b.valueEur - a.valueEur);

  return { holdings: withAllocation, totalValueEur, eurRate, updatedAt: portfolio.updatedAt };
}

module.exports = { analyzePortfolio };
