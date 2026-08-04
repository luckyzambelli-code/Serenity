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
/**
 * FINESTRA PER L'AGO VERO — l'INSTANT READ, e nient'altro.
 *
 * ⚠️ Correzione dell'utente (30/07/2026), su un errore che avevo fatto: la reazione dell'ago vero
 * è ALLA FINE ESATTA DELLA PAROLA. Non c'è ritardo da compensare. Una lettura che arriva dopo è
 * una lettura LATENTE, e una lettura latente **non vale** — è la definizione stessa dell'instant
 * read. Avevo aperto 3,5 s in avanti « per la latenza elettrodermica »: quella finestra
 * trasformava le letture latenti in letture valide, che è peggio del difetto che curava.
 *
 * La finestra resta quindi STRETTA, come per l'EEG. Il margine che c'è serve solo al fatto che
 * l'istante di fine parola arriva dalla trascrizione vocale, che non è precisa al centesimo.
 *
 * NB: da non confondere con `THETA_READ_DECIDE_S` — quella non è una finestra, è il tempo che
 * serve a NOI per classificare un movimento già avvenuto.
 */
export const READ_WINDOW_THETA_BEFORE_S = 0.4;
export const READ_WINDOW_THETA_AFTER_S = 0.35;
/**
 * Quanto si aspetta prima di CONCLUDERE (s) — non è una finestra di lettura.
 *
 * Una reazione si riconosce solo quando l'episodio si chiude: l'ago parte, culmina e comincia a
 * rientrare, e questo prende un secondo o due. La reazione è DATATA a quando è partita (fine
 * parola), ma noi lo sappiamo solo dopo. Decidere a 0,15 s vorrebbe dire scrivere NULL prima di
 * aver classificato un movimento che era già cominciato al momento giusto.
 *
 * Non allarga la finestra: una reazione partita troppo tardi resta latente e viene scartata lo
 * stesso. Sposta solo il momento in cui GUARDIAMO. E la scritta compare appena la lettura c'è,
 * senza aspettare la scadenza.
 */
export const THETA_READ_DECIDE_S = 2.0;
/**
 * Quanto si guarda AVANTI per l'EEG (s).
 *
 * ⚠️ Era 0,15, e quel numero era stato tarato quando l'item veniva datato all'ARRIVO DELLA
 * TRASCRIZIONE — cioè quasi un secondo dopo la fine vera della parola. Con quell'errore, ogni
 * lettura EEG cadeva « prima » dell'item e bastava una finestra avanti minima.
 *
 * Ora la fine della parola è misurata dal microfono, e le letture EEG si distribuiscono attorno
 * ad essa. Misurato in una seduta a due strumenti (01/08/2026): letture accettate a −868, −769,
 * −519, −268, +34, +131 ms e due SCARTATE a **+281 e +332 ms** — mentre una lettura del meter a
 * +181 ms veniva accettata. Si buttava via la reazione dell'EEG e si teneva quella dell'ago per
 * un'asimmetria che non aveva più ragione d'essere.
 *
 * Le due finestre avanti sono ora uguali: la fine della parola è la stessa per entrambi.
 */
export const READ_WINDOW_AFTER_S = READ_WINDOW_THETA_AFTER_S;
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
/** CORSA DI CADUTA: da SET (−0,35) al bordo destro (+1) ci sono 1,35, non 1. Le soglie qui
 *  sotto si esprimono come frazione di QUESTA corsa, non dell'asse intero: erano tarate come se
 *  l'ago riposasse al centro, e dichiaravano l'ago « fuori range » mentre era ancora in zona
 *  LONG FALL — con il ricentraggio che gli tagliava la corsa prima del bordo (sul Theta-Meter
 *  l'ago in quel caso sbatte a destra). */
export const THETA_FALL_RANGE = 1 - NEEDLE_REST_OFFSET;
/** L'ago SBATTE: praticamente al bordo. Sotto questa soglia deve poter correre liberamente. */
export const THETA_OFFSCALE = 0.97 * THETA_FALL_RANGE;
/** …e si smette di ricentrare solo QUI: è l'ISTERESI, cioè l'auditor che gira la manopola
 *  finché l'ago è di nuovo in mezzo, non solo dentro di un soffio.
 *  PIÙ BASSO = ricentra più a fondo ma può mangiarsi la coda della reazione. */
export const THETA_RECENTRE = 0.25 * THETA_FALL_RANGE;
/** Quanto braccio vale un decimo di divisione di Total TA, in unità grezze.
 *  Usato SOLO finché l'apparecchio non è tarato con l'artefatto: senza scala il totale è una
 *  grandezza relativa e questo numero è un ripiego. Tarato, si conta in divisioni vere. */
export const THETA_TOTAL_TA_STEP = 120_000;
/** Durata della finestra della PROVA DELLA STRETTA (ms). Si stringe e si rilascia: il gesto
 *  dura un paio di secondi, e nove erano un'attesa inutile che faceva anche raccogliere
 *  movimenti successivi. */
export const SQUEEZE_TEST_MS = 4000;
/** Durata della finestra del TEST DEL RESPIRO (ms). Più lunga della stretta: inspirare a fondo,
 *  trattenere e rilasciare non si fa in due secondi. */
export const BREATH_TEST_MS = 9000;
/** MOVIMENTO CORPOREO — su quanti campioni si guarda il movimento dell'ago (60 = 1 s). */
export const THETA_MOTION_WINDOW = 120;   // 2 s
/**
 * Quanto ANDIRIVIENI, in quadrante, tradisce la persona che si muove o stringe le lattine.
 *
 * Non è l'escursione totale: una fall è per definizione ampia e rapida, e misurando l'escursione
 * ogni caduta seria passava per agitazione — l'episodio veniva abbandonato e col solo meter non
 * compariva MAI una reazione. Si misura invece la parte dell'escursione che il movimento NETTO
 * non spiega: una caduta va in una direzione e ci resta (andirivieni ≈ 0), un corpo che si agita
 * va e torna (andirivieni = tutta l'ampiezza).
 *
 * Il conteggio del Total TA si SOSPENDE finché dura, come fa il Theta-Meter, che in quel caso
 * non conta nulla (noi contavamo fino a 4,5 divisioni).
 * PIÙ ALTO = più permissivo (si conta di più, ma rientrano gli artefatti);
 * PIÙ BASSO = più severo (nessun artefatto, ma un ago che oscilla legittimamente non conta).
 */
export const THETA_MOTION_RANGE = 0.5;
/** Per quanti campioni il conteggio resta sospeso DOPO che l'agitazione è cessata: il braccio
 *  ha ancora da riassestarsi, e quella coda non è carica. */
export const THETA_MOTION_COOLDOWN = 180;   // 3 s
/** Per quanti CAMPIONI una discesa deve reggere prima di contare come TA (60 campioni = 1 s).
 *  È il rifiuto del MOVIMENTO CORPOREO: stringere e lasciare le lattine fa scendere la
 *  resistenza per un attimo, ma rientra subito — il Theta-Meter non lo conta, noi contavamo
 *  fino a 4,5 divisioni di roba che non è carica. Un blowdown vero invece RESTA.
 *  PIÙ ALTO = più severo (nessun artefatto, ma un blowdown si conta più tardi). */
export const THETA_TA_CONFIRM_SAMPLES = 180;   // 3 s
/** Per quanti campioni l'ago deve restare fuori scala prima che il braccio cominci a
 *  ricentrare. Senza questa attesa il braccio riportava l'ago a SET durante un blowdown vero,
 *  che sul meter resta giù finché l'auditor non abbassa la manopola. */
export const THETA_OFFSCALE_HOLD_SAMPLES = 150;   // 2,5 s
/** Passo del Total TA quando l'apparecchio È tarato, in DIVISIONI di TA.
 *  Un decimo, come il Total TA classico. */
export const THETA_TOTAL_TA_STEP_DIV = 0.1;
/** Banda morta del picco, in divisioni: sotto questa, un rialzo non sposta il riferimento. */
export const THETA_TOTAL_TA_DEADBAND_DIV = 0.02;
/** Un picco conta come nuovo solo oltre questo margine: senza, il rumore del braccio
 *  rialzerebbe il riferimento in continuazione e il Total TA non salirebbe mai. */
export const THETA_TOTAL_TA_DEADBAND = 24_000;

// ── REAZIONI SULL'AGO DELLE BOÎTES (engine/thetaReactions.ts) ──────────────────────────────
//
// ⚠️ LE SOGLIE SONO I SEGNI STAMPATI SUL QUADRANTE, non altri numeri.
//
// Errore mio, segnalato in seduta (« indichi delle reazioni che non vedo e altre che vedo e non
// indichi »): avevo preso come soglie le POSIZIONI a cui il quadrante porta l'ago dell'EEG
// (0,42 · 0,68 · 0,90) e le avevo confrontate con la CORSA dell'ago vero a partire da SET. Sono
// due grandezze diverse, e l'ago riposa a SET = −0,35, non a zero. Risultato:
//
//     scrivevo « SF »        con l'ago a −0,15   ← il segno SF è a −0,06: l'auditor non vede niente
//     scrivevo « FALL »      con l'ago a +0,07   ← il segno FALL è a +0,10
//     scrivevo « BLOW DOWN » con l'ago a +0,55   ← LFBD è a +0,85: si vede un long fall
//
// Ora la soglia di ciascuna reazione è la CORSA che porta l'ago ESATTAMENTE sul suo segno:
// quello che c'è scritto e quello che si vede coincidono per costruzione. Se si spostano le
// scritte sull'arco (QuantumSphere), vanno spostate anche queste — a mano, e insieme.
//
//     segno sull'arco   posizione   corsa da SET (−0,35)
//     SF                  −0,06            0,29
//     FALL                +0,10            0,45
//     LONG FALL           +0,40            0,75
//     LFBD                +0,85            1,20
//
/**
 * Per quanto tempo un grado deve REGGERE prima di essere annunciato (s).
 *
 * La lettura è istantanea, ma « istantanea » non vuol dire « al primo campione »: un campione
 * solo che tocca la soglia è rumore, e annunciarlo scriveva reazioni che l'auditor NON vedeva
 * (segnalato in seduta). Un movimento vero dell'ago dura decimi di secondo; il rumore, qualche
 * millisecondo. Si perde un ventesimo di secondo e si guadagna che tutto ciò che è scritto si è
 * anche visto.
 *
 * In TEMPO e non in campioni: il conteggio dei campioni cambierebbe significato se un giorno
 * l'apparecchio trasmettesse più o meno in fretta.
 */
export const THETA_REACT_CONFIRM_S = 0.05;
/**
 * Entro quanto l'ago è considerato ANCORA FERMO durante una prova (unità di quadrante).
 *
 * Il segno del terzo di quadrante insegue l'ago finché sta fermo, così è sempre alla distanza
 * giusta da dove l'ago si trova davvero — e non da una posizione di riposo teorica che il
 * braccio, lento com'è, non ha ancora raggiunto.
 *
 * Ma appena l'ago PARTE il segno si ferma, altrimenti scapperebbe davanti a lui e il bersaglio
 * non si potrebbe raggiungere mai. 0,03 sta appena sopra il rumore misurato (0,01).
 */
export const THETA_TEST_FOLLOW = 0.03;
/**
 * In quanto tempo la BASE raggiunge un ago parcheggiato (s).
 *
 * Un meter vero lo tiene l'auditor: se l'ago scivola via da SET, si gira la manopola e si
 * ricomincia da lì. Qui il braccio insegue da solo, ma con VENTI SECONDI di costante di tempo:
 * dopo una caduta l'ago resta a lungo lontano da SET.
 *
 * Finché la base restava inchiodata al punto dell'ultima lettura, un ago fermo a 0,30 avrebbe
 * avuto bisogno di 0,45 per farsi leggere — e tutte le oscillazioni fra 0,29 e 0,34 sparivano.
 * Misurato in seduta: l'ago si muoveva di 0,33 e non usciva NIENTE per quaranta secondi.
 *
 * Perciò la base SALE verso dove l'ago si è posato, piano. Il movimento che conta è quello che
 * si stacca da dove l'ago STAVA, non da dove riposerebbe se il braccio avesse fatto in tempo.
 * Scendere invece è immediato: un rientro è un'informazione, non un assestamento.
 */
export const THETA_BASELINE_CREEP_S = 2.5;
/**
 * Velocità MINIMA perché un movimento sia una lettura (unità di quadrante al secondo).
 *
 * Una lettura è un movimento SUBITO: l'ago parte e arriva. Una deriva percorre la stessa
 * distanza impiegandoci dieci volte tanto. L'ampiezza sola non li distingue — ed è per questo
 * che, abbassata la soglia al livello del rumore, la deriva ha cominciato a produrre « Tick »
 * che l'auditor non vedeva (segnalato in seduta, 01/08/2026).
 *
 * Misurato sui dati veri:
 *     deriva lenta (tutta la seduta)   0,01 al secondo
 *     deriva dentro una finestra       0,06 al secondo
 *     long fall lenta                  0,28 al secondo
 *     fall                             1,0  al secondo
 *
 * 0,15 sta comodamente in mezzo: due volte e mezzo la deriva più veloce misurata, e metà della
 * long fall più lenta. È la manopola da muovere se una caduta lenta non venisse letta.
 */
export const THETA_MIN_RATE = 0.15;
/**
 * Quanto resta scritta la reazione DOPO che l'ago è rientrato (ms).
 *
 * Prima si usava KICK_MS — la durata dell'oscillazione dell'ago dell'EEG, che con l'ago vero
 * non c'entra niente: fino a 1,5 s, durante i quali la scritta diceva « LONG FALL » mentre
 * l'ago era già a riposo. Finché il movimento DURA la scritta resta, senza scadenza; quando
 * l'ago rientra si lascia solo il tempo di leggerla.
 */
export const THETA_LABEL_AFTER_MS = 700;
/**
 * Entro quanto una lettura viene RITIRATA se si scopre che era una stretta (ms).
 *
 * Una stretta delle lattine e una caduta sono IDENTICHE mentre avvengono: la mano preme, la
 * resistenza scende, l'ago va giù. Ciò che le distingue è il RITORNO — la stretta torna
 * indietro, la carica no — e quindi si sa solo dopo. Segnalato in seduta: « la FALL sono io che
 * ho schiacciato le lattine ».
 *
 * Delle due strade — aspettare il ritorno prima di annunciare (lento, e la lettura istantanea
 * era una richiesta esplicita) oppure annunciare e RITIRARE — si è scelta la seconda: l'auditor
 * vede la lettura comparire e poi ritirarsi, che è esattamente quello che è successo davvero.
 */
export const THETA_RETRACT_MS = 1600;
/**
 * Il TICK non ha un segno stampato sul quadrante: è il più piccolo scatto che si VEDE.
 *
 * ⚠️ Era 0,15, scelto da me senza avere il numero che serviva. Misurato poi in seduta
 * (31/07/2026) con l'ago a riposo e le lattine in mano ferme, il rumore vero dell'apparecchio
 * è di **un centesimo**: span 0,008 · 0,009 · 0,011. La soglia stava quindi a QUINDICI volte il
 * rumore, e tagliava via tutto quello che il preclear faceva senza strizzare le lattine —
 * movimenti fra 0,03 e 0,14, cioè tutte le letture pulite della seduta.
 *
 * 0,06 sta a SEI volte il fondo di rumore (largo abbastanza da non leggerlo) e a un QUINTO di
 * SF (0,29), che è la proporzione giusta fra un tick e una small fall. Da rivedere se in seduta
 * comparissero letture che l'auditor non vede: il numero che conta è il rapporto col rumore, e
 * quello si rimisura con la riga di diagnosi.
 */
export const THETA_REACT_TICK = 0.06;
export const THETA_REACT_SF = 0.29;
export const THETA_REACT_FALL = 0.45;
export const THETA_REACT_LONG_FALL = 0.75;
export const THETA_REACT_BLOW_DOWN = 1.20;
/** Sotto questa deviazione l'ago è « rientrato » e l'episodio si chiude. Volutamente PIÙ BASSA
 *  del tick: chiudere alla stessa soglia con cui si apre farebbe sfarfallare l'episodio a ogni
 *  oscillazione sul confine, con una raffica di letture per una sola caduta. */
export const THETA_EPISODE_RELEASE = 0.04;
/**
 * Quanta parte del picco basta riguadagnare perché la reazione sia LETTA (frazione del picco).
 *
 * Aspettare il rientro completo nella banda di riposo funziona per l'ago dell'EEG, che è una
 * molla e torna a SET in un attimo. L'ago VERO no: il suo riposo è il BRACCIO, che inseguendo la
 * resistenza ha una costante di tempo di una ventina di secondi. L'episodio restava quindi aperto
 * per decine di secondi e la lettura arrivava quando l'item era passato da tempo — ASSESSMENT
 * diceva NULL con l'ago che era appena caduto.
 *
 * Un auditor legge la caduta appena l'ago ha cominciato a rientrare, non quando è tornato a SET:
 * è quello che si fa qui.
 */
export const THETA_EPISODE_RETURN_FRAC = 0.35;
/**
 * Dopo quanti secondi senza un picco NUOVO l'oscillazione si considera finita, e si legge (s).
 *
 * Il rientro — completo o parziale — non basta a coprire tutti i casi: un ago che cade e RESTA
 * giù (il braccio lo insegue in decine di secondi) non rientra affatto, e l'episodio non si
 * chiudeva mai. L'auditor vedeva una caduta netta e l'app non scriveva niente — segnalato in
 * seduta. Quando l'ago ha smesso di scendere, la sua escursione è finita: si legge lì.
 */
export const THETA_EPISODE_SETTLE_S = 0.8;

// ── FLOATING NEEDLE SULL'AGO DELLE BOÎTES (engine/thetaFloat.ts) ───────────────────────────
// L'F/N non è un'AMPIEZZA: è una FORMA NEL TEMPO. L'ago spazza avanti e indietro, libero,
// ritmicamente, attorno a uno stesso centro. Le manopole qui sotto descrivono quella forma, e
// vanno TARATE SUI VIDEO come i profili del generatore F/N — non sono derivate da una teoria.
/**
 * ⚠️ TARATE SUL VIDEO — « Floating Needle Types » (Vimeo), quattro tipi ripresi dal quadrante
 * vero: FLOATING NEEDLE, PERSISTENT, INSTANT, FLOATING TONE ARM. (Il quinto, « that springs »,
 * l'utente lo ha escluso.) La lancetta è stata inseguita immagine per immagine leggendo dove
 * attraversa una riga del quadrante, e l'angolo convertito in unità di offset sapendo che la
 * corsa totale dell'ago sul video (~100°) È il quadrante, cioè 2,0 → 1° = 0,02.
 *
 * Prima di questa taratura il rilevatore vedeva **ZERO dei quattro** — e in 14 sedute vere aveva
 * prodotto 2 F/N contro i 95 del MUSE. Non era severo: era cieco. Ogni soglia qui sotto era
 * sbagliata, e tutte nello stesso verso.
 */
/** Ampiezza minima di una mezza spazzata (unità di quadrante).
 *  MISURATO: l'INSTANT F/N ha mezze spazzate di 0,157 in mediana — sotto il vecchio 0,22, che
 *  quindi lo tagliava via per intero. 0,10 sta dieci volte sopra il rumore dell'ago (0,01) ed è
 *  dello stesso ordine del minimo che usa il classificatore del MUSE (0,06 di ampiezza totale). */
export const THETA_FN_MIN_SWEEP = 0.08;
/** Quante mezze spazzate servono per dichiarare. Tre = l'ago è andato a destra, tornato e
 *  ripartito: due sole potrebbero essere una caduta con rientro, che non è un F/N. */
export const THETA_FN_MIN_SWEEPS = 3;
/** Durata plausibile di una mezza spazzata (s). Sotto è tremolio, sopra è deriva lenta.
 *  MISURATO col criterio di svolta definitivo: il FLOATING TONE ARM ha mezze spazzate da
 *  4,07 · 4,52 · 5,42 s — regolarissime fra loro (rapporto 1,3) e tutte oltre il vecchio 3,0,
 *  che quindi lo escludeva. 6,0 le contiene con un margine, e resta ben sotto la deriva del
 *  braccio (venti secondi). */
export const THETA_FN_HALF_MIN_S = 0.25;
export const THETA_FN_HALF_MAX_S = 6.0;
/** Quanto possono differire fra loro le ampiezze delle spazzate (rapporto max/min).
 *  ⚠️ Resta il criterio che separa un F/N da un corpo che si agita — ma un F/N VERO si smorza:
 *  misurato 6,3× sul FLOATING NEEDLE (0,63 poi 0,10) mentre si spegne. Il vecchio 2,6 pretendeva
 *  una regolarità che l'ago vero non ha. */
export const THETA_FN_AMP_SPREAD = 7.0;
/** Quanto può differire la durata delle mezze spazzate (rapporto max/min): un F/N è RITMICO —
 *  ma non un metronomo. MISURATO sull'INSTANT: da 0,39 a 1,68 s, cioè 4,3×. */
export const THETA_FN_PERIOD_SPREAD = 4.5;
/**
 * Quanto può spostarsi il CENTRO dello spazzare, **per ogni mezza spazzata**. Un F/N galleggia
 * attorno a uno stesso punto; se il centro scivola è una caduta lenta o una salita, non un F/N.
 *
 * ⚠️ PER SPAZZATA, non in totale: un limite totale dipende da quante spazzate sono entrate nella
 * finestra, e con tre soltanto lasciava passare un centro che scivolava di 0,18 ogni volta.
 * MISURATO sui quattro video: 0,015 (instant e tone arm) e 0,044 (floating needle) per spazzata
 * — contro 0,18 dell'agitazione. La separazione è netta, e 0,08 ci sta in mezzo con margine.
 * È anche `THETA_FN_MIN_SWEEP`: il centro non deve spostarsi, fra una spazzata e l'altra, di
 * quanto vale una spazzata leggibile.
 */
export const THETA_FN_CENTRE_DRIFT = 0.08;
/** Dopo quanto senza spazzate l'F/N è finito (s). Usato ANCHE da App per non riaprire una riga
 *  d'archivio sull'F/N dell'EEG che dura. */
export const THETA_FN_EXPIRE_S = 4.0;
/**
 * FINESTRA in cui cercare le spazzate che dimostrano l'F/N (s).
 *
 * Deve poter contenere `THETA_FN_MIN_SWEEPS` mezze spazzate alla durata MASSIMA ammessa:
 * 3 × 6,0 = 18 s, e si tiene 20 per margine. Prima si riusava `THETA_FN_EXPIRE_S` (4 s) per entrambe le cose, e un F/N
 * lento era invisibile per costruzione — tre spazzate da 2,6 s occupano 7,8 s e nella finestra
 * non ci stavano mai. È questo il difetto che rendeva il TONE ARM introvabile a QUALUNQUE
 * ampiezza.
 */
export const THETA_FN_WINDOW_S = 20.0;
/**
 * SILENZIO che chiude l'F/N: quanto si aspetta una NUOVA spazzata prima di dire che è finito,
 * in multipli della mezza spazzata osservata. Adattivo di proposito — con una finestra di 15 s,
 * una regola a tempo fisso terrebbe acceso l'F/N per quindici secondi dopo che si è fermato.
 */
export const THETA_FN_SILENCE_MULT = 2.2;
/** …con un minimo, perché su un F/N rapidissimo 2,2 mezze spazzate sono pochi decimi. */
export const THETA_FN_SILENCE_MIN_S = 2.0;
/**
 * Un punto di svolta conta solo se l'ago ha invertito di almeno tanto.
 *
 * Vale `THETA_FN_MIN_SWEEP`, e non meno: una svolta che non arriva a essere una spazzata
 * LEGGIBILE non è una svolta. Col vecchio 0,05 il TONE ARM del video produceva, fra due spazzate
 * da 1,9, dei sussulti da 0,05–0,06 — l'ago che preme contro il bordo — che venivano contati
 * come mezze spazzate e poi facevano fallire proprio il minimo di ampiezza. Rapporto max/min
 * 39,6 su un movimento che a occhio è il più regolare dei quattro.
 */
export const THETA_FN_TURN_HYST = THETA_FN_MIN_SWEEP;

// ── SCALA DEL TONO DI RON (−40 .. +40) ─────────────────────────────────────────────────────────
/** Fondo scala della scala del tono: da −40 (resistenza TOTALE) a +40 (resistenza ZERO),
 *  ottanta unità in otto divisioni da dieci. È la Scala del Tono intera, con la Morte allo zero. */
export const TONE_SCALE_MAX = 40;
/** Una divisione: le quattro ampiezze che Ron assessa sono 10, 20, 30, 40. */
export const TONE_STEP = 10;
/** « Resistenza totale » (Ω) = il valore che corrisponde a −40.
 *
 *  RISPOSTA DI RON (04/08/2026), su due domande poste insieme:
 *    • lo ZERO sta al CENTRO DELLO STRUMENTO, non al punto di clear della persona → questa è
 *      quindi una costante del METER, e la metà di essa cade sullo zero;
 *    • le divisioni sono LINEARI NEGLI OHM.
 *  `toneFromResistance` fa già esattamente questo.
 *
 *  Resta vero che il valore dipende dagli ELETTRODI (lattine più grandi = meno ohm): è una
 *  costante DI QUESTO assetto, non dell'universo, e va rimisurata se si cambiano le lattine. */
export const TONE_R_TOTAL = 2_000_000;
