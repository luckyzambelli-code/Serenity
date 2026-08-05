/**
 * visibleSet — CHE COSA STA A SCHERMO, in una funzione pura.
 *
 * Prende la fase, il livello, gli strumenti e le deroghe dell'auditor; restituisce l'insieme
 * dei moduli visibili. Nessun React, nessuno stato: si prova riga per riga.
 *
 * ── LA REGOLA, IN CHIARO ────────────────────────────────────────────────────────────────────
 *   visibile(m) =
 *        il livello lo ammette
 *     && gli strumenti che gli servono ci sono
 *     && il metodo in corso lo riguarda
 *     && (  l'auditor l'ha FISSATO                              ← la mano vince sempre
 *        || (  !l'auditor l'ha ZITTITO
 *              && ( la fase lo apre  ||  un ALLARME lo chiama )  ← R4
 *           )
 *        )
 *
 * Dove la fase non lo apre, è chiuso: non c'è una seconda lista di eccezioni. Vedi la nota in
 * testa a `moduleRegistry.ts` sul perché `hideIn` è stato tolto.
 *
 * ── L'AUTOMATISMO CEDE ALLA MANO ────────────────────────────────────────────────────────────
 * È la sola regola non negoziabile di tutta la refonte. Un'interfaccia che si riapre da sé
 * dopo che l'auditor l'ha chiusa non è « intelligente »: è un'interfaccia con cui si litiga, in
 * seduta, mentre si dovrebbe guardare il preclear. `pinned` e `muted` valgono finché la fase non
 * cambia — poi si svuotano, perché una decisione presa in un momento del lavoro non deve
 * inseguire l'auditor nel momento dopo.
 *
 * ── ESPERTO NON È « PIÙ COSE » ──────────────────────────────────────────────────────────────
 * È un altro regime: `autoIn` si spegne, e si vede tutto ciò che livello e strumenti ammettono.
 * È il modo di lavorare di chi tara lo strumento, non una ricompensa.
 */

import type { SessionPhase } from '../engine/sessionPhase';
import type { SessionMode } from '../engine/sessionMode';
import {
  MODULE_REGISTRY, levelAllows, type ModuleId, type ModuleSpec, type UiLevel,
} from './moduleRegistry';

export interface VisibilityInput {
  phase: SessionPhase;
  mode: SessionMode;
  level: UiLevel;
  instruments: { muse: boolean; theta: boolean; camera: boolean };
  /** Aperti a mano: vincono su tutto il resto (tranne livello e strumenti). */
  pinned: ReadonlySet<ModuleId>;
  /** Chiusi a mano: restano chiusi finché la fase non cambia. */
  muted: ReadonlySet<ModuleId>;
  /**
   * R4 — i moduli di sorveglianza chiamati da un problema REALE, non da una fase.
   * Es. `health` quando la qualità del segnale scende. Un allarme scavalca `autoIn` e `hideIn`,
   * ma NON `muted`: se l'auditor l'ha zittito, sa quel che fa.
   */
  alarms?: ReadonlySet<ModuleId>;
}

/** Gli strumenti che il modulo pretende ci sono tutti? */
function haStrumenti(m: ModuleSpec, str: VisibilityInput['instruments']): boolean {
  const r = m.requires;
  if (!r) return true;
  if (r.muse   && !str.muse)   return false;
  if (r.theta  && !str.theta)  return false;
  if (r.camera && !str.camera) return false;
  return true;
}

/** Il metodo in corso lo riguarda? (`modes` assente = tutti.) */
const riguardaIlMetodo = (m: ModuleSpec, mode: SessionMode): boolean =>
  !m.modes || m.modes.includes(mode);

/** Un solo modulo, con la regola per esteso. */
export function isVisible(m: ModuleSpec, input: VisibilityInput): boolean {
  if (!levelAllows(m.level, input.level))  return false;
  if (!haStrumenti(m, input.instruments))  return false;
  if (!riguardaIlMetodo(m, input.mode))    return false;

  // ESPERTO: si spegne `autoIn`. Tutto ciò che è arrivato fin qui resta a schermo, salvo che
  // l'auditor l'abbia zittito — anche in taratura la mano vince.
  if (input.level === 'expert') return !input.muted.has(m.id);

  if (input.pinned.has(m.id))  return true;
  if (input.muted.has(m.id))   return false;

  // Un allarme (R4) apre il modulo dove la fase non lo aprirebbe — ma non scavalca `muted`:
  // se l'auditor l'ha zittito, sa quel che fa.
  if (input.alarms?.has(m.id)) return true;

  return m.autoIn.includes(input.phase);
}

/** L'insieme visibile, in una passata. */
export function visibleSet(input: VisibilityInput): Set<ModuleId> {
  const out = new Set<ModuleId>();
  for (const m of MODULE_REGISTRY) if (isVisible(m, input)) out.add(m.id);
  return out;
}

/** I moduli visibili di UNO slot, nell'ordine della tabella. */
export function visibleInSlot(input: VisibilityInput, slot: ModuleSpec['slot']): ModuleId[] {
  return MODULE_REGISTRY.filter(m => m.slot === slot && isVisible(m, input)).map(m => m.id);
}
