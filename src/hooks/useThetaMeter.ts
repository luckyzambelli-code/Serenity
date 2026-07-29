import { useCallback, useEffect, useRef, useState } from 'react';
import { ThetaMeterHid, isHidAvailable, type ThetaStatus } from '../lib/thetaMeterHid';
import { ThetaNeedle } from '../engine/thetaNeedle';
import {
  buildTaScale, taFromRaw, loadTaScale, saveTaScale, clearTaScale,
  type ThetaTaPoint, type ThetaTaScale,
} from '../engine/thetaTaScale';
import {
  loadSetup, saveSetup, scaleFromSqueeze, breathIsValid, offsetFromReference, taWithSetup,
  type ElectrodeConfig, type ThetaSetup,
} from '../engine/thetaSetup';
import { THETA_NEEDLE_SCALE, SQUEEZE_TEST_MS } from '../engine/tuning';

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
  /** Esito dell'ultimo test del respiro: null se non fatto. */
  breathOk: boolean | null;
  /** L'ago è finito fuori dal quadrante. */
  offScale: boolean;
  /** L'ago spazza troppo per essere carica: MOVIMENTO CORPOREO, Total TA sospeso. */
  bodyMotion: boolean;
  /** Letture valide e report scartati — se i secondi salgono, il formato non è quello che credo. */
  counters: { ok: number; rejected: number };
  /** Il dispositivo non è utilizzabile in questo contesto (niente WebHID). */
  unavailable: boolean;
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
    setup: loadSetup(THETA_NEEDLE_SCALE), testing: null, testPeak: 0, breathOk: null,
    counters: { ok: 0, rejected: 0 }, unavailable: !isHidAvailable(), lastError: null,
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
      onStatus: s => setState(p => ({ ...p, status: s })),
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
  useEffect(() => { needleRef.current.setScale(state.setup.needleScale); }, [state.setup.needleScale]);

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

  const clearTaCalibration = useCallback(() => {
    clearTaScale();
    setState(p => ({ ...p, taScale: null, ta: null }));
  }, []);

  // ── ASSETTO ────────────────────────────────────────────────────────────────────────────
  const updateSetup = useCallback((patch: Partial<ThetaSetup>) => {
    setState(p => { const s = { ...p.setup, ...patch }; saveSetup(s); return { ...p, setup: s }; });
  }, []);

  const setConfig = useCallback((config: ElectrodeConfig) => updateSetup({ config }), [updateSetup]);
  /** Correzione dal confronto affiancato col meter vero: si inserisce il valore che LUI legge,
   *  e si ricava quanto va sommato al nostro. Vale per la configurazione IN USO. */
  const setOffsetFromReference = useCallback((taRiferimento: number) => {
    setState(p => {
      if (p.ta === null) return p;                    // senza taratura non c'è nulla da correggere
      // Si parte dalla lettura GREZZA di TA, senza la correzione attuale: altrimenti applicando
      // due volte la stessa correzione si andrebbe a rincorrere il valore.
      const nostroGrezzo = p.ta - (p.setup.offsets[p.setup.config] ?? 0);
      const offsets = { ...p.setup.offsets, [p.setup.config]: offsetFromReference(taRiferimento, nostroGrezzo) };
      const setup = { ...p.setup, offsets };
      saveSetup(setup);
      return { ...p, setup };
    });
  }, []);

  /**
   * PROVA DELLA STRETTA — fissa la SENSIBILITÀ: stringendo le lattine l'ago deve cadere di un
   * terzo di quadrante. È la manopola di sensibilità del Theta-Meter, qui MISURATA invece che
   * scelta a tavolino (il primo valore scelto così era cinque volte troppo alto: tutto sbatteva).
   */
  const startSqueezeTest = useCallback(() => {
    testRef.current = { on: true, peak: 0 };
    setState(p => ({ ...p, testing: 'squeeze', testPeak: 0 }));
    setTimeout(() => {
      testRef.current.on = false;
      const scala = scaleFromSqueeze(testRef.current.peak);
      // Una misura nulla o assurda NON deve rovinare la sensibilità che c'è: azzerarla
      // bloccherebbe l'ago, o lo manderebbe fuori scala.
      setState(p => ({
        ...p, testing: null, testPeak: testRef.current.peak,
        ...(scala ? { setup: { ...p.setup, needleScale: scala, scaleMeasured: true } } : {}),
      }));
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
        breathOk: breathIsValid(testRef.current.peak, p.setup.needleScale),
      }));
    }, SQUEEZE_TEST_MS);
  }, []);

  return {
    ...state, connect, disconnect, resetTotal, captureRaw, applyTaPoints, clearTaCalibration,
    setConfig, setOffsetFromReference, startSqueezeTest, startBreathTest,
  };
}
