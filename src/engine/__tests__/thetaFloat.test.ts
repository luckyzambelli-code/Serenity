import { describe, it, expect } from 'vitest';
import { ThetaFloatDetector } from '../thetaFloat';
import { THETA_FN_MIN_SWEEP, THETA_FN_WINDOW_S, THETA_FN_MIN_SWEEPS,
         THETA_FN_HALF_MAX_S } from '../tuning';

/** L'ago si alimenta a 60 letture/s come il vero. */
const DT = 1 / 60;

/** Spazza avanti e indietro `n` mezze spazzate di ampiezza `amp` e mezzo periodo `half` s,
 *  attorno a `centro`, muovendosi in modo CONTINUO (una resistenza vera non salta). */
function spazza(
  d: ThetaFloatDetector,
  { n, amp, half, centro = 0, sec = 0, drift = 0, motion = false }:
  { n: number; amp: number; half: number; centro?: number; sec?: number; drift?: number; motion?: boolean },
) {
  let t = sec;
  let stato = d.push(centro - amp / 2, t, motion);
  let da = centro - amp / 2;
  for (let i = 0; i < n; i++) {
    const c = centro + drift * (i + 1);
    const a = i % 2 === 0 ? c + amp / 2 : c - amp / 2;
    const passi = Math.max(1, Math.round(half / DT));
    for (let k = 1; k <= passi; k++) {
      t += DT;
      stato = d.push(da + (a - da) * (k / passi), t, motion);
    }
    da = a;
  }
  return { stato, t };
}

describe('ThetaFloatDetector — un F/N è una FORMA, non un\'ampiezza', () => {
  it('riconosce uno spazzare ritmico e ampio', () => {
    const d = new ThetaFloatDetector();
    const { stato } = spazza(d, { n: 5, amp: 0.5, half: 1 });
    expect(stato.fn).toBe(true);
    expect(stato.widthAvg).toBeGreaterThan(THETA_FN_MIN_SWEEP);
    // Periodo intero = due mezze spazzate da 1 s.
    expect(stato.periodSec).toBeGreaterThan(1.5);
    expect(stato.periodSec).toBeLessThan(2.5);
  });

  it('NON dichiara F/N su una sola caduta con rientro', () => {
    const d = new ThetaFloatDetector();
    // Giù e su: due mezze spazzate, non tre.
    const { stato } = spazza(d, { n: 2, amp: 0.6, half: 1 });
    expect(stato.fn).toBe(false);
  });

  it('NON dichiara F/N se lo spazzare è troppo stretto', () => {
    // ⚠️ Era 0,10, quando il minimo valeva 0,22. Sul video vero il FLOATING NEEDLE si smorza
    // fino a mezze spazzate di 0,096 PRIMA di spegnersi, e con 0,22 spariva per intero: la
    // soglia è ora 0,08. Un movimento di 0,04 resta rumore.
    const d = new ThetaFloatDetector();
    const { stato } = spazza(d, { n: 6, amp: 0.04, half: 1 });
    expect(stato.fn).toBe(false);
  });

  it('NON dichiara F/N su un corpo che si agita', () => {
    // ⚠️ Questo test chiedeva prima che ampiezze 0,3 / 0,9 / 0,25 / 0,8 fossero respinte, cioè
    // un rapporto di 3,6. La taratura sul video lo ha smentito: un F/N VERO si smorza mentre
    // finisce, e arriva a 6,6 (0,63 poi 0,096 sul FLOATING NEEDLE). Pretendere 2,6 era chiedere
    // una regolarità che l'ago vero non ha — ed è una delle ragioni per cui in 14 sedute il
    // rilevatore aveva prodotto 2 F/N contro i 95 del MUSE.
    //
    // A separare l'agitazione ora sono le altre due cose, ed è giusto che siano quelle: si
    // agita in FRETTA (mezze spazzate sotto 0,25 s) e il centro SCIVOLA. Non l'irregolarità
    // delle ampiezze, che l'F/N condivide.
    const d = new ThetaFloatDetector();
    let t = 0;
    d.push(0, 0);
    for (const [amp, half] of [[0.3, 0.15], [0.9, 0.1], [0.25, 0.2], [0.8, 0.12], [0.35, 0.18]]) {
      const r = spazza(d, { n: 1, amp, half, sec: t, drift: 0.15 });
      t = r.t;
    }
    const stato = d.push(0, t + DT);
    expect(stato.fn).toBe(false);
  });

  it('NON dichiara F/N se il centro scivola (deriva, non galleggiamento)', () => {
    const d = new ThetaFloatDetector();
    const { stato } = spazza(d, { n: 6, amp: 0.4, half: 0.8, drift: 0.18 });
    expect(stato.fn).toBe(false);
  });

  it('NON dichiara F/N se il ritmo è irregolare', () => {
    const d = new ThetaFloatDetector();
    let t = 0;
    d.push(0, 0);
    for (const half of [0.3, 1.6, 0.35, 2.2, 0.3]) {
      const r = spazza(d, { n: 1, amp: 0.45, half, sec: t });
      t = r.t;
    }
    const stato = d.push(0, t + DT);
    expect(stato.fn).toBe(false);
  });

  it('data l\'F/N a quando è COMINCIATO lo spazzare, non a quando lo si riconosce', () => {
    const d = new ThetaFloatDetector();
    const { stato, t } = spazza(d, { n: 4, amp: 0.5, half: 1, sec: 10 });
    expect(stato.fn).toBe(true);
    expect(stato.sinceSec).not.toBeNull();
    // Riconosciuto dopo la terza spazzata (≈ t 13), ma datato all'inizio della prima (≈ 10).
    expect(stato.sinceSec as number).toBeLessThan(t - 1.5);
    expect(stato.sinceSec as number).toBeGreaterThanOrEqual(9.9);
  });

  it('l\'F/N SCADE quando l\'ago si ferma', () => {
    const d = new ThetaFloatDetector();
    let { stato, t } = spazza(d, { n: 5, amp: 0.5, half: 1 });
    expect(stato.fn).toBe(true);
    // Ago immobile per sei secondi: le spazzate escono dalla finestra.
    for (let k = 0; k < 6 * 60; k++) { t += DT; stato = d.push(0, t); }
    expect(stato.fn).toBe(false);
    expect(stato.sinceSec).toBeNull();
  });

  it('il movimento del corpo si RIPORTA ma non vieta l\'F/N', () => {
    // Un F/N ampio scatena il rilevatore di agitazione (spazzata > 0,5 in 2 s): vietarlo lì
    // renderebbe invisibili gli F/N più larghi, cioè i più inequivocabili.
    const d = new ThetaFloatDetector();
    const { stato } = spazza(d, { n: 5, amp: 0.7, half: 0.9, motion: true });
    expect(stato.fn).toBe(true);
    expect(stato.motion).toBe(true);
  });

  it('reset() dimentica tutto', () => {
    const d = new ThetaFloatDetector();
    const { stato, t } = spazza(d, { n: 5, amp: 0.5, half: 1 });
    expect(stato.fn).toBe(true);
    d.reset();
    expect(d.push(0, t + DT).fn).toBe(false);
  });

  it('il rumore fine non produce F/N (isteresi sulle svolte)', () => {
    const d = new ThetaFloatDetector();
    let stato = d.push(0, 0);
    for (let k = 1; k < 600; k++) {
      // ±0,02: sotto l'isteresi delle svolte, nessuna inversione contata
      stato = d.push((k % 2 === 0 ? 0.02 : -0.02), k * DT);
    }
    expect(stato.fn).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// TARATO SUL VIDEO VERO — « Floating Needle Types »
//
// Quattro tipi ripresi dal quadrante di un e-meter: FLOATING NEEDLE, PERSISTENT, INSTANT,
// FLOATING TONE ARM. (Il quinto, « that springs », escluso dall'utente.) La lancetta è stata
// inseguita immagine per immagine e convertita in unità di quadrante.
//
// PRIMA della taratura il rilevatore ne vedeva **ZERO su quattro** — e in 14 sedute vere aveva
// prodotto 2 F/N contro i 95 del MUSE. Non era severo: era cieco, e per tre difetti di
// STRUTTURA, non di soglia:
//   1. la finestra durava 4 s e non poteva contenere tre mezze spazzate lente (il TONE ARM ne
//      ha da 4–5 s): un F/N lento era invisibile per costruzione;
//   2. i sussulti dell'ago contro il bordo (0,05) venivano contati come mezze spazzate e poi
//      facevano fallire proprio il minimo di ampiezza;
//   3. si pretendeva che TUTTA la finestra fosse regolare, compreso il movimento con cui l'ago
//      ARRIVA al float, che non è il float.
//
// Questi test tengono i quattro casi in forma sintetica: se una manopola si muove e uno di
// questi cade, si è rotto qualcosa che sul video vero funzionava.
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * DUE TRACCE VERE, prese dal video immagine per immagine e convertite in unità di quadrante
 * (l'ago percorre ~100° = tutto il quadrante = 2,0 → 1° = 0,02). Campionate a ~8 Hz.
 *
 * Sono la misura, non una mia ricostruzione: rifacendo a mano il movimento con « ampiezza e
 * durata » il centro scivolava per costruzione, e il test avrebbe collaudato l'imitazione.
 * `[secondi dall'inizio del tratto, deviazione]`.
 */
const TRACCIA_NORMALE: [number, number][] = [
  [0.0,-0.17], [0.16,-0.155], [0.33,-0.151], [0.49,-0.155], [0.65,-0.147], [0.81,-0.127],
  [0.97,-0.096], [1.13,-0.054], [1.29,0.034], [2.04,0.723], [2.2,0.79], [2.36,0.839],
  [2.52,0.867], [2.68,0.863], [2.84,0.839], [3.0,0.806], [3.17,0.764], [3.33,0.72],
  [3.49,0.663], [3.65,0.599], [3.81,0.542], [3.97,0.494], [4.14,0.452], [4.3,0.405],
  [4.46,0.348], [4.62,0.308], [4.78,0.282], [4.94,0.259], [5.1,0.232], [5.27,0.202],
  [5.43,0.17], [5.59,0.147], [5.75,0.133], [5.91,0.127], [6.07,0.127], [6.23,0.131],
  [6.4,0.147], [6.56,0.172], [6.72,0.198], [6.88,0.215], [7.04,0.217], [7.2,0.205],
  [7.37,0.19], [7.53,0.178], [7.69,0.163], [7.85,0.145], [8.01,0.123], [8.17,0.104],
  [8.33,0.084], [8.49,0.068], [8.66,0.046], [8.82,0.02], [8.98,0.0], [9.14,-0.012],
  [9.3,-0.02], [9.46,-0.028], [9.62,-0.036], [9.79,-0.048], [9.95,-0.058], [10.11,-0.062],
  [10.27,-0.056], [10.43,-0.032], [10.59,0.004], [10.76,0.06], [10.92,0.151], [11.08,0.27],
  [11.24,0.391], [11.4,0.509], [11.56,0.566], [11.72,0.595], [11.89,0.604], [12.05,0.598],
  [12.21,0.577], [12.37,0.541], [12.53,0.496], [12.69,0.44], [12.85,0.397], [13.02,0.355],
  [13.18,0.315], [13.34,0.276], [13.5,0.232], [13.66,0.192], [13.82,0.157], [13.98,0.127],
  [14.15,0.096], [14.31,0.072], [14.47,0.05], [14.63,0.032], [14.79,0.016], [14.95,0.004],
  [15.11,-0.008], [15.28,-0.02], [15.44,-0.028], [15.6,-0.028], [15.76,-0.016], [15.92,0.0],
  [16.08,0.016], [16.25,0.034], [16.41,0.052], [16.57,0.068], [16.73,0.072], [16.89,0.064],
  [17.05,0.048], [17.21,0.032], [17.38,0.012], [17.54,-0.008], [17.7,-0.024], [17.86,-0.036],
  [18.02,-0.052], [18.18,-0.084], [18.34,-0.104],
];
const TRACCIA_TONE_ARM: [number, number][] = [
  [0.55,0.982], [1.04,0.255], [1.17,0.244], [1.3,0.238], [1.43,0.186], [1.56,0.109],
  [1.72,-0.01], [1.84,-0.084], [1.97,-0.119], [2.1,-0.163], [2.36,-0.354], [2.49,-0.433],
  [2.62,-0.474], [2.75,-0.501], [2.88,-0.561], [3.01,-0.639], [3.17,-0.746], [3.3,-0.81],
  [3.43,-0.852], [3.56,-0.885], [3.69,-0.922], [3.81,-0.966], [3.94,-0.987], [4.07,-0.988],
  [4.2,-0.972], [4.33,-0.96], [4.46,-0.959], [4.59,-0.958], [5.11,-0.341], [5.24,-0.278],
  [5.36,-0.225], [5.49,-0.188], [5.62,-0.184], [5.75,-0.223], [5.88,-0.238], [6.01,-0.194],
  [6.14,-0.131], [6.27,-0.066], [6.4,0.014], [6.59,0.155], [6.72,0.232], [6.85,0.274],
  [6.98,0.308], [7.37,0.666], [7.5,0.689], [7.63,0.715], [7.88,0.885], [8.01,0.966],
  [8.14,0.998], [8.43,1.002], [8.56,0.988], [8.69,0.984], [8.82,0.985], [8.95,0.984],
  [9.08,0.979], [9.21,0.968], [9.34,0.961], [9.47,0.958], [9.6,0.92], [10.66,0.036],
  [10.79,-0.016], [10.92,-0.028], [11.05,-0.048], [11.18,-0.08], [11.31,-0.107], [11.44,-0.123],
  [11.56,-0.135], [11.69,-0.198], [11.82,-0.282], [12.08,-0.471], [12.21,-0.528], [12.34,-0.59],
  [12.47,-0.663], [12.6,-0.72], [12.73,-0.791], [12.86,-0.859], [12.99,-0.883], [13.11,-0.894],
  [13.25,-0.896], [13.37,-0.881], [13.5,-0.868], [13.63,-0.857], [13.76,-0.847], [13.89,-0.846],
  [14.02,-0.852], [14.15,-0.863], [14.28,-0.874], [14.41,-0.892], [14.54,-0.896], [14.67,-0.861],
  [15.08,-0.534], [15.21,-0.438], [15.34,-0.354], [15.47,-0.291], [15.6,-0.259], [15.73,-0.234],
  [15.86,-0.209], [15.99,-0.19], [16.12,-0.172], [16.25,-0.163], [16.38,-0.151], [16.51,-0.139],
  [16.64,-0.137], [16.76,-0.115], [16.89,-0.064], [17.02,-0.004], [17.15,0.036], [17.28,0.028],
  [17.41,0.01], [17.54,0.012], [17.67,0.056], [17.8,0.107], [17.93,0.147], [18.06,0.19],
  [18.19,0.244], [18.31,0.319], [18.44,0.398], [18.57,0.464], [18.7,0.512], [18.83,0.541],
  [18.96,0.58], [19.09,0.646], [19.22,0.707], [19.35,0.746], [19.48,0.818], [19.61,0.898],
  [19.73,0.961], [19.86,0.975], [19.99,0.99], [20.8,1.02], [20.93,1.004], [21.06,0.992],
  [21.19,0.992], [21.32,1.014], [21.45,1.021],
];

describe('ThetaFloatDetector — le quattro forme misurate sul video', () => {
  /** Porta l'ago per una serie di POSIZIONI misurate (dove arriva, in quanto tempo).
   *  Si danno le posizioni e non le ampiezze: alternando ampiezze diverse il centro scivolerebbe
   *  per costruzione, cosa che sul video non succede — la ricostruzione sarebbe l'artefatto. */
  const perPunti = (d: ThetaFloatDetector, punti: [number, number][], sec = 0) => {
    let t = sec, pos = punti[0][0], stato = d.push(pos, t);
    for (const [meta, sec2] of punti.slice(1)) {
      const passi = Math.max(1, Math.round(sec2 / DT));
      const da = pos;
      for (let k = 1; k <= passi; k++) { t += DT; stato = d.push(da + (meta - da) * (k / passi), t); }
      pos = meta;
    }
    return { stato, t };
  };

  it('FLOATING NEEDLE — ampio, poi si smorza (0,63 → 0,10)', () => {
    // Misurato: 0,58/1,3s · 0,63/3,6s · 0,096/1,0s · 0,146/1,5s. È il caso che il vecchio
    // minimo di 0,22 tagliava a metà strada.
    const d = new ThetaFloatDetector();
    let stato = null as ReturnType<ThetaFloatDetector['push']> | null;
    for (const [t, dev] of TRACCIA_NORMALE) stato = d.push(dev, t);
    expect(stato!.fn).toBe(true);
  });

  it('INSTANT F/N — piccolo e regolare, dopo un movimento d ingresso ben più ampio', () => {
    // Misurato: una mezza spazzata da 0,98 (l'arrivo) seguita da dieci fra 0,13 e 0,29.
    // Chiedendo la regolarità sull'INSIEME il rapporto sale a 7,6 e il float sparisce; è per
    // questo che si cerca la migliore CORSA di spazzate consecutive.
    const d = new ThetaFloatDetector();
    const { stato } = perPunti(d, [[-0.90, 0], [0.23, 2.9], [0.01, 2.4], [0.17, 1.2], [0.00, 1.4],
                                   [0.13, 1.5], [-0.03, 1.4], [0.16, 1.6], [-0.02, 1.3]]);
    expect(stato.fn).toBe(true);
  });

  it('FLOATING TONE ARM — lentissimo e larghissimo (mezze spazzate da 4–5 s)', () => {
    // Misurato: 0,99/5,0s · 1,99/4,1s · 2,02/4,5s · 1,92/5,4s. Il vecchio massimo di 3,0 s per
    // mezza spazzata lo escludeva a QUALUNQUE ampiezza — e la finestra di 4 s non ne conteneva
    // comunque tre.
    const d = new ThetaFloatDetector();
    let stato = null as ReturnType<ThetaFloatDetector['push']> | null;
    for (const [t, dev] of TRACCIA_TONE_ARM) stato = d.push(dev, t);
    expect(stato!.fn).toBe(true);
    expect(stato!.widthAvg).toBeGreaterThan(1.0);      // spazzate larghissime
    expect(stato!.periodSec).toBeGreaterThan(6);       // …e lentissime
  });

  it('…e la finestra deve poterne contenere tre delle più lente', () => {
    // La condizione strutturale, scritta come tale: se qualcuno riabbassa la finestra, questo
    // test dice subito che i float lenti tornano invisibili.
    expect(THETA_FN_WINDOW_S).toBeGreaterThanOrEqual(THETA_FN_MIN_SWEEPS * THETA_FN_HALF_MAX_S);
  });

  it('i sussulti contro il bordo NON contano come mezze spazzate', () => {
    // Il TONE ARM, arrivando al bordo, ci preme contro: fra due spazzate da 1,9 comparivano
    // sussulti da 0,05 che venivano contati e poi facevano fallire il minimo (rapporto 39,6).
    const d = new ThetaFloatDetector();
    const { stato } = perPunti(d, [[-0.95, 0], [0.95, 4.2], [0.90, 0.3], [-0.95, 4.3],
                                   [-0.90, 0.3], [0.95, 4.4], [0.90, 0.3], [-0.95, 4.5]]);
    expect(stato.fn).toBe(true);
    expect(stato.widthAvg).toBeGreaterThan(0.5);   // le spazzate vere, non i sussulti
  });
});
