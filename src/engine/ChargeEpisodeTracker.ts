/**
 * ChargeEpisodeTracker — decides when a contacted mass has reached AS-IS.
 *
 * F/N-DRIVEN model (the auditing standard: the Floating Needle IS the as-is / EP
 * indicator). The old "qL AND I_m collapsed to an ABSOLUTE floor + F/N" never
 * fired, because a Floating Needle routinely coexists with qL still MODERATE
 * (chargeState.ts notes "a Floating Needle can coexist [with mass present]") — so
 * the absolute collapse and the F/N almost never held together. AS-IS now =
 *   • there WAS a real mass this episode (peak qL ≥ CHARGE_MASS_MIN);
 *   • a Floating Needle is present (free needle — nothing left to read);
 *   • qL has dropped to ≤ DROP_FRAC of its EPISODE PEAK (RELATIVE → the charge
 *     clearly came down; robust to a non-zero resting baseline, unlike an
 *     absolute floor);
 * held continuously ≥ HOLD_MS. Then AS-IS is LATCHED for LATCH_MS so the auditor
 * sees it, and the episode resets → ready for the next item.
 *
 * The CycleStateMachine only accepts this AS-IS after the cycle has been through
 * DISCHARGE, so "after a real discharge" is enforced there, not here.
 */
import { CHARGE_MASS_MIN } from '../lib/chargeState';

const DROP_FRAC = 0.6;   // qL ≤ 60% of the episode peak = the charge clearly came down
const HOLD_MS   = 1500;  // sustained this long (the F/N detect already needs ~2.5 s)
const LATCH_MS  = 4000;  // keep AS-IS visible after it fires

export class ChargeEpisodeTracker {
  /** Public: true while AS-IS is active (live or latched). */
  asIs = false;

  private peakQl = 0;
  private hadMass = false;
  private holdMs = 0;
  private latchUntil = 0;
  private lastMs = 0;

  /** Feed one cycle. Returns the AS-IS flag. */
  update(qL: number, isFN: boolean, nowMs: number): boolean {
    const dt = this.lastMs > 0 ? Math.min(500, nowMs - this.lastMs) : 0; // clamp gaps
    this.lastMs = nowMs;

    // Still latched → stay AS-IS.
    if (nowMs < this.latchUntil) { this.asIs = true; return true; }

    if (qL >= CHARGE_MASS_MIN) this.hadMass = true;
    if (this.hadMass && qL > this.peakQl) this.peakQl = qL;

    // F/N present AND qL dropped well below the episode peak (it discharged).
    const qlDropped = this.peakQl > 0 && qL <= DROP_FRAC * this.peakQl;
    const collapsed = this.hadMass && isFN && qlDropped;

    if (collapsed) {
      this.holdMs += dt;
      if (this.holdMs >= HOLD_MS) {
        // Confirmed: contacted mass discharged + floating needle. Latch + reset.
        this.asIs = true;
        this.latchUntil = nowMs + LATCH_MS;
        this.peakQl = 0; this.hadMass = false; this.holdMs = 0;
        return true;
      }
    } else {
      this.holdMs = 0;
    }
    this.asIs = false;
    return false;
  }

  /** Session start — clear everything. */
  resetSession(): void {
    this.asIs = false;
    this.peakQl = 0; this.hadMass = false; this.holdMs = 0;
    this.latchUntil = 0; this.lastMs = 0;
  }
}

/** Singleton — one charge-episode pipeline per app instance. */
export const chargeEpisode = new ChargeEpisodeTracker();
