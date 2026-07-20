/**
 * FalseAsIsDetector — the "Faux AS-IS" check (Ron's text), Phases A + B + improvements.
 *
 * A TRUE AS-IS dissolves the charge → γ "surveillance" drops, the heart relaxes
 * (parasympathetic decel) AND the charge COLLAPSES (a sharp velocity reversal = the
 * doc's "inversion causale"). A FALSE AS-IS only redistributes amplitude: tension
 * falls (relief) while γ persists, HR doesn't slow and there's no real collapse — the
 * charge was DUPLICATED, not released, and it re-arms.
 *
 * INDICE D'ORIGINE (IO) ∈ [0,1] = a QUALITY-WEIGHTED blend of THREE signals:
 *   • γ RELEASE      (1 − γ_min/γ_base) — proxy for the "coherence" term. NOTE: true
 *                     inter-electrode PLV needs per-channel EEG the worker doesn't do
 *                     (and Muse γ@40 Hz is EMG-confounded) → deferred; we use γ power.
 *   • VELOCITY INVERSION (−slope_min / charge_slope) — the causal collapse. qL velocity
 *                     is a RELIABLE signal, so this anchors the IO.
 *   • BPM DECELERATION ((bpm_base − bpm_min)/bpm_base) — the parasympathetic term (HR
 *                     slowing; the Muse PPG can't give clean RR for RMSSD, but slowing
 *                     is measurable, and the worker already zeroes BPM when the beat is
 *                     unclear — so "bpm present" IS the quality gate for this term).
 * QUALITY GATING: the γ weight scales with electrode contact (signalQuality); the BPM
 * term only counts when a clear beat exists. So each term is trusted only when its
 * signal is good, and the reliable velocity term carries the IO when the rest is noisy.
 * IO < IO_THRESH → FALSE AS-IS. Δτ itself is NOT measured (IO is the proxy). Thresholds
 * are first guesses to calibrate on real sessions.
 */
const IO_THRESH = 0.4;    // IO below this → FALSE AS-IS
const WATCH_MS = 1500;    // post-AS-IS window to judge the release
const BPM_DECEL_GAIN = 5; // ~10 % HR drop → 0.5 on the bpm term
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export class FalseAsIsDetector {
  private gammaBaseline = 0;
  private bpmBaseline = 0;
  private sqEMA = 0;          // electrode-contact quality EMA over the cycle (gates γ)
  private chargeSlope = 0;    // peak rising qL slope while charged (inversion reference)
  private watching = false;
  private watchStart = 0;
  private gammaMin = Infinity;
  private bpmMin = Infinity;
  private slopeMin = 0;       // most-negative qL slope during the watch (collapse)
  private io = 0;

  /** Feed the live signals while the cycle runs (before AS-IS). */
  feedCycle(gamma: number, bpm: number | null, slope: number, signalQuality: number): void {
    const g = Math.max(0, gamma);
    this.gammaBaseline = this.gammaBaseline > 0 ? this.gammaBaseline * 0.9 + g * 0.1 : g;
    if (bpm != null && bpm > 0) this.bpmBaseline = this.bpmBaseline > 0 ? this.bpmBaseline * 0.9 + bpm * 0.1 : bpm;
    if (signalQuality >= 0) this.sqEMA = this.sqEMA > 0 ? this.sqEMA * 0.9 + signalQuality * 0.1 : signalQuality;
    if (slope > this.chargeSlope) this.chargeSlope = slope; // peak charge (rising) rate
    // The collapse (steep NEGATIVE slope) happens during DISCHARGE — i.e. here, BEFORE
    // AS-IS is detected — so we must track it across the whole cycle, not just the watch.
    if (slope < this.slopeMin) this.slopeMin = slope;
  }

  /** Open the post-AS-IS watch window. (slopeMin is NOT reset — the collapse already
   *  happened during discharge and must survive into the verdict.) */
  startWatch(nowMs: number): void {
    this.watching = true; this.watchStart = nowMs;
    this.gammaMin = Infinity; this.bpmMin = Infinity;
  }

  /** Feed the signals during the watch. 'pending' until the window closes, then verdict. */
  watch(gamma: number, bpm: number | null, slope: number, nowMs: number): 'pending' | 'true' | 'false' {
    if (!this.watching) return 'pending';
    if (gamma < this.gammaMin) this.gammaMin = gamma;
    if (bpm != null && bpm > 0 && bpm < this.bpmMin) this.bpmMin = bpm;
    if (slope < this.slopeMin) this.slopeMin = slope;
    if (nowMs - this.watchStart >= WATCH_MS) {
      this.watching = false;
      const gammaScore = this.gammaBaseline > 1e-6 ? clamp(1 - this.gammaMin / this.gammaBaseline, 0, 1) : 0.5;
      const velScore = this.chargeSlope > 1e-3 ? clamp(-this.slopeMin / this.chargeSlope, 0, 1) : (this.slopeMin < -0.05 ? 0.5 : 0);
      const bpmAvail = this.bpmBaseline > 1e-6 && this.bpmMin < Infinity;
      const bpmScore = bpmAvail ? clamp(((this.bpmBaseline - this.bpmMin) / this.bpmBaseline) * BPM_DECEL_GAIN, 0, 1) : 0;
      // quality weights: γ scaled by electrode contact; BPM only when a clear beat exists.
      const wGamma = 0.45 * clamp(this.sqEMA / 60, 0.2, 1);
      const wVel = 0.35;
      const wBpm = bpmAvail ? 0.30 : 0;
      this.io = (gammaScore * wGamma + velScore * wVel + bpmScore * wBpm) / (wGamma + wVel + wBpm);
      return this.io < IO_THRESH ? 'false' : 'true';
    }
    return 'pending';
  }

  /** The last computed Indice d'Origine (0..1). */
  getIO(): number { return this.io; }

  reset(): void {
    this.gammaBaseline = 0; this.bpmBaseline = 0; this.sqEMA = 0; this.chargeSlope = 0;
    this.watching = false; this.gammaMin = Infinity; this.bpmMin = Infinity; this.slopeMin = 0; this.io = 0;
  }
}

export const falseAsIsDetector = new FalseAsIsDetector();
