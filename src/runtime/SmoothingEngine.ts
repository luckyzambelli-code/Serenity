import { Emitter } from './SessionRuntime';

/**
 * SmoothingEngine — two reusable smoothers used by the runtime.
 *
 * 1. `EmaSmoother`        : event-driven exponential moving average that
 *                           only publishes when the smoothed value moves
 *                           past a delta threshold (avoids 1-BPM jitter).
 * 2. `TargetTracker`      : periodically interpolates `current` toward
 *                           `target` (also EMA). Used for the biometric
 *                           integrity bar which needs a steady "needle-like"
 *                           visual flow independent of the input cadence.
 *
 * Both engines extend `Emitter` so React subscribes via
 * `useSyncExternalStore(engine.subscribe, engine.getValue)`.
 *
 * Replaces in App.tsx:
 *   • displayBpmRef + [displayBpm, setDisplayBpm]      → bpmSmoother
 *   • smoothPctRef + targetPctRef + [smoothPct, ...]   → integrityTracker
 *   • the 100 ms setInterval that drives the integrity bar
 *   • the inline EMA + threshold logic in worker `onmessage` BPM_UPDATE
 */

/**
 * Exponential moving average smoother with a publish-threshold so
 * subscribers don't get a notify() on every infinitesimal change.
 *
 *   smoothed = prev + α · (incoming − prev)
 *   publish iff |smoothed − last_published| > deltaThreshold
 */
export class EmaSmoother extends Emitter {
  /** Smoothed value, null until the first `update`. */
  value: number | null = null;

  constructor(
    private readonly alpha: number,
    private readonly deltaThreshold: number,
  ) { super(); }

  /** Feed a fresh observation; publishes only when delta exceeds threshold. */
  update(incoming: number): void {
    const prev = this.value;
    const smoothed = prev === null
      ? incoming
      : prev + this.alpha * (incoming - prev);

    if (prev === null || Math.abs(smoothed - prev) > this.deltaThreshold) {
      this.value = smoothed;
      this.notify();
    }
  }

  /** Reset to "no observation yet". Notifies once. */
  reset(): void {
    if (this.value === null) return;
    this.value = null;
    this.notify();
  }

  /** Raw smoothed value (referentially stable scalar for useSyncExternalStore). */
  getValue = (): number | null => this.value;

  /** Integer display value — typical use case for BPM-like meters. */
  getDisplay = (): number | null =>
    this.value === null ? null : Math.round(this.value);
}

/**
 * Target-tracking interpolator with periodic tick.
 *
 *   At every `periodMs`:
 *     next = current + α · (target − current)
 *     publish iff |next − current| > threshold
 *
 * Use when the input cadence is irregular but the visual must move at a
 * steady rate (e.g. analog meter sweep, integrity bar).
 */
export class TargetTracker extends Emitter {
  current = 0;
  target  = 0;

  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly alpha: number,
    private readonly threshold: number,
    private readonly periodMs: number,
  ) { super(); }

  /** Update the target. Doesn't publish; the tick will pick it up. */
  setTarget(t: number): void { this.target = t; }

  /** Begin the periodic tick. Idempotent. */
  start(): void {
    if (this.interval) return;
    this.interval = setInterval(this.tick, this.periodMs);
  }

  /** Stop the periodic tick. */
  stop(): void {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
  }

  /** Snapshot for useSyncExternalStore. */
  getCurrent = (): number => this.current;

  /** Tear down (used on App unmount). */
  destroy(): void { this.stop(); }

  private tick = (): void => {
    const next = this.current + this.alpha * (this.target - this.current);
    if (Math.abs(next - this.current) > this.threshold) {
      this.current = Math.round(next * 10) / 10; // one decimal — matches original behaviour
      this.notify();
    }
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Singletons matching the original App.tsx tunings (bit-for-bit identical):
//
//   • BPM:       α = 0.08  → ~12 samples to settle 63 %
//                threshold = 0.5 BPM → re-render only on perceptible change
//   • Integrity: α = 0.04  → very slow, "analog meter" feel
//                threshold = 0.05 % → one-decimal granularity
//                period    = 100 ms → 10 Hz, matches original setInterval
// ────────────────────────────────────────────────────────────────────────────
export const bpmSmoother      = new EmaSmoother(0.08, 0.5);
export const integrityTracker = new TargetTracker(0.04, 0.05, 100);
