# crypto-console

App web locale per gestire più profili del motore crypto_assistant senza editare JSON a mano.
Zero logica decisionale propria: shella il motore come sottoprocesso. Express su 127.0.0.1,
frontend vanilla in `public/`, avvio con `avvia-console.bat`.

## Stile dell'interfaccia

Tutte le interfacce di questo progetto seguono il design system Yaru, che sta in `design/yaru/`.

- Prima di scrivere o modificare un'interfaccia leggi `design/yaru/YARU.md`.
- Carica `design/yaru/tokens.css` e poi `design/yaru/yaru.css`; metti la classe `yaru` sul contenitore dell'app.
  Nella console il server li espone come statici su `/yaru` (vedi `server.js`): il frontend li carica da
  `/yaru/tokens.css` e `/yaru/yaru.css`, senza duplicare i file in `public/`.
- Usa le classi `yaru-*` e le variabili CSS dei token. Non inventare colori, raggi, ombre o misure: un valore che non è un token non si usa.
- Non aggiungere librerie di componenti con uno stile proprio (Material UI, Bootstrap, shadcn, Tailwind UI e simili).
- Se serve un componente che il sistema non ha, costruiscilo con i token e gli stessi principi (bordi di 1px, niente ombre né gradienti, un solo accento) e segnalalo.
- `design/yaru/demo.html` mostra tutti i componenti: usalo come riferimento visivo.

Il layer d'app (`public/style.css`) contiene solo layout e i componenti che Yaru non ha (card profilo,
tabelle finanziarie, modale, select, file input), tutti costruiti sui token. Nota: `[hidden]` va
riaffermato con `display:none !important` perché i componenti Yaru impostano `display` esplicito.
