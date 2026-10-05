# Roadmap — Hari Seldon

Miglioramenti pianificati, in ordine di priorità.

---

## ✅ Completati

### Multi-profilo, console operativa e Telegram multi-utente (02/10/2026)
Da richiesta: gestire **più portafogli** (utenti diversi su Crypto.com) con le **stesse** impostazioni di rischio/valutazione, **senza mai confonderli**.

**Scaffolding multi-profilo (motore):** stato PER-PROFILO in `data/profiles/<nome>/`
(portfolio, sellState, history, CSV, `.env`); settaggi CONDIVISI in `data/` (strategy,
watchlist). Nuovo `src/paths.js` risolve i percorsi dal profilo attivo. **Selezione esplicita**
(`--profile`/`PROFILE`; auto solo se esiste un unico profilo; con 0 o >1 e nessuna scelta →
errore, **nessun default silenzioso**). Ricablati tutti i consumatori (`advisor`,
`portfolioAnalyzer`, `aiAdvisor`, `historyManager`, `sellStateManager`, `sync-app`,
`crosscheck`, ecc.) ed entry point. `.gitignore`: i dati finanziari dei profili diversi da
`tommaso` sono **esclusi dal repo pubblico** (solo l'operatore resta tracciato).

**Comandi JSON (per la console/automazioni):** `report-json.js` (consiglio completo),
`reconcile.js` (riconciliazione CSV ↔ sovrano in sola lettura, con `src/csvLedger.js`
condiviso da `crosscheck.js` → non divergono), `apply-quantities.js` (scrive quantità/avg +
`reconcileSells` → un calo arma il cooldown come `sync-app`), `create-profile.js`.

**Console web locale (repo separata, privata, solo `localhost`):** strumento dell'operatore,
invoca il motore come **sottoprocesso** (un processo = un profilo → impossibile mescolare i
portafogli). F1 consigli + storico, F2 upload CSV + riconciliazione (proposta), F3 scritture
(applica quantità, modifica portafoglio, nuovo profilo) **con conferma**. Avvio con un `.bat`.

**Telegram multi-utente:** un bot solo (token condiviso), un `TELEGRAM_CHAT_ID` per profilo.
L'operatore (`OPERATOR_PROFILE`, default `tommaso`) è interattivo + report GHA (invariato); i
clienti sono **push-only** via nuovo `telegram-report-all.js` (gira in **locale** perché i dati
clienti sono gitignorati → non esistono su GHA; esclude l'operatore; **guardia chat_id
duplicato**; `src/telegramReport.js` condiviso con `telegram-report.js`). `telegram-bot.js` e
`telegram-report.js` ora selezionano l'operatore in modo **esplicito** → non vanno più in
ambiguità quando esistono profili cliente.

### Coordinamento bot: PM2 primario / GHA fallback + auto-reload (24/08/2026)
Dopo il commit anti-frammentazione, il bot Telegram **rifirmava comunque `VENDI 25% BTC`** (già bloccata dal cooldown). Diagnosi: non era la logica — dimostrato che `computeStrategicPlan`, col codice on-disk e dati live, non produceva quella vendita. Erano due difetti di **freschezza del codice in esecuzione**:
- **Bot locale PM2 non ricaricato** dopo il commit → nuovo git hook versionato `hooks/post-commit` (attivato con `git config core.hooksPath hooks`) che fa `pm2 reload crypto-bot` sui commit che toccano `src/`, `data/` o `telegram-bot.js`. `.gitattributes` forza LF sull'hook (CRLF romperebbe lo shebang).
- **Causa vera — bot GHA con checkout congelato di 5h**: il coordinamento in `telegram-bot.js` faceva di GHA il **primario per fascia oraria** (`isInGHAWindow`) e metteva passivo il PM2 fresco → rispondeva il codice vecchio del cloud. **Priorità invertita da oraria a per-presenza**: `BOT_ROLE=gha` (env nello step del workflow) marca il cloud come **SUBORDINATO** (parte passivo, subentra solo dopo ~90s di poll vinti = PC spento); il **PM2 locale è PRIMARIO** (non cede mai, sui 409 si riprende il long-poll in 3s). `isInGHAWindow` rimossa. Risultato: PC acceso → risponde sempre il locale col codice fresco; PC spento → copre il fallback cloud. Un solo responder, niente conflitti 409 casuali.
- Verificato end-to-end: bot live logga `ruolo: PRIMARIO`, `/analisi` reale (via `telegram-report.js --local`) → nessuna riga `VENDI BTC` (gate: cooldown 1.4/3gg).

### Anti-frammentazione della presa-profitto: cooldown + re-arm RSI (24/08/2026)
Prima presa-profitto reale eseguita il **23/08/2026** (venduti €150 di BTC in 2 tranche
@ ~€63.647, +91.8% — prima vendita BTC e primo profitto realizzato di sempre). Da lì è emerso
un buco: il motore **rifirmava "VENDI 25%" ad ogni run** finché `P&L ≥ 40` e `RSI ≥ 65`, senza
memoria delle vendite → rischio di sminuzzare la posizione giorno per giorno sullo stesso picco.
Fix in `aiAdvisor.js` (`sellGate()`), soglie esternalizzate nel blocco `sell` di `strategy.json`:
- **Cooldown** (`sell.cooldownDays: 3`): dopo una vendita reale, stesso asset fermo per 3 giorni.
- **Re-arm** (`sell.rearmRsi: 60`): superato il cooldown, nuova vendita solo dopo che l'RSI è
  ridisceso sotto 60 (vende sul prossimo picco, non ogni giorno sullo stesso). Serie RSI letta
  da `history.json` (`historyManager` ora esporta `loadHistory`).
- Nuovo **`data/sellState.json`** = registro delle vendite REALI (`{SYMBOL:{lastSellDate}}`), che
  arma cooldown/re-arm (NON le raccomandazioni). Seed: BTC 2026-08-23. Da aggiornare con la data
  insieme a `portfolio.json` dopo ogni presa-profitto (candidato a futura automazione in `sync-app.js`).
- Verificato: unit test `sellGate` 6/6 + integrazione end-to-end (BTC bloccato, ETH ok).

### Lettura saldi App live + vendite cappate al disponibile (11/08/2026)
`wapi.crypto.com` è finalmente **online** (era 404 a luglio). Nuovo `sync-app.js`: legge il
wallet Crypto.com **App** in sola lettura tramite la skill ufficiale `crypto-com-app`
(`account.ts balances all`) e aggiorna `data/portfolio.json`. Modello a **due numeri** per
holding: `quantity` (totale, staking incluso) resta **sovrano** e modificabile a mano/a voce
(override manuale, mai abbassato in automatico — protegge lo staking, invisibile all'API
tradabile); `availableForTrading` = quanto è davvero vendibile ora, sincronizzato live.
`portfolioAnalyzer.js` espone il campo a valle. La **presa-profitto** in `aiAdvisor.js` è ora
**cappata a `availableForTrading`** (niente vendite su quote in staking; % coerente con
l'importo effettivo; salta del tutto se la posizione è interamente bloccata, es. SOL).
Credenziali CDC App (`CDC_API_KEY`/`CDC_API_SECRET`) nel `.env` gitignored. **Sync non
automatizzato**: si lancia a comando (le quantità cambiano di rado), mentre i prezzi/valore €
restano letti live a ogni analisi.

### Motore regime-aware + layer strategico di portafoglio (08/07/2026)
Revisione maggiore del motore, in due parti.

**Analisi più ampia (da 8 a 13 fattori, 3 timeframe):** nuovi indicatori in `indicators.js` —
`calcADX`/DMI (regime), `calcATR` (stop/target), `calcStochRSI` (timing), `detectDivergence`
(prezzo/RSI), `calcRelativeStrength` (vs BTC). `historicalData.js` ora recupera candele
settimanali/giornaliere/4h (`getMultiTimeframeCandles`). Lo scoring in `advisor.js` è
**regime-aware**: l'RSI è interpretato secondo il regime (trend forte vs laterale), risolvendo
la penalizzazione impropria dell'RSI alto in uptrend. Pesi di ADX/MTF ridotti per evitare il
triplo conteggio della direzione del trend.

**Decisione oggettiva + strategia (`aiAdvisor.js`, `data/strategy.json`):** `computeStrategicPlan()`
sostituisce `computeEligibleActions`. Lo score tattico è moltiplicato per un **fit strategico**
di portafoglio (qualità sotto-pesata favorita, sovra-concentrazione su singola alt bloccata da
un tetto configurabile) e il budget del giorno è **allocato** tra core e miglior alt secondo la
postura. Postura **conservative-adaptive**: base conservativa con tilt verso balanced
deterministico (alt ad alta convinzione o altseason). Vendita = solo presa-profitto (P&L ≥ +40%
& RSI ≥ 65). L'AI non decide più: le sezioni operative sono generate in codice e inviate verbatim;
la nota di contesto è validata e scartata se contiene azioni/importi (fix del bug di allucinazione
"COMPRA SOL score +22" del 07/08).

**Nota:** l'idea "Correlazione BTC" tra le idee future è ora parzialmente coperta dalla forza
relativa vs BTC integrata nello score.

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
Seldon ora sa se il prezzo è in zona di rimbalzo o di rifiuto storico.

### CoinGecko community sentiment (#2) (03/07/2026)
`newsSentiment.js` reimplementato con `/coins/{id}` CoinGecko. Range -5/+5.
Restituisce `sentiment_votes_up_percentage` per ogni asset. Cache in-memory 1h.
13 call individuali con sleep 2s — prima analisi ~26s extra, poi cached.

### Storico raccomandazioni (#4) (03/07/2026)
Nuovo `src/historyManager.js`. Ogni analisi salva in `data/history.json`:
data, symbol, signal, score, RSI, prezzo EUR, MACD histogram, OBV trend, isWatchlist.
Permette di misurare l'accuratezza di Seldon nel tempo e calibrare i pesi.

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
**Impatto:** alto — Seldon diventa proattivo, non solo reattivo  
**Sforzo:** basso

Aggiungere un checker periodico (es. ogni 4h nel `daily-report.yml`) che esegue l'analisi
senza input dell'utente e invia un alert su Telegram **solo** se un asset supera una soglia
critica: RSI sotto 30, score sopra +35, o segnale STRONG BUY/STRONG SELL.
L'utente riceve una notifica solo quando c'è qualcosa di concreto da valutare,
senza dover chiedere manualmente.

**Implementazione:** nuovo workflow GHA `alert-checker.yml` (cron ogni 4h),
nuovo script `telegram-alert.js` che chiama `runAdvisor()` e invia solo se ci sono
segnali sopra soglia. Aggiungere flag `--silent` che non invia nulla se tutto è HOLD.

> **Nota (02/10):** il pattern di loop multi-profilo + invio è già pronto in
> `telegram-report-all.js` e `src/telegramReport.js` — l'alert condizionato si costruisce
> aggiungendo il filtro soglie allo stesso giro (per i clienti resta locale, non GHA).

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

### 8. Deduplicazione messaggi PM2/GHA — ✅ RISOLTO 24/08/2026 (priorità per-presenza)
Superato dall'inversione di priorità (`BOT_ROLE`): un solo responder attivo alla volta
(PM2 primario a PC acceso, GHA subordinato altrimenti), quindi niente più duplicati né
risposte da codice stale. Vedi "Coordinamento bot" nei Completati.
**Residuo noto (accettato, basso impatto):** breve sovrapposizione quando il PC si accende
*dentro* una finestra GHA (~pochi cicli di 409) o si spegne (~90s di gap). Un file-lock su
`update_id` lo azzererebbe del tutto, ma non ne vale lo sforzo per ora.

### 9. Automatizzare `data/sellState.json` — ✅ FATTO 24/08/2026
`lastSellDate` non va più aggiornato a mano: `sync-app.js` lo **deriva** dal calo di
`quantity` (totale) tra due riconciliazioni. Nuovo modulo `src/sellStateManager.js`
(`reconcileSells`): confronta la quantity attuale con `lastKnownQuantity` memorizzata; se
è scesa → registra `lastSellDate = oggi` e arma il cooldown. **Scelto il calo di `quantity`
e non di `availableForTrading`**: quest'ultimo cala anche mettendo in staking (falso
positivo), la quantity totale scende solo per una vendita/uscita reale. Idempotente (scrive
solo su un calo effettivo), pre-seed delle baseline per tutti gli asset. La data è quella
della riconciliazione (stima), resta l'override manuale per precisione. Verificato: 10/10
unit test su `reconcileSells` + 0 falsi positivi sui dati reali + `sellGate` retro-compatibile.
**Verificato live 24/08**: `node sync-app.js` sui saldi reali → 0 vendite dedotte (nessun calo
di quantity), `sellState.json` non riscritto (idempotenza confermata), `portfolio.json` senza deriva.

---

### 10. Blocco codice: reco di vendita solo con snapshot fresco
**Impatto:** alto — chiude l'unico buco rimasto sulla presa-profitto  
**Sforzo:** basso (~30 min)  
**Stato:** 🔲 da fare — deciso 24/09/2026 dopo l'incidente del 23/09

Cooldown/re-arm/cap vivono solo in `sellGate` (`aiAdvisor.js`): una reco di vendita emessa
**fuori dal motore** (assistente che improvvisa un "VENDI" in chat senza girare l'engine) li
bypassa tutti. Incidente 23/09: reco "VENDI 9% ETH" scritta a mano ricalcando quella corretta
del 22, senza run del giorno (nessun snapshot 23/09 in `history.json`); una run reale avrebbe
bloccato su cooldown (1/3gg) + re-arm (RSI mai <60) + cap (`availableForTrading` ~0). Nessuna
vendita eseguita, nessun danno — ma la protezione oggi dipende dalla disciplina, non dal codice.

**Implementazione:** un guard che rifiuta di emettere una sezione di vendita se non esiste uno
snapshot `history.json` con `date` di **oggi** per l'asset (o entro N ore). Così, se la reco non
nasce da una run fresca del motore, il sistema stesso non la produce. Trasforma la regola
comportamentale (`feedback_no_handauthored_sell`) in un blocco tecnico.

> **Nota (02/10):** la console (`report-json.js`) esegue **sempre** una run fresca del motore
> per ogni consiglio, quindi di fatto non può produrre reco di vendita "a mano". Il guard a
> livello di motore resta comunque utile per chiudere il buco anche fuori dalla console.

---

## 🔮 Da valutare — emersi dalla revisione 08/07/2026

- **Backtest dei nuovi pesi/parametri**: validare lo scoring regime-aware e i parametri di `data/strategy.json` (tetti, soglie tilt) su dati storici prima di fidarsi ciecamente. Priorità alta: ora i pesi sono ragionati ma non validati empiricamente.
- **Rigenerare il grafo graphify**: `graphify-out/` è stato costruito prima della riscrittura del motore (08/07) — è **stale**. Rigenerare per riflettere `computeStrategicPlan`, i nuovi indicatori e il layer strategico.
- **Comando Telegram per la postura**: es. `/strategia conservativa|balanced|aggressiva` per cambiare `data/strategy.json` al volo senza editare il file a mano.
- **Taratura soglie tilt adattivo**: dopo aver osservato il comportamento reale, calibrare `altConvictionScore` (40), `altConvictionOutperf` (20), `altSeasonIndex` (60).
- **Livello 3 "Edge da derivati"** (scartato 08/07): funding rate + open interest dal server MCP Crypto.com. Da riconsiderare se si vuole un segnale di posizionamento professionale.
- **Alert quando cambia la modalità**: notifica quando il motore passa da conservativo a tilt-balanced (o viceversa) — è un cambio di regime che vale la pena segnalare.
- **Semplificare i due runner del bot (emerso 24/08)**: la soluzione attuale (PM2 primario / GHA subordinato via `BOT_ROLE`) è corretta ma non la più semplice possibile. Se il PC è spento solo di rado, valutare se togliere del tutto il bot interattivo GHA (tenendo solo PM2 always-on + il report automatico delle 9:00) — meno complessità di coordinamento a costo della copertura interattiva notturna a PC spento. Decisione di Tommaso, non urgente.
- **Guardia anti-frammentazione solo nel motore (emerso 23/09/2026)**: cooldown/re-arm/cap-al-vendibile vivono TUTTI in `aiAdvisor.js` (`sellGate`), quindi una reco di vendita prodotta fuori dal motore li bypassa. → promosso a elemento d'azione (#10 in "Da fare"); regola comportamentale già in memoria `feedback_no_handauthored_sell`.
- **Merge del CSV nel master (emerso 02/10)**: `reconcile.js` unisce il CSV caricato al master solo **in memoria** (per la proposta), non lo persiste → ricaricando lo stesso export le righe risultano di nuovo "nuove" (il dedup evita comunque doppi conteggi). Valutare un `--merge` che scriva il master aggiornato in fase di apply.
- **Risposta cortese del bot ai clienti (emerso 02/10)**: oggi il bot interattivo ignora le chat non-operatore. Per i clienti push-only si potrebbe rispondere con un messaggio fisso ("ricevi i report automatici") invece del silenzio.
- **Onboarding chat_id cliente (emerso 02/10)**: ricavare il `chat_id` di un nuovo cliente è manuale (deve scrivere al bot, poi si legge dagli update). Valutare un comando/endpoint che lo catturi e lo scriva nel `.env` del profilo.

## 💡 Idee future (non pianificate)

- **Azioni tokenizzate (VALUTATO E ACCANTONATO 11/08/2026)**: Crypto.com App le consente
  (il campo `equity_asset_id` esiste nello schema), ma **la skill/API attuale non le espone**
  — il catalogo `coins.ts search` restituisce solo 469 crypto (`token_type: regular`, zero
  equity). Mancano quindi sia il prezzo sia lo storico candele → il motore non può calcolarci
  gli indicatori. Inoltre, dal lato investimento: un'azione tokenizzata replica solo il
  sottostante (non è un prodotto a rendimento proprio) e come **veicolo** è di norma inferiore
  a un ETF UCITS da broker (dividendi spesso non pagati, rischio emittente/custodia, fisco/tutele).
  **Decisione di Tommaso: lasciar perdere, restare sulle crypto.** Riconsiderare solo se emerge
  un endpoint equities con dati prezzo+candele.
- **On-chain data**: Glassnode o Nansen free tier per flussi whale/exchange inflow
- **Correlazione BTC**: se BTC scende >3% in 1h, invia alert automatico su tutto il portafoglio
- ~~**Aggiornamento automatico portfolio.json**~~: ✅ fatto 11/08/2026 (`sync-app.js`) — vedi Completati
- ~~**Dashboard web**~~: ✅ coperta (02/10) dalla **console web locale** (repo separata,
  `localhost`): profili, consigli, storico, upload CSV + riconciliazione, scritture. Non su
  server pubblico (è operatore-only e maneggia dati di terzi + credenziali)
- **Backtesting**: testare la strategia RSI+MACD+Bollinger su dati storici per validare
  i parametri prima di usarli sul portafoglio reale
