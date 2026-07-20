/**
 * CycleStateMachine — the charge CYCLE as a per-item finite state machine.
 *
 * Replaces the instantaneous `chargeState(qL, release, asIs)` (recomputed every
 * cycle → CONTACT/DISCHARGE ping-ponged, the auditor lost the thread). Now the
 * phase has MEMORY and moves FORWARD ONLY through one item's life:
 *
 *      NEUTRAL ─▶ CONTACT ─▶ DISCHARGE ─▶ AS-IS ─▶ (reset) NEUTRAL
 *
 * Anti-flicker:
 *   • minimum DWELL per phase (the auditor reads each one);
 *   • HYSTERESIS on transitions (a sustained fall — not one downtick — leaves
 *     CONTACT; AS-IS needs the confirmed signal held).
 *
 * Re-contact (the PC touches the charge again while discharging) is NOT a state
 * change — it's the SAME cycle. We only raise a transient `reContact` flag so the
 * UI can show a faint "still the same item" hint next to DISCHARGE. Telling a
 * re-contact of the SAME charge from a genuinely DIFFERENT item is not possible
 * from EEG alone — that needs the stimulus (Phase 4).
 *
 * Fed once per worker cycle from App's METRICS_UPDATE with the PREDICTED qL (so
 * CONTACT anticipates — Phase 1), the predictor's `falling` flag, and the AS-IS
 * confirmation from ChargeEpisodeTracker. Pure TS singleton, no React.
 */
import type { ChargeStateId } from '../lib/chargeState';
import { CHARGE_MASS_MIN } from '../lib/chargeState';

export interface CyclePhase {
  phase: ChargeStateId;   // neutral | contact | discharge | asis
  reContact: boolean;     // DISCHARGE only: the PC re-touched the charge (same cycle)
}

// ── Tunables (longer dwell per user; tune on the field) ──────────────────────
const CONTACT_ON       = CHARGE_MASS_MIN; // 0.8 — qL to enter / re-touch CONTACT
const MIN_CONTACT_MS   = 2500;  // hold CONTACT at least this long (readability)
const MIN_DISCHARGE_MS = 2500;  // hold DISCHARGE at least this long
const RELEASE_SUSTAIN_MS = 600; // net "release active" time to open DISCHARGE
const DISCHARGE_DROP   = 0.78;  // …or qL fell to ≤78% of its CONTACT peak (fallback)
const CYCLE_TIMEOUT_MS = 4000;  // qL stays low this long → item over → NEUTRAL
const LOW_QL           = 0.5;   // qL below this = "no meaningful charge"
const REARM_QL         = 0.5;   // qL must drop below this to ARM a NEW contact

export class CycleStateMachine {
  private phase: ChargeStateId = 'neutral';
  private phaseSince = 0;
  private releaseMs = 0;   // leaky "release active" accumulator (resists flicker)
  private peakC = 0;       // peak qL seen during the current CONTACT
  private lowMs = 0;
  private lastMs = 0;
  // A new CONTACT needs a FRESH rise: after AS-IS we DISARM, and only re-ARM once
  // qL has dropped below REARM_QL — so CONTACT doesn't snap back the instant after
  // AS-IS just because qL is still elevated (it requires a real new read).
  private armed = true;

  /**
   * @param q              PREDICTED qL (drives CONTACT anticipation)
   * @param releaseActive  the release classifier (stableReleaseState==='active' —
   *                       TA blow-down / Fall / F-N): the real "discharging" signal
   * @param asIsConfirmed  ChargeEpisodeTracker's AS-IS (signature gone + F/N, latched)
   */
  update(q: number, releaseActive: boolean, asIsConfirmed: boolean, nowMs: number): CyclePhase {
    const dt = this.lastMs > 0 ? Math.min(500, nowMs - this.lastMs) : 0;
    this.lastMs = nowMs;

    // Leaky accumulator: rises while releasing, decays when not — so a brief flicker
    // of the release flag neither triggers nor resets DISCHARGE prematurely.
    this.releaseMs = releaseActive
      ? Math.min(2000, this.releaseMs + dt)
      : Math.max(0, this.releaseMs - dt);
    this.lowMs = q < LOW_QL ? this.lowMs + dt : 0;
    // Re-arm a new contact once the charge has genuinely dropped.
    if (q < REARM_QL) this.armed = true;

    const inPhase = nowMs - this.phaseSince;

    switch (this.phase) {
      case 'neutral':
        // Only a FRESH rise (armed) opens a new CONTACT — not lingering high qL.
        if (this.armed && q >= CONTACT_ON) this.enter('contact', nowMs);
        break;

      case 'contact':
        // FORWARD only. DISCHARGE opens when the charge actually releases — the
        // release classifier sustained, OR qL clearly fell from the contact peak
        // (a discharge that doesn't trip the classifier). Both after min dwell.
        // (A confirmed AS-IS straight from contact is also accepted, rare.)
        if (q > this.peakC) this.peakC = q;
        if (inPhase >= MIN_CONTACT_MS && asIsConfirmed) this.enter('asis', nowMs);
        else if (inPhase >= MIN_CONTACT_MS &&
                 (this.releaseMs >= RELEASE_SUSTAIN_MS || (this.peakC > 0 && q <= DISCHARGE_DROP * this.peakC)))
          this.enter('discharge', nowMs);
        else if (this.lowMs >= CYCLE_TIMEOUT_MS) this.enter('neutral', nowMs); // brief/false contact
        break;

      case 'discharge':
        // Re-contact = SAME cycle → NO state change. The faint CONTACT tag is now
        // REAL-TIME (computed below from the live qL), not a latched hint.
        if (inPhase >= MIN_DISCHARGE_MS && asIsConfirmed) this.enter('asis', nowMs);
        else if (this.lowMs >= CYCLE_TIMEOUT_MS) this.enter('neutral', nowMs); // discharged out, no clean AS-IS
        break;

      case 'asis':
        // ChargeEpisodeTracker latches AS-IS; when its latch ends, close the cycle.
        if (!asIsConfirmed) this.enter('neutral', nowMs);
        break;
    }

    return {
      phase: this.phase,
      // REAL-TIME: the small CONTACT tag lights only while qL is currently at
      // contact level during DISCHARGE (live), not a 1.4 s latch.
      reContact: this.phase === 'discharge' && q >= CONTACT_ON,
    };
  }

  private enter(p: ChargeStateId, nowMs: number): void {
    this.phase = p;
    this.phaseSince = nowMs;
    this.releaseMs = 0;
    this.lowMs = 0;
    if (p === 'contact') this.peakC = 0; // fresh peak for the new contact
    if (p === 'asis') this.armed = false; // require a fresh low+rise before next CONTACT
  }

  reset(): void {
    this.phase = 'neutral';
    this.phaseSince = 0; this.releaseMs = 0; this.peakC = 0; this.lowMs = 0;
    this.lastMs = 0; this.armed = true;
  }
}

/** Singleton — one cycle FSM per app instance. */
export const cycleStateMachine = new CycleStateMachine();
