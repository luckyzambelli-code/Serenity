/**
 * moduleRegistry — I MODULI COME DATI.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * Oggi « quale pannello si vede quando » è sparso in 2 260 righe di JSX: un `moduleVis.x &&`
 * qui, un `sessionState === 'running' &&` là, un `instruments.muse &&` più sotto. Per sapere
 * che cosa comparirà in una certa fase bisogna leggere tutto il render — e infatti nessuno lo
 * sa: è così che si è arrivati a sette pannelli accesi prima ancora di collegare uno strumento.
 *
 * Qui la stessa cosa è una TABELLA. Si legge in dieci secondi, e un modulo nuovo si aggiunge
 * scrivendo una riga invece di cercare il punto giusto nel JSX.
 *
 * È lo stesso mestiere di `sessionMode.ts` (dal metodo discendono ago e comandi) e di
 * `sessionPhase.ts` (dai segnali discende la fase). Terzo anello: dalla fase discende lo schermo.
 *
 * ── UNA LISTA SOLA PER MODULO ───────────────────────────────────────────────────────────────
 * La specifica prevedeva due liste, `autoIn` (dove si apre) e `hideIn` (dove sparisce). Scritte
 * entrambe, `hideIn` si è rivelato aria: se una fase non è in `autoIn` il modulo è già chiuso,
 * e le due liste potevano contraddirsi sulla STESSA fase — cosa che è puntualmente successa alla
 * prima stesura, colta dal test di coerenza. Resta `autoIn`: dove non è scritto, è chiuso. Una
 * tabella che si legge in dieci secondi è tutto il punto; due liste che si smentiscono no.
 *
 * ── QUESTO FILE NON GOVERNA ANCORA NIENTE ───────────────────────────────────────────────────
 * `layoutStore.moduleVis` continua a decidere che cosa si vede. Questa tabella si CALCOLA in
 * parallelo e si prova; accenderla è la tappa 5. Separare il « dire » dal « fare » è ciò che
 * rende la tappa 4 — lo smontaggio del render — verificabile invece che sperata.
 *
 * @see docs/refonte-fasi.md §4 — la mappa fase per fase, da cui questa tabella è trascritta.
 */

import type { SessionPhase } from '../engine/sessionPhase';
import type { SessionMode } from '../engine/sessionMode';

/** Dove un modulo si posa. Gli slot sono quelli di `<Stage>` (tappa 4). */
export type Slot = 'left' | 'right' | 'center' | 'dock' | 'overlay' | 'rail';

/**
 * Quanto in profondità l'utente vuole vedere. DUE livelli, non tre.
 *
 *   • `normal` — quel che serve a condurre: ago, ciclo, comandi, assessment, journal,
 *                salute, camere, MNA. Il default.
 *   • `expert` — tutto ciò che gli strumenti ammettono, `autoIn` disattivato: il regime di
 *                chi TARA lo strumento (trim dell'ago, calibrazione TA, diagnostica, la barra
 *                dell'integrità).
 *
 * ── PERCHÉ DUE E NON TRE ────────────────────────────────────────────────────────────────────
 * La prima stesura ne aveva tre (essenziale / standard / esperto). Il difetto di tre livelli è
 * che quello di mezzo diventa quello che nessuno scegle: chi vuole poco prende il primo, chi
 * vuole tutto prende l'ultimo, e il mezzo esiste solo nel codice. Ron l'ha scritto con parole
 * sue — « alternately, we can have a basic one and a professional option to separate the two ».
 * Due livelli, e la scelta è ovvia in entrambi i sensi.
 */
export type UiLevel = 'normal' | 'expert';

const ORDINE: Record<UiLevel, number> = { normal: 0, expert: 1 };
/** Un modulo si vede se il suo livello non è più profondo di quello scelto. */
export const levelAllows = (modulo: UiLevel, scelto: UiLevel): boolean =>
  ORDINE[modulo] <= ORDINE[scelto];

export type ModuleId =
  | 'journal' | 'health' | 'cam1' | 'cam2' | 'assessment' | 'biometric' | 'mna'
  | 'commandBar' | 'cycleStatus' | 'meta' | 'trim' | 'thetaCal' | 'diagnostics';

export interface ModuleSpec {
  id: ModuleId;
  slot: Slot;
  level: UiLevel;
  /** Le SOLE fasi in cui il modulo si apre da sé. Vuoto = mai da solo (si apre a mano). */
  autoIn: SessionPhase[];
  /** Gli strumenti senza i quali non ha sorgente. Stessa idea di `MODE_SPEC.needsEeg`. */
  requires?: { muse?: boolean; theta?: boolean; camera?: boolean };
  /** I metodi in cui è pertinente. Assente = tutti. */
  modes?: SessionMode[];
  /**
   * Le fasi in cui si apre da sé quando la seduta è REMOTA, se diverse.
   *
   * Serve alle camere, e non è un caso particolare da tollerare. In locale il preclear è nella
   * stanza: la camera è ridondante, e nei momenti di lettura fine il movimento in periferia è
   * rumore (R1) — quindi sparisce. A distanza il volto del preclear È il preclear: guardarlo
   * NON è distrazione, è la regola R1 stessa applicata. Non è un livello diverso, è un elenco
   * di fasi diverso: lo stesso modulo, con il preclear altrove, non ha lo stesso mestiere.
   */
  remoteAutoIn?: SessionPhase[];
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// I GRUPPI DI FASI — scritti una volta sola, se no divergono alla prima modifica
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** « DAI L'ITEM »: il ciclo non è ancora partito, si può ancora scegliere e guardarsi intorno. */
const ITEM: SessionPhase[] = [
  'contact.item', 'null.item', 'mirror.item', 'mirror.say_item', 'tone.locate', 'free',
];

/** Ciclo ARMATO: si legge fine, e la periferia deve stare zitta (R1). */
const CICLO_ATTIVO: SessionPhase[] = [
  'contact.mockup', 'contact.asis',
  'null.mockup', 'null.rise', 'null.equilibrium',
  'mirror.contact', 'mirror.doubling', 'mirror.reached',
  'tone.sign', 'tone.magnitude', 'tone.mockup', 'tone.done',
];

/** Tutta la seduta: item + ciclo. (`ep_window` non c'è: là non resta NIENTE.) */
const IN_SEDUTA: SessionPhase[] = [...ITEM, ...CICLO_ATTIVO];

/** Comodo per « tutto tranne… » senza scrivere quindici voci a mano. */
const tranne = (fasi: SessionPhase[], ...fuori: SessionPhase[]): SessionPhase[] =>
  fasi.filter(p => !fuori.includes(p));

export const MODULE_REGISTRY: readonly ModuleSpec[] = [
  // ── Colonna sinistra ──────────────────────────────────────────────────────────────────────
  {
    id: 'journal', slot: 'left', level: 'normal',
    // Resta durante il mock-up di CONTACT: si CONGELA, non sparisce (decisione §7.1) — e il
    // congelamento è uno stato del modulo, non una visibilità: vive in `TranscriptLog`.
    autoIn: [...ITEM, 'contact.mockup'],
  },
  {
    id: 'health', slot: 'left', level: 'normal',
    // R4 — allarme, non cruscotto: prima della seduta si apre da sé; DURANTE la seduta solo
    // su degrado, che non è una fase — lo decide `useVisibleSet` con `alarms`.
    autoIn: ['instruments', 'preflight', 'ready'],
    requires: { muse: true },
  },

  // ── Colonna destra ────────────────────────────────────────────────────────────────────────
  {
    id: 'assessment', slot: 'right', level: 'normal',
    // Ovunque in seduta TRANNE dove l'auditor non deve fare altro che guardare l'ago salire,
    // e dove la fase offre due o quattro bottoni e nient'altro.
    autoIn: tranne(IN_SEDUTA, 'null.rise', 'mirror.doubling', 'tone.sign', 'tone.magnitude'),
  },
  {
    // LA CAMERA DEL PRECLEAR. In locale sparisce nei momenti di lettura fine; a distanza NON
    // sparisce mai in seduta — è il preclear, ed è lì che l'attenzione deve stare.
    id: 'cam1', slot: 'right', level: 'normal',
    autoIn: ['ready', ...ITEM],
    remoteAutoIn: ['ready', ...IN_SEDUTA],
    requires: { camera: true },
  },
  {
    id: 'cam2', slot: 'right', level: 'normal',
    autoIn: ['ready', ...ITEM],
    remoteAutoIn: ['ready', ...IN_SEDUTA],
    requires: { camera: true },
  },
  {
    id: 'biometric', slot: 'right', level: 'expert',
    // Mai da sé: la percentuale sta nel badge del MUSE, dove sta il casco di cui è la qualità.
    // Qui resta la BARRA, cioè l'andamento — roba di chi tara, non di chi conduce.
    autoIn: [],
    requires: { muse: true },
  },

  // ── Centro e barra bassa ──────────────────────────────────────────────────────────────────
  {
    id: 'cycleStatus', slot: 'center', level: 'normal',
    autoIn: tranne(IN_SEDUTA, 'free'),
    // MIRROR e TONE hanno il loro quadrante: la barra CONTACT/NULL lì non si mostra.
    modes: ['contact', 'null'],
  },
  {
    id: 'commandBar', slot: 'dock', level: 'normal',
    // R2 — un solo gesto per fase: a ciclo armato il selettore dei metodi NON c'è, perché
    // cambiare metodo CHIUDE il ciclo in corso (`finalizeCycle(false)`). Mostrarlo mentre il
    // ciclo gira è offrire un errore irreversibile a portata di clic.
    autoIn: ['ready', ...ITEM],
  },
  {
    id: 'mna', slot: 'dock', level: 'normal',
    // NON è un modo, è un ATTREZZO: si apre a mano dentro qualunque ciclo e non si chiude al
    // cambio di fase. Per questo `autoIn` è vuoto.
    //
    // In NORMAL e non in ESPERTO: è uno strumento di CONDUZIONE — si vuole poter fare un
    // SONIFY mentre un CONTACT gira — non di taratura. Metterlo fra le manopole voleva dire
    // che un auditor che conduce non trovava il bottone.
    autoIn: [],
    requires: { muse: true },
  },
  {
    id: 'meta', slot: 'center', level: 'normal',
    // I quattro campi (Objectif / Processus / État physique / R-Factor) sono dati di INIZIO
    // seduta: vivono in `ready`, non per un'ora a schermo.
    autoIn: ['ready'],
  },

  // ── Sovrapposizioni di taratura — solo a mano, solo in ESPERTO ───────────────────────────
  { id: 'trim',        slot: 'overlay', level: 'expert', autoIn: [] },
  { id: 'thetaCal',    slot: 'overlay', level: 'expert', autoIn: [], requires: { theta: true } },
  { id: 'diagnostics', slot: 'overlay', level: 'expert', autoIn: [] },
] as const;

/** Accesso per id — la tabella è piccola, ma cercarla a mano invita a sbagliare. */
export const moduleById = (id: ModuleId): ModuleSpec | undefined =>
  MODULE_REGISTRY.find(m => m.id === id);
