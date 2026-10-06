const { spawn } = require('child_process');
const path = require('path');

// Invoca il motore crypto_assistant come SOTTOPROCESSO (un processo = un profilo).
// Così non c'è stato condiviso tra profili: impossibile mescolarli, e un crash è isolato.

const START = '===CRYPTO_JSON_START===';
const END   = '===CRYPTO_JSON_END===';

function run(enginePath, scriptRel, args) {
  return new Promise((resolve) => {
    const script = path.join(enginePath, scriptRel);
    const child = spawn('node', [script, ...args], { cwd: enginePath, env: process.env });
    let out = '', err = '';
    child.stdout.on('data', d => (out += d));
    child.stderr.on('data', d => (err += d));
    child.on('error', e => resolve({ code: -1, out, err: err + e.message }));
    child.on('close', code => resolve({ code, out, err }));
  });
}

function extractJson(out) {
  const i = out.indexOf(START), j = out.indexOf(END);
  if (i < 0 || j < 0) throw new Error('Output JSON non trovato nell\'uscita del motore');
  return JSON.parse(out.slice(i + START.length, j).trim());
}

// Consiglio per-profilo: run fresca del motore → JSON { holdings, report, ... }.
async function report(enginePath, profile, { budget = 0, ai = true } = {}) {
  const args = ['--profile', profile];
  if (budget) args.push(String(budget));
  if (!ai) args.push('--no-ai');
  const { code, out, err } = await run(enginePath, 'report-json.js', args);
  const data = extractJson(out);
  if (data.error) throw new Error(data.error);
  if (code !== 0) throw new Error(`report-json uscito con codice ${code}: ${err.slice(-500)}`);
  return data;
}

// Sincronizza i saldi live dall'App per il profilo. Ritorna il log (stdout+stderr) per il display.
async function sync(enginePath, profile) {
  const { code, out, err } = await run(enginePath, 'sync-app.js', ['--profile', profile]);
  return { ok: code === 0, log: (out + err).trim() };
}

// Riconciliazione CSV ↔ sovrano (SOLA LETTURA): proposta delta, nessuna scrittura.
async function reconcile(enginePath, profile, csvFile) {
  const { code, out, err } = await run(enginePath, 'reconcile.js', ['--profile', profile, '--csv', csvFile, '--json']);
  const data = extractJson(out);
  if (data.error) throw new Error(data.error);
  if (code !== 0) throw new Error(`reconcile uscito con codice ${code}: ${err.slice(-500)}`);
  return data;
}

// SCRITTURA: applica quantità/avgBuyPrice (+ reconcileSells nel motore). updates = { SYM: {quantity,avgBuyPrice} | n }.
async function applyQuantities(enginePath, profile, updates) {
  const { code, out, err } = await run(enginePath, 'apply-quantities.js',
    ['--profile', profile, '--set', JSON.stringify(updates), '--json']);
  const data = extractJson(out);
  if (data.error) throw new Error(data.error);
  if (code !== 0) throw new Error(`apply-quantities uscito con codice ${code}: ${err.slice(-500)}`);
  return data;
}

// Legge le impostazioni Telegram del profilo (chat_id, budget) dal suo .env.
async function telegramGet(enginePath, profile) {
  const { code, out, err } = await run(enginePath, 'set-telegram.js', ['--profile', profile, '--get', '--json']);
  const data = extractJson(out);
  if (data.error) throw new Error(data.error);
  if (code !== 0) throw new Error(`set-telegram uscito con codice ${code}: ${err.slice(-500)}`);
  return data;
}

// SCRITTURA: aggiorna chat_id/budget Telegram del profilo nel suo .env (non tocca le API key).
async function telegramSet(enginePath, profile, settings) {
  const { code, out, err } = await run(enginePath, 'set-telegram.js',
    ['--profile', profile, '--set', JSON.stringify(settings), '--json']);
  const data = extractJson(out);
  if (data.error) throw new Error(data.error);
  if (code !== 0) throw new Error(`set-telegram uscito con codice ${code}: ${err.slice(-500)}`);
  return data;
}

// SCRITTURA: crea un nuovo profilo (cartella + portfolio vuoto + .env template).
async function createProfile(enginePath, name) {
  const { code, out, err } = await run(enginePath, 'create-profile.js', ['--name', name, '--json']);
  const data = extractJson(out);
  if (data.error) throw new Error(data.error);
  if (code !== 0) throw new Error(`create-profile uscito con codice ${code}: ${err.slice(-500)}`);
  return data;
}

// Legge i metadati anagrafici del profilo (displayName, note, tags, archived) da meta.json.
async function metaGet(enginePath, profile) {
  const { code, out, err } = await run(enginePath, 'set-meta.js', ['--profile', profile, '--get', '--json']);
  const data = extractJson(out);
  if (data.error) throw new Error(data.error);
  if (code !== 0) throw new Error(`set-meta uscito con codice ${code}: ${err.slice(-500)}`);
  return data;
}

// SCRITTURA: aggiorna i metadati del profilo in meta.json (merge parziale lato motore).
async function metaSet(enginePath, profile, settings) {
  const { code, out, err } = await run(enginePath, 'set-meta.js',
    ['--profile', profile, '--set', JSON.stringify(settings), '--json']);
  const data = extractJson(out);
  if (data.error) throw new Error(data.error);
  if (code !== 0) throw new Error(`set-meta uscito con codice ${code}: ${err.slice(-500)}`);
  return data;
}

module.exports = { report, sync, reconcile, applyQuantities, telegramGet, telegramSet, createProfile, metaGet, metaSet };
