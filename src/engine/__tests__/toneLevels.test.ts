import { describe, it, expect } from 'vitest';
import {
  TONE_LEVELS, TONE_LABELS, TONE_DECADES, levelAt, levelNameAt, exactLevelName,
  tonePosition,
} from '../toneLevels';
import { TONE_SCALE_MAX } from '../tuning';

describe('la tabella', () => {
  it('va da +40 a −40 e non salta i due estremi', () => {
    expect(TONE_LEVELS[0]).toEqual({ tone: 40, name: 'Serenity of Beingness' });
    expect(TONE_LEVELS[TONE_LEVELS.length - 1]).toEqual({ tone: -40, name: 'Total Failure' });
  });

  it('è ordinata dal più alto al più basso, senza pari merito', () => {
    for (let i = 1; i < TONE_LEVELS.length; i++) {
      expect({ i, ok: TONE_LEVELS[i].tone < TONE_LEVELS[i - 1].tone }).toEqual({ i, ok: true });
    }
  });

  it('sta tutta dentro il fondo scala', () => {
    for (const l of TONE_LEVELS) {
      expect({ n: l.name, ok: Math.abs(l.tone) <= TONE_SCALE_MAX }).toEqual({ n: l.name, ok: true });
    }
  });

  it('i DOPPIONI di nome sono voluti: la banda alta e la sua eco un decimo più in basso', () => {
    const nomi = TONE_LEVELS.map(l => l.name);
    const doppi = nomi.filter((n, i) => nomi.indexOf(n) !== i);
    expect([...new Set(doppi)].sort()).toEqual(['Grief', 'Making Amends', 'Sympathy']);
    // …e ciascuno sta a un valore e al suo decimo.
    for (const n of ['Sympathy', 'Grief', 'Making Amends']) {
      const v = TONE_LEVELS.filter(l => l.name === n).map(l => l.tone);
      expect({ n, ok: Math.abs(v[0] / 10 - v[1]) < 1e-9 }).toEqual({ n, ok: true });
    }
  });
});

describe('gli otto segmenti', () => {
  it('nove tacche, otto intervalli, tutti multipli di dieci', () => {
    expect(TONE_DECADES).toHaveLength(9);
    expect(TONE_DECADES.every(d => d % 10 === 0)).toBe(true);
    expect(TONE_DECADES[0]).toBe(-40);
    expect(TONE_DECADES[8]).toBe(40);
  });
});

describe('le etichette rade della colonna', () => {
  it('sono diciotto, ordinate dall alto al basso', () => {
    expect(TONE_LABELS).toHaveLength(18);
    for (let i = 1; i < TONE_LABELS.length; i++) {
      expect(TONE_LABELS[i]).toBeLessThan(TONE_LABELS[i - 1]);
    }
  });

  it('ognuna ha un nome ESATTO nella tabella — nessuna etichetta orfana', () => {
    for (const t of TONE_LABELS) {
      expect({ t, nome: exactLevelName(t) !== undefined }).toEqual({ t, nome: true });
    }
  });
});

describe('in quale livello si è', () => {
  it('sul valore esatto, è quel livello', () => {
    expect(levelNameAt(1.5)).toBe('Anger');
    expect(levelNameAt(0.05)).toBe('Apathy');
    expect(levelNameAt(40)).toBe('Serenity of Beingness');
    expect(levelNameAt(0)).toBe('Body Death');
  });

  it('fra due livelli, si prende quello RAGGIUNTO — non il più vicino', () => {
    // 1,6 è più vicino a Pain (1,8) che ad Anger (1,5), ma a Pain non ci è arrivato.
    expect(levelNameAt(1.6)).toBe('Anger');
    expect(levelNameAt(1.79)).toBe('Anger');
    expect(levelNameAt(1.8)).toBe('Pain');
  });

  it('sotto zero la regola è la STESSA, e non è quella che verrebbe da dire', () => {
    // A −0,05 si è SOTTO Failure (−0,01) e SOPRA Pity (−0,1): il livello raggiunto è Pity.
    // Sembra contro-intuitivo perché in basso « raggiunto » vuol dire « disceso fin qui », ma
    // la regola non cambia — è sempre il primo livello che sta sotto il valore.
    expect(levelNameAt(-0.05)).toBe('Pity');
    expect(levelNameAt(-1.0)).toBe('Blame');
    expect(levelNameAt(-1.2)).toBe('Regret');
    expect(levelNameAt(-1.3)).toBe('Regret');
  });

  it('oltre il fondo scala non inventa nulla', () => {
    expect(levelNameAt(999)).toBe('Serenity of Beingness');
    expect(levelNameAt(-999)).toBe('Total Failure');
  });

  it('restituisce SEMPRE un livello, per qualunque valore della scala', () => {
    for (let t = -40; t <= 40; t += 0.13) {
      const l = levelAt(t);
      expect({ t: t.toFixed(2), ok: !!l && t + 1e-9 >= l.tone }).toEqual({ t: t.toFixed(2), ok: true });
    }
  });
});

describe('la posizione sulla colonna — è la corrispondenza con l ago', () => {
  it('+40 in cima, −40 in fondo, 0 esattamente a metà', () => {
    expect(tonePosition(40)).toBe(1);
    expect(tonePosition(-40)).toBe(0);
    expect(tonePosition(0)).toBe(0.5);
  });

  it('SALE col tono: è tutto il senso della colonna verticale', () => {
    let prec = -1;
    for (let t = -40; t <= 40; t += 2.5) {
      const p = tonePosition(t);
      expect({ t, ok: p > prec }).toEqual({ t, ok: true });
      prec = p;
    }
  });

  it('resistenza che SCENDE = tono che SALE = colonna che SALE', () => {
    // tono = 40 − 80·(R/Rtot). Meno resistenza → tono più alto → posizione più alta.
    const tonoDa = (frazioneR: number) => 40 - 80 * frazioneR;
    expect(tonePosition(tonoDa(1.0))).toBe(0);     // resistenza totale → fondo
    expect(tonePosition(tonoDa(0.5))).toBe(0.5);   // metà → centro
    expect(tonePosition(tonoDa(0.0))).toBe(1);     // zero → cima
  });

  it('non esce mai da 0..1, nemmeno fuori scala', () => {
    for (const t of [-999, -41, 0, 41, 999]) {
      const p = tonePosition(t);
      expect({ t, ok: p >= 0 && p <= 1 }).toEqual({ t, ok: true });
    }
  });
});
