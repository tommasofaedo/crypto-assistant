# Roadmap — Hari Seldon

Miglioramenti pianificati, in ordine di priorità.

---

## ✅ Completati

### Monorepo + console multi-cliente: anagrafica, valutazione P&L, valori live (06/10/2026)
Lavoro sulla console per renderla scalabile all'aumentare dei clienti (ognuno un profilo con la sua
chat Telegram), mantenendo il principio **stesse regole per tutti, numeri di ognuno separati**.

**Monorepo:** la console, prima in un **repo git separato** annidato in `crypto-console/`, è stata
**assorbita nel repo del motore** (branch `main`) via subtree-merge preservando la storia (merge
`f867e87`, doppia parentela; tag di rollback `pre-merge-console`). Resta una sottocartella col suo
`package.json`: runtime invariato (`enginePath: ".."`).

**Anagrafica profilo (`meta.json` + `set-meta.js`):** nuovo file per profilo con nome leggibile,
nota, tag, flag archiviato — separato dai dati finanziari. `set-meta.js` fa get/set con merge
parziale (gemello di `set-telegram.js`); `meta.json` è gitignorato per i clienti (il displayName è
PII), tracciato per `tommaso`. Opzionale: creato alla prima scrittura, nessuna migrazione.

**Console Home scalabile:** ricerca (nome/slug/tag), filtro per tag, ordinamento (nome/valore/ultima
run), archiviati nascosti, badge Telegram per chi ha la chat configurata, e **P&L d'istantanea per
cliente** su ogni card. Nuovo profilo via **modale unico** (nome + slug auto-suggerito + tag + chat).

**Valutazione guadagno/perdita per cliente:** riga + colonna P&L nel Portafoglio (sull'ultima
istantanea, senza rete: `valueAtSnapshot − avgBuyPrice*quantità`) e nell'intestazione Analisi (live).
Pulsante **"Aggiorna valori"** (nuovo `value-json.js`, leggero: solo prezzi, niente indicatori/AI) fa
passare la tabella Portafoglio in modalità live (Prezzo/Valore/P&L ora) col confronto vs l'istantanea.
**Storico** ora a richiesta in un modale. Commit console `904b2d2`→`f42b2f2`.

**Verifica isolamento (nessuna modifica, solo audit):** confermato nel codice che analisi e push
Telegram sono per-profilo (portfolio/sellState/history/.env isolati, loop sequenziale col chat_id del
profilo) e i criteri sono condivisi/identici (scoring hardcoded in `advisor.js`,
`strategy.json`/`watchlist.json` in `data/` condivisa). L'unica leva per-cliente è `TELEGRAM_BUDGET`
(importo, non criterio).

**Comandi JSON nuovi (shellati dalla console):** `set-meta.js`, `value-json.js`.

### Push cloud ai clienti (a PC spento) + auto-pubblicazione portafogli (06/10/2026)
I report dei profili CLIENTE giravano **solo in locale** (`telegram-report-all.js`) perché i loro
dati sono gitignorati dal repo pubblico → se il PC era spento alle 09:00 non partiva nulla. Richiesta:
farli arrivare **a PC spento come per l'operatore**, senza esporre i dati dei clienti sul repo pubblico.

**Soluzione — repo PRIVATO separato `tommasofaedo/crypto-assistant-clients`:** contiene
`profiles/<nome>/{portfolio.json,.env}` dei clienti + un workflow `clients-report.yml` (cron
`0 7 * * *` = 09:00, **stesso orario** del report operatore). Il workflow fa il checkout del repo
privato, **clona il motore pubblico** a runtime (sempre ultima versione), inietta `profiles/*` in
`engine/data/profiles/`, `npm install`, poi `node telegram-report-all.js` (che esclude l'operatore
e manda a ogni cliente snapshot + reco col SUO chat_id/budget). `workflow_dispatch` con input
`dry_run: true` → aggiunge `--local` per collaudare senza inviare. Secrets sul repo privato:
`TELEGRAM_BOT_TOKEN`/`ANTHROPIC_API_KEY`/`CRYPTO_API_KEY`/`CRYPTO_API_SECRET` (NO `TELEGRAM_CHAT_ID`:
per i clienti arriva dal profilo). Collaudato end-to-end: dry-run OK + invio reale confermato ricevuto.

**Auto-pubblicazione (nuovo `src/clientPublish.js`):** `sync-app.js` e `apply-quantities.js`, dopo
la scrittura, chiamano `publishClientProfile()` → quando cambia il portafoglio di un CLIENTE fa
copy+commit+push del **solo `portfolio.json`** nel clone locale `../crypto-assistant-clients`
(override `CLIENTS_REPO_DIR`), così il cloud non resta sui numeri vecchi. Esclude l'operatore e i
profili `_*`; **non fatale** (clone mancante/offline/push ko → avviso su stderr, il sync non si
blocca); logga su stderr per non sporcare il protocollo JSON marker della console; NON pubblica il
`.env` (le chiavi CDC non vanno nel repo clienti). Vale anche quando il sync parte dalla **web app**
(la console shella questi script). Resta manuale solo l'aggiunta di un NUOVO cliente / cambio
chat_id-budget (modifica `profiles/<nome>/.env` nel repo privato + push). Commit motore `9b0c80f`.

**Primo cliente attivo: `ilariarosolen`** — portafoglio seminato dal suo CSV (BTC/ETH/SOL);
`avgBuyPrice` STIMATO e `availableForTrading` provvisorio (0 su staked), da rifinire con le sue
chiavi CDC + `sync-app`. `storico_ILARIA/` aggiunto al `.gitignore` (CSV cliente, mai nel repo pubblico).

### Fix riconciliazione CSV: da somma assoluta a incrementale (05/10/2026)
`reconcile.js` proponeva `suggested = csvSum` (somma dell'**intera storia** CSV, union
master+upload) quando `csvSum > sovrano`. Ma CSV e quantità sovrana **divergono di natura**
(buchi export, BTC da exchange esterni, staked invisibile allo SPOT, premi compound): quando
la somma storica supera il sovrano per deriva accumulata, proponeva un **raise spurio** scollegato
dalle transazioni nuove. **Incidente 05/10**: la console aveva scritto SOL 11.956 (= csvSum) invece
di 11.940 (= sovrano +0.008 di premi reali), e lo stesso su ETH/BTC/CRO.

**Fix:** riconciliazione **incrementale**. Considera solo le righe con data **> `portfolio.updatedAt`**
(cutoff dell'ultima riconciliazione) e propone `suggested = sovrano + somma righe nuove`
(acquisti+premi; interni esclusi). Dedup per **chiave stabile** (`timestamp|kind|currency|amount|…`,
non più JSON intero che si rompe sulla precisione dei Native Amount tra ri-esportazioni). `csvSum`
resta nel payload solo come dato informativo. **Idempotente** (ri-eseguire dopo l'apply → tutto
`hold`), **mai abbassa** (vendite = pipeline sell). Verificato end-to-end sulla catena reale
reconcile→apply-quantities (profilo usa-e-getta: unstaking e righe ≤cutoff correttamente esclusi)
+ dati di `tommaso` ricalcolati dai delta 30/09→05/10 e confermati live da `sync-app`.

**Limite residuo noto:** né `reconcile.js` né `apply-quantities.js` toccano `availableForTrading`
→ lo spostamento da **unstaking** (staked→spot) resta a `sync-app.js` (saldi live App) o manuale.

### Chat_id/budget Telegram per profilo dalla console + consulente rinominato Hari Seldon (05/10/2026)
**Campo chat_id editabile dalla console:** nuovo `set-telegram.js` (motore) legge/scrive **solo**
`TELEGRAM_CHAT_ID` e `TELEGRAM_BUDGET` nel `.env` del profilo (API key e `TELEGRAM_INTERACTIVE`
intatte), invocato come sottoprocesso al pari di `apply-quantities`/`create-profile`. **Guardia
anti-duplicato** sul chat_id (stessa regola di `telegram-report-all.js`, anticipata al salvataggio)
+ validazione formato. Console: endpoint `GET`/`POST /api/profiles/:p/telegram` (POST dietro il
lock per-profilo) e pannello **"Telegram"** nel dettaglio profilo (chat_id + budget push, con stato
"riceve / non riceve push"). Copre la parte "scrivere il chat_id nel `.env`" dell'onboarding cliente
(resta manuale solo la **cattura** del chat_id). La console continua a **non** scrivere i file
direttamente: passa sempre dal motore.

**Rinomina consulente AI: Marco Ferretti → Hari Seldon** (il matematico della *Fondazione* di
Asimov che predice col calcolo statistico — calza col consulente che dà raccomandazioni
probabilistiche): rinomina **solo testuale** in prompt di sistema, banner, report Telegram, UI
console e docs; allineato il bordo del riquadro ASCII in `aiAdvisor.js` (nome più corto di 3 char).

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
clienti sono **push-only** via nuovo `telegram-report-all.js` (esclude l'operatore; **guardia chat_id
duplicato**; `src/telegramReport.js` condiviso con `telegram-report.js`). _Nota (06/10): girava solo
in locale perché i dati clienti sono gitignorati dal repo pubblico; ora gira anche nel **cloud a PC
spento** tramite il repo privato `crypto-assistant-clients` — vedi Completati 06/10._ `telegram-bot.js` e
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

### 11. Rifinire il profilo `ilariarosolen` con `sync-app` (attesa chiavi CDC)
**Impatto:** medio — dati reali al posto delle stime  
**Sforzo:** basso (pochi minuti una volta avute le chiavi)  
**Stato:** 🔲 in attesa — aperto 06/10/2026

Il portafoglio di `ilariarosolen` è stato **seminato dal suo CSV** (quantità BTC/ETH/SOL corrette),
ma con `avgBuyPrice` **stimato** (EUR speso / qty, premi inclusi) e `availableForTrading`
**provvisorio** (0 su ETH/SOL staked, prudenziale). I campi `CDC_API_KEY`/`CDC_API_SECRET` nel suo
`.env` sono vuoti in attesa delle sue chiavi Crypto.com **in sola lettura**.

**Quando arrivano le chiavi:** incollarle nel suo `.env`, poi `PROFILE=ilariarosolen node sync-app.js`
→ aggiorna `availableForTrading` ai saldi live (scorpora lo staking) e permette di correggere
l'`avgBuyPrice`. Il push sul cloud è automatico (`clientPublish.js`), quindi niente da ricordare
lato repo privato. (Il report push intanto NON mostra il P&L, quindi la stima non è mai arrivata
al cliente.)

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
- **Merge del CSV nel master (emerso 02/10, rivisto 05/10)**: `reconcile.js` non persiste più la union col master — dal fix incrementale (05/10) la proposta dipende solo dal cutoff `portfolio.updatedAt` e dalle righe nuove, quindi il master serve ormai solo al `csvSum` informativo e ai phantom. Valutare comunque un `--merge` che aggiorni il master in fase di apply, così `crosscheck.js` (che somma il master) resta allineato nel tempo.
- **Risposta cortese del bot ai clienti (emerso 02/10)**: oggi il bot interattivo ignora le chat non-operatore. Per i clienti push-only si potrebbe rispondere con un messaggio fisso ("ricevi i report automatici") invece del silenzio.
- **Onboarding chat_id cliente (emerso 02/10)**: ✅ **parziale (05/10)** — la **scrittura** del `chat_id`/budget nel `.env` del profilo è ora fatta dalla console (pannello Telegram → `set-telegram.js`). Resta manuale solo la **cattura** del `chat_id` di un nuovo cliente (deve scrivere al bot, poi si legge dagli update). Valutare un comando/endpoint che lo catturi in automatico.

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
- ~~**Dashboard web**~~: ✅ coperta (02/10) dalla **console web locale** (dal 06/10 nel monorepo,
  sottocartella `crypto-console/`; `localhost`): profili, consigli, storico, upload CSV +
  riconciliazione, scritture, anagrafica/tag, valutazione P&L e valori live. Non su server pubblico
  (è operatore-only e maneggia dati di terzi + credenziali)
- **Backtesting**: testare la strategia RSI+MACD+Bollinger su dati storici per validare
  i parametri prima di usarli sul portafoglio reale
