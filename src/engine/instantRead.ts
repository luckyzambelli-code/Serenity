import {
  READ_WINDOW_BEFORE_S, READ_WINDOW_AFTER_S,
  READ_WINDOW_THETA_BEFORE_S, READ_WINDOW_THETA_AFTER_S, THETA_READ_DECIDE_S,
} from './tuning';

/**
 * LETTURA ISTANTANEA — attribuire a un item la reazione dell'ago.
 *
 * (Prima viveva in `hooks/useRiItems.ts` insieme al vecchio modulo R&I a inserimento manuale.
 * Quel modulo è stato sostituito dall'ASSESSMENT — l'auditor dà gli item a voce — quindi qui
 * resta SOLO la logica delle letture, che è pura e testabile.)
 */

/** Da quale ago viene una lettura. Senza questa distinzione la finestra temporale sarebbe una
 *  sola, e i due aghi hanno tempi OPPOSTI (vedi sotto). */
export type ReadSrc = 'eeg' | 'theta';

/**
 * Quanto due letture devono essere vicine nel tempo per essere considerate « allo stesso
 * istante », e decidere quindi per FORZA invece che per vicinanza (s).
 *
 * Serve da quando il MUSE è collegato: l'EEG non produce una lettura per item, produce una
 * RAFFICA — misurato in seduta, fino a sei reazioni attorno a una sola parola. Con la sola
 * regola « vince la più forte », un blowdown avvenuto mezzo secondo prima batteva la lettura
 * che stava esattamente sulla fine della parola. E l'instant read è quella sulla parola.
 */
export const READ_TIE_S = 0.15;

/** Forza relativa delle letture: a parità di istante si tiene la PIÙ FORTE. */
export const RI_PRIORITY: Record<string, number> = {
  'LF Blow Down': 7, 'Long Fall': 6, 'Fall': 5,
  'SF': 4, 'Dirty Needle': 3, 'F/N (Floating)': 2, 'Tick': 1,
};

/**
 * La finestra di ciascun ago, in secondi PRIMA e DOPO l'item.
 *
 * Per ENTRAMBI è stretta, e per la stessa ragione: la lettura che conta è l'INSTANT READ, alla
 * fine esatta della parola. Una reazione che arriva dopo è LATENTE e non vale — allargare la
 * finestra in avanti non recupererebbe letture, ne fabbricherebbe di false.
 *
 * Le due non sono identiche solo perché l'EEG coglie la reazione un attimo PRIMA del simpatico,
 * quindi guarda un po' più indietro; l'ago vero ha bisogno di un filo di margine dopo, perché
 * l'istante di fine parola viene dalla trascrizione vocale e non è preciso al centesimo.
 */
export const readWindow = (src: ReadSrc = 'eeg'): { before: number; after: number } =>
  src === 'theta'
    ? { before: READ_WINDOW_THETA_BEFORE_S, after: READ_WINDOW_THETA_AFTER_S }
    : { before: READ_WINDOW_BEFORE_S, after: READ_WINDOW_AFTER_S };

/**
 * Quanto ASPETTARE prima di CONCLUDERE (s) — da non confondere con la finestra di lettura.
 *
 * Sull'ago vero una reazione si riconosce solo quando l'episodio si chiude (parte, culmina,
 * comincia a rientrare): un secondo o due. La reazione resta datata a quando è PARTITA, e la
 * finestra la giudica lì; qui si sposta solo il momento in cui la si va a cercare, o si
 * scriverebbe NULL prima di aver classificato un movimento cominciato al momento giusto.
 */
export const readWaitSeconds = (thetaConnected: boolean): number =>
  thetaConnected ? THETA_READ_DECIDE_S : READ_WINDOW_AFTER_S;

/**
 * READ ISTANTANEO di un item.
 *
 * FONTE: `shownReads` = le reazioni REALMENTE MOSTRATE all'auditor (ago + scritta), con l'ora in
 * cui sono apparse. NON si usa il flusso grezzo del classificatore: contiene reazioni mai
 * visualizzate (soppresse dal blocco dell'ago, dall'hold dell'F/N, dal filtro anti-falso-kick) —
 * l'assessment attribuiva così agli item reazioni che l'auditor non aveva mai visto.
 * Ogni voce è già un CAMBIAMENTO (una F/N che perdura non ne genera una nuova → item NULL).
 *
 * TEMPI: ogni lettura è giudicata con la finestra DEL SUO AGO (vedi `readWindow`). Si restituisce
 * lo scarto SEGNATO fra lettura e item: negativo = la reazione è arrivata PRIMA (tipico
 * dell'EEG), positivo = DOPO (tipico delle boîtes). `beforeMs`/`afterMs` sono le due facce dello
 * stesso numero, così l'interfaccia può scrivere «−» o «+» senza rifare il conto.
 *
 * Manopole: `engine/tuning.ts`.
 */
export function computeInstantRead(
  shownReads: { time: number; reaction: string; src?: ReadSrc }[],
  itemTimeSec: number,
  /** Non risalire MAI oltre questo istante = l'item PRECEDENTE. Senza questo limite, in
   *  assessment (item ogni 1–2 s) un item rubava la lettura di quello prima. */
  notBeforeSec = -Infinity,
  /** E non andare oltre l'item SEGUENTE. Serve solo alla finestra AVANTI delle boîtes: 3,5 s
   *  in avanti con item ogni secondo, e il primo item si prenderebbe le reazioni di tutti. */
  notAfterSec = Infinity,
  /**
   * Un ago SOLO, oppure tutti (default).
   *
   * La lettura di un item deve venire dall'ago che l'auditor sta GUARDANDO: se sullo schermo
   * c'è l'ago delle boîtes e la lettura viene dall'EEG, la scritta racconta un movimento che
   * nessuno ha visto. È la stessa regola che vale dentro ciascun classificatore.
   *
   * Serve anche alla misura: dando lo stesso item ai due aghi SEPARATAMENTE si sa quale ha
   * letto cosa, invece di un verdetto unico che nasconde il disaccordo. Misurato il 02/08/2026:
   * su 89 item i due hanno letto lo STESSO item una volta sola (κ = −0,09).
   */
  soloSrc?: ReadSrc,
): { read: string; beforeMs: number; afterMs: number; src?: ReadSrc } {
  // Prima si raccolgono TUTTE le letture ammissibili, ciascuna giudicata con la finestra del
  // suo ago; poi si sceglie. Scegliere strada facendo — come si faceva — significa decidere
  // senza sapere che cosa arriva dopo.
  const ammesse: { reaction: string; time: number; prio: number; src?: ReadSrc; d: number }[] = [];
  for (const r of shownReads) {
    if (soloSrc && (r.src ?? 'eeg') !== soloSrc) continue;
    const w = readWindow(r.src);
    const from = Math.max(itemTimeSec - w.before, notBeforeSec);
    const to   = Math.min(itemTimeSec + w.after, notAfterSec);
    if (r.time < from || r.time > to) continue;
    const p = RI_PRIORITY[r.reaction];
    if (p === undefined) continue;              // non è una lettura utilizzabile
    ammesse.push({ reaction: r.reaction, time: r.time, prio: p, src: r.src,
                   d: Math.abs(r.time - itemTimeSec) });
  }
  if (!ammesse.length) return { read: 'NULL', beforeMs: 0, afterMs: 0 };

  // ── VINCE LA PIÙ VICINA ALLA FINE DELLA PAROLA ──────────────────────────────────────────
  // È la definizione dell'instant read. La FORZA decide solo fra letture che stanno allo stesso
  // istante (entro READ_TIE_S): fra due reazioni simultanee si tiene la più profonda, ma una
  // reazione più forte avvenuta mezzo secondo prima non è la lettura di questa parola.
  const piuVicina = Math.min(...ammesse.map(a => a.d));
  const best = ammesse
    .filter(a => a.d <= piuVicina + READ_TIE_S)
    .reduce((m, a) => (a.prio > m.prio ? a : m));
  const scartoMs = Math.round((best.time - itemTimeSec) * 1000);
  return {
    read: best.reaction,
    beforeMs: Math.max(0, -scartoMs),
    afterMs: Math.max(0, scartoMs),
    src: best.src,
  };
}
