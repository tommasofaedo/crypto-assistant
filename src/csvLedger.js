/**
 * csvLedger.js — Logica condivisa di lettura del CSV movimenti Crypto.com.
 *
 * Usato da crosscheck.js (audit) e report/reconcile (console). Unica fonte della
 * "matematica CSV" così i due strumenti non divergono mai.
 *
 * `calcBalances` = somma netta per asset (esclude i movimenti interni e la fiat).
 * `categorizeIncoming` = scompone le entrate per categoria (acquisti / premi / altro),
 * la vista che serve per consolidare TUTTE le righe premio a ogni import.
 */
const fs = require('fs');
const readline = require('readline');

// Movimenti interni: spostano crypto tra wallet/earn/staking ma non cambiano il totale.
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

// Entrate per ACQUISTO (fiat → crypto, swap, deposito).
const PURCHASE_KINDS = new Set([
  'viban_purchase',
  'crypto_viban_exchange',
  'crypto_exchange',
  'exchange_to_crypto_transfer',
  'crypto_deposit',
  'finance.crypto_basket.purchase.cash_account',
  'finance.crypto_basket.purchase.cash_account.credit',
  'finance.crypto_basket.purchase.cash_account.received',
]);

// Entrate per PREMIO (interessi staking/earn, cashback, campagne).
const REWARD_KINDS = new Set([
  'finance.dpos.compound_interest.crypto_wallet',
  'finance.dpos.non_compound_interest.crypto_wallet',
  'finance.defi_staking.non_compound_interest.crypto_wallet',
  'finance.defi_staking.compound_interest.crypto_wallet',
  'finance.defi_lending.compound_interest.crypto_wallet',
  'finance.defi_lending.non_compound_interest.crypto_wallet',
  'crypto_earn_interest_paid',
  'referral_card_cashback',
  'campaign_reward',
  'rewards_platform_deposit_credited',
  'admin_wallet_credited',
]);

function category(kind) {
  if (PURCHASE_KINDS.has(kind)) return 'purchases';
  if (REWARD_KINDS.has(kind)) return 'rewards';
  return 'other';
}

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

// Somma netta per asset (identica alla logica storica di crosscheck.js).
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

// Scompone le ENTRATE (crypto in ingresso) per asset e categoria.
// Ritorna { SYMBOL: { purchases:{total,count,lastDate}, rewards:{...}, other:{...} } }.
function categorizeIncoming(rows) {
  const out = {};
  const add = (sym, cat, amt, date) => {
    if (!sym || FIAT.has(sym) || !(amt > 0)) return;
    const a = (out[sym] ??= {
      purchases: { total: 0, count: 0, lastDate: null },
      rewards:   { total: 0, count: 0, lastDate: null },
      other:     { total: 0, count: 0, lastDate: null },
    })[cat];
    a.total += amt;
    a.count += 1;
    if (date && (!a.lastDate || date > a.lastDate)) a.lastDate = date;
  };

  for (const row of rows) {
    const kind = row['Transaction Kind'];
    if (INTERNAL_KINDS.has(kind)) continue;
    const cat = category(kind);
    const date = (row['Timestamp (UTC)'] || '').slice(0, 10);
    add(row['Currency'], cat, parseFloat(row['Amount']), date);
    if (row['To Currency'] !== row['Currency']) {
      add(row['To Currency'], cat, parseFloat(row['To Amount']), date);
    }
  }
  return out;
}

module.exports = {
  INTERNAL_KINDS, FIAT, PURCHASE_KINDS, REWARD_KINDS, category,
  parseCSVLine, parseCSV, calcBalances, categorizeIncoming,
};
