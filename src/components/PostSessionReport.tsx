import React, { useRef, useState } from 'react';
import { pick5 } from '../i18n5';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts';
import { Download } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { useI18n } from '../i18n.tsx';
import { saveSessionPdf, saveSessionPdfAsync, updateSessionNextCs, getSessionsByProfile } from '../lib/storage';
import { serverSaveSessionPdf, isServerAvailable } from '../lib/serverStorage';
import { LogEntry } from './TranscriptLog';
import { cn, fmtIm } from '../lib/utils';

interface PostSessionReportProps {
  history: any[];
  csvData: string[];
  logs: LogEntry[];
  mass: number;
  startTime: Date | null;
  endTime: Date | null;
  auditorName: string;
  pcName: string;
  pcPhoto?: string;
  auditorPhoto?: string;
  isSoloSession: boolean;
  /** Seduta SENZA strumenti: scelta esplicita, non assenza di reazioni. Va etichettata. */
  noInstruments?: boolean;
  onClose: () => void;
  onSaveSession?: (summary: any) => void;
  lang?: any;
  sessionObjective?: string;
  sessionProcessObjective?: string;
  sessionPhysicalCheck?: string;
  sessionBriefing?: string;
  onOpenHistory?: () => void;
  /** Flux des réactions RÉELLEMENT affichées en séance (ReactionClassifier) — pour compter les
   *  F/N comme à l'écran, au lieu de la ré-estimation qL≥0.7 (source de la divergence du PDF). */
  reactions?: { time: number; reaction: string }[];
  epValidated?: boolean;
  epCognitionText?: string;
  epAuditorNote?: string;
  epReactionType?: string;
  epRealization?: string;
  epDurationMin?: string;
  epVgi?: boolean;
  epVvgi?: boolean;
  epTimestamp?: number | null;
  totalTa?: number;
  /** Coherent "mass contacted vs dissolved" — cumulative seconds (presence vs
   *  release model, same as the live readout). Replaces the old 4-zone T-zone
   *  distribution in the report. */
  massTime?: number;
  dissolutionTime?: number;
  /** Average release velocity over the session (raw smoothVProc). */
  avgReleaseVel?: number;
  /** Norme personnelle (baseline du VelocityTracker) → affichage NORMALISÉ en « × » comme
   *  l'écran (velRatio = vitesse / norme), au lieu du brut ×1000. */
  relVelBaseline?: number;
  /** Dissolution % weighted by CHARGE QUANTITY (qL·dt), not just time. */
  dissolvedPctMass?: number;
  /** Mass QUANTITY (Σ qL·dt) contacted / dissolved — shown in ZONES AS-IS instead
   *  of the time durations (user request). */
  massChargeQ?: number;
  dissChargeQ?: number;
  /** Auditing items the auditor armed a cycle for: question + furthest phase
   *  reached + whether it completed (reached AS-IS) + the measured leading-edge lag. */
  auditingCycles?: Array<{ n?: number; question: string; tStartSec: number; tEndSec: number; phaseReached: string; completed: boolean; leadMs?: number; falseAsIs?: boolean; io?: number; taAtAsIs?: number;
    /** Cycle NULL (miroir) : type + issue. Les deux familles sont RAPPORTÉES SÉPARÉMENT
     *  (demande utilisateur) : CONTACT → AS-IS, NULL → EQUILIBRIUM (avec les VGI's) / no recharging. */
    kind?: 'charge' | 'null'; noRecharging?: boolean; clearRead?: boolean; vgi?: boolean }>;
  /** Cycles MIRROR (méthode de Ron, LECTURE DIRECTE) — famille À PART, rapportée séparément sous
   *  CONTACT et NULL. READ = pic rencontré (1–10), DOUBLE = total présent (2× = 2–20), erased =
   *  l'aiguille est revenue à FLOAT (F/N). Échelle proportionnelle (pas de mS). */
  mirrorCycles?: Array<{ n: number; question: string; tStartSec: number; tEndSec: number;
    readInst: number; readDouble: number; erased: boolean }>;
  /** Cycles TONE SCALE (Ron, −40…+40) — famille À PART elle aussi. On garde ce que la MESURE
   *  disait au moment de la localisation, ce que le préclair a VALIDÉ, et si les deux
   *  concordaient : c'est précisément ce désaccord-là qu'on veut pouvoir relire après coup.
   *  `anchor` dit qui a certifié l'instant (le MUSE, l'aiguille du METER, ou rien).
   *  `witnesses` = les témoins de l'as-is qui se sont allumés. */
  toneCycles?: Array<{ n: number; question: string; tStartSec: number; tEndSec: number;
    /** Tono di PARTENZA misurato — `null` senza meter. */
    located: number | null;
    /** Quante volte si è dato « porta questo a tono quaranta ». È il processo di Ron. */
    repeats: number;
    /** Da dove viene il tono di partenza. Assente nei cicli registrati prima della 2.0.120. */
    source?: 'meter' | 'meter+eeg' | 'assessed';
    anchor: string; witnesses: string[];
    /** Il tono quaranta è stato raggiunto (nome storico del campo). */
    asIs: boolean }>;
  /** Cycles ASSESSMENT (l'auditeur donne des items à voix haute ; on inscrit le READ instantané
   *  comme le R&I). Chaque cycle = un lot d'items {texte, read}. Rapporté séparément. */
  assessCycles?: Array<{ n: number; tStartSec: number; tEndSec: number;
    items: Array<{ item: string; reaction: string; time: number; beforeMs?: number }> }>;
  /** Measured Ron's Lag Δt* (ms, reaction time), # of cycles, and the Kalman trend
   *  (ms/s; negative = the reaction time is shrinking → PC growing more present). */
  deltaStar?: number;
  deltaStarN?: number;
  deltaTrend?: number;
  deltaBaseline?: number;   // Δt*_baseline (Pre-Read structural anchor, ms)
  deltaAdaptive?: number;   // Δt*_adaptive (per-PC deviation, ms)
  /** Pre-session breath-test results (the reactivity is the headline number — RSA-
   *  driven response of HR/EEG to the guided breathing). */
  breathReactivity?: 'good' | 'ok' | 'poor' | 'na';
  breathContactPct?: number;
  breathBpm?: number;
  profileId?: string;
  mnaData?: {
    cycles: number;
    imHistory: number[];
    /** Full-session running aggregates (imHistory is capped — use these for the average). */
    imSum?: number;
    imCount?: number;
    peakIm: number;
    finalZone: string;
    totalCopies: number;
    phaseLog: Array<{ phase: string; t: number }>;
  };
}


export function PostSessionReport({ history, csvData, logs, mass, startTime, endTime, auditorName, pcName, pcPhoto, auditorPhoto, isSoloSession, noInstruments = false, onClose, onSaveSession, sessionObjective, sessionProcessObjective, sessionPhysicalCheck, sessionBriefing, onOpenHistory, reactions = [], epValidated = false, epCognitionText = '', epAuditorNote = '', epReactionType = '', epRealization = '', epDurationMin = '', epVgi = false, epVvgi = false, epTimestamp = null, totalTa = 0, massTime = 0, dissolutionTime = 0, avgReleaseVel = 0, relVelBaseline = 0, dissolvedPctMass, massChargeQ = 0, dissChargeQ = 0, auditingCycles = [], mirrorCycles = [], toneCycles = [], assessCycles = [], deltaStar = 0, deltaStarN = 0, deltaTrend = 0, deltaBaseline = 0, deltaAdaptive = 0,
  breathReactivity, breathContactPct, breathBpm,
  profileId, mnaData }: PostSessionReportProps) {
  // ── ZONES AS-IS: charge lifecycle of the contacted masses ──
  // CONTACT (time + peak I_m intensity) → DISCHARGE (time + avg release velocity)
  // → AS-IS (% of contacted mass dissolved). dissolution ⊆ mass ⇒ ≤ 100%.
  // Dissolution % — by CHARGE QUANTITY when available (qL-weighted), else fall
  // back to the time ratio for older sessions.
  const dissolvedPct = dissolvedPctMass != null
    ? dissolvedPctMass
    : (massTime > 0 ? Math.round((dissolutionTime / massTime) * 100) : 0);
  // Compact, all-ASCII formatting (see fmtIm) — toLocaleString's fr-FR thousands
  // separator (U+202F) had no glyph in the PDF font and rendered as "/", so a
  // single I_m like 26 315 476 came out as "26 /315 /476" (looked like 3 numbers)
  // and its right-alignment was thrown off. Compact form fixes both.
  const peakImVal = fmtIm(mnaData?.peakIm);
  // NORMALISÉ comme l'écran (readout diagnostic) : vitesse moyenne / norme personnelle
  // (baseline) → mesure « × », PLUS de ×1000. Ex. 1.20× = a libéré 20 % au-dessus de sa norme.
  const avgRelVelRatio = relVelBaseline > 0 ? avgReleaseVel / relVelBaseline : 0;
  // Live : rapport « × » (comme l'écran). Anciennes sessions sauvées (sans baseline) : valeur
  // brute SANS ×1000 (honore « non per 1000 »). Rien : tiret.
  const avgRelVelVal = avgRelVelRatio > 0 ? `${avgRelVelRatio.toFixed(2)}×`
                     : (avgReleaseVel > 0 ? avgReleaseVel.toFixed(3) : '—');
  const { t, lang } = useI18n();
  /** Traduction locale 5 langues pour les libellés du rapport qui n'ont pas de clé i18n.
   *  Les TERMES D'AUDITION (CONTACT, NULL, RISE, EQUILIBRIUM, AS-IS, F/N, VGI's, MOCK-UP,
   *  recharging, ASSESSMENT, MIRROR) restent en ANGLAIS dans toutes les langues. */
  const L = (it: string, fr: string, en: string, es: string, sv: string) => pick5(lang as string, it, fr, en, es, sv);
  // Compteur d'historique pour afficher dans le bouton — incrémenté quand la session est sauvegardée
  const [historyCount, setHistoryCount] = React.useState<number>(() => {
    try {
      return profileId ? getSessionsByProfile(profileId).length : 0;
    } catch { return 0; }
  });
  // Recompter quand savedSessionId change (= session enregistrée)
  React.useEffect(() => {
    try {
      if (profileId) {
        // +1 pour inclure la session courante qui vient d'être sauvegardée
        const count = getSessionsByProfile(profileId).length;
        setHistoryCount(count);
      }
    } catch {}
  }, [profileId]);
  const reportRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [pdfSaved, setPdfSaved] = useState(false);
  const [nextCs, setNextCs] = useState('');
  const [nextCsSaved, setNextCsSaved] = useState(false);
  const savedSessionIdRef = useRef<string | null>(null);
  const wrapTight = (text: string, chunkSize = 26) => {
    return text
      .split(' ')
      .map((word) => {
        if (word.length <= chunkSize) return word;
        const parts: string[] = [];
        for (let i = 0; i < word.length; i += chunkSize) {
          parts.push(word.slice(i, i + chunkSize));
        }
        return parts.join(' ');
      })
      .join(' ');
  };
  const wrapByChars = (text: string, maxChars: number) => {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return [''];
    const words = normalized.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      if (word.length > maxChars) {
        if (current) {
          lines.push(current);
          current = '';
        }
        for (let i = 0; i < word.length; i += maxChars) {
          lines.push(word.slice(i, i + maxChars));
        }
        continue;
      }
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > maxChars) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  // Calculate time spent in each T-Zone
  const zoneCounts = history.reduce((acc, point) => {
    acc[point.tZone] = (acc[point.tZone] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalPoints = history.length || 1;
  const timeInZones = {
    T80: ((zoneCounts['T80'] || 0) / totalPoints) * 100,
    T90: ((zoneCounts['T90'] || 0) / totalPoints) * 100,
    T60: ((zoneCounts['T60'] || 0) / totalPoints) * 100,
    T99: ((zoneCounts['T99'] || 0) / totalPoints) * 100,
  };

  // Find F/Ns (Q_L >= 0.7 with 1.5s persistence and 500ms hysteresis)
  // Seuil 0.7 (au lieu de 0.9) : reflète une F/N réelle (aiguille flottante stable),
  // pas un pic exceptionnel quasi-jamais atteint avec un MUSE 2 grand public
  let fnCount = 0;
  let stabilityTimer = 0;
  let hysteresisTimer = 0;
  let isFnValidated = false;
  let lastUpdateT: number | null = null;
  
  // EP Validation variables
  // FIX EP-PDF: the EP is VALIDATED ONLY by the auditor (the `epValidated` prop).
  // The previous derived auto-validation (qL ≥ 0.85 for ≥ 6 s → isEpValidated=true)
  // wrongly stamped "EP VALIDÉ" on the PDF when the auditor had NOT validated.
  // Removed — `isEpValidated` now follows the auditor's decision and nothing else.
  const isEpValidated = epValidated;

  history.forEach(p => {
    const currentT = p.time;
    
    if (lastUpdateT === null) {
      lastUpdateT = currentT;
      return;
    }
    
    const dt = currentT - lastUpdateT;
    lastUpdateT = currentT;

    // F/N Logic — seuil abaissé à 0.7
    if (p.qL >= 0.7) {
      hysteresisTimer = 0;
      stabilityTimer += dt;
      
      if (stabilityTimer >= 1.5 && !isFnValidated) {
        isFnValidated = true;
        fnCount++; // Count the F/N only when it first becomes validated
      }
    } else {
      if (stabilityTimer > 0) {
        hysteresisTimer += dt;
        if (hysteresisTimer > 0.5) {
          isFnValidated = false;
          stabilityTimer = 0;
        }
      }
    }
    // (EP is no longer auto-derived from qL — validation is the auditor's only.)
  });

  // ALIGNEMENT PDF ↔ ÉCRAN : si on a le flux des réactions réellement affichées en séance
  // (ReactionClassifier), on compte les ÉPISODES F/N DISTINCTS tels que l'auditeur les a vus,
  // au lieu de la ré-estimation qL≥0.7 ci-dessus (qui donnait un autre nombre → « 2 » alors
  // qu'il y en avait plus à l'écran). Fusion des micro-coupures < 1 s = un seul épisode.
  if (reactions && reactions.length) {
    let cnt = 0, inFn = false, lastEnd = -Infinity;
    for (const r of reactions) {
      const isFn = typeof r.reaction === 'string' && r.reaction.startsWith('F/N');
      if (isFn) { if (!inFn && (r.time - lastEnd >= 1.0)) cnt++; inFn = true; }
      else { if (inFn) lastEnd = r.time; inFn = false; }
    }
    fnCount = cnt;
  }

  // Map logs to reactions (Semantic Supervisor)
  const transcriptReactions = logs.filter(l => l.speaker === 'Aud').map(log => {
    // Trouver le point history le plus proche dans le temps
    const closest = history.reduce((best, p) =>
      Math.abs(p.time - log.time) < Math.abs((best?.time ?? Infinity) - log.time) ? p : best
    , null as any);

    const qLval = closest?.qL ?? 0;
    const dirac = (closest?.diracCount ?? 0) > 0;
    const etaVal = closest?.eta ?? 0;

    let reaction = 'Tick';
    let type: 'gold' | 'gray' | 'neutral' = 'neutral';

    if (dirac && etaVal > 0.5) {
      reaction = 'Cognition (As-isness)';
      type = 'gold';
    } else if (qLval >= 0.9) {
      reaction = 'F/N Stable';
      type = 'gold';
    } else if (qLval >= 0.5) {
      reaction = 'Fall';
      type = 'neutral';
    } else {
      reaction = 'Tick';
      type = 'gray';
    }

    return { ...log, reaction, type };
  });

  const transcriptWithCharge = logs.map((log) => {
    const closestPoint = history.reduce((closest, point) => {
      if (!closest) return point;
      const d1 = Math.abs((point.time || 0) - (log.time || 0));
      const d2 = Math.abs((closest.time || 0) - (log.time || 0));
      return d1 < d2 ? point : closest;
    }, null as any);

    const ql = closestPoint?.qL ?? 0;
    const etaVal = closestPoint?.eta ?? 0;
    const hasDirac = (closestPoint?.diracCount || 0) > 0;
    const reaction = hasDirac
      ? (t('reaction_cognition_pure') as string)
      : ql >= 0.7
        ? (t('reaction_fn_stable') as string)
        : (t('reaction_signifiance_stall') as string);

    return {
      ...log,
      charge: `${(ql * 100).toFixed(0)}%`,
      eta: etaVal.toFixed(2),
      reaction
    };
  });

  const hasSaved = useRef(false);
  React.useEffect(() => {
    if (hasSaved.current || !onSaveSession) return;
    hasSaved.current = true;

    const maxEta = history.length > 0 ? Math.max(...history.map(h => h.eta)) : 0;
    const sessionId = Date.now().toString();
    savedSessionIdRef.current = sessionId;

    onSaveSession({
      id: sessionId,
      date: startTime?.getTime() || Date.now(),
      duration: Math.floor(((endTime?.getTime() || Date.now()) - (startTime?.getTime() || Date.now())) / 1000),
      pcName,
      pcPhoto,
      auditorName,
      auditorPhoto,
      isSolo: isSoloSession,
      noInstruments,
      objective: sessionObjective,
      processObjective: sessionProcessObjective,
      physicalCheck: sessionPhysicalCheck,
      briefing: sessionBriefing,
      nextCs,
      mass,
      fnCount,
      maxEta,
      epValidated: isEpValidated,
      timeInZones,          // ← T-Zones distribuées (legacy, kept for old data)
      zoneCounts,           // ← compte brut par zone (legacy)
      massTime,             // ← coherent: seconds with charge present
      dissolutionTime,      // ← coherent: seconds in active release
      avgReleaseVel,        // ← avg release velocity (raw)
      dissolvedPctMass: dissolvedPct,  // ← dissolution % weighted by charge quantity
      massChargeQ, dissChargeQ,        // ← mass QUANTITY (Σ qL·dt) for ZONES AS-IS
      auditingCycles,                  // ← armed cycles: question + phase + completed
      mirrorCycles,                    // ← cycles MIRROR (Ron « double to erase ») — famille à part
      toneCycles,                      // ← cycles TONE SCALE (Ron, −40…+40) — famille à part
      assessCycles,                    // ← cycles ASSESSMENT (items + read instantané)
      deltaStar, deltaStarN, deltaTrend, // ← measured Ron's Lag Δt* (reaction time) + Kalman trend
      breathReactivity, breathContactPct, breathBpm, // ← pre-session breath test (RSA)
      peakIm: mnaData?.peakIm ?? 0,  // ← mass intensity (for ZONES AS-IS in History)
      totalTa,              // ← TA total accumulé
    });

    // Generate and save lightweight text PDF for History view.
    (async () => {
      const sid = sessionId;
      const trySaveDataUri = async (dataUri: string) => {
        try {
          await saveSessionPdfAsync(sid, dataUri);
          setPdfSaved(true);
        } catch (e) {
          try { saveSessionPdf(sid, dataUri); setPdfSaved(true); } catch (_) {}
        }
      };

      try {
        const dataUri = await generateTextPdf();
        await trySaveDataUri(dataUri);
        // FIX HISTORY-PDF: also push the PDF to the SERVER on AUTO-save (not only
        // on the manual "Export PDF"). Session records sync across devices, but
        // the PDF used to live ONLY in the device's local IndexedDB → other
        // devices (and a re-install) showed the session with NO PDF → "5 sessions
        // · 2 PDF". Uploading here makes every session's PDF retrievable anywhere.
        try {
          if (await isServerAvailable()) {
            const raw = dataUri.split(',')[1] || '';
            const fname = `${(pcName || 'session').replace(/[^\w-]+/g, '_')}_${sid}.pdf`;
            await serverSaveSessionPdf(sid, fname, raw);
          }
        } catch (srvErr) {
          console.warn('[PDF] auto server upload failed (kept local)', srvErr);
        }
        // Rafraîchir le compteur d'historique après sauvegarde
        try {
          if (profileId) {
            setHistoryCount(getSessionsByProfile(profileId).length);
          }
        } catch {}
      } catch (e) {
        console.error('Failed to generate lightweight text PDF', e);
      }
    })();
  }, [onSaveSession, startTime, endTime, pcName, pcPhoto, auditorName, auditorPhoto, isSoloSession, noInstruments, sessionObjective, sessionProcessObjective, sessionPhysicalCheck, sessionBriefing, nextCs, mass, fnCount, isEpValidated, history, profileId]);

  // BUGFIX (Next C/S in PDF): the initial save above runs ONCE (hasSaved guard) —
  // before Next C/S is typed — so the History PDF would omit it unless the auditor
  // clicked "Save". Re-save the PDF (debounced) whenever Next C/S changes so it lands
  // in History automatically. The explicit button still works.
  React.useEffect(() => {
    if (!hasSaved.current) return;            // only after the first (mount) save
    const sid = savedSessionIdRef.current;
    if (!sid) return;
    const id = setTimeout(async () => {
      try {
        updateSessionNextCs(sid, nextCs);
        const dataUri = await generateTextPdf();
        try { await saveSessionPdfAsync(sid, dataUri); } catch { saveSessionPdf(sid, dataUri); }
        setPdfSaved(true);
      } catch (e) { console.error('Next C/S PDF resync failed', e); }
    }, 1200);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextCs]);

  const handleSaveNextCs = async () => {
    const sid = savedSessionIdRef.current;
    if (!sid) return;
    try {
      updateSessionNextCs(sid, nextCs);
      // Keep History PDF synced even without manual export.
      const dataUri = await generateTextPdf();
      try {
        await saveSessionPdfAsync(sid, dataUri);
      } catch (e) {
        saveSessionPdf(sid, dataUri);
      }
      setPdfSaved(true);
      setNextCsSaved(true);
      setTimeout(() => setNextCsSaved(false), 1800);
    } catch (e) {
      console.error('Failed to save Next C/S', e);
      alert(L('Impossibile salvare il Next C/S.', 'Impossible d\'enregistrer le Next C/S.', 'Failed to save Next C/S.', 'No se pudo guardar el Next C/S.', 'Kunde inte spara Next C/S.'));
    }
  };

  const durationSeconds = startTime && endTime 
    ? Math.floor((endTime.getTime() - startTime.getTime()) / 1000)
    : 0;
  const durationStr = `${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s`;

  const dateStr = startTime ? startTime.toLocaleDateString() : new Date().toLocaleDateString();
  const startTimeStr = startTime ? startTime.toLocaleTimeString() : '--:--:--';
  const endTimeStr = endTime ? endTime.toLocaleTimeString() : '--:--:--';
  const exportDate = (startTime || new Date()).toISOString().split('T')[0];
  const exportTime = (startTime || new Date()).toTimeString().slice(0,8).replace(/:/g, '-');
  const exportPc = ((pcName || 'PC').trim() || 'PC')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '_');
  const exportPdfFilename = `${exportPc}_${exportDate}_${exportTime}.pdf`;

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const dataUri = await generateTextPdf();
      const sid = savedSessionIdRef.current || Date.now().toString();
      const raw = dataUri.split(',')[1] || '';

      // 1. Save to IndexedDB (in-app history)
      try {
        await saveSessionPdfAsync(sid, dataUri);
        setPdfSaved(true);
      } catch (e) {
        try { saveSessionPdf(sid, dataUri); setPdfSaved(true); } catch (_) {}
      }

      // 2. Save to server API (works in BOTH Electron and Chrome modes)
      const serverUp = await isServerAvailable();
      if (serverUp) {
        try {
          await serverSaveSessionPdf(sid, exportPdfFilename, raw);
          console.log('[PDF] Saved via server API');
        } catch (e) {
          console.warn('[PDF] Server save failed:', e);
        }
      }

      // 3. Also save via Electron IPC for direct disk path (Electron mode only)
      // Uses window.electronAPI (injected by preload.cjs via contextBridge — contextIsolation safe)
      if (!serverUp) {
        try {
          const electronAPI = (window as any).electronAPI;
          if (electronAPI?.savePdfToDisk) {
            const result = await electronAPI.savePdfToDisk({
              filename: exportPdfFilename,
              base64: raw,
            });
            if (result?.ok) console.log('[PDF] Saved to disk (IPC):', result.path);
          }
        } catch (ipcErr) {
          console.warn('[PDF] Electron IPC unavailable:', ipcErr);
        }
      }

      // 3. Also trigger browser download (works in both modes)
      const bytes = atob(raw);
      const len = bytes.length;
      const arr = new Uint8Array(len);
      for (let i = 0; i < len; i++) arr[i] = bytes.charCodeAt(i);
      const blob = new Blob([arr], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportPdfFilename;
      a.setAttribute('download', exportPdfFilename);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export lightweight PDF", err);
    } finally {
      setIsExporting(false);
    }
  };

  // Helper: resize image dataUrl to max width (px) and return JPEG dataUrl
  const resizeDataUrl = (dataUrl: string, maxWidth: number, quality = 0.7): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!dataUrl) return resolve('');
      const img = new Image();
      img.onload = () => {
        const ratio = img.width / img.height;
        const width = Math.min(maxWidth, img.width);
        const height = Math.round(width / ratio);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(dataUrl);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const out = canvas.toDataURL('image/jpeg', quality);
        resolve(out);
      };
      img.onerror = (e) => reject(e);
      img.src = dataUrl;
    });
  };

  // Create a circular PNG dataUrl (transparent outside circle) at given size (px)
  const resizeDataUrlCircular = (dataUrl: string, size: number, quality = 0.9): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!dataUrl) return resolve('');
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(dataUrl);

        ctx.clearRect(0, 0, size, size);
        ctx.save();
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        // Draw image covering the canvas while preserving aspect ratio (cover)
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (size - w) / 2;
        const y = (size - h) / 2;
        ctx.drawImage(img, x, y, w, h);
        ctx.restore();

        const out = canvas.toDataURL('image/png', quality);
        resolve(out);
      };
      img.onerror = (e) => reject(e);
      img.src = dataUrl;
    });
  };

  // Keep a lightweight text PDF generator available (used for downloads fallback)
  const generateTextPdf = async (): Promise<string> => {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    let y = 12;
    const ensureSpace = (required = 12) => {
      if (y > pageH - required) {
        pdf.addPage();
        y = 12;
      }
    };

    // ── visual helpers — give the PDF the on-screen "report card" look (vector, light) ──
    const ACCENT: [number, number, number] = [34, 150, 200];
    const INK: [number, number, number] = [28, 38, 56];
    const setRGB = (c: [number, number, number]) => pdf.setTextColor(c[0], c[1], c[2]);
    // Strip diacritics → ASCII for jsPDF (helvetica is Latin-1; keep report text safe).
    const ascii = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    // Section header: left accent bar + bold title on a faint tinted strip (like the panels).
    const panelHeader = (title: string, accent: [number, number, number] = ACCENT) => {
      ensureSpace(18);
      const x = 14, w = pageW - 28, h = 8.5;
      pdf.setFillColor(accent[0], accent[1], accent[2]);
      pdf.roundedRect(x, y, 1.8, h, 0.6, 0.6, 'F');
      pdf.setFillColor(243, 246, 250);
      pdf.roundedRect(x + 2.6, y, w - 2.6, h, 1.4, 1.4, 'F');
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); setRGB(INK);
      pdf.text(title, x + 5.5, y + h - 2.7);
      y += h + 4;
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); setRGB(INK);
    };
    // Light tint of an accent toward white (no alpha → no GState dependency).
    const tint = (c: [number, number, number], k = 0.12): [number, number, number] =>
      [Math.round(c[0] * k + 255 * (1 - k)), Math.round(c[1] * k + 255 * (1 - k)), Math.round(c[2] * k + 255 * (1 - k))];
    // Metric tile: a small rounded box with a label over a coloured value (like the grids).
    const metricTile = (x: number, ty: number, w: number, label: string, value: string, accent: [number, number, number]) => {
      const h = 13; const bg = tint(accent, 0.12);
      pdf.setFillColor(bg[0], bg[1], bg[2]);
      pdf.roundedRect(x, ty, w, h, 1.4, 1.4, 'F');
      pdf.setDrawColor(accent[0], accent[1], accent[2]); pdf.setLineWidth(0.2);
      pdf.roundedRect(x, ty, w, h, 1.4, 1.4, 'S');
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6); setRGB([120, 130, 145]);
      pdf.text(label.toUpperCase(), x + w / 2, ty + 4.2, { align: 'center' as any });
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); setRGB(accent);
      pdf.text(value, x + w / 2, ty + 10, { align: 'center' as any });
    };

    // Title banner
    pdf.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    pdf.roundedRect(14, y, pageW - 28, 16, 2.2, 2.2, 'F');
    pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15);
    pdf.text(t('report_title') as string, pageW / 2, y + 7, { align: 'center' as any });
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
    pdf.text(t('report_subtitle') as string, pageW / 2, y + 12.5, { align: 'center' as any });
    y += 16 + 6;
    setRGB(INK);

    // 1. General information
    panelHeader(t('report_info_section') as string);
    const startStr = startTime ? new Date(startTime).toLocaleDateString() : '';
    const startTimeStr = startTime ? new Date(startTime).toLocaleTimeString() : '';
    const endTimeStr = endTime ? new Date(endTime).toLocaleTimeString() : '';
    const durationSec = startTime && endTime ? Math.floor((endTime.getTime()-startTime.getTime())/1000) : Math.floor(((endTime?.getTime()||Date.now()) - (startTime?.getTime()||Date.now()))/1000);

    pdf.setFontSize(10);
    pdf.text(`• ${t('report_date')} : ${startStr}`, 20, y);
    y += 6;
    pdf.text(`  ${t('report_time_start')} : ${startTimeStr}`, 25, y);
    y += 6;
    pdf.text(`  ${t('report_time_end')} : ${endTimeStr}`, 25, y);
    y += 6;
    pdf.text(`• ${t('report_duration')} : ${Math.floor(durationSec/60)}m ${durationSec%60}s`, 20, y);
    y += 6;
    const auditorLineY = y;
    pdf.text(`• ${t('report_auditor')} : ${auditorName || 'N/A'}`, 20, auditorLineY);
    y += 8;
    const pcLineY = y;
    pdf.text(`• ${t('report_preclear')} : ${pcName || 'N/A'}`, 20, pcLineY);
    y += 7;
    if (breathReactivity) {
      // Pre-session breath test summary — ASCII only (jsPDF helvetica has no glyphs
      // for ·/Δ/→ and they break the layout). One short line in the general-info block.
      const ratingLbl = t(('breath_rating_' + breathReactivity) as any) as string;
      const extra: string[] = [];
      if (typeof breathContactPct === 'number') extra.push(`${ascii(t('contact_word') as string)} ${breathContactPct}%`);
      if (typeof breathBpm === 'number') extra.push(`BPM ${breathBpm}`);
      const tail = extra.length ? ` (${extra.join(' - ')})` : '';
      pdf.text(`• ${t('report_breath_pre') as string} : ${ratingLbl}${tail}`, 20, y);
      y += 7;
    }
    y += 3;

    // Put profile pictures next to each corresponding name line.
    const avatarSizeMm = 7;
    const avatarX = 84;
    try {
      if (auditorPhoto) {
        const circ = await resizeDataUrlCircular(auditorPhoto, 120, 0.9);
        pdf.addImage(circ, 'PNG', avatarX, auditorLineY - 5, avatarSizeMm, avatarSizeMm);
      }
      if (pcPhoto) {
        const circ2 = await resizeDataUrlCircular(pcPhoto, 120, 0.9);
        pdf.addImage(circ2, 'PNG', avatarX, pcLineY - 5, avatarSizeMm, avatarSizeMm);
      }
    } catch (e) {}

    // separator
    y += 4;
    pdf.setLineWidth(0.3);
    pdf.line(15, y, pageW - 15, y);
    y += 8;

    // ── Briefing du Processus (champs complets) ──────────────────────────────
    ensureSpace(50);
    panelHeader(t('report_briefing_section') as string);
    pdf.setFontSize(10);

    const briefingFields: { label: string; value: string | undefined }[] = [
      { label: t('report_objective_session') as string,  value: sessionObjective },
      { label: t('report_objective_process') as string,  value: sessionProcessObjective },
      { label: t('report_physical_check') as string,     value: sessionPhysicalCheck },
      { label: t('report_briefing_pc') as string,        value: sessionBriefing },
    ];

    for (const field of briefingFields) {
      ensureSpace(20);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(60, 80, 120);
      pdf.text(`>${field.label}`, 20, y);
      y += 5;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9.5);
      pdf.setTextColor(20, 20, 20);
      const lines = pdf.splitTextToSize(field.value || '—', pageW - 42);
      for (const line of lines) {
        ensureSpace(6);
        pdf.text(line, 26, y);
        y += 4.8;
      }
      y += 2;
    }

    y += 2;
    pdf.setLineWidth(0.3);
    pdf.setDrawColor(200, 200, 200);
    pdf.line(15, y, pageW - 15, y);
    y += 8;

    // Resume global
    ensureSpace(30);
    panelHeader(t('report_summary_section') as string);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`• ${t('report_mass_treated')} : ${mass.toFixed(2)} SOL-km`, 20, y);
    y += 5.5;
    pdf.text(`• ${t('report_fn_detected')} : ${fnCount}`, 20, y);
    y += 5.5;
    pdf.setFont('helvetica', 'bold');
    pdf.text(`• ${t('report_total_ta')} : ${totalTa.toFixed(2)} ${t('report_total_ta_unit')}`, 20, y);
    pdf.setFont('helvetica', 'normal');
    y += 5.5;
    if (isEpValidated) {
      // ── EP VALIDÉ — boîte dynamique ──
      const LINE = 7;    // interligne normal (mm)
      const SLINE = 5.5; // interligne texte multi-ligne
      const PAD = 5;     // padding haut/bas

      // Pré-calculer les lignes pour dimensionner la boîte
      const realizLines: string[] = epRealization
        ? pdf.splitTextToSize(`"${epRealization}"`, pageW - 48)
        : [];
      const noteLines: string[] = epAuditorNote
        ? pdf.splitTextToSize(`${t('ep_note_label')} : ${epAuditorNote}`, pageW - 48)
        : [];

      let boxH = PAD + LINE; // padding haut + ligne header
      if (epReactionType) boxH += LINE;
      if (epRealization)  boxH += realizLines.length * SLINE + 2;
      if (epAuditorNote)  boxH += noteLines.length  * SLINE + 2;
      boxH += PAD; // padding bas

      ensureSpace(boxH + 6);
      const epBoxY = y;

      // Boîte
      pdf.setFillColor(20, 50, 28);
      pdf.roundedRect(15, epBoxY - 2, pageW - 30, boxH, 3, 3, 'F');
      pdf.setDrawColor(74, 222, 128);
      pdf.setLineWidth(0.5);
      pdf.roundedRect(15, epBoxY - 2, pageW - 30, boxH, 3, 3, 'S');

      // Contenu — position courante
      let ly = epBoxY + PAD;

      // Titre + horodatage + VGI
      const epTimeStr = epTimestamp !== null
        ? ` — ${String(Math.floor((epTimestamp as number) / 60)).padStart(2,'0')}:${String(Math.floor((epTimestamp as number) % 60)).padStart(2,'0')}`
        : '';
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(74, 222, 128);
      pdf.text(`** ${t('ep_validated')}${epTimeStr}${epVvgi ? '  -  VVGI' : epVgi ? '  -  VGI' : ''}`, 20, ly);
      ly += LINE;

      pdf.setFont('helvetica', 'normal');

      // Réaction
      if (epReactionType) {
        pdf.setFontSize(8);
        pdf.setTextColor(150, 230, 160);
        pdf.text(`${t('ep_reaction_label')} : ${epReactionType}`, 20, ly);
        ly += LINE;
      }

      // Réalisation PC
      if (epRealization) {
        pdf.setFontSize(7.5);
        pdf.setTextColor(200, 230, 200);
        pdf.text(realizLines, 20, ly);
        ly += realizLines.length * SLINE + 2;
      }

      // Note auditeur
      if (epAuditorNote) {
        pdf.setFontSize(7);
        pdf.setTextColor(120, 160, 130);
        pdf.text(noteLines, 20, ly);
        ly += noteLines.length * SLINE + 2;
      }

      pdf.setTextColor(40, 40, 40);
      y = epBoxY + boxH + 4;
    }
    // FIX: removed the "Statut EP : Stall" line when EP not validated — user
    // feedback said it added noise without value. The EP VALIDÉ box still
    // appears when isEpValidated is true.

    // ── ZONES AS-IS — charge lifecycle of the contacted masses ──
    // Senza strumenti si salta: nel PDF una sezione a zeri è indistinguibile da un fallimento.
    if (!noInstruments) {
    ensureSpace(38);
    panelHeader(L('ZONE AS-IS', 'ZONES AS-IS', 'AS-IS ZONES', 'ZONAS AS-IS', 'AS-IS ZONER'));
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(100, 100, 100);
    const sessionDurSec = Math.floor(((endTime?.getTime() || Date.now()) - (startTime?.getTime() || Date.now())) / 1000);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${t('report_strat_session_duration')} : ${Math.floor(sessionDurSec / 60)}m ${sessionDurSec % 60}s`, 20, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(40, 40, 40);
    y += 6;
    // Three RIGHT-justified columns for legibility: ZONE | DURÉE | MESURE. Each
    // zone carries only its OWN measure (CONTACT→intensity I_m, DISCHARGE→release
    // velocity v, AS-IS→dissolved %) so the very different magnitudes of I_m and
    // v are never read side-by-side as a ratio — a legend below names each one.
    const colDurR = pageW - 64;  // right edge of the DURÉE column
    const colMetR = pageW - 20;  // right edge of the MESURE column
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.5);
    pdf.setTextColor(150, 150, 150);
    pdf.text('ZONE', 20, y);
    pdf.text('QUANTITÉ', colDurR, y, { align: 'right' as any });
    pdf.text('MESURE', colMetR, y, { align: 'right' as any });
    y += 4.5;
    // QUANTITÉ = mass quantity (Σ qL·dt), not time (user request).
    const asisRows = [
      { label: 'CONTACT',   dur: fmtIm(massChargeQ), metric: `I_m ${peakImVal}`,  color: [251, 94, 59]  as [number, number, number] },
      { label: 'DISSOLUTION', dur: fmtIm(dissChargeQ), metric: `v ${avgRelVelVal}`, color: [16, 185, 129] as [number, number, number] },
      { label: 'AS-IS',     dur: '—',                    metric: `${dissolvedPct}%`,  color: [34, 211, 238] as [number, number, number] },
    ];
    for (const row of asisRows) {
      ensureSpace(7);
      pdf.setFontSize(8.5);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(row.color[0], row.color[1], row.color[2]);
      pdf.text(row.label, 20, y);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(70, 70, 70);
      pdf.text(row.dur, colDurR, y, { align: 'right' as any });
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(row.color[0], row.color[1], row.color[2]);
      pdf.text(row.metric, colMetR, y, { align: 'right' as any });
      y += 5;
    }
    // AS-IS resolution bar (cyan fill over grey track = dissolved share of mass).
    pdf.setDrawColor(215, 215, 215);
    pdf.rect(20, y, pageW - 40, 3.5);
    if (dissolvedPct > 0) { pdf.setFillColor(34, 211, 238); pdf.rect(20, y, Math.max(1, (dissolvedPct / 100) * (pageW - 40)), 3.5, 'F'); }
    y += 7;
    // Legend — I_m and v are DIFFERENT quantities (an intensity vs a speed), not a
    // ratio: intensity contacted → release speed → resulting dissolved share.
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(6.3);
    pdf.setTextColor(120, 120, 120);
    pdf.text('I_m : intensité de la masse contactée   ·   v : vitesse moyenne de libération   ·   AS-IS : part dissoute', 20, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(40, 40, 40);
    y += 7;
    }   // fin ZONES AS-IS (salta senza strumenti)

    // ── AUDITING CYCLES — SÉPARÉS par famille (demande utilisateur) : les deux cycles n'ont ni
    // la même fin ni le même sens, les mélanger rendait le tableau illisible.
    //   • CONTACT → CONTACT / DISSOLUTION / AS-IS
    //   • NULL    → NULL / RISE / EQUILIBRIUM (avec VGI's) ou « no recharging » (null non validé)
    const _chargeCycles = auditingCycles.filter(c => c.kind !== 'null');
    const _nullCycles   = auditingCycles.filter(c => c.kind === 'null');
    if (_chargeCycles.length > 0) {
      ensureSpace(14 + _chargeCycles.length * 5);
      const doneN = _chargeCycles.filter(c => c.completed).length;
      panelHeader(L('CICLI DI AUDITING - CONTACT', 'CYCLES D\'AUDITION - CONTACT', 'AUDITING CYCLES - CONTACT', 'CICLOS DE AUDITACION - CONTACT', 'AUDITINGCYKLER - CONTACT'));
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(120, 120, 120);
      // NB: jsPDF's helvetica has no glyph (and no width entry) for Δ, →, ·, so they
      // both render as garbage AND break the right-align width calc → text overflows
      // off the right edge. Keep this line strictly ASCII / Latin-1.
      const _trendTxt = deltaStarN >= 2 && Math.abs(deltaTrend) > 2 ? `, ${deltaTrend < 0 ? 'v' : '^'}${Math.abs(Math.round(deltaTrend))} ms/s` : '';
      const _lagTxt = deltaStarN > 0 ? `${t('reaction_time') as string} ${deltaStar} ms (${deltaStarN}${_trendTxt}) - ` : '';
      pdf.text(`${_lagTxt}${doneN}/${_chargeCycles.length} AS-IS`, pageW - 15, y, { align: 'right' as any });
      y += 6;
      // Δt* = baseline + adaptive, plus the geometric reconversion (Δt·c) per the RS1 note —
      // a UNIT reconversion of the delay, NOT a measurement. ASCII only (no Δ/·, no thousand
      // separators that can emit U+202F which jsPDF helvetica breaks on).
      if (deltaStarN > 0) {
        pdf.setFontSize(7); pdf.setTextColor(140, 140, 140);
        const _km = Math.round(299.792458 * deltaStar);
        const _adp = `${deltaAdaptive >= 0 ? '+' : ''}${deltaAdaptive}`;
        pdf.text(`dt* = ${ascii(t('report_lag_base') as string)} ${deltaBaseline} ${ascii(t('report_lag_adapt') as string)} ${_adp} ms  -  ${ascii(t('report_lag_dist') as string)} (dt*c) ~ ${_km} km / ${deltaStar * 1000} SOL`, 20, y);
        y += 5; pdf.setTextColor(120, 120, 120);
      }
      for (const c of _chargeCycles) {
        ensureSpace(6);
        const lbl = c.phaseReached === 'asis' ? 'AS-IS' : c.phaseReached === 'discharge' ? 'DISSOLUTION' : c.phaseReached === 'contact' ? 'CONTACT' : '—';
        const col: [number, number, number] = c.completed ? [34, 150, 200] : c.phaseReached === 'discharge' ? [16, 185, 129] : c.phaseReached === 'contact' ? [251, 94, 59] : [120, 120, 120];
        const dur = Math.max(0, Math.round(c.tEndSec - c.tStartSec));
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.5);
        pdf.setTextColor(40, 40, 40);
        const q = pdf.splitTextToSize(c.question || '—', pageW - 110)[0] || '—';
        pdf.text(`${c.n ? `#${c.n} ` : ''}${q}`, 20, y);
        pdf.setFont('helvetica', 'bold');
        // Plus d'AS-IS "a verifier" : on ne garde QUE l'AS-IS confirme (label simple), ce qui
        // evite aussi le chevauchement avec la valeur TA (le long libelle IOx.xx debordait).
        pdf.setTextColor(col[0], col[1], col[2]);
        pdf.text(`${c.completed ? '* ' : ''}${lbl}`, pageW - 48, y, { align: 'right' as any });
        // TA at the AS-IS moment (per the auditor's request) — only for cycles that reached AS-IS.
        if (c.phaseReached === 'asis' && typeof c.taAtAsIs === 'number') {
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(90, 90, 90);
          pdf.text(`TA ${c.taAtAsIs.toFixed(1)}`, pageW - 74, y, { align: 'right' as any });
        }
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(110, 110, 110);
        pdf.text(`${Math.floor(dur / 60)}m ${String(dur % 60).padStart(2, '0')}s`, pageW - 20, y, { align: 'right' as any });
        y += 5;
      }
      // (Resume "AS-IS a verifier" retire : on ne travaille plus qu'avec l'AS-IS confirme.)
      pdf.setTextColor(40, 40, 40);
      y += 4;
    }

    // ── CYCLES NULL — famille SÉPARÉE : NULL -> RISE -> EQUILIBRIUM (valide avec les VGI's).
    // « no recharging » = le mock-up n'a rien fait monter -> le null N'EST PAS valide (c'est le
    // resultat diagnostique le plus precieux : il dit que le null ne vaut rien). ASCII seulement.
    if (_nullCycles.length > 0) {
      ensureSpace(14 + _nullCycles.length * 5);
      const clearN = _nullCycles.filter(c => c.clearRead).length;
      const noRechN = _nullCycles.filter(c => c.noRecharging).length;
      panelHeader(L('CICLI DI AUDITING - NULL', 'CYCLES D\'AUDITION - NULL', 'AUDITING CYCLES - NULL', 'CICLOS DE AUDITACION - NULL', 'AUDITINGCYKLER - NULL'));
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(120, 120, 120);
      const _nr = noRechN > 0 ? ` - ${noRechN} no recharging` : '';
      pdf.text(`${clearN}/${_nullCycles.length} EQUILIBRIUM${_nr}`, pageW - 15, y, { align: 'right' as any });
      y += 6;
      for (const c of _nullCycles) {
        ensureSpace(6);
        const lbl = c.clearRead ? 'EQUILIBRIUM' : c.noRecharging ? 'NO RECHARGING' : 'NULL';
        const col: [number, number, number] = c.clearRead ? [34, 150, 200] : c.noRecharging ? [186, 117, 23] : [120, 120, 120];
        const dur = Math.max(0, Math.round(c.tEndSec - c.tStartSec));
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.5);
        pdf.setTextColor(40, 40, 40);
        const q = pdf.splitTextToSize(c.question || '-', pageW - 110)[0] || '-';
        pdf.text(`${c.n ? `#${c.n} ` : ''}${q}`, 20, y);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(col[0], col[1], col[2]);
        pdf.text(`${c.clearRead ? '* ' : ''}${lbl}`, pageW - 48, y, { align: 'right' as any });
        // VGI's inscrits a la validation du EQUILIBRIUM (demande utilisateur).
        if (c.clearRead) {
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(90, 90, 90);
          pdf.text(c.vgi ? "VGIs" : "no VGIs", pageW - 74, y, { align: 'right' as any });
        }
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(110, 110, 110);
        pdf.text(`${Math.floor(dur / 60)}m ${String(dur % 60).padStart(2, '0')}s`, pageW - 20, y, { align: 'right' as any });
        y += 5;
      }
      pdf.setTextColor(40, 40, 40);
      y += 4;
    }

    // ── CYCLES TONE SCALE — famille A PART (l'echelle des tons de Ron, -40..+40). On imprime ce
    // que la MESURE disait, ce que le preclair a VALIDE, et le desaccord entre les deux : c'est
    // la seule ligne du rapport ou l'instrument et la personne se contredisent en clair.
    // ASCII seulement (jsPDF helvetica) : pas de fleches ni de signes typographiques.
    if (toneCycles.length > 0) {
      ensureSpace(14 + toneCycles.length * 5);
      const asIsN = toneCycles.filter(c => c.asIs).length;
      const passate = toneCycles.reduce((a, c) => a + (c.repeats || 0), 0);
      panelHeader(L('CICLI DI AUDITING - TONE SCALE', 'CYCLES D\'AUDITION - TONE SCALE', 'AUDITING CYCLES - TONE SCALE', 'CICLOS DE AUDITACION - TONE SCALE', 'AUDITINGCYKLER - TONE SCALE'));
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(120, 120, 120);
      pdf.text(`${asIsN}/${toneCycles.length} ${L('AL TONO 40', 'AU TON 40', 'AT TONE 40', 'AL TONO 40', 'VID TON 40')}`, pageW - 15, y, { align: 'right' as any });
      y += 6;
      const sgn = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}`;
      for (const c of toneCycles) {
        ensureSpace(6);
        const dur = Math.max(0, Math.round(c.tEndSec - c.tStartSec));

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.5);
        pdf.setTextColor(40, 40, 40);
        const q = pdf.splitTextToSize(c.question || '-', pageW - 135)[0] || '-';
        pdf.text(`#${c.n} ${q}`, 20, y);
        pdf.setTextColor(90, 90, 90);
        const misura = c.located !== null ? sgn(c.located) : '?';
        pdf.text(`${misura} -> +40${c.repeats > 0 ? `  x${c.repeats}` : ''}`, pageW - 62, y, { align: 'right' as any });
        pdf.setFont('helvetica', 'bold');
        if (c.asIs) { pdf.setTextColor(16, 150, 110); pdf.text('* TON 40', pageW - 34, y, { align: 'right' as any }); }
        else { pdf.setTextColor(120, 120, 120); pdf.text('-', pageW - 34, y, { align: 'right' as any }); }
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(110, 110, 110);
        pdf.text(`${Math.floor(dur / 60)}m ${String(dur % 60).padStart(2, '0')}s`, pageW - 20, y, { align: 'right' as any });
        y += 5;
      }
      if (passate > 0) {
        ensureSpace(6);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8.5);
        pdf.setTextColor(110, 110, 110);
        pdf.text(`${L('Comandi dati', 'Commandes donnees', 'Commands given', 'Comandos dados', 'Givna kommandon')} : ${passate}`, 20, y);
        y += 5;
      }
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(130, 130, 130);
      pdf.text(L('TONE SCALE (Ron) : "Locate resistance on your case that can now be run." / "Raise this to tone forty on the tone scale." - ridato finche non reagisce piu',
                 'TONE SCALE (Ron) : "Locate resistance on your case that can now be run." / "Raise this to tone forty on the tone scale." - redonne jusqu\'a ce qu\'il ne reagisse plus',
                 'TONE SCALE (Ron): "Locate resistance on your case that can now be run." / "Raise this to tone forty on the tone scale." - repeated until there is no reaction',
                 'TONE SCALE (Ron) : "Locate resistance on your case that can now be run." / "Raise this to tone forty on the tone scale." - repetido hasta que no reaccione mas',
                 'TONE SCALE (Ron): "Locate resistance on your case that can now be run." / "Raise this to tone forty on the tone scale." - upprepas tills ingen reaktion'), 20, y);
      y += 4;
      pdf.setTextColor(40, 40, 40);
      y += 4;
    }

    // ── CYCLES MIRROR — famille A PART (Ron « double the instant charge to erase it ») : READ =
    // charge instantanee (1-10), x2 = cible (le double, 2-20), smaltito = decharge, F/N = efface
    // au double. Echelle proportionnelle (pas de mS). ASCII seulement (jsPDF helvetica).
    if (mirrorCycles.length > 0) {
      ensureSpace(14 + mirrorCycles.length * 5);
      const fnN = mirrorCycles.filter(c => c.erased).length;
      panelHeader(L('CICLI DI AUDITING - MIRROR', 'CYCLES D\'AUDITION - MIRROR', 'AUDITING CYCLES - MIRROR', 'CICLOS DE AUDITACION - MIRROR', 'AUDITINGCYKLER - MIRROR'));
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(120, 120, 120);
      pdf.text(`${fnN}/${mirrorCycles.length} F/N (${L('cancellato al doppio', 'efface au double', 'erased at the double', 'borrado al doble', 'raderad vid dubbeln')})`, pageW - 15, y, { align: 'right' as any });
      y += 6;
      for (const c of mirrorCycles) {
        ensureSpace(6);
        const dur = Math.max(0, Math.round(c.tEndSec - c.tStartSec));
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.5);
        pdf.setTextColor(40, 40, 40);
        const q = pdf.splitTextToSize(c.question || '-', pageW - 125)[0] || '-';
        pdf.text(`#${c.n} ${q}`, 20, y);
        // READ / x2 : la lecture (pic rencontre) et le total present (le double)
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(90, 90, 90);
        pdf.text(`READ ${c.readInst.toFixed(1)} / x2 ${c.readDouble.toFixed(1)}`, pageW - 66, y, { align: 'right' as any });
        // issue : F/N (aiguille revenue a float) ou non flotte
        pdf.setFont('helvetica', 'bold');
        if (c.erased) { pdf.setTextColor(16, 150, 110); pdf.text('* F/N', pageW - 40, y, { align: 'right' as any }); }
        else { pdf.setTextColor(120, 120, 120); pdf.text('no F/N', pageW - 40, y, { align: 'right' as any }); }
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(110, 110, 110);
        pdf.text(`${Math.floor(dur / 60)}m ${String(dur % 60).padStart(2, '0')}s`, pageW - 20, y, { align: 'right' as any });
        y += 5;
      }
      // TOTAL DE SEANCE (point d) : somme des valeurs effectives et son double.
      { ensureSpace(6);
        const sumV = mirrorCycles.reduce((s, c) => s + c.readInst, 0);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8.5);
        pdf.setTextColor(16, 150, 110);
        pdf.text(`${L('Totale seduta : somma', 'Total seance : somme', 'Session total : sum', 'Total sesion : suma', 'Sessionstotal : summa')} ${sumV.toFixed(1)}  ->  ${L('doppio', 'double', 'double', 'doble', 'dubbel')} ${(2 * sumV).toFixed(1)}`, 20, y);
        y += 5;
      }
      pdf.setTextColor(40, 40, 40);
      y += 4;
    }

    // ── ASSESSMENT — l'auditeur a donné des items à voix haute ; le READ instantané (calcul R&I)
    // est inscrit par item. Un panneau par cycle d'assessment. ASCII seulement (jsPDF helvetica). ──
    if (assessCycles.some(c => c.items.length > 0)) {
      const shortRead = (r: string): string =>
        r === 'LF Blow Down' ? 'LF BD' : r === 'Long Fall' ? 'LONG FALL' : r === 'Fall' ? 'FALL' :
        r === 'SF' ? 'SF' : r === 'Dirty Needle' ? 'DN' : r === 'F/N (Floating)' ? 'F/N' :
        r === 'Tick' ? 'tick' : (r === 'NULL' || r === '—' || !r) ? 'NULL' : r;   // no read → NULL (ASCII)
      const readColor = (r: string): [number, number, number] =>
        r === 'F/N (Floating)' ? [16, 150, 110] :
        (r === 'Fall' || r === 'Long Fall' || r === 'LF Blow Down' || r === 'SF') ? [200, 90, 40] : [120, 120, 120];
      for (const cyc of assessCycles) {
        if (cyc.items.length === 0) continue;
        ensureSpace(14 + cyc.items.length * 5);
        panelHeader(`ASSESSMENT #${cyc.n}`);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(120, 120, 120);
        const dur = Math.max(0, Math.round(cyc.tEndSec - cyc.tStartSec));
        pdf.text(`${cyc.items.length} ${L('item', 'items', 'items', 'items', 'items')} - ${Math.floor(dur / 60)}m ${String(dur % 60).padStart(2, '0')}s`, pageW - 15, y, { align: 'right' as any });
        y += 6;
        for (const it of cyc.items) {
          ensureSpace(6);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8.5);
          pdf.setTextColor(40, 40, 40);
          const q = pdf.splitTextToSize(ascii(it.item) || '-', pageW - 70)[0] || '-';
          pdf.text(q, 20, y);
          const sr = shortRead(it.reaction);
          const strong = sr === 'LF BD' || sr === 'LONG FALL' || sr === 'FALL' || sr === 'SF';
          const col = readColor(it.reaction);
          // combien de ms AVANT (signe -) que le read est survenu par rapport a l'item
          if (sr !== 'NULL' && it.beforeMs) {
            pdf.setFont('helvetica', 'normal'); pdf.setTextColor(120, 120, 120);
            pdf.text(`-${it.beforeMs}ms`, pageW - 40, y, { align: 'right' as any });
          }
          pdf.setFont('helvetica', strong ? 'bold' : 'normal');
          pdf.setTextColor(col[0], col[1], col[2]);
          pdf.text(sr, pageW - 20, y, { align: 'right' as any });
          y += 5;
        }
        pdf.setTextColor(40, 40, 40);
        y += 4;
      }
    }

    // Graphique QL — salta senza strumenti (vedi ZONES AS-IS).
    if (!noInstruments) {
    ensureSpace(70);
    y += 2;
    panelHeader(t('report_ql_chart') as string);
    const graphX = 18;
    const graphY = y;
    const graphW = pageW - 36;
    const graphH = 34;
    const maxTime = history.length > 0 ? (history[history.length - 1]?.time || 0) : 0;
    pdf.setFillColor(248, 250, 252);
    pdf.rect(graphX, graphY, graphW, graphH, 'F');
    pdf.setDrawColor(205, 214, 223);
    pdf.rect(graphX, graphY, graphW, graphH);
    pdf.setDrawColor(226, 232, 240);
    for (let gy = 1; gy <= 3; gy++) {
      const yy = graphY + (graphH * gy) / 4;
      pdf.line(graphX, yy, graphX + graphW, yy);
    }
    // x-axis ticks (seconds)
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    const tickCount = 5;
    for (let i = 0; i <= tickCount; i++) {
      const tx = graphX + (graphW * i) / tickCount;
      const sec = Math.round((maxTime * i) / tickCount);
      pdf.setDrawColor(210, 218, 226);
      pdf.line(tx, graphY, tx, graphY + graphH);
      pdf.setTextColor(100, 116, 139);
      pdf.text(`${sec}s`, tx - 3, graphY + graphH + 4);
    }
    pdf.setDrawColor(234, 179, 8);
    const thresholdY = graphY + graphH * (1 - 0.7);
    pdf.line(graphX, thresholdY, graphX + graphW, thresholdY);
    pdf.setTextColor(202, 138, 4);
    pdf.text('F/N 0.7', graphX + graphW - 18, thresholdY - 1);
    if (history.length > 1) {
      pdf.setDrawColor(34, 197, 94);
      for (let i = 1; i < history.length; i++) {
        const prev = Math.max(0, Math.min(1, history[i - 1]?.qL ?? 0));
        const curr = Math.max(0, Math.min(1, history[i]?.qL ?? 0));
        const x1 = graphX + ((i - 1) / (history.length - 1)) * graphW;
        const x2 = graphX + (i / (history.length - 1)) * graphW;
        const y1 = graphY + (1 - prev) * graphH;
        const y2 = graphY + (1 - curr) * graphH;
        pdf.line(x1, y1, x2, y2);
      }
    }
    y += graphH + 9;
    }   // fin graphique QL (salta senza strumenti)

    // (The old "As-is / T-Zones timeline" strip + 4-zone legend were removed from
    //  the PDF — superseded by the ZONES AS-IS section above, per user request.)

    y += 1;
    pdf.setLineWidth(0.3);
    pdf.setDrawColor(200, 200, 200);
    pdf.line(15, y, pageW - 15, y);
    y += 8;

    // Session active
    ensureSpace(18);
    panelHeader(t('report_session_active') as string);
    pdf.setFont('helvetica', 'normal');
    pdf.text(t('report_transcript_intro') as string, 20, y);
    y += 8;

    pdf.setFont('courier', 'normal');
    pdf.setFontSize(6.6);
    const tsX = 16;
    const bodyX = 34;
    const lineH = 3.5;
    const maxCharsPerBodyLine = 82;
    for (let i = 0; i < transcriptWithCharge.length; i++) {
      const entry = transcriptWithCharge[i];
      const rawTimeLabel = entry.time !== undefined ? `[${entry.time.toFixed(1)}s]` : '[--]';

      // ── NEEDLE entries: compact single-line, amber, no charge/eta/reaction ──
      if (entry.speaker === 'NEEDLE') {
        if (y > pageH - 16) { pdf.addPage(); y = 12; }
        pdf.setTextColor(180, 120, 20);
        pdf.text(rawTimeLabel, tsX, y);
        pdf.setTextColor(200, 140, 40);
        pdf.text(String(entry.text || ''), bodyX, y);
        pdf.setTextColor(20, 20, 20);
        y += lineH + 0.8;
        continue;
      }

      const toneStr = entry.tone ? ` | ${t('report_tone_label')}: ${t(`tone_${entry.tone.label}` as any)}` : '';
      const line = `${entry.speaker || ''}: ${String(entry.text || '').replace(/\s+/g, ' ').trim()} | eta: ${entry.eta}`;
      const split = wrapByChars(line, maxCharsPerBodyLine);
      // FIX CONN-49: colour-code + weight the transcript by speaker so the
      // reader instantly tells who said what. Auditor = bold blue, PC = normal
      // orange/brown. Anything else keeps the default near-black normal.
      const isAud = entry.speaker === 'Aud';
      const isPc  = entry.speaker === 'PC';
      const bodyColor: [number, number, number] = isAud ? [21, 94, 160] : isPc ? [168, 88, 20] : [20, 20, 20];
      const bodyWeight = isAud ? 'bold' : 'normal';
      for (let j = 0; j < split.length; j++) {
        if (y > pageH - 16) { pdf.addPage(); y = 12; }
        if (j === 0) {
          pdf.setTextColor(14, 116, 144);
          pdf.text(rawTimeLabel, tsX, y);
        }
        pdf.setFont('courier', bodyWeight);
        pdf.setTextColor(bodyColor[0], bodyColor[1], bodyColor[2]);
        pdf.text(split[j], bodyX, y);
        y += lineH;
      }
      pdf.setFont('courier', 'normal');
      pdf.setTextColor(20, 20, 20);
      if (entry.tone) {
        if (y > pageH - 16) { pdf.addPage(); y = 12; }
        const toneColors: Record<string, [number,number,number]> = {
          calm:     [59, 130, 246],
          neutral:  [100, 116, 139],
          tense:    [217, 119, 6],
          stressed: [220, 38, 38],
        };
        const [r, g, b] = toneColors[entry.tone.label] ?? [100, 116, 139];
        pdf.setTextColor(r, g, b);
        pdf.text(`  -${toneStr.trim()}`, bodyX, y);
        y += lineH;
        pdf.setTextColor(20, 20, 20);
      }
      const reactionText = `${t('ep_reaction_label')}: ${entry.reaction}`;
      const reactionLines = wrapByChars(reactionText, maxCharsPerBodyLine - 4);
      for (const rLine of reactionLines) {
        if (y > pageH - 16) { pdf.addPage(); y = 12; }
        pdf.setTextColor(168, 85, 247);
        pdf.text(rLine, bodyX, y);
        y += lineH;
      }
      y += 0.8;
    }
    pdf.setFont('helvetica', 'normal');

    // Total TA (l'ancienne section R&I a été retirée — demande utilisateur ; les items sont dans
    // la section ASSESSMENT).
    if (y > pageH - 30) { pdf.addPage(); y = 12; }
    y += 4;
    panelHeader('TOTAL TA');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(40, 40, 40);
    pdf.text(`${t('report_total_ta_session')} : ${totalTa.toFixed(2)} ${t('report_total_ta_unit')}`, 20, y);
    pdf.setFont('helvetica', 'normal');
    y += 8;

    // ── Modulation Neuro-Acoustique ──────────────────────────────────────────
    if (mnaData && (mnaData.cycles > 0 || mnaData.imHistory.length > 0)) {
      if (y > pageH - 30) { pdf.addPage(); y = 12; }
      y += 4;
      pdf.setLineWidth(0.3);
      pdf.setDrawColor(200, 200, 200);
      pdf.line(15, y, pageW - 15, y);
      y += 8;

      ensureSpace(40);
      panelHeader(t('mna_report_title') as string, [86, 207, 225]);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(40, 40, 40);

      // I_m médio removed (user request) — keep only peak I_m. 4 metric TILES (like screen).
      const mnaMetrics: Array<[string, string, [number, number, number]]> = [
        [t('mna_report_cycles')   as string, String(mnaData.cycles),       [86, 207, 225]],
        [t('mna_report_peak_im')  as string, fmtIm(mnaData.peakIm),        [232, 193, 112]],
        [t('mna_report_zone')     as string, mnaData.finalZone || '—',     [255, 155, 61]],
        [t('mna_report_copies')   as string, String(mnaData.totalCopies),  [167, 139, 250]],
      ];
      ensureSpace(16);
      {
        const gap = 3, x0 = 18, tw = (pageW - 36 - gap * 3) / 4;
        mnaMetrics.forEach(([label, value, accent], i) => metricTile(x0 + i * (tw + gap), y, tw, label, value, accent));
        y += 16;
      }

      // Phase log — a colored progress bar (segments ∝ duration) with the value
      // written in each segment, plus a swatch legend. Much clearer than the old
      // text list per user request.
      if (mnaData.phaseLog.length > 1) {
        y += 2;
        const phaseRgb: Record<string, [number, number, number]> = {
          CAPTURE: [86, 207, 225], SONIFY: [232, 193, 112], CLEAN: [255, 155, 61], HARMONICS: [167, 139, 250],
        };
        const log = mnaData.phaseLog;
        // duration of each phase = gap to the next entry (last/open phase = 0).
        const durSec = log.map((e, i) => (log[i + 1] ? Math.max(0, (log[i + 1].t - e.t) / 1000) : 0));
        // Split into per-cycle runs (each cycle begins at a CAPTURE) → ONE bar per cycle
        // instead of a single strip concatenating all cycles.
        const cyc: Array<Array<{ phase: string; dur: number }>> = [];
        log.forEach((e, i) => {
          if (e.phase === 'CAPTURE' || cyc.length === 0) cyc.push([]);
          cyc[cyc.length - 1].push({ phase: e.phase, dur: durSec[i] });
        });
        ensureSpace(8 + cyc.length * 8 + 8);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(60, 80, 120);
        pdf.text(`>${t('report_mna_phases_log')} :`, 20, y);
        y += 5;
        const labelW = 8, barX = 22 + labelW, barW = pageW - 44 - labelW, barH = 5.5;
        for (let ci = 0; ci < cyc.length; ci++) {
          const segs = cyc[ci];
          const total = segs.reduce((a, b) => a + b.dur, 0) || 1;
          pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); pdf.setTextColor(86, 150, 180);
          pdf.text(`#${ci + 1}`, 22, y + barH / 2 + 1.2);
          pdf.setFillColor(235, 235, 235); pdf.rect(barX, y, barW, barH, 'F');
          let cx = barX;
          for (const seg of segs) {
            if (seg.dur <= 0) continue;
            const segW = (seg.dur / total) * barW;
            const c = phaseRgb[seg.phase] || [71, 85, 105];
            pdf.setFillColor(c[0], c[1], c[2]); pdf.rect(cx, y, segW, barH, 'F');
            if (segW > 12) {
              pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(5.5);
              pdf.text(`${Math.round(seg.dur)}s`, cx + segW / 2, y + barH / 2 + 1.3, { align: 'center' as any });
            }
            cx += segW;
          }
          pdf.setDrawColor(205, 205, 205); pdf.rect(barX, y, barW, barH);
          y += barH + 2.5;
        }
        // Compact one-line legend (phase colours).
        pdf.setFontSize(6.8);
        let lx = barX;
        for (const ph of Object.keys(phaseRgb)) {
          const c = phaseRgb[ph];
          pdf.setFont('helvetica', 'bold');
          const itemW = 3.5 + pdf.getTextWidth(ph) + 6;
          if (lx + itemW > pageW - 20) { lx = barX; y += 4.5; }
          pdf.setFillColor(c[0], c[1], c[2]);
          pdf.rect(lx, y - 2, 2.4, 2.4, 'F');
          pdf.setTextColor(60, 60, 60);
          pdf.text(ph, lx + 3.5, y);
          lx += itemW;
        }
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(40, 40, 40);
        y += 4;
      }
      y += 4;
    }

    // final
    if (y > pageH - 30) { pdf.addPage(); y = 12; }
    y += 6;
    panelHeader(t('report_next_cs') as string);
    pdf.setFont('helvetica', 'normal');
    {
      const rawNextCs = nextCs || '-';
      const charsPerLine = Math.floor((pageW - 35) / 2.1); // ~2.1mm per char at fontSize 10
      const wordsNcs = rawNextCs.split(' ');
      const ncsLines: string[] = [];
      let curLine = '';
      for (const w of wordsNcs) {
        const test = curLine ? curLine + ' ' + w : w;
        if (test.length > charsPerLine && curLine) { ncsLines.push(curLine); curLine = w; }
        else curLine = test;
      }
      if (curLine) ncsLines.push(curLine);
      ncsLines.forEach((line: string) => { pdf.text(line, 20, y); y += 5; });
    }

    // ── LO STORICO NON STA NEL RAPPORTO DI UNA SEDUTA ──────────────────────────────────────
    // C'era: l'elenco delle sedute dell'auditor e il totale d'archivio, in coda al PDF. Ma un
    // rapporto di seduta descrive UNA seduta — il conto di tutte le altre appartiene allo
    // STORICO, dove si guarda il riepilogo di tutte insieme (richiesta utente). Nel PDF era
    // anche destinato a invecchiare male: stampato una volta, il numero resta quello.

    return pdf.output('datauristring');
  };


  return (
    <div className="absolute inset-0 z-50 bg-[#1b1b1f]/95 backdrop-blur-xl flex flex-col p-6 overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-2xl font-mono text-white tracking-widest">{t('report_title')}</h2>
          <p className="text-sm text-slate-400 font-mono mt-1">{t('report_subtitle')}</p>
          {/* ── L'ETICHETTA, IN CIMA ────────────────────────────────────────────────────────
              Chi rilegge il rapporto sei mesi dopo deve sapere SUBITO che qui non c'era ago:
              altrimenti « nessuna reazione » si legge come « il preclear era pulito » invece
              di « non c'era nulla che misurasse ». È la sola cosa che rende utile una seduta
              senza strumenti, quindi non sta in fondo fra i dettagli. */}
          {noInstruments && (
            <p className="text-xs font-mono mt-2 inline-block px-2 py-1 rounded"
               style={{ color: '#fbbf24', background: 'rgba(251,191,36,0.14)',
                        border: '1px solid rgba(251,191,36,0.45)', letterSpacing: '0.06em' }}>
              {t('report_no_instruments')}
            </p>
          )}
        </div>
        <div className="flex gap-4">
          <button 
            onClick={handleExportPDF}
            disabled={isExporting}
            className="px-4 py-2 bg-cyan-900/30 border border-cyan-800 text-cyan-400 hover:bg-cyan-900/50 hover:text-cyan-300 font-mono text-sm transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <Download size={16} />
            {isExporting ? t('exporting') : t('export_pdf')}
          </button>
          <button 
            onClick={onClose}
            className="px-4 py-2 border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white font-mono text-sm transition-colors"
          >
            {t('close')}
          </button>
          <button
            onClick={onOpenHistory}
            className="px-4 py-2 border border-cyan-700 text-cyan-300 hover:bg-cyan-900/30 hover:text-cyan-200 font-mono text-sm transition-colors flex items-center gap-2"
          >
            {t('history')}
            {historyCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[11px] font-bold tabular-nums"
                style={{
                  background: 'rgba(255,255,255,0.20)',
                  border: '1px solid rgba(255,255,255,0.50)',
                  color: 'rgba(240,246,255,0.95)',
                  textShadow: '0 0 6px rgba(255,255,255,0.6)',
                }}>
                {historyCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div 
        ref={reportRef} 
        className={cn(
          "pr-4 grid grid-cols-3 gap-6 bg-[#1b1b1f] p-2 rounded-lg",
          isExporting ? "h-auto overflow-visible" : "flex-1 overflow-y-auto custom-scrollbar"
        )}
      >
        {/* EP Validation Detail */}
        <div className="col-span-3 mt-2 p-4 rounded-xl border border-green-500/30" style={{background:"rgba(6,20,10,0.4)"}}>
          <h3 className="text-xs font-mono text-green-400 tracking-widest uppercase mb-3">EP Validation Detail</h3>
          <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
            <div><span className="text-white/40">Status:</span> <span className={epValidated ? "text-green-400 font-bold" : "text-red-400"}>{epValidated ? "VALIDATED" : "NOT VALIDATED"}</span></div>
            <div><span className="text-white/40">Total SOL Distance:</span> <span className="text-cyan-300">{mass.toFixed(2)} SOL-Km</span></div>
            {epCognitionText && <div className="col-span-2"><span className="text-white/40">PC Cognition:</span> <span className="text-white/80 italic">"{epCognitionText}"</span></div>}
            {epAuditorNote && <div className="col-span-2"><span className="text-white/40">Auditor Note:</span> <span className="text-white/80">"{epAuditorNote}"</span></div>}
          </div>
        </div>
        <div className="col-span-3 glass-panel p-3">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-mono text-slate-300 block">Next C/S</label>
            <div className="flex items-center gap-2">
              {nextCsSaved && <span className="text-[10px] font-mono text-emerald-400">Sauvegardé</span>}
              <button
                onClick={handleSaveNextCs}
                className="px-2 py-1 text-[10px] font-mono rounded border border-emerald-600/60 text-emerald-300 hover:bg-emerald-900/30 transition-colors"
              >
                Sauvegarder
              </button>
            </div>
          </div>
          <textarea
            value={nextCs}
            onChange={(e) => setNextCs(e.target.value)}
            placeholder={L('Campo compilato dall\'auditor…', "Champ rempli par l'auditeur…", 'Filled in by the auditor…', 'Campo rellenado por el auditor…', 'Fylls i av auditören…')}
            className="w-full min-h-20 bg-slate-900/50 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 font-mono outline-none focus:border-cyan-500"
          />
        </div>

        <div className="col-span-3 glass-panel p-4">
          <h3 className="text-sm font-mono text-slate-300 uppercase tracking-widest mb-4">{t('report_briefing_section')}</h3>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-xs font-mono">
            {/* Col 1 */}
            <div className="flex flex-col gap-3">
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{t('report_info_section')}</div>
                <div className="text-slate-200">{t('report_date')}: {dateStr}</div>
                <div className="text-slate-200">{t('report_time_start')}: {startTimeStr} — {t('report_time_end')}: {endTimeStr}</div>
                <div className="text-slate-200">{t('report_duration')}: {durationStr}</div>
                <div className="mt-1.5 flex items-center gap-2">
                  {auditorPhoto ? <img src={auditorPhoto} alt="Auditor" className="w-6 h-6 rounded-full object-cover border border-cyan-700" /> : <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700" />}
                  <span className="text-cyan-300">{t('report_auditor')}: {auditorName || 'N/A'}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  {pcPhoto ? <img src={pcPhoto} alt="PC" className="w-6 h-6 rounded-full object-cover border border-green-700" /> : <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700" />}
                  <span className="text-green-300">{t('report_preclear')}: {pcName || 'N/A'}</span>
                </div>
                {breathReactivity && (() => {
                  // Pre-session breath test summary (RSA: HR/EEG response to guided
                  // breathing). The headline number is the reactivity rating.
                  const col: Record<string, string> = { good: '#34d399', ok: '#fbbf24', poor: '#fb5e3b', na: '#94a3b8' };
                  const lbl = t(('breath_rating_' + breathReactivity) as any) as string;
                  const parts: string[] = [];
                  if (typeof breathContactPct === 'number') parts.push(`${t('contact_word') as string} ${breathContactPct}%`);
                  if (typeof breathBpm === 'number') parts.push(`BPM ${breathBpm}`);
                  return (
                    <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                      <span className="text-slate-400">{t('report_breath_pre') as string}:</span>
                      <span style={{ color: col[breathReactivity], fontWeight: 700 }}>{lbl}</span>
                      {parts.length > 0 && <span className="text-slate-500">({parts.join(' · ')})</span>}
                    </div>
                  );
                })()}
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{t('report_objective_session')}</div>
                <div className="text-slate-200 bg-slate-900/40 rounded p-2 border border-slate-800 min-h-[36px]">{sessionObjective || <span className="text-slate-600 italic">—</span>}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{t('report_objective_process')}</div>
                <div className="text-slate-200 bg-slate-900/40 rounded p-2 border border-slate-800 min-h-[36px]">{sessionProcessObjective || <span className="text-slate-600 italic">—</span>}</div>
              </div>
            </div>
            {/* Col 2 */}
            <div className="flex flex-col gap-3">
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{t('report_physical_check')}</div>
                <div className="text-slate-200 bg-slate-900/40 rounded p-2 border border-slate-800 min-h-[36px]">{sessionPhysicalCheck || <span className="text-slate-600 italic">—</span>}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{t('report_briefing_pc')}</div>
                <div className="text-slate-200 bg-slate-900/40 rounded p-2 border border-slate-800 min-h-[36px]">{sessionBriefing || <span className="text-slate-600 italic">—</span>}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Next C/S</div>
                <div className="text-slate-200 bg-slate-900/40 rounded p-2 border border-slate-800 min-h-[36px]">{nextCs || <span className="text-slate-600 italic">—</span>}</div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Left Column: Stats & T-Zones */}
        <div className="col-span-1 flex flex-col gap-6">
          {/* Summary Stats */}
          <div className="glass-panel p-4 flex flex-col gap-4">
            <h3 className="text-sm font-mono text-slate-400 uppercase tracking-widest">{t('global_summary')}</h3>
            
            <div className="grid grid-cols-2 gap-2 mb-2 border-b border-slate-800/50 pb-3">
              <div>
                <div className="text-[10px] text-slate-500 uppercase">{t('date')}</div>
                <div className="text-sm font-mono text-white">{dateStr}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase">{t('effective_duration')}</div>
                <div className="text-sm font-mono font-bold text-white">{durationStr}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase">{t('start')}</div>
                <div className="text-sm font-mono text-slate-300">{startTimeStr}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase">{t('end')}</div>
                <div className="text-sm font-mono text-slate-300">{endTimeStr}</div>
              </div>
              <div className="col-span-2 mt-1 flex items-center gap-3">
                {auditorPhoto ? (
                  <img src={auditorPhoto} alt="Auditor" className="w-8 h-8 rounded-full object-cover border border-cyan-800" />
                ) : (
                  <div className="w-8 h-8 rounded-full border border-slate-700 bg-slate-800" />
                )}
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">
                    Auditor {isSoloSession && <span className="text-yellow-500 ml-1">{t('solo_session')}</span>}
                  </div>
                  <div className="text-sm font-mono text-cyan-400">{auditorName || 'N/A'}</div>
                </div>
              </div>
              {!isSoloSession && (
                <div className="col-span-2 flex items-center gap-3">
                  {pcPhoto ? (
                    <img src={pcPhoto} alt="PC" className="w-8 h-8 rounded-full object-cover border border-green-800" />
                  ) : (
                    <div className="w-8 h-8 rounded-full border border-slate-700 bg-slate-800" />
                  )}
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase">PC</div>
                    <div className="text-sm font-mono text-green-400">{pcName || 'N/A'}</div>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] text-slate-500 uppercase">{t('processed_mass')}</div>
                <div className="text-xl font-mono text-cyan-400">{mass.toFixed(2)} <span className="text-xs">SOL-km</span></div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase">{t('fns_detected')}</div>
                <div className="text-xl font-mono text-green-400">{fnCount}</div>
              </div>
              <div className="col-span-2 mt-1 pt-1 border-t border-slate-800/30">
                <div className="text-[10px] text-slate-500 uppercase">Total TA</div>
                <div className="text-xl font-mono font-bold text-amber-400">
                  {totalTa.toFixed(2)} <span className="text-sm font-normal opacity-70">{t('divisions') as string}</span>
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase">ASSESSMENT</div>
                <div className="text-xl font-mono text-purple-400">{assessCycles.reduce((s, c) => s + c.items.length, 0)}</div>
              </div>
              <div className="col-span-2 mt-2 pt-2 border-t border-slate-800/50">
                <div className="text-[10px] text-slate-500 uppercase mb-1">{t('ep_status')}</div>
                {isEpValidated ? (
                  <div className="flex flex-col gap-1 rounded-lg p-3"
                    style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.30)' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-mono font-bold text-emerald-400">✦ {t('ep_validated')}</span>
                      {epTimestamp !== null && (
                        <span className="text-[10px] font-mono text-emerald-600">
                          {String(Math.floor((epTimestamp as number) / 60)).padStart(2,'0')}:{String(Math.floor((epTimestamp as number) % 60)).padStart(2,'0')}
                        </span>
                      )}
                      {(epVgi || epVvgi) && <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(74,222,128,0.20)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.40)' }}>{epVvgi ? 'VVGI' : 'VGI'}</span>}
                    </div>
                    {epReactionType && <div className="text-[11px] font-mono text-emerald-300/80">{t('ep_reaction_label')} : <span className="text-emerald-300 font-bold">{epReactionType}</span></div>}
                    {epRealization && <div className="text-[11px] font-mono italic text-white/70">"{epRealization}"</div>}
                    {epAuditorNote && <div className="text-[10px] font-mono text-slate-500">{t('ep_note_label')} : {epAuditorNote}</div>}
                  </div>
                ) : (
                  <div className="text-lg font-mono text-slate-400">{t('stall')}</div>
                )}
              </div>
            </div>
          </div>

          {/* Mass contacted vs dissolved — coherent (presence vs release),
              cumulative time. Replaces the old 4-zone T-zone distribution which
              showed dissolution > mass (impossible). */}
          {/* ── SENZA STRUMENTI QUESTE DUE SEZIONI NON HANNO SORGENTE ────────────────────
              ZONE AS-IS misura il ciclo di vita della carica contattata (Σ qL·dt), e Lock
              Quality è il grafico del qL: senza ago non esiste né l'una né l'altro. Mostrarle
              vuote fa credere che la seduta sia andata male, invece che non misurata — che è
              l'errore opposto a quello per cui le sedute senza strumenti si fanno. */}
          {!noInstruments && (
          <div className="glass-panel p-4 flex flex-col gap-4">
            <h3 className="text-sm font-mono text-slate-400 uppercase tracking-widest">ZONES AS-IS</h3>
            {massTime <= 0 ? (
              <div className="text-xs text-slate-500 italic">Aucune donnée enregistrée</div>
            ) : (
              <div className="flex flex-col gap-3">
                {/* CONTACT — charge contacted: time + peak I_m (mass intensity) */}
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-mono" style={{ color: '#fb5e3b' }}>
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#fb5e3b' }} />CONTACT
                  </span>
                  <span className="font-mono tabular-nums" style={{ color: '#fb5e3b' }}>
                    <span className="text-lg font-black">{fmtIm(massChargeQ)}</span>
                    <span className="text-[10px] ml-2 opacity-80">I_m {peakImVal}</span>
                  </span>
                </div>
                {/* DISCHARGE — releasing: time + average release velocity */}
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-mono" style={{ color: '#10b981' }}>
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#10b981' }} />DISCHARGE
                  </span>
                  <span className="font-mono tabular-nums" style={{ color: '#10b981' }}>
                    <span className="text-lg font-black">{fmtIm(dissChargeQ)}</span>
                    <span className="text-[10px] ml-2 opacity-80">v̄ {avgRelVelVal}</span>
                  </span>
                </div>
                {/* AS-IS — % of the contacted mass dissolved */}
                <div className="w-full" style={{ height: 8, borderRadius: 4, overflow: 'hidden', background: 'rgba(251,94,59,0.25)' }}>
                  <div style={{ width: `${dissolvedPct}%`, height: '100%', background: '#7df9ff' }} />
                </div>
                <div className="flex items-center justify-between text-xs font-mono" style={{ color: '#7df9ff' }}>
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#7df9ff' }} />AS-IS
                  </span>
                  <span>{dissolvedPct}% dissoute</span>
                </div>
                <div className="text-[9px] text-slate-600 font-mono mt-1 border-t border-slate-800/40 pt-1">
                  Durée totale analysée : {durationStr}
                </div>
              </div>
            )}
          </div>
          )}

          {/* AUDITING CYCLES — SÉPARÉS par famille (demande utilisateur) : CONTACT (→ AS-IS) et
              NULL (→ EQUILIBRIUM) n'ont ni la même fin ni le même sens ; les mélanger était illisible. */}
          {auditingCycles.filter(c => c.kind !== 'null').length > 0 && (
            <div className="glass-panel p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-mono text-slate-400 uppercase tracking-widest">{L('Cicli di auditing', 'Cycles d\'audition', 'Auditing cycles', 'Ciclos de auditación', 'Auditingcykler')} · CONTACT</h3>
                {deltaStarN > 0 && (
                  <span className="text-xs font-mono" style={{ color: 'rgba(240,246,255,0.95)' }} title={`${t('reaction_time') as string} (Kalman, ${deltaStarN} cicli)`}>
                    {t('reaction_time') as string} {deltaStar} <span className="opacity-60">ms · {deltaStarN}</span>
                    {deltaStarN >= 2 && Math.abs(deltaTrend) > 2 && (
                      <span style={{ marginLeft: 6, color: deltaTrend < 0 ? '#34d399' : '#fbbf24' }}>
                        {deltaTrend < 0 ? '↓' : '↑'} {Math.abs(Math.round(deltaTrend))} ms/s
                      </span>
                    )}
                  </span>
                )}
              </div>
              {/* Δt* decomposition (baseline + adaptive) + the geometric reconversion of
                  the delay (Δt·c) per the RS1 note — a UNIT reconversion, not a measurement. */}
              {deltaStarN > 0 && (
                <div className="text-[10px] font-mono text-slate-500">
                  Δt* = {t('report_lag_base') as string} {deltaBaseline} · {t('report_lag_adapt') as string} {deltaAdaptive >= 0 ? '+' : ''}{deltaAdaptive} ms
                  <span className="opacity-70"> · {t('report_lag_dist') as string} (Δt·c) ≈ {Math.round(299.792458 * deltaStar).toLocaleString()} km ({(deltaStar * 1000).toLocaleString()} SOL)</span>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                {auditingCycles.filter(c => c.kind !== 'null').map((c, i) => {
                  const dur = Math.max(0, Math.round(c.tEndSec - c.tStartSec));
                  const phaseLbl = c.phaseReached === 'asis' ? 'AS-IS' : c.phaseReached === 'discharge' ? 'DISSOLUTION' : c.phaseReached === 'contact' ? 'CONTACT' : '—';
                  const col = c.completed ? 'rgba(240,246,255,0.95)' : c.phaseReached === 'discharge' ? '#10b981' : c.phaseReached === 'contact' ? '#fb5e3b' : '#64748b';
                  return (
                    <div key={i} className="flex items-center justify-between gap-2 text-xs font-mono bg-white/5 rounded px-2 py-1.5 border border-slate-200/10">
                      <span className="truncate flex-1" style={{ color: 'rgba(220,240,255,0.85)' }}>{c.n ? <span style={{ color: 'rgba(235,244,255,0.92)', marginRight: 6 }}>#{c.n}</span> : null}{c.question || '—'}</span>
                      <span className="shrink-0 flex items-center gap-2">
                        {typeof c.leadMs === 'number' && <span className="text-[10px]" style={{ color: 'rgba(240,246,255,0.95)', opacity: 0.8 }}>{c.leadMs}ms</span>}
                        {/* Plus d'AS-IS "a verifier" : on n'affiche que le libelle de phase
                            (AS-IS confirme / DISSOLUTION / CONTACT). */}
                        <span style={{ color: col, fontWeight: 700 }}>{c.completed ? '✓ ' : ''}{phaseLbl}</span>
                        {/* TA at the AS-IS moment (per the auditor's request) — shown for cycles
                            that reached AS-IS, where the tone-arm read is meaningful. */}
                        {c.phaseReached === 'asis' && typeof c.taAtAsIs === 'number' && (
                          <span className="text-[10px]" style={{ color: '#d6ffff', opacity: 0.9 }} title={t('report_ta_at_asis') as string}>TA {c.taAtAsIs.toFixed(1)}</span>
                        )}
                        <span className="text-[10px] text-slate-500">{Math.floor(dur / 60)}m {String(dur % 60).padStart(2, '0')}s</span>
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="text-[10px] text-slate-500 font-mono">
                {auditingCycles.filter(c => c.kind !== 'null' && c.completed).length}/{auditingCycles.filter(c => c.kind !== 'null').length} {L('portati ad AS-IS', 'menés à l\'AS-IS', 'taken to AS-IS', 'llevados a AS-IS', 'förda till AS-IS')} · {(t('reaction_time') as string).toLowerCase()} = t_Item→leading-edge (γ/qL), {L('stima Kalman', 'estimation Kalman', 'Kalman estimate', 'estimación Kalman', 'Kalman-skattning')}
              </div>
              {/* (Resume "AS-IS a verifier" retire : on ne travaille plus qu'avec l'AS-IS confirme.) */}
            </div>
          )}

          {/* CICLI NULL — famiglia separata : NULL → RISE → EQUILIBRIUM (validato coi VGI's).
              « no recharging » = il mock-up non ha fatto salire nulla → il null NON è validato
              (è il risultato diagnostico più prezioso: dice che quel null non vale niente). */}
          {auditingCycles.filter(c => c.kind === 'null').length > 0 && (
            <div className="glass-panel p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-mono text-slate-400 uppercase tracking-widest">{L('Cicli di auditing', 'Cycles d\'audition', 'Auditing cycles', 'Ciclos de auditación', 'Auditingcykler')} · NULL</h3>
                <span className="text-xs font-mono" style={{ color: 'rgba(240,246,255,0.95)' }}>
                  {auditingCycles.filter(c => c.kind === 'null' && c.clearRead).length}/{auditingCycles.filter(c => c.kind === 'null').length} <span className="opacity-60">EQUILIBRIUM</span>
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {auditingCycles.filter(c => c.kind === 'null').map((c, i) => {
                  const dur = Math.max(0, Math.round(c.tEndSec - c.tStartSec));
                  const lbl = c.clearRead ? 'EQUILIBRIUM' : c.noRecharging ? 'NO RECHARGING' : 'NULL';
                  const col = c.clearRead ? '#d6ffff' : c.noRecharging ? '#fbbf24' : '#94a3b8';
                  return (
                    <div key={i} className="flex items-center justify-between gap-2 text-xs font-mono bg-white/5 rounded px-2 py-1.5 border border-slate-200/10">
                      <span className="truncate flex-1" style={{ color: 'rgba(220,240,255,0.85)' }}>{c.n ? <span style={{ color: 'rgba(235,244,255,0.92)', marginRight: 6 }}>#{c.n}</span> : null}{c.question || '—'}</span>
                      <span className="shrink-0 flex items-center gap-2">
                        <span style={{ color: col, fontWeight: 700 }}>{c.clearRead ? '✓ ' : ''}{lbl}</span>
                        {c.clearRead && (
                          <span className="text-[10px]" style={{ color: c.vgi ? '#6ee7b7' : 'rgba(226,238,255,0.6)' }}>{c.vgi ? "VGIs" : "no VGIs"}</span>
                        )}
                        <span className="text-[10px] text-slate-500">{Math.floor(dur / 60)}m {String(dur % 60).padStart(2, '0')}s</span>
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="text-[10px] text-slate-500 font-mono">
                {(() => { const nr = auditingCycles.filter(c => c.kind === 'null' && c.noRecharging).length;
                  return nr > 0
                    ? `⚠ ${nr} no recharging — ${L('il mock-up non ha creato massa: quei NULL NON sono validati', 'le mock-up n\'a pas créé de masse : ces NULL ne sont PAS validés', 'the mock-up created no mass: those NULL are NOT validated', 'el mock-up no creó masa: esos NULL NO están validados', 'mock-up skapade ingen massa: de NULL är INTE validerade')}`
                    : `NULL → RISE (mock-up) → EQUILIBRIUM, ${L('validato coi VGI\'s', 'validé avec les VGI\'s', 'validated with VGI\'s', 'validado con los VGI\'s', 'validerad med VGI\'s')}`; })()}
              </div>
            </div>
          )}

          {/* CICLI TONE SCALE — famiglia A PARTE (la scala del tono di Ron, −40…+40).
              Si riporta il tono di PARTENZA misurato, QUANTE VOLTE si è dato il comando, e se
              il tono quaranta è stato raggiunto. Il numero di passate è il dato da rileggere a
              freddo: dice quanto è costata quella resistenza. Più i testimoni che si sono
              accesi. (Prima si riportavano segno, ampiezza e l'accordo fra misura e
              assessment: erano le fasi che i comandi di Ron non prevedono.) */}
          {toneCycles.length > 0 && (
            <div className="glass-panel p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-mono text-slate-400 uppercase tracking-widest">{L('Cicli di auditing', 'Cycles d\'audition', 'Auditing cycles', 'Ciclos de auditación', 'Auditingcykler')} · TONE SCALE</h3>
                <span className="text-xs font-mono" style={{ color: 'rgba(240,246,255,0.95)' }}>
                  {toneCycles.filter(c => c.asIs).length}/{toneCycles.length} <span className="opacity-60">{L('al tono 40', 'au ton 40', 'at tone 40', 'al tono 40', 'vid ton 40')}</span>
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {toneCycles.map((c, i) => {
                  const dur = Math.max(0, Math.round(c.tEndSec - c.tStartSec));
          
                  const n = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}`;
                  return (
                    <div key={i} className="flex items-center justify-between gap-2 text-xs font-mono bg-white/5 rounded px-2 py-1.5 border border-slate-200/10">
                      <span className="truncate flex-1" style={{ color: 'rgba(220,240,255,0.85)' }}><span style={{ color: 'rgba(235,244,255,0.92)', marginRight: 6 }}>#{c.n}</span>{c.question || '—'}</span>
                      <span className="shrink-0 flex items-center gap-2">
                        {c.located !== null && (
                          <span className="text-[10px]" style={{ color: 'rgba(226,238,255,0.6)' }}>{L('ago', 'aiguille', 'needle', 'aguja', 'nål')} {n(c.located)}</span>
                        )}
                        <span className="text-[10px]" style={{ color: '#fbbf24' }}>→ +40</span>
                        {c.repeats > 0 && (
                          <span className="text-[10px]" style={{ color: 'rgba(226,238,255,0.75)' }}>×{c.repeats}</span>
                        )}
                        {/* DA DOVE VIENE IL NUMERO. Un tono misurato e uno dichiarato non
                            valgono la stessa cosa, e a freddo non si distinguerebbero. */}
                        {c.source && (
                          <span className="text-[10px]" style={{ color: 'rgba(226,238,255,0.5)' }}>
                            {c.source === 'assessed'
                              ? L('assessato', 'assessé', 'assessed', 'assessado', 'assessad')
                              : c.source}
                          </span>
                        )}
                        {c.witnesses.length > 0 && (
                          <span className="text-[10px]" style={{ color: 'rgba(226,238,255,0.5)' }}>{c.witnesses.join('+')}</span>
                        )}
                        {c.asIs
                          ? <span style={{ color: '#34d399', fontWeight: 700 }}>✓ {L('TONO 40', 'TON 40', 'TONE 40', 'TONO 40', 'TON 40')}</span>
                          : <span style={{ color: '#94a3b8', fontWeight: 700 }}>—</span>}
                        <span className="text-[10px] text-slate-500">{Math.floor(dur / 60)}m {String(dur % 60).padStart(2, '0')}s</span>
                      </span>
                    </div>
                  );
                })}
              </div>
              {(() => { const passate = toneCycles.reduce((a, c) => a + (c.repeats || 0), 0);
                return passate > 0 ? (
                  <div className="flex items-center justify-between text-xs font-mono px-2 py-1.5 rounded" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(226,238,255,0.18)' }}>
                    <span style={{ color: 'rgba(226,238,255,0.8)' }}>{L('Comandi dati', 'Commandes données', 'Commands given', 'Comandos dados', 'Givna kommandon')}</span>
                    <span style={{ color: 'rgba(240,246,255,0.95)', fontWeight: 700 }}>{passate}</span>
                  </div>
                ) : null; })()}
              <div className="text-[10px] text-slate-500 font-mono">
                {L('TONE SCALE (Ron) → « Localizza sul tuo caso una resistenza che possa essere corsa adesso. » poi « Porta questo a tono quaranta sulla scala del tono. », ridato finché non reagisce più. « ×n » = quante volte si è dato il comando. I testimoni: ago in cima, F/N, firma energetica.',
                   'TONE SCALE (Ron) → « Localise sur ton cas une résistance qui puisse être courue maintenant. » puis « Mène ceci au ton quarante sur l\'échelle des tons. », redonné jusqu\'à ce qu\'il ne réagisse plus. « ×n » = combien de fois la commande a été donnée. Les témoins : aiguille en haut, F/N, signature énergétique.',
                   'TONE SCALE (Ron) → "Locate resistance on your case that can now be run." then "Raise this to tone forty on the tone scale.", repeated until there is no reaction. "×n" = how many times the command was given. The witnesses: needle at top, F/N, energetic signature.',
                   'TONE SCALE (Ron) → « Localiza en tu caso una resistencia que pueda correrse ahora. » luego « Lleva esto al tono cuarenta en la escala del tono. », repetido hasta que no reaccione más. « ×n » = cuántas veces se dio el comando. Los testigos: aguja arriba, F/N, firma energética.',
                   'TONE SCALE (Ron) → ”Lokalisera ett motstånd i ditt fall som kan köras nu.” sedan ”För detta till ton fyrtio på tonskalan.”, upprepat tills ingen reaktion. ”×n” = hur många gånger kommandot gavs. Vittnena: nål i topp, F/N, energisignatur.')}
              </div>
            </div>
          )}

          {/* CICLI MIRROR — famiglia A PARTE (metodo di Ron « double the instant charge to erase it »):
              READ = carica istantanea (1–10), ×2 = totale da cancellare (il doppio), F/N quando lo
              smaltito raggiunge il doppio. Scala proporzionale (niente milliohm). */}
          {mirrorCycles.length > 0 && (
            <div className="glass-panel p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-mono text-slate-400 uppercase tracking-widest">{L('Cicli di auditing', 'Cycles d\'audition', 'Auditing cycles', 'Ciclos de auditación', 'Auditingcykler')} · MIRROR</h3>
                <span className="text-xs font-mono" style={{ color: 'rgba(240,246,255,0.95)' }}>
                  {mirrorCycles.filter(c => c.erased).length}/{mirrorCycles.length} <span className="opacity-60">F/N</span>
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {mirrorCycles.map((c, i) => {
                  const dur = Math.max(0, Math.round(c.tEndSec - c.tStartSec));
                  return (
                    <div key={i} className="flex items-center justify-between gap-2 text-xs font-mono bg-white/5 rounded px-2 py-1.5 border border-slate-200/10">
                      <span className="truncate flex-1" style={{ color: 'rgba(220,240,255,0.85)' }}><span style={{ color: 'rgba(235,244,255,0.92)', marginRight: 6 }}>#{c.n}</span>{c.question || '—'}</span>
                      <span className="shrink-0 flex items-center gap-2">
                        <span className="text-[10px]" style={{ color: 'rgba(226,238,255,0.6)' }}>READ {c.readInst.toFixed(1)} · ×2 {c.readDouble.toFixed(1)}</span>
                        {c.erased
                          ? <span style={{ color: '#34d399', fontWeight: 700 }}>✓ F/N</span>
                          : <span style={{ color: '#94a3b8', fontWeight: 700 }}>no F/N</span>}
                        <span className="text-[10px] text-slate-500">{Math.floor(dur / 60)}m {String(dur % 60).padStart(2, '0')}s</span>
                      </span>
                    </div>
                  );
                })}
              </div>
              {/* TOTALE DI SESSIONE (punto d di Ron) — somma dei valori effettivi e il suo doppio. */}
              {(() => { const sumV = mirrorCycles.reduce((s, c) => s + c.readInst, 0);
                return (
                  <div className="flex items-center justify-between text-xs font-mono px-2 py-1.5 rounded" style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.35)' }}>
                    <span style={{ color: 'rgba(226,238,255,0.8)' }}>{L('Totale seduta', 'Total séance', 'Session total', 'Total sesión', 'Sessionstotal')}</span>
                    <span style={{ color: 'rgba(240,246,255,0.95)' }}>Σ {sumV.toFixed(1)} → <span style={{ color: '#34d399', fontWeight: 700 }}>{L('doppio', 'double', 'double', 'doble', 'dubbel')} {(2 * sumV).toFixed(1)}</span></span>
                  </div>
                ); })()}
              <div className="text-[10px] text-slate-500 font-mono">
                {L('MIRROR (Ron) → per item: valore effettivo (1–10) · si cancella quando lo smaltito raggiunge il doppio (×2) · il totale seduta somma i valori (col doppio)',
                   'MIRROR (Ron) → par item : valeur effective (1–10) · effacé quand le déchargé atteint le double (×2) · le total séance additionne les valeurs (avec le double)',
                   'MIRROR (Ron) → per item: effective value (1–10) · erased when the discharged reaches the double (×2) · the session total sums the values (with the double)',
                   'MIRROR (Ron) → por ítem: valor efectivo (1–10) · se borra cuando lo descargado alcanza el doble (×2) · el total de sesión suma los valores (con el doble)',
                   'MIRROR (Ron) → per item: effektivt värde (1–10) · raderas när det urladdade når dubbeln (×2) · sessionstotalen summerar värdena (med dubbeln)')}
              </div>
            </div>
          )}

          {/* ASSESSMENT — items dati a voce dall'auditor, con il READ istantaneo (calcolo R&I).
              Un blocco per ciclo di assessment. */}
          {assessCycles.some(c => c.items.length > 0) && (
            <div className="glass-panel p-4 flex flex-col gap-3">
              <h3 className="text-sm font-mono text-slate-400 uppercase tracking-widest">Assessment</h3>
              {assessCycles.filter(c => c.items.length > 0).map((cyc, ci) => (
                <div key={ci} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                    <span>#{cyc.n}</span>
                    <span>{cyc.items.length} {L('item', 'items', 'items', 'ítems', 'items')} · {Math.floor(Math.max(0, cyc.tEndSec - cyc.tStartSec) / 60)}m {String(Math.max(0, Math.round(cyc.tEndSec - cyc.tStartSec)) % 60).padStart(2, '0')}s</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {cyc.items.map((it, ii) => {
                      const strong = ['Fall', 'Long Fall', 'LF Blow Down', 'SF'].includes(it.reaction);
                      const noRead = it.reaction === 'NULL' || it.reaction === '—' || !it.reaction;
                      const short = it.reaction === 'LF Blow Down' ? 'LF BD' : it.reaction === 'Long Fall' ? 'LONG FALL' : it.reaction === 'Fall' ? 'FALL' : it.reaction === 'SF' ? 'SF' : it.reaction === 'Dirty Needle' ? 'DN' : it.reaction === 'F/N (Floating)' ? 'F/N' : it.reaction === 'Tick' ? 'tick' : noRead ? 'NULL' : it.reaction;
                      const col = it.reaction === 'F/N (Floating)' ? '#34d399' : strong ? '#fbbf24' : noRead ? 'rgba(226,238,255,0.4)' : 'rgba(226,238,255,0.6)';
                      return (
                        <div key={ii} className="flex items-center gap-2 text-xs font-mono bg-white/5 rounded-full px-2.5 py-1 border border-slate-200/10">
                          <span style={{ color: 'rgba(220,240,255,0.9)' }}>{it.item}</span>
                          <span style={{ color: col, fontWeight: 700 }}>{short}</span>
                          {!noRead && it.beforeMs ? <span style={{ color: 'rgba(226,238,255,0.5)' }}>−{it.beforeMs}ms</span> : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="text-[10px] text-slate-500 font-mono">
                {L('Item assessati a voce · READ istantaneo (NULL = nessuna reazione) · −ms = quanto prima è avvenuto',
                   'Items assessés à voix · READ instantané (NULL = aucune réaction) · −ms = combien avant il est survenu',
                   'Items assessed aloud · instant READ (NULL = no reaction) · −ms = how long before it occurred',
                   'Ítems evaluados en voz · READ instantáneo (NULL = sin reacción) · −ms = cuánto antes ocurrió',
                   'Items bedömda högt · omedelbar READ (NULL = ingen reaktion) · −ms = hur långt före den inträffade')}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Graphs & Transcript */}
        <div className="col-span-2 flex flex-col gap-6">
          
          {/* F/N Graph — solo con un ago che lo alimenti (vedi la nota su ZONE AS-IS). */}
          {!noInstruments && (
          <div className="glass-panel p-4 h-64 flex flex-col">
            <h3 className="text-sm font-mono text-slate-400 uppercase tracking-widest mb-4">{t('lock_quality')}</h3>
            <div className="flex-1 w-full min-h-[200px] relative">
              <div ref={containerRef} className="w-full h-full absolute inset-0">
                {!containerRef.current || containerRef.current.offsetWidth <= 0 ? (
                  <div className="w-full h-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorQl" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#4ade80" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={10} tickFormatter={(val) => val + 's'} />
                  <YAxis stroke="#64748b" fontSize={10} domain={[0, 1]} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '12px', fontFamily: 'monospace' }}
                    labelFormatter={(val) => `Time: ${val}s`}
                  />
                  <ReferenceArea y1={0.9} y2={1} />
                  <ReferenceLine y={0.7} stroke="#eab308" strokeDasharray="3 3" label={{ position: 'insideTopRight', value: 'F/N', style: { fill: '#eab308', fontSize: 10 } }} />
                  <ReferenceLine y={0.7} stroke="#3b82f6" strokeDasharray="3 3" label={{ position: 'insideTopRight', value: 'T90', style: { fill: '#3b82f6', fontSize: 10 } }} />
                  <Area type="monotone" dataKey="qL" stroke="#4ade80" fillOpacity={1} fill="url(#colorQl)" isAnimationActive={false} />
                  </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
          )}

          {/* (The on-screen "As-is / T-Zones" timeline was removed — superseded by
              the ZONES AS-IS section, per user request.) */}

          {/* ── MODULATION NEURO-ACOUSTIQUE ── */}
          {mnaData && (mnaData.cycles > 0 || mnaData.imHistory.length > 0) && (() => {
            // I_m médio removed (user request) — peak I_m only.
            const ZONE_COLORS: Record<string, string> = {
              PRIME: '#56cfe1', SEMANTIC: '#e8c170', COMPOSITE: '#ff9b3d', MASSIVE: '#d04545',
            };
            const zoneColor = ZONE_COLORS[mnaData.finalZone] || '#56cfe1';
            const phaseColors: Record<string, string> = {
              CAPTURE: '#56cfe1', SONIFY: '#e8c170', CLEAN: '#ff9b3d', HARMONICS: '#a78bfa',
            };
            return (
              <div className="glass-panel p-4 flex flex-col gap-3">
                {/* Header */}
                <div className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <polygon points="7,0.5 13,3.5 13,10.5 7,13.5 1,10.5 1,3.5" stroke="#56cfe1" strokeWidth="1.2" fill="rgba(86,207,225,0.1)"/>
                    <circle cx="7" cy="7" r="2" fill="#56cfe1" opacity="0.8"/>
                  </svg>
                  <h3 className="text-sm font-mono text-cyan-400 uppercase tracking-widest">
                    {t('mna_report_title') as string}
                  </h3>
                </div>

                {/* Metrics grid */}
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: t('mna_report_cycles') as string, value: String(mnaData.cycles), color: '#56cfe1' },
                    { label: t('mna_report_peak_im') as string, value: fmtIm(mnaData.peakIm), color: '#e8c170' },
                    { label: t('mna_report_zone') as string, value: mnaData.finalZone, color: zoneColor },
                    { label: t('mna_report_copies') as string, value: String(mnaData.totalCopies), color: '#a78bfa' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex flex-col items-center p-2 rounded"
                      style={{ background: `${color}12`, border: `1px solid ${color}30` }}>
                      <span className="text-[8px] font-mono uppercase tracking-widest mb-1"
                        style={{ color, opacity: 0.7 }}>{label}</span>
                      <span className="text-lg font-mono font-black tabular-nums leading-none"
                        style={{ color, textShadow: `0 0 10px ${color}66` }}>{value}</span>
                    </div>
                  ))}
                </div>

                {/* Phase timeline — ONE row PER CYCLE (each cycle begins at a CAPTURE),
                    instead of a single strip concatenating every cycle. */}
                {mnaData.phaseLog.length > 1 && (() => {
                  const log = mnaData.phaseLog;
                  const cycles: Array<Array<{ phase: string; dur: number | null }>> = [];
                  log.forEach((e, i) => {
                    const nextT = log[i + 1]?.t;
                    const dur = nextT ? Math.round((nextT - e.t) / 1000) : null;
                    if (e.phase === 'CAPTURE' || cycles.length === 0) cycles.push([]);
                    cycles[cycles.length - 1].push({ phase: e.phase, dur });
                  });
                  return (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest">Phase timeline · par cycle</span>
                      {cycles.map((cyc, ci) => (
                        <div key={ci} className="flex items-center gap-1">
                          <span className="text-[8px] font-mono shrink-0 w-7" style={{ color: '#56cfe1' }}>#{ci + 1}</span>
                          <div className="flex items-center gap-0 overflow-x-auto">
                            {cyc.map((entry, i) => {
                              const col = phaseColors[entry.phase] || '#475569';
                              return (
                                <div key={i} className="flex items-center shrink-0">
                                  <div className="flex flex-col items-center px-2 py-1 rounded"
                                    style={{ background: `${col}15`, border: `1px solid ${col}40` }}>
                                    <span className="text-[8px] font-mono font-bold" style={{ color: col }}>{entry.phase}</span>
                                    {entry.dur !== null && (
                                      <span className="text-[7px] font-mono opacity-50" style={{ color: col }}>{entry.dur}s</span>
                                    )}
                                  </div>
                                  {i < cyc.length - 1 && (
                                    <div style={{ width: 12, height: 1, background: `${col}40` }} />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* Transcript & Semantic Supervisor */}
          <div className={cn(
            "glass-panel p-4 flex flex-col",
            isExporting ? "h-auto" : "flex-1 min-h-[300px]"
          )}>
            <h3 className="text-sm font-mono text-slate-400 uppercase tracking-widest mb-4">{t('semantic_supervisor')}</h3>
            <div className={cn(
              "pr-2 flex flex-col gap-0",
              isExporting ? "h-auto overflow-visible" : "flex-1 overflow-y-auto custom-scrollbar"
            )}>
              {/* ── SENZA REAZIONI, IL JOURNAL COMPLETO ────────────────────────────────────────
                  Il Semantic Supervisor mostra le parole dell'auditor CON la loro reazione:
                  senza strumenti non c'è reazione, e la sezione restava vuota (« nessun parlato »)
                  anche quando il journal era pieno di item e indicazioni (segnalato). In quel
                  caso si mostra il JOURNAL intero — item, indicazioni, note di sistema — così il
                  rapporto ha sempre la traccia della seduta, con o senza strumenti. */}
              {transcriptReactions.length === 0 ? (
                logs.length === 0 ? (
                  <div className="text-slate-500 text-sm font-mono italic text-center mt-10">{t('no_speech_detected')}</div>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className="flex items-start gap-2 p-1.5 bg-slate-900/30 border-b border-slate-800/50 last:border-0">
                      <span className="text-[9px] font-mono text-slate-500 mt-0.5 w-12 shrink-0">[{log.time.toFixed(1)}s]</span>
                      <p className="text-[10px] text-slate-300 font-mono flex-1 leading-tight">
                        {log.speaker && log.speaker !== 'SYS' ? <span className="text-slate-500">{log.speaker}: </span> : null}
                        {log.text}
                      </p>
                    </div>
                  ))
                )
              ) : (
                transcriptReactions.map((log, i) => (
                  <div key={i} className="flex items-start gap-2 p-1.5 bg-slate-900/30 border-b border-slate-800/50 last:border-0">
                    <span className="text-[9px] font-mono text-slate-500 mt-0.5 w-12 shrink-0">[{log.time.toFixed(1)}s]</span>
                    <p className="text-[10px] text-slate-300 font-mono flex-1 leading-tight">"{log.text}"</p>
                    {log.tone && (
                      <span className={cn('text-[8px] font-mono px-1 py-0.5 rounded shrink-0',
                        log.tone.label === 'calm'     && 'bg-blue-500/20 text-blue-300',
                        log.tone.label === 'neutral'  && 'bg-slate-500/20 text-slate-300',
                        log.tone.label === 'tense'    && 'bg-amber-500/20 text-amber-300',
                        log.tone.label === 'stressed' && 'bg-red-500/20 text-red-300',
                      )}>
                        {t(`tone_${log.tone.label}` as any)}{log.tone.pitch > 0 ? ` ${log.tone.pitch}Hz` : ''}
                      </span>
                    )}
                    <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 ${
                      log.type === 'gold' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                      log.type === 'gray' ? 'bg-slate-700/50 text-slate-400 border border-slate-600' :
                      'bg-slate-800 text-slate-500'
                    }`}>
                      {log.reaction}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
