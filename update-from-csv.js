require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CSV_PATH = path.join(__dirname, 'crypto_transactions.csv');
const PORTFOLIO_PATH = path.join(__dirname, 'data', 'portfolio.json');

// Movimenti interni: spostano crypto tra wallet/earn/staking ma non cambiano il totale posseduto
const INTERNAL_KINDS = new Set([
  'crypto_earn_program_created',
  'crypto_earn_program_withdrawn',
  'finance.dpos.staking.crypto_wallet',
  'finance.dpos.unstaking.crypto_wallet',
  'finance.defi_staking.staking.crypto_wallet',
  'finance.defi_staking.unstaking.crypto_wallet',
  'finance.defi_lending.staking.crypto_wallet',
]);

// Valute fiat da ignorare
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

    // Crypto in entrata/uscita diretta (premi staking, vendite, ecc.)
    if (!FIAT.has(currency) && !isNaN(amount)) {
      balances[currency] = (balances[currency] ?? 0) + amount;
    }

    // Crypto ricevuta tramite acquisto (viban_purchase, basket)
    if (!FIAT.has(toCurrency) && toCurrency !== currency && !isNaN(toAmount)) {
      balances[toCurrency] = (balances[toCurrency] ?? 0) + toAmount;
    }
  }

  return balances;
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`File non trovato: ${CSV_PATH}`);
    console.error('Esporta le transazioni da Crypto.com App e metti il CSV nella cartella del progetto.');
    process.exit(1);
  }

  console.log(`Lettura ${CSV_PATH}...`);
  const rows = await parseCSV(CSV_PATH);
  console.log(`${rows.length} transazioni trovate.\n`);

  const balances = calcBalances(rows);

  // Filtra polvere (< 0.000001) e valori negativi residui
  const DUST = 0.000001;
  const meaningful = Object.entries(balances)
    .filter(([, v]) => v > DUST)
    .sort((a, b) => b[1] - a[1]);

  console.log('Saldi calcolati dal CSV:');
  console.log('─'.repeat(40));
  for (const [sym, qty] of meaningful) {
    const dec = qty < 0.01 ? 8 : qty < 1 ? 6 : 4;
    console.log(`  ${sym.padEnd(8)} ${qty.toFixed(dec)}`);
  }
  console.log('');

  // Aggiorna portfolio.json
  const portfolio = JSON.parse(fs.readFileSync(PORTFOLIO_PATH, 'utf-8'));
  const balanceMap = Object.fromEntries(meaningful);

  let updated = 0;
  const notInPortfolio = [];

  for (const holding of portfolio.holdings) {
    const qty = balanceMap[holding.symbol];
    if (qty !== undefined) {
      holding.quantity = Math.round(qty * 1e8) / 1e8; // arrotonda all'8° decimale
      updated++;
    }
  }

  // Segnala asset trovati nel CSV ma non in portfolio.json
  for (const [sym] of meaningful) {
    const inPortfolio = portfolio.holdings.some(h => h.symbol === sym);
    if (!inPortfolio) notInPortfolio.push(sym);
  }

  portfolio.updatedAt = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(PORTFOLIO_PATH, JSON.stringify(portfolio, null, 2), 'utf-8');

  console.log(`Portfolio aggiornato: ${updated}/${portfolio.holdings.length} asset sincronizzati.`);
  if (notInPortfolio.length > 0) {
    console.log(`Asset nel CSV non presenti in portfolio.json: ${notInPortfolio.join(', ')}`);
    console.log('(Aggiungili manualmente se vuoi includerli nell\'analisi)');
  }
}

main().catch(err => {
  console.error('Errore:', err.message);
  process.exit(1);
});
