/**
 * SERENITY — il guscio.
 *
 * ── CHE COS'È, E CHE COSA NON È ─────────────────────────────────────────────────────────────
 * Fase 3 della refonte: la SECONDA applicazione esiste, si apre, e gira sullo STESSO MOTORE.
 * Le fasi 5 (il Meter) e 7 (la seduta a distanza) sono fatte; la fase 6 (R-Factor, processo,
 * cicli, giornale, assessment) è in corso — vedi il blocco « L'AGO EEG » più sotto per lo stato
 * esatto di quel che c'è e quel che manca ancora.
 *
 * Quel che questo guscio DIMOSTRA:
 *   • che una seconda superficie può montarsi su `src/engine`, `src/session` e `src/hooks`
 *     senza copiarne una riga — l'orologio qui sotto è `runtime/SessionClock`, lo stesso che
 *     conta i secondi in EQUILIBRIUM, e il giornale è `session/useSessionJournal`, non un
 *     secondo giornale;
 *   • che l'archivio è UNO SOLO: i profili elencati qui sono quelli di EQUILIBRIUM, letti
 *     dallo stesso `lib/storage`.
 *
 * ⚠️ ZERO LOGICA DI AUDITING SCRITTA QUI. Ogni soglia, ogni reazione, ogni decisione vive nei
 * moduli condivisi (`hooks/useChargeEngine`, `hooks/useMuseContactGate`,
 * `hooks/useStableReleaseState`, `engine/*`) — se un giorno una regola comparisse in QUESTO
 * file, sarebbe la prova che la refonte ha fallito.
 *
 * @see docs/serenity-refonte.md
 */

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useMetric } from '../store/metricsStore';
import { chargeStateById } from '../lib/chargeState';
import { useTZone } from '../store/tzoneStore';
import { sessionClock } from '../runtime/SessionClock';
import { needleEngine, virtualNeedle } from '../runtime/NeedleEngine';
import { useThetaMeter } from '../hooks/useThetaMeter';
import { useMuseConnection } from '../hooks/useMuseConnection';
import { useMuseContactGate } from '../hooks/useMuseContactGate';
import { useStableReleaseState } from '../hooks/useStableReleaseState';
import { useChargeEngine } from '../hooks/useChargeEngine';
import { useEpValidation } from '../hooks/useEpValidation';
import { ITEM_INTERRUPT_MS } from '../engine/tuning';
import { SET_OFFSET } from '../engine/dialGeometry';
import { THETA_LABEL_AFTER_MS } from '../engine/tuning';
import { QuantumSphere } from '../components/QuantumSphere';
import { ClearDial } from '../components/ClearDial';
import { useSessionJournal } from '../session/useSessionJournal';
import { useContactNullCycle } from '../session/useContactNullCycle';
import { useMirrorCycle } from '../session/useMirrorCycle';
import { MirrorDial } from '../components/MirrorDial';
import { useToneCycle } from '../session/useToneCycle';
import { ToneDial } from '../components/ToneDial';
import { TONE_LABELS, exactLevelName, levelName } from '../engine/toneLevels';
import {
  loadHistory as loadCanTests, saveHistory as saveCanTests, addTest as addCanTest,
  type PcCanHistory,
} from '../engine/canTest';
import { sessionRecord, cycleRecord, fnRecord } from '../engine/corpus';
import { corpusWrite, corpusAvailable } from '../lib/corpusWriter';
import { getProfiles, getPcProfiles } from '../lib/storage';
import { Avvio } from './Avvio';
import { AVVIO_VUOTO, type Avvio as StatoAvvio } from './flussoAvvio';
import { useI18n } from '../i18n';
import { pick5 } from '../i18n5';
import { useUiStore } from '../store/uiStore';
import { SelettoreLingua, SelettoreTema } from './Impostazioni';
import { useRemoteSession } from '../hooks/useRemoteSession';
import { Connessione } from './Connessione';
import { PannelloEp } from './PannelloEp';
import { PannelloConfig } from './PannelloConfig';
import { PannelloMna } from './PannelloMna';
import { CameraCerchio } from './CameraCerchio';
import { IndicatoreConnessione } from './IndicatoreConnessione';
import { PannelloMeter } from './PannelloMeter';
import { useSerenityModuleStore } from './serenityModuleStore';
import { Settings, Headphones, Gauge, User, Users, Wrench, Wifi } from 'lucide-react';
import type { ReadSrc } from '../engine/instantRead';
import type { PrimePhase, Zone as PrimeZone } from '../lib/primeFreqEngine';
import type { MnaSession } from '../hooks/useMnaModule';
import { primeFreqTracker } from '../engine/PrimeFreqTracker';
import { primeFreqAudio } from '../lib/primeFreqAudio';
import { networkManager } from '../lib/networkManager';
import { useVoiceItem } from '../hooks/useVoiceItem';
import { isAssessableItem } from '../engine/assessItemFilter';
import { deriveCyclePhase } from '../engine/sessionPhase';
import type { SessionMode } from '../engine/sessionMode';
import { salvaConfigurazione, type ConfigurazioneSalvata } from './configurazioniStore';

/** mm:ss — l'unico formato di tempo che serve in seduta. */
const orologio = (s: number) => {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};

const MNA_SESSION_VUOTA: MnaSession = {
  cycles: 0, imHistory: [], imSum: 0, imCount: 0, peakIm: 0, finalZone: 'PRIME', totalCopies: 0, phaseLog: [],
};

/**
 * ── LA LETTURA, DETTA A NUMERI ──────────────────────────────────────────────────────────────
 * Segnalato: « non reagisce nulla ». L'ago SUL quadrante è la lettura vera, ma è l'UNICA — se
 * si muove poco, o lo si guarda nell'istante sbagliato, sembra fermo anche quando il motore sta
 * lavorando. App.tsx affianca sempre all'ago un TA in cifre (`ToneArmReadout`) e la fase in
 * parole: SERENITY non ne aveva NESSUNO — il quadrante era l'unica prova che qualcosa
 * succedesse. Qui gli stessi due numeri, dalla STESSA fonte (`metricsStore`, quello che
 * `useChargeEngine` scrive), in due componenti isolati (`React.memo`) così i ~10 Hz del motore
 * non ridisegnano tutta la schermata — stesso motivo per cui App.tsx li tiene separati.
 */
const LetturaTA = React.memo(function LetturaTA() {
  const toneArm = useMetric(m => m.toneArm);
  return (
    <span style={{ fontFamily: 'var(--s-mono)', fontVariantNumeric: 'tabular-nums' }}>
      TA {Math.min(6.0, Math.max(2.0, toneArm)).toFixed(2)}
    </span>
  );
});

/** La fase della carica in parole — la STESSA mappa di App.tsx (`chargeStateById`), non una
 *  nuova. Vuota prima di un contatto: non c'è ancora niente da dire, e dirlo lo stesso
 *  sembrerebbe un dato inventato. */
const LetturaFase = React.memo(function LetturaFase({ t }: { t: (k: string) => unknown }) {
  const phase = useMetric(m => m.chargePhase);
  const cs = chargeStateById(phase);
  return <>{cs.labelKey ? (t(cs.labelKey) as string) : ''}</>;
});

/** ── IL LAG DI RON E LA % DI DISSOLUZIONE — segnalato con l'arco dei cicli: erano informazioni
 *  dinamiche di EQUILIBRIUM (`CycleStatusBar`, riga sotto la domanda), non solo il disegno
 *  dell'arco. STESSO calcolo di `ClearDial`/`CycleStatusBar` (`cyclePeakQ` da `tzoneStore`,
 *  `qL` da `metricsStore`) — non un secondo. Isolato in un suo `React.memo`: `qL` cambia a
 *  ~10 Hz, e non deve far ridisegnare tutta l'intestazione dello strumento. Solo a ciclo
 *  armato: fuori ciclo il numero non significa niente (stessa regola di `LetturaTA`). */
const LetturaCiclo = React.memo(function LetturaCiclo({ deltaStar, deltaStarN }: { deltaStar: number; deltaStarN: number }) {
  const qLNow = useMetric(m => m.qL);
  const { cyclePeakQ } = useTZone();
  const pct = cyclePeakQ > 0.001 ? Math.round(Math.max(0, Math.min(1, (cyclePeakQ - Math.max(0, qLNow)) / cyclePeakQ)) * 100) : 0;
  return (
    <>
      <span>{deltaStarN > 0 ? `Δt* ${deltaStar}ms` : '—'}</span>
      <span>{pct}%</span>
    </>
  );
});

export default function Serenity() {
  const { t, lang } = useI18n();
  /** LC — le stesse cinque lingue di App.tsx, stesso helper (`i18n5`, non un secondo). Serve
   *  ai moduli condivisi (`useChargeEngine`'s deps non lo usa direttamente, ma sarà necessario
   *  quando la fase 6 monterà i cicli — vedi la nota più sotto). */
  const LC = (it: string, fr: string, en: string, es: string, sv: string) => pick5(lang as string, it, fr, en, es, sv);
  // ⚠️ STESSA PREFERENZA DI EQUILIBRIUM — non uno stato di SERENITY. Segnalato: « toutes les
  // fonctionnalités de EQUILIBRIUM ». `isLightTheme` è la stessa chiave che governa
  // `GlassThemeToggle`, stesso `localStorage`: cambiarla qui la cambia anche di là.
  const isLightTheme = useUiStore(s => s.isLightTheme);
  // ⚠️ SEGNALATO: « le thème DARK doit être... dark pour toute l'interface », non solo il
  // quadrante. `data-tema` su `<html>` fa scattare `tokens.css`'s `:root[data-tema='scuro']`,
  // che ridefinisce OGNI colore della superficie — non solo quello del pannello dell'ago.
  // Un attributo sul documento, non una prop passata a ogni componente: gli oltre trenta punti
  // che già usano `var(--s-x)` cambiano da soli, senza toccarli uno per uno.
  useEffect(() => {
    document.documentElement.dataset.tema = isLightTheme ? 'chiaro' : 'scuro';
  }, [isLightTheme]);
  const journal = useSessionJournal('SERENITY');
  const [aperta, setAperta] = useState(false);
  /**
   * ── LA PAUSA — segnalato nell'audit comparativo con App.tsx: « la perdita del contatto MUSE
   * mette automaticamente la seduta in pausa... in SERENITY `pauseOnLoss` è un no-op esplicito ».
   * Vero, e non innocuo: senza, un ago che smette di leggere a metà seduta lascia l'orologio a
   * correre e il ciclo armato in attesa di dati che non arrivano più, con l'unico segnale un
   * puntino che cambia colore in intestazione — facile da non notare mentre si guarda l'ago.
   *
   * Non è l'intera macchina a stati di App.tsx (`SessionState` a 4 valori, che governa anche
   * la sincronizzazione a distanza e il riconoscimento vocale): qui basta un booleano in più,
   * `aperta` resta la sola sorgente di verità per "seduta in corso o no" — `pausata` dice SOLO
   * se in questo momento sta leggendo. Vedi l'effetto poco sotto (auto-pausa/auto-ripresa) e il
   * badge in testata, accanto all'orologio.
   */
  const [pausata, setPausata] = useState(false);
  const [tempo, setTempo] = useState(0);
  /** Le quattro risposte dell'avvio. `null` = le domande non sono ancora state fatte. */
  const [avvio, setAvvio] = useState<StatoAvvio | null>(null);
  /** Si è passati OLTRE la schermata di connessione? Un flag a parte, non `remote.isConnected`
   *  direttamente: un blip di rete a metà seduta non deve risbattere l'auditor sulla schermata
   *  del link — la connessione può cadere e riprendersi, la seduta resta aperta lo stesso. */
  const [collegato, setCollegato] = useState(false);
  /** CONFIG — segnalato assente: raggiungibile in ogni momento, come in EQUILIBRIUM. */
  const [configAperto, setConfigAperto] = useState(false);
  /**
   * ── LA CONFIGURAZIONE DEL METER — ANCORATA al suo stesso indicatore, non altrove ──────────
   * Segnalato: « comment peux-tu mettre la connexion METER EN BAS, le MUSE en haut... il faut
   * que SERENITY soit un CHEMIN DE FACILITÉ ». La connessione vive SOLO nell'indicatore
   * d'intestazione (vedi sotto) — questo stato apre/chiude solo la sua ESPANSIONE (due
   * lattine/lattina sola, le due prove, la taratura TA), ancorata proprio lì, non un secondo
   * posto in fondo alla pagina da dover imparare a parte.
   */
  const [meterSetupAperto, setMeterSetupAperto] = useState(false);
  /**
   * ── METER / MUSE / NESSUNO STRUMENTO — segnalato: « la logica... non sembra ancora
   * implementata ». Vero: `App.tsx` chiede SEMPRE, al primo APRI UNA SEDUTA senza niente di già
   * collegato, quale configurazione usare — anche "senza strumenti" È una scelta (il gruppo di
   * controllo), non un difetto da correggere in silenzio. SERENITY apriva la seduta comunque,
   * senza mai fare la domanda: si scopriva "senza ago" solo guardando il quadrante restare
   * fermo. `connSel` è lo STESSO selettore di App.tsx (`{muse, theta, none}`, "nessuno"
   * ESCLUSIVO con gli altri due) — vedi `apri()`/`avviaSeduta()` sotto per il gancio.
   */
  const [scegliStrumento, setScegliStrumento] = useState(false);
  const [connSel, setConnSel] = useState({ muse: false, theta: false, none: false });
  const scegliConn = (k: 'muse' | 'theta' | 'none') => setConnSel(p =>
    k === 'none' ? { muse: false, theta: false, none: !p.none } : { ...p, none: false, [k]: !p[k] });
  /** « Senza strumenti » — il gruppo di controllo. STICKY per la seduta (come `senzaStrumenti`
   *  in App.tsx): scelto una volta, non lo si richiede più finché la seduta resta aperta. */
  const [senzaStrumenti, setSenzaStrumenti] = useState(false);
  /** Il nome con cui salvare QUESTA combinazione (auditor/PC/dove/esperto + strumenti) come
   *  configurazione registrata — vuoto finché l'auditor non apre quel campo. */
  const [nomeConfigDaSalvare, setNomeConfigDaSalvare] = useState('');
  const [configSalvata, setConfigSalvata] = useState(false);
  /**
   * ── SALVA LA CONFIGURAZIONE, ANCHE DA QUI ─────────────────────────────────────────────────
   * Segnalato: « la configuration de séance... elle est où ? ». Il campo per salvarla c'era
   * già — ma vive DENTRO il pannello "con che cosa si audita?", che si apre SOLO se nessuno
   * strumento è ancora connesso (`apri()`, sotto). Chi connette il MUSE o il METER dall'
   * indicatore d'intestazione PRIMA di aprire la seduta — un gesto naturale, anzi il primo che
   * l'intestazione stessa invita a fare — quel pannello non lo vede MAI, e con lui nemmeno il
   * modo di salvare. Questo bottone, sempre accanto al nome dell'auditor, non dipende da
   * nessun pannello: legge la combinazione COM'È ORA (strumenti già connessi compresi) e la
   * offre di salvare in ogni momento — non solo nell'unico istante in cui il pannello capita di
   * essere aperto. */
  const [salvaConfigAperto, setSalvaConfigAperto] = useState(false);
  /** Il « minimizza » di ciascuna camera — lo stesso `isVisible` di `CameraFeed.tsx`, un gesto
   *  in seduta, DIVERSO dallo spegnimento da CONFIG (`moduleVis`): qui lo stream resta vivo. */
  const [cam1Collassata, setCam1Collassata] = useState(false);
  const [cam2Collassata, setCam2Collassata] = useState(false);
  const uiAlpha = useUiStore(s => s.uiAlpha);
  const wallpaperUrl = useUiStore(s => s.wallpaperUrl);
  const moduleVis = useSerenityModuleStore(s => s.moduleVis);
  // Segnalato: « nessuno sfondo » — la STESSA preferenza di EQUILIBRIUM, applicata alla
  // superficie di SERENITY con un velo (`--s-veil`) invece del vetro scuro di EQUILIBRIUM:
  // stessa funzione (« IL TUO fondo »), grafica propria.
  useEffect(() => {
    document.body.style.backgroundImage = wallpaperUrl
      ? `linear-gradient(var(--s-veil), var(--s-veil)), url("${wallpaperUrl}")` : '';
    document.body.style.backgroundSize = wallpaperUrl ? 'cover' : '';
    document.body.style.backgroundPosition = wallpaperUrl ? 'center' : '';
    document.body.style.backgroundAttachment = wallpaperUrl ? 'fixed' : '';
    return () => { document.body.style.backgroundImage = ''; };
  }, [wallpaperUrl]);
  const remote = useRemoteSession({
    lang,
    onTrascrizione: testo => journal.addLog({ speaker: 'PC', text: testo, time: sessionClock.now() }),
  });

  // L'orologio è QUELLO DI EQUILIBRIUM: `sessionClock` è un modulo unico, e conta i secondi
  // fuori da React perché il ridisegno non deve poter far perdere un secondo di seduta.
  // `timeRef` è lo specchio che i moduli fuori-React (il motore della carica) leggono senza
  // aspettare un render — stessa ragione di `timeRef` in App.tsx.
  const timeRef = useRef(0);
  useEffect(() => sessionClock.subscribe(() => {
    const s = sessionClock.now();
    setTempo(s);
    timeRef.current = s;
  }), []);

  /**
   * ── IL METER, LO STESSO ─────────────────────────────────────────────────────────────────
   * `useThetaMeter` è il modulo che EQUILIBRIUM usa da sempre: driver WebHID, modello
   * dell'ago, TA, reazioni, F/N. Qui non si aggiunge NIENTE — si legge e si disegna.
   *
   * ── E L'ETICHETTA DELLA REAZIONE, con lo STESSO ciclo di vita ────────────────────────────
   * `thetaReactionKey` è la copia esatta di come App.tsx alimenta il quadrante: si accende al
   * verdetto e resta finché l'ago sta ancora scendendo; al verdetto FINALE (`r.final`) si tiene
   * ancora `THETA_LABEL_AFTER_MS` — il tempo di leggerla — poi si spegne. Stessa costante,
   * stesso comportamento: è QuantumSphere stesso a leggere questa chiave e a colorarsi.
   */
  const [thetaReactionKey, setThetaReactionKey] = useState('');
  const spegniRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const theta = useThetaMeter({
    nowSec: () => sessionClock.now(),
    onReaction: r => {
      setThetaReactionKey(r.key);
      if (spegniRef.current) { clearTimeout(spegniRef.current); spegniRef.current = null; }
      if (r.final) spegniRef.current = setTimeout(() => setThetaReactionKey(''), THETA_LABEL_AFTER_MS);
    },
  });
  useEffect(() => () => { if (spegniRef.current) clearTimeout(spegniRef.current); }, []);
  const meterC = theta.status === 'connected';
  // Il cassetto del meter non deve restare aperto su un meter che non c'è più.
  useEffect(() => { if (!meterC) setMeterSetupAperto(false); }, [meterC]);
  const thetaTaRef = useRef<number | null>(null);
  useEffect(() => { thetaTaRef.current = theta.ta; }, [theta.ta]);

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * ── L'AGO EEG — fase 6, secondo passo ────────────────────────────────────────────────────
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * Qui si accende il MUSE: `useMuseConnection` (stesso hook di App.tsx, fase 2) e
   * `useMuseContactGate` (il contatto vero, fase 6) alimentano `useChargeEngine` (il motore
   * della carica, fase 6), che pilota l'ago vero — non un secondo motore, lo STESSO che gira
   * in App.tsx, ognuna delle due app con la sua istanza del worker.
   *
   * ⚠️ COSA C'È E COSA NON C'È ANCORA:
   *   • C'È: la cuffia si appaia, l'ago EEG si muove e reagisce (Fall, F/N, Blow Down…), il
   *     Tone Arm sale, l'EP a 4 stadi segue la seduta vera (`useEpValidation`, condiviso).
   *   • NON C'È ANCORA: armare un ciclo CONTACT/NULL (serve `session/useContactNullCycle`,
   *     già pronto dalla fase 1, non ancora montato qui), il pannello MNA, l'assessment con
   *     più item, e l'archivio CORPUS di questa seduta. `cycleArmedRef`/`trackCycleRef` sono
   *     quindi placeholder onesti — nessun ciclo li arma, restano quieti — e
   *     `corpusSessionRef`/`assessActiveRef` restano sempre "spenti": nessun dato inventato,
   *     solo non ancora scritto. Prossimo passo di questa fase.
   */
  const workerRef = useRef<Worker | null>(null);
  const eegBuffer = useRef<{ [ch: number]: number[] }>({ 0: [], 1: [], 2: [], 3: [] });
  const gyroBuffer = useRef<{ x: number[]; y: number[]; z: number[] }>({ x: [], y: [], z: [] });
  const eegBatchRef = useRef<Array<{ ts: number; s: number[] }>>([]);
  const ppgBatchRef = useRef<Array<{ ts: number; s: number[] }>>([]);
  const gyroBatchRef = useRef<Array<{ x: number; y: number; z: number }>>([]);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);

  const muse = useMuseConnection({
    eegBuffer, gyroBuffer, eegBatchRef, ppgBatchRef, gyroBatchRef,
    postToWorker: msg => workerRef.current?.postMessage(msg),
    // SERENITY, in questo passo, è sempre 'local': la seduta a distanza (fase 7) porta il
    // proprio EEG via RAW_EEG relay — non ancora cablato (vedi docs/serenity-refonte.md).
    appMode: () => 'local',
    satelliteMode: () => false,
    sessionRunning: () => aperta,
    nowSec: () => sessionClock.now(),
    uiTime: () => sessionClock.getWholeSeconds(),
    addLog: e => journal.addLog(e as any),
    tr: key => t(key as never) as string,
    setBatteryLevel,
    // Segnalato assente: la STESSA regola di App.tsx — il MUSE perso mette la seduta in pausa,
    // non solo un'icona ambra da notare da sé.
    pauseOnLoss: () => setPausata(true),
  });
  // La ripresa è automatica quanto la pausa: appena il MUSE torna a rispondere (o l'auditor
  // passa al Theta-Meter, che non ha bisogno del contatto EEG) la lettura riprende da sé —
  // stessa filosofia di "il gate di contatto segnala da sé", applicata anche alla pausa.
  useEffect(() => {
    if (pausata && aperta && (muse.museConnection === 'connected' || meterC)) setPausata(false);
  }, [pausata, aperta, muse.museConnection, meterC]);
  // L'orologio segue la pausa esattamente come segue apertura/chiusura in App.tsx
  // (`sessionClock.resume()`/`.pause()`): il tempo di seduta non deve contare i minuti in cui
  // nessuno strumento stava leggendo.
  useEffect(() => {
    if (!aperta) return;
    if (pausata) sessionClock.pause(); else sessionClock.resume();
  }, [pausata, aperta]);

  const museGate = useMuseContactGate({
    eegBuffer, museConnection: muse.museConnection, remoteLive: false,
    timeRef, addLog: e => journal.addLog(e as any),
  });

  // L'ultima reazione MOSTRATA sull'ago EEG — scritta dal motore della carica, letta da
  // `useStableReleaseState` e dal quadrante.
  const [needleReactionKey, setNeedleReactionKey] = useState('reaction_none');
  const [needleReaction, setNeedleReaction] = useState('Set');
  const needleReactionKeyRef = useRef('reaction_none');
  const needleReactionRef = useRef('Set');
  const needleVirtualRef = useRef<{ time: number; offset: number }[]>([]);
  const shownReadsRef = useRef<Array<{ time: number; reaction: string; src?: ReadSrc; episodeId?: number }>>([]);
  const ultimoItemSecRef = useRef<number | null>(null);
  const pendingEegFnRef = useRef<{ tSec: number; ta: number } | null>(null);
  const activeKickRef = useRef<{ raw: number } | null>(null);
  const kickFlybackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const needleItemInterruptRef = useRef(0);
  const reactionHoldUntilRef = useRef(0);
  const gammaEmaRef = useRef(0);
  const lastFnShownAtRef = useRef(-Infinity);
  const lastLoggedChargeRef = useRef('neutral');
  const chargeLogPendingRef = useRef<{ candidate: string | null; sinceMs: number }>({ candidate: null, sinceMs: 0 });
  const lastLoggedReactionRef = useRef<{ reaction: string; t: number } | null>(null);
  /** L'identificativo della seduta nel CORPUS — l'ora d'apertura, come in App.tsx. Vuoto fuori
   *  seduta: senza seduta non c'è configurazione con cui interpretare una riga. */
  const corpusSessionRef = useRef('');
  /**
   * ── ASSESSMENT — segnalato: « l'assessment ne marche pas et n'apparaît pas ». Vero: i tre
   * motori dei cicli chiamavano già `ensureAssessmentOn()` (dando l'item a voce, come in
   * App.tsx) ma qui era un no-op — nessuno stato si accendeva, nessuna lista compariva da
   * nessuna parte.
   *
   * ⚠️ QUESTA NON È la sofisticazione intera di `AssessmentPanel.tsx` (App.tsx): quella calcola
   * una LETTURA ISTANTANEA per ogni item (`computeInstantRead`, la finestra di comm-lag,
   * l'accorpamento per gruppo ripetuto) — ~300 righe accoppiate a refs locali di App.tsx, non
   * un modulo condiviso portabile qui in un passo solo. Questa è la METÀ onesta: la lista degli
   * item dati a voce durante l'assessment, con l'ora — SENZA una lettura calcolata accanto a
   * ciascuno (sarebbe un numero inventato). La lettura per-item resta un passo successivo,
   * dichiarato, non taciuto.
   */
  const [assessAttivo, setAssessAttivo] = useState(false);
  const assessActiveRef = useRef(false);
  useEffect(() => { assessActiveRef.current = assessAttivo; }, [assessAttivo]);
  const attivaAssessment = () => setAssessAttivo(true);
  const [assessItems, setAssessItems] = useState<Array<{ id: string; time: number; item: string }>>([]);
  const assessIdRef = useRef(0);
  const assessLogCursorRef = useRef(0);
  /** Stesso filtro (`isAssessableItem`) e stesso principio cursore-su-`journal.logs` dei tre
   *  effetti "item dettato" qui sotto: si guarda solo quel che arriva DOPO che l'assessment si è
   *  acceso, non l'intero giornale da capo. */
  useEffect(() => {
    if (!assessAttivo) return;
    const cursore = assessLogCursorRef.current;
    if (journal.logs.length <= cursore) return;
    const nuovi: Array<{ id: string; time: number; item: string }> = [];
    for (let i = cursore; i < journal.logs.length; i++) {
      const riga = journal.logs[i];
      if (riga.speaker === 'Aud' && isAssessableItem(riga.text)) {
        nuovi.push({ id: `as-${++assessIdRef.current}`, time: riga.time, item: riga.text.trim() });
      }
    }
    if (nuovi.length) setAssessItems(prev => [...prev, ...nuovi]);
    assessLogCursorRef.current = journal.logs.length;
  }, [journal.logs, assessAttivo]);

  const release = useStableReleaseState({ needleReactionKeyRef });

  const [hardwareError, setHardwareError] = useState<string | null>(null);
  const [isHoldMode, setIsHoldMode] = useState(false);
  const [realBpm, setRealBpm] = useState<number | null>(null);
  const realBpmRef = useRef<number | null>(null);
  useEffect(() => { realBpmRef.current = realBpm; }, [realBpm]);
  const ppgAmpRef = useRef<number | null>(null);
  const ppgPiRef = useRef<number | null>(null);
  const lastBpmAtRef = useRef(0);
  const signalQualityRef = useRef(0);
  useEffect(() => { signalQualityRef.current = museGate.signalQuality; }, [museGate.signalQuality]);
  const [displayMass, setDisplayMass] = useState(0);
  const massAccumulatorRef = useRef(0);

  // ── MNA (SONIFY/CLEAN/HARMONICS) — segnalato assente: il motore scriveva già questi campi
  // (`useChargeEngine` li aggiorna comunque, il worker non sa che nessuno guarda) — mancava
  // SOLO `PannelloMna.tsx` e lo stato di RENDER della fase (`primePhaseRef` bastava al motore,
  // non a un bottone che deve *ridisegnarsi* quando la fase avanza).
  const [primeIm, setPrimeIm] = useState(0);
  const [primeFd, setPrimeFd] = useState(0);
  const [primePStar, setPrimePStar] = useState(2);
  const [primeDelta, setPrimeDelta] = useState(0);
  const [primeZone, setPrimeZone] = useState<PrimeZone>('PRIME');
  const [primeCopies, setPrimeCopies] = useState<Array<{ p: number; freq: number }>>([]);
  const [primeCaptured, setPrimeCaptured] = useState(false);
  const [primePhase, setPrimePhaseState] = useState<PrimePhase>('IDLE');
  const primePhaseRef = useRef<PrimePhase>('IDLE');
  /** Aggiorna INSIEME lo stato (per il render di `PannelloMna`) e il ref (che il motore legge
   *  senza aspettare un render) — stessa doppia scrittura di App.tsx (`setPrimePhase(...);
   *  primePhaseRef.current = ...`), qui raccolta in una funzione sola per non poterle scordare
   *  disaccoppiate. */
  const setPrimePhase = (p: PrimePhase) => { setPrimePhaseState(p); primePhaseRef.current = p; };
  const [mnaAperto, setMnaAperto] = useState(false);
  const mnaSessionRef = useRef<MnaSession>({ ...MNA_SESSION_VUOTA });
  const metabolicPhaseRef = useRef<'idle' | 'baseline' | 'breath' | 'result'>('idle');

  /** L'EP a 4 stadi — CONDIVISO con EQUILIBRIUM (`hooks/useEpValidation`), non un secondo
   *  stato: la modale di validazione manuale non è ancora costruita qui, ma lo stato segue
   *  la seduta vera fin da ora. */
  const ep = useEpValidation();
  /** Specchio per il motore della carica — stessa ragione di `tRef`/`signalQualityRef`: la
   *  chiusura del worker è fissa dal montaggio, `ep.epWindowOpen` cambia durante la seduta.
   *  Stesso identico pattern di App.tsx (`const epWindowOpenRef = useRef(epWindowOpen);`). */
  const epWindowOpenRef = useRef(ep.epWindowOpen);
  epWindowOpenRef.current = ep.epWindowOpen;

  const sessionStateRef = useRef<'idle' | 'running' | 'paused' | 'ended'>('idle');
  useEffect(() => { sessionStateRef.current = aperta ? 'running' : 'idle'; }, [aperta]);
  /** SERENITY non ha ancora MIRROR/TONE — sempre 'needle' finché quelle viste non arrivano. */
  const viewModeRef = useRef<'needle' | 'needle_pure' | 'mirror' | 'tone'>('needle');
  const instrumentsRef = useRef({ muse: false, theta: false });
  useEffect(() => { instrumentsRef.current = { muse: muse.museConnection === 'connected', theta: meterC }; });
  /** Nessuno slider di sensibilità in SERENITY ancora — lo stesso valore di default di
   *  App.tsx (nessun binding UI neanche là: "1.0 = default"). */
  const sensitivityRef = useRef(1.0);

  /** Non ancora MIRROR/TONE in SERENITY — placeholder onesti, mai armati. */
  const trackMirrorRef = useRef<(q: number, nowSec: number, pushUi: boolean) => void>(() => {});
  const trackToneRef = useRef<(q: number, nowSec: number) => void>(() => {});
  /** `useContactNullCycle` (sotto) scrive qui il suo `trackCycle` DOPO essere stato creato —
   *  il ref esiste già ora perché `useChargeEngine` (anche lui sotto) lo riceve una volta sola. */
  const trackCycleRef = useRef<(t: never) => void>(() => {});

  /** NUOVO ITEM → l'ago si LIBERA. Stessa funzione di App.tsx (`freeNeedleForNewItem`): la
   *  chiama `armCycle`, sotto, appena l'auditor dà un item. */
  const freeNeedleForNewItem = () => {
    if (kickFlybackRef.current) { clearTimeout(kickFlybackRef.current); kickFlybackRef.current = null; }
    needleEngine.clearMotion();
    activeKickRef.current = null;
    reactionHoldUntilRef.current = 0;
    needleItemInterruptRef.current = Date.now() + ITEM_INTERRUPT_MS;
  };
  /** Torna a SET — stessa funzione di App.tsx (`resetNeedle`), la parte che riguarda l'ago EEG
   *  (la parte Theta-Meter resta `theta.resetToSet`, già cablata sotto). */
  const resetNeedleEeg = () => {
    needleEngine.reset(() => {
      if (workerRef.current) {
        workerRef.current.postMessage({ type: 'RESET_SYSTEM' });
        workerRef.current.postMessage({ type: 'MANUAL_SET_RESET' });
      }
    });
    virtualNeedle.reset();
    needleVirtualRef.current = [];
  };
  /** Chiude (o apre) la riga CORPUS dell'F/N EEG — stessa logica di App.tsx (`flushEegFn`):
   *  scrive solo se una seduta è aperta (`corpusSessionRef` non vuoto, vedi `apri()`) e c'era
   *  davvero un F/N in sospeso. `asIs` lega l'indicatore alla decisione: senza, non si potrebbe
   *  sapere se un AS-IS dichiarato fosse confermato dall'ago vero. */
  const flushEegFn = (asIs = false) => {
    const p = pendingEegFnRef.current;
    pendingEegFnRef.current = null;
    if (!p || !corpusSessionRef.current) return;
    corpusWrite(fnRecord(corpusSessionRef.current, new Date().toISOString(), {
      src: 'eeg', tSec: p.tSec, ta: p.ta,
      durSec: Math.max(0, timeRef.current - p.tSec) || undefined,
      asIs: asIs || undefined,
    }));
  };

  /**
   * ── IL CICLO — CONTACT e NULL, lo stesso motore di App.tsx ─────────────────────────────
   * `session/useContactNullCycle` è pronto dalla fase 1: qui lo si monta per la prima volta.
   * Nessuna soglia nuova, nessuna macchina a stati riscritta — solo l'item (un campo di testo)
   * e i due gesti (ARM, AS-IS) che gliela danno. Ogni ciclo, concluso o abbandonato, scrive
   * ora nel CORPUS come farebbe App.tsx (`writeCycleCorpus`) — l'archivio è UNO SOLO.
   *
   * ⚠️ COSA MANCA ANCORA: l'assessment automatico da voce (`ensureAssessmentOn` no-op — l'item
   * si scrive, non si detta ancora). Il ciclo NULL è armabile da qui (vedi il piede di pagina),
   * e il lag di Ron (`onLagMeasured`) ora scrive `deltaStar`/`deltaStarN` — vedi sopra e
   * `ClearDial` nel pannello dello strumento, sotto: segnalato che l'arco doveva CONTINUARE a
   * rappresentare i cicli coi loro colori, non solo i bottoni testuali qui in fondo.
   */
  const [item, setItem] = useState('');
  /**
   * « L'ITEM È STATO DETTO » — l'uscita a mano dalla fase « dì l'item », quando la trascrizione
   * non c'è (Whisper assente, microfono negato, seduta senza dettatura). Vale come l'item
   * scritto — `itemNamed` (sotto) è l'uno O l'altro — esattamente come in App.tsx
   * (`itemSpoken`/`dichiaraItemDetto`), non una variante nuova.
   */
  const [itemSpoken, setItemSpoken] = useState(false);
  /** Il lag di Ron (Δt*) — segnalato assente dalla revisione (« l'arco rappresenta i cicli »):
   *  serviva anche a QUESTO, non solo a un numero. `onLagMeasured` era un no-op — il motore lo
   *  calcolava comunque (vive in `lagMeter`, dentro il ciclo), semplicemente nessuno lo leggeva
   *  da questo lato. Stessa forma di App.tsx (`deltaStar`/`deltaStarN`), non un secondo calcolo. */
  const [deltaStar, setDeltaStar] = useState(0);
  const [deltaStarN, setDeltaStarN] = useState(0);
  const cycles = useContactNullCycle({
    auditingQuestion: item,
    setAuditingQuestion: setItem,
    setItemSpoken,
    nowSec: () => sessionClock.now(),
    logLength: () => journal.logs.length,
    log: (text, type) => journal.addLog({ speaker: 'SYS', text, time: sessionClock.now(), type }),
    LC,
    thetaTa: () => thetaTaRef.current,
    freeNeedleForNewItem,
    ensureAssessmentOn: attivaAssessment,
    onItemGiven: sec => { ultimoItemSecRef.current = sec; },
    writeCycleCorpus: row => {
      if (!corpusSessionRef.current) return;   // fuori seduta non si archivia
      corpusWrite(cycleRecord(corpusSessionRef.current, new Date().toISOString(), row));
    },
    markFnAsIs: () => flushEegFn(true),
    // ── L'AS-IS chiude anche l'MNA in corso — segnalato assente insieme al resto dell'MNA:
    // `finalizeCycle` la chiama da sé quando un ciclo CONTACT raggiunge l'AS-IS (« la carica
    // non c'è più, il tono primo non ha più niente da trattare »). Era un no-op: il tono
    // sarebbe restato acceso oltre la fine del ciclo che lo giustificava. Stessa sequenza di
    // App.tsx, non una nuova.
    stopSonification: () => {
      if (primePhaseRef.current === 'SONIFY' || primePhaseRef.current === 'CLEAN' || primePhaseRef.current === 'HARMONICS') {
        try { primeFreqAudio.killAll(); } catch { /* noop */ }
        try { networkManager.send({ type: 'MNA_AUDIO', action: 'stop' }, true); } catch { /* noop */ }
        setPrimePhase('CAPTURE');
        setPrimeCopies([]);
      }
    },
    onLagMeasured: m => { setDeltaStar(m.deltaStar); setDeltaStarN(m.n); },
  });
  trackCycleRef.current = cycles.trackCycle;

  // ── IL CICLO MIRROR — segnalato assente insieme al suo arco (`MirrorDial`) ─────────────────
  // Stesso motore condiviso di App.tsx (`session/useMirrorCycle`, mai montato qui prima):
  // `trackMirrorRef` esisteva già (l'ago EEG lo alimenta a ogni campione, vedi
  // `useChargeEngine` sotto) ma restava un no-op — il metodo del raddoppio di Ron era
  // TOTALMENTE inaccessibile in SERENITY, non solo privo d'arco. MIRROR e CONTACT/NULL sono
  // ESCLUSIVI a vicenda (come lo sono in App.tsx via `mode`): qui non con un selettore di
  // modo — con la SEMPLICE assenza reciproca dei bottoni d'armamento, stessa esclusività,
  // niente selettore in più da costruire.
  const mirror = useMirrorCycle({
    auditingQuestion: item,
    setAuditingQuestion: setItem,
    setItemSpoken,
    nowSec: () => sessionClock.now(),
    logLength: () => journal.logs.length,
    log: (text, type) => journal.addLog({ speaker: 'SYS', text, time: sessionClock.now(), type }),
    ensureAssessmentOn: attivaAssessment,
    LC,
  });
  trackMirrorRef.current = mirror.trackMirror;

  useChargeEngine({
    workerRef, gyroBufferRef: gyroBuffer,
    timeRef, sessionStateRef, viewModeRef, instrumentsRef,
    museContactRef: museGate.museContactRef,
    stableReleaseStateRef: release.stableReleaseStateRef,
    sensitivityRef, assessActiveRef, thetaTaRef,
    corpusSessionRef, tRef: useRef(t), metabolicPhaseRef,
    realBpmRef, ppgAmpRef, ppgPiRef, lastBpmAtRef, signalQualityRef,
    primePhaseRef, mnaSessionRef, primeCaptured,
    needleReactionKeyRef, needleReactionRef, needleVirtualRef,
    shownReadsRef, ultimoItemSecRef,
    trackCycleRef, trackMirrorRef, trackToneRef, cycleArmedRef: cycles.cycleArmedRef,
    logBufferRef: journal.logBufferRef, pendingEegFnRef,
    epWindowOpenRef, epWindowHasOpenedRef: ep.epWindowHasOpenedRef,
    epWindowTimerRef: ep.epWindowTimerRef,
    setEpWindowOpen: ep.setEpWindowOpen, setAsIsnessState: ep.setAsIsnessState,
    setIsFnActive: ep.setIsFnActive,
    setHardwareError, setSignalQuality: museGate.setSignalQuality, setIsHoldMode, setRealBpm, setDisplayMass,
    setPrimeIm, setPrimeFd, setPrimePStar, setPrimeDelta, setPrimeZone, setPrimeCaptured,
    setNeedleReactionKey, setNeedleReaction,
    massAccumulatorRef,
    activeKickRef, kickFlybackRef, needleItemInterruptRef, reactionHoldUntilRef,
    gammaEmaRef, lastFnShownAtRef, lastLoggedChargeRef, chargeLogPendingRef, lastLoggedReactionRef,
    resetNeedle: resetNeedleEeg, flushEegFn,
  });
  // Gli specchi React dell'ago EEG — letti dal quadrante, scritti dal motore appena montato.
  useEffect(() => { needleReactionKeyRef.current = needleReactionKey; }, [needleReactionKey]);
  useEffect(() => { needleReactionRef.current = needleReaction; }, [needleReaction]);

  // La posizione VERA dell'ago EEG — `needleEngine` è il motore fisico condiviso (lo stesso
  // singleton che App.tsx legge), qui sottoscritto con lo stesso `useSyncExternalStore`.
  const needleOffsetEeg = useSyncExternalStore(needleEngine.subscribe, needleEngine.getPos);

  // ── QUALE AGO SI VEDE — segnalato nell'audit comparativo, e poi di nuovo: « les deux
  // aiguilles ? pas vue ». App.tsx stesso, per un motivo preciso (`agoPrincipale`, commento
  // «UN AGO SOLO — senza questo, scegliendo il MUSE restavano di nuovo due aghi sul quadrante»,
  // corretto apposta perché DUE aghi insieme confondevano), mostra un ago alla volta e lascia
  // all'auditor la scelta quando entrambi gli strumenti sono collegati — non li disegna
  // insieme. La confusione qui non era "manca un secondo ago": era che la scelta non esisteva
  // affatto, la regola era fissa e muta (« il Meter vince sempre »), e con un solo strumento
  // collegato non c'era comunque modo di sapere se quello che si vedeva era davvero l'unico
  // possibile o una preferenza taciuta. Stessa preferenza persistita di App.tsx (STESSA chiave
  // `localStorage`, coerente con l'archivio unico) — cambiare l'ago in EQUILIBRIUM lo cambia
  // anche qui, e viceversa.
  const [agoScelto, setAgoScelto] = useState<'eeg' | 'theta'>(() => {
    try {
      const v = localStorage.getItem('equilibrium_ago');
      return v === 'eeg' || v === 'theta' ? v : 'theta';
    } catch { return 'theta'; }
  });
  useEffect(() => { try { localStorage.setItem('equilibrium_ago', agoScelto); } catch { /* noop */ } }, [agoScelto]);
  const museOk = muse.museConnection === 'connected';
  /** Con UN solo strumento non c'è scelta: vince quello che c'è — la preferenza conta solo
   *  quando ci sarebbe davvero da scegliere. */
  const agoEeg = museOk && meterC ? agoScelto === 'eeg' : museOk;

  // I profili vengono dallo stesso armadio di EQUILIBRIUM — è la verifica di questa fase.
  const nome = (lista: Array<{ id: string; name: string }>, id: string | null | undefined) =>
    id === 'nuovo' ? 'nuovo' : (lista.find(p => p.id === id)?.name ?? '—');
  const nomeAuditor = nome(
    (() => { try { return getProfiles(); } catch { return []; } })(), avvio?.auditorId);
  const nomePreclear = nome(
    (() => { try { return getPcProfiles(); } catch { return []; } })(), avvio?.pcId);
  /** IL SESSO DEL PRECLEAR — decide il TA di clear (tono 40 di QUESTA persona), come in
   *  App.tsx (`useProfileStore.pcSex`). In SOLO l'auditor È il preclear: il campo vive sul
   *  suo stesso profilo (`PcProfile`/`UserProfile` condividono `sex?: 'm'|'f'` apposta). */
  const pcSex: 'm' | 'f' | undefined = avvio?.solo
    ? (() => { try { return getProfiles().find(p => p.id === avvio.auditorId)?.sex; } catch { return undefined; } })()
    : (() => { try { return getPcProfiles().find(p => p.id === avvio?.pcId)?.sex; } catch { return undefined; } })();

  /**
   * ── LA PROVA DELLE LATTINE DI QUESTO PRECLEAR — segnalata assente insieme a TONE SCALE ────
   * Stessa logica di App.tsx (`canHistory`/`provaTa`): da qui escono il margine sul tono
   * (« senza prova, una divisione in meno ») e lo scarto del SOLO. Si rilegge quando cambia il
   * nome — l'archivio è per persona, non per strumento. In SOLO il « preclear » è l'auditor
   * stesso (stessa regola di `pcSex` sopra).
   */
  const nomeProvaLattine = avvio?.solo ? nomeAuditor : nomePreclear;
  const [canHistory, setCanHistory] = useState<PcCanHistory>(() => loadCanTests(''));
  useEffect(() => { setCanHistory(loadCanTests(nomeProvaLattine || '')); }, [nomeProvaLattine]);
  /**
   * ── LA PROVA DOPPIA — i due TA letti, uno per configurazione ────────────────────────────
   * Segnalato: « le réglage est incompréhensible, fonctionne seulement les deux boîtes ». Vero
   * — non era rotto, era INCOMPLETO: `PannelloMeter` lasciava scegliere « lattina sola » ma non
   * dava MAI il modo di misurare lo scarto che quella scelta richiede (`theta.setSoloOffset`
   * esisteva, nessun bottone lo chiamava). Senza lo scarto, in solo il TA resta sistematicamente
   * spostato — sembra un'altra cosa, non un'altra configurazione. Stessa logica di App.tsx
   * (`provaTa`): si fa la stretta con due lattine (il riferimento), poi con una sola, e la
   * differenza fra le due letture è la correzione — non persistita qui (è la differenza, in
   * `ThetaSetup.offsets`, a persistere), quindi si azzera a ogni apertura di seduta.
   */
  const [provaTa, setProvaTa] = useState<{ two: number | null; solo: number | null }>({ two: null, solo: null });
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
    // Il TA di QUESTA configurazione, per il confronto — si prende quello del braccio
    // (`theta.ta`, la media lenta): la stretta appena finita non l'ha spostato, ed è quindi la
    // lettura di riposo, quella che si vuole confrontare.
    if (theta.ta !== null) {
      const valore = theta.ta;
      setProvaTa(p => theta.setup.config === 'two-cans' ? { ...p, two: valore } : { ...p, solo: valore });
    }
  }, [theta.squeezeOk, theta.testing, theta.setup.needleScale, theta.setup.config, theta.ta]);

  // ── IL CICLO TONE SCALE — segnalato assente insieme al suo arco (`ToneDial`) ────────────────
  // `trackToneRef` esisteva già (l'ago EEG lo alimenta a ogni campione), il locatore anche
  // (`ToneLocator`, dentro `useToneCycle`): mancava solo il montaggio. Diverso da CONTACT/NULL/
  // MIRROR: TONE non si "arma" — è un METODO in cui si lavora finché non lo si lascia
  // (`toneAttivo`, sotto), con le sue fasi locate→raise→done che si ripetono per ogni
  // resistenza. `qLnow`/`asIsSignature` sono lo stesso sguardo di App.tsx sulla carica EEG.
  const qLnow = useMetric(m => m.qL);
  const asIsSignatureNow = useMetric(m => m.asIsSignature);
  const toneFnNow = !agoEeg ? !!theta.fn.fn : (needleReactionKey || '').includes('reaction_fn');
  const tone = useToneCycle({
    ta: theta.ta, taNow: theta.taNow,
    config: theta.setup.config, soloOffset: theta.setup.offsets?.['solo-can'] ?? 0,
    hasTheta: meterC, hasMuse: muse.museConnection === 'connected',
    pcSex, canHistory, qL: qLnow,
    fnNow: toneFnNow, asIsSignature: asIsSignatureNow,
    auditingQuestion: item, setAuditingQuestion: setItem,
    nowSec: () => sessionClock.now(),
    logLength: () => journal.logs.length,
    log: (text, type) => journal.addLog({ speaker: 'SYS', text, time: sessionClock.now(), type }),
    setItemSpoken,
    ensureAssessmentOn: attivaAssessment,
    LC,
  });
  trackToneRef.current = tone.trackTone;
  /** SERENITY non ha un selettore di modo persistente come App.tsx (`mode`): qui il TONE si
   *  "attiva" con un gesto diretto, esclusivo con CONTACT/NULL/MIRROR — stessa esclusività di
   *  `viewMode`, un controllo in meno da costruire. */
  const [toneAttivo, setToneAttivo] = useState(false);

  /**
   * ── IL METODO IN CORSO, IN UN VALORE SOLO ────────────────────────────────────────────────
   * `engine/sessionMode.ts` — lo stesso tipo che App.tsx usa per `mode`. Qui non c'è un
   * selettore persistente: si RICAVA da quale dei quattro è armato/attivo (la stessa
   * esclusività reciproca già scritta nei bottoni del piede di pagina), invece di tenerne una
   * seconda copia in uno state a parte.
   */
  const mode: SessionMode = toneAttivo ? 'tone'
    : mirror.mirrorArmed ? 'mirror'
    : cycles.cycleArmed ? (cycles.cycleKind === 'null' ? 'null' : 'contact')
    : 'free';

  /**
   * ── LA FASE DEL CICLO, LA STESSA SCALA DI App.tsx ────────────────────────────────────────
   * `engine/sessionPhase.ts` (`deriveCyclePhase`) — puro TS, già condiviso, mai importato qui
   * prima. Dà per esempio `contact.say_item` (armato ma l'item non è ancora stato dato) da
   * `null.equilibrium` (traguardo raggiunto): è la base per il badge del ciclo e per l'avviso
   * « dì l'item… » qui sotto — invece di ricomporre la stessa risposta da quattro booleani.
   */
  const faseCiclo = useMemo(() => deriveCyclePhase({
    splashOpen: false, sessionState: aperta ? 'running' : 'idle',
    hasInstrument: muse.museConnection === 'connected' || meterC,
    preflightOpen: false, epWindowOpen: ep.epWindowOpen, reportOpen: false,
    mode, cycleArmed: cycles.cycleArmed, asIsPending: cycles.asIsPending, nullPhase: cycles.nullPhase,
    itemNamed: !!item.trim() || itemSpoken,
    mirrorArmed: mirror.mirrorArmed, mirrorLocked: mirror.mirrorDisp.locked, mirrorReached: mirror.mirrorDisp.reached,
    tonePhase: tone.tonePhase,
  }), [aperta, muse.museConnection, meterC, ep.epWindowOpen, mode, cycles.cycleArmed, cycles.asIsPending,
       cycles.nullPhase, item, itemSpoken, mirror.mirrorArmed, mirror.mirrorDisp.locked, mirror.mirrorDisp.reached,
       tone.tonePhase]);

  /**
   * ── L'ITEM A VOCE, LA SORGENTE CHE MANCAVA ───────────────────────────────────────────────
   * Segnalato: « la logica di dare l'ITEM anche a voce... non è implementata ancora ». I tre
   * motori sapevano già riempire l'item da soli (`cycleAwaitItemRef`/`itemDettato` e le sue
   * due sorelle, portati da App.tsx in una sessione precedente) — mancava solo chi parla:
   * `useVoiceItem` avvia lo STESSO riconoscitore (nativo macOS, poi Whisper offline) di
   * App.tsx, e ogni frase finale entra nel giornale come farebbe l'auditor scrivendola.
   */
  useVoiceItem({
    active: aperta,
    lang: lang as string,
    onTranscript: text => { journal.addLog({ speaker: 'Aud', text, time: sessionClock.now(), type: 'normal' }); },
  });

  /**
   * ── L'ITEM DETTATO ARRIVA DAL GIORNALE, PER CIASCUNO DEI TRE CICLI CHE LO ASPETTANO ──────
   * Le STESSE tre condizioni di App.tsx (righe 2016-2073 lì): premuto il bottone d'armamento
   * col campo vuoto, `*AwaitItemRef` si accende e un cursore segna da dove leggere — qui si
   * guarda solo quel che arriva DOPO, filtrato da `isAssessableItem` (un "ok" o un "mh" non è
   * un item). TONE non ha un `itemDettato` di ciclo (la resistenza non si riancora, si limita a
   * riempire l'etichetta) — stessa asimmetria di App.tsx, non una dimenticanza qui.
   */
  useEffect(() => {
    if (!cycles.cycleAwaitItemRef.current || !cycles.cycleArmedRef.current) return;
    const cursore = cycles.cycleLogCursorRef.current;
    if (journal.logs.length <= cursore) return;
    for (let i = cursore; i < journal.logs.length; i++) {
      const riga = journal.logs[i];
      if (riga.speaker === 'Aud' && isAssessableItem(riga.text)) { cycles.itemDettato(riga.text.trim()); break; }
    }
    cycles.cycleLogCursorRef.current = journal.logs.length;
  }, [journal.logs, cycles]);

  useEffect(() => {
    if (!mirror.mirrorAwaitItemRef.current || !mirror.mirrorArmedRef.current) return;
    const cursore = mirror.mirrorLogCursorRef.current;
    if (journal.logs.length <= cursore) return;
    for (let i = cursore; i < journal.logs.length; i++) {
      const riga = journal.logs[i];
      if (riga.speaker === 'Aud' && isAssessableItem(riga.text)) { mirror.itemDettato(riga.text.trim()); break; }
    }
    mirror.mirrorLogCursorRef.current = journal.logs.length;
  }, [journal.logs, mirror]);

  useEffect(() => {
    if (!tone.toneAwaitItemRef.current) return;
    const cursore = tone.toneLogCursorRef.current;
    if (journal.logs.length <= cursore) return;
    for (let i = cursore; i < journal.logs.length; i++) {
      const riga = journal.logs[i];
      if (riga.speaker === 'Aud' && isAssessableItem(riga.text)) {
        tone.toneAwaitItemRef.current = false;
        setItem(riga.text.trim());
        break;
      }
    }
    tone.toneLogCursorRef.current = journal.logs.length;
  }, [journal.logs, tone]);

  /**
   * « L'ITEM È STATO DETTO » — il gesto di ripiego, per tutti e quattro i cicli, quando la
   * trascrizione non c'è (microfono negato, Whisper assente) o l'auditor preferisce scriverlo
   * dopo. Stessa forma di App.tsx (`dichiaraItemDetto`): si spengono tutti e tre gli
   * `*AwaitItemRef` insieme, perché il gesto è uno solo e lo stato del ciclo dice già quale dei
   * tre sta aspettando.
   */
  const dichiaraItemDetto = () => {
    setItemSpoken(true);
    cycles.cycleAwaitItemRef.current = false;
    mirror.mirrorAwaitItemRef.current = false;
    tone.toneAwaitItemRef.current = false;
  };

  /**
   * L'APERTURA VERA — quel che `apri()` faceva per intero prima di questo segnalato. Separata
   * perché ora ha DUE strade per arrivarci: subito (uno strumento è già collegato, o "senza
   * strumenti" è già stato scelto in questa seduta) o dopo la scelta nel pannello qui sotto.
   */
  const avviaSeduta = () => {
    sessionClock.reset(); sessionClock.start();
    setPausata(false);   // niente pausa residua da una seduta precedente
    journal.resetJournal(t('ser_session_opened'));
    ep.resetEpState();   // niente "EP ✓" residuo da una seduta precedente
    mirror.resetMirror();   // niente ciclo MIRROR residuo da una seduta precedente
    tone.resetTone(); setToneAttivo(false);   // niente TONE residuo da una seduta precedente
    setProvaTa({ two: null, solo: null });   // niente prova doppia residua da un'altra persona
    setAssessAttivo(false); setAssessItems([]); assessLogCursorRef.current = 0;   // idem, ASSESSMENT
    // ── MNA — « entra in CAPTURE » all'apertura, come App.tsx ────────────────────────────
    // Non IDLE: l'attrezzo è PRONTO a catturare fin dal primo secondo, non spento. E
    // `onHarmonicCopy` va agganciato QUI (una volta per seduta, come in App.tsx) — è
    // `primeFreqAudio` che lo richiama a ogni copia armonica generata durante HARMONICS;
    // senza, il contatore COPIES di `PannelloMna` resterebbe fermo a zero per sempre.
    primeFreqAudio.init();
    primeFreqAudio.onHarmonicCopy = (p, freq) => {
      setPrimeCopies(prev => {
        const next = [...prev, { p, freq }];
        mnaSessionRef.current.totalCopies = next.length;
        return next;
      });
    };
    setPrimeIm(0); setPrimeFd(0); setPrimeZone('PRIME'); setPrimeDelta(0); setPrimePStar(2);
    setPrimeCopies([]); setPrimeCaptured(false);
    mnaSessionRef.current = { ...MNA_SESSION_VUOTA };
    setPrimePhase('CAPTURE');
    mnaSessionRef.current.phaseLog.push({ phase: 'CAPTURE', t: Date.now() });
    setMnaAperto(false);
    // ── CORPUS: apertura di seduta — stessa logica di App.tsx ────────────────────────────
    // Va scritta ADESSO, non alla fine: è la configurazione con cui si leggerà tutto il resto,
    // e se la seduta si interrompe le reazioni già scritte devono restare interpretabili.
    // L'identificativo è l'ora d'inizio: unico in pratica, e ordinabile.
    {
      const at = new Date().toISOString();
      corpusSessionRef.current = at;
      if (!corpusAvailable()) {
        journal.addLog({ speaker: 'SYS', time: 0, type: 'highlight', text:
          LC('⚠ ARCHIVIO NON ATTIVO — sei in un browser: questa seduta NON verrà archiviata. Usa l\'applicazione SERENITY.',
             '⚠ ARCHIVE INACTIVE — vous êtes dans un navigateur : cette séance NE SERA PAS archivée. Utilisez l\'application SERENITY.',
             '⚠ ARCHIVE INACTIVE — you are in a browser: this session will NOT be archived. Use the SERENITY application.',
             '⚠ ARCHIVO INACTIVO — estás en un navegador: esta sesión NO se archivará. Usa la aplicación SERENITY.',
             '⚠ ARKIVET AV — du är i en webbläsare: den här sessionen arkiveras INTE. Använd SERENITY-appen.') });
      }
      corpusWrite(sessionRecord(at, at, {
        inst: { muse: muse.museConnection === 'connected', theta: meterC },
        cans: meterC ? theta.setup.config : undefined,
        sens: meterC ? theta.setup.needleScale : undefined,
        sensTrim: meterC ? theta.setup.sensTrim : undefined,
        taPoints: theta.taScale ? theta.taScale.points.length : undefined,
        taFactory: theta.taScale ? theta.taScale.madeAt === 0 : undefined,
      }));
    }
    // Il device del preclear si arma DA QUESTO pacchetto, non da un pulsante che lui preme —
    // stesso protocollo di App.tsx (`SESSION_STATE`).
    if (avvio?.distanza) remote.impostaStatoSeduta('running');
    setAperta(true);
  };
  /**
   * ── APRI UNA SEDUTA — SI CHIEDE PRIMA QUALE STRUMENTO, non si sceglie per l'utente ────────
   * Segnalato: « la logica, METER/MUSE/NESSUN STRUMENTO non sembra ancora implementata ».
   * Stessa regola di App.tsx (`handleStart`): con uno dei due già collegato, o con "senza
   * strumenti" già scelto in questa seduta, non si chiede nulla — è una configurazione scelta,
   * non una mancanza da rimediare. Altrimenti si apre il pannello qui sotto, e l'apertura vera
   * (`avviaSeduta`) aspetta la sua risposta.
   */
  const apri = () => {
    if (!senzaStrumenti && muse.museConnection !== 'connected' && !meterC) {
      setConnSel({ muse: false, theta: false, none: false });
      setNomeConfigDaSalvare(''); setConfigSalvata(false);
      setScegliStrumento(true);
      return;
    }
    avviaSeduta();
  };
  /**
   * ── RICHIAMARE UNA CONFIGURAZIONE — le quattro domande dell'avvio NON si fanno, e gli
   * strumenti scelti l'ultima volta iniziano a collegarsi SUBITO, in sottofondo: quando
   * l'auditor preme APRI UNA SEDUTA sulla schermata principale, il gate di `apri()` qui sopra
   * trova già `senzaStrumenti` o un dispositivo connesso, e passa dritto ad `avviaSeduta()`
   * senza mostrare di nuovo il pannello di scelta. Un solo tocco al posto di sei.
   */
  const richiamaConfigurazione = (cfg: ConfigurazioneSalvata) => {
    setAvvio(cfg.avvio);
    setConnSel(cfg.strumenti);
    setSenzaStrumenti(cfg.strumenti.none);
    if (!cfg.strumenti.none) {
      if (cfg.strumenti.muse) muse.handleConnectMuse();
      if (cfg.strumenti.theta) theta.connect();
    }
  };
  const chiudi = () => {
    sessionClock.end();
    journal.addLog({ speaker: 'SYS', text: t('ser_session_closed'), time: sessionClock.now() });
    corpusSessionRef.current = '';
    if (avvio?.distanza) remote.impostaStatoSeduta('ended');
    // MNA — la seduta finisce, un tono acceso non deve sopravviverle (stessa regola di
    // App.tsx: « seduta finita/in pausa → azzera tutto l'audio »).
    primeFreqAudio.killAll();
    setPrimePhase('IDLE'); setPrimeCopies([]); setPrimeCaptured(false); setMnaAperto(false);
    setAperta(false); setPausata(false);
  };
  /** Si ricomincia dalle domande. Solo a seduta chiusa: cambiare preclear a metà seduta
   *  vorrebbe dire attribuire a una persona quel che ha fatto un'altra. Una seduta a distanza
   *  si chiude anche sulla rete — altrimenti il link resterebbe aperto per il PROSSIMO preclear
   *  scelto qui, che non è più chi era dall'altra parte. */
  const ricomincia = () => {
    if (avvio?.distanza) remote.disconnetti();
    setCollegato(false);
    setAvvio(null);
    // Un nuovo preclear è una nuova domanda: "senza strumenti" scelto per la seduta precedente
    // non deve saltare quella successiva senza chiederlo.
    setSenzaStrumenti(false);
  };

  // ── LE QUATTRO DOMANDE, PRIMA DI TUTTO ────────────────────────────────────────────────
  // Non è una schermata di benvenuto che si può saltare: senza sapere chi audita e chi si
  // audita, una seduta non si può nemmeno archiviare — finirebbe senza nome.
  if (!avvio) {
    return (
      <main style={{ height: '100%', padding: '38px 44px' }}>
        <Avvio onPronto={setAvvio} onRichiama={richiamaConfigurazione} />
      </main>
    );
  }

  // ── LA CONNESSIONE, PRIMA DELLA SEDUTA ────────────────────────────────────────────────────
  // Risposto « a distanza » a `dove`: non si entra nel campo finché il preclear non si è unito.
  // Non è un'attesa forzata — è la stessa ragione per cui EQUILIBRIUM tiene `ConnectionModal`
  // aperto finché isConnected non è vero: cominciare la seduta prima vorrebbe dire un ago che
  // aspetta dati che ancora non arrivano.
  if (avvio.distanza && !collegato) {
    return (
      <main style={{ height: '100%' }}>
        <Connessione
          remote={remote}
          onAnnulla={ricomincia}
          onPronti={() => setCollegato(true)}
        />
      </main>
    );
  }

  // ── LA VALIDAZIONE MANUALE DELL'EP ────────────────────────────────────────────────────────
  // L'auditor l'apre da sé (tasto EP nel piede di pagina) — non è una finestra automatica: in
  // EQUILIBRIUM quella (`EpValidationModal`) non è mai raggiungibile (nessun punto del codice
  // la apre). A tutta pagina come `Avvio`/`Connessione`: SERENITY non impila pannelli.
  if (ep.epManualOpen) {
    return (
      <main style={{ height: '100%' }}>
        <PannelloEp ep={ep} onValidato={() => {
          journal.addLog({
            speaker: 'SYS', time: sessionClock.now(), type: 'highlight',
            text: `✦ ${t('ep_validated')} — ${t('ep_reaction_label')}: ${ep.epReactionType}` +
              (ep.epRealization ? ` — PC: "${ep.epRealization}"` : '') +
              (ep.epVvgi ? ' — VVGI' : ep.epVgi ? ' — VGI' : '') +
              (ep.epAuditorNote ? ` — ${t('ep_note_label')}: ${ep.epAuditorNote}` : ''),
          });
        }} />
      </main>
    );
  }

  // ── CONFIG, raggiungibile in ogni momento ─────────────────────────────────────────────────
  // Segnalato assente: EQUILIBRIUM la tiene in un cassetto apribile sempre, seduta aperta o no.
  // Qui, a tutta pagina come le altre deviazioni — si torna esattamente dove si era.
  if (configAperto) {
    return (
      <main style={{ height: '100%' }}>
        <PannelloConfig onChiudi={() => setConfigAperto(false)} />
      </main>
    );
  }

  return (
    <main style={{
      height: '100%', display: 'grid', gridTemplateRows: 'auto 1fr auto',
      padding: '38px 44px', gap: 24, position: 'relative',
    }}>
      {/* ── METER / MUSE / NESSUNO STRUMENTO — si sceglie PRIMA di aprire ──────────────────────
          Segnalato: « la logica... non sembra ancora implementata ». Le TRE voci sullo stesso
          piano di App.tsx (`connSel`): MUSE e METER si possono spuntare insieme (chi lavora con
          entrambi), "nessuno strumento" è la TERZA possibilità — il gruppo di controllo, non
          l'assenza delle altre due — ed è ESCLUSIVA con loro (`scegliConn`). Galleggia sopra
          tutto, come `PannelloMna`: qui non c'è ancora una seduta da coprire. */}
      {scegliStrumento && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'color-mix(in srgb, var(--s-ground) 80%, transparent)',
        }}>
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 16, padding: '28px 32px',
            borderRadius: 16, background: 'var(--s-disc)', boxShadow: 'var(--s-shadow-lift)',
            minWidth: 320,
          }}>
            <span style={{ fontFamily: 'var(--s-serif)', fontSize: 18, color: 'var(--s-ink)' }}>
              {LC('con che cosa si audita?', 'avec quoi audite-t-on ?', 'what will you audit with?',
                  '¿con qué se audita?', 'vad ska du auditera med?')}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {([
                { k: 'muse' as const, on: connSel.muse, label: 'MUSE', show: true },
                { k: 'theta' as const, on: connSel.theta, label: t('theta_cans') as string, show: !theta.unavailable },
                { k: 'none' as const, on: connSel.none, label: t('no_instruments_mode') as string, show: true },
              ]).filter(o => o.show).map(o => (
                <button key={o.k} onClick={() => scegliConn(o.k)} style={{
                  display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                  border: 'none', cursor: 'pointer', borderRadius: 10, padding: '10px 14px',
                  fontFamily: 'var(--s-sans)', fontSize: 14, letterSpacing: '0.02em',
                  background: o.on ? 'var(--s-disc-sunk)' : 'transparent',
                  color: 'var(--s-ink)', boxShadow: o.on ? 'var(--s-shadow)' : 'none',
                }}>
                  <span style={{ fontFamily: 'var(--s-mono)', width: 14 }}>{o.on ? '✓' : '·'}</span>
                  {o.label}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 12.5, color: 'var(--s-ink-faint)', maxWidth: 280, lineHeight: 1.5 }}>
              {connSel.none ? t('no_instruments_hint') as string : t('connect_either_hint') as string}
            </span>
            {/* ── SALVA QUESTA COMBINAZIONE — chiesto direttamente: « un sistema di
                configurazioni registrate... alla sessione successiva l'Auditor deve poter
                richiamarla ». Qui, non prima: solo ORA le cinque scelte (auditor/PC/dove/
                esperto, già in `avvio`, più strumenti, appena scelti sopra) sono TUTTE
                disponibili insieme — è il primo momento in cui c'è una configurazione intera da
                salvare, non quattro pezzi sparsi lungo l'avvio. */}
            {(connSel.muse || connSel.theta || connSel.none) && avvio && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  value={nomeConfigDaSalvare}
                  onChange={e => { setNomeConfigDaSalvare(e.target.value); setConfigSalvata(false); }}
                  placeholder={LC('nome di questa configurazione…', 'nom de cette configuration…',
                    'name for this configuration…', 'nombre de esta configuración…', 'namn för denna konfiguration…') as string}
                  style={{
                    flex: 1, border: 'none', borderBottom: '1px solid var(--s-ink-ghost)', background: 'none',
                    outline: 'none', fontFamily: 'var(--s-sans)', fontSize: 13, color: 'var(--s-ink)',
                    padding: '2px 4px',
                  }}
                />
                <button
                  disabled={!nomeConfigDaSalvare.trim()}
                  onClick={() => { salvaConfigurazione(nomeConfigDaSalvare, avvio, connSel); setConfigSalvata(true); }}
                  style={{
                    border: 'none', background: 'none', cursor: nomeConfigDaSalvare.trim() ? 'pointer' : 'default',
                    opacity: nomeConfigDaSalvare.trim() ? 1 : 0.4,
                    fontFamily: 'var(--s-sans)', fontSize: 12.5, color: 'var(--s-ink-soft)', whiteSpace: 'nowrap',
                  }}>
                  {configSalvata
                    ? LC('salvata ✓', 'enregistrée ✓', 'saved ✓', 'guardada ✓', 'sparad ✓')
                    : LC('salva', 'enregistrer', 'save', 'guardar', 'spara')}
                </button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 14, justifyContent: 'flex-end' }}>
              <button onClick={() => setScegliStrumento(false)} style={{
                border: 'none', background: 'none', cursor: 'pointer',
                fontFamily: 'var(--s-sans)', fontSize: 13.5, color: 'var(--s-ink-ghost)',
              }}>
                {t('cancel')}
              </button>
              <button
                disabled={!connSel.muse && !connSel.theta && !connSel.none}
                onClick={async () => {
                  const nessuno = connSel.none;
                  setScegliStrumento(false);
                  setSenzaStrumenti(nessuno);
                  if (!nessuno) {
                    if (connSel.muse) await muse.handleConnectMuse();
                    if (connSel.theta) await theta.connect();
                  }
                  avviaSeduta();
                }}
                style={{
                  border: 'none', borderRadius: 999, padding: '9px 22px',
                  cursor: (connSel.muse || connSel.theta || connSel.none) ? 'pointer' : 'default',
                  opacity: (connSel.muse || connSel.theta || connSel.none) ? 1 : 0.4,
                  fontFamily: 'var(--s-sans)', fontSize: 13.5, letterSpacing: '0.06em', textTransform: 'uppercase',
                  background: 'var(--s-ink)', color: 'var(--s-ground)',
                }}>
                {t('ser_open_session')}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── L'INTESTAZIONE, che non è una barra ───────────────────────────────────────────
          Nessun fondo, nessuna linea di separazione: il nome sta posato sulla stessa
          superficie di tutto il resto. Una barra è già un pannello. */}
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <span style={{ fontFamily: 'var(--s-serif)', fontSize: 21, letterSpacing: '0.14em' }}>
          SERENITY
        </span>
        <span style={{ fontFamily: 'var(--s-mono)', fontSize: 12, color: 'var(--s-ink-faint)' }}>
          {__SERENITY_VERSION__}
        </span>
        <span style={{ flex: 1 }} />
        {/* ⚠️ SEGNALATO: « la langue doit pouvoir être changée en cours de route » — non solo
            alle quattro domande d'avvio. Stessi due selettori di `Avvio.tsx`, condivisi da
            `Impostazioni.tsx`: qui restano visibili per tutta la seduta, non solo prima. */}
        <SelettoreTema />
        <SelettoreLingua />
        {/* ── DA QUI IN POI, ZONE SEPARATE E NOMINATE ─────────────────────────────────────────
            Segnalato: « en haut tu dois expliciter les écrits pour comprendre de quoi il
            s'agit, pas seulement les séparer. Il faut qu'on comprenne que ce sont des choses
            différentes ». Vero: tema/lingua, chi audita, gli strumenti, la rete a distanza e
            CONFIG stavano tutti sulla stessa riga, nello stesso grigio, senza una sola linea a
            dire dove finisce l'uno e comincia l'altro. Un separatore verticale sottile fra
            ogni zona (`divisore`, sotto) — MAI un'etichetta su ognuna, quello tornerebbe a
            gridare — e le sole DUE zone davvero ambigue (STRUMENTI/A DISTANZA, più avanti:
            stessa parola "MUSE" poteva dire due dispositivi diversi) hanno anche il nome. */}
        <span style={{ width: 1, height: 16, background: 'var(--s-ink-ghost)', flexShrink: 0 }} />
        {/* Chi audita, chi si audita, e dove — detto in una riga sola e in grigio: sono cose
            che si controllano una volta all'inizio, non che si guardano in seduta.
            ⚠️ Segnalato: « met un icone... pour l'auditeur (SOLO, Expert, etc.) ». Le STESSE
            icone di `Avvio.tsx` per queste stesse scelte (User/Users per solo/con preclear,
            Wrench per esperto, Wifi per a distanza) — non un secondo set da imparare. */}
        <span style={{ fontSize: 13.5, color: 'var(--s-ink-soft)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {avvio.solo
              ? <User size={12} strokeWidth={1.8} aria-hidden="true" />
              : <Users size={12} strokeWidth={1.8} aria-hidden="true" />}
            {nomeAuditor}{avvio.solo ? ` · ${t('ser_alone_tag')}` : ` · ${nomePreclear}`}
          </span>
          {avvio.distanza && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Wifi size={12} strokeWidth={1.8} aria-hidden="true" />
              {t('ser_remote_tag')}
            </span>
          )}
          {avvio.esperto && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Wrench size={12} strokeWidth={1.8} aria-hidden="true" />
              {t('ser_expert_tag')}
            </span>
          )}
        </span>
        {/* ── SALVA QUESTA CONFIGURAZIONE — vedi la nota su `salvaConfigAperto`. Sempre
            raggiungibile da qui, qualunque sia lo stato degli strumenti in questo momento. */}
        {!aperta && (
          <div style={{ position: 'relative' }}>
            <button onClick={() => { setSalvaConfigAperto(v => !v); setConfigSalvata(false); }} style={{
              border: 'none', background: 'none', cursor: 'pointer', padding: 0,
              fontFamily: 'var(--s-sans)', fontSize: 12.5, color: 'var(--s-ink-faint)',
            }}>
              {LC('salva questa configurazione', 'sauvegarder cette configuration',
                'save this configuration', 'guardar esta configuración', 'spara denna konfiguration')}
            </button>
            {salvaConfigAperto && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 8, zIndex: 40,
                display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px',
                borderRadius: 12, background: 'var(--s-disc)', boxShadow: 'var(--s-shadow-lift)',
                minWidth: 260,
              }}>
                <span style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--s-ink-faint)' }}>
                  {LC('auditor, preclear, locale/distanza, e gli strumenti connessi in questo momento — tutto insieme.',
                    'auditeur, préclair, local/distance, et les instruments connectés en ce moment — le tout ensemble.',
                    'auditor, preclear, local/distance, and the instruments connected right now — all together.',
                    'auditor, preclear, local/distancia, y los instrumentos conectados ahora mismo — todo junto.',
                    'auditor, preclear, lokal/distans, och instrumenten som är anslutna just nu — allt tillsammans.')}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    value={nomeConfigDaSalvare}
                    onChange={e => { setNomeConfigDaSalvare(e.target.value); setConfigSalvata(false); }}
                    placeholder={LC('nome di questa configurazione…', 'nom de cette configuration…',
                      'name for this configuration…', 'nombre de esta configuración…', 'namn för denna konfiguration…') as string}
                    style={{
                      flex: 1, border: 'none', borderBottom: '1px solid var(--s-ink-ghost)', background: 'none',
                      outline: 'none', fontFamily: 'var(--s-sans)', fontSize: 13, color: 'var(--s-ink)',
                      padding: '2px 4px',
                    }}
                  />
                  <button
                    disabled={!nomeConfigDaSalvare.trim()}
                    onClick={() => {
                      salvaConfigurazione(nomeConfigDaSalvare, avvio,
                        { muse: museOk, theta: meterC, none: senzaStrumenti || (!museOk && !meterC) });
                      setConfigSalvata(true);
                    }}
                    style={{
                      border: 'none', background: 'none', cursor: nomeConfigDaSalvare.trim() ? 'pointer' : 'default',
                      opacity: nomeConfigDaSalvare.trim() ? 1 : 0.4,
                      fontFamily: 'var(--s-sans)', fontSize: 12.5, color: 'var(--s-ink-soft)', whiteSpace: 'nowrap',
                    }}>
                    {configSalvata
                      ? LC('salvata ✓', 'enregistrée ✓', 'saved ✓', 'guardada ✓', 'sparad ✓')
                      : LC('salva', 'enregistrer', 'save', 'guardar', 'spara')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        <span style={{ width: 1, height: 16, background: 'var(--s-ink-ghost)', flexShrink: 0 }} />
        {/* ── LE CONNESSIONI, UN PUNTO E UNA PAROLA PER DISPOSITIVO ──────────────────────────
            Segnalato: deve capirsi SUBITO quale dispositivo è collegato, quale non lo è, se
            regge, quale aspetta, se c'è un problema, quando sta cercando — senza diventare un
            pannello diagnostico. `IndicatoreConnessione` fa questo, e SOLO questo, per ognuno
            dei dispositivi reali di questa seduta. Vedi la nota in testa a quel file per la
            scelta dei tre colori.
            L'etichetta "STRUMENTI" qui davanti: la sola zona dove due parole simili (MUSE
            locale qui, MUSE del preclear più avanti se a distanza) potevano confondersi. */}
        <span style={{ fontFamily: 'var(--s-sans)', fontSize: 10.5, letterSpacing: '0.12em',
                      textTransform: 'uppercase', color: 'var(--s-ink-ghost)' }}>
          {LC('strumenti', 'instruments', 'instruments', 'instrumentos', 'instrument')}
        </span>
        <IndicatoreConnessione
          onClick={muse.handleConnectMuse}
          icona={<Headphones size={13} strokeWidth={1.8} />}
          etichetta={
            muse.museConnection === 'connected'
              ? (museGate.museContact ? 'MUSE ✓' : t('ser_meter_disconnected') as string)
              : muse.museConnection === 'searching' ? t('searching') as string ?? '…' : t('ser_connect_muse') as string
          }
          dettaglio={muse.museConnection === 'connected' && batteryLevel !== null ? `${batteryLevel}%` : null}
          stato={
            muse.museConnection === 'connected'
              ? (museGate.museContact ? 'connesso' : 'errore')
              : muse.museConnection === 'searching' ? 'cercando' : 'in-attesa'
          }
        />
        {/* ── IL METER, LO STESSO PUNTO-E-PAROLA DEL MUSE ─────────────────────────────────────
            Segnalato: « non vedo dove posso connettere il METER ». `theta.connect()` esisteva
            già (fase 5, l'ago si disegna) ma nessun elemento dell'interfaccia lo chiamava mai —
            qui, esattamente come per MUSE accanto, un click sul punto avvia (o chiude) la
            connessione WebHID. Il "senza driver" del browser (`theta.unavailable`) resta
            distinguibile da "non ancora connesso": due stati diversi, non uno solo. */}
        <IndicatoreConnessione
          onClick={theta.unavailable ? undefined : (meterC ? theta.disconnect : theta.connect)}
          icona={<Gauge size={13} strokeWidth={1.8} />}
          etichetta={
            // ⚠️ Segnalato: « la connessione METER non la vedo, vedo invece connessione MUSE ».
            // La causa vera: questa etichetta usava `theta_uncalibrated` ("non tarato") — una
            // parola che non nomina il meter, e che l'auditor legge come "MUSE" o comunque
            // come qualcos'altro, non come lo stato del Theta-Meter. `ser_meter_unavailable`
            // ("meter non disponibile qui") dice la cosa giusta: È il meter, e non lo si può
            // usare in questo browser/ambiente.
            theta.unavailable ? t('ser_meter_unavailable') as string
              : meterC ? 'METER ✓'
              : theta.status === 'connecting' ? '…' : t('theta_connect') as string
          }
          stato={
            theta.unavailable ? 'spento'
              : meterC ? 'connesso'
              : theta.status === 'connecting' ? 'cercando' : 'in-attesa'
          }
        />
        {/* ── LA SUA ESPANSIONE — due lattine/lattina sola, le due prove, la taratura TA ──────
            Segnalato: la stessa connessione non deve avere due abitudini diverse (una in alto,
            una in fondo alla pagina) da imparare. Qui, SOLO a meter connesso, una freccia
            accanto al suo stesso indicatore apre `PannelloMeter` come un cassetto ancorato
            proprio lì (`position:absolute`, sotto l'intestazione) — la stessa idea del cassetto
            di CONFIG, non un secondo luogo. */}
        {meterC && (
          <button onClick={() => setMeterSetupAperto(v => !v)} style={{
            border: 'none', background: 'none', cursor: 'pointer', padding: 0,
            fontFamily: 'var(--s-sans)', fontSize: 12.5, color: 'var(--s-ink-faint)',
          }}>
            {/* ⚠️ Non `theta_setup` ("Assetto") — segnalato: « on ne sait pas les réglages à
                quoi correspondent ». "Assetto" non dice nemmeno che è il METER a essere in
                gioco; questa parola lo dice due volte (il nome dello strumento, e "configura"
                invece di un termine tecnico). */}
            {meterSetupAperto ? '▴' : '▾'} {LC('configura il meter', 'configurer le meter',
              'configure the meter', 'configurar el meter', 'konfigurera metern')}
          </button>
        )}
        {/* Un problema HARDWARE (fascia scollegata a metà lettura, driver che si blocca) si dice
            in ambra — non è un allarme rosso: è un'informazione da controllare, come lo stato
            del MUSE accanto. Sparisce da sé al prossimo dato buono (`useChargeEngine` lo azzera
            al primo METRICS_UPDATE valido). */}
        {hardwareError && (
          <span style={{ fontSize: 13, color: 'var(--s-reserve)' }}>{hardwareError}</span>
        )}
        {/* La RETE verso il PC a distanza, e il SUO Muse — due dispositivi, due indicatori. Prima
            erano un'unica riga: « quale dei due non risponde? » si doveva dedurre dal testo.
            ⚠️ Segnalato: « bisogna capire che sono cose diverse ». Il divisore + l'etichetta
            "A DISTANZA" dicono che questa zona parla del PRECLEAR, non dell'auditor — e "MUSE"
            qui diventa "MUSE (preclear)": la stessa parola di STRUMENTI qui sopra, senza dire
            DI CHI, avrebbe potuto leggersi come una ripetizione invece che come un dispositivo
            diverso, su una persona diversa, in un luogo diverso. */}
        {avvio.distanza && (
          <>
            <span style={{ width: 1, height: 16, background: 'var(--s-ink-ghost)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--s-sans)', fontSize: 10.5, letterSpacing: '0.12em',
                          textTransform: 'uppercase', color: 'var(--s-ink-ghost)' }}>
              {LC('a distanza', 'à distance', 'remote', 'a distancia', 'på distans')}
            </span>
            <IndicatoreConnessione
              icona={<Wifi size={13} strokeWidth={1.8} />}
              etichetta={t('drawer_pc') as string}
              stato={
                remote.isConnected ? 'connesso'
                  : remote.errore ? 'errore'
                  : remote.tunnelLoading ? 'cercando' : 'in-attesa'
              }
              dettaglio={
                remote.isConnected ? (t('conn_badge_auditor_ok') as string)
                  : remote.errore ? remote.errore
                  : t(remote.tunnelLoading ? 'conn_internet_loading' : 'conn_badge_auditor_waiting') as string
              }
            />
            <IndicatoreConnessione
              icona={<Headphones size={13} strokeWidth={1.8} />}
              etichetta={LC('MUSE (preclear)', 'MUSE (préclair)', 'MUSE (preclear)', 'MUSE (preclear)', 'MUSE (preclear)') as string}
              stato={
                !remote.isConnected ? 'in-attesa'
                  : remote.remoteMuseConnected ? 'connesso' : 'errore'
              }
              dettaglio={
                remote.isConnected
                  ? (remote.remoteMuseConnected
                      ? (remote.remoteBatteryLevel !== null ? `${remote.remoteBatteryLevel}%` : '✓')
                      : t('conn_muse_preclear_disconnected') as string)
                  : null
              }
            />
          </>
        )}
        <span style={{ width: 1, height: 16, background: 'var(--s-ink-ghost)', flexShrink: 0 }} />
        {/* CONFIG — raggiungibile in ogni momento, come il cassetto di EQUILIBRIUM. */}
        <button onClick={() => setConfigAperto(true)} title={t('config') as string} style={{
          border: 'none', background: 'none', cursor: 'pointer', padding: 0,
          display: 'flex', color: 'var(--s-ink-soft)',
        }}>
          <Settings size={16} strokeWidth={1.6} />
        </button>
      </header>

      {/* ── IL CASSETTO DEL METER — ancorato SOTTO l'intestazione, dove sta il suo indicatore ──
          Non nel flusso della pagina (galleggia, `position:absolute`, come le camere qui sotto e
          il pannello MNA più giù): aprirlo non deve spingere in basso tutto il resto — la stessa
          ragione per cui era sbagliato tenerlo fisso in fondo alla pagina. Si chiude da sé se il
          meter si disconnette (vedi l'`useEffect` accanto a `meterSetupAperto`). */}
      {meterSetupAperto && meterC && (
        <div style={{ position: 'absolute', top: 76, right: 44, zIndex: 30 }}>
          <PannelloMeter theta={theta} provaTa={provaTa} />
        </div>
      )}

      {/* ── LE CAMERE, GRANDI, FUORI DALL'INTESTAZIONE ─────────────────────────────────────────
          Segnalato: « troppo piccole, l'auditor deve vedere il PC correttamente » — 44 px
          nell'intestazione erano un'icona, non un volto. Qui galleggiano SOPRA la superficie,
          ancorate all'angolo (`position:absolute` su `main`, non nel flusso della sezione): lo
          strumento al centro NON perde un pixel della sua taglia per fare posto alle camere —
          la stessa regola per cui il quadrante è `w-full h-full` e non un cerchio fra i moduli.
          CAM 2 (PC), la priorità: molto più grande. CAM 1 (auditor), un controllo secondario:
          più piccola. `moduleVis`/CONFIG decide se sono accese; `opacita` legge la trasparenza.
          ⚠️ Segnalato DI NUOVO (stessa giornata): 190 px restavano piccoli — « l'auditeur doit
          voir le PC correctement » non era ancora vero. Portata a 260 (CAM 1 a 130, la stessa
          proporzione fra le due): la priorità dichiarata nel testo qui sopra ora si vede anche
          nei numeri. */}
      {aperta && (moduleVis.cam1 || (moduleVis.cam2 && (avvio.distanza || avvio.solo))) && (
        <div style={{
          position: 'absolute', top: 76, right: 44, zIndex: 5,
          display: 'flex', alignItems: 'flex-start', gap: 24,
        }}>
          {moduleVis.cam1 && (
            <CameraCerchio
              dimensione={130}
              titolo={t('cam1') as string}
              offlineLabel={t('camera_offline') as string}
              opacita={uiAlpha}
              collassata={cam1Collassata}
              onToggleCollasso={() => setCam1Collassata(v => !v)}
            />
          )}
          {moduleVis.cam2 && (avvio.distanza || avvio.solo) && (
            <CameraCerchio
              dimensione={260}
              titolo={t('cam2') as string}
              externalStream={avvio.distanza ? (remote.remoteStream ?? null) : undefined}
              offlineLabel={t('camera_offline') as string}
              opacita={uiAlpha}
              collassata={cam2Collassata}
              onToggleCollasso={() => setCam2Collassata(v => !v)}
            />
          )}
        </div>
      )}

      {/* ── IL CAMPO ──────────────────────────────────────────────────────────────────────
          Lo strumento occupa lo spazio, come in EQUILIBRIUM — non è un modulo fra gli altri,
          è QUELLO su cui gli altri si dispongono. I quattro cerchi che diventeranno i moduli
          (fase 6+) restano ai bordi: compaiono quando servono, e per ora sono spenti. */}
      <section style={{
        position: 'relative', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16, minHeight: 0,
      }}>
        {/*
          ── LE STESSE DIMENSIONI, NON SOLO GLI STESSI COLORI ────────────────────────────
          Segnalato più volte di seguito: prima « stesso disegno, stessa grafica » (i colori),
          poi « lo schermo dell'arco è piccolo, devi avere le stesse dimensioni che in
          Equilibrium », infine « aiguilles avec light… le fond de l'arc doit pouvoir être
          blanc perle aussi ». Giusto: in EQUILIBRIUM il quadrante non è un cerchio fra i
          moduli — è `w-full h-full` del suo spazio. Qui niente `Cerchio`: la proporzione vera
          (1600×850) riempie lo spazio disponibile con `aspect-ratio`, esattamente come
          `w-full h-full` fa in EQUILIBRIUM — nessuna taglia inventata, quella che il momento
          concede.

          ── E IL TEMA NON È PIÙ FISSATO ────────────────────────────────────────────────────
          Nessun `forceTheme`: `QuantumSphere` legge la STESSA preferenza condivisa
          (`isLightTheme`, sopra) che governa `SelettoreTema`, senza bisogno di passargliela —
          è la sua lettura di sempre. Il PANNELLO che lo contiene segue la stessa preferenza:
            • SCURO  → il gradiente radiale autentico di EQUILIBRIUM (`AppBackground.tsx`),
              perché i colori chiari dell'ago in tema scuro sarebbero bianco su niente;
            • CHIARO → bianco perla, la superficie STESSA di SERENITY: in tema chiaro l'ago
              disegna già in inchiostro scuro (« STYLE B » del componente), leggibile sulla
              pagina senza bisogno di un pannello a parte — « le fond… blanc perle » è
              letteralmente questo, non un chiaro inventato apposta.

          ── E ORA CON DUE AGHI VERI, NON PIÙ UNO SOLO FINTO ─────────────────────────────────
          Fase 6, secondo passo: `needleOffsetProp` legge `needleEngine` (il motore fisico
          condiviso, lo stesso di App.tsx) invece della costante `SET_OFFSET` — l'ago EEG si
          muove per davvero, non solo quello del Theta-Meter.
        */}
        <div style={{
          width: 'min(100%, 1400px)', aspectRatio: '1600 / 850', maxHeight: 'calc(100% - 44px)',
          borderRadius: 18, overflow: 'hidden', position: 'relative',
          background: isLightTheme
            ? 'var(--s-ground)'
            : 'radial-gradient(130% 120% at 50% 22%, #2e2e33 0%, #2a2a2f 55%, #262629 100%)',
          boxShadow: isLightTheme ? 'var(--s-shadow)' : 'var(--s-shadow-lift)',
          transition: 'background var(--s-calm) var(--s-ease), box-shadow var(--s-calm) var(--s-ease)',
        }}>
          <QuantumSphere
            needleOffsetProp={agoEeg ? needleOffsetEeg : SET_OFFSET}
            thetaOffset={meterC ? theta.offset : null}
            showEegNeedle={agoEeg}
            targetOffset={null}
            needleReactionKey={agoEeg ? needleReactionKey : thetaReactionKey}
            asIsnessState={ep.asIsnessState}
            onClick={() => { theta.resetToSet(); resetNeedleEeg(); }}
            showTrail
            sessionState={aperta ? 'running' : 'idle'}
          />
          {/* ── L'ARCO DEI CICLI — segnalato: « l'arco rappresenta i cicli attraverso i colori,
              questa informazione deve essere mantenuta ». `ClearDial` è un SECONDO arco,
              concentrico a quello dell'ago (stesso perno 800,790, stesso SWEEP) — CONTACT ·
              DISCHARGE · AS-IS (o NULL · RISE · EQUILIBRIUM) coi loro colori, le loro
              suddivisioni, e un puntino di avanzamento agganciato alla stessa geometria
              dell'ago. Prima versione di SERENITY: il ciclo esisteva (arma/valida in fondo
              pagina) ma l'arco non lo diceva più — solo testo. Ripreso TALE E QUALE (stessa
              logica di `QuantumSphere`: la geometria e i colori sono l'informazione, non
              un'americano da re-interpretare) — nessun `forceTheme`, legge la stessa
              preferenza condivisa di `QuantumSphere` accanto. */}
          {/* ── L'ARCO CAMBIA CON IL METODO, MAI CONTEMPORANEO ────────────────────────────────
              In App.tsx `viewMode` mostra UN arco alla volta — MirrorDial PRENDE IL POSTO di
              ClearDial in MIRROR, non gli sta accanto (« l'aiguille + » resta la stessa, solo
              l'arco concentrico cambia). Qui la stessa esclusività senza un `viewMode` a
              parte: basta guardare `mirror.mirrorArmed` — i bottoni d'armamento sotto sono già
              reciprocamente esclusi, quindi i due cicli non possono essere armati insieme. */}
          {mirror.mirrorArmed ? (
            <MirrorDial
              armed={mirror.mirrorArmed}
              valueR={mirror.mirrorDisp.valueR}
              contactQ={mirror.mirrorDisp.contactQ}
              dischargeQ={mirror.mirrorDisp.dischargeQ}
              locked={mirror.mirrorDisp.locked}
              reached={mirror.mirrorDisp.reached}
              isLightTheme={isLightTheme}
              lang={lang}
            />
          ) : toneAttivo ? (
            <ToneDial
              tone={tone.toneOra ?? 0}
              hasMeter={tone.toneHasMeter}
              approx
              located={tone.toneAtStart}
              phase={tone.tonePhase}
              toneAtStart={tone.toneAtStart}
              isLightTheme={isLightTheme}
            />
          ) : (
            <ClearDial
              armed={cycles.cycleArmed}
              asIsPending={cycles.asIsPending}
              manualReady={cycles.manualReady}
              asIsFalse={cycles.asIsFalse}
              asIsIO={cycles.asIsIO}
              onValidate={cycles.validateAsIs}
              deltaStar={deltaStar}
              deltaStarN={deltaStarN}
              isLightTheme={isLightTheme}
              cycleKind={cycles.cycleKind}
              nullPhase={cycles.nullPhase}
            />
          )}
          {/* ── MNA — galleggia SUL quadrante, non lo sostituisce ────────────────────────────
              « Si apre senza lasciare il ciclo »: la seduta resta visibile sotto, com'è in
              App.tsx (ancorato in fondo al pannello dello strumento, non a tutta pagina). */}
          {aperta && moduleVis.mna && mnaAperto && (
            <PannelloMna
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
                // STESSO blocco sul PICCO di I_m della finestra recente di App.tsx
                // (`engine/PrimeFreqTracker.ts`) — l'auditor/PC possono reagire in ritardo,
                // l'istante del clic non è la risposta più forte.
                const best = primeFreqTracker.peak();
                if (!best) return;
                setPrimeIm(best.im); setPrimeFd(best.fd); setPrimePStar(best.ps);
                setPrimeDelta(best.dv); setPrimeZone(best.zone);
                mnaSessionRef.current.finalZone = best.zone;
              }}
              onAudio={payload => {
                // Il tono binaurale punta al cervello del PC — l'auditor lo sente solo in
                // locale per controllo. Stesso inoltro di App.tsx.
                try { networkManager.send({ type: 'MNA_AUDIO', ...payload }, true); } catch { /* noop */ }
              }}
              onChiudi={() => setMnaAperto(false)}
            />
          )}
        </div>
        {/* ── QUALE AGO GUARDARE — SOLO quando c'è davvero una scelta ─────────────────────────
            Segnalato: « les deux aiguilles ? pas vue ». Non è un secondo ago da disegnare
            accanto al primo (App.tsx li disegna insieme apposta MAI — vedi la nota su
            `agoEeg`, sopra): è la scelta stessa che mancava, muta e fissa sul Meter. Due
            pillole, come in App.tsx (qui senza "DUE" — quella terza voce aggiunge anche le
            reazioni dell'altro strumento etichettate, un raffinamento che aspetta il resto
            dell'assessment prima di avere senso). */}
        {museOk && meterC && (
          <div style={{ display: 'flex', gap: 4, padding: 2, borderRadius: 999, background: 'var(--s-disc-sunk)' }}>
            {([{ k: 'eeg' as const, lbl: 'MUSE' }, { k: 'theta' as const, lbl: 'METER' }]).map(o => (
              <button key={o.k} onClick={() => setAgoScelto(o.k)} style={{
                border: 'none', cursor: 'pointer', borderRadius: 999, padding: '4px 12px',
                fontFamily: 'var(--s-sans)', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
                background: agoScelto === o.k ? 'var(--s-disc)' : 'none',
                boxShadow: agoScelto === o.k ? 'var(--s-shadow)' : 'none',
                color: agoScelto === o.k ? 'var(--s-ink)' : 'var(--s-ink-faint)',
              }}>
                {o.lbl}
              </button>
            ))}
          </div>
        )}
        {/* L'orologio resta sulla superficie di SERENITY, fuori dal pannello scuro: si
            guarda una volta ogni tanto, lo strumento in continuazione. */}
        <span style={{
          fontFamily: 'var(--s-mono)', fontSize: 14, letterSpacing: '0.06em',
          color: aperta ? 'var(--s-ink-soft)' : 'var(--s-ink-ghost)',
          transition: 'color var(--s-slow) var(--s-ease)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {orologio(tempo)}
        </span>
        {/* ── IN PAUSA — segnalato: la perdita del MUSE deve fermare la seduta, non solo
            cambiare colore a un puntino in intestazione facile da non notare. Un badge PIENO
            (`.ser-pulse`, lo stesso avviso già usato per « dì l'item… ») proprio accanto
            all'orologio che ha smesso di correre — i due segnali si leggono insieme. */}
        {aperta && pausata && (
          <span className="ser-pulse" style={{
            fontFamily: 'var(--s-sans)', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
            padding: '3px 10px', borderRadius: 999,
            background: 'var(--s-reserve)', color: 'var(--s-ground)',
          }}>
            {LC('in pausa — strumento perso', 'en pause — instrument perdu', 'paused — instrument lost',
              'en pausa — instrumento perdido', 'pausad — instrument förlorat')}
          </span>
        )}

        {/* ── LA LETTURA, DETTA A NUMERI — vedi la nota sopra `LetturaTA`. Solo quando c'è un
            ago EEG davvero collegato: senza MUSE il TA da EEG non significa niente (resta al
            suo valore di riposo), e mostrarlo lo stesso sembrerebbe una lettura vera. */}
        {agoEeg && (
          <span style={{
            fontFamily: 'var(--s-mono)', fontSize: 13, letterSpacing: '0.04em',
            color: 'var(--s-ink-faint)', display: 'flex', gap: 14,
          }}>
            <LetturaTA />
            <LetturaFase t={t} />
            {museGate.signalQuality > 0 && <span>{museGate.signalQuality}%</span>}
            {/* Il lag di Ron e la % di dissoluzione — solo a ciclo armato, come CycleStatusBar
                in App.tsx (senza ciclo il numero non descrive niente). */}
            {cycles.cycleArmed && <LetturaCiclo deltaStar={deltaStar} deltaStarN={deltaStarN} />}
          </span>
        )}

        {/* ⚠️ I QUATTRO CERCHI SATELLITE (assessment, cycle hint, …) SONO STATI TOLTI DA QUI,
            non solo spenti. Erano posizionati per orbitare un cerchio centrale da 380 px; con
            lo strumento che ora occupa quasi tutta la larghezza, quelle stesse coordinate
            fisse li avrebbero messi ADDOSSO al pannello scuro invece che intorno. Tornano
            quando la fase 6 monterà un ciclo vero — accanto a un ingombro reale, non a una
            stima. */}
      </section>

      {/* ── IL GESTO ──────────────────────────────────────────────────────────────────────
          Uno solo. Il guscio sa fare una cosa: aprire e chiudere una seduta sull'orologio
          vero. Tutto il resto delle fasi si appende a questo. */}
      <footer style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <button onClick={aperta ? chiudi : apri} style={{
          border: 'none', cursor: 'pointer',
          background: 'var(--s-disc)', color: 'var(--s-ink)',
          boxShadow: 'var(--s-shadow)',
          borderRadius: 999, padding: '11px 28px',
          fontSize: 14, letterSpacing: '0.1em', textTransform: 'uppercase',
          fontFamily: 'var(--s-sans)',
          transition: `box-shadow var(--s-slow) var(--s-ease)`,
        }}>
          {aperta ? t('ser_close_session') : t('ser_open_session')}
        </button>
        {/* ── IL CICLO — un item, quattro strade, ciascuna col SUO bottone ──────────────────
            Segnalato: « la visibilità dei CICLI non è ottimale... devi fare come in EQUILIBRIUM
            con dei BOTTONI più visibili per ogni ciclo separatamente, uno accanto all'altro ».
            Erano quattro link fantasma (nessun bordo, nessun fondo, differenti solo per una
            sfumatura di grigio) — la stessa scelta grafica dell'informazione che qui doveva
            SPICCARE. Ora sono quattro pillole vere, ciascuna col SUO nome scritto per intero
            (CONTACT/NULL/MIRROR/TONE, non « dai l'item » che non dice quale dei quattro) e un
            colore che le distingue — gli stessi tre segnali di `tokens.css` più l'inchiostro
            neutro per TONE (mai un quarto colore nuovo), non gli hex di App.tsx ridisegnati
            uguali: stessa struttura, grafica di SERENITY. */}
        {aperta && !cycles.cycleArmed && !mirror.mirrorArmed && !toneAttivo && (
          <>
            <input
              value={item}
              onChange={e => setItem(e.target.value)}
              placeholder={t('ser_item_placeholder') as string}
              onKeyDown={e => { if (e.key === 'Enter') cycles.armCycle('charge'); }}
              style={{
                border: 'none', borderBottom: '1px solid var(--s-ink-ghost)', background: 'none',
                outline: 'none', fontFamily: 'var(--s-serif)', fontSize: 14, color: 'var(--s-ink)',
                padding: '2px 4px', width: 200,
              }}
            />
            {([
              { k: 'contact', hue: 'var(--s-still)', label: 'CONTACT',
                onClick: () => cycles.armCycle('charge') },
              { k: 'null', hue: 'var(--s-alive)', label: 'NULL',
                onClick: () => cycles.armCycle('null') },
              // ── MIRROR — il terzo metodo, escluso a vicenda con CONTACT/NULL ────────────
              { k: 'mirror', hue: 'var(--s-reserve)', label: 'MIRROR', onClick: () => mirror.armMirror() },
              // ── TONE SCALE — il quarto metodo, escluso a vicenda con gli altri tre. A
              // differenza degli altri tre non si "arma" per un solo item: si ENTRA nel
              // metodo (`toneAttivo`) e ci si lavora per più resistenze di fila.
              { k: 'tone', hue: null, label: 'TONE', onClick: () => setToneAttivo(true) },
            ]).map(c => (
              <button key={c.k} onClick={c.onClick} style={{
                border: `1.5px solid ${c.hue ?? 'var(--s-ink-ghost)'}`, cursor: 'pointer',
                borderRadius: 999, padding: '6px 14px', background: 'var(--s-disc)',
                fontFamily: 'var(--s-sans)', fontSize: 13, fontWeight: 700, letterSpacing: '0.05em',
                color: c.hue ?? 'var(--s-ink-soft)',
              }}>
                {c.label}
              </button>
            ))}
          </>
        )}
        {/* ── TONE SCALE, ATTIVO — locate → raise → done, si ripete per ogni resistenza ────────
            (a) LOCALIZZA: da dove si parte (misurato col meter, o dichiarato dall'auditor senza
            strumenti); (b) RAISE: il comando "portalo a tono 40" ripetuto finché non c'è più
            reazione, poi dichiarato raggiunto; (c) DONE: si riparte con un'altra resistenza, o
            si esce del tutto. Stesse chiamate al motore di App.tsx (`localizzaTone`/
            `chiudiTone`/`resetTone`), stesso testo dei tre tempi. */}
        {aperta && toneAttivo && (
          <>
            {/* Stesso badge di CONTACT/NULL, senza colore acceso (TONE non ne ha uno — mai un
                quarto segnale nuovo): il bordo e il nome per intero bastano a dire quale dei
                quattro sta girando. */}
            <span style={{
              fontFamily: 'var(--s-sans)', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
              padding: '3px 10px', borderRadius: 999, border: '1px solid var(--s-ink-ghost)',
              color: 'var(--s-ink-soft)',
            }}>
              TONE
            </span>
            <span style={{ fontFamily: 'var(--s-serif)', fontSize: 14, color: 'var(--s-ink)' }}>
              {item || t('ser_item_placeholder')}
            </span>
            {faseCiclo === 'tone.say_item' && (
              <>
                <span className="ser-pulse" style={{
                  fontFamily: 'var(--s-sans)', fontSize: 12.5, letterSpacing: '0.04em',
                  color: 'var(--s-reserve)',
                }}>
                  {LC('dì la resistenza…', 'dis la résistance…', 'say the resistance…', 'di la resistencia…', 'säg motståndet…')}
                </span>
                <button onClick={dichiaraItemDetto} style={{
                  border: 'none', cursor: 'pointer', background: 'none',
                  fontFamily: 'var(--s-sans)', fontSize: 12.5, color: 'var(--s-ink-faint)',
                }}>
                  {LC('l\'ho detta', 'je l\'ai dite', 'said it', 'la he dicho', 'sa det')}
                </button>
              </>
            )}
            {tone.tonePhase === 'locate' && (
              <>
                {!tone.toneHasMeter && (
                  <select value={tone.toneAssessed} onChange={e => tone.setToneAssessed(Number(e.target.value))}
                    style={{
                      border: 'none', borderBottom: '1px solid var(--s-ink-ghost)', background: 'none',
                      outline: 'none', fontFamily: 'var(--s-mono)', fontSize: 13, color: 'var(--s-ink)',
                      cursor: 'pointer', padding: '2px 4px',
                    }}>
                    {TONE_LABELS.map(v => (
                      <option key={v} value={v}>
                        {v > 0 ? `+${v}` : v} · {levelName(exactLevelName(v) ?? '', lang)}
                      </option>
                    ))}
                  </select>
                )}
                <button onClick={() => tone.localizzaTone()} style={{
                  border: 'none', cursor: 'pointer', background: 'none',
                  fontFamily: 'var(--s-sans)', fontSize: 13.5, color: 'var(--s-ink-soft)',
                }}>
                  {t('ser_arm_contact') /* stesso gesto/testo di App.tsx: "DAI L'ITEM" */}
                </button>
              </>
            )}
            {(tone.tonePhase === 'raise' || tone.tonePhase === 'done') && (
              <span style={{ fontFamily: 'var(--s-mono)', fontSize: 13, color: 'var(--s-ink-faint)' }}>
                {tone.toneAtStart !== null ? `${tone.toneAtStart > 0 ? '+' : ''}${tone.toneAtStart.toFixed(0)} → ` : ''}
                <b style={{ color: 'var(--s-reserve)' }}>+40</b>
              </span>
            )}
            {tone.tonePhase === 'raise' && (
              <>
                <button onClick={() => tone.setToneRipetizioni(v => v + 1)} style={{
                  border: 'none', cursor: 'pointer', background: 'none',
                  fontFamily: 'var(--s-sans)', fontSize: 13.5, color: 'var(--s-ink-soft)',
                }}>
                  {LC('portalo a tono 40', 'mène-le au ton 40', 'raise it to tone 40', 'llévalo al tono 40', 'för det till ton 40')}
                  {tone.toneRipetizioni > 0 ? ` ×${tone.toneRipetizioni}` : ''}
                </button>
                <button onClick={() => { tone.chiudiTone(true); tone.setTonePhase('done'); }} style={{
                  border: 'none', cursor: 'pointer', background: 'none',
                  fontFamily: 'var(--s-sans)', fontSize: 13.5, color: 'var(--s-still)',
                }}>
                  {LC('tono quaranta raggiunto', 'ton quarante atteint', 'tone forty reached', 'tono cuarenta alcanzado', 'ton fyrtio nådd')}
                </button>
              </>
            )}
            {tone.tonePhase === 'done' && (
              <button onClick={() => tone.resetTone()} style={{
                border: 'none', cursor: 'pointer', background: 'none',
                fontFamily: 'var(--s-sans)', fontSize: 13.5, color: 'var(--s-still)',
              }}>
                {LC('altra resistenza', 'autre résistance', 'another resistance', 'otra resistencia', 'annat motstånd')}
              </button>
            )}
            <button onClick={() => {
              if (tone.tonePhase === 'raise') tone.chiudiTone(false);
              tone.resetTone(); setToneAttivo(false);
            }} style={{
              border: 'none', cursor: 'pointer', background: 'none',
              fontFamily: 'var(--s-sans)', fontSize: 13.5, color: 'var(--s-ink-ghost)',
            }}>
              {t('cancel')}
            </button>
          </>
        )}
        {/* ── MIRROR, ARMATO — tre tempi, non due ──────────────────────────────────────────
            (a) il VALORE 1–10 dell'item — dieci bottoni, la quantità di carica; (b) il
            DOPPIO da raggiungere, con la sua dichiarazione; (c) OTTENUTO → valida. Stessa
            sequenza di App.tsx (`bottoneCiclo`, ramo 'mirror'), stessi tre passi — non due,
            come una prima lettura avrebbe fatto (« dai l'item » dritto a « ottenuto », senza
            il valore in mezzo: segnalato in App.tsx stesso come l'errore da NON ripetere). */}
        {aperta && mirror.mirrorArmed && (
          <>
            {/* Stesso badge di CONTACT/NULL/TONE, colore riserva — lo stesso della pillola che
                lo arma qui sopra. */}
            <span style={{
              fontFamily: 'var(--s-sans)', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
              padding: '3px 10px', borderRadius: 999,
              background: 'var(--s-reserve)', color: 'var(--s-ground)',
            }}>
              MIRROR
            </span>
            <span style={{ fontFamily: 'var(--s-serif)', fontSize: 14, color: 'var(--s-ink)' }}>
              {item || t('ser_item_placeholder')}
            </span>
            {faseCiclo === 'mirror.say_item' && (
              <>
                <span className="ser-pulse" style={{
                  fontFamily: 'var(--s-sans)', fontSize: 12.5, letterSpacing: '0.04em',
                  color: 'var(--s-reserve)',
                }}>
                  {LC('dì l\'item…', 'dis l\'item…', 'say the item…', 'di el ítem…', 'säg item…')}
                </span>
                <button onClick={dichiaraItemDetto} style={{
                  border: 'none', cursor: 'pointer', background: 'none',
                  fontFamily: 'var(--s-sans)', fontSize: 12.5, color: 'var(--s-ink-faint)',
                }}>
                  {LC('l\'item è stato detto', 'l\'item a été dit', 'the item has been said', 'el ítem ha sido dicho', 'item har sagts')}
                </button>
              </>
            )}
            {!mirror.mirrorDisp.locked ? (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--s-sans)', fontSize: 13, color: 'var(--s-ink-faint)', marginRight: 6 }}>
                  {LC('quanta carica?', 'combien de charge ?', 'how much charge?', '¿cuánta carga?', 'hur mycket laddning?')}
                </span>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => (
                  <button key={v} onClick={() => {
                    mirror.mirrorCycle.setManualValue(v);
                    mirror.setMirrorDisp({ contactQ: mirror.mirrorCycle.contactQ, dischargeQ: 0,
                      locked: true, reached: false, valueR: mirror.mirrorCycle.valueR });
                  }} style={{
                    border: 'none', cursor: 'pointer', borderRadius: 999, width: 26, height: 26,
                    fontFamily: 'var(--s-mono)', fontSize: 12.5, fontWeight: 700,
                    background: 'var(--s-disc-sunk)', color: 'var(--s-ink)',
                  }}>
                    {v}
                  </button>
                ))}
              </div>
            ) : !mirror.mirrorDisp.reached ? (
              <>
                <span style={{ fontFamily: 'var(--s-sans)', fontSize: 13, color: 'var(--s-ink-faint)' }}>
                  {LC('portalo al doppio', 'mène-le au double', 'take it to the double', 'llévalo al doble', 'för det till dubbeln')}
                  {' — '}{mirror.mirrorDisp.valueR.toFixed(0)} → {(2 * mirror.mirrorDisp.valueR).toFixed(0)}
                </span>
                <button onClick={() => {
                  mirror.mirrorCycle.declareReached();
                  mirror.setMirrorDisp({ contactQ: mirror.mirrorCycle.contactQ, dischargeQ: mirror.mirrorCycle.dischargeQ,
                    locked: true, reached: true, valueR: mirror.mirrorCycle.valueR });
                }} style={{
                  border: 'none', cursor: 'pointer', background: 'none',
                  fontFamily: 'var(--s-sans)', fontSize: 13.5, color: 'var(--s-still)',
                }}>
                  {LC('doppio raggiunto', 'double atteint', 'double reached', 'doble alcanzado', 'dubbeln nådd')}
                </button>
              </>
            ) : (
              <button onClick={() => mirror.stopMirror()} style={{
                border: 'none', cursor: 'pointer', background: 'none',
                fontFamily: 'var(--s-sans)', fontSize: 13.5, color: 'var(--s-still)',
              }}>
                {LC('ottenuto — valida', 'obtenu — valider', 'obtained — validate', 'obtenido — validar', 'uppnått — validera')}
              </button>
            )}
            <button onClick={() => mirror.stopMirror()} style={{
              border: 'none', cursor: 'pointer', background: 'none',
              fontFamily: 'var(--s-sans)', fontSize: 13.5, color: 'var(--s-ink-ghost)',
            }}>
              {t('cancel')}
            </button>
          </>
        )}
        {aperta && cycles.cycleArmed && (
          <>
            {/* ── QUALE CICLO STA GIRANDO — segnalato: « il CICLO CONTACT non è specificato in
                basso, c'è solo DAI L'ITEM ». Vero: un campo di testo e un contatore in grigio
                non dicono CONTACT finché non si legge la scritta piccola accanto. Ora un badge
                pieno, dello STESSO colore della pillola che l'ha armato — si vede prima di
                leggere, non dopo. */}
            <span style={{
              fontFamily: 'var(--s-sans)', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
              padding: '3px 10px', borderRadius: 999,
              background: cycles.cycleKind === 'null' ? 'var(--s-alive)' : 'var(--s-still)',
              color: 'var(--s-ground)',
            }}>
              {cycles.cycleKind === 'null' ? 'NULL' : 'CONTACT'}
            </span>
            <span style={{ fontFamily: 'var(--s-serif)', fontSize: 14, color: 'var(--s-ink)' }}>
              {item || t('ser_item_placeholder')}
            </span>
            {/* ── « DÌ L'ITEM… » — segnalato insieme: la logica di darlo a voce già esiste nel
                motore (`cycleAwaitItemRef`), ma finché nessuno lo dice a schermo l'auditor non
                sa che il ciclo sta ASPETTANDO, non è già a mock-up. Pulsa finché la voce (o la
                dichiarazione a mano qui accanto) non arriva. */}
            {(faseCiclo === 'contact.say_item' || faseCiclo === 'null.say_item') && (
              <>
                <span className="ser-pulse" style={{
                  fontFamily: 'var(--s-sans)', fontSize: 12.5, letterSpacing: '0.04em',
                  color: 'var(--s-reserve)',
                }}>
                  {LC('dì l\'item…', 'dis l\'item…', 'say the item…', 'di el ítem…', 'säg item…')}
                </span>
                <button onClick={dichiaraItemDetto} title={LC(
                    'la trascrizione non c\'è o non si sente — dichiara che l\'item è stato detto',
                    'pas de transcription ou pas de son — déclare que l\'item a été dit',
                    'no transcript or no sound — declare the item has been said',
                    'sin transcripción o sin sonido — declara que el ítem ha sido dicho',
                    'ingen transkription eller inget ljud — förklara att item har sagts') as string}
                  style={{
                  border: 'none', cursor: 'pointer', background: 'none',
                  fontFamily: 'var(--s-sans)', fontSize: 12.5, color: 'var(--s-ink-faint)',
                }}>
                  {LC('l\'item è stato detto', 'l\'item a été dit', 'the item has been said', 'el ítem ha sido dicho', 'item har sagts')}
                </button>
              </>
            )}
            {/* ── IL CONTATORE DEL CICLO IN CORSO — mancante ─────────────────────────────
                In App.tsx un chip dice, per il SOLO metodo in corso (CONTACT con CONTACT,
                NULL con NULL — « due contatori confondono », scelta utente), quanti cicli
                sono stati armati e quanti portati a compimento questa seduta. `cycleStats`
                arriva già dallo stesso `useContactNullCycle` — solo non era letto qui. */}
            <span style={{ fontFamily: 'var(--s-mono)', fontSize: 12.5, color: 'var(--s-ink-faint)' }}>
              {cycles.cycleKind === 'null'
                ? `${cycles.cycleStats.nStarted} · ${cycles.cycleStats.nDone} CLEAR`
                : `${cycles.cycleStats.cStarted} · ${cycles.cycleStats.cDone} AS-IS`}
            </span>
            {/* ── ANNULLA — l'uscita SENZA validare, mancante ────────────────────────────
                Segnalato nella revisione funzionale: in App.tsx chiudere un ciclo armato ha
                DUE strade — validare (uno degli esiti a destra) o ANNULLA, che chiude il
                ciclo e lo lascia « non validato » nel rapporto (`finalizeCycle(false)`,
                distinto da ogni esito). SERENITY aveva solo la prima: niente modo di uscire
                da un ciclo armato per errore senza forzare un esito che non è successo. */}
            <button onClick={() => cycles.finalizeCycle(false)} style={{
              border: 'none', cursor: 'pointer', background: 'none',
              fontFamily: 'var(--s-sans)', fontSize: 13.5, color: 'var(--s-ink-ghost)',
            }}>
              {t('cancel')}
            </button>
            {cycles.cycleKind === 'null' ? (
              <>
                <button onClick={() => cycles.validateClearRead(true)} style={{
                  border: 'none', cursor: 'pointer', background: 'none',
                  fontFamily: 'var(--s-sans)', fontSize: 13.5, color: 'var(--s-still)',
                }}>
                  {t('ser_validate_equilibrium_vgi')}
                </button>
                <button onClick={() => cycles.validateClearRead(false)} style={{
                  border: 'none', cursor: 'pointer', background: 'none',
                  fontFamily: 'var(--s-sans)', fontSize: 13.5, color: 'var(--s-ink-faint)',
                }}>
                  {t('ser_validate_equilibrium_novgi')}
                </button>
                {/* ── IL TERZO ESITO, MANCANTE ────────────────────────────────────────────
                    Segnalato nella revisione funzionale: il ciclo NULL in App.tsx ha TRE
                    esiti pari (VGI · senza VGI · NON RICARICA), non due — « non ricarica » è,
                    testuale App.tsx, « il risultato diagnostico più prezioso del ciclo NULL »:
                    senza dichiararlo, il ciclo resta indistinguibile da uno abbandonato, e
                    quel ramo del rapporto/CORPUS resta irraggiungibile. SERENITY aveva SOLO i
                    primi due — un bottone intero perso, non solo uno stile. */}
                <button onClick={() => cycles.declareNoRecharging()} style={{
                  border: 'none', cursor: 'pointer', background: 'none',
                  fontFamily: 'var(--s-sans)', fontSize: 13.5, color: 'var(--s-reserve)',
                }}>
                  {t('ser_no_recharging')}
                </button>
              </>
            ) : (
              <button onClick={() => cycles.validateAsIs()} style={{
                border: 'none', cursor: 'pointer', background: 'none',
                fontFamily: 'var(--s-sans)', fontSize: 13.5, color: 'var(--s-still)',
              }}>
                {t('ser_validate_asis')}
              </button>
            )}
          </>
        )}
        {/* Il giornale NON si mostra: scorrere alla periferia tira l'occhio proprio mentre
            l'ago legge. Qui si dice solo che sta scrivendo, e quante righe ha. */}
        <span style={{ fontSize: 13, color: 'var(--s-ink-faint)' }}>
          {t('ser_journal')} · {journal.logs.length} {t(journal.logs.length === 1 ? 'ser_line' : 'ser_lines')}
        </span>
        {/* ── IL METER — segnalato: « comment peux-tu mettre la connexion METER EN BAS, le MUSE
            en haut ». La sua connessione e la sua configurazione stanno ORA solo in
            intestazione (l'indicatore + la freccia accanto, vedi sopra) — niente più un secondo
            pannello quaggiù da imparare a parte. */}
        {/* ── ASSESSMENT — segnalato: « ne marche pas et n'apparaît pas ». Un bottone acceso
            (come MNA/EP accanto) che avvia/ferma la cattura; gli item dati a voce (o dai
            cicli, che lo accendono da sé — `attivaAssessment`) compaiono nel cassetto qui
            sotto, ancorato al bottone come quello del meter in intestazione — non un pannello
            lontano da scoprire. */}
        {aperta && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setAssessAttivo(v => !v)}
              style={{
                border: 'none', cursor: 'pointer', background: 'none',
                fontFamily: 'var(--s-sans)', fontSize: 13.5,
                color: assessAttivo ? 'var(--s-still)' : 'var(--s-ink-faint)',
              }}>
              {LC('assessment', 'assessment', 'assessment', 'assessment', 'assessment')}
              {assessItems.length > 0 ? ` · ${assessItems.length}` : ''}
            </button>
            {assessAttivo && (
              <div style={{
                position: 'absolute', bottom: '100%', left: 0, marginBottom: 8, zIndex: 40,
                display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px',
                borderRadius: 12, background: 'var(--s-disc)', boxShadow: 'var(--s-shadow-lift)',
                minWidth: 220, maxWidth: 320, maxHeight: 220, overflowY: 'auto',
              }}>
                <span style={{ fontFamily: 'var(--s-sans)', fontSize: 11.5, letterSpacing: '0.1em',
                              textTransform: 'uppercase', color: 'var(--s-ink-soft)' }}>
                  {LC('item dati a voce', 'items donnés à voix', 'items given aloud', 'ítems dados en voz', 'items givna högt')}
                </span>
                {assessItems.length === 0 ? (
                  <span className="ser-pulse" style={{ fontSize: 13, color: 'var(--s-ink-faint)' }}>
                    {LC('in ascolto…', 'à l\'écoute…', 'listening…', 'escuchando…', 'lyssnar…')}
                  </span>
                ) : assessItems.slice().reverse().map(it => (
                  <div key={it.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <span style={{ fontFamily: 'var(--s-mono)', fontSize: 11.5, color: 'var(--s-ink-faint)', flexShrink: 0 }}>
                      {orologio(it.time)}
                    </span>
                    <span style={{ fontFamily: 'var(--s-serif)', fontSize: 14, color: 'var(--s-ink)' }}>
                      {it.item}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* MNA — segnalato assente: un ATTREZZO, non un modo. Si apre SENZA lasciare il ciclo
            in corso (`PannelloMna` galleggia sul quadrante, la seduta resta sotto) — stesso
            principio del tasto MNA nella barra dei comandi di App.tsx. */}
        {aperta && moduleVis.mna && (
          <button
            onClick={() => setMnaAperto(v => !v)}
            style={{
              border: 'none', cursor: 'pointer', background: 'none',
              fontFamily: 'var(--s-sans)', fontSize: 13.5,
              color: mnaAperto || primePhase !== 'CAPTURE' && primePhase !== 'IDLE' ? 'var(--s-still)' : 'var(--s-ink-faint)',
            }}>
            MNA
          </button>
        )}
        {/* EP — l'auditor lo apre da sé quando vuole registrarlo, non un conto alla rovescia
            automatico (in EQUILIBRIUM quella finestra non è mai raggiungibile). "EP ✓" una
            volta validato, come in App.tsx. */}
        {aperta && (
          <button
            onClick={() => { if (!ep.epValidated) ep.setEpTimestamp(sessionClock.now()); ep.setEpManualOpen(true); }}
            style={{
              border: 'none', cursor: 'pointer', background: 'none',
              fontFamily: 'var(--s-sans)', fontSize: 13.5,
              color: ep.epValidated ? 'var(--s-still)' : 'var(--s-ink-faint)',
            }}>
            {ep.epValidated ? 'EP ✓' : 'EP'}
          </button>
        )}
        <span style={{ flex: 1 }} />
        {!aperta && (
          <button onClick={ricomincia} style={{
            border: 'none', background: 'none', cursor: 'pointer',
            fontFamily: 'var(--s-sans)', fontSize: 13.5, color: 'var(--s-ink-faint)',
          }}>
            ← {t('ser_change_people')}
          </button>
        )}
      </footer>
    </main>
  );
}
