/**
 * ReactionClassifier — needle-reaction classification from the VISIBLE needle
 * movement (CONN-95/96), extracted from App.tsx (SessionEngine slice 1).
 * Pure TS, no React. Also the single home of the reaction tables.
 *
 * Logic (unchanged, bit-per-bit):
 *   • moveR = rightward fall of the rendered offset over the last ~0.5 s —
 *     known scale (−0.35 Set … +0.90 max), matches what the auditor SEES.
 *   • F/N (CONN-96) = sustained fluid back-and-forth over ~2.5 s: ≥3 direction
 *     reversals, bounded amplitude, little net drift. Takes precedence so a
 *     clean float is not chopped into little Falls.
 *   • LF Blow Down (ROGER-FIX) = the needle REACHES the right edge (≥0.82),
 *     not merely a big movement.
 *   • Dirty Needle = sustained (≥3 s) IL in the dirty range.
 */

export interface OffsetSample { time: number; offset: number }

export interface ClassifyInput {
  /** Rendered-needle offset history (App's needleOffsetHistoryRef). */
  offH: OffsetSample[];
  /** Session-relative seconds now. */
  nowS: number;
  /** Sustained-IL dirty-range flag (computed by the caller from IL and s). */
  inDirtyRange: boolean;
  isBpmArtifact: boolean;
  isMotionArtifact: boolean;
  isStall: boolean;
  /**
   * EEG-LOCK F/N prior (fnWithHysteresis || hasStableAlphaFn) : le lock qL est clairement
   * en FLOAT. Un vrai F/N = lock stable + oscillation ; quand le lock flotte, les allers-
   * retours de l'aiguille SONT le F/N — on ne les décompose pas en Fall/Long Fall (seul un
   * vrai Blow Down au bord échappe). Défaut false → comportement mouvement seul (rétro-compat).
   */
  lockFloating?: boolean;
}

// ── Reaction tables — single source of truth ────────────────────────────────
export const REACTION_LABELS: Record<string, string> = {
  'reaction_tick': 'Tick',
  'reaction_stuck': 'Stuck',
  'reaction_blow_down': 'LF Blow Down',
  'reaction_fn': 'F/N (Floating)',
  'reaction_dirty': 'Dirty Needle',
  'reaction_long_fall': 'Long Fall',
  'reaction_fall': 'Fall',
  'reaction_sf': 'SF',
  'reaction_none': 'Set',
};
export const LOGGABLE_REACTIONS = new Set([
  'reaction_fn', 'reaction_blow_down', 'reaction_long_fall',
  'reaction_fall', 'reaction_sf', 'reaction_dirty', 'reaction_stuck',
]);
/** Needle offsets for the LOCAL movement-based classifier (METRICS_UPDATE path). */
export const REACTION_OFFSETS: Record<string, number> = {
  'reaction_blow_down': 0.95, 'reaction_long_fall_blow_down': 0.98, 'reaction_long_fall': 0.68, 'reaction_fall': 0.42,
  'reaction_dirty': 0.30, 'reaction_sf': 0.20, 'reaction_tick': 0.07,
  'reaction_stuck': 0.00, 'reaction_fn': -0.35, 'reaction_none': -0.35  // STUCK = immobile, LF BLOW DOWN = zone TEST, NONE = torna a SET
};
/** Needle offsets for the worker's F_N_REACTION event path (legacy values kept
 *  EXACTLY as calibrated — do not merge with REACTION_OFFSETS without a live
 *  session to re-validate the needle feel). */
export const FN_EVENT_OFFSETS: Record<string, number> = {
  'reaction_blow_down': 0.95, 'reaction_long_fall_blow_down': 0.98, 'reaction_fall': 0.42,
  'reaction_tick': 0.07, 'reaction_stuck': 0.00  // STUCK = immobile, LF BLOW DOWN = zone TEST
};

/** Amplitude MINIMALE d'un vrai float (« as small as one inch » HCOB, ~1 pouce de cadran) :
 *  en dessous c'est une micro-oscillation / du bruit, PAS un F/N. Coupe les faux F/N sur une
 *  oscillation « strettissima ». */
const FN_MIN_AMPL = 0.06;
/** DURÉE MINIMALE (s) : le F/N n'est indiqué QUE si l'oscillation symétrique dure au moins ce
 *  temps → pas de F/N sur un flash. RÉÉQUILIBRÉ : 3.0 s rendait le F/N (et donc l'AS-IS, qui en
 *  dépend) quasi impossible → on revient à un court délai de confirmation. */
const FN_MIN_DURATION = 0.8;

export class ReactionClassifier {
  /**
   * L'ULTIMO `moveR` calcolato — la caduta a destra dell'ago virtuale in ~0,5 s, cioè la
   * grandezza su cui il grado è deciso davvero.
   *
   * Serve perché l'ampiezza archiviata per il MUSE era `REACTION_OFFSETS[chiave]`, cioè un
   * valore RICAVATO DALL'ETICHETTA: due Long Fall diversissimi finivano nell'archivio con lo
   * stesso numero, e ogni correlazione di ampiezza col meter era condannata in partenza. Questa
   * è la misura, non la sua ricaduta.
   */
  lastMoveR = 0;
  /** When the current dirty-range stretch began (null = not in range). */
  private dirtyStart: number | null = null;
  /** Session-seconds when the CURRENT continuous symmetric oscillation began (null = none). */
  private floatStart: number | null = null;
  /** Last session-seconds at which a genuine oscillation was observed (bridges swing dips). */
  private lastOscT: number | null = null;

  /** One classification per worker cycle → reaction key. */
  classify(input: ClassifyInput): string {
    const { offH, nowS, inDirtyRange, isBpmArtifact, isMotionArtifact, isStall } = input;

    // Dirty-needle persistence bookkeeping (reset the moment we leave range).
    if (!inDirtyRange) this.dirtyStart = null;

    // Rightward fall over ~0.5 s of the VISIBLE needle.
    const curOff = offH.length ? offH[offH.length - 1].offset : -0.35;
    let pastOff = curOff;
    for (let i = offH.length - 1; i >= 0; i--) {
      if (offH[i].time <= nowS - 0.5) { pastOff = offH[i].offset; break; }
    }
    const moveR = curOff - pastOff;
    this.lastMoveR = moveR;

    // CONN-96: PROPER F/N — a SMOOTH, RHYTHMIC, SUSTAINED, BALANCED back-and-forth over
    // ~2.5 s. The key discriminator against a "small movement": a real float travels
    // roughly EQUALLY up and down (it oscillates around a centre), while a one-way move or
    // a noisy twitch does not. So instead of just counting direction changes (which noise
    // can fake), we sum the up-travel and down-travel and require them to be BALANCED and
    // SUSTAINED — plus reversals, appreciable amplitude, and little net drift.
    const FN_STEP = 0.003;   // per-tick deadband — below this = noise, not a swing
    const fnWin = offH.filter(p => p.time >= nowS - 2.5);
    let dirChanges = 0, mn = Infinity, mx = -Infinity, prevSign = 0, up = 0, down = 0;
    for (let i = 1; i < fnWin.length; i++) {
      const d = fnWin[i].offset - fnWin[i - 1].offset;
      const sg = d > FN_STEP ? 1 : d < -FN_STEP ? -1 : 0;
      if (sg > 0) up += d; else if (sg < 0) down += -d;
      if (sg !== 0) { if (prevSign !== 0 && sg !== prevSign) dirChanges++; prevSign = sg; }
      if (fnWin[i].offset < mn) mn = fnWin[i].offset;
      if (fnWin[i].offset > mx) mx = fnWin[i].offset;
    }
    const fnAmpl  = mx === -Infinity ? 0 : mx - mn;
    const fnDrift = Math.abs(curOff - (fnWin.length ? fnWin[0].offset : curOff));
    // Balance ∈ [0,1]: 1 = perfectly balanced up/down (true oscillation), ~0 = one-way.
    // This is the KEY discriminator vs a "small movement": a one-way move has balance≈0.
    const fnBalance = Math.max(up, down) > 0 ? Math.min(up, down) / Math.max(up, down) : 0;
    const fnSpan = !!fnWin.length && fnWin[0].time <= nowS - 1.5; // enough history to judge
    // ── F/N (déf. HCOB) : oscillation SYMÉTRIQUE, SANS chute à droite, d'ampleur ≥ 1 pouce, qui DURE.
    //   « as small as one inch … as large as dial wide » → ampleur 1 pouce … dial-wide (0.10 … 1.0).
    //   « does not fall or drop to the right »           → pas de dérive nette, surtout pas à droite.
    //   « moves left at the same speed as it moves right »→ symétrie up/down élevée (balance).
    //   « seulement s'il dure plus longtemps » (user)     → oscillation CONTINUE ≥ FN_MIN_DURATION.

    // Un vrai BLOW DOWN = l'aiguille TOUCHE le bord droit (peg) : lecture distincte, jamais un F/N.
    const isBlowDownNow = moveR > 0.26 && curOff >= 0.82;

    // Aiguille (quasi) IMMOBILE sur ~0.8 s → aucune oscillation en cours.
    const recWin = offH.filter(p => p.time >= nowS - 0.8);
    let rmn = Infinity, rmx = -Infinity;
    for (const p of recWin) { if (p.offset < rmn) rmn = p.offset; if (p.offset > rmx) rmx = p.offset; }
    const recentAmpl = rmx === -Infinity ? 0 : rmx - rmn;
    const needleStill = recWin.length >= 3 && recentAmpl < 0.025;

    // Déplacement NET signé sur la fenêtre : > 0 = a glissé vers la DROITE (chute) → pas un F/N.
    const netRight = curOff - (fnWin.length ? fnWin[0].offset : curOff);

    // « En train de flotter » MAINTENANT : va-et-vient rythmé, symétrique, sans chute nette à droite.
    // RÉÉQUILIBRÉ (les seuils très stricts empêchaient tout F/N → plus d'AS-IS) : on garde les
    // GARDES légitimes (pas immobile, ampleur ≥ ~1 pouce, symétrie) mais on desserre le reste.
    const oscillatingNow = !needleStill
                         && fnSpan
                         && dirChanges >= 2                       // au moins un vrai aller-retour
                         && fnAmpl > FN_MIN_AMPL && fnAmpl < 1.0    // ~1 pouce … dial-wide
                         && fnBalance > 0.35                        // gauche ≈ même vitesse que droite
                         && fnDrift < 0.14 && netRight < 0.12       // ne tombe pas nettement à droite
                         && (up + down) > 0.12;                     // travel cumulé réel

    // PERSISTANCE — le chrono de durée s'accumule à travers les swings naturels (points de
    // rebroussement où oscillatingNow retombe brièvement) grâce à lastOscT. Il ne se réinitialise
    // qu'à une VRAIE fin de float : oscillation absente > 0.8 s (dérive lente / creep), aiguille
    // figée, ou blow down. → F/N seulement sur une oscillation quasi-CONTINUE et qui DURE.
    if (oscillatingNow) {
      this.lastOscT = nowS;
      if (this.floatStart === null) this.floatStart = nowS;
    }
    const oscLapsed = this.lastOscT === null || (nowS - this.lastOscT) > 1.2;
    if (isBlowDownNow || needleStill || oscLapsed) this.floatStart = null;
    // F/N indiqué UNIQUEMENT si l'oscillation DURE depuis ≥ FN_MIN_DURATION et n'est pas finie.
    const sustained = this.floatStart !== null && (nowS - this.floatStart) >= FN_MIN_DURATION;
    const fnActive = sustained && !needleStill && !isBlowDownNow;

    if (isBpmArtifact || isMotionArtifact) return 'reaction_tick';
    if (isStall) return 'reaction_stuck';
    if (inDirtyRange) {
      if (this.dirtyStart === null) this.dirtyStart = nowS;
      return (nowS - this.dirtyStart) >= 3.0 ? 'reaction_dirty' : 'reaction_tick';
    }
    // F/N takes precedence — a clean float is not chopped into little Falls.
    // A real one-way Fall has high drift → not floating → magnitude branches.
    if (fnActive) return 'reaction_fn';
    if (isBlowDownNow) return 'reaction_blow_down'; // reaches the right edge
    if (moveR > 0.26)  return 'reaction_long_fall';
    if (moveR > 0.14)  return 'reaction_fall';
    if (moveR > 0.06)  return 'reaction_sf';
    if (moveR > 0.025) return 'reaction_tick';
    return 'reaction_none'; // at/returning to Set
  }

  /** Session start — clear persistence (dirty-needle + F/N duration timer). */
  reset(): void {
    this.dirtyStart = null;
    this.floatStart = null;
    this.lastOscT = null;
    this.lastMoveR = 0;
  }
}

/** Singleton — one session pipeline per app instance. */
export const reactionClassifier = new ReactionClassifier();
