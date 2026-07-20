/**
 * FnTracker — F/N persistence + EP-lock timers ("La Regola dei 1,5s"),
 * extracted from App.tsx fnTrackingRef (SessionEngine slice 2). Pure TS.
 *
 * Logic (unchanged, bit-per-bit):
 *   • qL ≥ 0.9 (valid signal): stabilityTimer accumulates; after 1.5 s the F/N
 *     state becomes ACTIVE; epLockTimer accumulates (manual EP validation only —
 *     the auditor's button sets isEpValidated, never the code).
 *   • qL < 0.9: isEpValidated drops; epLockTimer resets instantly when qL === 0
 *     (headset off / electrical artefact) or decays slowly (dt × 0.5) otherwise;
 *     F/N stability fully resets.
 *   • HOLD mode: timers are frozen (neither accumulate nor decay).
 */

export class FnTracker {
  stabilityTimer = 0;
  hysteresisTimer = 0;
  /** F/N stable for ≥ 1.5 s of valid signal. */
  isActive = false;
  lastUpdateT: number | null = null;
  epLockTimer = 0;
  /** Set TRUE only by the auditor's manual EP validation (UI buttons). */
  isEpValidated = false;

  /** Feed one worker cycle. `nowS` = session-relative seconds. */
  update(qL: number, isHold: boolean, nowS: number): void {
    const dt = this.lastUpdateT !== null ? nowS - this.lastUpdateT : 0;
    this.lastUpdateT = nowS;

    if (isHold) {
      // In HOLD mode, pause QL (F/N) calculation but don't reset it.
      return;
    }
    if (qL >= 0.9) {
      // SEGNALE VALIDO
      this.stabilityTimer += dt;
      if (this.stabilityTimer >= 1.5 && !this.isActive) {
        this.isActive = true;
      }
      // EP Logic — seulement validation manuelle par l'auditeur.
      this.epLockTimer += dt;
    } else {
      // SEGNALE SOTTO SOGLIA
      this.isEpValidated = false;
      // Headset off / artefact (qL = 0) → instant reset; otherwise slow decay
      // so the bar doesn't jolt the auditor.
      if (qL === 0) this.epLockTimer = 0;
      else this.epLockTimer = Math.max(0, this.epLockTimer - (dt * 0.5));
      // Reset F/N stability without exceptions.
      this.isActive = false;
      this.stabilityTimer = 0;
    }
  }

  /** Session start: full reset (mirrors the old handleStart object literal). */
  reset(): void {
    this.stabilityTimer = 0;
    this.hysteresisTimer = 0;
    this.isActive = false;
    this.lastUpdateT = null;
    this.epLockTimer = 0;
    this.isEpValidated = false;
  }
}

/** Singleton — one session pipeline per app instance. */
export const fnTracker = new FnTracker();
