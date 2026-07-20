/**
 * TaAccumulator — Tone Arm smoothing + Total TA high-water accumulator,
 * extracted from App.tsx (SessionEngine slice 1). Pure TS, no React.
 *
 * TA Quantum Recalibration — spec §5 NEST V3 (unchanged, bit-per-bit):
 *   target TA = 2.0 + SPAN · (1 − exp(−|mS| · GAIN)), clamped to [2.0, 6.0],
 *   then analog-slow EMA (SMOOTHING_FACTOR 0.04) toward the target.
 *   CONN-93 / 2026-06 user calibration: GAIN 0.6, SPAN 2.1 (rest 2.0, strong
 *   charge tops ~4.1).
 *
 * Total TA — HIGH-WATER MARK (Option A analogique):
 *   only NET descents from the last peak count; re-climbs below the peak are
 *   not re-counted; a genuine new peak (> +0.1 div, CONN-92 dead-band) resets
 *   the counter. Counted in 0.1-div floor steps.
 */

const TA_GAIN_DEFAULT = 0.6;   // gentler rise per unit of charge
const TA_SPAN_DEFAULT = 2.1;   // 2.0 (rest) … up to ~4.1 on strong charge
const SMOOTHING_FACTOR = 0.04; // analogique lent
const TA_CALIB_KEY = 'sm_ta_calib'; // { gain, span, baseline? } persisté (calibration vs meter réel)

/** COMPRESSION du mS avant la formule TA. Les mS bruts s'étalent sur ~5 ordres de grandeur
 *  (0.003 … 256 dans les données réelles) → l'exponentielle SATURAIT (TA collée au max) et tous
 *  les fits s'effondraient à gain/span minimum. En log, |mS| 0…256 devient ~0…2.4 : réponse
 *  utilisable et fittable. (Le mS BRUT reste exposé via lastMs pour l'affichage.) */
const msCompress = (mS: number): number => Math.log10(1 + Math.abs(mS));

export interface TaCalibration { baseline: number; gain: number; span: number; }

export class TaAccumulator {
  /** Current smoothed Tone Arm (baseline–6.0). */
  toneArm = 2.0;

  /** CLEAR baseline = the rest read when no charge acts on the meter. Constitutional:
   *  man = 3.0, woman = 2.0 (user spec). Charge raises the TA from here; running the
   *  mass brings it back down to the baseline = the clear read. */
  private baseline = 2.0;
  /** CALIBRATION (vs meter réel) : gain + span de la réponse charge→TA. Réglables + persistés
   *  (instrument-level, indép. du PC). GAIN = pente de montée, SPAN = amplitude max. */
  gain = TA_GAIN_DEFAULT;
  span = TA_SPAN_DEFAULT;
  /** Dernier mS BRUT reçu (entrée de la formule) — lu par le panneau de calibration pour
   *  capturer des paires (mS, TA_meter) et faire le fit. */
  lastMs = 0;
  /** Horodatage (Date.now) du dernier update(). Le panneau s'en sert pour savoir si le mS est
   *  VIVANT (session en cours + EEG qui scorre) ou FIGÉ → interdit les captures sur mS figé. */
  lastMsAt = 0;

  private highWater: number | null = null;
  private countedFromHigh = 0;

  constructor() {
    // Charge la calibration persistée (gain/span ; baseline optionnel).
    try {
      const raw = localStorage.getItem(TA_CALIB_KEY);
      if (raw) {
        const c = JSON.parse(raw);
        if (typeof c?.gain === 'number' && isFinite(c.gain)) this.gain = c.gain;
        if (typeof c?.span === 'number' && isFinite(c.span)) this.span = c.span;
        if (typeof c?.baseline === 'number' && c.baseline > 0) this.baseline = c.baseline;
      }
    } catch { /* pas de calibration persistée */ }
  }

  /** Set the clear baseline (man 3.0 / woman 2.0). Snaps a resting needle to it. */
  setBaseline(b: number): void {
    if (!(b > 0) || b === this.baseline) return;
    // If the needle is sitting at (near) the old rest, move it to the new rest too.
    if (Math.abs(this.toneArm - this.baseline) < 0.05) this.toneArm = b;
    this.baseline = b;
  }

  /** Calibration courante (pour l'UI). */
  getCalibration(): TaCalibration { return { baseline: this.baseline, gain: this.gain, span: this.span }; }

  /** Applique + PERSISTE une calibration (depuis les sliders ou le fit auto). */
  setCalibration(c: Partial<TaCalibration>): void {
    if (typeof c.gain === 'number' && isFinite(c.gain)) this.gain = Math.max(0.05, Math.min(3, c.gain));
    if (typeof c.span === 'number' && isFinite(c.span)) this.span = Math.max(0.2, Math.min(4.5, c.span));
    if (typeof c.baseline === 'number' && c.baseline > 0) { this.baseline = c.baseline; if (Math.abs(this.toneArm - this.baseline) < 0.3) this.toneArm = this.baseline; }
    try { localStorage.setItem(TA_CALIB_KEY, JSON.stringify(this.getCalibration())); } catch { /* quota */ }
  }

  /** TA prédit pour un mS donné avec la calibration COURANTE (utilisé par le fit / preview). */
  taForMs(mS: number, cal?: Partial<TaCalibration>): number {
    const base = cal?.baseline ?? this.baseline;
    const g = cal?.gain ?? this.gain;
    const sp = cal?.span ?? this.span;
    const m = msCompress(mS);
    return Math.min(6.0, Math.max(base, base + sp * (1 - Math.exp(-m * g))));
  }

  /**
   * Feed one worker cycle. Returns the freshly-counted Total-TA divisions
   * (≥ 0.1 when a new net descent was counted, else 0).
   */
  update(mS: number, running: boolean): number {
    this.lastMs = mS;
    this.lastMsAt = Date.now();
    const m = msCompress(mS);   // compression log → plus de saturation de l'exponentielle
    const targetTa = this.baseline + this.span * (1 - Math.exp(-m * this.gain));
    const targetTaClamped = Math.min(6.0, Math.max(this.baseline, targetTa));
    const nextTa = Math.min(6.0, Math.max(this.baseline,
      (this.toneArm * (1 - SMOOTHING_FACTOR)) + (targetTaClamped * SMOOTHING_FACTOR)
    ));
    this.toneArm = nextTa;

    let newDivisions = 0;
    if (!running) {
      this.highWater = nextTa;
      this.countedFromHigh = 0;
    } else if (isFinite(nextTa)) {
      if (this.highWater === null) {
        this.highWater = nextTa;
        this.countedFromHigh = 0;
      } else if (nextTa > this.highWater + 0.1) {
        // CONN-92: only a GENUINE rise (> 0.1 div) sets a new peak — micro
        // upticks must not re-arm the counter (Total TA inflation).
        this.highWater = nextTa;
        this.countedFromHigh = 0;
      } else {
        // Descent from the peak: count only the portion not yet counted.
        const totalDrop = this.highWater - nextTa;
        const countableFloor = Math.floor(totalDrop * 10) / 10; // 0.1-div floor
        const delta = Math.round((countableFloor - this.countedFromHigh) * 100) / 100;
        if (delta >= 0.1) {
          newDivisions = delta;
          this.countedFromHigh = countableFloor;
        }
      }
    }
    return newDivisions;
  }

  /** Session start: re-arm the high-water tracker. (toneArm intentionally NOT
   *  reset — matches the previous App.tsx behaviour.) */
  resetSession(): void {
    this.highWater = null;
    this.countedFromHigh = 0;
  }
}

/** Singleton — one session pipeline per app instance. */
export const taAccumulator = new TaAccumulator();
