import { describe, it, expect } from 'vitest';
import {
  TONE_STEPS, chargeValue, oppositeOf, clampTone, toneFromTa, proposeFromTone,
  agreementOf, mockupProgress, reachedZero, toneOffset, ToneLocator, toneWitnesses, toneAsIs, matchToneAnswer,
  type ToneCharge, type ToneWitness,
} from '../toneScale';
import { TONE_SCALE_MAX, TONE_STEP, TONE_LOOKBACK_S } from '../tuning';

const C = (sign: -1 | 1, magnitude: 10 | 20 | 30 | 40): ToneCharge =>
  ({ sign, magnitude, origin: 'measured' });

describe('scala del tono — la scala stessa', () => {
  it('ha le quattro ampiezze di Ron, e solo quelle', () => {
    expect([...TONE_STEPS]).toEqual([10, 20, 30, 40]);
  });

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

describe('la PROPOSTA che l ago fa all auditor', () => {
  it('arrotonda alla divisione PIÙ VICINA, non a quella sotto', () => {
    // −38 è un −40 a cui manca poco, non un −30 abbondante
    expect(proposeFromTone(-38)).toEqual({ sign: -1, magnitude: 40, origin: 'measured' });
    expect(proposeFromTone(-32)).toEqual({ sign: -1, magnitude: 30, origin: 'measured' });
    expect(proposeFromTone(24)).toEqual({ sign: 1, magnitude: 20, origin: 'measured' });
    expect(proposeFromTone(26)).toEqual({ sign: 1, magnitude: 30, origin: 'measured' });
  });

  it('non propone nulla troppo vicino allo zero: lì non c è carica da mock-uppare', () => {
    expect(proposeFromTone(0)).toBeNull();
    expect(proposeFromTone(TONE_STEP / 2 - 0.01)).toBeNull();
    expect(proposeFromTone(-(TONE_STEP / 2 - 0.01))).toBeNull();
    expect(proposeFromTone(TONE_STEP / 2 + 0.01)).not.toBeNull();
  });

  it('oltre il fondo scala resta al fondo scala', () => {
    expect(proposeFromTone(-120)?.magnitude).toBe(40);
    expect(proposeFromTone(120)?.sign).toBe(1);
  });
});

describe('l OPPOSTO da mock-uppare (punto 4 di Ron)', () => {
  it('è la stessa ampiezza col segno rovesciato', () => {
    expect(oppositeOf(C(-1, 40))).toBe(40);
    expect(oppositeOf(C(1, 30))).toBe(-30);
    expect(chargeValue(C(-1, 40))).toBe(-40);
  });
});

describe('verifica: la misura diceva una cosa, il PC ne ha confermata un altra?', () => {
  it('il numero esatto va bene, ovviamente', () => {
    expect(agreementOf(-40, C(-1, 40))).toBe('confirmed');
    expect(agreementOf(20, C(1, 20))).toBe('confirmed');
  });

  it('NON pretende il numero esatto: l ago cade fra due divisioni', () => {
    // il caso dell utente: misura −23, il preclear trova −20 OPPURE −30. Vanno bene tutti e due.
    expect(agreementOf(-23, C(-1, 20))).toBe('confirmed');
    expect(agreementOf(-23, C(-1, 30))).toBe('confirmed');
  });

  it('ma oltre UNA divisione è una smentita vera', () => {
    expect(agreementOf(-23, C(-1, 40))).toBe('differs');   // scarto 17
    expect(agreementOf(-23, C(-1, 10))).toBe('differs');   // scarto 13
  });

  it('il cambio di SEGNO non passa — è la cosa che più conta sapere', () => {
    expect(agreementOf(-23, C(1, 20))).toBe('differs');
    expect(agreementOf(-40, C(1, 40))).toBe('differs');
  });

  it('la tolleranza è esattamente UNA divisione, estremo compreso', () => {
    expect(agreementOf(-30, C(-1, 20))).toBe('confirmed');       // scarto 10 esatto
    expect(agreementOf(-30.1, C(-1, 20))).toBe('differs');       // 10,1
  });

  it('senza misura non c è nulla da verificare, e lo dice', () => {
    expect(agreementOf(null, C(-1, 40))).toBeNull();
    expect(agreementOf(NaN, C(-1, 40))).toBeNull();
  });
});

describe('avanzamento del mock-up verso lo zero', () => {
  it('va da 0 a 1 mentre la resistenza se ne va', () => {
    expect(mockupProgress(-40, -40)).toBe(0);
    expect(mockupProgress(-40, -20)).toBeCloseTo(0.5, 10);
    expect(mockupProgress(-40, 0)).toBe(1);
  });

  it('funziona identico dall altro lato', () => {
    expect(mockupProgress(30, 15)).toBeCloseTo(0.5, 10);
  });

  it('un ALLONTANAMENTO non è un avanzamento negativo: è zero', () => {
    expect(mockupProgress(-20, -30)).toBe(0);
  });

  it('non supera mai 1, nemmeno se il tono scavalca lo zero', () => {
    expect(mockupProgress(-20, 25)).toBeLessThanOrEqual(1);
    expect(mockupProgress(-20, 25)).toBeGreaterThanOrEqual(0);
  });

  it('partire già a zero è già arrivati', () => {
    expect(mockupProgress(0, 0)).toBe(1);
  });
});

describe('lo zero raggiunto', () => {
  it('è una fascia, non un punto: in virgola mobile lo zero esatto non capita', () => {
    expect(reachedZero(0)).toBe(true);
    expect(reachedZero(TONE_STEP / 2 - 0.01)).toBe(true);
    expect(reachedZero(TONE_STEP / 2 + 0.01)).toBe(false);
    expect(reachedZero(-40)).toBe(false);
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
    expect(toneWitnesses(true, false)).toEqual(['zero', 'fn']);
  });

  it('col solo MUSE: l F/N e la firma energetica — la posizione no, non c è un tono misurato', () => {
    expect(toneWitnesses(false, true)).toEqual(['fn', 'signature']);
  });

  it('con tutti e due: tre testimoni indipendenti', () => {
    expect(toneWitnesses(true, true)).toEqual(['zero', 'fn', 'signature']);
  });

  it('senza strumenti nessuno parla: si è off-meter come Ron, decide l auditor', () => {
    expect(toneWitnesses(false, false)).toEqual([]);
  });
});

describe('AS-IS del TONE — la proposta', () => {
  const W3: ToneWitness[] = ['zero', 'fn', 'signature'];

  it('UNO SOLO non basta quando ce ne sono altri: un segnale si sbaglia', () => {
    expect(toneAsIs(W3, ['zero']).proposed).toBe(false);
    expect(toneAsIs(W3, ['fn']).proposed).toBe(false);
  });

  it('DUE concordi propongono', () => {
    expect(toneAsIs(W3, ['zero', 'fn']).proposed).toBe(true);
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
    const s = toneAsIs(['zero', 'fn'], ['zero', 'signature']);
    expect(s.fired).toEqual(['zero']);
    expect(s.proposed).toBe(false);
  });

  it('senza testimoni non si propone mai — non si inventa un as-is', () => {
    expect(toneAsIs([], []).proposed).toBe(false);
    expect(toneAsIs([], ['zero', 'fn']).proposed).toBe(false);
  });
});

describe('dall item assessato alla risposta del ciclo', () => {
  it('riconosce il SEGNO nelle cinque lingue, accenti compresi', () => {
    for (const s of ['negativo', 'négatif', 'negative', 'NEGATIV', 'Négatif ?'])
      expect(matchToneAnswer(s, 'sign')).toEqual({ kind: 'sign', sign: -1 });
    for (const s of ['positivo', 'positif', 'positive', 'POSITIV', 'Positif ?'])
      expect(matchToneAnswer(s, 'sign')).toEqual({ kind: 'sign', sign: 1 });
  });

  it('se ci sono tutte e due le parole non indovina', () => {
    expect(matchToneAnswer('positivo o negativo?', 'sign')).toBeNull();
  });

  it('riconosce le CIFRE dell ampiezza', () => {
    expect(matchToneAnswer('30', 'magnitude')).toEqual({ kind: 'magnitude', magnitude: 30 });
    expect(matchToneAnswer('sono 40 divisioni', 'magnitude')).toEqual({ kind: 'magnitude', magnitude: 40 });
  });

  it('riconosce le decine DETTE A PAROLE, nelle cinque lingue', () => {
    expect(matchToneAnswer('trenta', 'magnitude')).toEqual({ kind: 'magnitude', magnitude: 30 });
    expect(matchToneAnswer('quarante', 'magnitude')).toEqual({ kind: 'magnitude', magnitude: 40 });
    expect(matchToneAnswer('twenty', 'magnitude')).toEqual({ kind: 'magnitude', magnitude: 20 });
    expect(matchToneAnswer('diez', 'magnitude')).toEqual({ kind: 'magnitude', magnitude: 10 });
    expect(matchToneAnswer('trettio', 'magnitude')).toEqual({ kind: 'magnitude', magnitude: 30 });
  });

  it('PAROLA INTERA: « tio » dentro un altra parola non fa un 10', () => {
    // il caso per cui la sottostringa non si può usare sui numeri
    expect(matchToneAnswer('la lezione', 'magnitude')).toBeNull();
    expect(matchToneAnswer('attention', 'magnitude')).toBeNull();
    expect(matchToneAnswer('tio', 'magnitude')).toEqual({ kind: 'magnitude', magnitude: 10 });
  });

  it('una cifra dentro un numero più lungo non conta', () => {
    expect(matchToneAnswer('300', 'magnitude')).toBeNull();
    expect(matchToneAnswer('102', 'magnitude')).toBeNull();
  });

  it('ogni fase ascolta solo la SUA risposta', () => {
    expect(matchToneAnswer('negativo', 'magnitude')).toBeNull();
    expect(matchToneAnswer('30', 'sign')).toBeNull();
    expect(matchToneAnswer('negativo', 'locate')).toBeNull();
    expect(matchToneAnswer('30', 'mockup')).toBeNull();
  });

  it('quel che non è una risposta resta null — ed è il caso normale', () => {
    expect(matchToneAnswer('mia madre', 'sign')).toBeNull();
    expect(matchToneAnswer('', 'sign')).toBeNull();
    expect(matchToneAnswer('   ', 'magnitude')).toBeNull();
  });
});
