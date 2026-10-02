const paths = require('./src/paths');
// Report dell'operatore (GHA/manuale). Profilo esplicito così non va in ambiguità con i clienti.
paths.setActiveProfile(paths.extractProfileArg(process.argv) || process.env.OPERATOR_PROFILE || 'tommaso');
paths.loadEnv();
const { runAdvisor } = require('./src/advisor');
const { getTelegramAdvice } = require('./src/aiAdvisor');
const { stripHtml, buildSnapshotMessage, buildRecoMessage, sendTelegram } = require('./src/telegramReport');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function main() {
  const args = process.argv.slice(2);
  const localMode = args.includes('--local');
  const budgetEur = parseFloat(args.find(a => !a.startsWith('--')) ?? '0');

  console.log('Raccolta dati...');
  const { portfolio, fearGreed, globalMetrics, analyses, watchlistAnalyses } = await runAdvisor();

  const msg1 = buildSnapshotMessage({ portfolio, fearGreed, watchlistAnalyses, budget: budgetEur });

  // Messaggio 2: raccomandazioni AI
  console.log('Generazione raccomandazioni AI...');
  const aiText = await getTelegramAdvice(portfolio, fearGreed, analyses, budgetEur, globalMetrics, watchlistAnalyses);
  const msg2 = buildRecoMessage(aiText);

  if (localMode) {
    console.log('\n' + '═'.repeat(55));
    console.log(stripHtml(msg1));
    console.log('─'.repeat(55));
    console.log(stripHtml(msg2));
    console.log('═'.repeat(55) + '\n');
  } else {
    await sendTelegram(BOT_TOKEN, CHAT_ID, msg1);
    console.log('Snapshot inviato.');
    await sendTelegram(BOT_TOKEN, CHAT_ID, msg2);
    console.log('Raccomandazioni inviate. Report completato.');
  }
}

main().catch(err => {
  console.error('Errore:', err.message);
  process.exit(1);
});
