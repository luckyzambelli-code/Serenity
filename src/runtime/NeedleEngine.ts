import { Emitter } from './SessionRuntime';

/**
 * NeedleEngine — owns the analog-needle position, velocity and integration loop.
 *
 * Replaces (and consolidates) the following App.tsx refs:
 *   • needleSpringRef         (pos / vel / target / rafId)
 *   • needleOffsetRef          (mirror of state)
 *   • needleInMotionRef        (mirror of state)
 *   • isLockedRef              (lock flag during resets)
 *   • needleTrimRef            (trim shadow)
 *   • needleMotionTimerRef     (auto-clear motion timer)
 *   • startNeedleSpringRef     (the spring start function)
 *
 * The integration uses a slightly under-damped spring (k=38, d=8.0, dt=1/60),
 * the exact tuning preserved from the original App.tsx implementation, so the
 * needle "feel" is identical post-migration.
 *
 *   • k    = 38     stiffness
 *   • d    =  8.0   damping
 *   • dt   = 1/60   integration step (RAF-locked)
 *   • ζ   ≈ 0.65   damping ratio → ~8 % overshoot, ~1 s settle
 *
 * Pub/sub: every position update calls notify(). React consumes via
 * `useSyncExternalStore(needleEngine.subscribe, () => needleEngine.pos)`.
 */
export class NeedleEngine extends Emitter {
  // ── Physics state ─────────────────────────────────────────────────────────
  /** Current position in [-1, 1]. */
  pos = -0.35;
  vel = 0;
  target = -0.35;
  /** Target BEFORE the trim re-centering offset is applied (so changing trim
   *  can re-derive the displayed target without losing the underlying value). */
  private baseTarget = -0.35;

  // ── Modal flags ───────────────────────────────────────────────────────────
  /** True while the engine is in a reset window — readings are ignored. */
  isLocked = false;
  /** True while a motion-anim is playing; auto-cleared after `motionDurationMs`. */
  isInMotion = false;

  // ── Tunables / inputs from UI ────────────────────────────────────────────
  /** Trim offset in [-10, +10] applied externally by callers when computing target. */
  trim = 0;

  // ── Spring dynamics — live-tunable for the "mechanical feel" ──────────────
  // CONN-88: the original tuning (k=38, d=8 → ζ≈0.65) was under-damped, so the
  // needle overshot and read as "nervous". Defaults now give a heavier,
  // critically-damped movement (ζ≈1.1 → no overshoot, slower settle) that the
  // eye can follow like a real galvanometer. Both are adjustable live.
  k = 24;   // stiffness  (lower = heavier / slower)  — CONN-90: baked from tuning
  d = 22;   // damping    (higher = smoother / less bouncy)

  // ── Internal handles ──────────────────────────────────────────────────────
  private rafId = 0;
  private motionTimer: ReturnType<typeof setTimeout> | null = null;
  private lockTimer:   ReturnType<typeof setTimeout> | null = null;

  // ── Public API ────────────────────────────────────────────────────────────

  /** Set a new target and start (or continue) the spring integration.
   *  CONN-89: TRIM now visibly RE-CENTERS the needle — it shifts the whole
   *  rest/target position (±0.03 per trim unit → ±0.30 at ±10), so moving the
   *  trim is immediately visible on the dial, matching its "centrage" label. */
  setTarget(target: number): void {
    cancelAnimationFrame(this.rafId);
    this.baseTarget = target;
    this.target = Math.max(-1, Math.min(1, target + this.trim * 0.03));
    this.rafId = requestAnimationFrame(this.tick);
  }

  /**
   * Instant snap to a position — bypasses the spring. Used for direct
   * position updates from the worker (e.g. GSR_UPDATE, UNIFIED_NEEDLE_REACTION)
   * where the worker has already computed the exact display offset.
   */
  snap(pos: number): void {
    cancelAnimationFrame(this.rafId);
    const clamped = Math.max(-1, Math.min(1, pos));
    this.pos = clamped;
    this.vel = 0;
    this.target = clamped;
    this.notify();
  }

  /** Mark a motion event; auto-clears after `ms`. Used for animation flags. */
  beginMotion(ms: number): void {
    this.isInMotion = true;
    this.notify();
    if (this.motionTimer) clearTimeout(this.motionTimer);
    this.motionTimer = setTimeout(() => {
      this.isInMotion = false;
      this.motionTimer = null;
      this.notify();
    }, ms);
  }

  /** Force-clear motion immediately (used on resets). */
  clearMotion(): void {
    if (this.motionTimer) { clearTimeout(this.motionTimer); this.motionTimer = null; }
    if (this.isInMotion) { this.isInMotion = false; this.notify(); }
  }

  /** Update the trim value and immediately re-center the needle so the change
   *  is visible at once (even when idle), by re-applying the last base target. */
  setTrim(t: number): void {
    this.trim = t;
    this.setTarget(this.baseTarget);
  }

  /**
   * Centralized reset: snaps needle back to SET (-0.35), locks for 500 ms so
   * pending worker updates can't race the reset.
   *
   * @param onReset optional callback fired between snap and unlock — typically
   *                used to post RESET_SYSTEM to the worker.
   */
  reset(onReset?: () => void): void {
    this.isLocked = true;
    cancelAnimationFrame(this.rafId);
    this.pos = -0.35;
    this.vel = 0;
    this.target = -0.35;
    this.clearMotion();
    this.notify();

    onReset?.();

    if (this.lockTimer) clearTimeout(this.lockTimer);
    this.lockTimer = setTimeout(() => {
      this.isLocked = false;
      this.lockTimer = null;
    }, 500);
  }

  /** Snapshot — referentially stable scalar for useSyncExternalStore. */
  getPos = (): number => this.pos;

  /** Tear down all internal resources (RAF + timers). Call on full unmount. */
  destroy(): void {
    cancelAnimationFrame(this.rafId);
    if (this.motionTimer) { clearTimeout(this.motionTimer); this.motionTimer = null; }
    if (this.lockTimer)   { clearTimeout(this.lockTimer);   this.lockTimer = null; }
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /** Spring integration step (60 Hz fixed). Identical to the original tuning. */
  private tick = (): void => {
    const k  = this.k;
    const d  = this.d;
    const dt = 1 / 60;

    const acc = k * (this.target - this.pos) - d * this.vel;
    this.vel += acc * dt;
    this.pos = Math.max(-1, Math.min(1, this.pos + this.vel * dt));

    if (Math.abs(this.target - this.pos) > 0.002 || Math.abs(this.vel) > 0.002) {
      this.notify();
      this.rafId = requestAnimationFrame(this.tick);
    } else {
      this.pos = this.target;
      this.notify();
    }
  };
}

/** Singleton — App.tsx and any future tester both consume this one instance. */
export const needleEngine = new NeedleEngine();

/**
 * VIRTUAL needle — a HIDDEN spring (identical tuning) driven continuously by the live
 * charge (qlToNeedlePos), never rendered. It exists only to feed the ReactionClassifier
 * the SAME smoothed signal the visible needle used to produce, now that the visible
 * needle rests at SET and only kicks for reads. Sampling its `.pos` reproduces the old
 * classifier input exactly (spring-filtered), so thresholds stay calibrated — feeding raw
 * qlToNeedlePos instead over-reads every wiggle as a Blow Down.
 */
export const virtualNeedle = new NeedleEngine();
// The visible needle is DELIBERATELY heavy (k=24, d=22 → ζ≈2.2, strongly overdamped) for
// a calm "galvanometer feel" — but that adds ~0.9 s of group delay, so a reaction detected
// off it lands late. The classifier's copy is instead FAST but not instantaneous: a lightly
// OVERDAMPED spring (ζ≈1.16, no overshoot) with ~0.24 s group delay. This filters jitter AND
// adds a touch of delay so reactions don't register slightly EARLY (user: "leggermente
// anticipata") — they land right on the read. Slower k → more delay if it's still early.
// k lowered 150→90→65→55 as the user asked for a touch more delay (~0.40 s delay now).
virtualNeedle.k = 55;
virtualNeedle.d = 22;
