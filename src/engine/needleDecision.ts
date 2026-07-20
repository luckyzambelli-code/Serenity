import {
  KICK_MS, KICK_MS_DEFAULT, KICK_FLYBACK_MS, KICK_ESCALATE_MARGIN, FALL_ZONE_OFFSET,
  LABEL_HOLD_FN_MS, LABEL_HOLD_QUIET_MS, FN_EPISODE_GAP_S,
} from './tuning';
import { RI_PRIORITY } from './instantRead';

/**
 * DECISIONE dell'ago — logica PURA, senza effetti collaterali.
 *
 * Qui si decide SOLO tre cose, ad ogni tick:
 *   1. cosa MOSTRARE (si aggiorna la scritta? e fino a quando resta?) ;
 *   2. se lanciare l'OSCILLAZIONE dell'ago (e se interrompere quella in corso) ;
 *   3. se REGISTRARE la lettura come « realmente mostrata » (la fonte dell'ASSESSMENT).
 *
 * Gli effetti — motore dell'ago, timer, setState, buffer — restano in App: qui si producono
 * solo delle INTENZIONI. Così il comportamento è verificabile dai test senza React né MUSE.
 *
 * Tutte le manopole vivono in `engine/tuning.ts`.
 */

/** Le reazioni per cui l'ago fa una vera oscillazione (le altre riposano o fluttuano). */
export const KICK_REACTIONS = new Set([
  'reaction_sf', 'reaction_fall', 'reaction_long_fall',
  'reaction_blow_down', 'reaction_long_fall_blow_down',
]);

export interface NeedleInputs {
  /** Uscita del classificatore a questo tick. */
  reactionKey: string;
  /** Etichetta leggibile corrispondente (serve per sapere se è una lettura registrabile). */
  reactionLabel: string;
  /** Offset « grezzo » della reazione (profondità) — per l'escalation. */
  rawTarget: number;
  nowMs: number;
  /** Tempo di sessione (s) — per gli episodi F/N. */
  timeS: number;
  /** Reazione attualmente MOSTRATA (non quella appena classificata). */
  shownKey: string;
  /** Fino a quando la scritta attuale è bloccata (ms). */
  holdUntilMs: number;
  /** Profondità dell'oscillazione in corso, o null se l'ago è libero. */
  activeKickRaw: number | null;
  needleInMotion: boolean;
  needleLocked: boolean;
  /** Finestra aperta da un NUOVO item: la sua lettura può interrompere il swing in corso. */
  itemInterruptUntilMs: number;
  /** Posizione corrente dell'ago virtuale — per distinguere una vera caduta dal rientro. */
  curVirtualOffset: number;
  /** Ultimo istante (s) in cui una F/N era a schermo — per gli episodi. */
  lastFnShownAtS: number;
}

export interface NeedleDecision {
  /** 'suppress' = non toccare NIENTE (falso kick durante un hold F/N). */
  path: 'suppress' | 'kick' | 'idle';
  /** Lanciare l'oscillazione. */
  startKick: boolean;
  /** Tagliare netto il swing precedente (nuovo item). */
  interruptPrevious: boolean;
  /** Durata dell'oscillazione (ms) — valida solo se startKick. */
  kickMs: number;
  /** Dove mandare l'ago fuori dall'oscillazione: fluttua, riposa, o non toccare. */
  idleTarget: 'float' | 'rest' | null;
  /** Aggiornare la scritta mostrata. */
  commitLabel: boolean;
  /** Nuova scadenza del blocco della scritta (ms). */
  holdUntilMs: number;
  /** Registrare la lettura come REALMENTE MOSTRATA (fonte dell'ASSESSMENT). */
  recordShownRead: boolean;
}

/**
 * Una lettura si registra SOLO se:
 *   • è un vero CAMBIAMENTO rispetto a ciò che è già mostrato (un ago che continua uguale è NULL) ;
 *   • è una lettura utilizzabile (presente in RI_PRIORITY) ;
 *   • NON è la continuazione di un episodio F/N già in corso — anche se ha sfarfallato.
 *     (Definizione dell'AGO NULLO: nessun cambiamento provocato dalla domanda.)
 */
function shouldRecord(i: NeedleInputs): boolean {
  if (i.reactionKey === i.shownKey) return false;
  if (RI_PRIORITY[i.reactionLabel] === undefined) return false;
  const sameFnEpisode = i.reactionKey === 'reaction_fn'
    && (i.timeS - i.lastFnShownAtS) < FN_EPISODE_GAP_S;
  return !sameFnEpisode;
}

export function decideNeedle(i: NeedleInputs): NeedleDecision {
  const base: NeedleDecision = {
    path: 'idle', startKick: false, interruptPrevious: false, kickMs: 0,
    idleTarget: null, commitLabel: false, holdUntilMs: i.holdUntilMs, recordShownRead: false,
  };

  const isKick = KICK_REACTIONS.has(i.reactionKey);

  // ── FALSO KICK durante un hold F/N ────────────────────────────────────────────────────────
  // A fine float l'ago rientra verso il riposo: è un movimento a DESTRA che il classificatore
  // legge come Fall/SF e che cancellerebbe subito la F/N ancora tenuta. Ma « una F/N non cade »:
  // un rientro (ago ancora a SINISTRA della zona di caduta) NON è una caduta.
  // La protezione vale finché una F/N è DAVVERO in corso. NON basta guardare il blocco della
  // scritta: `freeNeedleForNewItem()` lo AZZERA ad ogni item dato (App.tsx), e per un tick la
  // protezione spariva → il rientro meccanico dopo il float diventava un « Fall » mostrato E
  // registrato, che con RI_PRIORITY (Fall 5 > F/N 2) scavalcava la lettura vera dell'item.
  // Si usa quindi ANCHE il marcatore d'episodio F/N, che l'azzeramento dell'hold non tocca.
  const fnEpisodeRunning = (i.timeS - i.lastFnShownAtS) < FN_EPISODE_GAP_S;
  const holdingFn = i.shownKey === 'reaction_fn' && (i.nowMs < i.holdUntilMs || fnEpisodeRunning);
  const genuineFall = i.reactionKey !== 'reaction_sf' && i.curVirtualOffset > FALL_ZONE_OFFSET;
  if (isKick && holdingFn && !genuineFall) return { ...base, path: 'suppress' };

  // ── OSCILLAZIONE ──────────────────────────────────────────────────────────────────────────
  if (isKick) {
    const itemInterrupt = i.nowMs < i.itemInterruptUntilMs;
    const canStart = (!i.needleInMotion && i.activeKickRaw === null) || itemInterrupt;
    const canEscalate = i.activeKickRaw !== null && i.rawTarget > i.activeKickRaw + KICK_ESCALATE_MARGIN;
    // Lettura più debole mentre una più profonda è in volo → si ignora: ago ed etichetta
    // mostrano già quella più profonda.
    if (!canStart && !canEscalate) return { ...base, path: 'kick' };

    const kickMs = KICK_MS[i.reactionKey] ?? KICK_MS_DEFAULT;
    return {
      ...base,
      path: 'kick',
      startKick: true,
      interruptPrevious: itemInterrupt,
      kickMs,
      commitLabel: true,
      // la scritta resta per TUTTO il ciclo dell'ago (oscillazione + rientro)
      holdUntilMs: i.nowMs + kickMs + KICK_FLYBACK_MS,
      recordShownRead: shouldRecord(i),
    };
  }

  // ── RIPOSO / FLUTTUAZIONE ─────────────────────────────────────────────────────────────────
  let idleTarget: 'float' | 'rest' | null = null;
  if (!i.needleInMotion && !i.needleLocked) {
    // IN FASE: durante il blocco della scritta l'ago segue ciò che è MOSTRATO, non la
    // classificazione live — altrimenti a fine float l'ago tornava a riposo mentre in alto
    // c'era ancora scritto « F/N ».
    const shown = i.nowMs < i.holdUntilMs ? (i.shownKey || i.reactionKey) : i.reactionKey;
    idleTarget = shown === 'reaction_fn' ? 'float' : 'rest';
  }

  const commit = i.nowMs >= i.holdUntilMs;   // si aggiorna solo a blocco scaduto
  return {
    ...base,
    path: 'idle',
    idleTarget,
    commitLabel: commit,
    holdUntilMs: commit
      ? i.nowMs + (i.reactionKey === 'reaction_fn' ? LABEL_HOLD_FN_MS : LABEL_HOLD_QUIET_MS)
      : i.holdUntilMs,
    recordShownRead: commit && shouldRecord(i),
  };
}
