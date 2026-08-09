/**
 * MirrorCycle — la vue MIRROR, D'APRÈS RON, modèle simplifié demandé par l'utilisateur :
 *
 *   a) CONTACT DE LA CHARGE DE L'ITEM → on lui donne une VALEUR de 1 à 10 selon sa QUANTITÉ.
 *      La valeur est FIGÉE au contact (dès que le read s'est retourné) : c'est « la charge de
 *      cet item », elle ne bouge plus.
 *   b) On indique le DOUBLE de cette valeur (la ligne jaune) = LA CIBLE À ATTEINDRE.
 *   c) Quand la cible est atteinte → OBTENU. L'auditeur VALIDE (bouton VALIDER) et repart avec
 *      un autre item. Le total de la séance est cumulé côté App.
 *
 * TOUT est RELATIF (valeur → double → smaltito) : aucune valeur absolue, donc ce cycle ne dépend
 * PAS de l'étalonnage du TA (démontré non fiable). Le « ×2 » est la RÈGLE de Ron. L'échelle 1–10
 * est PROPORTIONNELLE (unités de charge d'EQUILIBRIUM), pas des milliohms. Pur TS, aucune DSP.
 */
// Les MANETTES de réglage vivent toutes dans engine/tuning.ts (source unique). On les
// ré-exporte ici pour ne pas casser les imports existants (App, MirrorDial).
import {
  MIRROR_DIAL_K, MIRROR_SMOOTH, MIRROR_DEADBAND, MIRROR_CONTACT_MIN, MIRROR_TURNOVER,
  MIRROR_CONTACT_WINDOW_S, MIRROR_RATIO_FULL, MIRROR_AMBIENT_ALPHA, MIRROR_BASELINE_FLOOR,
  MIRROR_LOOKBACK_S, MIRROR_CONTACT_RISE_RATIO,
} from './tuning';
export { MIRROR_DIAL_K, MIRROR_SMOOTH, MIRROR_DEADBAND, MIRROR_CONTACT_MIN, MIRROR_TURNOVER, MIRROR_CONTACT_WINDOW_S };

/** VALORE 1–10 RELATIVO: di quanto il picco supera l'ambiente, in rapporto.
 *  picco=ambiente → 0 · picco=2×ambiente → 5 (con RATIO_FULL=3) · picco≥RATIO_FULL×amb → 10. */
export const mirrorValueFromRatio = (peakQ: number, baselineQ: number): number => {
  const base = Math.max(baselineQ, MIRROR_BASELINE_FLOOR);
  const v = 10 * (peakQ / base - 1) / (MIRROR_RATIO_FULL - 1);
  return Math.max(0, Math.min(10, v));
};

export const mirrorReading = (q: number): number => Math.max(0, Math.min(10, q * MIRROR_DIAL_K));
/** Lecture 0..10 → offset [-1,1] du cadran de l'aiguille (même géométrie que ClearDial/QuantumSphere). */
export const mirrorOffset = (reading: number): number => Math.max(-1, Math.min(1, reading / 5 - 1));

export class MirrorCycle {
  armed = false;
  /** (a) VALEUR de l'item = quantité de charge contactée, FIGÉE au contact. */
  contactQ = 0;
  /** true dès que la valeur est figée (le read s'est retourné) → la cible ×2 est définie. */
  locked = false;
  /** Smaltito cumulé depuis le contact (descentes nettes). */
  dischargeQ = 0;
  /** (c) CIBLE ATTEINTE : le smaltito a atteint le DOUBLE de la valeur. */
  reached = false;
  /** Charge courante lissée. */
  liveQ = 0;
  /** AMBIENTE: EMA lento della carica, aggiornato SEMPRE in vista MIRROR (anche da non armato). */
  ambientQ = 0;
  /** Ambiente FISSATO all'aggancio → riferimento del valore relativo. */
  baselineQ = 0;
  /** (a) VALORE 1–10 dell'item (RELATIVO all'ambiente), fissato al lock. */
  valueR = 0;
  /** Da quanti secondi PRIMA dell'item proviene il picco trattenuto (0 = preso dopo l'item).
   *  Serve a dire onestamente all'auditor che la carica era già lì quando ha premuto. */
  peakAgeS = 0;

  private smoothQ = 0;
  private hwQ = 0;
  private peakQ = 0;   // pic en cours de mesure, avant le figeage
  private armedAtS = 0;   // quand l'item a été donné — borne la fenêtre de contact
  /** Charge lissée suivie EN CONTINU, même hors cycle : alimente la rétrospection. */
  private preSmoothQ = 0;
  /** Historique court de la charge lissée (pour regarder en arrière au moment de l'aggancio). */
  private hist: Array<{ t: number; q: number }> = [];
  private lastTickS = 0;
  /** Fin du cycle précédent : la rétrospection ne remonte JAMAIS au-delà, sinon un item
   *  s'attribuerait la charge de l'item d'avant (même règle que pour les reads d'ASSESSMENT). */
  private cycleEndS = -Infinity;

  /** Da chiamare AD OGNI TICK in vista MIRROR (anche senza item armato): mantiene l'ambiente
   *  E lo storico corto della carica, che serve alla RETROSPEZIONE quando si dà l'item. */
  track(q: number, nowS = 0): void {
    q = Math.max(0, q);
    this.lastTickS = nowS;
    this.ambientQ = this.ambientQ === 0 ? q
      : this.ambientQ * (1 - MIRROR_AMBIENT_ALPHA) + q * MIRROR_AMBIENT_ALPHA;
    // carica lisciata seguita in continuo (stessa lisciatura di quella usata da armati)
    this.preSmoothQ = this.preSmoothQ * (1 - MIRROR_SMOOTH) + q * MIRROR_SMOOTH;
    this.hist.push({ t: nowS, q: this.preSmoothQ });
    const cut = nowS - MIRROR_LOOKBACK_S;
    while (this.hist.length && this.hist[0].t < cut) this.hist.shift();
  }

  /** AGGANCIO : on donne l'item → on commence à mesurer le contact de sa charge. */
  arm(nowS: number): void {
    this.armed = true;
    // ⚠️ SI RIPARTE SEMPRE IN AUTOMATICO. `manual` si accende solo quando l'auditor dà il
    // valore a mano (setManualValue). Senza questo azzeramento, un ciclo condotto a mano
    // lasciava `manual = true` per sempre: collegando poi il MUSE, `update()` restava un
    // no-op e MIRROR non misurava più nulla, in silenzio, per tutto il resto della seduta.
    this.manual = false;
    this.armedAtS = nowS;
    this.baselineQ = Math.max(this.ambientQ, MIRROR_BASELINE_FLOOR);
    this.valueR = 0;
    this.contactQ = 0;
    this.locked = false;
    this.dischargeQ = 0;
    this.reached = false;
    this.hwQ = 0;

    // ── RETROSPEZIONE ────────────────────────────────────────────────────────────────────
    // Il preclear ha spesso già pensato l'item PRIMA che si prema il pulsante. Si riparte
    // quindi dal picco delle ultime secondi — MAI oltre la fine del ciclo precedente.
    const from = Math.max(nowS - MIRROR_LOOKBACK_S, this.cycleEndS);
    let best = 0, bestT = nowS;
    for (const h of this.hist) if (h.t >= from && h.q > best) { best = h.q; bestT = h.t; }
    // Il picco anteriore conta SOLO se è una vera SALITA sopra l'ambiente: altrimenti si
    // riprenderebbe il livello ambiente come « picco » e la misura si bloccherebbe subito a 0.
    const isRealPriorRead = best > this.baselineQ * MIRROR_CONTACT_RISE_RATIO;
    this.peakQ = isRealPriorRead ? best : 0;
    this.peakAgeS = isRealPriorRead ? Math.max(0, nowS - bestT) : 0;
    // Si riprende dal livello CORRENTE (non da zero): altrimenti la carica lisciata dovrebbe
    // risalire da 0 e i primi secondi sarebbero falsati.
    this.smoothQ = this.preSmoothQ;
    this.liveQ = this.smoothQ;
  }

  update(q: number, nowS: number): void {
    if (!this.armed) return;
    // SENZA AGO il ciclo è condotto a mano: la misura non deve toccare nulla, o cancellerebbe
    // il valore dato dall'auditor e rimetterebbe `reached` a false a ogni tick.
    if (this.manual) return;
    q = Math.max(0, q);
    this.smoothQ = this.smoothQ * (1 - MIRROR_SMOOTH) + q * MIRROR_SMOOTH;
    this.liveQ = this.smoothQ;

    if (!this.locked) {
      // (a) MESURE DU CONTACT : on suit le pic ; dès que le read se retourne, on FIGE la valeur.
      if (this.smoothQ > this.peakQ) this.peakQ = this.smoothQ;
      // Si FIGE quando il read si ribalta OPPURE quando la finestra di contatto scade: la carica
      // dell'item è quella che compare SUBITO dopo averlo dato, non il massimo di sempre.
      const turnedOver = this.smoothQ < MIRROR_TURNOVER * this.peakQ;
      const windowOver = (nowS - this.armedAtS) >= MIRROR_CONTACT_WINDOW_S;
      // Perché ci sia CONTATTO servono DUE cose: superare il rumore di fondo (soglia assoluta) ed
      // essere una vera SALITA sopra l'ambiente della persona (soglia relativa). La seconda è
      // indispensabile da quando la misura riparte dal livello corrente invece che da zero:
      // altrimenti l'ambiente stesso passerebbe per un picco.
      const aboveNoise = this.peakQ >= MIRROR_CONTACT_MIN;
      const aboveAmbient = this.peakQ >= this.baselineQ * MIRROR_CONTACT_RISE_RATIO;
      if (aboveNoise && aboveAmbient && (turnedOver || windowOver)) {
        this.contactQ = this.peakQ;   // picco in qL (serve per smaltito/doppio)
        this.valueR = mirrorValueFromRatio(this.peakQ, this.baselineQ);   // valore 1–10 RELATIVO
        this.locked = true;
        this.hwQ = this.peakQ;        // la descente depuis le pic compte déjà comme smaltito
      }
      return;
    }

    // (b/c) SMALTITO = descentes NETTES ; cible = le DOUBLE de la valeur figée.
    if (this.smoothQ > this.hwQ) {
      this.hwQ = this.smoothQ;
    } else if (this.hwQ - this.smoothQ >= MIRROR_DEADBAND) {
      this.dischargeQ += this.hwQ - this.smoothQ;
      this.hwQ = this.smoothQ;
    }
    this.reached = this.dischargeQ >= 2 * this.contactQ;
  }

  // ═════════════════════════════════════════════════════════════════════════════════════════
  // SENZA AGO — il metodo del doppio condotto a mano
  // ═════════════════════════════════════════════════════════════════════════════════════════
  /**
   * Senza strumenti il ciclo è guidato dall'auditor, non dalla misura.
   *
   * Non è un ripiego: il metodo del raddoppio di Ron precede i meter. Quel che cambia è CHI dà
   * il valore — l'ago o l'auditor col preclear. Senza questo passo il ciclo restava bloccato al
   * contatto: `valueR` non si fissava mai, quindi non c'era un doppio da raggiungere e
   * `stopMirror` non registrava nemmeno il ciclo (segnalato: « sembra mancare una tappa »).
   */
  manual = false;

  /** (a) L'auditor dà il VALORE 1–10 della carica contattata. Fissa la cifra e apre il doppio. */
  setManualValue(v: number): void {
    this.manual = true;
    this.valueR = Math.max(0, Math.min(10, v));
    // `contactQ` è la grandezza su cui si misura il doppio: a mano coincide col valore, così
    // `progress()` e il bersaglio 2× restano gli stessi di sempre.
    this.contactQ = this.valueR;
    this.dischargeQ = 0;
    this.locked = true;
    this.reached = false;
  }

  /** (c) L'auditor dichiara che il DOPPIO è stato raggiunto. */
  declareReached(): void {
    if (!this.locked) return;
    this.dischargeQ = 2 * this.contactQ;
    this.reached = true;
  }

  /** Avancement vers le DOUBLE (0..1) — pour l'anneau de progression. */
  progress(): number {
    const target = 2 * this.contactQ;
    return this.locked && target > 1e-6 ? Math.min(1, this.dischargeQ / target) : 0;
  }

  /** Fine del ciclo: si memorizza l'istante perché la retrospezione del PROSSIMO item
   *  non risalga dentro questo ciclo. */
  disarm(): void { this.armed = false; this.cycleEndS = this.lastTickS; }

  reset(): void {
    this.armed = false;
    this.manual = false;
    this.armedAtS = 0;
    this.preSmoothQ = 0;
    this.hist = [];
    this.lastTickS = 0;
    this.cycleEndS = -Infinity;
    this.peakAgeS = 0;
    this.ambientQ = 0;
    this.baselineQ = 0;
    this.valueR = 0;
    this.contactQ = 0;
    this.locked = false;
    this.dischargeQ = 0;
    this.reached = false;
    this.liveQ = 0;
    this.smoothQ = 0;
    this.hwQ = 0;
    this.peakQ = 0;
  }
}

/** Singleton — un cycle MIRROR par pipeline de session. */
export const mirrorCycle = new MirrorCycle();
