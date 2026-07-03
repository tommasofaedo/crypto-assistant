# Crypto Assistant — Marco Ferretti

Analisi tecnica automatica del portafoglio crypto con raccomandazioni AI in italiano. Tre modalità operative: locale via CLI, bot Telegram interattivo, report automatici via GitHub Actions.

## Funzionalità

- Prezzi e storici live da **Crypto.com Exchange API** (fallback CoinGecko), con retry automatico su errori 5xx
- Indicatori tecnici calcolati in locale: RSI(14), SMA50/200, MACD, Bande di Bollinger
- Fear & Greed Index e metriche globali di mercato (CoinGecko)
- Segnali BUY/SELL con **soglie deterministiche in codice** — l'AI non può inventarsi segnali non supportati dai dati
- Ragionamento contestuale: in condizioni di Extreme Fear l'AI integra la logica tecnica con il contesto macro
- **Watchlist**: analisi tecnica su asset non in portafoglio — segnala solo opportunità di acquisto (mai vendita)
- **Coerenza garantita**: locale e Telegram usano la stessa funzione AI — la raccomandazione è identica su entrambi i canali
- Bot Telegram con long polling — risponde a `/analisi 100` o linguaggio naturale
- Report giornaliero automatico ogni mattina via GitHub Actions (costo ~€0/mese su repo pubblica)

## Struttura

```
crypto_assistant/
├── src/
│   ├── advisor.js           # orchestratore: analizza portafoglio + watchlist
│   ├── indicators.js        # RSI, MACD, SMA, Bollinger
│   ├── portfolioAnalyzer.js # prezzi live, P&L, allocazione
│   ├── aiAdvisor.js         # prompt Claude: segnali deterministici + ragionamento contestuale
│   ├── marketData.js        # prezzi live (Crypto.com + CoinGecko fallback)
│   ├── historicalData.js    # candele storiche 200gg (Crypto.com + CoinGecko fallback)
│   ├── sentiment.js         # Fear & Greed Index (alternative.me)
│   ├── globalMetrics.js     # market cap, BTC dominance, altcoin season (CoinGecko)
│   └── newsSentiment.js     # stub (futuro: news sentiment)
├── local-advisor.js         # CLI locale — stampa dati + raccomandazione AI identica a Telegram
├── telegram-bot.js          # bot Telegram (long polling, PM2)
├── telegram-report.js       # report automatico GHA
├── data/portfolio.json      # quantità asset detenuti
├── data/watchlist.json      # asset non in portafoglio da monitorare
└── .github/workflows/
    ├── daily-report.yml     # report mattutino 09:00 IT
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

### 4. News sentiment (opzionale)

Registrati gratuitamente su [cryptopanic.com](https://cryptopanic.com) e ottieni un API key gratuita.
Aggiungila al `.env`:

```env
CRYPTOPANIC_API_KEY=il_tuo_token
```

Senza questa chiave il sistema funziona normalmente — il contributo news allo score è semplicemente 0.
Con la chiave, gli ultimi articoli per ogni asset vengono analizzati tramite i voti della community
(positive/negative/liked/toxic) e alimentano lo score con un contributo da -5 a +5.

### 5. Configura la watchlist (opzionale)

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

I segnali sono calcolati deterministicamente in codice, non dall'AI:

| Sezione | BUY (portafoglio) | SELL (portafoglio) | NUOVA POSIZIONE (watchlist) |
|---------|-------------------|--------------------|----------------------------|
| 🔵 Basso rischio | score ≥ +30 AND RSI < 38 | score ≤ -30 AND RSI > 62 | score ≥ +30 AND RSI < 38 |
| 🟠 Medio-basso | score ≥ +20 AND RSI < 42 | score ≤ -20 AND RSI > 58 | score ≥ +20 AND RSI < 42 |

**Ragionamento contestuale:** se il Fear & Greed Index è sotto 25 (Extreme Fear) e c'è budget disponibile, l'AI può raccomandare un DCA difensivo su BTC o ETH anche in assenza di segnali tecnici formali — è il contesto macro a giustificarlo.

**Composizione dello score:**

| Indicatore | Range punti |
|------------|-------------|
| RSI(14) | -30 / +30 |
| Trend SMA50/200 | -25 / +25 |
| MACD | -20 / +20 |
| Bande di Bollinger | -15 / +15 |
| Fear & Greed Index | -7 / +7 |

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
