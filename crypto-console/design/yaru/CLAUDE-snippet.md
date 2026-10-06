## Stile dell'interfaccia

Tutte le interfacce di questo progetto seguono il design system Yaru, che sta in `design/yaru/`.

- Prima di scrivere o modificare un'interfaccia leggi `design/yaru/YARU.md`.
- Carica `design/yaru/tokens.css` e poi `design/yaru/yaru.css`; metti la classe `yaru` sul contenitore dell'app.
- Usa le classi `yaru-*` e le variabili CSS dei token. Non inventare colori, raggi, ombre o misure: un valore che non è un token non si usa.
- Non aggiungere librerie di componenti con uno stile proprio (Material UI, Bootstrap, shadcn, Tailwind UI e simili).
- Se serve un componente che il sistema non ha, costruiscilo con i token e gli stessi principi (bordi di 1px, niente ombre né gradienti, un solo accento) e segnalalo.
- `design/yaru/demo.html` mostra tutti i componenti: usalo come riferimento visivo.
