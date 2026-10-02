/**
 * report-json.js — Uscita JSON strutturata del consiglio per un profilo (per crypto-console).
 *
 * Esegue lo STESSO motore di local-advisor/telegram (runAdvisor + getTelegramAdvice):
 * nessuna logica decisionale duplicata. Stampa il JSON tra marcatori, così chi lo invoca
 * lo estrae ignorando i log di libreria che finiscono su stdout.
 *
 * Uso: node report-json.js --profile <nome> [budget] [--no-ai]
 *   --no-ai : salta la nota Marco Ferretti (nessuna chiamata Anthropic → nessun costo).
 */
const paths = require('./src/paths');
paths.boot();      // fissa il profilo da --profile (già rimosso da argv) prima del budget
paths.loadEnv();
const { runAdvisor } = require('./src/advisor');
const { getTelegramAdvice } = require('./src/aiAdvisor');

const START = '===CRYPTO_JSON_START===';
const END   = '===CRYPTO_JSON_END===';

// Primo token puramente numerico tra gli argomenti = budget (i flag --xxx sono ignorati).
function parseBudget(argv) {
  for (const a of argv.slice(2)) {
    if (/^\d+([.,]\d+)?$/.test(a)) return parseFloat(a.replace(',', '.'));
  }
  return 0;
}

async function main() {
  const budget = parseBudget(process.argv);
  const noAi = process.argv.includes('--no-ai');

  const { portfolio, fearGreed, globalMetrics, analyses, watchlistAnalyses } = await runAdvisor();

  const bySym = Object.fromEntries(analyses.map(a => [a.symbol, a]));
  const holdings = portfolio.holdings.map(h => {
    const a = bySym[h.symbol] || {};
    return {
      symbol: h.symbol, name: h.name,
      quantity: h.quantity, availableForTrading: h.availableForTrading,
      priceEur: h.priceEur, valueEur: h.valueEur, allocationPct: h.allocationPct,
      change24hPct: h.change24hPct, pnlEur: h.pnlEur, pnlPct: h.pnlPct,
      signal: a.signal ?? null, score: a.score ?? null, rsi: a.rsi ?? null,
    };
  });

  const watchlist = (watchlistAnalyses || []).map(a => ({
    symbol: a.symbol, name: a.name, signal: a.signal, score: a.score, rsi: a.rsi, priceEur: a.priceEur,
  }));

  const report = noAi
    ? null
    : await getTelegramAdvice(portfolio, fearGreed, analyses, budget, globalMetrics, watchlistAnalyses);

  const payload = {
    profile: paths.getActiveProfile(),
    generatedAt: new Date().toISOString(),
    budget,
    totalValueEur: portfolio.totalValueEur,
    fearGreed,
    globalMetrics,
    holdings,
    watchlist,
    report,
  };

  process.stdout.write(`\n${START}\n${JSON.stringify(payload)}\n${END}\n`);
}

main().catch(err => {
  process.stdout.write(`\n${START}\n${JSON.stringify({ error: err.message })}\n${END}\n`);
  process.exit(1);
});
