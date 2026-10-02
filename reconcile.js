/**
 * reconcile.js — Riconciliazione CSV ↔ quantità sovrane (SOLA LETTURA, per crypto-console F2).
 *
 * Unisce il CSV caricato al master del profilo (dedup per riga identica), ricalcola la
 * somma per asset e la confronta con le quantità SOVRANE in portfolio.json. Scompone le
 * righe NUOVE (presenti nell'upload ma non nel master) in acquisti / premi / altro: è la
 * vista che serve per decidere quanto "bumpare" il totale.
 *
 * NON scrive nulla: né il master né portfolio.json. L'applicazione delle quantità sarà F3.
 * Prudenza (come da storico): il CSV può avere buchi di export → se la somma CSV è PIÙ BASSA
 * del sovrano NON si propone mai di abbassare (si tiene il sovrano).
 *
 *   node reconcile.js --profile <nome> [--csv <file>] [--json]
 * Senza --csv usa il master del profilo (riconciliazione del solo master).
 */
const fs = require('fs');
const paths = require('./src/paths');
paths.boot();
paths.loadEnv();
const { parseCSV, calcBalances, categorizeIncoming } = require('./src/csvLedger');

const START = '===CRYPTO_JSON_START===';
const END   = '===CRYPTO_JSON_END===';
const EPS = 1e-8;

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  const pref = process.argv.find(a => a.startsWith(flag + '='));
  return pref ? pref.slice(flag.length + 1) : null;
}

const sig = row => JSON.stringify(row); // righe identiche = stessa transazione

async function main() {
  const uploaded = argValue('--csv');
  const masterPath = paths.csvPath();

  const masterRows = fs.existsSync(masterPath) ? await parseCSV(masterPath) : [];
  const upRows = uploaded ? await parseCSV(uploaded) : [];

  // Dedup: righe dell'upload non già presenti nel master.
  const masterSig = new Set(masterRows.map(sig));
  const newRows = upRows.filter(r => !masterSig.has(sig(r)));
  const unionRows = masterRows.concat(newRows);

  const balances = calcBalances(unionRows);  // totale per asset (master + nuove)
  const addedByAsset = categorizeIncoming(newRows); // scomposizione delle sole nuove righe

  const portfolio = JSON.parse(fs.readFileSync(paths.portfolioPath(), 'utf-8'));
  const known = new Set(portfolio.holdings.map(h => h.symbol));

  const assets = portfolio.holdings.map(h => {
    const csvSum = balances[h.symbol] ?? 0;
    const delta = csvSum - h.quantity;
    const raise = delta > EPS;
    return {
      symbol: h.symbol,
      name: h.name,
      sovereign: h.quantity,
      csvSum,
      delta,
      deltaPct: h.quantity ? (delta / h.quantity) * 100 : null,
      direction: raise ? 'raise' : 'hold',    // mai 'lower': non si abbassa il sovrano dal CSV
      suggested: raise ? csvSum : h.quantity,  // alza solo se il CSV mostra di più
      added: addedByAsset[h.symbol] ?? null,   // nuove righe import: {purchases,rewards,other}
    };
  });

  // Asset presenti nel CSV ma non tracciati nel portafoglio (dust/airdrop/nuovi).
  const DUST = 1e-6;
  const phantom = Object.entries(balances)
    .filter(([sym, v]) => v > DUST && !known.has(sym))
    .sort((a, b) => b[1] - a[1])
    .map(([symbol, csvSum]) => ({ symbol, csvSum, added: addedByAsset[symbol] ?? null }));

  const payload = {
    profile: paths.getActiveProfile(),
    generatedAt: new Date().toISOString(),
    uploadedFile: uploaded ? uploaded.replace(/^.*[\\/]/, '') : null,
    summary: {
      masterRows: masterRows.length,
      uploadedRows: upRows.length,
      newRows: newRows.length,
      duplicatesSkipped: upRows.length - newRows.length,
    },
    assets,
    phantom,
  };

  process.stdout.write(`\n${START}\n${JSON.stringify(payload)}\n${END}\n`);
}

main().catch(err => {
  process.stdout.write(`\n${START}\n${JSON.stringify({ error: err.message })}\n${END}\n`);
  process.exit(1);
});
