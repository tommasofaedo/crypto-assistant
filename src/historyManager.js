const fs   = require('fs');
const path = require('path');

const HISTORY_PATH = path.join(__dirname, '../data/history.json');
const MAX_ENTRIES  = 2000; // ~100 analisi × 13 asset

function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

function saveSnapshot(analyses, watchlistAnalyses = []) {
  try {
    const now = new Date().toISOString();
    const entries = [...analyses, ...watchlistAnalyses].map(a => ({
      date:        now,
      symbol:      a.symbol,
      signal:      a.signal,
      score:       a.score,
      rsi:         a.rsi  != null ? parseFloat(a.rsi.toFixed(1))     : null,
      priceEur:    a.priceEur != null ? parseFloat(a.priceEur.toFixed(4)) : null,
      macdHist:    a.macd?.histogram != null ? parseFloat(a.macd.histogram.toFixed(6)) : null,
      obvTrend:    a.volumeScore?.note?.includes('crescita') ? 'up'
                 : a.volumeScore?.note?.includes('calo')     ? 'down' : null,
      isWatchlist: a.isWatchlist ?? false,
    }));

    const history = loadHistory();
    history.push(...entries);
    const trimmed = history.length > MAX_ENTRIES ? history.slice(-MAX_ENTRIES) : history;
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(trimmed, null, 2));
  } catch (err) {
    console.warn('[history] Errore salvataggio:', err.message);
  }
}

module.exports = { saveSnapshot };
