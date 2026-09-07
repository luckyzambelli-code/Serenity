/**
 * ZonaMna — l'involucro che riserva spazio a `PannelloMna` e lo monta, decimo pezzo staccato da
 * `Serenity.tsx` (dopo l'intestazione — v. `docs/serenity-refonte.md` per la cronologia
 * completa della scomposizione).
 *
 * ── COSA RESTA FUORI DI PROPOSITO ────────────────────────────────────────────────────────────
 * Lo STATO (`primeIm`/`primeFd`/`primePhase`/…) resta in `Serenity.tsx` — non in
 * `hooks/useMnaModule.ts`, condiviso con App.tsx, per una ragione precisa trovata leggendo il
 * codice: `Serenity.tsx` avvolge il proprio `setPrimePhase` per tenere `primePhaseRef.current`
 * SEMPRE sincronizzato a ogni chiamata (`(p) => { setPrimePhaseState(p); primePhaseRef.current =
 * p; }`), mentre `useMnaModule`'s `setPrimePhase` grezzo non lo fa — sostituirlo qui avrebbe
 * silenziosamente introdotto un ref non aggiornato. Consolidare le due implementazioni è un
 * miglioramento vero ma A SÉ (tocca un file condiviso con EQUILIBRIUM, quindi build doppia) —
 * annotato per un giro dedicato, non confuso con questa estrazione (solo disegno, zero
 * comportamento cambiato).
 *
 * @see docs/serenity-refonte.md — giro di scomposizione, 2026-09-07.
 */
import type { MutableRefObject } from 'react';
import { PannelloMna } from './PannelloMna';
import type { PrimePhase, Zone as PrimeZone } from '../lib/primeFreqEngine';
import type { MnaSession } from '../hooks/useMnaModule';

export interface ZonaMnaProps {
  /** `aperta && moduleVis.mna && museOk` — già calcolato da chi monta questo componente. */
  mostra: boolean;
  collassato: boolean;
  onToggleCollassato: () => void;
  primePhase: PrimePhase;
  setPrimePhase: (p: PrimePhase) => void;
  primePhaseRef: MutableRefObject<PrimePhase>;
  primeIm: number;
  primeFd: number;
  primeZone: PrimeZone;
  primeDelta: number;
  primePStar: number;
  primeCopies: Array<{ p: number; freq: number }>;
  setPrimeCopies: (v: Array<{ p: number; freq: number }>) => void;
  primeCaptured: boolean;
  mnaSessionRef: MutableRefObject<MnaSession>;
  onCapture: () => void;
  onAudio: (payload: { action: 'sonify' | 'clean' | 'harmonics' | 'stop'; fd?: number; delta?: number; zone?: PrimeZone; pStar?: number }) => void;
  onChiudi: () => void;
}

export function ZonaMna({
  mostra, collassato, onToggleCollassato,
  primePhase, setPrimePhase, primePhaseRef, primeIm, primeFd, primeZone, primeDelta, primePStar,
  primeCopies, setPrimeCopies, primeCaptured, mnaSessionRef, onCapture, onAudio, onChiudi,
}: ZonaMnaProps) {
  if (!mostra) return null;

  return (
    <div style={{
      position: 'relative', width: '100%', maxWidth: 1400,
      minHeight: collassato ? 44 : 140, flex: '0 0 auto',
      transition: 'min-height var(--s-slow) var(--s-ease)',
    }}>
      <PannelloMna
        collapsed={collassato}
        onToggleCollapsed={onToggleCollassato}
        primePhase={primePhase}
        setPrimePhase={setPrimePhase}
        primePhaseRef={primePhaseRef}
        primeIm={primeIm}
        primeFd={primeFd}
        primeZone={primeZone}
        primeDelta={primeDelta}
        primePStar={primePStar}
        primeCopies={primeCopies}
        setPrimeCopies={setPrimeCopies}
        primeCaptured={primeCaptured}
        mnaSessionRef={mnaSessionRef}
        onCapture={onCapture}
        onAudio={onAudio}
        onChiudi={onChiudi}
      />
    </div>
  );
}
