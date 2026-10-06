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

// Metadati anagrafici (display): nome leggibile, nota, tag, archiviato. Le scritture passano dal
// motore (set-meta.js); qui è sola lettura, con default neutri se meta.json manca o è corrotto.
function readMeta(dataDir, name) {
  const m = readJson(path.join(dataDir, safeName(name), 'meta.json'), {});
  return {
    displayName: typeof m.displayName === 'string' ? m.displayName : '',
    note: typeof m.note === 'string' ? m.note : '',
    tags: Array.isArray(m.tags) ? m.tags.filter(t => typeof t === 'string') : [],
    archived: m.archived === true,
    updatedAt: m.updatedAt || null,
  };
}

// Solo PRESENZA della chat Telegram (booleano) per il badge in Home: legge il .env del profilo
// ma NON espone il chat_id né altre credenziali al frontend (le credenziali non transitano).
function telegramConfigured(dataDir, name) {
  try {
    const raw = fs.readFileSync(path.join(dataDir, safeName(name), '.env'), 'utf-8');
    const m = /^\s*TELEGRAM_CHAT_ID\s*=\s*(.*)$/m.exec(raw);
    return !!(m && m[1].trim());
  } catch {
    return false;
  }
}

// Riassunto leggero per la home (nessuna chiamata di rete): usa valueAtSnapshot e l'ultimo snapshot.
// Include i metadati anagrafici così la Home può mostrare nome leggibile, tag e stato archiviato.
function summary(dataDir, name) {
  const pf = readPortfolio(dataDir, name);
  const hist = readJson(path.join(dataDir, safeName(name), 'history.json'), []);
  const lastDate = Array.isArray(hist) && hist.length ? hist[hist.length - 1].date : null;
  const assets = pf?.holdings?.length ?? 0;
  const snapshotValue = (pf?.holdings ?? []).reduce((s, h) => s + (h.valueAtSnapshot || 0), 0);
  const meta = readMeta(dataDir, name);
  return {
    name,
    displayName: meta.displayName,
    tags: meta.tags,
    archived: meta.archived,
    telegramConfigured: telegramConfigured(dataDir, name),
    assets,
    snapshotValue,
    updatedAt: pf?.updatedAt ?? null,
    lastRun: lastDate,
  };
}

module.exports = { safeName, list, assertExists, readPortfolio, readHistory, readMeta, summary };
