/**
 * LagMeter — Phase 4: estimate the PC's personal reaction time Δt* ("Ron's Lag")
 * from data, instead of guessing a fixed constant.
 *
 * For each armed auditing cycle we have:
 *   • t_Item        = the moment the auditor ARMED the cycle (asked the item);
 *   • t_leadingEdge = the first leading-edge after it (γ spike OR qL rising-edge).
 * The per-cycle lag = t_leadingEdge − t_Item.
 *
 * STEP 1 was a running MEDIAN. STEP 2 (this file) upgrades it to a 2-D KALMAN
 * FILTER with state x = [lag (ms), rate (ms/s)] under a constant-velocity model.
 * Why the Kalman over the median:
 *   • it FUSES each noisy observation with the running estimate (optimal under the
 *     model) → a smoother, less jumpy Δt* than re-sorting a window every time;
 *   • it tracks the TREND (rate): a shrinking lag = the PC growing more "in cause"
 *     / present — exposed via getTrend() for the report;
 *   • it carries its own uncertainty, so early estimates are tentative and sharpen
 *     as cycles accumulate, and long silences widen the gate for the next reading.
 *
 * The plausibility window [LAG_MIN, LAG_MAX] still pre-filters each raw lag before
 * it reaches the filter (an immediate edge = no real stimulus→response; a very late
 * one = drift, not the item). Compare Δt* to the ~420–500 ms γ-before-needle
 * "Pre-Read" measured in the Jan 2026 tests.
 *
 * Pure-TS singleton, fed from App's METRICS_UPDATE. No React.
 */
const LAG_MIN = 120;   // ms — below this = not a stimulus→response (qL already rising)
const LAG_MAX = 3000;  // ms — above this = not attributable to the item

// BASELINE + ADAPTIVE decomposition (per the "Comm to Ron" RS1 note, honest version):
//   Δt* = Δt*_baseline + Δt*_adaptive
// • baseline = a STRUCTURAL anchor — here the measured "Pre-Read" (γ precedes the needle
//   ~420–500 ms, Jan 2026 tests). NOT the metaphysical (x)⁻⁵·Δt_MEST (unmeasurable on a
//   Muse 2); we use the honest physiological analog.
// • adaptive = the per-PC deviation from that baseline, estimated by the Kalman filter
//   from the cycle leading-edge lags. So the filter tracks the RESIDUAL (lag − baseline),
//   anchored at the baseline instead of being washed out by the first reading.
const BASELINE = 450;  // ms — Pre-Read structural anchor for Δt*_baseline

// ── Kalman tuning (state estimates the ADAPTIVE residual, init 0 = "at baseline") ──
const P0_ADAPT = 1.5e4; // moderate initial uncertainty → baseline holds, then corrects
const P0_RATE  = 1e3;   // initial uncertainty on the rate
const Q_LAG    = 400;   // process noise on the adaptive term (ms²/s) — slow drift (fatigue)
const Q_RATE   = 20;    // process noise on rate (ms²/s²)
const R_MEAS   = 4e4;   // measurement variance (≈ (200 ms)²) — coarse 4 Hz leading-edge

export class LagMeter {
  // state x = [adaptive (deviation from BASELINE), rate]
  private x: [number, number] = [0, 0];
  // covariance P (symmetric 2×2)
  private P: [[number, number], [number, number]] = [[P0_ADAPT, 0], [0, P0_RATE]];
  private n = 0;
  private lastMs = 0;

  /** Kalman predict by dt seconds (constant-velocity). */
  private predict(dtSec: number): void {
    if (dtSec <= 0) return;
    const [lag, rate] = this.x;
    // x = F x,  F = [[1, dt],[0, 1]]
    this.x = [lag + rate * dtSec, rate];
    // P = F P Fᵀ + Q
    const [[p00, p01], [p10, p11]] = this.P;
    const n00 = p00 + dtSec * (p01 + p10) + dtSec * dtSec * p11 + Q_LAG * dtSec;
    const n01 = p01 + dtSec * p11;
    const n10 = p10 + dtSec * p11;
    const n11 = p11 + Q_RATE * dtSec;
    this.P = [[n00, n01], [n10, n11]];
  }

  /** Kalman update with a scalar lag measurement z (ms), H = [1, 0]. */
  private correct(z: number): void {
    const [[p00, p01], [p10, p11]] = this.P;
    const y = z - this.x[0];          // innovation
    const S = p00 + R_MEAS;           // innovation covariance
    const k0 = p00 / S, k1 = p10 / S; // Kalman gain
    this.x = [this.x[0] + k0 * y, this.x[1] + k1 * y];
    // P = (I − K H) P,  K H = [[k0,0],[k1,0]]
    this.P = [
      [(1 - k0) * p00, (1 - k0) * p01],
      [p10 - k1 * p00, p11 - k1 * p01],
    ];
  }

  /** Record one cycle's leading-edge lag (ms). Returns true if accepted. The filter
   *  tracks the ADAPTIVE residual (lag − BASELINE), so we feed it the residual. */
  recordLag(lagMs: number): boolean {
    if (!(lagMs >= LAG_MIN && lagMs <= LAG_MAX)) return false;
    const now = Date.now();
    if (this.lastMs > 0) this.predict((now - this.lastMs) / 1000);
    this.lastMs = now;
    this.correct(lagMs - BASELINE);   // measurement of the adaptive deviation
    this.n++;
    return true;
  }

  /** Full Δt* (ms) = baseline + adaptive. Equals the baseline until the first reading. */
  getDeltaStar(): number { return Math.round(BASELINE + this.x[0]); }
  /** The structural baseline (ms) — the Pre-Read anchor. */
  getBaseline(): number { return BASELINE; }
  /** The per-PC adaptive deviation (ms) — 0 = the PC matches the baseline. */
  getAdaptive(): number { return Math.round(this.x[0]); }
  /** Trend of the lag in ms/s: negative = shrinking (PC growing more present). */
  getTrend(): number { return this.n >= 2 ? this.x[1] : 0; }
  /** How many valid lags contributed (0 = still the pure baseline). */
  getN(): number { return this.n; }

  reset(): void {
    this.x = [0, 0];
    this.P = [[P0_ADAPT, 0], [0, P0_RATE]];
    this.n = 0;
    this.lastMs = 0;
  }
}

/** Singleton — one lag estimator per app instance. */
export const lagMeter = new LagMeter();
