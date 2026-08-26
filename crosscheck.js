require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ─────────────────────────────────────────────────────────────────────────────
// crosscheck.js — AUDIT IN SOLA LETTURA
//
// Somma il master crypto_transactions.csv (stessa logica di update-from-csv.js)
// e lo confronta con le quantita SOVRANE in data/portfolio.json, SENZA scrivere
// nulla. Serve come riscontro incrociato dei saldi, non come sorgente.
//
// A differenza di update-from-csv.js NON tocca portfolio.json: le quantita
// sovrane + i saldi live (sync-app.js) restano la fonte di verita. Il CSV puo
// avere buchi (finestre mai esportate) che rendono le sue somme leggermente
// basse; qui li vedi come delta, non li subisci.
// ─────────────────────────────────────────────────────────────────────────────

const CSV_PATH = path.join(__dirname, 'crypto_transactions.csv');
const PORTFOLIO_PATH = path.join(__dirname, 'data', 'portfolio.json');

// Movimenti interni: spostano crypto tra wallet/earn/staking ma non cambiano il totale
const INTERNAL_KINDS = new Set([
  'crypto_earn_program_created',
  'crypto_earn_program_withdrawn',
  'finance.dpos.staking.crypto_wallet',
  'finance.dpos.unstaking.crypto_wallet',
  'finance.defi_staking.staking.crypto_wallet',
  'finance.defi_staking.unstaking.crypto_wallet',
  'finance.defi_lending.staking.crypto_wallet',
]);

const FIAT = new Set(['EUR', 'USD', 'GBP', 'USDT', 'USDC', '']);

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { fields.push(current.trim()); current = ''; }
    else { current += ch; }
  }
  fields.push(current.trim());
  return fields;
}

async function parseCSV(filePath) {
  const rl = readline.createInterface({ input: fs.createReadStream(filePath, 'utf-8'), crlfDelay: Infinity });
  const rows = [];
  let headers = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const fields = parseCSVLine(line);
    if (!headers) { headers = fields; continue; }
    const row = {};
    headers.forEach((h, i) => { row[h] = (fields[i] ?? '').replace(/^"|"$/g, ''); });
    rows.push(row);
  }
  return rows;
}

function calcBalances(rows) {
  const balances = {};
  for (const row of rows) {
    const kind = row['Transaction Kind'];
    if (INTERNAL_KINDS.has(kind)) continue;
    const currency = row['Currency'];
    const toCurrency = row['To Currency'];
    const amount = parseFloat(row['Amount']);
    const toAmount = parseFloat(row['To Amount']);
    if (!FIAT.has(currency) && !isNaN(amount)) {
      balances[currency] = (balances[currency] ?? 0) + amount;
    }
    if (!FIAT.has(toCurrency) && toCurrency !== currency && !isNaN(toAmount)) {
      balances[toCurrency] = (balances[toCurrency] ?? 0) + toAmount;
    }
  }
  return balances;
}

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

  console.log('AUDIT crosscheck — CSV somma vs quantita sovrana (SOLA LETTURA)');
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
