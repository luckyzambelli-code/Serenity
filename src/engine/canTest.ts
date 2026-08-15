/**
 * canTest — LA PROVA DELLE LATTINE, tenuta a memoria PER PRECLEAR.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * « Che fa fede sono le DUE LATTINE » (richiesta utente). La prova della stretta a inizio
 * seduta fissa la sensibilità perché una stretta valga un terzo di quadrante — ma quel numero
 * non è dello strumento soltanto: dipende dalla pelle, dalla presa, dalla mano di CHI stringe.
 * Tenerlo per persona è quel che lo rende utile una seduta dopo l'altra.
 *
 * Serve a tre cose:
 *
 *   1. RITROVARLO. La prova si vede nella scheda del preclear: quando è stata fatta, quante
 *      volte, con che risultato. Senza, si riparte ogni volta da zero senza sapere che « zero »
 *      era diverso l'ultima volta.
 *
 *   2. IL SOLO. In auditing solo il preclear tiene UNA lattina, e la resistenza non è quella di
 *      due: lo scarto fra le due configurazioni è una misura di QUELLA persona, e si applica
 *      quando lavora da sola. Con una sola configurazione provata non si inventa nulla.
 *
 *   3. IL MARGINE. Se la prova NON è stata fatta, la sensibilità è quella di ripiego e il tono
 *      che ne esce è più incerto di quanto sembri. In quel caso si toglie una divisione dalla
 *      scala del tono — un margine, non una correzione: meglio dichiarare meno di quel che si
 *      spera che dichiarare più di quel che si può sostenere.
 *
 * ── PIÙ PROVE, UNA MISURA ───────────────────────────────────────────────────────────────────
 * « Aggiusta la misura se hai più test »: si tiene la MEDIANA e non la media. Una prova andata
 * male — la mano che scivola, una stretta a metà — sposta la media e non tocca la mediana. Con
 * due sole prove la mediana è la loro media, che è quel che ci si aspetta.
 *
 * Puro TS: nessun React, nessun localStorage. Chi lo usa persiste come vuole.
 */

import type { ElectrodeConfig } from './thetaSetup';
import { TONE_SCALE_MAX } from './tuning';
import { clampTa } from './thetaTaScale';

/** Una prova, com'è uscita. */
export interface CanTest {
  /** Quando, in millisecondi epoch. Serve a dire « fatta oggi » e a ordinare. */
  t: number;
  /** La sensibilità che ne è uscita: unità grezze → offset del quadrante. */
  scale: number;
  /** Con quante lattine è stata fatta. Il riferimento sono le DUE. */
  config: ElectrodeConfig;
}

/** Tutte le prove di un preclear. */
export interface PcCanHistory {
  /** Il nome del preclear, come chiave. */
  pc: string;
  tests: CanTest[];
}

/** Quante prove si tengono. Oltre, le più vecchie escono: una taratura di un anno fa non dice
 *  niente sulla pelle di oggi. */
export const MAX_TESTS = 12;

export const emptyHistory = (pc: string): PcCanHistory => ({ pc, tests: [] });

/** Aggiunge una prova, tenendo le più recenti. */
export function addTest(h: PcCanHistory, test: CanTest): PcCanHistory {
  if (!Number.isFinite(test.scale) || test.scale <= 0) return h;   // una prova assurda non entra
  const tests = [...h.tests, test].sort((a, b) => a.t - b.t).slice(-MAX_TESTS);
  return { ...h, tests };
}

/** La mediana di una lista non vuota. Con un numero pari di valori è la media dei due centrali. */
const mediana = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * La sensibilità di riferimento per questa configurazione. `null` se non c'è nessuna prova —
 * e allora si usa quella di ripiego, ma si sa che è di ripiego.
 */
export function scaleFor(h: PcCanHistory, config: ElectrodeConfig): number | null {
  const v = h.tests.filter(t => t.config === config).map(t => t.scale);
  return v.length ? mediana(v) : null;
}

/**
 * LO SCARTO DEL SOLO — quanto la configurazione a UNA lattina si discosta da quella a due, per
 * QUESTA persona.
 *
 * È un rapporto e non una differenza: la sensibilità è un fattore di scala, e sommarci un
 * numero non vorrebbe dire niente. `null` finché non sono state provate tutte e due: con una
 * sola non c'è scarto da misurare, e inventarlo sarebbe peggio che non averlo.
 */
export function soloRatio(h: PcCanHistory): number | null {
  const due = scaleFor(h, 'two-cans');
  const una = scaleFor(h, 'solo-can');
  if (due === null || una === null || due <= 0) return null;
  return una / due;
}

/** Quanti giorni fa è stata fatta l'ultima prova (con la configurazione data, o con qualunque). */
export function daysSince(h: PcCanHistory, now: number, config?: ElectrodeConfig): number | null {
  const v = h.tests.filter(t => !config || t.config === config).map(t => t.t);
  if (!v.length) return null;
  return Math.max(0, Math.floor((now - Math.max(...v)) / 86_400_000));
}

/** La prova è stata fatta OGGI, con le due lattine? È il riferimento che fa fede. */
export const testedToday = (h: PcCanHistory, now: number): boolean =>
  daysSince(h, now, 'two-cans') === 0;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// IL MARGINE SULLA SCALA DEL TONO
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * Quante divisioni si tolgono al tono quando la prova non c'è.
 *
 * « Nel caso di non test dovresti ritirare almeno una divisione dal calcolo sulla scala del
 * TONO » — una, che è il minimo indicato. Non è una correzione della misura: è un margine
 * dichiarato. Il tono che si mostra è quello che si può sostenere, non quello che si spera.
 */
export const TONE_MARGIN_NO_TEST = 1;

/**
 * Il margine da togliere, in divisioni.
 *
 *   prova fatta oggi con le due lattine → 0
 *   prova fatta, ma non oggi            → 1 (la pelle cambia: ieri non è oggi)
 *   nessuna prova                       → 1
 *
 * Non cresce coi giorni: una prova di un mese fa e una di ieri sono tutte e due « non di oggi »,
 * e fingere di saper misurare l'incertezza in funzione del tempo sarebbe inventare una curva
 * che nessuno ha osservato.
 */
export const toneMargin = (h: PcCanHistory, now: number): number =>
  testedToday(h, now) ? 0 : TONE_MARGIN_NO_TEST;

/**
 * Il tono, col margine tolto.
 *
 * ⚠️ SI TOGLIE SEMPRE, in tutti e due i versi della scala: il margine dice « non so con
 * precisione », non « sei più in basso ». Togliere vuol dire prudenza — verso il basso, che è
 * il verso in cui una dichiarazione ottimista fa danno.
 *
 * ⚠️ E SI FERMA AL FONDO SCALA. Senza il limite, un tono a −40 col margine diventava −41 — un
 * valore che sulla scala di Ron non esiste (segnalato: « perché indichi −41? la scala si ferma
 * a −40 »). Il margine dice che non si sa con precisione; non può far uscire dalla scala.
 */
export const withMargin = (tone: number, margin: number): number =>
  Math.max(-TONE_SCALE_MAX, Math.min(TONE_SCALE_MAX, tone - margin));

// ═══════════════════════════════════════════════════════════════════════════════════════════
// PERSISTENZA — per PRECLEAR, e non per strumento
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * L'assetto del meter si salva per strumento (`thetaSetup`); questo si salva per PERSONA, ed è
 * la differenza che conta: la stessa stretta sullo stesso apparecchio dà numeri diversi da una
 * mano all'altra.
 *
 * La chiave è il nome del preclear normalizzato — accenti e maiuscole via — perché « Marie » e
 * « marie » sono la stessa persona e nessuno lo scrive due volte uguale.
 */
const CHIAVE = 'sm_can_tests';

export const pcKey = (pc: string): string =>
  pc.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

type Archivio = Record<string, CanTest[]>;

const leggiArchivio = (): Archivio => {
  try {
    const s = localStorage.getItem(CHIAVE);
    if (!s) return {};
    const o = JSON.parse(s) as unknown;
    return (o && typeof o === 'object') ? o as Archivio : {};
  } catch (_) { return {}; }
};

/** Le prove di un preclear. Senza nome torna uno storico vuoto: non si tiene un archivio
 *  « senza nome » in cui finirebbero mescolate persone diverse. */
export function loadHistory(pc: string): PcCanHistory {
  const k = pcKey(pc);
  if (!k) return emptyHistory(pc);
  const v = leggiArchivio()[k];
  if (!Array.isArray(v)) return emptyHistory(pc);
  // Si ricostruisce voce per voce: un valore fuori posto qui manderebbe l'ago fuori scala.
  const tests = v.filter((t): t is CanTest =>
    !!t && Number.isFinite((t as CanTest).t) && Number.isFinite((t as CanTest).scale)
    && (t as CanTest).scale > 0
    && ((t as CanTest).config === 'two-cans' || (t as CanTest).config === 'solo-can'));
  return { pc, tests: tests.slice(-MAX_TESTS) };
}

export function saveHistory(h: PcCanHistory): void {
  const k = pcKey(h.pc);
  if (!k) return;
  try {
    const a = leggiArchivio();
    a[k] = h.tests;
    localStorage.setItem(CHIAVE, JSON.stringify(a));
  } catch (_) { /* quota o modalità privata */ }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// IL TA CHE SI MOSTRA — sempre riportato alle DUE LATTINE
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * ── PERCHÉ IL RIFERIMENTO SONO LE DUE LATTINE ───────────────────────────────────────────────
 * « Che fa fede sono le DUE LATTINE » (richiesta utente). Non è una convenzione arbitraria: con
 * due lattine la corrente attraversa il corpo da una mano all'altra, e la resistenza che si
 * misura è quella del preclear. Con UNA sola il circuito si chiude altrimenti — la resistenza
 * è un'altra, e più alta. Lo stesso preclear, nello stesso istante, dà due TA diversi secondo
 * quante lattine tiene.
 *
 * Se non si dicesse quale delle due si sta guardando, due sedute dello stesso caso non sarebbero
 * confrontabili — e nessuno saprebbe perché.
 *
 * ── COSA SI FA, ALLORA ──────────────────────────────────────────────────────────────────────
 *   due lattine        → il TA è già il riferimento: non si tocca.
 *   una lattina, PROVATA  → si conosce lo scarto di QUESTA persona, e si riporta a due.
 *   una lattina, NON provata → si toglie UNA DIVISIONE (4 diventa 3) e LO SI DICE.
 *
 * L'ultima riga è quel che l'utente ha chiesto alla lettera. Non è una stima dello scarto vero:
 * è un margine dichiarato, nel verso prudente. Una lattina legge PIÙ resistenza, quindi un TA
 * più alto: mostrarlo tale e quale farebbe credere a un caso più carico di quel che è.
 */
export const TA_MARGIN_SOLO_NO_TEST = 1;

/** Da dove viene il TA che si sta guardando — va scritto accanto al numero. */
export type TaBasis =
  /** Due lattine: il riferimento, nessuna correzione. */
  | 'two-cans'
  /** Una lattina, con lo scarto misurato su questa persona: riportato a due. */
  | 'solo-measured'
  /** Una lattina senza prova: una divisione tolta, e dichiarata. */
  | 'solo-margin';

export interface TaReading {
  /** Il numero da mostrare. */
  ta: number;
  basis: TaBasis;
  /** Divisioni tolte (0 o 1). Serve a scriverlo. */
  margin: number;
}

/**
 * Il TA da mostrare, riportato alle due lattine.
 *
 * @param taGrezzo   il TA letto dallo strumento, nella configurazione in uso
 * @param config     quante lattine il preclear sta tenendo
 * @param offsetSolo la correzione MISURATA per la configurazione a una lattina, in divisioni di
 *                   TA (dal pannello TRIM). `0` = mai misurata.
 */
export function taToTwoCans(
  taGrezzo: number, config: ElectrodeConfig, offsetSolo: number,
): TaReading {
  if (config === 'two-cans') return { ta: taGrezzo, basis: 'two-cans', margin: 0 };
  // Una correzione misurata batte sempre un margine: è un dato, l'altro è prudenza.
  // ⚠️ `clampTa` come ovunque: il TA vive fra 0 e il fondo scala dello strumento, e una
  // correzione non può portarlo fuori — un TA negativo non è un TA basso, è un errore.
  if (Number.isFinite(offsetSolo) && offsetSolo !== 0) {
    return { ta: clampTa(taGrezzo + offsetSolo), basis: 'solo-measured', margin: 0 };
  }
  return {
    ta: clampTa(taGrezzo - TA_MARGIN_SOLO_NO_TEST),
    basis: 'solo-margin',
    margin: TA_MARGIN_SOLO_NO_TEST,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// LA PROVA DOPPIA — due lattine, poi una, e la DIFFERENZA
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * ── PERCHÉ UNA PROVA SOLA NON BASTA ─────────────────────────────────────────────────────────
 * La prova della stretta tara la SENSIBILITÀ dell'ago, e la si fa in UNA configurazione. Ma la
 * correzione che serve al TA è un'altra cosa: di quanto lo stesso preclear, nello stesso
 * istante, legge diverso con una lattina invece che con due. Quella non si deduce da una prova
 * sola — servono le DUE, e la loro differenza.
 *
 * Il ciclo è quindi: due lattine → si legge il TA · una lattina → si legge il TA · si confronta.
 * Finché mancano tutte e due le letture non c'è niente da confrontare, e il programma ripiega
 * sul margine di una divisione (vedi `taToTwoCans`).
 *
 * ── COSA SI TIENE ───────────────────────────────────────────────────────────────────────────
 * La DIFFERENZA, non le due letture: è lei che si somma al TA quando si audita in solo, ed è
 * lei che finisce in `ThetaSetup.offsets['solo-can']`. Le due letture sono il modo di
 * ottenerla, non il risultato.
 */
export interface CanCompare {
  /** Il TA letto con DUE lattine — il riferimento. */
  taTwo: number | null;
  /** Il TA letto con UNA lattina. */
  taSolo: number | null;
}

export const emptyCompare = (): CanCompare => ({ taTwo: null, taSolo: null });

/**
 * Lo SCARTO da sommare al TA letto con una lattina per riportarlo alle due.
 *
 * Con una lattina la resistenza è più alta, quindi il TA è più alto: lo scarto è NEGATIVO, e
 * sommandolo si scende. `null` finché manca una delle due letture — con una sola non c'è
 * differenza da misurare, e inventarla sarebbe peggio che non averla.
 *
 * ⚠️ SI RIFIUTA UNO SCARTO ASSURDO. Oltre mezza scala di TA non è una differenza di
 * configurazione: è una lettura presa male — la lattina lasciata, la mano asciutta, la prova
 * fatta due giorni dopo. Meglio nessuna correzione che una correzione sbagliata di due punti.
 */
export const MAX_SOLO_OFFSET = 3;

export function soloTaOffset(c: CanCompare): number | null {
  if (c.taTwo === null || c.taSolo === null) return null;
  if (!Number.isFinite(c.taTwo) || !Number.isFinite(c.taSolo)) return null;
  const scarto = c.taTwo - c.taSolo;
  if (Math.abs(scarto) > MAX_SOLO_OFFSET) return null;
  return scarto;
}

/** Tutte e due le letture ci sono? Serve a sapere quando mostrare il confronto. */
export const compareReady = (c: CanCompare): boolean =>
  c.taTwo !== null && c.taSolo !== null;

/**
 * LO SCARTO È CAMBIATO dall'ultima volta?
 *
 * La prova doppia si rifà a ogni seduta — la pelle non è quella di ieri, e la presa nemmeno.
 * Rifarla serve a poco se non si vede il confronto con quel che si era misurato prima: è la
 * DERIVA il dato interessante, non il numero nuovo da solo.
 *
 * Sotto un decimo di TA non si parla di cambiamento: è il rumore della misura, e chiamarlo
 * « cambiato » vorrebbe dire farlo notare ogni volta, cioè non farlo notare mai.
 */
export const MIN_OFFSET_CHANGE = 0.1;

export interface OffsetDrift {
  /** Lo scarto memorizzato prima di questa prova. `null` = mai misurato. */
  prima: number | null;
  /** Quello appena misurato. */
  ora: number;
  /** Di quanto è cambiato. `null` quando non c'era niente con cui confrontarsi. */
  deriva: number | null;
  /** Vale la pena dirlo? */
  cambiato: boolean;
}

export function offsetDrift(prima: number | null, ora: number): OffsetDrift {
  if (prima === null || prima === 0 || !Number.isFinite(prima)) {
    return { prima: null, ora, deriva: null, cambiato: false };
  }
  const deriva = ora - prima;
  // ⚠️ CON UNA TOLLERANZA, e serve davvero: −0,85 meno −0,95 dà 0,09999999999999998 in virgola
  // mobile, e un confronto secco scartava come « rumore » uno scarto che vale ESATTAMENTE la
  // soglia. Due valori distanti quanto la soglia devono superarla.
  return { prima, ora, deriva, cambiato: Math.abs(deriva) >= MIN_OFFSET_CHANGE - 1e-9 };
}
