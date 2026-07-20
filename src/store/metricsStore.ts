import { useSyncExternalStore } from 'react';
import type { ChargeStateId } from '../lib/chargeState';

// CONN-122 (perf, stage 3): the ~10 Hz session metrics live OUTSIDE React, in this
// tiny external store, instead of in App's useState. Components that display a
// metric subscribe to just that field via `useMetric`, so a metric update
// re-renders ONLY that small component — App itself no longer re-renders at 10 Hz.
// (Same idea already used for the needle / BPM / integrity meter.)
export interface Metrics {
  qL: number;          // lock quality (theta mass)
  eta: number;         // synchrony index
  vProc: number;       // raw process velocity
  smoothVProc: number; // NEST V5: mental-change velocity (SOL/SEC display)
  velRatio: number;    // NEST V5: velocity / personal baseline (self-calibrating) — drives Effetto/Causa
  toneArm: number;     // instantaneous Tone Arm (2.0–6.0)
  totalTa: number;     // accumulated Total TA (blowdown divisions)
  chargePhase: ChargeStateId; // cycle FSM phase (neutral|contact|discharge|asis) — drives label/colour
  reContact: boolean;  // DISCHARGE only: PC re-touched the charge (same cycle, faint hint)
}

let state: Metrics = { qL: 0, eta: 0, vProc: 0, smoothVProc: 0, velRatio: 1, toneArm: 2.0, totalTa: 0, chargePhase: 'neutral', reContact: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export const metricsStore = {
  get: (): Metrics => state,
  /** Batch-update the high-frequency metrics (called ~10 Hz from the worker handler). */
  push(p: Partial<Metrics>) { state = { ...state, ...p }; emit(); },
  addTotalTa(n: number) { state = { ...state, totalTa: state.totalTa + n }; emit(); },
  resetTotalTa() { if (state.totalTa !== 0) { state = { ...state, totalTa: 0 }; emit(); } },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};

/** Subscribe a component to ONE metric (use a primitive selector → stable snapshot). */
export function useMetric<T>(selector: (m: Metrics) => T): T {
  return useSyncExternalStore(metricsStore.subscribe, () => selector(state), () => selector(state));
}
