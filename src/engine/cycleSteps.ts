/**
 * cycleSteps — I TEMPI DI UN CICLO, e a quale si è.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * L'istruzione diceva « 1 · DAI L'ITEM », e quel « 1 · » prometteva una sequenza numerata di
 * cui non si vedeva mai il resto: non si sapeva se i tempi fossero due, tre o sei, né che cosa
 * venisse dopo aver premuto. In TONE era peggio — premendo LOCALIZZA compariva di colpo
 * « positivo o negativo? », cioè il tempo 2, senza che nulla avesse annunciato che ce n'erano
 * quattro (segnalato: « on est perdus »).
 *
 * Qui i tempi sono un DATO: quanti sono, come si chiamano, a quale si è. La pista che si vede a
 * schermo li legge da qui, e non può divergere dalle fasi perché è la fase a dire l'indice.
 *
 * Nessuna traduzione: si restituiscono degli ID, e il testo lo mette il componente. Così questa
 * tabella si prova senza React e senza dizionario.
 *
 * @see engine/sessionPhase.ts — le fasi da cui discende l'indice.
 */

import type { SessionPhase } from './sessionPhase';
import { phaseFamily } from './sessionPhase';
import type { SessionMode } from './sessionMode';

/** Un tempo del ciclo. L'ID serve al testo; l'ordine è quello dell'array. */
export type StepId =
  | 'item' | 'mockup' | 'asis'                    // CONTACT
  | 'equilibrium'                                  // NULL (item · mockup · equilibrium)
  | 'value' | 'double' | 'obtained'                // MIRROR (item · value · double · obtained)
  | 'tone40';                                      // TONE (item · tono 40)

/**
 * I tempi di ciascun metodo, nell'ordine di Ron.
 *
 * MIRROR ne ha quattro e non tre: « dai l'item » e « dai il valore » sono due gesti distinti —
 * è esattamente il passo che mancava senza strumenti, e che rendeva il ciclo incomprensibile.
 */
const STEPS: Record<SessionMode, StepId[]> = {
  contact: ['item', 'mockup', 'asis'],
  null:    ['item', 'mockup', 'equilibrium'],
  mirror:  ['item', 'value', 'double', 'obtained'],
  // TONE ne ha DUE, uno per comando di Ron — « locate resistance » e « raise this to tone
  // forty ». Erano quattro: segno e ampiezza erano un assessment che i comandi non prevedono.
  tone:    ['item', 'tone40'],
  free:    [],   // APERTO non ha sequenza: è il suo senso.
};

/** I tempi del metodo in corso. Vuoto in APERTO — e una pista vuota non si disegna. */
export const stepsOf = (mode: SessionMode): StepId[] => STEPS[mode];

/**
 * A quale tempo si è, 0-based. `-1` quando la fase non appartiene a un ciclo (fuori seduta,
 * finestra EP) o quando il metodo non ha tempi.
 *
 * ── LE FASI CHE CONDIVIDONO UN TEMPO ────────────────────────────────────────────────────────
 * Non c'è una fase per tempo, e non deve essercene una: i tre `*.say_item` sono ancora « dai
 * l'item » (si è premuto col campo vuoto e si aspetta la voce), e `null.rise` è ancora « chiedi
 * il mock-up » — l'ago sale, ma l'auditor non ha un gesto nuovo da fare. Mostrarli come tempi a
 * sé farebbe avanzare la pista senza che sia avanzato il lavoro.
 */
export function currentStep(phase: SessionPhase, mode: SessionMode): number {
  if (!STEPS[mode].length) return -1;
  if (phaseFamily(phase) !== mode) return -1;
  switch (phase) {
    // CONTACT
    case 'contact.item':      return 0;
    case 'contact.say_item':  return 0;   // armato, ma l'item non è ancora detto
    case 'contact.mockup':    return 1;
    case 'contact.asis':      return 2;
    // NULL — `rise` è ancora il tempo del mock-up: si guarda, non si fa.
    case 'null.item':         return 0;
    case 'null.say_item':     return 0;
    case 'null.mockup':       return 1;
    case 'null.rise':         return 1;
    case 'null.equilibrium':  return 2;
    // MIRROR — `say_item` è ancora « dai l'item »: si aspetta la voce.
    case 'mirror.item':       return 0;
    case 'mirror.say_item':   return 0;
    case 'mirror.contact':    return 1;
    case 'mirror.doubling':   return 2;
    case 'mirror.reached':    return 3;
    // TONE — `say_item` è ancora il tempo dell'item: la resistenza non è stata detta.
    case 'tone.item':         return 0;
    case 'tone.say_item':     return 0;
    case 'tone.raise':        return 1;
    case 'tone.done':         return 1;   // compiuto: resta acceso l'ultimo, non se ne inventa un terzo
    default:                  return -1;
  }
}

/** Il ciclo è finito? Serve a spuntare l'ultimo tempo invece di lasciarlo « in corso ». */
export const stepDone = (phase: SessionPhase): boolean =>
  phase === 'contact.asis' || phase === 'null.equilibrium'
  || phase === 'mirror.reached' || phase === 'tone.done';
