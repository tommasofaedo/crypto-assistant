/**
 * sellStateManager.js — Deriva automaticamente il registro delle vendite reali
 * (data/sellState.json) dai cali di `quantity` nel portafoglio, così l'anti-frammentazione
 * (cooldown + re-arm in aiAdvisor.js) non dipende più da un aggiornamento manuale.
 *
 * Perché il CALO DI QUANTITY e non di availableForTrading:
 *  - `quantity` = totale reale (staking incluso). Cala SOLO per una vendita/uscita reale.
 *  - `availableForTrading` cala anche mettendo in staking (non è una vendita) → falso positivo.
 * Quindi confrontiamo la quantity attuale con l'ultima vista (`lastKnownQuantity`): se è
 * scesa, è una presa-profitto/uscita → registriamo `lastSellDate`.
 *
 * Nota onesta: la data registrata è quella della RICONCILIAZIONE (quando si nota il calo),
 * non necessariamente il giorno esatto della vendita. È una stima; resta possibile
 * l'override manuale di `lastSellDate` in data/sellState.json per precisione.
 */
const fs = require('fs');
const path = require('path');

const SELL_STATE_PATH = path.join(__dirname, '..', 'data', 'sellState.json');
const EPS = 1e-8;

function loadSellStateFile(fp = SELL_STATE_PATH) {
  try {
    const parsed = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    if (!parsed.sells) parsed.sells = {};
    return parsed;
  } catch {
    return { sells: {} };
  }
}

/**
 * Riconcilia sellState con lo stato attuale del portafoglio.
 *  - Prima volta che si vede un simbolo → memorizza lastKnownQuantity (nessuna vendita dedotta).
 *  - quantity < lastKnownQuantity → vendita: set lastSellDate = oggi (o nowDate passato).
 *  - Aggiorna sempre lastKnownQuantity al valore corrente.
 * Scrive il file solo se qualcosa è cambiato. Ritorna l'elenco delle vendite rilevate.
 *
 * @param {{holdings: {symbol:string, quantity:number}[]}} portfolio
 * @param {{nowDate?: string, filePath?: string}} [opts]  nowDate = 'YYYY-MM-DD'
 * @returns {{symbol:string, from:number, to:number, date:string}[]}
 */
function reconcileSells(portfolio, opts = {}) {
  const fp = opts.filePath ?? SELL_STATE_PATH;
  const today = opts.nowDate ?? new Date().toISOString().slice(0, 10);
  const state = loadSellStateFile(fp);
  const sells = state.sells;
  const detected = [];
  let changed = false;

  for (const h of portfolio.holdings ?? []) {
    const rec = sells[h.symbol] ?? (sells[h.symbol] = {});
    const cur = h.quantity;
    if (cur == null) continue;
    const prev = rec.lastKnownQuantity;

    if (prev == null) {
      rec.lastKnownQuantity = cur; // seed iniziale, nessuna deduzione
      changed = true;
      continue;
    }
    if (cur < prev - EPS) {
      rec.lastSellDate = today;
      detected.push({ symbol: h.symbol, from: prev, to: cur, date: today });
      changed = true;
    }
    if (Math.abs(cur - prev) > EPS) {
      rec.lastKnownQuantity = cur;
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(fp, JSON.stringify(state, null, 2) + '\n', 'utf-8');
  }
  return detected;
}

module.exports = { reconcileSells, loadSellStateFile, SELL_STATE_PATH };
