import { describe, it, expect } from 'vitest';
import { MirrorCycle, mirrorReading, mirrorOffset } from '../MirrorCycle';
import { MIRROR_DIAL_K, MIRROR_CONTACT_MIN, MIRROR_TURNOVER, MIRROR_CONTACT_WINDOW_S } from '../tuning';

/**
 * MIRROR — metodo del doppio (Ron), modello a/b/c:
 *   a) il valore dell'item è FISSATO al contatto (quando il read si ribalta) ;
 *   b) la cible è il DOPPIO di quel valore ;
 *   c) raggiunta la cible → OTTENUTO.
 */

/** Orologio simulato: un tick = 50 ms, come il flusso reale. */
let clock = 0;
const armAt = (c: MirrorCycle) => { clock = 0; c.arm(0); };
/** Alimenta il ciclo con una serie di cariche (un tick per valore). */
const feed = (c: MirrorCycle, values: number[]) => values.forEach(v => { clock += 0.05; c.update(v, clock); });
/** Ripete un valore n volte — serve perché la carica è LISCIATA (EMA) prima di essere usata. */
const hold = (v: number, n: number) => Array.from({ length: n }, () => v);

describe('mirrorReading / mirrorOffset', () => {
  it('mappa la carica sulla scala 1–10 e la satura', () => {
    expect(mirrorReading(0)).toBe(0);
    expect(mirrorReading(1)).toBe(1 * MIRROR_DIAL_K);
    expect(mirrorReading(99)).toBe(10);      // saturato
    expect(mirrorReading(-5)).toBe(0);       // mai negativo
  });

  it('mappa la lettura sull asse del quadrante [-1, 1]', () => {
    expect(mirrorOffset(0)).toBe(-1);        // estremità sinistra
    expect(mirrorOffset(5)).toBe(0);         // centro
    expect(mirrorOffset(10)).toBe(1);        // estremità destra
  });
});

describe('MirrorCycle', () => {
  it('non misura nulla finché non è armato', () => {
    const c = new MirrorCycle();
    feed(c, hold(1, 50));
    expect(c.locked).toBe(false);
    expect(c.contactQ).toBe(0);
  });

  it('(a) CONGELA il valore dell item quando il read si ribalta', () => {
    const c = new MirrorCycle();
    armAt(c);
    feed(c, hold(1.0, 60));            // salita e plateau → il pic si costruisce
    const peak = c.contactQ || 0;
    expect(c.locked).toBe(false);      // finché non ridiscende, niente congelamento
    feed(c, hold(0, 30));              // il read si ribalta
    expect(c.locked).toBe(true);
    expect(c.contactQ).toBeGreaterThan(MIRROR_CONTACT_MIN);
    expect(peak).toBe(0);              // prima del lock il valore non era ancora fissato
  });

  it('il valore congelato NON cambia più (non cresce coi re-contatti)', () => {
    const c = new MirrorCycle();
    armAt(c);
    feed(c, hold(0.6, 60)); feed(c, hold(0, 20));
    expect(c.locked).toBe(true);
    const fixed = c.contactQ;
    feed(c, hold(3.0, 80));            // carica molto più forte DOPO
    expect(c.contactQ).toBe(fixed);    // resta il valore del contatto iniziale
  });

  it('il rumore sotto la soglia di contatto non arma nulla', () => {
    const c = new MirrorCycle();
    armAt(c);
    feed(c, hold(MIRROR_CONTACT_MIN / 3, 80));
    feed(c, hold(0, 40));
    expect(c.locked).toBe(false);
  });

  it('(b/c) OTTENUTO quando lo smaltito raggiunge il DOPPIO del valore', () => {
    const c = new MirrorCycle();
    armAt(c);
    feed(c, hold(1.0, 80));            // contatto
    feed(c, hold(0, 60));              // prima discesa → lock + smaltito
    expect(c.locked).toBe(true);
    expect(c.reached).toBe(false);     // una sola discesa non basta: serve il DOPPIO
    // si ricarica e si riscarica finché il cumulato raggiunge 2× il valore
    for (let i = 0; i < 6 && !c.reached; i++) { feed(c, hold(1.0, 60)); feed(c, hold(0, 60)); }
    expect(c.reached).toBe(true);
    expect(c.dischargeQ).toBeGreaterThanOrEqual(2 * c.contactQ);
  });

  it('progress() va da 0 a 1 e non sfora', () => {
    const c = new MirrorCycle();
    expect(c.progress()).toBe(0);            // non armato
    armAt(c);
    feed(c, hold(1.0, 80)); feed(c, hold(0, 60));
    expect(c.progress()).toBeGreaterThan(0);
    for (let i = 0; i < 8; i++) { feed(c, hold(1.0, 60)); feed(c, hold(0, 60)); }
    expect(c.progress()).toBeLessThanOrEqual(1);
  });

  it('arm() riparte pulito (item successivo)', () => {
    const c = new MirrorCycle();
    armAt(c); feed(c, hold(1.0, 80)); feed(c, hold(0, 60));
    armAt(c);
    expect(c.locked).toBe(false);
    expect(c.contactQ).toBe(0);
    expect(c.dischargeQ).toBe(0);
    expect(c.reached).toBe(false);
  });

  it('la soglia di ribaltamento è quella tarata', () => {
    expect(MIRROR_TURNOVER).toBeGreaterThan(0);
    expect(MIRROR_TURNOVER).toBeLessThan(1);
  });

  // ── DIFETTO OSSERVATO IN SEDUTA: « il contatto non avviene, poi avviene ma sempre a 10 » ──
  // Il picco cresceva senza limite di tempo finché la carica non scendeva del 15%: con una carica
  // che sale a lungo, catturava il massimo ASSOLUTO → valore saturo. La finestra di contatto chiude.
  it('CHIUDE la misura entro la finestra anche se la carica non ridiscende mai', () => {
    const c = new MirrorCycle();
    armAt(c);
    // carica che sale in continuazione per più della finestra di contatto: prima non si fermava mai
    const rampa = Array.from({ length: Math.ceil(MIRROR_CONTACT_WINDOW_S / 0.05) + 40 }, (_, i) => 0.3 + i * 0.02);
    feed(c, rampa);
    expect(c.locked).toBe(true);
  });

  it('il valore NON satura a 10 su una carica normale che sale a lungo', () => {
    const c = new MirrorCycle();
    armAt(c);
    // carica plausibile (fino a ~1.2 = zona alta) mantenuta ben oltre la finestra
    const lunga = Array.from({ length: 400 }, (_, i) => Math.min(1.2, 0.2 + i * 0.01));
    feed(c, lunga);
    expect(c.locked).toBe(true);
    expect(mirrorReading(c.contactQ)).toBeLessThan(10);   // prima finiva sempre a fondo scala
  });

  it('un contatto NETTO resta più rapido della finestra (il ribaltamento vince)', () => {
    const c = new MirrorCycle();
    armAt(c);
    feed(c, hold(1.0, 40));   // 2 s
    feed(c, hold(0, 20));     // ridiscende → deve bloccare SUBITO, non attendere la finestra
    expect(c.locked).toBe(true);
    expect(clock).toBeLessThan(MIRROR_CONTACT_WINDOW_S);
  });
});
