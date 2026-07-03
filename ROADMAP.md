# Roadmap — Marco Ferretti

Miglioramenti pianificati, in ordine di priorità.

---

## ✅ Completati

### Retry su Crypto.com (03/07/2026)
Le chiamate a Crypto.com ticker e candlestick usavano `axios.get()` diretto senza retry.
Un 520/502 transitorio crashava l'intera analisi. Aggiunta funzione `cdcGet` con backoff
5s × tentativo (max 3 tentativi) in `marketData.js` e `historicalData.js`.

### News sentiment reale con CryptoPanic (03/07/2026)
`newsSentiment.js` era uno stub che restituiva sempre 0. Integrata l'API CryptoPanic
(piano free, registrazione su cryptopanic.com). Analizza i voti (positive/negative/liked/toxic)
degli ultimi articoli per ogni asset e calcola un punteggio da -5 a +5 che alimenta lo score
tecnico. Richiede `CRYPTOPANIC_API_KEY` nel `.env` — graceful fallback a 0 se assente.

---

## 🔲 Da fare

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
**Impatto:** medio — permette di misurare l'accuratezza di Marco nel tempo  
**Sforzo:** medio

Ogni raccomandazione viene generata e dimenticata. Salvare in `data/history.json` le
azioni consigliate con timestamp, prezzi al momento del consiglio e segnali tecnici.
Permetterebbe di:
- Verificare se i BUY/SELL si sono rivelati corretti a posteriori
- Calibrare i pesi degli indicatori (es. aumentare il peso MACD se si dimostra più
  predittivo di RSI su questo portafoglio specifico)
- Generare un "report di performance" mensile

**Implementazione:** `data/history.json` con struttura `[{date, symbol, action, price, score, rsi}]`.
`advisor.js` appende l'entry dopo ogni analisi. Nuovo comando `node history-report.js` per il riepilogo.

---

### 5. Prezzo medio di carico in portfolio.json
**Impatto:** medio — P&L reale per asset, consigli di vendita contestualizzati  
**Sforzo:** basso

`portfolio.json` ha il campo `avgBuyPrice` ma è sempre 0. Inserendo i prezzi medi di
acquisto, Marco potrebbe:
- Mostrare P&L % e EUR per ogni asset nell'analisi
- Dare consigli di vendita contestualizzati ("sei in profitto del 23%, considera di
  prenderne una parte")
- Calibrare i target di uscita in modo personalizzato

**Implementazione:** aggiornare manualmente `avgBuyPrice` in `portfolio.json` dopo ogni trade.
Modificare `portfolioAnalyzer.js` e `buildAnalysisMessage()` per mostrare P&L dove disponibile.

---

### 6. Volume negli indicatori
**Impatto:** basso-medio — migliora la qualità dei segnali su altcoin  
**Sforzo:** medio

RSI, MACD e Bollinger ignorano il volume. Un rally su volume basso è molto meno significativo
di uno su volume alto — in crypto questa distinzione è spesso decisiva.

Aggiungere un semplice indicatore:
- **OBV (On-Balance Volume)**: cumulativo, misura se il volume segue il trend
- Oppure più semplice: confronto volume corrente vs media 20gg (+/-30% = anomalia)
- Contributo allo score: +5/-5 in caso di divergenza volume/prezzo significativa

**Implementazione:** aggiungere `calcVolumeScore()` in `indicators.js`.
Le candele Crypto.com già includono il volume — dati già disponibili, solo da usare.

---

### 7. Retry e resilienza su Frankfurter (cambio EUR/USD)
**Impatto:** basso — ma un errore qui blocca l'intera analisi  
**Sforzo:** minimo

`getUsdEurRate()` in `marketData.js` usa `axios.get()` diretto su Frankfurter.
Aggiungere retry 5xx come fatto per Crypto.com e CoinGecko.
Alternativa: cachare il tasso EUR/USD per 1h e usare il valore precedente come fallback.

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
