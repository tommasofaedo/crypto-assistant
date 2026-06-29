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

function buildAnalysisMessage(portfolio, fearGreed, analyses, budgetEur) {
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
    text += `\n- Analisi tecnica: ${analysis.reasons.join('; ')}`;

    return text;
  }).filter(Boolean).join('\n');

  const totalValue = portfolio.totalValueEur;
  const btcEthSol = portfolio.holdings
    .filter(h => ['BTC', 'ETH', 'SOL'].includes(h.symbol))
    .reduce((s, h) => s + h.allocationPct, 0);

  return `## PORTAFOGLIO ATTUALE
Valore totale: €${totalValue.toFixed(2)}
Concentrazione BTC+ETH+SOL: ${btcEthSol.toFixed(1)}%
Stablecoin in portafoglio: nessuna
Budget disponibile per nuovi acquisti: €${budgetEur}

## SENTIMENT DI MERCATO
Fear & Greed Index: ${fearGreed.value}/100 (${fearGreed.label})
Impatto calcolato sullo score tecnico: ${fearGreed.score > 0 ? '+' : ''}${fearGreed.score} punti

## ANALISI TECNICA PER ASSET
${holdingsText}

---

Sulla base di questi dati aggiornati, fornisci le tue raccomandazioni operative specifiche.
Considera il budget disponibile di €${budgetEur} per eventuali acquisti.
Ricorda: voglio sapere COSA fare ESATTAMENTE, con QUANTO e QUANDO.`;
}

async function getAIAdvice(portfolio, fearGreed, analyses, budgetEur) {
  const userMessage = buildAnalysisMessage(portfolio, fearGreed, analyses, budgetEur);

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

const TELEGRAM_PROMPT = `Sei Marco Ferretti, consulente crypto. Il tuo obiettivo è PRESERVARE il capitale — agisci solo quando i segnali sono inequivocabili.

REGOLA PRINCIPALE: Se non c'è un segnale tecnico forte e chiaro, scrivi SOLO questa riga:
⚪ NESSUNA AZIONE — [motivo breve]

Quando agire (tutte le condizioni devono essere vere):
- COMPRA: score ≥ +30 E RSI < 38 E budget > 0
- VENDI: score ≤ -30 E RSI > 62 (o posizione minuscola da liquidare)
- In tutti gli altri casi: MANTIENI o NESSUNA AZIONE

Formato compatto, max 5 righe, importi sempre in EUR:
🟢 COMPRA €[importo] [ASSET] — [motivo max 8 parole]
🔴 VENDI [quantità] [ASSET] (€[importo]) — [motivo max 8 parole]
🟡 MANTIENI [ASSET1], [ASSET2] — [motivo breve]
⚪ NESSUNA AZIONE — [motivo breve]

Se budget = 0: mai suggerire acquisti. Solo VENDI se urgente, altrimenti NESSUNA AZIONE.
Zero preamboli, zero conclusioni. Solo le righe di azione.`;

async function getTelegramAdvice(portfolio, fearGreed, analyses, budgetEur) {
  const userMessage = buildAnalysisMessage(portfolio, fearGreed, analyses, budgetEur);

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    thinking: { type: 'adaptive' },
    system: TELEGRAM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  return response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');
}

module.exports = { getAIAdvice, getTelegramAdvice };
