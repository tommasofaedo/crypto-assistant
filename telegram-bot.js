require('dotenv').config();
const axios = require('axios');
const { runAdvisor } = require('./src/advisor');
const { getTelegramAdvice } = require('./src/aiAdvisor');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_CHAT = process.env.TELEGRAM_CHAT_ID;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

if (!BOT_TOKEN || !ALLOWED_CHAT) {
  console.error('Errore: TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID richiesti nel file .env');
  process.exit(1);
}

const SIGNAL_EMOJI = {
  'STRONG BUY': '🟢🟢',
  'BUY':        '🟢',
  'HOLD':       '🟡',
  'SELL':       '🔴',
  'STRONG SELL':'🔴🔴',
};

function fmt(n, dec = 2) { return n != null ? n.toFixed(dec) : 'n/d'; }

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fgEmoji(v) {
  if (v <= 25) return '😨';
  if (v <= 45) return '😰';
  if (v <= 55) return '😐';
  if (v <= 75) return '😊';
  return '🤑';
}

async function api(method, data = {}) {
  const res = await axios.post(`${API}/${method}`, data, { timeout: 35000 });
  return res.data.result;
}

async function send(chatId, text) {
  return api('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' });
}

let isAnalyzing = false;

function parseBudget(text) {
  const match = text.match(/(\d+(?:[.,]\d+)?)/);
  return match ? parseFloat(match[1].replace(',', '.')) : 0;
}

function isAnalysisRequest(text) {
  const lower = text.toLowerCase();
  return lower.startsWith('/analisi') || lower.includes('analisi');
}

async function handleAnalysis(chatId, budget) {
  if (isAnalyzing) {
    await send(chatId, '⏳ Analisi già in corso, attendi 30 secondi...');
    return;
  }
  isAnalyzing = true;

  // Progress message
  const prog = await api('sendMessage', {
    chat_id: chatId,
    text: `⏳ <b>Analisi in corso...</b>\nBudget: <b>€${fmt(budget)}</b>\n\n<i>Raccolta dati di mercato e calcolo indicatori...</i>`,
    parse_mode: 'HTML',
  });

  const editProg = (text) => api('editMessageText', {
    chat_id: chatId,
    message_id: prog.message_id,
    text,
    parse_mode: 'HTML',
  }).catch(() => {});

  try {
    const { portfolio, fearGreed, globalMetrics, analyses } = await runAdvisor();

    await editProg(
      `⏳ <b>Analisi in corso...</b>\nBudget: <b>€${fmt(budget)}</b>\n\n<i>Generazione raccomandazioni Marco Ferretti...</i>`
    );

    const aiText = await getTelegramAdvice(portfolio, fearGreed, analyses, budget, globalMetrics);

    // Elimina progress e invia i due messaggi
    await api('deleteMessage', { chat_id: chatId, message_id: prog.message_id }).catch(() => {});

    const date = new Date().toLocaleString('it-IT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome',
    });

    let snap = `📊 <b>CRYPTO REPORT — ${date}</b>\n\n`;
    snap += `${fgEmoji(fearGreed.value)} Fear &amp; Greed: <b>${fearGreed.value}/100</b> (${fearGreed.label})\n`;
    snap += `💼 Portafoglio: <b>€${fmt(portfolio.totalValueEur)}</b>\n\n`;

    for (const h of portfolio.holdings) {
      const a = analyses.find(x => x.symbol === h.symbol);
      const emoji = a ? (SIGNAL_EMOJI[a.signal] ?? '⚪') : '⚪';
      const dec = h.priceEur < 100 ? 2 : 0;
      const chg = (h.change24hPct >= 0 ? '+' : '') + fmt(h.change24hPct) + '%';
      snap += `${emoji} <b>${h.symbol}</b>  €${fmt(h.priceEur, dec)}  ${chg}  €${fmt(h.valueEur)}\n`;
    }

    if (budget > 0) snap += `\n💰 Budget: <b>€${fmt(budget)}</b>`;

    await send(chatId, snap);
    await send(chatId, `🤖 <b>MARCO FERRETTI — Raccomandazioni</b>\n\n${escapeHtml(aiText)}`);

  } catch (err) {
    await editProg(`❌ <b>Errore durante l'analisi</b>\n\n${err.message}`);
    console.error('Errore analisi:', err.message);
  } finally {
    isAnalyzing = false;
  }
}

async function processUpdate(update) {
  const msg = update.message;
  if (!msg?.text) return;

  const chatId = msg.chat.id.toString();
  if (chatId !== ALLOWED_CHAT.toString()) {
    console.log(`Chat non autorizzata ignorata: ${chatId}`);
    return;
  }

  const text = msg.text.trim();
  const lower = text.toLowerCase();

  if (lower === '/start' || lower === '/help') {
    await send(chatId,
      `👋 <b>Crypto Assistant — Marco Ferretti</b>\n\n` +
      `<b>Comandi:</b>\n` +
      `• <code>/analisi</code> — analisi senza budget\n` +
      `• <code>/analisi 100</code> — analisi con €100 disponibili\n` +
      `• <i>"analisi con 50 euro"</i> — linguaggio naturale\n\n` +
      `L'analisi impiega ~30 secondi.`
    );
    return;
  }

  if (isAnalysisRequest(text)) {
    const budgetText = text.replace(/\/analisi/i, '').trim();
    const budget = parseBudget(budgetText);
    await handleAnalysis(chatId, budget);
  }
}

async function poll() {
  let offset = 0;
  console.log(`🤖 Bot Telegram avviato — chat autorizzata: ${ALLOWED_CHAT}`);

  // Salta i messaggi già in coda prima dell'avvio (evita di processare comandi vecchi)
  try {
    const pending = await api('getUpdates', { timeout: 0 });
    if (pending?.length) {
      offset = pending[pending.length - 1].update_id + 1;
      console.log(`Saltati ${pending.length} messaggio/i in coda dall'avvio precedente.`);
    }
  } catch { /* ignora errori startup */ }

  console.log('In ascolto per messaggi... (Ctrl+C per fermare)\n');

  while (true) {
    try {
      const updates = await api('getUpdates', {
        offset,
        timeout: 30,
        allowed_updates: ['message'],
      });

      for (const update of (updates ?? [])) {
        offset = update.update_id + 1;
        await processUpdate(update);
      }
    } catch (err) {
      const isNetwork = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'].includes(err.code);
      if (!isNetwork) console.error('Errore polling:', err.message);
      await new Promise(r => setTimeout(r, isNetwork ? 5000 : 10000));
    }
  }
}

process.on('SIGINT', () => { console.log('\nBot fermato.'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\nBot fermato.'); process.exit(0); });

poll();
