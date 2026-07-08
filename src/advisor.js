const fs = require('fs');
const path = require('path');
const { getCandles, getMultiTimeframeCandles } = require('./historicalData');
const {
  calcRSI, calcRSISeries, calcSMA, calcMACD, calcBollingerBands, calcVolumeScore,
  calcSupportResistance, scoreSupportResistance,
  calcATR, calcADX, calcStochRSI, detectDivergence, calcRelativeStrength,
} = require('./indicators');
const { saveSnapshot } = require('./historyManager');
const { getFearGreedIndex } = require('./sentiment');
const { getNewsSentiment } = require('./newsSentiment');
const { getGlobalMetrics } = require('./globalMetrics');
const { getCoinGeckoEnrichment, getPrices } = require('./marketData');
const { analyzePortfolio } = require('./portfolioAnalyzer');

function loadWatchlist() {
  try {
    const fp = path.join(__dirname, '../data/watchlist.json');
    return JSON.parse(fs.readFileSync(fp, 'utf-8')).assets ?? [];
  } catch {
    return [];
  }
}

// Determina il regime di mercato dall'ADX/DMI: è la chiave che rende l'RSI contestuale.
function detectRegime(adx) {
  if (!adx) return { type: 'unknown', dir: 'flat', adx: null };
  const dir = adx.plusDI >= adx.minusDI ? 'up' : 'down';
  if (adx.adx >= 25) return { type: 'trending', dir, adx: adx.adx };
  if (adx.adx < 20)  return { type: 'ranging', dir, adx: adx.adx };
  return { type: 'transitional', dir, adx: adx.adx };
}

// RSI interpretato secondo il regime — un vero trader non legge l'RSI allo stesso modo
// in un trend forte e in un mercato laterale.
function scoreRSI(rsi, regime = { type: 'unknown', dir: 'flat' }) {
  if (rsi === null) return { points: 0, note: 'RSI non disponibile' };

  // Trend rialzista forte: RSI alto = forza (non vendere), pullback = occasione d'acquisto.
  if (regime.type === 'trending' && regime.dir === 'up') {
    if (rsi < 40)  return { points: +25, note: `RSI ${rsi.toFixed(0)} — pullback in trend rialzista forte, da comprare` };
    if (rsi < 50)  return { points: +15, note: `RSI ${rsi.toFixed(0)} — ritracciamento in uptrend` };
    if (rsi <= 78) return { points: +5,  note: `RSI ${rsi.toFixed(0)} — momentum sano in uptrend (non è un sell)` };
    return { points: -10, note: `RSI ${rsi.toFixed(0)} — esteso anche per un uptrend, cautela` };
  }

  // Trend ribassista forte: RSI basso NON è un buy (coltello che cade), rimbalzi = da vendere.
  if (regime.type === 'trending' && regime.dir === 'down') {
    if (rsi > 60)  return { points: -25, note: `RSI ${rsi.toFixed(0)} — rimbalzo in downtrend, da alleggerire` };
    if (rsi > 50)  return { points: -15, note: `RSI ${rsi.toFixed(0)} — debolezza in downtrend` };
    if (rsi >= 25) return { points: -5,  note: `RSI ${rsi.toFixed(0)} — ribasso in corso, non comprare il coltello` };
    return { points: +8, note: `RSI ${rsi.toFixed(0)} — ipervenduto estremo, possibile rimbalzo tecnico` };
  }

  // Range / transitional: mean-reversion classico.
  if (rsi < 25) return { points: +30, note: `RSI ${rsi.toFixed(0)} — ipervenduto forte (segnale BUY)` };
  if (rsi < 35) return { points: +20, note: `RSI ${rsi.toFixed(0)} — zona ipervenduto` };
  if (rsi < 45) return { points: +10, note: `RSI ${rsi.toFixed(0)} — lieve debolezza, possibile opportunità` };
  if (rsi <= 55) return { points: 0,  note: `RSI ${rsi.toFixed(0)} — neutro` };
  if (rsi <= 65) return { points: -10, note: `RSI ${rsi.toFixed(0)} — lievemente ipercomprato` };
  if (rsi <= 75) return { points: -20, note: `RSI ${rsi.toFixed(0)} — zona ipercomprato` };
  return { points: -30, note: `RSI ${rsi.toFixed(0)} — ipercomprato forte (segnale SELL)` };
}

// Forza del trend (ADX) come conferma LEGGERA. La direzione del trend è già pesata da
// scoreTrend (struttura SMA): qui aggiungiamo solo un piccolo peso per non contare due volte.
function scoreADX(regime) {
  if (regime.type === 'unknown') return { points: 0, note: null };
  const a = regime.adx.toFixed(0);
  if (regime.type === 'trending' && regime.dir === 'up')   return { points: +5, note: `ADX ${a} — trend rialzista solido (+DI>-DI)` };
  if (regime.type === 'trending' && regime.dir === 'down') return { points: -5, note: `ADX ${a} — trend ribassista solido (-DI>+DI)` };
  if (regime.type === 'ranging') return { points: 0, note: `ADX ${a} — mercato laterale, prevale la mean-reversion` };
  return { points: 0, note: `ADX ${a} — trend in formazione` };
}

// Stochastic RSI: timing più fine, con conferma dal cross K/D.
function scoreStochRSI(st) {
  if (!st) return { points: 0, note: null };
  const { k, d } = st;
  if (k < 20 && k >= d) return { points: +8, note: `StochRSI ${k.toFixed(0)} — ipervenduto in risalita (K>D)` };
  if (k < 20)           return { points: +4, note: `StochRSI ${k.toFixed(0)} — ipervenduto` };
  if (k > 80 && k <= d) return { points: -8, note: `StochRSI ${k.toFixed(0)} — ipercomprato in calo (K<D)` };
  if (k > 80)           return { points: -4, note: `StochRSI ${k.toFixed(0)} — ipercomprato` };
  return { points: 0, note: null };
}

// Forza relativa vs BTC su 30 giorni — leader o laggard del mercato.
function scoreRelativeStrength(rs, symbol) {
  if (!rs || symbol === 'BTC') return { points: 0, note: null };
  const o = rs.outperformancePct;
  if (o >= 15)  return { points: +8, note: `Forza relativa +${o.toFixed(0)}% vs BTC (30gg) — leader` };
  if (o >= 5)   return { points: +4, note: `Batte BTC di ${o.toFixed(0)}% (30gg)` };
  if (o <= -15) return { points: -8, note: `Debolezza relativa ${o.toFixed(0)}% vs BTC (30gg) — laggard` };
  if (o <= -5)  return { points: -4, note: `Sotto BTC di ${Math.abs(o).toFixed(0)}% (30gg)` };
  return { points: 0, note: null };
}

// Divergenza prezzo/RSI — segnale anticipatore di inversione.
function scoreDivergence(div) {
  if (div === 'bullish') return { points: +12, note: 'Divergenza rialzista prezzo/RSI — possibile inversione al rialzo' };
  if (div === 'bearish') return { points: -12, note: 'Divergenza ribassista prezzo/RSI — possibile inversione al ribasso' };
  return { points: 0, note: null };
}

// Trend di un singolo timeframe: ADX-direzione se in trend, altrimenti prezzo vs SMA.
function timeframeTrend(candles) {
  if (!candles || candles.length < 50) return null;
  const closes = candles.map(c => c.close);
  const period = Math.min(50, Math.floor(closes.length / 2));
  const sma = calcSMA(closes, period).at(-1);
  const adx = calcADX(candles);
  if (adx && adx.adx >= 25) return adx.plusDI >= adx.minusDI ? 'up' : 'down';
  return closes.at(-1) >= sma ? 'up' : 'down';
}

// Confluenza multi-timeframe: settimanale (fondo) + giornaliero (setup) + 4h (timing).
function scoreMTF(daily, weekly, fourH) {
  const wt = timeframeTrend(weekly), dt = timeframeTrend(daily), ft = timeframeTrend(fourH);
  const arrow = t => t === 'up' ? '↑' : t === 'down' ? '↓' : '·';
  const parts = [];
  if (wt) parts.push(`settimanale ${arrow(wt)}`);
  if (dt) parts.push(`giornaliero ${arrow(dt)}`);
  if (ft) parts.push(`4h ${arrow(ft)}`);

  // Peso contenuto: il MTF aggiunge il contesto di timeframe superiore, ma la direzione
  // del trend è già nell'SMA giornaliero — evitiamo di contarla una terza volta.
  let points = 0;
  if (wt && dt && wt === dt) points = wt === 'up' ? +5 : -5;          // il fondo conferma il giornaliero
  if (wt && dt && ft && wt === dt && ft === dt) points = wt === 'up' ? +8 : -8; // allineamento pieno
  const note = parts.length ? `Multi-timeframe: ${parts.join(', ')}` : null;
  return { points, note };
}

function scoreTrend(price, sma50, sma200) {
  if (!sma50 || !sma200) return { points: 0, note: 'Dati trend insufficienti' };
  const above50 = price > sma50;
  const above200 = price > sma200;
  const goldenCross = sma50 > sma200;

  if (above50 && above200 && goldenCross)
    return { points: +25, note: 'Trend rialzista forte (sopra SMA50 e SMA200, golden cross)' };
  if (above50 && above200)
    return { points: +15, note: 'Trend rialzista (sopra entrambe le medie mobili)' };
  if (above200)
    return { points: +5,  note: 'Sopra SMA200 ma sotto SMA50 — attenzione al breve termine' };
  if (above50)
    return { points: -5,  note: 'Sopra SMA50 ma sotto SMA200 — trend di lungo periodo debole' };
  if (!above50 && !above200 && !goldenCross)
    return { points: -25, note: 'Trend ribassista forte (sotto SMA50 e SMA200, death cross)' };
  return { points: -10, note: 'Trend ribassista (sotto entrambe le medie mobili)' };
}

function scoreMACDResult(macd) {
  if (!macd) return { points: 0, note: 'MACD non disponibile' };
  if (macd.bullishCrossover)
    return { points: +20, note: 'MACD crossover rialzista — segnale di acquisto' };
  if (macd.bearishCrossover)
    return { points: -20, note: 'MACD crossover ribassista — segnale di vendita' };
  if (macd.macd > 0 && macd.histogram > 0)
    return { points: +10, note: 'MACD positivo e in crescita — momentum rialzista' };
  if (macd.macd < 0 && macd.histogram < 0)
    return { points: -10, note: 'MACD negativo e in calo — momentum ribassista' };
  return { points: 0, note: `MACD ${macd.macd > 0 ? 'positivo' : 'negativo'} — nessun segnale forte` };
}

function scoreBB(price, bb) {
  if (!bb) return { points: 0, note: 'Bande di Bollinger non disponibili' };
  const bandwidth = bb.upper - bb.lower;
  const posInBand = (price - bb.lower) / bandwidth;

  if (price <= bb.lower)
    return { points: +15, note: 'Prezzo sotto la banda inferiore di Bollinger — ipervenduto' };
  if (posInBand < 0.2)
    return { points: +8,  note: 'Prezzo nella parte bassa delle Bande di Bollinger' };
  if (posInBand > 0.8)
    return { points: -8,  note: 'Prezzo nella parte alta delle Bande di Bollinger' };
  if (price >= bb.upper)
    return { points: -15, note: 'Prezzo sopra la banda superiore di Bollinger — ipercomprato' };
  return { points: 0, note: 'Prezzo nella zona centrale delle Bande di Bollinger' };
}

function scoreChange24h(changePct) {
  if (changePct < -8)  return { points: -5,  note: `Calo brusco 24h: ${changePct.toFixed(2)}% — possibile panico` };
  if (changePct < -4)  return { points: 0,   note: `Calo 24h: ${changePct.toFixed(2)}%` };
  if (changePct > 15)  return { points: -5,  note: `Balzo eccessivo 24h: +${changePct.toFixed(2)}% — possibile correzione` };
  return { points: 0, note: null };
}

function toSignal(score) {
  if (score >= 50) return 'STRONG BUY';
  if (score >= 20) return 'BUY';
  if (score > -20) return 'HOLD';
  if (score > -50) return 'SELL';
  return 'STRONG SELL';
}

function toAction(signal, symbol, quantity, allocationPct, isWatchlist = false) {
  if (isWatchlist) {
    switch (signal) {
      case 'STRONG BUY': return `Segnale forte: valuta di aprire una posizione su ${symbol}`;
      case 'BUY':        return `Buon momento per aprire una posizione su ${symbol}`;
      default:           return `Nessun segnale di ingresso su ${symbol} al momento`;
    }
  }
  switch (signal) {
    case 'STRONG BUY':
      return `Considera di aumentare la posizione ${symbol} del 20-30%`;
    case 'BUY':
      return `Buon momento per aumentare ${symbol} del 10-15%`;
    case 'HOLD':
      return `Mantieni la posizione attuale su ${symbol}`;
    case 'SELL':
      return allocationPct > 5
        ? `Considera di ridurre ${symbol} del 20-25% per prendere profitto`
        : `Segnale di vendita su ${symbol}, ma posizione già piccola — valuta se uscire`;
    case 'STRONG SELL':
      return `Segnale forte: riduci ${symbol} del 30-40% o esci dalla posizione`;
  }
}

async function analyzeAsset(holding, fgScore, newsData, cgEnrichment, btcCloses = null) {
  const { daily, weekly, fourH } = await getMultiTimeframeCandles(holding.symbol);
  const candles = daily;
  const closes  = candles.map(c => c.close);
  const price   = closes[closes.length - 1];

  const rsi     = calcRSI(closes, 14);
  const rsiSer  = calcRSISeries(closes, 14);
  const sma50   = calcSMA(closes, 50).at(-1);
  const sma200  = calcSMA(closes, 200).at(-1);
  const macd    = calcMACD(closes);
  const bb      = calcBollingerBands(closes, 20);
  const volScore = calcVolumeScore(candles);
  const sr       = calcSupportResistance(candles);
  const srScore  = scoreSupportResistance(price, sr);

  // Nuovi indicatori "da esperto"
  const adx      = calcADX(candles);
  const regime   = detectRegime(adx);
  const atr      = calcATR(candles, 14);
  const atrPct   = atr != null ? atr / price * 100 : null;
  const stochRSI = calcStochRSI(closes);
  const divergence = detectDivergence(closes, rsiSer, 28);
  const rs       = calcRelativeStrength(closes, btcCloses, 30);

  const rsiScore   = scoreRSI(rsi, regime);        // ← ora contestuale al regime
  const trendScore = scoreTrend(price, sma50, sma200);
  const macdScore  = scoreMACDResult(macd);
  const bbScore    = scoreBB(price, bb);
  const adxScore   = scoreADX(regime);
  const stochScore = scoreStochRSI(stochRSI);
  const rsScore    = scoreRelativeStrength(rs, holding.symbol);
  const divScore   = scoreDivergence(divergence);
  const mtfScore   = scoreMTF(daily, weekly, fourH);

  const news = newsData?.[holding.symbol] ?? { score: 0, label: 'n/d', headlines: [], count: 0 };
  const sentimentNote = news.count > 0
    ? `Community sentiment: ${news.label} (score ${news.score > 0 ? '+' : ''}${news.score})`
    : null;

  const total = rsiScore.points + trendScore.points + macdScore.points + bbScore.points
              + volScore.points + srScore.points + adxScore.points + stochScore.points
              + rsScore.points + divScore.points + mtfScore.points + fgScore + news.score;
  const signal = toSignal(total);

  const reasons = [
    rsiScore.note, adxScore.note, trendScore.note, macdScore.note, bbScore.note,
    stochScore.note, mtfScore.note, volScore.note, srScore.note,
    divScore.note, rsScore.note, sentimentNote,
  ].filter(Boolean);

  // Livelli operativi da ATR (percentuali, currency-agnostic): stop 1.5×ATR, target 3×ATR
  const levels = atrPct != null ? {
    atrPct,
    stopPct:   -1.5 * atrPct,
    targetPct: +3.0 * atrPct,
  } : null;

  const enrich = cgEnrichment?.[holding.symbol] ?? null;

  return {
    symbol:      holding.symbol,
    name:        holding.name,
    signal,
    score:       total,
    rsi,
    sma50,
    sma200,
    macd:        macd ? { value: macd.macd, histogram: macd.histogram } : null,
    bb,
    sr,
    volumeScore: volScore,
    regime,
    adx:         adx ? { adx: adx.adx, plusDI: adx.plusDI, minusDI: adx.minusDI } : null,
    stochRSI,
    divergence,
    relativeStrength: rs,
    levels,
    news,
    reasons,
    action:      toAction(signal, holding.symbol, holding.quantity, holding.allocationPct, holding.isWatchlist),
    isWatchlist: holding.isWatchlist ?? false,
    priceEur:          holding.priceEur       ?? null,
    change24hPct:      holding.change24hPct   ?? null,
    athChangePct:      enrich?.athChangePct    ?? null,
    marketCapRank:     enrich?.marketCapRank   ?? null,
    priceChange7dPct:  enrich?.priceChange7dPct ?? null,
  };
}

async function runAdvisor() {
  const watchlist = loadWatchlist();
  const watchlistSymbols = watchlist.map(w => w.symbol);

  const [portfolio, fearGreed] = await Promise.all([
    analyzePortfolio(),
    getFearGreedIndex(),
  ]);

  const portfolioSymbols = portfolio.holdings.map(h => h.symbol);
  const allSymbols = [...portfolioSymbols, ...watchlistSymbols];

  // Enrichment e global metrics in parallelo (endpoint batch, non individuali)
  const [globalMetrics, cgEnrichment] = await Promise.all([
    getGlobalMetrics(),
    getCoinGeckoEnrichment(allSymbols),
  ]);
  // Sentiment separato: fa 13 call individuali con sleep 2s — evita conflitti rate limit
  const newsData = await getNewsSentiment(allSymbols);

  // Benchmark BTC per la forza relativa (una sola fetch, riusata da tutti gli asset)
  let btcCloses = null;
  try {
    btcCloses = (await getCandles('BTC', '1D', 200)).map(c => c.close);
  } catch (err) {
    console.log(`[BTC benchmark] non disponibile: ${err.message}`);
  }

  // Sequenziale per rispettare il rate limit di CoinGecko free tier
  const analyses = [];
  for (const h of portfolio.holdings) {
    analyses.push(await analyzeAsset(h, fearGreed.score, newsData, cgEnrichment, btcCloses));
  }

  // Analisi watchlist — fetch prezzi + analisi tecnica
  const watchlistAnalyses = [];
  if (watchlistSymbols.length > 0) {
    const { prices: wPrices } = await getPrices(watchlistSymbols);
    for (const w of watchlist) {
      const market = wPrices[w.symbol];
      const holding = {
        symbol: w.symbol,
        name: w.name,
        quantity: 0,
        allocationPct: 0,
        isWatchlist: true,
        priceEur: market?.priceEur ?? null,
        change24hPct: market?.change24hPct ?? null,
      };
      watchlistAnalyses.push(await analyzeAsset(holding, fearGreed.score, newsData, cgEnrichment, btcCloses));
    }
  }

  const sortedAnalyses  = analyses.sort((a, b) => b.score - a.score);
  const sortedWatchlist = watchlistAnalyses.sort((a, b) => b.score - a.score);

  saveSnapshot(sortedAnalyses, sortedWatchlist);

  return {
    portfolio,
    fearGreed,
    globalMetrics,
    newsData,
    analyses:         sortedAnalyses,
    watchlistAnalyses: sortedWatchlist,
  };
}

module.exports = { runAdvisor };
