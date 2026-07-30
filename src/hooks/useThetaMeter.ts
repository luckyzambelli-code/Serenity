import { useCallback, useEffect, useRef, useState } from 'react';
import { ThetaMeterHid, isHidAvailable, type ThetaStatus } from '../lib/thetaMeterHid';
import { ThetaNeedle } from '../engine/thetaNeedle';
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
import { THETA_NEEDLE_SCALE, SQUEEZE_TEST_MS, BREATH_TEST_MS } from '../engine/tuning';

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
  /** Letture valide e report scartati — se i secondi salgono, il formato non è quello che credo. */
  counters: { ok: number; rejected: number };
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

export function useThetaMeter() {
  const hidRef = useRef<ThetaMeterHid | null>(null);
  const needleRef = useRef(new ThetaNeedle());
  /** Ultima lettura, in attesa della prossima pubblicazione. */
  /** Prova in corso + picco osservato. */
  const testRef = useRef({ on: false, peak: 0 });
  const pendingRef = useRef<{ offset: number; arm: number; raw: number; totalTa: number;
                              offScale: boolean; bodyMotion: boolean } | null>(null);

  const [state, setState] = useState<ThetaMeterState>({
    status: 'disconnected', offset: 0, arm: 0, raw: 0, rawSmooth: 0, totalTa: 0,
    offScale: false, bodyMotion: false,
    ta: null, taNow: null, taScale: loadTaScale(),
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
          const dev = Math.abs(needleRef.current.arm - r.smooth);
          if (dev > testRef.current.peak) testRef.current.peak = dev;
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
        testPeakOffset: testRef.current.peak * effectiveScale(prev.setup),
        counters: hidRef.current!.counters,
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
    setState(p => ({ ...p, offset: 0, arm: 0, raw: 0, rawSmooth: 0, totalTa: 0,
                     offScale: false, bodyMotion: false }));
  }, []);

  /** Riporta l'ago su SET — stesso gesto che ricentra quello dell'EEG (clic sul quadrante).
   *  Non tocca il Total TA: ricentrare a mano non è carica smaltita. */
  const resetToSet = useCallback(() => { needleRef.current.resetToSet(); }, []);

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

  /** Il TRIM della sensibilità, −10..+10 — vive nel pannello TRIM insieme a quello dell'ago
   *  EEG, perché è LATERALE: regolare guardando l'ago è impossibile se il pannello lo copre. */
  const setSensTrim = useCallback((v: number) => {
    setState(p => ({ ...p, setup: { ...p.setup, sensTrim: Math.max(-10, Math.min(10, v)) } }));
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
    testRef.current = { on: true, peak: 0 };
    setState(p => ({ ...p, testing: 'squeeze', testPeak: 0, squeezeOk: null }));
    setTimeout(() => {
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
    testRef.current = { on: true, peak: 0 };
    setState(p => ({ ...p, testing: 'breath', testPeak: 0, breathOk: null }));
    setTimeout(() => {
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

  return {
    ...state, connect, disconnect, resetTotal, captureRaw, applyTaPoints, clearTaCalibration,
    setConfig, addPointFromReference, startSqueezeTest, startBreathTest, setSensTrim, resetToSet,
  };
}
