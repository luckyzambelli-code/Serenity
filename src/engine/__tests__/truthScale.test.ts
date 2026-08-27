import { describe, it, expect } from 'vitest';
import { TruthSignalTracker, truthFlags, truthConfidence, isCandidate } from '../truthScale';
import { TRUTH_CANDIDATE_THRESHOLD } from '../tuning';

describe('TruthSignalTracker — deriva S/Ṡ/S̈ da un flusso di qL', () => {
  it('il primo campione fissa il punto di partenza, nessuna velocità ancora', () => {
    const tr = new TruthSignalTracker();
    const v = tr.update(0.5, 0);
    expect(v.s).toBe(0.5);
    expect(v.sDot).toBe(0);
    expect(v.sDotDot).toBe(0);
  });

  it('un segnale stabile produce velocità/accelerazione vicine a zero', () => {
    const tr = new TruthSignalTracker();
    let v = tr.update(0.5, 0);
    for (let i = 0; i < 50; i++) v = tr.update(0.5, 0.1);
    expect(Math.abs(v.sDot)).toBeLessThan(0.01);
    expect(Math.abs(v.sDotDot)).toBeLessThan(0.01);
  });

  it('un calo sostenuto produce una velocità negativa', () => {
    const tr = new TruthSignalTracker();
    let v = tr.update(1.0, 0);
    for (let i = 0; i < 50; i++) v = tr.update(1.0 - i * 0.02, 0.1);
    expect(v.sDot).toBeLessThan(0);
  });

  it('reset() azzera segnale/velocità ma NON l\'ambiente (è un tratto della persona)', () => {
    const tr = new TruthSignalTracker();
    for (let i = 0; i < 200; i++) tr.update(0.5 + (i % 2 === 0 ? 0.1 : -0.1), 0.1);
    const ambientePrima = tr.ambient;
    expect(ambientePrima).toBeGreaterThan(0);
    tr.reset();
    expect(tr.ambient).toBe(ambientePrima);
  });
});

describe('truthFlags — D/P/Q normalizzati sull\'ambiente della persona', () => {
  it('senza calo, D è falso', () => {
    const f = truthFlags({ s: 0.5, sDot: 0, sDotDot: 0, rTa: null, coh: 1 }, 0.05, false, true);
    expect(f.d).toBe(false);
  });

  it('un calo grande rispetto all\'ambiente accende D', () => {
    const f = truthFlags({ s: 0.3, sDot: -1, sDotDot: 0, rTa: null, coh: 1 }, 0.05, false, true);
    expect(f.d).toBe(true);
  });

  it('lo stesso calo assoluto NON accende D per una persona più "mossa" (ambiente più largo)', () => {
    const vec = { s: 0.3, sDot: -0.2, sDotDot: 0, rTa: null, coh: 1 };
    const personaCalma = truthFlags(vec, 0.02, false, true);
    const personaMossa = truthFlags(vec, 0.5, false, true);
    expect(personaCalma.d).toBe(true);
    expect(personaMossa.d).toBe(false);
  });

  it('un F/N in corso accende P anche senza calo/assestamento', () => {
    const f = truthFlags({ s: 0.5, sDot: 0, sDotDot: 0, rTa: null, coh: 1 }, 0.05, true, true);
    expect(f.p).toBe(true);
  });

  it('Q segue semplicemente "uno strumento è collegato"', () => {
    const senza = truthFlags({ s: 0.5, sDot: 0, sDotDot: 0, rTa: null, coh: 1 }, 0.05, false, false);
    const con = truthFlags({ s: 0.5, sDot: 0, sDotDot: 0, rTa: null, coh: 1 }, 0.05, false, true);
    expect(senza.q).toBe(false);
    expect(con.q).toBe(true);
  });
});

describe('truthConfidence / isCandidate — mai un flag da solo', () => {
  it('nessun flag acceso → confidenza minima', () => {
    const c = truthConfidence({ d: false, p: false, q: false }, 0);
    expect(c).toBe(0);
    expect(isCandidate(c)).toBe(false);
  });

  it('tutti i flag accesi, coerenza massima → confidenza 1, è un candidato', () => {
    const c = truthConfidence({ d: true, p: true, q: true }, 1);
    expect(c).toBeCloseTo(1, 6);
    expect(isCandidate(c)).toBe(true);
  });

  it('un solo flag acceso non basta a superare la soglia da solo', () => {
    const c = truthConfidence({ d: true, p: false, q: false }, 0);
    expect(c).toBeLessThan(TRUTH_CANDIDATE_THRESHOLD);
    expect(isCandidate(c)).toBe(false);
  });

  it('D+P insieme (la coppia più diagnostica: calo che si assesta) possono bastare', () => {
    const c = truthConfidence({ d: true, p: true, q: false }, 0);
    expect(isCandidate(c)).toBe(true);
  });
});
