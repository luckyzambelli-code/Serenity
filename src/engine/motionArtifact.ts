import { MOTION_ARTIFACT_RMS, MOTION_WINDOW_SAMPLES } from './tuning';

/**
 * ARTEFATTO DI MOVIMENTO — il filtro che mancava.
 *
 * Perché esiste: il classificatore dell'ago ha SEMPRE avuto una guardia
 * `if (isBpmArtifact || isMotionArtifact) return 'reaction_tick'`, ma il campo arrivava dal worker
 * come costante `false` (il giroscopio non gli veniva nemmeno inviato). Risultato: un movimento
 * della testa o una contrazione della mandibola produce potenza EEG a banda larga → salto di
 * carica → l'ago lo legge come Fall/Long Fall/Blow Down, lo MOSTRA e — da quando la fonte delle
 * letture è « ciò che è mostrato » — lo REGISTRA come lettura vera dell'item.
 *
 * Il giroscopio non ha mai avuto bisogno del worker: il buffer vive già nell'App, accanto alla
 * chiamata al classificatore. Qui c'è solo il calcolo, puro e testabile.
 *
 * NOTA ONESTA: `isBpmArtifact` resta NON implementato (nessuna definizione condivisa di cosa
 * significhi una contaminazione da battito sull'EEG). Non lo si finge: resta false.
 */

/** Ampiezza del movimento sugli ultimi campioni: RMS del modulo della velocità angolare.
 *  Il giroscopio misura una VELOCITÀ: a testa ferma vale ~0 qualunque sia l'inclinazione,
 *  quindi non serve togliere alcuna componente continua. */
export function gyroRms(
  x: number[], y: number[], z: number[],
  window: number = MOTION_WINDOW_SAMPLES,
): number {
  const n = Math.min(window, x.length, y.length, z.length);
  if (n <= 0) return 0;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const xi = x[x.length - 1 - i], yi = y[y.length - 1 - i], zi = z[z.length - 1 - i];
    if (!Number.isFinite(xi) || !Number.isFinite(yi) || !Number.isFinite(zi)) continue;
    acc += xi * xi + yi * yi + zi * zi;   // = modulo²
  }
  return Math.sqrt(acc / n);
}

/** true quando il movimento è tale che la lettura dell'ago non è attribuibile all'item.
 *  Soglia volutamente ALTA (`MOTION_ARTIFACT_RMS`): sopprimere una lettura vera è peggio che
 *  lasciar passare un piccolo movimento. */
export function isMotionArtifact(
  x: number[], y: number[], z: number[],
  threshold: number = MOTION_ARTIFACT_RMS,
): boolean {
  return gyroRms(x, y, z) > threshold;
}
