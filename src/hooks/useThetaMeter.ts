import { useCallback, useEffect, useRef, useState } from 'react';
import { ThetaMeterHid, isHidAvailable, type ThetaStatus } from '../lib/thetaMeterHid';
import { ThetaNeedle } from '../engine/thetaNeedle';
import { ThetaReactionTracker, type ThetaReaction } from '../engine/thetaReactions';
import { ThetaFloatDetector, type ThetaFloatState } from '../engine/thetaFloat';
import {
  buildTaScale, taFromRaw, loadTaScale, saveTaScale, clearTaScale, factoryTaScale,
  type ThetaTaPoint, type ThetaTaScale,
} from '../engine/thetaTaScale';
import {
  loadSetup, saveSetup, scaleFromSqueeze, breathIsValid, taWithSetup,
  SQUEEZE_TARGET_OFFSET, SQUEEZE_TOLERANCE,
  effectiveScale,
  type ElectrodeConfig, type ThetaSetup,
} from '../engine/thetaSetup';
import { THETA_NEEDLE_SCALE, SQUEEZE_TEST_MS, BREATH_TEST_MS, NEEDLE_REST_OFFSET, THETA_TEST_FOLLOW, THETA_MIN_RATE, THETA_TEST_START_DEV, THETA_TEST_MUTE_AFTER_S } from '../engine/tuning';

/**
 * useThetaMeter — l'e-meter USB dell'utente dentro EQUILIBRIUM.
 *
 * Tiene insieme i due pezzi puri: il driver WebHID (lib/thetaMeterHid) e il modello ago/braccio
 * (engine/thetaNeedle). Qui c'è solo il collante React.
 *
 * ── PERCHÉ I VALORI PASSANO DA UN REF PRIMA DELLO STATE ────────────────────────────────────
 * Il meter manda **60 letture al secondo**. Un setState per ognuna vorrebbe dire 60 render al
 * secondo di TUTTA l'applicazione — l'ago EEG, i grafici, le camere. Le letture si accumulano
 * quindi in un ref e si pubblicano a passo fisso, come già si fa per gli altri flussi.
 */

/** Ciò che serve all'interfaccia. */
export interface ThetaMeterState {
  status: ThetaStatus;
  /** Deviazione dell'ago sull'asse del quadrante, [-1, 1]. Positivo = caduta. */
  offset: number;
  /** Il braccio, in unità grezze — la « manopola ». */
  arm: number;
  /** Ultimo grezzo ricevuto, NON lisciato: utile in diagnostica. */
  raw: number;
  /** La lettura LISCIATA — la stessa che registra la taratura. È questa che va mostrata
   *  quando si verifica contro l'artefatto, o il numero tremolerebbe e non combacerebbe
   *  con i punti registrati. */
  rawSmooth: number;
  /** Total TA accumulato dalle lattine, in divisioni. */
  totalTa: number;
  /** TONE ARM vero, sulla scala del meter — solo se l'apparecchio è stato tarato con
   *  l'artefatto. `null` senza taratura: meglio nessun numero che un numero inventato.
   *  Viene dal BRACCIO, cioè dalla manopola: in seduta dev'essere stabile e non seguire ogni
   *  reazione, esattamente come la manopola di un meter fisico non si muove da sola. */
  ta: number | null;
  /** Il TA della lettura ISTANTANEA. Serve a VERIFICARE contro l'artefatto — lì si vuole il
   *  valore subito, non fra venti secondi. Non è il TA di seduta. */
  taNow: number | null;
  /** La taratura in uso, se c'è. */
  taScale: ThetaTaScale | null;
  /** Assetto: configurazione degli elettrodi e sensibilità dell'ago. */
  setup: ThetaSetup;
  /** Quale prova è in corso, se una. */
  testing: null | 'squeeze' | 'breath';
  /** Deviazione di picco osservata durante la prova (unità grezze). */
  testPeak: number;
  /** Dove stava l'ago quando la prova è cominciata: il bersaglio del terzo di quadrante si
   *  segna a PARTIRE DA LÌ, non dalla posizione di riposo teorica. */
  testBaseOffset: number;
  /** Lo stesso picco in unità di QUADRANTE: è così che si confronta con le soglie delle prove
   *  (un terzo di quadrante, una fall). In grezzi il confronto non si potrebbe fare. */
  testPeakOffset: number;
  /** Esito dell'ultimo test del respiro: null se non fatto. */
  breathOk: boolean | null;
  /** Esito dell'ultima prova della stretta: la caduta CORRISPONDE al terzo di quadrante?
   *  null se non fatta. Alla PRIMA prova la sensibilità si fissa da sé, quindi corrisponde per
   *  costruzione; dalla seconda in poi la prova VERIFICA, ed è lì che il verdetto informa. */
  squeezeOk: boolean | null;
  /** L'ago è finito fuori dal quadrante. */
  offScale: boolean;
  /** L'ago spazza troppo per essere carica: MOVIMENTO CORPOREO, Total TA sospeso. */
  bodyMotion: boolean;
  /** FLOATING NEEDLE sull'ago VERO. È l'indicatore di AS-IS: qui si dice solo se c'è, con che
   *  ampiezza e con che ritmo — il confronto con l'F/N dell'EEG si fa altrove. */
  fn: ThetaFloatState;
  /** Letture valide e report scartati — se i secondi salgono, il formato non è quello che credo. */
  counters: { ok: number; rejected: number };
  /** L'apparecchio trasmette ma non lo capiamo: è un MODELLO DIVERSO. Da distinguere dal
   *  « non arriva niente », che si rimedia in tutt'altro modo. */
  unknownFormat: boolean;
  /** I report non riconosciuti, in esadecimale, da mandare per far scrivere il decodificatore. */
  rawSamples: string[];
  /** Il dispositivo non è utilizzabile in questo contesto (niente WebHID). */
  unavailable: boolean;
  /** Che dispositivo si è agganciato (nome · VID:PID). Senza, su una macchina altrui un
   *  « non funziona » non è diagnosticabile. */
  info: string | null;
  lastError: string | null;
}

/** A che ritmo si aggiorna l'interfaccia (ms). 20 → 50 volte al secondo: fluido per l'occhio,
 *  e comunque un terzo dei render che farebbe una pubblicazione a ogni lettura. */
const UI_PERIOD_MS = 20;

export interface UseThetaMeterOptions {
  /** Chiamata quando l'ago delle boîtes ha completato una REAZIONE. È da qui che ASSESSMENT e
   *  le scritte sull'arco prendono le letture col solo meter: senza, ogni item risultava NULL
   *  mentre l'ago si muoveva sotto gli occhi dell'auditor. */
  onReaction?: (r: ThetaReaction) => void;
  /** Tempo di seduta in secondi — serve a datare le reazioni come quelle dell'EEG. */
  nowSec?: () => number;
}

export function useThetaMeter(opts: UseThetaMeterOptions = {}) {
  /** Le opzioni passano da un ref: il chiamante le ricrea a ogni render, e il driver si
   *  costruisce una volta sola. */
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const reactRef = useRef(new ThetaReactionTracker());
  /** L'F/N sull'ago vero: forma nel tempo, non ampiezza — vive in un rilevatore a parte. */
  const floatRef = useRef(new ThetaFloatDetector());
  /** TRACCIA GREZZA DELL'AGO (diagnosi): gli ultimi ~12 s di deviazione, presi PRIMA di
   *  qualunque classificazione. Serve a rispondere alla sola domanda che conta quando non esce
   *  nessuna lettura: l'ago si è mosso, e di quanto? Senza questo si può solo tirare a indovinare
   *  fra « non si è mosso », « si è mosso poco » e « il classificatore lo scarta ».
   *  In un ref e non nello stato: 60 valori al secondo non devono ridisegnare niente. */
  const tracciaRef = useRef<{ t: number; dev: number; motion: boolean }[]>([]);

  /** Ultimo stato dell'F/N, in attesa della pubblicazione. */
  const fnRef = useRef<ThetaFloatState>({ fn: false, sinceSec: null, widthAvg: 0, periodSec: 0, motion: false });
  const hidRef = useRef<ThetaMeterHid | null>(null);
  const needleRef = useRef(new ThetaNeedle());
  /** Ultima lettura, in attesa della prossima pubblicazione. */
  /** Prova in corso + picco osservato. */
  /** `base` = il grezzo al momento in cui la prova comincia, cioè DOVE STA L'AGO.
   *
   *  Prima si misurava dal BRACCIO. Ma il braccio insegue la resistenza con venti secondi di
   *  ritardo: se l'ago è posato lontano da SET, quella distanza entrava nel conto e la stretta
   *  risultava più grande di quanto fosse. Il terzo di quadrante si misura da dove l'ago È,
   *  non da dove riposerebbe (richiesta in seduta, 01/08/2026). */
  const testRef = useRef({ on: false, peak: 0, base: 0, baseOffset: 0,
                          /** Il bersaglio è stato CONGELATO: la stretta (o il soffio) è
                           *  partita, e da lì in poi il segno non si muove più — è quello che
                           *  misura l'ampiezza. */
                          congelato: false,
                          /** Campione precedente, per calcolare la VELOCITÀ dell'ago. */
                          preOffset: 0, preSec: 0 });
  /** Il timer che chiude la prova da sé, a `SQUEEZE_TEST_MS`/`BREATH_TEST_MS` — serve per
   *  poterlo SPEGNERE da `cancelTest`, se no annullare a metà lascerebbe il verdetto arrivare
   *  comunque un istante dopo, su una prova che l'auditor ha già dichiarato chiusa. */
  const testTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ offset: number; arm: number; raw: number; totalTa: number;
                              offScale: boolean; bodyMotion: boolean } | null>(null);

  const [state, setState] = useState<ThetaMeterState>({
    status: 'disconnected', offset: 0, arm: 0, raw: 0, rawSmooth: 0, totalTa: 0,
    offScale: false, bodyMotion: false,
    ta: null, taNow: null, taScale: loadTaScale(),
    unknownFormat: false, rawSamples: [], testBaseOffset: NEEDLE_REST_OFFSET,
    fn: { fn: false, sinceSec: null, widthAvg: 0, periodSec: 0, motion: false },
    setup: loadSetup(THETA_NEEDLE_SCALE), testing: null, testPeak: 0, breathOk: null, squeezeOk: null,
    testPeakOffset: 0,
    counters: { ok: 0, rejected: 0 }, unavailable: !isHidAvailable(), info: null, lastError: null,
  });

  // Il driver si crea UNA volta: ricrearlo a ogni render lascerebbe dietro dispositivi aperti.
  if (!hidRef.current) {
    hidRef.current = new ThetaMeterHid({
      // Il modello lavora sul valore LISCIATO (a 60/s il grezzo balla), ma si tiene anche il
      // grezzo: serve in diagnostica e per la taratura contro resistenze note.
      onReading: r => {
        const st = needleRef.current.push(r.smooth);
        // Il picco si insegue a OGNI lettura (60/s), non alla pubblicazione (50 Hz): il culmine
        // di una caduta dura pochi campioni e alla pubblicazione si perderebbe.
        if (testRef.current.on) {
          const t = optsRef.current.nowSec?.() ?? 0;
          const dt = t - testRef.current.preSec;
          // ── IL SEGNO SEGUE L'AGO FINCHÉ È FERMO, POI SI CONGELA ────────────────────────
          // Si guarda la VELOCITÀ, non lo scarto fra due campioni: a 60 al secondo anche una
          // stretta decisa muove l'ago di pochissimo da un campione all'altro, e confrontando
          // quello il segno la inseguiva per tutta la discesa senza fermarsi mai.
          // Sotto la velocità di una lettura l'ago è « fermo » (deriva del braccio) e il segno
          // lo accompagna; appena parte, il segno resta lì e MISURA l'ampiezza.
          if (!testRef.current.congelato && dt > 0) {
            const velocita = Math.abs(st.offset - testRef.current.preOffset) / dt;
            // ⚠️ DUE MODI DI ACCORGERSENE, e servono tutti e due.
            // La VELOCITÀ prende la stretta decisa. Una stretta GRADUALE non la supera mai, e
            // allora il segno la inseguiva per tutta la discesa: lo scarto finiva a zero e la
            // prova diceva che non era successo niente (segnalato). La DISTANZA dalla base
            // prende quel caso: comunque lento sia andato, se l'ago si è spostato di tanto la
            // stretta è cominciata.
            const lontananza = Math.abs(st.offset - testRef.current.baseOffset);
            if (velocita >= THETA_MIN_RATE || lontananza >= THETA_TEST_START_DEV) {
              testRef.current.congelato = true;      // la stretta è partita
            } else {
              testRef.current.base = r.smooth;
              testRef.current.baseOffset = st.offset;
            }
          }
          testRef.current.preOffset = st.offset;
          testRef.current.preSec = t;
          const dev = Math.abs(testRef.current.base - r.smooth);
          if (dev > testRef.current.peak) testRef.current.peak = dev;
        }
        // ── ⚠️ DURANTE UNA PROVA L'AGO NON STA REAGENDO ───────────────────────────────────
        // La stretta delle lattine fa cadere l'ago di un terzo di quadrante — è il suo scopo.
        // Ma il classificatore vede solo un'ampiezza, e quella caduta la chiamava LONG FALL o
        // BLOW DOWN: finiva nel giornale come « ⊙ METER · … », nell'archivio, e soprattutto in
        // `shownReads`, cioè fra le LETTURE su cui ASSESSMENT giudica l'item in corso.
        //
        // Finché le prove si facevano prima della seduta non si vedeva: `sessionState` non era
        // « running » e le righe cadevano. Da quando la prova delle lattine si può RIFARE IN
        // SEDUTA — per vedere se lo scarto è cambiato — quelle reazioni entrano davvero, e
        // sono la mano dell'auditor, non il preclear (segnalato in seduta).
        //
        // Si azzerano tutti e due invece di saltare la spinta: un episodio aperto prima della
        // prova emetterebbe il suo verdetto al rientro, con l'ampiezza della stretta dentro.
        //
        // ⚠️ E il silenzio dura OLTRE la fine della prova: quando si MOLLANO le lattine l'ago
        // rientra, e quel rientro è una corsa ampia quanto la stretta — cioè una SECONDA
        // reazione falsa. Azzerare non basterebbe: toglie l'episodio aperto, non quello che
        // comincia subito dopo. Per questo si spinge avanti la scadenza a ogni lettura della
        // prova, e il classificatore resta muto ancora `THETA_TEST_MUTE_AFTER_S`.
        if (testRef.current.on) {
          const t = optsRef.current.nowSec?.() ?? 0;
          reactRef.current.muteUntil(t + THETA_TEST_MUTE_AFTER_S);
          floatRef.current.reset();
        } else {
          // REAZIONI sull'ago vero. Si passa la deviazione RISPETTO A SET, che è la grandezza in
          // cui sono espresse le ampiezze delle reazioni.
          const reaction = reactRef.current.push(
            st.offset - NEEDLE_REST_OFFSET, optsRef.current.nowSec?.() ?? 0, st.bodyMotion);
          if (reaction) optsRef.current.onReaction?.(reaction);
          // FLOATING NEEDLE. Va valutato a OGNI lettura, non alla pubblicazione: il ritmo dello
          // spazzare è il dato, e campionarlo più lento ne falserebbe i periodi.
          fnRef.current = floatRef.current.push(
            st.offset - NEEDLE_REST_OFFSET, optsRef.current.nowSec?.() ?? 0, st.bodyMotion);
        }
        {
          const t = optsRef.current.nowSec?.() ?? 0;
          const tr = tracciaRef.current;
          tr.push({ t, dev: st.offset - NEEDLE_REST_OFFSET, motion: st.bodyMotion });
          while (tr.length && tr[0].t < t - 12) tr.shift();
        }
        pendingRef.current = { ...st, raw: r.raw };
      },
      onStatus: s => setState(p => ({ ...p, status: s, info: hidRef.current?.info ?? null })),
      onError: e => setState(p => ({ ...p, lastError: e.message })),
    });
  }

  // Pubblicazione a passo fisso — vedi la nota in testa sul perché non a ogni lettura.
  useEffect(() => {
    const id = setInterval(() => {
      const p = pendingRef.current;
      if (!p) return;
      pendingRef.current = null;
      setState(prev => ({
        ...prev, ...p,
        // Il TA vero è la posizione del BRACCIO letta sulla scala tarata — cioè esattamente
        // la manopola di un meter fisico. Senza taratura resta null: non si inventa un numero.
        // La configurazione degli elettrodi cambia la resistenza: in SOLO si applica lo
        // scarto misurato, per riportare la lettura al riferimento delle due lattine.
        ta: prev.taScale ? taWithSetup(taFromRaw(p.arm, prev.taScale), prev.setup) : null,
        rawSmooth: needleRef.current.lastRaw,
        taNow: prev.taScale ? taWithSetup(taFromRaw(needleRef.current.lastRaw, prev.taScale), prev.setup) : null,
        testPeak: testRef.current.peak,
        testBaseOffset: testRef.current.baseOffset,
        testPeakOffset: testRef.current.peak * effectiveScale(prev.setup),
        fn: fnRef.current,
        counters: hidRef.current!.counters,
        unknownFormat: hidRef.current!.unknownFormat,
        rawSamples: hidRef.current!.rawSamples,
      }));
    }, UI_PERIOD_MS);
    return () => clearInterval(id);
  }, []);

  // La scala tarata va data al MODELLO, non solo alla visualizzazione: il Total TA si conta in
  // DIVISIONI di TA, e senza scala si conterebbe in unità grezze — sbagliato su un apparecchio
  // non lineare, dove uno stesso numero di grezzi vale più TA in basso che in alto.
  useEffect(() => {
    const sc = state.taScale;
    needleRef.current.setTaConverter(sc ? (raw: number) => taFromRaw(raw, sc) : null);
  }, [state.taScale]);

  // La sensibilità misurata col respiro scende nel modello.
  useEffect(() => { needleRef.current.setScale(effectiveScale(state.setup)); },
            [state.setup.needleScale, state.setup.sensTrim]);

  // Alla chiusura il dispositivo va rilasciato, o resta preso e la volta dopo non si apre.
  useEffect(() => () => { void hidRef.current?.disconnect(); }, []);

  /** DEVE partire da un clic: senza gesto dell'utente il browser rifiuta la richiesta. */
  const connect = useCallback(async () => {
    setState(p => ({ ...p, lastError: null }));
    return (await hidRef.current?.connect()) ?? false;
  }, []);

  const disconnect = useCallback(async () => {
    await hidRef.current?.disconnect();
    needleRef.current.reset();
    reactRef.current.resetAll();   // il silenzio delle prove NON deve sopravvivere alla seduta
    floatRef.current.reset();
    fnRef.current = { fn: false, sinceSec: null, widthAvg: 0, periodSec: 0, motion: false };
    setState(p => ({ ...p, offset: 0, arm: 0, raw: 0, rawSmooth: 0, totalTa: 0,
                     offScale: false, bodyMotion: false, fn: fnRef.current }));
  }, []);

  /** Riporta l'ago su SET — stesso gesto che ricentra quello dell'EEG (clic sul quadrante).
   *  Non tocca il Total TA: ricentrare a mano non è carica smaltita. */
  /**
   * RICENTRAGGIO — l'ago torna su SET.
   *
   * ⚠️ Si azzerano anche il classificatore e il rilevatore di F/N. `resetToSet` sposta l'ago
   * DI COLPO: senza questo, il classificatore vedeva quel salto come una corsa dell'ago e ne
   * dichiarava la reazione — una caduta grande quanto lo scarto che si è appena tolto a mano.
   * È la manopola dell'auditor, non il preclear.
   */
  const resetToSet = useCallback(() => {
    needleRef.current.resetToSet();
    reactRef.current.muteUntil((optsRef.current.nowSec?.() ?? 0) + THETA_TEST_MUTE_AFTER_S);
    floatRef.current.reset();
  }, []);

  /** Azzera il Total TA all'inizio di una seduta, SENZA perdere l'aggancio al preclear
   *  (il braccio resta dov'è, quindi l'ago non salta). */
  const resetTotal = useCallback(() => {
    needleRef.current.resetTotal();
    setState(p => ({ ...p, totalTa: 0 }));
  }, []);

  // ── TARATURA con l'artefatto fisico ────────────────────────────────────────────────────
  /** La LETTURA in questo istante — da chiamare con un pulsante dell'artefatto premuto.
   *  ⚠️ NON il braccio: quello insegue con una costante di tempo di ~20 s, e registrarlo dava
   *  punti presi a metà strada fra un valore e il successivo, quindi compressi fra loro — la
   *  scala usciva dilatata (TA 2 letto 1,3 · TA 5 letto 7,0). La lettura lisciata si assesta
   *  invece in un decimo di secondo. */
  const captureRaw = useCallback(() => needleRef.current.lastRaw, []);

  /** Fissa la scala dai punti raccolti. Restituisce false se sono inutilizzabili (troppo pochi,
   *  o due letture identiche: segno che l'artefatto non era attaccato). */
  const applyTaPoints = useCallback((points: ThetaTaPoint[], now: number) => {
    const scale = buildTaScale(points, now);
    if (!scale) return false;
    saveTaScale(scale);
    // Le correzioni per configurazione erano misurate contro la scala PRECEDENTE: con una scala
    // nuova non significano più nulla, e lasciarle applicate falserebbe le letture in silenzio.
    setState(p => {
      const setup = { ...p.setup, offsets: { 'two-cans': 0, 'solo-can': 0 } };
      saveSetup(setup);
      return { ...p, taScale: scale, setup };
    });
    return true;
  }, []);

  /** Torna alla taratura DI FABBRICA, non al nulla: senza scala il TA sparirebbe del tutto. */
  const clearTaCalibration = useCallback(() => {
    clearTaScale();
    setState(p => ({ ...p, taScale: factoryTaScale(), ta: null }));
  }, []);

  // ── ASSETTO ────────────────────────────────────────────────────────────────────────────
  const updateSetup = useCallback((patch: Partial<ThetaSetup>) => {
    setState(p => { const s = { ...p.setup, ...patch }; saveSetup(s); return { ...p, setup: s }; });
  }, []);

  const setConfig = useCallback((config: ElectrodeConfig) => updateSetup({ config }), [updateSetup]);

  /**
   * LO SCARTO DEL SOLO, dalla PROVA DOPPIA.
   *
   * Si misura confrontando il TA letto con due lattine e quello letto con una: la differenza è
   * quanto va sommato alla lettura in solo per riportarla al riferimento. Da qui in poi il TA a
   * una lattina non porta più il margine di una divisione — c'è un dato al suo posto.
   *
   * Si PERSISTE (`saveSetup` la scrive): vale per questo apparecchio e questa configurazione,
   * e rifarla a ogni seduta sarebbe rifare due prove per ritrovare lo stesso numero.
   */
  const setSoloOffset = useCallback((v: number) => {
    setState(p => {
      const s = { ...p.setup, offsets: { ...p.setup.offsets, 'solo-can': v } };
      saveSetup(s);
      return { ...p, setup: s };
    });
  }, []);

  /** Il TRIM della sensibilità, −10..+10 — vive nel pannello TRIM insieme a quello dell'ago
   *  EEG, perché è LATERALE: regolare guardando l'ago è impossibile se il pannello lo copre. */
  const setSensTrim = useCallback((v: number) => {
    setState(p => ({ ...p, setup: { ...p.setup, sensTrim: Math.max(-10, Math.min(10, v)) } }));
  }, []);

  /**
   * ⚠️ AGGIUNTO — segnalato: « perché scriviamo sempre, qualsiasi sia il PC, 1 boîte corrigée
   * de +1.12 = équivaut à 2 boîtes? ». Deciso in seguito: SÌ, dipende dalla pelle/presa di
   * CIASCUN preclear (« è la seconda » — non solo dalla geometria dell'apparecchio) — la
   * stessa idea già scritta in `canTest.ts`: « la prova doppia si rifà a ogni seduta — la
   * pelle non è quella di ieri, e la presa nemmeno ».
   *
   * ── LA CAUSA VERA ────────────────────────────────────────────────────────────────────────
   * `offsets['solo-can']` (fissato da `setSoloOffset`, sotto) veniva scritto in un'unica
   * chiave `localStorage` GLOBALE (`saveSetup`/`sm_theta_setup`, in `thetaSetup.ts`) — non per
   * preclear. Cambiando persona, l'app non aveva modo di saperlo e continuava ad applicare lo
   * scarto misurato sull'ULTIMA persona che aveva fatto la prova, silenziosamente.
   *
   * ── PERCHÉ NON UNO STORICO PER PRECLEAR (come `PcCanHistory`) ───────────────────────────
   * Sarebbe la via più fedele, ma il commento in `canTest.ts` è già la scelta più semplice e
   * coerente col resto: la prova NON è pensata per valere "per sempre" nemmeno per la STESSA
   * persona — va rifatta ogni seduta, perché "la pelle non è quella di ieri". Riportare
   * `offsets`/`needleScale`/`scaleMeasured`/`sensTrim` al loro punto di partenza a ogni nuova
   * seduta (esattamente come già fa `loadSetup` quando l'app riparte da zero) ottiene lo
   * stesso risultato — mai un numero della persona precedente — senza una seconda cassa
   * persistente da tenere sincronizzata con la prima.
   *
   * `config` (due lattine/lattina sola) NON si tocca: è una scelta di modalità di seduta, non
   * una misura della persona, e resettarla obbligherebbe a ridirla ogni volta anche a chi
   * audita sempre nello stesso modo.
   */
  const resetPerSessionSetup = useCallback(() => {
    setState(p => {
      const s: ThetaSetup = {
        ...p.setup, offsets: { 'two-cans': 0, 'solo-can': 0 },
        needleScale: THETA_NEEDLE_SCALE, scaleMeasured: false, sensTrim: 0,
      };
      saveSetup(s);
      return { ...p, setup: s };
    });
  }, []);
  /**
   * Aggiunge un PUNTO DI TARATURA dal confronto affiancato: si legge il TA sul Theta-Meter e lo
   * si scrive, e la coppia (grezzo corrente, quel TA) entra nella scala.
   *
   * Perché un punto e non una correzione costante: l'artefatto arriva a TA 5, ma in seduta si
   * lavora anche più in alto — lì la scala PROLUNGA l'ultimo segmento, con un errore che è
   * massimo in cima e si annulla rientrando nella zona tarata. Ed è esattamente quel che si
   * osserva: uno scarto di 0,6–0,7 che si riduce col tempo, mentre la resistenza scende.
   * Una costante non può correggerlo — sposta anche dove era giusto. Un punto in più sì:
   * corregge la FORMA proprio dove manca.
   */
  const addPointFromReference = useCallback((taRiferimento: number) => {
    setState(p => {
      const raw = needleRef.current.lastRaw;
      if (!raw || !Number.isFinite(taRiferimento)) return p;
      // Si sostituisce un eventuale punto quasi coincidente invece di affiancarlo: due punti
      // sullo stesso grezzo renderebbero la scala indeterminata.
      const tenuti = (p.taScale?.points ?? []).filter(q => Math.abs(q.raw - raw) > raw * 0.01);
      const scale = buildTaScale([...tenuti, { ta: taRiferimento, raw }], Date.now());
      if (!scale) return p;
      saveTaScale(scale);
      return { ...p, taScale: scale };
    });
  }, []);

  /**
   * PROVA DELLA STRETTA — fissa la SENSIBILITÀ: stringendo le lattine l'ago deve cadere di un
   * terzo di quadrante. È la manopola di sensibilità del Theta-Meter, qui MISURATA invece che
   * scelta a tavolino (il primo valore scelto così era cinque volte troppo alto: tutto sbatteva).
   */
  const startSqueezeTest = useCallback(() => {
    testRef.current = { on: true, peak: 0,
                        base: needleRef.current.lastRaw,
                        baseOffset: needleRef.current.offset,
                        congelato: false,
                        preOffset: needleRef.current.offset,
                        preSec: optsRef.current.nowSec?.() ?? 0 };
    setState(p => ({ ...p, testing: 'squeeze', testPeak: 0, squeezeOk: null }));
    testTimerRef.current = setTimeout(() => {
      testTimerRef.current = null;
      testRef.current.on = false;
      const picco = testRef.current.peak;
      setState(p => {
        // ── PRIMA PROVA: FISSA · PROVE SUCCESSIVE: VERIFICA ────────────────────────────────
        // Se ogni prova ri-fissasse la sensibilità, corrisponderebbe SEMPRE per costruzione e
        // il verdetto non direbbe nulla — e soprattutto disferebbe ogni ritocco fatto a mano
        // con la manopola. La prima volta si parte da qui; poi si verifica soltanto.
        const scala = scaleFromSqueeze(picco);
        if (!p.setup.scaleMeasured && scala) {
          return { ...p, testing: null, testPeak: picco, squeezeOk: true,
                   setup: { ...p.setup, needleScale: scala, scaleMeasured: true } };
        }
        const raggiunto = picco * effectiveScale(p.setup);
        return { ...p, testing: null, testPeak: picco,
                 squeezeOk: Math.abs(raggiunto - SQUEEZE_TARGET_OFFSET) <= SQUEEZE_TOLERANCE };
      });
    }, SQUEEZE_TEST_MS);
  }, []);

  /**
   * TEST DEL RESPIRO — VERIFICA, non taratura. Dopo la stretta, un respiro profondo e il
   * rilascio devono far cadere l'ago almeno un minimo. NON tocca la sensibilità: se la
   * ritoccasse, la taratura fatta con la stretta verrebbe disfatta da ogni verifica.
   */
  const startBreathTest = useCallback(() => {
    testRef.current = { on: true, peak: 0,
                        base: needleRef.current.lastRaw,
                        baseOffset: needleRef.current.offset,
                        congelato: false,
                        preOffset: needleRef.current.offset,
                        preSec: optsRef.current.nowSec?.() ?? 0 };
    setState(p => ({ ...p, testing: 'breath', testPeak: 0, breathOk: null }));
    testTimerRef.current = setTimeout(() => {
      testTimerRef.current = null;
      testRef.current.on = false;
      setState(p => ({
        ...p, testing: null, testPeak: testRef.current.peak,
        // ⚠️ effectiveScale, NON needleScale: quest'ultima è la BASE, senza il ritocco della
        // manopola. L'ago si muove secondo la sensibilità EFFETTIVA (base × trim), quindi
        // giudicare con la base sottostimava la caduta — si vedeva una fall ampia e il verdetto
        // diceva « non corrisponde ». La stretta usava già quella giusta; il respiro no.
        breathOk: breathIsValid(testRef.current.peak, effectiveScale(p.setup)),
      }));
    }, BREATH_TEST_MS);
  }, []);

  /**
   * ANNULLA LA PROVA IN CORSO — l'uscita che mancava.
   *
   * Segnalato: « la possibilité de sortir du test des boîtes ». Vero: `startSqueezeTest`/
   * `startBreathTest` chiudevano SOLO da sé, al proprio timer (4 s · 9 s) — premuti per errore,
   * o iniziati senza le lattine davvero impugnate, non c'era modo di uscirne prima che il tempo
   * scadesse da solo. Qui si spegne il timer (se no il verdetto arriverebbe comunque un istante
   * dopo, su una prova già dichiarata chiusa) e si torna a "nessuna prova", senza scrivere né
   * un esito positivo né uno negativo — annullare non è FALLIRE la prova, è non averla fatta.
   */
  const cancelTest = useCallback(() => {
    if (testTimerRef.current) { clearTimeout(testTimerRef.current); testTimerRef.current = null; }
    testRef.current.on = false;
    setState(p => ({ ...p, testing: null }));
  }, []);

  return {
    ...state, connect, disconnect, resetTotal, captureRaw, applyTaPoints, clearTaCalibration,
    setConfig, setSoloOffset, addPointFromReference, startSqueezeTest, startBreathTest, cancelTest, setSensTrim, resetToSet,
    resetPerSessionSetup,
    /** Diagnosi: quanto si è mosso l'ago fra due istanti, e se c'era agitazione. */
    escursione: (daSec: number, aSec: number) => {
      // SPAN = massimo − minimo: è QUANTO l'ago si è mosso. La sola distanza da SET non lo dice
      // — un ago parcheggiato a 0,35 e immobile dà « 0,35 » e sembra essersi mosso tanto.
      // Errore mio nella prima diagnosi, che mi ha fatto leggere male una seduta intera.
      let max = -Infinity, min = Infinity, motion = false, n = 0, tMax = 0, tMin = 0;
      for (const p of tracciaRef.current) {
        if (p.t < daSec || p.t > aSec) continue;
        n++;
        if (p.dev > max) { max = p.dev; tMax = p.t; }
        if (p.dev < min) { min = p.dev; tMin = p.t; }
        if (p.motion) motion = true;
      }
      if (!n) return { span: 0, da: 0, a: 0, motion: false, campioni: 0, tMax: 0, tMin: 0, deriva: false };
      // DERIVA o REAZIONE? Una reazione parte, culmina e RIENTRA: il culmine sta DENTRO la
      // finestra. Una deriva va in una direzione sola, e allora massimo e minimo cadono ai due
      // BORDI — è così che si riconosce senza doverla guardare. (Misurato in seduta: sette item
      // col picco tutti a −920/−966 ms, cioè tutti sul bordo sinistro: era il braccio che
      // rientrava, non l'ago che reagiva.)
      const bordo = 0.15;   // s di tolleranza sui bordi
      const suiBordi = (Math.min(tMax, tMin) <= daSec + bordo) && (Math.max(tMax, tMin) >= aSec - bordo);
      return { span: max - min, da: min, a: max, motion, campioni: n, tMax, tMin, deriva: suiBordi };
    },
  };
}
