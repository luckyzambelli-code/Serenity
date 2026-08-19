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
  type PcCanHistory,
} from '../engine/canTest';
import { sessionRecord, cycleRecord, fnRecord, chiaveItem } from '../engine/corpus';
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
import { SegmentoVetro } from './SegmentoVetro';
import { PannelloMeter } from './PannelloMeter';
import { ZonaAssessment } from './ZonaAssessment';
import { useSerenityModuleStore } from './serenityModuleStore';
import { Settings, Headphones, Gauge, User, Users, Wrench, Wifi, MessageSquareOff, HelpCircle } from 'lucide-react';
import { GuideModal } from '../components/GuideModal';
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

/** ── L'INTEGRITÀ BIOMETRICA — segnalata assente nell'audit funzionale completo: « toutes les
 *  fonctions... METER/MUSE ». `runtime/SmoothingEngine`'s `integrityTracker` è condiviso e già
 *  NUTRITO qui (`hooks/useChargeEngine` gli scrive `setTarget` a ogni METRICS_UPDATE, montato
 *  da sempre) — mancava solo chi lo LEGGE. Isolato in un suo `React.memo` come `LetturaTA`:
 *  aggiorna spesso, non deve ridisegnare tutta l'intestazione. */
const LetturaIntegrita = React.memo(function LetturaIntegrita() {
  const pct = useSyncExternalStore(integrityTracker.subscribe, integrityTracker.getCurrent);
  return (
    <span style={{ fontFamily: 'var(--s-mono)', fontVariantNumeric: 'tabular-nums' }}>
      {Math.round(pct)}%
    </span>
  );
});

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

  /**
   * ── L'ITEM A VOCE, LA SORGENTE CHE MANCAVA ───────────────────────────────────────────────
   * Segnalato: « la logica di dare l'ITEM anche a voce... non è implementata ancora ». I tre
   * motori sapevano già riempire l'item da soli (`cycleAwaitItemRef`/`itemDettato` e le sue
   * due sorelle, portati da App.tsx in una sessione precedente) — mancava solo chi parla:
   * `useVoiceItem` avvia lo STESSO riconoscitore (nativo macOS, poi Whisper offline) di
   * App.tsx, e ogni frase finale entra nel giornale come farebbe l'auditor scrivendola.
   */
  const statoVoce = useVoiceItem({
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
    setThetaReadyDone(false);
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
        <PannelloConfig onChiudi={() => setConfigAperto(false)}
          needleTrim={needleTrim} setNeedleTrim={setNeedleTrim}
          needleInertia={needleInertia} setNeedleInertia={setNeedleInertia}
          museOk={museOk} />
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
          );
        }
        if (readinessMuseOk) {
          return (
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
          );
        }
        // Né meter da provare né MUSE da ascoltare (la connessione scelta è FALLITA nel
        // frattempo) — l'uscita vera è nell'effetto qui sotto, non qui: uno stato scritto
        // DURANTE il render (invece che dopo, in un effetto) è esattamente l'impurità che ha
        // già causato un falso allarme dei Hook in un giro precedente di questa stessa
        // sessione — non si ripete l'errore.
        return null;
      })()}
      {/* ── L'INTESTAZIONE, che non è una barra ───────────────────────────────────────────
          Nessun fondo, nessuna linea di separazione: il nome sta posato sulla stessa
          superficie di tutto il resto. Una barra è già un pannello. */}
      {/* `flexWrap` — segnalato indirettamente: le pillole di vetro e i cursori scorrevoli sono
          più larghi delle parole nude di prima. Senza, su una finestra stretta gli ultimi
          indicatori uscivano dal bordo invece di andare a capo — persi, non solo compressi. */}
      <header style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 14, rowGap: 10 }}>
        <span style={{ fontFamily: 'var(--s-serif)', fontSize: 21, letterSpacing: '0.14em' }}>
          SERENITY
        </span>
        <span style={{ fontFamily: 'var(--s-mono)', fontSize: 13.5, color: 'var(--s-ink-faint)' }}>
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
            <button className="s-glass s-glass-btn" onClick={() => { setSalvaConfigAperto(v => !v); setConfigSalvata(false); }} style={{
              cursor: 'pointer', padding: '5px 12px', borderRadius: 999,
              background: 'var(--s-disc)',
              fontFamily: 'var(--s-sans)', fontSize: 14, color: 'var(--s-ink-faint)',
            }}>
              {LC('salva questa configurazione', 'sauvegarder cette configuration',
                'save this configuration', 'guardar esta configuración', 'spara denna konfiguration')}
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
                  <input
                    value={nomeConfigDaSalvare}
                    onChange={e => { setNomeConfigDaSalvare(e.target.value); setConfigSalvata(false); }}
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
        <span style={{ width: 1, height: 16, background: 'var(--s-ink-ghost)', flexShrink: 0 }} />
        {/* ── LE CONNESSIONI, UN PUNTO E UNA PAROLA PER DISPOSITIVO ──────────────────────────
            Segnalato: deve capirsi SUBITO quale dispositivo è collegato, quale non lo è, se
            regge, quale aspetta, se c'è un problema, quando sta cercando — senza diventare un
            pannello diagnostico. `IndicatoreConnessione` fa questo, e SOLO questo, per ognuno
            dei dispositivi reali di questa seduta. Vedi la nota in testa a quel file per la
            scelta dei tre colori.
            L'etichetta "STRUMENTI" qui davanti: la sola zona dove due parole simili (MUSE
            locale qui, MUSE del preclear più avanti se a distanza) potevano confondersi. */}
        <span style={{ fontFamily: 'var(--s-sans)', fontSize: 12, letterSpacing: '0.12em',
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
        {/* ── SENZA STRUMENTI — segnalato: « manque SANS INSTRUMENTS à côté de MUSE et METER ».
            Il pannello "con che cosa si audita?" (`scegliStrumento`) offriva già questa terza
            via, ma solo dentro un modale che appare SOLO se nessuno strumento è già connesso —
            chi vuole dichiararlo ESPLICITAMENTE, senza passare da quel modale, non aveva dove
            farlo. Stesso `IndicatoreConnessione`, stessa famiglia di MUSE/METER: attivarla
            spegne entrambi gli strumenti (« senza strumenti » è ESCLUSIVO con loro, come nel
            modale — `scegliConn`), disattivarla non fa nulla da sé, si torna a scegliere. */}
        <IndicatoreConnessione
          onClick={() => {
            const nuovo = !senzaStrumenti;
            setSenzaStrumenti(nuovo);
            if (nuovo) {
              if (muse.museConnection !== 'disconnected') muse.handleConnectMuse();
              if (meterC) theta.disconnect();
            }
          }}
          icona={<MessageSquareOff size={13} strokeWidth={1.8} />}
          etichetta={t('no_instruments_mode') as string}
          stato={senzaStrumenti ? 'connesso' : 'in-attesa'}
        />
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
        <button className="s-glass s-glass-btn" onClick={() => setConfigAperto(true)} title={t('config') as string} style={{
          cursor: 'pointer', padding: 8, borderRadius: 999,
          background: 'var(--s-disc)', display: 'flex', color: 'var(--s-ink-soft)',
        }}>
          <Settings size={16} strokeWidth={1.6} />
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
          <HelpCircle size={16} strokeWidth={1.6} />
        </button>
      </header>
      {guidaAperta && <GuideModal lang={lang} onClose={() => setGuidaAperta(false)} />}

      {/* ── I COMANDI, IN ALTO — segnalato: « i cicli non sono chiari messi sotto, mettili in
          alto come in equilibrium ». In App.tsx l'item, i quattro metodi, i passi del ciclo in
          corso e i suoi esiti stanno DENTRO il pannello dello strumento, appena sopra l'arco —
          non in un piede di pagina lontano da dove l'occhio già guarda. Questo blocco (era
          `<footer>`, l'ultimo figlio della pagina) è lo STESSO, spostato qui sopra il
          quadrante: nessuna riga di logica toccata, solo l'ordine in cui compaiono. */}
      <div className="ser-comandi" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 18, rowGap: 10 }}>
        {/* ⚠️ Niente `border: 'none'` qui — segnalato: « je ne vois pas de GLASS FORM ». Uno
            stile inline vince sempre su una classe CSS per la stessa proprietà: dichiararlo qui
            cancellava in silenzio il bordo di `.s-glass`. */}
        <button className="s-glass s-glass-btn" onClick={aperta ? chiudi : apri} style={{
          cursor: 'pointer',
          background: 'var(--s-disc)', color: 'var(--s-ink)',
          borderRadius: 999, padding: '11px 28px',
          fontSize: 15.5, letterSpacing: '0.1em', textTransform: 'uppercase',
          fontFamily: 'var(--s-sans)',
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
            <div style={{ flexBasis: '100%', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontFamily: 'var(--s-sans)', fontSize: 11.5, letterSpacing: '0.1em',
                            textTransform: 'uppercase', color: 'var(--s-ink-faint)' }}>
                {LC('poi scegli il metodo', 'puis choisis la méthode', 'then choose the method', 'luego elige el método', 'välj sedan metoden')}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
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
                  <button key={c.k} className="s-glass s-glass-btn" onClick={c.onClick} style={{
                    border: `1.5px solid ${c.hue ?? 'var(--s-ink-ghost)'}`, cursor: 'pointer',
                    borderRadius: 999, padding: '6px 14px', background: 'var(--s-disc)',
                    fontFamily: 'var(--s-sans)', fontSize: 14.5, fontWeight: 700, letterSpacing: '0.05em',
                    color: c.hue ?? 'var(--s-ink-soft)',
                  }}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
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
          </>
        )}
        {/* Il giornale NON si mostra: scorrere alla periferia tira l'occhio proprio mentre
            l'ago legge. Qui si dice solo che sta scrivendo, e quante righe ha. */}
        <span style={{ fontSize: 14.5, color: 'var(--s-ink-faint)' }}>
          {t('ser_journal')} · {journal.logs.length} {t(journal.logs.length === 1 ? 'ser_line' : 'ser_lines')}
        </span>
        {/* ── IL METER — segnalato: « comment peux-tu mettre la connexion METER EN BAS, le MUSE
            en haut ». La sua connessione e la sua configurazione stanno ORA solo in
            intestazione (l'indicatore + la freccia accanto, vedi sopra) — niente più un secondo
            pannello quaggiù da imparare a parte. */}
        {/* ── ASSESSMENT — spostato nella sua ZONA (`ZonaAssessment`, ancorata in alto a
            sinistra, accanto al quadrante) — segnalato: « deve avere una sua zona, come in
            equilibrium ». Non più qui: vedi il commento sopra `<section>`. */}
        {/* MNA — segnalato assente: un ATTREZZO, non un modo. Si apre SENZA lasciare il ciclo
            in corso (`PannelloMna` galleggia sul quadrante, la seduta resta sotto) — stesso
            principio del tasto MNA nella barra dei comandi di App.tsx. */}
        {aperta && moduleVis.mna && (
          <button
            className="s-glass s-glass-btn"
            onClick={() => setMnaAperto(v => !v)}
            style={{
              cursor: 'pointer', padding: '5px 12px', borderRadius: 999,
              background: 'var(--s-disc)',
              fontFamily: 'var(--s-sans)', fontSize: 15,
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
            className="s-glass s-glass-btn"
            onClick={() => { if (!ep.epValidated) ep.setEpTimestamp(sessionClock.now()); ep.setEpManualOpen(true); }}
            style={{
              cursor: 'pointer', padding: '5px 12px', borderRadius: 999,
              background: 'var(--s-disc)',
              fontFamily: 'var(--s-sans)', fontSize: 15,
              color: ep.epValidated ? 'var(--s-still)' : 'var(--s-ink-faint)',
            }}>
            {ep.epValidated ? 'EP ✓' : 'EP'}
          </button>
        )}
        <span style={{ flex: 1 }} />
        {!aperta && (
          <button onClick={ricomincia} style={{
            border: 'none', background: 'none', cursor: 'pointer',
            fontFamily: 'var(--s-sans)', fontSize: 15, color: 'var(--s-ink-faint)',
          }}>
            ← {t('ser_change_people')}
          </button>
        )}
      </div>

      {/* ── IL CAMPO ──────────────────────────────────────────────────────────────────────
          Lo strumento occupa lo spazio, come in EQUILIBRIUM — non è un modulo fra gli altri,
          è QUELLO su cui gli altri si dispongono. I quattro cerchi che diventeranno i moduli
          (fase 6+) restano ai bordi: compaiono quando servono, e per ora sono spenti. */}
      <section style={{
        position: 'relative', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16, minHeight: 0,
      }}>
      {/* ── IL CASSETTO DEL METER — ancorato SOTTO l'intestazione, dove sta il suo indicatore ──
          Non nel flusso della pagina (galleggia, `position:absolute`, come le camere qui sotto e
          il pannello MNA più giù): aprirlo non deve spingere in basso tutto il resto — la stessa
          ragione per cui era sbagliato tenerlo fisso in fondo alla pagina. Si chiude da sé se il
          meter si disconnette (vedi l'`useEffect` accanto a `meterSetupAperto`). */}
      {meterSetupAperto && meterC && (
        <div style={{ position: 'absolute', top: 16, right: 44, zIndex: 30 }}>
          <PannelloMeter theta={theta} provaTa={provaTa} onFatto={() => setMeterSetupAperto(false)} />
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
      {aperta && (moduleVis.cam1 || (moduleVis.cam2 && (avvio.distanza || avvio.solo))) && (
        <div style={{
          position: 'absolute', top: 16, right: 32, zIndex: 5,
          display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 14,
          pointerEvents: 'none',
        }}>
          {moduleVis.cam2 && (avvio.distanza || avvio.solo) && (
            <CameraCerchio
              dimensione={260}
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
              dimensione={213}
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
      {aperta && (
        <ZonaAssessment
          attivo={assessAttivo}
          onToggle={() => setAssessAttivo(v => !v)}
          items={assessItems}
          LC={LC}
        />
      )}

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
                <div style={{
                  position: 'absolute', left: 12, top: '38%', bottom: '14%', width: 260,
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
            dell'assessment prima di avere senso). Segnalato di nuovo: la stessa scelta
            esclusiva di tema/lingua — un cursore che scivola, non due pillole. */}
        {museOk && meterC && (
          <SegmentoVetro<'eeg' | 'theta'>
            opzioni={[{ k: 'eeg', label: 'MUSE' }, { k: 'theta', label: 'METER' }]}
            selezionato={agoScelto}
            onChange={setAgoScelto}
            minLarghezza={64}
          />
        )}
        {/* L'orologio resta sulla superficie di SERENITY, fuori dal pannello scuro: si
            guarda una volta ogni tanto, lo strumento in continuazione. */}
        <span style={{
          fontFamily: 'var(--s-mono)', fontSize: 15.5, letterSpacing: '0.06em',
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
            fontFamily: 'var(--s-sans)', fontSize: 13.5, fontWeight: 700, letterSpacing: '0.06em',
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
            fontFamily: 'var(--s-mono)', fontSize: 14.5, letterSpacing: '0.04em',
            color: 'var(--s-ink-faint)', display: 'flex', gap: 14,
          }}>
            <LetturaTA />
            <LetturaFase t={t} />
            {museGate.signalQuality > 0 && <span>{museGate.signalQuality}%</span>}
            {museOk && (
              <span title={t('biometric_integrity') as string}>
                <LetturaIntegrita />
              </span>
            )}
          </span>
        )}
        {/* ── LA STESSA LETTURA, DAL METER — segnalato: « la scala del tono non appare, il TA
            neanche, la diagnostica e tutti gli altri elementi, METTILI ». Il blocco sopra parla
            SOLO all'ago EEG (`agoEeg`) — con METER/senza strumenti restava muto, anche a
            strumento vero collegato e a numeri veri disponibili (`theta.ta`/`taNow`, già
            calcolati da `useThetaMeter`, non riletti qui). Stesso posto, stessa grafica,
            sorgente diversa: il TA di riposo, quello ISTANTANEO se si scosta, e FN se
            l'estensimetro fluttua (`theta.fn.fn`, lo stesso segnale che l'arco legge). */}
        {!agoEeg && meterC && (
          <span style={{
            fontFamily: 'var(--s-mono)', fontSize: 14.5, letterSpacing: '0.04em',
            color: 'var(--s-ink-faint)', display: 'flex', gap: 14,
          }}>
            <span>TA {theta.ta !== null ? theta.ta.toFixed(2) : '—'}</span>
            {theta.taNow !== null && Math.abs(theta.taNow - (theta.ta ?? theta.taNow)) > 0.01 && (
              <span>→ {theta.taNow.toFixed(2)}</span>
            )}
            {theta.fn.fn && (
              <span style={{ color: 'var(--s-reserve)' }}>
                {LC('galleggia', 'flotte', 'floating', 'flota', 'flyter')}
              </span>
            )}
          </span>
        )}
        {/* ── LO STESSO `CycleStatusBar` DI APP.TSX, NON UNA COPIA — segnalato: « i cicli
            devono essere disposti esattamente come in equilibrium, stessi campi, stessa
            logica ». `LetturaCiclo` (sopra, ora tolta da qui) mostrava SOLO comm-lag e %
            dissoluzione — un sottoinsieme scritto a mano. Mancavano il chip « nessuna lettura »
            (`noReadSignal` — il ciclo CONTACT non ha visto nulla nella finestra del comm-lag,
            un'indicazione che potrebbe essere un NULL) e il chip del ciclo NULL (« recharging »,
            lo scarto di TA dal suo inizio + i secondi). Nessuno dei due era calcolato da capo:
            `useContactNullCycle` (già montato) li espone già (`noReadSignal`, `nullSinceMock`,
            `taAtNullStart`), semplicemente non erano letti qui. Il componente STESSO — non una
            sua imitazione — si occupa del resto (colori, soglie, le 5 lingue del chip). */}
        {cycles.cycleArmed && (
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
        )}

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
