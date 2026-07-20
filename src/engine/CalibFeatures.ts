/**
 * CalibFeatures — snapshot LIVE des puissances de bande BRUTES (δ θ α β γ) + BPM, pour
 * l'EXPLORATION de la reconstruction du TA (« Option B »).
 *
 * Les tests Roger (PC vs mac, 2026-07-13) ont montré que l'mS (puissance absolue) n'est NI
 * corrélé au TA du meter (r bascule de −0.44 à +0.44 selon la machine, combiné ≈ 0) NI
 * transférable entre machines (même TA → mS 5–10× différent). On enregistre donc les 5 bandes
 * BRUTES à CHAQUE capture (mS, TA_meter) : offline on pourra former n'importe quel RATIO
 * (θ/β, α/θ, γ/β, …) — un ratio annule le scaling per-machine (le vrai défaut de l'mS). Le BPM
 * (PPG) est déjà machine-invariant (Hz physiologiques).
 *
 * Pur TS, singleton, alimenté par App (METRICS_UPDATE), lu par le panneau de calibration au
 * moment de la capture. N'affecte PAS le moteur DSP : c'est de la pure instrumentation.
 */
export interface CalibFeatureSet {
  delta: number; theta: number; alpha: number; beta: number; gamma: number; bpm: number;
  /** PPG — amplitude du pouls (tonus vasomoteur : sympathique ↑ → vasoconstriction → amplitude ↓). */
  ppgAmp: number;
  /** PPG — INDICE DE PERFUSION AC/DC : le ratio annule le gain/couplage du capteur → comparable
   *  entre machines (ce qui manquait cruellement à l'mS, dont l'échelle variait ~100×). C'est LA
   *  voie qui partage le système du meter (sudomoteur vs vasomoteur, même sortie sympathique). */
  ppgPI: number;
}

class CalibFeatures {
  delta = 0; theta = 0; alpha = 0; beta = 0; gamma = 0; bpm = 0; ppgAmp = 0; ppgPI = 0;
  /** Date.now du dernier set (fraîcheur, comme taAccumulator.lastMsAt). */
  at = 0;

  set(f: Partial<CalibFeatureSet>): void {
    if (typeof f.delta === 'number' && isFinite(f.delta)) this.delta = f.delta;
    if (typeof f.theta === 'number' && isFinite(f.theta)) this.theta = f.theta;
    if (typeof f.alpha === 'number' && isFinite(f.alpha)) this.alpha = f.alpha;
    if (typeof f.beta  === 'number' && isFinite(f.beta))  this.beta  = f.beta;
    if (typeof f.gamma === 'number' && isFinite(f.gamma)) this.gamma = f.gamma;
    if (typeof f.bpm   === 'number' && isFinite(f.bpm))   this.bpm   = f.bpm;
    if (typeof f.ppgAmp === 'number' && isFinite(f.ppgAmp)) this.ppgAmp = f.ppgAmp;
    if (typeof f.ppgPI  === 'number' && isFinite(f.ppgPI))  this.ppgPI  = f.ppgPI;
    this.at = Date.now();
  }

  snapshot(): CalibFeatureSet {
    return { delta: this.delta, theta: this.theta, alpha: this.alpha, beta: this.beta, gamma: this.gamma,
             bpm: this.bpm, ppgAmp: this.ppgAmp, ppgPI: this.ppgPI };
  }
}

/** Singleton — une instance d'instrumentation par app. */
export const calibFeatures = new CalibFeatures();
