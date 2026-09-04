import { useState, useEffect, useRef, useCallback, useMemo, useSyncExternalStore, memo, lazy, Suspense } from 'react';
import { pick5 } from './i18n5';
import { needleEngine, virtualNeedle } from './runtime/NeedleEngine';
import { bpmSmoother, integrityTracker } from './runtime/SmoothingEngine';
import { sessionClock } from './runtime/SessionClock';
import { useUiStore } from './store/uiStore';
import { useProfileStore } from './store/profileStore';
import { useNetworkStore } from './store/networkStore';
import { useLayoutStore } from './store/layoutStore';
import { offlineSpeechRecognition, OfflineSpeechRecognition } from './lib/offlineSpeechRecognition';
import { nativeSpeechRecognition } from './lib/nativeSpeechRecognition';
import { useAppInitializer } from './hooks/useAppInitializer';
// PHASE-B step 4: useLayoutManager hook replaced by `layoutStore` (zustand).
// Existing call sites that destructured the hook's return now read selectors.
import { useEpValidation } from './hooks/useEpValidation';
import { useMnaModule } from './hooks/useMnaModule';
import { useChargeEngine } from './hooks/useChargeEngine';
import { useMuseContactGate } from './hooks/useMuseContactGate';
import { useStableReleaseState } from './hooks/useStableReleaseState';
import { useMediaRelayFallback } from './hooks/useMediaRelayFallback';
import { useThetaMeter } from './hooks/useThetaMeter';
import { effectiveModules, eegModulesHidden, noInstruments } from './engine/instrumentModules';
import { sessionRecord, reactionRecord, cycleRecord, fnRecord, itemRecord,
         chiaveItem } from './engine/corpus';
import { corpusWrite, corpusFlushNow, corpusStato, corpusAvailable } from './lib/corpusWriter';
import { SQUEEZE_TARGET_OFFSET } from './engine/thetaSetup';
import { ThetaReadyCheck } from './components/ThetaReadyCheck';
import { ThetaTaCalibration } from './components/ThetaTaCalibration';

// ⚠️ THETA_AMBER si usava solo nel badge del Theta-Meter, ora in `InstrumentBadges.tsx`
// (che ne tiene la propria copia — deve restare identica a QuantumSphere, v. lì). Tolto da
// qui: la costante non serviva più a nient'altro in questo file.
import { ParticipantView } from './components/ParticipantView';
import { LIGHT_THEME_CSS } from './ui/lightThemeCss';
import { EpManualModal } from './components/EpManualModal';
import { computeInstantRead, readWaitSeconds, readWindow, READ_NON_MISURATO, type ReadSrc } from './engine/instantRead';
import { isAssessableItem } from './engine/assessItemFilter';
import { ITEM_INTERRUPT_MS,
         SHOWN_READS_CAP, READ_WINDOW_AFTER_S,
         THETA_LABEL_AFTER_MS, THETA_REACT_TICK, THETA_RETRACT_MS } from './engine/tuning';
import { QuantumSphere } from './components/QuantumSphere';
import { type ChargeStateId } from './lib/chargeState';
import { cycleStateMachine } from './engine/CycleStateMachine';
import { ClearDial } from './components/ClearDial';
import { CycleStatusBar } from './components/CycleStatusBar';
import { Panel3D } from './components/Panel3D';
import { GlassLabeledToggle } from './components/GlassLabeledToggle';
import { GlassCollapseToggle } from './components/GlassCollapseToggle';
import { glassSurface, scenePerspective, frontTilt } from './ui/panel3d';
import { TranscriptLog, type LogEntry } from './components/TranscriptLog';
import { CameraFeed } from './components/CameraFeed';
import { ConnectionModal } from './components/ConnectionModal';
import { ConnectionProgress } from './components/ConnectionProgress';
import { AlertTriangle, BookOpen, Headphones, Power, Play, Mic, Square, ClipboardList,
         Megaphone } from 'lucide-react';
import { cn } from './lib/utils';
import { useI18n } from './i18n.tsx';
import { Language } from './i18n';
// O2 (optimization): PostSessionReport (~1.5k lines, pulls in jsPDF) and HistoryModal
// are only shown on demand (showReport / showHistoryModal), so they are LAZY-loaded —
// their code (and jsPDF) is fetched only the first time the user opens them, keeping
// the initial bundle and startup lighter.
const PostSessionReport = lazy(() => import('./components/PostSessionReport').then(m => ({ default: m.PostSessionReport })));
/** Badge de READ pour un item ASSESSÉ (mêmes lectures que le R&I) : libellé court + couleur. */
const ASSESS_READ_META = (reaction: string): { short: string; color: string; border: string } => {
  switch (reaction) {
    case 'LF Blow Down':   return { short: 'LF BD',     color: '#f472b6', border: 'rgba(244,114,182,0.6)' };
    case 'Long Fall':      return { short: 'LONG FALL', color: '#fb7185', border: 'rgba(251,113,133,0.6)' };
    case 'Fall':           return { short: 'FALL',      color: '#fbbf24', border: 'rgba(251,191,36,0.6)' };
    case 'SF':             return { short: 'SF',        color: '#fcd34d', border: 'rgba(252,211,77,0.5)' };
    case 'Dirty Needle':   return { short: 'DN',        color: '#f87171', border: 'rgba(248,113,113,0.5)' };
    case 'F/N (Floating)': return { short: 'F/N',       color: '#34d399', border: 'rgba(52,211,153,0.6)' };
    case 'Tick':           return { short: 'tick',      color: 'rgba(226,238,255,0.7)', border: 'rgba(255,255,255,0.22)' };
    case '⏳':             return { short: '⏳',         color: 'rgba(226,238,255,0.5)', border: 'rgba(255,255,255,0.18)' };
    case 'NULL':           return { short: 'NULL',      color: 'rgba(226,238,255,0.42)', border: 'rgba(255,255,255,0.12)' };
    // NON MISURATO: niente ago, quindi nessun verdetto. Smorzato al massimo — non è un esito,
    // è l'assenza di una misura, e non deve somigliare a un NULL (che invece è un risultato).
    case READ_NON_MISURATO: return { short: READ_NON_MISURATO, color: 'rgba(226,238,255,0.30)', border: 'rgba(255,255,255,0.08)' };
    default:               return { short: reaction || 'NULL', color: 'rgba(226,238,255,0.6)', border: 'rgba(255,255,255,0.2)' };
  }
};
const HistoryModal = lazy(() => import('./components/HistoryModal').then(m => ({ default: m.HistoryModal })));
import { ProfileRoster } from './components/ProfileRoster';
import { InstrumentHintPanel } from './components/InstrumentHintPanel';
import { InstrumentBadges } from './components/InstrumentBadges';
import { QuitConfirmDialog } from './components/QuitConfirmDialog';
import { ParticipantWaitingBanner } from './components/ParticipantWaitingBanner';
import { PcSexPromptDialog } from './components/PcSexPromptDialog';
import { SessionRecoveryDialog } from './components/SessionRecoveryDialog';
import { GuideModal } from './components/GuideModal';
import { AIAssistant } from './components/AIAssistant';
import { getProfiles, setActiveProfileId, saveProfile, saveSession, getSessions, getSessionsByProfile, saveSessionDraft, loadSessionDraftAsync, clearSessionDraft, SessionDraft } from './lib/storage';
import { isServerAvailable, serverSaveProfiles, serverSaveSessions } from './lib/serverStorage';
import { voiceToneAnalyzer } from './lib/voiceToneAnalyzer';
import { satelliteRedundancy } from './lib/satelliteRedundancy';
import { attachAudioBoost } from './lib/audioBoost';
import { useEvent } from './hooks/useEvent';
import { metricsStore, useMetric } from './store/metricsStore';
import { velocityTracker } from './engine/VelocityTracker';
import { taAccumulator } from './engine/TaAccumulator';
import { MirrorDial } from './components/MirrorDial';
import { ToneDial } from './components/ToneDial';
import { ToneColumn } from './components/ToneColumn';
import { TONE_LEVELS, levelName } from './engine/toneLevels';
import {
  loadHistory as loadCanTests, saveHistory as saveCanTests, addTest as addCanTest,
  toneMargin, withMargin, taToTwoCans, testedToday,
  type PcCanHistory,
} from './engine/canTest';
import { CycleHint } from './components/CycleHint';
import { CycleSteps } from './components/CycleSteps';
import { useSessionJournal } from './session/useSessionJournal';
import { useMuseConnection } from './hooks/useMuseConnection';
import { useToneCycle } from './session/useToneCycle';
import { useMirrorCycle } from './session/useMirrorCycle';
import { useTruthCycle } from './session/useTruthCycle';
import { useContactNullCycle, type CycleTick } from './session/useContactNullCycle';
// Del motore del TONE all'interfaccia resta il solo bersaglio, che si SCRIVE (« → +40 »).
// Il calcolo — conversioni, locatore, testimoni — è passato tutto in `session/useToneCycle`.
import { TONE_TARGET } from './engine/toneScale';
import { MODE_SPEC, availableModes, fallbackMode, cycleIsAutomatic, type SessionMode } from './engine/sessionMode';
import { deriveCyclePhase, phaseFamily } from './engine/sessionPhase';
import { LAYER } from './ui/layers';
import { motion } from 'framer-motion';
import { useUiModeStore } from './store/uiModeStore';
import { nullCycleStateMachine, type NullStateId } from './engine/NullCycleStateMachine';
import { clearReadDetector } from './engine/ClearReadDetector';
import { falseAsIsDetector } from './engine/FalseAsIsDetector';
import { fnTracker } from './engine/FnTracker';
import { primeFreqTracker } from './engine/PrimeFreqTracker';
import { sessionRecorder } from './engine/SessionRecorder';
import { chargeEpisode } from './engine/ChargeEpisodeTracker';
import { contactPredictor } from './engine/ContactPredictor';
import { lagMeter } from './engine/LagMeter';
import { metabolicBaseline } from './engine/MetabolicBaseline';
import { MetabolicCheck } from './components/MetabolicCheck';
import {
  reactionClassifier, REACTION_LABELS } from './engine/ReactionClassifier';
import { TotalTaReadout, SpeedReadout } from './components/SessionReadouts';
import { tzoneStore } from './store/tzoneStore';
import { primeFreqAudio } from './lib/primeFreqAudio';
// (primeFreqEngine math now consumed via engine/PrimeFreqTracker — slice 2.)
import { networkManager, parseSignalingUrl, parseConnectionLink, VOICE_AUDIO_CONSTRAINTS } from './lib/networkManager';
import { SplashScreen } from './components/SplashScreen';
import { CreditsModal } from './components/CreditsModal';
import { EpValidationModal } from './components/EpValidationModal';
import { ProcessusModal } from './components/ProcessusModal';
import { MnaPanel } from './components/MnaPanel';
import { BiometricPanel } from './components/BiometricPanel';
import { AssessmentPanel, type AssessmentItem } from './components/AssessmentPanel';
import { AppBackground } from './components/AppBackground';
import { HealthPanel } from './components/HealthPanel';
import { SidebarDrawer as SidebarDrawerBase } from './components/SidebarDrawer';
import { Sidebar as SidebarBase } from './components/Sidebar';
import { TOKEN } from './ui/tokens';

// CONN-121 (perf, stage 1): memoize the two largest sub-components that do NOT
// receive the ~10 Hz session metrics. With React.memo they are SKIPPED when App
// re-renders for reasons unrelated to their own props (purely additive — if a
// prop does change they still render exactly as before, so it cannot break).
const Sidebar = memo(SidebarBase);
const SidebarDrawer = memo(SidebarDrawerBase);

type SessionState = 'idle' | 'running' | 'paused' | 'ended';

// FIX CONN-61: detect the Electron desktop build. The preload script exposes
// `window.electronAPI`, absent in a plain browser. In Electron the Web Speech
// API (webkitSpeechRecognition) is present but non-functional (it needs Google's
// private cloud key, which ships only in official Chrome) — so we skip it and go
// straight to the offline Whisper engine.
const isElectron = typeof window !== 'undefined' && !!(window as unknown as { electronAPI?: unknown }).electronAPI;

// (Reaction tables moved to src/engine/ReactionClassifier.ts — single source.)

export default function App() {
  const { t, lang, setLang } = useI18n();
  // ⚠️ Trovato attivando `strict`: `t` è tipizzata su un'unione letterale di ~660 chiavi note —
  // corretto (una chiave inventata sarebbe un errore da cogliere in compilazione), ma alcuni
  // componenti dichiarano la propria prop `t` come `(key: string) => string` (più larga). Passare
  // la funzione stretta lì è REALMENTE sicuro (v. `i18n.tsx`: una chiave sconosciuta a runtime
  // ritorna la chiave stessa, mai un crash) — ma TypeScript lo rifiuta a ragione in astratto (una
  // funzione che accetta MENO non sostituisce una che promette di accettarne di più). `tWide`
  // esiste SOLO per quei pochi punti di passaggio, mai per chiamare `t()` direttamente qui.
  const tWide = t as (key: string) => string;
  /** Traduction INLINE 5 langues pour les libellés/infobulles locaux (même esprit que SidebarDrawer).
   *  Les TERMES D'AUDITION (CONTACT, NULL, RISE, EQUILIBRIUM, AS-IS, VGIs, MOCK-UP, recharging /
   *  no recharging) ne se traduisent PAS : c'est le vocabulaire du métier, identique partout. */
  const LC = (it: string, fr: string, en: string, es: string, sv: string) => pick5(lang as string, it, fr, en, es, sv);
  // Miroir de la langue pour les callbacks P2P (onConnectionEstablished capture un `lang` figé) :
  // l'auditeur pilote la langue de la séance et la pousse au téléphone (préclair).
  const langRef = useRef(lang); langRef.current = lang;
  const [showSplash, setShowSplash] = useState(true);
  /** Crédits (clic sur le logo Alternative Scientology). */
  const [showCredits, setShowCredits] = useState(false);

  // ── IL GIORNALE, FUORI DA QUI ───────────────────────────────────────────────────────────
  // Ultimo pezzo della fase 1. Le due vie per scrivere — subito, o dal cuscinetto a 500 ms per
  // chi gira nel worker EEG — stanno in `session/useSessionJournal`, coi nomi di sempre.
  const journal = useSessionJournal(t('sys_init') as string);
  const { logs, setLogs, logsRef, logBufferRef, addLog } = journal;

  const [sessionState, setSessionState] = useState<SessionState>('idle');
  // PHASE-A: `time` now lives in `sessionClock` (drift-free, derived from
  // performance.now() — FIX B-07). Components & worker handlers read it via
  // `sessionClock.now()`. UI subscribes via useSyncExternalStore.
  // PERF: subscribe at WHOLE-SECOND granularity — App only displays MM:SS, but
  // the 0.1 s snapshot made the whole 4900-line component re-render 10×/s for
  // the entire session. Code needing precise time reads timeRef / sessionClock.now().
  const time = useSyncExternalStore(sessionClock.subscribe, sessionClock.getWholeSeconds);
  const [clockTime, setClockTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setClockTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [sessionEndTime, setSessionEndTime] = useState<Date | null>(null);
  // FIX cleanup: dropped `[data, setData]` — write-only state, no consumer.
  // Full-resolution history still lives in sessionHistoryRef (used by report).
  // STALE-CLOSURE FIX: the worker onmessage handler is created ONCE (deps []),
  // so reading state there would capture the FIRST render's value forever — e.g.
  // `t` (journal entries froze in the boot language) and `epWindowOpen` (the
  // cognition→EP suggestion branch went dead). Ref mirrors, updated every render,
  // give the handler the live values.
  const tRef = useRef(t);
  tRef.current = t;
  
  const [cam1Visible, setCam1Visible] = useState(true);
  const [cam2Visible, setCam2Visible] = useState(true);
  const [transcriptVisible, setTranscriptVisible] = useState(true);

  // ── Layout / module visibility — PHASE-B step 4: now from layoutStore ────
  const moduleVisChosen  = useLayoutStore(s => s.moduleVis);
  const setModuleVis     = useLayoutStore(s => s.setModuleVis);
  // (other layout fields read directly by ConfigDrawer — no longer drilled)

  // PHASE-B step 2: profile-cosmetic fields migrated to `profileStore`.
  // App.tsx still drives them (boot load, profile switch effects), but reads
  // and writes go through the store so any leaf can subscribe directly.
  const auditorName    = useProfileStore(s => s.auditorName);
  const setAuditorName = useProfileStore(s => s.setAuditorName);
  const pcName         = useProfileStore(s => s.pcName);
  const setPcName      = useProfileStore(s => s.setPcName);
  const pcSex          = useProfileStore(s => s.pcSex);
  const setPcSex       = useProfileStore(s => s.setPcSex);
  const pcPhoto        = useProfileStore(s => s.pcPhoto);
  // Tone-Arm clear baseline follows the PC's sex: man → 3.0, woman → 2.0 (user spec).
  // Unknown sex → keep the neutral 2.0 rest.
  useEffect(() => { const b = pcSex === 'm' ? 3.0 : 2.0; taAccumulator.setBaseline(b); }, [pcSex]);
  const setPcPhoto     = useProfileStore(s => s.setPcPhoto);
  const setPcPreview   = useProfileStore(s => s.setPcPreview);
  const isSoloSession    = useProfileStore(s => s.isSoloSession);
  const setIsSoloSession = useProfileStore(s => s.setIsSoloSession);
  // Processus
  const [showProcessus, setShowProcessus] = useState(false);
  const [sidebarDrawer, setSidebarDrawer] = useState<null | 'link' | 'trim' | 'auditor' | 'pc' | 'lang' | 'session' | 'config'>(null);
  // ── IL MODO — un comando solo, al posto di sei ────────────────────────────────────────────
  // Prima c'erano tre file di comandi in tre posti: AGO/AGO+/MIRROR/TONE (cosa GUARDI),
  // MUSE/METER (quale AGO), CONTACT/NULL (cosa FAI). Due cambiavano la veste e una il metodo, e
  // da nessuna parte era scritto quale fosse quale — l'auditor doveva chiedersi « quale vista?
  // quale ago? quale bottone? » invece dell'unica domanda che conta: CHE COSA STO FACENDO.
  //
  // Adesso i CINQUE METODI stanno sullo stesso piano, che è quel che sono davvero, e ognuno si
  // porta dietro il suo quadrante, il suo ago e i suoi comandi. AGO/AGO+ non era un metodo: era
  // la scia, ed è diventata una levetta a parte.
  const [mode, setMode] = useState<SessionMode>('contact');
  /** La SCIA e le etichette di reazione — quel che « AGO + » voleva dire. */
  const [showTrailPref, setShowTrailPref] = useState(true);
  /** Il MNA è APERTO adesso? Non è un modo: è un attrezzo che si apre DENTRO il ciclo in corso.
   *  La levetta di CONFIG (`moduleVis.mna`) dice se il modulo esiste; questa se è a schermo. */
  const [mnaAperto, setMnaAperto] = useState(false);
  // La vista del quadrante non si sceglie più: DISCENDE dal modo. Tutto il codice a valle
  // continua a leggere `viewMode` senza sapere che ora è derivato.
  const viewMode: 'needle' | 'needle_pure' | 'mirror' | 'tone' | 'truth' =
    mode === 'mirror' ? 'mirror'
    : mode === 'tone' ? 'tone'
    : mode === 'truth' ? 'truth'
    : showTrailPref ? 'needle' : 'needle_pure';
  const viewModeRef = useRef(viewMode); viewModeRef.current = viewMode;
  // MIRROR (metodo di Ron: « double the instant charge to erase it ») — 3ª vista, cosa A PARTE.
  // Lo stato e i gesti stanno in `session/useMirrorCycle`, come per il TONE. Qui resta solo il
  // ref che alimenta il motore dal worker EEG: quel gestore si aggancia una volta sola, prima
  // che il hook esista.
  const trackMirrorRef = useRef<(q: number, nowSec: number, pushUi: boolean) => void>(() => {});
  /** Il locatore del ciclo TONE, alimentato dal worker EEG. Vedi `useToneCycle.trackTone`. */
  const trackToneRef = useRef<(q: number, nowSec: number) => void>(() => {});
  /** Il tracker del ciclo TRUTH, alimentato dal worker EEG. Vedi `useTruthCycle.trackTruth`. */
  const trackTruthRef = useRef<(q: number, nowSec: number, hasInstrument: boolean, fnNow: boolean, pushUi: boolean) => void>(() => {});
  // E per il TONE la stessa coppia sta in `session/useToneCycle`: la resistenza si dà a voce
  // come ogni altro item, ma è il ciclo a saperlo, non l'interfaccia.
  // ── ASSESSMENT (bouton « ASSESSMENT », même nom dans toutes les langues) — l'auditeur donne des
  //    items à voix haute ; comme le R&I on inscrit le READ instantané (même calcul, fenêtre de
  //    réaction). Les items s'affichent SOUS l'arc. Re-presser → arrête (les items restent) ; presser
  //    à nouveau → nouveau cycle (on efface les items du cycle précédent). Tout est mis au rapport/PDF.
  // La forma delle righe vive nel pannello che le disegna: qui si riusa, così non si sfasano.
  type AssessItem = AssessmentItem;
  interface AssessCycle { n: number; tStartSec: number; tEndSec: number; items: Array<{ item: string; reaction: string; time: number; beforeMs?: number }>; }
  const [assessActive, setAssessActive] = useState(false);
  const assessActiveRef = useRef(false); assessActiveRef.current = assessActive;
  // Liste de TOUTE la séance (module ASSESSMENT) : les mots restent inscrits avec leur read pendant
  // toute la session (demande utilisateur). Le module ASSESSMENT (ex R&I) affiche CECI.
  const [assessSession, setAssessSession] = useState<AssessItem[]>([]);
  // Specchio in ref: le righe si validano da callback stabili (l'auditor clicca quando vuole,
  // anche molto dopo), e senza questo leggerebbero una lista vecchia.
  const assessSessionRef = useRef<AssessItem[]>([]); assessSessionRef.current = assessSession;
  /** Timers en attente (un par item assessé). Suivis pour pouvoir TOUS les annuler au démontage :
   *  sinon un read se résolvait après la fin de la séance / la fermeture. */
  const pendingTimersRef = useRef<Set<number>>(new Set());
  const assessCyclesRef = useRef<AssessCycle[]>([]);                 // tous les cycles (rapport)
  const assessStartRef = useRef(0);                                  // t (s) du début du cycle courant
  const assessLogCursorRef = useRef(0);                             // index de logs déjà consommés
  const assessNRef = useRef(0);
  const assessIdRef = useRef(0);
  /** t (s) de l'item assessé PRÉCÉDENT — borne basse de la fenêtre de lecture : on ne remonte
   *  jamais avant lui, sinon un item vole la lecture de celui d'avant (items toutes les 1–2 s). */
  const assessPrevAtRef = useRef(-Infinity);
  // REDESIGN Fase 2 — progressive disclosure: i readout secondari (Total TA, velocità)
  // stanno dietro questo toggle "diagnostica", così l'angolo alto-dx resta un solo meter.
  const [showDiag, setShowDiag] = useState(false);
  // Se l'auditor avvia senza aver indicato il PC, il sesso (→ baseline TA: uomo 3 / donna 2)
  // è ignoto: chiediamolo prima di proseguire con le tappe di avvio.
  const [showSexPrompt, setShowSexPrompt] = useState(false);
      
  // ── EP Validation (partial — second block below merged in) ──────────────
  const epValidation = useEpValidation();
  const {
    showEpValidation, setShowEpValidation,
    epValidationStartTime, setEpValidationStartTime,
    epValidationConditions, setEpValidationConditions,
    recentPcPhrases, setRecentPcPhrases,
    asIsnessState, setAsIsnessState,
    epWindowOpen, setEpWindowOpen,
    epCognitionText, /* setEpCognitionText — managed inside the hook */
    epAuditorNote, setEpAuditorNote,
    epValidated, setEpValidated,
    isFnActive, setIsFnActive,
    epManualOpen, setEpManualOpen,
    epReactionType, setEpReactionType,
    epRealization, setEpRealization,
    epDurationMin, /* setEpDurationMin — managed inside the hook */
    epVgi, setEpVgi,
    epVvgi, setEpVvgi,
    epTimestamp, setEpTimestamp,
    epWindowTimerRef, epWindowHasOpenedRef,
    resetEpState } = epValidation;
  // STALE-CLOSURE FIX (see tRef above): live mirror for the worker handler.
  const epWindowOpenRef = useRef(epWindowOpen);
  epWindowOpenRef.current = epWindowOpen;

  // ── FIX L-07: feed `recentPcPhrases` from the most recent transcribed
  //           Aud (auditor) phrases. EpValidationModal uses these as context
  //           ("what was just asked when AS-IS triggered?"). Updated lazily
  //           via an effect on `logs` so we don't touch every addLog call.
  //           No PC speech stream exists yet; if/when added, change the
  //           speaker filter below to `'PC'`.
  useEffect(() => {
    // Read in chronological order from `logs`, pull the last 5 Aud phrases.
    const next: string[] = [];
    for (let i = logs.length - 1; i >= 0 && next.length < 5; i--) {
      const e = logs[i];
      if (e.speaker !== 'Aud') continue;
      const t = (e.text || '').trim();
      if (!t) continue;
      next.unshift(t); // keep chronological order in the array
    }
    setRecentPcPhrases(prev => {
      // Only update if the slice actually changed — avoid extra renders.
      if (prev.length === next.length && prev.every((p, i) => p === next[i])) {
        return prev;
      }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs]);

  // P2P Connection states — PHASE-B step 3: moved to networkStore.
  // `showConnectionModal`, `serverLanIp`, `tunnelLoading` stay local because
  // they're UI-only / boot-only state with no cross-component consumers.
  const appMode             = useNetworkStore(s => s.appMode);
  const setAppMode          = useNetworkStore(s => s.setAppMode);
  const setModeInitKey      = useNetworkStore(s => s.setModeInitKey);
  const isConnected         = useNetworkStore(s => s.isConnected);
  const setIsConnected      = useNetworkStore(s => s.setIsConnected);
  const peerId              = useNetworkStore(s => s.peerId);
  const setPeerId           = useNetworkStore(s => s.setPeerId);
  const connectionLink      = useNetworkStore(s => s.connectionLink);
  const setConnectionLink   = useNetworkStore(s => s.setConnectionLink);
  const participantLink     = useNetworkStore(s => s.participantLink);
  const setParticipantLink  = useNetworkStore(s => s.setParticipantLink);
  const remoteStream        = useNetworkStore(s => s.remoteStream);
  const setRemoteStream     = useNetworkStore(s => s.setRemoteStream);
  const remoteBatteryLevel  = useNetworkStore(s => s.remoteBatteryLevel);
  const setRemoteBatteryLevel = useNetworkStore(s => s.setRemoteBatteryLevel);
  const remoteMuseConnected = useNetworkStore(s => s.remoteMuseConnected);
  const setRemoteMuseConnected = useNetworkStore(s => s.setRemoteMuseConnected);
  const setRemoteSignalQuality = useNetworkStore(s => s.setRemoteSignalQuality);
  const isReconnecting      = useNetworkStore(s => s.isReconnecting);
  const setIsReconnecting   = useNetworkStore(s => s.setIsReconnecting);
  const videoFallbackActive = useNetworkStore(s => s.videoFallbackActive);
  const setVideoFallbackActive = useNetworkStore(s => s.setVideoFallbackActive);
  const remoteVideoFrame    = useNetworkStore(s => s.remoteVideoFrame);
  const setRemoteVideoFrame = useNetworkStore(s => s.setRemoteVideoFrame);

  // Local UI-only flags
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  // Phone-satellite: set when the host flow is entered from LOCAL (non-solo)
  // auditing to let the PC's phone join as a co-located mic/cam/EEG satellite.
  // Under the hood this is the same robust auditor-host networking; the flag only
  // relabels the connection window so it reads "telefono-satellite" (same room),
  // not "remote auditing".
  const [satelliteMode, setSatelliteMode] = useState(false);
  // PARTICIPANT (phone) side of a satellite session: co-located with the auditor.
  // Drives the phone to be send-only (mic+cam), pair NO Muse (the Mac has it),
  // and not play the auditor's audio (anti-Larsen).
  const [pcCoLocated, setPcCoLocated] = useState(false);
  const pcCoLocatedRef = useRef(false);
  useEffect(() => { pcCoLocatedRef.current = pcCoLocated; }, [pcCoLocated]);
  const [serverLanIp, setServerLanIp]   = useState<string>('');
  const [tunnelLoading, setTunnelLoading] = useState<boolean>(false);
  // CONN-46: live P2P round-trip latency (ms). Measured on the participant
  // (PING→PONG) and relayed to the auditor so both sides show the same number.
  const [liveLatency, setLiveLatency] = useState<number | null>(null);
  // CONN-48: connection-establishment status for the startup progress window.
  const [connPhase, setConnPhase] = useState<'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'>('idle');
  const [connDetail, setConnDetail] = useState<string>('');
  // CONN-60: transient hint shown when START is pressed (local) without a MUSE.
  const [museHint, setMuseHint] = useState(false);
  /**
   * SEDUTA SENZA STRUMENTI — scelta esplicita dal selettore iniziale, non un ripiego.
   *
   * Si registra la verbalizzazione e le indicazioni del preclear senza aghi: è il gruppo di
   * controllo che manca a tutto il resto del corpus. Va etichettata, non nascosta — vedi il
   * commento nel selettore. Si azzera all'apertura di ogni seduta.
   */
  const [senzaStrumenti, setSenzaStrumenti] = useState(false);
  const senzaStrumentiRef = useRef(false);
  senzaStrumentiRef.current = senzaStrumenti;
  /** Quali strumenti si è scelto di collegare, PRIMA di far partire le connessioni. */
  /**
   * Il selettore d'apertura: TRE voci sullo stesso piano, non due più una nota a piè di pagina.
   * `none` (« senza strumenti ») è ESCLUSIVA con le altre due — vedi `scegliConn`.
   */
  const [connSel, setConnSel] = useState({ muse: false, theta: false, none: false });
  /** Spuntare una voce: « senza strumenti » e gli strumenti si escludono a vicenda. */
  const scegliConn = (k: 'muse' | 'theta' | 'none') => setConnSel(p =>
    k === 'none'
      ? { muse: false, theta: false, none: !p.none }
      : { ...p, none: false, [k]: !p[k] });

  // ── Auto-reconnect refs (participant side) ────────────────────────────────
  // Keep track of what to reconnect to after a drop
  const auditorPeerIdRef      = useRef<string>('');
  const reconnectTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectCountRef     = useRef<number>(0);
  const isReconnectingRef     = useRef<boolean>(false);
  const isConnectingRef       = useRef<boolean>(false); // FIX H2: guard against double-click
  const sessionStateSeqRef    = useRef<number>(0);     // FIX H4: seq counter for SESSION_STATE
  const lastSessionStateSeqRef = useRef<number>(0);   // FIX H4: last received seq (participant)
  const MAX_RECONNECT_ATTEMPTS = 6;
  // C1: store the original server base URL (host:port without the #peerId) so
  // refreshSignalingForReconnect() can query /api/tunnel and /api/server-info.
  const serverBaseUrlRef = useRef<string>(''); // e.g. "192.168.1.42:7893" or "abc.trycloudflare.com"
  // Auth (C1 relay token + H1 PeerJS key) — generated/fetched once per session, reused on reconnect.
  const relayTokenRef = useRef<string>('');  // FIX C1: per-link random token for relay auth
  const peerKeyRef    = useRef<string>('');  // FIX H1: static server-startup PeerJS key

  // ── EEG/PPG bandwidth-control batching ───────────────────────────────────
  // Instead of one send() per electrode reading (~21/s), we accumulate samples
  // in a ref and flush them every BATCH_MS ms → ~4 sends/s per stream.
  const BATCH_MS = 250;
  // EEG batch: each entry carries a session-time timestamp + the 12 samples.
  // ts = timeRef.current (seconds since session start) at the moment of capture.
  const eegBatchRef = useRef<Array<{ ts: number; s: number[] }>>([]); // timestamped EEG entries
  const ppgBatchRef = useRef<Array<{ ts: number; s: number[] }>>([]); // timestamped PPG entries
  // FIX CONN-30: gyro batch — previously gyro was never sent to the auditor,
  // so the GYRO panel stayed dead in remote mode. Batched like EEG/PPG.
  const gyroBatchRef = useRef<Array<{ x: number; y: number; z: number }>>([]);
  const eegBatchTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const ppgBatchTimer  = useRef<ReturnType<typeof setInterval> | null>(null);
  const gyroBatchTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // CONN-39: Web Audio playback context for the relayed audio (fallback mode).
  // Lazily created on first chunk; `nextTime` schedules gap-less playback.
  const audioRxRef = useRef<{ ctx: AudioContext; nextTime: number } | null>(null);

  // PHASE-A: `needleInMotion` + motion timer migrated into needleEngine.
  // Worker handler reads `needleEngine.isInMotion`; setters call
  // `needleEngine.beginMotion(ms)` / `needleEngine.clearMotion()`.

  const [processusPdfs, setProcessusPdfs] = useState<{name: string; url: string; tag: string; _id?: string}[]>([]);
  const [activeProcessus, setActiveProcessus] = useState<{id: number; name: string; url: string}[]>([]);
  const [pendingFiles, setPendingFiles] = useState<{name: string; url: string}[]>([]);
  const [pendingTagInput, setPendingTagInput] = useState('');
  const [processusTagFilter, setProcessusTagFilter] = useState<string>('all');
  const [editingTag, setEditingTag] = useState<string | null>(null);   // tag currently being renamed
  const [editingTagValue, setEditingTagValue] = useState<string>('');  // new name input
  const [sessionObjective, setSessionObjective] = useState('');
  
  // Buffer per evitare crash -2 con dati ad alta frequenza
  const [sessionProcessObjective, setSessionProcessObjective] = useState('');
  const [sessionPhysicalCheck, setSessionPhysicalCheck] = useState('');
  const [sessionBriefing, setSessionBriefing] = useState('');

  // FIX cleanup: dropped `handleTrimAdjustment`/`handleTrimMode` and the
  // matching `isTrimMode` state — UI that bound them was removed; the Trim
  // drawer in SidebarDrawer now writes `needleTrim` directly.

  // Profile State — PHASE-B step 2: activeProfile + sessionCount in profileStore.
  const activeProfile    = useProfileStore(s => s.activeProfile);
  const setActiveProfile = useProfileStore(s => s.setActiveProfile);
  const setSessionCount  = useProfileStore(s => s.setSessionCount);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  /** La GUIDA, dentro l'app: sta nella barra accanto allo storico. Vedi `GuideModal`. */
  const [showGuide, setShowGuide] = useState(false);
  const [showReport, setShowReport] = useState(false);
  // R3: a recoverable in-progress session draft found at boot (crash recovery).
  const [recoverableDraft, setRecoverableDraft] = useState<SessionDraft | null>(null);
  // PHASE-B: theme + wallpaper migrated to `uiStore` (zustand).
  //   • `isLightTheme` is now persisted to localStorage automatically.
  //   • Consumers can read directly from the store with selector granularity
  //     instead of receiving these as props — drilling reduced incrementally.
  const isLightTheme    = useUiStore(s => s.isLightTheme);
  const wallpaperUrl    = useUiStore(s => s.wallpaperUrl);
  const showRoster      = useUiStore(s => s.showRoster);      // CONN-98: profiles roster
  const setShowRoster   = useUiStore(s => s.setShowRoster);
  const fnMode          = useUiStore(s => s.fnMode);          // style Floating Needle (5 modes)

  // (Wallpaper default now lives in uiStore initial state '/wallpapers/galaxy.jpg'
  //  and is persisted. The old seed pointed at '/wallpaper.jpg' — a 404 — and ran
  //  on every empty boot, overriding the rehydrated choice. Removed.)

  // Glass: publish the UI-transparency level as a CSS var on :root so every
  // `.sm-glass` group (overlays + panels, never the needle) picks it up.
  const uiAlpha = useUiStore(s => s.uiAlpha);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-alpha', String(uiAlpha));
  }, [uiAlpha]);

  // ── Unified glass style for all panels (light / dark) ────────────────────
  // SANS FOND (choix utilisateur) : chaque zone repose sur le FOND UNIQUE de l'app. On garde
  // juste un liseré arrondi discret pour délimiter — plus de fond/blur/ombre de panneau.
  const panelStyle = (extra?: React.CSSProperties): React.CSSProperties => isLightTheme
    ? { background:'transparent', border:'1px solid rgba(60,64,72,0.16)', ...extra }
    : { background:'transparent', border:'1px solid rgba(255,255,255,0.08)', ...extra };

  useAppInitializer({ setProcessusPdfs });

  // Update session count
  useEffect(() => {
    if (activeProfile) {
      const sessions = getSessionsByProfile(activeProfile.id);
      setSessionCount(sessions.length);
    } else {
      // Fallback : sessions du profil _default
      try {
        const sessions = getSessionsByProfile('_default');
        setSessionCount(sessions.length);
      } catch {
        setSessionCount(0);
      }
    }
  }, [activeProfile, showReport, showHistoryModal]);

  // Sync profile changes — DEBOUNCED 600 ms. Un-debounced, every keystroke in
  // the auditor-name field wrote the profile to storage AND created a fresh
  // activeProfile object (re-triggering its dependent effects).
  useEffect(() => {
    if (!activeProfile) return;
    const id = setTimeout(() => {
      const updatedProfile = {
        ...activeProfile,
        name: auditorName,
        preferences: {
          lang,
          soloMode: isSoloSession
        }
      };
      saveProfile(updatedProfile);
      setActiveProfile(updatedProfile);
    }, 600);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditorName, lang, isSoloSession]);

  // L'auditeur change la langue de la séance EN COURS → la repousser au téléphone (préclair)
  // pour que son écran (mic/cam local, mirror « prêt », bannières) suive, pas seulement à la
  // connexion. (Le participant n'émet pas ce message : c'est l'auditeur qui pilote la langue.)
  useEffect(() => {
    if (appMode === 'auditor' && isConnected) {
      try { networkManager.send({ type: 'LANG', lang }, true); } catch (_) {}
    }
  }, [lang, appMode, isConnected]);

  // Handle Solo Session toggle — cam visibility flips ONLY when the solo flag
  // itself changes. (It used to depend on auditorName too, so renaming the
  // auditor force-reshowed a cam the user had deliberately hidden.)
  useEffect(() => {
    if (isSoloSession) setCam1Visible(false); // Turn off Auditor Cam
    else setCam1Visible(true);                // Turn Auditor Cam back on
  }, [isSoloSession]);
  // Solo session: the single user IS the preclear. Label the PC as "SOLO" (not
  // the auditor's name) everywhere the PC name is shown — live UI, report, PDF,
  // History, the PDF filename — since there is no separate preclear.
  useEffect(() => {
    if (isSoloSession) setPcName('SOLO');
  }, [isSoloSession, auditorName]);
  // SOLO: the auditor IS the preclear, and there is no PC card to read the sex from →
  // drive the Tone-Arm baseline (m→3, f→2) from the active auditor's own sex instead.
  useEffect(() => {
    if (isSoloSession) setPcSex(activeProfile?.sex);
  }, [isSoloSession, activeProfile?.sex, setPcSex]);

  // FIX MUSE-REMOTE: auditor heartbeat — timestamp of the last RAW_EEG actually RECEIVED
  // from the preclear over the network. Lets the auditor tell "MUSE really streaming into
  // this session" from "MUSE connected to another program / not forwarding" (frozen needle).
  const lastRemoteEegAtRef = useRef(0);
  // DIAGNOSTIC séance à distance : a-t-on VU au moins un paquet EEG du préclair sur ce lien ?
  // (log unique par connexion → dit si les données traversent réellement le canal P2P.)
  const remoteEegSeenRef = useRef(false);
  const [remoteMuseStreaming, setRemoteMuseStreaming] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  // #2: on Android Chrome, SpeechRecognition.start() is blocked unless it is
  // called from a user gesture. The preclear's session starts REMOTELY (no tap),
  // so the auto-start was silently denied and the auditor never saw the PC.
  // `pcMicArmed` tracks whether the preclear has tapped the mic banner to grant
  // the gesture; once armed, recognition runs (and onend auto-restarts it).
  const [pcMicArmed, setPcMicArmed] = useState(false);
  // Ref mirror so the long-lived Web-Speech onend/onerror closures (created once)
  // can see the latest armed state without being re-registered.
  const pcMicArmedRef = useRef(false);
  // CONN-82: one-shot diagnosis flags — relay to the auditor whether the PC's
  // recognizer actually OPENED the mic and HEARD speech, to pinpoint where the
  // chain breaks (mic contention with WebRTC vs. no recognition).
  const pcAudioStartLoggedRef = useRef(false);
  const pcSpeechStartLoggedRef = useRef(false);
  // CONN-83: AUDITOR-SIDE transcription of the preclear. Instead of fighting
  // Android (mic contention with WebRTC, gesture rules), the auditor runs its own
  // Whisper instance on the PC's incoming WebRTC audio and labels it 'PC'. The
  // preclear's device does nothing. This is the reliable path.
  const pcWhisperRef = useRef<OfflineSpeechRecognition | null>(null);

  
  // Keep a ref to sessionState for the speech recognition onend handler
  const sessionStateRef = useRef(sessionState);
  useEffect(() => {
    sessionStateRef.current = sessionState;
  }, [sessionState]);

  // Keep a ref to appMode so Muse subscriptions (set up once) always use the current value
  const appModeRef = useRef(appMode);
  useEffect(() => {
    appModeRef.current = appMode;
  }, [appMode]);
  // Phone-satellite: the Muse is paired DIRECTLY to this Mac (low-latency needle),
  // while the phone supplies only mic+cam. The network role is 'auditor', so the
  // EEG data router (set up once inside the Muse subscriptions) needs a ref to
  // know it must feed the LOCAL worker — exactly like local mode — even though
  // appMode is 'auditor'. Kept as a ref for the same reason as appModeRef.
  const satelliteModeRef = useRef(satelliteMode);
  useEffect(() => {
    satelliteModeRef.current = satelliteMode;
  }, [satelliteMode]);

  // Metrics state
  const [displayMass, setDisplayMass] = useState(0); // Mental Mass (SOL-km) displayed
  // REAL contact (HSI-like) — la fascia fa contatto EEG plausibile? Deriva dal segnale
  // (banda fisiologica + assenza di railing/saturazione da elettrodi flottanti), perché
  // muse-js non espone l'HSI del device. `signalQuality`/`museContact` vengono ora da
  // `hooks/useMuseContactGate` (fase 6) — dichiarati più sotto, dopo `eegBuffer`.


  // FIX MUSE-REMOTE (auditor): the preclear's MUSE is only "streaming into this session"
  // when its status is connected AND fresh EEG is actually arriving over the network. If
  // the headset is bonded to another program (its own Equilibrium) the status can read
  // connected while no data flows → we must NOT show a reassuring "MUSE ✓" over a frozen
  // needle. BATCH_MS=250 ms → a 5 s gap is unambiguous packet-loss/no-stream.
  useEffect(() => {
    if (appMode !== 'auditor') { setRemoteMuseStreaming(false); return; }
    const id = setInterval(() => {
      const live = remoteMuseConnected && (Date.now() - lastRemoteEegAtRef.current < 5000);
      setRemoteMuseStreaming(prev => (prev === live ? prev : live));
    }, 1000);
    return () => clearInterval(id);
  }, [appMode, remoteMuseConnected]);

  // ── MODULATION NEURO-ACOUSTIQUE ───────────────────────────────────────────
  const {
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
    resetMnaSession } = useMnaModule();

  // NEST V3 specific metrics
  // FIX B-10: removed write-only state `rhoG`, `tZone`, `msSol`. Their values
  // came from the worker payload and were never consumed by render — the
  // worker's local destructure is used directly inside the handler. Wasted
  // re-renders eliminated. If a future UI panel needs them, re-add as needed.
  // CONN-122: vProc/smoothVProc/qL/eta/vSol/toneArm/totalTa moved to metricsStore.
  // Smoothed vProc for display only — EMA α=0.15 (~1.5 s lag @ 4 Hz updates)
  // Avoids wild peaks from instantaneous Goertzel spikes rendering as noisy jumps.
  // NEST V5 velocity model (qlHist window + smoothVProc EMA + baseline + velRatio)
  // → moved to engine/VelocityTracker (SessionEngine slice 1).
  // (MNA capture window → engine/PrimeFreqTracker, SessionEngine slice 2.)
  // CONN-68/PERF: la gola degli 21 Hz del worker → 10 Hz UI e i 2 Hz del grafico/CSV
  // vivono ora in `hooks/useChargeEngine` (fase 6) — non più qui.
  const [hardwareError, setHardwareError] = useState<string | null>(null);
  const [realBpm, setRealBpm] = useState<number | null>(null);
  // BPM staleness: the worker only emits BPM_UPDATE when the PPG autocorrelation
  // finds a clear beat. The Muse 2's forehead PPG is weak for heart-rate, so when
  // it degrades the worker stops emitting and the LAST value used to stay frozen on
  // screen (e.g. "72" for a whole session — misleading). We timestamp each update
  // and blank the BPM to "--" if none arrives for a while (see effect below).
  const lastBpmAtRef = useRef(0);
  // PHASE-A: smoothed BPM lives in `bpmSmoother`. UI subscribes via useSyncExternalStore.
  const displayBpm = useSyncExternalStore(bpmSmoother.subscribe, bpmSmoother.getDisplay);
  // PHASE-A: biometric integrity bar lives in `integrityTracker` (target-EMA + 10 Hz tick).
  const smoothPct  = useSyncExternalStore(integrityTracker.subscribe, integrityTracker.getCurrent);
  const needleReactionRef = useRef<string>('Set'); // for T60 detection in closure
  // toneArm smoothing + Total-TA high-water → moved to engine/TaAccumulator (slice 1).
  // `stableReleaseState`/`stableReleaseStateRef` vivono ora in `hooks/useStableReleaseState`
  // (fase 6) — la chiamata sta più sotto, dopo `needleReactionKeyRef` (ne ha bisogno).

  // FIX B-10: removed `[sessionTaSum, setSessionTaSum]` and
  // `[sessionTaCount, setSessionTaCount]` — write-only state that backed the
  // already-deleted `averageTa` consumer.

  // FIX cleanup: removed `averageTa` (computed, never displayed),
  // `[totalPositiveTa, setTotalPositiveTa]` (shadow of `totalTa`, both got
  // the same increment), and `prevPositionRef` (unused ref).

  // (TA high-water accumulator state lives in engine/TaAccumulator.)

  // PHASE-A: needle position now lives in `needleEngine` (runtime singleton).
  // React subscribes via useSyncExternalStore — the rest of the file keeps
  // reading `needleOffset` as a regular value. setNeedleOffset is replaced by
  // `needleEngine.setTarget(...)` at the call sites.
  const needleOffset = useSyncExternalStore(needleEngine.subscribe, needleEngine.getPos);
  // VIRTUAL needle offset history = qlToNeedlePos(predicted qL) each tick. The reaction
  // classifier reads THIS (the continuous charge signal), NOT the visible needle — so the
  // visible needle can stay at SET (moving only for reads) without starving the classifier.
  const needleVirtualRef = useRef<{ time: number; offset: number }[]>([]);

  // ── FUNZIONE DI RESET CENTRALIZZATA ──
  /** Rimando al ricentraggio delle lattine — vedi la nota accanto all'assegnazione. */
  const thetaResetRef = useRef<(() => void) | null>(null);
  /** Le boîtes sono collegate? Serve dentro handleStart, che è definita PRIMA del hook. */
  const thetaConnectedRef = useRef(false);
  /** TA dell'ago VERO, per i punti del codice che girano fuori dal render (cicli, archivio). */
  const thetaTaRef = useRef<number | null>(null);

  const resetNeedle = useCallback(() => {
    needleEngine.reset(() => {
      if (workerRef.current) {
        workerRef.current.postMessage({ type: 'RESET_SYSTEM' });
        workerRef.current.postMessage({ type: 'MANUAL_SET_RESET' });
      }
    });
    // Keep the hidden classifier spring + its history in sync with the reset.
    virtualNeedle.reset();
    needleVirtualRef.current = [];
    // L'ago delle LATTINE torna a SET con lo STESSO gesto: clic sul quadrante o barra
    // spaziatrice. Sono due aghi sullo stesso quadrante, ricentrarne uno solo lascerebbe
    // l'altro dov'era senza che si capisca perché.
    thetaResetRef.current?.();
  }, []);

  // Allow resetting needle with spacebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      // BUGFIX: the old check only excluded <input>, so pressing Space inside a
      // <textarea> (EP cognition, Next C/S, briefing, objective…) was swallowed to
      // reset the needle → typed words came out WITHOUT spaces. Exclude every
      // editable target (input / textarea / select / contenteditable).
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el?.isContentEditable;
      if (isEditable) return; // let Space type normally
      e.preventDefault();
      resetNeedle();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [resetNeedle]);

  // BPM staleness watchdog: if no fresh BPM_UPDATE arrived for ~8 s (weak PPG),
  // blank the reading to "--" instead of leaving a misleading frozen number on
  // screen for the whole session.
  useEffect(() => {
    const id = setInterval(() => {
      if (lastBpmAtRef.current && Date.now() - lastBpmAtRef.current > 8000) {
        lastBpmAtRef.current = 0;
        bpmSmoother.reset();
        setRealBpm(null);
      }
    }, 3000);
    return () => clearInterval(id);
  }, []);

  // (lastReaction removed — was fed by the now-deleted TMI reaction; the single
  //  reaction source is needleReactionKey from the movement-based ReactionClassifier.)
  // Défaut = SET (aiguille au repos), PAS F/N : au démarrage / à l'arrêt il n'y a aucune
  // oscillation, donc on n'affiche pas F/N tant qu'un vrai float n'a pas été détecté.
  const [needleReaction, setNeedleReaction] = useState('Set');
  const [needleReactionKey, setNeedleReactionKey] = useState('reaction_none');
  const needleReactionKeyRef = useRef(needleReactionKey);
  needleReactionKeyRef.current = needleReactionKey;

  /**
   * ── « LIBERAZIONE ATTIVA », FUORI DA QUI ────────────────────────────────────────────────
   * Fase 6. CONN-110: la libertà è il Tone Arm che SCENDE (o F/N) — non la velocità del
   * processo, che può anche voler dire massa che sale. `hooks/useStableReleaseState` legge lo
   * stesso trend del TA vero da `metricsStore`, con la stessa isteresi di 2,5 s. Serve DOPO
   * `needleReactionKeyRef` — è la reazione mostrata che dice se c'è stato un Blow Down o un F/N.
   */
  const release = useStableReleaseState({ needleReactionKeyRef });
  const { stableReleaseState, stableReleaseStateRef } = release;
  // Mot/phrase associé à la réaction actuelle (ce que l'auditeur disait quand l'aiguille a réagi)
  // (reactionContext removed — the needle reads SF/FALL/… are shown by QuantumSphere
  //  via needleReactionKey; this state was set but no longer displayed.)
  // ── AUDITING CYCLE ARM (user request) — the auditor ARMS the cycle for an
  // item (auditing question) BEFORE asking it. The cycle indicators only SHOW
  // while armed; the engines compute regardless (so the t_Item marker + cycle
  // outcome are recorded for the report and for the future Ron's Lag Δt*). ──
  const [auditingQuestion, setAuditingQuestion] = useState('');
  /**
   * L'ITEM È STATO DETTO — l'uscita a mano dalla fase « dì l'item ».
   *
   * Premendo col campo vuoto si aspetta la voce, e l'item entra in `auditingQuestion` quando la
   * trascrizione lo scrive. Ma la trascrizione può non esserci (Whisper assente, microfono
   * negato, seduta senza dettatura): allora l'item È STATO DETTO davvero — l'ha sentito
   * l'auditor — e il ciclo restava fermo a chiederlo, senza alcun modo di andare avanti.
   *
   * Questo flag è quel modo. Vale come l'item scritto: `itemNamed` è l'uno O l'altro.
   * SI AZZERA a ogni armamento e a ogni chiusura di ciclo — se no il ciclo seguente
   * salterebbe il tempo dell'item, che è il difetto che questo flag esiste per togliere.
   */
  const [itemSpoken, setItemSpoken] = useState(false);
  /**
   * « L'ITEM È STATO DETTO » — il gesto, per tutti e quattro i cicli.
   *
   * Non basta alzare il flag: va anche CHIUSA la cattura vocale dell'item, se no il chip ambra
   * « dì l'item… » resta acceso a mock-up già chiesto, e la prima parola che l'auditor dice due
   * battute dopo si prende il posto di item — cioè l'item cambia da solo a ciclo avviato.
   *
   * I tre ref sono quelli dei tre percorsi (CONTACT/NULL, MIRROR, TONE): si spengono tutti,
   * perché il gesto è uno e lo stato del ciclo dice già quale dei tre è in corso.
   */
  const dichiaraItemDetto = () => {
    setItemSpoken(true);
    cycleAwaitItemRef.current = false;
    mirrorAwaitItemRef.current = false;
    toneAwaitItemRef.current = false;
    truthAwaitItemRef.current = false;
  };
  // ── CYCLE NULL (miroir du cycle charge) — engine/NullCycleStateMachine ────────
  // À l'assessment, si l'item ne lit PAS dans la fenêtre du comm lag → l'item est NULL. On lève
  // l'ambiguïté (« null car propre » vs « null car rien ne lit ») en demandant un MOCK-UP : si la
  // charge MONTE (RISE) l'instrument+PC répondent, puis le retour à la base = EQUILIBRIUM (validé
  // par l'auditeur AVEC les VGI's). Si rien ne monte → flag « no recharging » (null non validé).
  // Lo stato dei due cicli — tipo, fase NULL, AS-IS in attesa, falso AS-IS, contatori — sta
  // in `session/useContactNullCycle`. Qui resta il ref che li alimenta dal worker EEG: quel
  // gestore si aggancia una volta sola, prima che il hook esista.
  const trackCycleRef = useRef<(t: CycleTick) => void>(() => {});
  // Ron's Lag Δt* — measured per-PC from the t_Item→leading-edge lag (LagMeter).
  const [deltaStar, setDeltaStar] = useState(0);   // 0 = no measurement yet (full Δt*)
  const [deltaStarN, setDeltaStarN] = useState(0); // # of cycles contributing
  const [deltaTrend, setDeltaTrend] = useState(0); // Kalman lag trend (ms/s; <0 = shrinking)
  const [deltaBaseline, setDeltaBaseline] = useState(0); // Δt*_baseline (Pre-Read anchor)
  const [deltaAdaptive, setDeltaAdaptive] = useState(0); // Δt*_adaptive (per-PC deviation)
  // ── Pre-session metabolic readiness check (advisory) ──────────────────────────
  const [metabolicOpen, setMetabolicOpen] = useState(false);
  // SÉANCE À DISTANCE : repère respiration reçu de l'auditeur (message P2P READINESS),
  // affiché au préclair (participant) pour qu'il suive « Inspirez / Laissez aller ».
  const [pcReadiness, setPcReadiness] = useState<{ phase: string; inhale: boolean; assessment: import('./engine/MetabolicBaseline').MetabAssessment | null } | null>(null);
  // 'idle' = not running; feed the engine only during 'baseline'/'breath'.
  const metabolicPhaseRef = useRef<'idle' | 'baseline' | 'breath' | 'result'>('idle');
  // Final pre-session assessment retained for the post-session report (the auditor
  // wants the BREATH-test result, i.e. the reactivity rating, in the report header).
  const [metabAssessment, setMetabAssessment] = useState<import('./engine/MetabolicBaseline').MetabAssessment | null>(null);
  const realBpmRef = useRef<number | null>(null);   // live BPM mirror for the readiness feed
  // PPG AUTONOMIQUE (voie vasomotrice — même sortie sympathique que le GSR du meter) : amplitude
  // du pouls + indice de perfusion AC/DC. Capturés avec chaque paire d'étalonnage TA.
  const ppgAmpRef = useRef<number | null>(null);
  const ppgPiRef  = useRef<number | null>(null);
  const signalQualityRef = useRef(0);               // live contact mirror for the readiness feed
  // `museContactRef`, `contactBadStreakRef`, `contactDiagRef` vivono ora dentro
  // `hooks/useMuseContactGate` (fase 6) — la mirror-effect di `signalQualityRef` li segue,
  // più sotto, dopo la chiamata al hook (legge `signalQuality`, che da lì viene).
  useEffect(() => { realBpmRef.current = realBpm; }, [realBpm]);
  // Gamma baseline (slow EMA) → a γ SPIKE is the earliest leading-edge marker (the
  // "Pre-Read": γ precedes the needle ~420–500 ms, measured in the Jan 2026 tests).
  const gammaEmaRef = useRef(0);
  // ── CORPUS — riferimenti per le righe d'archivio ─────────────────────────────────────────
  /** Identificativo della seduta corrente. Lega fra loro le sue righe; vuoto fuori seduta,
   *  perché una reazione senza seduta non si sa a che configurazione appartenga. */
  const corpusSessionRef = useRef('');
  /** Carica (qL) al CONTATTO e TA all'inizio del ciclo. Vanno presi quando succedono: a fine
   *  ciclo la carica è per definizione andata, e leggerla lì darebbe sempre ~0. */
  const cycleQlAtContactRef = useRef<number | null>(null);
  const cycleTaStartRef = useRef<number | null>(null);
  /** Specchio del procedimento indicato: finalizeCycle viene chiamato anche da callback
   *  registrati una volta sola, dove lo stato React sarebbe quello di allora. */
  const sessionProcObjRef = useRef('');
  /** F/N dell'EEG in attesa di scrittura. Si TIENE in sospeso perché il campo che conta —
   *  « su questo F/N è stato dichiarato l'AS-IS » — si sa solo DOPO, quando l'auditor valida.
   *  Scritto alla validazione, all'F/N successivo, o a fine seduta. */
  const pendingEegFnRef = useRef<{ tSec: number; ta: number } | null>(null);
  /** F/N dell'ago vero in corso: si scrive quando FINISCE, con ampiezza, ritmo e durata veri. */
  const thetaFnOpenRef = useRef<{ tSec: number } | null>(null);
  /** Scrive l'F/N dell'EEG rimasto in sospeso. `asIs` dice se l'auditor ha dichiarato l'AS-IS
   *  su QUESTO F/N: è il legame fra l'indicatore e la decisione, e senza di esso non si potrebbe
   *  sapere se un AS-IS dichiarato fosse confermato dall'ago vero. */
  const flushEegFn = (asIs: boolean) => {
    const p = pendingEegFnRef.current;
    pendingEegFnRef.current = null;
    if (!p || !corpusSessionRef.current) return;
    corpusWrite(fnRecord(corpusSessionRef.current, new Date().toISOString(), {
      src: 'eeg', tSec: p.tSec, ta: p.ta,
      durSec: Math.max(0, timeRef.current - p.tSec) || undefined,
      asIs: asIs || undefined,
      proc: sessionProcObjRef.current.trim() || undefined,
    }));
  };
  /** Arme un cycle pour l'item courant. Les DEUX cycles s'arment MANUELLEMENT et SÉPARÉMENT
   *  (demande utilisateur — aucune bascule automatique) :
   *    • 'charge' (bouton START) → CONTACT → DISCHARGE → AS-IS
   *    • 'null'   (bouton NULL)  → NULL → RISE → EQUILIBRIUM (mock-up, VGI's) */
  // ── R&I — SOLO GLI ITEM CHE L'AUDITOR SCRIVE ───────────────────────────────────────────
  // Le reazioni di seduta aprivano una riga da validare ciascuna. In una seduta sono decine:
  // la vista MANUALE si riempiva di « DISSOLUZIONE · Tick » e l'auditor non ci trovava più
  // quello che aveva scritto lui. Restano nel journal e nell'archivio, dove servono.
  const riIdRef = useRef(0);

  /**
   * L'auditor ha trovato un item in un ALTRO modo e lo scrive: il preclear l'ha detto, oppure è
   * uscito da una domanda di auditing, oppure non ha fatto reagire l'ago ma gli indica lo stesso.
   * `quandoSec` viene dalla proposta (l'istante in cui quella parola è stata DETTA); senza, la
   * riga si data ad adesso.
   */
  const aggiungiItemManuale = useCallback((testo: string, quandoSec?: number) => {
    const t = quandoSec ?? timeRef.current;
    const muse  = computeInstantRead(shownReadsRef.current, t, -Infinity, Infinity, 'eeg').read;
    const meter = computeInstantRead(shownReadsRef.current, t, -Infinity, Infinity, 'theta').read;
    const scelta = agoPrincipaleRef.current === 'theta' ? meter : muse;
    setAssessSession(prev => [...prev, {
      id: `ri-${++riIdRef.current}`, time: t, kind: 'manual', item: testo,
      reaction: scelta, readSrc: agoPrincipaleRef.current,
      readMuse: instrumentsRef.current.muse ? muse : undefined,
      readMeter: instrumentsRef.current.theta ? meter : undefined,
    }]);
    logBufferRef.current.push({ time: t, speaker: 'NEEDLE',
      text: `◎ R&I · ${testo} → ${scelta === 'NULL'
        ? LC('nessuna reazione (NULL)', 'aucune réaction (NULL)', 'no read (NULL)',
             'sin reacción (NULL)', 'ingen reaktion (NULL)') : scelta}`,
      type: scelta === 'NULL' ? 'normal' : 'success' });
  }, []);

  /**
   * Quella parola è già stata DETTA in seduta? E che cosa fece l'ago in quel momento?
   *
   * Cerca l'ultima frase del preclear o dell'auditor che la contiene — a meno di maiuscole e
   * accenti, perché la trascrizione non restituisce mai la stessa stringa due volte. Senza
   * questa proposta l'item scritto a mano verrebbe datato ADESSO, e gli si attribuirebbe un ago
   * che in quel momento non stava reagendo a lui.
   */
  const cercaLetturaPerParola = useCallback((testo: string) => {
    const ago = chiaveItem(testo);
    if (!ago) return null;
    // Dalla PIÙ RECENTE all'indietro: se una parola ricorre, quella che interessa è l'ultima.
    for (let i = logsRef.current.length - 1; i >= 0; i--) {
      const l = logsRef.current[i];
      if (l.speaker !== 'PC' && l.speaker !== 'Aud') continue;
      if (!chiaveItem(l.text).includes(ago)) continue;
      const muse  = computeInstantRead(shownReadsRef.current, l.time, -Infinity, Infinity, 'eeg').read;
      const meter = computeInstantRead(shownReadsRef.current, l.time, -Infinity, Infinity, 'theta').read;
      return {
        tSec: l.time, frase: l.text,
        read: agoPrincipaleRef.current === 'theta' ? meter : muse,
        readMuse: muse, readMeter: meter,
      };
    }
    return null;
  }, []);

  /** L'auditor registra la risposta del preclear. Si può cambiare idea: la riga si riscrive. */
  const segnaIndicazione = useCallback((id: string, indica: boolean) => {
    setAssessSession(prev => prev.map(a => (a.id === id ? { ...a, indica } : a)));
    const riga = assessSessionRef.current.find(a => a.id === id);
    if (corpusSessionRef.current && riga) {
      // In archivio è una riga `item` come le altre: porta le due letture e il verdetto del
      // preclear. Il TESTO non ci entra mai — solo la classificazione.
      corpusWrite(itemRecord(corpusSessionRef.current, new Date().toISOString(), riga.time,
        { read: riga.reaction, readMuse: riga.readMuse, readMeter: riga.readMeter,
          indica }));
    }
    logBufferRef.current.push({ time: timeRef.current, speaker: 'PC',
      text: indica
        ? LC('la reazione indica', 'la réaction indique', 'the read indicates',
             'la reacción indica', 'avläsningen indikerar')
        : LC('la reazione NON indica', 'la réaction n\'indique PAS', 'the read does NOT indicate',
             'la reacción NO indica', 'avläsningen indikerar INTE'),
      type: indica ? 'success' : 'normal' });

    // ⚠️ QUI C'ERA L'AVANZAMENTO AUTOMATICO DEL CICLO TONE. Serviva alle fasi « positivo o
    // negativo? » e « quante divisioni? »: l'auditor enunciava le risposte, il modulo
    // ASSESSMENT le raccoglieva, e indicandole il ciclo passava al tempo dopo.
    //
    // Quelle due fasi non esistono più — i comandi di Ron sono due, e nessuno dei due è un
    // assessment a risposte. Con loro se n'è andato `matchToneAnswer`, che riconosceva
    // « negativo » e « trenta » nelle cinque lingue.
  }, []);

  // ── ASSESSMENT — ajoute un item assessé + calcule son READ instantané. Le read est un
  //    CHANGEMENT de la réaction (pas l'état déjà en cours) à l'instant = fin du mot − retard de
  //    comm (même logique que R&I → computeInstantRead). Aucun changement → « — » (NUL). ──
  const addAssessItem = (word: string, tSpeak: number) => {
    const w = word.trim();
    if (!w) return;
    const id = `as-${++assessIdRef.current}`;
    const pending = '⏳';
    freeNeedleForNewItem();   // l'aiguille se libère pour pouvoir réagir à CET item
    const item: AssessItem = { id, time: tSpeak, item: w, reaction: pending, beforeMs: 0, kind: 'item' };
    setAssessSession(prev => [...prev, { ...item }]); // module ASSESSMENT (toute la séance)
    const cyc = assessCyclesRef.current[assessCyclesRef.current.length - 1];
    const rec = { item: w, reaction: pending, time: tSpeak, beforeMs: 0 };
    if (cyc) cyc.items.push(rec);
    // PAS de slittamento : le read est cherché AUTOUR de l'item ; beforeMs = combien AVANT il est
    // survenu (toujours signe « − » côté UI ; pas de read latent).
    // Attesa = la finestra dell'ago che si sta usando. Con le boîtes collegate bisogna dare
    // tempo alla latenza elettrodermica: decidere a 0,15 s vorrebbe dire concludere « NULL »
    // prima che l'ago abbia cominciato a muoversi.
    const attesaS = readWaitSeconds(thetaConnectedRef.current);
    const notBefore = assessPrevAtRef.current + 0.05;   // jamais la lecture de l'item PRÉCÉDENT
    assessPrevAtRef.current = tSpeak;
    assessTimesRef.current.push(tSpeak);
    ultimoItemSecRef.current = tSpeak;
    // GRUPPO di ripetizione: se queste parole sono già state date, l'item riceve lo STESSO
    // numero. È così che l'archivio sa « questo è lo stesso item del terzo » senza contenere
    // la parola. La riga si scrive quando la lettura è decisa (in `chiudi`), non adesso.
    const chiave = chiaveItem(w);
    let gruppo = gruppiItemRef.current.get(chiave);
    if (gruppo === undefined) {
      gruppo = gruppiItemRef.current.size + 1;
      gruppiItemRef.current.set(chiave, gruppo);
    }
    if (assessTimesRef.current.length > SHOWN_READS_CAP) assessTimesRef.current.shift();
    // ── SI SCRIVE APPENA L'AGO REAGISCE, NON A FINE FINESTRA ──────────────────────────────
    // Aspettare i 3,5 s della latenza elettrodermica prima di dire QUALUNQUE cosa lasciava
    // l'auditor davanti a una clessidra mentre l'ago era già caduto: la lettura arrivava sempre
    // in ritardo. Si guarda quindi la finestra a piccoli passi e si SCRIVE SUBITO la lettura
    // appena c'è. `computeInstantRead` rende sempre la lettura più FORTE della finestra, quindi
    // ripetendola il valore può solo salire: se dopo la SF arriva una fall, la scritta si
    // aggiorna. Il journal, lui, si scrive UNA volta sola, alla chiusura, col valore definitivo.
    const PASSO_MS = 200;
    const finoASec = tSpeak + attesaS;
    let ultimaMostrata = '';
    const guarda = () => {
      // Limite in AVANTI = l'item SEGUENTE, se c'è già stato. Con la finestra delle boîtes
      // (3,5 s avanti) e item dati ogni secondo, senza questo il primo item si prenderebbe le
      // reazioni di quelli dopo. Si conosce solo ADESSO: quando l'item è stato dato non c'era.
      const next = assessTimesRef.current.find(x => x > tSpeak + 0.05);
      const notAfter = next !== undefined ? next - 0.05 : Infinity;
      // SOURCE = réactions RÉELLEMENT MONTRÉES (jamais le flux brut du classifieur)
      // …e SOLO dall'ago mostrato: una lettura presa dall'altro racconterebbe un movimento che
      // l'auditor non ha davanti agli occhi.
      // SENZA STRUMENTI non si calcola nulla: non c'è ago che possa aver letto. Scrivere
      // « NULL » qui vorrebbe dire mettere a verbale un verdetto mai emesso (vedi
      // READ_NON_MISURATO). Il trattino dice che la lettura non è pervenuta.
      const r = noInstruments(instrumentsRef.current)
        ? { read: READ_NON_MISURATO, beforeMs: 0, afterMs: 0 }
        : computeInstantRead(shownReadsRef.current, tSpeak, notBefore, notAfter,
                             agoPrincipale);   // 'NULL' si rien de vu
      if (r.read !== 'NULL' && r.read !== ultimaMostrata) {
        ultimaMostrata = r.read;
        rec.reaction = r.read; rec.beforeMs = r.beforeMs;   // le record du rapport partage l'objet
        setAssessSession(prev => prev.map(a => a.id === id ? { ...a, reaction: r.read, beforeMs: r.beforeMs } : a));
      }
      return r;
    };
    const chiudi = () => {
      const { read, beforeMs, afterMs } = guarda();
      // ── LE DUE LETTURE, SEPARATE ────────────────────────────────────────────────────────
      // `read` è quella dell'ago mostrato. Ma i due leggono item DIVERSI — su 89 item ne hanno
      // letto uno solo insieme — e la vista INDICAZIONE le mette a confronto riga per riga: un
      // verdetto unico nasconderebbe proprio il dato che si cerca.
      const nextT = assessTimesRef.current.find(x => x > tSpeak + 0.05);
      const nA = nextT !== undefined ? nextT - 0.05 : Infinity;
      const rMuse  = computeInstantRead(shownReadsRef.current, tSpeak, notBefore, nA, 'eeg').read;
      const rMeter = computeInstantRead(shownReadsRef.current, tSpeak, notBefore, nA, 'theta').read;
      {
        // La scritta compare adesso in ogni caso, anche se `guarda()` non l'aveva mostrata:
        // senza questo un item senza reazione resterebbe sul suo « ⏳ » per sempre.
        rec.reaction = read; rec.beforeMs = beforeMs;
        const patch = { reaction: read, beforeMs, readSrc: agoPrincipale,
                        readMuse: instruments.muse ? rMuse : undefined,
                        readMeter: instruments.theta ? rMeter : undefined };
        setAssessSession(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a));
      }
      // ── DIAGNOSI ASSESSMENT (temporanea, da togliere quando avremo capito) ─────────────
      // « Nessuna reattività col meter » può venire da quattro punti diversi, e senza numeri
      // sarebbe l'ennesima ipotesi. Questa riga dice, per OGNI item: quando è finita la parola,
      // di quanto l'ho retrodatata (e se il riconoscitore me l'ha detto o l'ho indovinato), che
      // letture c'erano intorno, e quali sono cadute fuori dalla finestra.
      {
        const b = sttBackdateRef.current;
        const fin = readWindow('theta');
        const vicine = shownReadsRef.current
          .filter(r => Math.abs(r.time - tSpeak) <= 4)
          .map(r => {
            const d = r.time - tSpeak;
            const w = readWindow(r.src);
            const dentro = d >= -w.before && d <= w.after;
            return `${r.src ?? 'eeg'}:${r.reaction}${d >= 0 ? '+' : ''}${Math.round(d * 1000)}ms${dentro ? '' : '✗'}`;
          });
        // L'AGO SI È MOSSO? Domanda diversa da « ha prodotto una lettura », e senza risposta
        // non si sa se il difetto è nella sensibilità, nelle soglie o nel classificatore.
        const e = theta.escursione(tSpeak - 1, tSpeak + 3);
        const verdettoAgo = e.campioni === 0 ? 'nessun dato dall\'ago'
          : e.span < 0.02 ? `ago FERMO (span ${e.span.toFixed(3)}, posato a ${e.a.toFixed(2)})`
          : `ago mosso di ${e.span.toFixed(3)} [${e.da.toFixed(2)}→${e.a.toFixed(2)}]`
              // QUANDO è avvenuto il movimento, rispetto alla fine della parola. È la sola cosa
              // che distingue una reazione da una deriva: una reazione segue l'item, una deriva
              // capita quando capita. Senza questo, abbassare la soglia sarebbe tirare a caso.
              + ` · picco a ${((e.tMax - tSpeak) >= 0 ? '+' : '')}${((e.tMax - tSpeak) * 1000).toFixed(0)}ms`
              + (e.deriva ? ' · DERIVA (va in una direzione sola, non è una reazione)' : '')
              + `${e.span < THETA_REACT_TICK ? ` — SOTTO il tick (${THETA_REACT_TICK})` : ' — sopra il tick'}`;
        logBufferRef.current.push({ time: tSpeak, speaker: 'SYS',
          text: `⟨diag⟩ « ${w} » fineParola=${tSpeak.toFixed(2)}s · `
              + `strumenti ${[instruments.muse && 'MUSE', instruments.theta && 'METER'].filter(Boolean).join('+') || 'nessuno'} · `
              + `moduli ${Object.entries(moduleVis).filter(([, v]) => v).map(([k]) => k).join(',') || 'nessuno'} · `
              + `${isElectron ? 'desktop' : 'BROWSER'} · STT ${sttEngineRef.current} · `
              + (() => { const c = corpusStato();
                  return `corpus ${c.disco ? '' : 'SENZA DISCO '}${c.scritte}/${c.accodate}`
                       + `${c.perse ? ` (${c.perse} perse)` : ''}${c.inCoda ? ` +${c.inCoda} in coda` : ''}`
                       + `${corpusSessionRef.current ? '' : ' · SEDUTA NON APERTA'} · `; })()
              + `retrodatata ${(b.s * 1000).toFixed(0)}ms `
              + `${b.misurato ? `(${b.fonte ?? 'misurata'})` : '(NON misurata)'} · `
              + `sens ${theta.setup.scaleMeasured ? 'tarata' : 'DI FABBRICA (stretta non fatta)'}`
              + `${theta.setup.sensTrim ? ` ${theta.setup.sensTrim > 0 ? '+' : ''}${theta.setup.sensTrim}` : ''} · `
              + `${verdettoAgo}${e.motion ? ' · AGITAZIONE rilevata' : ''} · `
              + `finestra −${fin.before}/+${fin.after}s · `
              + (vicine.length ? `letture: ${vicine.join(' , ')}` : 'nessuna lettura entro 4 s')
              + ` → ${read}`,
          type: 'normal' });
      }
      // CORPUS: l'occorrenza dell'item — istante, gruppo di ripetizione e LETTURA. Si scrive
      // adesso e non quando l'item è stato dato, perché la lettura si sa solo ora; l'istante
      // resta quello della fine parola. È questa riga che permette la prova della ripetibilità.
      if (corpusSessionRef.current) {
        corpusWrite(itemRecord(corpusSessionRef.current, new Date().toISOString(), tSpeak,
          { g: gruppo, read, offMs: beforeMs > 0 ? -beforeMs : afterMs,
            readMuse: instruments.muse ? rMuse : undefined,
            readMeter: instruments.theta ? rMeter : undefined }));
      }
      // Journal : read + l'écart (− avant l'item, + après). Aucun changement → « NULL ».
      const nulla = LC('nessuna reazione (NULL)', 'aucune réaction (NULL)', 'no read (NULL)',
                       'sin reacción (NULL)', 'ingen reaktion (NULL)');
      const nonMisurato = LC('non misurato (nessuno strumento)', 'non mesuré (aucun instrument)',
                             'not measured (no instrument)', 'no medido (ningún instrumento)',
                             'inte mätt (inget instrument)');
      logBufferRef.current.push({ time: tSpeak, speaker: 'NEEDLE',
        text: `ASSESSMENT · ${w} → ${read === READ_NON_MISURATO ? nonMisurato : read === 'NULL' ? nulla : `${read}${beforeMs > 0 ? ` −${beforeMs}ms` : afterMs > 0 ? ` +${afterMs}ms` : ''}`}`
            // I DUE AGHI SEPARATAMENTE, quando ci sono entrambi. Leggono item diversi (κ = −0,09):
            // un verdetto solo nasconderebbe proprio il dato che stiamo cercando.
            + (instruments.muse && instruments.theta
                ? `   [MUSE ${rMuse} · METER ${rMeter}]` : ''),
        type: read === 'NULL' ? 'normal' : 'success' });
    };
    const passo = () => {
      const _tid = window.setTimeout(() => {
        pendingTimersRef.current.delete(_tid);
        if (timeRef.current >= finoASec) { chiudi(); return; }
        guarda();
        passo();
      }, Math.max(50, Math.min(PASSO_MS, (finoASec - timeRef.current) * 1000)));
      pendingTimersRef.current.add(_tid);
    };
    passo();
  };
  /** Bouton ASSESSMENT : 1er appui = démarre (efface les items du cycle précédent) ; 2e = arrête
   *  (les items restent affichés) ; 3e = nouveau cycle (efface + recommence). */
  const toggleAssessment = () => {
    if (assessActiveRef.current) {
      // STOP — on fige le cycle courant (les items restent à l'écran).
      const cyc = assessCyclesRef.current[assessCyclesRef.current.length - 1];
      if (cyc) cyc.tEndSec = timeRef.current;
      setAssessActive(false);
      logBufferRef.current.push({ time: timeRef.current, speaker: 'NEEDLE',
        text: `◎ ASSESSMENT — ${LC('fine', 'fin', 'end', 'fin', 'slut')}`, type: 'normal' });
    } else {
      // START — nuovo ciclo. (La lista effimera sotto l'arco non c'è più: gli item stanno nel
      // modulo ASSESSMENT a destra, dove restano per tutta la seduta.)
      assessPrevAtRef.current = timeRef.current;   // borne : rien d'avant le début du cycle
      const n = ++assessNRef.current;
      assessCyclesRef.current.push({ n, tStartSec: timeRef.current, tEndSec: timeRef.current, items: [] });
      assessStartRef.current = timeRef.current;
      assessLogCursorRef.current = logs.length;   // ne capter QUE les nouvelles paroles
      // Le module ASSESSMENT s'OUVRE de lui-même : on démarre un assessment pour VOIR les items
      // et leurs reads. S'il était masqué, il fallait aller le rouvrir dans CONFIG pendant que
      // le préclear parlait déjà. (Il reste refermable à la main, et son état est mémorisé.)
      setModuleVis(v => (v.ri ? v : { ...v, ri: true }));
      setAssessOpenSignal(n => n + 1);   // …e non solo visibile: APERTO
      setAssessActive(true);
      logBufferRef.current.push({ time: timeRef.current, speaker: 'NEEDLE',
        text: `◎ ASSESSMENT — ${LC('inizio · dai gli item a voce', 'début · donne les items à voix', 'start · give items aloud', 'inicio · da los ítems en voz', 'start · ge items högt')}`, type: 'normal' });
    }
  };

  const [sensitivity] = useState(1.0); // 1.0 = default; matches qL-scale thresholds (setter dropped — no UI binding)
  // Trim controls for fine needle adjustment
  const [needleTrim, setNeedleTrim] = useState(0); // -10 to +10 trim range
  // CONN-91: "Inertia" — one control for the needle's mechanical feel, mapped to
  // the spring stiffness (k) + damping (d). 0 = light/snappy, 100 = heavy/damped.
  // Default 50 ⇒ k=32, d=14 (user: "l'ago reagisce meglio" at 50).
  const [needleInertia, setNeedleInertia] = useState(50);

  // F/N Persistence Tracking ("Regola dei 1,5s") → engine/FnTracker (slice 2).


  // PHASE-A: `timerRef` no longer needed — the 100 ms tick lives inside
  // `sessionClock`. `timeRef` is kept as a write-through mirror of
  // `sessionClock.time` so the many `timeRef.current` reads scattered in the
  // worker handler and elsewhere keep working without 40+ call-site edits.
  const workerRef = useRef<Worker | null>(null);
  const timeRef = useRef<number>(0);
  const massAccumulator = useRef<number>(0);
  const tickRef = useRef<number>(0);
  const recognitionRef = useRef<any>(null);
  // Le riconoscimento è VERAMENTE in ascolto (onstart→true, onend→false). Un watchdog usa
  // questo per auto-riavviarlo se onend non è riuscito a ripartire (start() ha lanciato) →
  // il trascritto non si ferma più da solo dopo un po'.
  const recognitionActiveRef = useRef(false);
  const sttInactiveSinceRef = useRef(0);      // depuis quand le STT devrait tourner mais ne tourne pas
  const [sttRestartKey, setSttRestartKey] = useState(0); // bump → recrée un recognizer neuf
  const localRecognitionRef = useRef<any>(null);
  const isUsingLocalRecognition = useRef<boolean>(false);
  // Anti-spam des messages STT (Whisper « loading/ready/active », natif…) : loggés AU PLUS
  // une fois par session → plus de « Whisper déconnecté/reconnecté » qui défile. Vidé au START.
  const sttMsgLoggedRef = useRef<Set<string>>(new Set());
  const logSttOnce = useCallback((key: string, text: string, type: 'normal' | 'success' | 'highlight') => {
    if (sttMsgLoggedRef.current.has(key)) return;
    sttMsgLoggedRef.current.add(key);
    journal.addSysLine(text, type);
  }, []);
  // Session data sinks (chart / reactions / metrics / qL / needle-offset trail /
  // CSV) → engine/SessionRecorder (SessionEngine slice 3).
  // Journal the CHARGE STATE as its own entry whenever it changes (debounced
  // 2.5 s) so the auditor sees the progression — EFFETTO / CAUSA / LIBERAZIONE —
  // even between needle reactions. Goes into the session log + History PDF.
  const lastLoggedChargeRef = useRef<string>('neutral');
  const chargeLogPendingRef = useRef<{ candidate: string | null; sinceMs: number }>({ candidate: null, sinceMs: 0 });
  // PHASE-A: needleOffsetRef / needleSpringRef / startNeedleSpringRef removed —
  // physics and integration live in needleEngine (src/runtime/NeedleEngine.ts).
  // (dqL/dt refs removed — dead since CONN-95 movement-based classification.)
  // (dvPeakRef removed — dead since CONN-95 switched classification to moveR.)
  // CONN-96: hold a displayed reaction for a minimum time so the eye can read it
  // before the next one replaces it (reactions were flashing by too fast).
  const reactionHoldUntilRef = useRef<number>(0);
  /** RÉACTIONS RÉELLEMENT MONTRÉES (aiguille + libellé), horodatées. C'est la SEULE source de
   *  l'ASSESSMENT / R&I : le flux brut du classifieur contient des réactions jamais affichées
   *  (avalées par le verrou de l'aiguille / le hold F/N) qu'il ne faut PAS attribuer aux items. */
  const shownReadsRef = useRef<{ time: number; reaction: string; src?: ReadSrc; episodeId?: number }[]>([]);
  /** L'ultimo item dato — in ASSESSMENT o armando un ciclo. Serve all'archivio: senza, la
   *  distanza fra una reazione e l'item non esiste, e « vede di più » non si distingue da
   *  « legge troppo ». Prima veniva solo dai cicli armati, che in assessment non ci sono: 43
   *  reazioni su 46 finivano in archivio senza sapere a che distanza dall'item fossero. */
  const ultimoItemSecRef = useRef<number | null>(null);
  /** Parole già date → numero di gruppo. Riparte a ogni seduta: i gruppi hanno senso DENTRO
   *  una seduta, non fra sedute diverse. */
  const gruppiItemRef = useRef<Map<string, number>>(new Map());
  /** Istanti degli item dati in assessment: servono a chiudere in AVANTI la finestra di un item
   *  quando ne arriva un altro (la finestra delle boîtes guarda avanti, non indietro). */
  const assessTimesRef = useRef<number[]>([]);
  /** Dernier instant (s) où une F/N était AFFICHÉE. Sert à traiter la F/N comme un ÉPISODE
   *  CONTINU : une F/N déjà en cours qui persiste (ou qui clignote une fraction de seconde et
   *  revient) n'est PAS une nouvelle réaction. Définition de l'AGO NULLO : « nessun cambiamento
   *  di comportamento o reazione alla domanda ; l'ago continua a muoversi in un modo NON
   *  influenzato dalla domanda » → pour cet item c'est NULL, pas F/N. */
  const lastFnShownAtRef = useRef(-Infinity);
  /** Sous ce délai (s), une F/N qui revient est le MÊME épisode → jamais ré-enregistrée. */
  // The kick currently in flight (raw target of the reaction the needle is showing) +
  // its flyback timer. Used so a DEEPER read can escalate a shallower in-flight kick and
  // so the top label is committed from the SAME event that moves the needle (no drift).
  const activeKickRef = useRef<{ raw: number } | null>(null);
  const kickFlybackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** NOUVEL ITEM → l'aiguille se LIBÈRE (demande utilisateur, option 2). Pendant un assessment
   *  les items s'enchaînent toutes les 1–2 s : le swing précédent verrouillait l'aiguille
   *  (jusqu'à ~2,7 s) et AVALAIT la lecture de l'item suivant — « l'aiguille ne bouge pas ».
   *  Ici on coupe le swing en cours et on ouvre une fenêtre où la PROCHAINE lecture prend la
   *  main tout de suite. (Le read lui-même n'a jamais été perdu : il vient du flux de réactions.) */
  const needleItemInterruptRef = useRef(0);
  const freeNeedleForNewItem = () => {
    if (kickFlybackRef.current) { clearTimeout(kickFlybackRef.current); kickFlybackRef.current = null; }
    needleEngine.clearMotion();
    activeKickRef.current = null;
    reactionHoldUntilRef.current = 0;               // le libellé suit lui aussi le nouvel item
    needleItemInterruptRef.current = Date.now() + ITEM_INTERRUPT_MS;
  };
  // (Dirty-needle persistence state lives in engine/ReactionClassifier.)
  // Last reaction logged to the session journal (prevents spam)
  const lastLoggedReactionRef = useRef<{ reaction: string; t: number } | null>(null);

  // Stable ref for the participant's full-screen auditor video
  const participantVideoRef = useRef<HTMLVideoElement>(null);

  // Real EEG Data Buffers
  const eegBuffer = useRef<{ [channel: number]: number[] }>({ 0: [], 1: [], 2: [], 3: [] });
  const gyroBuffer = useRef<{ x: number[]; y: number[]; z: number[] }>({ x: [], y: [], z: [] });

  /**
   * ── LA CUFFIA, FUORI DA QUI ─────────────────────────────────────────────────────────────
   * Fase 2. Il protocollo Bluetooth, il ricablaggio dei flussi, la riconnessione silenziosa e
   * la sorveglianza che corregge il badge dai dati veri stanno in `hooks/useMuseConnection`,
   * accanto a `useThetaMeter` — l'e-meter aveva già il suo modulo, la cuffia no.
   *
   * ⚠️ È il pezzo che questa macchina NON PUÒ PROVARE: ogni riga gira solo con un MUSE
   * appaiato. Punto di ritorno: l'etichetta `serenity-fase1`.
   */
  const muse = useMuseConnection({
    eegBuffer, gyroBuffer, eegBatchRef, ppgBatchRef, gyroBatchRef,
    postToWorker: (msg) => workerRef.current?.postMessage(msg),
    appMode: () => appModeRef.current,
    satelliteMode: () => satelliteModeRef.current,
    sessionRunning: () => sessionStateRef.current === 'running',
    nowSec: () => timeRef.current,
    uiTime: () => sessionClock.getWholeSeconds(),
    addLog: (e) => addLog(e as any),
    tr: (key) => t(key as never) as string,
    setBatteryLevel,
    pauseOnLoss: () => setSessionState(prev => prev === 'running' ? 'paused' : prev),
  });
  const {
    museConnection, setMuseConnection, museEverConnected, museLostLong,
    handleConnectMuse, museClientRef, lastLocalEegAtRef, bestEegElectrodeRef,
  } = muse;
  // PHASE-A: refs collapsed into runtime engines / hook-managed refs.
  //   • needleInMotionRef → needleEngine.isInMotion
  //   • needleOffsetRef   → needleEngine.pos
  //   • startNeedleSpringRef → needleEngine.setTarget
  //   • needleTrimRef     → needleEngine.trim (mirrored via setTrim below)
  // Remaining shadows still in React-land for now:
  const showEpValidationRef = useRef(showEpValidation);
  const sensitivityRef = useRef(sensitivity);

  useEffect(() => { showEpValidationRef.current = showEpValidation; }, [showEpValidation]);
  useEffect(() => { sensitivityRef.current      = sensitivity; },     [sensitivity]);
  // SENSIBILITÀ rebased: the user found the old "+5" the sweet spot, so it is now the
  // slider's 0 (default). We add a +5 baseline to every consumer of needleEngine.trim
  // (kick amplification, dirty-range factor, rest re-centering) while the slider still
  // reads 0 by default — so a shown 0 behaves like the old +5.
  useEffect(() => { needleEngine.setTrim(needleTrim + 5); },          [needleTrim]);
  // CONN-91: map the single "Inertia" 0–100 control onto the spring k + d.
  useEffect(() => {
    needleEngine.k = 42 - 0.2 * needleInertia; // 0→42 (snappy) … 100→22 (heavy)
    needleEngine.d = 4 + 0.2 * needleInertia;  // 0→4  (light)  … 100→24 (damped)
  }, [needleInertia]);

  // C-04 cleanup: tear down the engine when the App unmounts so any pending
  // RAF / timers are released. (Singleton survives across remounts in dev StrictMode.)
  useEffect(() => () => { needleEngine.destroy(); virtualNeedle.destroy(); }, []);

  // PHASE-A: BPM reset goes through bpmSmoother — no more displayBpmRef.
  useEffect(() => {
    if (sessionState !== 'running') {
      bpmSmoother.reset();
      setRealBpm(null);
    }
  }, [sessionState]);

  useEffect(() => {
    if (museConnection !== 'connected') {
      bpmSmoother.reset();
      setRealBpm(null);
    }
  }, [museConnection]);

  // ── FIX B-04: Processus PDF Blob URLs — revoke ONLY URLs that left the list ──
  // Previously this revoked every URL in the OLD list on each change, which
  // killed URLs that were still in the new list (PDFs went blank after adding
  // a sibling). We now diff prev→next and revoke only the URLs no longer
  // present. On unmount we revoke whatever is left.
  const prevProcessusUrlsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const nextUrls = new Set(
      processusPdfs.map(f => f.url).filter(u => u?.startsWith('blob:'))
    );
    // Revoke URLs that were in the previous set but are no longer present.
    prevProcessusUrlsRef.current.forEach(u => {
      if (!nextUrls.has(u)) URL.revokeObjectURL(u);
    });
    prevProcessusUrlsRef.current = nextUrls;
  }, [processusPdfs]);

  // Final unmount revoke — drops whatever is still tracked.
  useEffect(() => () => {
    prevProcessusUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
    prevProcessusUrlsRef.current.clear();
  }, []);

  // PHASE-A: biometric integrity now driven by `integrityTracker` (started here,
  // stopped on unmount). Worker handler updates the target via setTarget().
  useEffect(() => {
    integrityTracker.start();
    return () => integrityTracker.stop();
  }, []);

  // Sync remote stream to participant full-screen video element (stable — no re-assignment on every render)
  // FIX CONN-26: also re-run on isConnected so when the simplified participant
  // view (which only mounts the <video> when connected) appears, the auditor's
  // stream is (re)attached. Add a next-frame play() retry as a safety net.
  useEffect(() => {
    const el = participantVideoRef.current;
    if (!el) return;
    if (el.srcObject !== remoteStream) el.srcObject = remoteStream;
    if (remoteStream) {
      el.play().catch(() => {
        requestAnimationFrame(() => { el.play().catch(() => {}); });
      });
    }
    // Satellite (co-located): never play the auditor's audio on the phone — the
    // PC hears the auditor directly in the room, and playback would feed the
    // Larsen loop. (The host already sends an empty stream, this is belt-and-
    // suspenders.) No audio boost either.
    if (pcCoLocated) {
      el.muted = true;
      return;
    }
    // CONN-109 (#4): boost the auditor's voice (heard by the PC) above 1.0.
    const cleanup = attachAudioBoost(el, remoteStream, 4.0);
    return cleanup;
  }, [remoteStream, isConnected, pcCoLocated]);


  // Lang map pour reconnaissance vocale
  const langMap: Record<string, string> = {
    'en': 'en-US',
    'fr': 'fr-FR',
    'it': 'it-IT',
    'es': 'es-ES',
    'sv': 'sv-SE'
  };

  // Fonction pour démarrer la reconnaissance vocale locale
  const startLocalRecognition = useCallback(async () => {
    if (isUsingLocalRecognition.current) {
      return; // Déjà en cours
    }
    isUsingLocalRecognition.current = true;

    try {
      // Shared transcript handler — identical for the native and Whisper engines.
      const wireHandlers = (engine: any) => {
        engine.onresult = (event: any) => {
          if (event.results && event.results.length > 0) {
            const result = event.results[0];
            if (result.isFinal && result.transcript) {
              // ── L'ORA DELLA PAROLA, NON QUELLA DELLA TRASCRIZIONE ────────────────────────
              // Il riconoscitore dichiara la frase 900 ms DOPO che si è smesso di parlare
              // (attende il silenzio). Datare l'item a questo istante lo spostava di quasi un
              // secondo: l'instant read dell'ago — che avviene ALLA FINE DELLA PAROLA — cadeva
              // fuori dalla sua finestra, e la lettura arrivava tardi o non arrivava affatto.
              // `speechEndMs` riporta l'istante dell'ultima ipotesi parziale, cioè la fine vera.
              // Fine della parola: la dice il riconoscitore se può (nativo), altrimenti la
              // prende dal MICROFONO — l'ultimo istante con voce. Con Web Speech e con Whisper
              // è l'unica sorgente possibile, e senza di essa l'item finiva datato quasi un
              // secondo dopo la fine vera, con la lettura dell'ago fuori finestra.
              const fineParolaMs = event.speechEndMs || voiceToneAnalyzer.speechEndMs();
              const ritardoS = fineParolaMs
                ? Math.min(3, Math.max(0, (performance.now() - fineParolaMs) / 1000)) : 0;
              // DIAGNOSI ASSESSMENT (temporanea): quanto è stata retrodatata la parola, e se il
              // riconoscitore ha dato l'informazione o si è dovuto tirare a indovinare.
              sttBackdateRef.current = { s: ritardoS, misurato: !!fineParolaMs,
                                         fonte: event.speechEndMs ? 'riconoscitore' : 'microfono',
                                         mic: voiceToneAnalyzer.speechEndMs()
                                           ? Math.min(3, (performance.now() - voiceToneAnalyzer.speechEndMs()) / 1000) : -1 };
              const currentTime = Math.max(0, timeRef.current - ritardoS); // session-relative seconds
              const transcript = result.transcript.trim();
              // FIX CONN-40: attribute the speaker by DEVICE ROLE.
              const spk = appModeRef.current === 'participant' ? 'PC' : 'Aud';
              // ROGER-FIX: the native/Whisper engine never attached the voice-tone
              // chip — only the Web Speech path did — so once native STT became the
              // default (Electron), the tone disappeared from the transcript. Compute
              // it here too. Tone is shown for the PRECLEAR: the remote PC, or — in
              // local/solo mode — the single user (who IS the preclear). The remote
              // auditor's own tone stays dropped (CONN-45).
              const tone = voiceToneAnalyzer.analyze() || undefined;
              const spkTone = (spk === 'PC' || appModeRef.current !== 'auditor') ? tone : undefined;
              // Satellite (hands-free): NO push-to-talk. The auditor speaks close to
              // the Mac mic → 'Aud'; the PC is captured close by the phone → 'PC'.
              // Residual PC-leak into the Mac mic is dropped by the text dedup below.
              if (spk === 'Aud' && satelliteModeRef.current) {
                const dup = satelliteRedundancy.isRedundantAudLine(currentTime, transcript);
                if (dup.redundant) {
                  console.log(`[satellite] dropped redundant Aud line (${dup.reason}): "${transcript}"`);
                  return;
                }
              }
              addLog({ time: currentTime, speaker: spk, text: transcript, tone: spkTone, type: 'normal' });
              if (spk === 'PC') networkManager.send({ type: 'TRANSCRIPT', speaker: 'PC', text: transcript, time: currentTime, tone: spkTone }, true);
              const escapedTranscript = transcript.replace(/"/g, '""');
              const toneStr = tone ? `,${tone.label},${tone.pitch},${tone.energy}` : ',,';
              sessionRecorder.pushCsv(`${currentTime.toFixed(3)},TRANSCRIPT,${spk},"${escapedTranscript}"${toneStr}`);
              // O4: VOICE_MARKER post removed (worker never handled it).
            }
          }
        };
        engine.onerror = (event: any) => {
          console.error('STT error:', event.error);
          logSttOnce('whisper_runtime', (t('log_whisper_runtime_error') as string).replace('{err}', String(event.error)), 'highlight');
        };
      };

      // CONN-119: NATIVE macOS recognizer FIRST — it is real-time and accurate,
      // which Whisper-tiny is not (the testers confirmed Whisper transcribes but is
      // too slow/inaccurate for auditing). It needs the macOS "Speech Recognition" +
      // "Microphone" permission; on this UNSIGNED build that grant must be re-given
      // after each rebuild — the user accepts that. If the permission is missing the
      // sidecar exits (init=false) and we fall back CLEANLY to Whisper. Disable
      // native with localStorage 'sm_native_stt'='0'.
      const tryNative = (() => { try { return localStorage.getItem('sm_native_stt') !== '0'; } catch { return true; } })();
      if (tryNative) {
        nativeSpeechRecognition.lang = langMap[lang] || 'en-US';
        nativeSpeechRecognition.onresult = null;
        nativeSpeechRecognition.onerror = () => {}; // stay quiet during the probe
        const nativeOk = await nativeSpeechRecognition.init();
        if (nativeOk) {
          sttEngineRef.current = 'nativo';
          sttLangRef.current = lang;
          wireHandlers(nativeSpeechRecognition);
          localRecognitionRef.current = nativeSpeechRecognition as any;
          nativeSpeechRecognition.start();
          logSttOnce('native_active', t('log_stt_native_active') as string, 'success');
          console.log('[STT] native macOS recognizer ACTIVE (real-time)');
          return;
        }
        console.log('[STT] native unavailable (permission denied/exited) → Whisper fallback');
        logSttOnce('native_denied', LC(
          '🎙 STT nativo negato — autorizza « Riconoscimento vocale » + « Microfono » in Impostazioni, poi riavvia',
          '🎙 STT natif refusé — autorise « Reconnaissance vocale » + « Micro » dans Réglages, puis relance',
          '🎙 Native STT denied — allow "Speech Recognition" + "Microphone" in Settings, then restart',
          '🎙 STT nativo denegado — permite « Reconocimiento de voz » + « Micrófono » en Ajustes y reinicia',
          '🎙 Inbyggd STT nekad — tillåt « Taligenkänning » + « Mikrofon » i Systeminställningar och starta om'), 'highlight');
      }

      // ── Fallback: offline Whisper (WASM) ──────────────────────────────────
      offlineSpeechRecognition.onmodelstatus = (status, message) => {
        if (status === 'loading') {
          logSttOnce('whisper_loading', t('log_whisper_loading') as string, 'normal');
        } else if (status === 'ready') {
          logSttOnce('whisper_ready', t('log_whisper_ready') as string, 'success');
        } else if (status === 'error') {
          logSttOnce('whisper_error', (t('log_whisper_error') as string).replace('{msg}', message ?? '?'), 'highlight');
        }
      };

      const initialized = await offlineSpeechRecognition.init();

      if (initialized) {
        localRecognitionRef.current = offlineSpeechRecognition;
        sttEngineRef.current = 'whisper';
        wireHandlers(offlineSpeechRecognition);
        offlineSpeechRecognition.lang = langMap[lang] || 'en-US';
        offlineSpeechRecognition.start();
        logSttOnce('whisper_active', t('log_whisper_active') as string, 'success');
      } else {
        isUsingLocalRecognition.current = false;
        logSttOnce('whisper_unavailable', t('log_whisper_unavailable') as string, 'normal');
      }
    } catch (error) {
      console.error('Erreur démarrage Whisper:', error);
      isUsingLocalRecognition.current = false;
      logSttOnce('stt_disabled', t('log_stt_disabled') as string, 'normal');
    }
  }, [lang, t, logSttOnce]);

  // Initialize Speech Recognition
  useEffect(() => {
    // FIX CONN-61: in Electron, skip Web Speech entirely — it always fails (no
    // Google key) and the async error code is unreliable. Leaving recognitionRef
    // null makes handleStart() use the offline Whisper engine directly, with no
    // lost first phrase and no dependency on which error Chromium happens to throw.
    if (isElectron) {
      recognitionRef.current = null;
      return;
    }
    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      sttEngineRef.current = 'web';
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      // ESITI INTERMEDI ACCESI — non per mostrarli (si scartano), ma per SAPERE QUANDO SI È
      // SMESSO DI PARLARE. Web Speech consegna la frase definitiva a pausa finita, cioè quasi
      // un secondo dopo: datare l'item lì buttava fuori finestra l'instant read dell'ago
      // (misurato in seduta: letture a −600, −1000, −1200 ms, tutte scartate). L'ultimo esito
      // intermedio è invece l'ultima volta che si sono riconosciute parole: quella è la fine.
      recognitionRef.current.interimResults = true;

      // langMap already defined above (shared reference)
      recognitionRef.current.lang = langMap[lang] || 'en-US';
      
      recognitionRef.current.onresult = (event: any) => {
        // Un esito NON definitivo non si scrive da nessuna parte: serve solo a marcare l'ora.
        let soloIntermedi = true;
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) soloIntermedi = false;
        }
        if (soloIntermedi) { webInterimMsRef.current = performance.now(); return; }
        // Fine della parola = ultimo esito intermedio. Se non ce n'è stato (frase corta chiusa
        // di colpo), si resta sull'ora d'arrivo: meglio un dato imperfetto che uno inventato.
        // ── LA FINE DELLA PAROLA VIENE DAL MICROFONO ─────────────────────────────────────
        // Confrontati su una seduta vera (31/07/2026), i due candidati:
        //   esito intermedio  0 · 0 · 0 · 303 · 303 · 304 · 403 · 503 · 603 · 703 ms
        //   microfono       753 · 753 · 754 · 754 · 797 · 852 · 854 · 897 · 897 · 953 ms
        // L'intermedio manca un terzo delle volte (frasi corte chiuse di colpo) ed è sparso;
        // il microfono c'è sempre e sta raccolto. È anche l'unico dei due a misurare la cosa
        // vera invece di un effetto collaterale del riconoscitore.
        const micMs = voiceToneAnalyzer.speechEndMs();
        const ritardoMicS = micMs ? Math.min(3, Math.max(0, (performance.now() - micMs) / 1000)) : -1;
        const ritardoIntS = webInterimMsRef.current
          ? Math.min(3, Math.max(0, (performance.now() - webInterimMsRef.current) / 1000)) : -1;
        const ritardoS = ritardoMicS >= 0 ? ritardoMicS : Math.max(0, ritardoIntS);
        sttBackdateRef.current = { s: ritardoS, misurato: ritardoMicS >= 0 || ritardoIntS >= 0,
                                   fonte: ritardoMicS >= 0 ? 'microfono' : 'intermedio',
                                   mic: ritardoMicS };
        webInterimMsRef.current = 0;
        const currentTime = Math.max(0, timeRef.current - ritardoS); // fine parola, non arrivo
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            const transcript = event.results[i][0].transcript.trim();
            if (transcript) {
              // Analyse du ton de la voix au moment de la détection
              const tone = voiceToneAnalyzer.analyze() || undefined;
              // O4: removed VOICE_MARKER / TICK_AT_WORD_END posts to the worker — the
              // worker never handled them (the "Ron's Lag" pipeline has no consumer).

              // FIX CONN-40: speaker by device role (see Whisper handler above).
              // FIX CONN-45: voice-tone chip is only meaningful for the PRECLEAR
              // (their emotional charge). The auditor's tone is noise → drop it.
              const spk = appModeRef.current === 'participant' ? 'PC' : 'Aud';
              // ROGER-FIX: show the tone for the PRECLEAR — the remote PC, OR (local/
              // solo mode) the single user, who IS the preclear. Only the REMOTE
              // auditor's own tone is dropped (CONN-45). Kept consistent with the
              // native/Whisper path so the tone shows in Chrome local/solo too.
              const pcTone = (spk === 'PC' || appModeRef.current !== 'auditor') ? tone : undefined;
              addLog({ time: currentTime, speaker: spk, text: transcript, tone: pcTone });
              if (spk === 'PC') networkManager.send({ type: 'TRANSCRIPT', speaker: 'PC', text: transcript, time: currentTime, tone: pcTone }, true);
              const escapedTranscript = transcript.replace(/"/g, '""');
              const toneStr = tone ? `,${tone.label},${tone.pitch},${tone.energy}` : ',,'
              sessionRecorder.pushCsv(`${currentTime.toFixed(3)},TRANSCRIPT,${spk},"${escapedTranscript}"${toneStr}`);
            }
          }
        }
      };
      
      // CONN-82: diagnosis probes. onaudiostart fires when the recognizer
      // actually acquires the mic; onspeechstart when it detects real speech.
      // Relaying these once tells us if the Galaxy mic is free (vs. held by
      // WebRTC) and whether audio reaches the recognizer.
      recognitionRef.current.onaudiostart = () => {
        if (appModeRef.current === 'participant' && pcMicArmedRef.current && !pcAudioStartLoggedRef.current) {
          pcAudioStartLoggedRef.current = true;
          try { networkManager.send({ type: 'TRANSCRIPT', speaker: 'PC', text: '🔊 [PC micro ouvert]', time: timeRef.current }, true); } catch (_) {}
        }
      };
      recognitionRef.current.onspeechstart = () => {
        if (appModeRef.current === 'participant' && pcMicArmedRef.current && !pcSpeechStartLoggedRef.current) {
          pcSpeechStartLoggedRef.current = true;
          try { networkManager.send({ type: 'TRANSCRIPT', speaker: 'PC', text: '🗣️ [PC voix détectée]', time: timeRef.current }, true); } catch (_) {}
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        const safeError = String(event.error || '').replace(/[\r\n\t]/g, ' ').slice(0, 100);

        // CONN-81: 'no-speech' and 'aborted' are BENIGN and very frequent on
        // Android Chrome (which ends recognition after each utterance). They must
        // NOT tear down Web Speech — onend will simply restart it. Previously they
        // fell through to the Whisper fallback and NULLED recognitionRef, which
        // killed the preclear's transcription after the first silence.
        if (event.error === 'no-speech' || event.error === 'aborted') {
          return; // let onend restart
        }

        // CONN-81/82: for the remote PRECLEAR, never tear down Web Speech or fall
        // to Whisper (heavy/unreliable on a phone, and a gesture-less pre-tap
        // denial would kill it). Relay the (non-benign) error for visibility, then
        // let onend retry. Web Speech is the correct engine for the Galaxy/Android.
        if (appModeRef.current === 'participant') {
          if (pcMicArmedRef.current) {
            try { networkManager.send({ type: 'TRANSCRIPT', speaker: 'PC', text: `⚠️ [PC mic: ${safeError}]`, time: timeRef.current }, true); } catch (_) {}
          }
          return;
        }

        // FIX CONN-61: a denied/missing microphone is the only TERMINAL error —
        // Whisper needs the mic too, so there's no fallback. EVERY other error
        // ('network', 'service-not-allowed', 'language-not-supported', etc.,
        // which vary by Chromium build) means the cloud Web Speech path is
        // unavailable → fall back to the offline Whisper engine. Previously only
        // 'network' triggered the fallback, so other codes left the STT muted.
        if (event.error === 'not-allowed' || event.error === 'audio-capture') {
          journal.addSysLine((t('log_mic_denied') as string) || 'Microphone refusé — reconnaissance vocale désactivée.', 'highlight');
          recognitionRef.current = null;
        } else {
          // Cloud Web Speech unavailable → switch to the offline Whisper engine.
          logSttOnce('google_fallback', t('log_google_fallback') as string, 'highlight');
          if (safeError) console.warn('[STT] Web Speech error → Whisper fallback:', safeError);
          if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch (_) {}
            recognitionRef.current = null;
          }
          try {
            startLocalRecognition();
          } catch (error) {
            console.error("Erreur démarrage reconnaissance locale:", error);
          }
        }
      };

      recognitionRef.current.onstart = () => { recognitionActiveRef.current = true; };

      recognitionRef.current.onend = () => {
        recognitionActiveRef.current = false;
        // Restart if the session is running OR the preclear armed their mic.
        // Chrome ends recognition after each utterance / periodically; without this
        // it would transcribe one phrase then go silent.
        // ROBUSTNESS (#2 "transcript stops after a while"): restart on a short DELAY
        // rather than synchronously. A synchronous start() right inside onend often
        // throws (engine still tearing down) and was swallowed → recognition died.
        // The 300 ms gap lets the engine fully reset, so it keeps recovering over a
        // long session. Guarded so we don't restart after the recognizer is disposed.
        if ((sessionStateRef.current === 'running' || pcMicArmedRef.current) && recognitionRef.current) {
          setTimeout(() => {
            if (!recognitionRef.current) return;
            if (sessionStateRef.current !== 'running' && !pcMicArmedRef.current) return;
            try { recognitionRef.current.start(); } catch (_) { /* already started / transient */ }
          }, 300);
        }
      };

      // If session is already running when language changes, start the new recognition
      // instance — but NOT for an un-armed participant (gesture-less start would be
      // denied on Android and tear down the recognizer; see CONN-81).
      if (sessionStateRef.current === 'running'
          && (appModeRef.current !== 'participant' || pcMicArmedRef.current)) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          // Ignore
        }
      }

      return () => {
        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
          } catch (e) {
            // Ignore
          }
        }
      };
    }
    // sttRestartKey : bump par le watchdog pour RECRÉER un recognizer neuf s'il devient zombie.
  }, [lang, sttRestartKey]);

  // CHRONIC-FIX (transcript stops after ~15–25 min on Chrome/Web Speech): the
  // single onend-restart dies if start() throws or if the recognizer dies WITHOUT
  // firing onend. A periodic watchdog defensively (re)starts STT every 8 s: if it
  // is already running, start() throws InvalidStateError (harmless, caught); if it
  // died, start() revives it. So recognition can never stay dead > 8 s.
  useEffect(() => {
    const id = setInterval(() => {
      const shouldRun = sessionStateRef.current === 'running' || pcMicArmedRef.current;
      if (!shouldRun) { sttInactiveSinceRef.current = 0; return; }
      // Participant (phone) must arm via a user gesture first (CONN-81).
      if (appModeRef.current === 'participant' && !pcMicArmedRef.current) return;
      // Sano : Web Speech confirmé par onstart, OU le moteur Whisper/natif tourne déjà
      // (isUsingLocalRecognition). SANS ce 2ᵉ cas, le watchdog croyait le STT mort pendant
      // que Whisper tournait → recréait Web Speech → flapping « Whisper déconnecté/reconnecté ».
      if (recognitionActiveRef.current || isUsingLocalRecognition.current) { sttInactiveSinceRef.current = 0; return; }
      // Dovrebbe ascoltare ma NON è attivo (onend senza restart riuscito) → prova a rianimarlo.
      if (sttInactiveSinceRef.current === 0) sttInactiveSinceRef.current = Date.now();
      if (recognitionRef.current) {
        try { recognitionRef.current.start(); } catch (_) { /* già in avvio / transitorio */ }
      } else if (!isUsingLocalRecognition.current) {
        try { startLocalRecognition(); } catch (_) {}
      }
      // Ancora morto dopo ~12 s (Chrome può lasciare uno ZOMBIE che non riparte mai) →
      // RICREO un recognizer nuovo: bump della chiave → l'effetto di setup lo ricostruisce.
      if (recognitionRef.current && sttInactiveSinceRef.current && Date.now() - sttInactiveSinceRef.current > 12000) {
        sttInactiveSinceRef.current = 0;
        try { recognitionRef.current.stop(); } catch (_) {}
        recognitionRef.current = null;
        setSttRestartKey(k => k + 1);
      }
    }, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Manage Speech Recognition based on session state
  useEffect(() => {
    if (recognitionRef.current) {
      try {
        if (sessionState === 'running') {
          // CONN-81: NEVER auto-start the preclear's recognition without a user
          // gesture. On Android Chrome a gesture-less start() fires onerror
          // 'not-allowed', which used to TEAR DOWN recognitionRef before the
          // preclear could tap the mic banner. The participant starts ONLY via
          // the tap (which sets pcMicArmedRef); here we just keep it alive.
          if (appModeRef.current !== 'participant' || pcMicArmedRef.current) {
            recognitionRef.current.start();
          }
        } else {
          recognitionRef.current.stop();
        }
      } catch (e) {
        // Ignore errors if it's already started/stopped
      }
    }
  }, [sessionState]);

  // ── CONN-83: AUDITOR-SIDE transcription of the preclear ───────────────────
  // The reliable way to caption the PC: the AUDITOR runs Whisper on the PC's
  // incoming WebRTC audio (the very audio it already hears) and labels it 'PC'.
  // This sidesteps every Android limitation (mic contention with WebRTC, the
  // user-gesture rule, continuous-mode quirks) — the preclear's phone does
  // nothing. Runs only while the auditor is connected and the session is live.
  useEffect(() => {
    const audioTracks = remoteStream ? remoteStream.getAudioTracks() : [];
    // SATELLITE: do NOT run the Mac-side Whisper on the phone audio. The PHONE
    // transcribes its own (close-mic) voice and relays accurate 'PC' lines — the
    // weak Whisper-tiny here only created a second, lower-quality PC source.
    const shouldRun = appMode === 'auditor' && isConnected
      && sessionState === 'running' && audioTracks.length > 0 && !satelliteMode;
    if (satelliteMode && appMode === 'auditor' && isConnected && sessionState === 'running') {
      addLog({ time: timeRef.current, speaker: 'SYS',
        text: audioTracks.length > 0
          ? '🎙 Audio PC ricevuto — la trascrizione PC arriva dal telefono'
          : '⚠ Nessun audio dal telefono — verifica la connessione.',
        type: audioTracks.length > 0 ? 'success' : 'highlight' });
    }
    if (!shouldRun) return;

    if (!pcWhisperRef.current) {
      const eng = new OfflineSpeechRecognition();
      eng.onresult = (e: { results: { transcript: string; isFinal: boolean }[] }) => {
        const txt = e.results?.[0]?.transcript?.trim();
        if (!txt) return;
        const tt = timeRef.current;
        addLog({ time: tt, speaker: 'PC', text: txt, type: 'normal' });
        const escaped = txt.replace(/"/g, '""');
        sessionRecorder.pushCsv(`${tt.toFixed(3)},TRANSCRIPT,PC,"${escaped}"`);
        // O4: VOICE_MARKER post removed (worker never handled it).
      };
      eng.onerror = () => { /* transient — VAD keeps running */ };
      pcWhisperRef.current = eng;
    }
    const eng = pcWhisperRef.current;
    eng.lang = lang;
    let cancelled = false;
    // init() reuses the already-loaded model (modelReady cached) on restarts.
    eng.init(remoteStream as MediaStream).then((ok) => {
      if (!cancelled && ok) { try { eng.start(); } catch (_) {} }
    });
    return () => {
      cancelled = true;
      try { eng.stop(); } catch (_) {}
    };
  }, [appMode, isConnected, sessionState, remoteStream, lang, satelliteMode]);

  // (Satellite transcript separation is now handled by PUSH-TO-TALK on the
  // auditor + the phone relaying PC text only — no audio dedup detector needed.)

  /**
   * ── IL CONTATTO VERO, FUORI DA QUI ───────────────────────────────────────────────────────
   * Fase 6. RMS per elettrodo, railing sull'AC, isteresi sul « contatto perso »: tutto in
   * `hooks/useMuseContactGate`, lo stesso calcolo che stava qui — `useChargeEngine` ne legge
   * `museContactRef` per sapere se l'EEG di questo istante è un segnale vero o rumore da
   * elettrodi flottanti. Montarlo in SERENITY (fase 6, prossimo passo) richiede lo stesso gate.
   */
  const museGate = useMuseContactGate({
    eegBuffer,
    museConnection,
    // FIX MUSE-REMOTE : côté AUDITEUR à distance, le MUSE local est toujours 'disconnected'
    // (c'est le préclair qui le porte). Mais l'EEG du préclair est mirroré dans eegBuffer, donc
    // on DOIT calculer le contact/qualité ici aussi quand le MUSE distant streame — sinon
    // museContact reste false → aucune charge → l'aiguille ne réagit pas (seul le gyro bougeait).
    remoteLive: appMode === 'auditor' && remoteMuseStreaming,
    timeRef, addLog,
  });
  const { signalQuality, setSignalQuality, museContact, museContactRef } = museGate;
  useEffect(() => { signalQualityRef.current = signalQuality; }, [signalQuality]);

  useEffect(() => {
    if (sessionState === 'running') {
      // Auto-enter CAPTURE when session starts.
      // SATELLITE co-located: the phone must stay SILENT — the prime-frequency
      // tones are generated on the auditor's Mac (the PC hears them in the room).
      // Without this gate the phone played the tones too ("il telefono fa suoni").
      if (!pcCoLocatedRef.current) {
        primeFreqAudio.init();
        primeFreqAudio.onHarmonicCopy = (p, freq, idx) => {
          setPrimeCopies(prev => {
            const next = [...prev, { p, freq }];
            mnaSessionRef.current.totalCopies = next.length;
            return next;
          });
        };
      }
      setPrimePhase('CAPTURE');
      primePhaseRef.current = 'CAPTURE';
      setPrimeCopies([]);
      setPrimeCaptured(false);
      mnaSessionRef.current = { cycles: 0, imHistory: [], imSum: 0, imCount: 0, peakIm: 0, finalZone: 'PRIME', totalCopies: 0, phaseLog: [] };
      mnaSessionRef.current.phaseLog.push({ phase: 'CAPTURE', t: Date.now() });
    } else {
      // Session ended/paused — kill all audio
      primeFreqAudio.killAll();
      setPrimePhase('IDLE');
      primePhaseRef.current = 'IDLE';
      setPrimeCopies([]);
      setPrimeCaptured(false);
    }
  }, [sessionState]);

  // Dev: simulate Muse connection for testing/reporting — REMOVED

  // When simulating Muse — REMOVED

  // Simulation reactions — REMOVED

  // FIX MUSE-RECONNECT: né connect() né gatt.connect() hanno un timeout nativo — su macOS su un
  // dispositivo che non trasmette possono restare APPESI per sempre ("searching" infinito, badge
  // che mente, riconnessione impossibile). Ogni attesa Bluetooth è ora limitata nel tempo, e
  // l'annullamento pulisce anche la callback pendente nel processo main (ble-cancel).

  // Session clock — only updates time, EEG data comes exclusively from Muse
  // PHASE-A: session tick is now owned by sessionClock. Each tick, we mirror
  // the clock's time into `timeRef.current` (read by the worker handler &
  // other legacy sites) and run the 1-Hz fallback history push.
  useEffect(() => {
    const unsub = sessionClock.subscribe(() => {
      timeRef.current = sessionClock.now();
      // Position-based R&I analysis sample
      sessionRecorder.pushNeedleOffset({ time: timeRef.current, offset: needleEngine.pos });
      // Sample the HIDDEN virtual-needle spring for the ReactionClassifier — this is the
      // SMOOTHED charge signal the classifier was calibrated against (10 Hz, spring-filtered),
      // now that the visible needle no longer tracks the charge continuously.
      {
        const _vb = needleVirtualRef.current;
        _vb.push({ time: timeRef.current, offset: virtualNeedle.pos });
        while (_vb.length > 1 && _vb[0].time < timeRef.current - 3) _vb.shift();
      }
      // 1 pt/s fallback when Muse is offline so charts have something to draw.
      // (raw push — no cap, exactly as before: the offline fallback path was
      // never decimated.)
      if (museConnection !== 'connected' && Math.round(timeRef.current * 10) % 10 === 0) {
        sessionRecorder.chart.push({
          time: Number(timeRef.current.toFixed(1)),
          qL: 0, tZone: 'T80', rhoG: 0, vProc: 0, eta: 0, diracCount: 0 });
      }
    });
    return unsub;
  }, [museConnection]);

  // Bind sessionState transitions → clock lifecycle.
  useEffect(() => {
    if (sessionState === 'running') sessionClock.resume();
    else if (sessionState === 'paused')  sessionClock.pause();
    else if (sessionState === 'ended')   sessionClock.end();
  }, [sessionState]);

  // Tear down on App unmount.
  useEffect(() => () => { sessionClock.destroy(); }, []);

  // ── USCIRE CON UNA SEDUTA APERTA ─────────────────────────────────────────────────────
  // Il processo principale non sa se si sta auditando: glielo diciamo noi, ed è lui a fermare
  // la chiusura e a chiedercelo. Senza, chiudere la finestra buttava via la seduta in silenzio.
  useEffect(() => {
    const api = (window as any).electronAPI;
    try { api?.setSessionActive?.(sessionState === 'running'); } catch (_) { /* fuori da Electron */ }
  }, [sessionState]);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onCloseRequest) return;
    return api.onCloseRequest(() => setQuitAsk(true));
  }, []);

  /** Esce davvero. */
  const quitNow = useCallback(() => {
    quitAfterSaveRef.current = false;
    try { void corpusFlushNow(); } catch (_) { /* l'archivio non deve impedire l'uscita */ }
    try { (window as any).electronAPI?.confirmClose?.(); } catch (_) {}
  }, []);

  // ── ASSESSMENT capture : quand le mode est actif, CHAQUE nouvelle parole de l'auditeur ('Aud')
  //    devient un item assessé (avec son READ). On ne traite que les logs postérieurs au début du
  //    cycle (curseur), une seule fois. (logs est append-only → l'index est stable.) ──
  useEffect(() => {
    if (!assessActiveRef.current) return;
    const cursor = assessLogCursorRef.current;
    if (logs.length <= cursor) return;
    for (let i = cursor; i < logs.length; i++) {
      const e = logs[i];
      // FILTRE : l'auditeur parle aussi HORS des items (« ok », « bien », un commentaire). On
      // n'inscrit que ce qui ressemble à un item — le filtre est PRUDENT (dans le doute, ça passe).
      // ⚠️ TOLLERANZA sull'inizio: da quando la parola è datata alla sua FINE VERA (retrodatata
      // di 700–950 ms dal microfono), un item detto subito dopo aver premuto ASSESSMENT riceve
      // un'ora ANTERIORE all'avvio — e veniva scartato in silenzio. Difetto introdotto con la
      // retrodatazione stessa: il primo item spariva senza lasciare traccia.
      if (e.speaker === 'Aud' && e.time >= assessStartRef.current - AVVIO_TOLLERANZA_S
          && isAssessableItem(e.text)) {
        addAssessItem(e.text.trim(), e.time);
      }
    }
    assessLogCursorRef.current = logs.length;
  }, [logs]);

  // ── MIRROR : ITEM DICTÉ ────────────────────────────────────────────────────────────────────
  // On a appuyé sur DONNE L'ITEM avec le champ VIDE → la PREMIÈRE parole de l'auditeur devient
  // l'item, et on RELANCE la mesure à cet instant précis : la valeur retenue est donc la CHARGE
  // INSTANTANÉE de CET item (et non ce qui traînait depuis l'appui sur le bouton).
  useEffect(() => {
    if (!mirrorAwaitItemRef.current || !mirrorArmedRef.current) return;
    const cursor = mirrorLogCursorRef.current;
    if (logs.length <= cursor) return;
    for (let i = cursor; i < logs.length; i++) {
      const e = logs[i];
      if (e.speaker === 'Aud' && isAssessableItem(e.text)) {   // même filtre : pas un « ok » comme item
        mirrorItemDettato(e.text.trim());   // riancoraggio compreso — lo fa il ciclo
        break;
      }
    }
    mirrorLogCursorRef.current = logs.length;
  }, [logs]);

  // ── CONTACT / NULL : ITEM DETTATO ──────────────────────────────────────────────────────────
  // Stessa cosa del MIRROR qui sopra, per i due cicli. Premuto DAI L'ITEM col campo vuoto, la
  // prima parola dell'auditor diventa l'item del ciclo. Prima funzionava solo in MIRROR, e per
  // CONTACT/NULL bisognava scrivere — cioè staccare gli occhi dall'ago proprio mentre si dà
  // l'item, che è il momento in cui la lettura conta (richiesta utente).
  //
  // Il ciclo NON si ri-arma: `armCycle` ha già ancorato l'istante premendo il bottone, ed è
  // quello il t_Item giusto. Qui si RIEMPIE soltanto l'etichetta — al contrario del MIRROR, che
  // deve ri-agganciare perché il suo valore è la carica istantanea dell'item.
  useEffect(() => {
    if (!cycleAwaitItemRef.current || !curCycleRef.current) return;
    const cursor = cycleLogCursorRef.current;
    if (logs.length <= cursor) return;
    for (let i = cursor; i < logs.length; i++) {
      const e = logs[i];
      if (e.speaker === 'Aud' && isAssessableItem(e.text)) {   // stesso filtro: un « ok » non è un item
        cycleItemDettato(e.text.trim());
        break;
      }
    }
    cycleLogCursorRef.current = logs.length;
  }, [logs]);

  // ── TONE : ITEM DETTATO ────────────────────────────────────────────────────────────────────
  // Stessa cosa dei due effetti qui sopra, per la resistenza. Non si ri-ancora niente: la
  // localizzazione ha già fissato l'istante e il valore (ToneLocator), qui si riempie soltanto
  // l'etichetta di CHE COSA era quella resistenza.
  useEffect(() => {
    if (!toneAwaitItemRef.current) return;
    const cursor = toneLogCursorRef.current;
    if (logs.length <= cursor) return;
    for (let i = cursor; i < logs.length; i++) {
      const e = logs[i];
      if (e.speaker === 'Aud' && isAssessableItem(e.text)) {
        const txt = e.text.trim();
        toneAwaitItemRef.current = false;
        setAuditingQuestion(txt);
        logBufferRef.current.push({ time: timeRef.current, speaker: 'NEEDLE',
          text: `◈ TONE — ${LC('resistenza', 'résistance', 'resistance', 'resistencia', 'motstånd')} · ${txt}`, type: 'normal' });
        break;
      }
    }
    toneLogCursorRef.current = logs.length;
  }, [logs]);

  // Fetch LAN IP and PeerJS key from local server (only works when running via server.cjs)
  useEffect(() => {
    fetch('/api/server-info')
      .then(r => r.ok ? r.json() : null)
      .then((data: { lanIp: string; port: number; peerKey?: string } | null) => {
        if (data?.lanIp && data.lanIp !== '127.0.0.1') {
          setServerLanIp(`${data.lanIp}:${data.port}`);
        }
        // FIX H1: store the server-startup PeerJS key so it can be embedded in
        // connection links and used for PeerJS client initialisation.
        if (data?.peerKey) peerKeyRef.current = data.peerKey;
      })
      .catch(() => {}); // Silently ignore if server not running (dev mode without server)
  }, []);



  // Poll tunnel health every 20 s (auditor mode): if the server reports null,
  // clear the link so the auditor knows they need to generate a new one.
  useEffect(() => {
    if (!connectionLink || appMode !== 'auditor') return;
    const id = setInterval(() => {
      fetch('/api/tunnel')
        .then(r => r.ok ? r.json() : null)
        .then((data: { url: string | null } | null) => {
          if (data && data.url === null) {
            // Tunnel is gone — clear the shared link so the UI shows the "Generate" button again
            setConnectionLink('');
            addLog({ time: timeRef.current, speaker: 'SYS', text: '⚠ Tunnel closed — generate a new link', type: 'highlight' });
          }
        })
        .catch(() => {}); // server unreachable (dev mode)
    }, 20_000);
    return () => clearInterval(id);
  }, [connectionLink, appMode, addLog]);

  // Network Manager Configuration for P2P
  useEffect(() => {
    // Shared callbacks for both roles
    networkManager.onError = (msg) => {
      addLog({ time: timeRef.current, speaker: 'SYS', text: (t('log_p2p_error') as string).replace('{msg}', msg), type: 'highlight' });
    };

    networkManager.onStatusChange = (status, detail) => {
      // CONN-48: drive the connection progress window.
      setConnPhase(status === 'idle' ? 'idle' : status as typeof connPhase);
      if (detail) setConnDetail(detail);
      if (status === 'error') {
        addLog({ time: timeRef.current, speaker: 'SYS', text: (t('log_p2p_error') as string).replace('{msg}', detail || '?'), type: 'highlight' });
      } else if (status === 'disconnected') {
        addLog({ time: timeRef.current, speaker: 'SYS', text: (t('log_p2p_disconnected') as string).replace('{detail}', detail || ''), type: 'normal' });
      }
    };

    // Common stream handler: store in React state so video elements update reactively
    networkManager.onStreamReceived = (stream) => {
      setRemoteStream(stream);
    };

    // CONN-33: WebSocket video fallback handlers.
    // A JPEG frame arrived from the peer → store it for display.
    networkManager.onVideoFrame = (dataUrl) => {
      setRemoteVideoFrame(dataUrl);
    };
    // CONN-46: RTT measured (participant side). Show it locally and relay it to
    // the auditor so the auditor's latency badge shows the same value.
    networkManager.onLatency = (rtt) => {
      setLiveLatency(rtt);
      if (appModeRef.current === 'participant') networkManager.send({ type: 'LATENCY', value: rtt }, false);
    };
    // CONN-39: a relayed PCM16 audio chunk arrived → decode and schedule it on
    // a Web Audio context so the auditor HEARS the preclear even on 5G/relay
    // (WebRTC audio is unavailable in fallback). Base64 → Int16 → Float32.
    networkManager.onAudioChunk = (b64, sampleRate) => {
      try {
        if (!audioRxRef.current) {
          const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
          audioRxRef.current = { ctx, nextTime: 0 };
        }
        const rx = audioRxRef.current;
        if (rx.ctx.state === 'suspended') rx.ctx.resume().catch(() => {});
        const bin = atob(b64);
        const len = bin.length >> 1;              // bytes → Int16 samples
        const buf = rx.ctx.createBuffer(1, len, sampleRate);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
          const lo = bin.charCodeAt(i * 2);
          const hi = bin.charCodeAt(i * 2 + 1);
          let s = (hi << 8) | lo;
          if (s >= 0x8000) s -= 0x10000;          // signed
          ch[i] = s / 0x8000;
        }
        const src = rx.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(rx.ctx.destination);
        const now = rx.ctx.currentTime;
        // FIX CONN-44: 35 ms jitter buffer (was 50 ms) trims playback latency.
        // If we fell behind (gap), resync; else queue right after the last chunk.
        if (rx.nextTime < now + 0.035) rx.nextTime = now + 0.035;
        src.start(rx.nextTime);
        rx.nextTime += buf.duration;
      } catch (_) { /* drop malformed chunk */ }
    };
    // WebRTC media failed → flip the UI into fallback mode and start sending
    // our own camera frames. The capture loop is driven by the effect below.
    networkManager.onVideoFallbackNeeded = () => {
      setVideoFallbackActive(true);
      addLog({ time: timeRef.current, speaker: 'SYS',
        text: '📡 Video via relais (réseau restreint) — qualité réduite', type: 'normal' });
    };

    networkManager.onConnectionEstablished = () => {
      setIsConnected(true);
      remoteEegSeenRef.current = false; // reset diagnostic pour ce nouveau lien
      setConnPhase('connected'); // CONN-48: progress window → done
      // FIX CONN-43: collapse the MODE drawer and close the connection modal
      // once connected — they only clutter the screen during a live session.
      setSidebarDrawer(null);
      setShowConnectionModal(false);
      // Cancel any pending reconnect — we are back online
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
      isReconnectingRef.current = false;
      setIsReconnecting(false); // FIX CONN-4/8: clear UI badge
      reconnectCountRef.current = 0;
      // FIX CONN-11: keep the participant's screen alive while connected so
      // Chrome Android (and iOS Safari) don't suspend the tab and tear down
      // the SSE relay. WakeLock requires HTTPS — the tunnel provides that.
      if (appModeRef.current === 'participant' && 'wakeLock' in navigator) {
        (navigator as any).wakeLock.request('screen').then((lock: any) => {
          (window as any)._smWakeLock = lock;
        }).catch(() => { /* user gesture not yet granted, or unsupported */ });
      }
      addLog({ time: timeRef.current, speaker: 'SYS', text: `✅ ${t('connection_p2p_established')}`, type: 'success' });

      // FIX CONN-4: when a participant (re)connects, the auditor must push
      // the current SESSION_STATE so the participant's clock & state are
      // resynced. Without this, the participant's clock stays stuck at
      // wherever it was when the previous channel dropped — until the
      // auditor manually pauses/resumes.
      if (appModeRef.current === 'auditor') {
        // Pousse la LANGUE de la séance au téléphone (préclair) dès la connexion : sans ça il
        // reste sur le défaut 'en' au lieu de la langue choisie par l'auditeur (mic/cam locale).
        try { networkManager.send({ type: 'LANG', lang: langRef.current }, true); } catch (_) {}
        const now = sessionStateRef.current;
        if (now === 'running' || now === 'paused' || now === 'ended') {
          networkManager.send({
            type:  'SESSION_STATE',
            state: now,
            time:  timeRef.current,
            seq:   ++sessionStateSeqRef.current }, true);
        }
      }
    };

    networkManager.onConnectionClosed = () => {
      setIsConnected(false);
      setLiveLatency(null); // CONN-46: clear stale latency badge
      setRemoteStream(null);
      setRemoteBatteryLevel(null);
      setRemoteMuseConnected(false);
      setRemoteSignalQuality(0);
      // CONN-33: clear video fallback state on disconnect.
      setVideoFallbackActive(false);
      setRemoteVideoFrame(null);
      // CONN-67: close the relay-audio playback AudioContext to avoid leaking
      // one per reconnect (browsers cap ~6 AudioContexts → audio would break
      // after a few relay reconnections).
      if (audioRxRef.current) {
        try { audioRxRef.current.ctx.close(); } catch (_) {}
        audioRxRef.current = null;
      }
      addLog({ time: timeRef.current, speaker: 'SYS', text: t('log_p2p_lost') as string, type: 'normal' });
      // FIX CONN-11: release wake lock so the screen can sleep when not connected
      const lock = (window as any)._smWakeLock;
      if (lock?.release) { lock.release().catch(() => {}); (window as any)._smWakeLock = null; }
      // Auto-reconnect only on the participant side, and only if session is not ended
      // Bug 4: don't reconnect if the auditor intentionally ended the session
      if (appModeRef.current === 'participant'
          && auditorPeerIdRef.current
          && sessionStateRef.current !== 'ended') {
        scheduleReconnect();
      }
    };

    // Always reset first — prevents stale auditor handler running after mode change
    networkManager.onDataReceived = () => {};

    if (appMode === 'auditor') {
      networkManager.onDataReceived = (data: any) => {
        // GARDE DÉFENSIVE : n'accepte qu'un objet avec un `type` chaîne. Ignore silencieusement
        // tout paquet malformé (le canal est cifré/reliable, mais on ne fait jamais confiance
        // aveugle au contenu). Les payloads spécifiques restent validés plus bas (EEG sanitize…).
        if (!data || typeof data !== 'object' || typeof data.type !== 'string') return;
        if (data.type === 'RAW_EEG') {
          // FIX MUSE-REMOTE: mark that the preclear IS actually forwarding EEG into this
          // session (drives the honest "MUSE streaming" badge vs "connected elsewhere").
          lastRemoteEegAtRef.current = Date.now();
          // Le PC STREAME de l'EEG → son MUSE EST connecté. On converge le badge même si TOUS
          // les messages MUSE_STATUS ont été ratés (join tardif / reconnexion qui a remis false),
          // sinon l'auditeur affiche « MUSE : non » alors que les données arrivent.
          if (!useNetworkStore.getState().remoteMuseConnected) setRemoteMuseConnected(true);
          // DIAGNOSTIC : premier paquet EEG reçu sur ce lien → l'auditeur SAIT que le MUSE du
          // préclair streame vraiment jusqu'ici. Si ce log n'apparaît JAMAIS, les données EEG
          // ne traversent pas (MUSE pas de contact AF7 côté PC, ou canal P2P qui ne passe pas).
          if (!remoteEegSeenRef.current) {
            remoteEegSeenRef.current = true;
            addLog({ time: timeRef.current, speaker: 'SYS', text: '✅ EEG du préclair reçu — MUSE distant OK', type: 'success' });
          }
          // Payload formats (forward-compat):
          //   [{ts, s: number[]}, ...]  → timestamped batch (current)
          //   [number[], ...]           → legacy batch (array-of-arrays)
          //   number[]                  → legacy single reading
          // FIX M6: helper to validate and sanitize a sample array
          const sanitizeEegSamples = (samples: unknown): number[] | null => {
            if (!Array.isArray(samples)) return null;
            if (samples.length > 256) return null;
            const clean = samples.filter((v: unknown) => typeof v === 'number' && isFinite(v))
                                  .map((v: unknown) => Math.max(-1000, Math.min(1000, v as number)));
            return clean.length > 0 ? clean : null;
          };
          // FIX CONN-23: also mirror incoming RAW_EEG into the local eegBuffer so
          // the per-electrode signal-quality dots in HealthPanel actually light up
          // on the AUDITOR side. The participant only forwards electrode 1 (AF7)
          // — we duplicate the samples across the 4 channels so the panel shows
          // something meaningful instead of dark dots.
          const mirrorIntoBuffer = (samples: number[]) => {
            for (let ch = 0; ch < 4; ch++) {
              const buf = eegBuffer.current[ch] || (eegBuffer.current[ch] = []);
              buf.push(...samples);
              if (buf.length > 256) eegBuffer.current[ch] = buf.slice(-256);
            }
          };
          const first = data.payload[0];
          if (first !== undefined && typeof first === 'object' && !Array.isArray(first) && 's' in first) {
            // Timestamped batch: extract samples, pass ts along for future use
            for (const entry of data.payload as Array<{ ts: number; s: number[] }>) {
              const safe = sanitizeEegSamples(entry.s);
              if (safe) {
                workerRef.current?.postMessage({ type: 'RAW_EEG', payload: safe, data: safe, ts: entry.ts });
                mirrorIntoBuffer(safe);
              }
            }
          } else if (Array.isArray(first)) {
            for (const chunk of data.payload) {
              const safe = sanitizeEegSamples(chunk);
              if (safe) {
                workerRef.current?.postMessage({ type: 'RAW_EEG', payload: safe, data: safe });
                mirrorIntoBuffer(safe);
              }
            }
          } else {
            const safe = sanitizeEegSamples(data.payload);
            if (safe) {
              workerRef.current?.postMessage({ type: 'RAW_EEG', payload: safe, data: safe });
              mirrorIntoBuffer(safe);
            }
          }
        } else if (data.type === 'RAW_PPG') {
          const firstP = data.payload[0];
          if (firstP !== undefined && typeof firstP === 'object' && !Array.isArray(firstP) && 's' in firstP) {
            for (const entry of data.payload as Array<{ ts: number; s: number[] }>) {
              workerRef.current?.postMessage({ type: 'RAW_PPG', payload: entry.s, ts: entry.ts });
            }
          } else if (Array.isArray(firstP)) {
            for (const chunk of data.payload) {
              workerRef.current?.postMessage({ type: 'RAW_PPG', payload: chunk });
            }
          } else {
            workerRef.current?.postMessage({ type: 'RAW_PPG', payload: data.payload });
          }
        } else if (data.type === 'RAW_GYRO') {
          // FIX CONN-30: feed the remote participant's gyro into the local
          // gyroBuffer so the GYRO panel animates on the auditor side, and
          // forward to the worker for motion-artifact detection.
          const samples = data.payload as Array<{ x: number; y: number; z: number }>;
          if (Array.isArray(samples)) {
            for (const sample of samples) {
              if (!sample || typeof sample.x !== 'number') continue;
              gyroBuffer.current.x.push(sample.x);
              gyroBuffer.current.y.push(sample.y);
              gyroBuffer.current.z.push(sample.z);
            }
            if (gyroBuffer.current.x.length > 256) gyroBuffer.current.x = gyroBuffer.current.x.slice(-256);
            if (gyroBuffer.current.y.length > 256) gyroBuffer.current.y = gyroBuffer.current.y.slice(-256);
            if (gyroBuffer.current.z.length > 256) gyroBuffer.current.z = gyroBuffer.current.z.slice(-256);
            // O4: RAW_GYRO post to worker removed (gyroBuffer above feeds the GyroRadar).
          }
        } else if (data.type === 'TRANSCRIPT') {
          // FIX CONN-40: the preclear's own device transcribed their speech and
          // relayed it. Display it labelled 'PC' so the auditor's transcript
          // clearly distinguishes who said what.
          if (typeof data.text === 'string' && data.text.trim()) {
            const tt = typeof data.time === 'number' && isFinite(data.time) ? data.time : timeRef.current;
            // Cap défensif : une ligne de transcript ne peut pas dépasser 2000 car. (évite
            // qu'un paquet géant gonfle le journal / le CSV).
            const txt = data.text.trim().slice(0, 2000);
            addLog({ time: tt, speaker: 'PC', text: txt, tone: data.tone, type: 'normal' });
            // Satellite dedup (text): remember the phone's accurate PC line so a
            // matching 'Auditor' line (PC leaking into the Mac mic) is dropped.
            satelliteRedundancy.notePcLine(tt, txt);
            const escaped = txt.replace(/"/g, '""');
            sessionRecorder.pushCsv(`${tt.toFixed(3)},TRANSCRIPT,PC,"${escaped}"`);
          }
        } else if (data.type === 'LATENCY') {
          // CONN-46: the participant relayed its measured RTT — show it.
          if (typeof data.value === 'number') setLiveLatency(data.value);
        } else if (data.type === 'BATTERY') {
          setRemoteBatteryLevel(data.level);
        } else if (data.type === 'MUSE_STATUS') {
          setRemoteMuseConnected(data.connected);
        } else if (data.type === 'SIGNAL_QUALITY') {
          setRemoteSignalQuality(data.value ?? 0);
        }
        // SESSION_STATE sent from auditor → handled in participant branch below
      };
    }

    if (appMode === 'participant') {
      networkManager.onDataReceived = (data: any) => {
        // GARDE DÉFENSIVE (comme côté auditeur) : objet + `type` chaîne, sinon on ignore.
        if (!data || typeof data !== 'object' || typeof data.type !== 'string') return;
        if (data.type === 'LANG') {
          // L'auditeur pilote la langue de toute la séance → le téléphone (préclair) suit sa
          // langue, pas le défaut 'en'. Whitelist stricte des 5 langues supportées.
          if (typeof data.lang === 'string' && ['en', 'fr', 'it', 'es', 'sv'].includes(data.lang)) setLang(data.lang as Language);
          return;
        }
        if (data.type === 'SESSION_STATE') {
          // Whitelist stricte des états : un paquet forgé/corrompu ne peut pas mettre le PC
          // dans un état inconnu (il exécute l'état reçu — donc on le valide d'abord).
          if (!['idle', 'running', 'paused', 'ended'].includes(data.state)) return;
          const newState: SessionState = data.state;
          // FIX H4: discard stale/out-of-order packets using seq number.
          // FIX #6: EXCEPT a terminal 'ended' — it must ALWAYS apply so the PC
          // auto-ends without pressing FIN. If the auditor app remounts/reloads,
          // its seq counter resets to 0, so the 'ended' packet would otherwise be
          // dropped as "stale" and the preclear stays stuck in an active session.
          if (typeof data.seq === 'number' && newState !== 'ended') {
            if (data.seq <= lastSessionStateSeqRef.current) return;
            lastSessionStateSeqRef.current = data.seq;
          }
          // Sync session timer with auditor's state
          if (data.time !== undefined) {
            // PHASE-A: sync the local clock to the auditor's timeline
            sessionClock.syncTo(data.time);
            timeRef.current = data.time;
          }
          setSessionState(newState);
          // CONN-78: the preclear's device must transcribe ITS OWN voice and
          // relay it to the auditor — otherwise the auditor never sees the PC's
          // words. The session is started REMOTELY (the preclear never presses
          // START), so we drive the preclear's recognition off the synced state.
          if (newState === 'running') {
            // ROGER-FIX (#2/#6): the testers ran BOTH sides on macOS desktop
            // (first Chrome, then Electron) — there is NO Android gesture lock
            // here, so we can AUTO-ARM the preclear's own transcription the moment
            // the session starts. This is the reliable path (PC transcribes its own
            // mic and relays 'PC' lines to the auditor's journal); the auditor-side
            // Whisper on the WebRTC audio stays as a backup. On Chrome we drive the
            // Web Speech recognizer (recognitionRef); in Electron (recognitionRef
            // is null) we start the local offline engine instead.
            // Satellite (co-located): the phone IS the PC's transcription source.
            // It runs ONLY its speech recognizer on the mic and relays 'PC' TEXT
            // over the data channel — it streams no audio (see onConnect), so the
            // recognizer owns the mic with no contention. We skip voiceToneAnalyzer
            // here precisely to avoid a 2nd mic consumer competing with the STT.
            pcMicArmedRef.current = true; setPcMicArmed(true);
            if (!pcCoLocatedRef.current) {
              try { voiceToneAnalyzer.init(); voiceToneAnalyzer.ensureAudioContextActive(); } catch (_) {}
            }
            if (recognitionRef.current) {
              try { recognitionRef.current.start(); } catch (_) {}
            } else {
              try { startLocalRecognition(); } catch (_) {}
            }
          } else if (newState === 'paused' || newState === 'ended') {
            // CONN-81: on END, disarm the mic so onend stops auto-restarting the
            // preclear's recognition once the session is over (EOS).
            if (newState === 'ended') { pcMicArmedRef.current = false; setPcMicArmed(false); }
            try { stopRecognition(); } catch (_) {}
          }
          // Bug 5: only log if there is a meaningful text (avoid blank line for 'idle')
          const stateText = newState === 'running' ? `▶ ${t('sys_start')}`
                          : newState === 'paused'  ? `⏸ ${t('sys_pause')}`
                          : newState === 'ended'   ? `■ ${t('sys_end')}` : '';
          if (stateText) addLog({ time: timeRef.current, speaker: 'SYS', text: stateText, type: 'normal' });
        } else if (data.type === 'MNA_AUDIO') {
          // The auditor triggered a neuro-acoustic phase: play the binaural tone
          // HERE, in the PC's own headphones (clean L/R — never transmit binaural
          // beats over a mono/compressed WebRTC stream, it would destroy the beat).
          // SATELLITE (co-located): the phone must stay SILENT — the tones come
          // from the auditor's Mac in the same room ("il telefono fa suoni").
          if (pcCoLocatedRef.current) return;
          try {
            primeFreqAudio.init();
            const a = data.action;
            // Validate numeric payloads — a missing/garbled field must not feed
            // NaN into the oscillators (silent no-tone instead of a crash).
            if (a === 'sonify' && typeof data.fd === 'number' && isFinite(data.fd)) {
              primeFreqAudio.startSonify(data.fd);
            } else if (a === 'clean' && typeof data.delta === 'number' && isFinite(data.delta)) {
              primeFreqAudio.startClean(data.delta, data.zone);
            } else if (a === 'harmonics' && typeof data.pStar === 'number' && isFinite(data.pStar)) {
              primeFreqAudio.startHarmonics(data.pStar);
            } else if (a === 'stop') {
              primeFreqAudio.killAll();
            }
          } catch (_) { /* audio ctx not ready */ }
        } else if (data.type === 'READINESS') {
          // SÉANCE À DISTANCE : l'auditeur lance le contrôle « Inspirez / Laissez aller ».
          // On affiche/masque l'overlay respiration côté préclair, piloté par la phase reçue.
          setPcReadiness(data.open ? { phase: data.phase, inhale: !!data.inhale, assessment: data.assessment ?? null } : null);
        } else if (data.type === 'CLOCK_SYNC') {
          // RE-SYNC HORLOGE : l'auditeur ré-envoie son temps périodiquement → le PC ré-ancre
          // son sessionClock (évite la dérive d'horloge sur une longue séance) SANS re-jouer
          // la machine à états (contrairement à SESSION_STATE).
          if (typeof data.time === 'number' && isFinite(data.time)) {
            sessionClock.syncTo(data.time);
            timeRef.current = data.time;
          }
        }
      };
    }
  }, [appMode, addLog, t]);

  // CLOCK RE-SYNC (auditeur) : re-diffuse son horloge toutes les 30 s pendant une séance en
  // cours → le PC corrige la dérive. Petit paquet sur le canal fiable, aucun effet de bord.
  useEffect(() => {
    if (appMode !== 'auditor') return;
    const id = setInterval(() => {
      if (sessionStateRef.current !== 'running') return;
      try { networkManager.send({ type: 'CLOCK_SYNC', time: timeRef.current }, false); } catch (_) {}
    }, 30000);
    return () => clearInterval(id);
  }, [appMode]);

  // ── Refresh signaling config before each reconnect attempt ──────────────
  // FIX CONN-3: previous LAN-fallback was dead code — it queried `serverLanIp`,
  // which is the PARTICIPANT's OWN local server IP (populated from their own
  // /api/server-info at startup). The auditor's LAN is unreachable from
  // anywhere the participant is, so that fallback could never succeed.
  //
  // We now do the only meaningful check: probe whether the original tunnel is
  // still alive. If not, stop the reconnect loop immediately and surface a
  // clear message to the user — manual re-link is required.
  //
  // The 5 s timeout is intentional: shorter would cause false negatives on a
  // slow but recovering tunnel; longer wastes reconnect-attempt budget.
  const refreshSignalingForReconnect = useCallback(async () => {
    const base = serverBaseUrlRef.current;
    if (!base) return;

    const [host] = base.split(':');
    const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(host);
    if (isIp) {
      // LAN connection — no tunnel to refresh, config remains valid.
      return;
    }

    // Tunnel connection — probe its origin to see if it's still alive.
    let tunnelAlive = false;
    try {
      const res = await fetch(`https://${host}/api/tunnel`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json() as { url: string | null };
        tunnelAlive = data.url !== null;
      }
    } catch (_) { tunnelAlive = false; }

    if (tunnelAlive) return; // keep config as-is

    // Tunnel is dead. No useful fallback is possible from the participant side
    // (we don't know the auditor's LAN IP). Surface a clear message and stop
    // the reconnect loop so the user knows to ask for a fresh link.
    addLog({
      time: timeRef.current, speaker: 'SYS',
      text: '⚠ Tunnel expired — ask the auditor for a new connection link.',
      type: 'highlight' });
    auditorPeerIdRef.current = ''; // stops scheduleReconnect from looping
  }, [addLog]);

  // ── Auto-reconnect (participant side) ──────────────────────────────────────
  // Called whenever the DataConnection drops while in participant mode.
  // Uses exponential back-off: 3s, 6s, 12s, 24s, 48s, 60s (capped).
  const scheduleReconnect = useCallback(() => {
    if (isReconnectingRef.current) return; // already scheduled
    if (!auditorPeerIdRef.current) return;

    const count = reconnectCountRef.current;
    if (count >= MAX_RECONNECT_ATTEMPTS) {
      addLog({ time: timeRef.current, speaker: 'SYS',
        text: '✗ Auto-reconnect failed after 6 attempts — check the network and try again manually.', type: 'highlight' });
      isReconnectingRef.current = false;
      setIsReconnecting(false); // FIX CONN-4/8: clear UI badge on give-up
      return;
    }

    const delayMs = Math.min(3000 * Math.pow(2, count), 60_000);
    isReconnectingRef.current = true;
    setIsReconnecting(true); // FIX CONN-4/8: show UI badge while reconnecting
    addLog({ time: timeRef.current, speaker: 'SYS',
      text: `🔄 Reconnecting in ${Math.round(delayMs / 1000)}s… (attempt ${count + 1}/${MAX_RECONNECT_ATTEMPTS})`, type: 'normal' });

    reconnectTimerRef.current = setTimeout(async () => {
      reconnectTimerRef.current = null;
      reconnectCountRef.current += 1;
      // RETRY-FIX: track whether to retry and re-schedule AFTER the finally
      // below. The old code called scheduleReconnect() inside `catch`, while
      // isReconnectingRef was still true — the guard at the top of
      // scheduleReconnect silently DROPPED the retry, so after the FIRST failed
      // attempt the auto-reconnect loop was dead (despite "attempt 1/6" in the
      // log). This is the likely root of "a volte non si riconnette".
      let retry = false;
      // C4: always release the lock in a finally block so an unexpected exception
      // can never leave isReconnectingRef stuck at true permanently.
      try {
        if (!auditorPeerIdRef.current) return; // user disconnected manually
        // C1: refresh signaling config before reconnecting — the tunnel may have
        //     changed since the original connection. Falls back to LAN if tunnel gone.
        await refreshSignalingForReconnect();
        if (!auditorPeerIdRef.current) return; // cancelled while awaiting
        // C5: pass skipMediaRelease=true so getUserMedia is NOT re-invoked.
        const newId = await networkManager.init('participant', undefined, true);
        // Bug 3: update React state so the displayed peer ID stays in sync
        setPeerId(newId);
        await networkManager.connectToAuditor(auditorPeerIdRef.current);
        // onConnectionEstablished callback logs success and resets counters
      } catch (err: any) {
        addLog({ time: timeRef.current, speaker: 'SYS',
          text: `⚠ Reconnect attempt ${reconnectCountRef.current} failed: ${err.message || err}`, type: 'highlight' });
        // FIX H3: only retry if user hasn't manually disconnected
        retry = !!auditorPeerIdRef.current;
      } finally {
        // C4 safety net: guarantee flag is released even on unhandled throws
        isReconnectingRef.current = false;
      }
      if (retry) scheduleReconnect();
    }, delayMs);
  }, [addLog, refreshSignalingForReconnect]);

  // ── EEG/PPG batch flush timers ─────────────────────────────────────────────
  // Start when participant mode is active, stop on mode change or disconnect.
  useEffect(() => {
    if (appMode !== 'participant') return;

    // EEG batch: flush every BATCH_MS — payload is Array<{ts, s}> with timestamps
    eegBatchTimer.current = setInterval(() => {
      if (eegBatchRef.current.length === 0) return;
      const batch = eegBatchRef.current.splice(0);
      networkManager.send({ type: 'RAW_EEG', payload: batch });
    }, BATCH_MS);

    // PPG batch: flush every BATCH_MS — payload is Array<{ts, s}> with timestamps
    ppgBatchTimer.current = setInterval(() => {
      if (ppgBatchRef.current.length === 0) return;
      const batch = ppgBatchRef.current.splice(0);
      networkManager.send({ type: 'RAW_PPG', payload: batch });
    }, BATCH_MS);

    // FIX CONN-30: gyro batch — payload is Array<{x,y,z}>
    gyroBatchTimer.current = setInterval(() => {
      if (gyroBatchRef.current.length === 0) return;
      const batch = gyroBatchRef.current.splice(0);
      networkManager.send({ type: 'RAW_GYRO', payload: batch });
    }, BATCH_MS);

    return () => {
      if (eegBatchTimer.current) { clearInterval(eegBatchTimer.current); eegBatchTimer.current = null; }
      if (ppgBatchTimer.current) { clearInterval(ppgBatchTimer.current); ppgBatchTimer.current = null; }
      if (gyroBatchTimer.current) { clearInterval(gyroBatchTimer.current); gyroBatchTimer.current = null; }
      eegBatchRef.current = [];
      ppgBatchRef.current = [];
      gyroBatchRef.current = [];
    };
  }, [appMode]);

  // ── Signal quality forwarding (participant → auditor) ──────────────────────
  // Whenever our local signalQuality changes while connected as participant, push it.
  useEffect(() => {
    if (appModeRef.current === 'participant' && networkManager.isConnected()) {
      networkManager.send({ type: 'SIGNAL_QUALITY', value: signalQuality }, true);
    }
  }, [signalQuality]);

  // ── CONN-33/39 : le média de repli sur le relais WS vit dans son propre hook ──
  useMediaRelayFallback();

  // ── THETA-METER : l'e-meter USB (les « lattine ») ────────────────────────────
  // Pour l'instant il vit À CÔTÉ de l'aiguille EEG — deux aiguilles sur le même cadran — pour
  // qu'on VOIE l'écart entre la mesure réelle et celle reconstruite du cerveau. Le TA, lui,
  // vient des lattine : c'est une vraie résistance, pas une reconstruction.
  /** Reazione in corso sull'ago delle boîtes — alimenta le scritte sull'arco e ASSESSMENT. */
  const [thetaReactionKey, setThetaReactionKey] = useState('');
  /** Sale a ogni avvio di ASSESSMENT: dice al modulo di aprirsi. */
  const [assessOpenSignal, setAssessOpenSignal] = useState(0);
  /** Quanto si tollera che un item risulti ANTERIORE all'avvio dell'assessment (s). È il
   *  massimo della retrodatazione: senza, il primo item detto subito dopo il pulsante sparisce. */
  const AVVIO_TOLLERANZA_S = 1.5;
  /** La lingua con cui il riconoscitore vocale è stato avviato. Serve ad accorgersi che è
   *  cambiata IN SEDUTA: il riconoscitore si configura all'avvio, e cambiando lingua dopo
   *  continuava a trascrivere nella vecchia — l'interfaccia in francese e le parole capite in
   *  inglese (segnalato in seduta: « Cato cinema », « Cana Seo mall »). */
  const sttLangRef = useRef<string>('');
  /** Quanti campioni servono al MUSE per un giudizio onesto senza rifare la respirazione
   *  guidata. Sotto questa soglia si passa alla sua prova invece di dichiarare su due dati. */
  const METAB_MIN_SAMPLES = 60;
  /** DIAGNOSI (temporanea): l'ultima correzione applicata all'istante di fine parola. */
  const sttBackdateRef = useRef<{ s: number; misurato: boolean; mic?: number; fonte?: string }>(
    { s: 0, misurato: false });
  /** Ultimo esito intermedio di Web Speech (performance.now()): la fine della parola. */
  const webInterimMsRef = useRef(0);
  /** L'ultima lettura delle boîtes annunciata, con quando: se subito dopo si scopre che era
   *  una stretta, si RITIRA. */
  const ultimaLetturaRef = useRef<{ id: number; tSec: number } | null>(null);
  /** Quale motore di trascrizione sta lavorando: cambia TUTTO sull'istante della parola.
   *  Il nativo è in tempo reale; Whisper trascrive a blocchi e consegna con secondi di ritardo. */
  const sttEngineRef = useRef<'nativo' | 'whisper' | 'web'>('web');
  /** La prontezza delle boîtes è già stata fatta per QUESTO avvio. Con i due strumenti insieme
   *  si fanno entrambe le prove, una dopo l'altra, e questo dice a che punto siamo. */
  const [thetaReadyDone, setThetaReadyDone] = useState(false);
  /** Si sta uscendo con una seduta aperta: si CHIEDE prima di perdere tutto. */
  const [quitAsk, setQuitAsk] = useState(false);
  /** « Salva ed esci » è stato scelto: appena il salvataggio è avvenuto, si esce davvero.
   *  Un flag e non un'attesa a tempo: il salvataggio passa dal rapporto, e indovinare quanto
   *  ci mette vorrebbe dire uscire a metà scrittura. */
  const quitAfterSaveRef = useRef(false);
  const thetaReactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const theta = useThetaMeter({
    nowSec: () => timeRef.current,
    // ── LE LETTURE DELLE BOÎTES ENTRANO DOVE ENTRANO QUELLE DELL'EEG ────────────────────
    // shownReadsRef è la fonte di ASSESSMENT, e conteneva SOLO le reazioni EEG: col meter da
    // solo ogni item risultava NULL mentre l'ago si muoveva. La reazione si data all'ISTANTE
    // IN CUI IL MOVIMENTO È PARTITO, non a quando rientra: una caduta appartiene a quando
    // comincia, ed è così che il read istantaneo la ritrova accanto al suo item.
    onReaction: r => {
      // In pausa l'orologio è fermo: una lettura registrata adesso porterebbe l'istante
      // congelato e cadrebbe nella finestra dell'item successivo. Stessa regola dell'EEG.
      if (sessionStateRef.current !== 'running') return;
      const label = REACTION_LABELS[r.key] || '';
      // ── UNA LETTURA PER MOVIMENTO, aggiornata mentre l'ago scende ──────────────────────
      // L'ago annuncia SUBITO e poi rilancia se continua a scendere (SF → FALL → LONG FALL):
      // tutte le emissioni di una stessa oscillazione portano lo stesso `id`, e qui si
      // SOSTITUISCE la lettura invece di accumularne una per grado. La sorgente viaggia con
      // la lettura, perché la finestra temporale non è la stessa dell'EEG.
      // Si cerca INDIETRO la lettura di questo stesso episodio, non solo l'ultima della lista:
      // fra un'emissione e la successiva ci si infila una reazione dell'EEG, e allora l'ultima
      // non è più la nostra — si accodava un doppione invece di aggiornare. Misurato nel log del
      // 01/08: « theta:Tick+800ms » e « theta:SF+800ms », lo stesso movimento contato due volte,
      // con la finestra dell'instant read che ne vedeva due dove ce n'era una.
      const sr = shownReadsRef.current;
      let i = sr.length - 1;
      while (i >= 0 && sr[i].episodeId !== r.id) i--;
      if (i >= 0) sr[i].reaction = label;
      else sr.push({ time: r.startedAtSec, reaction: label, src: 'theta', episodeId: r.id });
      // ── CORPUS: la reazione delle BOÎTES, col suo PROPRIO istante ──────────────────────
      // Si archivia solo il VERDETTO (`final`), non i gradi intermedi: l'archivio vuole una
      // riga per movimento, con il picco vero e la durata vera.
      if (r.final && corpusSessionRef.current) {
        corpusWrite(reactionRecord(corpusSessionRef.current, new Date().toISOString(), {
          src: 'theta', key: r.key, peak: r.peak,
          tSec: r.startedAtSec, durSec: r.durationSec,
          ta: theta.taNow ?? undefined, motion: theta.bodyMotion || undefined,
          sinceItemSec: ultimoItemSecRef.current != null
            ? Math.max(0, r.startedAtSec - ultimoItemSecRef.current) : undefined,
          assess: assessActiveRef.current || undefined,
        }));
      }
      // ── JOURNAL — la reazione dell'AGO VERO ────────────────────────────────────────────
      // Mancava del tutto: col meter davanti agli occhi, il journal registrava solo le reazioni
      // del MUSE. Solo il verdetto (`final`), altrimenti una caduta che cresce SF→FALL→LONG
      // FALL lascerebbe tre righe per un movimento solo.
      if (r.final && sessionStateRef.current === 'running') {
        const _due = instrumentsRef.current.muse && instrumentsRef.current.theta;
        // Colore dell'ago delle boîtes (ambra): nel journal si riconosce da quale strumento
        // viene una reazione senza doverne leggere la sigla.
        logBufferRef.current.push({ time: r.startedAtSec, speaker: 'NEEDLE',
          text: `⊙ ${_due ? 'METER · ' : ''}${label}`, type: 'meter' });
      }
      if (shownReadsRef.current.length > SHOWN_READS_CAP) {
        shownReadsRef.current.splice(0, Math.floor(SHOWN_READS_CAP / 2));
      }
      // ── LA SCRITTA SEGUE L'AGO ────────────────────────────────────────────────────────
      // Finché il movimento è in corso la scritta RESTA, senza scadenza: è quello che l'ago sta
      // facendo. Quando rientra (r.final) si lascia solo il tempo di leggerla e sparisce. Prima
      // durava KICK_MS — la durata dell'oscillazione dell'ago dell'EEG, fino a 1,5 s — e la
      // scritta continuava a dire « LONG FALL » con l'ago già fermo a SET.
      ultimaLetturaRef.current = { id: r.id, tSec: timeRef.current };
      setThetaReactionKey(r.key);
      if (thetaReactionTimerRef.current) { clearTimeout(thetaReactionTimerRef.current); thetaReactionTimerRef.current = null; }
      if (r.final) {
        thetaReactionTimerRef.current = setTimeout(
          () => setThetaReactionKey(''), THETA_LABEL_AFTER_MS);
      }
    },
  });
  // resetNeedle è definita più in alto e con dipendenze vuote: si passa per un ref, altrimenti
  // catturerebbe la prima versione della callback e non ricentrerebbe mai le lattine.
  useEffect(() => { thetaResetRef.current = theta.resetToSet; }, [theta.resetToSet]);
  useEffect(() => { thetaConnectedRef.current = theta.status === 'connected'; }, [theta.status]);
  useEffect(() => { thetaTaRef.current = theta.ta; }, [theta.ta]);

  // ── UN RESPIRO SOLO PER TUTTI E DUE ──────────────────────────────────────────────────────
  // Con MUSE e METER insieme, fare prima il soffio sulle lattine e poi la respirazione guidata
  // del Muse è due volte la stessa cosa — « altrimenti è troppo noioso » (richiesta in seduta).
  // Il Muse raccoglie dai suoi flussi appena la fase è 'baseline' o 'breath': basta quindi
  // metterlo in 'breath' PROPRIO MENTRE si soffia nelle lattine, e il suo giudizio esce dallo
  // stesso respiro. Nessuna misura inventata: sono i suoi dati, presi nel momento giusto.
  useEffect(() => {
    const conMuse = museConnection === 'connected' || remoteMuseConnected;
    if (!metabolicOpen || !conMuse || theta.status !== 'connected') return;
    metabolicPhaseRef.current = theta.testing === 'breath' ? 'breath' : 'baseline';
  }, [metabolicOpen, museConnection, remoteMuseConnected, theta.status, theta.testing]);

  // ── SI RITIRA UNA LETTURA CHE ERA UNA STRETTA ────────────────────────────────────────────
  // Mentre avviene, una stretta delle lattine è indistinguibile da una caduta: preme, la
  // resistenza scende, l'ago va giù. La differenza è il RITORNO, e si sa solo dopo — quindi
  // l'agitazione arriva quando la lettura è già scritta (« la FALL sono io che ho schiacciato
  // le lattine »). Invece di rallentare tutte le letture per colpa di questa, si annuncia
  // subito e si RITIRA quella sbagliata: sparisce dalla scritta e dall'ASSESSMENT.
  useEffect(() => {
    if (!theta.bodyMotion) return;
    const u = ultimaLetturaRef.current;
    if (!u || (timeRef.current - u.tSec) * 1000 > THETA_RETRACT_MS) return;
    ultimaLetturaRef.current = null;
    const ult = shownReadsRef.current[shownReadsRef.current.length - 1];
    if (ult && ult.episodeId === u.id) shownReadsRef.current.pop();
    setThetaReactionKey('');
    if (thetaReactionTimerRef.current) { clearTimeout(thetaReactionTimerRef.current); thetaReactionTimerRef.current = null; }
    // ⚠️ SI MOSTRA SOLO SE SI STA GUARDANDO L'AGO DELLE BOÎTES. Col MUSE davanti non si sta
    // misurando la resistenza: una riga « lettura ritirata » parlerebbe di un ago che non è
    // sullo schermo, e sembrerebbe riferita alla reazione del MUSE. Resta nel corpus, dove
    // serve all'analisi, e sparisce dal journal, dove confonderebbe.
    if (agoPrincipaleRef.current !== 'theta') return;
    logBufferRef.current.push({ time: timeRef.current, speaker: 'NEEDLE',
      text: LC('lettura ritirata — era una stretta delle lattine',
               'lecture retirée — c\'était une pression sur les boîtes',
               'read withdrawn — it was a squeeze on the cans',
               'lectura retirada — era un apretón de las latas',
               'avläsning tillbakadragen — det var ett grepp om burkarna'), type: 'retracted' });
  }, [theta.bodyMotion]);
  // ── CORPUS: l'F/N dell'ago VERO ──────────────────────────────────────────────────────────
  // Si scrive quando FINISCE, non quando comincia: alla fine si conoscono durata, ampiezza e
  // ritmo veri, e la riga porta comunque l'istante d'INIZIO, quindi l'accoppiamento con l'F/N
  // dell'EEG non ci perde niente.
  useEffect(() => {
    const f = theta.fn;
    if (f.fn && f.sinceSec != null) {
      if (!thetaFnOpenRef.current) thetaFnOpenRef.current = { tSec: f.sinceSec };
      return;
    }
    const open = thetaFnOpenRef.current;
    if (!open) return;
    thetaFnOpenRef.current = null;
    if (!corpusSessionRef.current) return;
    corpusWrite(fnRecord(corpusSessionRef.current, new Date().toISOString(), {
      src: 'theta', tSec: open.tSec,
      durSec: Math.max(0, timeRef.current - open.tSec) || undefined,
      width: f.widthAvg || undefined, periodSec: f.periodSec || undefined,
      ta: theta.ta ?? undefined, motion: f.motion || undefined,
      proc: sessionProcObjRef.current.trim() || undefined,
    }));
  }, [theta.fn, theta.ta]);
  useEffect(() => { sessionProcObjRef.current = sessionProcessObjective; }, [sessionProcessObjective]);
  // La scelta dello strumento sparisce da sé appena UNO dei due si aggancia: lasciarla lì
  // dopo il collegamento la farebbe sembrare un errore ancora in corso.
  useEffect(() => {
    if (museConnection === 'connected' || theta.status === 'connected') {
      setMuseHint(false);
      // ── COLLEGARE UN AGO IN CORSO REVOCA « SENZA STRUMENTI » ──────────────────────────────
      // La seduta era partita senza aghi, ma ora ce n'è uno: da questo istante c'è una MISURA.
      // Se `senzaStrumenti` restasse true, il rapporto continuerebbe a nascondere ZONE AS-IS e
      // Lock Quality — e sarebbero vuote — anche con i dati dell'ago che entrano (segnalato).
      // Non è più una seduta senza strumenti; l'etichetta e i tagli devono cadere con l'ago
      // che arriva.
      setSenzaStrumenti(false);
    }
  }, [museConnection, theta.status]);

  // ── QUALI MODULI, secondo cosa è collegato ───────────────────────────────────
  // Senza MUSE, i moduli che vivono di EEG (salute, integrità, MNA) non hanno sorgente:
  // mostrarli fermi o vuoti è peggio che nasconderli — chi guarda non sa se sono rotti.
  // La PREFERENZA dell'utente non viene toccata: riattaccando il Muse tornano com'erano.
  const instruments = useMemo(
    // In seduta a distanza il MUSE è quello del PRECLEAR: qui conta se ARRIVA l'EEG, non se
    // il Mac dell'auditor ha un casco (non ce l'ha) — vedi remoteMuseConnected.
    //
    // ── IL METER NON VIAGGIA ─────────────────────────────────────────────────────────────
    // Il MUSE arriva a distanza perché l'EEG passa nel canale P2P (RAW_EEG). Le boîtes no:
    // sono un dispositivo USB su QUESTO Mac, e misurano soltanto chi ne tiene le lattine in
    // mano. In una seduta davvero a distanza il preclear è a casa sua: il meter collegato
    // qui non misura NESSUNO — l'ago si muove lo stesso (rumore, la mano dell'auditor) e chi
    // guarda crede di leggere il preclear.
    //
    // Vale invece nel SATELLITE (`satelliteMode`): lì il preclear è nella stessa stanza e il
    // telefono fa solo da camera/microfono — le lattine sono nelle sue mani, il meter serve.
    () => ({ muse: museConnection === 'connected' || remoteMuseConnected,
             theta: theta.status === 'connected'
                    && (appMode === 'local' || satelliteMode) }),
    [museConnection, remoteMuseConnected, theta.status, appMode, satelliteMode]);
  // Il gestore del worker si aggancia UNA volta sola (deps vuote): senza specchio in ref
  // leggerebbe per sempre gli strumenti collegati all'avvio.
  const instrumentsRef = useRef(instruments); instrumentsRef.current = instruments;
  /**
   * NIENTE MISURA A SCHERMO SENZA QUALCOSA CHE MISURI.
   *
   * Un « TONE ARM 2.00 » senza né casco né boîtes è la cosa peggiore che l'app possa fare:
   * sembra una lettura, e non lo è. Vale per il TA, per la diagnostica (Total TA, velocità) e
   * per la scia dell'ago — tutte cose che hanno senso solo se un ago le produce.
   *
   * Si usa il FATTO, non la scelta: se il MUSE cade a metà seduta il TA deve sparire allo
   * stesso modo, anche se la seduta era partita con gli strumenti.
   */
  const senzaMisura = noInstruments(instruments);
  /**
   * NORMAL o EXPERT — vedi store/uiModeStore e ui/moduleRegistry.
   *
   * EXPERT non è « più funzioni »: è il regime di chi TARA lo strumento. Quel che aggiunge —
   * trim dell'ago, calibrazione TA, diagnostica, barra dell'integrità — in seduta non serve, e
   * fra i piedi di chi conduce è un rischio: una manopola mossa per sbaglio sregola l'ago
   * mentre si legge.
   */
  const uiLevel = useUiModeStore(s => s.level);
  const espertoAttivo = uiLevel === 'expert';
  /**
   * Passando a EXPERT la barra dell'integrità torna; tornando a NORMAL se ne va.
   *
   * Si scrive nella preferenza invece di forzare il render, così DENTRO un livello l'auditor
   * può ancora chiuderla o riaprirla da Config e la sua scelta regge — è la stessa regola di
   * `pinned`/`muted` in `ui/visibleSet.ts`: l'automatismo apparecchia, la mano decide.
   */
  useEffect(() => {
    setModuleVis(v => (v.biometric === espertoAttivo ? v : { ...v, biometric: espertoAttivo }));
  }, [espertoAttivo, setModuleVis]);
  const moduleVis = useMemo(
    () => effectiveModules(moduleVisChosen, instruments),
    [moduleVisChosen, instruments]);

  // ── UN AGO SOLO — e QUALE lo sceglie l'auditor ───────────────────────────────────────────
  // Due aghi sullo stesso quadrante confondono, e i dati dicono che non si possono fondere: su
  // 89 item con entrambi gli strumenti hanno letto lo STESSO item una volta sola (κ = −0,09).
  //
  // Ma NON si sceglie al posto dell'auditor. I due servono a cose diverse e in momenti diversi:
  // il METER ha il TA in ohm veri (quello del MUSE è ricostruito, cioè un modello); il MUSE ha
  // i cicli CONTACT/NULL, l'MNA e il COM LAG, che l'ago vero non può dare. Il selettore sta
  // sotto il perno (vedi QuantumSphere) e si cambia in seduta.
  //
  // Con UN solo strumento non c'è scelta: vince quello che c'è.
  const [agoScelto, setAgoScelto] = useState<ReadSrc>(() => {
    const v = localStorage.getItem('equilibrium_ago');
    return v === 'eeg' || v === 'theta' ? v : 'theta';
  });
  useEffect(() => { localStorage.setItem('equilibrium_ago', agoScelto); }, [agoScelto]);
  /**
   * ── E I DUE CICLI CENTRALI ──────────────────────────────────────────────────────────────
   * Terza estrazione, la più grossa: CONTACT e NULL insieme, perché condividono numerazione,
   * ciclo corrente, chiusura e contatori. Le dipendenze qui sotto sono molte, e lo sono in modo
   * onesto: ognuna dice una cosa che il ciclo non sa fare da sé. Prima quelle chiamate c'erano
   * lo stesso, sparse fra 8 000 righe, dove nessuno le contava.
   */
  const cycles = useContactNullCycle({
    auditingQuestion, setAuditingQuestion, setItemSpoken,
    nowSec: () => timeRef.current,
    logLength: () => logsRef.current.length,
    log: (text, type) => logBufferRef.current.push({ time: timeRef.current, speaker: 'NEEDLE', text, type }),
    LC,
    thetaTa: () => thetaTaRef.current,
    freeNeedleForNewItem: () => freeNeedleForNewItem(),
    // Solo se non gira già: se l'auditor l'ha aperto a mano, riaprirlo lo CHIUDEREBBE.
    ensureAssessmentOn: () => { if (!assessActiveRef.current) toggleAssessment(); },
    onItemGiven: (sec) => { ultimoItemSecRef.current = sec; },
    writeCycleCorpus: (row) => {
      if (!corpusSessionRef.current) return;   // fuori seduta non si archivia
      corpusWrite(cycleRecord(corpusSessionRef.current, new Date().toISOString(), {
        ...row, proc: sessionProcObjRef.current.trim() || undefined,
      }));
    },
    markFnAsIs: () => flushEegFn(true),
    stopSonification: () => {
      // Si spegne l'audio locale, si manda STOP al preclear, e la fase MNA torna a CAPTURE.
      if (primePhaseRef.current === 'SONIFY' || primePhaseRef.current === 'CLEAN' || primePhaseRef.current === 'HARMONICS') {
        try { primeFreqAudio.killAll(); } catch (_) {}
        try { networkManager.send({ type: 'MNA_AUDIO', action: 'stop' }, true); } catch (_) {}
        setPrimePhase('CAPTURE'); primePhaseRef.current = 'CAPTURE';
        setPrimeCopies([]);
      }
    },
    onLagMeasured: (m) => {
      setDeltaStar(m.deltaStar); setDeltaStarN(m.n); setDeltaTrend(m.trend);
      setDeltaBaseline(m.baseline); setDeltaAdaptive(m.adaptive);
    },
  });
  trackCycleRef.current = cycles.trackCycle;
  const {
    cycleArmed, cycleArmedRef, cycleKind,
    nullPhase, nullSinceMock, noReadSignal, taAtNullStart,
    asIsPending, manualReady, asIsFalse, asIsIO, cycleStats,
    armCycle, finalizeCycle, validateAsIs, validateClearRead,
    curCycleRef, auditingCyclesRef, cycleAwaitItemRef, cycleLogCursorRef,
  } = cycles;
  const cycleItemDettato = cycles.itemDettato;

  /**
   * ── IL MOTORE DELLA CARICA, FUORI DA QUI ────────────────────────────────────────────────
   * Fase 6. Spawn del worker EEG, lettura dei suoi messaggi, calcolo di carica/fase/AS-IS/
   * reazione: tutto in `hooks/useChargeEngine`, lo stesso codice che stava qui — solo le
   * variabili libere sono diventate dipendenze esplicite. Va chiamato QUI (dopo `cycles`,
   * `mirror`, `tone`) e non prima: legge `cycleArmedRef`, che nasce dalla destrutturazione
   * appena sopra — chiamarlo prima lo leggerebbe prima che esista.
   *
   * ⚠️ È IL PEZZO CHE QUESTA MACCHINA NON PUÒ PROVARE DA SOLA: gira solo con un MUSE appaiato
   * e una seduta vera. Punto di ritorno prima di questa estrazione: il commit precedente.
   *
   * @see docs/serenity-refonte.md — fase 6.
   */
  useChargeEngine({
    workerRef, gyroBufferRef: gyroBuffer,
    timeRef, sessionStateRef, viewModeRef, instrumentsRef, museContactRef,
    stableReleaseStateRef, sensitivityRef, assessActiveRef, thetaTaRef,
    corpusSessionRef, tRef, metabolicPhaseRef,
    realBpmRef, ppgAmpRef, ppgPiRef, lastBpmAtRef, signalQualityRef,
    primePhaseRef, mnaSessionRef, primeCaptured,
    needleReactionKeyRef, needleReactionRef, needleVirtualRef,
    shownReadsRef, ultimoItemSecRef,
    trackCycleRef, trackMirrorRef, trackToneRef, trackTruthRef, cycleArmedRef,
    logBufferRef, pendingEegFnRef,
    epWindowOpenRef, epWindowHasOpenedRef, epWindowTimerRef,
    setEpWindowOpen, setAsIsnessState, setIsFnActive,
    setHardwareError, setSignalQuality, setRealBpm, setDisplayMass,
    setPrimeIm, setPrimeFd, setPrimePStar, setPrimeDelta, setPrimeZone, setPrimeCaptured,
    setNeedleReactionKey, setNeedleReaction,
    massAccumulatorRef: massAccumulator,
    // Condivisi con `freeNeedleForNewItem` e col RESET di sessione, poco più sotto — non
    // duplicarli qui dentro l'avrebbe scollegati da quelle due funzioni (vedi il commento
    // in cima a `ChargeEngineDeps`).
    activeKickRef, kickFlybackRef, needleItemInterruptRef, reactionHoldUntilRef,
    gammaEmaRef, lastFnShownAtRef, lastLoggedChargeRef, chargeLogPendingRef, lastLoggedReactionRef,
    resetNeedle, flushEegFn,
  });

  // ── DURANTE UN CICLO L'AGO È QUELLO DEL MUSE, E NON SI SCEGLIE ──────────────────────────
  // I cicli CONTACT e NULL girano su `qL`, cioè sull'EEG: `cycleStateMachine.update(qL, …)`.
  // Mostrare l'ago delle boîtes mentre si segue un ciclo vorrebbe dire guardare uno strumento
  // che al ciclo non partecipa — e leggerne le fasi su un movimento che non le ha prodotte.
  // La scelta dell'auditor non si perde: torna com'era appena il ciclo finisce.
  const cicloInCorso = cycleArmed && instruments.muse;
  // ── E DURANTE LE PROVE DELLE BOÎTES, L'AGO È QUELLO DELLE BOÎTES ────────────────────────
  // La stretta e il soffio tarano la SENSIBILITÀ del meter guardando dove arriva il SUO ago
  // rispetto al segno di un terzo. Farli col MUSE davanti vorrebbe dire tarare uno strumento
  // guardandone un altro — un errore che non si vede, perché l'ago si muove lo stesso.
  //
  // ⚠️ VALE PER TUTTO IL TEMPO IN CUI LA SCHERMATA È APERTA, non solo mentre una prova gira.
  // Prima si guardava il solo `theta.testing`, che è vero unicamente DOPO aver premuto il
  // bottone: con i due strumenti e il MUSE scelto, si arrivava davanti a « PRONTO PER LA
  // SEDUTA · BOÎTES », si stringeva, e l'ago non si muoveva — perché era quello del MUSE, che
  // alla stretta non risponde. Segnalato in seduta.
  const provaBoiteInCorso = instruments.theta
    && (!!theta.testing || (metabolicOpen && !thetaReadyDone));
  // ── E OGNI MODO HA IL SUO AGO ───────────────────────────────────────────────────────────
  // L'imposizione non è nuova: era già sparsa in tre condizioni. Ora è UNA tabella
  // (MODE_SPEC), e il modo la porta con sé. Resta valida la precedenza delle prove delle
  // boîtes, che tarano il METER e vanno guardate sul SUO ago qualunque cosa si stia facendo.
  //
  // L'ago imposto vale solo se lo strumento c'è: in TONE senza meter si guarda il MUSE, che è
  // l'unico che possa disegnare qualcosa.
  // ── QUALI REAZIONI SI VEDONO SCRITTE ────────────────────────────────────────────────────
  // Per difetto quelle dell'ago che si sta guardando: col METER a schermo comparivano anche
  // quelle del MUSE, senza dire da dove venissero (segnalato). Con due strumenti l'auditor può
  // chiedere di vederle tutte e due, e allora arrivano etichettate.
  const [reazioniViste, setReazioniViste] = useState<'eeg' | 'theta' | 'both'>('eeg');
  const agoDelModo = MODE_SPEC[mode].needle;
  //
  // ── ⚠️ CON DUE STRUMENTI DECIDE L'AUDITOR, NON IL MODO ──────────────────────────────────
  // `cicloInCorso ? 'eeg'` stava PRIMA della scelta, e siccome il ciclo CONTACT si arma quasi
  // subito, con METER e MUSE collegati l'ago tornava al MUSE e ci restava: si era deciso
  // l'opposto — l'ago del METER (misurato, non ricostruito) e le DUE indicazioni di reazione
  // (segnalato). Il ciclo continua a girare sulla carica EEG comunque: qui si sceglie solo
  // che cosa si GUARDA, e con due strumenti quella scelta è dell'auditor.
  //
  // Resta in cima la prova delle boîtes: si tara il METER guardando il SUO ago, sempre.
  const agoPrincipale: ReadSrc =
    provaBoiteInCorso ? 'theta'
    : instruments.muse && instruments.theta ? agoScelto
    : cicloInCorso ? 'eeg'
    : agoDelModo === 'theta' && instruments.theta ? 'theta'
    : agoDelModo === 'eeg' && instruments.muse ? 'eeg'
    : instruments.theta ? 'theta' : 'eeg';
  // ── TONE SCALE (Ron, −40…+40) ───────────────────────────────────────────────────────────
  // La procedura in quattro tempi: localizzare la resistenza, il SEGNO, l'AMPIEZZA, poi
  // mock-uppare l'OPPOSTO fino all'as-isness.
  //
  // CHI DICE IL NUMERO. Ron assessa segno e ampiezza perché lavora senza meter. Con l'ago il
  // numero si LEGGE: la misura PROPONE e l'assessment VERIFICA. Senza meter la proposta non
  // c'è e l'assessment torna a essere l'unica fonte — che è il caso di Ron.
  // Staccando il MUSE a metà seduta, i tre modi che vivono di carica EEG non hanno più
  // sorgente: si ripiega invece di lasciare l'interfaccia su una scelta impossibile — e su un
  // ciclo che l'auditor aspetterebbe di veder concludere.
  const modiDisponibili = useMemo(
    () => availableModes(instruments.muse, instruments.theta),
    [instruments.muse, instruments.theta]);
  useEffect(() => {
    if (!modiDisponibili.includes(mode)) setMode(fallbackMode(instruments.muse, instruments.theta));
  }, [modiDisponibili, mode, instruments.muse, instruments.theta]);



  /**
   * LA PROVA DELLE LATTINE DI QUESTO PRECLEAR — « che fa fede sono le DUE LATTINE ».
   *
   * Si rilegge quando cambia il nome: l'archivio è per persona, non per strumento. Da qui
   * escono il margine sul tono (senza prova, una divisione in meno) e lo scarto del SOLO.
   */
  const [canHistory, setCanHistory] = useState<PcCanHistory>(() => loadCanTests(''));
  useEffect(() => { setCanHistory(loadCanTests(pcName || '')); }, [pcName]);
  /**
   * La prova è appena riuscita → si archivia, una volta sola.
   *
   * `squeezeOk` resta vero finché non si rifà una prova, quindi senza la guardia si
   * riarchivierebbe a ogni render — e lo storico si riempirebbe della stessa misura.
   */
  /**
   * LA PROVA DOPPIA — i due TA letti, uno per configurazione.
   *
   * Si riempiono facendo la stretta: quella con due lattine dà il riferimento, quella con una
   * dà la lettura da confrontare. La loro DIFFERENZA è la correzione del solo — e finché ne
   * manca una il programma ripiega sul margine di una divisione.
   *
   * Vive nella seduta e non si persiste: quel che si tiene è la differenza (in `ThetaSetup`),
   * non le due letture che l'hanno prodotta.
   */
  const [provaTa, setProvaTa] = useState<{ two: number | null; solo: number | null }>(
    { two: null, solo: null });
  const ultimaProvaRef = useRef(0);
  useEffect(() => {
    if (theta.squeezeOk !== true || theta.testing) return;
    const scala = theta.setup.needleScale;
    if (!(scala > 0)) return;
    const ora = Date.now();
    if (ora - ultimaProvaRef.current < 5000) return;   // la stessa prova, riletta
    ultimaProvaRef.current = ora;
    setCanHistory(prev => {
      const h = addCanTest(prev, { t: ora, scale: scala, config: theta.setup.config });
      saveCanTests(h);
      return h;
    });
    // E IL TA DI QUESTA CONFIGURAZIONE, per il confronto fra le due prove. Si prende quello del
    // BRACCIO (`theta.ta`), che è la media lenta: la stretta appena finita non l'ha spostato,
    // ed è quindi la lettura di riposo — che è quel che si vuole confrontare.
    if (theta.ta !== null) {
      const t = theta.ta;
      setProvaTa(p => theta.setup.config === 'two-cans' ? { ...p, two: t } : { ...p, solo: t });
    }
  }, [theta.squeezeOk, theta.testing, theta.setup.needleScale, theta.setup.config, theta.ta]);
  const modeRef = useRef(mode); modeRef.current = mode;

  /**
   * ── DOVE SI È ADESSO SULLA SCALA, e da quale sguardo ──────────────────────────────────
   *
   * Non è più il valore assoluto del meter. Si parte dal tono fissato alla localizzazione e si
   * conta il MOVIMENTO delle misure da quell'istante — la pendenza resta quella di Ron
   * (l'intera escursione della grandezza vale 80 divisioni, vedi `toneFromDelta`).
   *
   * TRE CASI, come chiesto:
   *   • col METER          → il TA;
   *   • col METER e il MUSE → tutti e due, e si vedono INSIEME sulla colonna: il TA dice la
   *     resistenza, l'EEG dice l'attività, e guardarli salire insieme (o no) è il dato;
   *   • senza strumenti    → quel che dichiara l'auditor: il cursore sta dove l'ha messo.
   */
  const qLnow = useMetric(m => m.qL);
  const asIsSignature = useMetric(m => m.asIsSignature);
  /** Fase del ciclo di carica (neutral|contact|discharge|asis) — la stessa che colora l'ago. */
  const chargePhaseNow = useMetric(m => m.chargePhase);
  const toneFnNow = agoPrincipale === 'theta' ? !!theta.fn.fn
    : (needleReactionKey || '').includes('reaction_fn');

  /**
   * ── IL CICLO TONE, FUORI DA QUI ─────────────────────────────────────────────────────────
   * Primo pezzo del SESSION CONTROLLER estratto (vedi la cartografia SERENITY). Lo stato del
   * ciclo e i suoi gesti vivono in `session/useToneCycle`; qui resta il render, che li usa
   * con gli STESSI NOMI di prima — è così che l'estrazione si verifica: nessuna riga di JSX
   * è cambiata, quindi una seduta condotta prima e dopo deve dare lo stesso giornale.
   */
  const tone = useToneCycle({
    ta: theta.ta, taNow: theta.taNow,
    config: theta.setup.config, soloOffset: theta.setup.offsets?.['solo-can'] ?? 0,
    hasTheta: instruments.theta, hasMuse: instruments.muse,
    pcSex, canHistory, qL: qLnow,
    fnNow: toneFnNow, asIsSignature,
    auditingQuestion, setAuditingQuestion,
    nowSec: () => timeRef.current,
    logLength: () => logsRef.current.length,
    log: (text, type) => logBufferRef.current.push({ time: timeRef.current, speaker: 'NEEDLE', text, type }),
    setItemSpoken,
    ensureAssessmentOn: () => { if (!assessActiveRef.current) toggleAssessment(); },
    LC,
  });
  // Il gestore del worker si aggancia UNA volta sola, prima che il hook esista: prende la
  // funzione da un ref, che qui sotto si tiene aggiornato.
  trackToneRef.current = tone.trackTone;
  const {
    tonePhase, setTonePhase, tonePhaseRef,
    toneAtStart, toneAssessed, setToneAssessed,
    toneRipetizioni, setToneRipetizioni,
    taMostrato,
    toneMeasured, toneHasMeter, toneMisurato, margineTono, toneOra, toneOraEeg,
    localizzaTone, chiudiTone, resetTone,
    toneCyclesRef, toneAwaitItemRef, toneLogCursorRef,
  } = tone;
  const toneAnchor = tone.toneAnchor;

  /**
   * ── E IL CICLO MIRROR, ALLO STESSO MODO ─────────────────────────────────────────────────
   * Secondo pezzo estratto. Stesso patto del TONE: nomi identici, JSX invariato — e il motore
   * `MirrorCycle` non è più un singleton di modulo ma appartiene al ciclo.
   */
  const mirror = useMirrorCycle({
    auditingQuestion, setAuditingQuestion,
    setItemSpoken,
    nowSec: () => timeRef.current,
    logLength: () => logsRef.current.length,
    log: (text, type) => logBufferRef.current.push({ time: timeRef.current, speaker: 'NEEDLE', text, type }),
    ensureAssessmentOn: () => { if (!assessActiveRef.current) toggleAssessment(); },
    LC,
  });
  trackMirrorRef.current = mirror.trackMirror;
  const {
    mirrorCycle, mirrorArmed, mirrorDisp, setMirrorDisp, mirrorSession,
    armMirror, stopMirror,
    mirrorCyclesRef, mirrorCurRef, mirrorArmedRef,
    mirrorAwaitItemRef, mirrorLogCursorRef,
  } = mirror;
  const mirrorItemDettato = mirror.itemDettato;

  /**
   * ── E IL CICLO TRUTH, ALLO STESSO MODO — v. docs/truth-cycle-proposal.md ────────────────
   * Quinto pezzo. `qL`/`hasMuse`/`hasTheta`/F/N non sono qui dentro (v. la nota su
   * `TruthCycleDeps`): arrivano come parametri diretti di `trackTruth`, alimentato dal worker
   * EEG tramite `trackTruthRef` (v. `useChargeEngine.ts`), non come prop lette a freddo.
   */
  const truth = useTruthCycle({
    auditingQuestion, setAuditingQuestion,
    setItemSpoken,
    nowSec: () => timeRef.current,
    logLength: () => logsRef.current.length,
    log: (text, type) => logBufferRef.current.push({ time: timeRef.current, speaker: 'NEEDLE', text, type }),
    ensureAssessmentOn: () => { if (!assessActiveRef.current) toggleAssessment(); },
    LC,
  });
  trackTruthRef.current = truth.trackTruth;
  const {
    truthPhase, truthDisp, truthRepeats, truthEvents,
    locateRI, askTruth, confermaVerita, scartaCandidato, trovatoUlterioreRI, chiudiTruth, resetTruth,
    truthCyclesRef, truthAwaitItemRef, truthLogCursorRef,
  } = truth;

  // ── TRUTH : R/I DETTATO ──────────────────────────────────────────────────────────────────
  // Stessa cosa dei tre effetti sopra (CONTACT/NULL, TONE), per il R/I. `locateRI()` ancora già
  // l'istante — qui si riempie soltanto l'etichetta di quale fosse il R/I.
  useEffect(() => {
    if (!truthAwaitItemRef.current) return;
    const cursor = truthLogCursorRef.current;
    if (logs.length <= cursor) return;
    for (let i = cursor; i < logs.length; i++) {
      const e = logs[i];
      if (e.speaker === 'Aud' && isAssessableItem(e.text)) {
        const txt = e.text.trim();
        truthAwaitItemRef.current = false;
        setAuditingQuestion(txt);
        logBufferRef.current.push({ time: timeRef.current, speaker: 'NEEDLE',
          text: `◈ TRUTH — R/I · ${txt}`, type: 'normal' });
        break;
      }
    }
    truthLogCursorRef.current = logs.length;
  }, [logs]);

  // ⚠️ QUI L'ASSESSMENT SI ACCENDEVA DA SÉ nelle fasi « positivo o negativo? » e « quante
  // divisioni? », che ERANO un assessment. Quelle fasi non ci sono più: i comandi di Ron sono
  // due, e nessuno dei due si conduce enunciando risposte da far reagire. Il modulo si accende
  // a mano, come negli altri cicli.


  // ── « A CHE PUNTO SONO, E COSA DEVO FARE » — per tutti e quattro i cicli ─────────────────
  // Un componente solo (CycleHint), sempre nello stesso posto, con la SUA specificità per ogni
  // ciclo. Ce l'aveva il solo TONE, dove la procedura ha quattro tempi che nessuno ricorda a
  // memoria; l'utente l'ha chiesto anche per gli altri tre — « cela rends le tout plus simple ».
  //
  // Il testo si calcola dallo STATO VERO del ciclo, non da un contatore di passi: se il motore
  // avanza da solo (ed è quel che fa CONTACT), la scritta lo segue senza che nessuno gliela
  // debba dire.
  //
  // ── DA DOVE VIENE LA FASE ───────────────────────────────────────────────────────────────
  // La derivazione non è più qui: sta in `engine/sessionPhase.ts`, dove si prova da sola. Le
  // condizioni sono LE STESSE, riga per riga — è il valore che cambia mestiere. Prima diceva
  // soltanto quale testo scrivere; adesso è un `SessionPhase`, e da lì in poi ogni modulo può
  // chiedere « in che fase siamo » invece di ricomporsi la risposta da quattro booleani.
  //
  // Qui si usa `deriveCyclePhase` (la scala di ciclo SENZA le trasversali): CycleHint è a
  // schermo con la sola condizione `sessionState === 'running'`, dunque anche mentre la
  // finestra EP è aperta, e la precedenza di `ep_window` gli cambierebbe il testo sotto gli
  // occhi. Lo schermo prenderà `derivePhase`, il testo prende la scala. (Vedi il file.)
  const faseCiclo = useMemo(() => deriveCyclePhase({
    splashOpen: showSplash, sessionState, hasInstrument: instruments.muse || instruments.theta,
    preflightOpen: metabolicOpen, epWindowOpen, reportOpen: showReport,
    mode, cycleArmed, asIsPending, nullPhase,
    mirrorArmed, itemNamed: !!auditingQuestion.trim() || itemSpoken,
    mirrorLocked: mirrorDisp.locked, mirrorReached: mirrorDisp.reached,
    tonePhase, truthPhase,
  }), [showSplash, sessionState, instruments.muse, instruments.theta, metabolicOpen,
       epWindowOpen, showReport, mode, cycleArmed, asIsPending, nullPhase, mirrorArmed,
       auditingQuestion, itemSpoken, mirrorDisp.locked, mirrorDisp.reached, tonePhase, truthPhase]);



  /**
   * IL BOTTONE DEL CICLO — « dai l'item », poi il tempo in corso, poi la validazione.
   *
   * È una funzione e non JSX in linea perché va in DUE posti: accanto al campo dell'item
   * finché il ciclo non è armato — dove sta in MIRROR e in TONE, e dove l'utente l'ha chiesto
   * anche qui — e nella riga dei comandi quando il ciclo gira, insieme al contatore e ad
   * ANNULLA. Due copie del blocco divergerebbero alla prima modifica.
   */
  /**
   * « DÌ L'ITEM… » — l'avviso che si aspetta la voce, UGUALE nei quattro cicli.
   *
   * CONTACT e NULL lo scrivevano piccolo dentro il bottone, MIRROR dentro un chip col bordo
   * ambra, TONE non lo scriveva affatto: la stessa cosa detta in tre modi (segnalato). Questa
   * è la forma di CONTACT/NULL, che è quella che va bene.
   */
  const avvisoVoce = (
    <span className="animate-pulse"
          style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '0.04em',
                   color: TOKEN.warn, whiteSpace: 'nowrap' }}>
      {LC('dì l\'item…', 'dis l\'item…', 'say the item…', 'di el ítem…', 'säg item…')}
    </span>
  );

  /**
   * L'ITEM A CICLO AVVIATO — grande, bianco, uguale nei quattro cicli.
   *
   * Quando il ciclo avanza, quel che conta è LEGGERE su che cosa si sta lavorando. CONTACT e
   * NULL lo mostravano così; MIRROR e TONE lasciavano il campo di scrittura disabilitato —
   * piccolo, monospace, sbiadito — e la stessa cosa si leggeva in due modi (segnalato).
   */
  const etichettaItem = (): React.ReactNode => (
    // ⚠️ I COLORI SEGUONO IL TEMA. Erano cablati per lo sfondo scuro — bianco su un velo
    // bianco — e in tema chiaro l'item si leggeva appena (segnalato in TONE, ma valeva per
    // tutti e quattro i cicli).
    <div style={{ width: '100%', padding: '6px 10px', borderRadius: 8,
                  background: isLightTheme ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${isLightTheme ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.16)'}`,
                  display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
                     textTransform: 'uppercase', flexShrink: 0,
                     color: isLightTheme ? 'rgba(26,26,31,0.55)' : 'rgba(226,238,255,0.5)' }}>ITEM</span>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 800, lineHeight: 1.2,
                     color: isLightTheme ? '#1a1a1f' : 'rgba(240,246,255,0.96)' }}>
        {auditingQuestion.trim() || LC('(dillo a voce…)', '(dis-le à voix…)', '(say it aloud…)', '(dilo en voz…)', '(säg det högt…)')}
      </span>
    </div>
  );

  const bottoneCiclo = (): React.ReactNode => {
    const k = mode === 'null' ? 'null' : 'charge';
  const active = cycleArmed && cycleKind === k;
  const label = k === 'charge' ? 'CONTACT' : 'NULL';
  // ⚠️ A RIPOSO IL COLORE NON C'È PIÙ. Il contorno era teal in CONTACT e ardesia
  // in NULL anche prima di premere: due bottoni che dicono la stessa cosa
  // (« dai l'item ») con due colori diversi, mentre MIRROR e TONE lo davano
  // neutro — quattro cicli, tre aspetti (segnalato). Il metodo lo si è già
  // scelto nel selettore in basso; qui resta il GESTO, e il gesto è uno.
  //
  // A ciclo ARMATO il colore torna, e lì serve: dice QUALE ciclo sta girando.
  const hue = k === 'charge'
    ? { on: 'rgba(110,231,183,0.85)', ink: '#6ee7b7' }
    : { on: 'rgba(203,213,225,0.9)',  ink: '#cbd5e1' };
  const RIPOSO = 'rgba(255,255,255,0.3)';   // lo stesso di MIRROR e di TONE
  // On NE PEUT PAS sauter d'un cycle à l'autre en cours de route (demande utilisateur) :
  // il faut d'abord FERMER le cycle en action → l'autre bouton est désactivé.
  const blocked = cycleArmed && !active;

  // ── ⚠️ IL BOTTONE DICE IL TEMPO, NON IL NOME DEL METODO ─────────────────
  // A ciclo armato scriveva « CONTACT » o « NULL » — cioè ripeteva il metodo,
  // che è già scelto e scritto nel selettore in basso (segnalato). Adesso dice
  // A CHE PUNTO SI È, e cambia col ciclo: MOCK-UP mentre si aspetta, poi il
  // traguardo. È la stessa scala di `spiegazioneCiclo`, in una parola.
  const traguardo = active && (k === 'charge'
    ? faseCiclo === 'contact.asis'
    : faseCiclo === 'null.equilibrium');
  // ⚠️ E « MOCK-UP » NON PRIMA CHE L'ITEM CI SIA. Premuto col campo vuoto il
  // bottone diceva già « MOCK-UP » mentre l'istruzione diceva « dì l'item »:
  // due ordini contraddittori, lo stesso difetto di sempre in un punto nuovo
  // (segnalato). Finché l'item non c'è, il bottone dice che lo si aspetta.
  const attesaVoce = active && (faseCiclo === 'contact.say_item' || faseCiclo === 'null.say_item');
  const tempo = !active ? null
    : traguardo
      ? (k === 'charge'
          ? `AS-IS ${LC('CONFERMATO', 'CONFIRMÉ', 'CONFIRMED', 'CONFIRMADO', 'BEKRÄFTAD')}`
          : 'EQUILIBRIUM')
      : attesaVoce
        ? LC('DÌ L\'ITEM', 'DIS L\'ITEM', 'SAY THE ITEM', 'DI EL ÍTEM', 'SÄG ITEM')
        : LC('MOCK-UP', 'MOCK-UP', 'MOCK-UP', 'MOCK-UP', 'MOCK-UP');

  // ── E AL TRAGUARDO, IL BOTTONE VALIDA ──────────────────────────────────
  // Il chip « AS-IS CONFERMATO » stava in fondo, accanto alla % di
  // dissoluzione, ed era lui a validare (richiesta utente: toglierlo di lì).
  // Il gesto che chiude un ciclo sta dove il ciclo si è aperto.
  //
  // NULL fa eccezione e non può non farla: i suoi esiti sono DUE (col VGI e
  // senza), e due esiti non stanno in un bottone solo — compaiono accanto,
  // qui sotto. Questo bottone allora si limita a dire dove si è.
  const validaQui = traguardo && k === 'charge';
  // ── ⚠️ A CICLO ARMATO IL BOTTONE NON SI PREME PIÙ ──────────────────────
  // Premendolo chiudeva il ciclo, e nessuno poteva indovinarlo: diceva
  // « MOCK-UP », cioè il tempo in corso, e un tempo in corso non si preme
  // (segnalato). Adesso è quel che sembra — un'etichetta di stato — e per
  // uscire c'è ANNULLA qui accanto, come in TONE.
  //
  // Resta premibile in due casi soli: quando arma (« dai l'item ») e quando
  // valida l'AS-IS confermato. Cioè quando c'è davvero un gesto da fare.
  const premibile = !active || validaQui;
    return (
    <button key={k}
      onClick={() => {
        if (validaQui) validateAsIs();
        else if (!cycleArmed) armCycle(k);
      }}
      disabled={blocked || !premibile}
      title={validaQui
        ? LC('L\'AS-IS è confermato — premi per VALIDARLO e chiudere il ciclo', 'L\'AS-IS est confirmé — appuie pour le VALIDER et fermer le cycle', 'The AS-IS is confirmed — press to VALIDATE it and close the cycle', 'El AS-IS está confirmado — pulsa para VALIDARLO y cerrar el ciclo', 'AS-IS bekräftad — tryck för att VALIDERA och stänga cykeln')
        : traguardo
          ? LC('Scegli l\'esito qui accanto: coi VGI\'s o senza', 'Choisis l\'issue à côté : avec les VGI\'s ou sans', 'Pick the outcome beside: with VGI\'s or without', 'Elige el resultado al lado: con VGI\'s o sin', 'Välj utfallet bredvid: med VGI\'s eller utan')
        : active
        ? LC(`Ciclo ${label} in corso — premi qui per CHIUDERLO`, `Cycle ${label} en cours — appuie ici pour le FERMER`, `${label} cycle running — press here to CLOSE it`, `Ciclo ${label} en curso — pulsa aquí para CERRARLO`, `${label}-cykel pågår — tryck här för att STÄNGA`)
        : blocked
          ? LC('Chiudi prima il ciclo in corso', 'Ferme d\'abord le cycle en cours', 'Close the running cycle first', 'Cierra primero el ciclo en curso', 'Stäng först den pågående cykeln')
          : k === 'charge'
            ? LC('Dai l\'item e premi: ciclo CONTACT → DISSOLUZIONE → AS-IS', 'Donne l\'item et appuie : cycle CONTACT → DISSOLUTION → AS-IS', 'Give the item and press: CONTACT → DISSOLUTION → AS-IS cycle', 'Da el ítem y pulsa: ciclo CONTACT → DISOLUCIÓN → AS-IS', 'Ge item och tryck: CONTACT → UPPLÖSNING → AS-IS')
            : LC('Dai l\'item e premi: ciclo NULL → RISE (mock-up) → EQUILIBRIUM', 'Donne l\'item et appuie : cycle NULL → RISE (mock-up) → EQUILIBRIUM', 'Give the item and press: NULL → RISE (mock-up) → EQUILIBRIUM cycle', 'Da el ítem y pulsa: ciclo NULL → RISE (mock-up) → EQUILIBRIUM', 'Ge item och tryck: NULL → RISE (mock-up) → EQUILIBRIUM')}
      style={{ height: 28, padding: '0 12px', borderRadius: 8, flexShrink: 0,
        cursor: !premibile ? 'default' : blocked ? 'not-allowed' : 'pointer',
        fontFamily: 'monospace', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
        // AL TRAGUARDO il bottone si accende: è il momento in cui c'è da premere.
        background: validaQui ? 'rgba(52,211,153,0.20)'
                  : active ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.45)',
        border: `1px solid ${validaQui ? '#34d399' : active ? hue.on : RIPOSO}`,
        color: validaQui ? '#34d399' : active ? hue.ink : 'rgba(235,244,255,0.85)',
        // Non premibile ≠ spento: dice DOVE SI È, e si deve leggere bene.
        opacity: blocked ? 0.35 : 1 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {tempo ?? LC('DAI L\'ITEM', 'DONNE L\'ITEM', 'GIVE THE ITEM', 'DA EL ÍTEM', 'GE ITEM')}
      </span>
      {/* Premuto col campo vuoto, si aspetta la voce: lo si dice, come in MIRROR.
          ⚠️ Si guarda la FASE, non il campo: dichiarando « l'item è stato detto »
          il campo resta vuoto (la trascrizione può non esserci) e l'avviso
          restava acceso a mock-up già chiesto. */}
      {attesaVoce && <span style={{ marginLeft: 8 }}>{avvisoVoce}</span>}
    </button>
  );

  };

  /**
   * I GESTI DEL CICLO, quando non li fa la macchina.
   *
   * Senza carica EEG la macchina a stati non riceve i tick che fanno avanzare il ciclo: lo
   * porta avanti l'auditor. I gesti sono le STESSE funzioni che l'ago scatena da solo
   * (`validateAsIs`, `validateClearRead`, `stopMirror`) — qui hanno il loro bottone. Non è un
   * motore nuovo: è la mano dove prima c'era l'automatismo.
   *
   * ── PERCHÉ UNA FUNZIONE E NON DUE COPIE ─────────────────────────────────────────────────
   * Servono in DUE posti, e per la stessa ragione: senza strumenti (il centro dello schermo è
   * libero, e i gesti stanno lì in grande) e col SOLO METER (il centro è il quadrante, e i
   * gesti vanno nella barra). Col solo meter non c'erano affatto, quindi un ciclo CONTACT non
   * si poteva più chiudere — `asIsPending` viene dall'EEG e senza MUSE non scatta mai.
   * Due copie del blocco divergerebbero alla prima modifica.
   *
   * `compatto` cambia solo le misure: nella barra i bottoni sono alti 32 invece di 40 e la riga
   * è allineata a sinistra invece che al centro.
   */
  const comandiManualiCiclo = (compatto: boolean): React.ReactNode => {
    // `pieno` = UN gesto solo, verde pieno (DAI L'ITEM, DICHIARA AS-IS): è
    // l'azione ovvia, e nulla la contende. `scelta` = uno FRA più esiti pari:
    // stesso fondo neutro per tutti e tre, il colore solo sul bordo/testo — così
    // nessuno sembra GIÀ scelto (il verde pieno del primo faceva credere di sì).
    const btn = (etichetta: string, onClick: () => void, tinta: string, pieno = true): React.ReactNode => (
      <button key={etichetta} type="button" onClick={onClick}
        style={{ height: compatto ? 32 : 40, padding: compatto ? '0 14px' : '0 22px',
          borderRadius: compatto ? 8 : 10, cursor: 'pointer', flexShrink: 0,
          fontFamily: 'var(--font-sans)', fontSize: compatto ? 12 : 13, fontWeight: 800,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          background: pieno ? `${tinta}22` : (isLightTheme ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)'),
          border: `1px solid ${pieno ? tinta : (isLightTheme ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.22)')}`,
          color: tinta }}>
        {etichetta}
      </button>
    );
    const riga = (figli: React.ReactNode) => (
      <div style={{ display: 'flex', gap: compatto ? 8 : 10, marginTop: compatto ? 0 : 6,
                    justifyContent: compatto ? 'flex-start' : 'center', flexWrap: 'wrap' }}>{figli}</div>
    );
    const domanda = (testo: string) => (
      <div style={{ marginTop: 4, fontFamily: 'var(--font-sans)', fontSize: compatto ? 12 : 13, fontWeight: 700,
                    color: isLightTheme ? '#3a3a40' : 'rgba(226,238,255,0.85)' }}>{testo}</div>
    );
    // ⚠️ « DAI L'ITEM » NON STA QUI. Stava anche qui, e allora il gesto compariva DUE volte
    // nella stessa schermata — accanto al campo dell'item e di nuovo al centro, con due
    // etichette e due colori diversi (segnalato: « non si capisce cosa fare »). Il posto del
    // gesto è UNO SOLO, accanto al campo dove l'item si scrive, uguale nei quattro cicli.
    // Qui restano i passi che il campo non ha: chiudere il ciclo, e per NULL i tre esiti.

    // ── SI ASPETTA LA VOCE — UN SOLO GESTO, E NON È QUELLO DOPO ────────────
    // Premuto col campo vuoto, l'istruzione dice « dì l'item » ma sotto
    // comparivano già i comandi del tempo SEGUENTE: in CONTACT « DICHIARA
    // L'AS-IS » (due tempi saltati), in NULL i tre esiti, in MIRROR i dieci
    // valori. Due ordini contraddittori nello stesso istante — lo stesso
    // difetto segnalato per la scritta, rimasto nei bottoni.
    //
    // Qui c'è il solo gesto che quel tempo ammette. Serve perché l'item detto
    // arriva nel campo solo se la trascrizione funziona: senza, l'item È stato
    // detto e il ciclo non poteva avanzare in nessun modo.
    if (faseCiclo === 'contact.say_item' || faseCiclo === 'null.say_item'
        || faseCiclo === 'mirror.say_item')
      return riga(btn(LC('L\'ITEM È STATO DETTO', 'L\'ITEM A ÉTÉ DIT', 'THE ITEM WAS SAID', 'EL ÍTEM FUE DICHO', 'ITEM HAR SAGTS'),
                      () => dichiaraItemDetto(), '#6ee7b7'));

    // ── MIRROR — TRE TEMPI, non due ────────────────────────────────────────
    // Il metodo del raddoppio ha un passo che senza ago nessuno faceva: DARE IL
    // VALORE. Prima si andava da « dai l'item » dritti a « ottenuto », e in mezzo
    // non c'era né la cifra né il doppio da raggiungere — cioè mancava il metodo
    // (segnalato). Peggio: `valueR` restava 0 e `stopMirror` non registrava
    // nemmeno il ciclo.
    if (mode === 'mirror') {
      if (!mirrorArmed) return null;   // il gesto è accanto al campo, in barra
      // (a) IL VALORE — dieci bottoni, la quantità di carica di QUESTO item.
      if (!mirrorDisp.locked) return <>
        {domanda(LC('Quanta carica? Da 1 a 10.', 'Combien de charge ? De 1 à 10.', 'How much charge? From 1 to 10.', '¿Cuánta carga? De 1 a 10.', 'Hur mycket laddning? Från 1 till 10.'))}
        {riga([1,2,3,4,5,6,7,8,9,10].map(v => (
          <button key={v} type="button"
            onClick={() => {
              mirrorCycle.setManualValue(v);
              setMirrorDisp({ contactQ: mirrorCycle.contactQ, dischargeQ: 0,
                              locked: true, reached: false, valueR: mirrorCycle.valueR, liveR: mirrorCycle.valueR });
            }}
            style={{ width: 40, height: 40, borderRadius: 10, cursor: 'pointer',
              fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 800,
              background: isLightTheme ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${isLightTheme ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.22)'}`,
              color: '#34d399' }}>
            {v}
          </button>
        )))}
      </>;
      // (b) IL DOPPIO — la meta è scritta, e la raggiunge il preclear.
      if (!mirrorDisp.reached) return <>
        {domanda(`${LC('Portalo al doppio', 'Mène-le au double', 'Take it to the double', 'Llévalo al doble', 'För det till dubbeln')} — ${mirrorDisp.valueR.toFixed(0)} → ${(2 * mirrorDisp.valueR).toFixed(0)}`)}
        {riga(btn(LC('DOPPIO RAGGIUNTO', 'DOUBLE ATTEINT', 'DOUBLE REACHED', 'DOBLE ALCANZADO', 'DUBBELN NÅDD'), () => {
          mirrorCycle.declareReached();
          setMirrorDisp({ contactQ: mirrorCycle.contactQ, dischargeQ: mirrorCycle.dischargeQ,
                          locked: true, reached: true, valueR: mirrorCycle.valueR, liveR: mirrorCycle.valueR });
        }, '#34d399'))}
      </>;
      // (c) OTTENUTO — si valida e si riparte.
      return riga(btn(LC('OTTENUTO — VALIDA', 'OBTENU — VALIDER', 'OBTAINED — VALIDATE', 'OBTENIDO — VALIDAR', 'UPPNÅTT — VALIDERA'), () => stopMirror(), '#34d399'));
    }

    // ── CONTACT ──
    if (mode === 'contact')
      return cycleArmed
        ? riga(btn(LC('DICHIARA AS-IS', 'DÉCLARE L\'AS-IS', 'DECLARE AS-IS', 'DECLARA AS-IS', 'DEKLARERA AS-IS'), () => validateAsIs(), '#34d399'))
        : null;   // il gesto è accanto al campo, in barra

    // ── NULL — tre esiti PARI, non uno pre-scelto. La domanda sopra li lega:
    //    il preclear è riuscito a creare la massa? Sì coi VGI's, sì senza, o non
    //    ci è riuscito (NON RICARICA — il null non vale nulla). ──
    if (mode === 'null')
      return cycleArmed
        ? <>
            {domanda(LC('Il preclear ha creato la massa?', 'Le préclair a-t-il créé la masse ?', 'Did the preclear create the mass?', '¿El preclear creó la masa?', 'Skapade preclearen massan?'))}
            {riga(<>
              {btn(LC('EQUILIBRIUM · VGI ✓', 'EQUILIBRIUM · VGI ✓', 'EQUILIBRIUM · VGI ✓', 'EQUILIBRIUM · VGI ✓', 'EQUILIBRIUM · VGI ✓'), () => validateClearRead(true), '#34d399', false)}
              {btn(LC('EQUILIBRIUM · senza VGI', 'EQUILIBRIUM · sans VGI', 'EQUILIBRIUM · no VGI', 'EQUILIBRIUM · sin VGI', 'EQUILIBRIUM · utan VGI'), () => validateClearRead(false), isLightTheme ? '#475569' : '#94a3b8', false)}
              {/* ⚠️ IL VERDETTO VA DICHIARATO, non solo il ciclo chiuso.
                  Prima chiamava il solo `finalizeCycle(false)`: il ciclo
                  finiva con `noRecharging: false`, cioè indistinguibile da uno
                  ABBANDONATO — e il ramo « NO RECHARGING » del rapporto e del
                  PDF restava irraggiungibile. « Non ricarica » è il risultato
                  diagnostico più prezioso del ciclo NULL: se non si scrive,
                  averlo premuto non è servito a niente. */}
              {btn(LC('NON RICARICA', 'NE RECHARGE PAS', 'NO RECHARGING', 'NO RECARGA', 'LADDAR INTE'),
                   () => cycles.declareNoRecharging(), '#dc2626', false)}
            </>)}
          </>
        : null;   // il gesto è accanto al campo, in barra

    return null;   // TONE ha la sua barra dei quattro tempi, e regge senza ago.
    return null;   // TONE ha la sua barra, e regge senza ago.
  };

  /**
   * COSA FARE, quando non c'è ago.
   *
   * Le istruzioni normali nominano l'ago — « l'ago legge → premi », « aspetta che il valore si
   * fissi », « il ciclo avanza da sé ». Senza strumenti sono false, e una falsa peggio che
   * nessuna: dice all'auditor di aspettare una cosa che non arriverà.
   *
   * Qui la stessa procedura è detta con gli indicatori che restano: quel che il PRECLEAR
   * PERCEPISCE e quel che l'AUDITOR OSSERVA. È il ciclo di sempre — Ron lo conduce così.
   * Restituisce null dove il testo normale va già bene (i tempi di TONE, che sono assessment
   * puro, e le fasi che non nominano l'ago).
   */
  // Funzione semplice e non `useCallback`: `LC` cambia identità a ogni render, quindi
  // memoizzarla su di essa non risparmierebbe nulla — darebbe solo l'impressione di farlo.
  const comeSenzaAgo = (fase: string): string | null => {
    switch (fase) {
      case 'contact.item': case 'free':
        return LC('Scrivilo o dillo, poi premi.', 'Écris-le ou dis-le, puis appuie.', 'Type it or say it, then press.', 'Escríbelo o dilo, luego pulsa.', 'Skriv eller säg det, tryck sedan.');
      case 'contact.mockup':
        return LC('Chiedi un mock-up. Dichiara l\'AS-IS quando arriva.',
                  'Demande un mock-up. Déclare l\'AS-IS quand il arrive.',
                  'Ask for a mock-up. Declare the AS-IS when it comes.',
                  'Pide un mock-up. Declara el AS-IS cuando llegue.',
                  'Be om en mock-up. Deklarera AS-IS när den kommer.');
      case 'null.item':
        return LC('Scrivilo o dillo, poi premi: si lavora su ciò che non reagisce.',
                  'Écris-le ou dis-le, puis appuie : on travaille sur ce qui ne réagit pas.',
                  'Type it or say it, then press: we work on what does not react.',
                  'Escríbelo o dilo, luego pulsa: se trabaja sobre lo que no reacciona.',
                  'Skriv eller säg det, tryck sedan: man arbetar på det som inte reagerar.');
      case 'null.mockup': case 'null.rise':
        return LC('Chiedi un mock-up. Ci riesce → EQUILIBRIUM. Non ci riesce → NON RICARICA.',
                  'Demande un mock-up. Il y arrive → EQUILIBRIUM. Il n\'y arrive pas → NE RECHARGE PAS.',
                  'Ask for a mock-up. He can → EQUILIBRIUM. He can\'t → NO RECHARGING.',
                  'Pide un mock-up. Lo logra → EQUILIBRIUM. No lo logra → NO RECARGA.',
                  'Be om en mock-up. Klarar → EQUILIBRIUM. Klarar inte → LADDAR INTE.');
      // MIRROR ha CINQUE tempi, non due: coprirne solo la metà lasciava le altre fasi col testo
      // normale, che nomina la misura — ed è così che il ciclo « sembrava mancare una tappa ».
      // ARMATO SENZA ITEM — vale per tutti e tre i cicli: si è premuto col campo vuoto e si
      // aspetta la voce. Prima CONTACT e NULL dicevano già « chiedi un mock-up » mentre
      // l'etichetta diceva « dillo a voce »: due ordini contraddittori nello stesso istante
      // (segnalato). MIRROR aveva già la sua fase; ora ce l'hanno tutti e tre.
      case 'contact.say_item': case 'null.say_item':
        return LC('Dì l\'item adesso: la prima parola che dici diventa l\'item.',
                  'Dis l\'item maintenant : le premier mot que tu dis devient l\'item.',
                  'Say the item now: the first word you say becomes the item.',
                  'Di el ítem ahora: la primera palabra que digas se vuelve el ítem.',
                  'Säg item nu: det första ordet du säger blir item.');
      case 'mirror.item': case 'mirror.say_item':
        return LC('Scrivilo o dillo, poi premi.', 'Écris-le ou dis-le, puis appuie.', 'Type it or say it, then press.', 'Escríbelo o dilo, luego pulsa.', 'Skriv eller säg det, tryck sedan.');
      case 'mirror.contact':
        return LC('Quanta carica ha questo item? Dai un valore da 1 a 10.',
                  'Combien de charge a cet item ? Donne une valeur de 1 à 10.',
                  'How much charge has this item? Give a value from 1 to 10.',
                  '¿Cuánta carga tiene este ítem? Da un valor de 1 a 10.',
                  'Hur mycket laddning har detta item? Ge ett värde 1–10.');
      case 'mirror.doubling':
        return LC('Fallo scaricare fino al doppio, poi dichiaralo.',
                  'Fais-le décharger jusqu\'au double, puis déclare-le.',
                  'Have it discharge to the double, then declare it.',
                  'Haz que descargue hasta el doble, luego decláralo.',
                  'Låt det laddas ur till dubbeln, deklarera sedan.');
      case 'mirror.reached':
        return LC('Valida e riparti con un altro item.',
                  'Valide et repars avec un autre item.',
                  'Validate and go on with another item.',
                  'Valida y sigue con otro ítem.',
                  'Validera och fortsätt med ett annat item.');
      default:
        return null;   // TONE è assessment puro: il suo testo va già bene così com'è.
    }
  };

  /**
   * Toglie il « 1 · » davanti al titolo del tempo.
   *
   * La numerazione ora la porta la PISTA (CycleSteps): ① ITEM — ② MOCK-UP — ③ AS-IS. Lasciarla
   * anche nel titolo la scriveva due volte, e per giunta a metà — un « 1 · » senza il 2 e il 3
   * accanto era proprio ciò che rendeva la sequenza incomprensibile. Si toglie qui invece che
   * riscrivere quindici stringhe in cinque lingue: il numero resta nei testi, e chi legge il
   * sorgente vede ancora a quale tempo corrisponde ogni frase.
   */
  const senzaNumero = (t: string) => t.replace(/^\s*\d+\s*·\s*/, '');

  const spiegazioneCiclo = useMemo((): { titolo: string; comando?: string | null; come: string; avviso?: string | null; fatto?: boolean } => {
    const n = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}`;

    // ── TONE : dai l'item → portalo a tono 40 ─────────────────────────────────────────────
    // I DUE COMANDI DI RON, alla lettera. Prima il titolo diceva all'AUDITOR cosa fare
    // (« localizza la resistenza ») e la frase da DIRE al preclear non era scritta da nessuna
    // parte: se la doveva sapere a memoria. Adesso il comando è il soggetto della riga.
    if (phaseFamily(faseCiclo) === 'tone') {
      if (faseCiclo === 'tone.item') return {
        titolo: LC('1 · DAI L\'ITEM', '1 · DONNE L\'ITEM', '1 · GIVE THE ITEM', '1 · DA EL ÍTEM', '1 · GE ITEM'),
        comando: LC('« Localizza sul tuo caso una resistenza che possa essere corsa adesso. »',
                    '« Localise sur ton cas une résistance qui puisse être courue maintenant. »',
                    '« Locate resistance on your case that can now be run. »',
                    '« Localiza en tu caso una resistencia que pueda correrse ahora. »',
                    '« Lokalisera ett motstånd i ditt fall som kan köras nu. »'),
        come: LC('Scrivi o dì la resistenza che il preclear trova, poi premi.',
                 'Écris ou dis la résistance que le préclair trouve, puis appuie.',
                 'Type or say the resistance the preclear finds, then press.',
                 'Escribe o di la resistencia que el preclear encuentra, luego pulsa.',
                 'Skriv eller säg motståndet preclearen hittar, tryck sedan.') };
      if (faseCiclo === 'tone.say_item') return {
        titolo: LC('1 · DÌ LA RESISTENZA', '1 · DIS LA RÉSISTANCE', '1 · SAY THE RESISTANCE', '1 · DI LA RESISTENCIA', '1 · SÄG MOTSTÅNDET'),
        come: LC('La prima parola che dici diventa la resistenza su cui si lavora.',
                 'Le premier mot que tu dis devient la résistance sur laquelle on travaille.',
                 'The first word you say becomes the resistance being worked.',
                 'La primera palabra que digas se vuelve la resistencia sobre la que se trabaja.',
                 'Det första ordet du säger blir motståndet som körs.') };
      // ── ② IL COMANDO CHE SI RIPETE ────────────────────────────────────────────────────
      // « Raise this to tone forty on the tone scale. » — chiesto RIPETUTAMENTE, finché non
      // c'è più reazione e il preclear raggiunge la serenità dell'essere (+40, la cima della
      // colonna a destra). Il conto delle volte è nel titolo perché È il processo: si vede
      // salire mentre si conduce, e finisce nel journal a ciclo chiuso.
      if (faseCiclo === 'tone.raise') return {
        titolo: `2 · ${LC('PORTALO A TONO 40', 'MÈNE-LE AU TON 40', 'RAISE IT TO TONE 40', 'LLÉVALO AL TONO 40', 'FÖR DET TILL TON 40')}`
          + (toneRipetizioni > 0 ? ` · ×${toneRipetizioni}` : ''),
        comando: LC('« Porta questo a tono quaranta sulla scala del tono. »',
                    '« Mène ceci au ton quarante sur l\'échelle des tons. »',
                    '« Raise this to tone forty on the tone scale. »',
                    '« Lleva esto al tono cuarenta en la escala del tono. »',
                    '« För detta till ton fyrtio på tonskalan. »'),
        come: LC('Ridallo finché non reagisce più e arriva alla serenità dell\'essere.',
                 'Redonne-le jusqu\'à ce qu\'il ne réagisse plus et atteigne la sérénité de l\'être.',
                 'Give it again until there is no reaction and he reaches serenity of beingness.',
                 'Vuelve a darlo hasta que no reaccione más y alcance la serenidad del ser.',
                 'Ge det igen tills ingen reaktion finns och han når varandets stillhet.') };
      return { titolo: LC('TONO QUARANTA RAGGIUNTO', 'TON QUARANTE ATTEINT', 'TONE FORTY REACHED', 'TONO CUARENTA ALCANZADO', 'TON FYRTIO NÅDD'), fatto: true,
        come: LC('Non reagisce più: serenità dell\'essere. Validato da te.',
                 'Il ne réagit plus : sérénité de l\'être. Validé par toi.',
                 'No more reaction: serenity of beingness. Validated by you.',
                 'Ya no reacciona: serenidad del ser. Validado por ti.',
                 'Ingen reaktion kvar: varandets stillhet. Validerat av dig.') };
    }

    // ── MIRROR : item → valore → il DOPPIO da smaltire ────────────────────────────────────
    if (phaseFamily(faseCiclo) === 'mirror') {
      if (faseCiclo === 'mirror.item') return {
        titolo: LC('1 · DAI L\'ITEM', '1 · DONNE L\'ITEM', '1 · GIVE THE ITEM', '1 · DA EL ÍTEM', '1 · GE ITEM'),
        come: LC('Scrivilo o dillo a voce, poi premi. Il valore si fissa sulla carica di QUESTO item.', 'Écris-le ou dis-le, puis appuie. La valeur se fige sur la charge de CET item.', 'Type it or say it, then press. The value is fixed on THIS item\'s charge.', 'Escríbelo o dilo, luego pulsa. El valor se fija en la carga de ESTE ítem.', 'Skriv eller säg det, tryck sedan. Värdet fästs på DETTA items laddning.') };
      if (faseCiclo === 'mirror.say_item') return {
        titolo: LC('2 · DÌ L\'ITEM', '2 · DIS L\'ITEM', '2 · SAY THE ITEM', '2 · DI EL ÍTEM', '2 · SÄG ITEM'),
        come: LC('La prima parola che dici diventa l\'item, e la misura riparte da lì.', 'Le premier mot que tu dis devient l\'item, et la mesure repart de là.', 'The first word you say becomes the item, and the measure restarts there.', 'La primera palabra que digas se vuelve el ítem, y la medida reinicia allí.', 'Det första ordet du säger blir item, och mätningen börjar om där.') };
      if (faseCiclo === 'mirror.contact') return {
        titolo: LC('3 · CONTATTO DELLA CARICA', '3 · CONTACT DE LA CHARGE', '3 · CONTACTING THE CHARGE', '3 · CONTACTO DE LA CARGA', '3 · KONTAKT MED LADDNINGEN'),
        come: LC('Aspetta: il valore 1–10 si fissa da sé quando la lettura si è girata.', 'Attends : la valeur 1–10 se fige d\'elle-même quand la lecture s\'est retournée.', 'Wait: the 1–10 value fixes itself once the read has turned over.', 'Espera: el valor 1–10 se fija solo cuando la lectura se ha girado.', 'Vänta: värdet 1–10 fäster av sig självt när avläsningen vänt.') };
      if (faseCiclo === 'mirror.reached') return {
        titolo: LC('OTTENUTO', 'OBTENU', 'OBTAINED', 'OBTENIDO', 'UPPNÅTT'), fatto: true,
        come: LC('Lo smaltito ha raggiunto il doppio. Valida e riparti con un altro item.', 'Le déchargé a atteint le double. Valide et repars avec un autre item.', 'The discharged reached the double. Validate and go on with another item.', 'Lo descargado alcanzó el doble. Valida y sigue con otro ítem.', 'Det urladdade nådde dubbeln. Validera och fortsätt med ett annat item.') };
      return {
        titolo: `4 · ${LC('PORTA AL DOPPIO', 'MÈNE AU DOUBLE', 'TAKE IT TO THE DOUBLE', 'LLEVA AL DOBLE', 'FÖR TILL DUBBELN')} ${(2 * mirrorDisp.valueR).toFixed(1)}`,
        come: LC(`Valore ${mirrorDisp.valueR.toFixed(1)} — il metodo del doppio di Ron. Non fare altro: si smaltisce da sé.`, `Valeur ${mirrorDisp.valueR.toFixed(1)} — la méthode du double de Ron. Ne fais rien d'autre : ça se décharge tout seul.`, `Value ${mirrorDisp.valueR.toFixed(1)} — Ron's doubling method. Do nothing else: it discharges by itself.`, `Valor ${mirrorDisp.valueR.toFixed(1)} — el método del doble de Ron. No hagas nada más: se descarga solo.`, `Värde ${mirrorDisp.valueR.toFixed(1)} — Rons dubbelmetod. Gör inget annat: det laddas ur av sig självt.`) };
    }

    // ── NULL : item → mock-up → RISE → EQUILIBRIUM ────────────────────────────────────────
    if (phaseFamily(faseCiclo) === 'null') {
      if (faseCiclo === 'null.item') return {
        titolo: LC('1 · DAI L\'ITEM', '1 · DONNE L\'ITEM', '1 · GIVE THE ITEM', '1 · DA EL ÍTEM', '1 · GE ITEM'),
        come: LC('Se l\'ago NON legge, premi: è il ciclo speculare, si lavora su ciò che non reagisce.', 'Si l\'aiguille NE lit PAS, appuie : c\'est le cycle miroir, on travaille sur ce qui ne réagit pas.', 'If the needle does NOT read, press: this is the mirror cycle, working on what does not react.', 'Si la aguja NO lee, pulsa: es el ciclo espejo, se trabaja sobre lo que no reacciona.', 'Om nålen INTE läser, tryck: det är spegelcykeln, man arbetar på det som inte reagerar.') };
      if (faseCiclo === 'null.say_item') return {
        titolo: LC('DÌ L\'ITEM', 'DIS L\'ITEM', 'SAY THE ITEM', 'DI EL ÍTEM', 'SÄG ITEM'),
        come: LC('La prima parola che dici diventa l\'item.', 'Le premier mot que tu dis devient l\'item.', 'The first word you say becomes the item.', 'La primera palabra que digas se vuelve el ítem.', 'Det första ordet du säger blir item.') };
      if (faseCiclo === 'null.rise') return {
        titolo: LC('3 · LA CARICA SALE', '3 · LA CHARGE MONTE', '3 · THE CHARGE RISES', '3 · LA CARGA SUBE', '3 · LADDNINGEN STIGER'),
        come: LC('Il mock-up sta creando massa. Aspetta il ritorno alla base: quello è l\'EQUILIBRIUM.', 'Le mock-up crée de la masse. Attends le retour à la base : c\'est ça l\'EQUILIBRIUM.', 'The mock-up is creating mass. Wait for the return to base: that is the EQUILIBRIUM.', 'El mock-up está creando masa. Espera el retorno a la base: eso es el EQUILIBRIUM.', 'Mock-upen skapar massa. Vänta på återgången till basen: det är EQUILIBRIUM.') };
      if (faseCiclo === 'null.equilibrium') return {
        titolo: 'EQUILIBRIUM', fatto: true,
        come: LC('Tornato alla base. Valida inscrivendo i VGI\'s — sì o no, sei tu a dirlo.', 'Revenu à la base. Valide en inscrivant les VGI\'s — oui ou non, c\'est toi qui le dis.', 'Back to base. Validate by recording the VGI\'s — yes or no, you say it.', 'Vuelto a la base. Valida inscribiendo los VGI\'s — sí o no, lo dices tú.', 'Tillbaka till basen. Validera genom att skriva in VGI\'s — ja eller nej, du säger det.') };
      return {
        titolo: LC('2 · CHIEDI UN MOCK-UP', '2 · DEMANDE UN MOCK-UP', '2 · ASK FOR A MOCK-UP', '2 · PIDE UN MOCK-UP', '2 · BE OM EN MOCK-UP'),
        come: LC('Il tempo non è imposto: ogni preclear ha il suo. Il cronometro è solo indicativo.', 'Le temps n\'est pas imposé : chaque préclair a le sien. Le chrono est indicatif.', 'The time is not imposed: each preclear has their own. The clock is only indicative.', 'El tiempo no se impone: cada preclear tiene el suyo. El cronómetro es indicativo.', 'Tiden är inte given: varje preclear har sin. Klockan är bara vägledande.') };
    }

    // ── CONTACT : item → il ciclo avanza da sé → AS-IS ────────────────────────────────────
    // `free` cade qui, com'è sempre stato: il modo LIBERO non arma cicli, e l'unica riga che
    // può mostrare è la prima. Sarà lo SCHERMO, non il testo, a trattarlo come una fase a sé.
    if (faseCiclo === 'contact.item' || faseCiclo === 'free') return {
      titolo: LC('1 · DAI L\'ITEM', '1 · DONNE L\'ITEM', '1 · GIVE THE ITEM', '1 · DA EL ÍTEM', '1 · GE ITEM'),
      come: LC('L\'ago legge → premi. Puoi scrivere l\'item o dirlo a voce dopo aver premuto.', 'L\'aiguille lit → appuie. Tu peux écrire l\'item ou le dire après avoir appuyé.', 'The needle reads → press. You can type the item or say it after pressing.', 'La aguja lee → pulsa. Puedes escribir el ítem o decirlo tras pulsar.', 'Nålen läser → tryck. Du kan skriva item eller säga det efter tryckningen.') };
    if (faseCiclo === 'contact.say_item') return {
      titolo: LC('DÌ L\'ITEM', 'DIS L\'ITEM', 'SAY THE ITEM', 'DI EL ÍTEM', 'SÄG ITEM'),
      come: LC('La prima parola che dici diventa l\'item.', 'Le premier mot que tu dis devient l\'item.', 'The first word you say becomes the item.', 'La primera palabra que digas se vuelve el ítem.', 'Det första ordet du säger blir item.') };
    if (faseCiclo === 'contact.asis') return {
      titolo: '3 · AS-IS', fatto: true,
      come: LC('La firma della carica è collassata e l\'F/N è arrivato. Proposto: validi tu, mai l\'app.', 'La signature de la charge s\'est effondrée et la F/N est là. Proposé : c\'est toi qui valides, jamais l\'app.', 'The charge signature has collapsed and the F/N is here. Proposed: you validate, never the app.', 'La firma de la carga colapsó y llegó la F/N. Propuesto: validas tú, nunca la app.', 'Laddningens signatur har kollapsat och F/N är här. Föreslaget: du validerar, aldrig appen.') };
    // ⚠️ TRE TEMPI, non quattro. Avevo scritto « 2 · lascia guardare » e « 3 · si dissolve »:
    // sbagliato — la correzione è dell'auditor, ed è il punto 2 che comanda il ciclo. Al CONTACT
    // si CHIEDE UN MOCK-UP, e il tempo 3 è direttamente l'AS-IS. La dissoluzione non è un tempo
    // della procedura: è quel che l'app MISURA mentre il tempo 2 dura, e sta nella riga d'avviso.
    return {
      titolo: LC('2 · CHIEDI UN MOCK-UP', '2 · DEMANDE UN MOCK-UP', '2 · ASK FOR A MOCK-UP', '2 · PIDE UN MOCK-UP', '2 · BE OM EN MOCK-UP'),
      come: LC('Poi non fare altro: il ciclo avanza da sé fino all\'AS-IS.', 'Puis ne fais rien d\'autre : le cycle avance tout seul jusqu\'à l\'AS-IS.', 'Then do nothing else: the cycle advances by itself to the AS-IS.', 'Luego no hagas nada más: el ciclo avanza solo hasta el AS-IS.', 'Gör sedan inget mer: cykeln går själv fram till AS-IS.'),
      avviso: noReadSignal
        ? LC('sembra NULL — nessuna lettura nella finestra', 'semble NULL — aucune lecture dans la fenêtre', 'looks NULL — no read in the window', 'parece NULL — ninguna lectura en la ventana', 'ser NULL ut — ingen avläsning i fönstret')
        : chargePhaseNow === 'discharge'
        ? LC('la carica si sta dissolvendo', 'la charge se dissout', 'the charge is dissolving', 'la carga se está disolviendo', 'laddningen löses upp')
        : null };
    // La fase copre da sola mode/tonePhase/mirror*/cycleArmed/asIsPending/nullPhase: restano
    // qui solo i valori che entrano nel TESTO (numeri, smentita, riga d'avviso).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faseCiclo, toneRipetizioni,
      mirrorDisp, chargePhaseNow, noReadSignal, lang]);


  // Specchio in ref: il gestore del worker si aggancia una volta sola, e l'ago si può cambiare
  // in seduta — senza questo continuerebbe a usare quello scelto all'avvio.
  const agoPrincipaleRef = useRef(agoPrincipale); agoPrincipaleRef.current = agoPrincipale;
  // Cambiando ago, le reazioni scritte tornano a quelle dell'ago nuovo. « Per difetto » vuol
  // dire questo: si guarda un ago, si leggono le sue. Se l'auditor vuole ENTRAMBI lo dice, e
  // quella scelta resta finché non cambia ago di nuovo.
  //
  // ⚠️ MA DUE non va disfatto. Scegliendo DUE l'ago passa al METER (vedi il selettore), quindi
  // `agoPrincipale` CAMBIA — e questo effetto, senza la guardia, rimetteva subito le reazioni
  // del solo METER, cancellando la scelta un istante dopo il clic. La scelta esplicita
  // dell'auditor vince sul ripristino automatico: è la stessa regola di `pinned` in
  // `visibleSet.ts` — la mano batte l'automatismo.
  useEffect(() => {
    setReazioniViste(prev => (prev === 'both' ? 'both' : agoPrincipale));
  }, [agoPrincipale]);
  /**
   * CON DUE STRUMENTI SI PARTE DA « DUE ».
   *
   * Averli collegati tutti e due e vederne UNO SOLO nasconde metà di quel che si è preparato:
   * il difetto giusto è mostrare tutto e lasciare che l'auditor restringa, non il contrario.
   * DUE porta l'ago del METER (misurato, non ricostruito) e le reazioni del MUSE in più.
   *
   * Una volta sola per collegamento, e MAI contro una scelta già fatta: se l'auditor ha già
   * toccato il selettore in questa seduta, la sua scelta resta. E non tocca i cicli in cui è il
   * METODO a imporre l'ago (MODE_SPEC): là `agoScelto` non viene nemmeno consultato.
   */
  const dueGiaImpostatoRef = useRef(false);
  useEffect(() => {
    const dueStrumenti = instruments.muse && instruments.theta;
    if (!dueStrumenti) { dueGiaImpostatoRef.current = false; return; }
    if (dueGiaImpostatoRef.current) return;
    dueGiaImpostatoRef.current = true;
    setReazioniViste('both');
    setAgoScelto('theta');
  }, [instruments.muse, instruments.theta]);

  const [showThetaCal, setShowThetaCal] = useState(false);

  // ESC chiude il selettore d'apertura. Chi ha aperto per sbaglio cerca ESC prima di cercare
  // una croce, e senza questo il pannello era senza uscita (segnalato).
  useEffect(() => {
    if (!museHint) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMuseHint(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [museHint]);

  // ── CONN-53: graceful disconnect on tab/app close ──────────────────────────
  // Without this, quitting Chrome / killing the app left the peer waiting on the
  // heartbeat watchdog (~10-15 s) before it showed "waiting for PC" again. We
  // fire a best-effort BYE on pagehide so the peer detects the leave instantly.
  useEffect(() => {
    const bye = () => { try { networkManager.notifyLeaving(); } catch (_) {} };
    window.addEventListener('pagehide', bye);
    window.addEventListener('beforeunload', bye);
    return () => {
      window.removeEventListener('pagehide', bye);
      window.removeEventListener('beforeunload', bye);
    };
  }, []);

  const capturePcPhoto = () => {
    // Find the video element inside the PC cam container (cam2)
    // We use a ref-based approach: grab all videos and pick the one with actual stream
    const videos = Array.from(document.querySelectorAll('video')) as HTMLVideoElement[];
    const video = videos.find(v => v.videoWidth > 0 && v.readyState >= 2) || videos[0];
    if (video && video.videoWidth > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setPcPhoto(dataUrl);
        setPcPreview(dataUrl);
      }
    } else {
      // Video not ready yet, try again after a short delay
      setTimeout(() => {
        const v = (Array.from(document.querySelectorAll('video')) as HTMLVideoElement[]).find(v => v.videoWidth > 0);
        if (v) {
          const canvas = document.createElement('canvas');
          canvas.width = v.videoWidth; canvas.height = v.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) { ctx.drawImage(v, 0, 0); setPcPhoto(canvas.toDataURL('image/jpeg', 0.8)); setPcPreview(canvas.toDataURL('image/jpeg', 0.8)); }
        }
      }, 500);
    }
  };

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
    }
    if (localRecognitionRef.current) {
      localRecognitionRef.current.stop();
      localRecognitionRef.current = null;
      // On conserve isUsingLocalRecognition.current pour savoir quoi relancer au resume
    }
  }, []);

  const handleStart = async () => {
    isUsingLocalRecognition.current = false;
    sttMsgLoggedRef.current.clear(); // nouvelle séance → le statut STT peut se ré-afficher UNE fois
    // FIX CONN-35: close the NEURAL LINK drawer when the session starts — once
    // running, the connection panel is no longer needed and the operator wants
    // the full needle view.
    setSidebarDrawer(null);

    // FIX CONN-6: in AUDITOR mode the brainwave data comes from the remote
    // PARTICIPANT (via SSE relay). The auditor's own machine MUST NOT try to
    // connect a local Muse — there isn't one. We unconditionally skip the
    // local Muse connect step whenever we're in auditor mode, regardless of
    // whether the participant is currently connected: yo-yo'ing P2P drops are
    // common on mobile networks and we don't want a "No Muses found" dialog
    // popping up on the auditor's screen between reconnect attempts.
    const isAuditorMode = (appMode === 'auditor');
    // ── NESSUNO STRUMENTO: SI CHIEDE QUALE, non si sceglie per l'utente ──────────────────
    // Prima si TENTAVA il Muse e si mostrava la scelta solo se falliva: premendo START partiva
    // comunque la sua ricerca, e il pannello di scelta non si vedeva mai. Ora la scelta viene
    // PRIMA. Con uno dei due già collegato non si chiede nulla e non si va a cercare l'altro:
    // è una configurazione scelta, non una mancanza da rimediare.
    const thetaLive = thetaConnectedRef.current;
    // `senzaStrumenti` è la terza voce del selettore: chi l'ha scelta ha già risposto alla
    // domanda, e richiederglielo la trasformerebbe di nuovo in un ostacolo.
    if (!isAuditorMode && !senzaStrumentiRef.current
        && museConnection !== 'connected' && !thetaLive) {
      setMuseHint(true);
      return;
    }

    voiceToneAnalyzer.init(); // fire-and-forget, le micro peut prendre quelques ms

    // Vérifier et réactiver l'AudioContext s'il est suspendu
    await voiceToneAnalyzer.ensureAudioContextActive();

    // Démarrer la reconnaissance vocale
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (e) {
        startLocalRecognition();
      }
    } else {
      startLocalRecognition();
    }
    
    if (sessionState === 'idle' || sessionState === 'ended') {
      // PHASE-A: clock.start() resets accumulated time AND begins ticking.
      // The 'running' sessionState transition just below triggers the
      // sessionState→clock effect — `start()` here ensures the reset is atomic
      // and the first tick happens with time=0 (no garbage time from the
      // previous session leaking in).
      sessionClock.start();
      timeRef.current = 0;
      setSessionStartTime(new Date());
      setSessionEndTime(null);
      // ── CORPUS: apertura di seduta ────────────────────────────────────────────────────────
      // Va scritta ADESSO, non alla fine: è la configurazione con cui si leggerà tutto il
      // resto, e se la seduta si interrompe le reazioni già scritte devono restare
      // interpretabili. L'identificativo è l'ora d'inizio: unico in pratica, e ordinabile.
      {
        const at = new Date().toISOString();
        corpusSessionRef.current = at;
        const sc = theta.taScale;
        // ⚠️ NEL BROWSER NON C'È ARCHIVIO, e va detto SUBITO. In Chrome funzionano il meter
        // (WebHID), il Muse (Web Bluetooth) e la trascrizione: tutto sembra a posto, e la
        // seduta non viene archiviata. Ci sono volute due sedute intere per accorgersene.
        if (!corpusAvailable()) {
          logBufferRef.current.push({ time: 0, speaker: 'SYS',
            text: LC('⚠ ARCHIVIO NON ATTIVO — sei in un browser: questa seduta NON verrà archiviata. Usa l\'applicazione EQUILIBRIUM.',
                     '⚠ ARCHIVE INACTIVE — vous êtes dans un navigateur : cette séance NE SERA PAS archivée. Utilisez l\'application EQUILIBRIUM.',
                     '⚠ ARCHIVE INACTIVE — you are in a browser: this session will NOT be archived. Use the EQUILIBRIUM application.',
                     '⚠ ARCHIVO INACTIVO — estás en un navegador: esta sesión NO se archivará. Usa la aplicación EQUILIBRIUM.',
                     '⚠ ARKIVET AV — du är i en webbläsare: den här sessionen arkiveras INTE. Använd EQUILIBRIUM-appen.'),
            type: 'highlight' });
        }
        corpusWrite(sessionRecord(at, at, {
          inst: { muse: museConnection === 'connected', theta: thetaConnectedRef.current },
          cans: thetaConnectedRef.current ? theta.setup.config : undefined,
          sens: thetaConnectedRef.current ? theta.setup.needleScale : undefined,
          sensTrim: thetaConnectedRef.current ? theta.setup.sensTrim : undefined,
          taPoints: sc ? sc.points.length : undefined,
          taFactory: sc ? sc.madeAt === 0 : undefined,
          // Il PROCEDIMENTO, se l'auditor l'ha indicato: senza di esso le reazioni sono numeri
          // senza contesto; con esso si può chiedere quale processo dà quali reazioni.
          proc: sessionProcessObjective.trim() || undefined,
        }));
      }
      sessionRecorder.reset(); // chart + reactions + metrics + qL + needle-offset + CSV
      tzoneStore.reset();      // live T-ZONES distribution
      chargeEpisode.resetSession(); // charge-lifecycle (AS-IS) episode tracker
      contactPredictor.reset();     // predictive contact (leading-edge) — Phase 1
      cycleStateMachine.reset();    // per-item charge phase FSM
      reactionClassifier.reset();   // dirty-needle + F/N latch persistence
      cycles.resetCycles(); setAuditingQuestion('');
      // Comm lag : on part du BASELINE (Pre-Read ~450 ms) déjà VISIBLE (au lieu de « — »),
      // puis il se personnalise par cycle. N=0 → l'UI le marque « ~ » (estimation, pas encore
      // mesuré sur ce PC). Évite le « je ne vois plus le comm lag » quand aucun cycle n'a encore
      // fourni de leading-edge.
      lagMeter.reset();
      setDeltaStar(lagMeter.getDeltaStar()); setDeltaStarN(0); setDeltaTrend(0);
      setDeltaBaseline(lagMeter.getBaseline()); setDeltaAdaptive(0); gammaEmaRef.current = 0;
      falseAsIsDetector.reset();
      mirror.resetMirror();
      tone.resetTone(); toneCyclesRef.current = [];
      setAssessActive(false); setAssessSession([]); assessCyclesRef.current = []; assessNRef.current = 0; assessPrevAtRef.current = -Infinity;
      shownReadsRef.current = [];   // trace des réactions montrées : repart à zéro
      assessTimesRef.current = [];
      ultimoItemSecRef.current = null;
      gruppiItemRef.current = new Map();
      lastFnShownAtRef.current = -Infinity;
      assessStartRef.current = 0; assessLogCursorRef.current = 0; assessIdRef.current = 0;
      lastLoggedChargeRef.current = 'neutral';
      chargeLogPendingRef.current = { candidate: null, sinceMs: 0 };
      velocityTracker.resetSession(); // clear qL window + re-seed the self-calibrating baseline
      lastLoggedReactionRef.current = null;
      needleEngine.reset(); // PHASE-A: full physics reset (cancels RAF, snaps to SET, clears timers)
      virtualNeedle.reset(); needleVirtualRef.current = []; // hidden classifier spring + history
      activeKickRef.current = null; if (kickFlybackRef.current) { clearTimeout(kickFlybackRef.current); kickFlybackRef.current = null; }
      // Il transcript vocale si mostra anche in SOLO (scelta utente): niente più nota « solo PDF ».
      journal.resetJournal(t('sys_start') as string);
      setDisplayMass(0);
      massAccumulator.current = 0;
      tickRef.current = 0;
      setShowReport(false);
      fnTracker.reset();
      resetEpState();
      // FIX M-10: reset MNA/PrimeFreq state so the previous session's
      // primePhase / primeIm / primeFd / primeZone don't carry over.
      resetMnaSession();
      // Clear briefing fields from previous session
      setSessionObjective('');
      setSessionProcessObjective('');
      setSessionPhysicalCheck('');
      setSessionBriefing('');
      metricsStore.resetTotalTa(); // CONN-122
      clearSessionDraft(); // R3: a fresh session supersedes any recovery draft
      taAccumulator.resetSession(); // re-arm the Total-TA high-water tracker
    }
    setSessionState('running');
    // ── Session timer sync: notify Preclear ──────────────────────────────────
    if (appModeRef.current === 'auditor') {
      networkManager.send({ type: 'SESSION_STATE', state: 'running', time: 0, seq: ++sessionStateSeqRef.current }, true);
    }
  };

  // Pressing START routes through the pre-session readiness check (advisory): if a
  // live signal is present we open the metabolic overlay first; its "Inizia"/"Salta"
  // then calls the real handleStart. No signal (or already running) → start directly.
  const proceedStart = () => {
    // Premere START esce SEMPRE da qualunque VISTA a schermo intero (Historique, Processus,
    // Profili, Report) → l'auditor si ritrova sullo schermo dell'ago. Funziona da OGNI vista
    // (tutti i punti d'ingresso dello START passano di qui).
    setShowHistoryModal(false);
    setShowProcessus(false);
    setShowRoster(false);
    setShowReport(false);
    const fresh = sessionState === 'idle' || sessionState === 'ended';
    // The breath/metabolic readiness check now runs on EVERY fresh session (user
    // request). It used to be gated on a live signal, so a START before the headband
    // settled skipped it entirely. It's advisory and shows live contact — if there's
    // no signal yet, the auditor sees it and can wait or skip.
    // ── LA SCELTA DELLO STRUMENTO VIENE PRIMA DI TUTTO ────────────────────────────────────
    // Prima stava in handleStart, cioe' DOPO la schermata di prontezza: e quella, senza Muse,
    // mostrava la propria richiesta di connessione: bisognava saltarla per arrivare alla
    // scelta. Qui invece si decide con che cosa si audita, e solo dopo si prepara la seduta.
    // Il satellite gira sul ruolo di rete 'auditor' ma è una seduta nella stessa stanza:
    // anche lì si sceglie con che cosa si audita (MUSE, boîtes, o tutti e due).
    if ((appModeRef.current !== 'auditor' || satelliteModeRef.current)
        && !senzaStrumentiRef.current
        && museConnection !== 'connected' && !thetaConnectedRef.current) {
      setMuseHint(true);
      return;
    }

    // ── SENZA STRUMENTI NON C'È PRONTEZZA DA VERIFICARE ────────────────────────────────────
    // Il controllo di prontezza (respiro del MUSE, prova delle boîtes) misura che gli strumenti
    // leggano bene prima di cominciare. Senza strumenti non c'è nulla da misurare: la schermata
    // del respiro compariva lo stesso e chiedeva di prepararsi a un casco che non c'è
    // (segnalato). Si va dritti alla seduta.
    if (fresh && !senzaStrumentiRef.current) {
      metabolicBaseline.reset();
      setMetabAssessment(null);                  // clear any previous reading
      metabolicPhaseRef.current = 'baseline';
      setThetaReadyDone(false);   // le prove si rifanno a OGNI avvio
      setMetabolicOpen(true);
    } else {
      handleStart();
    }
  };
  const requestStart = () => {
    // Se l'auditor NON ha indicato il PC, il sesso (→ baseline TA: uomo 3 / donna 2) è
    // ignoto: chiedilo PRIMA di proseguire con le tappe di avvio. Alla scelta si continua.
    if (!pcSex) { setShowSexPrompt(true); return; }
    proceedStart();
  };
  const closeMetabolic = () => {
    metabolicPhaseRef.current = 'idle'; setMetabolicOpen(false);
    // À distance : dire au préclair de retirer l'overlay respiration.
    if (appModeRef.current === 'auditor') { try { networkManager.send({ type: 'READINESS', open: false }, true); } catch (_) {} }
  };

  const handlePause = () => {
    stopRecognition();
    setSessionState('paused');
    addLog({ time: timeRef.current, speaker: 'SYS', text: t('sys_pause') as string });
    if (appModeRef.current === 'auditor') {
      networkManager.send({ type: 'SESSION_STATE', state: 'paused', time: timeRef.current, seq: ++sessionStateSeqRef.current }, true);
    }
  };

  const handleResume = () => {
    setSessionState('running'); // déclenche le useEffect qui relance Google Speech
    addLog({ time: timeRef.current, speaker: 'SYS', text: t('sys_resume') as string });
    if (appModeRef.current === 'auditor') {
      networkManager.send({ type: 'SESSION_STATE', state: 'running', time: timeRef.current, seq: ++sessionStateSeqRef.current }, true);
    }
    // Si on utilisait la reconnaissance locale, la relancer
    if (isUsingLocalRecognition.current) {
      isUsingLocalRecognition.current = false;
      startLocalRecognition();
    }
  };

  // ── LA LINGUA CAMBIATA IN SEDUTA RIAVVIA IL RICONOSCITORE ────────────────────────────
  // Il riconoscitore si configura UNA VOLTA, all'avvio della seduta. Cambiando lingua dopo,
  // l'interfaccia passava alla nuova e la trascrizione restava nella vecchia: parole francesi
  // capite come inglesi, e ovviamente nessun item riconoscibile.
  useEffect(() => {
    if (sessionState !== 'running') return;
    if (!sttLangRef.current || sttLangRef.current === lang) return;
    sttLangRef.current = lang;
    logBufferRef.current.push({ time: timeRef.current, speaker: 'SYS',
      text: LC(`Lingua cambiata — riconoscitore vocale riavviato in ${lang}`,
               `Langue changée — reconnaissance vocale relancée en ${lang}`,
               `Language changed — speech recogniser restarted in ${lang}`,
               `Idioma cambiado — reconocimiento de voz reiniciado en ${lang}`,
               `Språk ändrat — taligenkänningen omstartad på ${lang}`), type: 'normal' });
    stopRecognition();
    // ⚠️ SENZA QUESTA RIGA IL RICONOSCITORE NON RIPARTE PIÙ. `stopRecognition` conserva
    // `isUsingLocalRecognition` di proposito — serve a sapere cosa rilanciare riprendendo una
    // seduta in pausa — ma `startLocalRecognition` esce subito se lo trova vero (« già in
    // corso »). Risultato: si fermava e basta, e con lui sparivano la TRASCRIZIONE e
    // l'ASSESSMENT, che vive sulle parole trascritte. Qui il riconoscitore è appena stato
    // fermato: non è più in corso, e va detto.
    isUsingLocalRecognition.current = false;
    void startLocalRecognition();
    // `LC` NON sta nelle dipendenze di proposito: si ricrea a ogni render e ci farebbe
    // rientrare in questo effetto di continuo. Serve solo a comporre una frase, e la guardia
    // sopra (`sttLangRef.current === lang`) decide da sola quando c'è qualcosa da fare.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, sessionState, stopRecognition, startLocalRecognition]);

  const handleEnd = () => {
    stopRecognition();
    isUsingLocalRecognition.current = false;
    setSessionState('ended');
    // ⚠️ NON si azzera qui `senzaStrumenti`: il rapporto lo legge al render (`noInstruments`)
    // per l'etichetta e per togliere ZONE AS-IS / Lock Quality. Azzerarlo a fine seduta
    // cancellerebbe proprio quel che il rapporto deve dire. Si azzera alla CHIUSURA del
    // rapporto — vedi `onClose` di PostSessionReport.
    setSessionEndTime(new Date());
    // ⚠️ AGGIUNTO — v. la nota grande su `annullaTimerSospesi`, più giù: senza, un timer di
    // ASSESSMENT (o il rimbalzo dell'ago) rimasto in sospeso da QUESTA seduta poteva risolversi
    // durante la PROSSIMA (il componente resta montato, non smonta fra una seduta e l'altra).
    annullaTimerSospesi();
    addLog({ time: timeRef.current, speaker: 'SYS', text: t('sys_end') as string });
    if (appModeRef.current === 'auditor') {
      networkManager.send({ type: 'SESSION_STATE', state: 'ended', time: timeRef.current, seq: ++sessionStateSeqRef.current }, true);
    }
    setTimeout(() => voiceToneAnalyzer.stop(), 3000);
    // Un ciclo ancora armato si chiude « non concluso » — il ciclo sa come, e sa che questa
    // via non deve toccare i contatori né il giornale.
    cycles.closeOpenCycleAtEnd();
    // Idem pour un cycle MIRROR encore armé : on l'enregistre avec son état courant.
    if (mirrorArmedRef.current && mirrorCurRef.current) { stopMirror(); }
    // ASSESSMENT encore actif → on fige le dernier cycle pour le rapport.
    if (assessActiveRef.current) {
      const cyc = assessCyclesRef.current[assessCyclesRef.current.length - 1];
      if (cyc) cyc.tEndSec = timeRef.current;
      setAssessActive(false);
    }
    // CORPUS: si scrive quel che resta in coda SUBITO. Le righe della fine — l'ultimo ciclo,
    // le ultime reazioni — sono spesso le più interessanti, e aspettare il prossimo giro
    // vorrebbe dire perderle se l'applicazione si chiude qui.
    corpusSessionRef.current = '';
    void corpusFlushNow();
    setShowReport(true);
  };

  /**
   * ── TUTTI I TIMER A LUNGA PORTATA, ANNULLATI DA UN SOLO POSTO ────────────────────────────
   * Prima viveva SOLO nel cleanup allo smontaggio (sotto): senza di lei, un rimbalzo dell'ago,
   * un mascheramento di parole o la risoluzione di un read potevano scattare DOPO la fine della
   * seduta — stato aggiornato nel vuoto. Ma "smontaggio" e "fine seduta" NON sono lo stesso
   * istante: `handleEnd()` (poco più giù) chiude la seduta SENZA smontare il componente — la
   * stessa finestra resta aperta, pronta per la prossima — quindi questi timer non venivano MAI
   * annullati fra una seduta e la successiva, solo alla chiusura vera dell'app. Un timer di
   * ASSESSMENT rimasto in sospeso dalla seduta appena chiusa poteva quindi risolversi durante
   * la seduta SUCCESSIVA, scrivendo in un ciclo che non è più il suo. Estratta qui apposta, per
   * essere chiamata da ENTRAMBI i punti — non solo allo smontaggio.
   */
  const annullaTimerSospesi = () => {
    if (kickFlybackRef.current) clearTimeout(kickFlybackRef.current);
    // Il timer della riconnessione MUSE si spegne da sé: sta in `useMuseConnection`.
    if (epWindowTimerRef.current) clearTimeout(epWindowTimerRef.current);
    pendingTimersRef.current.forEach(id => window.clearTimeout(id));
    pendingTimersRef.current.clear();
  };

  // ── NETTOYAGE AU DÉMONTAGE ────────────────────────────────────────────────
  useEffect(() => annullaTimerSospesi, []);

  // ── R3: crash-recovery autosave ────────────────────────────────────────────
  // The latest session content lives in a ref (updated each render, cheap) so the
  // autosave interval reads fresh data without re-creating itself on every new log.
  const draftDataRef = useRef({ logs, auditorName, pcName, sessionObjective, sessionProcessObjective, sessionPhysicalCheck, sessionBriefing, sessionStartTime });
  draftDataRef.current = { logs, auditorName, pcName, sessionObjective, sessionProcessObjective, sessionPhysicalCheck, sessionBriefing, sessionStartTime };

  useEffect(() => {
    // Only the session OWNER (auditor / local) autosaves — the remote PC does not
    // own the session (#7), so it must not write a recovery draft.
    if (sessionState !== 'running' || appModeRef.current === 'participant') return;
    const snapshot = () => {
      const d = draftDataRef.current;
      saveSessionDraft({
        v: 1,
        savedAt: Date.now(),
        startTime: d.sessionStartTime ? d.sessionStartTime.getTime() : null,
        elapsed: timeRef.current,
        appMode: appModeRef.current,
        auditorName: d.auditorName,
        pcName: d.pcName,
        totalTa: metricsStore.get().totalTa,
        logs: d.logs,
        sessionObjective: d.sessionObjective,
        sessionProcessObjective: d.sessionProcessObjective,
        sessionPhysicalCheck: d.sessionPhysicalCheck,
        sessionBriefing: d.sessionBriefing });
    };
    snapshot(); // first snapshot immediately on entering 'running'
    const id = setInterval(snapshot, 10000);
    return () => clearInterval(id);
  }, [sessionState]);

  // R3: on mount, surface a recoverable draft (real content + recent + no live session).
  useEffect(() => {
    let cancelled = false;
    loadSessionDraftAsync().then(d => {
      if (cancelled || !d) return;
      const hasContent = ((d.logs?.length ?? 0) > 1) || (d.totalTa > 0);
      const recent = (Date.now() - d.savedAt) < 24 * 3600 * 1000;
      // Don't surface the prompt if a session started while the draft was loading.
      if (hasContent && recent && sessionStateRef.current === 'idle') setRecoverableDraft(d);
    });
    return () => { cancelled = true; };
     
  }, []);

  // R3: restore a draft into a PAUSED session — the auditor can then Resume or FIN
  // (→ report with the recovered transcript / R&I / Total TA / briefing). The EEG
  // chart is intentionally not restored (too large for the draft).
  const recoverDraft = (d: SessionDraft) => {
    try {
      setLogs(d.logs as any);
      metricsStore.resetTotalTa();
      if (d.totalTa) metricsStore.addTotalTa(d.totalTa);
      setSessionObjective(d.sessionObjective || '');
      setSessionProcessObjective(d.sessionProcessObjective || '');
      setSessionPhysicalCheck(d.sessionPhysicalCheck || '');
      setSessionBriefing(d.sessionBriefing || '');
      if (d.auditorName) setAuditorName(d.auditorName);
      if (d.pcName) setPcName(d.pcName);
      timeRef.current = d.elapsed || 0;
      try { sessionClock.syncTo(d.elapsed || 0); } catch (_) {}
      if (d.startTime) setSessionStartTime(new Date(d.startTime));
      setSessionEndTime(null);
      setSessionState('paused');
    } catch (e) {
      console.error('[R3] draft recovery failed', e);
    }
    setRecoverableDraft(null);
  };
  const discardDraft = () => { clearSessionDraft(); setRecoverableDraft(null); };

  // ── Handler used by SidebarDrawer LINK section ─────────────────────────────
  const handleModeChange = (mode: 'local' | 'auditor' | 'participant', opts?: { satellite?: boolean }) => {
    if (sessionState === 'running' || sessionState === 'paused') return;
    // Phone-satellite uses the auditor-host networking but stays a "local"
    // co-located session in the UI. Any explicit mode pick clears the flag.
    setSatelliteMode(!!opts?.satellite);
    // Host sends no outgoing AV to the phone only in satellite (anti-Larsen).
    networkManager.setSuppressOutgoingMedia(!!opts?.satellite);
    try { networkManager.disconnect?.(); } catch (_) {}
    setPeerId(''); setIsConnected(false);
    setConnectionLink(''); setParticipantLink('');
    // #8 (Roger): after a REMOTE session the previous remote MediaStream + flags
    // were left dangling, so resuming a LOCAL session (own camera) or recreating
    // the link started from a dirty state and the video stayed black. Clear the
    // remote stream and remote-peer flags on every mode switch for a clean slate.
    setRemoteStream(null);
    setRemoteMuseConnected(false);
    setRemoteBatteryLevel(null);
    setModeInitKey(k => k + 1);
    // (a) Remote auditing always involves a SEPARATE preclear, so the SOLO
    // session flag (auditor == preclear) is meaningless here and is force-off.
    if (mode !== 'local') setIsSoloSession(false);
    if (mode === 'local') {
      setAppMode('local');
    } else if (mode === 'auditor') {
      setAppMode('auditor');
      setShowConnectionModal(true);
      // Phone-satellite: co-located. The host (Mac) sends NO camera/mic to the
      // phone (the auditor is in the room), which saves bandwidth and kills the
      // Larsen loop (suppressOutgoingMedia already set above). So skip the
      // auditor getUserMedia. The Muse is paired directly to this Mac instead.
      if (!opts?.satellite) {
        // FIX CONN-15: pre-request the auditor's camera/mic up-front. When the
        // participant calls peer.call(auditorId, stream), the auditor's
        // `peer.on('call')` handler synchronously needs a real MediaStream to
        // answer with. If getUserMedia hasn't been granted yet, that handler
        // ends up answering with an empty MediaStream → the participant sees
        // no video coming back from the auditor (and the bidirectional video
        // experience the user requested doesn't work). Asking up-front here
        // (inside the mode-selector click → user gesture) means the OS prompt
        // fires immediately and the cached stream is ready before any call.
        navigator.mediaDevices.getUserMedia({ video: true, audio: VOICE_AUDIO_CONSTRAINTS })
          .catch(() => navigator.mediaDevices.getUserMedia({ video: false, audio: VOICE_AUDIO_CONSTRAINTS }))
          .then((s) => { (networkManager as any).localStream = s; })
          .catch(() => { /* user denied — auditor will be audio/video silent */ });
      }
      const localSignaling = serverLanIp || '127.0.0.1:7893';
      const auditorSigConfig = parseSignalingUrl(localSignaling);
      if (peerKeyRef.current) auditorSigConfig.peerKey = peerKeyRef.current;
      const freshToken = (() => {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, (b: number) => b.toString(16).padStart(2, '0')).join('');
      })();
      relayTokenRef.current = freshToken;
      networkManager.setRelayToken(freshToken);
      networkManager.setSignalingServer(auditorSigConfig);
      // FIX CONN-15: pass skipMediaRelease=true so init() doesn't destroy
      // the stream we just pre-acquired.
      networkManager.init('auditor', undefined, true).then(id => {
        setPeerId(id);
      }).catch(err => {
        addLog({ time: timeRef.current, speaker: 'SYS', text: (t('log_connection_failed') as string).replace('{err}', err.message || String(err)), type: 'highlight' });
      });
    } else {
      setAppMode('participant');
      setShowConnectionModal(true);
    }
    setSessionState('idle'); sessionClock.reset();
  };

  // (PUSH-TO-TALK keyboard removed — auditor is hands-free in satellite.)

  // ── Phone-satellite AUTO-JOIN from the scanned URL ─────────────────────────
  // The connection QR encodes `tunnelHost#peerId:relayToken:peerKey`. When the
  // PC's phone SCANS it, the browser opens that URL — but nothing here used to
  // read the hash, so the app just sat in local mode and "nothing happened".
  // On boot, if the URL carries a valid connection hash, switch to participant,
  // pre-fill the link and open the connection window. The user then taps
  // CONNECT once — that single gesture is REQUIRED on mobile to grant camera/mic
  // (and later to open the WebBluetooth picker for the Muse), so we deliberately
  // stop at "ready to connect" rather than auto-firing getUserMedia on load.
  const autoJoinDoneRef = useRef(false);
  useEffect(() => {
    if (autoJoinDoneRef.current) return;
    const raw = typeof window !== 'undefined' && window.location.hash
      ? window.location.hash.replace(/^#/, '').trim()
      : '';
    if (!raw) return;
    // raw = "peerId:relayToken:peerKey" — rebuild a full link using the host the
    // page was actually loaded from (the tunnel domain).
    const host = window.location.host;
    const link = `${host}#${raw}`;
    const parsed = parseConnectionLink(link);
    if (!parsed || !parsed.peerId) return;
    autoJoinDoneRef.current = true;
    setIsSoloSession(false);
    setAppMode('participant');
    setParticipantLink(link);
    // Satellite (co-located): the phone is a send-only mic+cam — no Muse pairing
    // here (the Mac owns the headset), and we won't play the auditor's audio.
    if (parsed.satellite) setPcCoLocated(true);
    setShowConnectionModal(true);
    addLog({ time: timeRef.current, speaker: 'SYS',
      text: '📱 Link rilevato dal QR — tocca CONNETTI per unirti alla sessione', type: 'success' });
    // Clear the hash so a manual refresh doesn't keep re-triggering the prompt.
    try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (_) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // CONN-121 (perf, stage 2): stable-identity handlers for the memoized Sidebar /
  // SidebarDrawer. Same logic as before (useEvent always calls the freshest
  // closure) but a CONSTANT identity, so those components are skipped when App
  // re-renders only because the ~10 Hz session metrics changed.
  const sbOnConnectMuse   = useEvent(handleConnectMuse);
  const sbOnStart         = useEvent(requestStart);
  const sbOnPause         = useEvent(handlePause);
  const sbOnResume        = useEvent(handleResume);
  const sbOnEnd           = useEvent(handleEnd);
  const sbOnShowProcessus = useEvent(() => setShowProcessus(s => !s));
  const sbOnShowHistory   = useEvent(() => setShowHistoryModal(s => !s));
  // ⚠️ OTTIMIZZAZIONE — mancava fra i fratelli sopra: `onShowGuide` restava una funzione
  // inline nella JSX (più giù), l'UNICO prop di questo blocco a farlo — vanificava per
  // questo prop la STESSA ottimizzazione che il commento qui sopra descrive per tutti gli
  // altri (Sidebar/SidebarDrawer memoizzati, saltati quando App si ridisegna solo per le
  // metriche di sessione a ~10 Hz).
  const sbOnShowGuide     = useEvent(() => setShowGuide(true));
  const sdOnClose         = useEvent(() => setSidebarDrawer(null));
  const sdOnModeChange    = useEvent(handleModeChange);
  const sdOnUsePhoneSatellite = useEvent(() => { setSidebarDrawer(null); handleModeChange('auditor', { satellite: true }); });
  const sdOnOpenConn      = useEvent(() => { setShowConnectionModal(true); setSidebarDrawer(null); });
  const sdOnOpenProfile   = useEvent(() => setShowRoster(true));
  const sdCapturePcPhoto  = useEvent(capturePcPhoto);
  const sdOnStart         = useEvent(() => { requestStart();  setSidebarDrawer(null); });
  const sdOnPause         = useEvent(() => { handlePause();  setSidebarDrawer(null); });
  const sdOnResume        = useEvent(() => { handleResume(); setSidebarDrawer(null); });
  const sdOnEnd           = useEvent(() => { handleEnd();    setSidebarDrawer(null); });

  // ── VUE PARTICIPANT CONNECTÉ → components/ParticipantView ────────────────────
  // Quitter la séance côté PRÉCLAIR. Un SEUL chemin : le bandeau EOS et le bouton d'en-tête
  // avaient deux gestionnaires identiques ligne pour ligne. #7/#8 (Roger) : le préclair ne doit
  // PAS ramener la séance de l'auditeur en mode local, sinon elle reste « running/ended » et
  // fabrique une entrée fantôme dans l'historique — d'où la remise à zéro complète.
  const leaveSessionAsParticipant = () => {
    auditorPeerIdRef.current = '';
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    isReconnectingRef.current = false;
    try { stopRecognition(); } catch (_) {}
    try { networkManager.disconnect(); } catch (_) {}
    setPcMicArmed(false); pcMicArmedRef.current = false;
    setSessionState('idle');
    setSenzaStrumenti(false);   // la scelta vale per UNA seduta, non per il programma
    setShowReport(false);
    setSessionEndTime(null);
    setIsConnected(false); setPeerId(''); setParticipantLink(''); setRemoteStream(null); setAppMode('local'); setPcCoLocated(false);
  };

  if (appMode === 'participant' && isConnected) {
    return (
      <ParticipantView
        batteryLevel={batteryLevel}
        pcReadiness={pcReadiness}
        museConnection={museConnection}
        museContact={museContact}
        pcCoLocated={pcCoLocated}
        sessionState={sessionState}
        videoRef={participantVideoRef}
        onConnectMuse={handleConnectMuse}
        onLeaveSession={leaveSessionAsParticipant}
      />
    );
  }

  // Note: when appMode === 'participant' && !isConnected, the full app renders normally
  // so the user can access the Link drawer in the sidebar to paste the connection link.
  // A floating banner (rendered inside the main return below) guides the user.



  return (
    <>
    {showSplash && <SplashScreen onDismiss={() => setShowSplash(false)} />}
    {showCredits && <CreditsModal onClose={() => setShowCredits(false)} />}
    {showThetaCal && (
      <ThetaTaCalibration
        captureRaw={theta.captureRaw}
        applyTaPoints={theta.applyTaPoints}
        clearTaCalibration={theta.clearTaCalibration}
        taScale={theta.taScale}
        connected={theta.status === 'connected'}
        info={theta.info}
        counters={theta.counters}
        onConnect={() => { void theta.connect(); }}
        taNow={theta.taNow}
        rawNow={theta.rawSmooth}
        onClose={() => setShowThetaCal(false)}
      />
    )}

    {/* CONN-48: connection status window with progress bar during handshake. */}
    <ConnectionProgress
      phase={connPhase}
      detail={connDetail}
      role={appMode}
      isConnected={isConnected}
      onClose={() => setConnPhase('idle')}
    />

    {/* ── NESSUNO STRUMENTO: si SCEGLIE quale collegare ────────────────────────────────
        Si SELEZIONA prima e si collega dopo, invece di partire al primo clic: chi vuole
        lavorare con tutti e due deve poterli spuntare entrambi in una volta, senza che la
        connessione parta appena tocca il primo.
        Estratto in `InstrumentHintPanel.tsx` — primo pezzo della frammentazione di App.tsx
        (segnalato: « si possono frammentare per ciclo o altro? »): un overlay auto-contenuto,
        senza stato proprio, il candidato più sicuro per cominciare. Il gesto composito di
        START (che tocca `senzaStrumentiRef`/`handleConnectMuse`/`theta.connect`/`handleStart`,
        troppo intrecciato con questo file per guadagnarci separandolo) resta qui, passato
        come UNA sola funzione. */}
    {museHint && (
      <InstrumentHintPanel
        connSel={connSel}
        onToggle={scegliConn}
        onClose={() => setMuseHint(false)}
        thetaUnavailable={theta.unavailable}
        t={tWide}
        onStart={async () => {
          const nessuno = connSel.none;
          setMuseHint(false);
          setSenzaStrumenti(nessuno);
          // Il ref si scrive A MANO: `setSenzaStrumenti` non ha effetto prima del render
          // successivo, e `handleStart` parte in questo stesso giro — leggerebbe il valore
          // vecchio e ricadrebbe nel controllo, riaprendo il pannello. (Visto a schermo.)
          senzaStrumentiRef.current = nessuno;
          if (!nessuno) {
            // In sequenza: due selettori di dispositivo aperti insieme si ostacolerebbero.
            if (connSel.muse)  await handleConnectMuse();
            if (connSel.theta) await theta.connect();
          }
          void handleStart();
        }}
      />
    )}

    <div className="h-screen flex flex-col overflow-hidden relative"
      data-theme={isLightTheme ? 'light' : 'dark'}
      style={{
        minWidth: 0, overflow: 'hidden',
        // LIGHT theme = a CLEAN FLAT background (no wallpaper image, no animated aurora) so
        // everything stays legible — user request. Wallpaper/aurora only in the DARK theme.
        // FOND COMMUN identique à AppBackground (charcoal / gris) → les zones transparentes
        // (barre d'icônes, haut) reposent exactement sur le même fond, aucun liseré de couleur.
        // Schiarito insieme ad AppBackground: i due fondi DEVONO restare gemelli, se no le
        // zone trasparenti (barra icone, alto) mostrano un gradino di grigio.
        background: isLightTheme
          ? 'radial-gradient(130% 120% at 50% 22%, #eaeaec 0%, #e0e0e4 55%, #d4d4da 100%)'
          : wallpaperUrl
            ? `url(${wallpaperUrl}) center/cover no-repeat, #262629`
            : 'radial-gradient(130% 120% at 50% 22%, #2e2e33 0%, #2a2a2f 55%, #262629 100%)',
        color: isLightTheme ? '#0f172a' : '#ffffff'
      }}>

      {/* AURORA SUPPRIMÉE : elle peignait des taches bleues/cyan/violet (navy) qui teintaient
          en BLEU la barre d'icônes et le haut. Le fond charcoal uniforme (AppBackground) suffit. */}

      {/* ═══════════════════ TOP BAR WITH TITLE AND AI INPUT ═══════════════════ */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0 relative"
        style={{
          // STYLE B : verre NOIR translucide + bord blanc + encre blanche → net sur le noir.
          // SANS FOND : la zone du haut repose sur le FOND UNIQUE (juste un séparateur bas).
          background: 'transparent',
          borderBottom: isLightTheme ? '1px solid rgba(60,64,72,0.14)' : '1px solid rgba(255,255,255,0.08)',
          // 60 > 50 (bande méta OBJECTIF/ÉTAT PHYSIQUE) : la barre du haut — et donc le popup
          // IA (fixed, dans SON contexte d'empilement) — passe AU-DESSUS de la bande méta.
          zIndex: LAYER.topbar }}>
        {/* LEFT: LOGO + STATIC METER + P2P STATUS BADGE */}
        <div className="flex items-center gap-2">
          {/* Le logo OUVRE les crédits (demande utilisateur) — mêmes textes que l'animation
              d'ouverture, source unique dans credits.ts. */}
          {/* ── IL LOGO HA IL TESTO BIANCO ────────────────────────────────────────────────
              È un'immagine disegnata per fondo scuro: sul chiaro « ALTERNATIVE SCIENTOLOGY »
              spariva del tutto, restava il solo simbolo blu. Filtrarla (invert, brightness)
              avrebbe salvato il testo sporcando il blu del marchio. Le si dà invece il fondo
              per cui è fatta — una pastiglia scura, solo nel tema chiaro: l'immagine resta
              intatta e si legge. */}
          <button type="button" onClick={() => setShowCredits(true)} title={t('tip_credits') as string}
            style={{ border: 'none', padding: isLightTheme ? '4px 10px' : 0, borderRadius: 10,
                     background: isLightTheme ? '#2a2a2f' : 'transparent',
                     boxShadow: isLightTheme ? '0 2px 8px rgba(38,40,48,0.22)' : 'none',
                     cursor: 'pointer', lineHeight: 0, flexShrink: 0 }}>
            <img src="/logo-alt-scientology.png" alt="Alt. Scientology"
              style={{ height: isLightTheme ? 36 : 44, width: 'auto',
                       filter: isLightTheme ? 'none' : 'drop-shadow(0 2px 6px rgba(0,0,0,0.45)) brightness(1.05)' }} />
          </button>
          {/* Il NOME e SOTTO la versione, allineati in alto col logo. Prima la versione stava
              di fianco al titolo, in coda, minuscola: sembrava una parte del nome. */}
          <div className="flex flex-col" style={{ lineHeight: 1.05 }}>
            <h1 className="text-base font-bold tracking-wide leading-tight uppercase"
              style={{
                color: isLightTheme ? '#1e293b' : '#eef4ff',
                textShadow: isLightTheme ? '0 0 8px rgba(3,105,161,0.25)' : 'none'
              }}>
              EQUILIBRIUM
            </h1>
            <span style={{
              fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.06em', marginTop: 1,
              color: isLightTheme ? '#64748b' : 'rgba(226,232,240,0.50)' }}>v{__APP_VERSION__}</span>
          </div>
          {/* ── I TRE BADGE « CON CHE COSA SI AUDITA » ──────────────────────────────────────
              Estratti in `InstrumentBadges.tsx` — secondo pezzo della frammentazione di
              App.tsx (v. la nota in `InstrumentHintPanel.tsx`). MUSE, boîtes, senza strumenti:
              stesso schema visivo, sempre mostrati insieme, nessuna logica cambiata. */}
          <InstrumentBadges
            appMode={appMode}
            satelliteMode={satelliteMode}
            t={tWide}
            museConnection={museConnection}
            museContact={museContact}
            museEverConnected={museEverConnected}
            batteryLevel={batteryLevel}
            smoothPct={smoothPct}
            onToggleMuse={() => { void handleConnectMuse(); }}
            thetaUnavailable={theta.unavailable}
            thetaStatus={theta.status}
            onToggleTheta={() => {
              if (theta.status === 'connected') void theta.disconnect();
              else if (theta.status === 'disconnected') void theta.connect();
            }}
            senzaMisura={senzaMisura}
            senzaStrumenti={senzaStrumenti}
            sessionRunning={sessionState === 'running'}
            onToggleSenzaStrumenti={() => {
              const nuovo = !senzaStrumentiRef.current;
              setSenzaStrumenti(nuovo); senzaStrumentiRef.current = nuovo;
            }}
          />

          {/* Phone-satellite entry now lives in the SESSION/mode drawer
              (SidebarDrawer › LinkDrawer), per user request — not the top bar. */}
          {/* P2P connection badge — visible only in auditor/participant mode */}
          {appMode !== 'local' && (
            <div
              onClick={() => setShowConnectionModal(true)}
              title={t('tip_open_connection') as string}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                // FIX CONN-32: badge is ALWAYS at the large size now (the user
                // wants the status readable at a glance in every state, not
                // just when connected). The accent colour conveys the state.
                padding: '6px 14px',
                borderRadius: 14, cursor: 'pointer',
                background: isConnected ? 'rgba(34,197,94,0.15)'
                          : isReconnecting ? 'rgba(249,115,22,0.15)'
                          : 'rgba(251,191,36,0.12)',
                border: `1px solid ${
                  isConnected ? 'rgba(34,197,94,0.4)'
                  : isReconnecting ? 'rgba(249,115,22,0.45)'
                  : 'rgba(251,191,36,0.3)'}`,
                boxShadow: isConnected ? '0 0 16px rgba(34,197,94,0.25)' : 'none' }}>
              {/* FIX CONN-32: always show the MUSE (Headphones) icon, coloured
                  by state. Replaces the previous dot-when-idle / icon-when-
                  connected split — the user wants the device marker always. */}
              {(() => {
                const stateCol = isConnected ? 'rgba(240,246,255,0.95)' : isReconnecting ? '#fb923c' : '#fbbf24';
                return (
                  <Headphones
                    size={22}
                    strokeWidth={1.6}
                    style={{
                      color: stateCol,
                      filter: `drop-shadow(0 0 6px ${stateCol}88)`,
                      animation: isConnected ? 'none' : 'pulse 1.5s infinite' }}
                  />
                );
              })()}
              <span style={{
                fontSize: 14,
                fontWeight: 'bold',
                letterSpacing: '0.14em',
                color: isConnected ? 'rgba(240,246,255,0.95)' : isReconnecting ? '#fb923c' : '#fbbf24',
                textShadow: isConnected ? '0 0 8px rgba(255,255,255,0.45)' : 'none' }}>
                {isConnected
                  ? (appMode === 'auditor' ? `● ${t('conn_badge_auditor_ok')}` : `● ${t('conn_badge_preclear_ok')}`)
                  : isReconnecting
                    ? '🔄 reconnecting…'
                    : (appMode === 'auditor' ? `○ ${t('conn_badge_auditor_waiting')}` : `○ ${t('conn_badge_preclear_waiting')}`)}
              </span>
              {/* Remote Muse battery — shown to auditor. FIX CONN-32: MUSE icon
                  instead of the brain emoji. */}
              {appMode === 'auditor' && isConnected && remoteBatteryLevel !== null && (
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 14, fontFamily: 'monospace', fontWeight: 'bold', marginLeft: 6,
                  color: remoteBatteryLevel > 50 ? 'rgba(240,246,255,0.95)'
                       : remoteBatteryLevel > 20 ? '#fbbf24'
                       : '#f87171' }}>
                  <Headphones size={16} strokeWidth={1.8} /> {remoteBatteryLevel.toFixed(0)}%
                </span>
              )}
              {/* SATELLITE : le MUSE est sur le MAC (museConnection), pas un MUSE distant → on
                  masque ces badges « MUSE distant » (sinon ils crient « MUSE PC non connecté »
                  à tort). L'état du MUSE du Mac est déjà dans le badge du haut. */}
              {appMode === 'auditor' && isConnected && !satelliteMode && remoteMuseConnected && remoteMuseStreaming && (
                <span style={{ fontSize: 14, color: 'rgba(235,244,255,0.92)', fontWeight: 'bold', letterSpacing: '0.08em' }}>MUSE ✓</span>
              )}
              {/* FIX MUSE-REMOTE: MUSE reports connected but NO EEG is flowing into this
                  session — it is bonded to another program (the preclear's own Equilibrium).
                  Never show a green "✓" over a frozen needle: warn + tell them what to do. */}
              {appMode === 'auditor' && isConnected && !satelliteMode && remoteMuseConnected && !remoteMuseStreaming && (
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 13, color: '#fbbf24', fontWeight: 'bold', letterSpacing: '0.05em',
                  animation: 'pulse 1.5s infinite' }}>
                  <Headphones size={15} strokeWidth={1.8} /> ⚠ {t('conn_muse_no_stream')}
                </span>
              )}
              {/* CONN-56: the "press START" cue moved to an elegant prompt
                  centred on the dial (more visible). See the QuantumSphere
                  overlay below. The small top badge was removed. */}
              {/* FIX CONN-36: warn the auditor when the preclear's MUSE is not
                  connected — no EEG can flow until they pair it. */}
              {appMode === 'auditor' && isConnected && !satelliteMode && !remoteMuseConnected && (
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 13, color: '#fbbf24', fontWeight: 'bold', letterSpacing: '0.05em',
                  animation: 'pulse 1.5s infinite' }}>
                  <Headphones size={15} strokeWidth={1.8} /> ⚠ {t('conn_muse_preclear_disconnected')}
                </span>
              )}
              {/* FIX CONN-46: live round-trip latency badge. Green < 150 ms,
                  amber < 400 ms, red beyond — colour conveys A/V responsiveness. */}
              {isConnected && liveLatency !== null && (
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 13, fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: '0.03em',
                  padding: '2px 8px', borderRadius: 6,
                  color: liveLatency < 150 ? 'rgba(240,246,255,0.95)' : liveLatency < 400 ? '#fbbf24' : '#f87171',
                  background: liveLatency < 150 ? 'rgba(255,255,255,0.12)' : liveLatency < 400 ? 'rgba(251,191,36,0.12)' : 'rgba(248,113,113,0.12)',
                  border: `1px solid ${liveLatency < 150 ? 'rgba(255,255,255,0.35)' : liveLatency < 400 ? 'rgba(251,191,36,0.35)' : 'rgba(248,113,113,0.35)'}` }}>
                  ⇄ {liveLatency} ms
                </span>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: AI Assistant Input — connecté à Gemini */}
        <AIAssistant
          lang={lang}
          sessionContext={{
            pcName: pcName,
            auditorName: auditorName,
            sessionTime: time,
            totalTa: metricsStore.get().totalTa,
            qL: metricsStore.get().qL,
            eta: metricsStore.get().eta,
            needleReaction: needleReaction,
            // ⚠️ `l.speaker` è opzionale (`LogEntry`, TranscriptLog.tsx) — trovato attivando
            // `strict`: un `undefined` qui sarebbe finito stampato come testo "undefined:" nel
            // prompt inviato all'IA (v. AIAssistant.tsx, `${l.speaker}:`). Difetto latente vero,
            // non solo un tipo da zittire — corretto con una stringa vuota, non un valore inventato.
            recentLogs: logs.slice(-15).map(l => ({ time: l.time, speaker: l.speaker ?? '', text: l.text })) }}
        />
      </div>

      {appMode === 'participant' && !isConnected && (
        <ParticipantWaitingBanner onOpen={() => setShowConnectionModal(true)} t={tWide} />
      )}

      {/* ── Grande fenêtre de connexion P2P ── */}
      {showConnectionModal && appMode !== 'local' && (
        <ConnectionModal
          appMode={appMode}
          satellite={satelliteMode}
          isConnected={isConnected}
          peerId={peerId}
          connectionLink={connectionLink}
          tunnelLoading={tunnelLoading}
          participantLink={participantLink}
          onSetParticipantLink={setParticipantLink}
          onCreateTunnel={async () => {
            setTunnelLoading(true);
            try {
              const r = await fetch('/api/tunnel', { method: 'POST' });
              const data = await r.json();
              if (data.url) {
                const tunnelHost = data.url.replace(/^https?:\/\//, '');
                // Cloudflare tunnel is a transparent proxy: abc.trycloudflare.com → 127.0.0.1:7893
                // The auditor peer is already registered on the local server — no re-init needed.
                // FIX C1 + H1: embed auth tokens in the link.
                // Format: tunnelHost#peerId:relayToken:peerKey
                // The participant extracts both tokens and uses them for relay and PeerJS auth.
                const tokenPart = relayTokenRef.current
                  ? `:${relayTokenRef.current}${peerKeyRef.current ? `:${peerKeyRef.current}` : ''}`
                  : '';
                // Satellite: append a ':sat' marker as the 4th segment so the phone
                // knows it's a co-located session (send-only AV, no Muse, no
                // playback). Pad the peerKey slot so 'sat' is always parts[3].
                const link = satelliteMode
                  ? `${tunnelHost}#${peerId}:${relayTokenRef.current || ''}:${peerKeyRef.current || ''}:sat`
                  : `${tunnelHost}#${peerId}${tokenPart}`;
                setConnectionLink(link);
                addLog({ time: timeRef.current, speaker: 'SYS', text: `🌍 Tunnel: ${data.url}`, type: 'success' });
              } else {
                addLog({ time: timeRef.current, speaker: 'SYS', text: `✗ Tunnel: ${data.error}`, type: 'highlight' });
              }
            } catch (e: any) {
              addLog({ time: timeRef.current, speaker: 'SYS', text: `✗ Tunnel impossible: ${e.message}`, type: 'highlight' });
            }
            setTunnelLoading(false);
          }}
          onConnect={async () => {
            // FIX H2: guard against double-click race condition
            if (isConnectingRef.current) return;
            const parsed = parseConnectionLink(participantLink);
            if (!parsed) {
              addLog({ time: timeRef.current, speaker: 'SYS', text: (t('log_connection_failed') as string).replace('{err}', 'invalid link format'), type: 'highlight' });
              return;
            }

            // FIX CONN-10b: ORDER MATTERS. Teardown first, THEN pre-acquire
            // the media stream, THEN start init. The previous order was:
            //   1. acquire stream  2. disconnect()  3. init
            // — but disconnect() calls _teardown() which stops all tracks
            // on the cached stream, defeating the whole purpose of
            // pre-acquiring. We now:
            //   1. teardown  2. acquire stream  3. init
            // so the cached stream survives until peer.call() consumes it.
            isConnectingRef.current = true;
            networkManager.disconnect();
            setPeerId(''); setIsConnected(false); setRemoteStream(null);

            try {
              // SATELLITE (co-located): stream VIDEO ONLY. Requesting the mic here
              // would contend with the phone's own Web Speech recognizer (same
              // device, same mic) and silently kill the PC transcription. The PC's
              // words travel as TEXT over the data channel instead — no audio
              // stream needed (and no audio = no Larsen). Normal remote keeps audio.
              const wantAudio = !pcCoLocatedRef.current;
              addLog({ time: timeRef.current, speaker: 'SYS', text: wantAudio ? '🎥 Requesting camera/microphone…' : '🎥 Requesting camera (satellite: audio via text)…' });
              await navigator.mediaDevices.getUserMedia({ video: true, audio: wantAudio ? VOICE_AUDIO_CONSTRAINTS : false })
                .catch(() => wantAudio ? navigator.mediaDevices.getUserMedia({ video: false, audio: VOICE_AUDIO_CONSTRAINTS }) : Promise.reject(new Error('no camera')))
                .then((s) => { (networkManager as any).localStream = s; })
                .catch(() => { /* user denied — proceed data-only */ });
            } catch (_) { /* getUserMedia not available — proceed data-only */ }
            // Store auditor peer ID + server base URL for auto-reconnect
            auditorPeerIdRef.current  = parsed.peerId;
            serverBaseUrlRef.current  = `${parsed.config.host}:${parsed.config.port}`;
            reconnectCountRef.current = 0;
            isReconnectingRef.current = false;

            // FIX C1: extract relay token from link and set it in NetworkManager
            // so it's appended to all subsequent relay SSE and POST requests.
            if (parsed.relayToken) {
              relayTokenRef.current = parsed.relayToken;
              networkManager.setRelayToken(parsed.relayToken);
            }
            // FIX H1: peerKey is already in parsed.config (set by parseConnectionLink).
            // Store it in ref so refreshSignalingForReconnect can preserve it on LAN fallback.
            if (parsed.config.peerKey) peerKeyRef.current = parsed.config.peerKey;

            setTunnelLoading(true);
            networkManager.setSignalingServer(parsed.config);
            addLog({ time: timeRef.current, speaker: 'SYS', text: `📡 ${parsed.config.host}…` });
            // FIX CONN-10c: pass skipMediaRelease=true so init() does NOT
            // destroy the localStream we just pre-acquired in CONN-10/10b.
            // Default behaviour stops all tracks and nulls the stream — that
            // would force a second getUserMedia call later (which sometimes
            // returns an empty stream on mobile Chrome). The pre-acquired
            // stream is kept intact and consumed by peer.call() once the
            // relay is connected.
            networkManager.init('participant', undefined, true)
              .then(myId => {
                setPeerId(myId);
                addLog({ time: timeRef.current, speaker: 'SYS', text: `✓ ${parsed.config.host} OK…` });
                return networkManager.connectToAuditor(parsed.peerId);
              })
              .catch(err => {
                networkManager.disconnect();
                setPeerId('');
                auditorPeerIdRef.current = '';
                addLog({ time: timeRef.current, speaker: 'SYS', text: (t('log_connection_failed') as string).replace('{err}', err.message || String(err)), type: 'highlight' });
              })
              .finally(() => { setTunnelLoading(false); isConnectingRef.current = false; });
          }}
          onDisconnect={() => {
            auditorPeerIdRef.current = '';
            if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
            isReconnectingRef.current = false;
            networkManager.disconnect();
            setIsConnected(false); setPeerId(''); setParticipantLink('');
            setRemoteStream(null); setAppMode('local'); setSatelliteMode(false);
            setShowConnectionModal(false);
          }}
          onClose={() => {
            setShowConnectionModal(false);
            // Satellite: closing the window WITHOUT a connection = cancel → go
            // back to plain LOCAL (the user pressed "phone as camera" then bailed).
            if (satelliteMode && !isConnected) {
              handleModeChange('local');
            }
          }}
        />
      )}

      {/* PUSH-TO-TALK removed (user): the auditor is transcribed hands-free in
          satellite; the residual room/PC leak is handled by the text dedup. */}

      {/* ═══════════════════ MAIN CONTENT AREA (SIDEBAR + DASHBOARD) ═══════════════════ */}
      <div className="flex flex-1 overflow-hidden">
        {/* ═══════════════════ LEFT ICON SIDEBAR ═══════════════════ */}
        <Sidebar
          appMode={appMode}
          sidebarDrawer={sidebarDrawer}
          setSidebarDrawer={setSidebarDrawer}
          processusCount={processusPdfs.length}
          lang={lang}
          museConnection={museConnection}
          pcCoLocated={pcCoLocated}
          sessionState={sessionState}
          processusOpen={showProcessus}
          historyOpen={showHistoryModal}
          onShowProcessus={sbOnShowProcessus}
          onShowHistory={sbOnShowHistory}
          onShowGuide={sbOnShowGuide}
          guideOpen={showGuide}
          onConnectMuse={sbOnConnectMuse}
          onStart={sbOnStart}
          onPause={sbOnPause}
          onResume={sbOnResume}
          onEnd={sbOnEnd}
          t={tWide}
        />

      
      {/* ═══════════════════ SIDEBAR DRAWER ═══════════════════ */}
      {sidebarDrawer && (
        <SidebarDrawer
            thetaSensTrim={theta.setup.sensTrim}
            setThetaSensTrim={theta.setSensTrim}
            thetaConnected={theta.status === 'connected'}
            museConnected={instruments.muse}
            thetaConfig={theta.setup.config}
            setThetaConfig={theta.setConfig}
            thetaAddPoint={theta.addPointFromReference}
            thetaTaNow={theta.taNow}
            onOpenThetaTester={() => { setSidebarDrawer(null); setShowThetaCal(true); }}
          drawer={sidebarDrawer}
          onClose={sdOnClose}
          t={tWide}

          sessionState={sessionState}
          onModeChange={sdOnModeChange}
          onOpenConnectionModal={sdOnOpenConn}
          onUsePhoneSatellite={sdOnUsePhoneSatellite}
          satellite={satelliteMode}
          onConnectMuse={sbOnConnectMuse}
          museConnection={museConnection}

          onOpenProfile={sdOnOpenProfile}
          capturePcPhoto={sdCapturePcPhoto}

          needleTrim={needleTrim}
          setNeedleTrim={setNeedleTrim}
          needleInertia={needleInertia}
          setNeedleInertia={setNeedleInertia}

          onStart={sdOnStart}
          onPause={sdOnPause}
          onResume={sdOnResume}
          onEnd={sdOnEnd}

          lang={lang}
          setLang={setLang}
        />
      )}

      
      {/* ═══════════════════ MAIN AREA (existing layout) ═══════════════════ */}
      <div className="flex-1 flex flex-col p-2 gap-2 overflow-hidden relative min-w-0">

      {/* ── Surcharges globales du THÈME CLAIR → ui/lightThemeCss ── */}
      {isLightTheme && <style>{LIGHT_THEME_CSS}</style>}
      
            
      {/* BACKGROUND — fond futuriste holographique */}
      <AppBackground />
      
      
      {/* MNA panel moved INSIDE the sphere central panel — see below */}

      {/* Session metadata inputs - compacté pour éviter l'agrandissement */}
      {sessionState === 'running' && (
        <div className="w-full rounded-lg border border-white/10 p-1 flex gap-1 items-start h-20 shrink-0 relative"
          style={{ background: isLightTheme ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.05)', backdropFilter: 'blur(18px) saturate(1.15)', WebkitBackdropFilter: 'blur(18px) saturate(1.15)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 10px 26px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.12)', zIndex: LAYER.dock }}>
          {[['Objectif', sessionObjective, setSessionObjective], ['Processus', sessionProcessObjective, setSessionProcessObjective],
            ['État physique', sessionPhysicalCheck, setSessionPhysicalCheck], ['R-Factor', sessionBriefing, setSessionBriefing]
          ].map(([label, val, setter]: any) => (
            <div key={label} className="flex-1">
              {/* Titre en PASTILLE NOIRE (même matière que le mini-toggle) → bien marqué. */}
              <label className="text-[8px] font-mono uppercase" style={{ display: 'inline-block', background: '#17171b', color: 'rgba(240,246,255,0.9)', padding: '1px 7px', borderRadius: 6, letterSpacing: '0.08em', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.6), 0 1px 2px rgba(0,0,0,0.3)' }}>{label}</label>
              <input value={val} onChange={(e) => setter(e.target.value)} placeholder={label}
                className="w-full mt-0.5 px-1 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] text-slate-200 outline-none focus:border-cyan-500" />
            </div>
          ))}
        </div>
      )}

      {/* Main Dashboard Area */}
      <div className="flex flex-col gap-2 flex-1 min-h-0 relative" style={{ zIndex: LAYER.stage }}>

        {/* Middle row: transcript | meter | cams */}
        <div className="flex gap-2 flex-1 min-h-0">

          {/* LEFT: Transcript (top) + System Health (bottom, 4 zones empilées) */}
          {/* FIX M-07: dead `hideHealth = false` removed — visibility driven by moduleVis only */}
          {(moduleVis.journal || moduleVis.health) && (
            <div className={cn('sm-glass transition-all duration-300 h-full flex-shrink-0 flex flex-col gap-2 w-44 xl:w-52')}>
              {moduleVis.journal && (
                <div className={cn('rounded-xl overflow-hidden', transcriptVisible ? 'flex-1 min-h-0' : 'flex-shrink-0')}
                  style={panelStyle(transcriptVisible ? { boxShadow: TOKEN.panelShadow } : undefined)}>
                  <TranscriptLog logs={logs} isVisible={transcriptVisible} hideSpeech={false} onToggle={() => setTranscriptVisible(!transcriptVisible)} onDisable={() => setModuleVis(v => ({...v, journal: false}))} />
                </div>
              )}
              {/* SYSTEM HEALTH */}
              {moduleVis.health && (
                <HealthPanel
                  eegBuffer={eegBuffer}
                  gyroBuffer={gyroBuffer}
                  displayBpm={displayBpm}
                  signalQuality={signalQuality}
                  museConnection={museConnection}
                  batteryLevel={batteryLevel}
                  sessionState={sessionState}
                  onHide={() => setModuleVis(v => ({ ...v, health: false }))}
                  t={tWide}
                  panelStyle={panelStyle}
                />
              )}
            </div>
          )}

          {/* PROCESSUS popups — one per open process */}
          {activeProcessus.map((proc, idx) => (
            <div key={proc.id}
              /* z-[90]: the popup shares the parent's (zIndex:10) stacking context
                 with the meter chrome (view toggle, banners, all z-50). At equal z
                 the LATER DOM node wins, so those — declared after this map — were
                 painting OVER the header and swallowing the drag + Détacher/✕ clicks
                 ("ne se ferme/déplace/détache plus"). Raise above them, below the
                 z-100 EP modal. */
              className="fixed flex flex-col rounded-xl border border-cyan-500/40 shadow-2xl"
              style={{
                zIndex: LAYER.floating,
                background: 'rgba(8,18,35,0.75)',
                // FIX (Roger): the panel spawned 800px wide at left:160, so on a
                // window narrower than ~960px the Détacher/✕ buttons (right of the
                // header) fell OFF the right edge — you had to drag the panel left to
                // reach them. Bind width to the viewport so the header buttons are
                // ALWAYS on-screen, and start below the topbar / right of the sidebar.
                top: `${84 + idx * 24}px`,
                left: `${88 + idx * 24}px`,
                width: `min(820px, calc(100vw - ${88 + idx * 24}px - 24px))`,
                height: '78vh',
                resize: 'both', overflow: 'hidden',
                minWidth: `min(480px, calc(100vw - ${88 + idx * 24}px - 24px))`,
                minHeight: '440px' }}
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0 cursor-move select-none"
                style={{background:'rgba(6,14,31,0.40)'}}
                onPointerDown={(e) => {
                  // The header is the drag handle, but the Détacher/✕ buttons live
                  // INSIDE it — bail out when the press starts on an interactive
                  // control so the button's own click fires.
                  if ((e.target as HTMLElement).closest('button')) return;
                  // FIX (Electron): the old approach added a full-screen shield on
                  // mousedown and removed it on a window 'mouseup'. If the mouse was
                  // released OUTSIDE the Electron window (easy while dragging the
                  // panel), that 'mouseup' never fired → the z-99999 shield stayed
                  // and blocked EVERYTHING ("ne se détache plus ni se déplace ni se
                  // ferme"). Pointer Capture removes the shield entirely: the header
                  // captures the pointer, the PDF <iframe> can no longer swallow the
                  // moves, and pointerup/pointercancel always fire on the handle —
                  // even off-window.
                  const handle = e.currentTarget as HTMLElement;
                  const el = handle.parentElement as HTMLElement;
                  const startX = e.clientX - el.offsetLeft;
                  const startY = e.clientY - el.offsetTop;
                  try { handle.setPointerCapture(e.pointerId); } catch { /* noop */ }
                  const onMove = (ev: PointerEvent) => {
                    el.style.left = (ev.clientX - startX) + 'px';
                    el.style.top  = (ev.clientY - startY) + 'px';
                  };
                  const onUp = (ev: PointerEvent) => {
                    handle.removeEventListener('pointermove', onMove);
                    handle.removeEventListener('pointerup', onUp);
                    handle.removeEventListener('pointercancel', onUp);
                    try { handle.releasePointerCapture(ev.pointerId); } catch { /* noop */ }
                  };
                  handle.addEventListener('pointermove', onMove);
                  handle.addEventListener('pointerup', onUp);
                  handle.addEventListener('pointercancel', onUp);
                }}
              >
                <div className="flex items-center gap-2">
                  <BookOpen size={12} className="text-cyan-400" />
                  <span className="text-[10px] font-mono text-cyan-300 truncate max-w-[320px]">{proc.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[8px] font-mono text-white/30">{t('processus_resizable')}</span>
                  {/* Bouton Détacher : ouvre le PDF dans une vraie fenêtre browser séparée */}
                  <button
                    title={t('processus_detach') as string || 'Detach to separate window'}
                    onClick={() => {
                      // Ouvre dans une fenêtre browser indépendante (déplaçable hors de l'app)
                      const w = window.open(
                        proc.url,
                        `processus_${proc.id}`,
                        'width=900,height=900,toolbar=no,menubar=no,location=no,scrollbars=yes,resizable=yes'
                      );
                      if (w) {
                        // Donner un titre explicite à la nouvelle fenêtre
                        try { w.document.title = proc.name; } catch {}
                        // Retire le popup interne pour éviter doublon
                        setActiveProcessus(prev => prev.filter(p => p.id !== proc.id));
                      } else {
                        alert(LC('Autorizza le finestre pop-up per staccare il processo.', 'Veuillez autoriser les fenêtres pop-up pour détacher le processus.', 'Please allow pop-up windows to detach the process.', 'Permite las ventanas emergentes para desacoplar el proceso.', 'Tillåt popup-fönster för att koppla loss processen.'));
                      }
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded font-mono text-[10px] uppercase tracking-wider font-bold transition-all"
                    style={{
                      background: 'rgba(34,211,238,0.15)',
                      border: '1px solid rgba(34,211,238,0.50)',
                      color: '#eaf3ff',
                      cursor: 'pointer' }}>
                    {/* Icône SVG : flèche sortant d'un cadre (external link / pop-out) */}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 3h6v6"/>
                      <path d="M10 14L21 3"/>
                      <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>
                    </svg>
                    <span>{
                      lang === 'fr' ? 'Détacher' :
                      lang === 'it' ? 'Stacca' :
                      lang === 'es' ? 'Separar' :
                      lang === 'sv' ? 'Koppla loss' :
                      'Detach'
                    }</span>
                  </button>
                  <button onClick={() => setActiveProcessus(prev => prev.filter(p => p.id !== proc.id))}
                    className="text-white/40 hover:text-white text-sm leading-none">✕</button>
                </div>
              </div>
              <iframe src={proc.url} className="flex-1 w-full" title={proc.name}
                style={{border:'none', display:'block'}}/>
            </div>
          ))}

          {/* PANNELLO CENTRALE */}
          <div className="flex-1 flex flex-col relative rounded-3xl min-h-0"
            data-sphere
            style={{ ...panelStyle({
              // SANS FOND : l'arc/aiguille reposent directement sur le fond unique de l'app.
              background: 'transparent' }), ...frontTilt(12) }}>

            {/* ── Sphere/needle content ── */}
            {<>

            {/* Lo sfondo sotto la sfera — SOLO nel tema scuro, come in AppBackground: sotto
                l'ago è il posto in cui la leggibilità conta più che altrove. */}
            {wallpaperUrl && !isLightTheme && (
              <img src={wallpaperUrl} alt="" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', opacity: 0.25, borderRadius: 'inherit', pointerEvents:'none', zIndex: LAYER.background }} />
            )}
            {/* (Zones de lumière internes supprimées — panneau PLAT sans lumière, choix utilisateur.) */}
            {/* NO-CONTACT INDICATOR — Muse connesso ma la fascia NON fa contatto EEG reale
                (non indossata / mal messa). Senza questo, il ciclo fermo sarebbe incomprensibile:
                lo diciamo esplicitamente. Stesso `museContact` che gatea il ciclo. */}
            {museConnection === 'connected' && !museContact && (
              <div className="absolute pointer-events-none flex items-center gap-2 animate-pulse"
                style={{ zIndex: LAYER.topbar, top: '13%', left: '50%', transform: 'translateX(-50%)',
                  padding: '7px 16px', borderRadius: 999, whiteSpace: 'nowrap',
                  background: 'rgba(251,94,59,0.16)', border: '1px solid rgba(251,94,59,0.65)',
                  color: '#fca5a5', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 500, letterSpacing: '0.06em' }}>
                <span style={{ fontSize: 14 }}>⚠</span> {t('no_contact') as string}
              </div>
            )}
            {hardwareError ? (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80">
                <div className="border border-red-500/50 bg-red-500/10 p-6 rounded-lg flex flex-col items-center gap-4 animate-pulse">
                  <AlertTriangle size={40} className="text-red-500" />
                  <h2 className="text-lg font-mono font-bold text-red-500 tracking-widest text-center">{hardwareError}</h2>
                </div>
              </div>
            ) : null}
            {/* EP Validation Panel — appare quando finestra Cognition è aperta */}
            {epWindowOpen && sessionState === 'running' && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-3 px-6 py-4 rounded-xl border border-green-400/60 shadow-2xl"
                style={{background:'rgba(6,20,10,0.92)', minWidth:'400px'}}>
                <div className="text-[12px] font-mono text-green-300 tracking-widest uppercase animate-pulse text-center">
                  AS-IS DETECTED COGNITION WINDOW OPEN
                </div>
                {epCognitionText && (
                  <div className="text-[13px] font-mono text-white/90 italic text-center max-w-sm">
                    "{epCognitionText}"
                  </div>
                )}
                <div className="flex gap-3 items-center w-full">
                  <input
                    type="text"
                    placeholder={t('auditor_note') as string}
                    value={epAuditorNote}
                    onChange={e => setEpAuditorNote(e.target.value)}
                    className="flex-1 px-3 py-2 rounded bg-white/5 border border-white/20 text-[12px] text-white font-mono outline-none focus:border-green-400"
                  />
                  <button
                    onClick={() => {
                      setEpValidated(true);
                      setEpWindowOpen(false);
                      setAsIsnessState('ep');
                      fnTracker.isEpValidated = true;
                      addLog({ time: timeRef.current, speaker: 'SYS',
                        text: `END PHENOMENA (EP) VALIDATED by Auditor${epCognitionText ? ` - Cognition: "${epCognitionText}"` : ''}${epAuditorNote ? ` - Note: ${epAuditorNote}` : ''}`,
                        type: 'highlight' });
                      if (epWindowTimerRef.current) clearTimeout(epWindowTimerRef.current);
                    }}
                    className="px-4 py-2 rounded bg-green-500/30 border border-green-400/60 text-green-300 font-mono text-[12px] uppercase tracking-widest hover:bg-green-500/50 transition-all">
                    VALIDATE EP
                  </button>
                  {/* Rejet de la suggestion EP en MINI TOGGLE (cohérence graphique). */}
                  <GlassCollapseToggle on onToggle={() => { setEpWindowOpen(false); if (epWindowTimerRef.current) clearTimeout(epWindowTimerRef.current); }} title={t('tip_close') as string} />
                </div>
              </div>
            )}
          
          {/* Area Sfera: Occupa tutto lo spazio disponibile centrandosi */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
            
            {/* Horloge réelle + Timer session — top-left */}
            <div className="sm-glass absolute top-10 left-10 flex flex-col z-10 pointer-events-auto" style={frontTilt(12)}>
              {/* Heure réelle — mutée (neutre) : c'est l'info la moins prioritaire du coin. */}
              <span className="text-xs font-mono tracking-wider"
                style={{ color: isLightTheme ? '#64748b' : 'rgba(148,163,184,0.65)' }}>
                {clockTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
              </span>
              {/* Durée de session — SECONDAIRE au TONE ARM → taille réduite (hiérarchie). */}
              <span className="text-2xl font-light tabular-nums font-mono"
                style={{ color: isLightTheme ? '#334155' : 'rgba(200,220,232,0.88)' }}>
                {String(Math.floor(time / 60)).padStart(2,'0')}:{String(Math.floor(time % 60)).padStart(2,'0')}
              </span>
              <span className="text-[9px] font-mono uppercase mt-0.5 tracking-widest"
                style={{ color: isLightTheme ? '#94a3b8' : 'rgba(255,255,255,0.45)' }}>
                {sessionState === 'running' ? `● ${t('rec')}` : sessionState === 'paused' ? `⏸ ${t('paused')}` : ``}
              </span>

            </div>

            {/* ── Saisie MANUELLE de l'EP → components/EpManualModal ── */}
            {epManualOpen && (
              <EpManualModal
                reactionType={epReactionType} setReactionType={setEpReactionType}
                realization={epRealization}   setRealization={setEpRealization}
                vgi={epVgi}                   setVgi={setEpVgi}
                vvgi={epVvgi}                 setVvgi={setEpVvgi}
                auditorNote={epAuditorNote}   setAuditorNote={setEpAuditorNote}
                timestamp={epTimestamp}
                onClose={() => setEpManualOpen(false)}
                onValidate={() => {
                  setEpValidated(true);
                  setEpManualOpen(false);
                  setEpWindowOpen(false);
                  setAsIsnessState('ep');
                  fnTracker.isEpValidated = true;
                  addLog({ time: timeRef.current, speaker: 'SYS',
                    text: `\u2726 ${t('ep_validated')} \u2014 ${t('ep_reaction_label')}: ${epReactionType}${epRealization ? ` \u2014 PC: "${epRealization}"` : ''}${epVvgi ? ' \u2014 VVGI' : epVgi ? ' \u2014 VGI' : ''}${epAuditorNote ? ` \u2014 ${t('ep_note_label')}: ${epAuditorNote}` : ''}`,
                    type: 'highlight' });
                }}
              />
            )}

            {/* (SOL/SEC + STATE + REACTION are now shown together TOP-CENTRE for ALL
                views — needle AND halo — by the unified data stack further below.) */}

            {/* ── SENZA STRUMENTI IL TONE ARM NON ESISTE ─────────────────────────────────────
                Un « 2.00 » a schermo senza nulla che lo misuri è la cosa peggiore che l'app
                possa fare: sembra una lettura, e non lo è. Sparisce insieme alla diagnostica e
                alla scia dell'ago — vedi `senzaMisura`. */}
            {/* Display TONE ARM + EP button */}
            <div className="sm-glass absolute top-10 right-10 flex flex-col items-end z-10 pointer-events-auto" style={{ ...scenePerspective('50%', '28%'), ...frontTilt(12) }}>
              {!senzaMisura && (
              <span className="text-[10px] font-light uppercase tracking-[0.2em]"
                style={{ fontFamily: 'var(--font-sans)', color: isLightTheme ? '#64748b' : 'rgba(148,163,184,0.7)' }}>TONE ARM</span>
              )}
              {/* Le TONE ARM vient des LATTINE dès qu'il est disponible : c'est une vraie
                  résistance mesurée, pas une reconstruction. On retombe sur celui déduit de
                  l'EEG quand le meter n'est pas là ou n'est pas encore étalonné — et dans ce
                  cas on le DIT, au lieu de laisser croire que le 2.0 vient des lattine. */}
              {/* Il TA viene dalla lettura CORRENTE, non dal braccio.
                  Il braccio è la media lenta (~20 s): usandolo, il nostro TA restava indietro
                  rispetto a quello del Theta-Meter, che lo calcola dalla resistenza corrente —
                  misurato in seduta: noi 6,8 · loro 5,98, con la resistenza in discesa.
                  Il braccio resta quello che regge l'AGO (la deviazione si misura da lui) e il
                  Total TA: quelli devono restare lenti, o ogni reazione conterebbe come TA. */}
              {/* ⚠️ SENZA METER NON C'È TONE ARM. Qui compariva il TA RICOSTRUITO dall'EEG
                  (`ToneArmReadout`): un numero con due decimali, nello stesso posto e con lo
                  stesso aspetto di quello misurato, che però non veniva da nessuna resistenza.
                  Col solo MUSE non si mostra più (richiesta utente) — il calcolo resta, serve
                  altrove; è la CIFRA a schermo che faceva credere a una misura. */}
              {senzaMisura || theta.status !== 'connected' || taMostrato === null ? null : (
                <span style={{ fontFamily: 'monospace', fontSize: 34, fontWeight: 700, lineHeight: 1,
                               color: isLightTheme ? '#1e293b' : 'rgba(240,246,255,0.95)' }}>
                  {taMostrato.ta.toFixed(2)}
                </span>
              )}

              {/* ── CON QUANTE LATTINE — è lei a dare senso al numero ─────────────────────
                  Due lattine e una lattina non misurano la stessa resistenza, e il TA che si
                  legge dipende da quale delle due si sta usando. Va scritto DOVE si legge il
                  numero (richiesta utente), non nascosto in una schermata di prontezza che si
                  è vista una volta all'inizio. */}
              {/* ── SU CHE COSA SI BASA IL NUMERO ────────────────────────────────────────
                  In TUTTI E TRE i casi si dice da dove viene, perché in tutti e tre è un TA
                  diverso: il riferimento a due lattine, quello a una riportato a due con lo
                  scarto misurato, o quello a una con la divisione tolta. Senza questa riga il
                  numero è lo stesso a vedersi e vuol dire tre cose. */}
              {theta.status === 'connected' && taMostrato && (
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '0.10em',
                               textTransform: 'uppercase', marginTop: 2, textAlign: 'right',
                               color: taMostrato.margin > 0 ? TOKEN.warn
                                    : isLightTheme ? '#64748b' : 'rgba(148,163,184,0.75)' }}>
                  {taMostrato.basis === 'two-cans'
                    ? LC('TA · 2 lattine', 'TA · 2 boîtes', 'TA · 2 cans', 'TA · 2 latas', 'TA · 2 burkar')
                    : taMostrato.basis === 'solo-measured'
                    ? LC('TA · 1 lattina → 2', 'TA · 1 boîte → 2', 'TA · 1 can → 2', 'TA · 1 lata → 2', 'TA · 1 burk → 2')
                    : LC('TA · 1 lattina − 1 divisione', 'TA · 1 boîte − 1 division', 'TA · 1 can − 1 division', 'TA · 1 lata − 1 división', 'TA · 1 burk − 1 delstreck')}
                </span>
              )}

              {/* ── IL MARGINE DELLA PROVA, E IL MODO DI FARLA ────────────────────────────
                  Sta QUI e non sotto la colonna del tono (richiesta utente): è accanto al
                  numero che il margine corregge, ed è lì che interessa.
                  È un BOTTONE perché la scheda del preclear diceva « mai fatta » senza dire
                  dove si facesse (segnalato): premendolo si riapre la schermata delle prove. */}
              {margineTono > 0 && (
                <button
                  onClick={() => { setThetaReadyDone(false); setMetabolicOpen(true); }}
                  title={LC('Rifai la prova della stretta — fissa la sensibilità dell\'ago',
                            'Refais le test de pression — il fixe la sensibilité de l\'aiguille',
                            'Redo the squeeze test — it sets the needle sensitivity',
                            'Rehaz la prueba de presión — fija la sensibilidad de la aguja',
                            'Gör om tryckprovet — det ställer nålens känslighet')}
                  style={{ marginTop: 5, padding: '3px 9px', borderRadius: 7, cursor: 'pointer',
                           fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 700,
                           letterSpacing: '0.04em', whiteSpace: 'nowrap',
                           background: 'rgba(251,191,36,0.12)',
                           border: `1px solid ${TOKEN.warn}`, color: TOKEN.warn }}>
                  −{margineTono} · {LC('fai la prova delle lattine', 'fais le test des boîtes', 'do the cans test', 'haz la prueba de las latas', 'gör burktestet')}
                </button>
              )}

              {/* Il TA e' UNO SOLO: quello delle boites quando il meter c'e', altrimenti
                  quello ricostruito dall'EEG. Nessuna etichetta « boites », nessun colore sui
                  numeri, nessun Total TA in doppio — quello sta in DIAGNOSTICA e viene ora
                  alimentato dalle boites (vedi l'override di TotalTaReadout).
                  Resta solo cio' che NON e' un doppione: l'accesso alla taratura, e i report
                  scartati se ce ne sono — se quel numero sale, l'intestazione 01 02 non e'
                  costante e il formato va rivisto. */}
              {/* Raggiungibile ANCHE da scollegati: se il meter non si aggancia, il pannello è
                  l'unico posto che dice PERCHÉ. Nascondendolo, su una macchina altrui restava
                  solo « non appare il TA e non si può tarare », che non è diagnosticabile. */}
              {!theta.unavailable && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                  {theta.counters.rejected > 0 && (
                    <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#f87171' }}>
                      {theta.counters.rejected} ✕
                    </span>
                  )}
                  {theta.lastError && (
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9, maxWidth: 210, textAlign: 'right', color: '#f87171' }}>
                      {theta.lastError}
                    </span>
                  )}
                </div>
              )}

        {/* PROGRESSIVE DISCLOSURE — Total TA + velocità dietro un solo toggle
                  "diagnostica", chiuso di default → l'angolo resta un solo meter pulito.
                  Reso chiaramente APRIBILE: pill con bordo + chevron (non un'etichetta). */}
              {!showDiag && !senzaMisura && espertoAttivo && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: isLightTheme ? '#334155' : 'rgba(240,246,255,0.8)' }}>{t('diagnostics') as string}</span>
                  <GlassCollapseToggle on={false} onToggle={() => setShowDiag(true)} />
                </div>
              )}
              {/* Ph.1 PILOTE — panneau Diagnostic en VERRE + perspective via <Panel3D>. Le
                  contenu (readouts) est INCHANGÉ ; seul l'emballage visuel + le chrome
                  (replier/masquer) sont nouveaux. Le × masque → le chip réapparaît. */}
              {showDiag && !senzaMisura && espertoAttivo && (
                <Panel3D title={t('diagnostics') as string} side="right" isLightTheme={isLightTheme}
                  onHide={() => setShowDiag(false)}
                  style={{ marginTop: 8, minWidth: 160 }}
                  bodyStyle={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <TotalTaReadout isLightTheme={isLightTheme} label={t('total_ta')}
                    override={theta.status === 'connected' ? theta.totalTa : null}
                    bodyMotion={theta.bodyMotion} />
                  {/* VELOCITÀ DI RILASCIO: viene dalla velocità di elaborazione mentale, cioè
                      dall'EEG. Con le sole boîtes non ha sorgente — mostrarla ferma accanto a
                      numeri veri la farebbe passare per una misura. */}
                  {!eegModulesHidden(instruments) && (
                    <SpeedReadout isLightTheme={isLightTheme} label={t('mental_processing_velocity') as string} />
                  )}
                </Panel3D>
              )}

              {/* (Live mass/dissolution moved into the unified ClearDial — under the arc.) */}

              {/* ── ASSESSMENT, POI EP — i due capi dello stesso lavoro ──────────────────────
                  ASSESSMENT apre la lista degli item, EP la chiude. Stavano in due angoli
                  opposti dello schermo (uno sotto il selettore di vista a sinistra, l'altro
                  qui a destra) e la sequenza non si leggeva. Adesso sono incolonnati:
                  ASSESSMENT sopra, EP sotto, nell'ordine in cui si usano. */}
              {sessionState === 'running' && (
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  {/* ── QUALE AGO, E QUALI REAZIONI — un comando solo ────────────────────────
                      Sceglie le REAZIONI da scrivere sopra il quadrante, e insieme QUALE AGO
                      guardare là dove l'ago non è già imposto dal metodo (cioè in LIBERO: negli
                      altri modi lo impone MODE_SPEC e questa scelta cambia solo le scritte).

                      ── DUE MOSTRA L'AGO DEL METER ────────────────────────────────────────
                      Prima DUE non toccava l'ago e lasciava quello di prima. Ma i due aghi non
                      sono pari: quello del MUSE è RICOSTRUITO (il TA è ricavato dall'EEG),
                      quello del METER è una MISURA di resistenza. Chiedendo di vedere tutto e
                      due, l'ago da guardare è quello vero, e le reazioni del MUSE si aggiungono
                      sopra come seconda riga — che è il loro posto, perché i due non si fondono
                      (κ = −0,09 su 89 item).

                      Vale dove il metodo LASCIA la scelta, cioè in LIBERO. In CONTACT, NULL e
                      MIRROR l'ago resta quello dell'EEG perché è la SORGENTE del ciclo, non una
                      preferenza di visualizzazione: cambiarlo cambierebbe da quale strumento il
                      ciclo registra le letture. (Vedi MODE_SPEC in engine/sessionMode.ts.)

                      Sta QUI e non a sinistra: è una scelta sugli STRUMENTI, come ASSESS ed EP
                      che le stanno sotto, non una scelta sul metodo. */}
                  {instruments.muse && instruments.theta && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {/* ── L'ICONA DICE CHE SI PARLA DELL'AGO ────────────────────────────────
                        « MUSE / METER / DUE » da solo non diceva DI CHE COSA: poteva essere lo
                        strumento, la connessione, la sorgente del suono. Un ago su un perno lo
                        dice senza una parola, ed è lo stesso disegno del quadrante che si sta
                        guardando (segnalato). */}
                    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"
                      style={{ flexShrink: 0, opacity: 0.75 }}>
                      <path d="M1.6 12.2 A 7.4 7.4 0 0 1 14.4 12.2" fill="none"
                        stroke={isLightTheme ? '#3a3a40' : '#a8b6cc'} strokeWidth="1.2" strokeLinecap="round" />
                      <line x1="8" y1="12.2" x2="4.9" y2="5.6"
                        stroke={isLightTheme ? '#1a1a1f' : '#f0f6ff'} strokeWidth="1.4" strokeLinecap="round" />
                      <circle cx="8" cy="12.2" r="1.35" fill={isLightTheme ? '#1a1a1f' : '#f0f6ff'} />
                    </svg>
                    <div style={{ display: 'flex', width: 168, padding: 2, gap: 2, borderRadius: 999,
                      background: TOKEN.wellBg,
                      boxShadow: TOKEN.wellShadow }}>
                      {([{ k: 'eeg' as const, lbl: 'MUSE', col: '#8ab4ff' },
                         { k: 'theta' as const, lbl: 'METER', col: '#f59e0b' },
                         { k: 'both' as const, lbl: LC('DUE', 'DEUX', 'BOTH', 'DOS', 'TVÅ'), col: '#34d399' }]).map(o => {
                        const on = reazioniViste === o.k;
                        const imposto = MODE_SPEC[mode].needle !== null || provaBoiteInCorso || cicloInCorso;
                        return (
                          <button key={o.k} type="button"
                            // DUE → l'ago del METER (è misurato, non ricostruito) + le reazioni
                            // del MUSE in più.
                            onClick={() => { setReazioniViste(o.k); setAgoScelto(o.k === 'both' ? 'theta' : o.k); }}
                            title={imposto
                              ? LC('Quali reazioni scrivere — l\'ago lo impone il metodo',
                                   'Quelles réactions écrire — l\'aiguille est imposée par la méthode',
                                   'Which reactions to write — the needle is set by the method',
                                   'Qué reacciones escribir — la aguja la impone el método',
                                   'Vilka reaktioner som skrivs — nålen bestäms av metoden')
                              : LC('Quale ago guardare e quali reazioni scrivere',
                                   'Quelle aiguille regarder et quelles réactions écrire',
                                   'Which needle to watch and which reactions to write',
                                   'Qué aguja mirar y qué reacciones escribir',
                                   'Vilken nål att se och vilka reaktioner som skrivs')}
                            style={{ flex: 1, height: 20, borderRadius: 999, border: 'none', cursor: 'pointer',
                              fontSize: 8, fontWeight: 700, letterSpacing: '0.02em',
                              color: on ? '#0b0f14' : (isLightTheme ? '#3a3a40' : '#8b98ad'),
                              background: on ? o.col : 'transparent',
                              transition: 'color 0.2s, background 0.2s' }}>
                            {o.lbl}
                          </button>
                        );
                      })}
                    </div>
                    </div>
                  )}
                  {/* NEEDLE LIGHT — sotto il selettore degli aghi, perché parla dello STESSO ago:
                      uno dice QUALE, l'altra COME lo si vede. Stavano in due posti diversi
                      (segnalato). Nascosta in MIRROR e TONE, che hanno il loro quadrante. */}
                  {/* Senza strumenti non c'è ago, quindi non c'è scia da accendere. */}
                  {!senzaMisura && (mode === 'contact' || mode === 'null' || mode === 'free') && (
                    <button type="button" onClick={() => setShowTrailPref(v => !v)}
                      title={LC('NEEDLE LIGHT — la scia luminosa dell\'ago e le etichette di reazione',
                                'NEEDLE LIGHT — la traînée lumineuse de l\'aiguille et les libellés de réaction',
                                'NEEDLE LIGHT — the needle\'s glowing trail and the reaction labels',
                                'NEEDLE LIGHT — la estela luminosa de la aguja y las etiquetas de reacción',
                                'NEEDLE LIGHT — nålens lysande svans och reaktionsetiketterna')}
                      style={{ width: 168, height: 20, borderRadius: 999, cursor: 'pointer',
                        fontSize: 8, fontWeight: 700, letterSpacing: '0.04em', background: 'transparent',
                        border: `1px solid ${isLightTheme ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.14)'}`,
                        color: showTrailPref ? (isLightTheme ? '#3a3a40' : '#a8b6cc') : (isLightTheme ? '#8a8a90' : '#5d6878') }}>
                      {showTrailPref ? '● ' : '○ '}NEEDLE LIGHT
                    </button>
                  )}
                  {/* ⚠️ NON in TONE: là l'assessment si accende e si spegne DA SÉ a ogni tempo
                      (vedi il commento « L'ASSESSMENT SI ACCENDE E SI SPEGNE DA SÉ NEL CICLO
                      TONE »). Un bottone manuale accanto è ridondante e dà l'idea di dover fare
                      un gesto che il ciclo fa già (segnalato). */}
                  {mode !== 'tone' && (
                  <button onClick={toggleAssessment} title="ASSESSMENT"
                    style={{ width: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, height: 26,
                      borderRadius: 9, fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 700,
                      letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
                      color: assessActive ? '#07120c' : 'rgba(240,246,255,0.95)',
                      background: assessActive ? '#34d399' : 'rgba(10,14,20,0.55)',
                      border: `1px solid ${assessActive ? 'rgba(52,211,153,0.9)' : 'rgba(255,255,255,0.28)'}`,
                      boxShadow: assessActive ? '0 0 16px rgba(52,211,153,0.45)' : 'none', backdropFilter: 'blur(4px)' }}>
                    {assessActive ? <Square size={11} strokeWidth={2.6} fill="currentColor" /> : <ClipboardList size={11} strokeWidth={2} />}
                    ASSESS
                  </button>
                  )}
                  {/* EP en MINI TOGGLE (même forme que DARK/LIGHT), aligné à droite. */}
                  <GlassLabeledToggle
                    on={epValidated}
                    label={epValidated ? 'EP ✓' : 'EP'}
                    title="EP"
                    width={96}
                    onToggle={() => {
                      if (!epValidated) setEpTimestamp(timeRef.current);
                      setEpManualOpen(true);
                    }}
                  />
                </div>
              )}
            </div>

            {/* SFERA: Occupa tutto lo spazio! — needle OU halo selon viewMode */}
            <div className="w-full h-full flex items-center justify-center relative pointer-events-auto" style={{ minHeight: 0 }}>
              {/* FIX CONN-56: elegant "press START" prompt centred on the dial —
                  far more visible than the small top badge. Same Play icon as the
                  sidebar START button for visual coherence. Click → start session. */}
              {/* Il « premi START » compare con QUALUNQUE strumento pronto — comprese le sole
                  boîtes: prima era legato al solo Muse (locale o remoto) e in configurazione
                  Theta non appariva mai, quindi la seduta non si poteva nemmeno avviare. */}
              {((appMode === 'auditor' && isConnected && remoteMuseConnected) ||
                (satelliteMode && museConnection === 'connected') ||
                (appMode === 'local' && (museConnection === 'connected' || theta.status === 'connected'))) &&
                (sessionState === 'idle' || sessionState === 'ended') && (
                <button
                  onClick={() => requestStart()}
                  style={{
                    position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
                    zIndex: LAYER.sphereChrome, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    animation: 'smStartFade 0.5s ease-out' }}
                  title={t('hint_press_start') as string}
                >
                  {/* Glowing ring + Play */}
                  <span style={{
                    position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 104, height: 104, borderRadius: '50%',
                    background: isLightTheme ? 'radial-gradient(circle at 50% 40%, rgba(34,211,238,0.22), rgba(6,182,212,0.06) 70%, transparent)' : 'radial-gradient(circle at 50% 40%, rgba(255,255,255,0.16), rgba(255,255,255,0.04) 70%, transparent)',
                    border: `2px solid ${isLightTheme ? 'rgba(34,211,238,0.55)' : 'rgba(255,255,255,0.55)'}`,
                    boxShadow: isLightTheme ? '0 0 0 4px rgba(34,211,238,0.05), inset 0 0 16px rgba(34,211,238,0.10)' : '0 0 0 4px rgba(255,255,255,0.05), inset 0 0 16px rgba(255,255,255,0.10)',
                    animation: 'smStartPulse 1.8s ease-in-out infinite' }}>
                    <Play size={46} strokeWidth={1.6} fill={isLightTheme ? '#0891b2' : '#ffffff'} style={{ color: isLightTheme ? '#0891b2' : '#ffffff', marginLeft: 6 }} />
                  </span>
                  <span style={{
                    fontSize: 14, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase',
                    color: isLightTheme ? '#0e7490' : '#ffffff', textShadow: 'none' }}>
                    {t('hint_press_start')}
                  </span>
                </button>
              )}
              {/* MIRROR = MÊME cadran que AGO + : l'aiguille garde ses RÉACTIONS habituelles (Fall/
                  F-N). Seul l'ARC change : l'échelle 1–10 (MirrorDial) à la place du ClearDial. La
                  couleur remplit l'arc avec l'avancement de la décharge. */}
              {/* ── SENZA AGO NON SI DISEGNA UN QUADRANTE ──────────────────────────────────
                  Un arco con le sue tacche e la sua scala, e niente che lo muova, non è neutro:
                  è uno strumento rotto. E ruba il centro dello schermo — che senza ago tocca
                  all'unica cosa che conta, cioè A CHE PUNTO SEI E COSA DEVI FARE.

                  I CICLI RESTANO TUTTI (vedi availableModes): la sorgente non è l'ago, sono la
                  percezione del preclear e l'obnosi dell'auditor. Cambia solo chi spinge il
                  ciclo — vedi `cycleIsAutomatic`. */}
              {/* PRIMA DELLO START non c'è niente da dire: nessun ciclo è in corso, e « DAI
                  L'ITEM » su una seduta non avviata è un'istruzione per un lavoro che non è
                  cominciato. Al suo posto resta l'invito a premere START, che è già qui sopra.
                  E l'etichetta gialla « senza strumenti » è passata in alto accanto ai badge,
                  una volta sola: ripetuta al centro per tutta la seduta stancava la vista. */}
              {senzaMisura && sessionState === 'running' ? (
                /* ── LA TRANSIZIONE È UNA CONSEGUENZA PERCEPITA, NON UN RIASSETTO ──────────
                   Il testo al centro cambia a OGNI tempo del ciclo, e cambiava di scatto: due
                   frasi diverse nello stesso punto, senza nulla che dicesse « sei passato al
                   passo dopo ». 180 ms di dissolvenza con 8 px di scorrimento bastano a farlo
                   leggere come un AVANZAMENTO. La `key` è la FASE: è il cambio di fase che
                   rimonta il blocco, ed è esattamente quello che si vuole vedere. */
                <motion.div
                  key={faseCiclo}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  // IN TONE la colonna sta a destra e larga 260: senza questo margine il
                  // testo del ciclo le finiva sotto, e sotto il pannello di fondo spariva.
                  style={{ maxWidth: 560, padding: '0 24px', textAlign: 'center',
                           marginRight: viewMode === 'tone' ? 260 : 0,
                           display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Lo stesso testo del CycleHint, ma in grande: qui è il soggetto dello
                      schermo, non una didascalia sotto un quadrante. */}
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 26, fontWeight: 800,
                                 letterSpacing: '0.02em', lineHeight: 1.15,
                                 color: spiegazioneCiclo.fatto ? '#34d399'
                                       : (isLightTheme ? '#1a1a1f' : 'rgba(240,246,255,0.96)') }}>
                    {senzaNumero(spiegazioneCiclo.titolo)}
                  </span>
                  {/* LA FRASE DA DIRE, alla lettera. Senza strumenti il centro dello schermo è
                      l'unica guida che l'auditor ha: il comando ci sta in grande, sopra il
                      gesto, perché è la cosa che si fa PRIMA di toccare qualunque bottone. */}
                  {spiegazioneCiclo.comando && (
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 17, lineHeight: 1.35,
                                   color: isLightTheme ? '#1a1a1f' : 'rgba(240,246,255,0.92)' }}>
                      {spiegazioneCiclo.comando}
                    </span>
                  )}
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.5,
                                 color: isLightTheme ? '#3a3a40' : 'rgba(226,238,255,0.78)' }}>
                    {comeSenzaAgo(faseCiclo) ?? spiegazioneCiclo.come}
                  </span>
                  {spiegazioneCiclo.avviso && (
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
                                   color: TOKEN.warn }}>
                      {spiegazioneCiclo.avviso}
                    </span>
                  )}

                  {/* ── I COMANDI MANUALI ──────────────────────────────────────────────────────
                      Senza ago la macchina a stati non riceve i tick che la fanno avanzare: il
                      ciclo lo porta avanti l'auditor. I gesti sono le STESSE funzioni che l'ago
                      scatena da solo (validateAsIs, validateClearRead, stopMirror) — qui hanno
                      il loro bottone. « Dai l'item » sta già nella barra in alto; qui c'è il
                      passo che chiude il ciclo, e per NULL i due esiti.
                      Non è un motore nuovo: è la mano dove prima c'era l'automatismo. */}
                  {comandiManualiCiclo(false)}
                </motion.div>
              ) : !senzaMisura ? (
              <QuantumSphere
                needleOffsetProp={needleOffset}
                // Un ago SOLO: quello delle lattine si disegna solo se è lui il principale.
                // Senza questo, scegliendo il MUSE restavano di nuovo due aghi sul quadrante.
                thetaOffset={theta.status === 'connected' && agoPrincipale === 'theta'
                  ? theta.offset : null}
                // Il bersaglio si segna DA DOVE STA L'AGO quando la prova comincia, non dalla
                // posizione di riposo teorica: se l'ago è posato altrove, il segno verde era già
                // superato in partenza e il terzo di quadrante non voleva dire niente.
                targetOffset={theta.testing ? theta.testBaseOffset + SQUEEZE_TARGET_OFFSET : null}
                // UN AGO SOLO — vedi `agoPrincipale`. Col METER collegato il quadrante è suo, e
                // la scritta viene dallo stesso ago: una lettura che l'auditor non vede muoversi
                // non si scrive.
                showEegNeedle={agoPrincipale === 'eeg' && instruments.muse}
                needleReactionKey={agoPrincipale === 'theta' ? thetaReactionKey : needleReactionKey}
                asIsnessState={asIsnessState}
                onClick={resetNeedle}
                showTrail={viewMode !== 'needle_pure'}
                releaseActive={stableReleaseState === 'active'}
                fnMode={fnMode}
              />
              ) : null}
            </div>

            {/* DATA STACK — fixed TOP-CENTRE for ALL views (needle + halo), per the
                auditor's request. Row 1: SOL/SEC value + STATE (CONTACT/PROCESSING/…)
                on the SAME line, with fixed-width columns so nothing shifts left/right
                or up/down. Row 2: a fixed-height REACTION zone (reserved) so the value
                row above never moves when a reaction appears/disappears. */}
            <div className="sm-glass absolute z-30 pointer-events-none flex flex-col items-start"
              // ⚠️ 720 e non più 500. La colonna dei selettori se n'è andata in basso e questa
              // fascia è ora TUTTA per il ciclo: l'item, la spiegazione, il comm lag e l'AS-IS
              // ci stanno in largo invece di impilarsi. `maxWidth` in percentuale perché a
              // destra c'è ancora DIAGNOSTIC, e su una finestra stretta il blocco gli finiva
              // sopra (segnalato: « le scritte a volte sono nel riquadro diagnostic »).
              // ⚠️ ANCORATO, non centrato. Centrato con una larghezza fissa, il bordo destro
              // dipende dalla finestra e a 1440 finiva 27 px DENTRO il riquadro DIAGNOSTIC
              // (misurato; segnalato: « le scritte a volte sono nel riquadro diagnostic »).
              // Con `left`/`right` il blocco si stringe da sé e non lo raggiunge mai — e il
              // testo, che è allineato a sinistra, parte sempre dallo stesso punto invece di
              // ballare col centro.
              style={{ top: '2.5%', left: 120, right: 175, textAlign: 'left' }}>
              {/* AUDITING ITEM bar — the auditor types the question and ARMS the cycle
                  BEFORE asking it. The cycle indicators below only show while armed;
                  the engines keep computing (recorded for the report + Ron's Lag).
                  ⚠️ Sparisce con i cicli: il campo esiste per scrivere la domanda E armare il
                  ciclo. Senza cicli il gesto per cui è fatto non c'è più, e resterebbe un
                  campo di testo che non fa nulla. Gli item si danno da ASSESSMENT. */}
              {/* DEUX RANGÉES (demande utilisateur : « la domanda non è più leggibile, spostala sopra
                  i bottoni ») : la QUESTION occupe TOUTE la largeur en haut — avec les compteurs et
                  les boutons sur la même ligne elle était écrasée à néant. Commandes en dessous. */}
              <div style={{ width: '100%', marginBottom: 18, pointerEvents: 'auto',
                            // MIRROR et TONE ont leur PROPRE barre et n'ont ni CONTACT ni NULL :
                            // laisser celle-ci afficherait deux jeux de commandes contradictoires.
                            // In LIBERO non c'è ciclo da armare: il campo item e il bottone non
                            // avrebbero niente da fare. Gli item si danno da ASSESSMENT.
                            // E MAI PRIMA DELLO START: un campo « dai l'item » e un bottone che
                            // arma un ciclo, su una seduta non ancora cominciata, invitano a un
                            // gesto che non ha effetto. Compaiono quando la seduta parte.
                            //
                            // ⚠️ QUI C'ERA `eegModulesHidden(instruments)`, e nascondeva TUTTO.
                            // Col solo THETA-METER (meter sì, MUSE no) sparivano insieme la pista
                            // dei tempi, il campo dell'item, il bottone che arma e l'istruzione:
                            // si sceglieva CONTACT e non restava niente da fare né da leggere
                            // (segnalato). Era il ragionamento « senza EEG il ciclo non ha
                            // sorgente », già smentito una volta: la sorgente sono la percezione
                            // del preclear e l'obnosi dell'auditor. Quel che manca senza EEG è
                            // l'AUTOMATISMO — vedi `cycleIsAutomatic` —, non il ciclo.
                            display: (sessionState !== 'running' || !MODE_SPEC[mode].arms || viewMode === 'mirror' || viewMode === 'tone') ? 'none' : 'flex',
                            flexDirection: 'column', gap: 6 }}>
                {/* ── A CICLO ARMATO L'ITEM È UN'ETICHETTA CHIARA, NON UN CAMPO GRIGIO ─────────
                    Quando il ciclo avanza, ciò che conta è LEGGERE su che cosa si sta lavorando.
                    Un textarea disabilitato lo mostrava piccolo, in monospace, sbiadito — poco
                    leggibile allo step successivo (segnalato). Armato → etichetta grande e netta,
                    come il titolo dei cicli senza strumenti. Non armato → il campo per scrivere. */}
                {/* ── LA PISTA DEI TEMPI ─────────────────────────────────────────────────
                    Quanti sono, a quale sei, cosa viene dopo — al posto del « 1 · » che
                    prometteva una sequenza e non la mostrava mai. Sta SOPRA il campo, cioè
                    dove comincia il lavoro. */}
                <CycleSteps mode={mode} phase={faseCiclo} lang={lang} />
                {cycleArmed ? etichettaItem() : (
                /* ── IL CAMPO E IL GESTO SULLA STESSA RIGA, come in MIRROR e in TONE ────────
                   Il bottone stava una riga più sotto, in mezzo ai contatori: si scriveva
                   l'item in un posto e lo si dava in un altro, e negli altri due cicli invece
                   stava a destra del campo (segnalato). Adesso i quattro si somigliano. */
                <div style={{ display: 'flex', gap: 10, alignItems: 'stretch', width: '100%' }}>
                  <textarea
                    value={auditingQuestion}
                    onChange={(e) => setAuditingQuestion(e.target.value)}
                    // ENTRÉE n'arme AUCUN cycle (demande utilisateur) : le cycle démarre UNIQUEMENT en
                    // pressant CONTACT ou NULL — au moment où l'auditeur donne l'item. On avale juste
                    // la touche pour ne pas insérer un saut de ligne dans l'item.
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) e.preventDefault(); }}
                    rows={1}
                    placeholder={lang === 'fr' ? "Question d'audition…" : lang === 'it' ? 'Domanda di auditing…' : lang === 'es' ? 'Pregunta de auditación…' : lang === 'sv' ? 'Auditfråga…' : 'Auditing question…'}
                    style={{
                      // AUTO-GROW (field-sizing) : une question longue reste ENTIÈREMENT
                      // lisible (jusqu'à ~7 lignes), puis défile.
                      flex: 1, minWidth: 160, minHeight: 28, maxHeight: 160, padding: '6px 10px', borderRadius: 8,
                      fontSize: 12, lineHeight: 1.45, fontFamily: 'monospace', resize: 'none', overflowY: 'auto',
                      fieldSizing: 'content',
                      background: 'rgba(0,0,0,0.45)',
                      border: '1px solid rgba(255,255,255,0.22)',
                      color: 'rgba(235,244,255,0.92)', outline: 'none' } as React.CSSProperties}
                  />
                  {bottoneCiclo()}
                </div>
                )}
                {/* Rangée des COMMANDES : compteurs + les deux cycles + mock-up.
                    Prima era « SOLO COL MUSE », col ragionamento che senza EEG il ciclo non ha
                    sorgente e resterebbe armato senza potersi concludere. Il ragionamento era
                    mio e sbagliato: la sorgente di un ciclo non è l'ago — senza EEG restano la
                    percezione del preclear e l'obnosi dell'auditor, che sono gli indicatori
                    originali. Quel che manca è l'AUTOMATISMO (`cycleIsAutomatic`): il ciclo lo
                    conclude l'auditor a mano, che è come si è sempre fatto. */}
                {(
                <div className="flex items-center gap-2" style={{ width: '100%' }}>
                {/* CYCLE COUNTERS — SOLO quello del MODO in corso ───────────────────────────
                    Avere CONTACT e NULL affiancati anche dopo aver scelto CONTACT confonde:
                    davanti c'è UN metodo, e due contatori danno a intendere che siano tutti e
                    due in gioco. Si mostra il contatore del ciclo scelto e basta — CONTACT con
                    CONTACT, NULL con NULL (richiesta utente). L'altro totale resta nel rapporto,
                    dove il confronto ha senso. */}
                {([
                  { k: 'c', n: cycleStats.cStarted, d: cycleStats.cDone, name: 'CONTACT', end: 'AS-IS',
                    col: isLightTheme ? '#0891b2' : '#6ee7b7', bd: 'rgba(110,231,183,0.45)',
                    tip: LC('Cicli CONTACT avviati · portati ad AS-IS', 'Cycles CONTACT armés · menés à AS-IS', 'CONTACT cycles armed · taken to AS-IS', 'Ciclos CONTACT armados · llevados a AS-IS', 'CONTACT-cykler armerade · förda till AS-IS') },
                  { k: 'n', n: cycleStats.nStarted, d: cycleStats.nDone, name: 'NULL', end: 'CLEAR',
                    col: isLightTheme ? '#475569' : '#cbd5e1', bd: 'rgba(148,163,184,0.55)',
                    tip: LC('Cicli NULL avviati · portati a EQUILIBRIUM', 'Cycles NULL armés · menés au EQUILIBRIUM', 'NULL cycles armed · taken to EQUILIBRIUM', 'Ciclos NULL armados · llevados a EQUILIBRIUM', 'NULL-cykler armerade · förda till EQUILIBRIUM') },
                ] as const).filter(c => c.k === (mode === 'null' ? 'n' : 'c')).map(c => (
                  <div key={c.k} title={c.tip}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, height: 28, padding: '0 9px', borderRadius: 8,
                      background: isLightTheme ? 'rgba(34,211,238,0.10)' : 'rgba(255,255,255,0.06)',
                      border: `1px solid ${c.bd}`, whiteSpace: 'nowrap', fontFamily: 'monospace', flexShrink: 0 }}>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 8, letterSpacing: '0.06em', color: c.col, opacity: 0.8 }}>{c.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: isLightTheme ? '#0891b2' : 'rgba(240,246,255,0.95)' }}>{c.n}</span>
                    <span style={{ fontSize: 11, color: isLightTheme ? '#0e7490' : 'rgba(226,238,255,0.9)' }}>· {c.d}<span style={{ fontSize: 8, opacity: 0.7 }}> {c.end}</span></span>
                  </div>
                ))}
                {/* ── LES DEUX CYCLES : deux boutons SYMÉTRIQUES, armés À LA MAIN et SÉPARÉMENT.
                    On presse AU MOMENT où on donne l'item/la question → c'est ça le START (donc
                    t_Item est JUSTE), et le moteur vérifie ensuite s'il y a de la charge ou si
                    c'est nul, et le SIGNALE. Presser le bouton ACTIF = ferme le cycle ; presser
                    l'AUTRE = bascule le cycle courant (on garde n° + item). */}
                {/* ── UN BOTTONE SOLO: quello del MODO in corso ─────────────────────────────
                    Prima erano due, e uno dei due era sempre quello sbagliato — con l'altro
                    disabilitato appena un ciclo girava. Il metodo lo si è già scelto in alto:
                    qui resta il GESTO, cioè dare l'item. Ripremendolo si chiude il ciclo. */}
                {cycleArmed && bottoneCiclo()}
                {/* ── ANNULLA — l'uscita dal ciclo, che prima era il bottone stesso ────────
                    Chiudere il ciclo si faceva ripremendo « MOCK-UP », e nessuno poteva
                    indovinarlo. Adesso l'uscita ha il suo bottone e il suo nome, come in
                    TONE: chiude senza validare, e il ciclo resta « non validato » nel
                    rapporto — che è esattamente quel che è. */}
                {cycleArmed && (
                  <button onClick={() => finalizeCycle(false)}
                    title={LC('Chiude il ciclo SENZA validarlo', 'Ferme le cycle SANS le valider', 'Closes the cycle WITHOUT validating it', 'Cierra el ciclo SIN validarlo', 'Stänger cykeln UTAN att validera')}
                    style={{ height: 28, padding: '0 12px', borderRadius: 8, flexShrink: 0, cursor: 'pointer',
                      fontFamily: 'monospace', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
                      background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.18)',
                      color: 'rgba(235,244,255,0.7)' }}>
                    {LC('ANNULLA', 'ANNULER', 'CANCEL', 'CANCELAR', 'AVBRYT')}
                  </button>
                )}
                {/* ── I DUE ESITI DEL EQUILIBRIUM ─────────────────────────────────────────
                    Stavano in fondo, nella barra dei numeri, accanto alla % di dissoluzione.
                    Salgono qui accanto al bottone del ciclo: chi chiude un ciclo lo chiude
                    dove l'ha aperto. Sono DUE perché la scelta è vera — i VGI's ci sono o non
                    ci sono, e la differenza va scritta nel rapporto. */}
                {cycleArmed && cycleKind === 'null' && faseCiclo === 'null.equilibrium' && (() => {
                  const b = (testo: string, vgi: boolean, forte: boolean) => (
                    <button key={testo} onClick={() => validateClearRead(vgi)}
                      style={{ height: 28, padding: '0 12px', borderRadius: 8, flexShrink: 0, cursor: 'pointer',
                        fontFamily: 'monospace', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
                        background: forte ? 'rgba(52,211,153,0.20)' : 'rgba(0,0,0,0.45)',
                        border: `1px solid ${forte ? '#34d399' : 'rgba(255,255,255,0.3)'}`,
                        color: forte ? '#34d399' : 'rgba(235,244,255,0.85)' }}>
                      {testo}
                    </button>
                  );
                  return <>
                    {b("EQUILIBRIUM · VGI's", true, true)}
                    {b(LC('senza VGI', 'sans VGI', 'no VGI', 'sin VGI', 'utan VGI'), false, false)}
                  </>;
                })()}
                </div>
                )}
                {/* « A che punto sono, e cosa devo fare » — stesso componente e stesso posto del
                    TONE e del MIRROR, col testo di QUESTO ciclo (vedi spiegazioneCiclo). */}
                {/* Anche qui c'era `eegModulesHidden`: col solo meter l'istruzione spariva
                    insieme al resto, e restava un quadrante senza una riga che dicesse cosa
                    fare. `senzaMisura` resta, e per un motivo diverso: là il testo sta GRANDE
                    al centro dello schermo, e ripeterlo qui sotto sarebbe due volte lo stesso. */}
                {sessionState === 'running' && !senzaMisura && (
                  <CycleHint {...spiegazioneCiclo} titolo={senzaNumero(spiegazioneCiclo.titolo)} />
                )}
                {/* ── E I GESTI, quando il ciclo NON avanza da solo ────────────────────────
                    Col SOLO METER `asIsPending` non scatta mai — viene dall'EEG — quindi il
                    quadrante non propone la validazione e il ciclo restava armato per sempre.
                    Sono gli stessi gesti del centro senza strumenti, in versione compatta.
                    Senza strumenti NON si ripetono qui: là stanno al centro, in grande. */}
                {sessionState === 'running' && !senzaMisura
                  && !cycleIsAutomatic(mode, instruments.muse) && comandiManualiCiclo(true)}
              </div>

              {/* ── BARRE MIRROR (vue à part) : item + un SEUL geste (aggancio) + readouts. Ni CONTACT
                  ni NULL ici. */}
              {viewMode === 'mirror' && (
                <div style={{ width: '100%', pointerEvents: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* LA PISTA DEI TEMPI, anche qui. Stava solo nella vista CONTACT/NULL: MIRROR
                      e TONE, che di tempi ne hanno quattro ciascuno, erano proprio i due che
                      ne avevano più bisogno. */}
                  <CycleSteps mode={mode} phase={faseCiclo} lang={lang} />
                  <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
                    {mirrorArmed ? etichettaItem() : (
                    <textarea
                      value={auditingQuestion}
                      onChange={(e) => setAuditingQuestion(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) e.preventDefault(); }}
                      rows={1}
                      placeholder={LC('Item… (o dillo a voce)', 'Item… (ou dis-le à voix)', 'Item… (or say it aloud)', 'Ítem… (o dilo en voz)', 'Item… (eller säg det högt)')}
                      style={{ flex: 1, minWidth: 0, minHeight: 32, maxHeight: 100, padding: '6px 10px', borderRadius: 8,
                        fontSize: 12, lineHeight: 1.4, fontFamily: 'monospace', resize: 'none', overflowY: 'auto',
                        fieldSizing: 'content', background: 'rgba(0,0,0,0.45)',
                        border: '1px solid rgba(255,255,255,0.22)',
                        color: 'rgba(235,244,255,0.92)', outline: 'none' } as React.CSSProperties}
                    />
                    )}
                    {/* ⚠️ CHIEDEVA IL CONTATTO DEGLI ELETTRODI (`museContact`), e senza MUSE
                        restava grigio: il ciclo MIRROR non si poteva proprio cominciare
                        (segnalato). È lo stesso errore di sempre — il ciclo non ha bisogno
                        dell'ago per esistere, ha bisogno di un item. Basta che la seduta
                        giri. */}
                    <button
                      onClick={() => (mirrorArmed ? stopMirror() : armMirror())}
                      disabled={sessionState !== 'running'}
                      style={{ height: 32, padding: '0 14px', borderRadius: 8, flexShrink: 0,
                        cursor: sessionState === 'running' ? 'pointer' : 'not-allowed',
                        fontFamily: 'monospace', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
                        background: mirrorArmed ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.45)',
                        border: `1px solid ${mirrorArmed ? 'rgba(52,211,153,0.75)' : 'rgba(255,255,255,0.3)'}`,
                        color: mirrorArmed ? '#34d399' : 'rgba(235,244,255,0.85)',
                        opacity: sessionState === 'running' ? 1 : 0.4 }}>
                      {/* (c) on VALIDE l'item (obtenu ou non), puis on repart avec un autre item */}
                      {mirrorArmed
                        ? LC('VALIDA', 'VALIDER', 'VALIDATE', 'VALIDAR', 'VALIDERA')
                        : LC('DAI L\'ITEM', 'DONNE L\'ITEM', 'GIVE THE ITEM', 'DA EL ÍTEM', 'GE ITEM')}
                    </button>
                  </div>
                  {(() => {
                    // ITEM COURANT : valeur (figée au contact) → double = cible, % vers la cible.
                    const effR = mirrorDisp.valueR;
                    const doubleR = 2 * effR;
                    const progress = mirrorDisp.locked && mirrorDisp.contactQ > 1e-6 ? Math.min(1, mirrorDisp.dischargeQ / (2 * mirrorDisp.contactQ)) : 0;
                    const chip: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px', borderRadius: 8, fontFamily: 'monospace', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.22)' };
                    const lbl: React.CSSProperties = { fontFamily: 'var(--font-sans)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(226,238,255,0.6)' };
                    return (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        {faseCiclo === 'mirror.say_item' && avvisoVoce}
                        {mirrorArmed && auditingQuestion.trim() && !mirrorDisp.locked && (
                          <div style={chip}><span style={{ fontSize: 12, color: 'rgba(226,238,255,0.7)' }} className="animate-pulse">
                            {LC('contatto della carica…', 'contact de la charge…', 'contacting the charge…', 'contacto de la carga…', 'kontakt med laddningen…')}
                          </span></div>
                        )}
                        {mirrorArmed && mirrorDisp.locked && <>
                          <div style={chip}><span style={lbl}>{LC('valore item', 'valeur item', 'item value', 'valor ítem', 'itemvärde')}</span><span style={{ fontSize: 13, color: 'rgba(240,246,255,0.92)' }}>{effR.toFixed(1)}</span></div>
                          <div style={chip}><span style={lbl}>{LC('cible ×2', 'cible ×2', 'target ×2', 'objetivo ×2', 'mål ×2')}</span><span style={{ fontSize: 13, color: '#fbbf24' }}>{doubleR.toFixed(1)}</span></div>
                          <div style={chip}><span style={lbl}>{LC('smaltito', 'déchargé', 'discharged', 'descargado', 'urladdat')}</span><span style={{ fontSize: 13, color: mirrorDisp.reached ? '#34d399' : 'rgba(240,246,255,0.92)' }}>{Math.round(progress * 100)}%</span></div>
                          {mirrorDisp.reached && <div style={{ ...chip, border: '1px solid rgba(52,211,153,0.6)' }}><span style={{ fontSize: 12, fontWeight: 700, color: '#34d399' }}>{LC('OTTENUTO', 'OBTENU', 'OBTAINED', 'OBTENIDO', 'UPPNÅTT')}</span></div>}
                        </>}
                        {mirrorSession.count > 0 && (
                          <div style={{ ...chip, border: '1px solid rgba(52,211,153,0.45)', background: 'rgba(52,211,153,0.08)' }}>
                            <span style={lbl}>{LC('seduta', 'séance', 'session', 'sesión', 'session')}</span>
                            <span style={{ fontSize: 12, color: 'rgba(240,246,255,0.92)' }}>{mirrorSession.erased}/{mirrorSession.count} {LC('ottenuti', 'obtenus', 'obtained', 'obtenidos', 'uppnådda')} · Σ {mirrorSession.sumV.toFixed(1)} → {LC('doppio', 'double', 'double', 'doble', 'dubbel')} {(2 * mirrorSession.sumV).toFixed(1)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {!senzaMisura && <CycleHint {...spiegazioneCiclo} titolo={senzaNumero(spiegazioneCiclo.titolo)} />}
                </div>
              )}
              {/* ── BARRE TONE SCALE — les QUATRE temps de Ron, un par un ───────────────────────
                  Chaque temps n'offre QUE son geste : on ne peut pas valider une ampleur avant
                  d'avoir dit le signe. Avec le mètre, le bouton que la MESURE propose porte un
                  point — c'est une proposition à vérifier, pas une réponse déjà donnée. */}
              {viewMode === 'tone' && sessionState === 'running' && (() => {
                const bar: React.CSSProperties = { width: '100%', pointerEvents: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' };
                // SELEZIONATO = PASTIGLIA CHIARA, non rossa. Il rosso qui era lo stesso
                // #ff5a5a della CARICA PRESENTE: un segno o un'ampiezza scelti accendevano il
                // colore che nell'app vuol dire tutt'altro. Resta l'AMBRA sul bordo per il
                // valore che la MISURA propone — quello è un avviso, ed è il suo colore.
                const btn = (on: boolean, hint: boolean): React.CSSProperties => ({
                  height: 32, padding: '0 14px', borderRadius: 8, flexShrink: 0, cursor: 'pointer',
                  fontFamily: 'monospace', fontSize: 12, fontWeight: on ? 800 : 700, letterSpacing: '0.06em',
                  background: on ? 'rgba(240,246,255,0.92)' : 'rgba(0,0,0,0.45)',
                  border: `1px solid ${on ? 'rgba(240,246,255,0.95)' : hint ? 'rgba(251,191,36,0.6)' : 'rgba(255,255,255,0.3)'}`,
                  color: on ? '#12141a' : 'rgba(235,244,255,0.85)' });
                // ⚠️ TEMA CHIARO. Questa barra è nata su fondo scuro e ha i suoi colori scritti a
                // mano, quindi il CSS del tema chiaro (lightThemeCss) non la raggiunge: le righe
                // di testo restavano BIANCHE SU BIANCO — il « −20 → +40 » era illeggibile.
                const inchiostro = isLightTheme ? 'rgba(20,22,28,0.88)' : 'rgba(235,244,255,0.85)';
                const inchiostroTenue = isLightTheme ? 'rgba(20,22,28,0.55)' : 'rgba(226,238,255,0.6)';
                const lbl: React.CSSProperties = { fontFamily: 'var(--font-sans)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: inchiostroTenue };
                // Localizzato senza aver nominato la resistenza: il ciclo è fermo al tempo 2.
                const toneAttesaItem = faseCiclo === 'tone.say_item';
                return (
                  <div style={{ ...bar, flexDirection: 'column', alignItems: 'stretch' }}>
                    <CycleSteps mode={mode} phase={faseCiclo} lang={lang} />
                    {/* ── L'ITEM, come negli altri cicli ────────────────────────────────────
                        Mancava: in CONTACT, NULL e MIRROR c'è il campo col bottone a destra, e
                        in TONE si localizzava una resistenza senza poter dire DI CHE COSA
                        (segnalato). Si può scrivere o dire a voce, come altrove. */}
                    {/* ⚠️ IL CAMPO RESTA A SCHERMO PER TUTTO IL CICLO, come in CONTACT e NULL.
                        Prima spariva appena si localizzava, e dalla fase 2 in poi non si vedeva
                        più SU CHE COSA si stava lavorando — segnalato. Si blocca invece di
                        sparire: l'item di un ciclo in corso non si riscrive. */}
                    {(() => {
                      const locabile = tonePhase === 'locate';
                      // ⚠️ IL CAMPO NON SI BLOCCA FINCHÉ L'ITEM È VUOTO.
                      // Bloccarlo appena premuto LOCALIZZA lasciava UNA SOLA via per dare
                      // l'item: la voce. Con la trascrizione non disponibile — capita, e lo
                      // dice il journal — l'item non si poteva più scrivere affatto, e la
                      // resistenza restava senza nome per tutto il ciclo (segnalato).
                      // Un item già dato invece si blocca: non si riscrive un ciclo in corso.
                      const itemModificabile = locabile || !auditingQuestion.trim();
                      return (
                      <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
                        {/* Ciclo avviato con l'item già dato → l'ETICHETTA, come negli altri tre.
                            Il campo resta finché l'item manca: senza trascrizione è l'unico modo
                            di scriverlo. */}
                        {!itemModificabile ? etichettaItem() : (
                        <textarea
                          value={auditingQuestion}
                          onChange={(e) => setAuditingQuestion(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) e.preventDefault(); }}
                          rows={1}
                          placeholder={LC('Item… (o dillo a voce)', 'Item… (ou dis-le à voix)', 'Item… (or say it aloud)', 'Ítem… (o dilo en voz)', 'Item… (eller säg det högt)')}
                          style={{ flex: 1, minWidth: 160, minHeight: 32, maxHeight: 80, padding: '6px 10px', borderRadius: 8,
                            fontSize: 12, lineHeight: 1.4, fontFamily: 'monospace', resize: 'none', overflowY: 'auto',
                            fieldSizing: 'content',
                            background: 'rgba(0,0,0,0.45)',
                            border: '1px solid rgba(255,255,255,0.22)',
                            color: 'rgba(235,244,255,0.92)', outline: 'none' } as React.CSSProperties}
                        />
                        )}
                        {/* ── DA DOVE SI PARTE, quando non c'è un meter a dirlo ───────────
                            Ron: il legame tono↔ohm è arbitrario, conta il TONO. Senza
                            strumento la sorgente è quel che il preclear dichiara più l'obnosi
                            dell'auditor — e allora il punto di partenza si dà a mano, qui,
                            prima di cominciare. Col meter non compare: lo propone la misura.
                            ⚠️ SCALA ESPANSA — segnalato: « devi mettere anche la denominazione
                            con i numeri, devi dare la scala espansa ». Prima solo i tredici di
                            `TONE_LABELS` (quelli scritti sulla colonna, ridotti apposta per non
                            accavallarsi nel disegno — v. `toneLevels.ts`). Un `<select>` non è
                            un disegno: qui il vincolo non vale, e si dà la scala INTERA,
                            `TONE_LEVELS` — sessantadue livelli, ognuno già col suo nome. */}
                        {locabile && !toneHasMeter && (
                          <select value={toneAssessed}
                            onChange={(e) => setToneAssessed(Number(e.target.value))}
                            title={LC('Dove sta il preclear adesso sulla scala', 'Où est le préclair maintenant sur l\'échelle', 'Where the preclear is now on the scale', 'Dónde está el preclear ahora en la escala', 'Var preclearen är nu på skalan')}
                            style={{ height: 32, borderRadius: 8, flexShrink: 0, cursor: 'pointer',
                              maxWidth: 200, padding: '0 8px', fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
                              background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.3)',
                              color: 'rgba(235,244,255,0.85)' }}>
                            {TONE_LEVELS.map(l => (
                              <option key={l.tone} value={l.tone}>
                                {l.tone > 0 ? `+${l.tone}` : `${l.tone}`} · {levelName(l.name, lang)}
                              </option>
                            ))}
                          </select>
                        )}
                        {/* IL GESTO SI CHIAMA COME IL TEMPO. Diceva « LOCALIZZA QUI » o
                            « ASSESSA » mentre la pista e il titolo dicevano « DAI L'ITEM »: il
                            primo tempo aveva due nomi diversi nella stessa schermata, e
                            « assessa » nominava per giunta le fasi che non ci sono più. È lo
                            stesso bottone degli altri tre cicli, e ora lo si vede. */}
                        {locabile && (
                        // ⚠️ `onClick={() => localizzaTone()}`, non più `onClick={localizzaTone}`
                        // (SERENITY, additivo) — `localizzaTone` ha guadagnato un parametro
                        // opzionale (`{ appenaResettato }`, v. `useToneCycle.ts`) per una
                        // correzione TONE di SERENITY; passato DIRETTO come qui, il primo
                        // argomento che riceverebbe davvero è l'evento del click, non
                        // l'opzione — TypeScript lo segnala giustamente («nessuna proprietà in
                        // comune»), ed è per questo che ora c'è un wrapper. Comportamento
                        // INVARIATO: nessun argomento passato, `appenaResettato` resta il suo
                        // default (`false`), esattamente come prima di questo giro.
                        <button style={btn(false, toneHasMeter)} onClick={() => localizzaTone()}>
                          {LC('DAI L\'ITEM', 'DONNE L\'ITEM', 'GIVE THE ITEM', 'DA EL ÍTEM', 'GE ITEM')}
                        </button>
                        )}
                      </div>
                      );
                    })()}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>

                    {/* DA DOVE VIENE IL NUMERO. Un tono ancorato a una reazione del MUSE e uno
                        preso perché non reagiva nulla non valgono la stessa cosa: si scrive. */}
                    {toneAnchor && tonePhase !== 'locate' && (
                      <span style={{ ...lbl, color: toneAnchor.how === 'settled' ? inchiostroTenue : 'rgba(52,211,153,0.85)' }}>
                        {toneAnchor.how === 'muse'
                          ? LC('MUSE ha visto il pensiero', 'le MUSE a vu la pensée', 'the MUSE saw the thought', 'el MUSE vio el pensamiento', 'MUSE såg tanken')
                          : toneAnchor.how === 'meter'
                          ? LC('l\'ago del METER si è mosso', 'l\'aiguille du METER a bougé', 'the METER needle moved', 'la aguja del METER se movió', 'METER-nålen rörde sig')
                          : LC('nessuna reazione — valore stabile', 'aucune réaction — valeur stable', 'no reaction — settled value', 'sin reacción — valor estable', 'ingen reaktion — stabilt värde')}
                        {toneAnchor.ageS > 0.05 ? ` · −${toneAnchor.ageS.toFixed(1)}s` : ''}
                      </span>
                    )}

                    {/* ── SI ASPETTA LA RESISTENZA — UN SOLO GESTO ──────────────────────────
                        Premuto ASSESSA col campo vuoto, comparivano già POSITIVO / NEGATIVO:
                        si sceglieva il segno di una resistenza che nessuno aveva ancora detto
                        (segnalato). Qui c'è il solo gesto del tempo, come negli altri tre
                        cicli — e serve perché la resistenza detta entra nel campo soltanto se
                        la trascrizione funziona. */}
                    {toneAttesaItem && avvisoVoce}
                    {toneAttesaItem && (
                      <button style={btn(false, true)} onClick={dichiaraItemDetto}>
                        {LC('LA RESISTENZA È STATA DETTA', 'LA RÉSISTANCE A ÉTÉ DITE', 'THE RESISTANCE WAS SAID', 'LA RESISTENCIA FUE DICHA', 'MOTSTÅNDET HAR SAGTS')}
                      </button>
                    )}

                    {/* ── I DUE COMANDI, E NIENT'ALTRO ──────────────────────────────────────
                        Qui c'erano POSITIVO / NEGATIVO e le quattro divisioni: due tempi di
                        assessment che i comandi di Ron non prevedono. Restano il tono di
                        partenza (quando c'è il meter), il bottone che conta le ripetizioni e
                        i testimoni. */}
                    {!toneAttesaItem && (tonePhase === 'raise' || tonePhase === 'done') && (
                      <>
                        {/* DA DOVE SI PARTE, E DOVE SI VA. La meta è +40 per tutte le
                            resistenze — non dipende più da quanta carica c'era. */}
                        {/* Senza meter non si scrive un trattino al posto del tono di partenza:
                            attaccato alla riga dell'ancoraggio sembrava parte della frase.
                            Resta la meta, che c'è comunque. */}
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: inchiostro }}>
                          {toneAtStart !== null
                            ? `${toneAtStart > 0 ? '+' : ''}${toneAtStart.toFixed(0)}`
                            : ''}
                          <b style={{ color: '#fbbf24', marginRight: 8,
                                      marginLeft: toneAtStart !== null ? 8 : 0 }}>→ +{TONE_TARGET}</b>
                          <span style={{ opacity: 0.55 }}>
                            {LC('serenità dell\'essere', 'sérénité de l\'être', 'serenity of beingness', 'serenidad del ser', 'varandets stillhet')}
                          </span>
                        </span>
                        {/* ── IL COMANDO, E IL CONTO DELLE VOLTE ────────────────────────────
                            Diceva « RIDÀ IL COMANDO », e appena dato l'item quel « ridà » si
                            confondeva con l'item appena dato: sembrava chiedere di ripetere
                            LUI (segnalato). Adesso il bottone dice QUALE comando è — è lo
                            stesso testo del titolo — e l'icona dice che è una cosa da
                            PRONUNCIARE, non da confermare.

                            Che si ripeta non c'è bisogno di scriverlo sul bottone: sta già
                            nell'istruzione sotto (« ridallo finché non reagisce più »). Ogni
                            pressione conta una passata; il numero va nel journal. */}
                        {tonePhase === 'raise' && (
                          <button style={{ ...btn(false, false), display: 'inline-flex',
                                           alignItems: 'center', gap: 7 }}
                            onClick={() => setToneRipetizioni(v => v + 1)}>
                            <Megaphone size={14} strokeWidth={2} />
                            {LC('PORTALO A TONO 40', 'MÈNE-LE AU TON 40', 'RAISE IT TO TONE 40', 'LLÉVALO AL TONO 40', 'FÖR DET TILL TON 40')}
                            {toneRipetizioni > 0 ? ` ×${toneRipetizioni}` : ''}
                          </button>
                        )}
                        {/* ⚠️ QUI C'ERANO I TESTIMONI — « AGO IN CIMA », « F/N », « CARICA
                            DISSOLTA »: tre spie che si accendevano e, quando due concordavano,
                            facevano pulsare il bottone di validazione.
                            Erano un residuo del vecchio ciclo, dove l'app PROPONEVA l'AS-IS. Il
                            comando di Ron dice un'altra cosa — « ridallo finché non c'è più
                            reazione » — e chi giudica è l'auditor, che sta guardando il
                            preclear, non tre pastiglie accanto a un bottone (segnalato: « non
                            so se sono utili, non credo »).
                            Con loro se n'è andata la proposta automatica: il bottone non pulsa
                            più da sé, e non c'era modo di tenerla senza lasciare a schermo il
                            motivo per cui pulsava. */}
                        {tonePhase === 'raise' && (
                          <button style={btn(false, false)}
                            onClick={() => { chiudiTone(true); setTonePhase('done'); }}>
                            {/* Il traguardo è quello di Ron, detto com'è: il tono quaranta.
                                « Valida l'as-is » nominava il vecchio punto 4, che non c'è più. */}
                            {LC('TONO QUARANTA RAGGIUNTO', 'TON QUARANTE ATTEINT', 'TONE FORTY REACHED', 'TONO CUARENTA ALCANZADO', 'TON FYRTIO NÅDD')}
                          </button>
                        )}
                        {tonePhase === 'done' && (
                          <button style={btn(false, false)} onClick={resetTone}>
                            {LC('ALTRA RESISTENZA', 'AUTRE RÉSISTANCE', 'ANOTHER RESISTANCE', 'OTRA RESISTENCIA', 'ANNAT MOTSTÅND')}
                          </button>
                        )}
                      </>
                    )}

                    {tonePhase !== 'locate' && (
                      <button style={{ ...btn(false, false), border: '1px solid rgba(255,255,255,0.18)', opacity: 0.7 }}
                        onClick={() => { if (tonePhase === 'raise') chiudiTone(false); resetTone(); }}>
                        {LC('ANNULLA', 'ANNULER', 'CANCEL', 'CANCELAR', 'AVBRYT')}
                      </button>
                    )}

                    {!toneHasMeter && (
                      <span style={{ ...lbl, color: 'rgba(251,191,36,0.8)' }}>
                        {LC('senza meter — si assessa', 'sans mètre — on assesse', 'off-meter — assessed', 'sin medidor — se assessa', 'utan mätare — assessas')}
                      </span>
                    )}

                    </div>

                    {/* Il testo del ciclo sta in `spiegazioneCiclo`, insieme a quello di
                        CONTACT, NULL e MIRROR: stesso posto, stesso aspetto, un componente solo
                        (vedi CycleHint). Prima era qui dentro, e solo il TONE ce l'aveva. */}
                    {!senzaMisura && <CycleHint {...spiegazioneCiclo} titolo={senzaNumero(spiegazioneCiclo.titolo)} />}
                  </div>
                );
              })()}
              {/* CYCLE STATUS BAR — comm lag / % diss / AS-IS? validate. Masquée en MIRROR et en
                  TONE (vues à part, sans CONTACT/NULL — demande utilisateur). */}
              {viewMode !== 'mirror' && viewMode !== 'tone' && sessionState === 'running' && (
                <CycleStatusBar armed={cycleArmed} manualReady={manualReady}
                  asIsFalse={asIsFalse} deltaStar={deltaStar} deltaStarN={deltaStarN}
                  isLightTheme={isLightTheme} signalOk={museContact}
                  cycleKind={cycleKind}
                  nullSinceMock={nullSinceMock} noReadSignal={noReadSignal}
                  taBase={pcSex === 'm' ? 3.0 : 2.0} taAtNullStart={taAtNullStart} />
              )}
              {/* NEEDLE REACTION — relocated to the TOP data-stack (always clear). The
                  dial now sits over the needle, so the QuantumSphere's own SF/FALL/F/N
                  labels (y≈540/610) ended up hidden behind the opaque dial backdrop.
                  Fixed height → the row never jumps. Source = needleReactionKey (already
                  hold-gated), same short codes the needle used. */}
              <div style={{ height: reazioniViste === 'both' ? 52 : 28, marginTop: 14, display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', pointerEvents: 'none' }}>
                {/* MUSE PERDU : s'il s'est déconnecté et ne revient PAS après un délai raisonnable,
                    on le dit ICI — devant l'arc des réactions — pour que l'auditeur le VOIE (demande
                    utilisateur). Prioritaire sur l'étiquette de réaction : sans casque il n'y a plus
                    de réaction valable de toute façon. */}
                {sessionState === 'running' && museLostLong ? (
                  <span className="animate-pulse" style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 18, letterSpacing: '0.1em', color: '#fbbf24', textShadow: '0 0 12px rgba(251,191,36,0.45)' }}>
                    <AlertTriangle size={18} strokeWidth={2.2} />
                    {LC('MUSE SCONNESSO', 'MUSE DÉCONNECTÉ', 'MUSE DISCONNECTED', 'MUSE DESCONECTADO', 'MUSE FRÅNKOPPLAD')}
                  </span>
                ) : sessionState === 'running' && (() => {
                  // STUCK intentionally omitted (not useful — user request). LONG FALL spelled out.
                  const RLBL: Record<string, string> = { reaction_fn: 'F/N', reaction_blow_down: 'LF BD', reaction_long_fall: 'LONG FALL', reaction_fall: 'FALL', reaction_sf: 'SF', reaction_dirty: 'DN' };
                  // ── DI QUALE AGO SONO QUESTE REAZIONI ───────────────────────────────────────
                  // Prima l'EEG aveva la PRECEDENZA e il meter parlava solo quando l'EEG taceva:
                  // con l'ago del METER a schermo comparivano quindi le reazioni del MUSE, e non
                  // c'era modo di sapere che venivano dall'altro strumento. In seduta confonde.
                  //
                  // Adesso per difetto si vedono SOLO quelle dell'ago che si sta guardando, e con
                  // due strumenti c'è un selettore a tre voci. In ENTRAMBI le due righe stanno
                  // una sopra l'altra con la sigla a sinistra: METER in ambra (il suo colore, lo
                  // stesso del journal), MUSE in bianco.
                  const lblMuse = instruments.muse ? (RLBL[needleReactionKey] || '') : '';
                  const lblMeter = instruments.theta ? (RLBL[thetaReactionKey] || '') : '';
                  const riga = (sigla: string, testo: string, col: string, alone: string) => (
                    <span key={sigla} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, lineHeight: 1.1 }}>
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9, letterSpacing: '0.1em',
                        color: col, opacity: 0.6, width: 40, textAlign: 'right' }}>{sigla}</span>
                      <span style={{ fontWeight: 400, fontSize: 20, letterSpacing: '0.14em', color: col,
                        textShadow: `0 0 12px ${alone}` }}>{testo}</span>
                    </span>
                  );
                  const BIANCO = 'rgba(255,255,255,0.92)', BIANCO_A = 'rgba(255,255,255,0.35)';
                  const AMBRA = '#f59e0b', AMBRA_A = 'rgba(245,158,11,0.45)';
                  if (reazioniViste === 'both') {
                    if (!lblMuse && !lblMeter) return null;
                    return (
                      <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
                        {lblMuse ? riga('MUSE', lblMuse, BIANCO, BIANCO_A) : null}
                        {lblMeter ? riga('METER', lblMeter, AMBRA, AMBRA_A) : null}
                      </span>
                    );
                  }
                  // una sola sorgente: nessuna sigla, la scritta da sola come è sempre stato
                  const solo = reazioniViste === 'theta' ? lblMeter : lblMuse;
                  if (!solo) return null;
                  const col = reazioniViste === 'theta' ? AMBRA : BIANCO;
                  const alone = reazioniViste === 'theta' ? AMBRA_A : BIANCO_A;
                  return <span style={{ fontWeight: 400, fontSize: 20, letterSpacing: '0.14em', color: col, textShadow: `0 0 12px ${alone}` }}>{solo}</span>;
                })()}
              </div>
              <style>{`@keyframes reactFadeIn { from { opacity:0; transform: translateY(-4px);} to { opacity:1; transform: translateY(0);} }`}</style>
            </div>

            {/* ── ARC CONCENTRIQUE — en MIRROR : l'échelle 1–10 (MirrorDial) À LA PLACE du ClearDial
                (cycle CONTACT/DISSOLUTION/AS-IS), aligné avec l'aiguille. Sinon : le ClearDial. */}
            {/* Anche questi sono ARCHI, e senza ago non hanno nulla da mostrare: sparivano
                insieme al quadrante principale, non da soli. */}
            {/* ── LA SCALA DEL TONO, IN VERTICALE, ACCANTO ALL'ARCO ─────────────────────
                Due mestieri, non due quadranti in concorrenza: l'ARCO è la reazione (che cosa
                succede adesso — lo legge l'auditor), la COLONNA è la posizione sulla scala di
                Ron (dove sta il caso — la legge il preclear).

                E si muovono INSIEME: tono = 40 − 80·(R/R_totale), quindi resistenza che scende
                = tono che sale, e una caduta dell'ago È resistenza che scende. L'ago verso
                destra e la colonna verso l'alto sono lo stesso evento. La colonna sta a destra
                apposta: comincia dove l'arco finisce, all'estremo della liberazione. */}
            {/* PIÙ IN BASSO: in alto a destra ci sono TONE ARM, DIAGNOSTIC, ASSESS ed EP.
                La colonna partiva dal 6% e ci finiva sopra (segnalato). Comincia sotto di
                loro — e ci guadagna anche il senso: la scala nasce dove l'arco si chiude. */}
            {/* ⚠️ COMPARE ANCHE SENZA STRUMENTI. Prima no, e senza strumenti la vista TONE
                restava senza la sua scala — proprio nel caso in cui è l'unico riferimento che
                l'auditor ha: il tono lo dichiara lui, e deve poter vedere dove l'ha messo e
                quanto manca al 40. */}
            {viewMode === 'tone' && sessionState === 'running' && (
              <div className="absolute pointer-events-none"
                   // PIÙ CORTA ANCORA: aprendo DIAGNOSTIC i suoi dati finivano sopra la
                   // colonna (segnalato). Comincia sotto di loro e finisce più in alto — e
                   // siccome il viewBox si è accorciato con lei, i caratteri non rimpiccioliscono.
                   style={{ right: 12, top: '38%', bottom: '14%', width: 260, zIndex: LAYER.sphereChrome }}>
                <ToneColumn
                  // IL TONO ANCORATO AL CICLO, non più il valore assoluto del meter.
                  tone={toneOra ?? 0}
                  // Il secondo sguardo: la stessa salita letta sull'EEG. Compare col MUSE.
                  toneEeg={toneOraEeg}
                  // Le divisioni tolte dal margine: si scrivono, se no è una correzione muta.
                  margin={margineTono}
                  // ⚠️ `toneMisurato`, non `toneHasMeter` — la stessa priorità « MUSE se c'è,
                  // altrimenti Meter, altrimenti dichiarato » (v. `useToneCycle.ts`) ora può
                  // guidare `toneOra` anche senza Theta-Meter: `toneHasMeter` da solo
                  // lascerebbe il disegno vuoto in quel caso (`ToneDial`/`ToneColumn` non
                  // disegnano nulla se `hasMeter` è falso).
                  hasMeter={toneMisurato}
                  // I nomi dei livelli si traducono come tutto il resto: il preclear legge la
                  // sua posizione sulla scala, e in una lingua che non parla non serve.
                  lang={lang}
                  // LA CARICA DEL MUSE, se c'è: quanta ce n'è adesso, come barretta a parte.
                  // Non è un tono — è l'altra sorgente, e sta separata per non confonderle.
                  charge={instruments.muse ? Math.max(0, Math.min(1, metricsStore.get().qL)) : null}
                  // Il tono di PARTENZA del ciclo: il segmento fra i due dice se si sale o si scende.
                  chargeFrom={toneAtStart}
                />
              </div>
            )}

            {!senzaMisura && (
            <div className="absolute inset-0 z-40 pointer-events-none">
              {viewMode === 'tone' ? (
                // ⚠️ `toneMisurato`, non `toneHasMeter` — v. la nota sopra su `ToneColumn`.
                <ToneDial tone={toneOra ?? 0} hasMeter={toneMisurato} approx
                  located={toneAtStart}
                  phase={tonePhase} toneAtStart={toneAtStart}
                  isLightTheme={isLightTheme} />
              ) : viewMode === 'mirror' ? (
                <MirrorDial armed={mirrorArmed} valueR={mirrorDisp.valueR} contactQ={mirrorDisp.contactQ} dischargeQ={mirrorDisp.dischargeQ}
                  locked={mirrorDisp.locked} reached={mirrorDisp.reached} isLightTheme={isLightTheme} lang={lang} />
              ) : (
                <ClearDial armed={cycleArmed} asIsPending={asIsPending} manualReady={manualReady} asIsFalse={asIsFalse} asIsIO={asIsIO} onValidate={validateAsIs} deltaStar={deltaStar} deltaStarN={deltaStarN} isLightTheme={isLightTheme}
                  cycleKind={cycleKind} nullPhase={nullPhase} />
              )}
            </div>
            )}

            {/* ── L'ASSESSMENT SOTTO L'ARCO È STATO TOLTO ────────────────────────────────
                Scriveva le parole assessate dentro il quadrante, sotto la scritta DISSOLUTION.
                Due difetti, e il secondo è quello che conta:

                  • si SOVRAPPONEVA alle indicazioni del ciclo, e non si leggeva più né l'una
                    né l'altra cosa (segnalato);
                  • era RIDONDANTE — le stesse parole, con le stesse letture, stanno nel modulo
                    ASSESSMENT a destra, dove restano per tutta la seduta invece di sparire
                    dopo cinque secondi.

                Il centro del quadrante appartiene all'ago e a quel che l'auditor deve fare.
                Gli item si leggono a destra. ── */}

            {/* ══ LA BARRA DEI COMANDI — IN BASSO, A TUTTA LARGHEZZA ═══════════════════════
                Stava in alto a sinistra, incolonnata sopra la barra del ciclo: fra il testo
                della spiegazione, il comm lag e il bottone AS-IS si contendevano la stessa
                fascia, e ogni riga aggiunta li faceva accavallare di nuovo. Terza volta che
                spostavo qualcosa in quell'angolo.

                Adesso c'è una divisione netta, e non è solo questione di posto: IN ALTO SI
                LEGGE (ago, TA, comm lag, a che punto sei), IN BASSO SI AGISCE. A tutta larghezza
                le etichette ci stanno per esteso — « ENTRAMBI » non va più abbreviato in « DUE ».

                ── IL MNA STA QUI MA NON È UN MODO ──────────────────────────────────────────
                È separato da un divisore, ed è voluto. Il MNA non ha fasi né una fine: è un
                ATTREZZO, e lo si usa DENTRO gli altri cicli — si vuole poter fare un SONIFY
                mentre un CONTACT gira. Farne un modo avrebbe chiuso il ciclo per suonare un
                tono. Cliccandolo apre il suo pannello sopra la barra, e il ciclo continua. */}
            {sessionState === 'running' && (
              <div className="absolute pointer-events-auto"
                style={{ left: 10, right: 10, bottom: 6, zIndex: LAYER.dock, display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1, display: 'flex', padding: 3, gap: 3, borderRadius: 999,
                  background: TOKEN.wellBg,
                  boxShadow: TOKEN.wellShadow }}>
                  {modiDisponibili.map(m => {
                    const META: Record<SessionMode, { lbl: string; title: string }> = {
                      contact: { lbl: 'CONTACT',
                        title: LC('CONTACT → DISSOLUZIONE → AS-IS', 'CONTACT → DISSOLUTION → AS-IS', 'CONTACT → DISSOLUTION → AS-IS', 'CONTACT → DISOLUCIÓN → AS-IS', 'CONTACT → UPPLÖSNING → AS-IS') },
                      null: { lbl: 'NULL',
                        title: 'NULL → RISE (mock-up) → EQUILIBRIUM' },
                      mirror: { lbl: 'MIRROR',
                        title: LC('MIRROR — metodo del doppio (Ron)', 'MIRROR — méthode du double (Ron)', 'MIRROR — the doubling method (Ron)', 'MIRROR — método del doble (Ron)', 'MIRROR — dubbelmetoden (Ron)') },
                      tone: { lbl: 'TONE SCALE',
                        title: LC('TONE SCALE — la scala del tono di Ron (−40…+40)', 'TONE SCALE — l\'échelle des tons de Ron (−40…+40)', 'TONE SCALE — Ron\'s tone scale (−40…+40)', 'TONE SCALE — la escala del tono de Ron (−40…+40)', 'TONE SCALE — Rons tonskala (−40…+40)') },
                      truth: { lbl: 'TRUTH',
                        title: LC('TRUTH — il protocollo di Ron: localizza il R/I, chiedi cos\'è la verità', 'TRUTH — le protocole de Ron : localise le R/I, demande ce qui est la vérité', 'TRUTH — Ron\'s protocol: locate the R/I, ask what is the truth', 'TRUTH — el protocolo de Ron: localiza el R/I, pregunta qué es la verdad', 'TRUTH — Rons protokoll: lokalisera R/I, fråga vad som är sanningen') },
                      // APERTO, non « libero ». « Libero » suonava come « senza regole »; il modo
                      // è invece EQUILIBRIUM che gira SENZA SEQUENZA CICLICA PREDEFINITA — l'ago,
                      // l'assessment e l'R&I ci sono tutti, manca solo il ciclo che li incatena.
                      free: { lbl: LC('APERTO', 'OUVERT', 'OPEN', 'ABIERTO', 'ÖPPEN'),
                        title: LC('Senza sequenza ciclica predefinita. L\'ago, l\'assessment e l\'R&I restano attivi.', 'Sans séquence cyclique prédéfinie. L\'aiguille, l\'assessment et le R&I restent actifs.', 'No predefined cyclic sequence. The needle, assessment and R&I stay active.', 'Sin secuencia cíclica predefinida. La aguja, el assessment y el R&I siguen activos.', 'Utan fördefinierad cyklisk sekvens. Nålen, assessment och R&I förblir aktiva.') },
                    };
                    const seg = META[m];
                    const active = mode === m;
                    // Cambiando metodo NON si porta dietro il ciclo di prima: si chiude, altrimenti
                    // resterebbe armato dietro un quadrante che non lo mostra più.
                    const vai = () => { if (cycleArmed) finalizeCycle(false); if (mirrorArmed) stopMirror(); resetTone(); resetTruth(); setMode(m); };
                    return (
                      <button key={m} type="button" onClick={vai} title={seg.title}
                        // ── MONOCROMO: IL METODO NON È UN COLORE ────────────────────────
                        // Erano cinque tinte, una per metodo. Due erano già prese da altro:
                        // TONE portava #ff5a5a, che nell'app vuol dire CARICA PRESENTE, e
                        // MIRROR #34d399, che vuol dire TRAGUARDO RAGGIUNTO. Un rosso fisso
                        // in basso a destra diceva « carica » per tutta la seduta — quindi
                        // non lo diceva più. Il metodo in corso si dice con la PASTIGLIA
                        // CHIARA e il testo scuro; il colore resta alla carica e all'ambra
                        // dell'avviso (docs/refonte-fasi.md §2).
                        style={{ flex: 1, height: 30, borderRadius: 999, border: 'none', cursor: 'pointer',
                          fontSize: 11, fontWeight: active ? 800 : 700, letterSpacing: '0.06em', whiteSpace: 'nowrap',
                          color: active ? '#12141a' : (isLightTheme ? '#3a3a40' : '#cbd5e1'),
                          background: active ? (isLightTheme ? '#f2f3f6' : 'rgba(240,246,255,0.92)') : 'transparent',
                          boxShadow: active ? '0 2px 6px rgba(0,0,0,0.35)' : 'none', transition: 'color 0.2s, background 0.2s' }}>
                        {seg.lbl}
                      </button>
                    );
                  })}
                </div>

                {/* IL DIVISORE: di qua i METODI, di là l'ATTREZZO. */}
                {moduleVis.mna && instruments.muse && (
                  <>
                    <span style={{ width: 1, height: 22, background: isLightTheme ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.18)', flexShrink: 0 }} />
                    <button type="button" onClick={() => setMnaAperto(v => !v)}
                      title={LC('MNA — modulazione neuro-acustica. Si apre SENZA lasciare il ciclo in corso.',
                                'MNA — modulation neuro-acoustique. S\'ouvre SANS quitter le cycle en cours.',
                                'MNA — neuro-acoustic modulation. Opens WITHOUT leaving the running cycle.',
                                'MNA — modulación neuro-acústica. Se abre SIN dejar el ciclo en curso.',
                                'MNA — neuroakustisk modulering. Öppnas UTAN att lämna pågående cykel.')}
                      style={{ height: 30, padding: '0 18px', borderRadius: 999, cursor: 'pointer', flexShrink: 0,
                        fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                        background: mnaAperto ? '#a78bfa' : 'transparent',
                        border: `1px solid ${mnaAperto ? '#a78bfa' : (isLightTheme ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.22)')}`,
                        color: mnaAperto ? '#0b0f14' : (isLightTheme ? '#3a3a40' : '#cbd5e1') }}>
                      MNA
                    </button>
                  </>
                )}
              </div>
            )}

            {/* MNA — absolute at sphere bottom */}
            {sessionState === 'running' && moduleVis.mna && mnaAperto && (
              <MnaPanel
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
                onCapture={() => {
                  // Lock onto the PEAK I_m of the recent ~3 s window (and the
                  // frequency measured at that peak) — the auditor/PC may react
                  // a beat late, so the instant of the click is not the strongest
                  // response. (Window lives in engine/PrimeFreqTracker.)
                  const best = primeFreqTracker.peak();
                  if (!best) return;
                  setPrimeIm(best.im);
                  setPrimeFd(best.fd);
                  setPrimePStar(best.ps);
                  setPrimeDelta(best.dv);
                  setPrimeZone(best.zone);
                  mnaSessionRef.current.finalZone = best.zone;
                }}
                onAudio={(payload) => {
                  // Relay the neuro-acoustic action to the PC so the binaural tone
                  // plays in the PC's OWN headphones (the sonification targets the
                  // PC's brain — the auditor only hears it locally for monitoring).
                  try { networkManager.send({ type: 'MNA_AUDIO', ...payload }, true); } catch (_) {}
                }}
                onHide={() => setModuleVis(v => ({...v, mna: false}))}
                t={t as (key: string) => string}
              />
            )}

          </div>{/* END absolute inset-0 sphere content */}

            </>}{/* END sphere content */}

          </div>{/* END sphere panel */}

         {/* RIGHT: PC cam top, Auditor cam bottom — half height, R&I zone + config below */}
          {(moduleVis.cam1 || moduleVis.cam2 || moduleVis.ri || moduleVis.biometric) && (
          <div className="sm-glass w-48 xl:w-64 flex-shrink flex flex-col gap-2 h-full min-h-0" style={{ minWidth: 120, ...scenePerspective('50%', '28%') }}>
            {/* Cams: occupano metà altezza */}
            {(moduleVis.cam1 || moduleVis.cam2) && (
            <div className="flex flex-col gap-2 flex-1 min-h-0" style={scenePerspective('50%', '28%')}>

              {/* --- CAM 2 (PC) --- */}
              {moduleVis.cam2 && (
              <div className={cn('overflow-hidden transition-all', cam2Visible ? 'flex-1' : 'h-8 flex-none')}
                style={glassSurface('right', isLightTheme)}>
                <CameraFeed
                  title={appMode === 'auditor' && remoteStream ? `${t('cam2')} · PC` : t('cam2')}
                  isVisible={cam2Visible}
                  onToggle={() => setCam2Visible(!cam2Visible)}
                  onDisable={() => setModuleVis(v => ({...v, cam2: false}))}
                  // In auditor mode: show participant's remote camera; in local mode: local camera
                  externalStream={appMode === 'auditor' ? (remoteStream ?? null) : undefined}
                  // Satellite (co-located): mute the PC's audio playback (auditor hears
                  // them directly in the room) — kills Larsen; Whisper still transcribes.
                  forceMuted={satelliteMode}
                  // CONN-33: relayed JPEG frames when WebRTC video failed.
                  fallbackFrame={appMode === 'auditor' && videoFallbackActive ? remoteVideoFrame : undefined}
                  bpm={sessionState === 'running' && museConnection === 'connected' ? (displayBpm || undefined) : undefined}
                  massStatus={
                    appMode === 'auditor'
                      ? (isConnected
                          // SATELLITE : le MUSE est sur le MAC (museConnection) — pas un MUSE distant.
                          ? (satelliteMode
                              ? (museConnection === 'connected' ? '🧠 MUSE ✓' : t('conn_muse_preclear_disconnected') as string)
                              : (remoteMuseConnected ? `🧠 MUSE Preclear ✓  🔋${remoteBatteryLevel?.toFixed(0) ?? '--'}%` : t('conn_muse_preclear_disconnected') as string))
                          : t('conn_auditor_preclear_waiting') as string)
                      : (sessionState !== 'running' ? t('status_waiting') :
                          asIsnessState === 'ep' ? t('status_asisness_reached') :
                          isFnActive ? t('status_mass_locked') :
                          (metricsStore.get().vProc > 0 ? t('status_processing_mass') : t('status_searching_mass')))
                  }
                  hideOverlay={false}
                />
              </div>
              )}
              {moduleVis.cam1 && (
              <div className={cn('overflow-hidden transition-all', cam1Visible ? 'flex-1' : 'h-8 flex-none')}
                style={glassSurface('right', isLightTheme)}>
                <CameraFeed
                  title={t('cam1')}
                  isVisible={cam1Visible}
                  onToggle={() => setCam1Visible(!cam1Visible)}
                  onDisable={() => setModuleVis(v => ({...v, cam1: false}))}
                  hideOverlay={true}
                  lang={lang}
                />
              </div>
              )}
            </div>
            )}

            {/* Module ASSESSMENT (ex R&I) — mots donnés à voix haute + leur READ, TOUTE la séance. */}
            {moduleVis.ri && (
              <AssessmentPanel
                openSignal={assessOpenSignal}
                items={assessSession}
                onHide={() => setModuleVis(v => ({...v, ri: false}))}
                t={t as (key: string) => string}
                readMeta={ASSESS_READ_META}
                onIndica={segnaIndicazione}
                onAggiungiItem={aggiungiItemManuale}
                cercaLettura={cercaLetturaPerParola}
                dueAghi={instruments.muse && instruments.theta}
              />
            )}

            {/* Biometric Integrity Bar — below R&I */}
            {moduleVis.biometric && (
              <BiometricPanel
                smoothPct={smoothPct}
                museConnection={museConnection}
                sessionState={sessionState}
                onHide={() => setModuleVis(v => ({...v, biometric: false}))}
                t={t as (key: string) => string}
                panelStyle={panelStyle}
              />
            )}
          </div>
          )}
        </div>



      </div>

      {/* Post-Session Report Overlay */}
      {metabolicOpen && (() => {
        // SÉANCE À DISTANCE (full P2P) : c'est le PRÉCLAIR qui porte le MUSE. Le contrôle
        // respiration doit se baser sur le MUSE DISTANT (remoteMuseConnected), pas sur le MUSE
        // LOCAL de l'auditeur (inexistant) — sinon l'app réclame en boucle un MUSE côté auditeur
        // et ne démarre jamais proprement (seul le gyro, alimenté à part, réagissait).
        // Local / satellite (co-localisé) : le Mac porte le MUSE → on garde le MUSE local.
        const remoteAuditor = appMode === 'auditor' && isConnected && !satelliteMode;
        const readinessMuseOk = remoteAuditor ? remoteMuseConnected : (museConnection === 'connected');

        // ── SOLO BOÎTES: prontezza con le prove del METER, non col respiro guidato ─────────
        // Senza EEG la timeline del respiro del Muse non ha nulla da valutare. Le due prove
        // sono quelle della procedura: stretta (un terzo di quadrante, fissa la sensibilità) e
        // respiro fino a ottenere almeno una FALL al rilascio — se non arriva, il metabolismo
        // del preclear non è a posto, ed è proprio ciò che questa schermata deve accertare.
        // ── CON TUTTI E DUE, LE BOÎTES VENGONO PRIMA ────────────────────────────────────
        // Prima questa schermata compariva solo SENZA Muse, e con i due strumenti insieme la
        // prova della stretta si saltava del tutto: la sensibilità dell'ago restava quella di
        // fabbrica, e le reazioni vere finivano dieci volte sotto la soglia (misurato in
        // seduta). Le due prove non si sostituiscono — quella del Muse guarda il metabolismo,
        // questa tara l'ago — quindi si fanno tutte e due, le boîtes per prime perché sono un
        // gesto solo, e il respiro guidato viene dopo.
        if (theta.status === 'connected' && !thetaReadyDone) {
          return (
            <ThetaReadyCheck
              scaleMeasured={theta.setup.scaleMeasured}
              breathOk={theta.breathOk}
              squeezeOk={theta.squeezeOk}
              testing={theta.testing}
              peakOffset={theta.testPeakOffset}
              // ⚠️ IL TA SI PRENDE QUI, prima che la stretta lo muova: è il riposo in questa
              // configurazione, e la coppia dei due riposi è lo scarto che si cerca.
              startSqueezeTest={() => {
                const ta = theta.ta;
                if (ta !== null) {
                  setProvaTa(p => theta.setup.config === 'two-cans'
                    ? { ...p, two: ta } : { ...p, solo: ta });
                }
                theta.startSqueezeTest();
              }}
              startBreathTest={theta.startBreathTest}
              sensTrim={theta.setup.sensTrim}
              setSensTrim={theta.setSensTrim}
              config={theta.setup.config}
              setConfig={theta.setConfig}
              // Misurato lo scarto, l'invito a fare la prova a due lattine non serve più.
              soloOffsetMisurato={(theta.setup.offsets?.['solo-can'] ?? 0) !== 0}
              taTwo={provaTa.two}
              taSolo={provaTa.solo}
              onApplySoloOffset={(off) => theta.setSoloOffset(off)}
              unknownFormat={theta.unknownFormat}
              rawSamples={theta.rawSamples}
              // Col Muse collegato si passa alla SUA prova; da soli si parte e basta.
              onProceed={() => {
                setThetaReadyDone(true);
                if (!readinessMuseOk) { setMetabolicOpen(false); void handleStart(); return; }
                // Il Muse ha già misurato sullo stesso respiro? Allora non si rifà: si prende
                // il suo giudizio e si parte. Se invece non ha raccolto abbastanza (casco tolto,
                // contatto assente), si passa alla sua prova completa invece di inventarne uno.
                if (metabolicBaseline.nBaseline() >= METAB_MIN_SAMPLES) {
                  const a = metabolicBaseline.assess();
                  setMetabAssessment(a);
                  logBufferRef.current.push({ time: 0, speaker: 'SYS',
                    text: LC('Prontezza MUSE presa sullo stesso respiro delle lattine',
                             'État de préparation MUSE pris sur le même souffle que les boîtes',
                             'MUSE readiness taken from the same breath as the cans',
                             'Preparación MUSE tomada en el mismo soplo que las latas',
                             'MUSE-beredskap tagen på samma andetag som burkarna'), type: 'normal' });
                  closeMetabolic();
                  void handleStart();
                }
              }}
              onCancel={() => setMetabolicOpen(false)}
            />
          );
        }

        return (
        <MetabolicCheck
          lang={lang}
          meterAlreadyCalibrated={instruments.theta && theta.setup.scaleMeasured}
          museConnected={readinessMuseOk}
          museWorn={museContact}
          museConnecting={remoteAuditor ? false : (museConnection === 'searching')}
          onConnectMuse={remoteAuditor ? undefined : handleConnectMuse}
          onPhase={(p) => { metabolicPhaseRef.current = p; }}
          onCue={(phase, inhale, assessment) => {
            // À distance : diffuse au préclair l'écran « Prêt pour la séance » complet — phase,
            // inspir/expir ET l'évaluation (contact/calme/cœur/réactivité) pour ses readouts.
            if (appModeRef.current === 'auditor') { try { networkManager.send({ type: 'READINESS', open: true, phase, inhale, assessment }, false); } catch (_) {} }
          }}
          onProceed={(a) => { if (a) setMetabAssessment(a); closeMetabolic(); handleStart(); }}
          onCancel={(a) => { if (a) setMetabAssessment(a); closeMetabolic(); handleStart(); }}
        />
        );
      })()}

      {showReport && (
        <Suspense fallback={null}>
        <PostSessionReport
          history={[...sessionRecorder.chart]}
          csvData={sessionRecorder.csv}
          logs={logs}
          mass={displayMass}
          startTime={sessionStartTime}
          endTime={sessionEndTime}
          auditorName={auditorName}
          pcName={pcName}
          pcPhoto={pcPhoto}
          auditorPhoto={activeProfile?.photo}
          isSoloSession={isSoloSession}
          noInstruments={senzaStrumenti}
          sessionObjective={sessionObjective}
          sessionProcessObjective={sessionProcessObjective}
          sessionPhysicalCheck={sessionPhysicalCheck}
          sessionBriefing={sessionBriefing}
          reactions={[...sessionRecorder.reactions]}
          totalTa={metricsStore.get().totalTa}
          massTime={tzoneStore.get().massSec}
          dissolutionTime={tzoneStore.get().dissolutionSec}
          avgReleaseVel={tzoneStore.avgReleaseVel()}
          relVelBaseline={velocityTracker.getBaseline()}
          dissolvedPctMass={Math.round(tzoneStore.dissolvedFracByMass() * 100)}
          massChargeQ={tzoneStore.get().massChargeQ}
          dissChargeQ={tzoneStore.get().dissChargeQ}
          auditingCycles={auditingCyclesRef.current}
          mirrorCycles={mirrorCyclesRef.current}
          toneCycles={toneCyclesRef.current}
          // ── LA PROVA DELLE LATTINE NEL RAPPORTO ────────────────────────────────────
          // Fatta o non fatta, e con che scarto: è la condizione in cui TUTTI i numeri della
          // seduta sono stati letti. Senza, a freddo non si sa se quel TA valeva.
          cansTest={{
            done: testedToday(canHistory, Date.now()),
            config: theta.setup.config,
            soloOffset: theta.setup.offsets?.['solo-can'] ?? 0,
            taMargin: taMostrato?.margin ?? 0,
            hasMeter: theta.status === 'connected',
          }}
          assessCycles={assessCyclesRef.current}
          deltaStar={deltaStar}
          deltaStarN={deltaStarN}
          deltaTrend={deltaTrend}
          deltaBaseline={deltaBaseline}
          deltaAdaptive={deltaAdaptive}
          breathReactivity={metabAssessment?.reactivity}
          breathContactPct={metabAssessment?.contactVal}
          breathBpm={metabAssessment?.bpmVal ?? undefined}
          epValidated={epValidated}
          epCognitionText={epCognitionText}
          epAuditorNote={epAuditorNote}
          epReactionType={epReactionType}
          epRealization={epRealization}
          epDurationMin={epDurationMin}
          epVgi={epVgi}
          epVvgi={epVvgi}
          epTimestamp={epTimestamp}
          profileId={activeProfile?.id || '_default'}
          mnaData={mnaSessionRef.current}
          onOpenHistory={() => {
            setShowReport(false);
            setShowHistoryModal(true);
          }}
          onClose={() => {
            setShowReport(false);
            // La scelta « senza strumenti » vale per UNA seduta: chiuso il rapporto, la
            // prossima riparte da una scelta pulita. Senza questo restava incollata, e il
            // badge non si poteva deselezionare perché commuta solo a seduta ferma.
            setSenzaStrumenti(false); senzaStrumentiRef.current = false;
          }}
          onSaveSession={(summary) => {
            // Si aucun profil actif, créer/utiliser un profil par défaut pour ne pas perdre la session
            const profileId = activeProfile?.id || '_default';
            if (!activeProfile) {
              console.warn('Aucun profil actif — sauvegarde dans le profil _default');
              try {
                saveProfile({
                  id: '_default',
                  name: auditorName || pcName || 'Default',
                  isPlaceholder: true,
                  createdAt: Date.now(),
                  preferences: {} } as any);
              } catch (e) { console.error('Profil par défaut non créé:', e); }
            }
            const sessionToSave = {
              ...summary,
              profileId,
              totalTa: metricsStore.get().totalTa };
            saveSession(sessionToSave);
            clearSessionDraft(); // R3: session safely saved → drop the recovery draft
            // « Salva ed esci »: il salvataggio è QUESTO. Si esce ora che è fatto, non prima.
            if (quitAfterSaveRef.current) quitNow();
            console.log('[HISTORY] Session saved locally:', sessionToSave.id);
            // FIX SYNC #2: push to server is async-await with retry. The
            // previous fire-and-forget could lose the push if the app was
            // closed/crashed before the promise settled. We also persist a
            // "pending push" flag in localStorage so a retry happens at the
            // next boot if this attempt fails.
            (async () => {
              try {
                const up = await isServerAvailable();
                if (!up) {
                  localStorage.setItem('nest_sessions_pending_push', '1');
                  console.warn('[HISTORY] Server unreachable — marked for retry on next boot');
                  return;
                }
                // FIX QUOTA-LOSS: saveSession() above silently fails when
                // localStorage is FULL (sessions embed base64 photos → quota is
                // real). Its warn says "kept for server sync only", but this push
                // re-read getSessions() from the same full localStorage — the new
                // session was MISSING from the payload and was lost everywhere.
                // Guarantee the just-ended session is in the push regardless.
                const allSessions = getSessions() as any[];
                if (!allSessions.some((s: any) => s && s.id === sessionToSave.id)) {
                  allSessions.push(sessionToSave);
                }
                const allProfiles = getProfiles();
                const [okS, okP] = await Promise.all([
                  serverSaveSessions(allSessions as any[]),
                  serverSaveProfiles(allProfiles as any[]),
                ]);
                if (okS && okP) {
                  localStorage.removeItem('nest_sessions_pending_push');
                  console.log('[HISTORY] Sessions + profiles synced to server');
                } else {
                  localStorage.setItem('nest_sessions_pending_push', '1');
                  console.warn('[HISTORY] Partial server sync — will retry next boot');
                }
              } catch (e) {
                localStorage.setItem('nest_sessions_pending_push', '1');
                console.error('[HISTORY] Server push failed:', e);
              }
            })();
            setPcPreview(undefined);
            // Force le rafraîchissement du compteur
            setSessionCount(prev => prev + 1);
          }}
          lang={lang}
        />
        </Suspense>
      )}

      {/* EP Validation Window */}
      {showEpValidation && (
        <EpValidationModal
          epValidationConditions={epValidationConditions}
          recentPcPhrases={recentPcPhrases}
          epValidationStartTime={epValidationStartTime}
          onValidate={() => { setEpValidated(true); setShowEpValidation(false); }}
          onClose={() => setShowEpValidation(false)}
        />
      )}

      
      {/* ═══ PROCESSUS — Holographic Library Modal ═══ */}
      {showProcessus && (
        <ProcessusModal
          processusPdfs={processusPdfs}
          setProcessusPdfs={setProcessusPdfs}
          pendingFiles={pendingFiles}
          setPendingFiles={setPendingFiles}
          pendingTagInput={pendingTagInput}
          setPendingTagInput={setPendingTagInput}
          processusTagFilter={processusTagFilter}
          setProcessusTagFilter={setProcessusTagFilter}
          editingTag={editingTag}
          setEditingTag={setEditingTag}
          editingTagValue={editingTagValue}
          setEditingTagValue={setEditingTagValue}
          onSelectProcessus={entry => setActiveProcessus(prev => [...prev, entry])}
          onClose={() => setShowProcessus(false)}
          t={t as (key: string) => string}
        />
      )}

      {/* LA GUIDA — sempre a portata, anche in seduta. */}
      {showGuide && <GuideModal lang={lang} onClose={() => setShowGuide(false)} />}

      {/* Modals */}
      {/* CONN-99: PROFILE MANAGEMENT — single place to select + create auditors
          and PCs (inline). Replaces the old ProfileModal. Opened from SESSIONE. */}
      {showRoster && (
        <ProfileRoster
          lang={lang}
          onActivate={(p) => {
            setActiveProfile(p);
            setAuditorName(p.name);
            setLang(p.preferences.lang as Language);
            setIsSoloSession(p.preferences.soloMode);
            setActiveProfileId(p.id);
            setShowRoster(false);
          }}
        />
      )}

      {showHistoryModal && (
        <Suspense fallback={null}>
          <HistoryModal
            activeProfile={activeProfile}
            onClose={() => setShowHistoryModal(false)}
            lang={lang}
          />
        </Suspense>
      )}

      {/* PC SEX prompt — se il PC non è indicato all'avvio, chiediamo il sesso per la
          baseline TA (uomo 3.0 / donna 2.0), poi proseguiamo con le tappe di avvio. */}
      <QuitConfirmDialog
        open={quitAsk}
        onClose={() => setQuitAsk(false)}
        onSaveAndQuit={() => {
          quitAfterSaveRef.current = true;
          setQuitAsk(false);
          handleEnd();
          // Rete di sicurezza: se il salvataggio non arrivasse, si esce lo stesso invece
          // di lasciare l'applicazione bloccata con una finestra che non si chiude. La
          // seduta non è comunque persa — il salvataggio automatico di emergenza la
          // ripropone al prossimo avvio.
          window.setTimeout(() => { if (quitAfterSaveRef.current) quitNow(); }, 8000);
        }}
        onDiscardAndQuit={() => { setQuitAsk(false); quitNow(); }}
        t={tWide}
      />

      <PcSexPromptDialog
        open={showSexPrompt}
        onPick={(sx) => { setPcSex(sx); setShowSexPrompt(false); proceedStart(); }}
        t={tWide}
      />

      {/* R3: crash-recovery prompt for an interrupted session — in the session language */}
      <SessionRecoveryDialog
        draft={recoverableDraft}
        lang={lang}
        onResume={recoverDraft}
        onDiscard={discardDraft}
      />
      </div>
      </div>
    </div>
    </>
  );
}