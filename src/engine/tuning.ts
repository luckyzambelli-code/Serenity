/**
 * TUNING — TUTTE le manopole di taratura dell'AGO e delle LETTURE, in UN SOLO POSTO.
 *
 * Prima erano numeri sparsi dentro il gestore delle metriche (durate, hold, soglie, finestre):
 * ogni richiesta del tipo « è troppo veloce / interrompe troppo / l'F/N sfugge » costringeva a
 * cercarli uno per uno. Qui c'è tutto, con scritto COSA cambia e IN CHE VERSO muoverlo.
 *
 * REGOLA: nessun numero di taratura va scritto altrove. Se serve una manopola nuova, si aggiunge
 * QUI e si importa. (Le costanti geometriche del quadrante — pivot, raggio, sweep — NON stanno
 * qui: sono geometria condivisa dei componenti, non taratura.)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// AGO — durata delle reazioni (il « colpo » che fa muovere l'ago)
// ═══════════════════════════════════════════════════════════════════════════════
/** Quanto TIENE l'ago in oscillazione, per tipo di reazione (ms).
 *  PIÙ ALTO = reazione più lunga e leggibile, ma l'ago resta occupato più a lungo.
 *  PIÙ BASSO = più reattivo agli item ravvicinati, ma le reazioni si distinguono meno. */
export const KICK_MS: Record<string, number> = {
  reaction_long_fall_blow_down: 1800,
  reaction_blow_down:           1500,
  reaction_long_fall:           1200,
  reaction_fall:                 900,
  reaction_sf:                   500,
};
/** Durata usata se la reazione non è in tabella (ms). */
export const KICK_MS_DEFAULT = 800;
/** Tempo AGGIUNTIVO dopo l'oscillazione, per il rientro a riposo (ms). Durante questo tempo
 *  l'ago è ancora « occupato ». Somma con KICK_MS = quanto l'ago resta bloccato in tutto. */
export const KICK_FLYBACK_MS = 900;
/** Una reazione più PROFONDA rimpiazza l'oscillazione in corso solo se supera quella attuale
 *  di questo margine (evita che letture equivalenti si rincorrano). */
export const KICK_ESCALATE_MARGIN = 0.02;
/** Oltre questo offset l'ago è davvero nella ZONA DI CADUTA: serve a distinguere una VERA caduta
 *  dal semplice rientro a riposo dopo un float (che il classificatore legge come movimento a destra). */
export const FALL_ZONE_OFFSET = -0.20;
/** Posizione di RIPOSO dell'ago (SET) sull'asse [-1, 1]. */
export const NEEDLE_REST_OFFSET = -0.35;

// ═══════════════════════════════════════════════════════════════════════════════
// AGO — scritte delle reazioni in alto (quanto restano)
// ═══════════════════════════════════════════════════════════════════════════════
/** Quanto resta scritta una F/N (ms). Voluto LUNGO: una F/N deve essere ben visibile, non fugace.
 *  NB: durante questo tempo l'ago SEGUE la scritta (restano in fase). */
export const LABEL_HOLD_FN_MS = 3000;
/** Quanto restano gli stati calmi (Set/tick) prima di poter cambiare (ms). */
export const LABEL_HOLD_QUIET_MS = 250;

// ═══════════════════════════════════════════════════════════════════════════════
// AGO — nuovo item (assessment / cicli)
// ═══════════════════════════════════════════════════════════════════════════════
/** Finestra, dopo che si dà un item, in cui la lettura di QUEL item può INTERROMPERE
 *  l'oscillazione ancora in corso (ms). Serve in assessment, dove gli item si susseguono
 *  ogni 1–2 s e l'ago restava bloccato sul precedente.
 *  PIÙ ALTO = l'ago segue ogni item, ma può tagliare una reazione a metà.
 *  PIÙ BASSO = reazioni più integre, ma qualche item non muove l'ago. */
export const ITEM_INTERRUPT_MS = 2500;

// ═══════════════════════════════════════════════════════════════════════════════
// LETTURE (ASSESSMENT / R&I) — quale reazione si attribuisce a un item
// ═══════════════════════════════════════════════════════════════════════════════
/** Quanto si guarda INDIETRO rispetto al momento dell'item (s). Serve perché la parola viene
 *  trascritta un po' DOPO essere stata pronunciata, e l'EEG coglie la reazione PRIMA del
 *  simpatico. NB: la ricerca non risale MAI oltre l'item precedente (limite dinamico).
 *  PIÙ ALTO = si recuperano letture anticipate; PIÙ BASSO = meno rischio di prendere altro. */
export const READ_WINDOW_BEFORE_S = 1.0;
/** Quanto si guarda AVANTI (s). Tenuto CORTISSIMO di proposito: niente letture latenti. */
export const READ_WINDOW_AFTER_S = 0.15;
/** Una F/N che ricompare entro questo tempo è considerata lo STESSO episodio, quindi NON è una
 *  nuova reazione: per l'item è AGO NULLO (« nessun cambiamento provocato dalla domanda »).
 *  PIÙ ALTO = più severo (più NULL, immune allo sfarfallio); PIÙ BASSO = più permissivo. */
export const FN_EPISODE_GAP_S = 3.0;

// ═══════════════════════════════════════════════════════════════════════════════
// MIRROR — metodo del doppio (Ron)
// ═══════════════════════════════════════════════════════════════════════════════
/** Scala proporzionale: carica qL → lettura 0..10 sul quadrante. */
export const MIRROR_DIAL_K = 5;
/** Lisciatura della carica prima di misurare/contare. PIÙ BASSO = più liscio (più lento). */
export const MIRROR_SMOOTH = 0.15;
/** Banda morta: una discesa conta come « smaltito » solo se supera questa soglia (in qL).
 *  PIÙ ALTO = il rumore non conta, l'avanzamento verso il doppio rallenta. */
export const MIRROR_DEADBAND = 0.04;
/** Picco minimo (qL) per riconoscere un VERO contatto di carica (sotto = rumore). */
export const MIRROR_CONTACT_MIN = 0.08;
/** SCALA RELATIVA del valore 1–10 (v1.0.376). In seduta il valore usciva SEMPRE 10: la carica
 *  reale supera stabilmente qL=2 e la vecchia scala fissa (×5, saturazione a 10) era sbagliata in
 *  partenza — stessa lezione della calibrazione TA: gli assoluti variano ~100× tra macchine e
 *  persone. Ora il valore misura DI QUANTO la carica SALE rispetto all'AMBIENTE al momento
 *  dell'item: picco = ambiente → 0 · picco = 2×ambiente → 5 · picco ≥ RATIO_FULL×ambiente → 10. */
/** Rapporto picco/ambiente che vale FONDO SCALA (10). Da tarare in seduta. */
export const MIRROR_RATIO_FULL = 3.0;
/** EMA lento dell'ambiente (aggiornato ad ogni tick in vista MIRROR, anche da non armato). */
export const MIRROR_AMBIENT_ALPHA = 0.02;
/** Pavimento dell'ambiente (evita rapporti esplosivi quando la carica ambiente è ~0). */
export const MIRROR_BASELINE_FLOOR = 0.05;
/** Entro quanti secondi dall'aggancio si CHIUDE comunque la misura del contatto.
 *  Senza questo limite il picco cresceva SENZA FINE finché la carica non scendeva del 15%:
 *  il contatto "non avveniva" per molto tempo e, quando avveniva, catturava il massimo ASSOLUTO
 *  della seduta — quindi un valore saturo (sempre 10). La carica di un item è quella che compare
 *  SUBITO dopo averlo dato, non il massimo di sempre. TARABILE. */
export const MIRROR_CONTACT_WINDOW_S = 5;
/** Il read è considerato RIBALTATO — quindi il valore dell'item viene CONGELATO — quando la
 *  carica scende sotto questa frazione del picco.
 *  PIÙ ALTO (es. 0.95) = congela prima; PIÙ BASSO (es. 0.7) = aspetta di più. */
export const MIRROR_TURNOVER = 0.85;

// ── ASSESSMENT — quali frasi diventano ITEM ────────────────────────────────────────────────────
/** L'auditor parla anche fuori dagli item ("ok", "bene", un commento). Senza filtro, ogni frase
 *  diventava un item con la sua lettura → rumore nel report. Queste manopole decidono cosa passa. */
/** Lunghezza minima (caratteri) perché una frase sia un item. */
export const ITEM_MIN_CHARS = 2;
/** Oltre questo numero di parole è un commento/monologo, non un item.
 *  ALZATO (era 12): lo speech-to-text unisce spesso più frasi in una riga, e una domanda
 *  d'auditing lunga veniva SCARTATA in silenzio — compariva nel journal ma non nel modulo.
 *  Vale il principio dichiarato: NEL DUBBIO L'ITEM PASSA. */
export const ITEM_MAX_WORDS = 25;
/** Intercalari scartati (confronto senza accenti/maiuscole/punteggiatura), 5 lingue. */
export const ITEM_FILLERS = new Set([
  // it
  'ok', 'okay', 'si', 'no', 'bene', 'benissimo', 'allora', 'ecco', 'certo', 'va bene', 'perfetto',
  'grazie', 'mmh', 'ah', 'eh', 'boh', 'aspetta', 'esatto', 'giusto',
  // fr
  'oui', 'non', 'bien', 'tres bien', 'daccord', "d accord", 'voila', 'alors', 'merci', 'euh',
  'parfait', 'attends', 'exact', 'juste',
  // en
  'yes', 'yeah', 'right', 'good', 'fine', 'thanks', 'thank you', 'well', 'so', 'wait', 'exactly',
  // es
  'vale', 'bueno', 'claro', 'gracias', 'espera', 'exacto', 'perfecto',
  // sv
  'ja', 'nej', 'bra', 'tack', 'vanta', 'precis', 'okej',
]);

/** Quante letture MOSTRATE si tengono in memoria (oltre, si scarta la metà più vecchia). */
export const SHOWN_READS_CAP = 2000;

// ── ARTEFATTO DI MOVIMENTO (giroscopio) ────────────────────────────────────────────────────────
/** Quanti campioni di giroscopio si guardano (il buffer ne tiene 256). */
export const MOTION_WINDOW_SAMPLES = 32;
/** Sopra questo RMS (modulo della velocità angolare) la lettura NON è attribuibile all'item.
 *  Volutamente ALTO: sopprimere una lettura vera è peggio che lasciar passare un piccolo
 *  movimento. Il radar del pannello salute usa 40 come fondo scala → 30 = movimento netto.
 *  DA TARARE IN SEDUTA: se troppe letture vere spariscono, ALZARLO. */
export const MOTION_ARTIFACT_RMS = 30;
