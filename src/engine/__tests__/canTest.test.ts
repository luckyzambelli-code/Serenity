import { describe, it, expect } from 'vitest';
import {
  emptyHistory, addTest, scaleFor, soloRatio, daysSince, testedToday,
  toneMargin, withMargin, TONE_MARGIN_NO_TEST, MAX_TESTS, pcKey,
  taToTwoCans, TA_MARGIN_SOLO_NO_TEST,
  emptyCompare, soloTaOffset, compareReady, MAX_SOLO_OFFSET,
  offsetDrift, MIN_OFFSET_CHANGE,
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

  it('⚠️ MA SI FERMA AL FONDO SCALA: −40 non diventa −41', () => {
    // Segnalato: la scala di Ron finisce a −40, e il margine la faceva uscire.
    expect(withMargin(-40, 1)).toBe(-40);
    expect(withMargin(-39.5, 1)).toBe(-40);
    expect(withMargin(-40, 5)).toBe(-40);
  });

  it('e nemmeno dall altra parte, per quanto strano sarebbe un margine negativo', () => {
    expect(withMargin(40, -5)).toBe(40);
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

describe('il TA riportato alle DUE LATTINE — è lì il riferimento', () => {
  it('con due lattine il TA non si tocca: è già il riferimento', () => {
    const r = taToTwoCans(3.2, 'two-cans', 0);
    expect(r).toEqual({ ta: 3.2, basis: 'two-cans', margin: 0 });
  });

  it('con due lattine un offset del SOLO non c entra e non si applica', () => {
    // L'offset è della configurazione a una lattina: applicarlo qui falserebbe il riferimento.
    expect(taToTwoCans(3.2, 'two-cans', -0.8).ta).toBe(3.2);
  });

  it('una lattina PROVATA: si riporta a due con lo scarto misurato', () => {
    const r = taToTwoCans(4.0, 'solo-can', -0.6);
    expect(r.basis).toBe('solo-measured');
    expect(r.ta).toBeCloseTo(3.4, 10);
    expect(r.margin).toBe(0);   // misurato: niente margine, è un dato
  });

  it('una lattina NON provata: UNA DIVISIONE in meno — 4 diventa 3', () => {
    // È l'esempio dell'utente, alla lettera.
    const r = taToTwoCans(4, 'solo-can', 0);
    expect(r.ta).toBe(3);
    expect(r.basis).toBe('solo-margin');
    expect(r.margin).toBe(TA_MARGIN_SOLO_NO_TEST);
    expect(TA_MARGIN_SOLO_NO_TEST).toBe(1);
  });

  it('⚠️ una misura BATTE il margine: il dato viene prima della prudenza', () => {
    const misurato = taToTwoCans(4, 'solo-can', -0.3);
    const prudente = taToTwoCans(4, 'solo-can', 0);
    expect(misurato.margin).toBe(0);
    expect(prudente.margin).toBe(1);
    expect(misurato.ta).not.toBe(prudente.ta);
  });

  it('⚠️ il TA non esce dal fondo scala dello strumento: 0,5 − 1 non fa −0,5', () => {
    // Un TA negativo non è un TA basso: è un errore, e a schermo sarebbe incomprensibile.
    expect(taToTwoCans(0.5, 'solo-can', 0).ta).toBe(0);
    expect(taToTwoCans(6.4, 'solo-can', 3).ta).toBeLessThanOrEqual(6.5);
  });

  it('un offset non finito ricade sul margine invece di produrre NaN', () => {
    const r = taToTwoCans(4, 'solo-can', NaN);
    expect(r.ta).toBe(3);
    expect(r.basis).toBe('solo-margin');
  });

  it('la BASE si può sempre scrivere accanto al numero — mai indefinita', () => {
    for (const [ta, cfg, off] of [[3, 'two-cans', 0], [3, 'solo-can', 0], [3, 'solo-can', -0.5]] as const) {
      const r = taToTwoCans(ta, cfg, off);
      expect(['two-cans', 'solo-measured', 'solo-margin']).toContain(r.basis);
    }
  });
});

describe('la PROVA DOPPIA — due lattine, poi una, e la differenza', () => {
  it('con una lettura sola non c è niente da confrontare', () => {
    expect(compareReady(emptyCompare())).toBe(false);
    expect(compareReady({ taTwo: 3.1, taSolo: null })).toBe(false);
    expect(compareReady({ taTwo: null, taSolo: 4.0 })).toBe(false);
    expect(soloTaOffset({ taTwo: 3.1, taSolo: null })).toBeNull();
  });

  it('con tutte e due, lo scarto è la loro differenza', () => {
    expect(compareReady({ taTwo: 3.1, taSolo: 4.05 })).toBe(true);
    expect(soloTaOffset({ taTwo: 3.1, taSolo: 4.05 })).toBeCloseTo(-0.95, 10);
  });

  it('è NEGATIVO perché una lattina legge PIÙ resistenza: sommandolo si scende', () => {
    const off = soloTaOffset({ taTwo: 3.0, taSolo: 4.0 })!;
    expect(off).toBeLessThan(0);
    expect(4.0 + off).toBeCloseTo(3.0, 10);   // il TA a una lattina torna al riferimento
  });

  it('⚠️ uno scarto ASSURDO si rifiuta: è una lettura presa male, non una configurazione', () => {
    // La lattina lasciata, la mano asciutta, la prova fatta due giorni dopo.
    expect(soloTaOffset({ taTwo: 1.0, taSolo: 5.5 })).toBeNull();
    expect(MAX_SOLO_OFFSET).toBe(3);
    // al limite passa ancora
    expect(soloTaOffset({ taTwo: 1.0, taSolo: 4.0 })).toBeCloseTo(-3, 10);
  });

  it('e uno scarto NULLO è un dato: vuol dire misurato, e uguali', () => {
    expect(soloTaOffset({ taTwo: 3.2, taSolo: 3.2 })).toBe(0);
  });

  it('una lettura non finita non produce NaN', () => {
    expect(soloTaOffset({ taTwo: NaN, taSolo: 4 })).toBeNull();
  });

  it('lo scarto misurato, applicato, RIPORTA il TA al riferimento', () => {
    // È il ciclo intero, dalla prova doppia al numero a schermo.
    const off = soloTaOffset({ taTwo: 3.1, taSolo: 4.05 })!;
    const letto = taToTwoCans(4.05, 'solo-can', off);
    expect(letto.basis).toBe('solo-measured');
    expect(letto.ta).toBeCloseTo(3.1, 10);
    expect(letto.margin).toBe(0);
  });
});

describe('rifare la prova: lo scarto è cambiato?', () => {
  it('la PRIMA volta non c è deriva — non c era niente con cui confrontarsi', () => {
    const d = offsetDrift(null, -0.9);
    expect(d.prima).toBeNull();
    expect(d.deriva).toBeNull();
    expect(d.cambiato).toBe(false);
  });

  it('uno zero memorizzato vale « mai misurato », non « misurato e uguale a zero »', () => {
    expect(offsetDrift(0, -0.9).prima).toBeNull();
  });

  it('rifatta, dice di QUANTO è cambiato', () => {
    const d = offsetDrift(-0.95, -0.80);
    expect(d.deriva).toBeCloseTo(0.15, 10);
    expect(d.cambiato).toBe(true);
  });

  it('sotto un decimo di TA NON è un cambiamento: è il rumore della misura', () => {
    // Se no lo si segnalerebbe ogni volta, cioè non lo si segnalerebbe mai.
    expect(offsetDrift(-0.95, -0.92).cambiato).toBe(false);
    expect(offsetDrift(-0.95, -0.85).cambiato).toBe(true);   // esattamente 0,10 conta
    expect(MIN_OFFSET_CHANGE).toBe(0.1);
  });

  it('vale nei due versi', () => {
    expect(offsetDrift(-0.5, -0.9).cambiato).toBe(true);
    expect(offsetDrift(-0.9, -0.5).cambiato).toBe(true);
  });
});
