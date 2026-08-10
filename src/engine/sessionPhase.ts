/**
 * sessionPhase — DOVE SI TROVA L'AUDITOR, in un valore solo.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * Questa derivazione c'era già: stava dentro `spiegazioneCiclo` (App.tsx) e serviva a scrivere
 * due righe di testo — « a che punto sono, e cosa devo fare adesso ». Le condizioni erano giuste
 * e tarate in seduta; il difetto era che governavano una didascalia invece dello schermo.
 *
 * Qui la stessa derivazione diventa un VALORE. Da lì in poi ogni modulo può chiedere « in che
 * fase siamo » invece di ricomporsi da sé la risposta con quattro booleani — che è come si
 * arriva a quattro pannelli che si contendono la stessa fascia.
 *
 * È lo stesso mestiere di `sessionMode.ts`: là dal METODO discendono quadrante, ago e comandi;
 * qui dalla FASE discende che cosa sta a schermo. Puro TS, nessun React, nessuno stato nuovo —
 * si compone soltanto quel che l'app già sa.
 *
 * ── NO RECHARGING NON È UNA FASE ────────────────────────────────────────────────────────────
 * `NullCycleStateMachine.update()` restituisce `{ phase, noRecharging }`: due cose separate, e
 * ha ragione. « Non ricarica » è un GIUDIZIO dell'auditor sullo strumento, non un punto della
 * procedura — e deve poter CONVIVERE con la fase, altrimenti si perde il caso che il commento
 * della FSM chiede espressamente di mostrare: l'ago che sale DOPO la dichiarazione, cioè il
 * verdetto smentito. Se `norecharging` fosse una fase, inghiottirebbe `null.rise` e la
 * contraddizione sparirebbe — proprio quel che « plutôt que d'effacer sa décision en douce »
 * vieta. Resta quindi un MODIFICATORE (vedi `PhaseModifiers`), non una voce di `SessionPhase`.
 *
 * @see docs/refonte-fasi.md — la mappa completa e le decisioni.
 */

import type { SessionMode } from './sessionMode';
import type { NullStateId } from './NullCycleStateMachine';
import type { TonePhase } from './toneScale';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// LE FASI
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * Le fasi TRASVERSALI — non appartengono a nessun ciclo: sono i momenti della seduta che
 * stanno intorno ai cicli, o che li scavalcano.
 */
export type CrossPhase =
  | 'boot'         // l'animazione d'apertura
  | 'instruments'  // nessuno strumento: si sceglie che cosa collegare
  | 'preflight'    // prontezza delle lattine / baseline metabolica
  | 'ready'        // strumenti a posto, seduta non ancora partita
  | 'paused'
  | 'ep_window'    // il preclear ha una realizzazione — scavalca TUTTO
  | 'debrief';     // seduta finita, rapporto

/** CONTACT — la carica contattata si dissolve fino all'AS-IS. Tre tempi, non quattro. */
export type ContactPhase =
  | 'contact.item'
  /** Premuto col campo VUOTO: si aspetta che l'item sia detto a voce. Vedi la nota sotto. */
  | 'contact.say_item'
  | 'contact.mockup' | 'contact.asis';

/** NULL — il ciclo speculare: si lavora su ciò che NON reagisce. */
export type NullPhaseId =
  | 'null.item' | 'null.say_item'
  | 'null.mockup' | 'null.rise' | 'null.equilibrium';

/** MIRROR — il metodo del raddoppio di Ron. */
export type MirrorPhase =
  | 'mirror.item'      // dai l'item
  | 'mirror.say_item'  // premuto col campo vuoto: la prima parola detta diventa l'item
  | 'mirror.contact'   // si aspetta che il valore 1–10 si fissi
  | 'mirror.doubling'  // la meta è il doppio
  | 'mirror.reached';  // ottenuto

/**
 * TONE SCALE — i DUE comandi di Ron, più il compiuto.
 *
 * ⚠️ Erano quattro tempi: segno (positivo/negativo), ampiezza (10/20/30/40) e mock-up
 * dell'OPPOSTO fino allo zero. I comandi di Ron sono due, e la meta è +40 per tutte le
 * resistenze: l'assessment di segno e ampiezza è uscito dal ciclo.
 */
export type TonePhaseId =
  | 'tone.item'
  /** Premuto col campo VUOTO: si aspetta che la resistenza sia detta. Come negli altri tre. */
  | 'tone.say_item'
  /** « Raise this to tone forty on the tone scale », ridato finché non c'è più reazione. */
  | 'tone.raise'
  | 'tone.done';

export type SessionPhase =
  | CrossPhase | ContactPhase | NullPhaseId | MirrorPhase | TonePhaseId
  | 'free';   // solo l'ago, nessun ciclo

/** Le fasi in cui un ciclo è in corso — utile ai moduli che devono sparire solo lì. */
export const isCyclePhase = (p: SessionPhase): boolean =>
  p.includes('.') || p === 'free';

/** La famiglia di appartenenza, per le regole che valgono per tutto un ciclo. */
export const phaseFamily = (p: SessionPhase): 'contact' | 'null' | 'mirror' | 'tone' | 'free' | 'cross' =>
  p === 'free' ? 'free'
  : p.startsWith('contact.') ? 'contact'
  : p.startsWith('null.')    ? 'null'
  : p.startsWith('mirror.')  ? 'mirror'
  : p.startsWith('tone.')    ? 'tone'
  : 'cross';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// I SEGNALI — tutti già esistenti in App.tsx
// ═══════════════════════════════════════════════════════════════════════════════════════════

export interface PhaseSignals {
  // ── trasversali ──────────────────────────────────────────────────────────────────────────
  splashOpen:   boolean;
  sessionState: 'idle' | 'running' | 'paused' | 'ended';
  /** Almeno uno strumento collegato (MUSE o boîtes). */
  hasInstrument: boolean;
  /** Un controllo di prontezza è aperto: ThetaReadyCheck o MetabolicCheck. */
  preflightOpen: boolean;
  /** La finestra EP è aperta — precede ogni altra cosa. */
  epWindowOpen: boolean;
  /** Il rapporto di fine seduta è a schermo. */
  reportOpen: boolean;

  // ── il metodo in corso ───────────────────────────────────────────────────────────────────
  mode: SessionMode;

  // ── CONTACT e NULL (stessa coppia di segnali, cicli diversi) ─────────────────────────────
  cycleArmed:  boolean;
  asIsPending: boolean;
  nullPhase:   NullStateId;

  /**
   * L'ITEM È STATO NOMINATO? (campo pieno)
   *
   * Vale per TUTTI i cicli, non solo per MIRROR. Premuto col campo vuoto si aspetta la voce, e
   * finché la parola non arriva il ciclo è armato ma l'item non c'è. Senza questa distinzione
   * CONTACT e NULL saltavano diritti al mock-up: l'etichetta diceva « dillo a voce » e
   * l'istruzione sotto « chiedi un mock-up », due ordini contraddittori nello stesso istante
   * (segnalato). MIRROR aveva già la sua fase; ora ce l'hanno tutti e tre.
   */
  itemNamed: boolean;

  // ── MIRROR ───────────────────────────────────────────────────────────────────────────────
  mirrorArmed:     boolean;
  mirrorLocked:    boolean;
  mirrorReached:   boolean;

  // ── TONE ─────────────────────────────────────────────────────────────────────────────────
  tonePhase:      TonePhase;
}

/**
 * Ciò che CONVIVE con la fase invece di sostituirla. Vedi la nota in testa al file: un
 * modificatore può contraddire la fase, ed è proprio quando la contraddice che serve.
 */
export interface PhaseModifiers {
  /** L'auditor ha dichiarato « non ricarica »: lo strumento non legge, il null non vale nulla.
   *  STICKY — la macchina non lo cancella mai da sé. */
  noRecharging: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// LA DERIVAZIONE
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * LA PRECEDENZA, dall'alto:
 *
 *   ep_window → debrief → paused → boot → preflight → <ciclo> → instruments → ready
 *
 * `ep_window` è in cima perché è l'unico momento della seduta in cui lo schermo non deve
 * proporre NIENTE all'infuori di quella: il preclear ha una realizzazione, e ogni altra cosa a
 * schermo gliela toglie.
 *
 * `boot` sta sopra `preflight` perché lo splash copre lo schermo per intero: finché è lì, quel
 * che sta sotto non è leggibile comunque. (La specifica scriveva l'ordine inverso — è stato
 * corretto qui, dove si vede l'effetto.)
 */
export function derivePhase(s: PhaseSignals): SessionPhase {
  // ── Trasversali che scavalcano ───────────────────────────────────────────────────────────
  if (s.epWindowOpen && s.sessionState === 'running') return 'ep_window';
  if (s.sessionState === 'ended' || s.reportOpen)      return 'debrief';
  if (s.sessionState === 'paused')                     return 'paused';
  if (s.splashOpen)                                    return 'boot';
  if (s.preflightOpen)                                 return 'preflight';

  // ── In seduta: la fase è quella del ciclo ────────────────────────────────────────────────
  if (s.sessionState === 'running') return deriveCyclePhase(s);

  // ── Fuori seduta ─────────────────────────────────────────────────────────────────────────
  if (!s.hasInstrument) return 'instruments';
  return 'ready';
}

/**
 * La fase DENTRO la seduta, SENZA le trasversali. Riproduce esattamente la scala di
 * `spiegazioneCiclo`: stesse condizioni, stesso ordine, stessi casi di ricaduta. Cambiare una
 * di queste righe cambia una scritta che l'auditor legge in seduta — non si tocca senza
 * provarlo col MUSE addosso.
 *
 * ── PERCHÉ È ESPORTATA A PARTE ──────────────────────────────────────────────────────────────
 * `CycleHint` è a schermo con la sola condizione `sessionState === 'running'`, quindi ANCHE
 * mentre la finestra EP è aperta. Dare al testo la fase completa gli farebbe scrivere altro
 * proprio lì, ed è l'unico punto in cui la precedenza di `ep_window` cambierebbe qualcosa di
 * visibile. Il testo prende dunque la scala di ciclo; lo schermo prenderà `derivePhase`.
 */
export function deriveCyclePhase(s: PhaseSignals): SessionPhase {
  // ── TONE : dai l'item → portalo a tono 40 ────────────────────────────────────────────────
  if (s.mode === 'tone') {
    if (s.tonePhase === 'locate')    return 'tone.item';
    // Premuto ma senza resistenza nominata: si aspetta la voce, e NON si dà ancora il secondo
    // comando. Prima si passava dritti a « positivo o negativo? » — si assessava il segno di
    // una resistenza che non era stata detta (segnalato).
    if (!s.itemNamed)                return 'tone.say_item';
    if (s.tonePhase === 'raise')     return 'tone.raise';
    return 'tone.done';
  }

  // ── MIRROR : item → valore → il DOPPIO da smaltire ───────────────────────────────────────
  if (s.mode === 'mirror') {
    if (!s.mirrorArmed)  return 'mirror.item';
    if (!s.itemNamed)    return 'mirror.say_item';
    if (!s.mirrorLocked)    return 'mirror.contact';
    if (s.mirrorReached)    return 'mirror.reached';
    return 'mirror.doubling';
  }

  // ── NULL : item → mock-up → RISE → EQUILIBRIUM ───────────────────────────────────────────
  if (s.mode === 'null') {
    if (!s.cycleArmed)                  return 'null.item';
    // Armato ma senza item: si aspetta la voce. Prima si passava dritti al mock-up.
    if (!s.itemNamed)                   return 'null.say_item';
    if (s.nullPhase === 'rise')         return 'null.rise';
    if (s.nullPhase === 'clear_read')   return 'null.equilibrium';
    return 'null.mockup';
  }

  // ── LIBERO : nessun ciclo, solo l'ago ────────────────────────────────────────────────────
  // `MODE_SPEC.free.arms === false`, quindi qui non c'è ciclo da armare. Se per una via
  // imprevista ce ne fosse uno, si ricade sulla scala CONTACT — che è ciò che l'interfaccia
  // mostra oggi in questo caso, e non è il momento di cambiarlo.
  if (s.mode === 'free' && !s.cycleArmed && !s.asIsPending) return 'free';

  // ── CONTACT : item → il ciclo avanza da sé → AS-IS ───────────────────────────────────────
  if (!s.cycleArmed)  return 'contact.item';
  if (s.asIsPending)  return 'contact.asis';
  // Armato ma senza item: si aspetta la voce, e NON si chiede ancora il mock-up.
  if (!s.itemNamed)   return 'contact.say_item';
  return 'contact.mockup';
}
