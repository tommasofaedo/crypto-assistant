/**
 * set-meta.js — Legge/scrive i metadati "anagrafici" di un profilo in meta.json.
 *
 * meta.json NON contiene dati finanziari né credenziali: solo come MOSTRARE e ORGANIZZARE il
 * profilo nella console multi-utente — nome leggibile (displayName), nota libera, tag per
 * raggruppare, flag archiviato. Vive accanto a portfolio.json così viaggia col profilo (backup)
 * e un domani il bot Telegram può usare il nome leggibile nei report. displayName è PII di un
 * cliente: per i profili diversi da "tommaso" meta.json è gitignorato (vedi .gitignore), come
 * gli altri file del profilo.
 *
 *   node set-meta.js --profile <nome> --get --json
 *   node set-meta.js --profile <nome> --set '{"displayName":"Ilaria Rosolen","tags":["cliente"],"archived":false}' --json
 *
 * --set fa un MERGE PARZIALE: tocca solo le chiavi presenti (così la console può salvare il solo
 * toggle "archiviato" senza cancellare nota o tag). Il file viene creato alla prima scrittura.
 */
const fs = require('fs');
const path = require('path');
const { PROFILES_DIR, listProfiles } = require('./src/paths');

const START = '===CRYPTO_JSON_START===';
const END   = '===CRYPTO_JSON_END===';

const MAX_NAME = 80, MAX_NOTE = 500, MAX_TAGS = 20, MAX_TAG = 30;

function argValue(flag, def = null) {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  const pref = process.argv.find(a => a.startsWith(flag + '='));
  return pref ? pref.slice(flag.length + 1) : def;
}

const metaPath = name => path.join(PROFILES_DIR, name, 'meta.json');

// Legge meta.json con default robusti (campi mancanti/corrotti → valori neutri).
function readMeta(name) {
  try {
    const raw = JSON.parse(fs.readFileSync(metaPath(name), 'utf-8'));
    return {
      displayName: typeof raw.displayName === 'string' ? raw.displayName : '',
      note: typeof raw.note === 'string' ? raw.note : '',
      tags: Array.isArray(raw.tags) ? raw.tags.filter(t => typeof t === 'string') : [],
      archived: raw.archived === true,
      updatedAt: raw.updatedAt || null,
    };
  } catch {
    return { displayName: '', note: '', tags: [], archived: false, updatedAt: null };
  }
}

// Normalizza i tag: trim, scarta i vuoti, deduplica (case-insensitive), applica i tetti.
function normalizeTags(input) {
  if (!Array.isArray(input)) throw new Error('tags deve essere un array di stringhe');
  const seen = new Set();
  const out = [];
  for (const t of input) {
    const s = String(t).trim();
    if (!s) continue;
    if (s.length > MAX_TAG) throw new Error(`tag troppo lungo (max ${MAX_TAG}): "${s}"`);
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  if (out.length > MAX_TAGS) throw new Error(`troppi tag (max ${MAX_TAGS})`);
  return out;
}

function main() {
  const name = argValue('--profile');
  if (!name) throw new Error('Manca --profile <nome>');
  if (!listProfiles().includes(name)) throw new Error(`Profilo "${name}" inesistente`);

  const setArg = argValue('--set');
  if (!setArg) {
    // --get (default): ritorna i metadati correnti (o i default se meta.json non c'è)
    process.stdout.write(`\n${START}\n${JSON.stringify({ profile: name, ...readMeta(name) })}\n${END}\n`);
    return;
  }

  let input;
  try { input = JSON.parse(setArg); }
  catch { throw new Error('--set deve essere JSON valido, es. {"displayName":"...","tags":["cliente"]}'); }
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('--set deve essere un oggetto JSON');
  }

  const meta = readMeta(name); // merge parziale: parto dallo stato attuale

  if ('displayName' in input) {
    const dn = String(input.displayName == null ? '' : input.displayName).trim();
    if (dn.length > MAX_NAME) throw new Error(`displayName troppo lungo (max ${MAX_NAME})`);
    meta.displayName = dn;
  }
  if ('note' in input) {
    const n = String(input.note == null ? '' : input.note);
    if (n.length > MAX_NOTE) throw new Error(`note troppo lunga (max ${MAX_NOTE})`);
    meta.note = n;
  }
  if ('tags' in input) meta.tags = normalizeTags(input.tags);
  if ('archived' in input) {
    if (typeof input.archived !== 'boolean') throw new Error('archived deve essere true/false');
    meta.archived = input.archived;
  }

  meta.updatedAt = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(metaPath(name), JSON.stringify(meta, null, 2) + '\n', 'utf-8');

  process.stdout.write(`\n${START}\n${JSON.stringify({ profile: name, saved: true, ...meta })}\n${END}\n`);
}

try { main(); }
catch (err) {
  process.stdout.write(`\n${START}\n${JSON.stringify({ error: err.message })}\n${END}\n`);
  process.exit(1);
}
