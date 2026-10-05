/**
 * reconcile.js — Riconciliazione CSV ↔ quantità sovrane (SOLA LETTURA, per crypto-console F2).
 *
 * INCREMENTALE: propone di alzare il sovrano SOLO di quanto aggiungono le righe NUOVE, cioè
 * quelle con data > portfolio.updatedAt (l'ultima riconciliazione). NON snappa alla somma
 * assoluta del CSV: quella diverge di natura dal sovrano (buchi di export, BTC da exchange
 * esterni, staked invisibile allo SPOT, premi compound) e un suo eccesso storico produceva
 * "raise" spuri (incidente SOL 05/10: csvSum storico 11.956 > sovrano 11.940 → proponeva
 * +0.016 che non c'entrava con l'import, in realtà solo +0.008 di premi nuovi).
 *
 * Le righe nuove sono scomposte in acquisti / premi / altro (categorizeIncoming). I movimenti
 * INTERNI (unstaking, staking) sono esclusi: spostano crypto ma non cambiano il totale sovrano
 * — NB: lo spostamento di `availableForTrading` da unstaking resta manuale (qui non si tocca).
 *
 * NON scrive nulla: né il master né portfolio.json. L'applicazione delle quantità è F3.
 * Prudenza invariata: non si propone MAI di abbassare (le vendite le gestisce il pipeline sell).
 * `csvSum` resta nel payload come dato informativo (somma dell'intera storia), ma non guida piu
 * la proposta.
 *
 *   node reconcile.js --profile <nome> [--csv <file>] [--json]
 * Senza --csv usa il master del profilo (nessuna riga "nuova" → tutto hold).
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

async function main() {
  const uploaded = argValue('--csv');
  const masterPath = paths.csvPath();

  const masterRows = fs.existsSync(masterPath) ? await parseCSV(masterPath) : [];
  const upRows = uploaded ? await parseCSV(uploaded) : [];

  const portfolio = JSON.parse(fs.readFileSync(paths.portfolioPath(), 'utf-8'));
  const known = new Set(portfolio.holdings.map(h => h.symbol));

  // Taglio incrementale: solo le righe DOPO l'ultima riconciliazione (portfolio.updatedAt).
  // Data riga 'YYYY-MM-DD' > cutoff lessicografico. Dedup per chiave stabile (non JSON intero,
  // che si rompe se la ri-esportazione cambia la precisione dei Native Amount).
  const cutoff = (portfolio.updatedAt || '').slice(0, 10);
  const rowDate = r => (r['Timestamp (UTC)'] || '').slice(0, 10);
  const key = r => [r['Timestamp (UTC)'], r['Transaction Kind'], r['Currency'],
                    r['Amount'], r['To Currency'], r['To Amount']].join('|');
  const seen = new Set();
  const newRows = [];
  for (const r of upRows.concat(masterRows)) {       // upload prima: vince sulla copia master
    if (cutoff && rowDate(r) <= cutoff) continue;     // già incluso nel sovrano
    const k = key(r);
    if (seen.has(k)) continue;
    seen.add(k);
    newRows.push(r);
  }

  const balances = calcBalances(masterRows.concat(upRows));  // somma storica, solo informativa
  const addedByAsset = categorizeIncoming(newRows);          // scomposizione delle sole righe nuove

  const addedTotal = a =>
    a ? (a.purchases.total + a.rewards.total + a.other.total) : 0;

  const assets = portfolio.holdings.map(h => {
    const csvSum = balances[h.symbol] ?? 0;
    const added = addedByAsset[h.symbol] ?? null;
    const delta = addedTotal(added);            // quanto aggiungono SOLO le righe nuove (>=0)
    const raise = delta > EPS;
    return {
      symbol: h.symbol,
      name: h.name,
      sovereign: h.quantity,
      csvSum,                                   // informativo: somma dell'intera storia CSV
      delta,                                    // incremento proposto dalle sole righe nuove
      deltaPct: h.quantity ? (delta / h.quantity) * 100 : null,
      direction: raise ? 'raise' : 'hold',      // mai 'lower': le vendite le gestisce il pipeline sell
      suggested: raise ? h.quantity + delta : h.quantity,  // sovrano + nuove righe (incrementale)
      added,                                    // nuove righe import: {purchases,rewards,other}
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
    cutoff,  // le righe <= cutoff sono gia nel sovrano; si considerano solo le successive
    summary: {
      masterRows: masterRows.length,
      uploadedRows: upRows.length,
      newRows: newRows.length,
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
