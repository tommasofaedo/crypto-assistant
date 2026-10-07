/**
 * telegramReport.js — Formattazione + invio del report Telegram, condiviso da
 * telegram-report.js (operatore, GHA) e telegram-report-all.js (clienti, push locale).
 * Unica fonte del formato → i report non divergono tra operatore e clienti.
 */
const axios = require('axios');

function fmt(n, dec = 2) { return n != null ? n.toFixed(dec) : 'n/d'; }

function stripHtml(text) {
  return text.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
}

// Messaggio 1: snapshot tecnico (HTML). `label` opzionale (es. nome profilo) nell'intestazione.
function buildSnapshotMessage({ portfolio, fearGreed, watchlistAnalyses = [], budget = 0, label = null }) {
  const date = new Date().toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome',
  });

  let m = `<b>CRYPTO REPORT${label ? ` [${label}]` : ''} — ${date}</b>\n\n`;
  m += `Fear &amp; Greed: <b>${fearGreed.value}/100</b> (${fearGreed.label})\n`;
  m += `Portafoglio: <b>€${fmt(portfolio.totalValueEur)}</b>\n\n`;

  for (const h of portfolio.holdings) {
    const dec = h.priceEur < 100 ? 2 : 0;
    const chg = (h.change24hPct >= 0 ? '+' : '') + fmt(h.change24hPct) + '%';
    m += `<b>${h.symbol}</b>  €${fmt(h.priceEur, dec)}  ${chg}  €${fmt(h.valueEur)}\n`;
  }

  const buys = (watchlistAnalyses || []).filter(a => a.signal === 'BUY' || a.signal === 'STRONG BUY');
  if (buys.length) {
    m += `\n\n<b>Watchlist — segnali positivi</b>\n`;
    for (const a of buys) {
      const dec = a.priceEur && a.priceEur < 100 ? 2 : 0;
      const chg = a.change24hPct != null ? (a.change24hPct >= 0 ? '+' : '') + fmt(a.change24hPct) + '%' : '';
      const price = a.priceEur != null ? `€${fmt(a.priceEur, dec)}  ` : '';
      m += `<b>${a.symbol}</b>  ${price}${chg}\n`;
    }
  }

  if (budget > 0) m += `\nBudget: <b>€${fmt(budget)}</b>`;
  return m;
}

// Messaggio 2: raccomandazione Hari Seldon.
function buildRecoMessage(aiText) {
  return `<b>HARI SELDON — Raccomandazioni</b>\n\n${aiText}`;
}

async function sendTelegram(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  await axios.post(url, { chat_id: chatId, text, parse_mode: 'HTML' });
}

module.exports = { fmt, stripHtml, buildSnapshotMessage, buildRecoMessage, sendTelegram };
