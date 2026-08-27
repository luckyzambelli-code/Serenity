/**
 * useTruthCycle — IL CICLO TRUTH, fuori dall'interfaccia.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * Quinto ciclo, dopo CONTACT/NULL (`useContactNullCycle`), MIRROR (`useMirrorCycle`) e TONE
 * (`useToneCycle`) — stesso patto: nessuna JSX qui, nessun testo cablato (la lingua arriva
 * da `d.LC`), il CALCOLO resta in `engine/truthScale.ts` puro e provato da solo. Questo
 * modulo tiene solo lo STATO della FSM e l'ordine dei gesti.
 *
 * @see docs/truth-cycle-proposal.md — il resoconto che ha deciso l'architettura: un candidato
 * fisico non diventa MAI un evento da solo (`confermaVerita` è sempre un gesto esplicito
 * dell'auditor, mai una promozione automatica) — la stessa disciplina di DECLARE AS-IS in
 * CONTACT/NULL.
 *
 * ── LA FSM, i sei stati del documento di partenza ──────────────────────────────────────────
 *   idle → ri_located → questioning ⇄ candidate → truth_event → (torna a questioning)
 *                              ↓ (in qualunque momento, "further R/I" trovato)
 *                        return_present → (chiudiTruth) → idle
 */

import { useCallback, useRef, useState } from 'react';
import { TruthSignalTracker, truthFlags, truthConfidence, isCandidate, type TruthPhase } from '../engine/truthScale';
import { TRUTH_CANDIDATE_HOLD_S } from '../engine/tuning';

/** Un evento TRUTH confermato DENTRO lo stesso R/I — Ron continua a chiedere dopo ognuno,
 *  finché non emerge un ulteriore R/I: più di uno per ciclo è la norma, non l'eccezione. */
export interface TruthEvent {
  atSec: number;
  repeatN: number;
  confidence: number;
}

/** Un ciclo TRUTH concluso (un R/I, dalla localizzazione al "further R/I"/return to present),
 *  come finisce nel rapporto e nel PDF. */
export interface TruthCycleRecord {
  n: number;
  riItem: string;
  tStartSec: number;
  tEndSec: number;
  repeats: number;
  events: TruthEvent[];
  furtherRiFound: boolean;
}

/** Quel che si mostra del ciclo in corso. */
export interface TruthDisp {
  confidence: number;
  d: boolean; p: boolean; q: boolean;
}
const DISP_ZERO: TruthDisp = { confidence: 0, d: false, p: false, q: false };

/** Quel che il ciclo ha bisogno di sapere dal resto della seduta.
 *
 *  ⚠️ NIENTE `qL`/`hasMuse`/`hasTheta`/`fnNow` QUI — a differenza di `ToneCycleDeps`. Quei
 *  campi cambiano molte volte al secondo, e leggerli come prop dentro un `useCallback` a
 *  dipendenze vuote (`trackTruth`, sotto) catturerebbe un valore VECCHIO — lo stesso bug già
 *  trovato e corretto per TONE (`qLRef`/`toneMeasuredRef`, v. la nota in `useToneCycle.ts`).
 *  Qui si evita alla radice: il valore vero arriva come PARAMETRO di `trackTruth`, ad ogni
 *  chiamata del chiamante (che quel valore live ce l'ha per davvero), non come prop letta a
 *  freddo dentro la closure. */
export interface TruthCycleDeps {
  /** Il R/I in lavorazione — stesso campo `auditingQuestion` degli altri tre cicli. */
  auditingQuestion: string;
  setAuditingQuestion: (s: string) => void;
  setItemSpoken: (v: boolean) => void;
  nowSec: () => number;
  logLength: () => number;
  log: (text: string, type: 'normal' | 'success') => void;
  ensureAssessmentOn: () => void;
  LC: (it: string, fr: string, en: string, es: string, sv: string) => string;
}

export function useTruthCycle(d: TruthCycleDeps) {
  const [truthPhase, setTruthPhase] = useState<TruthPhase>('idle');
  const truthPhaseRef = useRef(truthPhase); truthPhaseRef.current = truthPhase;
  const [truthDisp, setTruthDisp] = useState<TruthDisp>(DISP_ZERO);
  const [truthRepeats, setTruthRepeats] = useState(0);
  const [truthEvents, setTruthEvents] = useState<TruthEvent[]>([]);

  /** IL MOTORE — uno PER CICLO, come `MirrorCycle`/`ToneLocator`: due sedute nello stesso
   *  processo (App.tsx + SERENITY) non devono scambiarsi l'ambiente/la storia del segnale. */
  const trackerRef = useRef<TruthSignalTracker | null>(null);
  if (trackerRef.current === null) trackerRef.current = new TruthSignalTracker();
  const tracker = trackerRef.current;
  const lastTickSecRef = useRef<number | null>(null);
  /** ── L'HOLD DEL CANDIDATO — segnalato dal vivo: « apparaît fugace une phrase que je
   *  n'arrive pas à lire ». Senza tenuta, un solo campione rumoroso che sfiora la soglia
   *  bastava a far comparire E sparire il badge "candidato" nello stesso tick — illeggibile
   *  per costruzione, non un difetto del testo. Stessa disciplina già in uso per TONE/MIRROR
   *  (`TONE_HOLD_S`, il "turnover" di `MirrorCycle`): un cambio di stato deve REGGERE per un
   *  po' prima di mostrarsi, in ENTRAMBE le direzioni (candidato proposto E ritirato) — non
   *  solo una, altrimenti resterebbe lampante uscire dallo stato quanto entrarci. */
  const truthCandSinceRef = useRef<number | null>(null);
  const truthDismissSinceRef = useRef<number | null>(null);

  const truthCyclesRef = useRef<TruthCycleRecord[]>([]);
  const truthNRef = useRef(0);
  const truthStartSecRef = useRef(0);
  const truthLogCursorRef = useRef(0);
  const truthAwaitItemRef = useRef(false);

  /** LOCALIZZA IL R/I — S0 → S1. Stesso gesto in un click degli altri cicli: campo pieno
   *  ancora subito, campo vuoto aspetta la prima parola detta (v. `Serenity.tsx`/`App.tsx`,
   *  `dichiaraItemDetto`). */
  const locateRI = useCallback(() => {
    tracker.reset();
    truthCandSinceRef.current = null; truthDismissSinceRef.current = null;
    lastTickSecRef.current = null;
    setTruthDisp(DISP_ZERO);
    setTruthRepeats(0);
    setTruthEvents([]);
    truthStartSecRef.current = d.nowSec();
    truthLogCursorRef.current = d.logLength();
    truthAwaitItemRef.current = !d.auditingQuestion.trim();
    // ⚠️ SEGNALATO — « il faut activer l'assessment, car on doit trouver un R&I ». Negli
    // altri quattro cicli l'assessment si accende SOLO quando manca l'item (si aspetta la
    // voce, v. sopra): lì l'item è già SAPUTO, va solo registrato. TRUTH è diverso fin dalla
    // prima riga della procedura di Ron — « locate an R/I via any process »: localizzare NON
    // è registrare un R/I già trovato, è la RICERCA stessa, e la ricerca è esattamente quel
    // che l'assessment fa. Si accende sempre, non solo a campo vuoto.
    d.ensureAssessmentOn();
    d.setItemSpoken(false);
    setTruthPhase('ri_located');
    d.log(`◎ ${d.LC('TRUTH — R/I localizzato', 'TRUTH — R/I localisé', 'TRUTH — R/I located', 'TRUTH — R/I localizado', 'TRUTH — R/I lokaliserat')} ${d.auditingQuestion.trim() ? '· ' + d.auditingQuestion.trim() : ''}`, 'normal');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.auditingQuestion, d.LC]);

  /** « What about this is the truth? » — S1/S2 → S2, e conta la ripetizione. Il comando si
   *  ridà finché non emerge un ulteriore R/I: la ripetizione È il processo, come per TONE. */
  const askTruth = useCallback(() => {
    setTruthPhase('questioning');
    setTruthRepeats(r => r + 1);
  }, []);

  /** IL MOTORE SI ALIMENTA DA FUORI — lo chiama il gestore del worker EEG, a ogni campione,
   *  solo in vista TRUTH (è chi chiama a saperlo). `useCallback` a dipendenze vuote: si
   *  aggancia una volta sola. */
  const trackTruth = useCallback((q: number, nowSec: number, hasInstrument: boolean, fnNow: boolean, pushUi: boolean) => {
    const prev = lastTickSecRef.current;
    const dt = prev === null ? 0 : nowSec - prev;
    lastTickSecRef.current = nowSec;
    const vec = tracker.update(Math.max(0, q), dt);
    if (truthPhaseRef.current !== 'questioning' && truthPhaseRef.current !== 'candidate') return;
    const flags = truthFlags(vec, tracker.ambient, fnNow, hasInstrument);
    const confidence = truthConfidence(flags, vec.coh);
    if (pushUi) setTruthDisp({ confidence, d: flags.d, p: flags.p, q: flags.q });
    // ── S2 → S3, MAI S3 → S4 DA SOLO — v. la nota di testa: un candidato è una PROPOSTA,
    // l'evento resta un gesto dell'auditor (`confermaVerita`, sotto). V. la nota su
    // `truthCandSinceRef`/`truthDismissSinceRef`: né la promozione né il ritiro sono
    // immediati — devono REGGERE `TRUTH_CANDIDATE_HOLD_S` prima di contare per davvero.
    if (truthPhaseRef.current === 'questioning') {
      truthDismissSinceRef.current = null;
      if (isCandidate(confidence)) {
        if (truthCandSinceRef.current === null) truthCandSinceRef.current = nowSec;
        else if (nowSec - truthCandSinceRef.current >= TRUTH_CANDIDATE_HOLD_S) {
          truthCandSinceRef.current = null;
          setTruthPhase('candidate');
        }
      } else {
        truthCandSinceRef.current = null;
      }
    } else if (truthPhaseRef.current === 'candidate') {
      truthCandSinceRef.current = null;
      if (!isCandidate(confidence)) {
        if (truthDismissSinceRef.current === null) truthDismissSinceRef.current = nowSec;
        else if (nowSec - truthDismissSinceRef.current >= TRUTH_CANDIDATE_HOLD_S) {
          truthDismissSinceRef.current = null;
          setTruthPhase('questioning');
        }
      } else {
        truthDismissSinceRef.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** CONFERMA — S3 → S4 (momentaneo) → S2. L'auditor, non il motore, dice che QUESTO era un
   *  vero accordo/verità del PC. Si registra e si torna subito in ascolto: Ron continua a
   *  chiedere dopo ogni verità trovata, finché non emerge un ulteriore R/I. */
  const confermaVerita = useCallback(() => {
    const ev: TruthEvent = { atSec: d.nowSec(), repeatN: truthRepeats, confidence: truthDisp.confidence };
    setTruthEvents(p => [...p, ev]);
    setTruthPhase('truth_event');
    d.log(`✓ TRUTH — ${d.LC('verità confermata', 'vérité confirmée', 'truth confirmed', 'verdad confirmada', 'sanning bekräftad')} ×${truthRepeats} (${(ev.confidence * 100).toFixed(0)}%)`, 'success');
    // Momentaneo per costruzione (v. nota di testa): si torna subito in ascolto.
    setTruthPhase('questioning');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [truthRepeats, truthDisp.confidence, d.LC]);

  /** SCARTA — S3 → S2. Il candidato non era una verità: si continua a chiedere. */
  const scartaCandidato = useCallback(() => {
    setTruthPhase('questioning');
  }, []);

  /** UN ULTERIORE R/I È EMERSO — S2/S3 → S5. Il segno che la ricerca su QUESTO R/I è
   *  arrivata al suo termine naturale (v. la procedura di Ron in testa al file). */
  const trovatoUlterioreRI = useCallback(() => {
    setTruthPhase('return_present');
    d.log(`○ TRUTH — ${d.LC('ulteriore R/I trovato · pronto per il ritorno al tempo presente', 'R/I supplémentaire trouvé · prêt pour le retour au temps présent', 'further R/I found · ready for return to present time', 'R/I adicional encontrado · listo para el retorno al tiempo presente', 'ytterligare R/I hittat · redo för återgång till nutid')}`, 'normal');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.LC]);

  /** CHIUDE IL CICLO — S5 → S0. Registra il R/I concluso (con tutte le verità trovate lungo
   *  la strada) e torna pronto per il prossimo. */
  const chiudiTruth = useCallback(() => {
    truthCyclesRef.current.push({
      n: ++truthNRef.current, riItem: d.auditingQuestion.trim(),
      tStartSec: truthStartSecRef.current, tEndSec: d.nowSec(),
      repeats: truthRepeats, events: truthEvents, furtherRiFound: true,
    });
    d.log(`✓ TRUTH — ${d.LC('R/I chiuso · tornato al tempo presente', 'R/I clos · retour au temps présent', 'R/I closed · returned to present time', 'R/I cerrado · retorno al tiempo presente', 'R/I stängt · återgått till nutid')} (×${truthRepeats}, ${truthEvents.length} ${d.LC('verità', 'vérités', 'truths', 'verdades', 'sanningar')})`, 'success');
    setTruthPhase('idle');
    setTruthDisp(DISP_ZERO);
    setTruthRepeats(0);
    setTruthEvents([]);
    d.setAuditingQuestion('');
    d.setItemSpoken(false);
    tracker.reset();
    truthCandSinceRef.current = null; truthDismissSinceRef.current = null;
    lastTickSecRef.current = null;
    truthAwaitItemRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.auditingQuestion, truthRepeats, truthEvents, d.LC]);

  /** ANNULLA — a metà strada, senza registrare nulla (come `ANNULER` negli altri cicli). */
  const resetTruth = useCallback(() => {
    setTruthPhase('idle');
    setTruthDisp(DISP_ZERO);
    setTruthRepeats(0);
    setTruthEvents([]);
    d.setAuditingQuestion('');
    d.setItemSpoken(false);
    tracker.reset();
    truthCandSinceRef.current = null; truthDismissSinceRef.current = null;
    lastTickSecRef.current = null;
    truthAwaitItemRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    trackTruth,
    truthPhase, setTruthPhase, truthPhaseRef,
    truthDisp, truthRepeats, truthEvents,
    locateRI, askTruth, confermaVerita, scartaCandidato, trovatoUlterioreRI, chiudiTruth, resetTruth,
    truthCyclesRef, truthAwaitItemRef, truthLogCursorRef,
  };
}
