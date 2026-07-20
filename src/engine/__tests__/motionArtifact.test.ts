import { describe, it, expect } from 'vitest';
import { gyroRms, isMotionArtifact } from '../motionArtifact';
import { MOTION_ARTIFACT_RMS, MOTION_WINDOW_SAMPLES } from '../tuning';

/** Il filtro che impedisce a un movimento della testa di diventare una « lettura » dell'item. */
const flat = (v: number, n = 64) => Array.from({ length: n }, () => v);

describe('gyroRms', () => {
  it('testa ferma → nessun movimento', () => {
    expect(gyroRms(flat(0), flat(0), flat(0))).toBe(0);
  });

  it('buffer vuoto → 0 (nessuna divisione per zero)', () => {
    expect(gyroRms([], [], [])).toBe(0);
  });

  it('calcola il modulo sui tre assi', () => {
    expect(gyroRms(flat(3), flat(4), flat(0))).toBeCloseTo(5, 6);   // 3-4-5
  });

  it('guarda solo gli ULTIMI campioni: un movimento vecchio non conta più', () => {
    const vecchio = [...flat(100, 50), ...flat(0, MOTION_WINDOW_SAMPLES)];
    expect(gyroRms(vecchio, flat(0, vecchio.length), flat(0, vecchio.length))).toBe(0);
  });

  it('ignora i valori non validi senza propagare NaN', () => {
    const r = gyroRms([NaN, 3, 3], [0, 4, 4], [0, 0, 0]);
    expect(Number.isFinite(r)).toBe(true);
  });
});

describe('isMotionArtifact', () => {
  it('immobilità → nessun artefatto (non si sopprime nulla)', () => {
    expect(isMotionArtifact(flat(0), flat(0), flat(0))).toBe(false);
  });

  it('micro-movimento sotto soglia → la lettura PASSA', () => {
    const v = MOTION_ARTIFACT_RMS / 4;
    expect(isMotionArtifact(flat(v), flat(0), flat(0))).toBe(false);
  });

  it('movimento netto della testa → artefatto', () => {
    const v = MOTION_ARTIFACT_RMS * 2;
    expect(isMotionArtifact(flat(v), flat(0), flat(0))).toBe(true);
  });

  it('la soglia è rispettata esattamente (nessun artefatto AL valore soglia)', () => {
    expect(isMotionArtifact(flat(MOTION_ARTIFACT_RMS), flat(0), flat(0))).toBe(false);
  });
});
