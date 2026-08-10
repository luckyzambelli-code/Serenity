import { describe, it, expect } from 'vitest';
import {
  emptyHistory, addTest, scaleFor, soloRatio, daysSince, testedToday,
  toneMargin, withMargin, TONE_MARGIN_NO_TEST, MAX_TESTS, pcKey,
} from '../canTest';

const GIORNO = 86_400_000;
const ORA = 1_700_000_000_000;   // un istante fisso: i test non guardano l'orologio

const h0 = emptyHistory('Claudio');
const con = (...t: Array<[number, number, 'two-cans' | 'solo-can']>) =>
  t.reduce((h, [t_, scale, config]) => addTest(h, { t: t_, scale, config }), h0);

describe('la prova entra nello storico', () => {
  it('una prova si aggiunge, e lo storico di partenza NON si tocca', () => {
    const h = addTest(h0, { t: ORA, scale: 0.004, config: 'two-cans' });
    expect(h.tests).toHaveLength(1);
    expect(h0.tests).toHaveLength(0);   // immutabile: chi tiene il vecchio lo ritrova intero
  });

  it('una prova ASSURDA non entra: meglio nessuna misura di una sbagliata', () => {
    expect(addTest(h0, { t: ORA, scale: 0, config: 'two-cans' }).tests).toHaveLength(0);
    expect(addTest(h0, { t: ORA, scale: -1, config: 'two-cans' }).tests).toHaveLength(0);
    expect(addTest(h0, { t: ORA, scale: NaN, config: 'two-cans' }).tests).toHaveLength(0);
  });

  it('restano le più RECENTI, e in ordine di tempo', () => {
    let h = h0;
    for (let i = 0; i < MAX_TESTS + 5; i++) {
      h = addTest(h, { t: ORA + i * GIORNO, scale: 0.001 * (i + 1), config: 'two-cans' });
    }
    expect(h.tests).toHaveLength(MAX_TESTS);
    expect(h.tests[0].t).toBeLessThan(h.tests[h.tests.length - 1].t);
    // le prime cinque sono uscite
    expect(h.tests[0].t).toBe(ORA + 5 * GIORNO);
  });
});

describe('la misura di riferimento — MEDIANA, non media', () => {
  it('con una prova sola, è quella', () => {
    expect(scaleFor(con([ORA, 0.004, 'two-cans']), 'two-cans')).toBe(0.004);
  });

  it('con due prove è la loro media, che è quel che ci si aspetta', () => {
    const h = con([ORA, 0.004, 'two-cans'], [ORA + GIORNO, 0.006, 'two-cans']);
    expect(scaleFor(h, 'two-cans')).toBeCloseTo(0.005, 10);
  });

  it('⚠️ una prova ANDATA MALE non sposta la misura — è il motivo della mediana', () => {
    // la mano scivola e la terza prova esce dieci volte più grande
    const h = con([ORA, 0.004, 'two-cans'], [ORA + GIORNO, 0.005, 'two-cans'],
                  [ORA + 2 * GIORNO, 0.05, 'two-cans']);
    expect(scaleFor(h, 'two-cans')).toBe(0.005);
    // con la media sarebbe stata 0,0197: quattro volte il vero
  });

  it('le configurazioni non si mescolano: due lattine e una sono due misure diverse', () => {
    const h = con([ORA, 0.004, 'two-cans'], [ORA, 0.009, 'solo-can']);
    expect(scaleFor(h, 'two-cans')).toBe(0.004);
    expect(scaleFor(h, 'solo-can')).toBe(0.009);
  });

  it('senza prove per quella configurazione, non si inventa nulla', () => {
    expect(scaleFor(h0, 'two-cans')).toBeNull();
    expect(scaleFor(con([ORA, 0.004, 'two-cans']), 'solo-can')).toBeNull();
  });
});

describe('lo scarto del SOLO — quando il preclear tiene UNA lattina', () => {
  it('è un RAPPORTO fra le due configurazioni, non una differenza', () => {
    const h = con([ORA, 0.004, 'two-cans'], [ORA, 0.008, 'solo-can']);
    expect(soloRatio(h)).toBeCloseTo(2, 10);
  });

  it('con UNA SOLA configurazione provata non c è scarto: null, non 1', () => {
    // « 1 » vorrebbe dire « misurato, e sono uguali »: è un'altra affermazione.
    expect(soloRatio(con([ORA, 0.004, 'two-cans']))).toBeNull();
    expect(soloRatio(con([ORA, 0.004, 'solo-can']))).toBeNull();
    expect(soloRatio(h0)).toBeNull();
  });
});

describe('quando è stata fatta', () => {
  it('conta i giorni dall ULTIMA prova', () => {
    const h = con([ORA - 5 * GIORNO, 0.004, 'two-cans'], [ORA - 2 * GIORNO, 0.005, 'two-cans']);
    expect(daysSince(h, ORA)).toBe(2);
  });

  it('e si può chiedere di UNA configurazione sola', () => {
    const h = con([ORA - 5 * GIORNO, 0.004, 'two-cans'], [ORA, 0.009, 'solo-can']);
    expect(daysSince(h, ORA, 'two-cans')).toBe(5);
    expect(daysSince(h, ORA, 'solo-can')).toBe(0);
  });

  it('senza prove non dice « zero giorni fa » ma « mai »', () => {
    // Sarebbe il difetto peggiore: « zero » vuol dire « oggi », e farebbe sparire il margine.
    expect(daysSince(h0, ORA)).toBeNull();
    expect(testedToday(h0, ORA)).toBe(false);
  });

  it('« fatta oggi » guarda le DUE LATTINE: sono loro a fare fede', () => {
    expect(testedToday(con([ORA, 0.004, 'two-cans']), ORA)).toBe(true);
    expect(testedToday(con([ORA, 0.009, 'solo-can']), ORA)).toBe(false);
  });
});

describe('il margine sulla scala del tono', () => {
  it('nessuna prova → una divisione in meno', () => {
    expect(toneMargin(h0, ORA)).toBe(TONE_MARGIN_NO_TEST);
    expect(TONE_MARGIN_NO_TEST).toBe(1);
  });

  it('prova fatta OGGI con le due lattine → nessun margine', () => {
    expect(toneMargin(con([ORA, 0.004, 'two-cans']), ORA)).toBe(0);
  });

  it('prova fatta IERI → il margine torna: la pelle di ieri non è quella di oggi', () => {
    expect(toneMargin(con([ORA - GIORNO, 0.004, 'two-cans']), ORA)).toBe(1);
  });

  it('non cresce coi giorni: un mese fa e ieri sono tutti e due « non oggi »', () => {
    expect(toneMargin(con([ORA - 30 * GIORNO, 0.004, 'two-cans']), ORA))
      .toBe(toneMargin(con([ORA - GIORNO, 0.004, 'two-cans']), ORA));
  });

  it('si toglie SEMPRE, anche sotto lo zero: dice « non so », non « sei più in basso »', () => {
    expect(withMargin(12, 1)).toBe(11);
    expect(withMargin(-12, 1)).toBe(-13);
    expect(withMargin(0, 1)).toBe(-1);
  });

  it('senza margine il tono non si tocca', () => {
    expect(withMargin(12, 0)).toBe(12);
  });
});

describe('la chiave del preclear', () => {
  it('accenti e maiuscole non fanno due persone diverse', () => {
    expect(pcKey('Marie')).toBe(pcKey('marie'));
    expect(pcKey('Renée')).toBe(pcKey('renee'));
    expect(pcKey('  Claudio  ')).toBe('claudio');
  });

  it('un nome vuoto dà una chiave vuota — e chi la usa non archivia', () => {
    // Senza questo, tutte le sedute senza nome finirebbero nello stesso mucchio.
    expect(pcKey('')).toBe('');
    expect(pcKey('   ')).toBe('');
  });
});
