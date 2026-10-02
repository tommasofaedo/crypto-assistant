# crypto-console

Console operativa **personale** (solo localhost) per gestire più profili del motore
[`crypto_assistant`](../crypto_assistant): consigli per-profilo, storico e — nelle fasi
successive — upload CSV e gestione profili.

**Non contiene logica decisionale.** Scoring, strategia e sell gate vivono nel motore
(unica fonte di verità). La console lo invoca come **sottoprocesso** (un processo = un
profilo → impossibile mescolare i portafogli) e mostra i risultati.

## Requisiti
- Node.js
- Il motore `crypto_assistant` accanto a questa cartella, con almeno un profilo in
  `data/profiles/<nome>/` e le sue credenziali/API a posto.

## Avvio
**Doppio click su `avvia-console.bat`**: installa le dipendenze se mancano, avvia il server e
apre il browser su http://127.0.0.1:4319. Se è già in esecuzione, apre solo il browser. Per
fermarla: chiudi la finestra del server. (Suggerito: collegamento sul Desktop.)

Avvio manuale:
```bash
npm install
cp config.example.json config.json   # poi sistema enginePath se necessario
npm start                             # http://127.0.0.1:4319
```
`config.json` (gitignored):
- `enginePath` — percorso del motore (relativo a questo file o assoluto)
- `port` — porta locale (default 4319)

## Cosa fa (F1 + F2 + F3)
- **Home**: griglia profili (valore all'ultima istantanea, data dell'ultima run) + **Nuovo profilo**.
- **Dettaglio profilo**:
  - **Analizza** — run fresca del motore → tabella segnali/score/RSI + raccomandazione Marco
    Ferretti (spunta "con nota" accende/spegne la chiamata AI).
  - **Sync saldi** — legge i saldi live dall'App e aggiorna `availableForTrading`.
  - **Portafoglio** con **Modifica/Salva** inline: quantità, avg, aggiunta di un asset.
  - **Riconciliazione CSV** — upload di un export movimenti → proposta delle quantità
    (acquisti/premi consolidati, mai abbassa il sovrano) → **Applica** (con conferma).
  - **Storico** recente degli snapshot.

## Sicurezza
- Bind su `127.0.0.1` soltanto: mai raggiungibile dalla rete.
- Le credenziali dei profili (`.env`) restano nel motore, non transitano dal frontend.
- Un **lock per-profilo** serializza le operazioni (niente collisioni col bot PM2).
- **Nessuna logica decisionale**: tutte le scritture passano dal motore (`apply-quantities.js`
  → `reconcileSells`), mai direttamente dall'app. Ogni scrittura chiede conferma.

## Comandi motore usati
`report-json.js` (analisi), `sync-app.js` (sync), `reconcile.js` (riconciliazione CSV),
`apply-quantities.js` (scrittura quantità/avg), `create-profile.js` (nuovo profilo).

## Possibili estensioni future
- Merge del CSV caricato nel master del profilo (ora la riconciliazione unisce solo in memoria).
- Rimozione di un holding dalla UI; grafici dello storico.
