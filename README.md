# Crypto Assistant — Marco Ferretti

Analisi tecnica automatica del portafoglio crypto con raccomandazioni AI in italiano. Tre modalità operative: locale via CLI, bot Telegram interattivo, report automatici via GitHub Actions.

## Funzionalità

- Prezzi e storici live da **Crypto.com Exchange API** (fallback CoinGecko)
- Indicatori tecnici calcolati in locale: RSI(14), SMA50/200, MACD, Bande di Bollinger
- Fear & Greed Index e metriche globali di mercato (CoinMarketCap)
- Segnali BUY/SELL con soglie deterministiche (nessuna aleatoria affidata all'AI)
- Raccomandazioni in linguaggio naturale stile "Marco Ferretti" via Claude (Anthropic)
- Bot Telegram con long polling — risponde a `/analisi 100` o linguaggio naturale
- Report giornaliero automatico ogni mattina via GitHub Actions (costo ~€0/mese su repo pubblica)

## Struttura

```
crypto_assistant/
├── src/
│   ├── advisor.js          # orchestratore principale
│   ├── indicators.js       # RSI, MACD, SMA, Bollinger
│   ├── portfolioAnalyzer.js# scoring e segnali
│   ├── aiAdvisor.js        # prompt Claude per raccomandazioni
│   ├── marketData.js       # prezzi live
│   ├── historicalData.js   # candele per indicatori
│   ├── cryptoClient.js     # client Crypto.com v2
│   ├── portfolio.js        # lettura portfolio.json
│   ├── sentiment.js        # Fear & Greed Index
│   ├── globalMetrics.js    # market cap, dominance
│   └── newsSentiment.js    # sentiment notizie
├── local-advisor.js        # CLI locale
├── telegram-bot.js         # bot Telegram (long polling)
├── telegram-report.js      # report automatico GHA
├── data/portfolio.json     # quantità asset detenuti
└── .github/workflows/
    ├── daily-report.yml    # report mattutino 09:00 IT
    └── telegram-bot.yml    # bot sempre attivo (turni 6h)
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
    { "symbol": "BTC", "quantity": 0.01162241 },
    { "symbol": "ETH", "quantity": 0.74072421 }
  ]
}
```

## Utilizzo locale

```bash
# Analisi senza budget (solo HOLD/SELL)
node local-advisor.js

# Analisi con €100 disponibili (attiva segnali BUY)
node local-advisor.js 100
```

L'output mostra RSI, MACD, Bollinger, score e segnale per ogni asset. I dati sono pronti per essere passati a Claude Code o a qualsiasi LLM per le raccomandazioni finali.

## Bot Telegram

```bash
# Avvio locale
npm run bot

# Avvio con PM2 (auto-restart)
pm2 start telegram-bot.js --name crypto-bot
pm2 save
```

**Comandi Telegram:**
- `/start` — mostra i comandi disponibili
- `/analisi` — analisi senza budget
- `/analisi 100` — analisi con €100 disponibili
- `analisi con 50 euro` — linguaggio naturale

## GitHub Actions (bot sempre attivo, €0/mese)

Il workflow `telegram-bot.yml` avvia il bot in turni da ~6 ore (mattina e sera), coprendo le fasce operative principali senza costi su repo pubblica GitHub.

Per attivarlo, aggiungi i seguenti **Secrets** nel repository GitHub (`Settings → Secrets → Actions`):

| Secret | Descrizione |
|--------|-------------|
| `ANTHROPIC_API_KEY` | Chiave API Anthropic |
| `TELEGRAM_BOT_TOKEN` | Token bot Telegram |
| `TELEGRAM_CHAT_ID` | ID della chat autorizzata |
| `CRYPTO_API_KEY` | API key Crypto.com Exchange |
| `CRYPTO_API_SECRET` | API secret Crypto.com Exchange |

## Logica dei segnali

I segnali sono calcolati deterministicamente in codice, non dall'AI:

| Sezione | BUY | SELL |
|---------|-----|------|
| Basso rischio | score ≥ +30 AND RSI < 38 | score ≤ -30 AND RSI > 62 |
| Medio-basso | score ≥ +20 AND RSI < 42 | score ≤ -20 AND RSI > 58 |

Il Fear & Greed Index aggiunge fino a ±7 punti allo score. Se nessuna soglia è raggiunta, la raccomandazione è HOLD con note di monitoraggio.

## Costi stimati

| Componente | Costo |
|------------|-------|
| GitHub Actions (repo pubblica) | €0/mese |
| Claude API (report GHA mattutino) | ~€0.05/analisi |
| Claude API (bot Telegram, uso moderato) | ~€1.50/mese fissi |
| Crypto.com API | €0 |

## Dipendenze

- [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) — Claude API
- [`axios`](https://www.npmjs.com/package/axios) — chiamate HTTP
- [`dotenv`](https://www.npmjs.com/package/dotenv) — variabili d'ambiente
