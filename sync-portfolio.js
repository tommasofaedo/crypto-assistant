require('dotenv').config();
const { privateRequest } = require('./src/cryptoClient');
const fs = require('fs');
const path = require('path');

const PORTFOLIO_PATH = path.join(__dirname, 'data', 'portfolio.json');

async function getSpotBalances() {
  const result = await privateRequest('private/get-account-summary', {});
  const accounts = result.data?.accounts ?? [];

  return accounts
    .filter(a => parseFloat(a.balance) > 0)
    .map(a => ({
      symbol: a.currency,
      balance: parseFloat(a.balance),
      available: parseFloat(a.available),
      order: parseFloat(a.order ?? 0),
      stake: parseFloat(a.stake ?? 0),
    }));
}

async function main() {
  console.log('Recupero saldi da Crypto.com Exchange...\n');

  let balances;
  try {
    balances = await getSpotBalances();
  } catch (err) {
    console.error('Errore API:', err.message);
    console.error('Assicurati che CRYPTO_API_KEY e CRYPTO_API_SECRET siano nel file .env');
    process.exit(1);
  }

  console.log('Saldi trovati:');
  for (const b of balances) {
    console.log(`  ${b.symbol.padEnd(8)} ${b.balance}`);
  }

  const portfolio = JSON.parse(fs.readFileSync(PORTFOLIO_PATH, 'utf-8'));
  let updated = 0;
  let notFound = [];

  for (const holding of portfolio.holdings) {
    const bal = balances.find(b => b.symbol === holding.symbol);
    if (bal) {
      holding.quantity = bal.balance;
      updated++;
    } else {
      notFound.push(holding.symbol);
    }
  }

  portfolio.updatedAt = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(PORTFOLIO_PATH, JSON.stringify(portfolio, null, 2), 'utf-8');

  console.log(`\nPortafoglio aggiornato: ${updated}/${portfolio.holdings.length} asset sincronizzati`);
  if (notFound.length > 0) {
    console.log(`Non trovati sull'Exchange (sono sull'App): ${notFound.join(', ')}`);
  }
  console.log(`File: ${PORTFOLIO_PATH}`);
}

main().catch(err => {
  console.error('\nErrore:', err.message);
  process.exit(1);
});
