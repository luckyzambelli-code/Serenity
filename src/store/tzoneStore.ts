import { useSyncExternalStore } from 'react';

/**
 * tzoneStore — live "mass contacted vs dissolved" for the in-session readout,
 * OUTSIDE React (like metricsStore). It accumulates TIME (seconds), not a
 * fluctuating share, so the numbers only ever increment — and it's driven by the
 * SAME charge state shown in the centre (CONTACT/PROCESSING/LIBERATION), so the
 * two readings always agree.
 *
 * Model "presence vs release" (auditor's choice):
 *   • MASS (contacted)   = time with ANY charge present  (chargeState ≠ neutral)
 *   • MASS DISSOLUTION   = time actively releasing        (chargeState = liberation)
 * Liberation ⊂ not-neutral ⇒ massSec ≥ dissolutionSec always (you cannot dissolve
 * mass you never contacted).
 */
export interface ZoneTimeState {
  massSec: number;         // cumulative seconds with charge present
  dissolutionSec: number;  // cumulative seconds in active release
  relVelSum: number;       // Σ release velocity samples (during discharge)
  relVelN: number;         // count of those samples → avg = sum / n
  // MASS-WEIGHTED (by CHARGE QUANTITY, not just time): each instant counts ∝ qL,
  // so a heavily-charged moment weighs more than a faint one. The dissolution %
  // by mass = dissChargeQ / massChargeQ (user request: "rispetto alla quantità di
  // MASSA" rather than on time alone).
  massChargeQ: number;     // Σ qL·dt while charge present (CONTACT + DISCHARGE) — SESSION total
  dissChargeQ: number;     // Σ qL·dt while discharging — SESSION total
  // PER-CYCLE dissolution is a COMPLETION measure, not a time share: the dial shows how
  // far the charge has blown down from THIS cycle's PEAK qL toward zero. At AS-IS (qL≈0)
  // it reads ~100%; mid-contact (qL high) ~0%. Reset on each armCycle(). The time-share
  // session totals above still feed the report.
  cyclePeakQ: number;      // max qL seen during the current armed cycle
}

let state: ZoneTimeState = { massSec: 0, dissolutionSec: 0, relVelSum: 0, relVelN: 0, massChargeQ: 0, dissChargeQ: 0, cyclePeakQ: 0 };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export const tzoneStore = {
  get: (): ZoneTimeState => state,
  /** Add `dtSec` to the right bucket(s) for the current charge id, weighting the
   *  mass buckets by the live charge `qL` (quantity of mass).
   *  MASS = charge present (CONTACT + DISCHARGE); DISSOLUTION = active release
   *  (DISCHARGE). AS-IS / neutral add to neither (the charge is gone / absent). */
  addTime(chargeId: string, dtSec: number, qL: number, relVel?: number, inCycle?: boolean) {
    if (!(dtSec > 0)) return;
    const q = Math.max(0, qL || 0);
    let changed = false;
    if (chargeId === 'contact' || chargeId === 'discharge') {
      state = { ...state, massSec: state.massSec + dtSec, massChargeQ: state.massChargeQ + q * dtSec };
      changed = true;
    }
    if (chargeId === 'discharge') {
      // accumulate the release velocity for the session average ("vitesse moyenne
      // de libération") — only while actually discharging.
      state = { ...state, dissolutionSec: state.dissolutionSec + dtSec, dissChargeQ: state.dissChargeQ + q * dtSec };
      if (typeof relVel === 'number' && relVel > 0) { state = { ...state, relVelSum: state.relVelSum + relVel, relVelN: state.relVelN + 1 }; }
      changed = true;
    }
    // PER-CYCLE peak charge — the reference the dial measures blow-down completion against.
    if (inCycle && q > state.cyclePeakQ) { state = { ...state, cyclePeakQ: q }; changed = true; }
    if (changed) emit();
  },
  /** Average release velocity over the session (0 if none). */
  avgReleaseVel(): number { return state.relVelN > 0 ? state.relVelSum / state.relVelN : 0; },
  /** Dissolution share weighted by CHARGE QUANTITY (0..1), SESSION-wide. 0 if no mass yet. */
  dissolvedFracByMass(): number { return state.massChargeQ > 0 ? state.dissChargeQ / state.massChargeQ : 0; },
  /** Per-cycle blow-down COMPLETION (0..1): how far the live qL has fallen from the
   *  cycle peak. peak→0 reads 1 (AS-IS); at the peak reads 0. */
  cycleDissolved(qLNow: number): number {
    return state.cyclePeakQ > 0.001 ? Math.max(0, Math.min(1, (state.cyclePeakQ - Math.max(0, qLNow)) / state.cyclePeakQ)) : 0;
  },
  /** Zero the PER-CYCLE peak (call on armCycle) — leaves the session totals intact. */
  resetCycle() { state = { ...state, cyclePeakQ: 0 }; emit(); },
  reset() { state = { massSec: 0, dissolutionSec: 0, relVelSum: 0, relVelN: 0, massChargeQ: 0, dissChargeQ: 0, cyclePeakQ: 0 }; emit(); },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};

export function useTZone(): ZoneTimeState {
  return useSyncExternalStore(tzoneStore.subscribe, () => state, () => state);
}
