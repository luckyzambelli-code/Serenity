import { describe, it, expect } from 'vitest';
import {
  TONE_TARGET, clampTone, toneFromTa,
  raiseProgress, reachedTop, toneOffset, ToneLocator, toneWitnesses, toneAsIs,
  type ToneWitness,
} from '../toneScale';
import { TONE_SCALE_MAX, TONE_STEP, TONE_LOOKBACK_S } from '../tuning';

describe('scala del tono — la scala stessa', () => {
  it('non esce mai dal fondo scala', () => {
    expect(clampTone(999)).toBe(TONE_SCALE_MAX);
    expect(clampTone(-999)).toBe(-TONE_SCALE_MAX);
    expect(clampTone(-12.5)).toBe(-12.5);
  });

  it('mappa il tono sull offset del quadrante, zero al centro', () => {
    expect(toneOffset(0)).toBe(0);
    expect(toneOffset(TONE_SCALE_MAX)).toBe(1);
    expect(toneOffset(-TONE_SCALE_MAX)).toBe(-1);
    expect(toneOffset(20)).toBeCloseTo(0.5, 10);
  });
});

describe('dal TONE ARM al tono (strada provvisoria)', () => {
  const MIN = 0, MAX = 6.5;

  it('mette lo ZERO al CENTRO dello strumento — risposta di Ron', () => {
    expect(toneFromTa((MIN + MAX) / 2, MIN, MAX)).toBeCloseTo(0, 10);
  });

  it('più resistenza = TA più alto = tono più NEGATIVO', () => {
    expect(toneFromTa(MAX, MIN, MAX)).toBe(-TONE_SCALE_MAX);
    expect(toneFromTa(MIN, MIN, MAX)).toBe(TONE_SCALE_MAX);
    expect(toneFromTa(5, MIN, MAX)).toBeLessThan(toneFromTa(4, MIN, MAX));
  });

  it('una scala degenere non esplode: dà zero', () => {
    expect(toneFromTa(3, 5, 5)).toBe(0);
    expect(toneFromTa(3, 6, 2)).toBe(0);
  });
});

describe('la META è sempre la stessa: tono quaranta', () => {
  it('non dipende da dove si è partiti — è il comando di Ron', () => {
    expect(TONE_TARGET).toBe(TONE_SCALE_MAX);
    expect(TONE_TARGET).toBe(40);
  });
});

describe('avanzamento verso il tono quaranta', () => {
  it('va da 0 a 1 mentre il preclear sale', () => {
    expect(raiseProgress(-40, -40)).toBe(0);
    expect(raiseProgress(-40, 0)).toBeCloseTo(0.5, 10);
    expect(raiseProgress(-40, 40)).toBe(1);
  });

  it('partendo da metà scala la strada da fare è la METÀ, e si vede', () => {
    expect(raiseProgress(0, 20)).toBeCloseTo(0.5, 10);
    expect(raiseProgress(0, 40)).toBe(1);
  });

  it('SCENDERE non è un avanzamento negativo: è zero', () => {
    expect(raiseProgress(-20, -30)).toBe(0);
  });

  it('non supera mai 1, nemmeno oltre il fondo scala', () => {
    expect(raiseProgress(-20, 999)).toBe(1);
    expect(raiseProgress(-20, 999)).toBeGreaterThanOrEqual(0);
  });

  it('partire già in cima è già arrivati', () => {
    expect(raiseProgress(40, 40)).toBe(1);
  });

  it('⚠️ NON è più la strada verso lo ZERO: a metà scala i due valori DIFFERISCONO', () => {
    // Il vecchio `mockupProgress(-40, -20)` dava 0,5 perché la meta era il centro. Salendo
    // verso il +40 lo stesso tratto è un quarto della strada — il ciclo è cambiato, e il
    // numero deve cambiare con lui.
    expect(raiseProgress(-40, -20)).toBeCloseTo(0.25, 10);
  });
});

describe('il tono quaranta raggiunto', () => {
  it('è una fascia, non un punto: in virgola mobile il valore esatto non capita', () => {
    expect(reachedTop(40)).toBe(true);
    expect(reachedTop(40 - TONE_STEP / 2 + 0.01)).toBe(true);
    expect(reachedTop(40 - TONE_STEP / 2 - 0.01)).toBe(false);
    expect(reachedTop(0)).toBe(false);
    expect(reachedTop(-40)).toBe(false);
  });
});

describe('LOCALIZZARE — quale istante conta davvero', () => {
  /** Riempie la finestra di un fondo quieto, poi restituisce il locatore e il tempo corrente. */
  const conFondo = (toneQuieto = -30, q = 1, secondi = 2) => {
    const loc = new ToneLocator();
    let t = 0;
    for (; t < secondi; t += 0.05) loc.track(toneQuieto, q, t);
    return { loc, t };
  };

  it('col MUSE, l istante è il PICCO DI CARICA — non il clic', () => {
    const { loc } = conFondo(-30, 1, 1.5);
    loc.track(-12, 9, 1.6);        // ← il pensiero: l EEG sale, il tono è −12
    for (let t = 1.65; t < 2.2; t += 0.05) loc.track(-30, 1, t);  // l ago torna dov era
    loc.track(-30, 1, 2.2);        // il clic arriva qui, su −30

    const r = loc.locate(2.2, true, -30);
    expect(r.anchor).toBe('muse');
    expect(r.tone).toBe(-12);      // il valore del PENSIERO, non quello del clic
    expect(r.ageS).toBeCloseTo(0.6, 1);
  });

  it('il picco del MUSE non conta se non SALE sopra l ambiente', () => {
    const { loc, t } = conFondo(-30, 5, 2);
    loc.track(-12, 5.2, t);        // un soffio sopra l ambiente: non è un pensiero
    const r = loc.locate(t, true, -30);
    expect(r.anchor).not.toBe('muse');
  });

  it('senza MUSE, si ancora al MOVIMENTO del METER e prende la PARTENZA', () => {
    const loc = new ToneLocator();
    let t = 0;
    for (; t < 1.5; t += 0.05) loc.track(-8, 0, t);   // fermo a −8
    loc.track(-34, 0, t); t += 0.05;                   // l ago parte: −8 → −34
    for (; t < 2.2; t += 0.05) loc.track(-34, 0, t);

    const r = loc.locate(t, false, -34);
    expect(r.anchor).toBe('meter');
    expect(r.tone).toBe(-8);       // la PARTENZA del movimento, non l arrivo
  });

  it('se non reagisce nulla, prende la MEDIANA — che l artefatto del clic non sposta', () => {
    const loc = new ToneLocator();
    let t = 0;
    for (; t < 2; t += 0.05) loc.track(-20, 0, t);    // piatto a −20
    loc.track(-20, 0, t);
    const r = loc.locate(t, false, -20);
    expect(r.anchor).toBe('settled');
    expect(r.tone).toBe(-20);
    expect(r.ageS).toBe(0);
  });

  it('la mediana regge lo sbalzo del clic; una media no', () => {
    const loc = new ToneLocator();
    let t = 0;
    for (; t < 2; t += 0.05) loc.track(-20, 0, t);
    // lo sbalzo del clic: pochi campioni lontanissimi, ma sotto la soglia di movimento
    loc.track(-20 - TONE_STEP / 8, 0, t); t += 0.05;
    loc.track(-20 - TONE_STEP / 8, 0, t);
    const r = loc.locate(t, false, -20);
    expect(r.anchor).toBe('settled');
    expect(r.tone).toBe(-20);      // la mediana non si è mossa
  });

  it('butta via i campioni più vecchi della finestra', () => {
    const loc = new ToneLocator();
    for (let t = 0; t < TONE_LOOKBACK_S * 3; t += 0.05) loc.track(-10, 0, t);
    expect(loc.samples).toBeLessThanOrEqual(Math.ceil(TONE_LOOKBACK_S / 0.05) + 1);
  });

  it('senza storico non inventa nulla: restituisce il valore corrente', () => {
    const loc = new ToneLocator();
    const r = loc.locate(5, true, -17);
    expect(r).toEqual({ tone: -17, anchor: 'settled', ageS: 0 });
  });

  it('azzerandolo dimentica tutto', () => {
    const { loc, t } = conFondo();
    expect(loc.samples).toBeGreaterThan(0);
    loc.reset();
    expect(loc.samples).toBe(0);
    expect(loc.locate(t, true, 5).tone).toBe(5);
  });
});

describe('AS-IS del TONE — chi può testimoniare', () => {
  it('col solo METER: la posizione a zero e la sua F/N', () => {
    expect(toneWitnesses(true, false)).toEqual(['top', 'fn']);
  });

  it('col solo MUSE: l F/N e la firma energetica — la posizione no, non c è un tono misurato', () => {
    expect(toneWitnesses(false, true)).toEqual(['fn', 'signature']);
  });

  it('con tutti e due: tre testimoni indipendenti', () => {
    expect(toneWitnesses(true, true)).toEqual(['top', 'fn', 'signature']);
  });

  it('senza strumenti nessuno parla: si è off-meter come Ron, decide l auditor', () => {
    expect(toneWitnesses(false, false)).toEqual([]);
  });
});

describe('AS-IS del TONE — la proposta', () => {
  const W3: ToneWitness[] = ['top', 'fn', 'signature'];

  it('UNO SOLO non basta quando ce ne sono altri: un segnale si sbaglia', () => {
    expect(toneAsIs(W3, ['top']).proposed).toBe(false);
    expect(toneAsIs(W3, ['fn']).proposed).toBe(false);
  });

  it('DUE concordi propongono', () => {
    expect(toneAsIs(W3, ['top', 'fn']).proposed).toBe(true);
    expect(toneAsIs(W3, ['fn', 'signature']).proposed).toBe(true);
  });

  it('tutti e tre, a maggior ragione', () => {
    const s = toneAsIs(W3, W3);
    expect(s.proposed).toBe(true);
    expect(s.singleWitness).toBe(false);
  });

  it('con un testimone SOLO disponibile si propone, ma lo si DICE', () => {
    const s = toneAsIs(['fn'], ['fn']);
    expect(s.proposed).toBe(true);
    expect(s.singleWitness).toBe(true);
  });

  it('un testimone che non poteva parlare non conta', () => {
    // il MUSE non c è: la firma non è disponibile, quindi non fa numero
    const s = toneAsIs(['top', 'fn'], ['top', 'signature']);
    expect(s.fired).toEqual(['top']);
    expect(s.proposed).toBe(false);
  });

  it('senza testimoni non si propone mai — non si inventa un as-is', () => {
    expect(toneAsIs([], []).proposed).toBe(false);
    expect(toneAsIs([], ['top', 'fn']).proposed).toBe(false);
  });
});
