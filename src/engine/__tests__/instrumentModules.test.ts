import { describe, it, expect } from 'vitest';
import { effectiveModules, noInstruments, taSource, MUSE_ONLY_MODULES } from '../instrumentModules';

const TUTTI = { journal: true, health: true, cam1: true, cam2: true, ri: true, biometric: true, mna: true };

describe('quali moduli secondo gli strumenti', () => {
  it('col MUSE resta tutto come l utente l ha scelto', () => {
    expect(effectiveModules(TUTTI, { muse: true, theta: false })).toEqual(TUTTI);
    expect(effectiveModules(TUTTI, { muse: true, theta: true })).toEqual(TUTTI);
  });

  it('SENZA Muse spariscono i moduli che vivono di EEG', () => {
    const r = effectiveModules(TUTTI, { muse: false, theta: true });
    for (const m of MUSE_ONLY_MODULES) expect(r[m]).toBe(false);
  });

  it('…ma NON gli altri: la voce e le camere non dipendono dagli strumenti', () => {
    const r = effectiveModules(TUTTI, { muse: false, theta: true });
    expect(r.journal).toBe(true);
    expect(r.cam1).toBe(true);
    expect(r.cam2).toBe(true);
    expect(r.ri).toBe(true);
  });

  it('la PREFERENZA dell utente non viene toccata', () => {
    // Nascondere per mancanza di sorgente è una cosa; sovrascrivere le scelte di chi usa
    // l'app perché un cavo è staccato sarebbe un modo silenzioso di perdergliele.
    const scelti = { ...TUTTI, health: false, journal: false };
    const r = effectiveModules(scelti, { muse: false, theta: true });
    expect(r.journal).toBe(false);              // resta spento perché LUI l'ha spento
    // e riattaccando il Muse torna esattamente com'era
    expect(effectiveModules(scelti, { muse: true, theta: true })).toEqual(scelti);
  });

  it('un modulo già spento resta spento, non si riaccende', () => {
    const r = effectiveModules({ ...TUTTI, mna: false }, { muse: true, theta: false });
    expect(r.mna).toBe(false);
  });
});

describe('sorgente del TONE ARM', () => {
  it('le boîtes VINCONO: è una resistenza misurata, non una ricostruzione', () => {
    expect(taSource({ muse: true, theta: true })).toBe('theta');
    expect(taSource({ muse: false, theta: true })).toBe('theta');
  });

  it('senza boîtes si ricade sull EEG', () => {
    expect(taSource({ muse: true, theta: false })).toBe('eeg');
  });

  it('senza nulla non si inventa un TA', () => {
    expect(taSource({ muse: false, theta: false })).toBe('none');
    expect(noInstruments({ muse: false, theta: false })).toBe(true);
  });
});
