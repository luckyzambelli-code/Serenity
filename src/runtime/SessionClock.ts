import { Emitter } from './SessionRuntime';

/**
 * SessionClock — owns the session timeline.
 *
 * Replaces in App.tsx:
 *   • timerRef                  (the setInterval handle)
 *   • the 100 ms tick useEffect that incremented `timeRef.current += 0.1`
 *   • the ad-hoc setTime() pump
 *
 * Why this matters (FIX B-07): the previous implementation incremented a
 * counter by a fixed `0.1` every tick assuming setInterval fires every
 * exact 100 ms. In practice browser timers can drift 4–25 ms each tick, so
 * after a 1 h session the clock could be off by ~90 s. We now derive the
 * elapsed time from `performance.now()` deltas, so the displayed time
 * always matches wall-clock duration regardless of timer jitter.
 *
 * State model:
 *   • `time`  : seconds since the (resumed) session start, 0.1 s precision
 *   • running : whether the clock is currently ticking
 *   • lastTickEpoch / accumulated : internal — used to compute drift-free time
 *
 * Subscribers receive a notify() every tick when `time` advances by more
 * than 0.05 s (so React doesn't re-render below visible granularity).
 */
export class SessionClock extends Emitter {
  /** Seconds since session start (or last resume, plus accumulated). */
  time = 0;
  /** True iff the internal interval is running. */
  running = false;

  private interval:    ReturnType<typeof setInterval> | null = null;
  private resumeEpoch: number = 0;   // performance.now() at last start/resume
  private accumulated: number = 0;   // seconds accumulated before last resume
  private lastNotifiedTime: number = 0;

  /** Begin a brand-new session. Resets time. */
  start(): void {
    this.accumulated = 0;
    this.resumeEpoch = performance.now();
    this.time = 0;
    this.lastNotifiedTime = 0;
    this.notify();
    this.beginTick();
  }

  /** Pause the clock — preserves elapsed. */
  pause(): void {
    if (!this.running) return;
    this.accumulated = this.computeNow();
    this.stopTick();
  }

  /** Resume after a pause. Keeps prior accumulated time. */
  resume(): void {
    if (this.running) return;
    this.resumeEpoch = performance.now();
    this.beginTick();
  }

  /** End the session — keeps the final time visible until reset. */
  end(): void {
    this.accumulated = this.computeNow();
    this.stopTick();
  }

  /**
   * Sync to an absolute timestamp (used by the participant when the auditor
   * sends a SESSION_STATE message). Sets `accumulated` so the next computeNow
   * returns the synced value. If currently running, the tick continues from
   * the synced position with no jitter.
   */
  syncTo(absSeconds: number): void {
    this.accumulated = absSeconds;
    this.resumeEpoch = performance.now();
    this.time = Math.round(absSeconds * 10) / 10;
    this.lastNotifiedTime = this.time;
    this.notify();
  }

  /** Hard reset back to t=0 (without auto-starting). */
  reset(): void {
    this.stopTick();
    this.accumulated = 0;
    this.time = 0;
    this.lastNotifiedTime = 0;
    this.notify();
  }

  /** Current session time in seconds (used by code that does timestamping). */
  now(): number { return this.time; }

  /** Snapshot for useSyncExternalStore. */
  getTime = (): number => this.time;

  /** Whole-second snapshot — for components that only display MM:SS. With this
   *  snapshot useSyncExternalStore re-renders 1×/s instead of 10×/s (the notify
   *  still fires every 100 ms, but the snapshot value only changes per second). */
  getWholeSeconds = (): number => Math.floor(this.time);

  /** Tear down (App unmount). */
  destroy(): void { this.stopTick(); }

  // ── Internals ─────────────────────────────────────────────────────────────

  private beginTick(): void {
    if (this.interval) return;
    this.running = true;
    this.interval = setInterval(this.tick, 100);
  }

  private stopTick(): void {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
    this.running = false;
  }

  private computeNow(): number {
    return this.accumulated + (performance.now() - this.resumeEpoch) / 1000;
  }

  private tick = (): void => {
    const next = this.computeNow();
    this.time = Math.round(next * 10) / 10; // 0.1 s granularity
    if (Math.abs(this.time - this.lastNotifiedTime) >= 0.05) {
      this.lastNotifiedTime = this.time;
      this.notify();
    }
  };
}

/** Singleton — same instance used by App.tsx and any future runtime helper. */
export const sessionClock = new SessionClock();
