require('dotenv').config();
const { runAdvisor } = require('./src/advisor');
const { getTelegramAdvice } = require('./src/aiAdvisor');

function fmt(n, dec = 2) { return n != null ? n.toFixed(dec) : 'n/d'; }

async function main() {
  const args = process.argv.slice(2);
  const budgetEur = parseFloat(args[0] ?? '0');

  console.log('Raccolta dati in corso...\n');
  const { portfolio, fearGreed, globalMetrics, analyses, watchlistAnalyses } = await runAdvisor();

  const date = new Date().toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome',
  });

  const btcEthSol = portfolio.holdings
    .filter(h => ['BTC', 'ETH', 'SOL'].includes(h.symbol))
    .reduce((s, h) => s + h.allocationPct, 0);

  console.log('══════════════════════════════════════════════════════');
  console.log(`CRYPTO REPORT — ${date}`);
  console.log('══════════════════════════════════════════════════════');

  console.log(`\nPORTAFOGLIO`);
  console.log(`Valore totale: €${fmt(portfolio.totalValueEur)}`);
  console.log(`Concentrazione BTC+ETH+SOL: ${btcEthSol.toFixed(1)}%`);
  console.log(`Budget disponibile: €${budgetEur}`);

  console.log(`\nSENTIMENT`);
  console.log(`Fear & Greed Index: ${fearGreed.value}/100 (${fearGreed.label})`);
  console.log(`Impatto score: ${fearGreed.score > 0 ? '+' : ''}${fearGreed.score} punti`);

  if (globalMetrics) {
    console.log(`\nMERCATO GLOBALE (CoinGecko)`);
    console.log(`Market Cap: $${(globalMetrics.totalMarketCapUsd / 1e12).toFixed(2)}T  |  24h: ${globalMetrics.totalMarketCapChange24h >= 0 ? '+' : ''}${globalMetrics.totalMarketCapChange24h?.toFixed(2)}%`);
    console.log(`BTC Dom: ${globalMetrics.btcDominance?.toFixed(1)}%  |  ETH Dom: ${globalMetrics.ethDominance?.toFixed(1)}%  |  DeFi: $${(globalMetrics.defiMarketCapUsd / 1e9).toFixed(0)}B`);
    if (globalMetrics.altcoinSeasonIndex != null) {
      console.log(`Altcoin Season Index: ${globalMetrics.altcoinSeasonIndex}/100 (${globalMetrics.altcoinSeasonLabel})`);
    }
  }

  console.log(`\nANALISI TECNICA`);
  console.log('─'.repeat(54));

  for (const h of portfolio.holdings) {
    const a = analyses.find(x => x.symbol === h.symbol);
    if (!a) continue;
    const dec = h.priceEur < 1 ? 4 : h.priceEur < 100 ? 2 : 0;

    console.log(`\n${h.name} (${h.symbol})`);
    console.log(`  Quantità: ${h.quantity} ${h.symbol}`);
    console.log(`  Prezzo: €${fmt(h.priceEur, dec)}  |  Valore: €${fmt(h.valueEur)}  |  Alloc: ${fmt(h.allocationPct)}%`);
    if (h.pnlEur != null) {
      const sign = h.pnlEur >= 0 ? '+' : '';
      console.log(`  P&L: ${sign}€${fmt(h.pnlEur)} (${sign}${fmt(h.pnlPct)}%)`);
    }
    console.log(`  24h: ${h.change24hPct >= 0 ? '+' : ''}${fmt(h.change24hPct)}%`);
    console.log(`  Segnale: ${a.signal} (score: ${a.score > 0 ? '+' : ''}${a.score})`);
    console.log(`  RSI(14): ${fmt(a.rsi, 1)}`);
    console.log(`  SMA50: $${fmt(a.sma50, dec)}  |  SMA200: $${fmt(a.sma200, dec)}`);
    if (a.macd) {
      console.log(`  MACD: ${fmt(a.macd.value, dec + 2)}  |  Istogramma: ${fmt(a.macd.histogram, dec + 2)}`);
    }
    if (a.bb) {
      console.log(`  Bollinger: $${fmt(a.bb.lower, dec)} – $${fmt(a.bb.upper, dec)} (banda ${fmt(a.bb.bandwidth, 1)}%)`);
    }
    if (a.sr) {
      const srParts = [];
      if (a.sr.support    != null) srParts.push(`Sup: $${a.sr.support.toFixed(dec)}`);
      if (a.sr.resistance != null) srParts.push(`Res: $${a.sr.resistance.toFixed(dec)}`);
      if (srParts.length) console.log(`  S/R: ${srParts.join('  |  ')}`);
    }
    if (a.marketCapRank != null) {
      console.log(`  Market Cap Rank: #${a.marketCapRank}`);
    }
    if (a.athChangePct != null) {
      console.log(`  Distanza ATH: ${a.athChangePct.toFixed(1)}%`);
    }
    if (a.priceChange7dPct != null) {
      console.log(`  7gg: ${a.priceChange7dPct >= 0 ? '+' : ''}${fmt(a.priceChange7dPct)}%`);
    }
    console.log(`  Analisi: ${a.reasons.join('; ')}`);
    if (a.news?.headlines?.length > 0) {
      console.log(`  Notizie: ${a.news.headlines.join(' | ')}`);
    }
  }

  if (watchlistAnalyses.length > 0) {
    console.log('\n' + '─'.repeat(54));
    console.log('WATCHLIST — Opportunità di mercato (non in portafoglio)');
    console.log('─'.repeat(54));
    for (const a of watchlistAnalyses) {
      const dec = a.priceEur && a.priceEur < 1 ? 4 : a.priceEur && a.priceEur < 100 ? 2 : 0;
      console.log(`\n${a.name} (${a.symbol})`);
      if (a.priceEur != null) {
        const chg = a.change24hPct != null ? `  |  24h: ${a.change24hPct >= 0 ? '+' : ''}${fmt(a.change24hPct)}%` : '';
        console.log(`  Prezzo: €${fmt(a.priceEur, dec)}${chg}`);
      }
      console.log(`  Segnale: ${a.signal} (score: ${a.score > 0 ? '+' : ''}${a.score})`);
      console.log(`  RSI(14): ${fmt(a.rsi, 1)}`);
      console.log(`  SMA50: $${fmt(a.sma50, dec)}  |  SMA200: $${fmt(a.sma200, dec)}`);
      if (a.macd) console.log(`  MACD: ${fmt(a.macd.value, dec + 2)}  |  Istogramma: ${fmt(a.macd.histogram, dec + 2)}`);
      if (a.bb)   console.log(`  Bollinger: $${fmt(a.bb.lower, dec)} – $${fmt(a.bb.upper, dec)} (banda ${fmt(a.bb.bandwidth, 1)}%)`);
      if (a.sr) {
        const srParts = [];
        if (a.sr.support    != null) srParts.push(`Sup: $${a.sr.support.toFixed(dec)}`);
        if (a.sr.resistance != null) srParts.push(`Res: $${a.sr.resistance.toFixed(dec)}`);
        if (srParts.length) console.log(`  S/R: ${srParts.join('  |  ')}`);
      }
      if (a.marketCapRank != null)    console.log(`  Market Cap Rank: #${a.marketCapRank}`);
      if (a.athChangePct != null)     console.log(`  Distanza ATH: ${a.athChangePct.toFixed(1)}%`);
      if (a.priceChange7dPct != null) console.log(`  7gg: ${a.priceChange7dPct >= 0 ? '+' : ''}${fmt(a.priceChange7dPct)}%`);
      console.log(`  Analisi: ${a.reasons.join('; ')}`);
    }
  }

  console.log('\n' + '══════════════════════════════════════════════════════');
  console.log('RACCOMANDAZIONE MARCO FERRETTI (identica a Telegram)');
  console.log('══════════════════════════════════════════════════════\n');

  const aiText = await getTelegramAdvice(portfolio, fearGreed, analyses, budgetEur, globalMetrics, watchlistAnalyses);
  console.log(aiText);
  console.log('\n' + '══════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Errore:', err.message);
  process.exit(1);
});
