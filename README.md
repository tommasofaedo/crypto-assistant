# Crypto Assistant — Marco Ferretti

Analisi tecnica automatica del portafoglio crypto con raccomandazioni AI in italiano. Tre modalità operative: locale via CLI, bot Telegram interattivo, report automatici via GitHub Actions.

## Funzionalità

- Prezzi e storici live da **Crypto.com Exchange API** (fallback CoinGecko), con retry automatico su errori 5xx
- **Analisi multi-timeframe** (settimanale + giornaliero + 4h) con 13 fattori tecnici calcolati in locale: RSI(14), SMA50/200, MACD, Bande di Bollinger, **ADX/DMI**, **StochRSI**, **ATR**, **divergenze prezzo/RSI**, **forza relativa vs BTC**, Volume/OBV, Supporti/Resistenze, Fear & Greed, Community Sentiment
- **Scoring regime-aware**: l'RSI viene interpretato secondo il regime di mercato (trend forte vs laterale) rilevato dall'ADX — l'RSI alto in un trend rialzista non è più penalizzato come "vendita"
- **Decisione 100% deterministica in codice**: l'AI non può inventare segnali, asset o importi — produce solo una nota di contesto validata (scartata se contiene azioni operative o importi)
- **Layer strategico di portafoglio** (`data/strategy.json`): ogni euro del budget va dove rende di più aggiustato per il rischio — favorisce la qualità sotto-pesata (BTC/ETH), **blocca la sovra-concentrazione** su singole altcoin (tetto configurabile), alloca il budget tra core e miglior alt
- **Postura adattiva**: base conservativa con tilt automatico verso balanced solo quando i dati lo giustificano (alt ad alta convinzione o altseason oggettiva)
- **Vendita disciplinata**: solo presa-profitto su winner maturi (P&L ≥ +40% e RSI ≥ 65) — mai vendere in perdita
- **Livelli operativi**: ogni acquisto esce con stop-loss e target concreti calcolati da ATR
- **Watchlist**: analisi tecnica su asset non in portafoglio — segnala solo opportunità di acquisto (mai vendita)
- **Coerenza garantita**: locale e Telegram usano la stessa funzione — la raccomandazione è identica su entrambi i canali
- Bot Telegram con long polling — risponde a `/analisi 100` o linguaggio naturale
- Report giornaliero automatico ogni mattina via GitHub Actions (costo ~€0/mese su repo pubblica), con **budget default €30/giorno**

## Struttura

```
crypto_assistant/
├── src/
│   ├── advisor.js           # orchestratore: analisi multi-timeframe + scoring regime-aware
│   ├── indicators.js        # RSI, MACD, SMA, Bollinger, ADX/DMI, StochRSI, ATR, divergenze, forza rel.
│   ├── portfolioAnalyzer.js # prezzi live, P&L, allocazione
│   ├── aiAdvisor.js         # decisione strategica deterministica + nota di contesto validata
│   ├── marketData.js        # prezzi live (Crypto.com + CoinGecko fallback)
│   ├── historicalData.js    # candele multi-timeframe 1D/7D/4h (Crypto.com + CoinGecko fallback)
│   ├── sentiment.js         # Fear & Greed Index (alternative.me)
│   ├── globalMetrics.js     # market cap, BTC dominance, altcoin season (CoinGecko)
│   └── newsSentiment.js     # community sentiment (CoinGecko)
├── local-advisor.js         # CLI locale — stampa dati + raccomandazione identica a Telegram
├── telegram-bot.js          # bot Telegram (long polling, PM2)
├── telegram-report.js       # report automatico GHA
├── data/portfolio.json      # quantità asset detenuti
├── data/watchlist.json      # asset non in portafoglio da monitorare
├── data/strategy.json       # postura di rischio: pesi target, tetti, ripartizione budget, tilt adattivo
└── .github/workflows/
    ├── daily-report.yml     # report mattutino 09:00 IT (budget default €30)
    └── telegram-bot.yml     # bot attivo 20h/giorno in 4 finestre da 5h
```

## Setup

### 1. Installa dipendenze

```bash
npm install
```

### 2. Configura le variabili d'ambiente

Copia `.env.example` in `.env` e compila:

```env
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
CRYPTO_API_KEY=...
CRYPTO_API_SECRET=...
```

### 3. Configura il portafoglio

Modifica `data/portfolio.json` con le tue quantità:

```json
{
  "holdings": [
    { "symbol": "BTC", "name": "Bitcoin", "quantity": 0.01162241 },
    { "symbol": "ETH", "name": "Ethereum", "quantity": 0.74072421 }
  ]
}
```

### 4. Configura la watchlist (opzionale)

Modifica `data/watchlist.json` per aggiungere o rimuovere asset da monitorare come potenziali nuove posizioni:

```json
{
  "assets": [
    { "symbol": "DOT", "name": "Polkadot" },
    { "symbol": "ADA", "name": "Cardano" },
    { "symbol": "AVAX", "name": "Avalanche" }
  ]
}
```

Gli asset in watchlist vengono analizzati con gli stessi indicatori tecnici del portafoglio, ma generano **solo segnali BUY** — non ha senso segnalare la vendita di asset che non possiedi. Appaiono nello snapshot Telegram solo se il segnale è positivo.

## Utilizzo locale

```bash
# Analisi senza budget (SELL e HOLD)
node local-advisor.js

# Analisi con €100 disponibili (attiva segnali BUY)
node local-advisor.js 100
```

L'output include i dati tecnici completi (RSI, MACD, Bollinger, score per ogni asset) e la **raccomandazione AI finale** — identica a quella che riceverebbe il bot Telegram con gli stessi dati e lo stesso budget.

## Bot Telegram

```bash
# Avvio con PM2 (auto-restart ad ogni accensione del PC)
pm2 start telegram-bot.js --name crypto-bot
pm2 save

# Comandi utili
pm2 status
pm2 logs crypto-bot
pm2 restart crypto-bot
```

**Comandi Telegram:**
- `/start` — mostra i comandi disponibili
- `/analisi` — analisi senza budget
- `/analisi 100` — analisi con €100 disponibili
- `analisi con 50 euro` — linguaggio naturale

**Nota PM2 + GitHub Actions:** quando GHA è attivo (vedi sotto), PM2 cede il polling dopo 5 minuti di errori 409 consecutivi ed entra in modalità passiva, evitando messaggi duplicati.

## GitHub Actions (bot sempre attivo, €0/mese)

Il workflow `telegram-bot.yml` avvia il bot in 4 finestre da 5h con 30 minuti di gap, coprendo 20h/giorno senza costi su repo pubblica GitHub:

| Finestra | Orario CEST |
|----------|-------------|
| 1 | 05:00 – 10:00 |
| 2 | 10:30 – 15:30 |
| 3 | 16:00 – 21:00 |
| 4 | 21:30 – 02:30 |

Per attivarlo, aggiungi i seguenti **Secrets** nel repository GitHub (`Settings → Secrets → Actions`):

| Secret | Descrizione |
|--------|-------------|
| `ANTHROPIC_API_KEY` | Chiave API Anthropic |
| `TELEGRAM_BOT_TOKEN` | Token bot Telegram |
| `TELEGRAM_CHAT_ID` | ID della chat autorizzata |
| `CRYPTO_API_KEY` | API key Crypto.com Exchange |
| `CRYPTO_API_SECRET` | API secret Crypto.com Exchange |

## Logica dei segnali

La decisione è **calcolata al 100% in codice**, non dall'AI. Il flusso è: *analisi ampia → score tattico regime-aware → fit strategico di portafoglio → allocazione del budget*.

### 1. Score tattico (composizione)

Lo score somma 13 fattori. L'**RSI è regime-aware**: in un trend rialzista forte (ADX ≥ 25, +DI > -DI) l'RSI alto non è penalizzato come vendita ma letto come forza; in un trend ribassista l'RSI basso non è un segnale d'acquisto (non si compra "il coltello che cade"); in mercato laterale vale la mean-reversion classica.

| Fattore | Range punti |
|---------|-------------|
| RSI(14) regime-aware | -30 / +25 |
| Trend SMA50/200 | -25 / +25 |
| MACD | -20 / +20 |
| Bande di Bollinger | -15 / +15 |
| Divergenza prezzo/RSI | -12 / +12 |
| Volume + OBV | -10 / +10 |
| Fear & Greed Index | -10 / +10 |
| StochRSI | -8 / +8 |
| Forza relativa vs BTC (30gg) | -8 / +8 |
| Support/Resistance | -8 / +8 |
| Multi-timeframe (settimanale/giornaliero/4h) | -8 / +8 |
| ADX/DMI (conferma trend) | -5 / +5 |
| Community Sentiment (CoinGecko) | -5 / +5 |

### 2. Fit strategico di portafoglio

Lo score tattico viene moltiplicato per un **fit strategico** che riflette la costruzione del portafoglio (parametri in `data/strategy.json`):

- **Core (BTC/ETH)**: boost se sotto-pesato rispetto al target, taglio se sopra-pesato.
- **Altcoin**: acquisto **bloccato** se la posizione supera il tetto per singolo asset (anti sovra-concentrazione); altrimenti fit proporzionale allo spazio residuo + momentum (forza relativa vs BTC).
- `priorità = score tattico × fit strategico`.

### 3. Allocazione del budget e decisione

Il budget del giorno viene indirizzato sulla priorità più alta (o splittato tra core e miglior alt secondo la postura). Core → 🔵 basso rischio, altcoin → 🟠 medio-basso. Ogni riga riporta importo in €, motivo strategico e stop/target da ATR.

- **Vendita**: solo presa-profitto disciplinata (P&L ≥ +40% **e** RSI ≥ 65). Mai in perdita. Asset `NO_SELL` (CRO/LINK/UNI) esclusi.
- **DCA difensivo**: in Extreme Fear (Fear & Greed < 25) garantisce almeno una gamba sul core più sotto-pesato.
- **Postura adattiva**: base conservativa (`data/strategy.json`), con tilt verso balanced (tetto alt e quota core del budget più larghi) **solo** se un'altcoin è ad alta convinzione (score ≥ 40 e forza relativa ≥ +20% vs BTC) o se c'è altseason oggettiva (Altcoin Season Index ≥ 60). L'intestazione del messaggio mostra sempre la modalità attiva.

### Ruolo dell'AI (nessuna allucinazione possibile)

L'AI (Claude) **non decide**: le due sezioni operative sono generate dal codice e inviate verbatim. L'AI produce solo una breve nota di contesto, che viene **scartata automaticamente se contiene azioni (COMPRA/VENDI), importi in € o percentuali**.

## Affidabilità e limiti

Marco Ferretti fornisce analisi tecniche serie basate su indicatori standard del settore. Quello che **sa fare**:
- Identificare asset in zona ipervenduto/ipercomprato
- Confermare la direzione del trend (golden/death cross)
- Suggerire timing di DCA evitando entrate in ipercomprato
- Mantenere un framework oggettivo e coerente, libero dall'emotività

Quello che **non può fare**:
- Prevedere il futuro o garantire rendimenti
- Reagire a news e fondamentali (la componente news è attualmente uno stub)
- Rilevare movimenti di whale o flussi on-chain
- Proteggersi da eventi imprevisti (crolli improvvisi, fallimenti di exchange)

## Costi stimati

| Componente | Costo |
|------------|-------|
| GitHub Actions (repo pubblica) | €0/mese |
| Claude API (analisi bot + locale) | ~€0.06–0.08/analisi |
| Tutte le altre API | €0 |

## Dipendenze

- [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) — Claude API
- [`axios`](https://www.npmjs.com/package/axios) — chiamate HTTP
- [`dotenv`](https://www.npmjs.com/package/dotenv) — variabili d'ambiente
