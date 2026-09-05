import { describe, it, expect, beforeEach } from 'vitest';
import { TaAccumulator, fitGainSpan, type TaCalibPoint } from '../TaAccumulator';

/**
 * Copre l'aggiunta di questo giro: il fit non lineare (gain, span) da coppie
 * (mS compresso, TA di riferimento) — segnalato: « quando entro il valore del TA su
 * Theta-Meter, dovresti cambiare il TA del MUSE che appare ». `msCompress` non è esportato
 * (di proposito, resta un dettaglio interno): questi test lavorano su `m` già compresso per
 * `fitGainSpan`, e su `lastMs` grezzo per `TaAccumulator` — la stessa via che usa l'app vera.
 */

/** Genera N punti ESATTI dal modello: TA = baseline + span·(1 − exp(−m·gain)). Un fit su punti
 *  esatti deve ritrovare (gain, span) entro la precisione della griglia (v. `fitGainSpan`). */
const generaPunti = (ms: number[], baseline: number, gain: number, span: number): TaCalibPoint[] =>
  ms.map(m => ({ m, ta: baseline + span * (1 - Math.exp(-m * gain)) }));

describe('fitGainSpan', () => {
  it('con meno di due punti non fitta: il sistema è indeterminato', () => {
    expect(fitGainSpan([], 2.0)).toBeNull();
    expect(fitGainSpan([{ m: 1, ta: 3 }], 2.0)).toBeNull();
  });

  it('ritrova gain e span da punti esatti generati dallo stesso modello', () => {
    const baseline = 2.0, gainVero = 0.8, spanVero = 2.5;
    const punti = generaPunti([0.3, 0.9, 1.6, 2.2], baseline, gainVero, spanVero);
    const fit = fitGainSpan(punti, baseline);
    expect(fit).not.toBeNull();
    expect(fit!.gain).toBeCloseTo(gainVero, 1);
    expect(fit!.span).toBeCloseTo(spanVero, 1);
  });

  it('con soli due punti passa esattamente per entrambi (sistema determinato)', () => {
    const baseline = 3.0, gainVero = 1.2, spanVero = 1.8;
    const punti = generaPunti([0.4, 1.9], baseline, gainVero, spanVero);
    const fit = fitGainSpan(punti, baseline);
    expect(fit).not.toBeNull();
    for (const p of punti) {
      const pred = baseline + fit!.span * (1 - Math.exp(-p.m * fit!.gain));
      expect(pred).toBeCloseTo(p.ta, 1);
    }
  });
});

describe('TaAccumulator — taratura dal confronto col Theta-Meter', () => {
  let acc: TaAccumulator;
  beforeEach(() => {
    try { localStorage.clear(); } catch { /* noop */ }
    acc = new TaAccumulator();
  });

  it('un segnale FERMO non entra in taratura — niente da imparare da un numero congelato', () => {
    acc.lastMs = 5; acc.lastMsAt = Date.now() - 10_000;   // 10 s: ben oltre la soglia
    expect(acc.addCalibrationPoint(4.0)).toBeNull();
    expect(acc.getCalibrationPoints()).toHaveLength(0);
  });

  it('un valore non finito non entra in taratura', () => {
    acc.lastMs = 5; acc.lastMsAt = Date.now();
    expect(acc.addCalibrationPoint(NaN)).toBeNull();
  });

  it('un punto solo si accumula ma NON corregge — il sistema resta indeterminato', () => {
    const { gain: gainPrima, span: spanPrima } = acc.getCalibration();
    acc.lastMs = 5; acc.lastMsAt = Date.now();
    const esito = acc.addCalibrationPoint(4.0);
    expect(esito).not.toBeNull();
    expect(acc.getCalibrationPoints()).toHaveLength(1);
    // gain/span di fabbrica, invariati: un punto solo non basta a derivarli.
    expect(esito!.gain).toBe(gainPrima);
    expect(esito!.span).toBe(spanPrima);
  });

  it('un secondo punto (mS diverso) fa scattare il fit — la taratura cambia', () => {
    const { gain: gainPrima, span: spanPrima } = acc.getCalibration();
    acc.lastMs = 2; acc.lastMsAt = Date.now();
    acc.addCalibrationPoint(2.5);
    acc.lastMs = 40; acc.lastMsAt = Date.now();
    const esito = acc.addCalibrationPoint(5.0);
    expect(acc.getCalibrationPoints()).toHaveLength(2);
    expect(esito!.gain !== gainPrima || esito!.span !== spanPrima).toBe(true);
  });

  it('un punto quasi allo stesso mS SOSTITUISCE il precedente, non si affianca', () => {
    acc.lastMs = 10; acc.lastMsAt = Date.now();
    acc.addCalibrationPoint(3.0);
    acc.lastMs = 10.001; acc.lastMsAt = Date.now();   // stesso mS compresso, a meno di arrotondamento
    acc.addCalibrationPoint(3.1);
    expect(acc.getCalibrationPoints()).toHaveLength(1);
  });

  it('clearCalibration torna alla taratura di fabbrica, senza punti', () => {
    acc.lastMs = 2; acc.lastMsAt = Date.now();
    acc.addCalibrationPoint(2.5);
    acc.lastMs = 40; acc.lastMsAt = Date.now();
    acc.addCalibrationPoint(5.0);
    expect(acc.getCalibrationPoints().length).toBeGreaterThan(0);
    acc.clearCalibration();
    expect(acc.getCalibrationPoints()).toHaveLength(0);
    expect(acc.getCalibration().gain).toBe(0.6);
    expect(acc.getCalibration().span).toBe(2.1);
  });
});
