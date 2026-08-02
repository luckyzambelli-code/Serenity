import { describe, it, expect } from 'vitest';
import { ThetaFloatDetector } from '../thetaFloat';
import { THETA_FN_MIN_SWEEP } from '../tuning';

/** L'ago si alimenta a 60 letture/s come il vero. */
const DT = 1 / 60;

/** Spazza avanti e indietro `n` mezze spazzate di ampiezza `amp` e mezzo periodo `half` s,
 *  attorno a `centro`, muovendosi in modo CONTINUO (una resistenza vera non salta). */
function spazza(
  d: ThetaFloatDetector,
  { n, amp, half, centro = 0, sec = 0, drift = 0, motion = false }:
  { n: number; amp: number; half: number; centro?: number; sec?: number; drift?: number; motion?: boolean },
) {
  let t = sec;
  let stato = d.push(centro - amp / 2, t, motion);
  let da = centro - amp / 2;
  for (let i = 0; i < n; i++) {
    const c = centro + drift * (i + 1);
    const a = i % 2 === 0 ? c + amp / 2 : c - amp / 2;
    const passi = Math.max(1, Math.round(half / DT));
    for (let k = 1; k <= passi; k++) {
      t += DT;
      stato = d.push(da + (a - da) * (k / passi), t, motion);
    }
    da = a;
  }
  return { stato, t };
}

describe('ThetaFloatDetector — un F/N è una FORMA, non un\'ampiezza', () => {
  it('riconosce uno spazzare ritmico e ampio', () => {
    const d = new ThetaFloatDetector();
    const { stato } = spazza(d, { n: 5, amp: 0.5, half: 1 });
    expect(stato.fn).toBe(true);
    expect(stato.widthAvg).toBeGreaterThan(THETA_FN_MIN_SWEEP);
    // Periodo intero = due mezze spazzate da 1 s.
    expect(stato.periodSec).toBeGreaterThan(1.5);
    expect(stato.periodSec).toBeLessThan(2.5);
  });

  it('NON dichiara F/N su una sola caduta con rientro', () => {
    const d = new ThetaFloatDetector();
    // Giù e su: due mezze spazzate, non tre.
    const { stato } = spazza(d, { n: 2, amp: 0.6, half: 1 });
    expect(stato.fn).toBe(false);
  });

  it('NON dichiara F/N se lo spazzare è troppo stretto', () => {
    const d = new ThetaFloatDetector();
    const { stato } = spazza(d, { n: 6, amp: 0.10, half: 1 });
    expect(stato.fn).toBe(false);
  });

  it('NON dichiara F/N se le ampiezze sono sparse (corpo che si agita)', () => {
    const d = new ThetaFloatDetector();
    let t = 0;
    d.push(0, 0);
    // ampiezze 0,3 / 0,9 / 0,25 / 0,8 : nessun ritmo di ampiezza
    for (const amp of [0.3, 0.9, 0.25, 0.8, 0.35]) {
      const r = spazza(d, { n: 1, amp, half: 1, sec: t });
      t = r.t;
    }
    // L'ultimo stato si rilegge con una spinta neutra a metà corsa.
    const stato = d.push(0, t + DT);
    expect(stato.fn).toBe(false);
  });

  it('NON dichiara F/N se il centro scivola (deriva, non galleggiamento)', () => {
    const d = new ThetaFloatDetector();
    const { stato } = spazza(d, { n: 6, amp: 0.4, half: 0.8, drift: 0.18 });
    expect(stato.fn).toBe(false);
  });

  it('NON dichiara F/N se il ritmo è irregolare', () => {
    const d = new ThetaFloatDetector();
    let t = 0;
    d.push(0, 0);
    for (const half of [0.3, 1.6, 0.35, 2.2, 0.3]) {
      const r = spazza(d, { n: 1, amp: 0.45, half, sec: t });
      t = r.t;
    }
    const stato = d.push(0, t + DT);
    expect(stato.fn).toBe(false);
  });

  it('data l\'F/N a quando è COMINCIATO lo spazzare, non a quando lo si riconosce', () => {
    const d = new ThetaFloatDetector();
    const { stato, t } = spazza(d, { n: 4, amp: 0.5, half: 1, sec: 10 });
    expect(stato.fn).toBe(true);
    expect(stato.sinceSec).not.toBeNull();
    // Riconosciuto dopo la terza spazzata (≈ t 13), ma datato all'inizio della prima (≈ 10).
    expect(stato.sinceSec as number).toBeLessThan(t - 1.5);
    expect(stato.sinceSec as number).toBeGreaterThanOrEqual(9.9);
  });

  it('l\'F/N SCADE quando l\'ago si ferma', () => {
    const d = new ThetaFloatDetector();
    let { stato, t } = spazza(d, { n: 5, amp: 0.5, half: 1 });
    expect(stato.fn).toBe(true);
    // Ago immobile per sei secondi: le spazzate escono dalla finestra.
    for (let k = 0; k < 6 * 60; k++) { t += DT; stato = d.push(0, t); }
    expect(stato.fn).toBe(false);
    expect(stato.sinceSec).toBeNull();
  });

  it('il movimento del corpo si RIPORTA ma non vieta l\'F/N', () => {
    // Un F/N ampio scatena il rilevatore di agitazione (spazzata > 0,5 in 2 s): vietarlo lì
    // renderebbe invisibili gli F/N più larghi, cioè i più inequivocabili.
    const d = new ThetaFloatDetector();
    const { stato } = spazza(d, { n: 5, amp: 0.7, half: 0.9, motion: true });
    expect(stato.fn).toBe(true);
    expect(stato.motion).toBe(true);
  });

  it('reset() dimentica tutto', () => {
    const d = new ThetaFloatDetector();
    const { stato, t } = spazza(d, { n: 5, amp: 0.5, half: 1 });
    expect(stato.fn).toBe(true);
    d.reset();
    expect(d.push(0, t + DT).fn).toBe(false);
  });

  it('il rumore fine non produce F/N (isteresi sulle svolte)', () => {
    const d = new ThetaFloatDetector();
    let stato = d.push(0, 0);
    for (let k = 1; k < 600; k++) {
      // ±0,02: sotto l'isteresi delle svolte, nessuna inversione contata
      stato = d.push((k % 2 === 0 ? 0.02 : -0.02), k * DT);
    }
    expect(stato.fn).toBe(false);
  });
});
