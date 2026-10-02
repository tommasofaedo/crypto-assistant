/**
 * create-profile.js — Crea un nuovo profilo (cartella + portfolio.json vuoto + .env template).
 *
 *   node create-profile.js --name <nome> [--currency EUR] [--json]
 *
 * Non imposta un profilo attivo (lo sta creando). Il .env va poi compilato con le API key
 * Crypto.com dell'utente e il suo TELEGRAM_CHAT_ID. I file finanziari dei profili diversi da
 * "tommaso" sono esclusi dal repo pubblico (vedi .gitignore).
 */
const fs = require('fs');
const path = require('path');
const { PROFILES_DIR } = require('./src/paths');

const START = '===CRYPTO_JSON_START===';
const END   = '===CRYPTO_JSON_END===';

function argValue(flag, def = null) {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  const pref = process.argv.find(a => a.startsWith(flag + '='));
  return pref ? pref.slice(flag.length + 1) : def;
}

const ENV_TEMPLATE = `# Credenziali Crypto.com App di questo utente (sola lettura saldi) — per sync-app
CDC_API_KEY=
CDC_API_SECRET=
# Chat Telegram dell'utente (per i report push di telegram-report-all.js)
TELEGRAM_CHAT_ID=
# Budget giornaliero in € usato nei consigli push (0 = nessun acquisto proposto)
TELEGRAM_BUDGET=0
# Interattivo (/analisi a comando): true solo per l'operatore (i clienti sono push-only)
TELEGRAM_INTERACTIVE=false
`;

function main() {
  const name = argValue('--name');
  const currency = argValue('--currency', 'EUR');

  if (!name) throw new Error('Manca --name <nome>');
  if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new Error(`Nome non valido: "${name}" (ammessi lettere, numeri, _ e -)`);
  if (name.startsWith('_')) throw new Error('Il nome non può iniziare con "_" (riservato ai profili temporanei)');

  const dir = path.join(PROFILES_DIR, name);
  if (fs.existsSync(dir)) throw new Error(`Profilo "${name}" già esistente`);

  fs.mkdirSync(dir, { recursive: true });

  const portfolio = {
    updatedAt: new Date().toISOString().slice(0, 10),
    currency,
    holdings: [],
    source: 'console',
  };
  fs.writeFileSync(path.join(dir, 'portfolio.json'), JSON.stringify(portfolio, null, 2), 'utf-8');
  fs.writeFileSync(path.join(dir, '.env'), ENV_TEMPLATE, 'utf-8');

  const payload = {
    created: name,
    path: dir,
    nextSteps: [
      `Compila data/profiles/${name}/.env con le API key Crypto.com e il TELEGRAM_CHAT_ID`,
      `Poi: node sync-app.js --profile ${name} (saldi live), oppure aggiungi gli asset dalla console`,
    ],
  };
  process.stdout.write(`\n${START}\n${JSON.stringify(payload)}\n${END}\n`);
}

try { main(); }
catch (err) {
  process.stdout.write(`\n${START}\n${JSON.stringify({ error: err.message })}\n${END}\n`);
  process.exit(1);
}
