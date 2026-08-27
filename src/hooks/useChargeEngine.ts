/**
 * useChargeEngine — IL MOTORE DELLA CARICA, fuori da App.tsx.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * Fase 6 di SERENITY comincia da qui, non dai cicli. `useContactNullCycle`, `useMirrorCycle` e
 * `useToneCycle` (fase 1) sanno tutti e tre UNA cosa in comune di cui hanno bisogno per fare
 * qualunque cosa: un valore di carica (`qL`) vivo, che arriva dal worker EEG. Prima di questo
 * modulo, quel valore nasceva e moriva dentro `App.tsx` — spawn del worker, lettura dei suoi
 * messaggi, calcolo di fase/reazione/AS-IS — mai passato di là. Montare un ciclo in SERENITY
 * senza questo sarebbe stato un tubo senza un ago all'arrivo.
 *
 * ── PERCHÉ È UNA COSA SOLA, LARGA ───────────────────────────────────────────────────────────
 * Come `useContactNullCycle` prima di questo: l'interfaccia delle dipendenze è larga, ma onesta.
 * Ogni voce di `ChargeEngineDeps` è un valore o una funzione che QUESTO modulo non può sapere da
 * sé. Il corpo della funzione è lo STESSO CODICE che stava in `App.tsx` (l'onmessage del
 * worker), spostato: le variabili libere sono diventate `d.xxx`, la SEQUENZA delle chiamate no.
 * Non è stato riscritto — è stato tolto di lì e messo qui, perché la fedeltà di questo pezzo
 * (rilevamento di carica, AS-IS, reazioni) conta più della sua eleganza.
 *
 * ── PERCHÉ QUASI TUTTO ARRIVA COME REF, NON COME VALORE ─────────────────────────────────────
 * L'effetto che aggancia l'onmessage del worker gira UNA VOLTA SOLA (`useEffect(..., [])`) —
 * risvegliare il worker a ogni render butterebbe via lo stato del DSP. La chiusura che ne esce
 * cattura quindi `d` UNA VOLTA, al montaggio: un valore semplice dentro `d` (un numero, un
 * booleano preso da uno `useState`) resterebbe congelato a quello che valeva allora. Per questo
 * — esattamente come faceva App.tsx (commento storico « FIX H-03 ») — i valori che cambiano
 * durante la seduta arrivano come REF (`.current` si legge sempre fresco) o come funzioni STABILI
 * (`useCallback` a dipendenze vuote, o un setter di `useState`, che React garantisce stabile).
 * `primeCaptured` è l'unica eccezione, voluta: nel codice originale era già un valore semplice
 * catturato una volta, e il suo unico effetto è una `setState` idempotente ridondante — nessun
 * comportamento peggiora spostandolo qui invariato.
 *
 * ── QUEL CHE NON SI MUOVE ───────────────────────────────────────────────────────────────────
 * I motori a modulo unico (`needleEngine`, `chargeEpisode`, `contactPredictor`,
 * `cycleStateMachine`, `reactionClassifier`, `fnTracker`, `taAccumulator`, `velocityTracker`,
 * `metricsStore`, `tzoneStore`, `sessionRecorder`, `calibFeatures`, `primeFreqTracker`,
 * `metabolicBaseline`, `corpusWrite`…) restano dove sono: si importano, come faceva App. Sono
 * già ognuno la sua cosa, provata a parte — è la ragione per cui questa estrazione, grossa
 * com'è, resta un trasloco e non una riscrittura della fisica.
 *
 * ⚠️ `freeNeedleForNewItem`, il gestore RESET di sessione e `flushEegFn` restano in `App.tsx`:
 * toccano gli stessi ref di qui (`activeKickRef`, `kickFlybackRef`, `pendingEegFnRef`…) ma
 * vengono chiamati anche da fuori questo motore (l'armamento di un ciclo, il tasto RESET). I
 * ref che quelle funzioni condividono con questo motore restano quindi dichiarati in `App.tsx`
 * come sempre, e QUI arrivano come dipendenza — non li duplica, li riceve.
 *
 * @see docs/serenity-refonte.md — fase 6.
 */

import { useEffect, useRef, type MutableRefObject } from 'react';
import { needleEngine, virtualNeedle } from '../runtime/NeedleEngine';
import { metabolicBaseline } from '../engine/MetabolicBaseline';
import { corpusWrite } from '../lib/corpusWriter';
import { reactionRecord } from '../engine/corpus';
import { decideNeedle } from '../engine/needleDecision';
import { isMotionArtifact } from '../engine/motionArtifact';
import type { NestWorkerMessage } from '../workers/nestMessages';
import { chargeStateById } from '../lib/chargeState';
import { cycleStateMachine } from '../engine/CycleStateMachine';
import NestWorker from '../workers/nestEngine?worker';
import { metricsStore } from '../store/metricsStore';
import { velocityTracker } from '../engine/VelocityTracker';
import { taAccumulator } from '../engine/TaAccumulator';
import { calibFeatures } from '../engine/CalibFeatures';
import { fnTracker } from '../engine/FnTracker';
import { primeFreqTracker } from '../engine/PrimeFreqTracker';
import { sessionRecorder } from '../engine/SessionRecorder';
import { chargeEpisode } from '../engine/ChargeEpisodeTracker';
import { contactPredictor, qlToNeedlePos } from '../engine/ContactPredictor';
import { tzoneStore } from '../store/tzoneStore';
import { integrityTracker, bpmSmoother } from '../runtime/SmoothingEngine';
import {
  reactionClassifier, REACTION_LABELS, LOGGABLE_REACTIONS, REACTION_OFFSETS,
} from '../engine/ReactionClassifier';
import {
  KICK_FLYBACK_MS, NEEDLE_REST_OFFSET, SHOWN_READS_CAP, THETA_FN_EXPIRE_S,
} from '../engine/tuning';
import type { CycleTick } from '../session/useContactNullCycle';
import type { ReadSrc } from '../engine/instantRead';
import type { LogEntry } from '../components/TranscriptLog';
import type { MnaSession } from './useMnaModule';
import type { PrimePhase, Zone as PrimeZone } from '../lib/primeFreqEngine';

type SessionStateId = 'idle' | 'running' | 'paused' | 'ended';
type ViewMode = 'needle' | 'needle_pure' | 'mirror' | 'tone' | 'truth';
type AsIsnessState = 'persist' | 'as-is' | 'fn' | 'ep';

/**
 * Quel che il motore ha bisogno di LEGGERE dal resto della seduta — e di poter SCRIVERE. Sono
 * quasi tutti ref esistenti: chi li possiede continua a possederli, questo modulo li riceve.
 */
export interface ChargeEngineDeps {
  /** Il worker vive qui dentro: questo modulo lo genera, lo rimpiazza se muore, lo termina.
   *  Resta dichiarato in App.tsx (gli altri ~12 punti che gli scrivono/postano non cambiano). */
  workerRef: MutableRefObject<Worker | null>;
  /** Il giroscopio — per l'artefatto di movimento. Lo stesso buffer che alimenta anche
   *  `useMuseConnection`. */
  gyroBufferRef: MutableRefObject<{ x: number[]; y: number[]; z: number[] }>;

  // ── letture della seduta (mai una chiusura vecchia: sempre `d.xRef.current`) ──────────────
  timeRef: MutableRefObject<number>;
  sessionStateRef: MutableRefObject<SessionStateId>;
  viewModeRef: MutableRefObject<ViewMode>;
  instrumentsRef: MutableRefObject<{ muse: boolean; theta: boolean }>;
  museContactRef: MutableRefObject<boolean>;
  stableReleaseStateRef: MutableRefObject<'active' | 'flow' | 'resistance'>;
  sensitivityRef: MutableRefObject<number>;
  assessActiveRef: MutableRefObject<boolean>;
  thetaTaRef: MutableRefObject<number | null>;
  corpusSessionRef: MutableRefObject<string>;
  /** Il traduttore, in un ref — come in App.tsx: la chiusura del worker è fissa dal montaggio,
   *  la lingua puà cambiare durante la seduta. */
  tRef: MutableRefObject<(key: any) => any>;
  metabolicPhaseRef: MutableRefObject<'idle' | 'baseline' | 'breath' | 'result'>;

  // ── biometria dal worker precedente — mirror per i lettori "vivi" altrove ─────────────────
  realBpmRef: MutableRefObject<number | null>;
  ppgAmpRef: MutableRefObject<number | null>;
  ppgPiRef: MutableRefObject<number | null>;
  lastBpmAtRef: MutableRefObject<number>;
  signalQualityRef: MutableRefObject<number>;

  // ── MNA — pannello acceso da fuori, letto/scritto anche qui dentro il ciclo ──────────────
  primePhaseRef: MutableRefObject<PrimePhase>;
  mnaSessionRef: MutableRefObject<MnaSession>;
  /** Vedi la nota nel commento in cima: unico valore semplice, per scelta — non un ref. */
  primeCaptured: boolean;

  // ── l'ago mostrato — scritto qui, letto per il render e per il corpus ────────────────────
  needleReactionKeyRef: MutableRefObject<string>;
  needleReactionRef: MutableRefObject<string>;
  needleVirtualRef: MutableRefObject<{ time: number; offset: number }[]>;
  shownReadsRef: MutableRefObject<{ time: number; reaction: string; src?: ReadSrc; episodeId?: number }[]>;
  ultimoItemSecRef: MutableRefObject<number | null>;

  // ── i cicli (fase 1) si alimentano da qui: un ref di funzione ciascuno ────────────────────
  trackCycleRef: MutableRefObject<(t: CycleTick) => void>;
  trackMirrorRef: MutableRefObject<(q: number, nowSec: number, pushUi: boolean) => void>;
  trackToneRef: MutableRefObject<(q: number, nowSec: number) => void>;
  trackTruthRef: MutableRefObject<(q: number, nowSec: number, hasInstrument: boolean, fnNow: boolean, pushUi: boolean) => void>;
  cycleArmedRef: MutableRefObject<boolean>;

  // ── giornale + F/N in sospeso — code condivise con App.tsx ────────────────────────────────
  logBufferRef: MutableRefObject<LogEntry[]>;
  pendingEegFnRef: MutableRefObject<{ tSec: number; ta: number } | null>;

  // ── EP a 4 stadi — `hooks/useEpValidation`, non duplicato qui ─────────────────────────────
  epWindowOpenRef: MutableRefObject<boolean>;
  epWindowHasOpenedRef: MutableRefObject<boolean>;
  epWindowTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setEpWindowOpen: (v: boolean) => void;
  setAsIsnessState: (v: AsIsnessState) => void;
  setIsFnActive: (v: boolean) => void;

  // ── stato React che questo motore pubblica (setter di `useState`: stabili di natura) ──────
  setHardwareError: (v: string | null) => void;
  setSignalQuality: (v: number) => void;
  setIsHoldMode: (v: boolean) => void;
  setRealBpm: (v: number | null) => void;
  setDisplayMass: (v: number) => void;
  setPrimeIm: (v: number) => void;
  setPrimeFd: (v: number) => void;
  setPrimePStar: (v: number) => void;
  setPrimeDelta: (v: number) => void;
  setPrimeZone: (v: PrimeZone) => void;
  setPrimeCaptured: (v: boolean) => void;
  setNeedleReactionKey: (v: string) => void;
  setNeedleReaction: (v: string) => void;

  /** L'accumulatore della massa dissolta — un ref, non uno stato: si somma a ogni tick. */
  massAccumulatorRef: MutableRefObject<number>;

  // ── condivisi con `freeNeedleForNewItem` e col RESET di sessione (entrambi in App.tsx) ────
  // Non privati: due funzioni FUORI da questo motore li toccano — un nuovo item interrompe lo
  // swing in corso, un nuovo START azzera l'episodio F/N e gli anti-spam del giornale. Owned
  // da chi li usa in più di un posto, esattamente come `shownReadsRef`/`ultimoItemSecRef` sopra.
  activeKickRef: MutableRefObject<{ raw: number } | null>;
  kickFlybackRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  needleItemInterruptRef: MutableRefObject<number>;
  reactionHoldUntilRef: MutableRefObject<number>;
  gammaEmaRef: MutableRefObject<number>;
  lastFnShownAtRef: MutableRefObject<number>;
  lastLoggedChargeRef: MutableRefObject<string>;
  chargeLogPendingRef: MutableRefObject<{ candidate: string | null; sinceMs: number }>;
  lastLoggedReactionRef: MutableRefObject<{ reaction: string; t: number } | null>;

  /** L'ago è andato fuori scala sul canale legacy GSR → riportalo a SET.
   *  `useCallback(..., [])` in App.tsx: stabile, sicura da catturare una volta sola. */
  resetNeedle: () => void;
  /** Chiude (o apre) la riga CORPUS dell'F/N EEG — resta in App.tsx: la chiama anche
   *  `ContactNullDeps.markFnAsIs` quando l'auditor valida un AS-IS a mano. Legge solo ref e
   *  moduli importati al suo interno: sicura da catturare una volta sola anche se ridefinita
   *  a ogni render di App.tsx. */
  flushEegFn: (asIs: boolean) => void;
}

/**
 * IL MOTORE — spawna il worker, ne legge i messaggi, aggiorna tutto quel che ne dipende.
 * Effetto collaterale puro: non rende nulla, come `useAppInitializer`.
 */
export function useChargeEngine(d: ChargeEngineDeps): void {
  // ── stato PRIVATO del motore — mai letto da fuori: bookkeeping fra un tick e l'altro, che
  // NESSUN'ALTRA funzione tocca. `useRef`, non un oggetto letterale: deve sopravvivere ai
  // render, come in App.tsx.
  //
  // ⚠️ QUI NON CI SONO PIÙ `activeKickRef`, `kickFlybackRef`, `needleItemInterruptRef`,
  // `reactionHoldUntilRef`, `gammaEmaRef`, `lastFnShownAtRef`, `lastLoggedChargeRef`,
  // `chargeLogPendingRef`, `lastLoggedReactionRef` — la prima versione di questo file le
  // teneva private, ma `freeNeedleForNewItem` e il RESET di sessione (rimasti in App.tsx) li
  // toccano ANCHE loro: privati qui, sarebbero rimasti due copie — una viva (letta dal motore)
  // e una morta (quella che quelle funzioni credevano di azzerare). Sono quindi tornati
  // dipendenza (`d.xxx`), owned da chi li usa in più di un posto — vedi `ChargeEngineDeps`.
  const lastMetricsUiRef = useRef(0);
  const lastHistoryPushRef = useRef(0);

  // Setup Web Worker — identico a com'era in App.tsx: spawn con retry limitati, respawn su
  // errore, terminate allo smontaggio.
  useEffect(() => {
    let respawnAttempts = 0;
    const MAX_RESPAWN = 5;

    const handleWorkerMessage = (e: MessageEvent<NestWorkerMessage>) => {
      respawnAttempts = 0; // any message → the worker is healthy
      if (needleEngine.isLocked) return; // Ignorer les données si on est en phase de reset (PHASE-A)
      // O4: removed the dead 'RONS_LAG_RESULT' no-op handler (worker never emits it).

      if (e.data.type === 'HARDWARE_ERROR') {
        d.setHardwareError(d.tRef.current('mass_disconnected') as string);
        d.setSignalQuality(0);
        d.setIsHoldMode(false);
        return;
      }

      if (e.data.type === 'BPM_UPDATE') {
        const incoming = e.data.payload.bpm;
        d.lastBpmAtRef.current = Date.now(); // BPM freshness (stale → "--", see effect)
        d.setRealBpm(incoming);
        // Features AUTONOMIQUES (PPG) : amplitude du pouls + indice de perfusion AC/DC. Elles
        // arrivent avec le BPM ; on les mémorise pour les CAPTURER avec chaque paire d'étalonnage
        // TA (chasse d'un prédicteur sur la BONNE voie physiologique — cf. CalibFeatures).
        if (typeof e.data.payload.ppgAmp === 'number') d.ppgAmpRef.current = e.data.payload.ppgAmp;
        if (typeof e.data.payload.ppgPI === 'number') d.ppgPiRef.current = e.data.payload.ppgPI;
        // PHASE-A: EMA + threshold + publish handled by bpmSmoother
        // (α = 0.08, threshold = 0.5 BPM — same tuning as before).
        bpmSmoother.update(incoming);
        return;
      }

      // (Le handler 'EP_VALIDATION_UPDATE' a été retiré : le worker ne l'émet JAMAIS — code mort
      //  révélé par le typage du canal worker→App, comme l'ancien 'RONS_LAG_RESULT'.)

      if (e.data.type === 'GSR_RESET') {
        // PHASE-A: instant snap + clear motion flag
        needleEngine.snap(NEEDLE_REST_OFFSET);
        needleEngine.clearMotion();
        return;
      }

      if (e.data.type === 'GSR_UPDATE') {
        // 2. Automatiser le retour sur "Set" (Détection de seuil)
        const THRESHOLD = 1.0; // Ajustez selon votre échelle visuelle
        const needlePosition = e.data.payload.position || e.data.payload.offset || 0;

        if (Math.abs(needlePosition) > THRESHOLD) {
          console.warn("Aiguille hors limite, déclenchement auto-reset.");
          d.resetNeedle();
          return; // On arrête le traitement ici pour éviter le rendu de l'erreur
        }

        // PHASE 1 (predictive): the needle position is driven from the PREDICTED
        // charge in METRICS_UPDATE (needleEngine.setTarget(qlToNeedlePos)). This
        // handler is kept ONLY for the safety auto-reset above.
        return;
      }

      if (e.data.type === 'METRICS_UPDATE') {
        d.setHardwareError(null);
        const {
          rhoG,
          vProc,
          velCentroid,
          qL,
          eta,
          tZone,
          diracCount,
          bands,
          massDelta,
          vSol: newVSol,
          isAsIs,
          isStall,
          fnWithHysteresis,
          energyRecovery,
        } = e.data.payload;

        // Pre-session readiness: while the metabolic check overlay collects, feed it
        // the live bands + BPM + contact (breathing flag set during the guided phase).
        const _mp = d.metabolicPhaseRef.current;
        if (_mp === 'baseline' || _mp === 'breath') {
          metabolicBaseline.push({
            alpha: bands?.alpha || 0, beta: bands?.beta || 0, gamma: bands?.gamma || 0, theta: bands?.theta || 0,
            bpm: d.realBpmRef.current, signalQuality: d.signalQualityRef.current, breathing: _mp === 'breath' });
        }

        // NEST V5 velocity (energy-release model) — engine/VelocityTracker
        // (SessionEngine slice 1). Runs EVERY message; velRatio is published to
        // the metricsStore in the 10 Hz pushUi block below.
        velocityTracker.update(qL, bands, velCentroid, d.timeRef.current);
        integrityTracker.setTarget(Math.max(0, Math.min(100, qL * 100))); // PHASE-A

        // Charge lifecycle: AS-IS = the contacted mass's signature (qL + I_m) has
        // collapsed with a Floating Needle. Computed once per cycle here and fed
        // to every chargeState() call + published to the metricsStore for the
        // readout components.
        const _isFN = (d.needleReactionKeyRef.current || '').includes('reaction_fn');
        const _releaseActive = d.stableReleaseStateRef.current === 'active';
        // ── CONTACT GATE (HSI-like) ───────────────────────────────────────────
        // Col Muse NON indossato gli elettrodi flottanti producono rumore che qL
        // trasformerebbe in "carica" fantasma → il ciclo CONTACT→DISSOLUZIONE→AS-IS partirebbe
        // SENZA attività reale. `museContact` è il gate VERO (banda fisiologica + assenza di
        // railing, calcolato in setMuseContact): senza contatto la carica è 0 → ciclo NEUTRO.
        const _validSignal = d.museContactRef.current; // REAL contact (HSI-like) — no contact → no charge
        const _qCharge = _validSignal ? qL : 0;
        const _asIs = chargeEpisode.update(_qCharge, _isFN && _validSignal, Date.now());

        // ── PREDICTIVE CONTACT (Ron's Lag — Phase 1) ──────────────────────────
        // Leading-edge of qL projected forward by Δt → the DISPLAY charge that
        // drives BOTH the needle and the CONTACT/DISCHARGE/AS-IS cycle, so they
        // ANTICIPATE the contact instead of lagging. Raw qL stays untouched for
        // recording / TA / AS-IS-collapse detection (chargeEpisode above).
        const _pred = contactPredictor.update(qL, Date.now());
        const _qlDisp = _pred.predictedQl;

        // ── CYCLE STATE MACHINE — the per-item phase (CONTACT→DISCHARGE→AS-IS),
        // forward-only with dwell + hysteresis so it doesn't ping-pong. This is the
        // SINGLE source of the charge phase for label/sphere/needle-colour + log.
        const _cyc = cycleStateMachine.update(_validSignal ? _qlDisp : 0, _releaseActive && _validSignal, _asIs, Date.now());
        const _phase = _cyc.phase;

        // γ baseline (slow EMA) + SPIKE — the earliest leading-edge marker (Pre-Read).
        const _gam = Math.max(0, bands?.gamma || 0);
        d.gammaEmaRef.current = d.gammaEmaRef.current > 0 ? d.gammaEmaRef.current * 0.98 + _gam * 0.02 : _gam;
        const _gammaSpike = d.gammaEmaRef.current > 0 && _gam > d.gammaEmaRef.current * 1.6;

        // ── ARMED CYCLE: track the furthest phase reached for the current auditing
        // item; when it reaches AS-IS the cycle is COMPLETE → record + auto-disarm.
        // ── IL CICLO ARMATO si alimenta qui — CONTACT e NULL insieme, in `session/
        // useContactNullCycle`. Fase più avanzata raggiunta, lag di Ron, segnale « sembra
        // NULL », FSM del NULL, AS-IS in attesa e falso AS-IS: tutto di là.
        d.trackCycleRef.current({
          phase: _phase, rising: _pred.rising, contactEvent: _pred.contactEvent, slope: _pred.slope,
          validSignal: _validSignal, qlDisp: _qlDisp, qL,
          gam: _gam, gammaSpike: _gammaSpike,
          bpm: d.realBpmRef.current, signalQuality: d.signalQualityRef.current,
        });

        // ── JOURNAL: charge-state changes (debounced) → log + History PDF ──
        if (d.sessionStateRef.current === 'running') {
          const _csNow = chargeStateById(_phase);
          const _nowC = performance.now();
          const _pend = d.chargeLogPendingRef.current;
          if (_csNow.id === d.lastLoggedChargeRef.current) {
            _pend.candidate = null; _pend.sinceMs = 0;
          } else if (_pend.candidate !== _csNow.id) {
            _pend.candidate = _csNow.id; _pend.sinceMs = _nowC;
          } else if (_nowC - _pend.sinceMs >= 2500) {
            d.lastLoggedChargeRef.current = _csNow.id;
            _pend.candidate = null; _pend.sinceMs = 0;
            if (_csNow.labelKey) {
              d.logBufferRef.current.push({ time: d.timeRef.current, speaker: 'NEEDLE',
                text: `◆ ${d.tRef.current(_csNow.labelKey as any) as string}`, type: 'normal' });
            }
          }
        }
        // CONN-68: gate the display-only React state to ~10 Hz.
        const _nowMs = performance.now();
        const pushUi = _nowMs - lastMetricsUiRef.current >= 100;
        if (pushUi) lastMetricsUiRef.current = _nowMs;
        if (pushUi) {
          // NOTE : le worker n'émet PAS `isHold` → ce mode n'a jamais pu s'activer (le bandeau
          // jaune « HOLD » est donc inerte). Comportement inchangé ; à implémenter côté worker
          // si l'on veut ce signal.
          d.setIsHoldMode(false);
          // CONN-122: the 7 high-frequency numeric metrics go to the external
          // metricsStore (NOT App state) → App no longer re-renders at 10 Hz.
          // qL pushed = PREDICTED (display) charge → readouts/sphere/needle color
          // anticipate; raw qL is recorded separately (sessionRecorder below).
          metricsStore.push({ vProc, smoothVProc: velocityTracker.smoothVProc, qL: _qlDisp, eta, velRatio: velocityTracker.velRatio, chargePhase: _phase, reContact: _cyc.reContact, asIsSignature: _asIs });
        }
        // ── VIRTUAL needle drive — a HIDDEN spring tracks the charge every tick; the
        // classifier reads its SMOOTHED position (sampled by sessionClock into
        // needleVirtualRef), not the raw qlToNeedlePos — so a wiggle isn't over-read as a
        // Blow Down. Uses the REAL qL (not predictedQl): predictedQl is projected FORWARD
        // by the Comm Lag (setLagMs ← Δt*), which made reactions register BEFORE they
        // happen. Detecting on real qL lands the read at the true moment — equivalent to
        // "delay the leading signal by the Comm Lag", but exact and without a delay buffer.
        // The cycle/contact machine + sphere keep predictedQl (leading is wanted there).
        virtualNeedle.setTarget(qlToNeedlePos(_validSignal ? qL : 0)); // no contact → ago a riposo, niente reazioni

        // IL = Indice de Libération = Pγ / Pθ (reçu du worker) — FIX B-10: msSol setter removed; mS still used locally for TA calc below
        const { IL, thetaPow, alphaPow, gammaPow, isSomaticPersist, isSomaticRelease, isEmotionalConfirm, isCognitionDetected, isEpSomatic, mS } = e.data.payload;

        // ── TA Quantum Recalibration + Total-TA high-water accumulator ──
        // → engine/TaAccumulator (SessionEngine slice 1; spec §5 NEST V3,
        //   CONN-92/93 calibrations preserved bit-per-bit inside the engine).
        {
          const newDivisions = taAccumulator.update(mS, d.sessionStateRef.current === 'running');
          if (pushUi) metricsStore.push({ toneArm: taAccumulator.toneArm }); // CONN-122: store, not App state
          if (newDivisions >= 0.1) metricsStore.addTotalTa(newDivisions);
        }
        // ── CYCLE MIRROR (méthode de Ron) — vue à part, « DOUBLE POUR EFFACER » par item : valeur
        // effective = pic ; on efface quand le smaltito cumulé = 2× la valeur effective.
        // L'AMBIENTE si misura sempre (anche senza item): è il riferimento del valore relativo.
        // Il resto — aggancio, blocco del valore, smaltito — lo sa il ciclo, non l'interfaccia.
        if (d.viewModeRef.current === 'mirror') {
          d.trackMirrorRef.current(_validSignal ? qL : 0, d.timeRef.current, pushUi);
        }
        // ── TONE SCALE : on tient les dernières secondes du TON et de la CHARGE ────────────
        // L'instant du clic sur LOCALISER est le pire des trois (voir ToneLocator) : il faut
        // pouvoir remonter. On accumule donc en continu, en vue TONE seulement.
        if (d.viewModeRef.current === 'tone') {
          d.trackToneRef.current(_validSignal ? qL : 0, d.timeRef.current);
        }
        // Instrumentation calibration TA (Option B) : snapshot LIVE des 5 bandes BRUTES + BPM,
        // lu par le panneau au moment d'une capture (mS, TA_meter). Offline on formera les RATIOS
        // machine-invariants. N'affecte pas le DSP.
        calibFeatures.set({ delta: bands?.delta, theta: bands?.theta, alpha: bands?.alpha, beta: bands?.beta, gamma: bands?.gamma,
          bpm: d.realBpmRef.current ?? undefined,
          ppgAmp: d.ppgAmpRef.current ?? undefined, ppgPI: d.ppgPiRef.current ?? undefined });

        // hasStableAlphaFn: alpha et theta stables en dB (valeurs réelles MUSE)
        const alphaThetaRatio = alphaPow / Math.max(thetaPow, 1e-12);
        const hasStableAlphaFn = alphaThetaRatio >= 0.8 && alphaThetaRatio <= 1.5 && qL > 0.95;

        // ── CICLO TRUTH (protocollo di Ron) — vista a parte, come MIRROR/TONE. Legge la
        // STESSA carica EEG (nessuna pipeline nuova, v. `truthScale.ts`); l'F/N è lo stesso
        // flag già pronto per il classificatore qui sopra (`fnWithHysteresis ||
        // hasStableAlphaFn`), non un secondo calcolo.
        if (d.viewModeRef.current === 'truth') {
          d.trackTruthRef.current(_validSignal ? qL : 0, d.timeRef.current,
            d.instrumentsRef.current.muse || d.instrumentsRef.current.theta,
            (fnWithHysteresis || hasStableAlphaFn) && _validSignal, pushUi);
        }

        // ── Sensitivity / trim factor ─────────────────────────────────────────
        // FIX H-03: read via refs to avoid stale closure in worker.onmessage
        //          (closure is set once on mount with empty deps).
        const trimFactor = Math.pow(10, needleEngine.trim / 10);
        const s = d.sensitivityRef.current * trimFactor;

        // (dqL/dt derivative block removed — dead since CONN-95: classification
        //  uses the VISIBLE needle movement, nothing read smoothDqL anymore.)

        // ── Reaction classification (CONN-95/96 movement-based) ──────────────
        // → engine/ReactionClassifier (SessionEngine slice 1): moveR over the
        //   VISIBLE needle, sustained F/N detection, dirty-needle persistence —
        //   all preserved bit-per-bit inside the engine.
        const inDirtyRange = IL > 1.5 / s && IL <= 2.5 / s;
        // ARTEFATTO DI MOVIMENTO — calcolato QUI dal giroscopio (engine/motionArtifact).
        // Il worker inviava una costante `false` e il gyro non gli arrivava nemmeno: la guardia
        // del classificatore era quindi MORTA, e un movimento della testa diventava un « Fall »
        // mostrato e registrato come lettura dell'item. Il buffer gyro vive già qui.
        const _gb = d.gyroBufferRef.current;
        const _motionArtifact = isMotionArtifact(_gb.x, _gb.y, _gb.z);
        const reactionKey = reactionClassifier.classify({
          offH: d.needleVirtualRef.current,
          nowS: d.timeRef.current,
          inDirtyRange,
          // `isBpmArtifact` resta NON implementato (nessuna definizione condivisa) — non lo si finge.
          isBpmArtifact: false,
          isMotionArtifact: _motionArtifact,
          isStall: !!isStall,
          // Prior F/N basé sur le LOCK EEG (déjà calculés) : quand le lock qL flotte, l'aiguille
          // qui oscille est un F/N, pas une série de Fall/Long Fall → plus de décomposition.
          lockFloating: (fnWithHysteresis || hasStableAlphaFn) && _validSignal });
        const reactionLabel = REACTION_LABELS[reactionKey] || 'Set';
        // The on-screen label is committed from the SAME event that moves the needle
        // (see the unified needle+label block below), so the top read can never disagree
        // with where the needle actually went. nowMs is used there for the hold window.
        const nowMs = Date.now();
        // Record the CHARGE STATE alongside each reaction (mass effect/cause /
        // liberation) so the History PDF + end-session summary can show it next
        // to the needle reaction. Same model as the sphere/needle dicitura.
        const _chargeNow = chargeStateById(_phase);
        // ── IN PAUSA NON SI REGISTRA ────────────────────────────────────────────────────────
        // L'orologio della seduta è fermo, ma il tubo EEG continua a girare: senza questa
        // guardia ogni ciclo scriveva una lettura con lo STESSO istante congelato. Misurato in
        // seduta: una pausa di due secondi ha lasciato 44 letture identiche a 100,70 s, che poi
        // sono entrate nella finestra dell'item successivo. L'ago continua a muoversi — è
        // biofeedback, e serve — ma niente di ciò che accade in pausa è parte della seduta.
        const _inSeduta = d.sessionStateRef.current === 'running';
        if (_inSeduta) {
          sessionRecorder.pushReaction({ time: d.timeRef.current, reaction: reactionLabel, charge: _chargeNow.id });
        }
        // Push aussi les métriques brutes pour permettre analyse post-hoc (R&I)
        sessionRecorder.pushMetrics({
          time: d.timeRef.current,
          qL, eta, vSol: newVSol, IL: IL || 0,
          fnRaw: fnWithHysteresis || hasStableAlphaFn });

        // ── JOURNAL DE SESSION — log des réactions d'aiguille significatives ──
        // Seulement les réactions visibles (pas tick/none), avec anti-spam :
        // même réaction : pas avant 4 s ; réaction différente : pas avant 1.5 s.
        if (_inSeduta && LOGGABLE_REACTIONS.has(reactionKey)) {
          const last = d.lastLoggedReactionRef.current;
          const sameReaction = last?.reaction === reactionKey;
          // ROGER-FIX (#4, v2): reactions were signaled TOO promptly — a new one
          // appeared while the needle was still completing the PREVIOUS swing+flyback
          // (~2.4s), so the auditor couldn't tell them apart. Lengthen the gap so a
          // distinct reaction waits until the prior needle motion has settled.
          const minGap = sameReaction ? 4.5 : 2.6;
          if (!last || (d.timeRef.current - last.t) >= minGap) {
            d.lastLoggedReactionRef.current = { reaction: reactionKey, t: d.timeRef.current };
            // Use a flag in logBufferRef so addLog is called outside the tight loop
            // Integrate the CHARGE STATE with the needle reaction so it appears
            // both on-screen and in the History PDF / end-session summary.
            const _cLbl = _chargeNow.labelKey ? (d.tRef.current(_chargeNow.labelKey as any) as string) : '';
            // ── DA QUALE AGO ────────────────────────────────────────────────────────────
            // Con entrambi gli strumenti il journal si riempiva di reazioni del MUSE mentre sul
            // quadrante c'era l'ago del METER — e del METER non scriveva niente. Rileggendo la
            // seduta sembravano tutte reazioni di ciò che si stava guardando. Ora ogni riga
            // porta la sigla del suo ago.
            const _due = d.instrumentsRef.current.muse && d.instrumentsRef.current.theta;
            d.logBufferRef.current.push({
              time: d.timeRef.current,
              speaker: 'NEEDLE',
              text: `⊙ ${_due ? 'MUSE · ' : ''}${reactionLabel}${_cLbl ? ` · ${_cLbl}` : ''}`,
              type: 'normal' });
            // ── R&I: una riga VALIDABILE per ogni reazione mostrata ─────────────────────
            // In seduta l'auditor indica anche fuori dall'assessment — sul processo, su ciò
            // che il preclear dice. Senza queste righe l'R&I varrebbe solo durante un
            // assessment, cioè quasi mai. Stessa cadenza del journal: ciò che è stato SCRITTO
            // è ciò che si può indicare, e niente si scrive senza essere stato visto.
            // ⚠️ NIENTE riga R&I automatica. Le reazioni di seduta sono decine: riempivano la
            // vista MANUALE di « DISSOLUZIONE · Tick » da validare, e l'auditor non ci trovava
            // più gli item che aveva scritto lui. In MANUALE si scrive SOLO ciò che scrive
            // l'auditor; le reazioni restano nel journal e nell'archivio, dove servono.
          }
        }

        // (Reaction-context display removed — the needle reads are shown by QuantumSphere.
        //  reactionLabel above is still used for the journal log + needle event below.)
        // Envoyer l'offset aiguille au worker pour Ron's Lag cross-corrélation
        // (module-scope table — see REACTION_OFFSETS)
        const _rawTarget    = REACTION_OFFSETS[reactionKey] ?? NEEDLE_REST_OFFSET;
        const _trimAmp      = Math.max(0.1, 1 + needleEngine.trim * 0.20);
        const _BASE         = NEEDLE_REST_OFFSET;
        // A BLOW DOWN pegs the needle to the far edge of the dial (like an analog meter),
        // regardless of sensitivity — so it always TOUCHES the extremity (offset 1.0).
        const _isBlowDown   = reactionKey === 'reaction_blow_down' || reactionKey === 'reaction_long_fall_blow_down';
        const targetOffset  = _isBlowDown
          ? 1.0
          : Math.max(-1, Math.min(1, _BASE + (_rawTarget - _BASE) * _trimAmp));
        d.workerRef.current?.postMessage({
          type: 'NEEDLE_EVENT',
          payload: { offset: targetOffset, tMs: Date.now() }
        });

        // ── AGO + SCRITTA — sorgente unica ────────────────────────────────────────
        // La DECISIONE (cosa mostrare / se lanciare l'oscillazione / se registrare la lettura)
        // vive in engine/needleDecision.ts: pura e coperta dai test. Qui si applicano SOLO gli
        // effetti (motore dell'ago, timer, stato React, buffer delle letture mostrate).
        const _dec = decideNeedle({
          reactionKey,
          reactionLabel,
          rawTarget: _rawTarget,
          nowMs,
          timeS: d.timeRef.current,
          shownKey: d.needleReactionKeyRef.current || '',
          holdUntilMs: d.reactionHoldUntilRef.current,
          activeKickRaw: d.activeKickRef.current ? d.activeKickRef.current.raw : null,
          needleInMotion: needleEngine.isInMotion,
          needleLocked: needleEngine.isLocked,
          itemInterruptUntilMs: d.needleItemInterruptRef.current,
          curVirtualOffset: d.needleVirtualRef.current.length
            ? d.needleVirtualRef.current[d.needleVirtualRef.current.length - 1].offset : NEEDLE_REST_OFFSET,
          lastFnShownAtS: d.lastFnShownAtRef.current });

        // 1) OSCILLAZIONE (o riposo/fluttuazione). 'suppress' → non si tocca nulla.
        if (_dec.startKick) {
          if (_dec.interruptPrevious) {
            // nuovo item: si taglia netto il swing precedente e si riparte su QUESTA lettura
            if (d.kickFlybackRef.current) { clearTimeout(d.kickFlybackRef.current); d.kickFlybackRef.current = null; }
            needleEngine.clearMotion();
            d.activeKickRef.current = null;
            d.needleItemInterruptRef.current = 0;   // consumata: una sola interruzione per item
          }
          needleEngine.setTarget(targetOffset);
          needleEngine.beginMotion(_dec.kickMs + KICK_FLYBACK_MS);   // swing + rientro = un solo blocco
          d.activeKickRef.current = { raw: _rawTarget };
          if (d.kickFlybackRef.current) clearTimeout(d.kickFlybackRef.current);
          d.kickFlybackRef.current = setTimeout(() => {
            needleEngine.setTarget(NEEDLE_REST_OFFSET);
            d.activeKickRef.current = null;
          }, _dec.kickMs);
        } else if (_dec.idleTarget) {
          needleEngine.setTarget(_dec.idleTarget === 'float' ? qlToNeedlePos(qL) : NEEDLE_REST_OFFSET);
        }

        // 2) SCRITTA + traccia di ciò che è REALMENTE MOSTRATO (la fonte dell'ASSESSMENT).
        if (_dec.commitLabel) {
          if (_dec.recordShownRead && _inSeduta) {
            d.shownReadsRef.current.push({ time: d.timeRef.current, reaction: reactionLabel, src: 'eeg' });
            if (d.shownReadsRef.current.length > SHOWN_READS_CAP) {
              d.shownReadsRef.current.splice(0, Math.floor(SHOWN_READS_CAP / 2));
            }
            // ── CORPUS: la reazione dell'ago EEG, col suo PROPRIO istante ────────────────────
            // Si scrive solo ciò che è stato MOSTRATO: è quello che l'auditor ha visto e su cui
            // ha deciso. Sorgente e istante restano separati da quelli delle boîtes — se l'EEG
            // anticipa la risposta cutanea di 1–3 s, un tempo medio cancellerebbe l'anticipo.
            if (d.corpusSessionRef.current) {
              corpusWrite(reactionRecord(d.corpusSessionRef.current, new Date().toISOString(), {
                // `peak` = la CADUTA MISURATA dell'ago virtuale in 0,5 s (moveR), la grandezza
                // su cui il grado è deciso. Prima qui finiva `targetOffset − SET`, che è
                // `REACTION_OFFSETS[chiave]`: un numero ricavato dall'etichetta, quindi identico
                // per tutte le reazioni dello stesso nome. Confrontarlo col picco del meter non
                // poteva dare niente. ⚠️ Non è la stessa grandezza del `peak` delle boîtes
                // (là è l'escursione TOTALE da SET): il rapporto va stabilito, non presunto.
                src: 'eeg', key: reactionKey, peak: reactionClassifier.lastMoveR,
                tSec: d.timeRef.current, ql: _qlDisp,
                ta: d.thetaTaRef.current ?? metricsStore.get().toneArm,
                sinceItemSec: d.ultimoItemSecRef.current != null
                  ? Math.max(0, d.timeRef.current - d.ultimoItemSecRef.current) : undefined,
                assess: d.assessActiveRef.current || undefined,
              }));
            }
          }
          if (reactionKey === 'reaction_fn') {
            // CORPUS: fronte di salita dell'F/N EEG. Un F/N è una CONDIZIONE che dura: si apre
            // una riga sola e le ripetizioni entro la finestra non ne aprono altre.
            if (d.timeRef.current - d.lastFnShownAtRef.current > THETA_FN_EXPIRE_S) {
              d.flushEegFn(false);
              d.pendingEegFnRef.current = { tSec: d.timeRef.current,
                ta: d.thetaTaRef.current ?? metricsStore.get().toneArm };
            }
            d.lastFnShownAtRef.current = d.timeRef.current;
          }
          d.setNeedleReactionKey(reactionKey);
          d.setNeedleReaction(reactionLabel);
          d.needleReactionRef.current = reactionLabel;
          d.reactionHoldUntilRef.current = _dec.holdUntilMs;
        }

        // 3) EPISODIO F/N: finché una F/N è A SCHERMO l'episodio continua → una F/N che persiste
        //    non sarà mai contata come nuova reazione (per l'item è AGO NULLO).
        if (d.needleReactionKeyRef.current === 'reaction_fn') d.lastFnShownAtRef.current = d.timeRef.current;

        // ── PRIME FREQ (MNA) — engine/PrimeFreqTracker (SessionEngine slice 2).
        // I_m AND the detected frequency FREEZE the moment the auditor presses
        // CAPTURE: they track live ONLY while capturing (CAPTURE/IDLE phases);
        // the engine also feeds the ~3 s peak window and the report aggregates.
        if (d.sessionStateRef.current === 'running') {
          const _capturing = d.primePhaseRef.current === 'CAPTURE' || d.primePhaseRef.current === 'IDLE';
          const sample = primeFreqTracker.update(bands, _capturing, d.mnaSessionRef.current);
          if (_capturing && pushUi) {
            // PERF: React readout states gated to 10 Hz (full-rate setStates
            // re-rendered the whole App for the entire CAPTURE phase).
            d.setPrimeIm(sample.im);
            d.setPrimeFd(sample.fd);
            d.setPrimePStar(sample.ps);
            d.setPrimeDelta(sample.dv);
            d.setPrimeZone(sample.zone);
          }
          if (sample.im > 0 && !d.primeCaptured && d.primePhaseRef.current === 'CAPTURE') d.setPrimeCaptured(true);
        }

        if (d.sessionStateRef.current !== 'running') {
          return; // Do not record or chart data if session is not running
        }

        // Distanza SOL = ∫Vsol dt (doc: D = ∫Vsol dt, "Total Processed Distance SOL-Km")
        // massDelta usato internamente per il peso mentale dissolto
        d.massAccumulatorRef.current += newVSol * 0.1; // Vsol * dt (dt = 0.1s timer tick)
        if (pushUi) d.setDisplayMass(d.massAccumulatorRef.current); // CONN-68: throttle display

        // ── F/N persistence + EP-lock timers ("Regola dei 1,5s") ─────────────
        // → engine/FnTracker (SessionEngine slice 2; logic preserved bit-per-bit:
        //   HOLD freezes, qL≥0.9 accumulates, sub-threshold decays/resets).
        fnTracker.update(qL, false, d.timeRef.current);   // cf. note isHold : jamais émis
        const tracking = fnTracker;

        // ── T-Zone classification — spec §11 NEURAL CORE ──────────────────
        // T99 : diracCount > 3 ET |dE/dψ| < 0.15
        // T60 : f=1.2Hz stable ET QL ≥ 0.9 (= F/N actif depuis >1.5s)
        // T90 : freqDominante > 5Hz ET asymétrie spectrale < 0.4
        // T80 : défaut (masse lourde)
        // ── T-Zone classification — spec §11 NEURAL CORE ──────────────────
        // Le worker peut ne pas envoyer tZone → on dérive toujours depuis les métriques
        // NOTE : `tZone` du worker est un NOMBRE (0..3), pas une étiquette 'T60'/'T90'/'T99'.
        // L'ancien `tZone as string` le faisait passer pour une étiquette : la comparaison
        // échouait TOUJOURS, donc la zone dérivée ci-dessous a toujours été la seule utilisée.
        // On l'assume explicitement (et le cas EP validé donne de toute façon T99 des deux côtés).

        const derivedZone = ((): 'T80' | 'T90' | 'T60' | 'T99' => {
          if (tracking.isEpValidated) return 'T99';
          // T99 : intention causative — uniquement validation EP ou eta exceptionnel sans F/N (release fort)
          // (le test EP au-dessus couvre la plupart des cas T99)
          if (eta > 0.80 && !tracking.isActive) return 'T99';
          // T60 : équilibre / F/N stable — F/N détecté via tracking interne OU aiguille
          const fnDetected = tracking.isActive || d.needleReactionRef.current === 'F/N (Floating)';
          if (fnDetected && qL >= 0.3) return 'T60';
          // T90 : dissolution de masse (sans F/N, eta moyenne)
          if (qL >= 0.50 && eta >= 0.30) return 'T90';
          if (qL >= 0.70) return 'T90';
          // T80 : défaut (masse lourde)
          return 'T80';
        })();

        // Utiliser workerZone SEULEMENT si c'est une valeur valide != T80
        const _baseTZone: 'T80' | 'T90' | 'T60' | 'T99' = derivedZone;
        // COHERENCE FIX (user): T90 = Mass Dissolution must agree with the
        // "LIBÉRATION ACTIVE" readout. That readout is driven by
        // stableReleaseState==='active' (TA blowing down / Fall / F-N), a totally
        // separate signal from the qL/eta heuristic above — so T90 could sit at 0%
        // while LIBERATION flashed repeatedly. An active release IS mass dissolving
        // → force T90 whenever release is active (except a validated EP, T99).
        const finalTZone: 'T80' | 'T90' | 'T60' | 'T99' =
          (d.stableReleaseStateRef.current === 'active' && _baseTZone !== 'T99') ? 'T90' : _baseTZone;
        // FIX B-10: setTZone removed (state was write-only). finalTZone is
        // still used below for newDataPoint and CSV logging via local scope.

        // GSR-based R&I: sample raw qL at every METRICS_UPDATE cycle
        sessionRecorder.pushQl({ time: d.timeRef.current, qL });

        // Update Chart Data — THROTTLED to ~2 Hz (was every ~22 Hz worker cycle).
        const _nowHist = performance.now();
        if (_nowHist - lastHistoryPushRef.current >= 500) {
          const _dtSec = (_nowHist - lastHistoryPushRef.current) / 1000; // ~0.5 s
          lastHistoryPushRef.current = _nowHist;
          const newDataPoint = { time: Number(d.timeRef.current.toFixed(1)), ...bands, qL, tZone: finalTZone, rhoG, vProc, eta, diracCount };
          sessionRecorder.pushChart(newDataPoint); // decimates past 7200 (session SHAPE preserved)
          if (d.sessionStateRef.current === 'running') {
            // Live "mass contacted vs dissolved" — accumulate TIME by the SAME
            // charge state shown in the centre (presence vs release model). Guard
            // the dt so a pause/first-tick gap isn't counted.
            if (_dtSec > 0 && _dtSec < 2) {
              const _cid = chargeStateById(_phase).id;
              tzoneStore.addTime(_cid, _dtSec, qL, velocityTracker.smoothVProc, d.cycleArmedRef.current);
            }
            sessionRecorder.pushCsv(`${d.timeRef.current.toFixed(3)},METRICS,${qL.toFixed(4)},${finalTZone},${rhoG.toFixed(4)},${vProc.toFixed(4)},${eta.toFixed(4)},${diracCount}`);
          }
        }

        // FIX cleanup: the throttled setData block is gone — the state had
        // no consumer after the chart was removed. sessionRecorder.chart
        // is the canonical full-resolution sink for the report.

        // ── EP a 4 stadi: PERSIST → AS-IS → COGNITION PENDING → EP ────────────
        {
          if (isAsIs && isSomaticRelease && !d.epWindowOpenRef.current && !d.epWindowHasOpenedRef.current) {
            d.epWindowHasOpenedRef.current = true;
            // AS-IS confermato → apri finestra attesa Cognition (30s)
            d.setEpWindowOpen(true);
            d.setAsIsnessState('as-is');
            if (d.epWindowTimerRef.current) clearTimeout(d.epWindowTimerRef.current);
            d.epWindowTimerRef.current = setTimeout(() => {
              d.setEpWindowOpen(false);
            }, 60000);
          }

          if (d.epWindowOpenRef.current && isCognitionDetected) {
            // Cognition rilevata nella finestra → suggerisci EP all'Auditor
            d.setAsIsnessState('fn'); // F/N come stato intermedio visibile
          } else if (tracking.isActive && !isSomaticPersist) {
            d.setAsIsnessState('fn');
          } else if (isAsIs && isSomaticRelease) {
            d.setAsIsnessState('as-is');
          } else {
            d.setAsIsnessState('persist');
          }
        }

        d.setIsFnActive(tracking.isActive);
      }
    };

    // R4: spawn the worker with BOUNDED, backed-off retries. Transient load
    // failures at startup (resource contention) DO recover via a respawn, so we
    // retry up to MAX_RESPAWN with increasing delay; a permanent failure stops
    // cleanly (DSP disabled, app still usable) instead of looping forever. The
    // counter is reset to 0 by handleWorkerMessage as soon as the worker is alive.
    const spawnWorker = () => {
      const w = new NestWorker();
      w.onmessage = handleWorkerMessage;
      w.onerror = (err: ErrorEvent) => {
        try { w.terminate(); } catch (_) {}
        if (respawnAttempts < MAX_RESPAWN) {
          respawnAttempts++;
          const delay = Math.min(2000, 200 * respawnAttempts);
          console.warn(`[NestWorker] error (retry ${respawnAttempts}/${MAX_RESPAWN} in ${delay}ms):`, (err && err.message) || 'load/runtime error');
          setTimeout(spawnWorker, delay);
        } else {
          console.error('[NestWorker] giving up after repeated failures — DSP unavailable this session');
        }
      };
      d.workerRef.current = w;
    };
    spawnWorker();

    return () => {
      d.workerRef.current?.terminate();
    };
    // mount/unmount only — needleEngine.isLocked read inside closure (no re-init on reset).
    // Le dipendenze "vive" arrivano tutte come ref o come funzione stabile (vedi il commento
    // in cima al file): la chiusura presa al montaggio resta corretta per tutta la seduta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
