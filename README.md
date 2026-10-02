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
```bash
npm install
cp config.example.json config.json   # poi sistema enginePath se necessario
npm start                             # http://127.0.0.1:4319
```
`config.json` (gitignored):
- `enginePath` — percorso del motore (relativo a questo file o assoluto)
- `port` — porta locale (default 4319)

## Cosa fa (Fase 1)
- **Home**: griglia profili con valore all'ultima istantanea e data dell'ultima run.
- **Dettaglio profilo**: portafoglio (quantità sovrane), storico recente, e i pulsanti:
  - **Analizza** — run fresca del motore → tabella segnali/score/RSI + raccomandazione
    Marco Ferretti (la spunta "con nota" accende/spegne la chiamata AI).
  - **Sync saldi** — legge i saldi live dall'App e aggiorna `availableForTrading`.

## Sicurezza
- Bind su `127.0.0.1` soltanto: mai raggiungibile dalla rete.
- Le credenziali dei profili (`.env`) restano nel motore, non transitano dal frontend.
- Un **lock per-profilo** serializza le operazioni (niente collisioni col bot PM2).

## Roadmap
- **F2**: upload CSV → riconciliazione con proposta delle quantità (sola lettura).
- **F3**: applicazione quantità confermate + creazione/modifica profili.

Richiede nel motore: `report-json.js` (F1, già presente) e i comandi `reconcile.js` /
`apply-quantities.js` / `create-profile.js` (F2/F3, da aggiungere).
