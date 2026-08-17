/**
 * useStableReleaseState — « LIBERAZIONE ATTIVA », fuori da App.tsx.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * `hooks/useChargeEngine` legge `stableReleaseStateRef` per sapere se la carica sta DAVVERO
 * uscendo dal caso (Tone Arm che scende, o F/N) — non è decorativo: `_releaseActive` entra nella
 * macchina a stati del ciclo (`cycleStateMachine.update`), quindi influisce su quando una
 * DISSOLUZIONE viene riconosciuta come tale. Senza questo pezzo, montare un ciclo in SERENITY
 * userebbe un valore statico e la fase DISSOLUZIONE non si riconoscerebbe mai correttamente.
 *
 * ── PERCHÉ « ATTIVA » NON È LA VELOCITÀ DEL PROCESSO (CONN-110) ─────────────────────────────
 * La libertà è quando il TA SCENDE (o c'è F/N) — non quando il processo va veloce: un processo
 * veloce può anche voler dire massa che SALE. Letto dal trend del TA vero (`metricsStore`) sugli
 * ultimi ~4 secondi, con un'isteresi di 2,5 s per non sfarfallare a ogni tick.
 *
 * @see docs/serenity-refonte.md — fase 6.
 */

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { metricsStore } from '../store/metricsStore';

export type ReleaseState = 'active' | 'flow' | 'resistance';

export interface StableReleaseStateDeps {
  /** L'ultima reazione MOSTRATA sull'ago EEG — F/N o Blow Down contano come rilascio, a
   *  prescindere dal trend del TA. Lo stesso ref che `useChargeEngine` scrive. */
  needleReactionKeyRef: MutableRefObject<string>;
}

export function useStableReleaseState(d: StableReleaseStateDeps) {
  const [stableReleaseState, setStableReleaseState] = useState<ReleaseState>('resistance');
  const stableReleaseStateRef = useRef<ReleaseState>('resistance');
  useEffect(() => { stableReleaseStateRef.current = stableReleaseState; }, [stableReleaseState]);

  const releaseStateTimerRef = useRef<{ candidate: ReleaseState | null; sinceMs: number }>({ candidate: null, sinceMs: 0 });
  const taTrendRef = useRef<{ ta: number; ms: number }[]>([]);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const ta = metricsStore.get().toneArm;
      const buf = taTrendRef.current;
      buf.push({ ta, ms: now });
      while (buf.length > 1 && now - buf[0].ms > 4000) buf.shift(); // ~4s window
      const dTA = buf.length >= 2 ? buf[buf.length - 1].ta - buf[0].ta : 0;
      const key = d.needleReactionKeyRef.current || '';
      const isFN   = key.includes('reaction_fn');
      const isBlow = key === 'reaction_blow_down'; // TA blow-down = release
      const taFalling = dTA < -0.05;  // Tone Arm descending = mass blowing down
      const taRising  = dTA >  0.06;  // Tone Arm climbing  = accumulating mass

      const candidate: ReleaseState =
          (isFN || isBlow || taFalling)            ? 'active'      // libération active
        : (taRising || key === 'reaction_stuck')   ? 'resistance'  // masse / résistance
        :                                            'flow';        // flux constant

      const HOLD_MS = 2500; // 2.5 s minimum avant changement (anti-flicker)
      const ref = releaseStateTimerRef.current;
      if (candidate === stableReleaseStateRef.current) {
        ref.candidate = null;
        ref.sinceMs = 0;
      } else if (ref.candidate !== candidate) {
        ref.candidate = candidate;
        ref.sinceMs = now;
      } else if (now - ref.sinceMs >= HOLD_MS) {
        setStableReleaseState(candidate);
        ref.candidate = null;
        ref.sinceMs = 0;
      }
    };
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
    // mount/unmount only, come l'originale: `d.needleReactionKeyRef` è un ref, letto fresco
    // a ogni tick — non serve rifare l'intervallo quando cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { stableReleaseState, stableReleaseStateRef };
}
