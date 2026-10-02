const paths = require('./src/paths');
paths.boot();
paths.loadEnv();
const fs = require('fs');
const { parseCSV, calcBalances } = require('./src/csvLedger');

// ─────────────────────────────────────────────────────────────────────────────
// crosscheck.js — AUDIT IN SOLA LETTURA
//
// Somma il master crypto_transactions.csv (logica condivisa in src/csvLedger.js)
// e lo confronta con le quantita SOVRANE in data/portfolio.json, SENZA scrivere
// nulla. Serve come riscontro incrociato dei saldi, non come sorgente.
//
// A differenza di update-from-csv.js NON tocca portfolio.json: le quantita
// sovrane + i saldi live (sync-app.js) restano la fonte di verita. Il CSV puo
// avere buchi (finestre mai esportate) che rendono le sue somme leggermente
// basse; qui li vedi come delta, non li subisci.
// ─────────────────────────────────────────────────────────────────────────────

const CSV_PATH = paths.csvPath();
const PORTFOLIO_PATH = paths.portfolioPath();

function fmt(n, dec = 8) {
  return Number(n).toFixed(dec);
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`File non trovato: ${CSV_PATH}`);
    process.exit(1);
  }

  const rows = await parseCSV(CSV_PATH);
  const balances = calcBalances(rows);
  const portfolio = JSON.parse(fs.readFileSync(PORTFOLIO_PATH, 'utf-8'));

  console.log(`AUDIT crosscheck [profilo: ${paths.getActiveProfile()}] — CSV somma vs quantita sovrana (SOLA LETTURA)`);
  console.log(`Master: ${rows.length} transazioni | Portfolio: ${portfolio.holdings.length} asset\n`);
  console.log('ASSET     CSV somma          sovrano (pf)       delta            delta%');
  console.log('─'.repeat(74));

  let flagged = 0;
  for (const h of portfolio.holdings) {
    const csv = balances[h.symbol] ?? 0;
    const sov = h.quantity;
    const delta = csv - sov;
    const pct = sov ? (delta / sov) * 100 : 0;
    const warn = Math.abs(pct) >= 3 ? '  ⚠' : '';
    if (warn) flagged++;
    console.log(
      `${h.symbol.padEnd(8)} ${fmt(csv).padStart(16)} ${fmt(sov).padStart(18)} ${fmt(delta).padStart(16)} ${pct.toFixed(2).padStart(8)}%${warn}`
    );
  }

  // Asset presenti nel CSV ma NON tracciati in portfolio.json (residui/dust/airdrop)
  const DUST = 0.000001;
  const phantom = Object.entries(balances)
    .filter(([sym, v]) => v > DUST && !portfolio.holdings.some(h => h.symbol === sym))
    .sort((a, b) => b[1] - a[1]);

  if (phantom.length) {
    console.log(`\nAsset nel CSV ma non in portfolio.json (${phantom.length}) — residui/dust/airdrop, non tracciati:`);
    for (const [sym, qty] of phantom) {
      console.log(`  ${sym.padEnd(10)} ${fmt(qty)}`);
    }
  }

  console.log(`\n${flagged} asset con delta >= 3% (buchi export o acquisti fuori-CSV).`);
  console.log('NB: audit in sola lettura. Per i saldi reali usa sync-app.js + quantita sovrane.');
  console.log('    NON usare update-from-csv.js finche il master ha buchi (sovrascriverebbe con somme basse).');
}

main().catch(err => {
  console.error('Errore:', err.message);
  process.exit(1);
});
