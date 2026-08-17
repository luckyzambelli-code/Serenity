/**
 * useMuseContactGate — IL CONTATTO VERO, fuori da App.tsx.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * `hooks/useChargeEngine` (fase 6) legge `museContactRef` per decidere se l'EEG di questo
 * istante è un segnale vero o rumore da elettrodi flottanti — senza questo gate, una fascia
 * NON indossata produrrebbe comunque "carica" fantasma. Il gate stesso — RMS per elettrodo,
 * railing sull'AC, isteresi sul « contatto perso » — viveva SOLO in `App.tsx`: montare il
 * motore della carica in SERENITY senza questo pezzo avrebbe letto un `museContactRef` sempre
 * `false`, cioè un ago che non reagisce mai.
 *
 * ── STESSO CALCOLO DI `HealthPanel` ─────────────────────────────────────────────────────────
 * La qualità per elettrodo (RMS grezzo → 0–100) è la STESSA mappatura che disegna i puntini di
 * `HealthPanel`: RMS<5 → 0, RMS>500 → 20, altrimenti lineare. Non riscritta qui.
 *
 * @see docs/serenity-refonte.md — fase 6.
 */

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { LogEntry } from '../components/TranscriptLog';

export interface MuseContactGateDeps {
  /** I quattro canali EEG grezzi — lo stesso buffer che alimenta `useChargeEngine`. */
  eegBuffer: MutableRefObject<{ [channel: number]: number[] }>;
  /** Se il flusso locale del MUSE è connesso. Valore, non funzione: il gate deve
   *  RIPARTIRE quando cambia, esattamente come l'effetto che sostituisce. */
  museConnection: 'disconnected' | 'searching' | 'connected';
  /** Seduta a distanza: l'EEG arriva da un PRECLEAR remoto che streama (fase 7). SERENITY non
   *  ha ancora il relay `RAW_EEG` (vedi `docs/serenity-refonte.md`) — passa sempre `false`. */
  remoteLive: boolean;
  /** Il tempo di seduta, per la riga di diagnostica nel giornale. */
  timeRef: MutableRefObject<number>;
  addLog: (e: Omit<LogEntry, 'time'> & { time?: number }) => void;
}

export function useMuseContactGate(d: MuseContactGateDeps) {
  const [signalQuality, setSignalQuality] = useState(0);
  const [museContact, setMuseContact] = useState(false);
  /** Specchio per i lettori che non possono aspettare un render — `useChargeEngine` prima
   *  di tutti: il gate decide istante per istante se l'EEG di QUESTO tick conta. */
  const museContactRef = useRef(false);
  useEffect(() => { museContactRef.current = museContact; }, [museContact]);

  const contactBadStreakRef = useRef(0);   // secondi consecutivi senza contatto (isteresi)
  const contactDiagRef = useRef(false);    // diagnostica « nessun contatto » scritta 1× per episodio

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (d.museConnection === 'connected' || d.remoteLive) {
      interval = setInterval(() => {
        let sum = 0; let n = 0; let goodCount = 0;
        const diag: string[] = [];
        // REAL contact (HSI-like), per electrode: a LIVE, non-railed, non-flat EEG.
        // Discriminant FIABLE d'un électrode DÉTACHÉ = RAILING (samples collés au bord de l'ADC),
        // PAS un plafond d'amplitude. MAIS le railing DOIT se mesurer sur la composante AC (après
        // retrait de la moyenne) : un MUSE BIEN PORTÉ a un OFFSET DC de plusieurs centaines de µV,
        // donc le brut |v| dépasse 700 en PERMANENCE → l'ancien test `|v|>700` déclarait « railé »
        // (satFrac ~1) et donc « pas de contact » À TORT, même casque bien posé. On teste donc
        // l'ÉCART À LA MOYENNE |v-mean| : seul un vrai flottement fait osciller l'AC jusqu'au rail.
        const FLAT_RMS = 2;      // AC-RMS < this → dead/shorted electrode
        const SAT_UV = 700;      // |v-mean| beyond this ≈ swing jusqu'au rail (floating)
        for (let i = 0; i < 4; i++) {
          const s = d.eegBuffer.current[i] || [];
          if (!s.length) { diag.push(`e${i}:vide`); continue; }
          const win = s.slice(-128);
          let mean = 0; for (let k = 0; k < win.length; k++) mean += win[k]; mean /= win.length;
          let acc = 0, accAc = 0, sat = 0;
          for (let k = 0; k < win.length; k++) {
            const v = win[k], dd = v - mean;
            acc += v * v; accAc += dd * dd;
            if (Math.abs(dd) > SAT_UV) sat++;   // railing sur l'AC, pas sur le brut (offset DC)
          }
          const rms = Math.sqrt(acc / win.length);       // BRUT — qualité + réseau
          const rmsAc = Math.sqrt(accAc / win.length);   // AC-COUPLÉ — contact
          const satFrac = win.length ? sat / win.length : 1;
          const ok = rmsAc >= FLAT_RMS && satFrac < 0.15;
          if (ok) goodCount++;
          diag.push(`e${i}:ac${Math.round(rmsAc)} sat${Math.round(satFrac * 100)}%${ok ? '✓' : ''}`);
          // Same mapping as HealthPanel: RMS<5 → 0, RMS>500 → 20, else linear 0..100
          const q = rms < 5 ? 0 : rms > 500 ? 20 : Math.min(100, (rms / 200) * 100);
          sum += q; n++;
        }
        const avg = n > 0 ? Math.round(sum / n) : 0;
        setSignalQuality(prev => Math.abs(prev - avg) >= 1 ? avg : prev);
        // Contact = MAJORITÉ d'électrodes plausibles (≥ 2 sur 4). Une fascie portée en fait
        // contact sur plusieurs électrodes ; une fascie RETIRÉE en perd la plupart (flottement) →
        // ce seuil détecte enfin le retrait, là où « ≥ 1 » laissait passer le bruit d'une seule
        // électrode. HYSTÉRÉSIS : "contact" immédiat (réactif à la pose), "pas de contact" après
        // 3 s mauvaises d'affilée (évite les faux négatifs sur un bref artefact).
        // Assoupli : 1 électrode plausible suffit pour « contact » (évite les faux « pas de
        // contact » quand la fascie est portée). Le retrait reste détecté via le heartbeat/downgrade
        // participant + l'absence prolongée de flux.
        if (goodCount >= 1) { contactBadStreakRef.current = 0; contactDiagRef.current = false; setMuseContact(true); }
        else {
          contactBadStreakRef.current += 1;
          if (contactBadStreakRef.current >= 4) {
            setMuseContact(false);
            // DIAGNOSTIC (1× par épisode « pas de contact ») : par électrode, AC-RMS + % de railing
            // (vide = aucun flux EEG). Dit tout de suite POURQUOI : buffers vides vs signal hors seuil.
            if (!contactDiagRef.current) {
              contactDiagRef.current = true;
              d.addLog({ time: d.timeRef.current, speaker: 'SYS', text: `MUSE contact: [${diag.join('  ')}]`, type: 'normal' });
            }
          }
        }
      }, 1000);
    } else if (d.museConnection === 'searching') {
      // Keep the cosmetic "searching" jitter so the UI shows activity.
      interval = setInterval(() => {
        setSignalQuality(Math.round(Math.random() * 30));
      }, 500);
      setMuseContact(false);
    } else {
      setSignalQuality(0);
      setMuseContact(false);
    }
    return () => { if (interval) clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.museConnection, d.remoteLive]);

  return { signalQuality, setSignalQuality, museContact, museContactRef };
}
