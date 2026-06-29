const { publicRequest } = require('./marketData');

async function getCandles(symbol, timeframe = '1D', count = 200) {
  const result = await publicRequest('public/get-candlestick', {
    instrument_name: `${symbol}_USD`,
    timeframe,
    count,
  });

  return result.data
    .map(c => ({
      timestamp: c.t,
      open: parseFloat(c.o),
      high: parseFloat(c.h),
      low: parseFloat(c.l),
      close: parseFloat(c.c),
      volume: parseFloat(c.v),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

module.exports = { getCandles };
