// src/workers/nestEngine.ts
// NEST — EEG → qL / bands / reactions. (The TMI cosmetic-needle + reaction-time
// scaffolding was removed: the needle position is qL-predicted in App and the
// single reaction source is the movement-based ReactionClassifier.)

// FIX CONN-25: gate verbose worker diagnostics behind a single flag.
// These per-sample logs (BPM/EEG buffer status) flooded the DevTools console
// with thousands of lines per minute, hiding the [NetworkManager] media logs
// that are needed to debug P2P. Set to true only when debugging the DSP path.
const DBG = false;
const dbg = (...args: unknown[]) => { if (DBG) console.log(...args); };

// AUDIT B5: safe division — band powers can be 0 (cuffia retirée, silence), and
// unguarded divisions sent Infinity/NaN into the metrics payload (only the needle
// position had a guard). Returns 0 when the denominator is ~0.
const sdiv = (a: number, b: number): number => (Math.abs(b) > 1e-9 ? a / b : 0);

// AUDIT B7: removed `eegRingBuffer`/`pushEegSample` (filled every sample @256 Hz but
// never read) and the unused `computeSplines()` cubic-spline helper — dead code.

// ─── GOERTZEL ALGORITHM ───────────────────────────────────────────
// Efficient single-frequency power extraction
// Formula: q0 = coeff*q1 - q2 + x[n]; q2 = q1; q1 = q0
// Returns 0 for k=0 (DC) — not a valid EEG band
function goertzel(samples: number[], targetFreq: number, sampleRate: number): number {
  const N = samples.length;
  const k = Math.round((targetFreq * N) / sampleRate);
  if (k === 0) return 0; // DC component — skip to avoid contaminating band ratios
  const w = (2 * Math.PI * k) / N;
  const cosine = Math.cos(w);
  const coeff = 2 * cosine;
  let q1 = 0, q2 = 0;
  for (let i = 0; i < N; i++) {
    const q0 = coeff * q1 - q2 + samples[i];
    q2 = q1;
    q1 = q0;
  }
  const real = q1 - q2 * cosine;
  const imag = q2 * Math.sin(w);
  return Math.sqrt(real * real + imag * imag);
}

// ─── MAIN PIPELINE STATE ──────────────────────────────────────────────
const SAMPLE_RATE = 256;
import type { MetricsUpdatePayload, Bands } from './nestMessages';

const BUFFER_SIZE = 128;
let buffer: number[] = [];
// Cognition detection: sequenza Gamma→Alpha→Beta↓
// Gyro EP: media+varianza+trend 10s

// PPG / BPM
// FIX CONN-55: the Muse 2 PPG streams at 64 Hz (muse-js PPG_FREQUENCY = 64),
// NOT 12 Hz as the old code assumed. With 12 Hz a real ~60 bpm beat (64 samples
// apart) computed to ~11 bpm and was discarded by the [40,180] filter, leaving
// only short noise intervals → BPM pinned at the 180 ceiling. Using 64 Hz fixes
// the conversion.
const PPG_SAMPLE_RATE = 64;            // Hz
const BPM_MIN = 40, BPM_MAX = 200;     // physiological window
let ppgBuffer: number[] = [];

// Stabilisation du BPM : médiane d'historique + EMA
const bpmHistory: number[] = [];
let emaBPM = 0; // Exponential Moving Average pour affichage fluide
const BPM_HISTORY_SIZE = 20; // Historique élargi pour plus de stabilité
const BPM_EMA_ALPHA = 0.15;  // Lissage EMA (plus bas = plus lisse)

// Fonction pour calculer les BPM à partir des données PPG
function calculateBPM(ppgData: number[]): number {
  dbg('calculateBPM: input data length:', ppgData.length);
  dbg('calculateBPM: raw sample data:', ppgData.slice(0, 10));
  
  if (ppgData.length < 128) return 0; // ~2 s minimum for a reliable estimate

  const n = ppgData.length;

  // FIX CONN-57: replace fragile peak-counting (which mis-counted the dicrotic
  // notch → inflated BPM, e.g. 115/180) with normalized AUTOCORRELATION. The
  // autocorrelation locks onto the dominant beat period and is naturally immune
  // to secondary peaks and amplitude noise.

  // 1) High-pass via moving-average subtraction to kill slow baseline wander
  //    (otherwise the drift dominates the autocorrelation at long lags).
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + ppgData[i];
  const half = PPG_SAMPLE_RATE >> 1; // ~0.5 s window
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(n, i + half + 1);
    x[i] = ppgData[i] - (prefix[b] - prefix[a]) / (b - a);
  }

  // 2) Normalized autocorrelation over the physiological lag range.
  const minLag = Math.round((PPG_SAMPLE_RATE * 60) / BPM_MAX); // ≈19 (200 bpm)
  const maxLag = Math.round((PPG_SAMPLE_RATE * 60) / BPM_MIN); // ≈96 (40 bpm)
  let c0 = 0;
  for (let i = 0; i < n; i++) c0 += x[i] * x[i];
  if (c0 <= 1e-6) return 0;

  const acAt = (lag: number): number => {
    let c = 0;
    for (let i = 0; i + lag < n; i++) c += x[i] * x[i + lag];
    return c / c0;
  };

  let bestLag = -1, bestCorr = -Infinity;
  for (let lag = minLag; lag <= maxLag && lag < n; lag++) {
    const c = acAt(lag);
    if (c > bestCorr) { bestCorr = c; bestLag = lag; }
  }

  // Weak periodicity (poor skin contact, motion) → don't report a bogus value.
  if (bestLag < 0 || bestCorr < 0.35) {
    dbg('calculateBPM: weak autocorr', bestCorr);
    return 0;
  }

  // Parabolic interpolation around the peak for sub-sample lag precision.
  let lag = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const ym1 = acAt(bestLag - 1), y0 = bestCorr, yp1 = acAt(bestLag + 1);
    const denom = ym1 - 2 * y0 + yp1;
    if (denom !== 0) lag = bestLag + 0.5 * (ym1 - yp1) / denom;
  }

  const rawBPM = Math.round((PPG_SAMPLE_RATE * 60) / lag);
  dbg('calculateBPM: lag', lag, 'corr', bestCorr, 'bpm', rawBPM);

  // Stabilisation robuste : médiane d'historique (rejette les valeurs aberrantes
  // ponctuelles) + EMA pour un affichage fluide. La médiane ne peut jamais
  // "rester coincée" comme l'ancien verrou ±3 BPM.
  bpmHistory.push(rawBPM);
  if (bpmHistory.length > BPM_HISTORY_SIZE) bpmHistory.shift();

  const sorted = [...bpmHistory].sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];

  emaBPM = emaBPM === 0 ? median : Math.round(BPM_EMA_ALPHA * median + (1 - BPM_EMA_ALPHA) * emaBPM);

  return emaBPM;
}

/**
 * PPG AUTONOMIQUE — la seule voie du Muse qui partage le SYSTÈME du meter.
 *
 * Le TA d'un meter = résistance de la peau = voie SUDOMOTRICE (sympathique). Les bandes EEG sont
 * CORTICALES : autre système — c'est pourquoi mS + les 25 rapports de bandes n'ont RIEN donné sur
 * 2 personnes × 2 machines (tests 2026-07-15). Le PPG, lui, mesure la voie VASOMOTRICE — même
 * sortie sympathique que la sudomotrice. Sympathique ↑ → vasoconstriction → amplitude du pouls ↓.
 *
 * On sortait UNIQUEMENT le BPM (le résumé le plus grossier) alors que le signal utile était là :
 *   • AC = amplitude pulsatile (écart p95−p05 du signal DÉTENDU) — le tonus vasomoteur ;
 *   • DC = niveau moyen (perfusion de base + couplage du capteur) ;
 *   • PI = AC/DC = INDICE DE PERFUSION — l'index clinique standard du tonus périphérique. Le
 *     ratio ANNULE le gain/couplage du capteur → comparable entre machines et entre séances
 *     (exactement ce qui manquait à l'mS, dont l'échelle variait ~100× d'une machine à l'autre).
 *
 * RÉSERVE HONNÊTE : le PPG du Muse est sur le FRONT ; le GSR se mesure aux paumes/doigts, où
 * l'innervation sympathique est dense. Le front est un site FAIBLE pour le vasomoteur. C'est le
 * meilleur coup qui reste, pas une promesse.
 */
function calculatePPGAutonomic(ppgData: number[]): { ppgAmp: number; ppgPI: number } | null {
  const n = ppgData.length;
  if (n < 128) return null;
  // DC = niveau moyen (avant détendage).
  let dc = 0;
  for (let i = 0; i < n; i++) dc += ppgData[i];
  dc /= n;
  if (!isFinite(dc) || Math.abs(dc) < 1e-6) return null;
  // Détendage identique à calculateBPM (moyenne glissante ~0.5 s) → composante AC pure.
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + ppgData[i];
  const half = PPG_SAMPLE_RATE >> 1;
  const ac = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(n, i + half + 1);
    ac[i] = ppgData[i] - (prefix[b] - prefix[a]) / (b - a);
  }
  // Amplitude ROBUSTE : écart p95−p05 (≈ crête-à-creux, insensible aux artefacts ponctuels).
  const sorted = Array.from(ac).sort((a, b) => a - b);
  const p = (q: number) => sorted[Math.min(n - 1, Math.max(0, Math.round(q * (n - 1))))];
  const amp = p(0.95) - p(0.05);
  if (!isFinite(amp) || amp <= 0) return null;
  return { ppgAmp: amp, ppgPI: amp / Math.abs(dc) };
}

// TMI Integrator state

// F/N Persistence Tracking (La Regola dei 1,5s)
const fnTrackingRef = {
  stabilityTimer: 0,
  hysteresisTimer: 0,
  isActive: false,
  lastUpdateT: null as number | null,
  epLockTimer: 0,
  isEpValidated: false
};

// ─── WORKER MESSAGE HANDLER ───────────────────────────────────────────
self.onmessage = (e) => {
  if (e.data.type === 'RESET_SYSTEM') {
    // Vider les buffers pour arrêter les calculs basés sur le passé
    buffer = [];
    dbg("Worker: Buffers vidés.");
    return;
  }

  if (e.data.type === 'RAW_EEG') {
    const samples: number[] = e.data.payload;
    dbg('Worker: Received RAW_EEG data', { samplesCount: samples.length, firstSample: samples[0] });

    buffer.push(...samples);
    dbg('Worker: Buffer status', { currentLength: buffer.length, requiredSize: BUFFER_SIZE });
    if (buffer.length >= BUFFER_SIZE) {
      const chunk = buffer.slice(0, BUFFER_SIZE);
      
      // Calculer les bandes de fréquence avec Goertzel
      // Résolution fréquentielle avec 128 samples @ 256 Hz = 2 Hz/bin
      // k=0 → DC (invalide), k=1 → 2Hz, k=2 → 4Hz, k=3 → 6Hz, k=4 → 8Hz, etc.
      // t99/t90 étaient à 0.5 et 1.0 Hz → k=0 (DC), corrigés vers bins valides
      const deltaPow   = goertzel(chunk, 2,  SAMPLE_RATE); // k=1 — min bin valide (~delta)
      const thetaPow   = goertzel(chunk, 6,  SAMPLE_RATE); // k=3 — theta central
      const alphaPow   = goertzel(chunk, 10, SAMPLE_RATE); // k=5 — alpha central
      const betaPow    = goertzel(chunk, 20, SAMPLE_RATE); // k=10 — beta central
      const gammaPow   = goertzel(chunk, 40, SAMPLE_RATE); // k=20 — gamma (≤ Nyquist)

      const bands: Bands = {
        t99:  deltaPow,                      // proxy sub-delta (best available at k=1)
        t90:  goertzel(chunk, 4, SAMPLE_RATE),  // k=2 — slow delta
        t80:  deltaPow,                      // delta band
        t70:  thetaPow,                      // theta low
        t60:  goertzel(chunk, 8, SAMPLE_RATE),  // k=4 — alpha low / theta high
        t40:  goertzel(chunk, 12, SAMPLE_RATE), // k=6 — beta low
        delta: deltaPow,
        theta: thetaPow,
        alpha: alphaPow,
        beta:  betaPow,
        gamma: gammaPow,
        gammaDeltaRatio: sdiv(gammaPow, alphaPow) // B5: guarded (was unguarded /alpha)
      };

      // Calculer qL comme masse theta (NEST V4)
      const avgRhoG = sdiv(bands.t99, bands.t40); // B5: guard ÷0 → Infinity
      const vProc = Math.sqrt(bands.t90 * bands.t90 + bands.t80 * bands.t80);
      const qL = (avgRhoG * vProc) / 1000; // Normalisation

      dbg('Worker: Processing EEG signal', { qL, bands });

      // Calcola le variabili prima dell'oggetto
      // IL = gamma/theta ratio (physiological arousal index, ~0.3-3.0 range)
      const currentIL = thetaPow > 0 ? gammaPow / thetaPow : 0;
      const isDiffusion = currentIL > 1.0 ? 1 : 0;

      const payload: MetricsUpdatePayload = {
        rhoG: avgRhoG,
        vProc,
        qL,
        eta: sdiv(qL, avgRhoG), // B5: guard ÷0
        // tZone: 0=T80(normal), 1=T90(dissolution), 2=T60(F/N), 3=T99(EP)
        // Conditions from HIGH to LOW — ternary short-circuits left-to-right
        tZone: qL > 1.2 ? 3 : qL > 0.8 ? 2 : qL > 0.5 ? 1 : 0,
        diracCount: 0,
        bands,
        mS: qL,
        kP: sdiv(qL, avgRhoG), // B5: guard ÷0
        iF: qL > 0.8 ? 1 : 0,
        IL: currentIL,
        massDelta: sdiv(deltaPow, thetaPow), // B5: guard ÷0
        // VELOCITY (NEST V5) = spectral centroid = mean EEG frequency weighted by
        // band power. This is the TRUE "kinetic speed of the being": fast brain =
        // high centroid = natural/free state. It is INDEPENDENT of mass (qL =
        // slow-wave resistance/charge), unlike the old vProc (slow-wave amplitude
        // mislabelled as velocity). Representative band freqs: δ2 θ6 α10 β20 γ40.
        velCentroid: sdiv(
          2 * deltaPow + 6 * thetaPow + 10 * alphaPow + 20 * betaPow + 40 * gammaPow,
          deltaPow + thetaPow + alphaPow + betaPow + gammaPow,
        ),
        vSol: Math.max(0, qL), // continuous — not binary, used for reaction thresholds
        isAsIs: qL > 0.8 && qL < 1.2,
        isStall: qL < 0.1,
        fnWithHysteresis: false,
        psi: 0,
        energy: Math.sqrt(bands.delta * bands.delta + bands.theta * bands.theta + bands.alpha * bands.alpha + bands.beta * bands.beta + bands.gamma * bands.gamma),
        energyMin: Math.min(deltaPow, thetaPow, alphaPow, betaPow, gammaPow),
        diffusionMass: isDiffusion,
        signifiance: avgRhoG > 0.25 ? 1 : 0,
        aliasingMass: isDiffusion,
        // Richiama correttamente da 'bands'
        delta: bands.delta,
        theta: bands.theta,
        alpha: bands.alpha,
        beta: bands.beta,
        gamma: bands.gamma,
        gammaDeltaRatio: bands.gammaDeltaRatio,
        deltaPow, thetaPow, alphaPow, betaPow, gammaPow,
        rawSlope: 0,
        energyRecovery: 0,
        isSomaticPersist: false,
        isSomaticRelease: false,
        isEmotionalConfirm: false,
        isCognitionDetected: false,
        isEpSomatic: false,
        gsrValue: qL,
      };

      self.postMessage({ type: 'METRICS_UPDATE', payload });
      
      // ── Needle position: sigmoid(qL) mapping — hardware-scale agnostic ──────
      // Old force-based mapping caused needlePosition = 1.0 exactly → sanity reset every cycle.
      // Sigmoid maps qL (any range) to (-0.35, +0.90) smoothly, never reaches ±1.
      // SET_POS = -0.35 (zero EEG activity), MAX_POS = 0.90 (peak deflection)
      // k=0.25 → qL=0 → pos=-0.35, qL=5 → pos≈0.42, qL=10 → pos≈0.70, qL=20 → pos≈0.85
      {
        const SET_POS = -0.35;
        const MAX_POS = 0.90;
        const sigmoidQl = 2 / (1 + Math.exp(-qL * 0.25)) - 1; // 0-1 for qL>0
        const needlePosition = SET_POS + (MAX_POS - SET_POS) * Math.max(0, sigmoidQl);

        // NaN guard only — sigmoid can never reach ±1
        if (isNaN(needlePosition) || !isFinite(needlePosition)) {
          self.postMessage({ type: 'GSR_RESET' });
          return;
        }

        self.postMessage({
          type: 'GSR_UPDATE',
          payload: {
            position: needlePosition,
            offset: needlePosition,
          }
        });
      }
    }
    
    // Keep only unprocessed data after the chunk
    if (buffer.length > BUFFER_SIZE) {
      buffer = buffer.slice(BUFFER_SIZE);
    }
    // If buffer has less than BUFFER_SIZE, keep it as is to accumulate
  }

  if (e.data.type === 'RAW_PPG') {
    const samples: number[] = e.data.payload;
    dbg('Worker: Received RAW_PPG data', { samplesCount: samples.length });
    
    // Ajouter les échantillons PPG au buffer
    ppgBuffer.push(...samples);
    dbg('Worker: PPG buffer size:', ppgBuffer.length);
    
    // FIX CONN-55: compute over a ~4 s window (256 samples @64 Hz) so several
    // beats are present for a reliable rate; keep the buffer bounded and slide
    // ~0.5 s (32 samples) for a frequent but stable refresh.
    const WINDOW = 256;
    if (ppgBuffer.length > WINDOW) ppgBuffer = ppgBuffer.slice(-WINDOW);
    if (ppgBuffer.length >= 128) {
      const bpm = calculateBPM(ppgBuffer);
      // Features AUTONOMIQUES du même buffer PPG (amplitude du pouls + indice de perfusion) :
      // la seule voie du Muse qui partage le système du meter. Émises AVEC le BPM.
      const auto = calculatePPGAutonomic(ppgBuffer);
      if (bpm > 0) {
        self.postMessage({ type: 'BPM_UPDATE', payload: { bpm, ppgAmp: auto?.ppgAmp, ppgPI: auto?.ppgPI } });
      }
      ppgBuffer = ppgBuffer.slice(32);
    }
  }

  // Handle other message types if needed
};
