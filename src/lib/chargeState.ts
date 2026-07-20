/**
 * chargeState — classify the preclear's relationship to the MASS, for a single
 * colour/label shared by BOTH the sphere (halo) and the needle (ago PLUS) views.
 *
 * Auditing model (user-specified):
 *   • MASS present = orange halo (charge on the case).
 *   • When mass is present there are two OPPOSITE conditions, told apart by the
 *     PROCESSED velocity (the SOL/SEC readout = smoothVProc), NOT by the needle:
 *       1. EFFETTO DELLA MASSA — velocity LOW → the PC is the *effect* of the
 *          mass (stuck / in resistance).
 *       2. CAUSA SULLA MASSA — velocity HIGH → the PC is *cause*, mocking it up
 *          (a Floating Needle can coexist here).
 *   • LIBERAZIONE · RILASCIO ATTIVO — a genuine release (F/N + Tone-Arm blow
 *     down). Takes priority: it is the meaningful "good" state.
 *
 * One function → one colour → used for the halo core AND the needle arc, so the
 * two visualisations always agree (the user's explicit request).
 */

// Charge LIFECYCLE (user model, 2026-06): a contacted mass goes
//   CONTACT (charge present) → DISCHARGE (releasing) → AS-IS (signature gone).
// (The old effect/cause polarity is folded into CONTACT.)
export type ChargeStateId = 'neutral' | 'contact' | 'discharge' | 'asis';

export interface ChargeState {
  id: ChargeStateId;
  /** Primary accent — needle arc stroke + halo glow. */
  color: string;
  /** Radial-gradient stops for the halo core (outer→inner depth). */
  core: { c1: string; c2: string; c3: string; c4: string };
  /** Inner glow colour for the halo. */
  inner: string;
  /** i18n key for the on-screen label (empty for neutral = no label). */
  labelKey: string;
}

// ── Calibratable thresholds ──────────────────────────────────────────────────
// qL (theta mass): worker tZone steps are qL>0.5 / 0.8 / 1.2. "Significant mass"
// ≈ tZone 2 → orange halo present.
export const CHARGE_MASS_MIN   = 0.8;

const NEUTRAL: ChargeState = {
  // STYLE B : au repos, monochrome (gris clair) plutôt que cyan.
  id: 'neutral', color: '#cbd5e6', labelKey: '',
  core: { c1: '#eef4ff', c2: '#cbd5e6', c3: '#aab6c8', c4: '#8592a6' }, inner: '#ffffff',
};
// CONTACT — charge present on the case (red-orange). Merges the old effect+cause.
const CONTACT: ChargeState = {
  // Redesign verre : CONTACT = ROUGE (halo rétroéclairé rouge sous une ligne blanche).
  id: 'contact', color: '#ff5a5a', labelKey: 'charge_contact',
  core: { c1: '#ffd7d7', c2: '#ff6b6b', c3: '#e11d48', c4: '#7f1d1d' }, inner: '#ffb4b4',
};
// DISSOLUTION — décharge active. Redesign verre : CYAN (halo cyan rétroéclairé).
const DISCHARGE: ChargeState = {
  id: 'discharge', color: '#37e0ff', labelKey: 'charge_discharge',
  core: { c1: '#d6f7ff', c2: '#5fe3ff', c3: '#22c9ee', c4: '#0e7ea0' }, inner: '#a6f0ff',
};
// AS-IS — the contacted mass's energetic signature (qL + I_m) has collapsed and
// the needle floats: the charge is gone (bright cyan/white = resolution).
const ASIS: ChargeState = {
  // Brilliant white-cyan (user: "più cyan o bianco splendente") — clearly apart
  // from the green DISCHARGE, reads as resolution/EP.
  id: 'asis', color: '#f4f8ff', labelKey: 'charge_asis',
  core: { c1: '#ffffff', c2: '#f0f6ff', c3: '#dbe8ff', c4: '#b8cdf0' }, inner: '#ffffff',
};

/**
 * @param mass           theta mass (qL)
 * @param releaseActive  true on a genuine active release (stableReleaseState==='active')
 * @param asIs           true once the contacted mass's signature has collapsed
 *                       (qL + I_m ≤ ~20% of episode peak, with F/N) — see
 *                       engine/ChargeEpisodeTracker.
 */
export function chargeState(
  mass: number, releaseActive: boolean, asIs: boolean = false,
): ChargeState {
  // 1. AS-IS wins: the mass that WAS here has fully discharged (signature gone).
  if (asIs) return ASIS;
  // 2. Active release in progress.
  if (releaseActive) return DISCHARGE;
  // 3. Charge present on the case.
  if (mass >= CHARGE_MASS_MIN) return CONTACT;
  // 4. Nothing significant.
  return NEUTRAL;
}

// Phase → ChargeState lookup. The cycle phase now comes from the CycleStateMachine
// (a per-item FSM with dwell + hysteresis), NOT from instantaneous qL/release — so
// the display has memory and doesn't ping-pong. chargeState() above is kept for the
// few remaining instantaneous call-sites.
const BY_ID: Record<ChargeStateId, ChargeState> = {
  neutral: NEUTRAL, contact: CONTACT, discharge: DISCHARGE, asis: ASIS,
};
export function chargeStateById(id: ChargeStateId): ChargeState {
  return BY_ID[id] ?? NEUTRAL;
}
