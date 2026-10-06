/**
 * value-json.js — Valori LIVE di un profilo (prezzi correnti → valore e P&L ORA).
 *
 * Versione LEGGERA di report-json: usa solo analyzePortfolio (una fetch batch dei prezzi),
 * NIENTE indicatori tecnici né nota AI. Serve al pulsante "Aggiorna valori" della console per
 * confrontare il valore istantaneo in questo momento col portafoglio del cliente. Sola lettura.
 *
 * Uso: node value-json.js --profile <nome>
 */
const paths = require('./src/paths');
paths.boot();
paths.loadEnv();
const { analyzePortfolio } = require('./src/portfolioAnalyzer');

const START = '===CRYPTO_JSON_START===';
const END   = '===CRYPTO_JSON_END===';

async function main() {
  const { holdings, totalValueEur, updatedAt } = await analyzePortfolio();

  const payload = {
    profile: paths.getActiveProfile(),
    generatedAt: new Date().toISOString(),
    portfolioUpdatedAt: updatedAt,
    totalValueEur,
    holdings: holdings.map(h => ({
      symbol: h.symbol,
      name: h.name,
      quantity: h.quantity,
      priceEur: h.priceEur ?? null,
      valueEur: h.valueEur ?? null,
      change24hPct: h.change24hPct ?? null,
      pnlEur: h.pnlEur ?? null,
      pnlPct: h.pnlPct ?? null,
    })),
  };

  process.stdout.write(`\n${START}\n${JSON.stringify(payload)}\n${END}\n`);
}

main().catch(err => {
  process.stdout.write(`\n${START}\n${JSON.stringify({ error: err.message })}\n${END}\n`);
  process.exit(1);
});
