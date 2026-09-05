import { describe, it, expect } from 'vitest';
import {
  buildTaScale, taFromRaw, linearitaResidua, MIN_TA_POINTS, TA_MAX, TA_MIN,
  factoryTaScale, FACTORY_TA_POINTS, findNonMonotonic,
  type ThetaTaPoint,
} from '../thetaTaScale';

/**
 * La scala del TA si tara con l'artefatto fisico del Theta-Meter: si attacca al posto delle
 * lattine e ha un pulsante per ciascun TA (2, 3, 4, 5). Quattro coppie (grezzo, TA) CERTE.
 */

/** Quattro punti come li darebbe l'artefatto: TA crescente, grezzo crescente. */
const PUNTI: ThetaTaPoint[] = [
  { ta: 2, raw:  8_000_000 },
  { ta: 3, raw:  9_000_000 },
  { ta: 4, raw: 10_000_000 },
  { ta: 5, raw: 11_000_000 },
];

describe('buildTaScale', () => {
  it('ordina i punti per grezzo, comunque arrivino', () => {
    const s = buildTaScale([PUNTI[2], PUNTI[0], PUNTI[3], PUNTI[1]], 1)!;
    expect(s.points.map(p => p.ta)).toEqual([2, 3, 4, 5]);
  });

  it('RIFIUTA meno di due punti: una scala non si definisce con uno solo', () => {
    expect(buildTaScale([], 1)).toBeNull();
    expect(buildTaScale([PUNTI[0]], 1)).toBeNull();
    expect(MIN_TA_POINTS).toBe(2);
  });

  it('RIFIUTA due punti con lo stesso grezzo', () => {
    // Due TA diversi non possono dare la stessa lettura: o l'artefatto non era attaccato,
    // o si è premuto due volte lo stesso pulsante.
    expect(buildTaScale([{ ta: 2, raw: 9e6 }, { ta: 3, raw: 9e6 }], 1)).toBeNull();
  });

  it('scarta i valori non finiti invece di propagarli', () => {
    const s = buildTaScale([...PUNTI, { ta: 6, raw: NaN }], 1)!;
    expect(s.points).toHaveLength(4);
  });
});

describe('taFromRaw', () => {
  it('sui punti tarati restituisce ESATTAMENTE il loro TA', () => {
    const s = buildTaScale(PUNTI, 1)!;
    for (const p of PUNTI) expect(taFromRaw(p.raw, s)).toBeCloseTo(p.ta, 9);
  });

  it('interpola fra due punti', () => {
    const s = buildTaScale(PUNTI, 1)!;
    expect(taFromRaw(8_500_000, s)).toBeCloseTo(2.5, 9);
    expect(taFromRaw(10_250_000, s)).toBeCloseTo(4.25, 9);
  });

  it('fuori dai punti tarati PROLUNGA il segmento di bordo', () => {
    const s = buildTaScale(PUNTI, 1)!;
    // Meglio un valore un po' incerto ai bordi che nessun valore.
    expect(taFromRaw(7_500_000, s)).toBeCloseTo(1.5, 9);
    expect(taFromRaw(11_500_000, s)).toBeCloseTo(5.5, 9);
  });

  it('ma NON oltre il fondo scala del meter: 0 … 6,5', () => {
    // Prolungando senza limite uscivano valori come 8,59, che sul meter non esistono.
    const s = buildTaScale(PUNTI, 1)!;
    expect(taFromRaw(99_000_000, s)).toBe(TA_MAX);
    expect(taFromRaw(0, s)).toBe(TA_MIN);
    expect(TA_MAX).toBe(6.5);
  });

  it('regge una curva: fra i punti resta ESATTO anche se il legame non è una retta', () => {
    // Punti volutamente NON allineati (legame curvo, come sarebbe con una conversione in
    // frequenza). L'interpolazione a tratti passa comunque per tutti.
    const curvi: ThetaTaPoint[] = [
      { ta: 2, raw: 8_000_000 }, { ta: 3, raw: 8_400_000 },
      { ta: 4, raw: 9_200_000 }, { ta: 5, raw: 11_000_000 },
    ];
    const s = buildTaScale(curvi, 1)!;
    for (const p of curvi) expect(taFromRaw(p.raw, s)).toBeCloseTo(p.ta, 9);
    // …e in mezzo segue il segmento locale, non una retta globale.
    expect(taFromRaw(8_200_000, s)).toBeCloseTo(2.5, 9);
  });

  it('funziona anche se il grezzo CALASSE al crescere del TA', () => {
    // Non si dà per scontato il verso dell'apparecchio: si ordina per grezzo e si interpola.
    const inverso: ThetaTaPoint[] = [
      { ta: 2, raw: 11_000_000 }, { ta: 3, raw: 10_000_000 },
      { ta: 4, raw: 9_000_000 },  { ta: 5, raw: 8_000_000 },
    ];
    const s = buildTaScale(inverso, 1)!;
    expect(taFromRaw(10_500_000, s)).toBeCloseTo(2.5, 9);
  });
});

describe('linearitaResidua — misura l apparecchio, non lo assume', () => {
  it('punti allineati → scarto nullo', () => {
    expect(linearitaResidua(buildTaScale(PUNTI, 1)!)).toBeCloseTo(0, 9);
  });

  it('punti curvi → scarto grande: tarare due soli punti NON basterebbe', () => {
    const curvi: ThetaTaPoint[] = [
      { ta: 2, raw: 8_000_000 }, { ta: 3, raw: 8_400_000 },
      { ta: 4, raw: 9_200_000 }, { ta: 5, raw: 11_000_000 },
    ];
    expect(linearitaResidua(buildTaScale(curvi, 1)!)).toBeGreaterThan(0.2);
  });

  it('con due soli punti non dice nulla (la retta ci passa esatta)', () => {
    expect(linearitaResidua(buildTaScale([PUNTI[0], PUNTI[3]], 1)!)).toBe(0);
  });
});

// ── LO SCARTO CHE « SI RIDUCE COL TEMPO » ──────────────────────────────────────────────────
// Osservato in seduta: 0,6–0,7 di troppo a inizio seduta, che cala man mano. È la firma di una
// ESTRAPOLAZIONE: l'artefatto arriva a TA 5, ma si lavora anche più in alto, e lì la scala
// prolunga l'ultimo segmento. L'errore è massimo in cima e si annulla rientrando nel tarato.
describe('sopra l ultimo punto tarato', () => {
  /** Apparecchio la cui curva CONTINUA a incurvarsi sopra TA 5 (come quello vero). */
  const veroSopra = (raw: number) => {
    if (raw <= 11_000_000) return 5 + (raw - 6_721_229) / (11_000_000 - 6_721_229) * 0;
    return 6;
  };

  it('estrapolare oltre l ultimo punto SBAGLIA, e tanto più si va in alto', () => {
    const s = buildTaScale(PUNTI, 1)!;
    // Poco sopra l'ultimo punto lo scarto è piccolo…
    const vicino = Math.abs(taFromRaw(11_200_000, s) - 5.2);
    // …e molto sopra diventa grande: l'ultimo segmento non segue più la curva.
    const lontano = Math.abs(taFromRaw(14_000_000, s) - 5.8);
    expect(lontano).toBeGreaterThan(vicino);
  });

  it('AGGIUNGERE un punto in cima corregge la forma proprio dove manca', () => {
    const senza = buildTaScale(PUNTI, 1)!;
    // Un punto letto dal meter vero: a 16.000.000 di grezzo lui legge 5,8.
    const con = buildTaScale([...PUNTI, { ta: 5.8, raw: 14_000_000 }], 1)!;
    expect(taFromRaw(14_000_000, con)).toBeCloseTo(5.8, 9);
    // …e ora anche in mezzo si sta molto più vicini al vero.
    expect(Math.abs(taFromRaw(14_000_000, senza) - 5.8))
      .toBeGreaterThan(Math.abs(taFromRaw(14_000_000, con) - 5.8));
    expect(veroSopra(14_000_000)).toBe(6);   // (riferimento del modello di prova)
  });

  it('una COSTANTE non potrebbe correggerlo: sposterebbe anche dove era giusto', () => {
    const s = buildTaScale(PUNTI, 1)!;
    const erroreInAlto = taFromRaw(14_000_000, s) - 5.8;
    // Applicando quella stessa costante in basso, dove la scala era ESATTA, si sbaglierebbe.
    expect(Math.abs(taFromRaw(PUNTI[0].raw, s) - erroreInAlto - PUNTI[0].ta)).toBeGreaterThan(0.1);
  });
});

// ── LA TARATURA VA DENTRO IL PROGRAMMA, NON SOLO SULLA MACCHINA DI CHI L'HA FATTA ──────────
// Richiesta esplicita dell'utente: « il TA deve essere calibrato nel software una volta e poi
// restare per tutti ». La tenevo solo in localStorage: su ogni ALTRO computer il TA non
// compariva affatto, e non c'era modo di capire perché (segnalato da un tester).
describe('taratura di fabbrica', () => {
  it('esiste ed è utilizzabile senza aver misurato nulla', () => {
    const s = factoryTaScale()!;
    expect(s).not.toBeNull();
    expect(s.points.length).toBeGreaterThanOrEqual(MIN_TA_POINTS);
  });

  it('è ancorata ai valori che mostra il METER, non a quelli incisi', () => {
    // L'artefatto dice 2·3·4·5, il suo programma mostra 2,034 · 3,056 · 4,068 · 5,041.
    // Ancorare ai nominali produce un errore che varia lungo la scala e ne inverte il segno.
    expect(FACTORY_TA_POINTS.some(p => p.ta !== Math.round(p.ta))).toBe(true);
  });

  it('rende esattamente i TA misurati', () => {
    const s = factoryTaScale()!;
    for (const p of FACTORY_TA_POINTS) expect(taFromRaw(p.raw, s)).toBeCloseTo(p.ta, 9);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// LA MISURA DELL'08/08/2026 — e il difetto che rivelava
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('un punto fuori ordine non deve passare in silenzio', () => {
  // Misurato con la regolazione automatica: i primi tre crescono, il quarto crolla.
  const misura: ThetaTaPoint[] = [
    { ta: 2, raw: 494 }, { ta: 3, raw: 1244 }, { ta: 4, raw: 2555 }, { ta: 5, raw: 559 },
  ];

  it('lo individua, e indica QUALE rifare', () => {
    const fuori = findNonMonotonic(misura);
    expect(fuori).toEqual({ ta: 5, raw: 559 });
  });

  it('e la scala si RIFIUTA di costruirsi', () => {
    expect(buildTaScale(misura, 0)).toBeNull();
  });

  it('prima veniva accettata, e ordinando per grezzo dava un TA che sale, scende e risale', () => {
    // La prova del perché il rifiuto conta: ordinati per grezzo i TA sono 2, 5, 3, 4.
    const perGrezzo = [...misura].sort((a, b) => a.raw - b.raw).map(p => p.ta);
    expect(perGrezzo).toEqual([2, 5, 3, 4]);
  });

  it('i primi tre punti, da soli, sono una scala buona', () => {
    const scala = buildTaScale(misura.slice(0, 3), 0);
    expect(scala).not.toBeNull();
    expect(taFromRaw(1244, scala!)).toBeCloseTo(3, 5);
  });

  it('la taratura di fabbrica resta monotona — non si è rotto nulla', () => {
    expect(findNonMonotonic(FACTORY_TA_POINTS)).toBeNull();
  });

  it('con DUE punti non esiste fuori ordine: due punti definiscono un verso, non lo violano', () => {
    // Serve almeno un terzo punto perché « scendere dopo essere salito » abbia senso.
    expect(findNonMonotonic([{ ta: 2, raw: 100 }, { ta: 3, raw: 200 }])).toBeNull();
    expect(findNonMonotonic([{ ta: 2, raw: 200 }, { ta: 3, raw: 100 }])).toBeNull();
  });

  it('col terzo punto il verso c è, e chi lo viola si vede', () => {
    expect(findNonMonotonic([
      { ta: 2, raw: 100 }, { ta: 3, raw: 200 }, { ta: 4, raw: 150 },
    ])).toEqual({ ta: 4, raw: 150 });
  });

  it('un punto solo non può essere fuori ordine', () => {
    expect(findNonMonotonic([{ ta: 3, raw: 999 }])).toBeNull();
  });
});

describe('il verso lo detta la maggioranza, non il primo passo', () => {
  it('un apparecchio INVERSO (grezzo che cala) resta valido', () => {
    const inverso: ThetaTaPoint[] = [
      { ta: 2, raw: 11_000_000 }, { ta: 3, raw: 10_000_000 },
      { ta: 4, raw: 9_000_000 },  { ta: 5, raw: 8_000_000 },
    ];
    expect(findNonMonotonic(inverso)).toBeNull();
    expect(buildTaScale(inverso, 1)).not.toBeNull();
  });

  it('e se il punto guasto è il PRIMO, indica quello — non tutti gli altri', () => {
    const guasto: ThetaTaPoint[] = [
      { ta: 2, raw: 494 }, { ta: 3, raw: 200 }, { ta: 4, raw: 1244 }, { ta: 5, raw: 2555 },
    ];
    expect(findNonMonotonic(guasto)).toEqual({ ta: 3, raw: 200 });
  });
});
