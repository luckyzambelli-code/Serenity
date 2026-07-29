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
/** MIRROR — RETROSPEZIONE al momento in cui si dà l'item. Il preclear ha spesso GIÀ pensato
 *  l'item prima che l'auditor prema il pulsante, e l'EEG coglie la reazione prima ancora che il
 *  corpo la manifesti: quando si arma, il picco vero è quindi spesso GIÀ PASSATO e misurare solo
 *  "da adesso in poi" dà un valore troppo basso. Si guarda quindi indietro di questi secondi e si
 *  prende la carica PIÙ FORTE. Stesso principio del read istantaneo (−ms) e della CAPTURE del MNA.
 *  TARABILE: più lungo = si risale più indietro (rischio di prendere una carica di un altro
 *  pensiero); più corto = si rischia di mancare il picco reale. */
export const MIRROR_LOOKBACK_S = 4;
/** Quanto il picco deve superare l'AMBIENTE per contare come VERO contatto di carica.
 *  Regola RELATIVA, coerente col resto di MIRROR: una carica conta perché SALE sopra il livello
 *  abituale della persona, non perché supera un numero assoluto. Serve sia alla retrospezione
 *  (un picco anteriore dev'essere una vera salita) sia al congelamento del valore — senza questa
 *  guardia il semplice livello ambiente veniva preso per un picco e la misura si bloccava subito.
 *  1.2 = almeno il 20% sopra l'ambiente. TARABILE. */
export const MIRROR_CONTACT_RISE_RATIO = 1.2;
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

// ═══════════════════════════════════════════════════════════════════════════════
// CAN METER — sonda di resistenza cutanea su ingresso audio (« le lattine »)
// Cablaggio e procedura di taratura: docs/can-meter-cablaggio.md
// ═══════════════════════════════════════════════════════════════════════════════
/** Tono BASSO (Hz). Vicino al comportamento in continua: vede la PELLE, dove vive il sudore —
 *  cioè la grandezza che legge un e-meter. PIÙ BASSO = più vicino alla continua, ma l'accoppiamento
 *  in alternata della scheda audio taglia; sotto i ~20 Hz il segnale si affloscia. */
export const CAN_TONE_LOW_HZ = 40;
/** Tono ALTO (Hz). Lo strato corneo si comporta da condensatore e a questa frequenza è
 *  cortocircuitato: vede quasi solo il percorso PROFONDO, che di elettrodermico non porta nulla.
 *  La DIFFERENZA fra i due toni isola la componente cutanea. */
export const CAN_TONE_HIGH_HZ = 990;
/** Finestra di media del lock-in (ms). PIÙ LUNGA = meno rumore ma meno aggiornamenti.
 *  100 ms → 10 letture/s: abbondanti per l'EDA, che è lenta (risposta in 1–3 s). */
export const CAN_LOCKIN_WINDOW_MS = 100;
/** Ampiezza del segnale d'uscita, 0..1 per tono (la somma dei due non deve saturare l'uscita).
 *  PIÙ ALTA = miglior rapporto segnale/rumore ma più corrente nella persona. A 0.35 per tono
 *  si resta abbondantemente sotto la soglia di percezione. */
export const CAN_TONE_AMPLITUDE = 0.35;
/** Resistenza di riferimento NOMINALE (Ω) — valore stampato sulla resistenza.
 *  Quello VERO lo ricava la calibrazione a due punti: questo serve solo come ripiego. */
export const CAN_R_REF_NOMINAL = 100_000;
/** Resistenze campione per la calibrazione a due punti (Ω). Vanno DISTANTI (10× almeno). */
export const CAN_CAL_R1 = 100_000;
export const CAN_CAL_R2 = 1_000_000;
/** Sotto questa ampiezza grezza il canale è considerato MUTO (lattine non impugnate, cavo
 *  staccato, ingresso sbagliato): meglio dire « nessun contatto » che stampare un numero falso. */
export const CAN_SILENCE_FLOOR = 1e-4;
/** Lisciatura della resistenza letta (EMA, 0..1). PIÙ ALTO = più reattivo e più rumoroso. */
export const CAN_SMOOTH = 0.25;

// ═══════════════════════════════════════════════════════════════════════════════
// THETA-METER — e-meter USB dell'utente (HID vendor-defined, NXP LPC13xx)
// Formato del report e come è stato ricavato: engine/thetaMeter.ts
// ═══════════════════════════════════════════════════════════════════════════════
/** Identificativi USB del dispositivo. */
export const THETA_VENDOR_ID = 0x1fc9;   // NXP Semiconductors
export const THETA_PRODUCT_ID = 0x0003;
/** I due byte d'intestazione: unica verifica di sanità che il report sia dei nostri. */
export const THETA_HEADER_0 = 0x01;
export const THETA_HEADER_1 = 0x02;
/** Sotto questa lunghezza il report non può contenere una lettura. */
export const THETA_MIN_REPORT_LEN = 5;
/** Lisciatura della lettura (EMA, 0..1). A 60 report/s il grezzo balla di qualche unità.
 *  PIÙ ALTO = più reattivo e più tremolante; PIÙ BASSO = più stabile ma in ritardo. */
export const THETA_SMOOTH = 0.2;

// ── AGO E BRACCIO dalle lattine (engine/thetaNeedle.ts) ────────────────────────────────────
/** Quanto è LENTO il braccio, cioè la manopola del TA (EMA, 0..1). Volutamente molto lento:
 *  se insegue troppo in fretta si mangia le reazioni, perché l'ago misura lo scarto DA LUI.
 *  PIÙ BASSO = reazioni più visibili e più lunghe, ma l'ago va fuori scala più spesso. */
export const THETA_ARM_ALPHA = 0.0008;
/** Quanto insegue il braccio QUANDO l'ago è fuori scala — l'auditor che gira la manopola per
 *  riportarlo nel quadrante. Deve essere molto più rapido, o l'ago resta incollato al bordo. */
export const THETA_ARM_FOLLOW_FAST = 0.02;
/** Unità grezze → offset del quadrante. È la manopola della SENSIBILITÀ.
 *  DA TARARE IN SEDUTA: se le reazioni sono minuscole ALZARLO, se l'ago sbatte ABBASSARLO.
 *  1/1.500.000 = una stretta forte (che sui dati veri muove il grezzo di ~2 milioni) porta
 *  l'ago poco oltre il bordo, quindi fa scattare il ricentraggio; una reazione vera, molto
 *  più piccola di una stretta, resta ben dentro il quadrante.
 *  (Il primo valore, 1/300.000, era 5 volte troppo alto: TUTTO sbatteva.) */
export const THETA_NEEDLE_SCALE = 1 / 1_500_000;
/** Oltre questo scarto l'ago SBATTE e il braccio comincia a ricentrare.
 *  ⚠️ DEVE stare SOTTO 1.0, cioè dentro il quadrante visibile: se sta sopra, l'inseguimento
 *  si ferma mentre l'ago è ancora fuori e resta incollato al bordo per sempre. */
export const THETA_OFFSCALE = 0.9;
/** …e si smette di ricentrare solo QUI, non appena l'ago rientra: è l'ISTERESI, cioè
 *  l'auditor che gira la manopola finché l'ago è di nuovo in mezzo, non solo dentro di un
 *  soffio. PIÙ BASSO = ricentra più a fondo ma può mangiarsi la coda della reazione. */
export const THETA_RECENTRE = 0.2;
/** Quanto braccio vale un decimo di divisione di Total TA, in unità grezze.
 *  Usato SOLO finché l'apparecchio non è tarato con l'artefatto: senza scala il totale è una
 *  grandezza relativa e questo numero è un ripiego. Tarato, si conta in divisioni vere. */
export const THETA_TOTAL_TA_STEP = 120_000;
/** Durata della finestra delle PROVE (stretta e respiro), in ms. Deve coprire il gesto e il
 *  culmine della caduta che ne segue, senza raccogliere movimenti successivi che falserebbero
 *  il picco. */
export const SQUEEZE_TEST_MS = 9000;
/** Passo del Total TA quando l'apparecchio È tarato, in DIVISIONI di TA.
 *  Un decimo, come il Total TA classico. */
export const THETA_TOTAL_TA_STEP_DIV = 0.1;
/** Banda morta del picco, in divisioni: sotto questa, un rialzo non sposta il riferimento. */
export const THETA_TOTAL_TA_DEADBAND_DIV = 0.02;
/** Un picco conta come nuovo solo oltre questo margine: senza, il rumore del braccio
 *  rialzerebbe il riferimento in continuazione e il Total TA non salirebbe mai. */
export const THETA_TOTAL_TA_DEADBAND = 24_000;

// ── SCALA DEL TONO DI RON (−40 .. +40) ─────────────────────────────────────────────────────────
/** Fondo scala della scala del tono: da −40 (resistenza TOTALE) a +40 (resistenza ZERO),
 *  ottanta unità in otto divisioni da dieci. È la Scala del Tono intera, con la Morte allo zero. */
export const TONE_SCALE_MAX = 40;
/** « Resistenza totale » (Ω) = il valore che corrisponde a −40.
 *  ⚠️ IN ATTESA DELLA RISPOSTA DI RON: non è ancora deciso se sia una costante del meter o un
 *  valore della singola persona. Finché non si sa, il tono assoluto NON va mostrato come tale.
 *  Nota fisica: dipende comunque dagli ELETTRODI (lattine più grandi = meno ohm), quindi una
 *  costante universale è dubbia. */
export const TONE_R_TOTAL = 2_000_000;
