/**
 * telegram-report-all.js — Push giornaliero dei report ai profili CLIENTE (non l'operatore).
 *
 * Gira in LOCALE (PM2/cron): i dati dei clienti sono gitignorati → non esistono nel checkout
 * GHA, quindi i loro report possono nascere solo qui. L'operatore (tommaso) ha già il suo report
 * via GHA + bot interattivo, quindi viene ESCLUSO da questo giro.
 *
 * Un bot solo (token condiviso in root .env), un chat_id per profilo (nel .env del profilo).
 * Cicla i profili in SEQUENZA (il profilo attivo è globale): un cliente per volta.
 *
 *   node telegram-report-all.js            invia a tutti i clienti con chat configurata
 *   node telegram-report-all.js --local    stampa invece di inviare (dry run)
 *   node telegram-report-all.js --list     elenca solo chi riceverebbe, senza analisi né invio
 */
require('dotenv').config(); // root: TELEGRAM_BOT_TOKEN + ANTHROPIC_API_KEY (condivisi)
const paths = require('./src/paths');
const { runAdvisor } = require('./src/advisor');
const { getTelegramAdvice } = require('./src/aiAdvisor');
const { stripHtml, buildSnapshotMessage, buildRecoMessage, sendTelegram } = require('./src/telegramReport');

const OPERATOR = process.env.OPERATOR_PROFILE || 'tommaso';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const LIST_ONLY = process.argv.includes('--list');
const LOCAL = process.argv.includes('--local');

// Profili cliente con un chat Telegram configurato. Guardia: un chat_id non può appartenere
// a due profili (si manderebbero i dati di uno alla chat di un altro).
function clientTargets() {
  const seen = new Map(); // chatId -> profilo
  const targets = [];
  for (const name of paths.listProfiles()) {
    if (name === OPERATOR || name.startsWith('_')) continue;
    const env = paths.profileEnv(name);
    const chatId = (env.TELEGRAM_CHAT_ID || '').trim();
    if (!chatId) { console.log(`- ${name}: nessun TELEGRAM_CHAT_ID, saltato`); continue; }
    if (seen.has(chatId)) {
      throw new Error(`chat_id ${chatId} duplicato tra i profili "${seen.get(chatId)}" e "${name}" — correggi i .env prima di inviare`);
    }
    seen.set(chatId, name);
    targets.push({ name, chatId, budget: parseFloat(env.TELEGRAM_BUDGET || '0') || 0 });
  }
  return targets;
}

async function main() {
  if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN mancante nel .env di root');

  const targets = clientTargets();
  if (!targets.length) { console.log('Nessun profilo cliente con chat configurata. Nulla da inviare.'); return; }

  if (LIST_ONLY) {
    console.log('Riceverebbero il push:');
    targets.forEach(t => console.log(`  • ${t.name} → chat ${t.chatId} (budget €${t.budget})`));
    return;
  }

  let ok = 0;
  for (const t of targets) {
    console.log(`\n[${t.name}] analisi...`);
    try {
      paths.setActiveProfile(t.name); // profilo attivo = questo cliente (sequenziale)
      const { portfolio, fearGreed, globalMetrics, analyses, watchlistAnalyses } = await runAdvisor();
      const msg1 = buildSnapshotMessage({ portfolio, fearGreed, watchlistAnalyses, budget: t.budget });
      const aiText = await getTelegramAdvice(portfolio, fearGreed, analyses, t.budget, globalMetrics, watchlistAnalyses);
      const msg2 = buildRecoMessage(aiText);

      if (LOCAL) {
        console.log('─'.repeat(55));
        console.log(stripHtml(msg1));
        console.log('─'.repeat(55));
        console.log(stripHtml(msg2));
      } else {
        await sendTelegram(BOT_TOKEN, t.chatId, msg1);
        await sendTelegram(BOT_TOKEN, t.chatId, msg2);
        console.log(`[${t.name}] inviato a ${t.chatId}`);
      }
      ok++;
    } catch (e) {
      console.error(`[${t.name}] errore: ${e.message}`); // un cliente che fallisce non blocca gli altri
    }
  }
  console.log(`\nFatto: ${ok}/${targets.length} profili.`);
}

main().catch(err => { console.error('Errore:', err.message); process.exit(1); });
