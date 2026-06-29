require('dotenv').config();
const { runAdvisor } = require('./src/advisor');
const { getAIAdvice } = require('./src/aiAdvisor');

const SIGNAL_LABEL = {
  'STRONG BUY':  '🟢 STRONG BUY',
  'BUY':         '🟩 BUY',
  'HOLD':        '🟡 HOLD',
  'SELL':        '🟥 SELL',
  'STRONG SELL': '🔴 STRONG SELL',
};

function fmt(n, dec = 2) { return n != null ? n.toFixed(dec) : 'n/d'; }

function bar(score) {
  const clamped = Math.max(-100, Math.min(100, score));
  const filled = Math.round((clamped + 100) / 200 * 20);
  return '[' + '█'.repeat(filled) + '░'.repeat(20 - filled) + `] ${score > 0 ? '+' : ''}${score}`;
}

function parseBudget(arg) {
  const val = parseFloat(arg);
  if (isNaN(val) || val < 0) {
    console.error('Errore: specifica un budget valido in EUR (es: node agent.js 500)');
    process.exit(1);
  }
  return val;
}

async function main() {
  const budgetEur = parseBudget(process.argv[2] ?? '0');

  console.log('\n════════════════════════════════════════════════════════');
  console.log('   CRYPTO ADVISOR AGENT — Analisi + Consulenza AI');
  console.log(`   ${new Date().toLocaleString('it-IT')}`);
  console.log(`   Budget disponibile: €${fmt(budgetEur)}`);
  console.log('════════════════════════════════════════════════════════\n');

  console.log('Raccolta dati di mercato e analisi tecnica in corso...\n');
  const { portfolio, fearGreed, analyses } = await runAdvisor();

  // --- RIEPILOGO TECNICO ---
  console.log(`SENTIMENT: Fear & Greed = ${fearGreed.value}/100 (${fearGreed.label})\n`);

  console.log('SNAPSHOT PORTAFOGLIO');
  console.log('─'.repeat(72));
  console.log(`${'Asset'.padEnd(8)} ${'Prezzo (€)'.padStart(12)} ${'Valore (€)'.padStart(12)} ${'Alloc'.padStart(7)} ${'24h'.padStart(8)} ${'Segnale'.padStart(14)}`);
  console.log('─'.repeat(72));

  for (const h of portfolio.holdings) {
    const a = analyses.find(x => x.symbol === h.symbol);
    const signal = a ? (SIGNAL_LABEL[a.signal] || a.signal) : '';
    const dec = h.priceEur < 100 ? 2 : 0;
    console.log(
      `${h.symbol.padEnd(8)}` +
      ` €${fmt(h.priceEur, dec).padStart(11)}` +
      ` €${fmt(h.valueEur).padStart(11)}` +
      ` ${fmt(h.allocationPct).padStart(6)}%` +
      ` ${(h.change24hPct >= 0 ? '+' : '') + fmt(h.change24hPct) + '%'}`.padStart(8) +
      `  ${signal}`
    );
  }
  console.log('─'.repeat(72));
  console.log(`${'TOTALE'.padEnd(8)} ${''.padStart(12)} €${fmt(portfolio.totalValueEur).padStart(11)}\n`);

  console.log('SCORE TECNICO PER ASSET');
  console.log('─'.repeat(60));
  for (const a of analyses) {
    console.log(`${a.name.toUpperCase().padEnd(12)} ${bar(a.score)}`);
  }
  console.log('');

  // --- CONSULENZA AI ---
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Errore: ANTHROPIC_API_KEY non trovata nel file .env');
    process.exit(1);
  }

  await getAIAdvice(portfolio, fearGreed, analyses, budgetEur);
}

main().catch(err => {
  console.error('\nErrore:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
