/**
 * set-telegram.js — Legge/scrive le impostazioni Telegram di un profilo nel suo .env.
 *
 * Tocca SOLO TELEGRAM_CHAT_ID e TELEGRAM_BUDGET: le altre righe del .env (API key Crypto.com,
 * TELEGRAM_INTERACTIVE, commenti) restano intatte. Usato dalla console per dare un campo editabile
 * senza aprire il file a mano. Il chat_id è la destinazione dei report push (telegram-report-all.js).
 *
 *   node set-telegram.js --profile <nome> --get --json
 *   node set-telegram.js --profile <nome> --set '{"chatId":"123456","budget":50}' --json
 *
 * Guardia: un chat_id non può appartenere a due profili (si manderebbero i dati di uno alla chat
 * di un altro) — stessa regola che telegram-report-all.js applica in invio, qui anticipata al salvataggio.
 */
const fs = require('fs');
const path = require('path');
const { PROFILES_DIR, listProfiles, profileEnv } = require('./src/paths');

const START = '===CRYPTO_JSON_START===';
const END   = '===CRYPTO_JSON_END===';

function argValue(flag, def = null) {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  const pref = process.argv.find(a => a.startsWith(flag + '='));
  return pref ? pref.slice(flag.length + 1) : def;
}

// Aggiorna (o inserisce) le chiavi date nel testo .env, preservando ordine, commenti e EOL.
function setEnvVars(filePath, updates) {
  const raw = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  const done = new Set();
  const out = lines.map(line => {
    const m = /^(\s*)([A-Za-z0-9_]+)(\s*)=/.exec(line);
    if (m && Object.prototype.hasOwnProperty.call(updates, m[2])) {
      done.add(m[2]);
      return `${m[2]}=${updates[m[2]]}`;
    }
    return line;
  });
  for (const k of Object.keys(updates)) if (!done.has(k)) out.push(`${k}=${updates[k]}`);
  fs.writeFileSync(filePath, out.join(eol), 'utf-8');
}

function readSettings(name) {
  const env = profileEnv(name);
  return {
    chatId: (env.TELEGRAM_CHAT_ID || '').trim(),
    budget: parseFloat(env.TELEGRAM_BUDGET || '0') || 0,
    interactive: (env.TELEGRAM_INTERACTIVE || 'false').trim() === 'true',
  };
}

function main() {
  const name = argValue('--profile');
  if (!name) throw new Error('Manca --profile <nome>');
  if (!listProfiles().includes(name)) throw new Error(`Profilo "${name}" inesistente`);

  const setArg = argValue('--set');
  if (!setArg) {
    // --get (default): ritorna le impostazioni correnti
    process.stdout.write(`\n${START}\n${JSON.stringify({ profile: name, ...readSettings(name) })}\n${END}\n`);
    return;
  }

  let input;
  try { input = JSON.parse(setArg); }
  catch { throw new Error('--set deve essere JSON valido, es. {"chatId":"123","budget":50}'); }

  const chatId = (input.chatId == null ? '' : String(input.chatId)).trim();
  if (chatId && !/^-?\d+$/.test(chatId)) {
    throw new Error(`chat_id non valido: "${chatId}" (atteso un numero intero, es. 123456789)`);
  }

  // Guardia anti-duplicato: nessun altro profilo deve avere lo stesso chat_id.
  if (chatId) {
    for (const other of listProfiles()) {
      if (other === name) continue;
      if ((profileEnv(other).TELEGRAM_CHAT_ID || '').trim() === chatId) {
        throw new Error(`chat_id ${chatId} già usato dal profilo "${other}" — un chat non può ricevere i dati di due profili`);
      }
    }
  }

  const updates = { TELEGRAM_CHAT_ID: chatId };
  if (input.budget != null) {
    const budget = Number(input.budget);
    if (!Number.isFinite(budget) || budget < 0) throw new Error(`budget non valido: "${input.budget}" (atteso un numero ≥ 0)`);
    updates.TELEGRAM_BUDGET = budget;
  }

  const envFile = path.join(PROFILES_DIR, name, '.env');
  setEnvVars(envFile, updates);

  process.stdout.write(`\n${START}\n${JSON.stringify({ profile: name, saved: true, ...readSettings(name) })}\n${END}\n`);
}

try { main(); }
catch (err) {
  process.stdout.write(`\n${START}\n${JSON.stringify({ error: err.message })}\n${END}\n`);
  process.exit(1);
}
