/**
 * ClearReadDetector — « EQUILIBRIUM » : le TA est revenu à SA BASE constitutionnelle et s'y TIENT.
 *
 * Base = lecture au repos imposée par SEXE (homme 3.0 / femme 2.0, cf. TaAccumulator.setBaseline
 * piloté par pcSex). C'est une CONVENTION (celle des auditeurs depuis les années 60), pas une
 * mesure : ce qui est MESURÉ ici, c'est que la charge est revenue à ~0 — le TA étant clampé à
 * [base, 6], « TA à la base » ≡ « plus de charge ». Donc ce détecteur ne dépend PAS de
 * l'étalonnage absolu du TA (le point faible démontré par les tests Roger).
 *
 * Pourquoi un HOLD : le TA est une EMA LENTE (~6 s) — bien plus lente que le comm lag (~0.5 s).
 * On ne projette donc pas le TA en avant (ce serait imperceptible et bruité) : c'est le
 * « tenu N secondes » qui absorbe le retard et évite de crier EQUILIBRIUM sur un passage fugace.
 *
 * Utilisé par le cycle NULL (RISE → EQUILIBRIUM). Pur TS, pas de React.
 */
const HOLD_MS = 1500;   // le TA doit RESTER à la base au moins ce temps
const TOL     = 0.05;   // tolérance (divisions de TA) autour de la base

export class ClearReadDetector {
  /** Depuis quand le TA est à la base (null = il n'y est pas). */
  private atBaseSince: number | null = null;
  /** True quand la condition est TENUE depuis HOLD_MS. */
  held = false;

  /**
   * @param ta        TA courant (taAccumulator.toneArm)
   * @param baseline  base constitutionnelle courante (3.0 homme / 2.0 femme)
   */
  update(ta: number, baseline: number, nowMs: number): boolean {
    const atBase = ta <= baseline + TOL;
    if (!atBase) {
      this.atBaseSince = null;
      this.held = false;
      return false;
    }
    if (this.atBaseSince === null) this.atBaseSince = nowMs;
    this.held = (nowMs - this.atBaseSince) >= HOLD_MS;
    return this.held;
  }

  /** Secondes que le TA tient déjà à la base (0 s'il n'y est pas) — pour l'UI. */
  heldFor(nowMs: number): number {
    return this.atBaseSince === null ? 0 : (nowMs - this.atBaseSince) / 1000;
  }

  reset(): void {
    this.atBaseSince = null;
    this.held = false;
  }
}

/** Singleton — un détecteur par pipeline de session. */
export const clearReadDetector = new ClearReadDetector();
