/**
 * VelocityTracker — NEST V5 release-velocity model, extracted from App.tsx
 * (SessionEngine slice 1). Pure TS, no React: the worker handler feeds it once
 * per METRICS_UPDATE and reads smoothVProc / velRatio back.
 *
 * Model (unchanged, bit-per-bit):
 *   VELOCITY = rate of ENERGY RELEASE — two signatures, both user-confirmed:
 *     1. galvanic resistance (qL) DROPPING over a ~2 s window (directional discharge);
 *     2. fast brain-wave burst (β+γ fraction of total band power).
 *   smoothVProc = EMA α=0.15 of the source.
 *   Baseline    = slow EMA (α=0.003, ~25 s) of smoothVProc — the PC's personal norm.
 *   velRatio    = smoothVProc / baseline → drives Effetto/Causa (chargeState).
 *
 * Experimental alternative source: spectral centroid (localStorage flag
 * 'sm_vel_v5centroid' = '1'), read ONCE at construction.
 */

export interface VelocityBands {
  delta: number; theta: number; alpha: number; beta: number; gamma: number;
}

export class VelocityTracker {
  /** EMA-smoothed release velocity (SOL/SEC display source). */
  smoothVProc = 0;
  /** Latest velocity / personal-baseline ratio (Effetto/Causa driver). */
  velRatio = 1;

  private hist: { t: number; qL: number }[] = [];
  private baseline = 0;
  private readonly useCentroid: boolean;

  /** Norme personnelle courante (EMA lente de smoothVProc) — pour NORMALISER l'affichage :
   *  velRatio = smoothVProc / baseline, la MÊME mesure « × » que l'écran (readout diagnostic). */
  getBaseline(): number { return this.baseline; }

  constructor() {
    this.useCentroid = (() => {
      try { return localStorage.getItem('sm_vel_v5centroid') === '1'; } catch { return false; }
    })();
  }

  /** Feed one worker cycle. `nowS` = session-relative seconds. */
  update(qL: number, bands: VelocityBands, velCentroid: number, nowS: number): void {
    const qh = this.hist;
    qh.push({ t: nowS, qL });
    while (qh.length > 1 && nowS - qh[0].t > 2.0) qh.shift(); // ~2 s window
    const wOld = qh[0];
    const winSec = Math.max(0.2, nowS - wOld.t);
    // RELEASE: how fast resistance DROPS over the window (≥0; rising/flat = 0)
    const dropRate = Math.max(0, wOld.qL - qL) / winSec;
    // Fast-wave ENERGY fraction (β+γ over total) — the EEG release signature.
    const tot = (bands.delta + bands.theta + bands.alpha + bands.beta + bands.gamma) || 1;
    const fastEnergy = (bands.beta + bands.gamma) / tot;
    const velSrc = this.useCentroid
      ? (Number.isFinite(velCentroid) ? velCentroid / 100 : 0)
      : (dropRate * 2.0 + fastEnergy * 0.5);     // release velocity
    this.smoothVProc = 0.15 * velSrc + 0.85 * this.smoothVProc;
    // AVERAGE baseline (slow EMA ~25 s): velRatio≈1 when moving normally →
    // CAUSA is the default; EFFETTO only when release drops clearly below norm.
    if (this.baseline <= 0) this.baseline = this.smoothVProc || 1e-4;
    else this.baseline = 0.003 * this.smoothVProc + 0.997 * this.baseline;
    this.velRatio = this.smoothVProc / (this.baseline + 1e-6);
  }

  /** Session start: clear the window and re-seed the self-calibrating baseline.
   *  (smoothVProc and velRatio intentionally NOT reset — matches the previous
   *  App.tsx behaviour: only qlHist + baseline were cleared in handleStart.) */
  resetSession(): void {
    this.hist = [];
    this.baseline = 0;
  }
}

/** Singleton — one session pipeline per app instance. */
export const velocityTracker = new VelocityTracker();
