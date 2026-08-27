/**
 * TRUTH SCALE — il ciclo TRUTH del protocollo di Ron.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * @see docs/truth-cycle-proposal.md — il resoconto che ha preceduto questo file: valuta
 * l'architettura proposta (vettore di stato, FSM a sei stati, punteggio di fiducia, doppia
 * interfaccia professional/basic-solo) contro il codice reale, e stabilisce le regole che
 * questo modulo rispetta:
 *   1. Il livello FISICO (qui) propone CANDIDATI, non EVENTI — un evento richiede sempre la
 *      conferma dell'auditor (v. `useTruthCycle.ts`, `confermaVerita`), mai un ramo automatico.
 *      Scrivere qui `if (drop) truth = true` sarebbe esattamente la trappola che il documento
 *      di partenza vieta: « mai TRUTH = caduta del segnale ».
 *   2. Nessuna pipeline di segnale nuova: si legge `d.qL`, la STESSA carica che CONTACT/NULL/
 *      MIRROR/TONE già usano — nessun sensore nuovo, nessun HRV (non misurato in questo
 *      codice, e non si finge di misurarlo).
 *   3. Ogni costante è dichiarata NON VERIFICATA finché non esistono sedute reali da cui
 *      trarle — stessa disciplina di `TONE_AMBIENT_ALPHA`/`TONE_SIGMA_SPAN` in `tuning.ts`.
 *
 * ── LA PROCEDURA, nelle parole di Ron ────────────────────────────────────────────────────────
 * Localizzare un R/I con un processo qualunque; chiedere ripetutamente « What about this is
 * the truth? » finché non emerge un ULTERIORE R/I; a quel punto « Return to present time! ».
 * Quel che sembrava una caduta era spesso un ACCORDO — la verità del PC che affiora, non una
 * scarica nel senso di CONTACT/NULL.
 *
 * ── LA FSM — sei stati, come nel documento di partenza ─────────────────────────────────────
 *   S0 idle            nessun R/I in lavorazione
 *   S1 ri_located       R/I localizzato, non ancora in domanda
 *   S2 questioning       « What about this is the truth? » in corso (si può ripetere)
 *   S3 candidate         il motore ha proposto un candidato — in attesa di conferma/scarto
 *   S4 truth_event        momentaneo: appena confermato, torna subito a QUESTIONING (si
 *                         continua a chiedere, come nella procedura di Ron)
 *   S5 return_present     « further R/I » trovato — pronto per « Return to present time! »
 *
 * Puro TS, nessun React, nessuna DSP: si testa da solo.
 */

import {
  TRUTH_SMOOTH, TRUTH_AMBIENT_ALPHA, TRUTH_DROP_SIGMA, TRUTH_SETTLE_SIGMA,
  TRUTH_W_D, TRUTH_W_P, TRUTH_W_Q, TRUTH_W_COH, TRUTH_CANDIDATE_THRESHOLD,
} from './tuning';

export type TruthPhase =
  | 'idle' | 'ri_located' | 'questioning' | 'candidate' | 'truth_event' | 'return_present';

/**
 * Il vettore di stato — S/Ṡ/S̈ dalla carica EEG, `rTa` dal Meter (quando c'è). Niente HRV: non
 * esiste un sensore per lei in questo codice, e un campo finto varrebbe peggio di un campo
 * assente. `coh` è un proxy di "quanto il segnale è STABILE adesso" (1 − scarto normalizzato
 * dalla propria media), non la coerenza EEG multi-canale che userebbe quel nome altrove — lo
 * stesso genere di prestito già fatto da MIRROR/TONE per l'"ambiente" della persona.
 */
export interface TruthStateVector {
  s: number;
  sDot: number;
  sDotDot: number;
  rTa: number | null;
  coh: number;
}

/**
 * TruthSignalTracker — deriva S/Ṡ/S̈ e la coerenza da un flusso di `qL`, un campione per tick.
 *
 * Tre EMA in cascata (stesso alfa di `TONE_SMOOTH`/`MIRROR_SMOOTH`, non una taratura nuova):
 * il segnale lisciato, la sua velocità lisciata, la sua accelerazione lisciata — esattamente
 * come derivare velocità/accelerazione da una posizione rumorosa richiede sempre un filtro,
 * non differenze grezze (che amplificherebbero il rumore ad ogni derivata).
 *
 * L'AMBIENTE (`ambientDevRef`, la stessa idea di `qLAmbientDevRef` in `useToneCycle.ts` — v.
 * la sua nota, TONE è stato corretto con lo stesso principio nello stesso giro di sessione)
 * non si azzera mai fra un R/I e l'altro: è un tratto della persona in seduta, non di UN R/I.
 */
export class TruthSignalTracker {
  private sSmooth = 0;
  private sDotSmooth = 0;
  private sDotDotSmooth = 0;
  private started = false;
  private ambientDev = 0;

  /** Da chiamare a ogni tick, con la carica EEG grezza (`d.qL`) e il tempo di seduta in s. */
  update(sRaw: number, dtS: number): TruthStateVector {
    if (!this.started) {
      this.sSmooth = sRaw; this.started = true;
      return { s: this.sSmooth, sDot: 0, sDotDot: 0, rTa: null, coh: 1 };
    }
    const dt = Math.max(1e-3, dtS);
    const prevSSmooth = this.sSmooth;
    const prevSDotSmooth = this.sDotSmooth;
    this.sSmooth = this.sSmooth * (1 - TRUTH_SMOOTH) + sRaw * TRUTH_SMOOTH;
    const sDotRaw = (this.sSmooth - prevSSmooth) / dt;
    this.sDotSmooth = this.sDotSmooth * (1 - TRUTH_SMOOTH) + sDotRaw * TRUTH_SMOOTH;
    const sDotDotRaw = (this.sDotSmooth - prevSDotSmooth) / dt;
    this.sDotDotSmooth = this.sDotDotSmooth * (1 - TRUTH_SMOOTH) + sDotDotRaw * TRUTH_SMOOTH;
    // ── L'AMBIENTE — v. la nota di classe. Quanto il campione GREZZO si scosta dalla propria
    // media lisciata, con un'EMA molto più lenta: "quanto tipicamente oscilla questa persona".
    this.ambientDev = this.ambientDev * (1 - TRUTH_AMBIENT_ALPHA)
      + Math.abs(sRaw - this.sSmooth) * TRUTH_AMBIENT_ALPHA;
    const coh = Math.max(0, Math.min(1, 1 - Math.abs(sRaw - this.sSmooth) / Math.max(1e-3, this.ambientDev * 4)));
    return { s: this.sSmooth, sDot: this.sDotSmooth, sDotDot: this.sDotDotSmooth, rTa: null, coh };
  }

  /** L'ampiezza-ambiente corrente — serve a `truthFlags` per normalizzare D/P sulla persona,
   *  non su una soglia assoluta uguale per chiunque (stesso principio del fix TONE). */
  get ambient(): number { return this.ambientDev; }

  reset(): void {
    this.sSmooth = 0; this.sDotSmooth = 0; this.sDotDotSmooth = 0; this.started = false;
    // L'ambiente NON si azzera: è un tratto della persona, non di questo R/I (v. sopra).
  }
}

export interface TruthFlags {
  /** D(t) — la carica sta CALANDO più di quanto il rumore ambiente spieghi da solo. */
  d: boolean;
  /** P(t) — il calo si sta ASSESTANDO (accelerazione tornata vicina a zero) invece di
   *  continuare a precipitare, oppure c'è un F/N in corso sull'ago in gioco: la "firma" di
   *  qualcosa che si è risolto, non di una caduta che continua. */
  p: boolean;
  /** Q(t) — la lettura è genuina: uno strumento è davvero collegato adesso. */
  q: boolean;
}

/**
 * I tre flag, normalizzati sull'AMBIENTE di questa persona (`ambient`, da
 * `TruthSignalTracker.ambient`) — mai una soglia assoluta uguale per chiunque, stessa
 * correzione appena fatta per TONE nello stesso giro di sessione.
 */
export function truthFlags(vec: TruthStateVector, ambient: number, fnNow: boolean, hasInstrument: boolean): TruthFlags {
  const amb = Math.max(1e-3, ambient);
  const d = vec.sDot <= -TRUTH_DROP_SIGMA * amb;
  const settling = Math.abs(vec.sDotDot) <= TRUTH_SETTLE_SIGMA * amb;
  const p = (d && settling) || fnNow;
  const q = hasInstrument;
  return { d, p, q };
}

/** Il punteggio di fiducia C(t) — somma pesata dei tre flag più la coerenza, mai un flag da
 *  solo. Pesi in `tuning.ts`, dichiaratamente non ancora tarati su dati reali. */
export function truthConfidence(flags: TruthFlags, coh: number): number {
  const raw = (flags.d ? TRUTH_W_D : 0) + (flags.p ? TRUTH_W_P : 0) + (flags.q ? TRUTH_W_Q : 0)
    + Math.max(0, Math.min(1, coh)) * TRUTH_W_COH;
  return Math.max(0, Math.min(1, raw));
}

/** Sopra questa soglia un candidato merita di essere PROPOSTO all'auditor (S2→S3) — mai
 *  promosso da solo a evento confermato (S3→S4 resta un gesto esplicito, v. la nota di testa). */
export const isCandidate = (confidence: number): boolean => confidence >= TRUTH_CANDIDATE_THRESHOLD;
