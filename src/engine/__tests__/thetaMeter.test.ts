import { describe, it, expect } from 'vitest';
import {
  parseThetaReport, ThetaMeter, solveThetaCalibration, ohmFromRaw, linearityError,
  THETA_RAW_MAX,
} from '../thetaMeter';
import { THETA_HEADER_0, THETA_HEADER_1 } from '../tuning';

/**
 * Il formato è stato ricavato sperimentalmente dal meter dell'utente, non da una specifica:
 * questi test fissano ciò che è stato osservato, così se un domani il dispositivo cambia
 * firmware — o se ci siamo sbagliati — si rompe qui invece che in seduta.
 */

/** Costruisce un report come lo manda il dispositivo: intestazione, 24 bit BE, riempimento. */
const report = (valore: number, testa = [THETA_HEADER_0, THETA_HEADER_1]): number[] => [
  ...testa,
  (valore >> 16) & 0xff, (valore >> 8) & 0xff, valore & 0xff,
  ...new Array(11).fill(0),
];

describe('parseThetaReport', () => {
  it('legge i 24 bit in BIG-ENDIAN dai byte 2·3·4', () => {
    // Il caso reale visto in seduta: 01 02 f8 e1 c2 → 0xf8e1c2
    expect(parseThetaReport([0x01, 0x02, 0xf8, 0xe1, 0xc2, 0, 0, 0])).toBe(0xf8e1c2);
    expect(parseThetaReport(report(10_469_570))).toBe(10_469_570);
  });

  it('copre tutto il campo a 24 bit', () => {
    expect(parseThetaReport(report(0))).toBe(0);
    expect(parseThetaReport(report(THETA_RAW_MAX))).toBe(THETA_RAW_MAX);
  });

  // ── L'INTESTAZIONE E' L'UNICA VERIFICA DI SANITA' CHE ABBIAMO ────────────────────────────
  it('RIFIUTA un report con intestazione diversa', () => {
    expect(parseThetaReport(report(500_000, [0x01, 0x03]))).toBeNull();
    expect(parseThetaReport(report(500_000, [0x02, 0x02]))).toBeNull();
    expect(parseThetaReport(report(500_000, [0x00, 0x00]))).toBeNull();
  });

  it('RIFIUTA un report troppo corto invece di leggere spazzatura', () => {
    expect(parseThetaReport([0x01, 0x02, 0xff])).toBeNull();
    expect(parseThetaReport([])).toBeNull();
  });

  it('NON è little-endian — è la distinzione su cui si regge tutto', () => {
    // Se lo leggessimo al contrario, 01 02 f8 e1 c2 darebbe 0xc2e1f8. Sui dati veri quella
    // lettura sbatteva sull'intero intervallo, mentre in BE restava in una fascia stretta.
    expect(parseThetaReport(report(0xf8e1c2))).not.toBe(0xc2e1f8);
  });
});

describe('ThetaMeter', () => {
  it('il PRIMO valore entra tale e quale, senza salire da zero', () => {
    const m = new ThetaMeter();
    const r = m.push(report(9_000_000))!;
    // Partire da zero farebbe salire la lettura per qualche secondo, e sullo schermo
    // sembrerebbe una reazione che non c'è stata.
    expect(r.smooth).toBe(9_000_000);
    expect(r.raw).toBe(9_000_000);
  });

  it('liscia i valori successivi verso il nuovo livello', () => {
    const m = new ThetaMeter();
    m.push(report(9_000_000));
    const r = m.push(report(10_000_000))!;
    expect(r.raw).toBe(10_000_000);                 // il grezzo è sempre l'ultimo arrivato
    expect(r.smooth).toBeGreaterThan(9_000_000);    // il lisciato insegue…
    expect(r.smooth).toBeLessThan(10_000_000);      // …senza arrivarci subito
  });

  it('converge sul valore stabile', () => {
    const m = new ThetaMeter();
    m.push(report(9_000_000));
    for (let i = 0; i < 200; i++) m.push(report(10_000_000));
    expect(m.smooth).toBeCloseTo(10_000_000, -2);
  });

  it('conta i report validi e quelli scartati, separatamente', () => {
    const m = new ThetaMeter();
    m.push(report(9_000_000));
    m.push(report(9_000_000, [0xff, 0xff]));        // non è dei nostri
    m.push(report(9_100_000));
    expect(m.count).toBe(2);
    expect(m.rejected).toBe(1);
  });

  it('un report rifiutato NON sposta la lettura', () => {
    const m = new ThetaMeter();
    m.push(report(9_000_000));
    const prima = m.smooth;
    expect(m.push([0xff, 0xff, 0x00, 0x00, 0x00])).toBeNull();
    expect(m.smooth).toBe(prima);
  });

  it('reset riporta tutto a zero', () => {
    const m = new ThetaMeter();
    m.push(report(9_000_000));
    m.reset();
    expect(m.count).toBe(0);
    expect(m.raw).toBe(0);
    expect(m.smooth).toBe(0);
  });
});

describe('taratura grezzo → ohm', () => {
  it('ritrova la retta da due punti noti', () => {
    // Verso osservato: stringendo le lattine il numero SCENDE, e stringere abbassa la
    // resistenza → il grezzo cresce con gli ohm. La pendenza dev'essere POSITIVA.
    const cal = solveThetaCalibration(8_000_000, 100_000, 11_000_000, 1_000_000)!;
    expect(cal.slope).toBeGreaterThan(0);
    expect(ohmFromRaw(8_000_000, cal)).toBeCloseTo(100_000, 3);
    expect(ohmFromRaw(11_000_000, cal)).toBeCloseTo(1_000_000, 3);
  });

  it('RIFIUTA due punti sullo stesso grezzo (indeterminato)', () => {
    expect(solveThetaCalibration(9_000_000, 100_000, 9_000_000, 1_000_000)).toBeNull();
  });

  it('non restituisce mai ohm negativi', () => {
    const cal = solveThetaCalibration(8_000_000, 100_000, 11_000_000, 1_000_000)!;
    expect(ohmFromRaw(0, cal)).toBe(0);
  });

  it('il terzo punto misura se la retta regge davvero', () => {
    const cal = solveThetaCalibration(8_000_000, 100_000, 11_000_000, 1_000_000)!;
    // punto perfettamente sulla retta → scarto nullo
    expect(linearityError(cal, 9_500_000, 550_000)).toBeCloseTo(0, 6);
    // punto lontano dalla retta → scarto grande: l'ipotesi lineare NON regge
    expect(linearityError(cal, 9_500_000, 200_000)).toBeGreaterThan(0.5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// UN MODELLO CHE NON CONOSCIAMO
// Esistono più Theta-Meter e il formato non è lo stesso su tutti. Se l'apparecchio trasmette e
// non capiamo niente, va DETTO — e vanno conservati i byte veri: è con quelli che si scrive la
// decodifica di quel modello.
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('ThetaMeter — report non riconosciuti', () => {
  it('conserva i primi report sconosciuti, in esadecimale', () => {
    const m = new ThetaMeter();
    m.push([0x07, 0x11, 0x22, 0x33, 0x44, 0, 0, 0]);
    expect(m.count).toBe(0);
    expect(m.rejected).toBe(1);
    expect(m.samples[0]).toBe('07 11 22 33 44 00 00 00');
  });

  it('non conserva mille volte la stessa riga', () => {
    const m = new ThetaMeter();
    for (let i = 0; i < 500; i++) m.push([0x07, 0x11, 0x22, 0x33, 0x44, 0, 0, 0]);
    expect(m.rejected).toBe(500);
    expect(m.samples).toHaveLength(1);
  });

  it('ne tiene un pugno, non un flusso', () => {
    const m = new ThetaMeter();
    for (let i = 0; i < 50; i++) m.push([0x07, i, 0x22, 0x33, 0x44, 0, 0, 0]);
    expect(m.samples.length).toBeLessThanOrEqual(8);
  });

  it('un report VALIDO non lascia campioni: non c è niente da diagnosticare', () => {
    const m = new ThetaMeter();
    m.push([0x01, 0x02, 0x00, 0x10, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(m.count).toBe(1);
    expect(m.samples).toHaveLength(0);
  });
});
