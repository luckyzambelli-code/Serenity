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
  MIRROR_CONTACT_WINDOW_S,
} from './tuning';
export { MIRROR_DIAL_K, MIRROR_SMOOTH, MIRROR_DEADBAND, MIRROR_CONTACT_MIN, MIRROR_TURNOVER, MIRROR_CONTACT_WINDOW_S };

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

  private smoothQ = 0;
  private hwQ = 0;
  private peakQ = 0;   // pic en cours de mesure, avant le figeage
  private armedAtS = 0;   // quand l'item a été donné — borne la fenêtre de contact

  /** AGGANCIO : on donne l'item → on commence à mesurer le contact de sa charge. */
  arm(nowS: number): void {
    this.armed = true;
    this.armedAtS = nowS;
    this.contactQ = 0;
    this.locked = false;
    this.dischargeQ = 0;
    this.reached = false;
    this.liveQ = 0;
    this.smoothQ = 0;
    this.hwQ = 0;
    this.peakQ = 0;
  }

  update(q: number, nowS: number): void {
    if (!this.armed) return;
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
      if (this.peakQ >= MIRROR_CONTACT_MIN && (turnedOver || windowOver)) {
        this.contactQ = this.peakQ;   // valeur de l'item, figée
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

  /** Avancement vers le DOUBLE (0..1) — pour l'anneau de progression. */
  progress(): number {
    const target = 2 * this.contactQ;
    return this.locked && target > 1e-6 ? Math.min(1, this.dischargeQ / target) : 0;
  }

  disarm(): void { this.armed = false; }

  reset(): void {
    this.armed = false;
    this.armedAtS = 0;
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
