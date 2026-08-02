import { describe, it, expect } from 'vitest';
import { ReactionClassifier, REACTION_OFFSETS, type OffsetSample } from '../ReactionClassifier';

/**
 * L'AMPIEZZA DEL MUSE — perché esiste `lastMoveR`.
 *
 * L'archivio scriveva, come ampiezza della reazione EEG, `REACTION_OFFSETS[chiave]`: un valore
 * ricavato DALL'ETICHETTA. Due Long Fall di grandezza diversissima ci finivano dentro con lo
 * stesso numero, e la correlazione di ampiezza col meter (misurata: 0,01) era condannata prima
 * di cominciare. Questi test fissano il fatto che `lastMoveR` è la MISURA.
 */

/** Una rampa dell'ago virtuale: da `da` a `a` nell'ultimo mezzo secondo. */
const rampa = (da: number, a: number, fino = 10): OffsetSample[] => {
  const out: OffsetSample[] = [];
  for (let i = 0; i <= 10; i++) {
    out.push({ time: fino - 0.5 + (0.5 * i) / 10, offset: da + ((a - da) * i) / 10 });
  }
  return out;
};

const input = (offH: OffsetSample[], nowS = 10) => ({
  offH, nowS, inDirtyRange: false, isBpmArtifact: false,
  isMotionArtifact: false, isStall: false,
});

describe('lastMoveR — l ampiezza è misurata, non dedotta dall etichetta', () => {
  it('vale la caduta a destra dell ago in ~0,5 s', () => {
    const c = new ReactionClassifier();
    c.classify(input(rampa(-0.35, -0.05)));
    expect(c.lastMoveR).toBeCloseTo(0.30, 2);
  });

  it('due reazioni dello STESSO grado hanno ampiezze DIVERSE', () => {
    // È esattamente ciò che l'archivio non riusciva a distinguere: entrambe « Long Fall »,
    // con `REACTION_OFFSETS` entrambe 0.68.
    const c = new ReactionClassifier();
    c.classify(input(rampa(-0.35, -0.06)));          // 0.29 — appena Long Fall
    const piccola = c.lastMoveR;
    c.reset();
    c.classify(input(rampa(-0.35, 0.35)));           // 0.70 — Long Fall larghissima
    const grande = c.lastMoveR;
    expect(REACTION_OFFSETS['reaction_long_fall']).toBe(0.68);   // lo stesso numero per entrambe
    expect(grande).toBeGreaterThan(piccola * 2);                 // la misura le separa
  });

  it('un ago fermo dà ampiezza nulla', () => {
    const c = new ReactionClassifier();
    c.classify(input(rampa(0.10, 0.10)));
    expect(Math.abs(c.lastMoveR)).toBeLessThan(0.001);
  });

  it('una risalita a sinistra è NEGATIVA — non si confonde con una caduta', () => {
    const c = new ReactionClassifier();
    c.classify(input(rampa(0.30, -0.20)));
    expect(c.lastMoveR).toBeLessThan(0);
  });

  it('reset azzera l ampiezza: una seduta non eredita quella precedente', () => {
    const c = new ReactionClassifier();
    c.classify(input(rampa(-0.35, 0.20)));
    expect(c.lastMoveR).toBeGreaterThan(0);
    c.reset();
    expect(c.lastMoveR).toBe(0);
  });
});
