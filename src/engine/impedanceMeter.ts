/**
 * IMPEDANCE METER — la sonda delle « lattine » : resistenza cutanea misurata come partitore
 * di tensione su un ingresso audio, per dare a EQUILIBRIUM un TA in OHM VERI accanto all'EEG.
 *
 * Cablaggio, scelta di R_ref e procedura di taratura: docs/can-meter-cablaggio.md
 *
 * ── PERCHÉ IN ALTERNATA ────────────────────────────────────────────────────────────────────
 * L'uscita audio è accoppiata in alternata: non si PUÒ misurare in continua. In cambio si
 * guadagnano due cose: nessuna POLARIZZAZIONE degli elettrodi (la deriva lenta che affligge i
 * meter in continua), e la rivelazione sincrona (lock-in), che rigetta ronzio di rete e deriva.
 *
 * ── PERCHÉ DUE TONI ────────────────────────────────────────────────────────────────────────
 * L'impedenza della pelle dipende dalla frequenza: lo strato corneo si comporta da condensatore
 * e più si sale più lo cortocircuita. Il tono BASSO vede pelle + profondo; l'ALTO quasi solo il
 * profondo, che di elettrodermico non porta nulla. La DIFFERENZA isola la componente cutanea —
 * il sudore, cioè quello che legge un e-meter. È una separazione che la continua non può fare.
 *
 * NB: è un modello del PRIMO ORDINE (pelle = RC parallelo). Non pretende di essere una
 * scomposizione esatta: è una separazione utile, non una verità fisica.
 *
 * Puro TS, nessuna dipendenza da Web Audio: qui c'è solo il calcolo, così è collaudabile senza
 * hardware. Il pilotaggio della scheda audio sta altrove.
 */
import {
  CAN_TONE_LOW_HZ, CAN_TONE_HIGH_HZ, CAN_LOCKIN_WINDOW_MS, CAN_R_REF_NOMINAL,
  CAN_SILENCE_FLOOR, CAN_SMOOTH, TONE_SCALE_MAX,
} from './tuning';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// LOCK-IN — rivelazione sincrona
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** Risultato di una finestra di lock-in. */
export interface LockInResult {
  /** Ampiezza del tono nel segnale d'ingresso (stesse unità del campione). */
  amplitude: number;
  /** Fase rispetto al riferimento (rad). Porta l'informazione REATTIVA: una pelle molto
   *  capacitiva sfasa. Non ancora usata per il TA, ma è gratis e vale la pena registrarla. */
  phase: number;
}

/** Aggancia una frequenza al bin più vicino, così che nella finestra ci stia un numero INTERO
 *  di cicli. Due toni agganciati a bin diversi sono ORTOGONALI: non si contaminano a vicenda.
 *  Senza questo, la coda del tono basso sporcherebbe la misura del tono alto. */
export const snapToBin = (freqHz: number, sampleRate: number, windowN: number): number => {
  const bin = Math.max(1, Math.round((freqHz * windowN) / sampleRate));
  return (bin * sampleRate) / windowN;
};

/** Numero di campioni della finestra di media, per una durata in ms. */
export const windowSamples = (sampleRate: number, ms = CAN_LOCKIN_WINDOW_MS): number =>
  Math.max(8, Math.round((sampleRate * ms) / 1000));

/**
 * Rivelatore sincrono a frequenza fissa. Si moltiplica l'ingresso per un seno e un coseno alla
 * frequenza di riferimento e si media: tutto ciò che non sta a QUELLA frequenza si media a zero.
 * È il motivo per cui il ronzio di rete non ci disturba, invece di doverlo filtrare.
 */
export class LockIn {
  private i = 0;
  private q = 0;
  private n = 0;
  /** Frequenza EFFETTIVA (agganciata al bin), che può scostarsi di qualche Hz da quella chiesta. */
  readonly freqHz: number;

  constructor(
    requestedHz: number,
    readonly sampleRate: number,
    readonly windowN: number,
  ) {
    this.freqHz = snapToBin(requestedHz, sampleRate, windowN);
  }

  /** Un campione alla volta. Restituisce un risultato SOLO quando la finestra si chiude. */
  push(sample: number): LockInResult | null {
    const w = (2 * Math.PI * this.freqHz * this.n) / this.sampleRate;
    this.i += sample * Math.cos(w);
    this.q += sample * Math.sin(w);
    this.n++;
    if (this.n < this.windowN) return null;

    // Moltiplicare un coseno per un coseno dà METÀ ampiezza → il fattore 2 la restituisce.
    const iN = this.i / this.windowN;
    const qN = this.q / this.windowN;
    const out: LockInResult = {
      amplitude: 2 * Math.hypot(iN, qN),
      phase: Math.atan2(qN, iN),
    };
    this.i = 0; this.q = 0; this.n = 0;
    return out;
  }

  reset(): void { this.i = 0; this.q = 0; this.n = 0; }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// CALIBRAZIONE A DUE PUNTI
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** Costanti della catena di misura, ricavate da due resistenze note. */
export interface Calibration {
  /** Resistenza di riferimento VERA (Ω) — comprende la tolleranza del componente. */
  rRef: number;
  /** Prodotto « ampiezza d'uscita × guadagno d'ingresso », nelle unità dei campioni.
   *  Non serve conoscerli separatamente: nel partitore compare solo il loro prodotto. */
  k: number;
}

/**
 * Risolve rRef e k da due misure con resistenze NOTE.
 *
 *   m = k · R / (rRef + R)
 *
 * Con r = m1/m2 si arriva in forma chiusa a:
 *   rRef = R1·R2·(1 − r) / (r·R2 − R1)
 *   k    = m1·(rRef + R1) / R1
 *
 * Restituisce null se i due punti sono degeneri (troppo vicini, o misure nulle): meglio
 * rifiutare la taratura che restituire ohm inventati.
 */
export const solveTwoPointCalibration = (
  m1: number, r1: number,
  m2: number, r2: number,
): Calibration | null => {
  if (!(m1 > 0) || !(m2 > 0) || !(r1 > 0) || !(r2 > 0)) return null;
  if (Math.abs(r1 - r2) < 1e-9) return null;

  const r = m1 / m2;
  const den = r * r2 - r1;
  if (Math.abs(den) < 1e-9) return null;

  const rRef = (r1 * r2 * (1 - r)) / den;
  if (!Number.isFinite(rRef) || rRef <= 0) return null;

  const k = (m1 * (rRef + r1)) / r1;
  if (!Number.isFinite(k) || k <= 0) return null;

  return { rRef, k };
};

/** Taratura di ripiego, con R_ref nominale e nessuna conoscenza del guadagno: serve solo a far
 *  girare qualcosa prima di calibrare. I suoi ohm NON sono attendibili. */
export const fallbackCalibration = (): Calibration => ({ rRef: CAN_R_REF_NOMINAL, k: 1 });

/**
 * Inverte il partitore: dalla misura grezza agli ohm.
 *   m = k·R/(rRef+R)   →   R = rRef·m/(k − m)
 * Restituisce null se m ≥ k (fisicamente impossibile: significa saturazione o taratura sbagliata).
 */
export const resistanceFromRaw = (m: number, cal: Calibration): number | null => {
  if (!(m > CAN_SILENCE_FLOOR)) return null;      // canale muto: nessun contatto
  const den = cal.k - m;
  if (den <= 0) return null;                       // fuori scala verso il basso
  const r = (cal.rRef * m) / den;
  return Number.isFinite(r) && r > 0 ? r : null;
};

// ═══════════════════════════════════════════════════════════════════════════════════════════
// SCALA DEL TONO DI RON
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * Mappa la resistenza sulla scala −40 .. +40 secondo la specifica di Ron:
 * la resistenza TOTALE sta a −40, la resistenza ZERO sta a +40. Ottanta unità in otto
 * divisioni da dieci, con la Morte allo zero.
 *
 *   tono = 40 − 80 · (R / R_totale)
 *
 * ⚠️ Il significato ASSOLUTO di questo numero dipende da cosa sia « R_totale », che è ancora
 * una domanda aperta con Ron — e che comunque dipende dagli ELETTRODI usati. Finché non c'è
 * risposta, questo valore va presentato come RELATIVO al setup, non come tono assoluto.
 */
export const toneFromResistance = (rOhm: number, rTotal: number): number => {
  if (!(rTotal > 0)) return 0;
  const t = TONE_SCALE_MAX - 2 * TONE_SCALE_MAX * (rOhm / rTotal);
  return Math.max(-TONE_SCALE_MAX, Math.min(TONE_SCALE_MAX, t));
};

/** Inversa: a quale resistenza corrisponde un tono. Serve per disegnare le tacche del quadrante. */
export const resistanceFromTone = (tone: number, rTotal: number): number =>
  (rTotal * (TONE_SCALE_MAX - tone)) / (2 * TONE_SCALE_MAX);

/** Quale delle OTTO divisioni da dieci contiene questo tono: 0 = [−40,−30) … 7 = [30,40].
 *  Le ETICHETTE delle divisioni non sono qui: Ron ne indica il numero ma non le nomina,
 *  e non è compito nostro inventarle. */
export const toneDivisionIndex = (tone: number): number => {
  const t = Math.max(-TONE_SCALE_MAX, Math.min(TONE_SCALE_MAX, tone));
  return Math.max(0, Math.min(7, Math.floor((t + TONE_SCALE_MAX) / 10)));
};

/** La Morte sta allo ZERO — nona voce del display laterale, oltre alle otto divisioni.
 *  `eps` è una scelta di PRESENTAZIONE (uno zero esatto non esiste in virgola mobile),
 *  non un dato: da rivedere quando Ron dà le etichette. */
export const isAtDeath = (tone: number, eps = 0.5): boolean => Math.abs(tone) < eps;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// IL METER
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** Una lettura completa della sonda. */
export interface CanReading {
  /** Ohm alla frequenza BASSA — pelle + profondo. È questo il « TA ». */
  rLowOhm: number;
  /** Ohm alla frequenza ALTA — quasi solo il percorso profondo. */
  rHighOhm: number;
  /** Componente CUTANEA stimata (Ω): rLow − rHigh. È qui che vive il sudore. */
  rSkinOhm: number;
  /** rLow lisciato — il valore da mostrare, per non far tremolare la lettura. */
  rSmoothOhm: number;
  /** Sfasamento al tono basso (rad): informazione reattiva, registrata per l'analisi. */
  phaseLow: number;
}

/**
 * Mette insieme i due lock-in, la taratura e la lisciatura.
 * Si alimenta con i campioni dell'ingresso audio; produce una lettura ogni finestra
 * (~10 al secondo con i valori di default), che è abbondante per l'EDA — lenta di natura.
 */
export class CanMeter {
  private readonly low: LockIn;
  private readonly high: LockIn;
  private smoothed = 0;
  /** Taratura per ciascun tono: la risposta della scheda NON è piatta in frequenza,
   *  quindi il guadagno k va misurato SEPARATAMENTE alle due frequenze. */
  private calLow: Calibration = fallbackCalibration();
  private calHigh: Calibration = fallbackCalibration();
  /** true finché non è stata caricata una taratura vera: gli ohm sono indicativi. */
  calibrated = false;

  constructor(
    readonly sampleRate: number,
    lowHz = CAN_TONE_LOW_HZ,
    highHz = CAN_TONE_HIGH_HZ,
    windowMs = CAN_LOCKIN_WINDOW_MS,
  ) {
    const n = windowSamples(sampleRate, windowMs);
    this.low = new LockIn(lowHz, sampleRate, n);
    this.high = new LockIn(highHz, sampleRate, n);
  }

  /** Frequenze EFFETTIVE usate (agganciate ai bin): vanno mostrate nella diagnostica,
   *  perché possono scostarsi da quelle chieste. */
  get frequencies(): { lowHz: number; highHz: number } {
    return { lowHz: this.low.freqHz, highHz: this.high.freqHz };
  }

  setCalibration(low: Calibration, high: Calibration): void {
    this.calLow = low;
    this.calHigh = high;
    this.calibrated = true;
  }

  /** Le AMPIEZZE GREZZE dei due toni, senza passare per la taratura.
   *  È quello che serve durante la CALIBRAZIONE, quando al posto della persona c'è una
   *  resistenza nota e la taratura è per definizione ancora ignota. */
  pushRaw(sample: number): { low: LockInResult; high: LockInResult } | null {
    const l = this.low.push(sample);
    const h = this.high.push(sample);
    return l && h ? { low: l, high: h } : null;
  }

  /** Un campione. Restituisce una lettura solo quando la finestra si chiude, e solo se
   *  il segnale è utilizzabile: senza contatto restituisce null invece di un numero falso. */
  push(sample: number): CanReading | null {
    const raw = this.pushRaw(sample);
    if (!raw) return null;
    const { low: l, high: h } = raw;

    const rLow = resistanceFromRaw(l.amplitude, this.calLow);
    const rHigh = resistanceFromRaw(h.amplitude, this.calHigh);
    if (rLow === null || rHigh === null) return null;

    this.smoothed = this.smoothed === 0
      ? rLow
      : this.smoothed * (1 - CAN_SMOOTH) + rLow * CAN_SMOOTH;

    return {
      rLowOhm: rLow,
      rHighOhm: rHigh,
      // La pelle non può essere negativa: se il tono alto legge PIÙ del basso è rumore o
      // taratura sbagliata, non una pelle « negativa ».
      rSkinOhm: Math.max(0, rLow - rHigh),
      rSmoothOhm: this.smoothed,
      phaseLow: l.phase,
    };
  }

  /** Un blocco intero (come arriva dalla scheda audio). Restituisce le letture completate. */
  pushBlock(samples: ArrayLike<number>): CanReading[] {
    const out: CanReading[] = [];
    for (let i = 0; i < samples.length; i++) {
      const r = this.push(samples[i]);
      if (r) out.push(r);
    }
    return out;
  }

  reset(): void {
    this.low.reset();
    this.high.reset();
    this.smoothed = 0;
  }
}
