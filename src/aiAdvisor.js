require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Sei Marco Ferretti, un consulente finanziario indipendente specializzato in criptovalute con 12 anni di esperienza nei mercati digitali. Hai lavorato con hedge fund e family office prima di dedicarti alla consulenza privata.

Il tuo stile è diretto, pragmatico e senza giri di parole. Dai consigli concreti e specifici come farebbe un consulente privato di alto livello — non generici, non ipotetici.

L'investitore che hai davanti è adulto, consapevole dei rischi e si assume piena responsabilità delle proprie decisioni. Non hai bisogno di aggiungere disclaimer legali generici: lui lo sa già. Trattalo da pari a pari.

COME STRUTTURARE LE RACCOMANDAZIONI:
Per ogni operazione consigliata specifica:
1. AZIONE: COMPRA / VENDI / MANTIENI
2. ASSET: nome e simbolo
3. QUANTITÀ: precisa in crypto E in EUR (es. "0.05 ETH = circa €135")
4. MOTIVAZIONE: 2-3 ragioni tecniche concrete tratte dai dati forniti
5. TIMING: quando eseguire (subito / aspetta segnale / gradualmente in DCA)
6. RISCHIO: basso / medio / alto e perché
7. TARGET / STOP LOSS: livelli di prezzo concreti se applicabili

PRIORITÀ OPERAZIONI: numera le operazioni in ordine di urgenza/convenienza.

TONO: da professionista esperto a cliente stimato. Diretti, concreti, senza mezze misure. Se un asset è da vendere dillo chiaramente. Se un'analisi suggerisce cautela, spiegane il perché con i numeri alla mano.`;

function buildAnalysisMessage(portfolio, fearGreed, analyses, budgetEur, globalMetrics, watchlistAnalyses = []) {
  const holdingsText = portfolio.holdings.map(h => {
    const analysis = analyses.find(a => a.symbol === h.symbol);
    if (!analysis) return '';

    const dec = h.priceEur < 1 ? 4 : h.priceEur < 100 ? 2 : 0;
    const fmt = (n, d = 2) => n != null ? n.toFixed(d) : 'n/d';

    let text = `\n### ${h.name} (${h.symbol})
- Quantità posseduta: ${h.quantity} ${h.symbol}
- Prezzo attuale: €${fmt(h.priceEur, dec)}
- Valore in portafoglio: €${fmt(h.valueEur)}
- Allocazione: ${fmt(h.allocationPct)}%
- Variazione 24h: ${h.change24hPct >= 0 ? '+' : ''}${fmt(h.change24hPct)}%
- Segnale tecnico: ${analysis.signal} (score: ${analysis.score > 0 ? '+' : ''}${analysis.score})
- RSI (14): ${fmt(analysis.rsi, 1)}
- SMA 50: $${fmt(analysis.sma50, dec)}
- SMA 200: $${fmt(analysis.sma200, dec)}`;

    if (analysis.macd) {
      text += `\n- MACD: ${fmt(analysis.macd.value, dec + 2)} | Istogramma: ${fmt(analysis.macd.histogram, dec + 2)}`;
    }
    if (analysis.bb) {
      text += `\n- Bollinger Bands: $${fmt(analysis.bb.lower, dec)} – $${fmt(analysis.bb.upper, dec)} (banda: ${fmt(analysis.bb.bandwidth, 1)}%)`;
    }
    if (analysis.marketCapRank != null) {
      text += `\n- Market Cap Rank: #${analysis.marketCapRank}`;
    }
    if (analysis.athChangePct != null) {
      text += `\n- Distanza ATH: ${analysis.athChangePct.toFixed(1)}%`;
    }
    if (analysis.priceChange7dPct != null) {
      text += `\n- Variazione 7gg: ${analysis.priceChange7dPct >= 0 ? '+' : ''}${analysis.priceChange7dPct.toFixed(2)}%`;
    }
    text += `\n- Analisi tecnica: ${analysis.reasons.join('; ')}`;

    if (analysis.news?.headlines?.length > 0) {
      text += `\n- Notizie recenti: ${analysis.news.headlines.join(' | ')}`;
    }

    return text;
  }).filter(Boolean).join('\n');

  const totalValue = portfolio.totalValueEur;
  const btcEthSol = portfolio.holdings
    .filter(h => ['BTC', 'ETH', 'SOL'].includes(h.symbol))
    .reduce((s, h) => s + h.allocationPct, 0);

  const fmt = (n, d = 2) => n != null ? n.toFixed(d) : 'n/d';

  const watchlistText = watchlistAnalyses.map(a => {
    const dec = a.priceEur && a.priceEur < 1 ? 4 : a.priceEur && a.priceEur < 100 ? 2 : 0;
    let text = `\n### ${a.name} (${a.symbol}) — NON IN PORTAFOGLIO
- Prezzo attuale: ${a.priceEur != null ? '€' + fmt(a.priceEur, dec) : 'n/d'}
- Variazione 24h: ${a.change24hPct != null ? (a.change24hPct >= 0 ? '+' : '') + fmt(a.change24hPct) + '%' : 'n/d'}
- Segnale tecnico: ${a.signal} (score: ${a.score > 0 ? '+' : ''}${a.score})
- RSI (14): ${fmt(a.rsi, 1)}
- SMA 50: $${fmt(a.sma50, dec)}
- SMA 200: $${fmt(a.sma200, dec)}`;
    if (a.macd) text += `\n- MACD: ${fmt(a.macd.value, dec + 2)} | Istogramma: ${fmt(a.macd.histogram, dec + 2)}`;
    if (a.bb)   text += `\n- Bollinger Bands: $${fmt(a.bb.lower, dec)} – $${fmt(a.bb.upper, dec)} (banda: ${fmt(a.bb.bandwidth, 1)}%)`;
    if (a.marketCapRank != null)    text += `\n- Market Cap Rank: #${a.marketCapRank}`;
    if (a.athChangePct != null)     text += `\n- Distanza ATH: ${a.athChangePct.toFixed(1)}%`;
    if (a.priceChange7dPct != null) text += `\n- Variazione 7gg: ${a.priceChange7dPct >= 0 ? '+' : ''}${a.priceChange7dPct.toFixed(2)}%`;
    text += `\n- Analisi tecnica: ${a.reasons.join('; ')}`;
    return text;
  }).join('\n');

  const watchlistSection = watchlistAnalyses.length > 0
    ? `\n\n## OPPORTUNITÀ DI MERCATO (asset non in portafoglio)\nValuta se aprire nuove posizioni se il segnale è favorevole.\n${watchlistText}`
    : '';

  return `## PORTAFOGLIO ATTUALE
Valore totale: €${totalValue.toFixed(2)}
Concentrazione BTC+ETH+SOL: ${btcEthSol.toFixed(1)}%
Stablecoin in portafoglio: nessuna
Budget disponibile per nuovi acquisti: €${budgetEur}

## SENTIMENT DI MERCATO
Fear & Greed Index: ${fearGreed.value}/100 (${fearGreed.label})
Impatto calcolato sullo score tecnico: ${fearGreed.score > 0 ? '+' : ''}${fearGreed.score} punti
${globalMetrics ? `
## METRICHE GLOBALI (CoinMarketCap)
Market Cap totale: $${(globalMetrics.totalMarketCapUsd / 1e12).toFixed(2)}T (${globalMetrics.totalMarketCapChange24h >= 0 ? '+' : ''}${globalMetrics.totalMarketCapChange24h?.toFixed(2)}% 24h)
BTC Dominance: ${globalMetrics.btcDominance?.toFixed(1)}% | ETH Dominance: ${globalMetrics.ethDominance?.toFixed(1)}%
Volume 24h: $${(globalMetrics.totalVolume24hUsd / 1e9).toFixed(0)}B
DeFi Market Cap: $${(globalMetrics.defiMarketCapUsd / 1e9).toFixed(0)}B
Altcoin Season Index: ${globalMetrics.altcoinSeasonIndex ?? 'n/d'}/100 (${globalMetrics.altcoinSeasonLabel ?? 'n/d'}) — sopra 75 = altseason, sotto 25 = BTC season` : ''}

## ANALISI TECNICA PER ASSET
${holdingsText}${watchlistSection}

---

Sulla base di questi dati aggiornati, fornisci le tue raccomandazioni operative specifiche.
Considera il budget disponibile di €${budgetEur} per eventuali acquisti.
Per gli asset NON in portafoglio, valuta se aprire una nuova posizione (indica importo suggerito in EUR).
Ricorda: voglio sapere COSA fare ESATTAMENTE, con QUANTO e QUANDO.`;
}

async function getAIAdvice(portfolio, fearGreed, analyses, budgetEur, globalMetrics) {
  const userMessage = buildAnalysisMessage(portfolio, fearGreed, analyses, budgetEur, globalMetrics);

  process.stdout.write('\n\033[1;36m╔══════════════════════════════════════════════════════════╗\033[0m\n');
  process.stdout.write('\033[1;36m║     CONSULENTE AI — Marco Ferretti, CFA                  ║\033[0m\n');
  process.stdout.write('\033[1;36m╚══════════════════════════════════════════════════════════╝\033[0m\n\n');

  const stream = client.messages.stream({
    model: 'claude-opus-4-8',
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  let thinkingShown = false;
  let inThinking = false;

  for await (const event of stream) {
    if (event.type === 'content_block_start') {
      if (event.content_block.type === 'thinking') {
        inThinking = true;
        if (!thinkingShown) {
          process.stdout.write('\033[2m[Analisi in corso...]\033[0m\n');
          thinkingShown = true;
        }
      } else if (event.content_block.type === 'text') {
        inThinking = false;
        if (thinkingShown) process.stdout.write('\n');
      }
    } else if (event.type === 'content_block_delta') {
      if (event.delta.type === 'text_delta' && !inThinking) {
        process.stdout.write(event.delta.text);
      }
    }
  }

  const final = await stream.finalMessage();
  process.stdout.write('\n\n');

  return final;
}

// Asset con vincolo di non-vendita (strategici, non di trading)
const NO_SELL = new Set(['CRO', 'LINK', 'UNI']);

// Calcola in codice quali azioni superano le soglie — nessuna delega all'AI
function computeEligibleActions(analyses, portfolio, budgetEur, watchlistAnalyses = []) {
  const blue = [], orange = [];

  for (const a of analyses) {
    const h = portfolio.holdings.find(h => h.symbol === a.symbol);
    if (!h) continue;
    const sellEur = Math.round(h.valueEur * 0.25);
    const canSell = !NO_SELL.has(a.symbol);
    const s = a.score, r = a.rsi;

    if (s >= 30 && r < 38 && budgetEur > 0)
      blue.push(`COMPRA ${a.symbol} (score +${s}, RSI ${r.toFixed(1)})`);
    if (s <= -30 && r > 62 && canSell)
      blue.push(`VENDI 25% ${a.symbol} ~€${sellEur} (score ${s}, RSI ${r.toFixed(1)}) — rivaluta tra 2 giorni`);

    if (s >= 20 && r < 42 && budgetEur > 0)
      orange.push(`COMPRA ${a.symbol} (score +${s}, RSI ${r.toFixed(1)})`);
    if (s <= -20 && r > 58 && canSell)
      orange.push(`VENDI 25% ${a.symbol} ~€${sellEur} (score ${s}, RSI ${r.toFixed(1)}) — rivaluta tra 2 giorni`);
  }

  // Watchlist: solo BUY, mai SELL
  for (const a of watchlistAnalyses) {
    if (!a.rsi) continue;
    const s = a.score, r = a.rsi;
    if (s >= 30 && r < 38 && budgetEur > 0)
      blue.push(`NUOVA POSIZIONE ${a.symbol} (${a.name}) — score +${s}, RSI ${r.toFixed(1)}`);
    else if (s >= 20 && r < 42 && budgetEur > 0)
      orange.push(`NUOVA POSIZIONE ${a.symbol} (${a.name}) — score +${s}, RSI ${r.toFixed(1)}`);
  }

  return { blue, orange };
}

const TELEGRAM_PROMPT = `Sei Marco Ferretti, consulente crypto con 12 anni di esperienza. Ricevi dati tecnici completi e devi produrre raccomandazioni operative coerenti e complete.

I "SEGNALI TECNICI CALCOLATI" sono il tuo punto di partenza prioritario — rispettali. Ma ragiona sul contesto completo (Fear & Greed, metriche globali, watchlist) per integrare dove i segnali formali non coprono.

REGOLE:
1. 🟢 COMPRA (anche nuove posizioni watchlist), 🔴 VENDI, ⚪ NESSUNA AZIONE
2. Per ogni COMPRA specifica l'importo in EUR (€10–30, DCA preferito)
3. Se Fear & Greed < 25 (Extreme Fear) e budget > 0: valuta DCA difensivo su BTC o ETH in 🟠 anche senza segnali formali — è il contesto che lo giustifica
4. Max 3 operazioni per sezione. Motivo tecnico in max 8 parole per riga.
5. Sezione senza operazioni → ⚪ NESSUNA AZIONE — [motivo in 5 parole]

FORMATO OBBLIGATORIO — esattamente 2 sezioni, zero preamboli, zero conclusioni:
🔵 BASSO RISCHIO
🟢/🔴/⚪ [azione] — [motivo]

🟠 MEDIO-BASSO RISCHIO
🟢/🔴/⚪ [azione] — [motivo]`;

async function getTelegramAdvice(portfolio, fearGreed, analyses, budgetEur, globalMetrics, watchlistAnalyses = []) {
  const eligible = computeEligibleActions(analyses, portfolio, budgetEur, watchlistAnalyses);

  const fmtActions = (arr) => arr.length
    ? arr.map(a => `• ${a}`).join('\n')
    : 'NESSUNA AZIONE';

  const actionsBlock = `\n## SEGNALI TECNICI CALCOLATI (input prioritario — integra col contesto)\n` +
    `🔵 BASSO RISCHIO:\n${fmtActions(eligible.blue)}\n\n` +
    `🟠 MEDIO-BASSO RISCHIO:\n${fmtActions(eligible.orange)}`;

  const userMessage = buildAnalysisMessage(portfolio, fearGreed, analyses, budgetEur, globalMetrics, watchlistAnalyses)
    + actionsBlock;

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 800,
    system: TELEGRAM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  return response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');
}

module.exports = { getAIAdvice, getTelegramAdvice };
