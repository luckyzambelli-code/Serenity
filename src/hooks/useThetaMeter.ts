import { useCallback, useEffect, useRef, useState } from 'react';
import { ThetaMeterHid, isHidAvailable, type ThetaStatus } from '../lib/thetaMeterHid';
import { ThetaNeedle } from '../engine/thetaNeedle';
import {
  buildTaScale, taFromRaw, loadTaScale, saveTaScale, clearTaScale,
  type ThetaTaPoint, type ThetaTaScale,
} from '../engine/thetaTaScale';

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
  /** Ultimo grezzo ricevuto: utile in diagnostica e per la taratura. */
  raw: number;
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
  /** L'ago è finito fuori dal quadrante. */
  offScale: boolean;
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
  const pendingRef = useRef<{ offset: number; arm: number; raw: number; totalTa: number; offScale: boolean } | null>(null);

  const [state, setState] = useState<ThetaMeterState>({
    status: 'disconnected', offset: 0, arm: 0, raw: 0, totalTa: 0, offScale: false,
    ta: null, taNow: null, taScale: loadTaScale(),
    counters: { ok: 0, rejected: 0 }, unavailable: !isHidAvailable(), lastError: null,
  });

  // Il driver si crea UNA volta: ricrearlo a ogni render lascerebbe dietro dispositivi aperti.
  if (!hidRef.current) {
    hidRef.current = new ThetaMeterHid({
      // Il modello lavora sul valore LISCIATO (a 60/s il grezzo balla), ma si tiene anche il
      // grezzo: serve in diagnostica e per la taratura contro resistenze note.
      onReading: r => { pendingRef.current = { ...needleRef.current.push(r.smooth), raw: r.raw }; },
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
        ta: prev.taScale ? taFromRaw(p.arm, prev.taScale) : null,
        taNow: prev.taScale ? taFromRaw(needleRef.current.lastRaw, prev.taScale) : null,
        counters: hidRef.current!.counters,
      }));
    }, UI_PERIOD_MS);
    return () => clearInterval(id);
  }, []);

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
    setState(p => ({ ...p, offset: 0, arm: 0, raw: 0, totalTa: 0, offScale: false }));
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
    setState(p => ({ ...p, taScale: scale }));
    return true;
  }, []);

  const clearTaCalibration = useCallback(() => {
    clearTaScale();
    setState(p => ({ ...p, taScale: null, ta: null }));
  }, []);

  return { ...state, connect, disconnect, resetTotal, captureRaw, applyTaPoints, clearTaCalibration };
}
