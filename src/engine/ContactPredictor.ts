/**
 * ContactPredictor — Phase 1 of the predictive Static Meter ("Ron's Lag").
 *
 * Turns the raw charge `qL` into a PREDICTED charge by detecting the LEADING
 * EDGE of a rise (the instant a read begins) and projecting qL forward by a lag
 * Δt — instead of waiting for qL to cross an absolute threshold. The needle and
 * the CONTACT/DISCHARGE/AS-IS cycle are then driven by `predictedQl`, so they
 * ANTICIPATE the contact instead of lagging behind it.
 *
 *   • slope  = least-squares dqL/dt over a short window (robust at the worker's
 *              ~4 Hz cadence).
 *   • noise  = adaptive floor (slow EMA of |slope|) → the rise/fall threshold
 *              scales to THIS preclear's restlessness, not a fixed constant.
 *   • rising = slope > K·noise (and qL above a small mass floor) → leading edge.
 *   • predictedQl = qL projected forward by Δt, ONLY while genuinely rising (no
 *              forward projection at rest → no jitter).
 *
 * EEG-only (no stimulus yet). Δt is a SEED (default 250 ms); Phase 4 (stimulus
 * cross-correlation) will drive it adaptively via setLagMs(). `slope`, `falling`
 * and `contactEvent` are already exposed for Phase 1b (crisp-read kick +
 * falling→DISCHARGE) even though Phase 1a only consumes `predictedQl`.
 *
 * Pure-TS singleton, fed once per worker cycle from App's METRICS_UPDATE handler
 * (same pattern as VelocityTracker / ChargeEpisodeTracker). No React, no render.
 */

interface QlSample { t: number; q: number; }

export interface ContactPrediction {
  predictedQl: number;    // qL projected forward by Δt (≥ 0) — drives needle + cycle
  slope: number;          // dqL/dt (per second)
  rising: boolean;        // leading edge active (slope > K·noise)
  falling: boolean;       // discharge edge (slope < -K·noise)
  contactEvent: boolean;  // one-shot: true on a rising transition (a "read")
}

const WINDOW_MS   = 1200;  // qL history retained
const SLOPE_WIN_MS = 500;  // regression window for dqL/dt
const NOISE_EMA   = 0.02;  // adaptation rate of the slope-noise floor (slow)
const K_SIGMA     = 2.5;   // rise/fall threshold = K_SIGMA × noise
const MASS_FLOOR  = 0.3;   // ignore rises below this qL (noise near zero)
const MAX_LEAD    = 1.5;   // clamp |slope·Δt| so the projection can't run away

/** qL → needle position. WIDER base swing (user request: "di base lo vorrei più
 *  ampio") — steeper sigmoid (k 0.25→0.35) + more headroom (MAX 0.90→0.95) so the
 *  same EEG produces a bigger, more readable deflection. The trim amplifies further
 *  on top (needleEngine). SET = rest (-0.35), never reaches the dial edge (±1). */
export function qlToNeedlePos(q: number): number {
  const SET = -0.35, MAX = 0.95;
  const sig = 2 / (1 + Math.exp(-q * 0.35)) - 1; // 0..1 for q>0
  return SET + (MAX - SET) * Math.max(0, sig);
}

export class ContactPredictor {
  private buf: QlSample[] = [];
  private noise = 0.05;      // adaptive |slope| floor (per second)
  private wasRising = false;
  private lagMs = 250;       // Δt seed — Phase 4 will set this adaptively

  /** Phase 4 hook: set the lag-compensation Δt (ms) from the estimated Ron's Lag. */
  setLagMs(ms: number): void { this.lagMs = Math.max(0, Math.min(1500, ms)); }
  getLagMs(): number { return this.lagMs; }

  update(qL: number, nowMs: number): ContactPrediction {
    const buf = this.buf;
    buf.push({ t: nowMs, q: qL });
    while (buf.length && nowMs - buf[0].t > WINDOW_MS) buf.shift();

    const slope = this.slopeOver(SLOPE_WIN_MS, nowMs); // per second

    // Adaptive noise floor — slow EMA of |slope|, so a multi-second rise barely
    // moves it while ambient restlessness sets the baseline.
    this.noise += NOISE_EMA * (Math.abs(slope) - this.noise);
    const thr = K_SIGMA * Math.max(this.noise, 1e-3);

    const rising  = slope > thr && qL > MASS_FLOOR;
    const falling = slope < -thr;
    const contactEvent = rising && !this.wasRising;
    this.wasRising = rising;

    // Forward projection ONLY while rising → the needle/cycle lead the contact,
    // but at rest predictedQl == qL (no spurious anticipation).
    let lead = 0;
    if (rising) lead = Math.max(-MAX_LEAD, Math.min(MAX_LEAD, slope * (this.lagMs / 1000)));
    const predictedQl = Math.max(0, qL + lead);

    return { predictedQl, slope, rising, falling, contactEvent };
  }

  /** Least-squares slope (per second) of qL over the last `winMs`. */
  private slopeOver(winMs: number, nowMs: number): number {
    const pts = this.buf.filter(s => nowMs - s.t <= winMs);
    const n = pts.length;
    if (n < 2) return 0;
    const t0 = pts[0].t;
    let st = 0, sq = 0, stt = 0, stq = 0;
    for (const p of pts) {
      const x = (p.t - t0) / 1000; // seconds
      st += x; sq += p.q; stt += x * x; stq += x * p.q;
    }
    const denom = n * stt - st * st;
    if (Math.abs(denom) < 1e-9) return 0;
    return (n * stq - st * sq) / denom;
  }

  reset(): void {
    this.buf = [];
    this.noise = 0.05;
    this.wasRising = false;
  }
}

/** Singleton — one predictor per app instance. */
export const contactPredictor = new ContactPredictor();
