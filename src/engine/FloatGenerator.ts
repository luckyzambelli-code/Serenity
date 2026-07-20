/**
 * FloatGenerator — mouvement de l'aiguille pendant un FLOATING NEEDLE, structuré en 5 MODES
 * d'après la vidéo de référence étiquetée (guide analogique « F:N.mov », 2026-07-13) :
 *
 *   1) normal      — Floating Needle : va-et-vient LISSE, symétrique, ampleur petite/moyenne
 *                    autour de SET (reste dans la zone centrale RISE–SET–FALL).
 *   2) persistent  — Persistent Floating Needle : même forme, plus régulière/soutenue.
 *   3) spring      — « springs at the end and does not flow » : oscille près de SET mais REBONDIT
 *                    sèchement aux extrêmes (fin de course brusque) au lieu de couler.
 *   4) instant     — Instant Floating Needle : le CENTRE du float est décalé vers la droite (FALL),
 *                    l'aiguille flotte là, pas autour de SET.
 *   5) tone_arm    — Floating Tone Arm : balayage LARGE, bidirectionnel, cyclique (descend à droite/
 *                    FALL « blows down », remonte à gauche/RISE « rises », et répète) — traverse
 *                    presque tout le cadran, avec un lent glissement du centre (on « suit à la molette »).
 *
 * PARAMÈTRES QUALITATIFS pour l'instant (ampleurs/périodes estimées à l'œil sur la vidéo) →
 * À TARER sur les screen-recordings dédiés (un par ampleur). C'est de la PRÉSENTATION (rendu de
 * l'aiguille), aucun calcul DSP touché. Offsets dans l'échelle du cadran de QuantumSphere
 * (SET = -0.35 ; bords ~[-0.98, 0.96] ; zone Fall ≥ 0.13).
 */
export type FnMode = 'normal' | 'persistent' | 'instant' | 'tone_arm';

const SET = -0.35; // = SET_OFFSET de QuantumSphere

interface FnProfile {
  amp: number;              // demi-amplitude de base (offset cadran)
  period: number;          // période de base (s)
  center: number;          // centre du float
  breathAmp: number;       // modulation LENTE d'amplitude (fraction, « respiro »)
  breathPeriod: number;    // période du respiro (s)
  spring: number;          // 0 = sinus lisse … 1 = rebond dur aux extrêmes
  centerSwingAmp: number;  // tone_arm : amplitude de l'oscillation lente du centre
  centerSwingPeriod: number;
  // ── couche « organique » (anti-mécanique). Défaut 0 = mouvement régulier. ──
  freqWobble?: number;     // modulation LENTE de fréquence : chaque va-et-vient dure un peu différemment
  springVary?: number;     // le « ressort » RESPIRE : certains rebonds plus secs que d'autres
  jitter?: number;         // micro-nervosité de position (aiguille vivante, pas un signal parfait)
}

/** Profils par mode. Les commentaires disent ce qu'on a OBSERVÉ ; les nombres sont un 1er jet. */
export const FN_PROFILES: Record<FnMode, FnProfile> = {
  //          amp   period  center      breathAmp breathPer spring  cSwingAmp cSwingPer
  // normal : ralenti (utilisateur « un peu trop rapide ») — va-et-vient posé et lisse autour de SET.
  normal:     { amp: 0.30, period: 3.5, center: SET,        breathAmp: 0.25, breathPeriod: 11, spring: 0.0, centerSwingAmp: 0, centerSwingPeriod: 1 },
  // persistent : SOUTENU, PAS le même battement (couche organique légère : freqWobble + jitter +
  //   respiro marqué → chaque va-et-vient diffère) et PLUS AMPLE que la normale (demande utilisateur :
  //   « l'F/N persistente falla più ampia rispetto alla normale ») → amp 0.42 > 0.30.
  persistent: { amp: 0.42, period: 3.2, center: SET,        breathAmp: 0.28, breathPeriod: 10, spring: 0.0, centerSwingAmp: 0, centerSwingPeriod: 1, freqWobble: 0.8, jitter: 0.015 },
  // instant : centre décalé vers FALL, démarrage immédiat (pas de rampe). La forme est OK (utilisateur) ;
  //   son DÉCLENCHEMENT « à un moment précis (assessment) » est une question de lifecycle, pas de forme.
  instant:    { amp: 0.26, period: 2.5, center: SET + 0.28, breathAmp: 0.20, breathPeriod: 12, spring: 0.10,centerSwingAmp: 0, centerSwingPeriod: 1 },
  // tone_arm : ampleur SUR-PILOTÉE (>1) + centre au MILIEU → touche le bord DROITE (comme si elle voulait
  //   sortir), y presse BRIÈVEMENT, puis RENTRE — pareil à GAUCHE. amp réduit 1.08→1.02 (utilisateur
  //   « moins de délai de retour » : sosta plus courte au bord). Symétrique, pas de centerSwing.
  tone_arm:   { amp: 1.02, period: 5.2, center: -0.01,      breathAmp: 0.04, breathPeriod: 16, spring: 0.0, centerSwingAmp: 0, centerSwingPeriod: 1 },
};

/** Liste ordonnée pour l'UI (sélecteur de style + aperçu), dans les 5 langues.
 *  « Instant » et « Tone Arm » restent tels quels : ce sont les TERMES d'audition. */
export const FN_MODES: { mode: FnMode; it: string; fr: string; en: string; es: string; sv: string }[] = [
  { mode: 'normal',     it: 'Normale',     fr: 'Normal',     en: 'Normal',     es: 'Normal',     sv: 'Normal' },
  { mode: 'persistent', it: 'Persistente', fr: 'Persistant', en: 'Persistent', es: 'Persistente', sv: 'Ihållande' },
  { mode: 'instant',    it: 'Instant',     fr: 'Instant',    en: 'Instant',    es: 'Instant',    sv: 'Instant' },
  { mode: 'tone_arm',   it: 'Tone Arm',    fr: 'Tone Arm',   en: 'Tone Arm',   es: 'Tone Arm',   sv: 'Tone Arm' },
];

const TWO_PI = Math.PI * 2;

/** Bruit LISSE déterministe ∈ ~[-1,1] : somme de sinus à fréquences INCOMMENSURABLES → ne se répète
 *  jamais exactement (contrairement à un sinus unique). `seed` décale la phase pour des flux
 *  indépendants (fréquence / ressort / jitter). Doux (pas de flicker haute fréquence). */
function smoothNoise(t: number, seed: number): number {
  return (
    Math.sin(t * 0.37 + seed) +
    Math.sin(t * 0.71 + seed * 2.3) * 0.6 +
    Math.sin(t * 1.13 + seed * 4.1) * 0.35
  ) / 1.95;
}

/**
 * Offset de l'aiguille pour un mode donné à l'instant `tSec` (secondes depuis le début du float).
 * `ampScale` (défaut 1) permettra plus tard de faire suivre l'ampleur à la FORCE/DURÉE du float
 * détecté (« as small as one inch … as large as dial wide »).
 */
export function floatOffset(mode: FnMode, tSec: number, ampScale = 1): number {
  const p = FN_PROFILES[mode] ?? FN_PROFILES.normal;
  // Respiro : l'ampleur (et donc l'allure) varie LENTEMENT → vivant, pas un générateur parfait.
  const breath = 1 + p.breathAmp * Math.sin((TWO_PI / p.breathPeriod) * tSec + 0.7);
  const amp = p.amp * breath * ampScale;
  // Phase : modulation LENTE de fréquence (freqWobble) → chaque va-et-vient dure un peu différemment,
  // donc le mouvement n'est plus mécanique/identique (surtout pour le « spring », qui est nerveux).
  const ph = (TWO_PI / p.period) * tSec + (p.freqWobble ?? 0) * smoothNoise(tSec * 0.5, 3.0);
  // Forme d'onde : sinus pur (spring 0) → même vitesse gauche/droite (HCOB). Le « spring » ajoute
  // une 3e harmonique EN PHASE : les extrêmes deviennent plus secs/rebondissants (fin de course).
  let w = Math.sin(ph);
  if (p.spring > 0) {
    // Le « ressort » RESPIRE (springVary) : certains rebonds plus secs que d'autres → pas identique.
    const a3 = 0.3 * p.spring * (1 + (p.springVary ?? 0) * smoothNoise(tSec * 0.6, 7.0));
    w = (w + a3 * Math.sin(3 * ph)) / (1 + a3);
  }
  // Tone Arm : le centre glisse lentement (on « suit l'aiguille à la molette »).
  const center = p.center + (p.centerSwingAmp > 0
    ? p.centerSwingAmp * Math.sin((TWO_PI / p.centerSwingPeriod) * tSec)
    : 0);
  // Micro-nervosité de position (jitter) : aiguille vivante, pas une courbe parfaite.
  const pos = center + amp * w + (p.jitter ?? 0) * smoothNoise(tSec * 2.1, 9.0);
  // Reste DANS le cadran (jamais hors bord). Le tone_arm peut friser les bords ; les autres non.
  return Math.max(-0.98, Math.min(0.96, pos));
}
