import { describe, it, expect } from 'vitest';
import {
  TONE_LEVELS, TONE_LABELS, TONE_DECADES, levelAt, levelNameAt, exactLevelName,
  tonePosition, levelName, levelNameAtIn, hasLevelName,
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
  it('sono tredici, ordinate dall alto al basso', () => {
    expect(TONE_LABELS).toHaveLength(13);
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
  it('+40 in cima, −40 in fondo — i due estremi non si toccano', () => {
    expect(tonePosition(40)).toBe(1);
    expect(tonePosition(-40)).toBe(0);
  });

  it('lo ZERO sta a un terzo, non a metà: sotto ci sono 4 intervalli e sopra 8', () => {
    // La colonna non è più lineare. Sotto lo zero le etichette sono −10 −20 −30 −40, sopra
    // sono 2 3 4 6 9 20 30 40: due terzi della colonna stanno sopra lo zero, ed è giusto —
    // è là che il preclear deve salire.
    expect(tonePosition(0)).toBeCloseTo(1 / 3, 10);
  });

  it('la banda della vita quotidiana (0…9) prende QUASI METÀ colonna', () => {
    // Lineare valeva 9/80, cioè un nono scarso, e i venticinque livelli che ci stanno dentro
    // erano illeggibili. Ora attraversa cinque etichette (0 2 3 4 6 9) su dodici intervalli.
    const banda = tonePosition(9) - tonePosition(0);
    expect(banda).toBeCloseTo(5 / 12, 10);
    expect(banda).toBeGreaterThan(9 / 80);
  });

  it('ogni intervallo fra due etichette scritte vale UGUALE', () => {
    const passo = 1 / (TONE_LABELS.length - 1);
    for (let i = 1; i < TONE_LABELS.length; i++) {
      const d = tonePosition(TONE_LABELS[i - 1]) - tonePosition(TONE_LABELS[i]);
      expect({ da: TONE_LABELS[i], a: TONE_LABELS[i - 1], ok: Math.abs(d - passo) < 1e-9 })
        .toEqual({ da: TONE_LABELS[i], a: TONE_LABELS[i - 1], ok: true });
    }
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
    // ⚠️ Si prova il VERSO, non la proporzione: la colonna non è lineare (vedi tonePosition),
    // quindi metà resistenza NON dà metà colonna — e non deve darla.
    const tonoDa = (frazioneR: number) => 40 - 80 * frazioneR;
    expect(tonePosition(tonoDa(1.0))).toBe(0);     // resistenza totale → fondo
    expect(tonePosition(tonoDa(0.0))).toBe(1);     // zero → cima
    for (const [piuR, menoR] of [[1.0, 0.75], [0.75, 0.5], [0.5, 0.25], [0.25, 0.0]]) {
      expect({ piuR, ok: tonePosition(tonoDa(menoR)) > tonePosition(tonoDa(piuR)) })
        .toEqual({ piuR, ok: true });
    }
  });

  it('non esce mai da 0..1, nemmeno fuori scala', () => {
    for (const t of [-999, -41, 0, 41, 999]) {
      const p = tonePosition(t);
      expect({ t, ok: p >= 0 && p <= 1 }).toEqual({ t, ok: true });
    }
  });
});

describe('i nomi nelle cinque lingue', () => {
  it('OGNI livello ha la sua riga nel dizionario — nessuno resta indietro', () => {
    // È il difetto che ritorna col dizionario a cinque lingue: si traduce l'elenco e ne
    // avanza uno in fondo. Qui non può passare.
    //
    // ⚠️ Non si confrontano le STRINGHE: « Action » in francese e « Sacrifice » in spagnolo si
    // scrivono come in inglese, e un confronto le direbbe non tradotte. Si guarda la riga.
    for (const l of TONE_LEVELS) {
      expect({ n: l.name, ok: hasLevelName(l.name) }).toEqual({ n: l.name, ok: true });
    }
  });

  it('e ogni riga restituisce qualcosa in tutte e quattro le lingue', () => {
    for (const l of TONE_LEVELS) {
      for (const lang of ['it', 'fr', 'es', 'sv']) {
        expect({ n: l.name, lang, ok: levelName(l.name, lang).trim().length > 0 })
          .toEqual({ n: l.name, lang, ok: true });
      }
    }
  });

  it("il livello −30 è « Can't Hide », apostrofo compreso — e si traduce", () => {
    // La chiave era stata ricavata con uno script che si è fermato all'apostrofo: « Can ». Il
    // livello c'era, la traduzione no, e a schermo non si sarebbe visto nulla di strano.
    expect(levelNameAtIn(-30, 'it')).toBe('Non potersi nascondere');
    expect(levelNameAtIn(-30, 'en')).toBe("Can't Hide");
  });

  it('in inglese resta il nome di Ron, non una copia tradotta', () => {
    expect(levelName('Anger', 'en')).toBe('Anger');
    expect(levelName('Serenity of Beingness', 'en')).toBe('Serenity of Beingness');
  });

  it('una lingua che non conosciamo ricade sull inglese, non su una stringa vuota', () => {
    expect(levelName('Anger', 'de')).toBe('Anger');
    expect(levelName('Anger', '')).toBe('Anger');
  });

  it('un nome che non è nella tabella torna com era: non si inventa', () => {
    expect(levelName('Qualcosa', 'it')).toBe('Qualcosa');
  });

  it('e il livello raggiunto si traduce a sua volta', () => {
    expect(levelNameAtIn(1.5, 'it')).toBe('Collera');
    expect(levelNameAtIn(1.5, 'fr')).toBe('Colère');
    expect(levelNameAtIn(40, 'sv')).toBe('Varandets stillhet');
    expect(levelNameAtIn(1.5, 'en')).toBe('Anger');
  });

  it('i tre nomi che si ripetono si traducono UNA volta, e uguale nei due posti', () => {
    for (const n of ['Sympathy', 'Grief', 'Making Amends']) {
      const v = TONE_LEVELS.filter(l => l.name === n);
      expect({ n, uguali: levelName(v[0].name, 'it') === levelName(v[1].name, 'it') })
        .toEqual({ n, uguali: true });
    }
  });
});
