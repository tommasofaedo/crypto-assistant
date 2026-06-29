const { getCandles } = require('./historicalData');
const { calcRSI, calcSMA, calcMACD, calcBollingerBands } = require('./indicators');
const { getFearGreedIndex } = require('./sentiment');
const { getNewsSentiment } = require('./newsSentiment');
const { getGlobalMetrics } = require('./globalMetrics');
const { analyzePortfolio } = require('./portfolioAnalyzer');

function scoreRSI(rsi) {
  if (rsi === null) return { points: 0, note: 'RSI non disponibile' };
  if (rsi < 25) return { points: +30, note: `RSI ${rsi.toFixed(0)} — ipervenduto forte (segnale BUY)` };
  if (rsi < 35) return { points: +20, note: `RSI ${rsi.toFixed(0)} — zona ipervenduto` };
  if (rsi < 45) return { points: +10, note: `RSI ${rsi.toFixed(0)} — lieve debolezza, possibile opportunità` };
  if (rsi <= 55) return { points: 0,  note: `RSI ${rsi.toFixed(0)} — neutro` };
  if (rsi <= 65) return { points: -10, note: `RSI ${rsi.toFixed(0)} — lievemente ipercomprato` };
  if (rsi <= 75) return { points: -20, note: `RSI ${rsi.toFixed(0)} — zona ipercomprato` };
  return { points: -30, note: `RSI ${rsi.toFixed(0)} — ipercomprato forte (segnale SELL)` };
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

function toAction(signal, symbol, quantity, allocationPct) {
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

async function analyzeAsset(holding, fgScore, newsData) {
  const candles = await getCandles(holding.symbol, '1D', 200);
  const closes = candles.map(c => c.close);
  const price = closes[closes.length - 1];

  const rsi = calcRSI(closes, 14);
  const sma50 = calcSMA(closes, 50).at(-1);
  const sma200 = calcSMA(closes, 200).at(-1);
  const macd = calcMACD(closes);
  const bb = calcBollingerBands(closes, 20);

  const rsiScore = scoreRSI(rsi);
  const trendScore = scoreTrend(price, sma50, sma200);
  const macdScore = scoreMACDResult(macd);
  const bbScore = scoreBB(price, bb);

  const news = newsData?.[holding.symbol] ?? { score: 0, label: 'neutro', headlines: [], count: 0 };
  const newsNote = news.count > 0
    ? `News sentiment: ${news.label} (${news.count} articoli — score ${news.score > 0 ? '+' : ''}${news.score})`
    : null;

  const total = rsiScore.points + trendScore.points + macdScore.points + bbScore.points + fgScore + news.score;
  const signal = toSignal(total);

  const reasons = [rsiScore.note, trendScore.note, macdScore.note, bbScore.note, newsNote]
    .filter(Boolean);

  return {
    symbol: holding.symbol,
    name: holding.name,
    signal,
    score: total,
    rsi,
    sma50,
    sma200,
    macd: macd ? { value: macd.macd, histogram: macd.histogram } : null,
    bb,
    news,
    reasons,
    action: toAction(signal, holding.symbol, holding.quantity, holding.allocationPct),
  };
}

async function runAdvisor() {
  const [portfolio, fearGreed] = await Promise.all([
    analyzePortfolio(),
    getFearGreedIndex(),
  ]);

  const symbols = portfolio.holdings.map(h => h.symbol);
  const [newsData, globalMetrics] = await Promise.all([
    getNewsSentiment(symbols),
    getGlobalMetrics(),
  ]);

  // Sequenziale per rispettare il rate limit di CoinGecko free tier
  const analyses = [];
  for (const h of portfolio.holdings) {
    analyses.push(await analyzeAsset(h, fearGreed.score, newsData));
  }

  return {
    portfolio,
    fearGreed,
    globalMetrics,
    newsData,
    analyses: analyses.sort((a, b) => b.score - a.score),
  };
}

module.exports = { runAdvisor };
