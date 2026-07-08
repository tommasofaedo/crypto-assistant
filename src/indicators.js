function calcSMA(values, period) {
  return values.map((_, i) => {
    if (i < period - 1) return null;
    const slice = values.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

function calcEMA(values, period) {
  const k = 2 / (period + 1);
  const result = new Array(values.length).fill(null);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = ema;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    result[i] = ema;
  }
  return result;
}

// Serie RSI completa (allineata a closes, null durante il warmup) — base per StochRSI e divergenze
function calcRSISeries(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return out;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta > 0) avgGain += delta;
    else avgLoss += Math.abs(delta);
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(delta, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-delta, 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  return calcRSISeries(closes, period).at(-1);
}

// ATR (Average True Range, smoothing di Wilder) — volatilità assoluta per stop/target
function calcATR(candles, period = 14) {
  if (candles.length < period + 1) return null;
  const tr = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  let atr = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < tr.length; i++) {
    atr = (atr * (period - 1) + tr[i]) / period;
  }
  return atr;
}

// ADX + DMI (Wilder) — forza del trend (adx) e direzione (+DI vs -DI). Chiave per il regime.
function calcADX(candles, period = 14) {
  if (candles.length < period * 2 + 1) return null;
  const plusDM = [], minusDM = [], tr = [];
  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  // Somma smussata di Wilder
  const smooth = (arr) => {
    let s = arr.slice(0, period).reduce((a, b) => a + b, 0);
    const res = [s];
    for (let i = period; i < arr.length; i++) { s = s - s / period + arr[i]; res.push(s); }
    return res;
  };
  const trS = smooth(tr), pS = smooth(plusDM), mS = smooth(minusDM);
  const dx = [];
  for (let i = 0; i < trS.length; i++) {
    if (trS[i] === 0) { dx.push(0); continue; }
    const plusDI = 100 * pS[i] / trS[i];
    const minusDI = 100 * mS[i] / trS[i];
    const sum = plusDI + minusDI;
    dx.push(sum === 0 ? 0 : 100 * Math.abs(plusDI - minusDI) / sum);
  }
  if (dx.length < period) return null;
  let adx = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dx.length; i++) { adx = (adx * (period - 1) + dx[i]) / period; }
  return {
    adx,
    plusDI: trS.at(-1) ? 100 * pS.at(-1) / trS.at(-1) : 0,
    minusDI: trS.at(-1) ? 100 * mS.at(-1) / trS.at(-1) : 0,
  };
}

// Stochastic RSI — timing di ingresso/uscita più reattivo dell'RSI grezzo. Ritorna %K e %D (0–100).
function calcStochRSI(closes, rsiPeriod = 14, stochPeriod = 14, smoothK = 3, smoothD = 3) {
  const rsi = calcRSISeries(closes, rsiPeriod).filter(v => v !== null);
  if (rsi.length < stochPeriod + smoothK + smoothD) return null;
  const stoch = [];
  for (let i = stochPeriod - 1; i < rsi.length; i++) {
    const window = rsi.slice(i - stochPeriod + 1, i + 1);
    const lo = Math.min(...window), hi = Math.max(...window);
    stoch.push(hi === lo ? 0 : (rsi[i] - lo) / (hi - lo) * 100);
  }
  const kSeries = calcSMA(stoch, smoothK).filter(v => v !== null);
  const dSeries = calcSMA(kSeries, smoothD).filter(v => v !== null);
  if (!kSeries.length || !dSeries.length) return null;
  return { k: kSeries.at(-1), d: dSeries.at(-1) };
}

// Divergenza regolare prezzo/indicatore sugli ultimi `lookback` bar (bullish/bearish/null)
function detectDivergence(closes, indicator, lookback = 28) {
  const n = closes.length;
  if (n < lookback || indicator.length < n) return null;
  const half = Math.floor(lookback / 2);
  const p1 = closes.slice(n - lookback, n - half);
  const p2 = closes.slice(n - half);
  const i1 = indicator.slice(n - lookback, n - half).filter(v => v != null);
  const i2 = indicator.slice(n - half).filter(v => v != null);
  if (!i1.length || !i2.length) return null;
  const priceLowerLow = Math.min(...p2) < Math.min(...p1);
  const priceHigherHigh = Math.max(...p2) > Math.max(...p1);
  const indHigherLow = Math.min(...i2) > Math.min(...i1);
  const indLowerHigh = Math.max(...i2) < Math.max(...i1);
  if (priceLowerLow && indHigherLow) return 'bullish';   // prezzo scende ma momentum sale
  if (priceHigherHigh && indLowerHigh) return 'bearish';  // prezzo sale ma momentum cala
  return null;
}

// Forza relativa vs BTC su `period` bar — un asset che batte BTC è un leader, chi perde è un laggard
function calcRelativeStrength(assetCloses, btcCloses, period = 30) {
  if (!btcCloses || assetCloses.length < period + 1 || btcCloses.length < period + 1) return null;
  const aRet = assetCloses.at(-1) / assetCloses.at(-1 - period) - 1;
  const bRet = btcCloses.at(-1) / btcCloses.at(-1 - period) - 1;
  return {
    assetReturnPct: aRet * 100,
    btcReturnPct: bRet * 100,
    outperformancePct: (aRet - bRet) * 100,
  };
}

function calcMACD(closes, fast = 12, slow = 26, signalPeriod = 9) {
  if (closes.length < slow + signalPeriod) return null;
  const emaFast = calcEMA(closes, fast);
  const emaSlow = calcEMA(closes, slow);
  const macdLine = closes.map((_, i) =>
    emaFast[i] !== null && emaSlow[i] !== null ? emaFast[i] - emaSlow[i] : null
  ).filter(v => v !== null);

  if (macdLine.length < signalPeriod) return null;
  const signalLine = calcEMA(macdLine, signalPeriod);

  const last = macdLine.length - 1;
  const lastMacd = macdLine[last];
  const prevMacd = macdLine[last - 1];
  const lastSignal = signalLine[last];
  const prevSignal = signalLine[last - 1];

  return {
    macd: lastMacd,
    signal: lastSignal,
    histogram: lastMacd - lastSignal,
    bullishCrossover: prevMacd < prevSignal && lastMacd >= lastSignal,
    bearishCrossover: prevMacd > prevSignal && lastMacd <= lastSignal,
  };
}

function calcBollingerBands(closes, period = 20) {
  const sma = calcSMA(closes, period);
  const middle = sma[sma.length - 1];
  const slice = closes.slice(-period);
  const variance = slice.reduce((sum, v) => sum + Math.pow(v - middle, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  return {
    upper: middle + 2 * stdDev,
    middle,
    lower: middle - 2 * stdDev,
    bandwidth: (4 * stdDev) / middle * 100,
  };
}

function calcOBV(candles) {
  if (candles.length < 2) return [];
  let obv = 0;
  const result = [0];
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close)      obv += candles[i].volume;
    else if (candles[i].close < candles[i - 1].close) obv -= candles[i].volume;
    result.push(obv);
  }
  return result;
}

function calcVolumeScore(candles) {
  const hasVol = candles.some(c => c.volume > 0);
  if (!hasVol || candles.length < 21) return { points: 0, note: null };

  const vols = candles.map(c => c.volume);
  const avg20  = vols.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
  const lastVol = vols[vols.length - 1];
  const ratio   = avg20 > 0 ? lastVol / avg20 : 1;

  const obv          = calcOBV(candles);
  const obvRecentAvg = obv.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const obvPrevAvg   = obv.slice(-10, -5).reduce((a, b) => a + b, 0) / 5;
  const obvRising    = obvRecentAvg > obvPrevAvg;
  const priceUp      = candles[candles.length - 1].close >= candles[candles.length - 2].close;

  if (ratio >= 1.5) {
    const extra = `+${((ratio - 1) * 100).toFixed(0)}% sopra media`;
    if  (priceUp && obvRising)   return { points: +10, note: `Volume ${extra}, OBV crescente — momentum confermato` };
    if (!priceUp && !obvRising)  return { points: -10, note: `Volume ${extra}, OBV calante — pressione di vendita` };
    if  (priceUp && !obvRising)  return { points:  -5, note: `Rialzo su volume elevato ma OBV diverge — segnale misto` };
    return                              { points:  +5, note: `Calo su volume elevato ma OBV diverge rialzista — possibile inversione` };
  }

  if (ratio < 0.5) return { points: -3, note: `Volume basso (${(ratio * 100).toFixed(0)}% media 20gg) — segnali meno affidabili` };
  if (obvRising)   return { points: +3, note: 'OBV in crescita — accumulo graduale' };
  return                  { points: -3, note: 'OBV in calo — distribuzione graduale' };
}

function calcSupportResistance(candles, lookback = 5) {
  if (candles.length < lookback * 2 + 5) return null;

  const pivotHighs = [], pivotLows = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const slice = candles.slice(i - lookback, i + lookback + 1);
    if (candles[i].high >= Math.max(...slice.map(c => c.high))) pivotHighs.push(candles[i].high);
    if (candles[i].low  <= Math.min(...slice.map(c => c.low)))  pivotLows.push(candles[i].low);
  }

  const price      = candles[candles.length - 1].close;
  const support    = pivotLows.filter(p => p < price).sort((a, b) => b - a)[0] ?? null;
  const resistance = pivotHighs.filter(p => p > price).sort((a, b) => a - b)[0] ?? null;

  return { support, resistance };
}

function scoreSupportResistance(price, sr) {
  if (!sr) return { points: 0, note: null };
  const { support, resistance } = sr;
  const nearPct = (level) => Math.abs(price - level) / level * 100;

  if (support    && nearPct(support)    < 2) return { points: +8, note: `A ridosso del supporto $${support.toFixed(2)} — zona di rimbalzo` };
  if (resistance && nearPct(resistance) < 2) return { points: -8, note: `A ridosso della resistenza $${resistance.toFixed(2)} — possibile rifiuto` };
  if (support    && nearPct(support)    < 5) return { points: +4, note: `Vicino al supporto $${support.toFixed(2)}` };
  if (resistance && nearPct(resistance) < 5) return { points: -4, note: `Vicino alla resistenza $${resistance.toFixed(2)}` };

  return { points: 0, note: null };
}

module.exports = {
  calcRSI, calcRSISeries, calcSMA, calcEMA, calcMACD, calcBollingerBands,
  calcVolumeScore, calcSupportResistance, scoreSupportResistance,
  calcATR, calcADX, calcStochRSI, detectDivergence, calcRelativeStrength,
};
