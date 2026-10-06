# crypto-console

Console operativa **personale** (solo localhost) per gestire più profili del motore
[`crypto_assistant`](..): consigli per-profilo, storico, upload CSV, gestione profili,
anagrafica/tag, valutazione P&L e valori live.

Dal 06/10/2026 vive **nel monorepo del motore** come sottocartella `crypto-console/` (prima era
un repo git separato): un repo solo, runtime invariato (`enginePath: ".."` punta al motore sopra).

**Non contiene logica decisionale.** Scoring, strategia e sell gate vivono nel motore
(unica fonte di verità). La console lo invoca come **sottoprocesso** (un processo = un
profilo → impossibile mescolare i portafogli) e mostra i risultati.

## Requisiti
- Node.js
- Il motore `crypto_assistant` nella cartella superiore (`..`), con almeno un profilo in
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

## Cosa fa
- **Home**: griglia profili con **ricerca** (nome/slug/tag), **filtro per tag**, **ordinamento**
  (nome/valore/ultima run), **archiviati** nascosti, badge **Telegram** e **P&L d'istantanea per
  cliente** su ogni card. **Nuovo profilo** da modale (nome leggibile + slug auto-suggerito + tag + chat).
- **Dettaglio profilo**:
  - **Scheda** — nome leggibile, nota, tag, flag archiviato (`meta.json`, via `set-meta.js`).
  - **Analizza** — run fresca del motore → tabella segnali/score/RSI + raccomandazione Hari
    Seldon (spunta "con nota" accende/spegne la chiamata AI) + P&L globale live in intestazione.
  - **Sync saldi** — legge i saldi live dall'App e aggiorna `availableForTrading`.
  - **Portafoglio** con **valutazione P&L** d'istantanea (globale + per asset) e **Modifica/Salva**
    inline (quantità, avg, aggiunta di un asset).
  - **Aggiorna valori** — prezzi live → la tabella passa a Prezzo/Valore/**P&L ora** sulle quantità
    attuali, col confronto vs l'ultima istantanea (leggero: niente indicatori/AI).
  - **Riconciliazione CSV** — upload di un export movimenti → proposta delle quantità
    (acquisti/premi consolidati, mai abbassa il sovrano) → **Applica** (con conferma).
  - **Storico** degli snapshot, a richiesta in un **modale**.

## Sicurezza
- Bind su `127.0.0.1` soltanto: mai raggiungibile dalla rete.
- Le credenziali dei profili (`.env`) restano nel motore, non transitano dal frontend.
- Un **lock per-profilo** serializza le operazioni (niente collisioni col bot PM2).
- **Nessuna logica decisionale**: tutte le scritture passano dal motore (`apply-quantities.js`
  → `reconcileSells`), mai direttamente dall'app. Ogni scrittura chiede conferma.

## Comandi motore usati
`report-json.js` (analisi), `value-json.js` (valori live leggeri), `sync-app.js` (sync),
`reconcile.js` (riconciliazione CSV), `apply-quantities.js` (scrittura quantità/avg),
`create-profile.js` (nuovo profilo), `set-telegram.js` (chat_id/budget), `set-meta.js` (anagrafica/tag).

## Possibili estensioni future
- Merge del CSV caricato nel master del profilo (ora la riconciliazione unisce solo in memoria).
- Rimozione di un holding dalla UI; grafici dello storico.
- Nome leggibile (`meta.json`) usato anche nei report Telegram del motore.
- Panoramica/salute Telegram (chi riceve, budget, chat_id duplicati); eliminazione profilo dalla UI.
