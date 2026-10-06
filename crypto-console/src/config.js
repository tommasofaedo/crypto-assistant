const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');

function load() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error('config.json mancante — copia config.example.json in config.json e sistema enginePath.');
  }
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  const enginePath = path.resolve(ROOT, cfg.enginePath);
  const dataDir = path.join(enginePath, 'data', 'profiles');
  if (!fs.existsSync(enginePath)) throw new Error(`enginePath inesistente: ${enginePath}`);
  if (!fs.existsSync(dataDir))    throw new Error(`Cartella profili inesistente: ${dataDir}`);
  return { enginePath, dataDir, port: cfg.port || 4319 };
}

module.exports = { load };
