import { describe, it, expect } from 'vitest';
import {
  SWEEP_DEG, SET_OFFSET, off2ang, ang2off, clampOffset, puntoDial, arcoDial,
} from '../dialGeometry';
import { NEEDLE_REST_OFFSET } from '../tuning';

/**
 * ⚠️ QUESTI TEST NON DESCRIVONO IL DISEGNO: DIFENDONO LA TARATURA.
 *
 * Le ampiezze delle reazioni — SF, FALL, LONG FALL, BLOW DOWN — sono state tarate in seduta
 * contro QUESTI angoli. Cambiarli per far stare meglio un disegno vorrebbe dire cambiare cosa
 * l'applicazione chiama reazione, senza che nessuno tocchi una soglia.
 *
 * E dalla fase 5 gli angoli sono di DUE applicazioni: se SERENITY li calcolasse per conto suo,
 * un blow-down cadrebbe di 40° di là e di 45° di qua sullo stesso preclear.
 */
describe('i numeri della taratura, che nessun disegno deve spostare', () => {
  it('l arco è 135° in tutto — ±67,5 dalla verticale', () => {
    expect(SWEEP_DEG).toBe(67.5);
  });

  it('SET riposa a −0,35, e viene da tuning: UNA sola verità', () => {
    // `QuantumSphere` ne teneva una copia scritta a mano; le due potevano scostarsi in
    // silenzio, e l'ago avrebbe riposato in un punto diverso da quello tarato.
    expect(SET_OFFSET).toBe(-0.35);
    expect(SET_OFFSET).toBe(NEEDLE_REST_OFFSET);
  });
});

describe('valore → angolo', () => {
  it('il centro del quadrante è la verticale', () => {
    expect(off2ang(0)).toBe(90);
  });

  it('gli estremi stanno a ±67,5 dalla verticale', () => {
    expect(off2ang(1)).toBeCloseTo(22.5, 10);    // fondo destro: la caduta
    expect(off2ang(-1)).toBeCloseTo(157.5, 10);  // fondo sinistro
  });

  it('⚠️ il POSITIVO scende a destra — è il verso della caduta su un meter vero', () => {
    expect(off2ang(0.5)).toBeLessThan(off2ang(0));
  });

  it('e la strada inversa riporta al valore di partenza', () => {
    for (const o of [-1, -0.35, 0, 0.42, 1]) {
      expect(ang2off(off2ang(o))).toBeCloseTo(o, 10);
    }
  });

  it('l ago non esce dal quadrante', () => {
    expect(clampOffset(2)).toBe(1);
    expect(clampOffset(-9)).toBe(-1);
    expect(clampOffset(0.3)).toBe(0.3);
  });
});

describe('i punti sul quadrante', () => {
  it('al centro l ago punta in ALTO: x a zero, y negativa (su, in coordinate schermo)', () => {
    const p = puntoDial(0, 100);
    expect(p.x).toBeCloseTo(0, 8);
    expect(p.y).toBeCloseTo(-100, 8);
  });

  it('il raggio è di chi disegna: la stessa geometria, grande o piccola', () => {
    // È così che le due applicazioni possono avere quadranti di dimensioni diverse
    // senza avere angoli diversi.
    const piccolo = puntoDial(0.6, 100);
    const grande = puntoDial(0.6, 500);
    expect(grande.x / piccolo.x).toBeCloseTo(5, 8);
    expect(grande.y / piccolo.y).toBeCloseTo(5, 8);
  });

  it('la distanza dal perno È il raggio, per qualunque valore', () => {
    for (const o of [-1, -0.35, 0, 1]) {
      const p = puntoDial(o, 240);
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(240, 6);
    }
  });
});

describe('l arco fra due valori', () => {
  it('prende la strada CORTA, non il giro lungo', () => {
    // Con il verso sbagliato si vedrebbe un cerchio quasi intero al posto di un tratto.
    const d = arcoDial(-1, 1, 200);
    expect(d).toMatch(/^M /);
    expect(d).toContain(' A 200 200 0 0 1 ');   // largeArcFlag 0, sweepFlag 1
  });

  it('comincia e finisce sui punti dei due valori', () => {
    const a = puntoDial(-0.35, 300), b = puntoDial(0.8, 300);
    const d = arcoDial(-0.35, 0.8, 300);
    expect(d).toContain(`M ${a.x.toFixed(2)} ${a.y.toFixed(2)}`);
    expect(d).toContain(`${b.x.toFixed(2)} ${b.y.toFixed(2)}`);
  });
});
