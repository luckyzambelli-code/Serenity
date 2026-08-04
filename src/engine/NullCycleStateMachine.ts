/**
 * NullCycleStateMachine — le cycle d'audition MIROIR de CycleStateMachine.
 *
 *   Cycle CHARGE (existant) : CONTACT  → DISCHARGE → AS-IS
 *   Cycle NULL   (celui-ci) : NULL     → RISE      → EQUILIBRIUM
 *
 * À l'ASSESSMENT, si l'item ne donne AUCUNE lecture instantanée dans la fenêtre du comm lag
 * (Δt* + marge), l'item est NULL. Mais un null est AMBIGU : « null parce que propre » ou « null
 * parce que rien ne lit » (contact, instrument, PC absent) ? On lève l'ambiguïté en demandant au
 * PC un MOCK-UP : il CRÉE de la masse exprès. (Pas de bouton MOCK-UP : comme pour CONTACT, on
 * presse le cycle et on REGARDE si ça monte — le marqueur n'apporte rien.)
 *   • si l'aiguille MONTE (RISE) → l'instrument et le PC répondent → le null était genuine ;
 *     puis le PC lâche le mock-up, la charge revient à ~0 → EQUILIBRIUM (validé par l'auditeur).
 *   • si RIEN ne monte après le mock-up → flag « no recharging » : le null NE VAUT RIEN
 *     (c'est le résultat DIAGNOSTIQUE le plus précieux du cycle).
 *
 * Même mécanique que la FSM charge : SOLO-AVANTI, dwell minimum par phase, hystérésis
 * (accumulateur leaky) → la phase ne papillonne pas sur le bruit. Pur TS, pas de React.
 *
 * NOTE HONNÊTE : ce cycle ne dépend PAS de l'étalonnage absolu du TA (le point faible démontré
 * par les tests Roger). Tout est RELATIF : « la charge monte » puis « la charge revient à ~0 »
 * (TA à SA base). Le 3/2 (homme/femme) est une CONVENTION constitutionnelle qu'on impose par
 * sexe, pas une mesure à valider.
 */
export type NullStateId = 'neutral' | 'null' | 'rise' | 'clear_read';

export interface NullPhase {
  phase: NullStateId;
  /** Mock-up demandé mais RIEN n'est monté → le null n'est pas validé. */
  noRecharging: boolean;
}

// ── Tunables ─────────────────────────────────────────────────────────────────
// AUCUN de ces seuils n'impose un HORAIRE au PC : ce sont des seuils de STABILITÉ / lisibilité.
// Le cycle attend la montée (mock-up) et le retour à la base AUSSI LONGTEMPS QU'IL FAUT — chaque
// PC a son propre temps de mock-up (remarque utilisateur, juste). Il n'y a donc PAS de délai au
// bout duquel l'app décrète « no recharging » : c'est l'AUDITEUR qui le déclare (declareNoRecharging).
const MIN_NULL_MS     = 800;   // dwell mini en NULL (lisibilité, pas un horaire)
const MIN_RISE_MS     = 1500;  // dwell mini en RISE (l'auditeur doit la voir)
const RISE_SUSTAIN_MS = 600;   // « rising » net cumulé pour ouvrir RISE (hystérésis anti-sursaut)

export class NullCycleStateMachine {
  private phase: NullStateId = 'neutral';
  private phaseSince = 0;
  private riseMs = 0;                    // accumulateur leaky de « rising »
  private armedAt: number | null = null; // instant où le cycle NULL a été armé (pour l'info « depuis N s »)
  private lastMs = 0;
  private noRecharge = false;
  private everRose = false;
  /** L'AUDITEUR l'a DÉCLARÉ (vs simple état interne) → la machine ne doit JAMAIS l'effacer. */
  private declared = false;

  /** L'assessment n'a pas lu dans la fenêtre → on entre dans le cycle NULL. */
  armNull(nowMs: number): void {
    this.reset();
    this.phase = 'null';
    this.phaseSince = nowMs;
    this.lastMs = nowMs;
    this.armedAt = nowMs;
  }

  /** L'AUDITEUR déclare « no recharging » : il VOIT que le PC ne produit pas de masse. Ce n'est
   *  PAS un verdict au chrono — chaque PC a son propre temps de mock-up.
   *  STICKY : une fois déclaré, ça reste jusqu'au ré-armement du cycle. C'est un JUGEMENT de
   *  l'auditeur — la machine n'a pas à le défaire (bug : `update()` réécrit l'état à chaque tick,
   *  donc l'ancienne garde `!everRose` + le reset à la montée EFFAÇAIENT la déclaration). */
  declareNoRecharging(): void {
    this.declared = true;
    this.noRecharge = true;
  }

  get isArmed(): boolean { return this.phase !== 'neutral'; }
  /** Secondes depuis l'armement du cycle NULL — INFO pour l'auditeur, PAS un compte à rebours. */
  sinceArmS(nowMs: number): number { return this.armedAt === null ? 0 : (nowMs - this.armedAt) / 1000; }

  /**
   * @param rising    predictor.rising — la charge MONTE (le mock-up crée de la masse)
   * @param clearHeld ClearReadDetector — le TA est revenu à SA base et s'y TIENT
   */
  update(rising: boolean, clearHeld: boolean, nowMs: number): NullPhase {
    const dt = this.lastMs > 0 ? Math.min(500, nowMs - this.lastMs) : 0;
    this.lastMs = nowMs;
    // Leaky : une montée doit être SOUTENUE pour compter ; un sursaut ne suffit pas.
    this.riseMs = rising ? Math.min(2000, this.riseMs + dt) : Math.max(0, this.riseMs - dt);
    const inPhase = nowMs - this.phaseSince;

    switch (this.phase) {
      case 'null':
        // Pas besoin d'un marqueur MOCK-UP (remarque utilisateur, juste : on ne le fait pas non plus
        // pour CONTACT — on presse et on REGARDE si ça monte). On ATTEND la montée AUSSI LONGTEMPS
        // QU'IL FAUT : chaque PC a son propre temps de mock-up, aucun délai couperet.
        if (inPhase >= MIN_NULL_MS && this.riseMs >= RISE_SUSTAIN_MS) {
          this.everRose = true;
          // Si l'auditeur n'avait RIEN déclaré, une montée tardive lève le doute → pas de flag.
          // S'il A déclaré, on GARDE son verdict : la contradiction (RISE + « no recharging »)
          // devient VISIBLE, ce qui est honnête — plutôt que d'effacer sa décision en douce.
          if (!this.declared) this.noRecharge = false;
          this.enter('rise', nowMs);
        }
        break;
      case 'rise':
        // La masse a été créée ; quand le PC la lâche, la charge revient à ~0 → EQUILIBRIUM.
        // (clearHeld n'est regardé QU'ICI : en NULL le TA est déjà à la base sans rien vouloir dire.)
        if (inPhase >= MIN_RISE_MS && clearHeld) this.enter('clear_read', nowMs);
        break;
      case 'clear_read':
        break; // attend la VALIDATION de l'auditeur (avec les VGI's)
      case 'neutral':
        break;
    }
    return { phase: this.phase, noRecharging: this.noRecharge };
  }

  private enter(p: NullStateId, nowMs: number): void {
    this.phase = p;
    this.phaseSince = nowMs;
  }

  reset(): void {
    this.phase = 'neutral';
    this.phaseSince = 0;
    this.riseMs = 0;
    this.armedAt = null;
    this.lastMs = 0;
    this.noRecharge = false;
    this.everRose = false;
    this.declared = false;
  }
}

/** Singleton — un cycle null à la fois (comme la FSM charge). */
export const nullCycleStateMachine = new NullCycleStateMachine();
