import { useState, useRef } from 'react';
import {
  type Zone as PrimeZone,
  type PrimePhase,
} from '../lib/primeFreqEngine';

export interface MnaSession {
  cycles: number;
  /** Recent I_m samples (CAPPED — see App worker handler). For the full-session
   *  average use imSum/imCount, which never lose data. */
  imHistory: number[];
  imSum: number;
  imCount: number;
  peakIm: number;
  finalZone: PrimeZone;
  totalCopies: number;
  phaseLog: Array<{ phase: PrimePhase; t: number }>;
}

const INITIAL_MNA_SESSION: MnaSession = {
  cycles: 0, imHistory: [], imSum: 0, imCount: 0, peakIm: 0,
  finalZone: 'PRIME', totalCopies: 0, phaseLog: [],
};

export function useMnaModule() {
  const [primePhase, setPrimePhase]     = useState<PrimePhase>('IDLE');
  const [primeIm, setPrimeIm]           = useState(0);
  const [primeFd, setPrimeFd]           = useState(0);
  const [primeZone, setPrimeZone]       = useState<PrimeZone>('PRIME');
  const [primeDelta, setPrimeDelta]     = useState(0);
  const [primePStar, setPrimePStar]     = useState(2);
  const [primeCopies, setPrimeCopies]   = useState<Array<{ p: number; freq: number }>>([]);
  /** True once the first I_m > 0 is received */
  const [primeCaptured, setPrimeCaptured] = useState(false);

  /** Mirror of primePhase for use in closures without re-running effects */
  const primePhaseRef = useRef<PrimePhase>('IDLE');

  /** Accumulates session-level data for the post-session report */
  const mnaSessionRef = useRef<MnaSession>({ ...INITIAL_MNA_SESSION });

  const resetMnaSession = () => {
    mnaSessionRef.current = { ...INITIAL_MNA_SESSION };
    setPrimePhase('IDLE');
    primePhaseRef.current = 'IDLE';
    setPrimeIm(0);
    setPrimeFd(0);
    setPrimeZone('PRIME');
    setPrimeDelta(0);
    setPrimePStar(2);
    setPrimeCopies([]);
    setPrimeCaptured(false);
  };

  return {
    primePhase, setPrimePhase,
    primeIm,    setPrimeIm,
    primeFd,    setPrimeFd,
    primeZone,  setPrimeZone,
    primeDelta, setPrimeDelta,
    primePStar, setPrimePStar,
    primeCopies, setPrimeCopies,
    primeCaptured, setPrimeCaptured,
    primePhaseRef,
    mnaSessionRef,
    resetMnaSession,
  };
}
