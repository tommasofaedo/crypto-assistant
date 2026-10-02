/**
 * paths.js — Risoluzione centralizzata dei percorsi dati, PER-PROFILO (multi-utente).
 *
 * Multi-utente: ogni utente Crypto.com = un "profilo" con il PROPRIO stato ISOLATO in
 * data/profiles/<nome>/ (portfolio.json, sellState.json, history.json, crypto_transactions.csv,
 * .env con le sue credenziali). I SETTAGGI (strategy.json, watchlist.json) restano CONDIVISI
 * in data/ — stessa postura di rischio/valutazione per tutti.
 *
 * Anti-confusione (requisito chiave):
 *  - Nessun file mutabile condiviso tra profili → impossibile scrivere nel wallet sbagliato.
 *  - Selezione del profilo ESPLICITA: niente default silenzioso. L'unica scorciatoia è
 *    l'auto-selezione quando esiste UN SOLO profilo (non ambiguo). Con 0 o >1 profili e
 *    nessuna selezione esplicita → errore.
 *  - Il profilo attivo si fissa UNA volta per run (boot/setActiveProfile). L'orchestratore
 *    multi-profilo (futuro) deve girare i profili in SEQUENZA, un profilo per volta.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SHARED_DATA_DIR = path.join(ROOT, 'data');          // settaggi condivisi
const PROFILES_DIR = path.join(SHARED_DATA_DIR, 'profiles'); // stato per-profilo

let activeProfile = null;

// Elenco dei profili esistenti (sottocartelle di data/profiles/).
function listProfiles() {
  try {
    return fs.readdirSync(PROFILES_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort();
  } catch {
    return [];
  }
}

// Estrae `--profile <nome>` | `--profile=<nome>` | `-p <nome>` da argv e lo RIMUOVE in-place,
// così il parsing posizionale dei singoli script (es. il budget in agent.js) non viene disturbato.
function extractProfileArg(argv = process.argv) {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--profile' || a === '-p') {
      const val = argv[i + 1];
      argv.splice(i, 2);
      return val;
    }
    const m = /^--profile=(.+)$/.exec(a);
    if (m) { argv.splice(i, 1); return m[1]; }
  }
  return null;
}

// Decide quale profilo usare. Priorità: esplicito > env PROFILE > unico profilo esistente.
// 0 o >1 profili senza selezione esplicita → errore (nessun default silenzioso).
function resolveProfile(explicit) {
  const chosen = explicit || process.env.PROFILE || null;
  const available = listProfiles();

  if (chosen) {
    if (!available.includes(chosen)) {
      throw new Error(
        `Profilo "${chosen}" inesistente. Disponibili: ${available.join(', ') || '(nessuno)'}.\n` +
        `Crea data/profiles/${chosen}/ con il suo portfolio.json, oppure scegline uno esistente.`);
    }
    return chosen;
  }
  if (available.length === 1) return available[0]; // unico = non ambiguo → auto-selezione sicura
  if (available.length === 0) {
    throw new Error(
      `Nessun profilo in ${PROFILES_DIR}. Crea data/profiles/<nome>/ con il suo portfolio.json.`);
  }
  throw new Error(
    `Più profili disponibili (${available.join(', ')}): specifica quale con --profile <nome> ` +
    `(o PROFILE=<nome>). Nessun default, per non agire sul portafoglio sbagliato.`);
}

// Fissa esplicitamente il profilo attivo (validandolo). Ritorna il nome risolto.
function setActiveProfile(name) {
  activeProfile = resolveProfile(name);
  return activeProfile;
}

// Profilo attivo; se non ancora fissato lo risolve in modo pigro (env/auto-singolo).
function getActiveProfile() {
  if (!activeProfile) activeProfile = resolveProfile(null);
  return activeProfile;
}

// Boot per gli entry point: estrae --profile da argv, fissa il profilo attivo, lo ritorna.
function boot(argv = process.argv) {
  return setActiveProfile(extractProfileArg(argv));
}

// Carica le variabili d'ambiente: prima il .env del profilo (vince: credenziali CDC,
// TELEGRAM_CHAT_ID dell'utente), poi il .env di root (default condivisi: bot token, API key AI).
// dotenv non sovrascrive variabili già impostate → il profilo ha la precedenza.
function loadEnv() {
  const dotenv = require('dotenv');
  const pe = envPath();
  if (fs.existsSync(pe)) dotenv.config({ path: pe });
  dotenv.config({ path: path.join(ROOT, '.env') });
}

function profileDir() {
  return path.join(PROFILES_DIR, getActiveProfile());
}

// Per-profilo (stato isolato)
const portfolioPath = () => path.join(profileDir(), 'portfolio.json');
const sellStatePath = () => path.join(profileDir(), 'sellState.json');
const historyPath   = () => path.join(profileDir(), 'history.json');
const csvPath       = () => path.join(profileDir(), 'crypto_transactions.csv');
const envPath       = () => path.join(profileDir(), '.env');

// Condivisi (settaggi identici per tutti i profili)
const strategyPath  = () => path.join(SHARED_DATA_DIR, 'strategy.json');
const watchlistPath = () => path.join(SHARED_DATA_DIR, 'watchlist.json');

module.exports = {
  SHARED_DATA_DIR, PROFILES_DIR,
  listProfiles, resolveProfile, setActiveProfile, getActiveProfile, boot, extractProfileArg, loadEnv,
  profileDir, portfolioPath, sellStatePath, historyPath, csvPath, envPath,
  strategyPath, watchlistPath,
};
