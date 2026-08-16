/**
 * useContactNullCycle — I DUE CICLI CENTRALI, fuori dall'interfaccia.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * Terzo pezzo del SESSION CONTROLLER, dopo `useToneCycle` e `useMirrorCycle`. Stesso patto: è
 * LO STESSO CODICE, spostato, coi nomi che `App.tsx` usava già — così il render non cambia e
 * l'estrazione si verifica conducendo una seduta prima e dopo.
 *
 * ── PERCHÉ SONO UNA COSA SOLA ───────────────────────────────────────────────────────────────
 * CONTACT e NULL si armano SEPARATAMENTE (nessuna bascula automatica, è una richiesta esplicita)
 * ma condividono tutto il resto: la numerazione, il ciclo corrente, la chiusura, i contatori, il
 * t_Item da cui si misura il lag di Ron. Separarli vorrebbe dire duplicare quel corpo — e i due
 * numeri di ciclo divergerebbero al primo cambio.
 *
 * ── QUESTO È IL PEZZO CHE NON SI SCOLLA BENE ────────────────────────────────────────────────
 * La cartografia SERENITY diceva che il controllore di sessione non è separabile come il motore,
 * e questo modulo ne è la prova: l'interfaccia delle dipendenze qui sotto è larga. Ma è larga in
 * modo ONESTO — ogni riga dice una cosa che il ciclo NON sa fare da sé e a chi la chiede. Prima
 * quelle stesse chiamate c'erano lo stesso, sparse in 8 000 righe, dove nessuno le contava.
 *
 * I motori a modulo unico (`cycleStateMachine`, `nullCycleStateMachine`, `falseAsIsDetector`,
 * `clearReadDetector`, `contactPredictor`, `chargeEpisode`, `lagMeter`, `taAccumulator`,
 * `tzoneStore`, `metricsStore`) NON passano da qui: si importano, come faceva App. Sono già
 * ognuno la sua cosa, provata a parte.
 *
 * @see docs/serenity-refonte.md — le fasi della refonte.
 */

import { useCallback, useRef, useState } from 'react';
import { type ChargeStateId } from '../lib/chargeState';
import { cycleStateMachine } from '../engine/CycleStateMachine';
import { nullCycleStateMachine, type NullStateId } from '../engine/NullCycleStateMachine';
import { clearReadDetector } from '../engine/ClearReadDetector';
import { falseAsIsDetector } from '../engine/FalseAsIsDetector';
import { contactPredictor } from '../engine/ContactPredictor';
import { chargeEpisode } from '../engine/ChargeEpisodeTracker';
import { lagMeter } from '../engine/LagMeter';
import { taAccumulator } from '../engine/TaAccumulator';
import { tzoneStore } from '../store/tzoneStore';
import { metricsStore } from '../store/metricsStore';

/** Un ciclo, concluso o abbandonato, come finisce nel rapporto e nel PDF. */
export interface ArmedCycle {
  n: number; question: string; tItemMs: number; tStartSec: number; tEndSec: number;
  phaseReached: ChargeStateId; completed: boolean; leadMs?: number;
  falseAsIs?: boolean; io?: number; taAtAsIs?: number;
  /** Ciclo NULL: tipo, flag « niente si ricarica », e i VGI's inscritti alla validazione. */
  kind?: 'charge' | 'null'; noRecharging?: boolean; clearRead?: boolean; vgi?: boolean;
}

/** Il ciclo in corso. `phaseReached` è la fase PIÙ AVANZATA toccata, non quella di adesso. */
interface CurrentCycle {
  n: number; question: string; tItemMs: number; tStartSec: number;
  phaseReached: ChargeStateId; leadMs: number | null;
}

/** Quel che si scrive nel CORPUS a ogni ciclo — concluso o no. */
export interface CycleCorpusRow {
  kind: 'charge' | 'null';
  durSec: number;
  qlAtContact?: number;
  taStart?: number;
  taEnd: number;
  done: boolean;
  falseAsIs?: boolean;
}

/** Quel che arriva dal worker EEG a ogni campione. */
export interface CycleTick {
  phase: ChargeStateId;
  /** Il predittore: la carica MONTA, c'è stato un evento di contatto, e la pendenza. */
  rising: boolean;
  contactEvent: boolean;
  slope: number;
  validSignal: boolean;
  /** Carica mostrata (per il CORPUS) e carica grezza (per lo smaltimento). */
  qlDisp: number;
  qL: number;
  /** γ e il suo picco: il marcatore di fronte d'onda più precoce che si abbia. */
  gam: number;
  gammaSpike: boolean;
  bpm: number | null;
  signalQuality: number;
}

/** Quel che il ciclo ha bisogno di sapere — e di far fare — al resto della seduta. */
export interface ContactNullDeps {
  auditingQuestion: string;
  setAuditingQuestion: (s: string) => void;
  setItemSpoken: (v: boolean) => void;
  /** Il tempo di seduta, in secondi. */
  nowSec: () => number;
  /** Quante righe ha il giornale adesso — per captare solo ciò che si dice DOPO il tasto. */
  logLength: () => number;
  log: (text: string, type: 'normal' | 'success' | 'highlight') => void;
  LC: (it: string, fr: string, en: string, es: string, sv: string) => string;
  /** Il TA dell'ago VERO, se c'è il meter. `null` → si ripiega sul TA ricostruito. */
  thetaTa: () => number | null;
  /** L'ago si libera per l'item NUOVO: la reazione che conta è a QUESTO. */
  freeNeedleForNewItem: () => void;
  /** Item dato a voce → l'assessment si accende da sé, se non gira già. */
  ensureAssessmentOn: () => void;
  /** Un item è stato dato a questo secondo di seduta (raggruppamento delle reazioni). */
  onItemGiven: (sec: number) => void;
  /** Scrive la riga d'archivio del ciclo. Chi la riceve sa se la seduta è aperta. */
  writeCycleCorpus: (row: CycleCorpusRow) => void;
  /** « Su QUESTO F/N è stato dichiarato l'AS-IS » — il legame fra indicatore e decisione. */
  markFnAsIs: () => void;
  /** AS-IS raggiunto → la sonificazione non ha più carica da trattare: si spegne. */
  stopSonification: () => void;
  /** Il lag di Ron è stato misurato su questo ciclo. */
  onLagMeasured: (m: { deltaStar: number; n: number; trend: number; baseline: number; adaptive: number }) => void;
}

/** AS-IS? (manualReady) — le due guardie, da tarare sul campo.
 *  A: il blow-down ≥90% deve TENERE tanto così (uccide i cali e il rumore).
 *  B: il picco del ciclo deve arrivare a questa carica — una carica VERA, non una sfiorata. */
const AS_IS_SUSTAIN_MS = 1500;
const AS_IS_MIN_PEAK   = 1.2;

const phaseOrder: Record<ChargeStateId, number> = { neutral: 0, contact: 1, discharge: 2, asis: 3 };

export function useContactNullCycle(d: ContactNullDeps) {
  // ── LO STATO DEL CICLO ────────────────────────────────────────────────────────────────────
  const [cycleArmed, setCycleArmed] = useState(false);
  const cycleArmedRef = useRef(false); cycleArmedRef.current = cycleArmed;
  const [cycleKind, setCycleKind] = useState<'charge' | 'null'>('charge');
  const cycleKindRef = useRef<'charge' | 'null'>('charge'); cycleKindRef.current = cycleKind;

  const [nullPhase, setNullPhase] = useState<NullStateId>('neutral');
  const [nullNoRecharge, setNullNoRecharge] = useState(false);
  /** Secondi dall'avvio del NULL — solo INFO: nessun conto alla rovescia, ogni PC ha il suo tempo. */
  const [nullSinceMock, setNullSinceMock] = useState(0);
  /** SEGNALE del motore su un ciclo CONTACT: nessuna lettura entro la finestra del comm lag
   *  (t_Item = pressione del pulsante) → « sembra NULL ». È solo un'INDICAZIONE: non cambia
   *  ciclo da solo, sei tu a premere NULL se vuoi. */
  const [noReadSignal, setNoReadSignal] = useState(false);
  /** TA al momento in cui il ciclo NULL parte — ANCORA della misura. Si mostra lo scarto da QUEL
   *  punto (3,5 → 3,1 = 0,4), non la distanza dalla convenzione 3/2: è il LAVORO del ciclo, ed è
   *  RELATIVO, quindi immune alla taratura assoluta del TA (dimostrata non affidabile). */
  const [taAtNullStart, setTaAtNullStart] = useState(0);
  // Specchi per le chiusure: `finalizeCycle` è chiamato anche da callback registrati una volta
  // sola, dove lo stato React sarebbe quello di allora.
  const nullNoRechargeRef = useRef(false); nullNoRechargeRef.current = nullNoRecharge;
  const clearReadValidRef = useRef(false);
  const clearReadVgiRef   = useRef(false);

  /** AS-IS raggiunto ma NON ancora validato: l'indicatore resta su AS-IS e il bottone aspetta. */
  const [asIsPending, setAsIsPending] = useState(false);
  const asIsPendingRef = useRef(false);
  /** MANUAL-READY (AGGANCIATO): quando l'AS-IS automatico su F/N non è scattato ma la carica è
   *  scesa, il quadrante offre la validazione. AGGANCIATO con isteresi, così NON sfarfalla
   *  mentre qL oscilla intorno alla soglia: resta fino a validazione, stop, o vero ri-contatto. */
  const [manualReady, setManualReady] = useState(false);
  const manualReadyRef = useRef(false);
  const setManualReadyBoth = (v: boolean) => { if (manualReadyRef.current !== v) { manualReadyRef.current = v; setManualReady(v); } };
  const manualReadySinceRef = useRef<number | null>(null);
  /** FALSO AS-IS: γ persiste + nessuna decelerazione cardiaca attraverso l'AS-IS → la carica è
   *  stata duplicata, non rilasciata (si ri-armerà). Indice d'Origine (IO) graduato. */
  const [asIsFalse, setAsIsFalse] = useState(false);
  const [asIsIO, setAsIsIO] = useState(0);
  const asIsFalseRef = useRef(false);   // catturati nel ciclo alla chiusura, per il rapporto
  const asIsIORef = useRef(0);

  const curCycleRef = useRef<CurrentCycle | null>(null);
  const auditingCyclesRef = useRef<ArmedCycle[]>([]);
  /** Numerazione GLOBALE (progressiva per seduta) + quanti sono arrivati in fondo. */
  const cyclesStartedRef = useRef(0);
  const cyclesAsIsRef = useRef(0);
  /** Contatori SEPARATI per tipo — richiesta esplicita: CONTACT e NULL si contano a parte. */
  const cStartedRef = useRef(0), cDoneRef = useRef(0);   // CONTACT → AS-IS
  const nStartedRef = useRef(0), nDoneRef = useRef(0);   // NULL    → EQUILIBRIUM
  const [cycleStats, setCycleStats] = useState({ cStarted: 0, cDone: 0, nStarted: 0, nDone: 0 });
  const pushCycleStats = () => setCycleStats({
    cStarted: cStartedRef.current, cDone: cDoneRef.current,
    nStarted: nStartedRef.current, nDone: nDoneRef.current });

  /** CORPUS: carica al CONTATTO e TA d'inizio ciclo. Vanno presi QUANDO succedono: a fine ciclo
   *  la carica è per definizione andata, e leggerla lì darebbe sempre ~0. */
  const cycleQlAtContactRef = useRef<number | null>(null);
  const cycleTaStartRef = useRef<number | null>(null);

  /** Premuto col campo VUOTO: si aspetta che l'item sia detto a voce. */
  const cycleAwaitItemRef = useRef(false);
  const cycleLogCursorRef = useRef(0);

  // ── CHIUSURA ─────────────────────────────────────────────────────────────────────────────
  const finalizeCycle = useCallback((completed: boolean) => {
    // L'attesa dell'item dettato finisce col ciclo: senza questo, una parola detta DOPO la
    // chiusura si sarebbe presa l'etichetta del ciclo appena finito.
    cycleAwaitItemRef.current = false;
    const c = curCycleRef.current;
    if (c) {
      // Il TA all'istante dell'AS-IS (fine ciclo) — l'auditor lo vuole registrato per ciclo,
      // nel rapporto accanto all'AS-IS.
      const taFine = metricsStore.get().toneArm;
      auditingCyclesRef.current.push({ ...c, tEndSec: d.nowSec(), completed, falseAsIs: asIsFalseRef.current, io: asIsIORef.current, taAtAsIs: taFine,
        kind: cycleKindRef.current, noRecharging: nullNoRechargeRef.current, clearRead: clearReadValidRef.current, vgi: clearReadVgiRef.current });
      // ── CORPUS: il ciclo, concluso o abbandonato ─────────────────────────────────────────
      // Si scrive in ENTRAMBI i casi: un ciclo abbandonato dice quanto spesso un procedimento
      // non arriva in fondo, che è informazione clinica quanto un AS-IS raggiunto.
      d.writeCycleCorpus({
        kind: cycleKindRef.current || 'charge',
        durSec: Math.max(0, d.nowSec() - c.tStartSec),
        qlAtContact: cycleQlAtContactRef.current ?? undefined,
        taStart: cycleTaStartRef.current ?? undefined,
        taEnd: taFine,
        done: completed,
        falseAsIs: asIsFalseRef.current || undefined,
      });
      if (completed) {
        // Validato dall'auditor → riga di giornale (col n° di ciclo) + contatore. Il ciclo NULL
        // finisce su un EQUILIBRIUM (coi VGI's inscritti), non su un AS-IS.
        d.log(cycleKindRef.current === 'null'
          ? `✓ #${c.n} ${c.question || d.LC('ciclo', 'cycle', 'cycle', 'ciclo', 'cykel')} — EQUILIBRIUM · ${clearReadVgiRef.current ? 'VGIs' : 'no VGIs'}`
          : `✓ #${c.n} ${c.question || d.LC('ciclo', 'cycle', 'cycle', 'ciclo', 'cykel')} — AS-IS`,
          'success');
        cyclesAsIsRef.current += 1;
        // CORPUS: l'AS-IS è stato dichiarato → l'F/N su cui si è deciso porta il flag.
        d.markFnAsIs();
        if (cycleKindRef.current === 'null') nDoneRef.current += 1; else cDoneRef.current += 1;
        pushCycleStats();
        // AS-IS raggiunto → si CHIUDE anche la sonificazione neuro-acustica in corso: la carica
        // non c'è più, quindi il tono primo non ha più niente da trattare.
        d.stopSonification();
      }
    }
    curCycleRef.current = null;
    setCycleArmed(false);
    setAsIsPending(false); asIsPendingRef.current = false;
    setManualReadyBoth(false); manualReadySinceRef.current = null;
    setAsIsFalse(false); falseAsIsDetector.reset();
    // IL CAMPO ITEM SI SVUOTA A CICLO CHIUSO. Se no, il prossimo DAI L'ITEM ritrova il vecchio
    // item in `auditingQuestion`, lo prende per buono (`cycleAwaitItemRef = !q` → false) e NON
    // aspetta la voce: si riparte con l'item di prima (segnalato). Svuotandolo, il nuovo item
    // detto a voce prende il posto del vecchio, che è quel che ci si aspetta.
    d.setAuditingQuestion('');
    d.setItemSpoken(false);   // e il prossimo ciclo torna a CHIEDERE l'item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.LC]);

  /** CICLO NULL — l'auditor VALIDA l'EQUILIBRIUM INSCRIVENDO i VGI's. */
  const validateClearRead = useCallback((vgi: boolean) => {
    clearReadValidRef.current = true;
    clearReadVgiRef.current = vgi;
    finalizeCycle(true);
  }, [finalizeCycle]);

  /** L'auditor preme « Valida AS-IS » → conferma e chiude il ciclo. */
  const validateAsIs = useCallback(() => finalizeCycle(true), [finalizeCycle]);

  /** Il NULL non si ricarica: l'auditor lo dichiara, e il ciclo si chiude NON validato. */
  const declareNoRecharging = useCallback(() => {
    nullCycleStateMachine.declareNoRecharging();
    setNullNoRecharge(true); nullNoRechargeRef.current = true;
    finalizeCycle(false);
  }, [finalizeCycle]);

  // ── ARMAMENTO ────────────────────────────────────────────────────────────────────────────
  /** Arma un ciclo per l'item corrente. I DUE cicli si armano MANUALMENTE e SEPARATAMENTE
   *  (richiesta esplicita — nessuna bascula automatica):
   *    • 'charge' (bottone START) → CONTACT → DISCHARGE → AS-IS
   *    • 'null'   (bottone NULL)  → NULL → RISE → EQUILIBRIUM (mock-up, VGI's) */
  const armCycle = useCallback((kind: 'charge' | 'null' = 'charge') => {
    if (curCycleRef.current) finalizeCycle(false);   // prima si chiude quel che è aperto
    d.freeNeedleForNewItem();   // si dà l'item → l'ago è libero di reagire a QUESTO
    const q = d.auditingQuestion.trim();
    const n = ++cyclesStartedRef.current;
    if (kind === 'null') nStartedRef.current += 1; else cStartedRef.current += 1;
    pushCycleStats();
    curCycleRef.current = { n, question: q, tItemMs: Date.now(), tStartSec: d.nowSec(), phaseReached: 'neutral', leadMs: null };
    // CORPUS: il TA di partenza del ciclo. Con le lattine è quello dell'ago vero, se no l'EEG:
    // è lo stesso numero che l'auditor vede in cima al quadrante.
    d.onItemGiven(d.nowSec());
    cycleTaStartRef.current = d.thetaTa() ?? metricsStore.get().toneArm;
    cycleQlAtContactRef.current = null;
    // Ciclo nuovo: si azzerano FSM, predittore ed episodio, così il prossimo contatto è di QUESTO item.
    cycleStateMachine.reset(); chargeEpisode.resetSession(); contactPredictor.reset();
    falseAsIsDetector.reset();
    nullCycleStateMachine.reset(); clearReadDetector.reset();
    d.setItemSpoken(false);   // nuovo ciclo → l'item torna da dare.
    setCycleKind(kind); setNullNoRecharge(false); setNullSinceMock(0);
    setNoReadSignal(false);
    if (kind === 'null') { nullCycleStateMachine.armNull(Date.now()); setNullPhase('null'); setTaAtNullStart(taAccumulator.toneArm); }
    else setNullPhase('neutral');
    clearReadValidRef.current = false; clearReadVgiRef.current = false;
    tzoneStore.resetCycle();   // la % di dissoluzione del ciclo riparte (il totale di seduta resta)
    setCycleArmed(true);
    setAsIsPending(false); asIsPendingRef.current = false;
    setManualReadyBoth(false); manualReadySinceRef.current = null;
    setAsIsFalse(false); setAsIsIO(0); asIsFalseRef.current = false; asIsIORef.current = 0;
    d.log(kind === 'null'
      ? `○ #${n} ${q || d.LC('ciclo', 'cycle', 'cycle', 'ciclo', 'cykel')} — NULL · ${d.LC('chiedi un mock-up', 'demande un mock-up', 'ask for a mock-up', 'pide un mock-up', 'be om en mock-up')}`
      : `▶ #${n} ${q || d.LC('ciclo', 'cycle', 'cycle', 'ciclo', 'cykel')}`,
      'normal');
    // ── ITEM DETTATO A VOCE, come in MIRROR ────────────────────────────────────────────────
    // Premuto col campo VUOTO, la PRIMA parola dell'auditor diventa l'item. In MIRROR
    // funzionava già e in CONTACT/NULL no: si era costretti a scrivere, cioè a staccare gli
    // occhi dall'ago proprio nel momento in cui si dà l'item.
    cycleAwaitItemRef.current = !q;
    cycleLogCursorRef.current = d.logLength();   // solo ciò che si dice DOPO il tasto
    // DANDO L'ITEM A VOCE l'assessment si accende da sé: così gli item detti si vedono nella
    // lista senza dover premere ASSESS a parte. Solo se l'item è a voce (`!q`) — se lo scrivi,
    // non serve aprire la cattura vocale.
    if (!q) d.ensureAssessmentOn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.auditingQuestion, d.LC, finalizeCycle]);

  /**
   * L'ITEM DETTATO È ARRIVATO.
   *
   * ⚠️ Il ciclo NON si ri-arma: `armCycle` ha già ancorato l'istante premendo il bottone, ed è
   * quello il t_Item giusto — da lì si misura il lag di Ron. Qui si RIEMPIE soltanto
   * l'etichetta, al contrario del MIRROR, che deve ri-agganciare perché il suo valore È la
   * carica istantanea dell'item.
   */
  const itemDettato = useCallback((txt: string) => {
    cycleAwaitItemRef.current = false;
    d.setAuditingQuestion(txt);
    const c = curCycleRef.current;
    if (!c) return;
    c.question = txt;
    d.log(`▶ #${c.n} ${d.LC('item', 'item', 'item', 'ítem', 'item')} · ${txt}`, 'normal');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.LC]);

  /**
   * IL CICLO SI ALIMENTA DA FUORI — lo chiama il gestore del worker EEG, a ogni campione.
   *
   * Si tiene la fase PIÙ AVANZATA toccata dall'item corrente; arrivata all'AS-IS il ciclo non si
   * chiude da solo — l'indicatore resta lì e aspetta l'auditor.
   *
   * `useCallback` a dipendenze vuote: il gestore del worker si aggancia una volta sola e questa
   * funzione non deve cambiare identità sotto di lui. Tutto ciò che le serve sta nei ref.
   */
  const trackCycle = useCallback((t: CycleTick) => {
    if (!cycleArmedRef.current || !curCycleRef.current) return;
    const _cc = curCycleRef.current;
    if (phaseOrder[t.phase] > phaseOrder[_cc.phaseReached]) _cc.phaseReached = t.phase;
    // CORPUS: la carica al CONTATTO, presa una volta sola — è « quanta ce n'era » in partenza,
    // il termine di paragone di tutto quello che il ciclo poi scarica.
    if (cycleQlAtContactRef.current == null && t.phase === 'contact') {
      cycleQlAtContactRef.current = t.qlDisp;
    }
    // LAG-METER: il PRIMO fronte d'onda dopo l'armamento (picco γ o salita di qL) → tempo di
    // reazione t_LE − t_Item. La mediana sui cicli è Δt* (il lag di Ron).
    if (_cc.leadMs == null && t.validSignal && (t.gammaSpike || t.contactEvent)) {
      const _lag = Date.now() - _cc.tItemMs;
      // NON CONSUMA il « primo fronte d'onda » del ciclo se il lag non è PLAUSIBILE (recordLag
      // lo accetta fra 120 e 3000 ms). Se no un picco γ IMMEDIATO (< 120 ms: il PC reagiva GIÀ,
      // non all'item) bruciava l'unica misura → recordLag lo rifiutava → leadMs restava posato
      // → Δt* CONGELATO al baseline. Lasciandolo a null si continua a guardare il vero fronte.
      if (lagMeter.recordLag(_lag)) {
        _cc.leadMs = _lag;
        const _ds = lagMeter.getDeltaStar();
        d.onLagMeasured({ deltaStar: _ds, n: lagMeter.getN(), trend: lagMeter.getTrend(),
                          baseline: lagMeter.getBaseline(), adaptive: lagMeter.getAdaptive() });
        // Si applica alla proiezione dell'ago, LIMITATO: un tempo di reazione lungo NON va
        // proiettato 1:1 sull'ago (sfonderebbe) — si taglia alla portata del Pre-Read.
        contactPredictor.setLagMs(Math.max(120, Math.min(500, _ds)));
      }
    }

    // ── SEGNALE del motore su un ciclo CONTACT: « c'è carica » o « è nullo ».
    // t_Item = la pressione del bottone = il momento in cui l'auditor DÀ l'item → la finestra
    // del comm lag (Δt* + margine) è finalmente GIUSTA. Nessuna bascula automatica: è una
    // semplice INDICAZIONE, l'auditor preme NULL se lo decide.
    if (cycleKindRef.current === 'charge' && t.validSignal) {
      const _win = Math.max(1500, lagMeter.getDeltaStar() + 1200);
      setNoReadSignal(_cc.leadMs == null && Date.now() - _cc.tItemMs >= _win);
    }

    // ── CICLO NULL — NESSUNA bascula automatica: è l'auditor ad armarlo (bottone NULL); qui si
    // ALIMENTA soltanto la sua FSM quando è attivo.
    //   `rising`    = la carica MONTA (il mock-up crea massa);
    //   `clearHeld` = il TA è tornato alla SUA base (3/2) e ci si tiene (ClearReadDetector).
    if (cycleKindRef.current === 'null') {
      const _base = taAccumulator.getCalibration().baseline;
      const _clearHeld = clearReadDetector.update(taAccumulator.toneArm, _base, Date.now());
      const _np = nullCycleStateMachine.update(t.rising && t.validSignal, _clearHeld, Date.now());
      // Questi stati cambiano RARAMENTE → React esce da sé se il valore è identico, non serve
      // il freno a 10 Hz.
      setNullPhase(_np.phase); setNullNoRecharge(_np.noRecharging);
      // Tempo dall'armamento del NULL: INFO (arrotondato al secondo → 1 ridisegno/s al massimo).
      setNullSinceMock(Math.floor(nullCycleStateMachine.sinceArmS(Date.now())));
    }

    if (!asIsPendingRef.current) {
      // Prima dell'AS-IS: si costruiscono i riferimenti (γ + BPM + contatto + pendenza) per l'IO.
      falseAsIsDetector.feedCycle(t.gam, t.bpm, t.slope, t.signalQuality);
      // MANUAL-READY, AGGANCIATO (niente sfarfallio): una volta che il ciclo si è davvero
      // scaricato, si offre la validazione (« AS-IS? ») e la si TIENE per il resto del ciclo.
      // Si azzera solo ad armamento, validazione o stop. Usa qL GREZZO, più liscio del predetto
      // vicino all'F/N. Due guardie perché non scatti a ogni caricuzza (segnalato: usciva troppo):
      //   A — il blow-down ≥90% dev'essere SOSTENUTO (non un calo momentaneo);
      //   B — il picco del ciclo dev'essere una carica VERA, non una sfiorata appena sopra CONTACT.
      if (!manualReadyRef.current) {
        const _asIsReady =
          phaseOrder[_cc.phaseReached] >= phaseOrder['discharge']
          && tzoneStore.get().cyclePeakQ >= AS_IS_MIN_PEAK            // B
          && tzoneStore.cycleDissolved(t.qL) >= 0.90;
        if (_asIsReady) {
          if (manualReadySinceRef.current == null) manualReadySinceRef.current = Date.now();
          if (Date.now() - manualReadySinceRef.current >= AS_IS_SUSTAIN_MS) setManualReadyBoth(true); // A
        } else {
          manualReadySinceRef.current = null;   // le condizioni sono cadute → il timer riparte
        }
      }
      if (t.phase === 'asis') {
        // AS-IS raggiunto. NON si chiude da sé: l'indicatore resta su AS-IS e un bottone
        // « Valida AS-IS » aspetta che l'auditor confermi.
        _cc.phaseReached = 'asis';
        asIsPendingRef.current = true;
        setAsIsPending(true);
        falseAsIsDetector.startWatch(Date.now());   // si apre la finestra di sorveglianza
      }
    } else {
      // AS-IS in attesa: si guardano rilascio γ + crollo di velocità + decelerazione BPM → IO.
      const _verdict = falseAsIsDetector.watch(t.gam, t.bpm, t.slope, Date.now());
      if (_verdict !== 'pending') {
        const _false = _verdict === 'false';
        const _io = falseAsIsDetector.getIO();
        asIsFalseRef.current = _false; asIsIORef.current = _io;
        setAsIsFalse(_false); setAsIsIO(_io);
        if (_false) d.log(`⚠ #${_cc.n} AS-IS da verificare — IO ${_io.toFixed(2)} (rilascio debole)`, 'highlight');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * FINE SEDUTA — un ciclo ancora armato si registra « non concluso », così compare nel rapporto.
   *
   * ⚠️ Questa via NON passa da `finalizeCycle`: non deve toccare i contatori né scrivere nel
   * giornale (la seduta è già chiusa). Ma per l'archivio è un ciclo non concluso come gli altri,
   * e senza questa riga sparirebbe.
   */
  const closeOpenCycleAtEnd = useCallback(() => {
    const c = curCycleRef.current;
    if (c) {
      auditingCyclesRef.current.push({ ...c, tEndSec: d.nowSec(), completed: false });
      d.writeCycleCorpus({
        kind: cycleKindRef.current || 'charge',
        durSec: Math.max(0, d.nowSec() - c.tStartSec),
        qlAtContact: cycleQlAtContactRef.current ?? undefined,
        taStart: cycleTaStartRef.current ?? undefined,
        taEnd: d.thetaTa() ?? metricsStore.get().toneArm,
        done: false,
      });
      curCycleRef.current = null;
    }
    setCycleArmed(false);
    setAsIsPending(false); asIsPendingRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Seduta nuova: i due cicli tornano com'erano all'apertura dell'applicazione. */
  const resetCycles = useCallback(() => {
    curCycleRef.current = null; auditingCyclesRef.current = [];
    setCycleArmed(false);
    cyclesStartedRef.current = 0; cyclesAsIsRef.current = 0;
    cStartedRef.current = 0; cDoneRef.current = 0; nStartedRef.current = 0; nDoneRef.current = 0;
    setCycleStats({ cStarted: 0, cDone: 0, nStarted: 0, nDone: 0 });
    setAsIsPending(false); asIsPendingRef.current = false;
    setManualReadyBoth(false); manualReadySinceRef.current = null;
    setAsIsFalse(false); setAsIsIO(0); asIsFalseRef.current = false; asIsIORef.current = 0;
    setNullPhase('neutral'); setNullNoRecharge(false); setNullSinceMock(0);
    setNoReadSignal(false); setTaAtNullStart(0);
    clearReadValidRef.current = false; clearReadVgiRef.current = false;
    cycleAwaitItemRef.current = false; cycleLogCursorRef.current = 0;
    cycleQlAtContactRef.current = null; cycleTaStartRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    trackCycle,
    // stato del ciclo
    cycleArmed, cycleArmedRef, cycleKind, cycleKindRef,
    nullPhase, nullNoRecharge, nullSinceMock, noReadSignal, taAtNullStart,
    asIsPending, manualReady, asIsFalse, asIsIO,
    cycleStats,
    // gesti
    armCycle, finalizeCycle, validateAsIs, validateClearRead, declareNoRecharging, itemDettato,
    closeOpenCycleAtEnd, resetCycles,
    // registrazione e voce
    curCycleRef, auditingCyclesRef, cyclesStartedRef, cyclesAsIsRef,
    cycleAwaitItemRef, cycleLogCursorRef,
  };
}
