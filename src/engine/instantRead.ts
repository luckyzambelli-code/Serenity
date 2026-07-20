import { READ_WINDOW_BEFORE_S, READ_WINDOW_AFTER_S } from './tuning';

/**
 * LETTURA ISTANTANEA — attribuire a un item la reazione dell'ago.
 *
 * (Prima viveva in `hooks/useRiItems.ts` insieme al vecchio modulo R&I a inserimento manuale.
 * Quel modulo è stato sostituito dall'ASSESSMENT — l'auditor dà gli item a voce — quindi qui
 * resta SOLO la logica delle letture, che è pura e testabile.)
 */

/** Forza relativa delle letture: a parità di finestra si tiene la PIÙ FORTE. */
export const RI_PRIORITY: Record<string, number> = {
  'LF Blow Down': 7, 'Long Fall': 6, 'Fall': 5,
  'SF': 4, 'Dirty Needle': 3, 'F/N (Floating)': 2, 'Tick': 1,
};

/**
 * READ ISTANTANEO di un item.
 *
 * FONTE: `shownReads` = le reazioni REALMENTE MOSTRATE all'auditor (ago + scritta), con l'ora in
 * cui sono apparse. NON si usa il flusso grezzo del classificatore: contiene reazioni mai
 * visualizzate (soppresse dal blocco dell'ago, dall'hold dell'F/N, dal filtro anti-falso-kick) —
 * l'assessment attribuiva così agli item reazioni che l'auditor non aveva mai visto.
 * Ogni voce è già un CAMBIAMENTO (una F/N che perdura non ne genera una nuova → item NULL).
 *
 * TEMPI: la reazione è datata a quando AVVIENE (l'EEG la coglie prima del simpatico) → all'istante
 * dell'item o PRIMA. Finestra soprattutto a monte; MAI letture latenti (finestra dopo cortissima).
 * Ritorna la lettura + `beforeMs` = quanti ms PRIMA dell'item è avvenuta (mostrato col segno «−»).
 *
 * Manopole: `engine/tuning.ts`.
 */
export function computeInstantRead(
  shownReads: { time: number; reaction: string }[],
  itemTimeSec: number,
  /** Non risalire MAI oltre questo istante = l'item PRECEDENTE. Senza questo limite, in
   *  assessment (item ogni 1–2 s) un item rubava la lettura di quello prima. */
  notBeforeSec = -Infinity,
): { read: string; beforeMs: number } {
  const from = Math.max(itemTimeSec - READ_WINDOW_BEFORE_S, notBeforeSec);
  const to   = itemTimeSec + READ_WINDOW_AFTER_S;
  let best: { reaction: string; time: number; prio: number } | null = null;
  for (const r of shownReads) {
    if (r.time < from || r.time > to) continue;
    const p = RI_PRIORITY[r.reaction];
    if (p === undefined) continue;              // non è una lettura utilizzabile
    if (best === null || p > best.prio) best = { reaction: r.reaction, time: r.time, prio: p };
  }
  if (!best) return { read: 'NULL', beforeMs: 0 };
  const beforeMs = Math.max(0, Math.round((itemTimeSec - best.time) * 1000));
  return { read: best.reaction, beforeMs };
}
