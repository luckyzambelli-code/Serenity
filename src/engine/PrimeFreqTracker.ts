/**
 * PrimeFreqTracker — prime-frequency (MNA) computation + capture window,
 * extracted from App.tsx (SessionEngine slice 2). Pure TS, no React.
 *
 * Per worker cycle (while the session is running) it:
 *   • computes I_m / f_d / nearest prime / Δ / zone from the band powers;
 *   • while CAPTURING, feeds a rolling ~3 s window so that pressing CAPTURE can
 *     lock onto the PEAK I_m of the recent window (compensates the auditor/PC
 *     reaction delay — "il a du retard dans le communiquer ou appuyer");
 *   • updates the MnaSession report aggregates (capped imHistory + running
 *     sum/count + peak + finalZone while capturing).
 *
 * The React layer only mirrors the returned values into the (10 Hz-gated)
 * MNA readout states and drives phase transitions.
 */

import {
  computeIm, computeFd, nearestPrime, classifyZone,
  type Zone as PrimeZone,
} from '../lib/primeFreqEngine';
import type { MnaSession } from '../hooks/useMnaModule';

export interface PrimeBands {
  delta: number; theta: number; alpha: number; beta: number; gamma: number;
}

export interface PrimeSample {
  t: number; im: number; fd: number; ps: number; dv: number; zone: PrimeZone;
}

const WINDOW_MS = 3000; // rolling capture window (~3 s)

export class PrimeFreqTracker {
  private window: PrimeSample[] = [];

  /**
   * Feed one worker cycle. `capturing` = phase is CAPTURE/IDLE (values track
   * live; once the auditor advances past CAPTURE everything upstream freezes).
   * Updates `session` aggregates in place. Returns the computed sample.
   */
  update(bands: PrimeBands, capturing: boolean, session: MnaSession): PrimeSample {
    const theta = Math.max(0, bands?.theta || 0);
    const beta  = Math.max(0, bands?.beta  || 0);
    const gamma = Math.max(0, bands?.gamma || 0);
    const delta = Math.max(0, bands?.delta || 0);
    const alpha = Math.max(0, bands?.alpha || 0);

    const im = computeIm(theta, beta, gamma);
    const fd = computeFd(delta, theta, alpha, beta, gamma);
    const ps = nearestPrime(fd);
    const dv = Math.abs(fd - ps);
    const zone = classifyZone(dv);
    const sample: PrimeSample = { t: Date.now(), im, fd, ps, dv, zone };

    if (capturing) {
      // Rolling ~3 s window — full-rate push, no render cost.
      const w = this.window;
      w.push(sample);
      while (w.length && sample.t - w[0].t > WINDOW_MS) w.shift();
    }

    // Report aggregates — running sum/count (imHistory stays CAPPED; the
    // full-session average uses imSum/imCount, which never lose data).
    if (im > 0) {
      session.imHistory.push(im);
      if (session.imHistory.length > 2000) session.imHistory.splice(0, session.imHistory.length - 1500);
      session.imSum += im; session.imCount++;
      if (im > session.peakIm) session.peakIm = im;
      if (capturing) session.finalZone = zone;
    }
    return sample;
  }

  /**
   * The PEAK-I_m sample of the recent window — what CAPTURE locks onto
   * (the instant of the click is rarely the strongest response).
   * Null when no sample arrived yet.
   */
  peak(): PrimeSample | null {
    const w = this.window;
    if (!w.length) return null;
    let best = w[0];
    for (const e of w) if (e.im > best.im) best = e;
    return best;
  }
}

/** Singleton — one session pipeline per app instance. */
export const primeFreqTracker = new PrimeFreqTracker();
