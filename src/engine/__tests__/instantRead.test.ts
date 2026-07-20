import { describe, it, expect } from 'vitest';
import { computeInstantRead } from '../instantRead';
import { READ_WINDOW_BEFORE_S, READ_WINDOW_AFTER_S } from '../tuning';

/**
 * LETTURA ISTANTANEA di un item (ASSESSMENT / R&I).
 * Qui si bloccano le regole che sono costate di più in seduta:
 *   • la fonte è SOLO ciò che è stato MOSTRATO all'auditor;
 *   • nessuna reazione → NULL;
 *   • niente letture LATENTI (dopo l'item);
 *   • un item non ruba la lettura dell'item PRECEDENTE;
 *   • il ritardo è « quanto PRIMA » (sempre ≥ 0, mostrato col segno −).
 */
const shown = (...pairs: [number, string][]) => pairs.map(([time, reaction]) => ({ time, reaction }));

describe('computeInstantRead', () => {
  it('nessuna reazione mostrata → NULL', () => {
    expect(computeInstantRead([], 10).read).toBe('NULL');
    expect(computeInstantRead(shown([10, 'Fall']), 10).read).not.toBe('NULL'); // sanity
  });

  it('prende la reazione avvenuta appena PRIMA dell item', () => {
    const r = computeInstantRead(shown([9.6, 'Fall']), 10);
    expect(r.read).toBe('Fall');
    expect(r.beforeMs).toBe(400);            // 0,4 s prima
  });

  it('il ritardo non è mai negativo (si mostra sempre col segno meno)', () => {
    const r = computeInstantRead(shown([10.05, 'Fall']), 10);   // dentro la tolleranza dopo
    expect(r.beforeMs).toBeGreaterThanOrEqual(0);
  });

  it('IGNORA le letture LATENTI (troppo dopo l item)', () => {
    const late = 10 + READ_WINDOW_AFTER_S + 0.5;
    expect(computeInstantRead(shown([late, 'Long Fall']), 10).read).toBe('NULL');
  });

  it('IGNORA ciò che è troppo indietro nel tempo', () => {
    const old = 10 - READ_WINDOW_BEFORE_S - 0.5;
    expect(computeInstantRead(shown([old, 'Long Fall']), 10).read).toBe('NULL');
  });

  it('NON ruba la lettura dell item PRECEDENTE (limite notBefore)', () => {
    // Fall a 9.2 = reazione dell item precedente (dato a 9.0). L item corrente è a 10.
    const reads = shown([9.2, 'Fall']);
    expect(computeInstantRead(reads, 10).read).toBe('Fall');          // senza limite: la ruba
    expect(computeInstantRead(reads, 10, 9.5).read).toBe('NULL');     // con limite: corretto
  });

  it('a parità di finestra sceglie la reazione PIÙ FORTE', () => {
    const r = computeInstantRead(shown([9.7, 'SF'], [9.8, 'LF Blow Down'], [9.9, 'Tick']), 10);
    expect(r.read).toBe('LF Blow Down');
  });

  it('ignora voci che non sono letture valide', () => {
    expect(computeInstantRead(shown([9.8, 'Set'], [9.9, 'rumore']), 10).read).toBe('NULL');
  });
});
