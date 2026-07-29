import { describe, it, expect } from 'vitest';
import {
  scaleFromSqueeze, breathIsValid, soloOffsetFrom, taWithSetup, defaultSetup,
  SQUEEZE_TARGET_OFFSET, BREATH_MIN_OFFSET, type ThetaSetup,
} from '../thetaSetup';

/**
 * L'assetto è distinto dalla scala del TA: quella si tara UNA VOLTA con l'artefatto e vale per
 * chiunque. Qui c'è invece ciò che dipende da COME si audita — due lattine o lattina solo — e
 * la sensibilità dell'ago, che la procedura standard permette di MISURARE col test del respiro.
 */

// La SENSIBILITÀ si fissa con la PROVA DELLA STRETTA (un terzo di quadrante) — è la manopola
// di sensibilità del Theta-Meter. Il RESPIRO viene dopo, ed è una VERIFICA che la persona
// reagisca: l'ago deve cadere almeno un minimo. Sono due prove distinte, non la stessa.
describe('sensibilità dalla PROVA DELLA STRETTA', () => {
  it('una stretta vale un TERZO di quadrante', () => {
    const dev = 450_000;
    const scala = scaleFromSqueeze(dev)!;
    expect(dev * scala).toBeCloseTo(SQUEEZE_TARGET_OFFSET, 9);
    expect(SQUEEZE_TARGET_OFFSET).toBeCloseTo(1 / 3, 9);
  });

  it('più ampia è la stretta, MINORE la sensibilità necessaria', () => {
    expect(scaleFromSqueeze(900_000)!).toBeLessThan(scaleFromSqueeze(300_000)!);
  });

  it('il verso non conta: si misura l ampiezza', () => {
    expect(scaleFromSqueeze(-450_000)).toBe(scaleFromSqueeze(450_000));
  });

  it('RIFIUTA una misura nulla o assurda invece di rovinare la sensibilità', () => {
    // Meglio tenere quella che c'è: azzerarla bloccherebbe l'ago, o lo manderebbe fuori scala.
    expect(scaleFromSqueeze(0)).toBeNull();
    expect(scaleFromSqueeze(0.5)).toBeNull();
    expect(scaleFromSqueeze(NaN)).toBeNull();
  });
});

describe('test del respiro — verifica, non taratura', () => {
  it('una caduta sufficiente passa', () => {
    const scala = scaleFromSqueeze(450_000)!;      // stretta = 1/3 di quadrante
    expect(breathIsValid(450_000, scala)).toBe(true);
  });

  it('una caduta troppo piccola NON passa: la persona non reagisce, o il contatto è cattivo', () => {
    const scala = scaleFromSqueeze(450_000)!;
    expect(breathIsValid(450_000 * (BREATH_MIN_OFFSET / SQUEEZE_TARGET_OFFSET) * 0.5, scala)).toBe(false);
  });

  it('la soglia del respiro è MOLTO sotto quella della stretta', () => {
    // Il respiro non deve dare un terzo di quadrante: deve solo dare qualcosa.
    expect(BREATH_MIN_OFFSET).toBeLessThan(SQUEEZE_TARGET_OFFSET / 2);
  });
});

describe('configurazione degli elettrodi', () => {
  const base: ThetaSetup = { config: 'two-cans', soloOffsetTa: 0.7, needleScale: 1e-6 };

  it('a DUE LATTINE la lettura non si corregge: è il riferimento', () => {
    expect(taWithSetup(3.4, base)).toBe(3.4);
  });

  it('in SOLO si applica lo scarto, per tornare al riferimento delle due lattine', () => {
    expect(taWithSetup(3.4, { ...base, config: 'solo-can' })).toBeCloseTo(4.1, 9);
  });

  it('lo scarto è TA(due lattine) − TA(solo), misurati sulla stessa persona', () => {
    // Con la lattina solo la resistenza cambia: la stessa persona legge un TA diverso.
    const off = soloOffsetFrom(3.4, 2.7);
    expect(off).toBeCloseTo(0.7, 9);
    // …e applicandolo le due configurazioni tornano confrontabili.
    expect(taWithSetup(2.7, { ...base, config: 'solo-can', soloOffsetTa: off })).toBeCloseTo(3.4, 9);
  });

  it('senza scarto misurato la correzione è nulla, non inventata', () => {
    const d = defaultSetup(1e-6);
    expect(d.soloOffsetTa).toBe(0);
    expect(d.config).toBe('two-cans');
    expect(taWithSetup(3.4, { ...d, config: 'solo-can' })).toBe(3.4);
  });
});
