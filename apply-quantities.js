/**
 * apply-quantities.js — Applica modifiche alle quantità sovrane (e avgBuyPrice) di un profilo.
 *
 * UNICO punto di scrittura "da console/a mano" sul portafoglio. Dopo la scrittura lancia
 * reconcileSells (come fa sync-app.js) così un eventuale CALO di quantity arma il cooldown
 * anti-frammentazione. Se il simbolo non esiste e viene passata una quantità, crea l'holding.
 *
 *   node apply-quantities.js --profile <nome> --set '<json>' [--json]
 *
 * json = { "BTC": {"quantity":0.0134,"avgBuyPrice":35000}, "ETH": 0.79, ... }
 *        (un numero puro = scorciatoia per {quantity: n})
 */
const fs = require('fs');
const paths = require('./src/paths');
paths.boot();
paths.loadEnv();
const { reconcileSells } = require('./src/sellStateManager');

const START = '===CRYPTO_JSON_START===';
const END   = '===CRYPTO_JSON_END===';

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  const pref = process.argv.find(a => a.startsWith(flag + '='));
  return pref ? pref.slice(flag.length + 1) : null;
}

const isNum = n => typeof n === 'number' && isFinite(n);

function main() {
  const raw = argValue('--set');
  if (!raw) throw new Error('Manca --set <json>');
  const parsed = JSON.parse(raw);

  const updates = {};
  for (const [sym, v] of Object.entries(parsed)) {
    updates[sym] = (typeof v === 'number') ? { quantity: v } : (v || {});
  }

  const pfPath = paths.portfolioPath();
  const pf = JSON.parse(fs.readFileSync(pfPath, 'utf-8'));
  const bySym = new Map(pf.holdings.map(h => [h.symbol, h]));

  const applied = [], created = [];
  for (const [sym, u] of Object.entries(updates)) {
    if (u.quantity != null && (!isNum(u.quantity) || u.quantity < 0)) {
      throw new Error(`Quantità non valida per ${sym}: ${u.quantity}`);
    }
    if (u.avgBuyPrice != null && (!isNum(u.avgBuyPrice) || u.avgBuyPrice < 0)) {
      throw new Error(`avgBuyPrice non valido per ${sym}: ${u.avgBuyPrice}`);
    }

    let h = bySym.get(sym);
    if (!h) {
      if (u.quantity == null) throw new Error(`Nuovo asset ${sym}: serve la quantità`);
      h = {
        symbol: sym, name: u.name || sym, quantity: u.quantity,
        avgBuyPrice: u.avgBuyPrice ?? null, valueAtSnapshot: 0,
        availableForTrading: u.quantity, notes: 'Aggiunto da crypto-console.',
      };
      pf.holdings.push(h);
      bySym.set(sym, h);
      created.push({ symbol: sym, quantity: u.quantity, avgBuyPrice: h.avgBuyPrice });
      continue;
    }
    const rec = { symbol: sym };
    if (u.quantity != null)    { rec.fromQuantity = h.quantity;    rec.toQuantity = u.quantity;    h.quantity = u.quantity; }
    if (u.avgBuyPrice != null) { rec.fromAvg = h.avgBuyPrice;      rec.toAvg = u.avgBuyPrice;       h.avgBuyPrice = u.avgBuyPrice; }
    if (Object.keys(rec).length > 1) applied.push(rec);
  }

  pf.updatedAt = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(pfPath, JSON.stringify(pf, null, 2), 'utf-8');

  // Come sync-app: deriva le vendite reali dal calo di quantity (arma cooldown/re-arm).
  const detectedSells = reconcileSells(pf);

  const payload = {
    profile: paths.getActiveProfile(),
    appliedAt: new Date().toISOString(),
    applied, created, detectedSells,
    portfolio: pf,
  };
  process.stdout.write(`\n${START}\n${JSON.stringify(payload)}\n${END}\n`);
}

try { main(); }
catch (err) {
  process.stdout.write(`\n${START}\n${JSON.stringify({ error: err.message })}\n${END}\n`);
  process.exit(1);
}
