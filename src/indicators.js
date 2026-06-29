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

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta > 0) avgGain += delta;
    else avgLoss += Math.abs(delta);
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(delta, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-delta, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
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

module.exports = { calcRSI, calcSMA, calcEMA, calcMACD, calcBollingerBands };
