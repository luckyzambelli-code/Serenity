import { describe, it, expect } from 'vitest';
import { MirrorCycle, mirrorReading, mirrorOffset, mirrorValueFromRatio } from '../MirrorCycle';
import { MIRROR_DIAL_K, MIRROR_CONTACT_MIN, MIRROR_TURNOVER, MIRROR_CONTACT_WINDOW_S,
         MIRROR_LOOKBACK_S } from '../tuning';

/**
 * MIRROR — metodo del doppio (Ron), modello a/b/c:
 *   a) il valore dell'item è FISSATO al contatto (quando il read si ribalta) ;
 *   b) la cible è il DOPPIO di quel valore ;
 *   c) raggiunta la cible → OTTENUTO.
 */

/** Orologio simulato: un tick = 50 ms, come il flusso reale. */
let clock = 0;
/** Prepara l'AMBIENTE (riferimento del valore relativo) e aggancia. */
const armAt = (c: MirrorCycle, ambient = 0.1) => {
  clock = 0;
  for (let i = 0; i < 80; i++) { clock += 0.05; c.track(ambient, clock); }
  c.arm(clock);
};
/** Alimenta SOLO l'ambiente/lo storico (item non ancora dato) — come in vista MIRROR a riposo. */
const idle = (c: MirrorCycle, values: number[]) =>
  values.forEach(v => { clock += 0.05; c.track(v, clock); });
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
  it('RETROSPEZIONE: prende il picco dei secondi PRIMA dell item (il PC ci ha già pensato)', () => {
    // Il preclear pensa l'item PRIMA che l'auditor prema: la carica sale e ricomincia a scendere,
    // POI si arma. Senza retrospezione il picco vero sarebbe perso e il valore troppo basso.
    const c = new MirrorCycle();
    clock = 0;
    idle(c, hold(0.2, 60));            // ambiente calmo
    idle(c, hold(1.6, 40));            // il PC pensa l'item → forte salita (~2 s prima)
    idle(c, hold(0.5, 20));            // ricomincia a scendere
    c.arm(clock);                      // l'auditor preme SOLO ADESSO
    feed(c, hold(0.5, 10));
    expect(c.locked).toBe(true);       // la carica è già ridiscesa → si fissa subito
    expect(c.contactQ).toBeGreaterThan(1.0);   // il picco d'PRIMA è stato recuperato
    expect(c.peakAgeS).toBeGreaterThan(0.5);   // e si sa che veniva da prima
  });

  it('senza retrospezione il picco sarebbe perso (contro-prova)', () => {
    // Stessa scena ma il picco è FUORI dalla finestra → non deve essere recuperato.
    const c = new MirrorCycle();
    clock = 0;
    idle(c, hold(1.6, 40));                                  // picco molto vecchio
    idle(c, hold(0.2, Math.ceil(MIRROR_LOOKBACK_S / 0.05) + 20));  // poi calma, oltre la finestra
    c.arm(clock);
    feed(c, hold(0.2, 20));
    expect(c.contactQ).toBeLessThan(1.0);   // il vecchio picco NON è stato preso
  });

  it('la retrospezione non risale nel ciclo PRECEDENTE', () => {
    const c = new MirrorCycle();
    clock = 0;
    idle(c, hold(0.2, 60));
    c.arm(clock);
    feed(c, hold(2.0, 40));            // carica FORTE appartenente all item 1
    feed(c, hold(0.2, 20));
    c.disarm();                        // VALIDA → fine del ciclo 1
    idle(c, hold(0.2, 10));            // breve calma
    c.arm(clock);                      // item 2, subito dopo
    feed(c, hold(0.2, 20));
    expect(c.contactQ).toBeLessThan(1.0);   // non ha rubato la carica dell item 1
  });

  it('CHIUDE la misura entro la finestra anche se la carica non ridiscende mai', () => {
    const c = new MirrorCycle();
    armAt(c);
    // carica che sale in continuazione per più della finestra di contatto: prima non si fermava mai
    const rampa = Array.from({ length: Math.ceil(MIRROR_CONTACT_WINDOW_S / 0.05) + 40 }, (_, i) => 0.3 + i * 0.02);
    feed(c, rampa);
    expect(c.locked).toBe(true);
  });

  it('SINTOMO IN SEDUTA (« sempre 10 »): con ambiente ALTO il valore NON satura più', () => {
    // Prima la scala era assoluta (qL×5, saturazione a qL=2): con cariche reali che girano a 2+
    // OGNI item usciva 10. Ora il valore è RELATIVO all'ambiente della persona/macchina.
    const c = new MirrorCycle();
    armAt(c, 2.5);                     // ambiente già altissimo per la vecchia scala
    feed(c, hold(3.5, 60));            // l'item fa salire la carica del ~40%: vero contatto…
    feed(c, hold(2.5, 60));            // …ma modesto in proporzione; poi ridiscende
    expect(c.locked).toBe(true);
    expect(c.valueR).toBeGreaterThan(0);
    expect(c.valueR).toBeLessThan(4);  // salita modesta → valore basso, NON 10
  });

  it('un item che TRIPLICA l ambiente vale fondo scala', () => {
    const c = new MirrorCycle();
    armAt(c, 0.5);
    feed(c, hold(1.6, 80));            // ~3.2× l'ambiente
    feed(c, hold(0.5, 60));
    expect(c.locked).toBe(true);
    expect(c.valueR).toBeGreaterThanOrEqual(9);
  });

  it('mirrorValueFromRatio: la scala relativa è quella dichiarata', () => {
    expect(mirrorValueFromRatio(1.0, 1.0)).toBe(0);       // picco = ambiente → nessuna salita
    expect(mirrorValueFromRatio(2.0, 1.0)).toBe(5);       // doppio dell'ambiente → metà scala
    expect(mirrorValueFromRatio(3.0, 1.0)).toBe(10);      // triplo → fondo scala
    expect(mirrorValueFromRatio(9.0, 1.0)).toBe(10);      // oltre → resta 10
    expect(mirrorValueFromRatio(0.5, 1.0)).toBe(0);       // sotto l'ambiente → 0, mai negativo
  });

  it('un contatto NETTO resta più rapido della finestra (il ribaltamento vince)', () => {
    const c = new MirrorCycle();
    armAt(c);
    const armedAt = clock;    // il tempo si conta DALL AGGANCIO, non dall inizio del test
    feed(c, hold(1.0, 40));   // 2 s
    feed(c, hold(0, 20));     // ridiscende → deve bloccare SUBITO, non attendere la finestra
    expect(c.locked).toBe(true);
    expect(clock - armedAt).toBeLessThan(MIRROR_CONTACT_WINDOW_S);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// SENZA AGO — il metodo del doppio condotto a mano
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('il ciclo condotto a mano', () => {
  it('il valore dato dall auditor fissa la cifra e apre il doppio', () => {
    const c = new MirrorCycle();
    c.arm(0);
    c.setManualValue(4);
    expect(c.valueR).toBe(4);
    expect(c.locked).toBe(true);
    expect(c.reached).toBe(false);
    expect(c.progress()).toBe(0);
  });

  it('si limita a 0..10 anche se gli si passa altro', () => {
    const c = new MirrorCycle();
    c.arm(0); c.setManualValue(99);  expect(c.valueR).toBe(10);
    c.arm(0); c.setManualValue(-3);  expect(c.valueR).toBe(0);
  });

  it('la misura NON tocca più nulla: un tick a zero non cancella il valore', () => {
    const c = new MirrorCycle();
    c.arm(0);
    c.setManualValue(6);
    for (let t = 1; t < 20; t++) c.update(0, t);
    expect(c.valueR).toBe(6);
    expect(c.locked).toBe(true);
  });

  it('dichiarando il doppio, il ciclo è raggiunto — e i tick non lo disfano', () => {
    const c = new MirrorCycle();
    c.arm(0); c.setManualValue(5);
    c.declareReached();
    expect(c.reached).toBe(true);
    expect(c.progress()).toBe(1);
    for (let t = 1; t < 20; t++) c.update(0, t);
    expect(c.reached).toBe(true);   // senza il flag `manual`, update() lo rimetterebbe a false
  });

  it('non si può dichiarare il doppio senza aver dato il valore', () => {
    const c = new MirrorCycle();
    c.arm(0);
    c.declareReached();
    expect(c.reached).toBe(false);
  });

  it('RIARMANDO si torna in automatico — se no un ciclo a mano zittiva l ago per sempre', () => {
    const c = new MirrorCycle();
    c.arm(0); c.setManualValue(4);
    expect(c.manual).toBe(true);
    c.arm(10);
    expect(c.manual).toBe(false);
    expect(c.valueR).toBe(0);
    expect(c.locked).toBe(false);
  });

  it('e reset() lo azzera comunque', () => {
    const c = new MirrorCycle();
    c.arm(0); c.setManualValue(7);
    c.reset();
    expect(c.manual).toBe(false);
  });
});
