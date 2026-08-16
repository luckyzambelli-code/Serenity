/**
 * THETA-REACTIONS — classifica le reazioni sull'ago delle BOÎTES.
 *
 * ── PERCHÉ SERVE ────────────────────────────────────────────────────────────────────────────
 * ASSESSMENT e i cicli prendono le letture dal classificatore EEG. Col solo meter non arriva
 * nulla, quindi ogni item risultava NULL mentre l'ago si muoveva sotto gli occhi dell'auditor —
 * segnalato in seduta. Qui le reazioni si leggono dall'ago VERO, che è il modo classico.
 *
 * ── IL MODELLO: un EPISODIO, non un campione ───────────────────────────────────────────────
 * Una reazione non è un valore istantaneo: è un movimento che parte, arriva a un culmine e
 * rientra. Classificare campione per campione produrrebbe una raffica di letture per una sola
 * caduta. Si segue quindi l'episodio: si apre quando l'ago esce dalla banda di riposo, si tiene
 * il PICCO, e si emette UNA reazione quando rientra — quella del picco.
 *
 * ── LA SOGLIA È IL SEGNO STAMPATO SUL QUADRANTE ────────────────────────────────────────────
 * Ogni reazione si dichiara quando l'ago arriva SUL SUO SEGNO (SF, FALL, LONG FALL, LFBD): ciò
 * che si legge scritto e ciò che si vede sono la stessa cosa per costruzione. Confrontare la
 * corsa dell'ago con le posizioni del quadrante — errore della prima stesura — dichiarava un SF
 * con l'ago ancora prima del segno SF, e un blow down dove si vedeva un long fall.
 *
 * ── COSA QUESTO NON FA ──────────────────────────────────────────────────────────────────────
 * Non riconosce il FLOATING NEEDLE. Un F/N è uno spazzare ritmico, lento e uniforme, non
 * un'ampiezza: va riconosciuto dalla FORMA nel tempo, e sta in `thetaFloat.ts` — un rilevatore a
 * parte, perché letto per ampiezze un F/N darebbe una raffica di « fall », che è il suo
 * contrario.
 *
 * Puro TS, nessuna dipendenza: si alimenta con la deviazione dell'ago e il tempo.
 */
import {
  THETA_REACT_TICK, THETA_REACT_SF, THETA_REACT_FALL,
  THETA_REACT_LONG_FALL, THETA_REACT_BLOW_DOWN, THETA_EPISODE_RELEASE, THETA_EPISODE_RETURN_FRAC,
  THETA_EPISODE_SETTLE_S, THETA_REACT_CONFIRM_S, THETA_BASELINE_CREEP_S, THETA_MIN_RATE,
} from './tuning';

/** Le chiavi di reazione, identiche a quelle usate dal resto dell'applicazione. */
export type ThetaReactionKey =
  | 'reaction_tick' | 'reaction_sf' | 'reaction_fall'
  | 'reaction_long_fall' | 'reaction_blow_down';

/** Una reazione riconosciuta. */
export interface ThetaReaction {
  key: ThetaReactionKey;
  /** LA CORSA PERCORSA — quanto l'ago è sceso dal punto in cui era posato, in unità di
   *  quadrante. NON la sua distanza da SET: quella dipende da dove sta il braccio, non dalla
   *  reazione. È questa la grandezza confrontabile con il `moveR` del MUSE. */
  peak: number;
  /** Quando è cominciato il movimento (s dall'inizio seduta) — è QUESTO l'istante della
   *  reazione, non quello in cui rientra: una caduta si attribuisce a quando parte. */
  startedAtSec: number;
  /** Quanto è durato l'episodio (s). */
  durationSec: number;
  /** Numero dell'episodio. Un movimento solo può emettere PIÙ volte, salendo di grado man mano
   *  che l'ago scende: chi consuma usa questo numero per SOSTITUIRE la lettura precedente
   *  invece di aggiungerne una nuova. */
  id: number;
  /** `false` = l'ago è ancora in corsa, questa è la lettura di ADESSO. `true` = l'oscillazione
   *  è finita, e questo è il verdetto definitivo (quello che va archiviato). */
  final: boolean;
}

/**
 * CORSA PERCORSA → reazione.
 *
 * ⚠️ Si passa QUANTO L'AGO HA PERCORSO, non dove è arrivato. Il segno stampato sul quadrante
 * ricorda all'auditor un'AMPIEZZA, non un traguardo: se l'ago parte tutto a sinistra, una fall
 * arriva dalle parti di SET e resta una fall (Claudio, 01/08/2026).
 *
 * Prima qui arrivava `|deviazione da SET|`, cioè una POSIZIONE, e ne seguivano due errori
 * misurati nella seduta del 01/08:
 *   • stessa corsa, gradi diversi — 0,176 di movimento → « Tick » a −0,08→0,09, e 0,192 →
 *     « SF » a 0,23→0,42: decideva la manopola, non la reazione;
 *   • col valore ASSOLUTO, un ago che parte a sinistra e cade VERSO SET fa scendere quel
 *     numero: la caduta era letteralmente invisibile.
 */
export const classifyAmplitude = (corsa: number): ThetaReactionKey | null => {
  const a = Math.abs(corsa);
  if (a >= THETA_REACT_BLOW_DOWN) return 'reaction_blow_down';
  if (a >= THETA_REACT_LONG_FALL) return 'reaction_long_fall';
  if (a >= THETA_REACT_FALL)      return 'reaction_fall';
  if (a >= THETA_REACT_SF)        return 'reaction_sf';
  if (a >= THETA_REACT_TICK)      return 'reaction_tick';
  return null;                     // sotto il tick: rumore, non una lettura
};

/**
 * È abbastanza VELOCE per essere una lettura?
 *
 * Una lettura è un movimento subito: l'ago parte e arriva. Una deriva percorre la stessa
 * distanza impiegandoci dieci volte tanto, e l'ampiezza da sola non le distingue — misurato in
 * seduta, la deriva superava la soglia e si scriveva « Tick » con l'ago che non faceva niente
 * di visibile.
 */
const abbastanzaVeloce = (ampiezza: number, durataSec: number): boolean =>
  durataSec <= 0 ? true : (ampiezza / durataSec) >= THETA_MIN_RATE;

/** Forza relativa dei gradi: serve a non riscrivere una lettura AL RIBASSO. */
const ORDINE: Record<ThetaReactionKey, number> = {
  reaction_tick: 1, reaction_sf: 2, reaction_fall: 3,
  reaction_long_fall: 4, reaction_blow_down: 5,
};

/**
 * Il grado di un movimento: la CORSA percorsa, più l'unica eccezione che è davvero una POSIZIONE.
 *
 * Un LF Blow Down non è « una caduta molto lunga »: è l'ago che finisce contro il BORDO destro e
 * obbliga a scendere con la manopola. Serve quindi una corsa da long fall **e** l'arrivo al
 * bordo — la stessa regola che il classificatore del MUSE applica già (`moveR > 0.26 &&
 * curOff >= 0.82`). Senza, una caduta enorme partita da metà quadrante non potrebbe più essere
 * un blow down: al bordo ci arriva, ma senza spazio per percorrere 1,20 di corsa.
 */
const gradoDi = (corsa: number, posizione: number): ThetaReactionKey | null => {
  const g = classifyAmplitude(corsa);
  if (g && posizione >= THETA_REACT_BLOW_DOWN && ORDINE[g] >= ORDINE['reaction_long_fall']) {
    return 'reaction_blow_down';
  }
  return g;
};

/**
 * Segue l'ago e riconosce gli episodi.
 *
 * Si alimenta con la deviazione RISPETTO A SET (positiva = caduta a destra) e il tempo in
 * secondi.
 *
 * ── LA LETTURA È ISTANTANEA ────────────────────────────────────────────────────────────────
 * Emette **appena l'ago tocca un segno**, non alla fine dell'oscillazione: l'auditor legge
 * MENTRE l'ago scende, non quando si è fermato. Aspettare la chiusura dell'episodio — come
 * faceva la prima stesura — voleva dire scrivere la lettura un secondo dopo averla vista, e in
 * assessment un secondo è un'eternità.
 *
 * Un solo movimento può quindi emettere PIÙ volte, salendo di grado: SF, poi FALL se continua,
 * poi LONG FALL. Mai al ribasso. Tutte le emissioni portano lo stesso `id`, e chi le consuma
 * SOSTITUISCE la lettura precedente invece di accumularne. L'ultima, con `final: true`, è il
 * verdetto: è quella che va in archivio.
 */
export class ThetaReactionTracker {
  /** Episodio in corso, se ce n'è uno. */
  private open: { startedAtSec: number; peak: number; peakAtSec: number; partenza: number;
                  id: number; grado: ThetaReactionKey | null } | null = null;
  /** Da quando l'ago è FUORI dal riposo senza più rientrare. L'episodio si apre solo se ci
   *  resta: un campione isolato oltre la soglia è rumore, e aprire su quello scriveva reazioni
   *  che l'auditor non vedeva. */
  private sopraDa = -1;
  /** Grado candidato e da quando regge — stessa idea, applicata al GRADO. */
  private cand: ThetaReactionKey | null = null;
  private candDa = 0;
  /** Ultimo istante alimentato: serve a far salire la base a tempo, non a campioni. */
  private lastSec = -1;
  /** La BASE da cui si misura il movimento — dove l'ago STA, non dove riposerebbe.
   *
   *  Chiudendo l'episodio al rientro parziale (THETA_EPISODE_RETURN_FRAC) l'ago resta ben fuori
   *  dalla banda di riposo, e senza un freno se ne aprirebbe subito un altro sulla coda della
   *  stessa caduta: una caduta sola scritta due volte. Il freno però non può essere « aspetta il
   *  rientro completo »: il riposo dell'ago vero è il BRACCIO, che rientra in decine di secondi,
   *  e per tutto quel tempo si perdevano movimenti che l'auditor VEDEVA (segnalato in seduta).
   *
   *  Si insegue quindi il fondo del rientro e si riapre appena l'ago RIPARTE da lì. Ogni nuova
   *  escursione visibile viene letta, senza che una sola caduta si sdoppi. */
  private trough = 0;
  /** L'ultimo istante in cui l'ago era ancora FERMO sul fondo, cioè il momento in cui il
   *  movimento è PARTITO.
   *
   *  Datare la reazione a quando l'ago supera la soglia di lettura sposta tutto in avanti di
   *  quanto ci mette a percorrerla — su una caduta lenta, mezzo secondo. E mezzo secondo basta
   *  a far cadere l'instant read fuori dalla fine della parola, cioè a farlo sparire. */
  private troughAtSec = 0;
  /** Contatore degli episodi: distingue « la stessa caduta che si approfondisce » da « una
   *  caduta nuova ». */
  private episodio = 0;

  /**
   * @param dev  deviazione dell'ago rispetto a SET, in unità di quadrante
   * @param nowSec  tempo di seduta
   * @param bodyMotion  la persona si sta muovendo: nessuna lettura è attribuibile
   */
  /** Fino a quando il classificatore deve TACERE (s di seduta). Vedi `muteUntil`. */
  private mutoFino = -1;

  /**
   * TACI FINO A — quel che l'ago fa adesso non è il preclear.
   *
   * ⚠️ Serve per le PROVE DELLE LATTINE. La stretta fa cadere l'ago di un terzo di quadrante:
   * è il suo scopo, ma il classificatore vede solo un'ampiezza e la chiamava LONG FALL. Finché
   * le prove si facevano prima della seduta non si vedeva; da quando si possono RIFARE IN
   * SEDUTA quelle righe entrano davvero — nel giornale, nell'archivio, e fra le LETTURE su cui
   * ASSESSMENT giudica l'item in corso (segnalato in seduta).
   *
   * ⚠️ E il silenzio deve durare OLTRE la fine della prova: quando si MOLLANO le lattine l'ago
   * rientra, e quel rientro è a sua volta una corsa ampia — cioè una seconda reazione falsa. È
   * la ragione per cui non basta azzerare: azzerare toglie l'episodio aperto, non quello che
   * comincia subito dopo.
   */
  muteUntil(secondi: number): void {
    this.mutoFino = Math.max(this.mutoFino, secondi);
    this.reset();
  }

  /** Sta tacendo? (per chi deve saperlo senza spingere un campione) */
  isMuted(nowSec: number): boolean { return nowSec < this.mutoFino; }

  push(dev: number, nowSec: number, bodyMotion = false): ThetaReaction | null {
    // Finché dura il silenzio non si accumula NIENTE: né episodio, né base. Al risveglio si
    // riparte dall'ago com'è in quel momento, che è esattamente quel che si vuole.
    if (nowSec < this.mutoFino) { this.reset(); return null; }
    // ── IL MOVIMENTO CORPOREO NON ACCECA PIÙ ──────────────────────────────────────────────
    // Prima si abbandonava l'episodio: sembrava prudente, e invece l'agitazione resta alta per
    // TRE SECONDI dopo ogni stretta, e in quei tre secondi si perdevano anche gli item veri che
    // seguivano. Misurato in seduta: strette ripetute → agitazione su quasi ogni item → NULL
    // ovunque, comprese le reazioni piccole e pulite in mezzo.
    //
    // Ora si legge lo stesso, e la lettura sbagliata si RITIRA quando l'agitazione compare
    // (vedi THETA_RETRACT_MS). Una lettura che appare e si ritira è onesta; una lettura vera
    // che non appare mai è persa e basta.
    void bodyMotion;

    // ── DEVIAZIONE SEGNATA, NON ASSOLUTA ──────────────────────────────────────────────────
    // A destra = positiva = caduta. Con `Math.abs` un ago posato a SINISTRA di SET che cade
    // VERSO SET faceva DIMINUIRE il numero, e la caduta spariva. Misurato: 46,2 s del 01/08,
    // l'ago percorre −0,08 → 0,09 (0,17 di caduta netta) e il classificatore ne vede 0,09.
    const d = dev;
    const dtNoto = this.lastSec;   // l'istante PRECEDENTE, per far salire la base a tempo
    this.lastSec = nowSec;

    if (this.open) {
      if (d > this.open.peak) { this.open.peak = d; this.open.peakAtSec = nowSec; }
      // L'episodio si chiude al RIENTRO — completo (banda di riposo) oppure PARZIALE (l'ago ha
      // riguadagnato una buona parte del picco). Il rientro parziale è quello che conta sull'ago
      // vero: il suo riposo è il braccio, che rientra in decine di secondi, e aspettarlo faceva
      // arrivare la lettura fuori tempo massimo.
      // …oppure quando l'ago ha semplicemente SMESSO di andare giù: una caduta che resta giù
      // non rientra mai (la riporta il braccio, in decine di secondi), e senza questo l'auditor
      // vedeva la caduta e l'app taceva.
      // Rientro e corsa si misurano entrambi DALLA PARTENZA: un ago caduto da 0,60 a 0,90 è
      // rientrato quando risale verso 0,60, non quando arriva a SET — che è dove lo riporta il
      // braccio, in decine di secondi.
      const corsa = this.open.peak - this.open.partenza;
      const fermo = nowSec - this.open.peakAtSec >= THETA_EPISODE_SETTLE_S;
      const rientrato = d <= this.open.partenza + THETA_EPISODE_RELEASE
        || d <= this.open.peak - corsa * THETA_EPISODE_RETURN_FRAC;
      if (rientrato || fermo) {
        const ep = this.open;
        this.open = null;
        this.trough = d; this.troughAtSec = nowSec;   // da QUI si misura la prossima ripartenza
        // ── IL VERDETTO È IL GRADO PIÙ ALTO CHE È STATO MOSTRATO ──────────────────────────
        // NON `classifyAmplitude(picco)`: il picco è il valore grezzo più profondo toccato, e
        // può essere un guizzo di 30 ms mai confermato, quindi mai scritto sullo schermo. Alla
        // chiusura quel grado compariva di colpo — « LONG FALL » — mentre l'ago era già
        // rientrato: la scritta diceva una cosa e l'ago ne faceva un'altra (segnalato in
        // seduta). Così invece resta vero che NIENTE si scrive senza essere stato visto.
        // Troppo lenta per essere una lettura → non lo è. Si scarta invece di scriverla.
        if (!abbastanzaVeloce(corsa, ep.peakAtSec - ep.startedAtSec)) return null;
        return ep.grado ? { key: ep.grado, peak: corsa, startedAtSec: ep.startedAtSec,
                            durationSec: Math.max(0, nowSec - ep.startedAtSec),
                            id: ep.id, final: true } : null;
      }
      // ── L'AGO È ANCORA IN CORSA: si legge ADESSO ─────────────────────────────────────────
      // Appena tocca un segno più profondo di quello già annunciato, si emette. È così che si
      // legge un meter: la lettura cresce sotto gli occhi, non arriva a cose fatte.
      // Il grado si annuncia su ciò che l'ago sta facendo ADESSO, e solo se REGGE. Mai al
      // ribasso: durante il rientro l'ago riattraversa i segni più bassi, e riscriverli
      // trasformerebbe una fall in una SF sotto gli occhi dell'auditor.
      const percorsa = d - this.open.partenza;
      const grado = gradoDi(percorsa, d);
      if (grado && grado !== this.open.grado
          && ORDINE[grado] > ORDINE[this.open.grado ?? 'reaction_tick'] - (this.open.grado ? 0 : 1)
          && abbastanzaVeloce(percorsa, nowSec - this.open.startedAtSec)
          && this.conferma(grado, nowSec)) {
        this.open.grado = grado;
        return { key: grado, peak: corsa, startedAtSec: this.open.startedAtSec,
                 durationSec: Math.max(0, nowSec - this.open.startedAtSec),
                 id: this.open.id, final: false };
      }
      return null;
    }

    // ── LA BASE SEGUE L'AGO ───────────────────────────────────────────────────────────────
    // Scende SUBITO se l'ago rientra (un rientro è un'informazione), e sale PIANO se l'ago si
    // posa più in alto (è un assestamento, non una lettura). Senza la salita, un ago rimasto
    // lontano da SET — cosa normale, il braccio ci mette venti secondi — non si faceva più
    // leggere: misurato in seduta, movimenti di 0,33 e nessuna lettura per quaranta secondi.
    if (d < this.trough) {
      this.trough = d;
    } else if (dtNoto >= 0) {
      const dt = Math.max(0, nowSec - dtNoto);
      this.trough += (d - this.trough) * Math.min(1, dt / THETA_BASELINE_CREEP_S);
    }
    // Finché l'ago è POSATO sulla base si tiene aggiornato l'istante: appena riparte, quello
    // è il momento in cui è partito.
    if (d <= this.trough + THETA_EPISODE_RELEASE) this.troughAtSec = nowSec;

    // …e si riapre appena l'ago RIPARTE da lì. Le due condizioni dicono due cose diverse:
    // la prima che il movimento è abbastanza grande da essere una lettura, la seconda che è un
    // movimento NUOVO e non la coda di quello appena letto.
    // Apertura: conta che l'ago sia USCITO dal riposo e ci RESTI — non che un grado preciso
    // regga (su una caduta ripida il grado cambia mentre l'ago corre, e pretendere il grado
    // fisso avrebbe impedito di aprire proprio sulle cadute più nette).
    // La CORSA dal punto in cui l'ago era posato — non la sua distanza da SET. È l'unica
    // condizione di apertura: dove sta il braccio non c'entra con quanto è caduto.
    const percorsa = d - this.trough;
    const fuori = percorsa >= THETA_REACT_TICK;
    if (!fuori) this.sopraDa = -1;
    else if (this.sopraDa < 0) this.sopraDa = nowSec;
    const apre = gradoDi(percorsa, d);
    if (apre && fuori && nowSec - this.sopraDa >= THETA_REACT_CONFIRM_S
        && abbastanzaVeloce(percorsa, nowSec - (this.troughAtSec || nowSec))) {
      this.open = { startedAtSec: this.troughAtSec || nowSec, peak: d, peakAtSec: nowSec,
                    partenza: this.trough, id: ++this.episodio, grado: apre };
      // …e si annuncia SUBITO: il movimento è già confermato da qualche campione.
      return { key: apre, peak: percorsa, startedAtSec: this.open.startedAtSec,
               durationSec: 0, id: this.open.id, final: false };
    }
    return null;
  }

  /** Il grado regge da abbastanza campioni? Rende `true` una volta sola, quando la soglia di
   *  conferma è appena raggiunta. */
  private conferma(g: ThetaReactionKey, nowSec: number): boolean {
    if (g !== this.cand) { this.cand = g; this.candDa = nowSec; return false; }
    return nowSec - this.candDa >= THETA_REACT_CONFIRM_S;
  }

  /** C'è un movimento in corso? Serve a non attribuire un item a un'oscillazione già iniziata. */
  get inEpisode(): boolean { return this.open !== null; }

  reset(): void { this.open = null; this.trough = 0; this.troughAtSec = 0; this.episodio = 0; this.lastSec = -1;
                  this.cand = null; this.candDa = 0; this.sopraDa = -1; }

  /** Azzeramento COMPLETO, silenzio compreso — seduta nuova. `reset()` da solo non lo toglie,
   *  perché `muteUntil` lo chiama e si annullerebbe da sé. */
  resetAll(): void { this.mutoFino = -1; this.reset(); }
}
