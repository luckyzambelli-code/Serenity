import { describe, it, expect } from 'vitest';
import {
  TONE_STEPS, chargeValue, oppositeOf, clampTone, toneFromTa, proposeFromTone,
  agreementOf, mockupProgress, reachedZero, toneOffset, type ToneCharge,
} from '../toneScale';
import { TONE_SCALE_MAX, TONE_STEP } from '../tuning';

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

describe('verifica: la misura proponeva, il PC ha confermato?', () => {
  it('accordo pieno', () => {
    expect(agreementOf(C(-1, 40), C(-1, 40))).toBe('confirmed');
  });
  it('distingue quale delle due cose è cambiata', () => {
    expect(agreementOf(C(-1, 40), C(-1, 20))).toBe('magnitude_differs');
    expect(agreementOf(C(-1, 40), C(1, 40))).toBe('sign_differs');
    expect(agreementOf(C(-1, 40), C(1, 10))).toBe('both_differ');
  });
  it('senza misura non c è nulla da verificare, e lo dice', () => {
    expect(agreementOf(null, C(-1, 40))).toBeNull();
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
