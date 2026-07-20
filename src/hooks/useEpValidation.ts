import { useState, useRef } from 'react';

export interface EpValidationConditions {
  cognitionDetected: boolean;
  epSomatic:         boolean;
  emotionalConfirm:  boolean;
  noArtifacts:       boolean;
}

export function useEpValidation() {
  // ── EP Validation window (auto-triggered by worker) ─────────────────────
  const [showEpValidation, setShowEpValidation]             = useState(false);
  const [epValidationStartTime, setEpValidationStartTime]   = useState<number | null>(null);
  const [epValidationConditions, setEpValidationConditions] = useState<EpValidationConditions>({
    cognitionDetected: false,
    epSomatic:         false,
    emotionalConfirm:  false,
    noArtifacts:       false,
  });
  const [recentPcPhrases, setRecentPcPhrases] = useState<string[]>([]);

  // ── EP state (from worker / As-Isness detection) ─────────────────────────
  const [asIsnessState, setAsIsnessState] = useState<'persist' | 'as-is' | 'fn' | 'ep'>('persist');
  const [epWindowOpen, setEpWindowOpen]     = useState(false);
  const [epCognitionText, setEpCognitionText] = useState('');
  const [epAuditorNote, setEpAuditorNote]   = useState('');
  const [epValidated, setEpValidated]       = useState(false);
  const [isFnActive, setIsFnActive]         = useState(false);

  // ── EP manual entry fields ────────────────────────────────────────────────
  const [epManualOpen, setEpManualOpen]       = useState(false);
  const [epReactionType, setEpReactionType]   = useState('F/N (Floating)');
  const [epRealization, setEpRealization]     = useState('');
  const [epDurationMin, setEpDurationMin]     = useState('');
  const [epVgi, setEpVgi]                     = useState(false);
  const [epVvgi, setEpVvgi]                   = useState(false); // "molto molto buoni" (PC troppo contento)
  const [epTimestamp, setEpTimestamp]         = useState<number | null>(null);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const epWindowTimerRef      = useRef<NodeJS.Timeout | null>(null);
  /** Guard: open EP window only once per session */
  const epWindowHasOpenedRef  = useRef(false);

  /** Call at session start to reset all EP state */
  const resetEpState = () => {
    setShowEpValidation(false);
    setEpValidationStartTime(null);
    setEpValidationConditions({
      cognitionDetected: false,
      epSomatic:         false,
      emotionalConfirm:  false,
      noArtifacts:       false,
    });
    setAsIsnessState('persist');
    setEpWindowOpen(false);
    setEpCognitionText('');
    setEpAuditorNote('');
    setEpValidated(false);
    setIsFnActive(false);
    setEpManualOpen(false);
    setEpReactionType('F/N (Floating)');
    setEpRealization('');
    setEpDurationMin('');
    setEpVgi(false);
    setEpVvgi(false);
    setEpTimestamp(null);
    epWindowHasOpenedRef.current = false;
    if (epWindowTimerRef.current) {
      clearTimeout(epWindowTimerRef.current);
      epWindowTimerRef.current = null;
    }
  };

  return {
    // validation window
    showEpValidation, setShowEpValidation,
    epValidationStartTime, setEpValidationStartTime,
    epValidationConditions, setEpValidationConditions,
    recentPcPhrases, setRecentPcPhrases,
    // As-Isness / EP state
    asIsnessState, setAsIsnessState,
    epWindowOpen, setEpWindowOpen,
    epCognitionText, setEpCognitionText,
    epAuditorNote, setEpAuditorNote,
    epValidated, setEpValidated,
    isFnActive, setIsFnActive,
    // manual entry
    epManualOpen, setEpManualOpen,
    epReactionType, setEpReactionType,
    epRealization, setEpRealization,
    epDurationMin, setEpDurationMin,
    epVgi, setEpVgi,
    epVvgi, setEpVvgi,
    epTimestamp, setEpTimestamp,
    // refs
    epWindowTimerRef,
    epWindowHasOpenedRef,
    // actions
    resetEpState,
  };
}
