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

module.exports = { report, sync, reconcile };
