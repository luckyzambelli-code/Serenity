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

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, lazy, Suspense } from 'react';
import { useMetric, metricsStore } from '../store/metricsStore';
import { chargeStateById } from '../lib/chargeState';
import { sessionClock } from '../runtime/SessionClock';
import { needleEngine, virtualNeedle } from '../runtime/NeedleEngine';
import { integrityTracker } from '../runtime/SmoothingEngine';
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
import { CycleStatusBar } from '../components/CycleStatusBar';
import { CycleSteps } from '../components/CycleSteps';
import { ThetaReadyCheck } from '../components/ThetaReadyCheck';
import { MetabolicCheck } from '../components/MetabolicCheck';
import { metabolicBaseline, type MetabAssessment } from '../engine/MetabolicBaseline';
import { useSessionJournal } from '../session/useSessionJournal';
import { useContactNullCycle } from '../session/useContactNullCycle';
import { useMirrorCycle } from '../session/useMirrorCycle';
import { MirrorDial } from '../components/MirrorDial';
import { useToneCycle } from '../session/useToneCycle';
import { ToneDial } from '../components/ToneDial';
import { ToneColumn } from '../components/ToneColumn';
import { TONE_LABELS, exactLevelName, levelName } from '../engine/toneLevels';
import {
  loadHistory as loadCanTests, saveHistory as saveCanTests, addTest as addCanTest,
  testedToday, type PcCanHistory,
} from '../engine/canTest';
import { SQUEEZE_TARGET_OFFSET } from '../engine/thetaSetup';
import { sessionRecorder } from '../engine/SessionRecorder';
import { sessionRecord, cycleRecord, fnRecord, itemRecord, chiaveItem } from '../engine/corpus';
import { corpusWrite, corpusAvailable } from '../lib/corpusWriter';
import { getProfiles, getPcProfiles, saveSession, saveSessionPdf, saveSessionPdfAsync, getAllProcessusFiles, getSessionsByProfile } from '../lib/storage';
import { isServerAvailable, serverGetProcessusList, serverProcessusUrl } from '../lib/serverStorage';
import { ProcessusModal, type ProcessusEntry } from '../components/ProcessusModal';
import { costruisciRiepilogo, generaPdf, type SerenityReportInput } from './sessionReport';
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
import { IndicatoreConnessione, COLORE_PUNTO } from './IndicatoreConnessione';
import { SegmentoVetro } from './SegmentoVetro';
import { PannelloMeter } from './PannelloMeter';
import { ZonaAssessment } from './ZonaAssessment';
import { useSerenityModuleStore } from './serenityModuleStore';
import { Settings, Headphones, Gauge, User, Users, Wrench, Wifi, MessageSquareOff, HelpCircle, Save, Play, Pause, History as HistoryIcon, BookOpen, UserCog, Clock, Timer, CircleUser, Crosshair, Scale, FlipHorizontal2, AudioWaveform, BadgeCheck, FileCheck, Unlink } from 'lucide-react';
import { GuideModal } from '../components/GuideModal';
import { AIAssistant } from '../components/AIAssistant';
import { CreditsModal } from '../components/CreditsModal';
import { HealthPanel } from '../components/HealthPanel';
/** ── HISTORY, CARICATA A RICHIESTA — segnalato: « il Report post session non ci sia più in
 *  Serenity, solo il PDF in History ». Lo stesso `HistoryModal` di App.tsx, TALE E QUALE (i
 *  suoi `getSessionsByProfile`/`getSessionPdfAsync` leggono l'ARCHIVIO UNICO — le sedute
 *  chiuse qui compaiono anche dall'altra parte, e viceversa). `lazy`, come App.tsx: legge
 *  `jspdf`/blob helpers che non servono finché nessuno apre lo storico. */
const HistoryModal = lazy(() => import('../components/HistoryModal').then(m => ({ default: m.HistoryModal })));
import { computeInstantRead, readWaitSeconds, READ_NON_MISURATO, type ReadSrc } from '../engine/instantRead';
import { REACTION_LABELS } from '../engine/ReactionClassifier';
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

/** ── TOTAL TA — segnalato assente nell'audit dei moduli mancanti: App.tsx lo affianca
 *  SEMPRE al TA istantaneo (`TotalTaReadout`), qui mancava del tutto. STESSA fonte, STESSA
 *  regola di precedenza: col meter collegato è una resistenza MISURATA (`theta.totalTa`) e
 *  prevale su quella ricostruita dall'EEG (`metricsStore`) — mostrarne una quando l'altra è
 *  vera darebbe un numero che non corrisponde allo strumento in mano. */
const LetturaTotalTa = React.memo(function LetturaTotalTa({ override, bodyMotion = false }: {
  override: number | null; bodyMotion?: boolean;
}) {
  const eeg = useMetric(m => m.totalTa);
  const totalTa = override ?? eeg;
  return (
    <span style={{ fontFamily: 'var(--s-mono)', fontVariantNumeric: 'tabular-nums' }}>
      Σ {totalTa.toFixed(2)}
      {/* ⚠️ Segnalato: « je veux que les indications du TA, motion, etc correspondent
          exactement à celle de EQUILIBRIUM » — `TotalTaReadout` (App.tsx, condiviso) scrive
          "— motion" (trattino lungo), non "· motion": stessa parola, stesso segno. */}
      {bodyMotion && <span style={{ color: 'var(--s-reserve)' }}> — motion</span>}
    </span>
  );
});

/** ── VELOCITÀ DI RILASCIO — segnalata assente insieme al Total TA. `velRatio` viene dalla
 *  velocità di elaborazione mentale, cioè dall'EEG: senza MUSE non ha sorgente, mostrata lo
 *  stesso sembrerebbe una misura vera (stessa condizione di App.tsx, `!eegModulesHidden`, qui
 *  `agoEeg` al punto in cui si monta). */
const LetturaVelocita = React.memo(function LetturaVelocita({ t }: { t: (k: string) => unknown }) {
  const velRatio = useMetric(m => m.velRatio);
  const st = velRatio >= 1.15 ? 'fast' : velRatio < 0.85 ? 'slow' : 'norm';
  const parola = t(st === 'fast' ? 'rel_fast' : st === 'slow' ? 'rel_slow' : 'rel_norm') as string;
  const freccia = st === 'fast' ? '↑' : st === 'slow' ? '↓' : '';
  return (
    <span style={{ fontFamily: 'var(--s-mono)', fontVariantNumeric: 'tabular-nums' }}>
      {velRatio.toFixed(2)}× {parola}{freccia}
    </span>
  );
});

/** ── L'INTEGRITÀ BIOMETRICA — segnalata assente nell'audit funzionale completo: « toutes les
 *  fonctions... METER/MUSE ». `runtime/SmoothingEngine`'s `integrityTracker` è condiviso e già
 *  NUTRITO qui (`hooks/useChargeEngine` gli scrive `setTarget` a ogni METRICS_UPDATE, montato
 *  da sempre) — mancava solo chi lo LEGGE. Isolato in un suo `React.memo` come `LetturaTA`:
 *  aggiorna spesso, non deve ridisegnare tutta l'intestazione. */
/** ── L'ORA VERA, NON QUELLA DELLA SEDUTA — segnalato: « vicino all'ora [della seduta] ci
 *  deve essere l'icona che indica cosa è, e sopra un'icona con l'ora attuale ». Due letture
 *  diverse: `orologio(tempo)` (sotto, con l'icona `Timer`) dice DA QUANTO è aperta la seduta;
 *  questa dice CHE ORE SONO davvero — utile a chi deve rispettare un orario, non ce l'aveva
 *  App.tsx ma qui è stata chiesta esplicitamente. Un `setInterval` di un secondo, isolato nel
 *  suo componente: non deve far ridisegnare la barra laterale intera ogni tick. */
const OraReale = React.memo(function OraReale() {
  const [ora, setOra] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setOra(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {ora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
});

const LetturaIntegrita = React.memo(function LetturaIntegrita() {
  const pct = useSyncExternalStore(integrityTracker.subscribe, integrityTracker.getCurrent);
  return (
    <span style={{ fontFamily: 'var(--s-mono)', fontVariantNumeric: 'tabular-nums' }}>
      {Math.round(pct)}%
    </span>
  );
});

/** ── « COSA DEVO FARE » — l'equivalente di `components/CycleHint.tsx`, non il componente
 *  stesso: quel file scrive i suoi colori DIRETTI nello stile inline (mai una `var(--sm-x)`,
 *  a differenza di `CycleStatusBar`) — presi in prestito così com'è, « rgba(240,246,255,0.95) »
 *  (quasi bianco) sarebbe leggibile sul fondo scuro di App.tsx e quasi INVISIBILE sul bianco
 *  perla di SERENITY in tema chiaro. Stessi dati (`spiegazioneCiclo`, portato fedele più sotto)
 *  — nella lingua grafica di SERENITY (`var(--s-x)`), non in quella di EQUILIBRIUM.
 *
 * ⚠️ SEGNALATO: « quand on arme un cycle, l'écriture DONNE L'ITEM avec les explications mets la
 * directement sur la ligne du bouton... et fais disparaître le TITRE, car il y a déjà le bouton
 * qui indique la chose. Également pour toutes les étapes du CYCLE ». Prima un blocco a sé
 * (`titolo` in grassetto + comando/come/avviso), largo quanto la riga (`flexBasis:'100%'`),
 * SOTTO tutti i bottoni della tappa — un doppione: il badge (CONTACT/NULL/MIRROR/TONE),
 * `CycleSteps` e il testo del bottone stesso dicono già IN QUALE tappa si è. Qui resta solo il
 * COME/COSA FARE (mai il nome della tappa, quello lo dice il bottone) — niente più `titolo`,
 * niente più riga a sé: chi la monta (poco più sotto, ai tre punti di chiamata) la mette SUBITO
 * dopo il bottone della tappa attiva, sulla STESSA riga elastica (niente `flexBasis`), non più
 * in fondo a tutto. */
function SuggerimentoCiclo({ comando, come, avviso, fatto = false }: {
  comando?: string | null; come: string; avviso?: string | null; fatto?: boolean;
}) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 340 }}>
      {comando && (
        <span style={{ fontFamily: 'var(--s-serif)', fontSize: 13.5, lineHeight: 1.35,
                      color: fatto ? 'var(--s-still)' : 'var(--s-ink-soft)' }}>
          {comando}
        </span>
      )}
      <span style={{ fontFamily: 'var(--s-sans)', fontSize: 12.5, lineHeight: 1.4,
                    color: fatto ? 'var(--s-still)' : 'var(--s-ink-faint)' }}>
        {come}
      </span>
      {avviso && (
        <span style={{ fontFamily: 'var(--s-sans)', fontSize: 12.5, fontWeight: 700,
                      color: 'var(--s-reserve)' }}>
          {avviso}
        </span>
      )}
    </span>
  );
}

/** ── IL LAG DI RON E LA % DI DISSOLUZIONE, E TUTTO IL RESTO CHE VA COL CICLO — erano
 *  informazioni dinamiche di EQUILIBRIUM (`CycleStatusBar`, riga sotto la domanda), non solo
 *  il disegno dell'arco. Segnalato di nuovo: « i cicli devono essere disposti esattamente
 *  come in equilibrium, stessi campi » — qui sotto non si reimplementa più a mano un
 *  sottoinsieme (`LetturaCiclo`, tolta: mostrava solo comm-lag e %): si monta `CycleStatusBar`
 *  STESSO, lo stesso componente condiviso che App.tsx usa, coi campi che gli mancavano
 *  (`noReadSignal`, il chip « recharging » del NULL). */

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
  /** ── L'INTEGRITÀ BIOMETRICA — vedi `LetturaIntegrita` sopra. Stesso ciclo di vita di
   *  App.tsx: parte al montaggio dell'applicazione, si ferma alla chiusura — non legato
   *  all'apertura/chiusura di UNA seduta, è un tracciamento continuo. */
  useEffect(() => {
    integrityTracker.start();
    return () => integrityTracker.stop();
  }, []);
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
  /** ── PERCHÉ È IN PAUSA — segnalato: « implementa i moduli mancanti ». Mancava la pausa CHE
   *  L'AUDITOR SCEGLIE (App.tsx: `handlePause`/`handleResume`, un bottone in barra), distinta
   *  da quella automatica sopra (strumento perso). Senza distinguerle, l'effetto di
   *  auto-ripresa qui sotto avrebbe cancellato una pausa manuale nell'istante stesso in cui la
   *  si premeva — lo strumento resta connesso, quindi la condizione di ripresa sarebbe stata
   *  vera subito. Un ref, non uno stato: non deve ridisegnare nulla da solo. */
  const pausaMotivoRef = useRef<'strumento' | 'manuale' | null>(null);
  const [tempo, setTempo] = useState(0);
  /** Le quattro risposte dell'avvio. `null` = le domande non sono ancora state fatte. */
  const [avvio, setAvvio] = useState<StatoAvvio | null>(null);
  /** Si è passati OLTRE la schermata di connessione? Un flag a parte, non `remote.isConnected`
   *  direttamente: un blip di rete a metà seduta non deve risbattere l'auditor sulla schermata
   *  del link — la connessione può cadere e riprendersi, la seduta resta aperta lo stesso. */
  const [collegato, setCollegato] = useState(false);
  /** CONFIG — segnalato assente: raggiungibile in ogni momento, come in EQUILIBRIUM. */
  const [configAperto, setConfigAperto] = useState(false);
  /** LA GUIDA — segnalata assente nell'audit funzionale completo. `GuideModal`, autosufficiente. */
  const [guidaAperta, setGuidaAperta] = useState(false);
  /** I CREDITI — si aprono dal logo, come in App.tsx. `CreditsModal`, autosufficiente. */
  const [creditiAperti, setCreditiAperti] = useState(false);
  /** LO STORICO — segnalato: « il Report post session non ci sia più in Serenity, solo il PDF
   *  in History ». `HistoryModal`, autosufficiente, TALE E QUALE — vedi la nota sopra al suo
   *  `lazy import`. */
  const [historyAperto, setHistoryAperto] = useState(false);
  /** ── PROCESSUS — segnalato due volte: « manquent PROCESSUS et les autres modules ». Restava
   *  dichiarato aperto (12° giro) perché la sua sorgente in App.tsx (`useAppInitializer`)
   *  governa ANCHE il profilo attivo unico — un meccanismo che il flusso a quattro domande di
   *  SERENITY esiste apposta per non avere. Qui SOLO il caricamento dei PDF di processo
   *  (server poi IndexedDB, stessa sequenza di `useAppInitializer` righe 104-133), senza
   *  toccare `useProfileStore`/lingua/sessione in solitaria. `ProcessusModal` stesso resta
   *  TALE E QUALE — autosufficiente, salva/tagga/filtra da sé (`commitPendingFiles` al suo
   *  interno). Il visore però è più semplice del "popup trascinabile" di App.tsx (`activeProcessus`,
   *  finestre multiple ridimensionabili): un solo PDF alla volta, in una finestra fissa — un
   *  raffinamento dichiarato ancora aperto, non l'intera macchina delle finestre mobili. */
  const [processusAperto, setProcessusAperto] = useState(false);
  const [processusPdfs, setProcessusPdfs] = useState<ProcessusEntry[]>([]);
  const [pendingFiles, setPendingFiles] = useState<{ name: string; url: string }[]>([]);
  const [pendingTagInput, setPendingTagInput] = useState('');
  const [processusTagFilter, setProcessusTagFilter] = useState('all');
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editingTagValue, setEditingTagValue] = useState('');
  const [processusVisualizzato, setProcessusVisualizzato] = useState<{ name: string; url: string } | null>(null);
  useEffect(() => {
    (async () => {
      const serverUp = await isServerAvailable();
      if (serverUp) {
        try {
          const list = await serverGetProcessusList();
          if (list.length > 0) {
            setProcessusPdfs(list.map(f => ({ name: f.name, tag: f.tag, url: serverProcessusUrl(f.id), _id: f.id })));
          }
        } catch { /* noop — resta la lista vuota, l'auditor può comunque caricarne */ }
      } else {
        try {
          const stored = await getAllProcessusFiles();
          if (stored.length > 0) {
            setProcessusPdfs(stored.map(f => ({ name: f.name, url: f.url, tag: f.tag, _id: f.id })));
          }
        } catch { /* noop */ }
      }
    })();
  }, []);
  /** ── LA TARATURA DELL'AGO EEG — segnalata assente nell'audit funzionale completo: « toutes
   *  les fonctions... calibrations » — App.tsx la tiene nel cassetto TRIM di `SidebarDrawer`
   *  (`needleTrim`/`needleInertia`, scritte dritte sul motore condiviso `runtime/NeedleEngine`,
   *  `needleEngine.setTrim`/`.k`/`.d`). SERENITY non aveva NESSUN controllo su questi due
   *  numeri — l'ago EEG restava sempre alla sensibilità/inerzia di fabbrica. Stesso stato,
   *  stesse formule, stesso motore: qui cambia solo dove si gira la manopola (dentro
   *  `PannelloConfig`, non un cassetto a parte). Non persistito fra le sedute — App.tsx non lo
   *  fa nemmeno (parte da 0/50 a ogni avvio). */
  const [needleTrim, setNeedleTrim] = useState(0);
  const [needleInertia, setNeedleInertia] = useState(50);
  useEffect(() => { needleEngine.setTrim(needleTrim + 5); }, [needleTrim]);
  useEffect(() => {
    needleEngine.k = 42 - 0.2 * needleInertia;
    needleEngine.d = 4 + 0.2 * needleInertia;
  }, [needleInertia]);
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
  /** ── IL CONTROLLO DI PRONTEZZA — segnalato assente nell'audit funzionale completo: « toutes
   *  les fonctions... METER/MUSE... outils de session ». In App.tsx (`metabolicOpen`/
   *  `thetaReadyDone`) uno strumento collegato non porta DRITTI alla seduta: prima la prova
   *  delle boîtes (`ThetaReadyCheck`, se c'è il meter) e poi il respiro guidato del MUSE
   *  (`MetabolicCheck`, se c'è il MUSE) — le boîtes per prime perché sono un gesto solo. Qui
   *  mancava del tutto: uno strumento collegato apriva la seduta senza NESSUNA verifica, anche
   *  con l'ago di fabbrica mai tarato. Stessi due componenti condivisi (zero riscrittura),
   *  stesso motore che li alimenta (`metabolicBaseline`, già nutrito da `useChargeEngine` —
   *  montato qui da sempre, semplicemente nessuno lo guardava). Resta CONSULTIVO come in
   *  App.tsx: ANNULLA apre comunque la seduta, non la blocca. */
  const [metabolicOpen, setMetabolicOpen] = useState(false);
  const [thetaReadyDone, setThetaReadyDone] = useState(false);
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
  /** ⚠️ BUG TROVATO — segnalato: « i bottoni a sinistra non devono sovrapporsi alle scritte in
   *  alto ». La barra laterale (OPEN/PAUSA/CONTACT/…) è ancorata con un `top` FISSO — ma
   *  l'altezza vera di `<header>` + `.ser-comandi` sopra di lei CAMBIA (l'assistente IA, la
   *  riga dell'item, `CycleStatusBar` a ciclo armato…): un numero fisso andava bene per UNA
   *  sola combinazione di quel contenuto, sbagliato per le altre. Misurata per davvero, DOPO
   *  ogni resa (`useLayoutEffect` SENZA lista di dipendenze — gira dopo ogni commit, prima
   *  della vernice — non un `ResizeObserver`: verificato dal vivo che in questo ambiente di
   *  test i suoi callback non arrivano mai, anche su un ridimensionamento vero della finestra;
   *  una misura ripetuta ad ogni resa non dipende da quel meccanismo, ed è già lo stesso ritmo
   *  del resto della pagina — l'orologio di seduta la fa comunque ridisegnare ogni secondo).
   *  `Math.round` sui due numeri prima di confrontarli: `setState` con lo STESSO valore non
   *  fa ridisegnare — nessun ciclo infinito, si ferma da sé quando l'altezza smette di
   *  cambiare. */
  const comandiRef = useRef<HTMLDivElement | null>(null);
  const [sidebarTop, setSidebarTop] = useState(118);
  // DELIBERATAMENTE senza lista di dipendenze: deve girare dopo OGNI resa (v. la nota sopra
  // sul perché non un `ResizeObserver`), non solo quando certe dipendenze cambiano —
  // `setSidebarTop(prev => prev === nuovo ? prev : nuovo)` è la guardia che impedisce il
  // ciclo infinito di cui l'avviso sotto avverte: a valore invariato React non ridisegna,
  // l'effetto si ferma da sé.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = comandiRef.current;
    if (!el) return;
    // `offsetTop`/`offsetHeight`, non `getBoundingClientRect()`: sono già relativi
    // all'antenato posizionato più vicino (`<main>`, `position:relative`) — lo STESSO
    // riferimento del `top` assoluto della barra laterale, senza dover sottrarre
    // manualmente la posizione della finestra.
    const nuovo = Math.round(el.offsetTop + el.offsetHeight) + 14;
    setSidebarTop(prev => (prev === nuovo ? prev : nuovo));
  });
  const uiAlpha = useUiStore(s => s.uiAlpha);
  // ⚠️ Segnalato: « la trasparenza si può modificare ma non agisce sulle scritte ». Prima
  // `uiAlpha` arrivava SOLO a `Cerchio.tsx` (le due camere) — v. la nota su `--s-ui-alpha` in
  // `tokens.css`. Stesso meccanismo di `data-tema` qui sopra: un attributo su `<html>`, non una
  // prop passata a mano a ogni pannello — `.s-glass` (journal, Santé, MNA, assessment, le
  // pillole dell'intestazione…) la legge da sé.
  useEffect(() => {
    document.documentElement.style.setProperty('--s-ui-alpha', String(uiAlpha));
  }, [uiAlpha]);
  const wallpaperUrl = useUiStore(s => s.wallpaperUrl);
  const moduleVis = useSerenityModuleStore(s => s.moduleVis);
  const setModuleVis = useSerenityModuleStore(s => s.setModuleVis);
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
    // ── LA TRACCIA DELL'AGO, PER LA STORIA/il PDF — segnalata mancante insieme al resto di
    // History: `sessionRecorder.chart`/`.reactions`/`.csv` si riempiono già da soli (le
    // scritture vivono in `useChargeEngine`/`useMuseConnection`, condivisi — montati anche
    // qui). Mancava solo QUESTA, che in App.tsx vive nello stesso `sessionClock.subscribe`.
    sessionRecorder.pushNeedleOffset({ time: s, offset: needleEngine.pos });
    // ⚠️ BUG TROVATO — segnalato: « les indications des réactions ne marchent pas » e « les
    // couleurs traînées des réactions pas visibles ». `needleVirtualRef` esisteva già
    // (dichiarato, azzerato a ogni apertura, LETTO da `useChargeEngine` come `offH` — la
    // storia che il classificatore delle reazioni confronta per riconoscere un colpo) ma
    // nessuno ci scriveva MAI dentro: la storia restava sempre vuota, quindi NESSUNA
    // reazione veniva mai classificata — non un'etichetta mancante, l'intero riconoscimento
    // spento. Stessa scrittura di App.tsx, nello stesso `sessionClock.subscribe`: la molla
    // "virtuale" nascosta (`virtualNeedle`, il segnale liscio su cui il classificatore è
    // tarato) campionata qui, tenuta agli ultimi 3 secondi.
    {
      const vb = needleVirtualRef.current;
      vb.push({ time: s, offset: virtualNeedle.pos });
      while (vb.length > 1 && vb[0].time < s - 3) vb.shift();
    }
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
  /** Le reazioni MOSTRATE (ago EEG + ago Meter), con l'ora — la fonte VERA di
   *  `computeInstantRead` (mai il flusso grezzo del classificatore: conterrebbe reazioni mai
   *  viste dall'auditor). Dichiarato QUI, prima di `theta`, perché il suo `onReaction` (sotto)
   *  ci scrive dentro. */
  const shownReadsRef = useRef<Array<{ time: number; reaction: string; src?: ReadSrc; episodeId?: number }>>([]);
  const theta = useThetaMeter({
    nowSec: () => sessionClock.now(),
    onReaction: r => {
      setThetaReactionKey(r.key);
      if (spegniRef.current) { clearTimeout(spegniRef.current); spegniRef.current = null; }
      if (r.final) spegniRef.current = setTimeout(() => setThetaReactionKey(''), THETA_LABEL_AFTER_MS);
      // ── LE LETTURE DELLE LATTINE ENTRANO DOVE ENTRANO QUELLE DELL'EEG — segnalato: «per la
      // logica ago METER/MUSE non funziona allo stesso modo che su Equilibrium», e serve anche
      // qui: senza questo `shownReadsRef` conteneva SOLO reazioni EEG, e l'ASSESSMENT col Meter
      // da solo avrebbe segnato NULL su ogni item mentre l'ago si muoveva davvero. STESSA
      // logica di App.tsx (episodio aggiornato per id, non accodato — un F/N che scende SF →
      // FALL → LONG FALL è UN movimento, non tre).
      if (!aperta) return;
      const label = REACTION_LABELS[r.key] || '';
      const sr = shownReadsRef.current;
      let i = sr.length - 1;
      while (i >= 0 && sr[i].episodeId !== r.id) i--;
      if (i >= 0) sr[i].reaction = label;
      else sr.push({ time: r.startedAtSec, reaction: label, src: 'theta', episodeId: r.id });
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
    pauseOnLoss: () => { pausaMotivoRef.current = 'strumento'; setPausata(true); },
  });
  // La ripresa è automatica quanto la pausa AUTOMATICA: appena il MUSE torna a rispondere (o
  // l'auditor passa al Theta-Meter, che non ha bisogno del contatto EEG) la lettura riprende da
  // sé — stessa filosofia di "il gate di contatto segnala da sé", applicata anche alla pausa.
  // ⚠️ SOLO se il motivo era lo strumento: una pausa MANUALE (`pausaManuale`, sotto) non deve
  // sparire da sola solo perché lo strumento è rimasto connesso — è l'auditor a deciderla e a
  // riprenderla, esattamente come il bottone Pause/Resume di App.tsx.
  useEffect(() => {
    if (pausata && pausaMotivoRef.current === 'strumento' && aperta
        && (muse.museConnection === 'connected' || meterC)) {
      setPausata(false);
      pausaMotivoRef.current = null;
    }
  }, [pausata, aperta, muse.museConnection, meterC]);
  /** ── LA PAUSA CHE SCEGLIE L'AUDITOR — segnalata assente: App.tsx la offre sempre (barra
   *  laterale, Play/Pause/Square), qui c'era solo quella automatica. Stesso gesto di
   *  `handlePause`/`handleResume`: registra nel giornale, ferma/riprende l'orologio (via
   *  l'effetto qui sopra, che legge `pausata`), la voce si ferma da sé perché `useVoiceItem`
   *  è attiva solo `aperta && !pausata` (vedi sotto). */
  const pausaManuale = () => {
    if (pausata) {
      setPausata(false);
      pausaMotivoRef.current = null;
      journal.addLog({ speaker: 'SYS', time: sessionClock.now(), type: 'normal',
        text: LC('ripresa', 'reprise', 'resumed', 'reanudada', 'återupptagen') });
    } else {
      pausaMotivoRef.current = 'manuale';
      setPausata(true);
      journal.addLog({ speaker: 'SYS', time: sessionClock.now(), type: 'normal',
        text: LC('in pausa', 'en pause', 'paused', 'en pausa', 'pausad') });
    }
  };
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
  /** ── L'ISTANTE VERO DI INIZIO SEDUTA, per History/PDF (`sessionReport.ts`) — un ref suo,
   *  non `corpusSessionRef` (che si azzera all'inizio di `chiudi()`, prima che serva qui). */
  const sessionStartRef = useRef(0);
  /**
   * ── ASSESSMENT — segnalato: « l'assessment ne marche pas et n'apparaît pas », poi di nuovo
   * « implementa tutti gli elementi, è solo un cambio grafico, non devi riscrivere le funzioni ».
   * Aveva ragione: `computeInstantRead`/`readWindow`/`readWaitSeconds` (`engine/instantRead.ts`)
   * e `chiaveItem` (`engine/corpus.ts`) erano GIÀ funzioni pure condivise, non codice locale di
   * App.tsx — la prima versione qui le aveva scartate per prudenza, credendole accoppiate a
   * refs locali che in realtà non lo sono. La sola cosa mancante per davvero era
   * `shownReadsRef` che ricevesse ANCHE le reazioni del Meter (vedi la nota sopra `theta`) — coi
   * soli dati EEG, l'assessment col Meter da solo avrebbe segnato NULL su ogni item mentre l'ago
   * si muoveva davvero.
   *
   * Qui la STESSA lettura istantanea di App.tsx: si aspetta `readWaitSeconds` (la latenza
   * elettrodermica, la stessa costante), poi si chiede a `computeInstantRead` — con la finestra
   * delimitata dall'item PRIMA e da quello DOPO (se già arrivato), e SOLO dall'ago che l'auditor
   * sta guardando (`agoEegRef`, mai l'altro: leggere dall'ago non guardato racconterebbe un
   * movimento che nessuno ha visto). Non è la ripetizione PROGRESSIVA di App.tsx (che aggiorna
   * la scritta più volte mentre l'ago scende, con un timer a 200ms): un calcolo solo, al termine
   * dell'attesa — la stessa funzione pura, un solo giro invece di N.
   */
  const [assessAttivo, setAssessAttivo] = useState(false);
  const assessActiveRef = useRef(false);
  useEffect(() => { assessActiveRef.current = assessAttivo; }, [assessAttivo]);
  const attivaAssessment = () => setAssessAttivo(true);
  const [assessItems, setAssessItems] = useState<Array<{
    id: string; time: number; item: string; gruppo: number;
    /** `null` = in attesa della decisione (la latenza elettrodermica non è ancora passata). */
    reaction: string | null; beforeMs: number; afterMs: number; readSrc?: ReadSrc;
    /** ── LA VISTA INDICAZIONE — segnalata nell'audit funzionale completo: « toutes les
     *  fonctions... » includeva anche l'R&I di App.tsx (`AssessmentPanel`'s vista `ri`), non
     *  solo l'ASSESSMENT a voce. `kind` distingue le due provenienze — `undefined`/`'item'` =
     *  detto a voce durante un assessment (il ramo qui sopra, invariato); `'manual'` = trovato
     *  in un ALTRO modo e scritto dall'auditor (sotto). `indica` è la risposta del preclear,
     *  `readMuse`/`readMeter` le DUE letture separate quando ci sono entrambi gli strumenti —
     *  App.tsx non le fonde mai (misurato: κ di Cohen −0,09 fra i due, vedi
     *  `equilibrium_can_meter` in memoria), e questa vista esiste apposta per confrontarle. */
    kind?: 'item' | 'manual';
    indica?: boolean;
    readMuse?: string;
    readMeter?: string;
  }>>([]);
  const assessIdRef = useRef(0);
  const assessLogCursorRef = useRef(0);
  /** Gli istanti di TUTTI gli item dati finora — serve solo a delimitare la finestra di lettura
   *  di ciascuno (mai oltre l'item precedente o quello seguente). Stessa forma di App.tsx
   *  (`assessTimesRef`). */
  const assessTimesRef = useRef<number[]>([]);
  const assessPrevAtRef = useRef(-Infinity);
  /** Il gruppo di RIPETIZIONE di ogni item — stesso item detto più volte (a meno di maiuscole,
   *  accenti, punteggiatura: `chiaveItem`) riceve lo stesso numero. */
  const gruppiItemRef = useRef<Map<string, number>>(new Map());
  /** L'ago che l'auditor sta guardando ADESSO — uno specchio in ref di `agoEeg` (dichiarato più
   *  sotto: la logica dell'ago vive vicino a dove serve al quadrante) perché la lettura si
   *  decide dentro un `setTimeout`, e un ref non ha bisogno di essere nell'elenco delle
   *  dipendenze per restare aggiornato. */
  const agoEegRef = useRef(false);
  /** Stesso filtro (`isAssessableItem`) e stesso principio cursore-su-`journal.logs` dei tre
   *  effetti "item dettato" qui sotto: si guarda solo quel che arriva DOPO che l'assessment si è
   *  acceso, non l'intero giornale da capo. */
  useEffect(() => {
    if (!assessAttivo) return;
    const cursore = assessLogCursorRef.current;
    if (journal.logs.length <= cursore) return;
    for (let i = cursore; i < journal.logs.length; i++) {
      const riga = journal.logs[i];
      if (riga.speaker !== 'Aud' || !isAssessableItem(riga.text)) continue;
      const tSpeak = riga.time;
      const testo = riga.text.trim();
      const id = `as-${++assessIdRef.current}`;
      const chiave = chiaveItem(testo);
      let gruppo = gruppiItemRef.current.get(chiave);
      if (gruppo === undefined) { gruppo = gruppiItemRef.current.size + 1; gruppiItemRef.current.set(chiave, gruppo); }
      // MAI risalire oltre l'item PRECEDENTE — senza questo limite, in assessment (item ogni
      // 1-2 s) un item ruberebbe la lettura di quello prima (stessa regola di App.tsx).
      const notBefore = assessPrevAtRef.current + 0.05;
      assessPrevAtRef.current = tSpeak;
      assessTimesRef.current.push(tSpeak);
      setAssessItems(prev => [...prev, { id, time: tSpeak, item: testo, gruppo, reaction: null, beforeMs: 0, afterMs: 0 }]);
      const attesaS = readWaitSeconds(meterC);
      window.setTimeout(() => {
        // Limite in AVANTI = l'item SEGUENTE, se nel frattempo ne è arrivato uno — si conosce
        // solo ORA, non quando l'item è stato dato (stessa regola di App.tsx).
        const successivo = assessTimesRef.current.find(x => x > tSpeak + 0.05);
        const notAfter = successivo !== undefined ? successivo - 0.05 : Infinity;
        const soloSrc: ReadSrc = agoEegRef.current ? 'eeg' : 'theta';
        const r = senzaStrumenti
          ? { read: READ_NON_MISURATO, beforeMs: 0, afterMs: 0 }
          : computeInstantRead(shownReadsRef.current, tSpeak, notBefore, notAfter, soloSrc);
        setAssessItems(prev => prev.map(a => a.id === id
          ? { ...a, reaction: r.read, beforeMs: r.beforeMs, afterMs: r.afterMs, readSrc: soloSrc } : a));
      }, Math.max(200, attesaS * 1000));
    }
    assessLogCursorRef.current = journal.logs.length;
  }, [journal.logs, assessAttivo, meterC, senzaStrumenti]);

  /**
   * ── LA VISTA INDICAZIONE — LE TRE FUNZIONI DI App.tsx, PORTATE PAROLA PER PAROLA ──────────
   * Segnalato: « implementa i moduli mancanti » — questo era il più segnalato dei tre, e
   * dichiarato aperto nel changelog da diversi giri: l'R&I di `AssessmentPanel.tsx` (App.tsx),
   * « la domanda che l'assessment non pone — questa reazione INDICA al preclear? ». Non un
   * porting dell'engine: `computeInstantRead`/`chiaveItem`/`corpusWrite` erano già qui (li usa
   * l'effetto sopra), mancava solo chi li chiama per un item scritto A MANO invece che detto a
   * voce. Le tre funzioni sono la STESSA logica di App.tsx, adattata ai nomi locali
   * (`sessionClock.now()` invece di `timeRef.current`, `journal.addLog` invece del buffer).
   */
  const riIdRef = useRef(0);
  /** L'auditor ha trovato un item in un ALTRO modo e lo scrive: il preclear l'ha detto, oppure
   *  è uscito da una domanda di auditing, oppure non ha fatto reagire l'ago ma gli indica lo
   *  stesso. `quandoSec` viene dalla proposta di `cercaLetturaPerParola` (l'istante in cui
   *  quella parola è stata DETTA); senza, la riga si data ad ADESSO. */
  const aggiungiItemManuale = (testo: string, quandoSec?: number) => {
    const tSec = quandoSec ?? sessionClock.now();
    const museRead = museOk
      ? computeInstantRead(shownReadsRef.current, tSec, -Infinity, Infinity, 'eeg').read : undefined;
    const meterRead = meterC
      ? computeInstantRead(shownReadsRef.current, tSec, -Infinity, Infinity, 'theta').read : undefined;
    const scelta = agoEegRef.current ? museRead : meterRead;
    const chiave = chiaveItem(testo);
    let gruppo = gruppiItemRef.current.get(chiave);
    if (gruppo === undefined) { gruppo = gruppiItemRef.current.size + 1; gruppiItemRef.current.set(chiave, gruppo); }
    const id = `ri-${++riIdRef.current}`;
    setAssessItems(prev => [...prev, {
      id, time: tSec, item: testo, gruppo, reaction: scelta ?? READ_NON_MISURATO, beforeMs: 0, afterMs: 0,
      readSrc: agoEegRef.current ? 'eeg' : 'theta', kind: 'manual', readMuse: museRead, readMeter: meterRead,
    }]);
    journal.addLog({ speaker: 'NEEDLE', time: tSec,
      text: `◎ R&I · ${testo} → ${!scelta || scelta === 'NULL'
        ? LC('nessuna reazione (NULL)', 'aucune réaction (NULL)', 'no reaction (NULL)',
             'sin reacción (NULL)', 'ingen reaktion (NULL)') : scelta}`,
      type: scelta && scelta !== 'NULL' ? 'success' : 'normal' });
  };
  /**
   * Quella parola è già stata DETTA in seduta? E che cosa fece l'ago in quel momento?
   * Cerca l'ultima frase del preclear o dell'auditor che la contiene — a meno di maiuscole e
   * accenti, perché la trascrizione non restituisce mai la stessa stringa due volte. Senza
   * questa proposta l'item scritto a mano verrebbe datato ADESSO, e gli si attribuirebbe un ago
   * che in quel momento non stava reagendo a lui.
   */
  const cercaLetturaPerParola = (testo: string) => {
    const ago = chiaveItem(testo);
    if (!ago) return null;
    for (let i = journal.logs.length - 1; i >= 0; i--) {
      const l = journal.logs[i];
      if (l.speaker !== 'PC' && l.speaker !== 'Aud') continue;
      if (!chiaveItem(l.text).includes(ago)) continue;
      const museRead = museOk
        ? computeInstantRead(shownReadsRef.current, l.time, -Infinity, Infinity, 'eeg').read : undefined;
      const meterRead = meterC
        ? computeInstantRead(shownReadsRef.current, l.time, -Infinity, Infinity, 'theta').read : undefined;
      return { tSec: l.time, frase: l.text, read: agoEegRef.current ? museRead : meterRead,
                readMuse: museRead, readMeter: meterRead };
    }
    return null;
  };
  /** L'auditor registra la risposta del preclear. Si può cambiare idea: la riga si riscrive. */
  const segnaIndicazione = (id: string, indica: boolean) => {
    setAssessItems(prev => prev.map(a => (a.id === id ? { ...a, indica } : a)));
    const riga = assessItems.find(a => a.id === id);
    if (corpusSessionRef.current && riga) {
      // In archivio è una riga `item` come le altre: porta le due letture e il verdetto del
      // preclear. Il TESTO non ci entra mai — solo la classificazione.
      corpusWrite(itemRecord(corpusSessionRef.current, new Date().toISOString(), riga.time,
        { read: riga.reaction ?? undefined, readMuse: riga.readMuse, readMeter: riga.readMeter, indica }));
    }
    journal.addLog({ speaker: 'PC', time: sessionClock.now(),
      text: indica
        ? LC('la reazione indica', 'la réaction indique', 'the read indicates',
             'la reacción indica', 'avläsningen indikerar')
        : LC('la reazione NON indica', 'la réaction n\'indique PAS', 'the read does NOT indicate',
             'la reacción NO indica', 'avläsningen indikerar INTE'),
      type: indica ? 'success' : 'normal' });
  };

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
  const mnaSessionRef = useRef<MnaSession>({ ...MNA_SESSION_VUOTA });
  /** ── SANTÉ SYSTÈME / GIORNALE / MNA — segnalato: « integra anche il journal de session,
   *  Santé Système », poi di nuovo: « questi moduli non devono avere bottoni, si attivano
   *  solamente via CONFIG ». Non c'è più uno stato "aperto" separato da `moduleVis`: il
   *  toggle di CONFIG è l'UNICO interruttore, esattamente come App.tsx fa per `HealthPanel`
   *  (`onHide={() => setModuleVis(v => ({...v, health:false}))}` — lo stesso "nascondere" È
   *  "spegnere il modulo", non due azioni). */
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
  /** ── I TRE, PER IL PDF DI HISTORY — segnalato: « ed i moduli restanti, li fai? ». Erano già
   *  nel callback (`onLagMeasured` li porta tutti e tre, la STESSA misura di App.tsx), solo
   *  non ancora letti da questo lato — come `deltaStar`/`deltaStarN` prima di loro. */
  const [deltaTrend, setDeltaTrend] = useState(0);
  const [deltaBaseline, setDeltaBaseline] = useState(0);
  const [deltaAdaptive, setDeltaAdaptive] = useState(0);
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
    onLagMeasured: m => {
      setDeltaStar(m.deltaStar); setDeltaStarN(m.n);
      setDeltaTrend(m.trend); setDeltaBaseline(m.baseline); setDeltaAdaptive(m.adaptive);
    },
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
  /** ── « DUE » — segnalato: « manca anche la vista in MUSE/METER di ENTRAMBI ». La terza
   *  voce del selettore di App.tsx (`reazioniViste`): l'ago resta quello del Meter (misurato,
   *  non ricostruito — `setAgoScelto('theta')` quando si sceglie DUE, stessa regola di
   *  App.tsx: « DUE → l'ago del METER + le reazioni del MUSE in più »), ma le letture del
   *  MUSE si aggiungono ETICHETTATE accanto — non un secondo ago disegnato (SERENITY ne mostra
   *  sempre uno solo, scelta del decimo giro), le sue REAZIONI in più. */
  const [reazioniViste, setReazioniViste] = useState<'eeg' | 'theta' | 'both'>('eeg');
  const museOk = muse.museConnection === 'connected';
  /** SERENITY non ha un selettore di modo persistente come App.tsx (`mode`): qui il TONE si
   *  "attiva" con un gesto diretto, esclusivo con CONTACT/NULL/MIRROR. Dichiarato QUI (non più
   *  giù, dove viveva prima) perché la logica dell'ago qui sotto ne ha bisogno. */
  const [toneAttivo, setToneAttivo] = useState(false);
  /**
   * ⚠️ SEGNALATO: « per la logica ago METER/MUSE, non funziona allo stesso modo che su
   * Equilibrium ». Vero — mancavano DUE dei livelli di `agoPrincipale` (App.tsx):
   *   1. TONE impone SEMPRE il Meter (`MODE_SPEC.tone.needle === 'theta'`) — mai la preferenza
   *      generale dell'auditor. Con METER e MUSE entrambi connessi e la preferenza su MUSE, la
   *      versione precedente mostrava l'ago EEG anche mentre si lavora in TONE, che è lo
   *      strumento SBAGLIATO per quel metodo.
   *   2. Un ciclo CONTACT/NULL/MIRROR in corso impone SEMPRE l'EEG (`cicloInCorso ? 'eeg'` in
   *      App.tsx) — quei tre cicli vivono SOLO di carica EEG, il Theta-Meter non vi partecipa:
   *      a ciclo armato la preferenza generale non conta più, serve vedere l'ago che sta
   *      davvero facendo il ciclo.
   * Fuori da questi due casi (nessun ciclo in corso, TONE spento) resta la regola precedente:
   * con un solo strumento vince quello che c'è, con entrambi vince la preferenza `agoScelto`.
   */
  const cicloEegInCorso = cycles.cycleArmed || mirror.mirrorArmed;
  const agoEeg = toneAttivo ? false
    : cicloEegInCorso ? museOk
    : museOk && meterC ? agoScelto === 'eeg'
    : museOk;
  // Lo specchio in ref per l'ASSESSMENT (sopra) — legge questo valore dentro un `setTimeout`,
  // dove un ref (sempre aggiornato) è corretto, uno stato catturato al momento dell'item no.
  useEffect(() => { agoEegRef.current = agoEeg; }, [agoEeg]);

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
  /** ── LO STATO SOTTO LA CAM 2 — segnalato: « nella cam PC devi mettere le indicazioni che
   *  hai già in equilibrium ». In App.tsx (`CameraFeed`'s `massStatus`) quel testo dice, a
   *  distanza, se il MUSE del preclear è collegato (con la batteria); in locale, a che punto
   *  è la carica. STESSE tre parole (`status_waiting`/`status_searching_mass`/
   *  `status_asisness_reached`, già nelle 5 lingue condivise) e stessa fonte
   *  (`ep.asIsnessState`, `metricsStore.vProc` — letto sopra insieme a `qLnow`), solo un
   *  gradino più semplice: manca l'intermedio "massa agganciata" (`isFnActive` di App.tsx,
   *  mai portato qui) — tre stati onesti restano meglio di un quarto inventato. */
  const vProcNow = useMetric(m => m.vProc);
  // ⚠️ `avvio?.` — questo calcolo sta PRIMA del guard `if (!avvio)` più sotto (che decide se
  // mostrare l'avvio o la seduta): come gli altri letti qui sopra nel file (`pcSex`,
  // `nomeProvaLattine`), non può dare per scontato che `avvio` esista già.
  const statoCamPc: string = avvio?.distanza
    ? (remote.isConnected
        ? (remote.remoteMuseConnected
            ? `🧠 MUSE ✓  🔋${remote.remoteBatteryLevel?.toFixed(0) ?? '--'}%`
            : t('conn_muse_preclear_disconnected') as string)
        : t('conn_auditor_preclear_waiting') as string)
    : (!aperta ? t('status_waiting') as string
        : ep.asIsnessState === 'ep' ? t('status_asisness_reached') as string
        : vProcNow > 0 ? t('status_processing_mass') as string
        : t('status_searching_mass') as string);
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

  const chargePhaseNow = useMetric(m => m.chargePhase);

  /**
   * ── « A CHE PUNTO SONO, E COSA DEVO FARE » — segnalata assente: « riproduci la logica dei
   * cicli di EQUILIBRIUM, con gli stessi campi, stessi posizionamenti ». App.tsx ha
   * `spiegazioneCiclo` + `CycleHint`: una riga di titolo, il comando ESATTO da dire al
   * preclear fra virgolette, che cosa fare, un avviso ambra quando serve — sotto i comandi
   * del ciclo, sempre nello stesso posto. `CycleSteps` (già montata) dice DOVE si è nella
   * sequenza; questo dice COSA FARE in quel punto — le due informazioni sono complementari,
   * non un doppione. Stesso testo di App.tsx, parola per parola: non è calcolo, è la
   * procedura scritta — portarla qui non tocca il motore, finisce di copiarla.
   */
  const spiegazioneCiclo = useMemo((): { titolo: string; comando?: string | null; come: string; avviso?: string | null; fatto?: boolean } => {
    if (toneAttivo) {
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
      if (tone.tonePhase === 'raise') return {
        titolo: `2 · ${LC('PORTALO A TONO 40', 'MÈNE-LE AU TON 40', 'RAISE IT TO TONE 40', 'LLÉVALO AL TONO 40', 'FÖR DET TILL TON 40')}`
          + (tone.toneRipetizioni > 0 ? ` · ×${tone.toneRipetizioni}` : ''),
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
    if (mirror.mirrorArmed) {
      if (faseCiclo === 'mirror.item') return {
        titolo: LC('1 · DAI L\'ITEM', '1 · DONNE L\'ITEM', '1 · GIVE THE ITEM', '1 · DA EL ÍTEM', '1 · GE ITEM'),
        come: LC('Scrivilo o dillo a voce, poi premi. Il valore si fissa sulla carica di QUESTO item.', 'Écris-le ou dis-le, puis appuie. La valeur se fige sur la charge de CET item.', 'Type it or say it, then press. The value is fixed on THIS item\'s charge.', 'Escríbelo o dilo, luego pulsa. El valor se fija en la carga de ESTE ítem.', 'Skriv eller säg det, tryck sedan. Värdet fästs på DETTA items laddning.') };
      if (faseCiclo === 'mirror.say_item') return {
        titolo: LC('2 · DÌ L\'ITEM', '2 · DIS L\'ITEM', '2 · SAY THE ITEM', '2 · DI EL ÍTEM', '2 · SÄG ITEM'),
        come: LC('La prima parola che dici diventa l\'item, e la misura riparte da lì.', 'Le premier mot que tu dis devient l\'item, et la mesure repart de là.', 'The first word you say becomes the item, and the measure restarts there.', 'La primera palabra que digas se vuelve el ítem, y la medida reinicia allí.', 'Det första ordet du säger blir item, och mätningen börjar om där.') };
      if (!mirror.mirrorDisp.locked) return {
        titolo: LC('3 · CONTATTO DELLA CARICA', '3 · CONTACT DE LA CHARGE', '3 · CONTACTING THE CHARGE', '3 · CONTACTO DE LA CARGA', '3 · KONTAKT MED LADDNINGEN'),
        come: LC('Aspetta: il valore 1–10 si fissa da sé quando la lettura si è girata.', 'Attends : la valeur 1–10 se fige d\'elle-même quand la lecture s\'est retournée.', 'Wait: the 1–10 value fixes itself once the read has turned over.', 'Espera: el valor 1–10 se fija solo cuando la lectura se ha girado.', 'Vänta: värdet 1–10 fäster av sig självt när avläsningen vänt.') };
      if (mirror.mirrorDisp.reached) return {
        titolo: LC('OTTENUTO', 'OBTENU', 'OBTAINED', 'OBTENIDO', 'UPPNÅTT'), fatto: true,
        come: LC('Lo smaltito ha raggiunto il doppio. Valida e riparti con un altro item.', 'Le déchargé a atteint le double. Valide et repars avec un autre item.', 'The discharged reached the double. Validate and go on with another item.', 'Lo descargado alcanzó el doble. Valida y sigue con otro ítem.', 'Det urladdade nådde dubbeln. Validera och fortsätt med ett annat item.') };
      return {
        titolo: `4 · ${LC('PORTA AL DOPPIO', 'MÈNE AU DOUBLE', 'TAKE IT TO THE DOUBLE', 'LLEVA AL DOBLE', 'FÖR TILL DUBBELN')} ${(2 * mirror.mirrorDisp.valueR).toFixed(1)}`,
        come: LC(`Valore ${mirror.mirrorDisp.valueR.toFixed(1)} — il metodo del doppio di Ron. Non fare altro: si smaltisce da sé.`, `Valeur ${mirror.mirrorDisp.valueR.toFixed(1)} — la méthode du double de Ron. Ne fais rien d'autre : ça se décharge tout seul.`, `Value ${mirror.mirrorDisp.valueR.toFixed(1)} — Ron's doubling method. Do nothing else: it discharges by itself.`, `Valor ${mirror.mirrorDisp.valueR.toFixed(1)} — el método del doble de Ron. No hagas nada más: se descarga solo.`, `Värde ${mirror.mirrorDisp.valueR.toFixed(1)} — Rons dubbelmetod. Gör inget annat: det laddas ur av sig självt.`) };
    }
    if (cycles.cycleKind === 'null' && cycles.cycleArmed) {
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
    if (faseCiclo === 'contact.item' || mode === 'free') return {
      titolo: LC('1 · DAI L\'ITEM', '1 · DONNE L\'ITEM', '1 · GIVE THE ITEM', '1 · DA EL ÍTEM', '1 · GE ITEM'),
      come: LC('L\'ago legge → premi. Puoi scrivere l\'item o dirlo a voce dopo aver premuto.', 'L\'aiguille lit → appuie. Tu peux écrire l\'item ou le dire après avoir appuyé.', 'The needle reads → press. You can type the item or say it after pressing.', 'La aguja lee → pulsa. Puedes escribir el ítem o decirlo tras pulsar.', 'Nålen läser → tryck. Du kan skriva item eller säga det efter tryckningen.') };
    if (faseCiclo === 'contact.say_item') return {
      titolo: LC('DÌ L\'ITEM', 'DIS L\'ITEM', 'SAY THE ITEM', 'DI EL ÍTEM', 'SÄG ITEM'),
      come: LC('La prima parola che dici diventa l\'item.', 'Le premier mot que tu dis devient l\'item.', 'The first word you say becomes the item.', 'La primera palabra que digas se vuelve el ítem.', 'Det första ordet du säger blir item.') };
    if (faseCiclo === 'contact.asis') return {
      titolo: '3 · AS-IS', fatto: true,
      come: LC('La firma della carica è collassata e l\'F/N è arrivato. Proposto: validi tu, mai l\'app.', 'La signature de la charge s\'est effondrée et la F/N est là. Proposé : c\'est toi qui valides, jamais l\'app.', 'The charge signature has collapsed and the F/N is here. Proposed: you validate, never the app.', 'La firma de la carga colapsó y llegó la F/N. Propuesto: validas tú, nunca la app.', 'Laddningens signatur har kollapsat och F/N är här. Föreslaget: du validerar, aldrig appen.') };
    return {
      titolo: LC('2 · CHIEDI UN MOCK-UP', '2 · DEMANDE UN MOCK-UP', '2 · ASK FOR A MOCK-UP', '2 · PIDE UN MOCK-UP', '2 · BE OM EN MOCK-UP'),
      come: LC('Poi non fare altro: il ciclo avanza da sé fino all\'AS-IS.', 'Puis ne fais rien d\'autre : le cycle avance tout seul jusqu\'à l\'AS-IS.', 'Then do nothing else: the cycle advances by itself to the AS-IS.', 'Luego no hagas nada más: el ciclo avanza solo hasta el AS-IS.', 'Gör sedan inget mer: cykeln går själv fram till AS-IS.'),
      avviso: cycles.noReadSignal
        ? LC('sembra NULL — nessuna lettura nella finestra', 'semble NULL — aucune lecture dans la fenêtre', 'looks NULL — no read in the window', 'parece NULL — ninguna lectura en la ventana', 'ser NULL ut — ingen avläsning i fönstret')
        : chargePhaseNow === 'discharge'
        ? LC('la carica si sta dissolvendo', 'la charge se dissout', 'the charge is dissolving', 'la carga se está disolviendo', 'laddningen löses upp')
        : null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faseCiclo, toneAttivo, tone.tonePhase, tone.toneRipetizioni, mirror.mirrorArmed, mirror.mirrorDisp,
      cycles.cycleKind, cycles.cycleArmed, cycles.noReadSignal, chargePhaseNow, mode, lang]);

  /**
   * ── L'ITEM A VOCE, LA SORGENTE CHE MANCAVA ───────────────────────────────────────────────
   * Segnalato: « la logica di dare l'ITEM anche a voce... non è implementata ancora ». I tre
   * motori sapevano già riempire l'item da soli (`cycleAwaitItemRef`/`itemDettato` e le sue
   * due sorelle, portati da App.tsx in una sessione precedente) — mancava solo chi parla:
   * `useVoiceItem` avvia lo STESSO riconoscitore (nativo macOS/Web Speech del browser, poi
   * Whisper offline come ripiego) di App.tsx, e ogni frase finale entra nel giornale come
   * farebbe l'auditor scrivendola.
   *
   * ⚠️ `speechEndMs` era ricevuto e IGNORATO — l'item si datava sempre all'ISTANTE DI ARRIVO
   * della trascrizione (`sessionClock.now()`), che il riconoscitore dichiara fino a ~900ms
   * DOPO che si è smesso di parlare (aspetta il silenzio). L'instant read dell'ago — che
   * avviene ALLA FINE DELLA PAROLA — cadeva fuori dalla sua finestra. Stessa formula di
   * App.tsx: si retrodata di quanto tempo è passato da `speechEndMs` (in `performance.now()`,
   * lo stesso orologio usato per calcolarlo), non oltre 3s (un valore fuori scala è un errore
   * di misura, non tre secondi di silenzio veri). */
  const statoVoce = useVoiceItem({
    // In pausa (automatica O manuale) niente ascolto — stessa regola di App.tsx
    // (`handlePause` ferma esplicitamente il riconoscimento).
    active: aperta && !pausata,
    lang: lang as string,
    onTranscript: (text, speechEndMs) => {
      const ritardoS = speechEndMs
        ? Math.min(3, Math.max(0, (performance.now() - speechEndMs) / 1000)) : 0;
      journal.addLog({ speaker: 'Aud', text, time: Math.max(0, sessionClock.now() - ritardoS), type: 'normal' });
    },
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
    sessionStartRef.current = Date.now();
    sessionRecorder.reset();   // niente chart/reazioni/CSV di una seduta precedente — come App.tsx
    setPausata(false); pausaMotivoRef.current = null;   // niente pausa residua da una seduta precedente
    journal.resetJournal(t('ser_session_opened'));
    ep.resetEpState();   // niente "EP ✓" residuo da una seduta precedente
    mirror.resetMirror();   // niente ciclo MIRROR residuo da una seduta precedente
    tone.resetTone(); setToneAttivo(false);   // niente TONE residuo da una seduta precedente
    setProvaTa({ two: null, solo: null });   // niente prova doppia residua da un'altra persona
    setAssessAttivo(false); setAssessItems([]); assessLogCursorRef.current = 0;   // idem, ASSESSMENT
    assessTimesRef.current = []; assessPrevAtRef.current = -Infinity; gruppiItemRef.current = new Map();
    shownReadsRef.current = [];   // niente reazioni di una seduta precedente nella finestra del primo item
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
  /** ── APRE DAVVERO, DOPO IL RESPIRO — `avviaSeduta()` chiama `journal.resetJournal(...)`:
   *  una riga scritta PRIMA andrebbe persa. Qui l'ordine giusto: si apre, POI si scrive
   *  l'esito del respiro guidato (se c'è stato — può essere `null`, annullato a metà) nel
   *  giornale appena azzerato — non ancora in un rapporto (SERENITY non ne ha uno, fase 8),
   *  ma non silenzioso: si legge nel giornale come tutto il resto di questa apertura. */
  const avviaSedutaConProntezza = (a: MetabAssessment | null) => {
    setMetabolicOpen(false);
    avviaSeduta();
    if (a) {
      journal.addLog({ speaker: 'SYS', time: 0, type: 'normal', text:
        LC(`respiro — prontezza: ${a.level} (contatto ${a.contact} · calma ${a.calm} · cuore ${a.heart} · reattività ${a.reactivity})`,
           `souffle — préparation : ${a.level} (contact ${a.contact} · calme ${a.calm} · cœur ${a.heart} · réactivité ${a.reactivity})`,
           `breath — readiness: ${a.level} (contact ${a.contact} · calm ${a.calm} · heart ${a.heart} · reactivity ${a.reactivity})`,
           `respiración — preparación: ${a.level} (contacto ${a.contact} · calma ${a.calm} · corazón ${a.heart} · reactividad ${a.reactivity})`,
           `andning — beredskap: ${a.level} (kontakt ${a.contact} · lugn ${a.calm} · hjärta ${a.heart} · reaktivitet ${a.reactivity})`) });
    }
  };
  /** ── L'USCITA DEL CASO LIMITE — la connessione scelta è FALLITA fra "apri una seduta" e
   *  qui: né meter da provare né MUSE da ascoltare, il controllo di prontezza resterebbe aperto
   *  su un pannello vuoto. Un EFFETTO, non uno stato scritto durante il render (vedi la nota
   *  sopra il ramo `return null` del controllo): si accorge dopo il render, come deve. */
  useEffect(() => {
    if (!metabolicOpen) return;
    const readinessMuseOk = avvio?.distanza ? remote.remoteMuseConnected : museOk;
    if (meterC || readinessMuseOk) return;
    setMetabolicOpen(false);
    avviaSeduta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metabolicOpen, meterC, museOk, avvio?.distanza, remote.remoteMuseConnected]);
  /** ── SALTA IL RESPIRO DEL MUSE SE IL SOFFIO DEL METER È GIÀ RIUSCITO — segnalato: « il test
   *  del MUSE non deve essere fatto se il test del soffio del Meter è stato fatto con successo ».
   *  `theta.breathOk` diventa vero/falso solo a prova del soffio conclusa (`ThetaReadyCheck`,
   *  qui sotto o dentro `PannelloMeter` prima ancora di aprire la seduta) — se è riuscita,
   *  `MetabolicCheck` chiederebbe la STESSA cosa una seconda volta con un altro strumento: non
   *  resta nulla da verificare, si passa oltre da soli. `thetaReadyDone` come guardia: senza,
   *  l'effetto scatterebbe anche mentre `ThetaReadyCheck` è ancora aperto (un `breathOk` di UNA
   *  prova precedente in questa stessa apertura). Stesso schema dell'effetto qui sopra: mai uno
   *  stato scritto durante il render, solo dopo, in un effetto. */
  useEffect(() => {
    if (!metabolicOpen || !thetaReadyDone) return;
    if (!(meterC && theta.breathOk)) return;
    setMetabolicOpen(false);
    avviaSedutaConProntezza(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metabolicOpen, thetaReadyDone, meterC, theta.breathOk]);
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
    /* ── IL CONTROLLO DI PRONTEZZA — BUG trovato nella verifica dal vivo di questo stesso
       giro: `metabolicOpen`/`ThetaReadyCheck`/`MetabolicCheck` erano montati (sotto), ma
       QUESTA funzione — l'unica che li può accendere — chiudeva sempre dritto su
       `avviaSeduta()`, senza mai passare dal controllo. Uno strumento scelto portava
       comunque dritti alla seduta, esattamente il difetto segnalato. Stessa regola di
       App.tsx (`proceedStart`): « senza strumenti non c'è prontezza da verificare » (nulla
       da misurare) → dritto alla seduta; altrimenti si apre il controllo, e la seduta vera
       parte da `avviaSedutaConProntezza` quando lui la lascia (o dal `useEffect` qui sopra,
       se la connessione scelta fallisce nel frattempo). */
    if (senzaStrumenti) {
      avviaSeduta();
      return;
    }
    /* ── SEGNALATO: « si le test est fait, lors du démarrage de séance n'est pas utile de
       représenter le test ». Vero — se le boîtes sono già state provate nel pannello di
       connessione (`PannelloMeter`, aperto dalla freccia accanto all'indicatore METER, PRIMA
       di aprire la seduta), `ThetaReadyCheck` qui sotto non deve chiedere di rifarle: la
       stretta e il respiro sono GIÀ fatti (`theta.setup.scaleMeasured`/`theta.breathOk`), e
       App.tsx stesso non obbliga mai a rifare una prova già riuscita — « si può procedere lo
       stesso, la decisione resta dell'auditor » è la nota di quello stesso componente.
       Senza meter (`!meterC`) la domanda non si pone nemmeno: si passa comunque al respiro
       guidato del MUSE, se c'è, esattamente come prima. */
    setThetaReadyDone(meterC && theta.setup.scaleMeasured && theta.breathOk !== null);
    setMetabolicOpen(true);
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
    /* ⚠️ BUG TROVATO verificando dal vivo, in questo stesso giro: chiudere la seduta con un
       ciclo CONTACT/NULL ancora armato non lo registrava MAI in `auditingCyclesRef` — quel
       ciclo spariva dal PDF, non « incompleto », proprio ASSENTE. `closeOpenCycleAtEnd()`
       (dentro `useContactNullCycle`, condiviso) esiste apposta per questo — App.tsx la chiama
       in `handleEnd()`, qui non veniva mai chiamata. Stessa cosa per un MIRROR ancora armato
       (`stopMirror()`). Vanno chiamate PRIMA di leggere i due `*CyclesRef` per il PDF, sotto —
       altrimenti il ciclo in corso non è ancora nell'elenco quando lo si legge. */
    cycles.closeOpenCycleAtEnd();
    if (mirror.mirrorArmedRef.current && mirror.mirrorCurRef.current) mirror.stopMirror();
    /* ── LA SEDUTA FINISCE DIRETTA IN HISTORY, MAI SU UNO SCHERMO DI RAPPORTO — segnalato:
       « vorrei che il Report post session non ci sia più in Serenity, solo il PDF in
       History ». Vedi `sessionReport.ts` per il perché non è un porting di
       `PostSessionReport.tsx` riga per riga: stessa forma di `SessionSummary`, stesso
       linguaggio visivo del PDF, coi soli dati che SERENITY misura già per intero. */
    /* ⚠️ Trovato verificando dal vivo, in questo stesso giro: `corpusAvailable()` guarda
       l'archivio CORPUS (JSON Lines per l'IA, richiede l'app Electron con filesystem) — un
       controllo SBAGLIATO qui, che bloccava il salvataggio in History anche nel browser, dove
       `saveSession`/`saveSessionPdfAsync` (localStorage/IndexedDB via `lib/storage.ts`)
       funzionano benissimo, ed è per questo che `HistoryModal` stesso resta usabile lì. I due
       archivi sono INDIPENDENTI — l'uno non è una condizione per l'altro. */
    try {
      const profileId = avvio?.auditorId && avvio.auditorId !== 'nuovo' ? avvio.auditorId : '_default';
      const auditorPhoto = (() => { try { return getProfiles().find(p => p.id === avvio?.auditorId)?.photo; } catch { return undefined; } })();
      const pcPhoto = (() => { try { return getPcProfiles().find(p => p.id === avvio?.pcId)?.photo; } catch { return undefined; } })();
      const inizio = sessionStartRef.current || Date.now();
      const input: SerenityReportInput = {
        id: String(inizio),
        profileId,
        date: inizio,
        duration: Math.max(0, Math.floor((Date.now() - inizio) / 1000)),
        auditorName: nomeAuditor === '—' ? '' : nomeAuditor,
        pcName: avvio?.solo ? nomeAuditor : (nomePreclear === '—' ? '' : nomePreclear),
        auditorPhoto, pcPhoto,
        isSolo: !!avvio?.solo,
        noInstruments: senzaStrumenti,
        mass: displayMass,
        totalTa: meterC ? theta.totalTa : metricsStore.get().totalTa,
        epValidated: ep.epValidated,
        epReactionType: ep.epReactionType || undefined,
        epRealization: ep.epRealization || undefined,
        epAuditorNote: ep.epAuditorNote || undefined,
        epVgi: ep.epVgi, epVvgi: ep.epVvgi,
        epDurationMin: ep.epDurationMin || undefined,
        deltaStar, deltaStarN, deltaTrend, deltaBaseline, deltaAdaptive,
        // ── LE TABELLE PER-CICLO — vedi la nota in testa a `sessionReport.ts`: i tre elenchi
        // qui sotto erano già dentro i motori condivisi (`cycles`/`mirror`/`tone`), solo mai
        // letti da questo lato. Solo ASSESSMENT è una vera trasformazione: `assessItems`
        // raggruppati per `gruppo` (lo stesso numero che `ZonaAssessment` usa per « ×N »)
        // producono la STESSA forma di `assessCyclesRef` in App.tsx.
        auditingCycles: cycles.auditingCyclesRef.current,
        mirrorCycles: mirror.mirrorCyclesRef.current,
        toneCycles: tone.toneCyclesRef.current,
        assessCycles: (() => {
          const perGruppo = new Map<number, typeof assessItems>();
          for (const it of assessItems) {
            const g = perGruppo.get(it.gruppo) ?? [];
            g.push(it); perGruppo.set(it.gruppo, g);
          }
          return Array.from(perGruppo.entries()).map(([n, righe]) => ({
            n,
            tStartSec: Math.min(...righe.map(r => r.time)),
            tEndSec: Math.max(...righe.map(r => r.time)),
            items: righe.map(r => ({ item: r.item, reaction: r.reaction ?? 'NULL', time: r.time, beforeMs: r.beforeMs })),
          }));
        })(),
        cansTest: {
          hasMeter: meterC,
          done: testedToday(canHistory, Date.now()),
          config: theta.setup.config,
          soloOffset: theta.setup.offsets?.['solo-can'] ?? 0,
          taMargin: 0,
        },
      };
      const riepilogo = costruisciRiepilogo(input);
      saveSession(riepilogo);
      void (async () => {
        try {
          const pdf = await generaPdf(input, k => t(k as never) as string, LC);
          try { await saveSessionPdfAsync(riepilogo.id, pdf); } catch { saveSessionPdf(riepilogo.id, pdf); }
        } catch (e) { console.error('[SERENITY] generazione PDF fallita', e); }
      })();
    } catch (e) {
      console.error('[SERENITY] salvataggio seduta in History fallito', e);
    }
    corpusSessionRef.current = '';
    if (avvio?.distanza) remote.impostaStatoSeduta('ended');
    // MNA — la seduta finisce, un tono acceso non deve sopravviverle (stessa regola di
    // App.tsx: « seduta finita/in pausa → azzera tutto l'audio »).
    primeFreqAudio.killAll();
    setPrimePhase('IDLE'); setPrimeCopies([]); setPrimeCaptured(false);
    setAperta(false); setPausata(false); pausaMotivoRef.current = null;
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
        <PannelloConfig onChiudi={() => setConfigAperto(false)}
          needleTrim={needleTrim} setNeedleTrim={setNeedleTrim}
          needleInertia={needleInertia} setNeedleInertia={setNeedleInertia}
          museOk={museOk} />
      </main>
    );
  }

  /* ── ASSESSMENT, ORA SOTTO EP — segnalato: « la zona assessment deve stare sotto il bottone
   *  EP... quindi la zona arco deve occupare tutto lo spazio liberato ». Non è più una colonna
   *  nella riga a fianco dell'arco (v. la barra laterale, sopra, dove vive ora) — l'arco
   *  (sotto) riprende TUTTA quella larghezza. Nella riga resta solo la colonna destra
   *  (Santé/journal). Segnalato di nuovo: « System Health deve essere della stessa larghezza
   *  che le camm » — non più a metà riga, ma larga quanto CAM 2 (la più grande delle due, 272px
   *  — v. sotto), la STESSA colonna sotto cui già vivono le camere (« sotto les cams »). Con le
   *  due colonne strette (148 + 272, invece di 50%+50% di prima) l'arco (`flex:1`) si allarga
   *  fino quasi a toccarle — segnalato: « la zona arc deve quindi allargarsi ». */
  const assessColOpen = aperta && moduleVis.ri;
  /* ⚠️ BUG TROVATO — segnalato: « la fenêtre Santé Système apparaît alors que le MUSE n'est
   *  pas activé... fais apparaître les modules SEULEMENT s'ils correspondent au choix des
   *  instruments, EXACTEMENT comme dans EQUILIBRIUM, VERIFIE LE CODE ». Verificato: App.tsx
   *  (righe intorno a "Main Dashboard Area") ha un commento ESPLICITO — « FIX M-07: dead
   *  `hideHealth = false` removed — visibility driven by `moduleVis` ONLY » — cioè EQUILIBRIUM
   *  ha RIMOSSO deliberatamente un cancello sugli strumenti che un tempo aveva: oggi `Santé
   *  Système` si mostra quando `moduleVis.health` è acceso, PUNTO, strumento collegato o no.
   *  Il `&& (museOk || meterC)` qui era un'invenzione mia, non una riproduzione — tolto, per
   *  la stessa regola di sempre: riprodurre EQUILIBRIUM, non una versione più prudente
   *  inventata qui. */
  const rightColOpen = (aperta && moduleVis.health) || moduleVis.journal;
  const moduleColWidth = 272;
  /* ── LE CAMERE SONO SOPRA — segnalato: « le zones devono essere sotto les cams ». Le camere
   *  galleggiano `position:absolute, top:16, right:32` sulla STESSA colonna destra dove ora
   *  vive Santé Système/journal (in flusso, sotto) — senza spazio riservato, le due si
   *  sovrapponevano. Un `paddingTop` sulla colonna destra pari alla vera altezza dello stack
   *  (aperta/collassata, una o due camere) le tiene SEMPRE sotto, mai più sotto le camere.
   *  Le taglie (272/170) sono le stesse di `CameraCerchio` sotto — « la zona camm deve essere
   *  di 1/5 più piccola » (340→272, 213→170.4→170), ridotte insieme lì e qui. */
  const cam2H = !moduleVis.cam2 ? 0 : (cam2Collassata ? 88 : 272);
  const cam1H = !moduleVis.cam1 ? 0 : (cam1Collassata ? 88 : 170);
  const camStackH = (moduleVis.cam1 || moduleVis.cam2)
    ? 16 + cam2H + (moduleVis.cam1 && moduleVis.cam2 ? 14 : 0) + cam1H + 20
    : 0;

  return (
    <main style={{
      height: '100%', display: 'grid',
      /* ⚠️ BUG TROVATO verificando dal vivo QUESTO stesso giro: `'auto 1fr auto'` era scritto
         per TRE figli nell'ordine header/quadrante/comandi (« era `<footer>`, l'ultimo figlio
         della pagina » — nota più giù su `ser-comandi`) — quando i comandi si sono spostati
         SOPRA il quadrante (un giro passato), l'ordine è diventato header/comandi/quadrante,
         ma il modello no: la riga elastica (`1fr`) restava la SECONDA, che ora è `ser-comandi`
         (una barra di bottoni, non lo strumento) — a `<section>` (l'arco, ciò che davvero ha
         bisogno di spazio) restava l'ULTIMA riga, `auto`: strizzata al minimo. Restava invisibile
         finché l'arco (il suo `aspect-ratio` deriva l'altezza dalla LARGHEZZA, non dallo spazio
         verticale del genitore) semplicemente TRABOCCAVA dal proprio riquadro senza saperlo —
         disegnato alla taglia giusta, ma con una riga di GRIGLIA minuscola sotto. Le nuove colonne
         dei moduli (assessment/Santé/journal, sopra), IN FLUSSO invece che `position:absolute`,
         quello spazio lo chiedono per davvero: `1fr` ora va a `<section>`, l'ultima riga. */
      gridTemplateRows: 'auto auto 1fr',
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
          <div className="s-glass s-glass-lift" style={{
            display: 'flex', flexDirection: 'column', gap: 16, padding: '28px 32px',
            borderRadius: 16, background: 'var(--s-disc)',
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
                  fontFamily: 'var(--s-sans)', fontSize: 15.5, letterSpacing: '0.02em',
                  background: o.on ? 'var(--s-disc-sunk)' : 'transparent',
                  color: 'var(--s-ink)', boxShadow: o.on ? 'var(--s-shadow)' : 'none',
                }}>
                  <span style={{ fontFamily: 'var(--s-mono)', width: 14 }}>{o.on ? '✓' : '·'}</span>
                  {o.label}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 14, color: 'var(--s-ink-faint)', maxWidth: 280, lineHeight: 1.5 }}>
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
                  // ⚠️ Segnalato: « non è chiaro che devi schiacciare su save ». INVIO salva —
                  // il gesto naturale dopo aver scritto un nome, invece di dover trovare il
                  // piccolo bottone testuale accanto (che resta, per chi preferisce il mouse).
                  onKeyDown={e => { if (e.key === 'Enter' && nomeConfigDaSalvare.trim()) {
                    salvaConfigurazione(nomeConfigDaSalvare, avvio, connSel); setConfigSalvata(true);
                  } }}
                  placeholder={LC('nome di questa configurazione…', 'nom de cette configuration…',
                    'name for this configuration…', 'nombre de esta configuración…', 'namn för denna konfiguration…') as string}
                  style={{
                    flex: 1, border: 'none', borderBottom: '1px solid var(--s-ink-ghost)', background: 'none',
                    outline: 'none', fontFamily: 'var(--s-sans)', fontSize: 14.5, color: 'var(--s-ink)',
                    padding: '2px 4px',
                  }}
                />
                <button
                  disabled={!nomeConfigDaSalvare.trim()}
                  onClick={() => { salvaConfigurazione(nomeConfigDaSalvare, avvio, connSel); setConfigSalvata(true); }}
                  style={{
                    border: 'none', background: 'none', cursor: nomeConfigDaSalvare.trim() ? 'pointer' : 'default',
                    opacity: nomeConfigDaSalvare.trim() ? 1 : 0.4,
                    fontFamily: 'var(--s-sans)', fontSize: 14, color: 'var(--s-ink-soft)', whiteSpace: 'nowrap',
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
                fontFamily: 'var(--s-sans)', fontSize: 15, color: 'var(--s-ink-ghost)',
              }}>
                {t('cancel')}
              </button>
              <button
                disabled={!connSel.muse && !connSel.theta && !connSel.none}
                onClick={async () => {
                  // ⚠️ Segnalato: « si scrive il nome della session e si può salvarlo, ma non è
                  // chiaro che devi schiacciare su save — naturalmente si vuole schiacciare il
                  // bottone grosso OUVRIR UNE SÉANCE ». Vero: due gesti per un'unica intenzione
                  // (nominare + aprire). Ora basta scrivere il nome — aprire la seduta la
                  // salva DA SÉ, senza bisogno di trovare e premere "enregistrer" a parte.
                  if (nomeConfigDaSalvare.trim()) {
                    salvaConfigurazione(nomeConfigDaSalvare, avvio, connSel);
                  }
                  const nessuno = connSel.none;
                  setScegliStrumento(false);
                  setSenzaStrumenti(nessuno);
                  if (nessuno) {
                    // ── SENZA STRUMENTI NON C'È PRONTEZZA DA VERIFICARE — stessa regola di
                    // App.tsx: niente da misurare, dritti alla seduta.
                    avviaSeduta();
                    return;
                  }
                  if (connSel.muse) await muse.handleConnectMuse();
                  if (connSel.theta) await theta.connect();
                  metabolicBaseline.reset();
                  setThetaReadyDone(false);
                  setMetabolicOpen(true);
                }}
                className="s-glass s-glass-btn"
                style={{
                  borderRadius: 999, padding: '9px 22px',
                  cursor: (connSel.muse || connSel.theta || connSel.none) ? 'pointer' : 'default',
                  opacity: (connSel.muse || connSel.theta || connSel.none) ? 1 : 0.4,
                  fontFamily: 'var(--s-sans)', fontSize: 15, letterSpacing: '0.06em', textTransform: 'uppercase',
                  background: 'var(--s-ink)', color: 'var(--s-ground)',
                }}>
                {t('ser_open_session')}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── IL CONTROLLO DI PRONTEZZA — vedi la nota su `metabolicOpen`, sopra. Stessa
          sequenza di App.tsx: prima le boîtes (`ThetaReadyCheck`, se il meter è collegato e non
          ancora fatto in questa apertura), poi il respiro del MUSE (`MetabolicCheck`, se il
          MUSE è collegato — a distanza si guarda il SUO MUSE, non uno locale che qui non
          esiste). Nessuno dei due blocca per davvero: ANNULLA su entrambi apre la seduta lo
          stesso — è consultivo, la decisione resta dell'auditor. */}
      {metabolicOpen && (() => {
        const readinessMuseOk = avvio?.distanza ? remote.remoteMuseConnected : museOk;
        if (meterC && !thetaReadyDone) {
          return (
            <div className="ser-ready-wrap">
            <ThetaReadyCheck
              scaleMeasured={theta.setup.scaleMeasured}
              breathOk={theta.breathOk}
              squeezeOk={theta.squeezeOk}
              testing={theta.testing}
              peakOffset={theta.testPeakOffset}
              startSqueezeTest={() => {
                // ⚠️ IL TA SI PRENDE QUI, prima che la stretta lo muova — stessa ragione di
                // App.tsx: è il riposo IN QUESTA configurazione, e la coppia dei due riposi è
                // lo scarto che si cerca al passo 4 della taratura.
                const ta = theta.ta;
                if (ta !== null) {
                  setProvaTa(p => theta.setup.config === 'two-cans' ? { ...p, two: ta } : { ...p, solo: ta });
                }
                theta.startSqueezeTest();
              }}
              startBreathTest={theta.startBreathTest}
              sensTrim={theta.setup.sensTrim}
              setSensTrim={theta.setSensTrim}
              config={theta.setup.config}
              setConfig={theta.setConfig}
              soloOffsetMisurato={(theta.setup.offsets?.['solo-can'] ?? 0) !== 0}
              taTwo={provaTa.two}
              taSolo={provaTa.solo}
              onApplySoloOffset={off => theta.setSoloOffset(off)}
              unknownFormat={theta.unknownFormat}
              rawSamples={theta.rawSamples}
              onProceed={() => {
                setThetaReadyDone(true);
                // Nessun MUSE da controllare dopo: si apre la seduta subito, come App.tsx.
                if (!readinessMuseOk) { setMetabolicOpen(false); avviaSeduta(); }
              }}
              onCancel={() => { setMetabolicOpen(false); avviaSeduta(); }}
            />
            </div>
          );
        }
        if (readinessMuseOk) {
          return (
            <div className="ser-ready-wrap">
            <MetabolicCheck
              lang={lang}
              meterAlreadyCalibrated={meterC && theta.setup.scaleMeasured}
              museConnected={readinessMuseOk}
              museWorn={museGate.museContact}
              museConnecting={!avvio?.distanza && muse.museConnection === 'searching'}
              onProceed={a => avviaSedutaConProntezza(a)}
              onCancel={a => avviaSedutaConProntezza(a)}
              onPhase={() => {}}
            />
            </div>
          );
        }
        // Né meter da provare né MUSE da ascoltare (la connessione scelta è FALLITA nel
        // frattempo) — l'uscita vera è nell'effetto qui sotto, non qui: uno stato scritto
        // DURANTE il render (invece che dopo, in un effetto) è esattamente l'impurità che ha
        // già causato un falso allarme dei Hook in un giro precedente di questa stessa
        // sessione — non si ripete l'errore.
        return null;
      })()}
      {/* ── LA BARRA LATERALE — APRI/CHIUDI e i quattro metodi, FUORI DALL'ARCO ─────────────
          Segnalato: « metti i bottoni Contact, Null, Mirror, Tone ed anche OPEN sul lato
          sinistro fuori dall'arco, così si ha più spazio per il ciclo stesso ». Prima
          stavano nella barra comandi orizzontale, sopra il quadrante — la stessa riga in cui
          vive anche « a che punto sono, cosa devo fare » (`SuggerimentoCiclo`) quando un
          ciclo è armato: più pillole in quella riga, meno posto per quel testo. Ancorata al
          bordo sinistro di `<main>` (che ha già `position:relative`), verticale, fuori dal
          contenitore del quadrante — zero logica nuova, gli stessi `chiudi`/`apri`/
          `cycles.armCycle`/`mirror.armMirror`/`setToneAttivo` di sempre, solo spostati. */}
      <div style={{
        position: 'absolute', left: 20, top: sidebarTop, bottom: 24, zIndex: 8,
        display: 'flex', flexDirection: 'column',
        justifyContent: (aperta && moduleVis.ri) ? 'flex-start' : 'center',
        /* ⚠️ Segnalato: « assessment deve essere largo quanto i bottoni Contact...ecc » — poi,
           verificando dal vivo QUESTO stesso giro: « la zona ASSESSMENT non mostra il bottone
           [INDICAZIONE] ». Vero — a 148px il selettore di vista (ASSESSMENT/INDICAZIONE, due
           bottoni affiancati) non ci stava: il secondo restava tagliato a una sola lettera. La
           STESSA larghezza dei bottoni sopra andava bene per LORO (una parola sola, una pillola
           a testa) ma non per un pannello con righe di testo, letture e bottoni indica/non
           indica — 272px, la STESSA larghezza già scelta per Santé Système/journal a destra
           (colonna gemella, stessa logica): l'involucro stretto qui sotto (148px) resta SOLO
           per i sette bottoni, l'assessment prende tutta questa larghezza più larga. */
        gap: 10, width: 272,
        /* ⚠️ BUG TROVATO — segnalato: « le module History et Processus ne s'ouvrent pas ».
           Questo contenitore è alto quanto quasi tutta la pagina (`top:118, bottom:24`) per
           poter CENTRARE verticalmente i suoi bottoni — ma uno `<div>` copre l'intero
           rettangolo anche dove non c'è nulla da vedere, e quel rettangolo si sovrapponeva
           alle icone Historique/Processus della barra comandi appena sopra (`top:118` cadeva
           proprio lì): i click su quelle icone finivano rubati da questo `<div>` invece di
           raggiungerle — la STESSA famiglia di bug degli « angoli trasparenti » delle camere,
           trovata un giro fa. `pointerEvents:'none'` qui, riacceso `'auto'` su ogni bottone
           vero: il rettangolo torna trasparente ai click dove non c'è niente da premere. */
        pointerEvents: 'none',
      }}>
        {/* ── I BOTTONI, IN UNA COLONNA STRETTA A SÉ — segnalato: « la zona assessment... deve
            stare sotto il bottone EP, rimonta l'insieme dei bottoni CLOSE THE SESSION ». Il
            contenitore intorno (sopra) è ora largo quanto l'assessment (« larga la metà »,
            v. sotto) per fargli posto SOTTO — ma i bottoni stessi devono restare STRETTI come
            sempre, non allargarsi con lui: un involucro suo, 148px, `align-items` di default
            (`stretch`) dentro QUESTO, non nel contenitore largo. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 148, flexShrink: 0 }}>
        {/* ── LE LETTURE, ORA DENTRO L'ARCO — segnalato: « l'horloge, le temps de session, le TA
            e la somme de TA doivent être inscrits en haut à gauche dans la zone de l'arc ».
            Stavano qui (colonna stretta a lato, fuori dallo strumento) — spostate dentro il
            riquadro dello strumento stesso, angolo in alto a sinistra (v. più giù, appena
            prima di `<QuantumSphere>`). Zero logica nuova, solo dove compaiono. */}
        <button className="s-glass s-glass-btn" onClick={aperta ? chiudi : apri} style={{
          cursor: 'pointer', pointerEvents: 'auto',
          background: 'var(--s-disc)', color: 'var(--s-ink)',
          borderRadius: 16, padding: '12px 10px',
          fontSize: 14, letterSpacing: '0.08em', textTransform: 'uppercase',
          fontFamily: 'var(--s-sans)', lineHeight: 1.3, textAlign: 'center',
        }}>
          {/* ── SEGNALATO: « le bouton FERMER — on ne sait pas s'il correspond à la séance ou
              au cycle ». App.tsx distingue ESPLICITAMENTE i due gesti nel testo (« ferma la
              seduta » contro « chiudi/annulla il ciclo »): qui la parola sola "CHIUDI" non lo
              diceva, e un ANNULLA di ciclo poteva sembrare lo stesso gesto. Ora dice sempre
              "LA SEDUTA" per esteso — l'unico bottone che la governa. */}
          {aperta
            ? LC('chiudi la seduta', 'fermer la séance', 'close the session', 'cerrar la sesión', 'stäng sessionen')
            : LC('apri una seduta', 'ouvrir une séance', 'open a session', 'abrir una sesión', 'öppna en session')}
        </button>
        {/* ── PAUSA/RIPRENDI, ORA VICINO A "FERMER LA SÉANCE" — segnalato: « il bottone di
            pausa deve essere vicino al bottone Fermer la séance ». Stessa scelta dell'auditor
            di sempre (`pausaManuale`), stesso stato (`pausata`) — solo spostata qui, subito
            sotto il bottone che governa la seduta intera, di cui la pausa è la scelta
            "minore". Icona sola: lo stato lo dice già il badge "in pausa" dentro il
            quadrante, accanto all'orologio. */}
        {aperta && (
          <button
            className="s-glass s-glass-btn"
            onClick={pausaManuale}
            title={(pausata
              ? LC('riprendi la seduta', 'reprendre la séance', 'resume the session', 'reanudar la sesión', 'återuppta sessionen')
              : LC('metti in pausa', 'mettre en pause', 'pause', 'pausar', 'pausa')) as string}
            style={{
              cursor: 'pointer', pointerEvents: 'auto', padding: '10px 10px', borderRadius: 16,
              background: 'var(--s-disc)', display: 'flex', justifyContent: 'center',
              color: pausata ? 'var(--s-alive)' : 'var(--s-ink-soft)',
            }}>
            {pausata ? <Play size={20} strokeWidth={1.8} fill="currentColor" /> : <Pause size={20} strokeWidth={1.8} />}
          </button>
        )}
        {/* ── I QUATTRO METODI, ORA TONDI — segnalato: « les boutons CYCLES à gauche doivent
            être moins présents, mais plus différenciés les uns des autres... des boutons ronds,
            exactement dans le style de l'image de référence, cohérents avec tous les autres
            boutons de l'interface ». Erano quattro pillole rettangolari col nome per intero —
            gli UNICI bottoni rettangolari della barra laterale, in un'app dove ogni altro
            bottone (CONFIG, Guide, History, Processus, le camere) è un CERCHIO. Ora cerchi
            anche loro, stessa famiglia visiva di `CameraCerchio` (icona dentro, didascalia
            sotto sempre leggibile — mai solo un `title`): MENO presenti (54px invece di una
            pillola larga quanto la colonna), ma PIÙ differenziati — un'icona propria per
            ciascuno (non solo un colore di bordo), scelta per la GESTO del metodo.
            ⚠️ Segnalato di nuovo: « l'icone Contact deve essere più esplicito, come qualcosa
            che è mirato » e « l'icone NULL deve essere più esplicito ». `Hand` (un contatto
            generico) → `Crosshair` (un bersaglio inquadrato: il gesto di MIRARE, non solo di
            toccare). `Target` (già un bersaglio, ma indistinguibile a colpo d'occhio da
            `Crosshair` ora su CONTACT) → `Scale`, la bilancia: NULL è il punto di equilibrio,
            non il puntamento — due gesti diversi, due icone diverse. `FlipHorizontal2` = MIRROR
            (il raddoppio), `AudioWaveform` = TONE (la scala). */}
        {aperta && !cycles.cycleArmed && !mirror.mirrorArmed && !toneAttivo && (
          <>
            {([
              { k: 'contact', hue: 'var(--s-still)', label: 'CONTACT', Icona: Crosshair,
                onClick: () => cycles.armCycle('charge') },
              { k: 'null', hue: 'var(--s-alive)', label: 'NULL', Icona: Scale,
                onClick: () => cycles.armCycle('null') },
              // ── MIRROR — il terzo metodo, escluso a vicenda con CONTACT/NULL ────────────
              { k: 'mirror', hue: 'var(--s-reserve)', label: 'MIRROR', Icona: FlipHorizontal2,
                onClick: () => mirror.armMirror() },
              // ── TONE SCALE — il quarto metodo, escluso a vicenda con gli altri tre. A
              // differenza degli altri tre non si "arma" per un solo item: si ENTRA nel
              // metodo (`toneAttivo`) e ci si lavora per più resistenze di fila.
              { k: 'tone', hue: null, label: 'TONE', Icona: AudioWaveform, onClick: () => setToneAttivo(true) },
            ]).map(c => (
              <div key={c.k} style={{ display: 'grid', justifyItems: 'center', gap: 4, pointerEvents: 'auto' }}>
                <button className="s-glass s-glass-btn" onClick={c.onClick} title={c.label} style={{
                  width: 54, height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `1.5px solid ${c.hue ?? 'var(--s-ink-ghost)'}`, cursor: 'pointer',
                  borderRadius: '50%', background: 'var(--s-disc)', color: c.hue ?? 'var(--s-ink-soft)',
                }}>
                  <c.Icona size={22} strokeWidth={1.8} aria-hidden="true" />
                </button>
                <span style={{
                  fontFamily: 'var(--s-sans)', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                  color: c.hue ?? 'var(--s-ink-faint)',
                }}>{c.label}</span>
              </div>
            ))}
            {/* ── IL QUINTO METODO, ORA UN CERCHIO ANCHE LUI — segnalato: « manca la zona LIBRE
                sotto TONE », poi « il bottone OUVERT deve essere anche lui sotto forma di
                cerchio. Cambia il nome in UNBOUND ». `engine/sessionMode.ts` conta CINQUE
                metodi, non quattro — CONTACT/NULL/MIRROR/TONE più `free` (SERENITY lo calcola
                già da sé: `mode` diventa `'free'` quando nessuno degli altri quattro è armato,
                esattamente la condizione di questo blocco). App.tsx chiama questo stato
                "APERTO"/"OUVERT" (evitava deliberatamente "libero": « libero suonava come
                "senza regole" », la sua stessa nota) — richiesta esplicita e nuova, SOLO per
                SERENITY: "UNBOUND", non toccando la parola di App.tsx. Stessa forma dei quattro
                metodi sopra (cerchio 54px, icona, didascalia) invece della pillola rettangolare
                di prima — ma non un bottone: non c'è nulla da armare, ci si è già, quindi
                `className="s-glass"` (non `-btn`) e cursore di default, non pointer. */}
            <div style={{ display: 'grid', justifyItems: 'center', gap: 4, pointerEvents: 'auto' }}>
              <span className="s-glass" title={LC(
                'nessuna sequenza ciclica predefinita — l\'ago, l\'assessment e l\'R&I restano attivi',
                'aucune séquence cyclique prédéfinie — l\'aiguille, l\'assessment et le R&I restent actifs',
                'no predefined cyclic sequence — the needle, assessment and R&I stay active',
                'sin secuencia cíclica predefinida — la aguja, el assessment y el R&I siguen activos',
                'ingen fördefinierad cyklisk sekvens — nålen, assessment och R&I förblir aktiva') as string}
                style={{
                  width: 54, height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1.5px solid var(--s-ink-ghost)', cursor: 'default',
                  borderRadius: '50%', background: 'var(--s-disc)', color: 'var(--s-ink-soft)',
                }}>
                <Unlink size={22} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span style={{
                fontFamily: 'var(--s-sans)', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                color: 'var(--s-ink-faint)',
              }}>{LC('SVINCOLATO', 'DÉLIÉ', 'UNBOUND', 'DESLIGADO', 'OBUNDEN')}</span>
            </div>
          </>
        )}
        {/* ── EP, SOTTO TONE — segnalato: « il bottone EP deve essere posizionato sotto TONE ».
            Stava nella barra comandi sotto il quadrante, lontano dai quattro metodi. L'auditor
            lo apre da sé quando vuole registrarlo, non un conto alla rovescia automatico (in
            EQUILIBRIUM quella finestra non è mai raggiungibile) — "EP ✓" una volta validato,
            come in App.tsx. A differenza dei quattro metodi sopra resta visibile SEMPRE a
            seduta aperta, non solo quando nessun ciclo è armato: si registra un EP in
            qualunque momento della seduta, non solo fra un ciclo e l'altro. */}
        {/* Tondo come i quattro metodi sopra — stessa famiglia, stessa ragione. */}
        {aperta && (
          <div style={{ display: 'grid', justifyItems: 'center', gap: 4, pointerEvents: 'auto' }}>
            <button
              className="s-glass s-glass-btn"
              onClick={() => { if (!ep.epValidated) ep.setEpTimestamp(sessionClock.now()); ep.setEpManualOpen(true); }}
              title="EP" style={{
                width: 54, height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', border: '1.5px solid var(--s-ink-ghost)', borderRadius: '50%',
                background: 'var(--s-disc)', color: ep.epValidated ? 'var(--s-still)' : 'var(--s-ink-soft)',
              }}>
              {ep.epValidated ? <BadgeCheck size={22} strokeWidth={1.8} aria-hidden="true" /> : <FileCheck size={22} strokeWidth={1.8} aria-hidden="true" />}
            </button>
            <span style={{
              fontFamily: 'var(--s-sans)', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
              color: ep.epValidated ? 'var(--s-still)' : 'var(--s-ink-faint)',
            }}>{ep.epValidated ? 'EP ✓' : 'EP'}</span>
          </div>
        )}
        </div>
        {/* ── L'ASSESSMENT, SOTTO EP — segnalato: « la zone assessment... deve stare sotto il
            bottone EP... rimonta l'insieme dei bottoni... quindi la zona arco deve occupare
            tutto lo spazio liberato ». Era una colonna nella riga a tre a fianco dell'arco —
            spostato qui, sotto i bottoni, nella STESSA striscia a sinistra (mai più nella riga
            dell'arco: l'arco la riprende tutta, v. sotto). Segnalato di nuovo: « largo quanto
            i bottoni Contact...ecc » — il contenitore intorno è di nuovo 148px (v. sopra), e
            `width:'100%'` qui prende esattamente quella misura, non più una larga a parte. */}
        {assessColOpen && (
          <div style={{ width: '100%', flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', pointerEvents: 'auto' }}>
            <ZonaAssessment
              attivo={assessAttivo}
              onToggle={() => setAssessAttivo(v => !v)}
              items={assessItems}
              LC={LC}
              dueAghi={museOk && meterC}
              onIndica={segnaIndicazione}
              onAggiungiItem={aggiungiItemManuale}
              cercaLettura={cercaLetturaPerParola}
            />
          </div>
        )}
      </div>
      {/* ── L'INTESTAZIONE, che non è una barra ───────────────────────────────────────────
          Nessun fondo, nessuna linea di separazione: il nome sta posato sulla stessa
          superficie di tutto il resto. Una barra è già un pannello. */}
      {/* `flexWrap` — segnalato indirettamente: le pillole di vetro e i cursori scorrevoli sono
          più larghi delle parole nude di prima. Senza, su una finestra stretta gli ultimi
          indicatori uscivano dal bordo invece di andare a capo — persi, non solo compressi. */}
      <header style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 14, rowGap: 10 }}>
        {/* ── IL LOGO — segnalato: « avant tout tu dois mettre le logo... comme pour
            Equilibrium ». Stessa immagine (`/logo-alt-scientology.png`, nella cartella
            pubblica condivisa dai due build), stesso gesto (apre i crediti — `CreditsModal`,
            riusato tale e quale: è un velo scuro a sé, come `GuideModal` — non fa parte della
            superficie chiara/scura di SERENITY, non c'è nulla da riadattare). In tema chiaro
            l'immagine (disegnata per un fondo scuro, il testo sparirebbe) prende la stessa
            pastiglia scura di App.tsx invece di un filtro che ne sporcherebbe il blu. */}
        <button type="button" onClick={() => setCreditiAperti(true)} title={t('tip_credits') as string} style={{
          border: 'none', padding: isLightTheme ? '4px 10px' : 0, borderRadius: 10,
          background: isLightTheme ? '#2a2a2f' : 'transparent',
          boxShadow: isLightTheme ? '0 2px 8px rgba(38,40,48,0.22)' : 'none',
          cursor: 'pointer', lineHeight: 0, flexShrink: 0,
        }}>
          <img src="/logo-alt-scientology.png" alt="Alt. Scientology" style={{
            height: isLightTheme ? 36 : 44, width: 'auto',
            filter: isLightTheme ? 'none' : 'drop-shadow(0 2px 6px rgba(0,0,0,0.45)) brightness(1.05)',
          }} />
        </button>
        <span style={{ fontFamily: 'var(--s-serif)', fontSize: 21, letterSpacing: '0.14em' }}>
          SERENITY
        </span>
        <span style={{ fontFamily: 'var(--s-mono)', fontSize: 13.5, color: 'var(--s-ink-faint)' }}>
          {__SERENITY_VERSION__}
        </span>
        {/* ⚠️ SEGNALATO: « la langue doit pouvoir être changée en cours de route » — non solo
            alle quattro domande d'avvio. Stessi due selettori di `Avvio.tsx`, condivisi da
            `Impostazioni.tsx`: qui restano visibili per tutta la seduta, non solo prima. */}
        <SelettoreTema />
        <SelettoreLingua />
        {/* ── STORICO E PROCESSUS, DOPO IL BOTTONE LINGUA — segnalato: « les boutons History et
            Processus après le bouton langue ». Stavano subito dopo il numero di versione, PRIMA
            di tema/lingua — spostati dopo. Stessa icona, stesso `onClick`, nessuna logica
            toccata — solo la posizione. */}
        {/* ── IL NUMERO SOPRA I DUE BOTTONI — segnalato: « i bottoni History e Processus devono
            indicare il numero di elementi presenti sul bottone ». `getSessionsByProfile`
            (già usato da `HistoryModal` per lo stesso conto — sincrona, localStorage, non
            l'archivio CORPUS) per questo auditor; `processusPdfs.length`, lo stato già in
            mano. Un pallino in alto a destra sul bottone, come un contatore di notifiche —
            assente (nessun numero) quando l'archivio è vuoto, per non gridare uno zero. */}
        <button className="s-glass s-glass-btn" onClick={() => setHistoryAperto(true)} title={t('sidebar_history') as string} style={{
          position: 'relative', cursor: 'pointer', padding: 8, borderRadius: 999,
          background: 'var(--s-disc)', display: 'flex', color: 'var(--s-ink-soft)',
        }}>
          <HistoryIcon size={22} strokeWidth={1.8} />
          {(() => {
            const n = (() => { try { return getSessionsByProfile(avvio?.auditorId || '_default').length; } catch { return 0; } })();
            return n > 0 ? (
              <span style={{
                position: 'absolute', top: -4, right: -4, minWidth: 17, height: 17, borderRadius: 999,
                background: 'var(--s-ink)', color: 'var(--s-ground)',
                fontFamily: 'var(--s-mono)', fontSize: 10, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
              }}>{n}</span>
            ) : null;
          })()}
        </button>
        <button className="s-glass s-glass-btn" onClick={() => setProcessusAperto(true)} title={t('processus_modal_title') as string} style={{
          position: 'relative', cursor: 'pointer', padding: 8, borderRadius: 999,
          background: 'var(--s-disc)', display: 'flex', color: 'var(--s-ink-soft)',
        }}>
          <BookOpen size={22} strokeWidth={1.8} />
          {processusPdfs.length > 0 && (
            <span style={{
              position: 'absolute', top: -4, right: -4, minWidth: 17, height: 17, borderRadius: 999,
              background: 'var(--s-ink)', color: 'var(--s-ground)',
              fontFamily: 'var(--s-mono)', fontSize: 10, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
            }}>{processusPdfs.length}</span>
          )}
        </button>
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
        {/* ── STESSA PILLOLA DI VETRO DEGLI INDICATORI DI CONNESSIONE — segnalato: « le même
            style pour les cycles doit être utilisé pour les inscriptions en haut ». Non più
            parole nude: un'unica pillola `.s-glass`, come `IndicatoreConnessione` qui accanto —
            stesso materiale per la stessa famiglia di informazioni (chi/come/dove di questa
            seduta), non un secondo linguaggio visivo per dire cose simili. */}
        <span className="s-glass" style={{
          fontSize: 15, color: 'var(--s-ink-soft)', display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--s-disc)', padding: '5px 12px', borderRadius: 999,
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {avvio.solo
              ? <User size={24} strokeWidth={1.8} aria-hidden="true" />
              : <Users size={24} strokeWidth={1.8} aria-hidden="true" />}
            {nomeAuditor}{avvio.solo ? ` · ${t('ser_alone_tag')}` : ` · ${nomePreclear}`}
          </span>
          {avvio.distanza && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Wifi size={24} strokeWidth={1.8} aria-hidden="true" />
              {t('ser_remote_tag')}
            </span>
          )}
          {/* ── BASIC/EXPERT, ORA UN INTERRUTTORE VERO — segnalato: « devi anche permettere di
              schiacciare su expert per passare in normale, e viceversa ». Prima si vedeva SOLO
              quando esperto (`avvio.esperto &&`, uno `<span>` muto, nessun `onClick`) — cambiare
              richiedeva tornare indietro fino alla domanda dell'avvio. Ora sempre visibile, come
              lo stesso interruttore di `Sidebar.tsx` (EQUILIBRIUM: `onClick={() =>
              setUiLevel(uiLevel === 'expert' ? 'normal' : 'expert')}`) — qui `setAvvio` al
              posto di `setUiLevel`, la STESSA idea (un bottone che dice il livello ATTUALE e
              lo capovolge al tocco), non un secondo meccanismo inventato. */}
          <button
            onClick={() => setAvvio(a => a ? { ...a, esperto: !a.esperto } : a)}
            title={(avvio.esperto ? t('sidebar_level_expert_tip') : t('sidebar_level_normal_tip')) as string}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, border: 'none', background: 'none',
              cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 'inherit',
              color: 'inherit',
            }}>
            {avvio.esperto
              ? <Wrench size={24} strokeWidth={1.8} aria-hidden="true" />
              : <CircleUser size={24} strokeWidth={1.8} aria-hidden="true" />}
            {avvio.esperto ? t('ser_expert_tag') : t('ser_normal_tag')}
          </button>
          {/* ── CAMBIA AUDITOR O PRECLEAR, ORA UN'ICONA QUI DENTRO — segnalato: « CHANGE AUDITOR
              OR PRECLEAR doit être sous forme d'icône à avant l'icône sauvegarde de
              l'indication de Auditor/PC et mode en haut ». Era un link di testo in fondo alla
              barra comandi ("← changer d'auditeur ou de préclair"), lontano dalla pillola che
              descrive chi sta auditando — la stessa `ricomincia()` di sempre, solo un'icona,
              nello stesso posto delle scelte che cambia. */}
          {!aperta && (
            <button
              className="s-glass-btn"
              onClick={ricomincia}
              title={t('ser_change_people') as string}
              style={{
                display: 'flex', alignItems: 'center', border: 'none', background: 'none',
                cursor: 'pointer', padding: 2, color: 'var(--s-ink-faint)', lineHeight: 0,
              }}>
              <UserCog size={24} strokeWidth={1.8} aria-hidden="true" />
            </button>
          )}
          {/* ── SALVA QUESTA CONFIGURAZIONE — segnalato: « le bouton doit être inclus dans le
              champ avec les indications Auditeur/PC Expert/Normal, sous forme d'icône ».
              Stessa azione di prima (`salvaConfigAperto`/`salvaConfigurazione`), un'icona sola,
              dentro la STESSA pillola di chi/come si audita — perché salvare LA
              CONFIGURAZIONE è salvare esattamente quello che questa pillola racconta, non
              un'azione indipendente. */}
          {!aperta && (
            <div style={{ position: 'relative' }}>
              <button
                className="s-glass-btn"
                onClick={() => { setSalvaConfigAperto(v => !v); setConfigSalvata(false); }}
                title={LC('salva questa configurazione', 'sauvegarder cette configuration',
                  'save this configuration', 'guardar esta configuración', 'spara denna konfiguration') as string}
                style={{
                  display: 'flex', alignItems: 'center', border: 'none', background: 'none',
                  cursor: 'pointer', padding: 2, color: 'var(--s-ink-faint)', lineHeight: 0,
                }}>
                <Save size={24} strokeWidth={1.8} aria-hidden="true" />
              </button>
              {salvaConfigAperto && (
                <div className="s-glass s-glass-lift" style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 8, zIndex: 40,
                  display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px',
                  borderRadius: 12, background: 'var(--s-disc)',
                  minWidth: 260,
                }}>
                  <span style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--s-ink-faint)' }}>
                    {LC('auditor, preclear, locale/distanza, e gli strumenti connessi in questo momento — tutto insieme.',
                      'auditeur, préclair, local/distance, et les instruments connectés en ce moment — le tout ensemble.',
                      'auditor, preclear, local/distance, and the instruments connected right now — all together.',
                      'auditor, preclear, local/distancia, y los instrumentos conectados ahora mismo — todo junto.',
                      'auditor, preclear, lokal/distans, och instrumenten som är anslutna just nu — allt tillsammans.')}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* ⚠️ Segnalato (di nuovo): « non è chiaro che devi schiacciare su save ».
                        `autoFocus` — il cassetto si apre già col cursore acceso nel campo, non
                        c'è un click in più da indovinare — e INVIO salva, lo stesso gesto
                        aggiunto qui sopra per il campo gemello del dialogo d'apertura. */}
                    <input
                      autoFocus
                      value={nomeConfigDaSalvare}
                      onChange={e => { setNomeConfigDaSalvare(e.target.value); setConfigSalvata(false); }}
                      onKeyDown={e => { if (e.key === 'Enter' && nomeConfigDaSalvare.trim()) {
                        salvaConfigurazione(nomeConfigDaSalvare, avvio,
                          { muse: museOk, theta: meterC, none: senzaStrumenti || (!museOk && !meterC) });
                        setConfigSalvata(true);
                      } }}
                      placeholder={LC('nome di questa configurazione…', 'nom de cette configuration…',
                        'name for this configuration…', 'nombre de esta configuración…', 'namn för denna konfiguration…') as string}
                      style={{
                        flex: 1, border: 'none', borderBottom: '1px solid var(--s-ink-ghost)', background: 'none',
                        outline: 'none', fontFamily: 'var(--s-sans)', fontSize: 14.5, color: 'var(--s-ink)',
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
                        fontFamily: 'var(--s-sans)', fontSize: 14, color: 'var(--s-ink-soft)', whiteSpace: 'nowrap',
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
        </span>
        <span style={{ width: 1, height: 16, background: 'var(--s-ink-ghost)', flexShrink: 0 }} />
        {/* ── LE CONNESSIONI, UN SOLO BOTTONE, SOLO ICONE — segnalato di nuovo: « i bottoni
            MUSE, Meter, No instrument devono essere un solo bottone con solo le icone
            (survolando ogni icona si scrive cosa significa), così guadagniamo spazio in
            larghezza ». Erano tre pillole `IndicatoreConnessione` separate (punto + icona +
            PAROLA, la STRUMENTI davanti) — qui una pillola SOLA (`.s-glass`), tre icone dentro,
            ciascuna il proprio bottone/stato/tooltip: stessa informazione di prima (nulla
            tolto, la frase intera che spiega lo stato resta in `title`, letta al passaggio del
            mouse), niente più parole sempre visibili. Il colore del punto è lo STESSO di
            `IndicatoreConnessione` (`COLORE_PUNTO`, esportato da lì apposta: una sola mappa,
            non duplicata) — un pallino invece che punto+parola, in alto a destra sull'icona. */}
        {(() => {
          const museStato: import('./IndicatoreConnessione').StatoConnessione =
            muse.museConnection === 'connected'
              ? (museGate.museContact ? 'connesso' : 'errore')
              : muse.museConnection === 'searching' ? 'cercando' : 'in-attesa';
          const museTitolo = `MUSE — ${
            muse.museConnection === 'connected'
              ? (museGate.museContact
                  ? (batteryLevel !== null ? `${batteryLevel}%` : '✓')
                  : t('muse_tip_not_worn') as string)
              : muse.museConnection === 'searching' ? t('searching') as string : t('ser_connect_muse') as string
          }`;
          const meterStato: import('./IndicatoreConnessione').StatoConnessione =
            theta.unavailable ? 'spento'
              : meterC ? 'connesso'
              : theta.status === 'connecting' ? 'cercando' : 'in-attesa';
          const meterTitolo = `METER — ${
            theta.unavailable ? t('ser_meter_unavailable') as string
              : meterC ? t('theta_cans') as string
              : theta.status === 'connecting' ? t('searching') as string : t('theta_connect') as string
          }`;
          const noneTitolo = `${LC('SENZA STRUMENTI', 'SANS INSTRUMENTS', 'NO INSTRUMENTS', 'SIN INSTRUMENTOS', 'UTAN INSTRUMENT')} — ${t('no_instruments_mode') as string}`;
          const strumenti: Array<{ key: string; icona: React.ReactNode; onClick?: () => void; stato: import('./IndicatoreConnessione').StatoConnessione; title: string }> = [
            { key: 'muse', icona: <Headphones size={22} strokeWidth={1.8} />, onClick: muse.handleConnectMuse, stato: museStato, title: museTitolo },
            { key: 'meter', icona: <Gauge size={22} strokeWidth={1.8} />, onClick: theta.unavailable ? undefined : (meterC ? theta.disconnect : theta.connect), stato: meterStato, title: meterTitolo },
            {
              key: 'none', icona: <MessageSquareOff size={22} strokeWidth={1.8} />,
              onClick: () => {
                const nuovo = !senzaStrumenti;
                setSenzaStrumenti(nuovo);
                if (nuovo) {
                  if (muse.museConnection !== 'disconnected') muse.handleConnectMuse();
                  if (meterC) theta.disconnect();
                }
              },
              stato: senzaStrumenti ? 'connesso' : 'in-attesa', title: noneTitolo,
            },
          ];
          return (
            <span className="s-glass" style={{
              display: 'flex', alignItems: 'center', gap: 2, background: 'var(--s-disc)',
              borderRadius: 999, padding: '4px 6px',
            }}>
              {strumenti.map(s => (
                <button key={s.key} className="s-glass-btn" onClick={s.onClick} title={s.title}
                  style={{
                    position: 'relative', border: 'none', background: 'transparent',
                    cursor: s.onClick ? 'pointer' : 'default', padding: 6, borderRadius: 999,
                    display: 'flex', color: 'var(--s-ink-soft)',
                  }}>
                  {s.icona}
                  <span aria-hidden="true" style={{
                    position: 'absolute', top: 3, right: 3, width: 7, height: 7, borderRadius: '50%',
                    background: COLORE_PUNTO[s.stato],
                    boxShadow: (s.stato === 'connesso' || s.stato === 'errore')
                      ? `0 0 0 2px color-mix(in srgb, ${COLORE_PUNTO[s.stato]} 25%, transparent)` : 'none',
                    transition: 'background var(--s-slow) var(--s-ease), box-shadow var(--s-slow) var(--s-ease)',
                  }} />
                </button>
              ))}
            </span>
          );
        })()}
        {/* ── LA SUA ESPANSIONE — due lattine/lattina sola, le due prove, la taratura TA ──────
            Segnalato: la stessa connessione non deve avere due abitudini diverse (una in alto,
            una in fondo alla pagina) da imparare. Qui, SOLO a meter connesso, una freccia
            accanto al suo stesso indicatore apre `PannelloMeter` come un cassetto ancorato
            proprio lì (`position:absolute`, sotto l'intestazione) — la stessa idea del cassetto
            di CONFIG, non un secondo luogo. */}
        {meterC && (
          <button className="s-glass s-glass-btn" onClick={() => setMeterSetupAperto(v => !v)} style={{
            cursor: 'pointer', padding: '5px 12px', borderRadius: 999,
            background: 'var(--s-disc)',
            fontFamily: 'var(--s-sans)', fontSize: 14, color: 'var(--s-ink-faint)',
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
          <span style={{ fontSize: 14.5, color: 'var(--s-reserve)' }}>{hardwareError}</span>
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
            <span style={{ fontFamily: 'var(--s-sans)', fontSize: 12, letterSpacing: '0.12em',
                          textTransform: 'uppercase', color: 'var(--s-ink-ghost)' }}>
              {LC('a distanza', 'à distance', 'remote', 'a distancia', 'på distans')}
            </span>
            <IndicatoreConnessione
              icona={<Wifi size={26} strokeWidth={1.8} />}
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
              icona={<Headphones size={26} strokeWidth={1.8} />}
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
        <button className="s-glass s-glass-btn" onClick={() => setConfigAperto(true)} title={t('config') as string} style={{
          cursor: 'pointer', padding: 8, borderRadius: 999,
          background: 'var(--s-disc)', display: 'flex', color: 'var(--s-ink-soft)',
        }}>
          <Settings size={32} strokeWidth={1.6} />
        </button>
        {/* ── LA GUIDA — segnalata assente nell'audit funzionale completo. `GuideModal` è
            autosufficiente (un iframe su `/guide/EQUILIBRIUM-manuale.html`, copiato a ogni
            build da `scripts/copy-guide.cjs`) — zero dipendenza dal motore, montata TALE E
            QUALE. Il manuale spiega il METODO di audit, non la grafica di un'applicazione: lo
            stesso testo vale per chi lavora da EQUILIBRIUM o da SERENITY. */}
        <button className="s-glass s-glass-btn" onClick={() => setGuidaAperta(true)} title={t('sidebar_guide') as string} style={{
          cursor: 'pointer', padding: 8, borderRadius: 999,
          background: 'var(--s-disc)', display: 'flex', color: 'var(--s-ink-soft)',
        }}>
          <HelpCircle size={32} strokeWidth={1.6} />
        </button>
        {/* ── L'ASSISTENTE IA, ORA QUI — segnalato: « la zona API mettila dopo l'icona GUIDE ».
            Stesso componente di App.tsx, montato TALE E QUALE (legge già `useUiStore` da sé,
            si adatta al tema di SERENITY senza bisogno di passarglielo): una chiave Gemini
            propria dell'auditor (mai inviata a SERENITY/EQUILIBRIUM), lo stesso contesto di
            seduta che App.tsx gli passa — nome/i, tempo, TA, carica, ultima reazione, le
            ultime righe del giornale. */}
        {aperta && (
          <AIAssistant
            lang={lang as string}
            sessionContext={{
              pcName: avvio?.solo ? nomeAuditor : nomePreclear,
              auditorName: nomeAuditor,
              sessionTime: tempo,
              totalTa: meterC ? theta.totalTa : metricsStore.get().totalTa,
              qL: metricsStore.get().qL,
              eta: metricsStore.get().eta,
              needleReaction,
              recentLogs: journal.logs.slice(-15).map(l => ({ time: l.time, speaker: l.speaker ?? '', text: l.text })),
            }}
          />
        )}
        {/* ── LO SPAZIO VUOTO, ORA IN FONDO — segnalato: « les boutons de haut doivent être
            justifiés à gauche à côté du numéro de build ». Lo spazio elastico (`flex:1`) stava
            subito dopo Historique/Processus, spingendo tema/lingua/pillola/connessioni/CONFIG a
            distribuirsi verso destra invece di restare compatti accanto al nome. Spostato qui,
            ultimo elemento: tutto il resto si accoda a sinistra, il vuoto va tutto a destra. */}
        <span style={{ flex: 1 }} />
      </header>
      {guidaAperta && <GuideModal lang={lang} onClose={() => setGuidaAperta(false)} />}
      {creditiAperti && (
        <CreditsModal onClose={() => setCreditiAperti(false)}
          appName="SERENITY" appVersion={__SERENITY_VERSION__} />
      )}
      {/* ⚠️ BUG TROVATO — segnalato: « quand on clique sur Historique rien apparaît et on ne
          peut pas sortir ». `HistoryModal` (App.tsx) disegna sé stesso con `absolute inset-0`
          (una classe Tailwind: relativo all'ANTENATO posizionato più vicino), non `fixed`
          come `GuideModal`/`CreditsModal` (`position:'fixed', inset:0`, relativo alla
          FINESTRA). In App.tsx quell'antenato più vicino è già grande quanto lo schermo; qui
          era `<main>`, che ha il suo `padding: '38px 44px'` — il pannello restava chiuso in
          quella cornice piccola, il testo si accavallava, e il bottone "Fermer" (che
          FUNZIONA — non era lui il guasto) si perdeva dentro il disordine, sembrando
          irraggiungibile. Non si può cambiare `HistoryModal` stesso (è condiviso, cambierebbe
          anche EQUILIBRIUM): un involucro `fixed` qui gli dà l'antenato che si aspetta. */}
      {historyAperto && (
        <div className="ser-history-wrap" style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
          <Suspense fallback={null}>
            <HistoryModal
              activeProfile={(() => {
                try { return getProfiles().find(p => p.id === avvio?.auditorId) ?? null; } catch { return null; }
              })()}
              onClose={() => setHistoryAperto(false)}
              lang={lang as never}
            />
          </Suspense>
        </div>
      )}
      {/* ── PROCESSUS — stesso involucro `fixed`, stessa ragione di `HistoryModal` sopra:
          `ProcessusModal` disegna sé stesso con `absolute inset-0`, e senza un antenato
          grande quanto lo schermo resterebbe chiuso nella cornice piccola di `<main>`. */}
      {processusAperto && (
        <div className="ser-processus-wrap" style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
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
            onSelectProcessus={entry => { setProcessusVisualizzato({ name: entry.name, url: entry.url }); setProcessusAperto(false); }}
            onClose={() => setProcessusAperto(false)}
            t={k => t(k as never) as string}
          />
        </div>
      )}
      {/* ── IL VISORE — un PDF alla volta, non le finestre multiple trascinabili di App.tsx
          (`activeProcessus`, dichiarato un raffinamento ancora aperto). Un `<iframe>` sul PDF
          scelto, chiudibile: quel che serve per LEGGERE il processo durante la seduta. */}
      {processusVisualizzato && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column',
          background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)', padding: 24,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 10, flexShrink: 0,
          }}>
            <span style={{ fontFamily: 'var(--s-sans)', fontSize: 14.5, color: '#fff' }}>
              {processusVisualizzato.name}
            </span>
            <button onClick={() => setProcessusVisualizzato(null)} style={{
              border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff',
              borderRadius: 999, padding: '6px 16px', cursor: 'pointer',
              fontFamily: 'var(--s-sans)', fontSize: 14,
            }}>
              {LC('chiudi', 'fermer', 'close', 'cerrar', 'stäng')}
            </button>
          </div>
          <iframe src={processusVisualizzato.url} title={processusVisualizzato.name}
            style={{ flex: 1, border: 'none', borderRadius: 12, background: '#fff' }} />
        </div>
      )}

      {/* ── I COMANDI, IN ALTO — segnalato: « i cicli non sono chiari messi sotto, mettili in
          alto come in equilibrium ». In App.tsx l'item, i quattro metodi, i passi del ciclo in
          corso e i suoi esiti stanno DENTRO il pannello dello strumento, appena sopra l'arco —
          non in un piede di pagina lontano da dove l'occhio già guarda. Questo blocco (era
          `<footer>`, l'ultimo figlio della pagina) è lo STESSO, spostato qui sopra il
          quadrante: nessuna riga di logica toccata, solo l'ordine in cui compaiono. */}
      <div ref={comandiRef} className="ser-comandi" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 18, rowGap: 10 }}>
        {/* ── STORICO E PROCESSUS, SPOSTATI IN INTESTAZIONE — segnalato: « sposta tutti i
            bottoni in alto vicino al numero di versione ». Erano qui, primi due elementi di
            questa barra (v. `<header>`, accanto a `{__SERENITY_VERSION__}`, per dove sono ora
            e perché). Il commento resta per chi cerca la cronologia: prima erano
            nell'intestazione originale di App.tsx, poi spostati qui sotto il quadrante, ora di
            nuovo in alto — sempre lo stesso `onClick`, mai una riga di logica toccata.
            OUVRIR/FERMER e PAUSA restano nella barra laterale (richiesta separata, esplicita:
            « metti i bottoni... sul lato sinistro fuori dall'arco » e poi « il bottone di
            pausa deve essere vicino al bottone Fermer la séance »). Vedi la
            barra a sé, ancorata al bordo sinistro di `<main>`, poco più giù. */}
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
            {/* ── DOVE SI SCRIVE L'ITEM — segnalato: « non posso scriverlo, non so dove ».
                Prima un campo nudo, sottolineato, con un placeholder grigio chiaro: facile da
                non vedere fra le nuove pillole di vetro. Ora un'etichetta SEMPRE visibile sopra
                il campo, e il campo stesso è un vetro con un bordo — si vede che è un posto
                dove scrivere, non un tratto decorativo. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontFamily: 'var(--s-sans)', fontSize: 11.5, letterSpacing: '0.1em',
                            textTransform: 'uppercase', color: 'var(--s-ink-faint)' }}>
                {LC('scrivi o dì l\'item', 'écris ou dis l\'item', 'type or say the item', 'escribe o di el ítem', 'skriv eller säg item')}
              </span>
              <input
                className="s-glass"
                value={item}
                onChange={e => setItem(e.target.value)}
                placeholder={t('ser_item_placeholder') as string}
                onKeyDown={e => { if (e.key === 'Enter') cycles.armCycle('charge'); }}
                style={{
                  borderRadius: 999, background: 'var(--s-disc)',
                  outline: 'none', fontFamily: 'var(--s-serif)', fontSize: 15.5, color: 'var(--s-ink)',
                  padding: '6px 14px', width: 220,
                }}
              />
            </div>
            {/* ── LO STATO DELLA VOCE — segnalato: « non posso dare l'item verbalmente ».
                Prima questo restava muto finché non arrivava una parola: se il riconoscitore
                non parte (permesso negato, nessun motore disponibile) l'auditor aspettava senza
                sapere se il problema era suo o del programma. */}
            <span style={{ fontFamily: 'var(--s-sans)', fontSize: 13, color: 'var(--s-ink-faint)', alignSelf: 'flex-end' }}>
              {statoVoce === 'in-ascolto'
                ? <span className="ser-pulse">🎙 {LC('in ascolto', 'à l\'écoute', 'listening', 'escuchando', 'lyssnar')}</span>
                : statoVoce === 'assente'
                  ? LC('🎙 voce non disponibile — scrivi l\'item', 'la voix n\'est pas disponible — écris l\'item',
                      'voice not available — type the item', 'la voz no está disponible — escribe el ítem',
                      'rösten är inte tillgänglig — skriv item')
                  : ''}
            </span>
            {/* ── I QUATTRO METODI, ORA NELLA BARRA LATERALE — segnalato: « metti i bottoni
                Contact, Null, Mirror, Tone... sul lato sinistro fuori dall'arco, così si ha
                più spazio per il ciclo stesso ». Vedi la barra a sé, poco più giù. */}
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
              fontFamily: 'var(--s-sans)', fontSize: 13.5, fontWeight: 700, letterSpacing: '0.06em',
              padding: '3px 10px', borderRadius: 999, border: '1px solid var(--s-ink-ghost)',
              color: 'var(--s-ink-soft)',
            }}>
              TONE
            </span>
            <span style={{ fontFamily: 'var(--s-serif)', fontSize: 15.5, color: 'var(--s-ink)' }}>
              {item || t('ser_item_placeholder')}
            </span>
            {/* ── LA PISTA — segnalato: « i cicli devono essere disposti esattamente come in
                equilibrium, stessi campi, stessa logica ». `PassiCiclo` (tolta) era una pista
                scritta a mano, con le sue etichette e il suo `indiceAttuale` ricalcolati qui —
                un doppione di `components/CycleSteps.tsx`, lo STESSO componente che App.tsx
                monta (3 volte, una per metodo, identico a qui): legge `mode`/`faseCiclo`, già
                calcolati sopra, e ne ricava da sé quanti tempi ci sono e a quale si è
                (`engine/cycleSteps.ts`, provato da solo) — non li decide, li mostra. */}
            <div style={{ flexBasis: '100%' }}>
              <CycleSteps mode={mode} phase={faseCiclo} lang={lang} />
            </div>
            {faseCiclo === 'tone.say_item' && (
              <>
                <span className="ser-pulse" style={{
                  fontFamily: 'var(--s-sans)', fontSize: 14, letterSpacing: '0.04em',
                  color: 'var(--s-reserve)',
                }}>
                  {LC('dì la resistenza…', 'dis la résistance…', 'say the resistance…', 'di la resistencia…', 'säg motståndet…')}
                </span>
                <button className="s-glass s-glass-btn" onClick={dichiaraItemDetto} style={{
                  cursor: 'pointer', borderRadius: 999, padding: '4px 12px', background: 'var(--s-disc)',
                  fontFamily: 'var(--s-sans)', fontSize: 14, color: 'var(--s-ink-faint)',
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
                      outline: 'none', fontFamily: 'var(--s-mono)', fontSize: 14.5, color: 'var(--s-ink)',
                      cursor: 'pointer', padding: '2px 4px',
                    }}>
                    {TONE_LABELS.map(v => (
                      <option key={v} value={v}>
                        {v > 0 ? `+${v}` : v} · {levelName(exactLevelName(v) ?? '', lang)}
                      </option>
                    ))}
                  </select>
                )}
                <button className="s-glass s-glass-btn" onClick={() => tone.localizzaTone()} style={{
                  cursor: 'pointer', borderRadius: 999, padding: '4px 12px', background: 'var(--s-disc)',
                  fontFamily: 'var(--s-sans)', fontSize: 15, color: 'var(--s-ink-soft)',
                }}>
                  {t('ser_arm_contact') /* stesso gesto/testo di App.tsx: "DAI L'ITEM" */}
                </button>
              </>
            )}
            {(tone.tonePhase === 'raise' || tone.tonePhase === 'done') && (
              <span style={{ fontFamily: 'var(--s-mono)', fontSize: 14.5, color: 'var(--s-ink-faint)' }}>
                {tone.toneAtStart !== null ? `${tone.toneAtStart > 0 ? '+' : ''}${tone.toneAtStart.toFixed(0)} → ` : ''}
                <b style={{ color: 'var(--s-reserve)' }}>+40</b>
              </span>
            )}
            {tone.tonePhase === 'raise' && (
              <>
                <button className="s-glass s-glass-btn" onClick={() => tone.setToneRipetizioni(v => v + 1)} style={{
                  cursor: 'pointer', borderRadius: 999, padding: '4px 12px', background: 'var(--s-disc)',
                  fontFamily: 'var(--s-sans)', fontSize: 15, color: 'var(--s-ink-soft)',
                }}>
                  {LC('portalo a tono 40', 'mène-le au ton 40', 'raise it to tone 40', 'llévalo al tono 40', 'för det till ton 40')}
                  {tone.toneRipetizioni > 0 ? ` ×${tone.toneRipetizioni}` : ''}
                </button>
                <button className="s-glass s-glass-btn" onClick={() => { tone.chiudiTone(true); tone.setTonePhase('done'); }} style={{
                  cursor: 'pointer', borderRadius: 999, padding: '4px 12px', background: 'var(--s-disc)',
                  fontFamily: 'var(--s-sans)', fontSize: 15, color: 'var(--s-still)',
                }}>
                  {LC('tono quaranta raggiunto', 'ton quarante atteint', 'tone forty reached', 'tono cuarenta alcanzado', 'ton fyrtio nådd')}
                </button>
              </>
            )}
            {tone.tonePhase === 'done' && (
              <button className="s-glass s-glass-btn" onClick={() => tone.resetTone()} style={{
                cursor: 'pointer', borderRadius: 999, padding: '4px 12px', background: 'var(--s-disc)',
                fontFamily: 'var(--s-sans)', fontSize: 15, color: 'var(--s-still)',
              }}>
                {LC('altra resistenza', 'autre résistance', 'another resistance', 'otra resistencia', 'annat motstånd')}
              </button>
            )}
            {/* « Cosa devo fare » — SULLA STESSA RIGA del bottone della tappa attiva appena
                sopra (v. la nota su `SuggerimentoCiclo`), non più in fondo a tutto dopo ANNULLA. */}
            <SuggerimentoCiclo {...spiegazioneCiclo} />
            <button className="s-glass s-glass-btn" onClick={() => {
              if (tone.tonePhase === 'raise') tone.chiudiTone(false);
              tone.resetTone(); setToneAttivo(false);
            }} style={{
              cursor: 'pointer', borderRadius: 999, padding: '4px 12px', background: 'var(--s-disc)',
              fontFamily: 'var(--s-sans)', fontSize: 15, color: 'var(--s-ink-ghost)',
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
              fontFamily: 'var(--s-sans)', fontSize: 13.5, fontWeight: 700, letterSpacing: '0.06em',
              padding: '3px 10px', borderRadius: 999,
              background: 'var(--s-reserve)', color: 'var(--s-ground)',
            }}>
              MIRROR
            </span>
            <span style={{ fontFamily: 'var(--s-serif)', fontSize: 15.5, color: 'var(--s-ink)' }}>
              {item || t('ser_item_placeholder')}
            </span>
            {/* La pista — vedi la nota su `CycleSteps` nel blocco TONE. */}
            <div style={{ flexBasis: '100%' }}>
              <CycleSteps mode={mode} phase={faseCiclo} lang={lang} />
            </div>
            {faseCiclo === 'mirror.say_item' && (
              <>
                <span className="ser-pulse" style={{
                  fontFamily: 'var(--s-sans)', fontSize: 14, letterSpacing: '0.04em',
                  color: 'var(--s-reserve)',
                }}>
                  {LC('dì l\'item…', 'dis l\'item…', 'say the item…', 'di el ítem…', 'säg item…')}
                </span>
                <button className="s-glass s-glass-btn" onClick={dichiaraItemDetto} style={{
                  cursor: 'pointer', borderRadius: 999, padding: '4px 12px', background: 'var(--s-disc)',
                  fontFamily: 'var(--s-sans)', fontSize: 14, color: 'var(--s-ink-faint)',
                }}>
                  {LC('l\'item è stato detto', 'l\'item a été dit', 'the item has been said', 'el ítem ha sido dicho', 'item har sagts')}
                </button>
              </>
            )}
            {!mirror.mirrorDisp.locked ? (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--s-sans)', fontSize: 14.5, color: 'var(--s-ink-faint)', marginRight: 6 }}>
                  {LC('quanta carica?', 'combien de charge ?', 'how much charge?', '¿cuánta carga?', 'hur mycket laddning?')}
                </span>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => (
                  <button key={v} onClick={() => {
                    mirror.mirrorCycle.setManualValue(v);
                    mirror.setMirrorDisp({ contactQ: mirror.mirrorCycle.contactQ, dischargeQ: 0,
                      locked: true, reached: false, valueR: mirror.mirrorCycle.valueR });
                  }} style={{
                    border: 'none', cursor: 'pointer', borderRadius: 999, width: 26, height: 26,
                    fontFamily: 'var(--s-mono)', fontSize: 14, fontWeight: 700,
                    background: 'var(--s-disc-sunk)', color: 'var(--s-ink)',
                  }}>
                    {v}
                  </button>
                ))}
              </div>
            ) : !mirror.mirrorDisp.reached ? (
              <>
                <span style={{ fontFamily: 'var(--s-sans)', fontSize: 14.5, color: 'var(--s-ink-faint)' }}>
                  {LC('portalo al doppio', 'mène-le au double', 'take it to the double', 'llévalo al doble', 'för det till dubbeln')}
                  {' — '}{mirror.mirrorDisp.valueR.toFixed(0)} → {(2 * mirror.mirrorDisp.valueR).toFixed(0)}
                </span>
                <button className="s-glass s-glass-btn" onClick={() => {
                  mirror.mirrorCycle.declareReached();
                  mirror.setMirrorDisp({ contactQ: mirror.mirrorCycle.contactQ, dischargeQ: mirror.mirrorCycle.dischargeQ,
                    locked: true, reached: true, valueR: mirror.mirrorCycle.valueR });
                }} style={{
                  cursor: 'pointer', borderRadius: 999, padding: '4px 12px', background: 'var(--s-disc)',
                  fontFamily: 'var(--s-sans)', fontSize: 15, color: 'var(--s-still)',
                }}>
                  {LC('doppio raggiunto', 'double atteint', 'double reached', 'doble alcanzado', 'dubbeln nådd')}
                </button>
              </>
            ) : (
              <button className="s-glass s-glass-btn" onClick={() => mirror.stopMirror()} style={{
                cursor: 'pointer', borderRadius: 999, padding: '4px 12px', background: 'var(--s-disc)',
                fontFamily: 'var(--s-sans)', fontSize: 15, color: 'var(--s-still)',
              }}>
                {LC('ottenuto — valida', 'obtenu — valider', 'obtained — validate', 'obtenido — validar', 'uppnått — validera')}
              </button>
            )}
            {/* « Cosa devo fare » — SULLA STESSA RIGA del bottone della tappa attiva appena
                sopra (v. la nota su `SuggerimentoCiclo`), non più in fondo a tutto dopo ANNULLA. */}
            <SuggerimentoCiclo {...spiegazioneCiclo} />
            <button className="s-glass s-glass-btn" onClick={() => mirror.stopMirror()} style={{
              cursor: 'pointer', borderRadius: 999, padding: '4px 12px', background: 'var(--s-disc)',
              fontFamily: 'var(--s-sans)', fontSize: 15, color: 'var(--s-ink-ghost)',
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
              fontFamily: 'var(--s-sans)', fontSize: 13.5, fontWeight: 700, letterSpacing: '0.06em',
              padding: '3px 10px', borderRadius: 999,
              background: cycles.cycleKind === 'null' ? 'var(--s-alive)' : 'var(--s-still)',
              color: 'var(--s-ground)',
            }}>
              {cycles.cycleKind === 'null' ? 'NULL' : 'CONTACT'}
            </span>
            <span style={{ fontFamily: 'var(--s-serif)', fontSize: 15.5, color: 'var(--s-ink)' }}>
              {item || t('ser_item_placeholder')}
            </span>
            {/* ── I PASSI, TUTTI INSIEME — segnalato: « le scritte dei cicli sono confuse...
                evidenziate le steps, a prova di stupido »; poi di nuovo: « i cicli devono
                essere disposti esattamente come in equilibrium, stessi campi, stessa logica ».
                `CycleSteps` — vedi la nota nel blocco TONE — non decide nulla, mostra solo
                dove si è dentro la sequenza del metodo in corso. Riga a sé (`flexBasis:'100%'`)
                per restare leggibile invece di accorciarsi. */}
            <div style={{ flexBasis: '100%' }}>
              <CycleSteps mode={mode} phase={faseCiclo} lang={lang} />
            </div>
            {/* ── « DÌ L'ITEM… » — segnalato insieme: la logica di darlo a voce già esiste nel
                motore (`cycleAwaitItemRef`), ma finché nessuno lo dice a schermo l'auditor non
                sa che il ciclo sta ASPETTANDO, non è già a mock-up. Pulsa finché la voce (o la
                dichiarazione a mano qui accanto) non arriva. */}
            {(faseCiclo === 'contact.say_item' || faseCiclo === 'null.say_item') && (
              <>
                <span className="ser-pulse" style={{
                  fontFamily: 'var(--s-sans)', fontSize: 14, letterSpacing: '0.04em',
                  color: 'var(--s-reserve)',
                }}>
                  {LC('dì l\'item…', 'dis l\'item…', 'say the item…', 'di el ítem…', 'säg item…')}
                </span>
                <button className="s-glass s-glass-btn" onClick={dichiaraItemDetto} title={LC(
                    'la trascrizione non c\'è o non si sente — dichiara che l\'item è stato detto',
                    'pas de transcription ou pas de son — déclare que l\'item a été dit',
                    'no transcript or no sound — declare the item has been said',
                    'sin transcripción o sin sonido — declara que el ítem ha sido dicho',
                    'ingen transkription eller inget ljud — förklara att item har sagts') as string}
                  style={{
                  cursor: 'pointer', borderRadius: 999, padding: '4px 12px', background: 'var(--s-disc)',
                  fontFamily: 'var(--s-sans)', fontSize: 14, color: 'var(--s-ink-faint)',
                }}>
                  {LC('l\'item è stato detto', 'l\'item a été dit', 'the item has been said', 'el ítem ha sido dicho', 'item har sagts')}
                </button>
              </>
            )}
            {/* « Cosa devo fare » — SULLA STESSA RIGA del bottone della tappa attiva appena
                sopra (v. la nota su `SuggerimentoCiclo`), non più in fondo a tutto dopo
                `CycleStatusBar`. Nelle tappe senza un bottone proprio (« chiedi un mock-up »,
                « la carica sale »...) resta comunque QUI, appena prima del contatore/ANNULLA/
                valida — mai isolata in coda a tutto il resto. */}
            <SuggerimentoCiclo {...spiegazioneCiclo} />
            {/* ── IL CONTATORE DEL CICLO IN CORSO — mancante ─────────────────────────────
                In App.tsx un chip dice, per il SOLO metodo in corso (CONTACT con CONTACT,
                NULL con NULL — « due contatori confondono », scelta utente), quanti cicli
                sono stati armati e quanti portati a compimento questa seduta. `cycleStats`
                arriva già dallo stesso `useContactNullCycle` — solo non era letto qui. */}
            <span style={{ fontFamily: 'var(--s-mono)', fontSize: 14, color: 'var(--s-ink-faint)' }}>
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
            <button className="s-glass s-glass-btn" onClick={() => cycles.finalizeCycle(false)} style={{
              cursor: 'pointer', borderRadius: 999, padding: '4px 12px', background: 'var(--s-disc)',
              fontFamily: 'var(--s-sans)', fontSize: 15, color: 'var(--s-ink-ghost)',
            }}>
              {t('cancel')}
            </button>
            {cycles.cycleKind === 'null' ? (
              <>
                <button className="s-glass s-glass-btn" onClick={() => cycles.validateClearRead(true)} style={{
                  cursor: 'pointer', borderRadius: 999, padding: '4px 12px', background: 'var(--s-disc)',
                  fontFamily: 'var(--s-sans)', fontSize: 15, color: 'var(--s-still)',
                }}>
                  {t('ser_validate_equilibrium_vgi')}
                </button>
                <button className="s-glass s-glass-btn" onClick={() => cycles.validateClearRead(false)} style={{
                  cursor: 'pointer', borderRadius: 999, padding: '4px 12px', background: 'var(--s-disc)',
                  fontFamily: 'var(--s-sans)', fontSize: 15, color: 'var(--s-ink-faint)',
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
                <button className="s-glass s-glass-btn" onClick={() => cycles.declareNoRecharging()} style={{
                  cursor: 'pointer', borderRadius: 999, padding: '4px 12px', background: 'var(--s-disc)',
                  fontFamily: 'var(--s-sans)', fontSize: 15, color: 'var(--s-reserve)',
                }}>
                  {t('ser_no_recharging')}
                </button>
              </>
            ) : (
              <button className="s-glass s-glass-btn" onClick={() => cycles.validateAsIs()} style={{
                cursor: 'pointer', borderRadius: 999, padding: '4px 12px', background: 'var(--s-disc)',
                fontFamily: 'var(--s-sans)', fontSize: 15, color: 'var(--s-still)',
              }}>
                {t('ser_validate_asis')}
              </button>
            )}
            {/* ── LO STESSO `CycleStatusBar` DI APP.TSX — segnalato: « riproduci la logica dei
                cicli di equilibrium... stessi posizionamenti ». Stava lontano da qui (in fondo,
                vicino al quadrante, dietro `agoEeg`): App.tsx lo mette DIRETTAMENTE sotto la
                domanda/i comandi del ciclo, mai altrove — « riga sotto la domanda », la sua
                stessa nota. Spostato qui: stesso posto, stesso componente. */}
            <div style={{ flexBasis: '100%' }}>
              <CycleStatusBar
                armed={cycles.cycleArmed}
                manualReady={cycles.manualReady}
                asIsFalse={cycles.asIsFalse}
                deltaStar={deltaStar}
                deltaStarN={deltaStarN}
                isLightTheme={isLightTheme}
                signalOk={museGate.museContact}
                cycleKind={cycles.cycleKind}
                nullSinceMock={cycles.nullSinceMock}
                noReadSignal={cycles.noReadSignal}
                taAtNullStart={cycles.taAtNullStart}
              />
            </div>
          </>
        )}
        {/* ── SEGNALATO: « i moduli ASSESSMENT, System Health, Journal, MNA non devono avere
            bottoni, si attivano solamente via CONFIG ». Erano bottoni che aprivano un
            cassetto (`apriMna`/`apriSalute`/`apriGiornale`) sopra la scelta già fatta in
            CONFIG (`moduleVis`) — due controlli per la stessa cosa. Tolti: `moduleVis` da
            solo decide ora se ognuno di questi si vede, esattamente come `ZonaAssessment` fa
            già (nessun bottone, mai avuto). Il conteggio del giornale resta qui, muto, solo
            quando il modulo è spento (altrimenti lo dice già la sua stessa zona, più giù). */}
        {!moduleVis.journal && (
          <span style={{ fontSize: 14.5, color: 'var(--s-ink-faint)' }}>
            {t('ser_journal')} · {journal.logs.length} {t(journal.logs.length === 1 ? 'ser_line' : 'ser_lines')}
          </span>
        )}
        {/* EP — spostato sotto TONE, nella barra laterale: v. la nota lì. */}
        {/* Il link « ← changer d'auditeur ou de préclair » è diventato l'icona `UserCog`
            dentro il campo Auditor/PC in alto — segnalato: « CHANGE AUDITOR OR PRECLEAR doit
            être sous forme d'icône... en haut ». Non più qui. */}
        <span style={{ flex: 1 }} />
      </div>

      {/* ── IL CAMPO ──────────────────────────────────────────────────────────────────────
          Lo strumento occupa lo spazio, come in EQUILIBRIUM — non è un modulo fra gli altri,
          è QUELLO su cui gli altri si dispongono. I quattro cerchi che diventeranno i moduli
          (fase 6+) restano ai bordi: compaiono quando servono, e per ora sono spenti. */}
      <section style={{
        position: 'relative', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16, minHeight: 0,
        /* ⚠️ BUG TROVATO verificando dal vivo: la riga dell'arco comincia al bordo sinistro di
           `<section>` — che è anche dove comincia, `position:absolute`, la barra laterale
           (OPEN/PAUSA/CONTACT/NULL/MIRROR/TONE/EP, poi l'assessment sotto). `paddingLeft`
           sposta la riga dopo di lei: la barra laterale è larga 272px ora (v. sopra, per
           l'assessment), un numero fisso basta comunque — quella larghezza non cambia più
           con o senza assessment aperta (solo il CONTENUTO sotto i bottoni compare o no). */
        paddingLeft: 320,
      }}>
      {/* ── IL CASSETTO DEL METER — ancorato SOTTO l'intestazione, dove sta il suo indicatore ──
          Non nel flusso della pagina (galleggia, `position:absolute`, come le camere qui sotto e
          il pannello MNA più giù): aprirlo non deve spingere in basso tutto il resto — la stessa
          ragione per cui era sbagliato tenerlo fisso in fondo alla pagina. Si chiude da sé se il
          meter si disconnette (vedi l'`useEffect` accanto a `meterSetupAperto`). */}
      {/* ⚠️ Segnalato: « la fenêtre de configurer le meter est hors champ en partie ». Nessun
          `maxHeight`/`overflowY` qui: `PannelloMeter` (4 passi, l'ultimo — la taratura — ha DUE
          blocchi, il più lungo) poteva superare l'altezza vera della finestra, ancorato solo
          da `top:16` senza un `bottom` a fermarlo — la parte che usciva sotto (di norma «
          avanti/indietro », in fondo) restava irraggiungibile, non solo invisibile. Ora un
          tetto pari all'altezza vera di `<section>` meno un margine, con scorrimento proprio
          se il contenuto lo supera comunque. */}
      {meterSetupAperto && meterC && (
        <div style={{ position: 'absolute', top: 16, right: 44, bottom: 16, zIndex: 30, display: 'flex' }}>
          <div style={{ maxHeight: '100%', overflowY: 'auto' }}>
            <PannelloMeter theta={theta} provaTa={provaTa} onFatto={() => setMeterSetupAperto(false)} />
          </div>
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
          ⚠️ Segnalato una QUARTA volta: « deve essere almeno il doppio ». 340 px restavano
          piccoli. Raddoppiata per davvero: 680 (CAM 1 a 320, la stessa proporzione).
          ⚠️ A quella taglia il riquadro (rettangolare, anche se i cerchi dentro sono rotondi)
          arriva a coprire il footer sottostante — segnalato: « l'assessment non funziona ».
          Non era la logica del bottone, erano gli ANGOLI TRASPARENTI di questo contenitore che
          rubavano il click prima che arrivasse a lui. `pointer-events:none` qui, riacceso solo
          dentro ogni `CameraCerchio` (il cerchio vero, non il suo riquadro) — il resto del
          rettangolo torna trasparente anche ai click, non solo alla vista.
          ⚠️ Segnalato una QUINTA volta, in due parti insieme: « occupa troppo spazio, riduci di
          un terzo » E « però copre l'arco dell'ago, correggi ». 680/320 → 453/213 (i due terzi
          di prima, stessa proporzione). E non più UNA FILA orizzontale larga quanto l'arco
          stesso: ora una COLONNA verticale, stretta e tutta ridossata all'angolo (PC sopra,
          AUDITOR sotto — lo stesso ordine di App.tsx, « PC cam top, Auditor cam bottom »), così
          l'ingombro resta nella striscia più a destra, fuori dal semicerchio dell'arco che sta
          centrato sul quadrante.
          ⚠️ Segnalato una SESTA volta: « la camm del PC falla più piccola ». 453 → 260 (CAM 1
          invariata, 213 — solo la CAM 2 era segnalata). E: « quando la chiudi deve essere della
          stessa dimensione di quella dell'auditor » — prima il collasso era proporzionale alla
          taglia di ciascuna (35%), quindi due taglie diverse da chiuse. `dimensioneCollassata`
          fissa la STESSA taglia per entrambe, chiuse.
          ⚠️ Segnalato: « il bottone assessment copre CLOSE THE SESSION ». Vero — questo blocco
          (insieme al cassetto del meter e a `ZonaAssessment`, sotto) galleggiava ancorato a
          `main` con `top:76`: taglia giusta per QUANDO i comandi stavano in fondo pagina, ma da
          quando (giro precedente) i comandi si sono spostati IN ALTO, quello stesso `top:76`
          cadeva esattamente sopra "CHIUDI LA SEDUTA". Spostati DENTRO `<section>` (che comincia
          sempre DOPO i comandi, qualunque sia la loro altezza — un ciclo armato ne occupa di
          più di uno spento) — `top:16` ora è relativo alla sezione, non più alla pagina
          intera, e non può più cadere sopra un elemento che sta prima di lei. */}
      {/* ⚠️ BUG TROVATO — segnalato: « non trovo più la camm PC ». CAM 2 era ristretta a
          `avvio.distanza || avvio.solo` — spariva del tutto nel caso più comune, una seduta
          LOCALE con un preclear vero. App.tsx non ha QUESTA condizione: mostra CAM 2 ogni
          volta che `moduleVis.cam2` è acceso, punto — la webcam locale generica quando non
          c'è un flusso remoto (`CameraCerchio` chiama `getUserMedia` da sé), lo stream vero
          solo quando `avvio.distanza` lo fornisce. La restrizione qui era un'invenzione, non
          una scelta di EQUILIBRIUM: tolta, per la stessa regola di sempre — riprodurre la
          stessa logica, non una più prudente inventata qui. */}
      {aperta && (moduleVis.cam1 || moduleVis.cam2) && (
        <div style={{
          position: 'absolute', top: 16, right: 32, zIndex: 5,
          display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 14,
          pointerEvents: 'none',
        }}>
          {moduleVis.cam2 && (
            <CameraCerchio
              /* ⚠️ Segnalato di nuovo: « la camm PC doit être plus grande ». Era 260 (dopo un
                 giro precedente che l'aveva ridotta di un terzo per non coprire l'arco — la
                 riduzione resta comunque valida, l'arco ora ha molto più spazio suo, vedi il
                 19° giro). Portata a 340: più grande, senza tornare ai 453/680 che coprivano
                 il quadrante.
                 ⚠️ Segnalato ANCORA: « la zona camm deve essere di 1/5 più piccola ». 340×0,8
                 = 272 (CAM 1 uguale, 213×0,8 ≈ 170) — la stessa proporzione fra le due. */
              dimensione={272}
              dimensioneCollassata={88}
              titolo={t('cam2') as string}
              externalStream={avvio.distanza ? (remote.remoteStream ?? null) : undefined}
              offlineLabel={t('camera_offline') as string}
              opacita={uiAlpha}
              collassata={cam2Collassata}
              onToggleCollasso={() => setCam2Collassata(v => !v)}
              statoTesto={statoCamPc}
              inDiretta={!!avvio.distanza}
            />
          )}
          {moduleVis.cam1 && (
            <CameraCerchio
              dimensione={170}
              dimensioneCollassata={88}
              titolo={t('cam1') as string}
              offlineLabel={t('camera_offline') as string}
              opacita={uiAlpha}
              collassata={cam1Collassata}
              onToggleCollasso={() => setCam1Collassata(v => !v)}
            />
          )}
        </div>
      )}

      {/* ── L'ASSESSMENT, LA SUA ZONA — segnalato: « deve avere una sua zona, come in
          equilibrium ». Non più un cassetto appeso al bottone (spariva quando la cattura era
          spenta, e stava dove il bottone capitava di essere nel footer): una colonna ancorata
          all'angolo opposto delle camere, sempre presente a seduta aperta, col titolo sempre
          leggibile. Zero stato nuovo — `assessAttivo`/`assessItems` sono gli stessi di sempre,
          solo un contenitore vero al posto del cassetto. */}
      {/* ── LA RIGA A DUE COLONNE — segnalato: « la zona assessment... deve stare sotto il
          bottone EP... quindi la zona arco deve occupare tutto lo spazio liberato ».
          L'assessment è andato sotto EP, nella barra laterale (v. sopra) — non condivide più
          questa riga con l'arco. Resta una sola colonna a fianco (Santé Système/journal, a
          destra — v. più giù, dopo l'arco): quando è aperta prende metà della riga
          (`width:'50%'`), e l'arco (`flex:1`, colonna centrale) le cede il posto
          restringendosi — SENZA di lei l'arco riprende TUTTA la riga, non solo due terzi. */}
      <div style={{ display: 'flex', width: '100%', height: '100%', minHeight: 0, alignItems: 'stretch', gap: rightColOpen ? 16 : 0 }}>
        {/* ⚠️ Segnalato: « il MNA portalo sotto la zona ARC, hai spazio ». `flexDirection:'column'`
            qui sotto (era `row`, ininfluente con un solo figlio): l'arco resta centrato come
            sempre, e MNA — v. più giù, dopo la sua chiusura — diventa un SECONDO figlio impilato
            sotto di lui invece di un `position:absolute` DENTRO il suo riquadro. Lo spazio c'è
            perché l'arco (`aspect-ratio`) quasi mai riempie tutta l'altezza di questa colonna:
            quel che resta sotto, prima vuoto, è dove MNA va ora. */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
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
        {/* ⚠️ Segnalato: « dans équilibrium apparaissent les réactions écrites au-dessus de
            l'aiguille, dans SERENITY elles n'apparaissent pas ». Verificato nel codice
            condiviso: `QuantumSphere.tsx` stesso dice perché non le disegna più lui —
            « Reaction label REMOVED (see note above) — reactions are shown in the top
            data-stack » — App.tsx le scrive appena SOPRA il quadrante (non dentro
            `QuantumSphere`), leggendo `needleReactionKey`/`thetaReactionKey` che qui esistono
            già (mai letti per QUESTO). Stessa tabella sigle, stessi due colori (MUSE bianco,
            METER ambra), stessa regola « una riga sola senza sigla se guardo un ago solo, due
            righe etichettate se guardo DUE » (`reazioniViste`). */}
        {aperta && (() => {
          const RLBL: Record<string, string> = {
            reaction_fn: 'F/N', reaction_blow_down: 'LF BD', reaction_long_fall: 'LONG FALL',
            reaction_fall: 'FALL', reaction_sf: 'SF', reaction_dirty: 'DN',
          };
          const lblMuse = museOk ? (RLBL[needleReactionKey] || '') : '';
          const lblMeter = meterC ? (RLBL[thetaReactionKey] || '') : '';
          const BIANCO = 'rgba(255,255,255,0.92)', BIANCO_A = 'rgba(255,255,255,0.35)';
          const AMBRA = '#f59e0b', AMBRA_A = 'rgba(245,158,11,0.45)';
          const riga = (sigla: string, testo: string, col: string, alone: string) => (
            <span key={sigla} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, lineHeight: 1.1 }}>
              <span style={{ fontFamily: 'var(--s-sans)', fontSize: 9, letterSpacing: '0.1em',
                            color: col, opacity: 0.6, width: 40, textAlign: 'right' }}>{sigla}</span>
              <span style={{ fontWeight: 400, fontSize: 20, letterSpacing: '0.14em', color: col,
                            textShadow: `0 0 12px ${alone}` }}>{testo}</span>
            </span>
          );
          let contenuto: React.ReactNode = null;
          if (reazioniViste === 'both') {
            if (lblMuse || lblMeter) {
              contenuto = (
                <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
                  {lblMuse ? riga('MUSE', lblMuse, BIANCO, BIANCO_A) : null}
                  {lblMeter ? riga('METER', lblMeter, AMBRA, AMBRA_A) : null}
                </span>
              );
            }
          } else {
            const solo = reazioniViste === 'theta' ? lblMeter : lblMuse;
            if (solo) {
              const col = reazioniViste === 'theta' ? AMBRA : BIANCO;
              const alone = reazioniViste === 'theta' ? AMBRA_A : BIANCO_A;
              contenuto = (
                <span style={{ fontWeight: 400, fontSize: 20, letterSpacing: '0.14em', color: col,
                              textShadow: `0 0 12px ${alone}` }}>{solo}</span>
              );
            }
          }
          if (!contenuto) return null;
          return (
            <div style={{
              height: reazioniViste === 'both' ? 52 : 28,
              display: 'flex', justifyContent: 'center', alignItems: 'center', pointerEvents: 'none',
            }}>
              {contenuto}
            </div>
          );
        })()}
        <div style={{
          /* ⚠️ Era `calc(100% - 44px)`: quei 44px riservavano lo spazio per l'orologio e le
             letture che stavano SOTTO questo contenitore, nel flusso di `<section>`. Ora che
             sono dentro (la striscia in basso, `position:absolute`, vedi sotto), non c'è più
             nulla dopo il quadrante in quel flusso — gli si può ridare tutta l'altezza vera. */
          width: 'min(100%, 1400px)', aspectRatio: '1600 / 850', maxHeight: '100%',
          borderRadius: 18, overflow: 'hidden', position: 'relative',
          /* ⚠️ Segnalato: « il fondo della zona arc deve essere trasparente ». In chiaro era
             `var(--s-ground)` — LO STESSO colore della pagina, ma un colore PIENO: con uno
             sfondo personalizzato (CONFIG → "importa la tua immagine") copriva comunque
             l'immagine con un rettangolo opaco, invece di lasciarla vedere. Trasparente per
             davvero, ora. In scuro resta il gradiente vero: qui l'ago disegna in colori
             CHIARI (pensati per staccarsi da uno sfondo scuro) — trasparente diventerebbero
             bianco su niente, illeggibile (nota già scritta sopra, mai cambiata).
             ⚠️ Segnalato di nuovo: « la zone ARC doit avoir le même fond que le fond général...
             et les zones également, juste un petit liseré très fin de séparation ». Lo stesso
             `--s-zone-border` delle altre zone (v. `tokens.css`) al posto della sola ombra —
             un filo sottile che dice dov'è il quadrante, non un pannello che si stacca. */
          background: isLightTheme
            ? 'transparent'
            : 'radial-gradient(130% 120% at 50% 22%, #2e2e33 0%, #2a2a2f 55%, #262629 100%)',
          border: '1px solid var(--s-zone-border)',
          boxShadow: isLightTheme ? 'var(--s-shadow)' : 'var(--s-shadow-lift)',
          transition: 'background var(--s-calm) var(--s-ease), box-shadow var(--s-calm) var(--s-ease)',
        }}>
          {/* ── LE LETTURE, IN ALTO A SINISTRA — segnalato: « l'horloge, le temps de session, le
              TA e la somme de TA doivent être inscrits en haut à gauche dans la zone de l'arc ».
              Stavano nella barra laterale, fuori dallo strumento — ora nell'angolo di QUESTO
              riquadro (lo stesso posto in cui stava `ZonaAssessment`, prima di diventare una
              colonna vera qui sotto). `--s-ink-faint`, non `-ghost` — stessa ragione già scritta
              per il giornale: questo riquadro ha il suo SCHERMO scuro apposta in tema scuro,
              `-ghost` (tarato sul fondo neutro di SERENITY) ci diventava illeggibile. */}
          <div style={{
            position: 'absolute', top: 14, left: 16, zIndex: 5,
            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
            pointerEvents: 'none',
          }}>
            <span style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontFamily: 'var(--s-mono)', fontSize: 14, letterSpacing: '0.04em',
              color: 'var(--s-ink-faint)',
            }}>
              <Clock size={13} strokeWidth={1.8} aria-hidden="true" />
              <OraReale />
            </span>
            <span style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontFamily: 'var(--s-mono)', fontSize: 17, letterSpacing: '0.06em',
              color: aperta ? 'var(--s-ink-soft)' : 'var(--s-ink-faint)',
              transition: 'color var(--s-slow) var(--s-ease)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              <Timer size={15} strokeWidth={1.8} aria-hidden="true" />
              {orologio(tempo)}
            </span>
            {aperta && pausata && (
              <span className="ser-pulse" style={{
                fontFamily: 'var(--s-sans)', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em',
                padding: '3px 10px', borderRadius: 999, textAlign: 'center',
                background: 'var(--s-reserve)', color: 'var(--s-ground)',
              }}>
                {pausaMotivoRef.current === 'manuale'
                  ? LC('in pausa', 'en pause', 'paused', 'en pausa', 'pausad')
                  : LC('strumento perso', 'instrument perdu', 'instrument lost',
                      'instrumento perdido', 'instrument förlorat')}
              </span>
            )}
            {museOk && (
              <span style={{
                fontFamily: 'var(--s-mono)', fontSize: 13, letterSpacing: '0.03em',
                color: 'var(--s-ink-faint)', display: 'flex', gap: 10,
              }}>
                {/* ⚠️ Segnalato: « c'è scritto... delle percentuali? » — un numero nudo, nessuna
                    parola a dire cos'è. Aggiunta l'etichetta, come già per il resto di questo
                    angolo — un `title` da solo (letto solo al passaggio del mouse) non bastava,
                    la stessa ragione già scritta per « MUSE non indossato ». */}
                {museGate.signalQuality > 0 && (
                  <span title={t('signal_quality') as string}>
                    {LC('segnale', 'signal', 'signal', 'señal', 'signal')} {museGate.signalQuality}%
                  </span>
                )}
                {moduleVis.biometric && (
                  <span title={t('biometric_integrity') as string}>
                    <LetturaIntegrita />
                  </span>
                )}
              </span>
            )}
            {agoEeg && (
              <div style={{
                fontFamily: 'var(--s-mono)', fontSize: 13, letterSpacing: '0.03em',
                color: 'var(--s-ink-faint)', display: 'flex', flexDirection: 'column',
                alignItems: 'flex-start', gap: 2,
              }}>
                <LetturaTA />
                <LetturaFase t={t} />
                <span title={t('total_ta') as string}>
                  <LetturaTotalTa override={meterC ? theta.totalTa : null} bodyMotion={theta.bodyMotion} />
                </span>
                <span title={t('mental_processing_velocity') as string}>
                  <LetturaVelocita t={t} />
                </span>
              </div>
            )}
            {reazioniViste === 'both' && meterC && agoEeg === false && museOk && (
              <span style={{
                fontFamily: 'var(--s-mono)', fontSize: 13, letterSpacing: '0.03em',
                color: 'var(--s-alive)', display: 'flex', gap: 6, alignItems: 'baseline',
              }}>
                <span style={{ fontSize: 10, opacity: 0.75 }}>MUSE</span>
                <LetturaTA />
              </span>
            )}
            {!agoEeg && meterC && (
              <div style={{
                fontFamily: 'var(--s-mono)', fontSize: 13, letterSpacing: '0.03em',
                color: 'var(--s-ink-faint)', display: 'flex', flexDirection: 'column',
                alignItems: 'flex-start', gap: 2,
              }}>
                <span>TA {theta.ta !== null ? theta.ta.toFixed(2) : '—'}</span>
                {/* ⚠️ Segnalato: « sotto un numero che non so cosa sia » — la freccia da sola,
                    senza parola, non diceva che questo È il TA proprio ADESSO (quello sopra è
                    il riposo, misurato all'inizio): l'ago si sta muovendo verso questo valore
                    in questo istante. Stessa etichetta visibile, non solo un `title`. */}
                {theta.taNow !== null && Math.abs(theta.taNow - (theta.ta ?? theta.taNow)) > 0.01 && (
                  <span title={LC('il TA proprio adesso — l\'ago si sta muovendo verso questo valore',
                    'le TA à l\'instant — l\'aiguille se dirige vers cette valeur',
                    'the TA right now — the needle is moving toward this value',
                    'el TA ahora mismo — la aguja se mueve hacia este valor',
                    'TA just nu — nålen rör sig mot detta värde')}>
                    {LC('adesso', 'maintenant', 'là', 'ahora', 'nu')} → {theta.taNow.toFixed(2)}
                  </span>
                )}
                {/* ⚠️ Segnalato: « non vedo scritto la differenza fra TA a due cans ed una ».
                    App.tsx scrive SEMPRE su quale base poggia il numero — due lattine, una
                    lattina riportata a due con lo scarto misurato, o una lattina con la
                    divisione tolta perché lo scarto non è stato misurato: lo stesso TA a
                    vedersi vuol dire tre cose diverse, e senza questa riga non si distinguono.
                    `tone.taMostrato` (`useToneCycle`, condiviso — la STESSA funzione
                    `taToTwoCans`) esisteva già nel ritorno del motore, mai letta qui. */}
                {tone.taMostrato && (
                  <span style={{ fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase',
                                color: tone.taMostrato.margin > 0 ? 'var(--s-reserve)' : 'var(--s-ink-ghost)' }}>
                    {tone.taMostrato.basis === 'two-cans'
                      ? LC('TA · 2 lattine', 'TA · 2 boîtes', 'TA · 2 cans', 'TA · 2 latas', 'TA · 2 burkar')
                      : tone.taMostrato.basis === 'solo-measured'
                      ? LC('TA · 1 lattina → 2', 'TA · 1 boîte → 2', 'TA · 1 can → 2', 'TA · 1 lata → 2', 'TA · 1 burk → 2')
                      : LC('TA · 1 lattina − 1 div.', 'TA · 1 boîte − 1 div.', 'TA · 1 can − 1 div.', 'TA · 1 lata − 1 div.', 'TA · 1 burk − 1 delstreck')}
                  </span>
                )}
                {theta.fn.fn && (
                  <span style={{ color: 'var(--s-reserve)' }}>
                    {LC('galleggia', 'flotte', 'floating', 'flota', 'flyter')}
                  </span>
                )}
                <span title={t('total_ta') as string}>
                  <LetturaTotalTa override={theta.totalTa} bodyMotion={theta.bodyMotion} />
                </span>
              </div>
            )}
          </div>
          <QuantumSphere
            needleOffsetProp={agoEeg ? needleOffsetEeg : SET_OFFSET}
            /* ⚠️ BUG TROVATO — segnalato: « quand on choisit MUSE, apparaît toujours
               l'aiguille des boîtes » e « l'aiguille du MUSE ne bouge pas ». La stessa causa
               per entrambi: `QuantumSphere` disegna l'ago del Meter ogni volta che
               `thetaOffset` non è `null` (riga 644 del componente, nessun'altra guardia) —
               qui era `meterC ? theta.offset : null`, SENZA CONDIZIONE sull'ago scelto:
               col meter connesso, il suo ago restava sempre disegnato ANCHE scegliendo MUSE,
               fermo (a riposo, nessuna stretta in corso) proprio sopra quello EEG che invece
               si muoveva — sembrava che l'ago del MUSE non si muovesse, era l'ago del Meter,
               immobile, disegnato sopra il suo. App.tsx lo mostra SOLO quando è lui il
               principale (`agoPrincipale === 'theta'`, la sua nota: « un ago solo »): stessa
               esclusività qui, con `agoEeg` al posto di `agoPrincipale`. */
            thetaOffset={meterC && !agoEeg ? theta.offset : null}
            showEegNeedle={agoEeg}
            /* ── IL BERSAGLIO DELLA PROVA, SULL'ARCO — segnalato: « lors du test de pression
               et souffle, tu dois mettre la ligne pour le tir de l'arc comme dans equilibrium ».
               `QuantumSphere` sa già disegnarlo (la linea tratteggiata verde a un terzo di
               quadrante, con l'etichetta "1/3") — App.tsx gli passa `testBaseOffset +
               SQUEEZE_TARGET_OFFSET` durante la prova; qui restava sempre `null`, quindi
               durante stretta/respiro (aperti da `PannelloMeter` o da `ThetaReadyCheck`,
               entrambi già montati) il quadrante non mostrava dove l'ago deve arrivare. */
            targetOffset={theta.testing ? theta.testBaseOffset + SQUEEZE_TARGET_OFFSET : null}
            needleReactionKey={agoEeg ? needleReactionKey : thetaReactionKey}
            asIsnessState={ep.asIsnessState}
            onClick={() => { theta.resetToSet(); resetNeedleEeg(); }}
            showTrail
            sessionState={aperta ? 'running' : 'idle'}
          />
          {/* ── « PREMI START », SUL QUADRANTE — segnalato: « pour démarrer la séance, je veux
              le même icône que dans equilibrium dans la zone aiguille ». App.tsx la mette
              centrata SUL quadrante, non solo nella barra comandi — stesso `Play` pieno,
              stesso anello che respira, STESSA condizione (uno strumento è pronto, o si audita
              senza strumenti — e la seduta non è ancora aperta): non sostituisce il bottone
              "OUVRIR UNE SÉANCE" della barra sopra, lo affianca, esattamente come in App.tsx
              (sidebar START + questa stessa icona coesistono lì). */}
          {!aperta && (senzaStrumenti || museOk || meterC) && (
            <button
              onClick={apri}
              title={t('hint_press_start') as string}
              style={{
                position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
                zIndex: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: isLightTheme ? 'var(--s-ink)' : '#ffffff',
                animation: 'sStartFade 0.5s ease-out',
              }}>
              <span style={{
                position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 104, height: 104, borderRadius: '50%',
                background: `radial-gradient(circle at 50% 40%, color-mix(in srgb, currentColor 16%, transparent), color-mix(in srgb, currentColor 4%, transparent) 70%, transparent)`,
                border: '2px solid color-mix(in srgb, currentColor 55%, transparent)',
                animation: 'sStartPulse 1.8s ease-in-out infinite',
              }}>
                <Play size={46} strokeWidth={1.6} fill="currentColor" style={{ marginLeft: 6 }} />
              </span>
              <span style={{
                fontFamily: 'var(--s-sans)', fontSize: 14, fontWeight: 800, letterSpacing: '0.22em',
                textTransform: 'uppercase',
              }}>
                {t('hint_press_start')}
              </span>
            </button>
          )}
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
              reciprocamente esclusi, quindi i due cicli non possono essere armati insieme.
              ⚠️ Segnalato: « la scala del tono non appare, il TA neanche, la diagnostica e
              tutti gli altri elementi, METTILI ». Il vero motivo: `ToneDial`/`MirrorDial` (a
              differenza di `ClearDial`, che si avvolge da sé in `position:absolute,inset:0`)
              disegnano un `<svg>` NUDO — senza un contenitore assoluto restano nel FLUSSO
              normale della pagina, ATTACCATI SOTTO l'ago invece che sovrapposti (in App.tsx lo
              stesso contenitore avvolge tutti e tre insieme, `<div className="absolute inset-0
              z-40 pointer-events-none">`). A schermi piccoli quell'arco finiva fuori dalla
              vista — c'era, si leggeva persino nel testo della pagina, ma non si vedeva MAI. Lo
              stesso contenitore qui, per i tre insieme: nessuna riga toccata DENTRO i tre
              componenti (`ClearDial` si ritrova avvolto due volte, innocuo — due `inset:0`
              identici occupano lo stesso rettangolo). */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
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
              <>
                <ToneDial
                  tone={tone.toneOra ?? 0}
                  hasMeter={tone.toneHasMeter}
                  approx
                  located={tone.toneAtStart}
                  phase={tone.tonePhase}
                  toneAtStart={tone.toneAtStart}
                  isLightTheme={isLightTheme}
                />
                {/* ── LA SCALA DEL TONO IN VERTICALE — segnalata assente nell'audit funzionale:
                    « la scala del tono non appare... METTILI ». `ToneColumn` è puro
                    (« nessuno stato, nessuna decisione ») e prende TUTTO quel che gli serve
                    da `tone` (`useToneCycle`, già montato) — `toneOraEeg`/`margineTono` erano
                    già nel suo ritorno, semplicemente non ancora letti qui.
                    ⚠️ App.tsx la ancora a DESTRA — qui a SINISTRA invece: a destra c'è la
                    colonna delle camere (zIndex più alto, la copriva del tutto — verificato
                    nel DOM, presente ma invisibile). SERENITY non ha un secondo posto libero
                    a destra come App.tsx; a sinistra resta solo `ZonaAssessment`, che di
                    norma sta chiusa (solo l'intestazione) e non la incontra. */}
                {/* ⚠️ Segnalato: « in SCALA la parte con la scala del tono deve essere più
                    larga verso il bordo esterno ». A 260px (la stessa larghezza di App.tsx —
                    lì però a DESTRA, con più margine libero) i nomi dei livelli, qui a
                    sinistra vicino al bordo, andavano a capo strettissimi. `ToneColumn` è un
                    SVG col suo `viewBox` proporzionale (`width="100%"`): allargare QUESTO
                    involucro lo ridisegna più grande per intero, numeri e nomi compresi — non
                    tocca il componente condiviso, solo lo spazio che SERENITY gli concede. */}
                <div style={{
                  position: 'absolute', left: 12, top: '38%', bottom: '14%', width: 320,
                  pointerEvents: 'none',
                }}>
                  <ToneColumn
                    tone={tone.toneOra ?? 0}
                    toneEeg={tone.toneOraEeg}
                    margin={tone.margineTono}
                    hasMeter={tone.toneHasMeter}
                    lang={lang}
                    charge={museOk ? Math.max(0, Math.min(1, qLnow)) : null}
                    chargeFrom={tone.toneAtStart}
                  />
                </div>
              </>
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
          </div>
          {/* ── QUALE AGO GUARDARE, SOTTO L'AGO — segnalato: « les deux aiguilles ? pas vue »,
              poi di nuovo: « i bottoni MUSE/METER/BOTH devono restare sotto l'ago » (erano
              stati spostati nella barra laterale insieme alle altre letture, ma questo non è
              una lettura — è la scelta di QUALE ago guardare, e sta bene solo vicino
              all'ago). Non è un secondo ago da disegnare accanto al primo (App.tsx li disegna
              insieme apposta MAI — vedi la nota su `agoEeg`, sopra): è la scelta stessa che
              mancava, muta e fissa sul Meter. La terza voce (`reazioniViste`, « DUE ») tiene
              l'ago sul Meter (misurato, non ricostruito) ma AGGIUNGE le reazioni del MUSE
              etichettate. Ancorato al fondo del quadrante, centrato, appena sotto il perno
              dell'ago. */}
          {museOk && meterC && (
            <div style={{
              position: 'absolute', left: '50%', bottom: 12, transform: 'translateX(-50%)', zIndex: 4,
            }}>
              <SegmentoVetro<'eeg' | 'theta' | 'both'>
                opzioni={[{ k: 'eeg', label: 'MUSE' }, { k: 'theta', label: 'METER' }, { k: 'both', label: LC('DUE', 'DEUX', 'BOTH', 'DOS', 'TVÅ') }]}
                selezionato={reazioniViste === 'both' ? 'both' : agoScelto}
                onChange={v => { setReazioniViste(v); setAgoScelto(v === 'both' ? 'theta' : v); }}
                minLarghezza={64}
              />
            </div>
          )}
        </div>
        {/* ── MNA — ORA SOTTO L'ARCO, NON PIÙ SOPRA ─────────────────────────────────────────
            Segnalato: « il MNA portalo sotto la zona ARC, hai spazio ». Stava `position:absolute`
            DENTRO il riquadro dell'arco (ancorato al SUO fondo, `bottom:16` di `PannelloMna` —
            v. la nota lì): copriva il quadrante invece di stargli accanto. `PannelloMna` non è
            toccato (resta lui a posizionarsi `absolute, left/right:16, bottom:16`) — cambia
            solo DOVE: un involucro `position:relative` qui, fratello dell'arco invece che suo
            figlio, gli dà un riquadro TUTTO SUO in cui ancorarsi, nello spazio che la colonna
            (ora `flexDirection:'column'`, sopra) lascia libero sotto l'arco. */}
        {aperta && moduleVis.mna && (
          <div style={{ position: 'relative', width: '100%', maxWidth: 1400, minHeight: 240, flexShrink: 0 }}>
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
              onChiudi={() => setModuleVis(v => ({ ...v, mna: false }))}
            />
          </div>
        )}
        {/* chiude qui il wrapper centrale (`flex:1`) che avvolge l'arco — v. la nota sopra
            "LA RIGA A TRE COLONNE": la colonna destra (Santé/Journal) è un SUO fratello, non un
            figlio, nella riga a tre colonne. */}
        </div>
        {/* ── COLONNA DESTRA — SANTÉ SYSTÈME E JOURNAL, FUORI DALL'ARCO ─────────────────────
            Segnalato: « posiziona Santé Système, Journal de session a destra dell'arco... mais
            tous en dehors de la zone arc, qui se réduit dès qu'un module apparaît ». Un giro fa
            erano ancorati `position:absolute` a destra DEL QUADRANTE (`right:32`): non toccavano
            la sua taglia, restavano sovrapposti quando aperti. Ora è la STESSA colonna vera
            dell'assessment a sinistra (v. sopra) — `width:'50%'`, in flusso: l'arco si restringe
            per farle posto invece di restarne coperto. `HealthPanel` — montato TALE E QUALE
            (`eegBuffer`/`gyroBuffer` sono la STESSA coppia di ref che `useMuseConnection`
            riempie in App.tsx; le sue zone interne restano il proprio SCHERMO scuro apposta,
            uno strumento resta uno strumento a prescindere dal tema attorno — solo l'intestazione
            segue `useUiStore().isLightTheme`). Journal — stessa lista di
            `components/TranscriptLog.tsx`, riscritta coi token `var(--s-*)` di SERENITY. */}
        {/* ⚠️ Segnalato: « la fenêtre Santé Système ne se voit pas en entier ». `overflow:'hidden'`
            qui tagliava netto qualunque cosa non ci stesse (Santé Système non ha più un suo
            `maxHeight`/scorrimento interno — tolto un giro fa apposta, « si deve vedere tutta »
            — quindi se il contenuto supera lo spazio vero, con `hidden` spariva senza modo di
            raggiungerlo). `overflowY:'auto'` invece: se tutto ci sta non cambia nulla, se no si
            scorre per vedere il resto — mai più tagliato senza rimedio. */}
        {rightColOpen && (
          <div style={{
            width: moduleColWidth, maxWidth: 560, flexShrink: 0, paddingTop: camStackH,
            display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto',
          }}>
            {/* ⚠️ Segnalato: « la zona System Health deve essere larga la metà e si deve vedere
                tutta ». `maxHeight:'78%', overflowY:'auto'` tagliava il pannello a metà,
                costringendo a scorrere per vederlo intero — tolto: il pannello si vede per
                intero, alla SUA altezza vera, non a una percentuale arbitraria. */}
            {aperta && moduleVis.health && (
              <div className="ser-health-wrap" style={{ borderRadius: 18 }}>
                <HealthPanel
                  eegBuffer={eegBuffer}
                  gyroBuffer={gyroBuffer}
                  displayBpm={realBpm}
                  signalQuality={museGate.signalQuality}
                  museConnection={muse.museConnection}
                  batteryLevel={batteryLevel}
                  sessionState={aperta ? 'running' : 'idle'}
                  onHide={() => setModuleVis(v => ({ ...v, health: false }))}
                  t={k => t(k as Parameters<typeof t>[0]) as string}
                  /* ⚠️ Segnalato: « la zone ARC doit avoir le même fond que le fond général...
                      et les zones également, juste un petit liseré très fin de séparation ».
                      `--s-zone-bg`/`--s-zone-border` (v. `tokens.css`): trasparente per davvero
                      in chiaro con un bordo sottile, il vetro smerigliato di sempre in scuro. */
                  panelStyle={extra => ({
                    background: 'var(--s-zone-bg)',
                    border: '1px solid var(--s-zone-border)',
                    ...extra,
                  })}
                />
              </div>
            )}
            {moduleVis.journal && (
              // ⚠️ Segnalato ANCORA, dopo Santé (già a posto): « GIORNALE con un fondo proprio ».
              // Non era il fondo (già `--s-zone-bg`, trasparente) — era `className="s-glass
              // s-glass-lift"`: il `backdrop-filter` di `.s-glass` sfoca quel che sta DIETRO
              // anche con `background` trasparente, che si legge come "una lastra a sé". Santé,
              // qui accanto, non porta MAI questa classe — via anche qui.
              <div style={{
                maxHeight: '70%', display: 'flex', flexDirection: 'column',
                background: 'var(--s-zone-bg)', border: '1px solid var(--s-zone-border)',
                borderRadius: 18, padding: '10px 16px 14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexShrink: 0 }}>
                  <span style={{ fontFamily: 'var(--s-sans)', fontSize: 12, letterSpacing: '0.12em',
                                textTransform: 'uppercase', color: 'var(--s-ink-faint)' }}>
                    {t('ser_journal')}
                  </span>
                  <button onClick={() => setModuleVis(v => ({ ...v, journal: false }))} style={{
                    border: 'none', background: 'none', cursor: 'pointer',
                    color: 'var(--s-ink-faint)', fontSize: 18, lineHeight: 1, padding: 2,
                  }}>×</button>
                </div>
                <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {[...journal.logs]
                    .filter(l => !(avvio.solo && (l.speaker === 'Aud' || l.speaker === 'PC')))
                    .sort((a, b) => (a.time ?? 0) - (b.time ?? 0))
                    .reverse()
                    .map((log, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, fontFamily: 'var(--s-mono)', fontSize: 12.5, lineHeight: 1.4 }}>
                        <span style={{ color: 'var(--s-ink-faint)', width: 38, flexShrink: 0 }}>
                          {(log.time || 0).toFixed(1)}s
                        </span>
                        <span style={{
                          color: log.type === 'retracted' ? 'var(--s-reserve)'
                            : log.type === 'meter' ? 'var(--s-reserve)'
                            : log.speaker === 'SYS' ? 'var(--s-ink-faint)' : 'var(--s-ink)',
                          fontWeight: (log.type === 'highlight' || log.type === 'success') ? 700 : 400,
                        }}>
                          {log.speaker && log.speaker !== 'NEEDLE' && (
                            <b>{log.speaker === 'Aud' ? 'AUD' : log.speaker === 'PC' ? 'PC' : log.speaker}: </b>
                          )}
                          {log.text}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
        {/* `CycleStatusBar` si è spostato nel blocco dei comandi CONTACT/NULL, sopra: stesso
            posto di App.tsx (« riga sotto la domanda »), non più qui vicino al quadrante. Le
            letture (orologio, TA, diagnostica) sono ora nell'angolo dell'arco — vedi la nota
            lì, appena prima di `<QuantumSphere>`. */}

        {/* ⚠️ I QUATTRO CERCHI SATELLITE (assessment, cycle hint, …) SONO STATI TOLTI DA QUI,
            non solo spenti. Erano posizionati per orbitare un cerchio centrale da 380 px; con
            lo strumento che ora occupa quasi tutta la larghezza, quelle stesse coordinate
            fisse li avrebbero messi ADDOSSO al pannello scuro invece che intorno. Tornano
            quando la fase 6 monterà un ciclo vero — accanto a un ingombro reale, non a una
            stima. */}
      </section>
    </main>
  );
}
