/**
 * CONTRATTO tra il worker DSP (`nestEngine.ts`) e l'App.
 *
 * Perché esiste: i dati vitali della seduta — carica, bande, TA, artefatti — attraversano il
 * confine worker→App come `e.data.payload` non tipizzato. Un campo rinominato o rimosso da una
 * parte diventava `undefined` dall'altra SENZA che niente lo segnalasse: nessun errore, solo un
 * valore silenziosamente sbagliato sul quadrante. Questo file rende quel confine verificabile
 * dal compilatore.
 *
 * REGOLA: se si aggiunge/rinomina un campo nel payload del worker, lo si dichiara QUI. Il
 * typecheck fallirà finché le due parti non tornano d'accordo — ed è esattamente ciò che serve.
 */

/** Potenze di banda calcolate dal worker (Goertzel) + i rapporti derivati. */
export interface Bands {
  t99: number;  // proxy sub-delta
  t90: number;  // delta lento
  t80: number;  // banda delta
  t70: number;  // theta basso
  t60: number;  // alpha basso / theta alto
  t40: number;  // beta basso
  delta: number;
  theta: number;
  alpha: number;
  beta: number;
  gamma: number;
  gammaDeltaRatio: number;
}

/** Il payload principale: emesso ad ogni ciclo di analisi. È la fonte di TUTTO ciò che si vede. */
export interface MetricsUpdatePayload {
  // ── carica e derivate ──
  rhoG: number;
  vProc: number;
  /** CARICA (la grandezza che muove l'ago e alimenta i cicli). */
  qL: number;
  eta: number;
  tZone: number;
  diracCount: number;
  bands: Bands;
  /** Conduttanza ricostruita — da cui si ricava il TA (NON milliohm: cfr. calibrazione TA). */
  mS: number;
  kP: number;
  iF: number;
  IL: number;
  massDelta: number;
  /** Centroide spettrale = velocità (indipendente dalla massa). */
  velCentroid: number;
  vSol: number;

  // ── stati ──
  isAsIs: boolean;
  isStall: boolean;
  fnWithHysteresis: boolean;

  // ── energia ──
  psi: number;
  energy: number;
  energyMin: number;
  diffusionMass: number;
  signifiance: number;
  aliasingMass: number;

  // ── bande (ripetute a livello alto per comodità dei consumatori) ──
  delta: number;
  theta: number;
  alpha: number;
  beta: number;
  gamma: number;
  gammaDeltaRatio: number;
  deltaPow: number;
  thetaPow: number;
  alphaPow: number;
  betaPow: number;
  gammaPow: number;

  // ── artefatti e marcatori ──
  rawSlope: number;
  energyRecovery: number;
  gyroRms: number;
  isMotionArtifact: boolean;
  isSomaticPersist: boolean;
  isSomaticRelease: boolean;
  isEmotionalConfirm: boolean;
  isBpmArtifact: boolean;
  isCognitionDetected: boolean;
  isEpSomatic: boolean;
  gsrValue: number;
}

/** Battito + autonomico ricavati dal PPG frontale. */
export interface BpmUpdatePayload {
  bpm: number;
  /** Ampiezza PPG (AC). Assente se il polso non è leggibile. */
  ppgAmp?: number;
  /** Indice di perfusione (AC/DC). La calibrazione TA ha mostrato che dalla fronte è debole. */
  ppgPI?: number;
}

/** Posizione dell'ago calcolata direttamente dal worker. */
export interface GsrUpdatePayload {
  position: number;
  offset: number;
}

/** Tutti i messaggi worker → App. Unione discriminata su `type`. */
export type NestWorkerMessage =
  | { type: 'METRICS_UPDATE'; payload: MetricsUpdatePayload }
  | { type: 'BPM_UPDATE'; payload: BpmUpdatePayload }
  | { type: 'GSR_UPDATE'; payload: GsrUpdatePayload }
  | { type: 'GSR_RESET' }
  | { type: 'HARDWARE_ERROR'; payload?: unknown }
  | { type: 'EP_VALIDATION_UPDATE'; payload?: unknown };
