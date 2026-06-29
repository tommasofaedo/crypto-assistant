require('dotenv').config();
const axios = require('axios');
const { runAdvisor } = require('./src/advisor');
const { getTelegramAdvice } = require('./src/aiAdvisor');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const SIGNAL_EMOJI = {
  'STRONG BUY': '🟢🟢',
  'BUY':        '🟢',
  'HOLD':       '🟡',
  'SELL':       '🔴',
  'STRONG SELL':'🔴🔴',
};

function fmt(n, dec = 2) { return n != null ? n.toFixed(dec) : 'n/d'; }

function fgEmoji(value) {
  if (value <= 25) return '😨';
  if (value <= 45) return '😰';
  if (value <= 55) return '😐';
  if (value <= 75) return '😊';
  return '🤑';
}

function stripHtml(text) {
  return text.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
}

async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  await axios.post(url, { chat_id: CHAT_ID, text, parse_mode: 'HTML' });
}

async function main() {
  const args = process.argv.slice(2);
  const localMode = args.includes('--local');
  const budgetEur = parseFloat(args.find(a => !a.startsWith('--')) ?? '0');

  console.log('Raccolta dati...');
  const { portfolio, fearGreed, globalMetrics, analyses } = await runAdvisor();

  // Messaggio 1: snapshot tecnico
  const date = new Date().toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome',
  });

  let msg1 = `📊 <b>CRYPTO REPORT — ${date}</b>\n\n`;
  msg1 += `${fgEmoji(fearGreed.value)} Fear &amp; Greed: <b>${fearGreed.value}/100</b> (${fearGreed.label})\n`;
  msg1 += `💼 Portafoglio: <b>€${fmt(portfolio.totalValueEur)}</b>\n\n`;

  for (const h of portfolio.holdings) {
    const a = analyses.find(x => x.symbol === h.symbol);
    const emoji = a ? (SIGNAL_EMOJI[a.signal] ?? '⚪') : '⚪';
    const dec = h.priceEur < 100 ? 2 : 0;
    const chg = (h.change24hPct >= 0 ? '+' : '') + fmt(h.change24hPct) + '%';
    msg1 += `${emoji} <b>${h.symbol}</b>  €${fmt(h.priceEur, dec)}  ${chg}  €${fmt(h.valueEur)}\n`;
  }

  if (budgetEur > 0) msg1 += `\n💰 Budget: <b>€${fmt(budgetEur)}</b>`;

  // Messaggio 2: raccomandazioni AI
  console.log('Generazione raccomandazioni AI...');
  const aiText = await getTelegramAdvice(portfolio, fearGreed, analyses, budgetEur, globalMetrics);
  const msg2 = `🤖 <b>MARCO FERRETTI — Raccomandazioni</b>\n\n${aiText}`;

  if (localMode) {
    console.log('\n' + '═'.repeat(55));
    console.log(stripHtml(msg1));
    console.log('─'.repeat(55));
    console.log(stripHtml(msg2));
    console.log('═'.repeat(55) + '\n');
  } else {
    await sendTelegram(msg1);
    console.log('Snapshot inviato.');
    await sendTelegram(msg2);
    console.log('Raccomandazioni inviate. Report completato.');
  }
}

main().catch(err => {
  console.error('Errore:', err.message);
  process.exit(1);
});
