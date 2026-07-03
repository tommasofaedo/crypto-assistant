# Roadmap — Marco Ferretti

Miglioramenti pianificati, in ordine di priorità.

---

## ✅ Completati

### Retry su Crypto.com (03/07/2026)
Le chiamate a Crypto.com ticker e candlestick usavano `axios.get()` diretto senza retry.
Un 520/502 transitorio crashava l'intera analisi. Aggiunta funzione `cdcGet` con backoff
5s × tentativo (max 3 tentativi) in `marketData.js` e `historicalData.js`.

### Retry su Crypto.com esteso (03/07/2026)
`cdcGet` con backoff 5s × tentativo aggiunto anche alle chiamate Crypto.com ticker
e candlestick, non solo CoinGecko. Un 520/502 transitorio non crasha più l'analisi.

### Retry su Frankfurter EUR/USD (#7) (03/07/2026)
`getUsdEurRate()` in `marketData.js` ora usa retry con backoff 5s su errori 5xx e di rete.
Un errore transitorio del tasso EUR/USD non blocca più l'intera analisi.

### Volume + OBV negli indicatori (#6) (03/07/2026)
Aggiunti `calcVolumeScore()` e `calcOBV()` in `indicators.js`. Range -10/+10.
Un rally su volume basso è penalizzato (-3/-5); momentum confermato da OBV è premiato (+5/+10).
Le candele Crypto.com includono già il volume — dati già presenti, ora utilizzati.

### Support/Resistance automatici (03/07/2026)
`calcSupportResistance()` e `scoreSupportResistance()` in `indicators.js`. Range -8/+8.
Calcola pivot high/low dagli ultimi 200gg e determina il supporto/resistenza più vicino al prezzo attuale.
Marco ora sa se il prezzo è in zona di rimbalzo o di rifiuto storico.

### CoinGecko community sentiment (#2) (03/07/2026)
`newsSentiment.js` reimplementato con `/coins/{id}` CoinGecko. Range -5/+5.
Restituisce `sentiment_votes_up_percentage` per ogni asset. Cache in-memory 1h.
13 call individuali con sleep 2s — prima analisi ~26s extra, poi cached.

### Storico raccomandazioni (#4) (03/07/2026)
Nuovo `src/historyManager.js`. Ogni analisi salva in `data/history.json`:
data, symbol, signal, score, RSI, prezzo EUR, MACD histogram, OBV trend, isWatchlist.
Permette di misurare l'accuratezza di Marco nel tempo e calibrare i pesi.

### P&L per asset — codice pronto (03/07/2026)
`portfolioAnalyzer.js` calcolava già `pnlEur`/`pnlPct` quando `avgBuyPrice > 0`.
Ora mostrati in locale e nel messaggio all'AI. Richiede compilare `avgBuyPrice` in `portfolio.json`.

---

## 🔲 Da fare

### 2. News sentiment reale
**Impatto:** alto — dimensione oggi parzialmente coperta da community sentiment  
**Sforzo:** medio  
**Stato:** ✅ parziale — CoinGecko community sentiment implementato (03/07/2026)

Alternative valutate e stato:

| Fonte | Costo | Stato |
|-------|-------|-------|
| CryptoPanic | Gratis → ora **a pagamento** | ❌ eliminato |
| **CoinGecko community sentiment** | Gratis | 🔲 fattibile — `/coins/{id}` restituisce `sentiment_votes_up_percentage`. Richiede una call per asset (13 call separate, ~30s extra). Da implementare con cache 1h |
| RSS CoinDesk/CoinTelegraph + keyword | Gratis, no auth | 🔲 fattibile — parsing RSS + lista keyword bullish/bearish. Più rozzo ma zero dipendenze |
| LunarCrush / Santiment | A pagamento | ❌ fuori budget |

**Prossimo passo consigliato:** CoinGecko community sentiment — già nell'infrastruttura,
zero nuove dipendenze. Batching non possibile, quindi aggiungere sleep 2s tra call
e cachare il risultato per 1h per non sovraccaricare il free tier.

---

### 3. Allerta proattiva su Telegram
**Impatto:** alto — Marco diventa proattivo, non solo reattivo  
**Sforzo:** basso

Aggiungere un checker periodico (es. ogni 4h nel `daily-report.yml`) che esegue l'analisi
senza input dell'utente e invia un alert su Telegram **solo** se un asset supera una soglia
critica: RSI sotto 30, score sopra +35, o segnale STRONG BUY/STRONG SELL.
L'utente riceve una notifica solo quando c'è qualcosa di concreto da valutare,
senza dover chiedere manualmente.

**Implementazione:** nuovo workflow GHA `alert-checker.yml` (cron ogni 4h),
nuovo script `telegram-alert.js` che chiama `runAdvisor()` e invia solo se ci sono
segnali sopra soglia. Aggiungere flag `--silent` che non invia nulla se tutto è HOLD.

---

### 4. Storico raccomandazioni
**Stato:** ✅ implementato (03/07/2026) — vedi sezione Completati

---

### 5. Prezzo medio di carico in portfolio.json
**Impatto:** medio — P&L reale per asset, consigli di vendita contestualizzati  
**Sforzo:** zero (codice già pronto)

Il codice mostra già P&L se `avgBuyPrice > 0` in `portfolio.json`.
**Prossimo passo: inserire manualmente i prezzi medi di acquisto in `portfolio.json`.**

---

### 6. Volume negli indicatori
**Stato:** ✅ implementato (03/07/2026) — vedi sezione Completati

---

### 7. Retry su Frankfurter
**Stato:** ✅ implementato (03/07/2026) — vedi sezione Completati

---

### 8. Deduplicazione messaggi PM2/GHA con file lock
**Impatto:** basso (già mitigato) — eliminerebbe il residuo 5min di rischio duplicato  
**Sforzo:** basso

Il fix attuale (60s wait + skip dopo 5 × 409) riduce ma non azzera la race condition
nei primi 5 minuti di ogni finestra GHA. Soluzione definitiva: scrivere l'`update_id`
dell'ultimo messaggio processato in `data/last_update_id.txt`.
PM2 legge il file prima di processare: se l'`update_id` è già presente, skippa.
GHA è su runner diverso, quindi non condivide il file — ma PM2 sì, e il problema
principale è PM2 che duplica in locale.

---

## 💡 Idee future (non pianificate)

- **On-chain data**: Glassnode o Nansen free tier per flussi whale/exchange inflow
- **Correlazione BTC**: se BTC scende >3% in 1h, invia alert automatico su tutto il portafoglio
- **Aggiornamento automatico portfolio.json**: quando `wapi.crypto.com` sarà operativo,
  leggere i saldi direttamente dall'App senza aggiornamento manuale
- **Dashboard web**: interfaccia React/Next.js che mostra portfolio, segnali e storico
  in tempo reale (richiede server pubblico)
- **Backtesting**: testare la strategia RSI+MACD+Bollinger su dati storici per validare
  i parametri prima di usarli sul portafoglio reale
