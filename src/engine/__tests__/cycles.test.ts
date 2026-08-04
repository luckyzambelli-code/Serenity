import { describe, it, expect } from 'vitest';
import { ClearReadDetector } from '../ClearReadDetector';
import { LagMeter } from '../LagMeter';

/**
 * EQUILIBRIUM — il TA deve RESTARE alla base (3.0 uomo / 2.0 donna) per un tempo minimo.
 * Un semplice passaggio non basta: è la TENUTA che conta.
 */
describe('ClearReadDetector', () => {
  it('non scatta se il TA non è alla base', () => {
    const d = new ClearReadDetector();
    expect(d.update(3.8, 3.0, 0)).toBe(false);
    expect(d.update(3.8, 3.0, 5000)).toBe(false);
  });

  it('non scatta SUBITO: serve la tenuta', () => {
    const d = new ClearReadDetector();
    expect(d.update(3.0, 3.0, 0)).toBe(false);
    expect(d.update(3.0, 3.0, 500)).toBe(false);
  });

  it('scatta quando la tenuta è compiuta', () => {
    const d = new ClearReadDetector();
    d.update(3.0, 3.0, 0);
    expect(d.update(3.0, 3.0, 2000)).toBe(true);
    expect(d.held).toBe(true);
  });

  it('la tolleranza attorno alla base è ammessa', () => {
    const d = new ClearReadDetector();
    d.update(3.04, 3.0, 0);
    expect(d.update(3.04, 3.0, 2000)).toBe(true);
  });

  it('se il TA risale, la tenuta RIPARTE da zero', () => {
    const d = new ClearReadDetector();
    d.update(3.0, 3.0, 0);
    d.update(3.6, 3.0, 800);              // esce dalla base
    expect(d.held).toBe(false);
    d.update(3.0, 3.0, 1000);             // rientra: riparte il conteggio
    expect(d.update(3.0, 3.0, 1900)).toBe(false);   // non sono ancora passati 1500 ms
    expect(d.update(3.0, 3.0, 2600)).toBe(true);
  });

  it('la base FEMMINILE (2.0) è gestita come quella maschile', () => {
    const d = new ClearReadDetector();
    d.update(2.0, 2.0, 0);
    expect(d.update(2.0, 2.0, 2000)).toBe(true);
  });

  it('reset() azzera la tenuta', () => {
    const d = new ClearReadDetector();
    d.update(3.0, 3.0, 0); d.update(3.0, 3.0, 2000);
    d.reset();
    expect(d.held).toBe(false);
    expect(d.heldFor(3000)).toBe(0);
  });
});

/**
 * COMM LAG (Δt*) — tempo di reazione misurato. Deve RIFIUTARE i valori non attribuibili
 * all'item: troppo rapidi (il PC reagiva già) o troppo lenti.
 */
describe('LagMeter', () => {
  it('parte dal baseline finché non c è una misura', () => {
    const m = new LagMeter();
    expect(m.getN()).toBe(0);
    expect(m.getDeltaStar()).toBe(m.getBaseline());
  });

  it('RIFIUTA i lag impossibili', () => {
    const m = new LagMeter();
    expect(m.recordLag(50)).toBe(false);      // troppo rapido: reagiva già
    expect(m.recordLag(9000)).toBe(false);    // troppo lento: non è l item
    expect(m.getN()).toBe(0);                 // nessuna misura consumata
  });

  it('ACCETTA un lag plausibile e lo conta', () => {
    const m = new LagMeter();
    expect(m.recordLag(600)).toBe(true);
    expect(m.getN()).toBe(1);
  });

  it('si adatta verso i lag osservati', () => {
    const m = new LagMeter();
    const base = m.getBaseline();
    for (let i = 0; i < 12; i++) m.recordLag(base + 400);   // PC costantemente più lento
    expect(m.getDeltaStar()).toBeGreaterThan(base);
  });

  it('reset() torna al baseline', () => {
    const m = new LagMeter();
    for (let i = 0; i < 5; i++) m.recordLag(900);
    m.reset();
    expect(m.getN()).toBe(0);
    expect(m.getDeltaStar()).toBe(m.getBaseline());
  });
});
