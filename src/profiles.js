const fs = require('fs');
const path = require('path');

// Solo lettura dei file di un profilo (display). Le scritture passano dal motore (fasi F2/F3).
// I profili con nome che inizia per "_" sono considerati temporanei/di test e nascosti.

function safeName(name) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9_-]+$/.test(name)) {
    throw new Error(`Nome profilo non valido: ${name}`);
  }
  return name;
}

function list(dataDir) {
  try {
    return fs.readdirSync(dataDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('_'))
      .map(d => d.name)
      .sort();
  } catch {
    return [];
  }
}

function assertExists(dataDir, name) {
  safeName(name);
  if (!list(dataDir).includes(name)) throw new Error(`Profilo inesistente: ${name}`);
  return name;
}

function readJson(fp, fallback) {
  try { return JSON.parse(fs.readFileSync(fp, 'utf-8')); } catch { return fallback; }
}

function readPortfolio(dataDir, name) {
  return readJson(path.join(dataDir, safeName(name), 'portfolio.json'), null);
}

function readHistory(dataDir, name, limit = 60) {
  const all = readJson(path.join(dataDir, safeName(name), 'history.json'), []);
  return Array.isArray(all) ? all.slice(-limit).reverse() : [];
}

// Riassunto leggero per la home (nessuna chiamata di rete): usa valueAtSnapshot e l'ultimo snapshot.
function summary(dataDir, name) {
  const pf = readPortfolio(dataDir, name);
  const hist = readJson(path.join(dataDir, safeName(name), 'history.json'), []);
  const lastDate = Array.isArray(hist) && hist.length ? hist[hist.length - 1].date : null;
  const assets = pf?.holdings?.length ?? 0;
  const snapshotValue = (pf?.holdings ?? []).reduce((s, h) => s + (h.valueAtSnapshot || 0), 0);
  return { name, assets, snapshotValue, updatedAt: pf?.updatedAt ?? null, lastRun: lastDate };
}

module.exports = { safeName, list, assertExists, readPortfolio, readHistory, summary };
