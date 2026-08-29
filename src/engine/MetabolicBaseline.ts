/**
 * MetabolicBaseline — pre-session readiness check. Before the auditor starts, we
 * take a short PASSIVE baseline plus a guided DEEP-BREATH test and judge whether
 * the PC is, physiologically, fit to begin: settled (not agitated), with good
 * electrode contact, a plausible resting heart rate, and REACTIVE autonomics
 * (the breath visibly modulates HR / EEG).
 *
 * HONEST SCOPE: this validates the BODY and the SENSOR, not a "case state". A poor
 * contact is the only hard stop (the meter literally can't read); everything else
 * is advisory ("wait"), because there is no universal absolute threshold for
 * "calm" without per-person calibration — so we lean on STABILITY and plausibility,
 * not magic numbers. Output is a traffic light the auditor may override.
 *
 * Pure-TS singleton, fed from App's METRICS_UPDATE (bands) + the BPM / signal-quality
 * refs. No React. The UI polls snapshot()/assess().
 */
export type Rating = 'good' | 'ok' | 'poor' | 'na';
export type Readiness = 'go' | 'wait' | 'nogo';

export interface MetabSample {
  alpha: number; beta: number; gamma: number; theta: number;
  bpm: number | null;      // null when the forehead PPG has no clear beat
  signalQuality: number;   // 0..100 electrode contact
  breathing: boolean;      // true during the guided deep-breath phase
}

export interface MetabAssessment {
  level: Readiness;
  contact: Rating; calm: Rating; heart: Rating; reactivity: Rating;
  contactVal: number;      // mean signal quality
  bpmVal: number | null;   // mean resting bpm
  arousal: number;         // mean (β+γ)/(α+θ)
  reasons: string[];       // i18n keys describing what to watch
}

// Thresholds — deliberately conservative & documented (no mystique).
const CONTACT_GOOD = 65, CONAREST_OK = 40;     // electrode contact (0..100)
// FIX: BPM_LOW aggiunta — prima non esisteva nessun limite basso, un bpm
// implausibilmente basso (rumore/contatto scarso) veniva classificato 'ok'.
const BPM_LOW = 40, BPM_REST_LO = 50, BPM_REST_HI = 90, BPM_HIGH = 105;
const AROUSAL_CV_SETTLED = 0.25;               // coeff. of variation of arousal → settled
const REACT_MIN = 0.12;                        // min relative breath-driven modulation

const mean = (a: number[]) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const std  = (a: number[]) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1));
};

export class MetabolicBaseline {
  private arousalBase: number[] = [];   // (β+γ)/(α+θ) during passive baseline
  private bpmBase: number[] = [];
  private contact: number[] = [];
  private arousalBreath: number[] = []; // during the breath test
  private bpmBreath: number[] = [];

  reset(): void {
    this.arousalBase = []; this.bpmBase = []; this.contact = [];
    this.arousalBreath = []; this.bpmBreath = [];
  }

  push(s: MetabSample): void {
    const denom = s.alpha + s.theta;
    const arousal = denom > 1e-6 ? (s.beta + s.gamma) / denom : 0;
    this.contact.push(Math.max(0, Math.min(100, s.signalQuality)));
    if (s.breathing) {
      if (arousal > 0) this.arousalBreath.push(arousal);
      if (s.bpm != null) this.bpmBreath.push(s.bpm);
    } else {
      if (arousal > 0) this.arousalBase.push(arousal);
      if (s.bpm != null) this.bpmBase.push(s.bpm);
    }
  }

  /** Samples gathered so far (for UI progress). */
  nBaseline(): number { return this.contact.length; }

  assess(): MetabAssessment {
    const reasons: string[] = [];
    const contactVal = Math.round(mean(this.contact));
    const arousal = mean(this.arousalBase);
    const arousalSd = std(this.arousalBase);
    const cv = arousal > 1e-6 ? arousalSd / arousal : 1;
    const bpmVal = this.bpmBase.length ? Math.round(mean(this.bpmBase)) : null;

    // ── contact (the only hard stop) ──────────────────────────────────────────
    let contact: Rating;
    if (this.contact.length < 4) { contact = 'na'; }
    else if (contactVal >= CONTACT_GOOD) contact = 'good';
    else if (contactVal >= CONAREST_OK) { contact = 'ok'; }
    else { contact = 'poor'; reasons.push('metab_reason_contact'); }

    // ── calm: settled = stable arousal (low CV), not extreme ──────────────────
    let calm: Rating;
    if (this.arousalBase.length < 4) calm = 'na';
    else if (cv <= AROUSAL_CV_SETTLED) calm = 'good';
    else if (cv <= AROUSAL_CV_SETTLED * 2) calm = 'ok';
    else { calm = 'poor'; reasons.push('metab_reason_agitated'); }

    // ── heart: plausible resting range ────────────────────────────────────────
    let heart: Rating;
    if (bpmVal == null) { heart = 'na'; reasons.push('metab_reason_nobpm'); }
    else if (bpmVal >= BPM_REST_LO && bpmVal <= BPM_REST_HI) heart = 'good';
    // FIX: limite basso aggiunto — un bpm sotto BPM_LOW (rumore/contatto scarso,
    // non un battito vero) non è più classificato 'ok' solo perché non supera
    // BPM_HIGH.
    else if (bpmVal < BPM_LOW) { heart = 'poor'; reasons.push('metab_reason_lowbpm'); }
    else if (bpmVal <= BPM_HIGH) { heart = 'ok'; }
    else { heart = 'poor'; reasons.push('metab_reason_highbpm'); }

    // ── reactivity: does the guided breath modulate HR or EEG? ────────────────
    // Respiratory sinus arrhythmia (HR swings with breath) or a clear EEG shift
    // = reactive autonomics → the PC can produce reads. Flat = sensor or genuinely
    // unreactive; advisory only.
    let reactivity: Rating = 'na';
    const baseA = mean(this.arousalBase), baseB = mean(this.bpmBase);
    let react = 0;
    if (this.bpmBreath.length >= 4 && baseB > 1e-6) {
      react = Math.max(react, (Math.max(...this.bpmBreath) - Math.min(...this.bpmBreath)) / baseB);
    }
    if (this.arousalBreath.length >= 4 && baseA > 1e-6) {
      react = Math.max(react, std(this.arousalBreath) / baseA);
    }
    if (this.bpmBreath.length >= 4 || this.arousalBreath.length >= 4) {
      if (react >= REACT_MIN * 2) reactivity = 'good';
      else if (react >= REACT_MIN) reactivity = 'ok';
      else { reactivity = 'poor'; reasons.push('metab_reason_flat'); }
    }

    // ── aggregate (advisory) ──────────────────────────────────────────────────
    let level: Readiness = 'go';
    if (contact === 'poor') level = 'nogo';
    else if (calm === 'poor' || heart === 'poor' || reactivity === 'poor') level = 'wait';

    return { level, contact, calm, heart, reactivity, contactVal, bpmVal, arousal, reasons };
  }
}

/** Singleton — one readiness check per app instance. */
export const metabolicBaseline = new MetabolicBaseline();
