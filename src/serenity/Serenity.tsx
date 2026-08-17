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

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useMetric } from '../store/metricsStore';
import { chargeStateById } from '../lib/chargeState';
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
import { useSessionJournal } from '../session/useSessionJournal';
import { useContactNullCycle } from '../session/useContactNullCycle';
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
import type { ReadSrc } from '../engine/instantRead';
import type { PrimePhase, Zone as PrimeZone } from '../lib/primeFreqEngine';
import type { MnaSession } from '../hooks/useMnaModule';

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
  const [tempo, setTempo] = useState(0);
  /** Le quattro risposte dell'avvio. `null` = le domande non sono ancora state fatte. */
  const [avvio, setAvvio] = useState<StatoAvvio | null>(null);
  /** Si è passati OLTRE la schermata di connessione? Un flag a parte, non `remote.isConnected`
   *  direttamente: un blip di rete a metà seduta non deve risbattere l'auditor sulla schermata
   *  del link — la connessione può cadere e riprendersi, la seduta resta aperta lo stesso. */
  const [collegato, setCollegato] = useState(false);
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
    // Nessuna pausa automatica su MUSE perso: SERENITY non ha ancora lo stato PAUSED
    // (solo aperta/chiusa) — la sessione resta aperta, il gate di contatto segnala da sé.
    pauseOnLoss: () => {},
  });

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
  /** Nessun assessment multi-item da voce ancora — sempre spento. */
  const assessActiveRef = useRef(false);

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

  // MNA (SONIFY/CLEAN/HARMONICS) — nessun pannello ancora in SERENITY: i campi esistono
  // solo perché `useChargeEngine` li aggiorna comunque (il worker non sa che nessuno guarda).
  const [primeIm, setPrimeIm] = useState(0);
  const [primeFd, setPrimeFd] = useState(0);
  const [primePStar, setPrimePStar] = useState(2);
  const [primeDelta, setPrimeDelta] = useState(0);
  const [primeZone, setPrimeZone] = useState<PrimeZone>('PRIME');
  const [primeCaptured, setPrimeCaptured] = useState(false);
  const primePhaseRef = useRef<PrimePhase>('IDLE');
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
   * ⚠️ COSA MANCA ANCORA: il ciclo NULL (solo CONTACT armabile da qui, per ora), il lag di Ron
   * (`onLagMeasured` no-op, nessun readout), e l'assessment automatico da voce
   * (`ensureAssessmentOn` no-op — l'item si scrive, non si detta ancora).
   */
  const [item, setItem] = useState('');
  const cycles = useContactNullCycle({
    auditingQuestion: item,
    setAuditingQuestion: setItem,
    setItemSpoken: () => {},
    nowSec: () => sessionClock.now(),
    logLength: () => journal.logs.length,
    log: (text, type) => journal.addLog({ speaker: 'SYS', text, time: sessionClock.now(), type }),
    LC,
    thetaTa: () => thetaTaRef.current,
    freeNeedleForNewItem,
    ensureAssessmentOn: () => {},
    onItemGiven: sec => { ultimoItemSecRef.current = sec; },
    writeCycleCorpus: row => {
      if (!corpusSessionRef.current) return;   // fuori seduta non si archivia
      corpusWrite(cycleRecord(corpusSessionRef.current, new Date().toISOString(), row));
    },
    markFnAsIs: () => flushEegFn(true),
    stopSonification: () => {},
    onLagMeasured: () => {},
  });
  trackCycleRef.current = cycles.trackCycle;

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

  // ── QUALE AGO SI VEDE ────────────────────────────────────────────────────────────────────
  // Con due strumenti collegati EQUILIBRIUM lascia scegliere l'auditor (`agoPrincipale`,
  // App.tsx) — quella scelta non c'è ancora qui. Finché non arriva: il Theta-Meter (misurato,
  // non ricostruito) ha la precedenza se collegato, altrimenti l'EEG se il MUSE lo è.
  const agoEeg = !meterC && muse.museConnection === 'connected';

  // I profili vengono dallo stesso armadio di EQUILIBRIUM — è la verifica di questa fase.
  const nome = (lista: Array<{ id: string; name: string }>, id: string | null | undefined) =>
    id === 'nuovo' ? 'nuovo' : (lista.find(p => p.id === id)?.name ?? '—');
  const nomeAuditor = nome(
    (() => { try { return getProfiles(); } catch { return []; } })(), avvio?.auditorId);
  const nomePreclear = nome(
    (() => { try { return getPcProfiles(); } catch { return []; } })(), avvio?.pcId);

  const apri = () => {
    sessionClock.reset(); sessionClock.start();
    journal.resetJournal(t('ser_session_opened'));
    ep.resetEpState();   // niente "EP ✓" residuo da una seduta precedente
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
  const chiudi = () => {
    sessionClock.end();
    journal.addLog({ speaker: 'SYS', text: t('ser_session_closed'), time: sessionClock.now() });
    corpusSessionRef.current = '';
    if (avvio?.distanza) remote.impostaStatoSeduta('ended');
    setAperta(false);
  };
  /** Si ricomincia dalle domande. Solo a seduta chiusa: cambiare preclear a metà seduta
   *  vorrebbe dire attribuire a una persona quel che ha fatto un'altra. Una seduta a distanza
   *  si chiude anche sulla rete — altrimenti il link resterebbe aperto per il PROSSIMO preclear
   *  scelto qui, che non è più chi era dall'altra parte. */
  const ricomincia = () => {
    if (avvio?.distanza) remote.disconnetti();
    setCollegato(false);
    setAvvio(null);
  };

  // ── LE QUATTRO DOMANDE, PRIMA DI TUTTO ────────────────────────────────────────────────
  // Non è una schermata di benvenuto che si può saltare: senza sapere chi audita e chi si
  // audita, una seduta non si può nemmeno archiviare — finirebbe senza nome.
  if (!avvio) {
    return (
      <main style={{ height: '100%', padding: '38px 44px' }}>
        <Avvio onPronto={setAvvio} />
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

  return (
    <main style={{
      height: '100%', display: 'grid', gridTemplateRows: 'auto 1fr auto',
      padding: '38px 44px', gap: 24,
    }}>
      {/* ── L'INTESTAZIONE, che non è una barra ───────────────────────────────────────────
          Nessun fondo, nessuna linea di separazione: il nome sta posato sulla stessa
          superficie di tutto il resto. Una barra è già un pannello. */}
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <span style={{ fontFamily: 'var(--s-serif)', fontSize: 21, letterSpacing: '0.14em' }}>
          SERENITY
        </span>
        <span style={{ fontFamily: 'var(--s-mono)', fontSize: 11, color: 'var(--s-ink-faint)' }}>
          {__SERENITY_VERSION__}
        </span>
        <span style={{ flex: 1 }} />
        {/* ⚠️ SEGNALATO: « la langue doit pouvoir être changée en cours de route » — non solo
            alle quattro domande d'avvio. Stessi due selettori di `Avvio.tsx`, condivisi da
            `Impostazioni.tsx`: qui restano visibili per tutta la seduta, non solo prima. */}
        <SelettoreTema />
        <SelettoreLingua />
        {/* Chi audita, chi si audita, e dove — detto in una riga sola e in grigio: sono cose
            che si controllano una volta all'inizio, non che si guardano in seduta. */}
        <span style={{ fontSize: 12, color: 'var(--s-ink-faint)' }}>
          {nomeAuditor}{avvio.solo ? ` · ${t('ser_alone_tag')}` : ` · ${nomePreclear}`}
          {avvio.distanza ? ` · ${t('ser_remote_tag')}` : ''}{avvio.esperto ? ` · ${t('ser_expert_tag')}` : ''}
        </span>
        {/* Lo stato del MUSE — stesse parole del meter più in basso: si controlla, non si
            sorveglia. « MUSE ✓ » non tradotto: stesso simbolo universale del badge di App.tsx. */}
        <button
          onClick={muse.handleConnectMuse}
          style={{
            border: 'none', background: 'none', cursor: 'pointer', padding: 0,
            fontFamily: 'var(--s-sans)', fontSize: 12,
            color: muse.museConnection === 'connected' ? 'var(--s-still)' : 'var(--s-ink-faint)',
          }}>
          {muse.museConnection === 'connected'
            ? (museGate.museContact ? 'MUSE ✓' : t('ser_meter_disconnected'))
            : muse.museConnection === 'searching' ? '…' : t('ser_connect_muse')}
          {muse.museConnection === 'connected' && batteryLevel !== null && ` · ${batteryLevel}%`}
        </button>
        {/* Un problema HARDWARE (fascia scollegata a metà lettura, driver che si blocca) si dice
            in ambra — non è un allarme rosso: è un'informazione da controllare, come lo stato
            del MUSE accanto. Sparisce da sé al prossimo dato buono (`useChargeEngine` lo azzera
            al primo METRICS_UPDATE valido). */}
        {hardwareError && (
          <span style={{ fontSize: 12, color: 'var(--s-reserve)' }}>{hardwareError}</span>
        )}
        {/* Lo stato della RETE, detto a parole — non un badge colorato che chiama l'occhio: un
            blip di connessione non è un allarme, è un'informazione da controllare se serve. */}
        {avvio.distanza && (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 7, fontSize: 12,
            color: remote.isConnected ? 'var(--s-still)' : 'var(--s-reserve)',
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: remote.isConnected ? 'var(--s-still)' : 'var(--s-reserve)',
            }} />
            {remote.isConnected ? t('conn_badge_auditor_ok') : t('conn_badge_auditor_waiting')}
            {remote.isConnected && remote.remoteBatteryLevel !== null && ` · ${remote.remoteBatteryLevel}%`}
            {remote.isConnected && (remote.remoteMuseConnected ? ' · MUSE ✓' : ` · ${t('conn_muse_preclear_disconnected')}`)}
          </span>
        )}
      </header>

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
          borderRadius: 18, overflow: 'hidden',
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
        </div>
        {/* L'orologio resta sulla superficie di SERENITY, fuori dal pannello scuro: si
            guarda una volta ogni tanto, lo strumento in continuazione. */}
        <span style={{
          fontFamily: 'var(--s-mono)', fontSize: 13, letterSpacing: '0.06em',
          color: aperta ? 'var(--s-ink-soft)' : 'var(--s-ink-ghost)',
          transition: 'color var(--s-slow) var(--s-ease)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {orologio(tempo)}
        </span>

        {/* ── LA LETTURA, DETTA A NUMERI — vedi la nota sopra `LetturaTA`. Solo quando c'è un
            ago EEG davvero collegato: senza MUSE il TA da EEG non significa niente (resta al
            suo valore di riposo), e mostrarlo lo stesso sembrerebbe una lettura vera. */}
        {agoEeg && (
          <span style={{
            fontFamily: 'var(--s-mono)', fontSize: 12, letterSpacing: '0.04em',
            color: 'var(--s-ink-faint)', display: 'flex', gap: 14,
          }}>
            <LetturaTA />
            <LetturaFase t={t} />
            {museGate.signalQuality > 0 && <span>{museGate.signalQuality}%</span>}
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
          fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase',
          fontFamily: 'var(--s-sans)',
          transition: `box-shadow var(--s-slow) var(--s-ease)`,
        }}>
          {aperta ? t('ser_close_session') : t('ser_open_session')}
        </button>
        {/* ── IL CICLO — un item, due strade, due gesti di chiusura ────────────────────────
            CONTACT (→ AS-IS) e NULL (→ EQUILIBRIUM, con o senza VGI) condividono lo STESSO
            campo item — sono due strade sullo stesso motore, non due cicli diversi da
            scrivere. Il campo e i bottoni stanno sulla STESSA riga, come in App.tsx dopo il
            segnalato « il campo e il gesto in un posto, il bottone in un altro ». */}
        {aperta && !cycles.cycleArmed && (
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
            <button onClick={() => cycles.armCycle('charge')} style={{
              border: 'none', cursor: 'pointer', background: 'none',
              fontFamily: 'var(--s-sans)', fontSize: 12.5, color: 'var(--s-ink-soft)',
            }}>
              {t('ser_arm_contact')}
            </button>
            <button onClick={() => cycles.armCycle('null')} style={{
              border: 'none', cursor: 'pointer', background: 'none',
              fontFamily: 'var(--s-sans)', fontSize: 12.5, color: 'var(--s-ink-faint)',
            }}>
              {t('ser_arm_null')}
            </button>
          </>
        )}
        {aperta && cycles.cycleArmed && (
          <>
            <span style={{ fontFamily: 'var(--s-serif)', fontSize: 14, color: 'var(--s-ink)' }}>
              {item || t('ser_item_placeholder')}
            </span>
            {cycles.cycleKind === 'null' ? (
              <>
                <button onClick={() => cycles.validateClearRead(true)} style={{
                  border: 'none', cursor: 'pointer', background: 'none',
                  fontFamily: 'var(--s-sans)', fontSize: 12.5, color: 'var(--s-still)',
                }}>
                  {t('ser_validate_equilibrium_vgi')}
                </button>
                <button onClick={() => cycles.validateClearRead(false)} style={{
                  border: 'none', cursor: 'pointer', background: 'none',
                  fontFamily: 'var(--s-sans)', fontSize: 12.5, color: 'var(--s-ink-faint)',
                }}>
                  {t('ser_validate_equilibrium_novgi')}
                </button>
              </>
            ) : (
              <button onClick={() => cycles.validateAsIs()} style={{
                border: 'none', cursor: 'pointer', background: 'none',
                fontFamily: 'var(--s-sans)', fontSize: 12.5, color: 'var(--s-still)',
              }}>
                {t('ser_validate_asis')}
              </button>
            )}
          </>
        )}
        {/* Il giornale NON si mostra: scorrere alla periferia tira l'occhio proprio mentre
            l'ago legge. Qui si dice solo che sta scrivendo, e quante righe ha. */}
        <span style={{ fontSize: 12, color: 'var(--s-ink-faint)' }}>
          {t('ser_journal')} · {journal.logs.length} {t(journal.logs.length === 1 ? 'ser_line' : 'ser_lines')}
        </span>
        {/* Lo stato del meter si dice a parole e in grigio: è una cosa che si controlla
            all'inizio, non che si sorveglia in seduta. */}
        <span style={{ fontSize: 12, color: 'var(--s-ink-faint)' }}>
          {t(meterC ? 'ser_meter_connected' : theta.unavailable ? 'ser_meter_unavailable' : 'ser_meter_disconnected')}
        </span>
        {/* EP — l'auditor lo apre da sé quando vuole registrarlo, non un conto alla rovescia
            automatico (in EQUILIBRIUM quella finestra non è mai raggiungibile). "EP ✓" una
            volta validato, come in App.tsx. */}
        {aperta && (
          <button
            onClick={() => { if (!ep.epValidated) ep.setEpTimestamp(sessionClock.now()); ep.setEpManualOpen(true); }}
            style={{
              border: 'none', cursor: 'pointer', background: 'none',
              fontFamily: 'var(--s-sans)', fontSize: 12.5,
              color: ep.epValidated ? 'var(--s-still)' : 'var(--s-ink-faint)',
            }}>
            {ep.epValidated ? 'EP ✓' : 'EP'}
          </button>
        )}
        <span style={{ flex: 1 }} />
        {!aperta && (
          <button onClick={ricomincia} style={{
            border: 'none', background: 'none', cursor: 'pointer',
            fontFamily: 'var(--s-sans)', fontSize: 12.5, color: 'var(--s-ink-faint)',
          }}>
            ← {t('ser_change_people')}
          </button>
        )}
      </footer>
    </main>
  );
}
