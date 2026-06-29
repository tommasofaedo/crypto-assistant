const { runAdvisor } = require('./src/advisor');

const SIGNAL_LABEL = {
  'STRONG BUY':  '🟢 STRONG BUY',
  'BUY':         '🟩 BUY       ',
  'HOLD':        '🟡 HOLD      ',
  'SELL':        '🟥 SELL      ',
  'STRONG SELL': '🔴 STRONG SELL',
};

function bar(score) {
  const clamped = Math.max(-100, Math.min(100, score));
  const filled = Math.round((clamped + 100) / 200 * 20);
  return '[' + '█'.repeat(filled) + '░'.repeat(20 - filled) + `] ${score > 0 ? '+' : ''}${score}`;
}

function fmt(n, dec = 2) { return n != null ? n.toFixed(dec) : 'n/d'; }

async function main() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('   CRYPTO ADVISOR — Analisi & Raccomandazioni');
  console.log(`   ${new Date().toLocaleString('it-IT')}`);
  console.log('════════════════════════════════════════════════════════\n');

  console.log('Raccolta dati in corso...\n');
  const { portfolio, fearGreed, analyses } = await runAdvisor();

  // --- SENTIMENT ---
  console.log(`SENTIMENT DI MERCATO: Fear & Greed Index = ${fearGreed.value}/100 (${fearGreed.label})`);
  console.log(`Impatto sulle raccomandazioni: ${fearGreed.score > 0 ? '+' : ''}${fearGreed.score} punti su ogni asset\n`);

  // --- PORTFOLIO SNAPSHOT ---
  console.log('PORTAFOGLIO ATTUALE');
  console.log('─'.repeat(70));
  console.log(`${'Asset'.padEnd(8)} ${'Prezzo (€)'.padStart(12)} ${'Valore (€)'.padStart(12)} ${'Alloc'.padStart(7)} ${'24h'.padStart(8)}`);
  console.log('─'.repeat(70));

  for (const h of portfolio.holdings) {
    const symbol = h.symbol.padEnd(8);
    const price  = `€${fmt(h.priceEur)}`.padStart(12);
    const value  = `€${fmt(h.valueEur)}`.padStart(12);
    const alloc  = `${fmt(h.allocationPct)}%`.padStart(7);
    const change = `${h.change24hPct >= 0 ? '+' : ''}${fmt(h.change24hPct)}%`.padStart(8);
    console.log(`${symbol} ${price} ${value} ${alloc} ${change}`);
  }
  console.log('─'.repeat(70));
  console.log(`${'TOTALE'.padEnd(8)} ${''.padStart(12)} €${fmt(portfolio.totalValueEur).padStart(11)} ${'100.00%'.padStart(7)}\n`);

  // --- ANALISI PER ASSET ---
  console.log('ANALISI TECNICA E RACCOMANDAZIONI');
  console.log('═'.repeat(70));

  for (const a of analyses) {
    const label = SIGNAL_LABEL[a.signal] || a.signal;
    console.log(`\n${a.name.toUpperCase()} (${a.symbol})  —  ${label}`);
    console.log(`Score: ${bar(a.score)}`);
    const dec = a.sma50 && a.sma50 < 10 ? 4 : a.sma50 && a.sma50 < 100 ? 2 : 0;
    console.log(`RSI: ${fmt(a.rsi, 1)}  |  SMA50: $${fmt(a.sma50, dec)}  |  SMA200: $${fmt(a.sma200, dec)}`);
    if (a.macd) {
      console.log(`MACD: ${fmt(a.macd.value, dec + 2)}  |  Istogramma: ${fmt(a.macd.histogram, dec + 2)}`);
    }
    if (a.bb) {
      console.log(`Bollinger: $${fmt(a.bb.lower, dec)} – $${fmt(a.bb.upper, dec)} (banda ${fmt(a.bb.bandwidth, 1)}%)`);
    }
    console.log('Motivazioni:');
    a.reasons.forEach(r => console.log(`  • ${r}`));
    console.log(`\n  ➜  ${a.action}`);
    console.log('─'.repeat(70));
  }

  // --- NOTA PORTAFOGLIO ---
  const btcEthSol = portfolio.holdings
    .filter(h => ['BTC', 'ETH', 'SOL'].includes(h.symbol))
    .reduce((s, h) => s + h.allocationPct, 0);

  console.log('\nNOTE SUL PORTAFOGLIO');
  console.log(`  • Concentrazione BTC+ETH+SOL: ${fmt(btcEthSol)}% — ${btcEthSol > 85 ? 'alta, considera diversificazione' : 'nella norma per rischio medio'}`);
  console.log('  • Nessuna stablecoin rilevata — considera tenere 5-10% in USDC/USDT per opportunità di acquisto rapido');
  console.log('  • Orizzonte consigliato: non agire su ogni segnale giornaliero — rivaluta settimanalmente\n');
}

main().catch(err => {
  console.error('\nErrore:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
