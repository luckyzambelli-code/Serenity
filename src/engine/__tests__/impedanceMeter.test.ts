import { describe, it, expect } from 'vitest';
import {
  LockIn, CanMeter, snapToBin, windowSamples,
  solveTwoPointCalibration, resistanceFromRaw, fallbackCalibration,
  toneFromResistance, resistanceFromTone, toneDivisionIndex, isAtDeath,
  type Calibration,
} from '../impedanceMeter';
import { CAN_TONE_LOW_HZ, CAN_TONE_HIGH_HZ, TONE_SCALE_MAX } from '../tuning';

/**
 * La sonda delle « lattine ». I test simulano l'INTERA catena fisica — partitore di tensione,
 * due toni, guadagno ignoto — e verificano che si riesca a risalire alla resistenza di partenza.
 * Se questi passano, l'unica incognita che resta è il ferro.
 */

const FS = 48_000;
const N = windowSamples(FS);        // finestra di media (100 ms → 4800 campioni)

/** Genera un blocco di campioni di un coseno puro. */
const tone = (ampl: number, freqHz: number, n: number, phase = 0): number[] =>
  Array.from({ length: n }, (_, i) => ampl * Math.cos((2 * Math.PI * freqHz * i) / FS + phase));

/** Somma campione per campione (per sovrapporre più toni, o aggiungere disturbo). */
const mix = (...streams: number[][]): number[] =>
  streams[0].map((_, i) => streams.reduce((s, st) => s + st[i], 0));

/** Il PARTITORE: che ampiezza arriva all'ingresso con una persona di R ohm.
 *  m = k · R / (rRef + R) — è la fisica che il modulo deve invertire. */
const dividerAmplitude = (rOhm: number, cal: Calibration): number =>
  (cal.k * rOhm) / (cal.rRef + rOhm);

describe('snapToBin', () => {
  it('aggancia a un numero INTERO di cicli nella finestra', () => {
    const f = snapToBin(CAN_TONE_LOW_HZ, FS, N);
    const cicli = (f * N) / FS;
    expect(cicli).toBeCloseTo(Math.round(cicli), 9);
  });

  it('resta vicino alla frequenza chiesta', () => {
    expect(snapToBin(CAN_TONE_LOW_HZ, FS, N)).toBeCloseTo(CAN_TONE_LOW_HZ, 0);
    expect(snapToBin(CAN_TONE_HIGH_HZ, FS, N)).toBeCloseTo(CAN_TONE_HIGH_HZ, 0);
  });

  it('non scende mai sotto un ciclo per finestra', () => {
    expect(snapToBin(0.001, FS, N)).toBeGreaterThan(0);
  });
});

describe('LockIn', () => {
  it('recupera l ampiezza di un tono puro', () => {
    const li = new LockIn(CAN_TONE_LOW_HZ, FS, N);
    let out = null;
    for (const s of tone(0.42, li.freqHz, N)) out = li.push(s) ?? out;
    expect(out!.amplitude).toBeCloseTo(0.42, 6);
  });

  it('l ampiezza NON dipende dalla fase', () => {
    const li = new LockIn(CAN_TONE_LOW_HZ, FS, N);
    let out = null;
    for (const s of tone(0.42, li.freqHz, N, 1.1)) out = li.push(s) ?? out;
    expect(out!.amplitude).toBeCloseTo(0.42, 6);
  });

  it('restituisce null finché la finestra non è chiusa', () => {
    const li = new LockIn(CAN_TONE_LOW_HZ, FS, N);
    const parziale = tone(0.5, li.freqHz, N - 1).map(s => li.push(s));
    expect(parziale.every(r => r === null)).toBe(true);
  });

  // ── È QUI CHE STA IL VALORE DEL LOCK-IN ───────────────────────────────────────────────────
  it('IGNORA un tono ad ALTRA frequenza (i due canali non si contaminano)', () => {
    const basso = new LockIn(CAN_TONE_LOW_HZ, FS, N);
    const alto = new LockIn(CAN_TONE_HIGH_HZ, FS, N);
    let out = null;
    for (const s of tone(1.0, alto.freqHz, N)) out = basso.push(s) ?? out;
    expect(out!.amplitude).toBeLessThan(1e-9);   // il tono alto non entra nel canale basso
  });

  it('IGNORA il ronzio di rete a 50 Hz — senza filtrarlo', () => {
    const li = new LockIn(CAN_TONE_LOW_HZ, FS, N);
    let out = null;
    for (const s of tone(5.0, 50, N)) out = li.push(s) ?? out;
    expect(out!.amplitude).toBeLessThan(1e-9);   // disturbo 12× il segnale utile → sparisce
  });

  it('estrae il proprio tono da una MISCELA dei due più il ronzio', () => {
    const basso = new LockIn(CAN_TONE_LOW_HZ, FS, N);
    const alto = new LockIn(CAN_TONE_HIGH_HZ, FS, N);
    const segnale = mix(
      tone(0.30, basso.freqHz, N),
      tone(0.18, alto.freqHz, N),
      tone(2.00, 50, N),            // ronzio molto più forte del segnale
    );
    let l = null, h = null;
    for (const s of segnale) { l = basso.push(s) ?? l; h = alto.push(s) ?? h; }
    expect(l!.amplitude).toBeCloseTo(0.30, 6);
    expect(h!.amplitude).toBeCloseTo(0.18, 6);
  });
});

describe('calibrazione a due punti', () => {
  it('ritrova rRef e k da due resistenze note', () => {
    const vero: Calibration = { rRef: 98_700, k: 0.63 };   // rRef con la sua tolleranza
    const m1 = dividerAmplitude(100_000, vero);
    const m2 = dividerAmplitude(1_000_000, vero);

    const cal = solveTwoPointCalibration(m1, 100_000, m2, 1_000_000)!;
    expect(cal.rRef).toBeCloseTo(vero.rRef, 3);
    expect(cal.k).toBeCloseTo(vero.k, 9);
  });

  it('RIFIUTA punti degeneri invece di inventare ohm', () => {
    expect(solveTwoPointCalibration(0.5, 100_000, 0.5, 100_000)).toBeNull();  // stessa R
    expect(solveTwoPointCalibration(0, 100_000, 0.5, 1e6)).toBeNull();        // misura nulla
    expect(solveTwoPointCalibration(0.5, -1, 0.5, 1e6)).toBeNull();           // R assurda
  });

  it('la taratura di ripiego non pretende di essere buona', () => {
    const cal = fallbackCalibration();
    expect(cal.rRef).toBeGreaterThan(0);
    expect(cal.k).toBe(1);
  });
});

describe('resistanceFromRaw', () => {
  it('inverte il partitore', () => {
    const cal: Calibration = { rRef: 100_000, k: 0.8 };
    for (const r of [10_000, 100_000, 470_000, 2_000_000]) {
      expect(resistanceFromRaw(dividerAmplitude(r, cal), cal)).toBeCloseTo(r, 3);
    }
  });

  it('canale MUTO → null, non un numero falso', () => {
    expect(resistanceFromRaw(0, fallbackCalibration())).toBeNull();
    expect(resistanceFromRaw(1e-9, fallbackCalibration())).toBeNull();
  });

  it('misura ≥ k (saturazione o taratura sbagliata) → null', () => {
    const cal: Calibration = { rRef: 100_000, k: 0.5 };
    expect(resistanceFromRaw(0.5, cal)).toBeNull();
    expect(resistanceFromRaw(0.9, cal)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// LA PROVA CHE CONTA: dalla resistenza vera, attraverso tutta la catena, e ritorno
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('CanMeter — catena completa', () => {
  /** Simula una persona: resistenza diversa alle due frequenze, perché lo strato corneo
   *  si comporta da condensatore e alle alte lo cortocircuita. */
  const seduta = (rBassa: number, rAlta: number, calL: Calibration, calH: Calibration, blocchi = 1) => {
    const meter = new CanMeter(FS);
    meter.setCalibration(calL, calH);
    const { lowHz, highHz } = meter.frequencies;
    const n = N * blocchi;
    const segnale = mix(
      tone(dividerAmplitude(rBassa, calL), lowHz, n),
      tone(dividerAmplitude(rAlta, calH), highHz, n),
    );
    return meter.pushBlock(segnale);
  };

  const CAL_L: Calibration = { rRef: 100_000, k: 0.70 };
  const CAL_H: Calibration = { rRef: 100_000, k: 0.62 };   // guadagno diverso: la scheda non è piatta

  it('ritrova le DUE resistenze partendo dai soli campioni audio', () => {
    const [r] = seduta(320_000, 180_000, CAL_L, CAL_H);
    expect(r.rLowOhm).toBeCloseTo(320_000, 0);
    expect(r.rHighOhm).toBeCloseTo(180_000, 0);
  });

  it('la componente CUTANEA è la differenza fra i due toni', () => {
    const [r] = seduta(320_000, 180_000, CAL_L, CAL_H);
    expect(r.rSkinOhm).toBeCloseTo(140_000, 0);
  });

  it('la pelle non va mai NEGATIVA se il tono alto legge più del basso', () => {
    const [r] = seduta(150_000, 400_000, CAL_L, CAL_H);   // scenario invertito = rumore
    expect(r.rSkinOhm).toBe(0);
  });

  it('produce una lettura per finestra, non una per campione', () => {
    const letture = seduta(320_000, 180_000, CAL_L, CAL_H, 3);
    expect(letture).toHaveLength(3);
  });

  it('SENZA contatto (silenzio) non restituisce nulla', () => {
    const meter = new CanMeter(FS);
    meter.setCalibration(CAL_L, CAL_H);
    expect(meter.pushBlock(new Array(N).fill(0))).toHaveLength(0);
  });

  it('la lisciatura converge verso il valore vero', () => {
    const letture = seduta(320_000, 180_000, CAL_L, CAL_H, 40);
    expect(letture.at(-1)!.rSmoothOhm).toBeCloseTo(320_000, -1);
  });

  it('parte NON calibrato, e lo dichiara', () => {
    expect(new CanMeter(FS).calibrated).toBe(false);
  });

  it('espone le frequenze EFFETTIVE, non quelle chieste', () => {
    const { lowHz, highHz } = new CanMeter(FS).frequencies;
    expect((lowHz * N) / FS).toBeCloseTo(Math.round((lowHz * N) / FS), 9);
    expect((highHz * N) / FS).toBeCloseTo(Math.round((highHz * N) / FS), 9);
  });

  it('le due frequenze non sono in rapporto ARMONICO (la distorsione non passa)', () => {
    const { lowHz, highHz } = new CanMeter(FS).frequencies;
    const rapporto = highHz / lowHz;
    expect(Math.abs(rapporto - Math.round(rapporto))).toBeGreaterThan(0.1);
  });

  it('nessuna delle due cade sulle armoniche di rete (50 e 60 Hz)', () => {
    const { lowHz, highHz } = new CanMeter(FS).frequencies;
    for (const f of [lowHz, highHz]) {
      for (const rete of [50, 60]) {
        const n = f / rete;
        expect(Math.abs(n - Math.round(n))).toBeGreaterThan(0.05);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// SCALA DEL TONO DI RON
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('scala del tono (−40 .. +40)', () => {
  const R_TOT = 2_000_000;

  it('resistenza TOTALE → −40, resistenza ZERO → +40', () => {
    expect(toneFromResistance(R_TOT, R_TOT)).toBe(-TONE_SCALE_MAX);
    expect(toneFromResistance(0, R_TOT)).toBe(TONE_SCALE_MAX);
  });

  it('metà resistenza → zero (la Morte sta in mezzo)', () => {
    expect(toneFromResistance(R_TOT / 2, R_TOT)).toBeCloseTo(0, 9);
  });

  it('quando la resistenza SCENDE il tono SALE — come dice Ron', () => {
    expect(toneFromResistance(400_000, R_TOT)).toBeGreaterThan(toneFromResistance(900_000, R_TOT));
  });

  it('non sfora mai la scala', () => {
    expect(toneFromResistance(99e6, R_TOT)).toBe(-TONE_SCALE_MAX);
    expect(toneFromResistance(-5, R_TOT)).toBe(TONE_SCALE_MAX);
  });

  it('l inversa riporta alla resistenza di partenza', () => {
    for (const r of [0, 250_000, 1_000_000, 2_000_000]) {
      expect(resistanceFromTone(toneFromResistance(r, R_TOT), R_TOT)).toBeCloseTo(r, 6);
    }
  });

  it('OTTO divisioni da dieci, e la Morte allo zero fa la nona', () => {
    expect(toneDivisionIndex(-40)).toBe(0);
    expect(toneDivisionIndex(-35)).toBe(0);
    expect(toneDivisionIndex(-5)).toBe(3);
    expect(toneDivisionIndex(5)).toBe(4);
    expect(toneDivisionIndex(40)).toBe(7);
    expect(new Set([-40, -25, -15, -5, 5, 15, 25, 35].map(toneDivisionIndex)).size).toBe(8);
    expect(isAtDeath(0)).toBe(true);
    expect(isAtDeath(12)).toBe(false);
  });
});
