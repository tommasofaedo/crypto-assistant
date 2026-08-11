/**
 * sync-app.js — Sincronizza le quantità dal wallet Crypto.com APP (non Exchange).
 *
 * Filosofia (concordata):
 *  - `quantity` = TOTALE reale (staking incluso). È la base del motore ed è SOVRANO:
 *    lo modifichi tu a voce ("aggiungi 0.01 BTC") o a mano. Non viene MAI ridotto in
 *    automatico da questo script.
 *  - `availableForTrading` = quanto è davvero vendibile ORA sull'App (letto live).
 *    Serve al mandato prese-profitto: non puoi vendere ciò che è in staking.
 *
 * Regole di reconciliation:
 *  - availableForTrading viene sempre aggiornato al valore live (0 se l'asset non è nel wallet).
 *  - Se available > quantity registrata → alza quantity ad available (hai acquistato di più),
 *    e lo SEGNALA. Non abbassa mai quantity da solo.
 *  - Nuovi token nel wallet sopra soglia (default €1) non presenti in portfolio.json vengono
 *    aggiunti (quantity = available, avgBuyPrice = null), da rivedere a mano.
 *
 * Legge le credenziali CDC_API_KEY / CDC_API_SECRET dal .env, tramite lo script ufficiale
 * della skill crypto-com-app (npx tsx .../account.ts balances all).
 */
require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const PORTFOLIO_PATH = path.join(__dirname, 'data', 'portfolio.json');
const SKILL_DIR = process.env.CDC_APP_SKILL_DIR
  || path.join(os.homedir(), '.claude', 'skills', 'crypto-com-app');
const ACCOUNT_SCRIPT = path.join(SKILL_DIR, 'scripts', 'account.ts');
const NEW_TOKEN_MIN_EUR = parseFloat(process.env.CDC_NEW_TOKEN_MIN_EUR ?? '1');
const EPS = 1e-8;

function readAppWallet() {
  if (!process.env.CDC_API_KEY || !process.env.CDC_API_SECRET) {
    throw new Error('CDC_API_KEY / CDC_API_SECRET mancanti nel .env');
  }
  if (!fs.existsSync(ACCOUNT_SCRIPT)) {
    throw new Error(`Script skill non trovato: ${ACCOUNT_SCRIPT}\n` +
      `Imposta CDC_APP_SKILL_DIR se la skill è altrove.`);
  }

  const raw = execSync(`npx tsx "${ACCOUNT_SCRIPT}" balances all`, {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'inherit'],
    env: process.env,
  });

  // Estrae il JSON (ignora eventuali righe di log prima della prima graffa).
  const start = raw.indexOf('{');
  if (start === -1) throw new Error(`Output non-JSON dallo script skill:\n${raw}`);
  const parsed = JSON.parse(raw.slice(start));
  if (!parsed.ok) throw new Error(`Skill error: ${parsed.error} — ${parsed.error_message}`);

  const wallets = parsed.data?.crypto?.wallets ?? [];
  const map = new Map();
  for (const w of wallets) {
    map.set(w.currency, {
      available: parseFloat(w.available?.amount ?? w.balance?.amount ?? '0'),
      eur: parseFloat(w.native_available?.amount ?? w.native_balance?.amount ?? '0'),
    });
  }
  return { map, allocation: parsed.data?.portfolio_allocation ?? [] };
}

function main() {
  console.log('Lettura wallet Crypto.com APP (solo lettura)...\n');
  const { map, allocation } = readAppWallet();

  const portfolio = JSON.parse(fs.readFileSync(PORTFOLIO_PATH, 'utf-8'));
  const known = new Set(portfolio.holdings.map(h => h.symbol));
  const bumped = [];
  const zeroed = [];

  for (const h of portfolio.holdings) {
    const live = map.get(h.symbol);
    const available = live ? live.available : 0;
    h.availableForTrading = available;

    if (available > h.quantity + EPS) {
      bumped.push({ symbol: h.symbol, from: h.quantity, to: available });
      h.quantity = available; // solo verso l'alto
    }
    if (available === 0) zeroed.push(h.symbol);
  }

  // Nuovi token nel wallet sopra soglia, non ancora in portfolio.json
  const added = [];
  for (const [symbol, live] of map.entries()) {
    if (known.has(symbol)) continue;
    if (live.eur < NEW_TOKEN_MIN_EUR) continue;
    portfolio.holdings.push({
      symbol,
      name: symbol,
      quantity: live.available,
      avgBuyPrice: null,
      valueAtSnapshot: live.eur,
      availableForTrading: live.available,
      notes: 'Auto-aggiunto da sync App — rivedere avgBuyPrice a mano.',
    });
    added.push({ symbol, qty: live.available, eur: live.eur });
  }

  portfolio.updatedAt = new Date().toISOString().slice(0, 10);
  portfolio.source = 'crypto.com-app';
  fs.writeFileSync(PORTFOLIO_PATH, JSON.stringify(portfolio, null, 2), 'utf-8');

  // Report
  console.log('Disponibile per trading (live App):');
  for (const h of portfolio.holdings) {
    const staked = Math.max(0, h.quantity - (h.availableForTrading ?? 0));
    const stakeNote = staked > EPS ? `  (in staking/bloccato: ${staked.toFixed(8)})` : '';
    console.log(`  ${h.symbol.padEnd(8)} avail ${String(h.availableForTrading ?? 0).padEnd(16)} / tot ${h.quantity}${stakeNote}`);
  }

  if (bumped.length) {
    console.log('\n⬆️  Quantità ALZATE (disponibile > totale registrato):');
    bumped.forEach(b => console.log(`  ${b.symbol}: ${b.from} → ${b.to}`));
  }
  if (added.length) {
    console.log('\n🆕 Nuovi token aggiunti (rivedere avgBuyPrice):');
    added.forEach(a => console.log(`  ${a.symbol}: ${a.qty} (~€${a.eur})`));
  }
  if (zeroed.length) {
    console.log(`\nℹ️  0 disponibile per trading (tutto in staking o assente): ${zeroed.join(', ')}`);
  }

  const total = allocation.reduce((s, p) => s + parseFloat(p.price_native?.amount ?? 0), 0);
  console.log(`\nValore totale portafoglio (tutti i prodotti): ~€${total.toFixed(2)}`);
  console.log(`Salvato: ${PORTFOLIO_PATH}`);
  console.log('\nNota: `quantity` (totale) resta SOVRANO e modificabile a mano/a voce.');
}

try {
  main();
} catch (err) {
  console.error('\nErrore:', err.message);
  process.exit(1);
}
