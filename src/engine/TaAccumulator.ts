/**
 * TaAccumulator — Tone Arm smoothing + Total TA high-water accumulator,
 * extracted from App.tsx (SessionEngine slice 1). Pure TS, no React.
 *
 * TA Quantum Recalibration — spec §5 NEST V3 (unchanged, bit-per-bit):
 *   target TA = 2.0 + SPAN · (1 − exp(−|mS| · GAIN)), clamped to [2.0, 6.0],
 *   then analog-slow EMA (SMOOTHING_FACTOR 0.04) toward the target.
 *   CONN-93 / 2026-06 user calibration: GAIN 0.6, SPAN 2.1 (rest 2.0, strong
 *   charge tops ~4.1).
 *
 * Total TA — HIGH-WATER MARK (Option A analogique):
 *   only NET descents from the last peak count; re-climbs below the peak are
 *   not re-counted; a genuine new peak (> +0.1 div, CONN-92 dead-band) resets
 *   the counter. Counted in 0.1-div floor steps.
 */

const TA_GAIN_DEFAULT = 0.6;   // gentler rise per unit of charge
const TA_SPAN_DEFAULT = 2.1;   // 2.0 (rest) … up to ~4.1 on strong charge
const SMOOTHING_FACTOR = 0.04; // analogique lent
const TA_CALIB_KEY = 'sm_ta_calib'; // { gain, span, baseline? } persisté (calibration vs meter réel)

/** Quanto vecchio può essere `lastMsAt` per accettare ancora un punto di taratura (ms). Oltre,
 *  il segnale è considerato fermo — v. il commento francese su `lastMsAt`, sotto: « interdit
 *  les captures sur mS figé », senza MUSE che scorre non c'è niente da imparare, solo rumore
 *  congelato. Esportata (non più privata alla classe) — segnalato: « dove hai messo "serve un
 *  secondo punto"? non lo vedo »: l'avviso restava silenzioso proprio quando il MUSE non
 *  trasmetteva affatto (il caso più comune: si prova la TARATURA TA col solo Theta-Meter
 *  collegato), perché contava solo i punti REGISTRATI — mai nessuno, in quel caso, quindi mai
 *  nessun avviso. L'interfaccia (`PannelloMeter.tsx`/`SidebarDrawer.tsx`) ora legge questa
 *  stessa soglia per dire la cosa giusta anche PRIMA che un punto entri davvero. */
export const TA_CALIB_FRESCHEZZA_MS = 3000;

/** COMPRESSION du mS avant la formule TA. Les mS bruts s'étalent sur ~5 ordres de grandeur
 *  (0.003 … 256 dans les données réelles) → l'exponentielle SATURAIT (TA collée au max) et tous
 *  les fits s'effondraient à gain/span minimum. En log, |mS| 0…256 devient ~0…2.4 : réponse
 *  utilisable et fittable. (Le mS BRUT reste exposé via lastMs pour l'affichage.) */
const msCompress = (mS: number): number => Math.log10(1 + Math.abs(mS));

export interface TaCalibration { baseline: number; gain: number; span: number; }

/** Una coppia di taratura: mS GIÀ compresso (`msCompress`, non il grezzo) e il TA di
 *  riferimento letto sul Theta-Meter VERO in quello stesso istante. */
export interface TaCalibPoint { m: number; ta: number; }

/**
 * ⚠️ AGGIUNTO — segnalato: « quando entro il valore del TA su Theta-Meter, dovresti cambiare
 * il TA del MUSE che appare ». `lastMs`/`taForMs` esistevano già « pour capturer des paires
 * (mS, TA_meter) et faire le fit » (v. il commento su `lastMs`, sotto) — ma nessuna interfaccia
 * chiamava mai `setCalibration` con un fit vero: verificato, zero chiamanti in tutto il
 * deposito. Il numero restava quello di fabbrica (GAIN 0.6, SPAN 2.1) per sempre, indifferente
 * a qualunque confronto fatto col Theta-Meter reale.
 *
 * ── PERCHÉ UN FIT, E NON UNA RETTA ────────────────────────────────────────────────────────
 * Il modello (v. `taForMs`) è `TA = baseline + span·(1 − exp(−m·gain))` — non lineare in
 * `gain`. Con `baseline` FISSO (è per persona, sesso — v. `setBaseline` — non per strumento:
 * la calibrazione qui è dichiaratamente « instrument-level, indép. du PC »), restano due
 * incognite accoppiate in modo non lineare: non c'è una formula chiusa per `gain` da due punti
 * qualunque.
 *
 * ── IL METODO — PROIEZIONE VARIABILE, SENZA LIBRERIE ────────────────────────────────────────
 * Per un `gain` FISSATO, `x_i = 1 − exp(−m_i·gain)` è un numero noto per ogni punto: lo `span`
 * migliore (minimi quadrati, retta per l'origine spostata di `baseline`) ha allora una formula
 * chiusa — `span = Σ(x_i·(ta_i−baseline)) / Σ(x_i²)`. Resta una sola incognita, `gain`, su cui
 * cercare il minimo dell'errore residuo: una ricerca a griglia (due passate, una grossa poi una
 * fine intorno al meglio trovato) — niente Gauss-Newton, niente derivate, solo `Math.exp`
 * valutato N_GRIGLIA × N_PUNTI volte, un costo trascurabile per una manciata di punti presi a
 * mano in seduta.
 *
 * Con UN punto solo il sistema è indeterminato (una famiglia intera di coppie gain/span passa
 * esattamente per un punto): si aspetta il secondo prima di correggere qualunque cosa — il
 * numero di fabbrica resta buono fino ad allora, invece di saltare su un fit arbitrario.
 */
const GAIN_MIN = 0.05, GAIN_MAX = 3;   // stessi limiti di setCalibration, sotto
const FIT_GRID_COARSE = 60, FIT_GRID_FINE = 60;

const spanForGain = (points: TaCalibPoint[], baseline: number, gain: number): number => {
  let sxx = 0, sxy = 0;
  for (const p of points) {
    const x = 1 - Math.exp(-p.m * gain);
    sxx += x * x;
    sxy += x * (p.ta - baseline);
  }
  return sxx > 1e-9 ? sxy / sxx : 0;
};

const sseForGain = (points: TaCalibPoint[], baseline: number, gain: number, span: number): number => {
  let sse = 0;
  for (const p of points) {
    const pred = baseline + span * (1 - Math.exp(-p.m * gain));
    const d = p.ta - pred;
    sse += d * d;
  }
  return sse;
};

/** Cerca il miglior (gain, span) su una griglia entro [lo, hi], N campioni. */
const gridSearch = (
  points: TaCalibPoint[], baseline: number, lo: number, hi: number, n: number,
): { gain: number; span: number; sse: number } => {
  let best = { gain: lo, span: spanForGain(points, baseline, lo), sse: Infinity };
  for (let i = 0; i < n; i++) {
    const gain = lo + (hi - lo) * (i / (n - 1));
    const span = spanForGain(points, baseline, gain);
    const sse = sseForGain(points, baseline, gain, span);
    if (sse < best.sse) best = { gain, span, sse };
  }
  return best;
};

/**
 * Il FIT vero e proprio: due passate di `gridSearch` (grossa su tutto il range, poi fine
 * intorno al meglio trovato) — la seconda passata restringe l'intervallo di un fattore ~30,
 * dando una precisione sul `gain` ben oltre quella con cui lo si userebbe (differenze di
 * TA sotto 0,01 su tutto lo strumento). `null` se i punti sono meno di due: v. la nota sopra.
 */
export const fitGainSpan = (points: TaCalibPoint[], baseline: number): { gain: number; span: number } | null => {
  if (points.length < 2) return null;
  const grosso = gridSearch(points, baseline, GAIN_MIN, GAIN_MAX, FIT_GRID_COARSE);
  const passo = (GAIN_MAX - GAIN_MIN) / (FIT_GRID_COARSE - 1);
  const fine = gridSearch(
    points, baseline,
    Math.max(GAIN_MIN, grosso.gain - passo), Math.min(GAIN_MAX, grosso.gain + passo),
    FIT_GRID_FINE,
  );
  return { gain: fine.gain, span: fine.span };
};

export class TaAccumulator {
  /** Current smoothed Tone Arm (baseline–6.0). */
  toneArm = 2.0;

  /** CLEAR baseline = the rest read when no charge acts on the meter. Constitutional:
   *  man = 3.0, woman = 2.0 (user spec). Charge raises the TA from here; running the
   *  mass brings it back down to the baseline = the clear read. */
  private baseline = 2.0;
  /** CALIBRATION (vs meter réel) : gain + span de la réponse charge→TA. Réglables + persistés
   *  (instrument-level, indép. du PC). GAIN = pente de montée, SPAN = amplitude max. */
  gain = TA_GAIN_DEFAULT;
  span = TA_SPAN_DEFAULT;
  /** Dernier mS BRUT reçu (entrée de la formule) — lu par le panneau de calibration pour
   *  capturer des paires (mS, TA_meter) et faire le fit. */
  lastMs = 0;
  /** Horodatage (Date.now) du dernier update(). Le panneau s'en sert pour savoir si le mS est
   *  VIVANT (session en cours + EEG qui scorre) ou FIGÉ → interdit les captures sur mS figé. */
  lastMsAt = 0;
  /** ⚠️ AGGIUNTO — le coppie (mS compresso, TA di riferimento) da cui `gain`/`span` sono
   *  stati derivati l'ultima volta. Persistite insieme alla calibrazione: senza, ogni nuovo
   *  punto rifarebbe il fit da zero, perdendo quelli già raccolti nelle sedute precedenti. */
  private points: TaCalibPoint[] = [];

  private highWater: number | null = null;
  private countedFromHigh = 0;

  constructor() {
    // Charge la calibration persistée (gain/span ; baseline optionnel).
    try {
      const raw = localStorage.getItem(TA_CALIB_KEY);
      if (raw) {
        const c = JSON.parse(raw);
        if (typeof c?.gain === 'number' && isFinite(c.gain)) this.gain = c.gain;
        if (typeof c?.span === 'number' && isFinite(c.span)) this.span = c.span;
        if (typeof c?.baseline === 'number' && c.baseline > 0) this.baseline = c.baseline;
        if (Array.isArray(c?.points)) {
          this.points = c.points.filter((p: unknown): p is TaCalibPoint =>
            !!p && typeof (p as TaCalibPoint).m === 'number' && typeof (p as TaCalibPoint).ta === 'number'
            && isFinite((p as TaCalibPoint).m) && isFinite((p as TaCalibPoint).ta));
        }
      }
    } catch { /* pas de calibration persistée */ }
  }

  /** Set the clear baseline (man 3.0 / woman 2.0). Snaps a resting needle to it. */
  setBaseline(b: number): void {
    if (!(b > 0) || b === this.baseline) return;
    // If the needle is sitting at (near) the old rest, move it to the new rest too.
    if (Math.abs(this.toneArm - this.baseline) < 0.05) this.toneArm = b;
    this.baseline = b;
  }

  /** Calibration courante (pour l'UI). */
  getCalibration(): TaCalibration { return { baseline: this.baseline, gain: this.gain, span: this.span }; }

  /** Applique + PERSISTE une calibration (depuis les sliders ou le fit auto). */
  setCalibration(c: Partial<TaCalibration>): void {
    if (typeof c.gain === 'number' && isFinite(c.gain)) this.gain = Math.max(0.05, Math.min(3, c.gain));
    if (typeof c.span === 'number' && isFinite(c.span)) this.span = Math.max(0.2, Math.min(4.5, c.span));
    if (typeof c.baseline === 'number' && c.baseline > 0) { this.baseline = c.baseline; if (Math.abs(this.toneArm - this.baseline) < 0.3) this.toneArm = this.baseline; }
    this.persist();
  }

  private persist(): void {
    try {
      localStorage.setItem(TA_CALIB_KEY, JSON.stringify({ ...this.getCalibration(), points: this.points }));
    } catch { /* quota */ }
  }

  /**
   * ⚠️ AGGIUNTO — segnalato: « quando entro il valore del TA su Theta-Meter, dovresti cambiare
   * il TA del MUSE che appare ». Chiamato dalla STESSA azione che registra un punto sulla
   * scala del Theta-Meter (`useThetaMeter.ts`, `addPointFromReference`) — `ta` è già il valore
   * riportato all'equivalente due lattine, la stessa correzione che riceve l'altra scala:
   * le due tarature devono concordare sulla STESSA convenzione, non ciascuna con la propria.
   *
   * Restituisce `null` (nessun effetto) in due casi, entrambi onesti piuttosto che sbagliati
   * in silenzio:
   *   · il segnale è FERMO (`lastMsAt` più vecchio di `TA_CALIB_FRESCHEZZA_MS`) — senza MUSE
   *     che scorre non c'è niente da imparare, solo un numero congelato spacciato per una
   *     lettura;
   *   · resta UN punto solo dopo l'aggiunta — il sistema (gain, span) è indeterminato con un
   *     punto solo (v. la nota grande su `fitGainSpan`, sopra): si accumula, non si corregge
   *     ancora nulla, finché non ne arriva un secondo.
   */
  addCalibrationPoint(ta: number): TaCalibration | null {
    if (!Number.isFinite(ta)) return null;
    if (Date.now() - this.lastMsAt > TA_CALIB_FRESCHEZZA_MS) return null;
    const m = msCompress(this.lastMs);
    // Si sostituisce un punto quasi coincidente invece di affiancarlo — stessa ragione di
    // `addPointFromReference` (Theta-Meter): due punti sullo stesso mS renderebbero il fit
    // instabile (il denominatore `Σx²` diventerebbe quasi degenere fra i due).
    const tenuti = this.points.filter(p => Math.abs(p.m - m) > 0.02);
    const nuovi = [...tenuti, { m, ta }];
    const fit = fitGainSpan(nuovi, this.baseline);
    this.points = nuovi;
    if (fit) { this.gain = fit.gain; this.span = fit.span; }
    this.persist();
    return this.getCalibration();
  }

  /** I punti di taratura raccolti finora — per l'UI (« N punti », un modo di annullare). */
  getCalibrationPoints(): TaCalibPoint[] { return [...this.points]; }

  /** Torna alla taratura di fabbrica, senza punti — stesso gesto di `clearTaScale` per la
   *  scala del Theta-Meter, per lo strumento che ricostruisce dall'EEG. */
  clearCalibration(): void {
    this.gain = TA_GAIN_DEFAULT; this.span = TA_SPAN_DEFAULT; this.points = [];
    this.persist();
  }

  /** TA prédit pour un mS donné avec la calibration COURANTE (utilisé par le fit / preview). */
  taForMs(mS: number, cal?: Partial<TaCalibration>): number {
    const base = cal?.baseline ?? this.baseline;
    const g = cal?.gain ?? this.gain;
    const sp = cal?.span ?? this.span;
    const m = msCompress(mS);
    return Math.min(6.0, Math.max(base, base + sp * (1 - Math.exp(-m * g))));
  }

  /**
   * Feed one worker cycle. Returns the freshly-counted Total-TA divisions
   * (≥ 0.1 when a new net descent was counted, else 0).
   */
  update(mS: number, running: boolean): number {
    this.lastMs = mS;
    this.lastMsAt = Date.now();
    const m = msCompress(mS);   // compression log → plus de saturation de l'exponentielle
    const targetTa = this.baseline + this.span * (1 - Math.exp(-m * this.gain));
    const targetTaClamped = Math.min(6.0, Math.max(this.baseline, targetTa));
    const nextTa = Math.min(6.0, Math.max(this.baseline,
      (this.toneArm * (1 - SMOOTHING_FACTOR)) + (targetTaClamped * SMOOTHING_FACTOR)
    ));
    this.toneArm = nextTa;

    let newDivisions = 0;
    if (!running) {
      this.highWater = nextTa;
      this.countedFromHigh = 0;
    } else if (isFinite(nextTa)) {
      if (this.highWater === null) {
        this.highWater = nextTa;
        this.countedFromHigh = 0;
      } else if (nextTa > this.highWater + 0.1) {
        // CONN-92: only a GENUINE rise (> 0.1 div) sets a new peak — micro
        // upticks must not re-arm the counter (Total TA inflation).
        this.highWater = nextTa;
        this.countedFromHigh = 0;
      } else {
        // Descent from the peak: count only the portion not yet counted.
        const totalDrop = this.highWater - nextTa;
        const countableFloor = Math.floor(totalDrop * 10) / 10; // 0.1-div floor
        const delta = Math.round((countableFloor - this.countedFromHigh) * 100) / 100;
        if (delta >= 0.1) {
          newDivisions = delta;
          this.countedFromHigh = countableFloor;
        }
      }
    }
    return newDivisions;
  }

  /** Session start: re-arm the high-water tracker. (toneArm intentionally NOT
   *  reset — matches the previous App.tsx behaviour.) */
  resetSession(): void {
    this.highWater = null;
    this.countedFromHigh = 0;
  }
}

/** Singleton — one session pipeline per app instance. */
export const taAccumulator = new TaAccumulator();
