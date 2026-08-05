/**
 * layers — CHI STA SOPRA CHI, in un posto solo.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * I valori erano sparsi su una trentina di siti, scritti a mano, su una scala che andava da 10
 * a 99999 senza regola. Tre commenti nel codice raccontano tre bug successivi di sovrapposizione
 * — il popup PROCESSUS che si mangiava i propri bottoni (App.tsx), la barra dei comandi finita
 * sopra il testo del ciclo (CycleHint), lo scudo a schermo intero rimasto appeso. Ogni volta la
 * cura è stata alzare un numero, e ogni numero alzato ha spostato il problema altrove.
 *
 * ── QUESTO FILE NON RIORDINA NIENTE ─────────────────────────────────────────────────────────
 * I valori qui sotto sono ESATTAMENTE quelli che erano nel codice. Cambiare l'ordine è cambiare
 * il comportamento, e il comportamento non si cambia in un lavoro che si dichiara meccanico.
 * Quel che cambia è che adesso si LEGGONO in fila, e le collisioni sono scritte invece di
 * doverle scoprire in seduta.
 *
 * ── LE COLLISIONI, DICHIARATE ───────────────────────────────────────────────────────────────
 * A parità di valore decide l'ordine nel DOM: l'ultimo nodo dichiarato vince. Sono queste:
 *
 *   • `session` (9000) — cinque inquilini: la scelta dello strumento, ProfileRoster,
 *     ThetaReadyCheck, ConnectionProgress, ParticipantView. Non si vedono mai insieme, ma
 *     niente lo garantisce.
 *   • `dock` (50) — la banda meta e la barra dei comandi. Stanno agli estremi opposti dello
 *     schermo, quindi finora non si sono incontrate.
 *   • `sphereChrome` (40) — due overlay della sfera.
 *
 * ── QUEL CHE RESTA FUORI ────────────────────────────────────────────────────────────────────
 * Le classi Tailwind della scala standard (`z-10`, `z-30`, `z-40`, `z-50`) non sono state
 * toccate: sono già una scala coerente e leggibile. Qui stanno i valori ARBITRARI, cioè quelli
 * che nessuno può ordinare a mente — che sono esattamente quelli che hanno fatto i danni.
 */

export const LAYER = {
  // ── Dentro la finestra dell'app ────────────────────────────────────────────────────────────
  /** Sfondi: wallpaper, aurora, immagine di riempimento. */
  background: 0,
  /** La plancia principale (colonne + sfera). */
  stage: 10,
  /** Il cassetto laterale — sotto la barra delle icone, che deve restare cliccabile. */
  drawer: 25,
  /** La barra delle icone. */
  rail: 30,
  /** Gli overlay della sfera (⚠ due inquilini). */
  sphereChrome: 40,
  /** Il pannello MNA, appoggiato sopra la barra dei comandi. */
  mna: 42,
  /** La banda meta e la barra dei comandi (⚠ due inquilini). */
  dock: 50,
  /** La barra alta — sopra la banda meta, perché il popup dell'IA scende da lì. */
  topbar: 60,
  /** Finestre trascinabili: i PROCESSUS, il popup dell'IA. */
  floating: 90,

  // ── Sovrapposizioni a schermo intero ──────────────────────────────────────────────────────
  /** Modali dentro l'app: EP manuale, storico, rapporto. */
  modal: 100,
  /** Controlli che precedono la seduta: prontezza metabolica, sesso del preclear. */
  gate: 200,
  /** Conferme dentro l'app. */
  dialog: 400,
  /** La finestra di connessione P2P. */
  connection: 1000,
  /** Il metronomo del respiro, a schermo intero. */
  pacer: 8000,
  /** Le sovrapposizioni di seduta (⚠ cinque inquilini — vedi sopra). */
  session: 9000,
  /** Una conferma SOPRA una sovrapposizione di seduta. */
  sessionTop: 9100,
  /** « Esci con una seduta aperta ». */
  confirm: 9500,
  /** Crediti e calibrazione TA: coprono tutto, seduta compresa. */
  modalTop: 9998,
  /** L'animazione d'apertura. */
  splash: 9999,
  /** La schermata di crash — sopra ogni cosa, per definizione. */
  crash: 99999,
} as const;

export type LayerName = keyof typeof LAYER;
