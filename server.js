const express = require('express');
const multer = require('multer');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { load } = require('./src/config');
const profiles = require('./src/profiles');
const engine = require('./src/engine');

const cfg = load();
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Upload CSV in una cartella temporanea del sistema (max 15 MB). Il file viene letto dal
// motore (reconcile) e poi cancellato: la console non persiste nulla.
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 15 * 1024 * 1024 } });

// Lock per-profilo: una sola operazione di scrittura/run alla volta per profilo
// (evita collisioni tra richieste e col bot PM2 che scrive lo stesso history.json).
const locks = new Set();
async function withLock(name, fn) {
  if (locks.has(name)) {
    const e = new Error(`Operazione già in corso sul profilo ${name}`);
    e.status = 409;
    throw e;
  }
  locks.add(name);
  try { return await fn(); } finally { locks.delete(name); }
}

const wrap = fn => (req, res) => fn(req, res).catch(err => {
  res.status(err.status || 500).json({ error: err.message });
});

// Elenco profili con riassunto leggero (nessuna rete).
app.get('/api/profiles', wrap(async (_req, res) => {
  const names = profiles.list(cfg.dataDir);
  res.json({ profiles: names.map(n => profiles.summary(cfg.dataDir, n)) });
}));

// Dettaglio profilo: portafoglio (quantità sovrane) + ultimi snapshot.
app.get('/api/profiles/:p', wrap(async (req, res) => {
  const name = profiles.assertExists(cfg.dataDir, req.params.p);
  res.json({
    name,
    portfolio: profiles.readPortfolio(cfg.dataDir, name),
    history: profiles.readHistory(cfg.dataDir, name),
  });
}));

// Analisi: run fresca del motore (rispetta "mai reco a mano" — è sempre output del codice).
app.post('/api/profiles/:p/analyze', wrap(async (req, res) => {
  const name = profiles.assertExists(cfg.dataDir, req.params.p);
  const budget = Number(req.body?.budget) || 0;
  const ai = req.body?.ai !== false;
  const data = await withLock(name, () => engine.report(cfg.enginePath, name, { budget, ai }));
  res.json(data);
}));

// Sync saldi live dall'App (sola lettura lato Crypto.com; aggiorna availableForTrading).
app.post('/api/profiles/:p/sync', wrap(async (req, res) => {
  const name = profiles.assertExists(cfg.dataDir, req.params.p);
  const result = await withLock(name, () => engine.sync(cfg.enginePath, name));
  res.json({ ...result, portfolio: profiles.readPortfolio(cfg.dataDir, name) });
}));

// Riconciliazione CSV (SOLA LETTURA): upload → reconcile → proposta delta. Nessuna scrittura.
app.post('/api/profiles/:p/csv', upload.single('csv'), wrap(async (req, res) => {
  const name = profiles.assertExists(cfg.dataDir, req.params.p);
  if (!req.file) throw Object.assign(new Error('Nessun file CSV caricato'), { status: 400 });
  try {
    const data = await withLock(name, () => engine.reconcile(cfg.enginePath, name, req.file.path));
    data.uploadedFile = req.file.originalname; // mostra il nome reale, non quello temporaneo di multer
    res.json(data);
  } finally {
    fs.unlink(req.file.path, () => {}); // il file temporaneo non viene mai conservato
  }
}));

// Bind SOLO su loopback: la console non è mai raggiungibile dalla rete.
app.listen(cfg.port, '127.0.0.1', () => {
  console.log(`crypto-console → http://127.0.0.1:${cfg.port}`);
  console.log(`motore: ${cfg.enginePath}`);
  console.log(`profili: ${profiles.list(cfg.dataDir).join(', ') || '(nessuno)'}`);
});
