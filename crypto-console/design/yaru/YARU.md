# Yaru

Yaru è il tema predefinito di Ubuntu. Questo sistema ne porta l'aspetto nelle app web e desktop: superfici grigie piatte, bordi sottili al posto delle ombre, un solo accento arancione e il carattere Ubuntu. I valori vengono dal tema GTK4 della repo `ubuntu/yaru` (commit `7f18973e`), compilato con il suo vero punto d'ingresso; dove qualcosa non viene dal sorgente è scritto.

## Principi

- **Due sfondi, non di più.** `bg_color` per finestra e sidebar, `base_color` per ciò che contiene dati (campi, liste, tabelle, riquadri). La barra del titolo ha il suo `headerbar_bg_color`. Niente altre tinte di grigio inventate.
- **Bordi, non ombre.** Ogni controllo e ogni riquadro ha un bordo di 1px `borders_color`. Le uniche ombre sono quelle dei pomelli (`switch_slider_shadow`, `scale_slider_shadow`). Niente gradienti: Yaru li rimuove esplicitamente dai pulsanti e dalla barra.
- **Un accento, usato poco.** `accent_bg_color` va sull'azione principale di una vista, sulla riga selezionata di una tabella, sui controlli attivi e sugli avanzamenti. La voce corrente della sidebar non usa l'accento: cambia solo lo sfondo (`menu_selected_color`).
- **Tre raggi.** `button_radius` (6px) per pulsanti e campi, `menu_radius` (8px) per le righe di menu e sidebar, `window_radius` (15px) per riquadri, popover e finestre. Gli interruttori sono a pillola.
- **Densità da desktop.** Controlli alti 34px, righe di navigazione 36px, barra del titolo 47px, icone 16px. Non ingrandire per riempire lo spazio.

## Colori

I token semantici hanno un valore per tema (`light` per primo, poi `dark`); la tavolozza del marchio (`orange`, le melanzane, i grigi) è uguale nei due temi e serve per l'identità, non per gli stati.

- Testo: `fg_color` sui controlli, `text_color` dentro campi e viste. Testo secondario: la classe `.dim-label` applica `dim_label_opacity`, che è il valore del sorgente ma sul testo piccolo non raggiunge 4,5:1; per testo che va letto usa `graphite` sul tema chiaro e `silk` sul tema scuro.
- Accento: l'arancione del marchio è `orange` (`#e95420`), ma con il testo bianco sopra non regge il contrasto. La build di Yaru lo scurisce: per i riempimenti usa sempre `accent_bg_color` con `accent_fg_color`, per testo e icone in accento su sfondo neutro usa `accent_color`, per i collegamenti `link_color`.
- Stati: `success_color`, `warning_color`, `error_color`, `destructive_color`. Uno stato non si comunica mai con il solo colore: sempre un'icona e una parola. `warning_color` è solo per icone e indicatori.
- Focus da tastiera: contorno di 2px `focus_border_color`, disegnato dentro il bordo del controllo.

### Accenti alternativi

Yaru prevede altri accenti oltre all'arancione. Questo sistema contiene i valori calcolati solo per quello predefinito; gli altri partono da queste basi e vanno ricalcolati con la stessa build.

| Nome | Base |
| --- | --- |
| default | `#e95420` |
| bark | `#787859` |
| sage | `#657b69` |
| olive | `#4b8501` |
| viridian | `#03875b` |
| prussiangreen | `#308280` |
| blue | `#0073e5` |
| purple | `#7764d8` |
| magenta | `#b34cb3` |
| red | `#da3450` |
| yellow | `#c88800` |
| wartybrown | `#b39169` |

## Tipografia

Una sola famiglia: Ubuntu Sans (`font-sans`), con Ubuntu Sans Mono (`font-mono`) per codice e valori allineati. La repo non contiene i caratteri: sono quelli di sistema di Ubuntu, qui caricati da Google Fonts. Il testo base (`default`) è 14,667px, cioè gli 11pt di Ubuntu; le altre misure sono le percentuali definite dal tema (`title-1` 200%, `title-4` 130%, `caption` 90% e così via).

- Un solo `title-1` per pagina; i titoli di gruppo sopra i riquadri sono `title-4`.
- I pesi sono tre: 400 per il testo, 700 per titoli ed etichette forti, 800 per `title-1` e `title-2`. Il 300 è solo di `large-title`.
- L'interlinea non è definita dal sorgente (GTK usa quella naturale del carattere): sul web usa 1,4 per il testo e 1,2 per i titoli.
- Scrivi le etichette con la sola iniziale maiuscola, mai tutto maiuscolo. Per i numeri in colonna attiva le cifre tabellari.

## Scrittura

Etichette brevi e concrete: un pulsante dice cosa succede ("Salva parametri", "Arresta linea"), e l'azione mantiene lo stesso nome in tutto il flusso. Gli errori dicono cosa è successo e come rimediare, senza scuse. Niente punti esclamativi, niente emoji.

## Icone

Yaru ha un set di icone simboliche a tinta unica, da 16px, che ereditano il colore del testo. Stanno nella repo in `icons/Yaru/scalable/` (circa 2.400 file) con licenza CC BY-SA 4.0: richiedono attribuzione e la stessa licenza per le opere derivate. Qui non sono incluse come risorse; le anteprime dei componenti ne usano alcune in linea. Nei prodotti per clienti valuta un set alternativo dallo stesso tratto: pieno, geometrico, griglia da 16px.

## Usare il sistema

1. Carica `tokens.css` e poi `yaru.css` (stanno in questa cartella).
2. Metti la classe `yaru` sul contenitore dell'app e `data-theme="light"` o `data-theme="dark"` su `html`; il tema segue quello di sistema, senza un selettore interno all'app.
3. Usa le classi `yaru-*` descritte nelle schede dei componenti. Le varianti hanno i nomi delle classi di stile GTK (`suggested-action`, `destructive-action`, `flat`, `image-button`, `dim-label`).
4. I controlli di scelta sono elementi nativi ridisegnati (`input`, `progress`, `table`): funzionano con qualunque framework e non serve JavaScript.

I valori vanno presi dai token, mai copiati a mano: un colore che non è un token non fa parte di Yaru.

## Accessibilità

Tre coppie del sorgente non raggiungono 4,5:1 e sono segnalate nelle note dei rispettivi token: `dim_label_opacity` sul testo piccolo, `column_header_color` su `base_color` e `insensitive_fg_color` (controlli disattivati, per scelta). `warning_color` e `success_color` non vanno usati come testo sul tema chiaro.

## Non sincronizzato

- Colori dello stato "finestra in secondo piano" (`backdrop_*`), colori per il gestore finestre (`wm_*`), varianti ad alto contrasto: saltati, non servono sul web.
- Temi GNOME Shell, GTK3, Cinnamon, Unity, Xfwm, cursori e suoni: fuori dal perimetro.
- Caratteri: non presenti nella repo, caricati da Google Fonts.
- Icone: non copiate (vedi sopra).
- Componenti: la repo è un tema GTK e non contiene componenti web. Gli 11 presenti (Button, Entry, Switch, Checkbox, Radio, Scale, ProgressBar, HeaderBar, NavigationSidebar, Frame, ColumnView) sono scritti a mano in CSS a partire da `gtk/src/default/gtk-4.0/_common.scss`, `_drawing.scss` e `_tweaks.scss`. Mancano, tra quelli che il tema definisce: menu e popover, schede (notebook), tooltip, finestre di dialogo, barre di scorrimento, calendario, toast.

## Licenza

Il tema GTK di Yaru è distribuito con licenze GPL e LGPL, le icone con CC BY-SA 4.0. Colori e misure si possono riprendere liberamente.

---

# Componenti

Ogni componente è una classe di `yaru.css`. Le anteprime sono in `demo.html`.

## Button

Pulsante piatto con bordo di 1px, alto 34px, senza gradienti né ombre.

Usa `suggested-action` per l'unica azione principale di una vista (prende l'accento), `destructive-action` per ciò che cancella o ferma qualcosa, `flat` con `image-button` per i pulsanti con sola icona nelle barre. I toggle e i selettori di vista usano `aria-pressed="true"`; più pulsanti uniti vanno in un contenitore `yaru-linked`.

```html
<button class="yaru-button">Esporta</button>
<button class="yaru-button suggested-action">Salva</button>
<button class="yaru-button flat image-button" aria-label="Menu">…icona…</button>
```

Chi lo usa fornisce: l'etichetta (verbo all'infinito o imperativo breve, iniziale maiuscola solo sulla prima parola), l'eventuale icona da 16px e `aria-label` quando c'è solo l'icona.

Scritto a mano da `gtk/src/default/gtk-4.0/_common.scss`, `_drawing.scss` e `_tweaks.scss` (ubuntu/yaru@7f18973e): è una resa in CSS per il web, non codice della repo.

## Entry

Campo di testo alto 34px, con sfondo `base_color` e bordo di 1px.

È un contenitore `yaru-entry` attorno a un `input` nativo, così può ospitare un'icona a sinistra o a destra. Il focus disegna un anello di 2px dentro il bordo. Aggiungi `error` per un valore non valido, sempre insieme a un messaggio che dica come correggerlo.

```html
<label class="yaru-entry"><input type="search" placeholder="Cerca negli eventi" aria-label="Cerca negli eventi"></label>
```

Chi lo usa fornisce: l'`input`, un'etichetta visibile o `aria-label`, il testo segnaposto.

Scritto a mano da `gtk/src/default/gtk-4.0/_common.scss`, `_drawing.scss` e `_tweaks.scss` (ubuntu/yaru@7f18973e): è una resa in CSS per il web, non codice della repo.

## Switch

Interruttore a pillola, 46 per 24px, per le impostazioni che hanno effetto subito.

È un `input type="checkbox"` nativo ridisegnato: acceso prende `checkradio_bg_color`, spento `switch_trough_color`; il pomello resta quasi bianco in entrambi i temi. Per le scelte che si confermano con un pulsante usa invece Checkbox.

```html
<input class="yaru-switch" type="checkbox" role="switch" checked aria-label="Ciclo automatico">
```

Chi lo usa fornisce: un'etichetta accanto (o `aria-label`) che descriva la cosa accesa, non l'azione.

Scritto a mano da `gtk/src/default/gtk-4.0/_common.scss`, `_drawing.scss` e `_tweaks.scss` (ubuntu/yaru@7f18973e): è una resa in CSS per il web, non codice della repo.

## Checkbox

Casella di spunta da 16px con raggio di 3px, per scelte indipendenti.

È un `input type="checkbox"` nativo ridisegnato: attiva si riempie con `checkradio_bg_color` e mostra il segno in bianco.

```html
<label class="yaru-choice"><input class="yaru-check" type="checkbox" checked><span>Avvisa a fine lotto</span></label>
```

Chi lo usa fornisce: l'etichetta, scritta come affermazione.

Scritto a mano da `gtk/src/default/gtk-4.0/_common.scss`, `_drawing.scss` e `_tweaks.scss` (ubuntu/yaru@7f18973e): è una resa in CSS per il web, non codice della repo.

## Radio

Pulsante radio da 16px, per scegliere una sola opzione tra poche.

È un `input type="radio"` nativo ridisegnato: quello attivo si riempie con `checkradio_bg_color` e mostra un punto bianco. Oltre le cinque opzioni usa un menu a tendina.

```html
<label class="yaru-choice"><input class="yaru-radio" type="radio" name="modo" checked><span>Automatica</span></label>
```

Chi lo usa fornisce: lo stesso `name` per tutto il gruppo e un'etichetta per il gruppo.

Scritto a mano da `gtk/src/default/gtk-4.0/_common.scss`, `_drawing.scss` e `_tweaks.scss` (ubuntu/yaru@7f18973e): è una resa in CSS per il web, non codice della repo.

## Scale

Slider con binario di 4px e pomello tondo da 20px, per valori approssimati in un intervallo.

È un `input type="range"` nativo ridisegnato. La parte piena usa `accent_bg_color`; nei browser basati su Chromium segue la proprietà `--value`, che va aggiornata insieme al valore. Per numeri precisi affiancagli un campo.

```html
<input class="yaru-scale" type="range" min="0" max="100" value="65" style="--value: 65%" aria-label="Velocità nastro">
```

Chi lo usa fornisce: minimo, massimo, valore, `--value` in percentuale e un'etichetta.

Scritto a mano da `gtk/src/default/gtk-4.0/_common.scss`, `_drawing.scss` e `_tweaks.scss` (ubuntu/yaru@7f18973e): è una resa in CSS per il web, non codice della repo.

## ProgressBar

Barra di avanzamento sottile (4px) per le operazioni in corso, e barra di livello (11px) per le quantità.

Entrambe sono elementi `progress` nativi. `yaru-progressbar` si riempie con l'accento; `yaru-levelbar` con `success_color`. Accompagnale sempre con il valore scritto: il colore da solo non basta.

```html
<progress class="yaru-progressbar" value="1240" max="2000">62%</progress>
<progress class="yaru-levelbar" value="70" max="100">70%</progress>
```

Chi lo usa fornisce: `value`, `max` e un testo vicino con il dato.

Scritto a mano da `gtk/src/default/gtk-4.0/_common.scss`, `_drawing.scss` e `_tweaks.scss` (ubuntu/yaru@7f18973e): è una resa in CSS per il web, non codice della repo.

## HeaderBar

Barra del titolo alta 47px, con sfondo `headerbar_bg_color` e una linea inferiore `alt_borders_color`.

Contiene tre zone: `start`, il centro (un titolo `title` in grassetto oppure un selettore di vista `yaru-linked`) ed `end`. Dentro la barra il pulsante attivo del selettore prende `headerbar_checked_bg_color`. Al massimo un pulsante `suggested-action`. Su schermi stretti le zone vanno a capo.

```html
<header class="yaru-headerbar">
  <div class="start">…</div>
  <div class="title">Supervisione</div>
  <div class="end">…</div>
</header>
```

Chi lo usa fornisce: i pulsanti delle due zone e il titolo o il selettore. I pulsanti della finestra non ne fanno parte: in un'app web non esistono, in una desktop li disegna il sistema.

Scritto a mano da `gtk/src/default/gtk-4.0/_common.scss`, `_drawing.scss` e `_tweaks.scss` (ubuntu/yaru@7f18973e): è una resa in CSS per il web, non codice della repo.

## NavigationSidebar

Sidebar di navigazione con righe alte 36px, raggio di 8px e margine di 8px.

Ogni riga è un collegamento con icona da 16px ed etichetta. La pagina corrente si segna con `aria-current="page"` e prende `menu_selected_color`: lo sfondo cambia, il testo resta `fg_color`, senza colore d'accento. Separa i gruppi con un `hr`.

```html
<nav class="yaru-navigation-sidebar" aria-label="Sezioni">
  <a href="/macchine" aria-current="page">…icona…<span>Macchine</span></a>
  <hr>
</nav>
```

Chi lo usa fornisce: le voci (una o due parole), le icone e la destinazione di ogni voce.

Scritto a mano da `gtk/src/default/gtk-4.0/_common.scss`, `_drawing.scss` e `_tweaks.scss` (ubuntu/yaru@7f18973e): è una resa in CSS per il web, non codice della repo.

## Frame

Riquadro con bordo di 1px e raggio di 15px, per raggruppare contenuti.

Da solo è trasparente; con `view` prende lo sfondo `base_color`. Con `yaru-rich-list` i figli diventano righe da 48px separate da una linea, con l'etichetta a sinistra e il controllo a destra: è il modo standard di presentare un gruppo di impostazioni. Non annidare riquadri e non aggiungere ombre.

```html
<div class="yaru-frame view yaru-rich-list">
  <div><span>Ciclo automatico</span><input class="yaru-switch" type="checkbox" role="switch" checked></div>
</div>
```

Chi lo usa fornisce: le righe e, sopra il riquadro, un titolo `title-4`.

Scritto a mano da `gtk/src/default/gtk-4.0/_common.scss`, `_drawing.scss` e `_tweaks.scss` (ubuntu/yaru@7f18973e): è una resa in CSS per il web, non codice della repo.

## ColumnView

Tabella su sfondo `base_color`, con intestazioni in grassetto e righe da 34px.

È un elemento `table` nativo. La riga selezionata (`aria-selected="true"`) prende `accent_bg_color` con testo bianco; le icone dentro la riga ereditano il colore del testo. Mettila in un riquadro `yaru-frame` e, su schermi stretti, in un contenitore che scorre in orizzontale. Gli stati vanno scritti a parole, con l'icona come rinforzo.

```html
<table class="yaru-columnview">
  <thead><tr><th scope="col">Ora</th><th scope="col">Evento</th></tr></thead>
  <tbody><tr aria-selected="true"><td>08:42</td><td>Pressione olio sotto soglia</td></tr></tbody>
</table>
```

Chi lo usa fornisce: colonne, righe e la gestione della selezione.

Scritto a mano da `gtk/src/default/gtk-4.0/_common.scss`, `_drawing.scss` e `_tweaks.scss` (ubuntu/yaru@7f18973e): è una resa in CSS per il web, non codice della repo.

---

# Token

Elenco completo con valori e note d'uso: `tokens.json`. Le variabili CSS corrispondenti sono in `tokens.css` (stesso nome, con `--` davanti).
