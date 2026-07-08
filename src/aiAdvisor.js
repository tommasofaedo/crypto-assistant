require('dotenv').config();
const fs = require('fs');
const path = require('path');
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
    if (h.pnlEur != null) {
      const sign = h.pnlEur >= 0 ? '+' : '';
      text += `\n- P&L: ${sign}€${fmt(h.pnlEur)} (${sign}${fmt(h.pnlPct)}%) — ${h.pnlEur >= 0 ? 'in profitto' : 'in perdita'}`;
    }
    if (analysis.sr) {
      const { support, resistance } = analysis.sr;
      const srParts = [];
      if (support    != null) srParts.push(`supporto $${support.toFixed(dec)}`);
      if (resistance != null) srParts.push(`resistenza $${resistance.toFixed(dec)}`);
      if (srParts.length) text += `\n- Livelli chiave: ${srParts.join(' / ')}`;
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
    if (a.sr) {
      const srParts = [];
      if (a.sr.support    != null) srParts.push(`supporto $${a.sr.support.toFixed(dec)}`);
      if (a.sr.resistance != null) srParts.push(`resistenza $${a.sr.resistance.toFixed(dec)}`);
      if (srParts.length) text += `\n- Livelli chiave: ${srParts.join(' / ')}`;
    }
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

// Etichetta sintetica del regime di mercato per la motivazione
function regimeTag(regime) {
  if (!regime || regime.type === 'unknown') return 'regime n/d';
  if (regime.type === 'trending') return regime.dir === 'up' ? 'trend rialzista forte' : 'trend ribassista forte';
  if (regime.type === 'ranging') return 'mercato laterale';
  return 'trend in formazione';
}

// Livelli operativi (stop/target da ATR) per la riga di raccomandazione
function levelsTag(levels) {
  if (!levels) return '';
  return ` | stop ${levels.stopPct.toFixed(1)}%, target +${levels.targetPct.toFixed(1)}%`;
}

// Strategia di portafoglio (pesi target, tetti, ripartizione budget). Esterna e modificabile.
function loadStrategy() {
  const fallback = {
    posture: 'balanced', coreSymbols: ['BTC', 'ETH'],
    targets: { BTC: 0.30, ETH: 0.25 }, altMaxWeight: 0.15, coreBudgetShare: 0.5,
  };
  try {
    const fp = path.join(__dirname, '../data/strategy.json');
    return { ...fallback, ...JSON.parse(fs.readFileSync(fp, 'utf-8')) };
  } catch {
    return fallback;
  }
}

// Fit strategico di un acquisto [0 = da evitare .. ~1.5 = prioritario]. È qui che il giudizio
// di portafoglio entra nel motore: privilegia la qualità sotto-pesata, blocca la sovra-concentrazione.
function strategicFit(symbol, weight, isCore, rs, strategy) {
  if (isCore) {
    const target = strategy.targets[symbol] ?? 0.15;
    const ratio = target > 0 ? weight / target : 1;         // <1 sotto-pesato, >1 sovra-pesato
    const fit = 1 + (1 - ratio) * 0.8;                       // boost se sotto target, taglio se sopra
    return Math.max(0.2, Math.min(1.5, fit));
  }
  // Altcoin: tetto duro per singolo asset — oltre il tetto, nessun nuovo acquisto.
  const cap = strategy.altMaxWeight ?? 0.15;
  if (weight >= cap) return 0;
  const room = (cap - weight) / cap;                         // spazio residuo sotto il tetto (0..1)
  const rsBoost = rs && rs.outperformancePct > 0 ? Math.min(0.4, rs.outperformancePct / 50) : 0; // momentum
  return Math.max(0.1, room + rsBoost);
}

// Ripartisce il budget del giorno tra la miglior opportunità core e la miglior alt (postura balanced).
function allocateBudget(buys, budgetEur, strategy) {
  if (!buys.length || budgetEur <= 0) return [];
  const round5 = x => Math.round(x / 5) * 5;
  const byPriority = (a, b) => b.priority - a.priority;
  const bestCore = buys.filter(b => b.isCore).sort(byPriority)[0];
  const bestAlt  = buys.filter(b => !b.isCore).sort(byPriority)[0];

  // Con budget sufficiente e entrambi i tier disponibili: split core/alt secondo coreBudgetShare.
  if (bestCore && bestAlt && budgetEur >= 20) {
    let cEur = round5(budgetEur * (strategy.coreBudgetShare ?? 0.5));
    cEur = Math.max(5, Math.min(budgetEur - 5, cEur));
    return [{ ...bestCore, eur: cEur }, { ...bestAlt, eur: budgetEur - cEur }];
  }
  // Budget piccolo o un solo tier: tutto sulla singola migliore priorità assoluta.
  const best = [...buys].sort(byPriority)[0];
  return [{ ...best, eur: budgetEur }];
}

// Decide se attivare il "tilt verso balanced" — regola DETERMINISTICA, non discrezionale.
// Scatta solo con un'alt ad alta convinzione (score+forza relativa) o altseason oggettiva.
function resolveAdaptiveMode(strategy, analyses, watchlistAnalyses, globalMetrics, coreSet) {
  let coreBudgetShare = strategy.coreBudgetShare;
  let altMaxWeight = strategy.altMaxWeight;
  const mode = { posture: strategy.posture, tilt: false, reason: null };

  const adj = strategy.adaptive;
  if (adj?.enabled) {
    const strongAlt = [...analyses, ...watchlistAnalyses].find(a => {
      if (coreSet.has(a.symbol)) return false;
      const outp = a.relativeStrength ? a.relativeStrength.outperformancePct : 0;
      const up = a.regime && a.regime.dir === 'up';
      return up && a.score >= adj.altConvictionScore && outp >= adj.altConvictionOutperf;
    });
    const seasonIdx = globalMetrics?.altcoinSeasonIndex;
    const altSeason = seasonIdx != null && seasonIdx >= adj.altSeasonIndex;

    if (strongAlt || altSeason) {
      coreBudgetShare = adj.tiltCoreBudgetShare ?? coreBudgetShare;
      altMaxWeight = adj.tiltAltMaxWeight ?? altMaxWeight;
      mode.tilt = true;
      mode.reason = strongAlt
        ? `alt ad alta convinzione: ${strongAlt.symbol} score +${strongAlt.score}`
        : `altseason index ${seasonIdx}`;
    }
  }
  return { effStrategy: { ...strategy, coreBudgetShare, altMaxWeight }, mode };
}

// Piano operativo completo: unisce score tattico e fit strategico, alloca il budget, gestisce le vendite.
// Core (BTC/ETH) → basso rischio (🔵); altcoin → medio-basso (🟠).
function computeStrategicPlan(analyses, portfolio, budgetEur, fearGreed, watchlistAnalyses = [], globalMetrics = null) {
  const baseStrategy = loadStrategy();
  const total = portfolio.totalValueEur || 1;
  const coreSet = new Set(baseStrategy.coreSymbols);
  const { effStrategy: strategy, mode } = resolveAdaptiveMode(baseStrategy, analyses, watchlistAnalyses, globalMetrics, coreSet);

  // 1) Candidati all'acquisto: score sopra soglia, RSI non in blow-off, fit strategico > 0
  const buys = [];
  for (const a of [...analyses, ...watchlistAnalyses]) {
    const s = a.score, r = a.rsi ?? 50;
    if (!(budgetEur > 0 && s >= 22 && r < 80)) continue;
    const h = portfolio.holdings.find(x => x.symbol === a.symbol);
    const weight = h ? h.valueEur / total : 0;
    const isCore = coreSet.has(a.symbol);
    const fit = strategicFit(a.symbol, weight, isCore, a.relativeStrength, strategy);
    if (fit <= 0) continue; // bloccato dal tetto di concentrazione
    buys.push({
      symbol: a.symbol, name: a.name, isCore, inPortfolio: !!h,
      score: s, rsi: r, weight, fit, priority: s * fit,
      regime: a.regime, levels: a.levels,
      outperf: a.relativeStrength ? a.relativeStrength.outperformancePct : null,
    });
  }

  // 2) DCA difensivo in Extreme Fear: garantisce almeno una gamba core anche senza segnale forte
  if (budgetEur > 0 && fearGreed?.value != null && fearGreed.value < 25) {
    const hasCore = buys.some(b => b.isCore);
    if (!hasCore) {
      // scegli il core più sotto-pesato come DCA difensivo
      let pick = null;
      for (const sym of strategy.coreSymbols) {
        const h = portfolio.holdings.find(x => x.symbol === sym);
        const a = analyses.find(x => x.symbol === sym);
        const weight = h ? h.valueEur / total : 0;
        const fit = strategicFit(sym, weight, true, a?.relativeStrength, strategy);
        if (!pick || fit > pick.fit) pick = { symbol: sym, name: a?.name ?? sym, isCore: true, inPortfolio: !!h, score: a?.score ?? 0, rsi: a?.rsi ?? 50, weight, fit, priority: fit * 10, regime: a?.regime, levels: a?.levels, defensive: true };
      }
      if (pick) buys.push(pick);
    }
  }

  const allocations = allocateBudget(buys, budgetEur, strategy);

  // 3) Vendite = solo presa-profitto disciplinata (mandato): mai in perdita, winner maturo a RSI alto
  const sells = [];
  for (const a of analyses) {
    const h = portfolio.holdings.find(x => x.symbol === a.symbol);
    if (!h || NO_SELL.has(a.symbol)) continue;
    const pnl = h.pnlPct ?? null;
    const r = a.rsi ?? 50;
    if (pnl != null && pnl >= 40 && r >= 65) {
      sells.push({ symbol: a.symbol, eur: Math.round(h.valueEur * 0.25), pnl, rsi: r, regime: a.regime, strong: a.score <= -20 });
    }
  }

  return { allocations, sells, strategy, mode };
}

// Valida il commento dell'LLM: NON può contenere azioni operative né importi.
// Se sgarra, viene scartato — la decisione resta quella deterministica.
function sanitizeCommentary(text) {
  if (!text) return null;
  const clean = text.trim();
  const vietato = /\b(COMPRA|VENDI|BUY|SELL|ACQUIST|VEND)/i.test(clean) || /€\s*\d/.test(clean) || /\d+\s*%/.test(clean);
  if (vietato) return null;
  if (clean.length > 400) return clean.slice(0, 400);
  return clean;
}

// L'LLM NON decide più: riceve la decisione già presa e scrive solo 1-2 frasi di contesto.
// Gli è vietato nominare azioni operative, ticker con verbi, importi o percentuali.
const TELEGRAM_PROMPT = `Sei Marco Ferretti, consulente crypto con 12 anni di esperienza.
La decisione operativa è GIÀ STATA PRESA dal motore quantitativo e ti viene fornita: NON puoi modificarla, aggiungere operazioni, togliere operazioni o inventare asset.

Il tuo unico compito: scrivere UNA nota di contesto di 1-2 frasi (max 40 parole) che inquadri il momento di mercato (Fear & Greed, regime, forza del trend). È un commento, NON una raccomandazione.

DIVIETI ASSOLUTI:
- Nessuna parola COMPRA/VENDI/BUY/SELL
- Nessun importo in € e nessuna percentuale
- Nessun nuovo ticker oltre a quelli presenti nei dati

Scrivi solo la nota, niente titoli né elenchi.`;

// Motivazione strategica di una singola allocazione
function allocReason(b, strategy) {
  if (b.defensive) return `DCA difensivo core, sotto-pesato (${(b.weight * 100).toFixed(0)}%)`;
  const parts = [`score +${b.score}`];
  if (b.isCore) {
    const target = strategy.targets[b.symbol];
    if (target != null) parts.push(b.weight < target
      ? `sotto-pesato ${(b.weight * 100).toFixed(0)}%→target ${(target * 100).toFixed(0)}%`
      : `core a target`);
  } else {
    if (b.outperf != null && b.outperf > 0) parts.push(`+${b.outperf.toFixed(0)}% vs BTC`);
    parts.push(`alloc ${(b.weight * 100).toFixed(0)}%/tetto ${(strategy.altMaxWeight * 100).toFixed(0)}%`);
  }
  parts.push(regimeTag(b.regime));
  return parts.join(', ') + levelsTag(b.levels);
}

// Rende il piano operativo in modo deterministico (mai dall'LLM). Core → 🔵, altcoin → 🟠.
function renderPlan(plan) {
  const { allocations, sells, strategy, mode } = plan;
  const modeLine = mode?.tilt
    ? `⚙️ Conservativo · tilt balanced ATTIVO — ${mode.reason}\n\n`
    : '⚙️ Conservativo\n\n';
  const coreBuys = allocations.filter(a => a.isCore);
  const altBuys  = allocations.filter(a => !a.isCore);

  const blueLines = [];
  for (const b of coreBuys) blueLines.push(`🟢 COMPRA €${b.eur} ${b.symbol} — ${allocReason(b, strategy)}`);
  for (const s of sells.filter(s => s.strong))
    blueLines.push(`🔴 VENDI 25% ${s.symbol} ~€${s.eur} — presa-profitto +${s.pnl.toFixed(0)}%, RSI ${s.rsi.toFixed(0)}`);

  const orangeLines = [];
  for (const b of altBuys) {
    const tag = b.inPortfolio ? 'COMPRA' : 'NUOVA POSIZIONE';
    orangeLines.push(`🟢 ${tag} €${b.eur} ${b.symbol} — ${allocReason(b, strategy)}`);
  }
  for (const s of sells.filter(s => !s.strong))
    orangeLines.push(`🔴 VENDI 25% ${s.symbol} ~€${s.eur} — presa-profitto +${s.pnl.toFixed(0)}%, RSI ${s.rsi.toFixed(0)}`);

  const fmt = (arr, empty) => arr.length ? arr.join('\n') : `⚪ NESSUNA AZIONE — ${empty}`;
  return `${modeLine}🔵 BASSO RISCHIO (core BTC/ETH)\n${fmt(blueLines, 'core non sotto-pesato o budget assente')}\n\n` +
         `🟠 MEDIO-BASSO RISCHIO (altcoin)\n${fmt(orangeLines, 'nessuna alt sopra soglia entro il tetto')}`;
}

async function getTelegramAdvice(portfolio, fearGreed, analyses, budgetEur, globalMetrics, watchlistAnalyses = []) {
  const plan = computeStrategicPlan(analyses, portfolio, budgetEur, fearGreed, watchlistAnalyses, globalMetrics);
  const sections = renderPlan(plan);

  // Nota di contesto dall'LLM — validata prima dell'uso. Se non passa, si usa un fallback deterministico.
  let commentary = null;
  try {
    const userMessage = buildAnalysisMessage(portfolio, fearGreed, analyses, budgetEur, globalMetrics, watchlistAnalyses)
      + `\n\n## DECISIONE OPERATIVA GIÀ PRESA (non modificabile)\n${sections}`;
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 200,
      system: TELEGRAM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });
    const raw = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    commentary = sanitizeCommentary(raw);
  } catch (err) {
    commentary = null;
  }

  if (!commentary) {
    commentary = `Fear & Greed ${fearGreed.value}/100 (${fearGreed.label}).`;
  }

  return `${sections}\n\n💬 ${commentary}`;
}

module.exports = { getAIAdvice, getTelegramAdvice, computeStrategicPlan, renderPlan };
