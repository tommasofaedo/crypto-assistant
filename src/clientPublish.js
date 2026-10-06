/**
 * clientPublish.js — Pubblica il portfolio.json di un profilo CLIENTE nel repo privato
 * `crypto-assistant-clients`, da cui GitHub Actions genera il push giornaliero (anche a PC spento).
 *
 * Perché: il motore (repo PUBBLICO) non può ospitare i dati dei clienti; il cloud per i clienti
 * vive in un repo privato separato. Quando il portafoglio di un cliente cambia in locale (sync-app
 * o apply-quantities), va rispinto lì o il cloud resterebbe sui numeri vecchi.
 *
 * Regole:
 *  - L'OPERATORE (OPERATOR_PROFILE, default "tommaso") è ESCLUSO: ha il suo report dal repo pubblico.
 *  - Pubblica SOLO portfolio.json (NON il .env: le credenziali CDC non devono finire nel repo clienti).
 *  - NON FATALE: clone mancante / offline / push rifiutato → avviso su stderr, il sync non si blocca.
 *  - Il clone locale del repo privato è atteso in ../crypto-assistant-clients (override: CLIENTS_REPO_DIR).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const paths = require('./paths');

const OPERATOR = process.env.OPERATOR_PROFILE || 'tommaso';
const log = (msg) => process.stderr.write(msg + '\n'); // stderr: non sporca lo stdout (marker JSON console)

function clientsRepoDir() {
  return process.env.CLIENTS_REPO_DIR
    || path.join(__dirname, '..', '..', 'crypto-assistant-clients');
}

function publishClientProfile(profileName) {
  const profile = profileName || paths.getActiveProfile();
  if (profile === OPERATOR || profile.startsWith('_')) return { skipped: 'operator' };

  const repo = clientsRepoDir();
  if (!fs.existsSync(path.join(repo, '.git'))) {
    log(`\n⚠️  Cloud clienti NON aggiornato: clone non trovato in ${repo}\n` +
        `   Clona una volta: git clone https://github.com/tommasofaedo/crypto-assistant-clients.git "${repo}"`);
    return { skipped: 'no-clone' };
  }

  const src = paths.portfolioPath();
  const destDir = path.join(repo, 'profiles', profile);
  const relFile = `profiles/${profile}/portfolio.json`;
  const git = (cmd) => execSync(`git ${cmd}`, { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });

  try {
    try { git('pull --rebase --autostash -q'); } catch { /* offline/niente upstream: si tenta comunque il push */ }

    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(src, path.join(destDir, 'portfolio.json'));

    const dirty = execSync('git status --porcelain', { cwd: repo, encoding: 'utf-8' }).trim();
    if (!dirty) { log(`\n☁️  Cloud clienti già allineato (${profile}): niente da pubblicare.`); return { skipped: 'nochange' }; }

    git(`add "${relFile}"`);
    git(`-c commit.gpgsign=false commit -q -m "sync ${profile}: portfolio ${new Date().toISOString().slice(0, 10)}"`);
    git('push -q');
    log(`\n☁️  Pubblicato su cloud clienti: ${relFile} (push OK).`);
    return { published: true };
  } catch (e) {
    const first = String(e.stderr || e.message).split('\n').find(Boolean) || e.message;
    log(`\n⚠️  Pubblicazione cloud clienti FALLITA (${profile}): ${first}\n` +
        `   Il file locale è salvato. Ripubblica a mano nel repo ${repo} o riprova il sync.`);
    return { error: first };
  }
}

module.exports = { publishClientProfile, clientsRepoDir };
