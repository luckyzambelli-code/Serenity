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
import { noInstruments } from '../engine/instrumentModules';
import { SET_OFFSET } from '../engine/dialGeometry';
import { THETA_LABEL_AFTER_MS } from '../engine/tuning';
import { QuantumSphere } from '../components/QuantumSphere';
import { ClearDial } from '../components/ClearDial';
import { CycleStatusBar } from '../components/CycleStatusBar';
import { PistaCiclo } from './PistaCiclo';
import { PistaProcedimento } from './PistaProcedimento';
import { VistaSenzaAgo } from './VistaSenzaAgo';
import { listaProcedimenti, apriCartellaProcedimenti, type Procedimento } from '../lib/procedimenti';
import { ThetaReadyCheck } from '../components/ThetaReadyCheck';
import { MetabolicCheck } from '../components/MetabolicCheck';
import { metabolicBaseline, type MetabAssessment } from '../engine/MetabolicBaseline';
import { useSessionJournal } from '../session/useSessionJournal';
import { useContactNullCycle } from '../session/useContactNullCycle';
import { useMirrorCycle } from '../session/useMirrorCycle';
import { MirrorDial } from '../components/MirrorDial';
import { useToneCycle } from '../session/useToneCycle';
import { useTruthCycle } from '../session/useTruthCycle';
import { ToneDial } from '../components/ToneDial';
import { ToneColumn } from '../components/ToneColumn';
import { TONE_LEVELS, levelName } from '../engine/toneLevels';
import {
  loadHistory as loadCanTests, saveHistory as saveCanTests, addTest as addCanTest,
  testedToday, type PcCanHistory,
} from '../engine/canTest';
import { SQUEEZE_TARGET_OFFSET } from '../engine/thetaSetup';
import { sessionRecorder } from '../engine/SessionRecorder';
import { sessionRecord, cycleRecord, fnRecord, itemRecord, chiaveItem } from '../engine/corpus';
import { corpusWrite, corpusAvailable } from '../lib/corpusWriter';
import { getProfiles, getPcProfiles, saveSession, saveSessionPdf, saveSessionPdfAsync, getAllProcessusFiles, getSessionsByProfile } from '../lib/storage';
import { isServerAvailable, serverGetProcessusList, serverProcessusUrl, serverSaveSessionPdf } from '../lib/serverStorage';
import { ProcessusModal, type ProcessusEntry } from '../components/ProcessusModal';
import { costruisciRiepilogo, generaPdf, type SerenityReportInput } from './sessionReport';
import { Avvio } from './Avvio';
import { type Avvio as StatoAvvio } from './flussoAvvio';
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
import { Settings, Headphones, Gauge, User, Users, Wrench, Wifi, MessageSquareOff, HelpCircle, Save, Play, Pause, History as HistoryIcon, BookOpen, UserCog, Clock, Timer, CircleUser, Crosshair, Scale, FlipHorizontal2, AudioWaveform, BadgeCheck, FileCheck, SlidersHorizontal, Brain, Lightbulb, StickyNote } from 'lucide-react';
import { GuideModal } from '../components/GuideModal';
import { AIAssistant } from '../components/AIAssistant';
import { CreditsModal } from '../components/CreditsModal';
import { SplashScreen } from '../components/SplashScreen';
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
import { voiceToneAnalyzer } from '../lib/voiceToneAnalyzer';
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
  /* ⚠️ Segnalato: « le symbole SOMME change-le en Total TA » — verificato `TotalTaReadout`
     (App.tsx, condiviso, `components/SessionReadouts.tsx`): scrive la PAROLA vera
     (`label`, la stringa `total_ta` tradotta), mai un simbolo matematico. "Σ" era
     un'invenzione SERENITY — tolto, la stessa etichetta di App.tsx al suo posto. */
  const { t } = useI18n();
  return (
    <span style={{ fontFamily: 'var(--s-mono)', fontVariantNumeric: 'tabular-nums' }}>
      {t('total_ta') as string} {totalTa.toFixed(2)}
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

/**
 * AiutoOverlay — LA MODALITÀ HELP, A POST-IT.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * Segnalato: « vorrei che cliccando su HELP appaiano sui bottoni e zone le spiegazioni di cosa
 * sono, sotto forma di post-it ». Bozzetto mostrato con due varianti (tutti insieme vs uno per
 * volta al passaggio) — scelta esplicita: « option A », tutti insieme con un solo click.
 *
 * ── PERCHÉ `data-help`, NON UN COMPONENTE CHE AVVOLGE OGNI BOTTONE ─────────────────────────
 * I controlli da spiegare sono sparsi per migliaia di righe (barra in alto, i cinque cerchi,
 * CONFIG...). Avvolgere ciascuno in un contenitore `position:relative` + un componente
 * post-it sarebbe stata una modifica invasiva ripetuta decine di volte. Invece: un attributo
 * `data-help="testo"` in più su ogni bottone già esistente (una riga, il testo quasi sempre
 * già scritto per il suo `title` — non un'invenzione), e QUESTO componente, montato una sola
 * volta, che li trova tutti da solo (`querySelectorAll('[data-help]')`) e disegna un post-it
 * sotto ciascuno, in un livello `position:fixed` sopra tutto. Aggiungere una spiegazione a un
 * bottone nuovo, domani, vuol dire aggiungere un attributo — non toccare questo componente.
 *
 * ── RICALCOLO, NON OSSERVAZIONE ─────────────────────────────────────────────────────────────
 * Le posizioni cambiano poco (resize, scroll) — un intervallo blando (400ms) invece di un
 * `ResizeObserver` per bottone: più semplice, e la differenza non si vede a occhio per
 * un'etichetta che deve solo restare vicina al suo bottone, non seguirlo pixel a pixel.
 */
// Larghezza/altezza presunte di un post-it — servono solo a stimare le sovrapposizioni
// (v. `impila`, sotto), non sono un valore rigido: `maxWidth` nel disegno resta la stessa.
const POSTIT_W = 168, POSTIT_H = 44;
/**
 * ⚠️ BUG TROVATO — segnalato: « l'HELP sovrappone i post-it e non si legge nulla ». Ogni
 * post-it si piazzava SEMPRE alla stessa altezza (subito sotto il suo bottone) — due bottoni
 * vicini (es. MUSE/METER/SANS INSTRUMENTS, tre pillole a un dito di distanza) producevano due
 * riquadri uno sopra l'altro, illeggibili insieme. `impila` è un ripiano a righe: ordina i
 * post-it da sinistra a destra, e per ciascuno cerca la prima riga (dall'alto) dove non tocca
 * un altro già piazzato — se la trova libera resta alla sua altezza naturale, se le prime
 * righe sono già occupate scende a quella dopo. Un gruppo fitto di bottoni finisce così su
 * più righe impilate invece che sovrapposto nello stesso rettangolo.
 */
function impila(grezzi: { x: number; y: number; text: string }[]): { x: number; yBottone: number; y: number; text: string }[] {
  const ordinati = [...grezzi].sort((a, b) => a.x - b.x);
  const righeOccupate: Array<Array<{ min: number; max: number }>> = [];
  return ordinati.map(p => {
    const min = p.x - POSTIT_W / 2, max = p.x + POSTIT_W / 2;
    let riga = 0;
    while (righeOccupate[riga]?.some(o => min < o.max + 6 && max > o.min - 6)) riga++;
    (righeOccupate[riga] ??= []).push({ min, max });
    return { ...p, yBottone: p.y, y: p.y + riga * POSTIT_H };
  });
}
function AiutoOverlay({ attivo }: { attivo: boolean }) {
  const [postIt, setPostIt] = useState<{ x: number; yBottone: number; y: number; text: string }[]>([]);
  useEffect(() => {
    if (!attivo) { setPostIt([]); return; }
    const ricalcola = () => {
      const nodi = Array.from(document.querySelectorAll<HTMLElement>('[data-help]'));
      const grezzi = nodi.map(n => {
        const r = n.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.bottom, text: n.getAttribute('data-help') || '' };
      }).filter(p => p.text);
      setPostIt(impila(grezzi));
    };
    ricalcola();
    window.addEventListener('resize', ricalcola);
    window.addEventListener('scroll', ricalcola, true);
    const id = window.setInterval(ricalcola, 400);
    return () => { window.removeEventListener('resize', ricalcola); window.removeEventListener('scroll', ricalcola, true); window.clearInterval(id); };
  }, [attivo]);
  if (!attivo) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, pointerEvents: 'none' }}>
      {postIt.map((p, i) => (
        <React.Fragment key={i}>
          {/* ⚠️ AGGIUNTO — segnalato: « i post-it non sono posizionati correttamente, devi
              mettere un qualcosa che li collega alla zona che spiegano ». Un post-it "impilato"
              (`impila`, sopra: righe successive per non sovrapporsi ai vicini) può finire
              lontano dal suo bottone — senza un segno, non si capisce più QUALE bottone spiega.
              Una lineetta verticale sottile dal vero bordo del bottone (`p.yBottone`) fino al
              post-it (`p.y`) quando sono stati separati (`p.y > p.yBottone`, cioè impilato su
              una riga successiva) — un filo, non una freccia elaborata: basta a dire "questo
              qui sotto parla di quel bottone lassù". */}
          {p.y > p.yBottone && (
            <div style={{
              position: 'fixed', left: p.x - 1, top: p.yBottone, width: 2, height: p.y - p.yBottone,
              background: 'rgba(253,230,138,0.55)',
            }} />
          )}
          {/* Il "codino" — un piccolo triangolo che punta verso il bottone, come nei fumetti:
              collega il post-it al SUO punto (che sia appena sotto il bottone, o in fondo alla
              lineetta quando impilato più in basso) senza bisogno di leggere le coordinate. */}
          <div style={{
            position: 'fixed', left: p.x - 5, top: p.y, width: 0, height: 0,
            borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
            borderBottom: '5px solid #fde68a',
          }} />
          <div style={{
            position: 'fixed', left: p.x, top: p.y + 5, transform: 'translateX(-50%)',
            maxWidth: POSTIT_W, padding: '7px 10px', borderRadius: 3,
            background: '#fde68a', color: '#78350f', fontSize: 11, fontWeight: 600,
            lineHeight: 1.35, textAlign: 'center', fontFamily: 'var(--s-sans)',
            boxShadow: '2px 3px 8px rgba(0,0,0,0.35)',
          }}>
            {p.text}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

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

/** ── IL DIVISORE VERTICALE — separa le zone della barra comandi in alto (« si deve capire che
 *  sono cose diverse », v. dove viene usato). Era scritto a mano, lo stesso `<span>` identico,
 *  in QUATTRO punti diversi del file (analisi del codice, richiesta esplicita di sistemare
 *  tutto: duplicazione trovata con una ricerca sul letterale) — un componente a sé, non un
 *  gesto per volta: chi cambia il segno del separatore lo cambia una volta sola. */
function Divisore() {
  return <span style={{ width: 1, height: 16, background: 'var(--s-ink-ghost)', flexShrink: 0 }} />;
}

/** ── IL LAG DI RON E LA % DI DISSOLUZIONE, E TUTTO IL RESTO CHE VA COL CICLO — erano
 *  informazioni dinamiche di EQUILIBRIUM (`CycleStatusBar`, riga sotto la domanda), non solo
 *  il disegno dell'arco. Segnalato di nuovo: « i cicli devono essere disposti esattamente
 *  come in equilibrium, stessi campi » — qui sotto non si reimplementa più a mano un
 *  sottoinsieme (`LetturaCiclo`, tolta: mostrava solo comm-lag e %): si monta `CycleStatusBar`
 *  STESSO, lo stesso componente condiviso che App.tsx usa, coi campi che gli mancavano
 *  (`noReadSignal`, il chip « recharging » del NULL). */

export default function Serenity() {
  const { t, lang, setLang } = useI18n();
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
  /** ── HELP A POST-IT — v. `AiutoOverlay`, sopra. Un bottone A SÉ, diverso da GUIDE: quello
   *  apre il manuale intero (un documento a parte); questo mostra spiegazioni BREVI direttamente
   *  SOPRA i controlli della schermata attuale, senza lasciarla. Due bisogni diversi, due
   *  bottoni — sovrapporli sullo stesso avrebbe reso ambiguo cosa aspettarsi da un click. */
  const [helpAttivo, setHelpAttivo] = useState(false);
  /** ── IL SELETTORE STRUMENTI, RIDOTTO A UN PALLINO IN BASIC — v. il suo montaggio, più giù.
   *  Falso all'apertura: in BASIC le tre pillole MUSE/METER/SENZA STRUMENTI restano un
   *  pallino solo finché l'auditor non lo tocca — un click lo espande (resta espanso per il
   *  resto della seduta, niente su/giù continuo). In EXPERT non si guarda mai: la fila intera
   *  resta come sempre. */
  const [strumentiEspansi, setStrumentiEspansi] = useState(false);
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
  /** ── PROCEDIMENTI — segnalato: « consenti la selezione di procedimenti presenti nella
   *  cartella COMANDI/Procedimenti, e versa i suoi comandi nello spazio comandi dei cicli ».
   *  `procedimenti`: la lista trovata in `~/EQUILIBRIUM/COMANDI/Procedimenti` (ricaricata ogni
   *  volta che PROCESSUS si apre — un file appena trascinato lì dentro compare senza dover
   *  riavviare l'app). `procedimentoAttivo`: quale, se uno, sta rimpiazzando la pista del
   *  ciclo nello spazio comandi in questo momento — `null` quando nessuno è stato scelto, o
   *  dopo che l'auditor lo ha chiuso (v. `PistaProcedimento`, il suo bottone ✕).
   *  ⚠️ BUG TROVATO — segnalato: « il bottone COMMANDS non indica il numero di file presenti
   *  se non lo apri prima ». Vero: il caricamento partiva SOLO `if (processusAperto)` — la
   *  pastiglia del bottone (`procedimenti.length`) restava a 0 (quindi invisibile, v. la sua
   *  guardia `> 0`) finché l'auditor non apriva il modale ALMENO una volta, anche se i file
   *  erano già lì dall'inizio. Tolta la guardia: l'effetto gira anche al PRIMO render
   *  (`processusAperto` è `false` allora, ma l'effetto scatta comunque sul mount), poi di
   *  nuovo ogni volta che PROCESSUS si apre o si chiude — il ricaricamento "a caldo" di un
   *  file appena trascinato nella cartella resta invariato, solo non più l'UNICA occasione
   *  di caricare qualcosa. */
  const [procedimenti, setProcedimenti] = useState<Procedimento[]>([]);
  const [procedimentoAttivo, setProcedimentoAttivo] = useState<Procedimento | null>(null);
  useEffect(() => {
    listaProcedimenti().then(setProcedimenti);
  }, [processusAperto]);
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

  // FIX: URL dei PDF PROCESSUS (`getAllProcessusFiles()` sopra crea un
  // `URL.createObjectURL(blob)` per ciascuno, percorso IndexedDB) mai revocati qui —
  // App.tsx ha un effetto dedicato ("FIX B-04") per lo stesso identico problema, ne
  // manca l'equivalente qui. Stesso pattern: diff prev→next, revoca solo gli URL
  // usciti dalla lista (non quelli ancora presenti — revocarli TUTTI ad ogni cambio
  // spegnerebbe anche i PDF appena aggiunti insieme a un fratello), più la revoca
  // finale allo smontaggio.
  const prevProcessusUrlsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const nextUrls = new Set(
      processusPdfs.map(f => f.url).filter((u): u is string => !!u && u.startsWith('blob:'))
    );
    prevProcessusUrlsRef.current.forEach(u => {
      if (!nextUrls.has(u)) URL.revokeObjectURL(u);
    });
    prevProcessusUrlsRef.current = nextUrls;
  }, [processusPdfs]);
  useEffect(() => () => {
    prevProcessusUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
    prevProcessusUrlsRef.current.clear();
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
  /** ── L'ASSETTO, ORA UN'UNICA ICONA — segnalato: « comprimere la pillola chi/come/dove a un
   *  nome + icona "modifica assetto" ». Prima l'interruttore Basic/Expert stava SEMPRE in
   *  chiaro dentro la pillola, e cambia-persone/salva-configurazione (solo prima di aprire)
   *  erano due icone IN PIÙ nella stessa pillola — fino a quattro azioni sempre a vista per
   *  un'informazione che, come dice `Avvio.tsx` di sé stesso, "si controlla una volta
   *  all'inizio, non che si guarda in seduta". Un solo interruttore qui, un solo pannello
   *  sotto con le stesse azioni di prima (nessuna tolta) — non più tutte in chiaro insieme. */
  const [assettoAperto, setAssettoAperto] = useState(false);
  /** ── L'ASSISTENTE IA, DIETRO UN'ICONA — segnalato: « riduci la finestra di connessione a
   *  GEMINI sotto forma di un'icona, che si apra quando schiacci, così recuperiamo spazio e
   *  non disturbiamo l'auditor ». `AIAssistant` (condiviso con App.tsx) monta da sé una barra
   *  COMPATTA sempre larga fino a 380px (icona+campo+bottone API+invio) — mai un'icona sola:
   *  in App.tsx ha senso (un pannello fra tanti, la barra dei comandi è già larga); qui,
   *  accanto a CONFIG/Guide, restava sempre a vista anche quando nessuno la sta usando. Non si
   *  tocca il componente condiviso (monta ancora TALE E QUALE, stesso stato interno, stessa
   *  chat) — solo SERENITY decide se montarlo AFFATTO: un'icona propria lo sostituisce quando
   *  chiuso, lo rivela quando aperto. */
  const [aiAperto, setAiAperto] = useState(false);
  /** Il « minimizza » di ciascuna camera — lo stesso `isVisible` di `CameraFeed.tsx`, un gesto
   *  in seduta, DIVERSO dallo spegnimento da CONFIG (`moduleVis`): qui lo stream resta vivo. */
  const [cam1Collassata, setCam1Collassata] = useState(false);
  const [cam2Collassata, setCam2Collassata] = useState(false);
  /** ⚠️ BUG TROVATO — segnalato: « i bottoni a sinistra non devono sovrapporsi alle scritte in
   *  alto ». La barra laterale (OPEN/PAUSA/CONTACT/…) è ancorata con un `top` FISSO — ma
   *  l'altezza vera di `<header>` sopra di lei CAMBIA (l'assistente IA, i popover…): un numero
   *  fisso andava bene per UNA sola combinazione di quel contenuto, sbagliato per le altre.
   *  Misurata per davvero, DOPO ogni resa (`useLayoutEffect` SENZA lista di dipendenze — gira
   *  dopo ogni commit, prima della vernice — non un `ResizeObserver`: verificato dal vivo che
   *  in questo ambiente di test i suoi callback non arrivano mai, anche su un ridimensionamento
   *  vero della finestra; una misura ripetuta ad ogni resa non dipende da quel meccanismo, ed è
   *  già lo stesso ritmo del resto della pagina — l'orologio di seduta la fa comunque
   *  ridisegnare ogni secondo). `Math.round` sui due numeri prima di confrontarli: `setState`
   *  con lo STESSO valore non fa ridisegnare — nessun ciclo infinito, si ferma da sé quando
   *  l'altezza smette di cambiare.
   *
   *  ── LA CATENA A DUE ANELLI — segnalato: « le scritte dei cicli devono essere tutte al lato
   *  sinistro, sotto il TA, tutte quelle in alto » (rispondendo: « dentro la barra laterale
   *  esistente »). `.ser-comandi` (il campo item, i quattro blocchi per metodo, i suggerimenti,
   *  i bottoni di avanzamento — TUTTO quel che stava in cima allo schermo, v. la sua nota più
   *  giù) non è più una riga della griglia SOPRA il quadrante: è diventata lei stessa un
   *  riquadro `position:absolute` ancorato a sinistra, subito sotto `<header>` — ed è SOLO per
   *  questo che serve un PRIMO anello di misura (`headerRef`/`comandiTop`) dove prima bastava
   *  il flusso normale del documento. Il SECONDO anello (`comandiRef`/`sidebarTop`, sotto)
   *  esisteva già: misurava `.ser-comandi` per posizionare la barra laterale subito sotto di
   *  lei — la STESSA relazione, la STESSA logica, non toccata: `.ser-comandi` ha solo cambiato
   *  MODO di stare a schermo (assoluta invece che in flusso), non SMESSO di essere quel che la
   *  barra laterale insegue. */
  const headerRef = useRef<HTMLElement | null>(null);
  const [comandiTop, setComandiTop] = useState(70);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const nuovo = Math.round(el.offsetTop + el.offsetHeight) + 14;
    setComandiTop(prev => (prev === nuovo ? prev : nuovo));
  });
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
    // manualmente la posizione della finestra. Vale ANCHE ora che `.ser-comandi` è assoluta
    // invece che in flusso: `offsetTop`/`offsetHeight` riportano il suo rettangolo VERO
    // qualunque sia il suo `position`, non solo quando sta nel flusso normale.
    const nuovo = Math.round(el.offsetTop + el.offsetHeight) + 14;
    setSidebarTop(prev => (prev === nuovo ? prev : nuovo));
  });
  /** `taRef` — il blocco della lettura TA/NEEDLE LIGHT in alto a sinistra del quadrante
   *  (`top:14,left:16` dentro `<section>`). */
  const taRef = useRef<HTMLDivElement | null>(null);
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
  /** ⚠️ SEGNALATO: « dimmi esattamente cosa fai apparire come moduli in BASIC e EXPERT ».
   *  Risposta onesta al momento della domanda: NIENTE — l'interruttore (sopra, nella pillola
   *  dell'intestazione) cambiava solo la SUA icona/parola, nessun modulo ne seguiva. Verificato
   *  App.tsx: `espertoAttivo` (== `uiLevel === 'expert'`) governa un `useEffect` che scrive
   *  `moduleVis.biometric` — vero in EXPERT, falso in BASIC, una PREFERENZA scritta all'apertura
   *  del livello (l'auditor può poi comunque riaccenderlo/spegnerlo da CONFIG, la stessa scelta
   *  resta sua) — e una seconda cosa, un pannello "diagnostica" (Total TA + velocità) dietro un
   *  cassetto visibile SOLO in EXPERT: quella seconda parte resta fuori da qui apposta, non
   *  ambigua ma DIVERSA — in SERENITY il Total TA e la velocità sono già SEMPRE visibili
   *  nell'angolo dell'arco (una scelta esplicita di un giro precedente, non un'omissione), e
   *  nasconderli di nuovo dietro EXPERT sarebbe togliere qualcosa che l'auditor vede oggi senza
   *  che l'abbia chiesto — la stessa riga della prima, non la seconda. Qui solo la sincronia del
   *  modulo biometrico, la parte SENZA ambiguità. */
  const espertoAttivo = avvio?.esperto;
  /**
   * ⚠️ ESTESO — segnalato: « semplificare al massimo BASIC »; scelti esplicitamente MNA,
   * Santé Système e i numeri esatti (v. `LetturaTotalTa`/`LetturaVelocita`, sopra). MNA e
   * Santé Système sono pannelli DIAGNOSTICI — utili a chi vuole vedere tutto, non al minimo
   * per seguire una seduta — e già avevano un interruttore in `moduleVis`, semplicemente mai
   * legato al livello. Stessa forma di `biometric`: una PREFERENZA scritta all'apertura del
   * livello, sempre riaccendibile a mano da CONFIG — la scelta resta dell'auditor.
   */
  /**
   * ⚠️ ESTESO ANCORA — segnalato: « tutti » (le quattro proposte di semplificazione). Il
   * Journal si aggiunge qui, STESSA forma di MNA/Santé Système: un pannello che riepiloga,
   * utile a rileggere, non indispensabile momento per momento (il PDF di fine seduta lo
   * contiene comunque per intero). `moduleVis.ri` (ASSESSMENT + R&I · Manuel) NON è qui,
   * deliberatamente: è il modo stesso di dare un item a mano quando la voce non c'è — spegnerlo
   * di default in BASIC toglierebbe una funzione, non un tecnicismo. Le CAM (altra proposta
   * accettata) restano FUORI da questo effetto apposta: non sono una preferenza da riscrivere,
   * sono un calcolo derivato (`cam2Mostrata`, sotto) che si aggiorna da solo col cambiare della
   * seduta (remota o no) — scriverle qui le confonderebbe con una scelta persistita.
   */
  /**
   * ⚠️ BUG TROVATO — segnalato di nuovo: « la MNA in basic non deve apparire ». La guardia
   * `if (espertoAttivo === undefined) return;` lasciava intatta la preferenza VECCHIA
   * (persistita in `localStorage`, magari `true` da mesi di seduta EXPERT) ogni volta che
   * `avvio?.esperto` non era un booleano ESATTO — e `esperto` (v. `flussoAvvio.ts`) parte da
   * `null`, non da `undefined`: una CONFIGURAZIONE SALVATA scritta prima che questo campo
   * esistesse, o ricreata da un percorso che non lo valorizza, restava `null`/`undefined` per
   * sempre, la guardia usciva subito, e MNA restava acceso qualunque livello si scegliesse
   * dopo. Tolta la guardia: qualunque cosa che non sia `true` per davvero (`false`, `null`,
   * `undefined`) conta come BASIC — sicuro anche PRIMA che l'auditor abbia risposto, perché
   * questi moduli si vedono solo a seduta aperta (`aperta && moduleVis.X`), e la seduta non si
   * apre prima che le quattro domande dell'avvio siano finite.
   */
  useEffect(() => {
    const esperto = espertoAttivo === true;
    setModuleVis(v => (v.biometric === esperto && v.mna === esperto && v.health === esperto && v.journal === esperto)
      ? v : { ...v, biometric: esperto, mna: esperto, health: esperto, journal: esperto });
  }, [espertoAttivo, setModuleVis]);
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
  /** ⚠️ BUG TROVATO — segnalato: « quando sei in session e disattivi il METER e/o il MUSE e
   *  non hai più strumenti connessi, il bottone NO INSTRUMENT deve attivarsi, invece non lo
   *  fa ». Vero — il verso "attivo UNO strumento → esco dal gruppo di controllo" esisteva già
   *  (`onClick` della pillola, più giù), il verso OPPOSTO no: disconnettere l'ULTIMO strumento
   *  rimasto lasciava `senzaStrumenti` fermo a `false`, senza che nulla lo rimettesse a posto —
   *  un ago che smette di leggere senza che l'interfaccia lo dica. `disconnected` per il MUSE
   *  (non `'searching'`: un tentativo in corso non è ancora un "niente", non deve attivare il
   *  gruppo di controllo sotto i piedi di chi sta provando a riconnettersi). Solo `aperta`: fuori
   *  seduta la scelta si fa nel pannello dedicato, non da un effetto silenzioso.
   *  ⚠️ BUG TROVATO DI NUOVO — segnalato: « quando scelgo SENZA STRUMENTI e poi scelgo METER,
   *  senza strumenti non si deseleziona ». La stessa cura data al MUSE (escludere `'searching'`)
   *  mancava per il METER: cliccare la pillola METER chiama `setSenzaStrumenti(false)` PRIMA di
   *  `theta.connect()` (v. più giù), ma questo effetto girava sulla `meterC` (vero SOLO a
   *  connessione riuscita, mai durante il tentativo) — nella finestra fra il clic e la
   *  connessione vera (`theta.status === 'connecting'`), `meterC` è ancora `false`: la
   *  condizione tornava vera e questo effetto rimetteva `senzaStrumenti` a `true` un istante
   *  dopo che l'utente l'aveva appena spento, prima ancora che il METER avesse il tempo di
   *  collegarsi — la pillola SENZA STRUMENTI restava accesa per sempre, la connessione la
   *  trovava già "vinta". Aggiunto `theta.status !== 'connecting'`, lo stesso trattamento del
   *  MUSE: un tentativo del METER in corso non è ancora un "niente" nemmeno lui. */
  useEffect(() => {
    if (aperta && !senzaStrumenti && muse.museConnection === 'disconnected' && !meterC && theta.status !== 'connecting') {
      setSenzaStrumenti(true);
    }
  }, [aperta, senzaStrumenti, muse.museConnection, meterC, theta.status]);
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
    // ⚠️ `as any` tolto (verifica del codice): `useMuseContactGate`'s `addLog` vuole
    // esattamente `Omit<LogEntry, 'time'> & { time?: number }` — lo stesso tipo di
    // `journal.addLog` (stesso `LogEntry`, importato dallo stesso `components/TranscriptLog`).
    // Un cast per zittire un disallineamento che non c'era: la funzione passa diretta.
    timeRef, addLog: journal.addLog,
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
    // ⚠️ CORRETTO (analisi del codice, richiesta esplicita di sistemare tutto): questa riga
    // scriveva SEMPRE "(NULL)" quando non c'era reazione — anche quando la ragione vera era
    // "nessuno strumento connesso" (`scelta === undefined`), un caso ben diverso da "l'ago ha
    // guardato e non ha reagito" (`scelta === 'NULL'`). Il pannello (`ZonaAssessment`)
    // distingueva già i due casi (`READ_NON_MISURATO` → "non misurato" vs `'NULL'` →
    // "nessuna reazione"); il Giornale no. Stessa distinzione qui.
    const etichettaEsito = scelta === undefined
      ? LC('non misurato', 'non mesuré', 'not measured', 'no medido', 'inte mätt')
      : scelta === 'NULL'
        ? LC('nessuna reazione (NULL)', 'aucune réaction (NULL)', 'no reaction (NULL)',
             'sin reacción (NULL)', 'ingen reaktion (NULL)')
        : scelta;
    journal.addLog({ speaker: 'NEEDLE', time: tSec,
      text: `◎ R&I · ${testo} → ${etichettaEsito}`,
      type: scelta && scelta !== 'NULL' ? 'success' : 'normal' });
    // ⚠️ BUG TROVATO — segnalato: « in tone l'item ne s'inscrit pas alors qu'il apparaît dans
    // ASSESSMENT ». Un item dato con R&I · Manuel non passa MAI per `journal.logs` con
    // `speaker:'Aud'` — scrive solo in ASSESSMENT (sopra) e una riga di sistema
    // (`speaker:'NEEDLE'`, appena sopra): i tre `useEffect` che aspettano l'item di CONTACT/
    // MIRROR/TONE (poco più su in questo stesso file) guardano SOLO `journal.logs` con
    // `speaker==='Aud'` — non lo vedono mai, qualunque ciclo sia armato e in attesa. La
    // segnalazione parlava di TONE, ma la stessa causa vale per tutti e tre: notificato qui,
    // direttamente, lo stesso gesto di quegli effetti.
    if (cycles.cycleAwaitItemRef.current && cycles.cycleArmedRef.current) {
      cycles.cycleAwaitItemRef.current = false;
      cycles.itemDettato(testo);
    } else if (mirror.mirrorAwaitItemRef.current && mirror.mirrorArmedRef.current) {
      mirror.mirrorAwaitItemRef.current = false;
      mirror.itemDettato(testo);
    } else if (tone.toneAwaitItemRef.current) {
      tone.toneAwaitItemRef.current = false;
      setItem(testo);
    } else if (truth.truthAwaitItemRef.current) {
      truth.truthAwaitItemRef.current = false;
      setItem(testo);
    } else if (!cycles.cycleArmed && !mirror.mirrorArmed && !toneAttivo && truth.truthPhase === 'idle' && !item.trim()) {
      // ⚠️ BUG TROVATO — segnalato: « dans TONE parfois l'item n'est pas inscrit dans le cycle
      // et il ne démarre pas, même si on l'écrit ; mais si on annule et on redémarre... ça
      // marche ». Riprodotto dal vivo: scrivere la resistenza QUI (R&I · Manuel) PRIMA di
      // armare un ciclo cadeva in NESSUNO dei quattro rami sopra (nessun *AwaitItemRef è
      // ancora acceso — non si è ancora cliccato un cerchio) — restava solo nell'assessment,
      // MAI scritto in `item`. Il ciclo armato subito dopo trovava il campo vuoto, entrava in
      // attesa (`awaitItemRef = true`), e restava bloccato per sempre: R&I · Manuel non scrive
      // MAI un `speaker:'Aud'` (v. sopra), quindi l'effetto che aspetta non lo vede né prima né
      // dopo — nessun riarmo lo avrebbe risolto da solo (a differenza della voce, che quello sì
      // lo scrive). Scrivere QUI, subito, nel campo condiviso: qualunque cerchio si clicchi
      // dopo lo trova già pieno, esattamente come se fosse stato scritto nel suo campo proprio.
      //
      // ⚠️ SOLO A CICLO LIBERO E CAMPO VUOTO — non un `else` incondizionato: R&I · Manuel resta
      // scrivibile PER TUTTA la seduta (v. la nota grande più sopra, « sempre scrivibili »),
      // anche a metà di un ciclo già oltre il suo tempo "dai l'item" (MOCK-UP, RAISE...). In
      // quel caso `item` è già l'item DI QUEL CICLO — sovrascriverlo con un'osservazione
      // successiva lo scambierebbe con una resistenza diversa a metà lavorazione. La condizione
      // qui riproduce ESATTAMENTE il caso segnalato (nessun metodo ancora armato) e nessun altro.
      setItem(testo);
    }
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
  // ⚠️ Codice morto tolto (verifica del codice, richiesta esplicita): il VALORE non era mai
  // letto in questo file — solo `setIsHoldMode` serve, passato al motore condiviso più sotto.
  // Il motore continua a scriverlo esattamente come prima (stesso calcolo, stesso stato);
  // qui si tiene solo il pezzo che questo file usa davvero.
  const [, setIsHoldMode] = useState(false);
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
  /** Il valore vero si scrive più sotto, appena `mode` è calcolato (v. lì): qui resta solo la
   *  dichiarazione, perché il motore (`useChargeEngine`) la legge da subito. ⚠️ Per un pezzo di
   *  vita di SERENITY questo ref è rimasto fermo su 'needle' per sempre — MIRROR e TONE erano
   *  stati costruiti ma nessuno lo risincronizzava più, quindi il worker EEG (`viewModeRef.current
   *  === 'mirror'`, in `useChargeEngine.ts`) non chiamava MAI `trackMirrorRef`/`trackToneRef`:
   *  il valore restava per sempre manuale. Segnalato: « In MIrror il valore non vien mai
   *  indicato in automatico ». */
  const viewModeRef = useRef<'needle' | 'needle_pure' | 'mirror' | 'tone' | 'truth'>('needle');
  const instrumentsRef = useRef({ muse: false, theta: false });
  useEffect(() => { instrumentsRef.current = { muse: muse.museConnection === 'connected', theta: meterC }; });
  /** Nessuno slider di sensibilità in SERENITY ancora — lo stesso valore di default di
   *  App.tsx (nessun binding UI neanche là: "1.0 = default"). */
  const sensitivityRef = useRef(1.0);

  /** I gestori vengono assegnati più sotto (`trackMirrorRef.current = mirror.trackMirror`,
   *  ecc.) DOPO che i rispettivi hook esistono — il ref serve già ORA perché
   *  `useChargeEngine` (anche lui sotto) lo riceve una volta sola. */
  const trackMirrorRef = useRef<(q: number, nowSec: number, pushUi: boolean) => void>(() => {});
  const trackToneRef = useRef<(q: number, nowSec: number) => void>(() => {});
  const trackTruthRef = useRef<(q: number, nowSec: number, hasInstrument: boolean, fnNow: boolean, pushUi: boolean) => void>(() => {});
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
  /** ── OBIETTIVO / STATO FISICO / R-FACTOR — segnalato: « mancano l'obiettivo, il R-Factor
   *  ecc. all'inizio seduta ». Verificato App.tsx: quattro campi di testo libero (Objectif/
   *  Processus/État physique/R-Factor), sempre scrivibili durante tutta la seduta aperta.
   *  ⚠️ IL CAMPO "PROCESSO" TOLTO — segnalato: « toglilo, è ridondante col nuovo Comandi
   *  Procedimenti ». Diversa da App.tsx per scelta esplicita dell'utente, non un'omissione:
   *  App.tsx non ha PROCESSUS→PROCEDIMENTI (un elenco di comandi VERI da scegliere), quindi lì
   *  quel campo di testo libero è l'UNICO modo di dire quale processo gira; qui, con la scelta
   *  di un procedimento vero già disponibile (v. il bottone accanto a EP, sotto), scrivere lo
   *  stesso nome a mano in un campo separato è la stessa informazione due volte. Restano
   *  `sessionObjective`/`sessionPhysicalCheck`/`sessionBriefing` — nessuna logica dietro, solo
   *  testo che accompagna il rapporto — tradotte con `LC`, coerente con tutto il resto di
   *  SERENITY (le etichette di App.tsx sono fisse in francese, mai passate per `t()`). */
  const [sessionObjective, setSessionObjective] = useState('');
  const [sessionPhysicalCheck, setSessionPhysicalCheck] = useState('');
  const [sessionBriefing, setSessionBriefing] = useState('');
  /** ── SPARISCONO DOPO 10 SECONDI, SE RIEMPITI — segnalato: « per liberare l'interfaccia ».
   *  I tre campi sopra contano una volta scritti (di solito all'inizio seduta) — tenerli
   *  sempre in vista per tutta la seduta, quando ormai dicono cose già dette, è ingombro senza
   *  motivo. Non spariscono MAI se sono vuoti (niente da nascondere): il conto alla rovescia
   *  parte solo quando ALMENO uno dei tre ha del testo, si riazzera a ogni tocco (scrivere
   *  ancora rimanda la sparizione, non la accorcia) — `useEffect` su
   *  `[sessionObjective, sessionPhysicalCheck, sessionBriefing]`, un `setTimeout` unico.
   *  `campiSessioneNascosti` non è per sempre: una piccola maniglia (sotto, nella resa) li
   *  riporta in vista, esattamente come il "chiuso" di `PistaCiclo`. */
  const [campiSessioneNascosti, setCampiSessioneNascosti] = useState(false);
  useEffect(() => {
    if (!aperta) return;
    if (!sessionObjective && !sessionPhysicalCheck && !sessionBriefing) return;
    const id = setTimeout(() => setCampiSessioneNascosti(true), 10000);
    return () => clearTimeout(id);
  }, [aperta, sessionObjective, sessionPhysicalCheck, sessionBriefing]);
  /**
   * « L'ITEM È STATO DETTO » — l'uscita a mano dalla fase « dì l'item », quando la trascrizione
   * non c'è (Whisper assente, microfono negato, seduta senza dettatura). Vale come l'item
   * scritto — `itemNamed` (sotto) è l'uno O l'altro — esattamente come in App.tsx
   * (`itemSpoken`/`dichiaraItemDetto`), non una variante nuova.
   */
  const [itemSpoken, setItemSpoken] = useState(false);
  /** ── SCRIVERE L'ITEM NON DEVE FAR AVANZARE AL PRIMO TASTO — segnalato: « in tutti i cicli
   *  quando cominci a scrivere l'item, alla prima lettera passa già al punto seguente. Deve
   *  aspettare la fine della scritta ». La causa: `itemNamed` (sotto) leggeva `!!item.trim()`
   *  — vero già al PRIMO carattere digitato, perché `item` è LO STESSO stato che l'`<input>`
   *  di `PistaCiclo` scrive a ogni tasto (`onChange`). Per la voce va bene così: una
   *  trascrizione arriva SEMPRE intera (mai un carattere alla volta) — è SOLO la digitazione
   *  manuale ad aver bisogno di un "non ancora, sto ancora scrivendo".
   *  `itemDigitando`: vero DALLA prima battuta manuale, falso appena `item` si svuota (nuovo
   *  ciclo/nuova resistenza — v. l'effetto sotto) o appena l'auditor CONFERMA (Invio, che
   *  chiama `dichiaraItemDetto` sotto — la stessa via già cablata in `PistaCiclo`, mai
   *  toccata). La voce non lo tocca MAI: `cycles.itemDettato`/`mirror.itemDettato`/il
   *  `setItem` di TONE scrivono `item` direttamente, non passano da qui — restano quindi
   *  "non digitando", cioè immediatamente validi, come sempre. */
  const [itemDigitando, setItemDigitando] = useState(false);
  /**
   * ⚠️ BUG TROVATO — segnalato: « dans TRUTH parfois ça avance d'une step et ça revient en
   * arrière ». `itemNamed` (sotto) è ricalcolato AD OGNI RENDER da `item`/`itemDigitando`/
   * `itemSpoken` — nessuna memoria di "è già stato dato una volta". `sessionPhase.ts`
   * (`deriveCyclePhase`) legge `!itemNamed` per decidere se mostrare "*.say_item"/"say_ri",
   * INCONDIZIONATAMENTE, qualunque sia il vero stato del ciclo (`truthPhase`/`tonePhase`/
   * `nullPhase`/`mirrorLocked` possono essere già ben oltre). Se il R/I (o l'item) viene
   * TOCCATO di nuovo più tardi nello stesso ciclo — una correzione, un refresh dell'`<input>`
   * che rialza `itemDigitando` — `itemNamed` torna falso PER UN ISTANTE, e la schermata
   * retrocede a "dì l'item"/"dì il R/I" anche se il motore è già a "questioning" o oltre: un
   * passo avanti (il motore c'è già stato) che sembra un passo indietro (lo schermo torna a
   * chiederlo). Riproducibile in teoria per tutti e cinque i cicli, segnalato per TRUTH (dove
   * il R/I resta a schermo — e quindi toccabile — per tutta la durata del ciclo, a differenza
   * degli altri quattro dove l'item si scrive una volta sola all'inizio).
   * La cura: una volta che `itemNamed` grezzo È STATO vero una volta in QUESTO ciclo, resta
   * vero — non ridiventa mai falso finché il campo non si svuota per davvero (nuovo ciclo/
   * nuova resistenza, la STESSA condizione che già azzera `itemDigitando` qui sotto). Una
   * "conferma" non si ritira perché l'auditor ha ritoccato il testo.
   */
  const itemConfirmedRef = useRef(false);
  useEffect(() => { if (!item.trim()) { setItemDigitando(false); itemConfirmedRef.current = false; } }, [item]);
  const setItemManuale = (v: string) => { setItemDigitando(true); setItem(v); };
  /**
   * ⚠️ BUG TROVATO — segnalato: « dans TONE parfois l'item n'est pas inscrit dans le cycle et
   * il ne démarre pas, même si on l'écrit ; mais si on annule et on redémarre... ça marche ».
   * Causa vera, e vale per TUTTI E CINQUE i cicli (non solo TONE — `itemNamed`, sopra, è la
   * STESSA guardia condivisa da `sessionPhase.ts` per contact/null/mirror/tone/truth):
   * scrivere l'item A MANO alza `itemDigitando` (giusto: non far avanzare il ciclo al primo
   * carattere), ma finché non si preme Invio (`dichiaraItemDetto`, sotto) o non si svuota il
   * campo, resta `true` — PER SEMPRE, anche dopo aver cliccato il cerchio del ciclo. Il ciclo
   * si ARMA comunque (i motori dei cinque cicli guardano `d.auditingQuestion.trim()` diretto,
   * non `itemNamed`), ma la SCHERMATA resta bloccata sul tempo "1 · DAI L'ITEM"/"say_item"
   * (`sessionPhase.ts`, `!s.itemNamed → '*.say_item'`) — sembra che l'item non sia mai stato
   * dato e il ciclo non sia mai partito, anche se dietro le quinte lo È.
   * Perché soprattutto TONE: da quando arma in un click solo (v. la nota sul cerchio TONE, più
   * giù), scrivere l'item PRIMA di cliccare — invece di cliccare, poi scrivere, poi Invio — è
   * il gesto più naturale, e proprio quello che salta l'Invio.
   * Perché « annule et redémarre » lo sistema: ANNULLA svuota il campo (`setAuditingQuestion
   * ('')` in ciascun `resetX`), l'effetto qui sopra vede `!item.trim()` e rimette
   * `itemDigitando` a `false` — la volta dopo (con l'item riscritto, o rimasto uguale) la
   * guardia è già spenta.
   * La cura, qui: cliccare un cerchio per armare un ciclo È un Invio implicito — se il campo
   * ha già del testo, si conta come confermato nello stesso gesto, invece di aspettare un
   * tasto che l'auditor non ha ragione di pensare necessario.
   */
  const confermaItemSePresente = () => { if (item.trim()) setItemDigitando(false); };
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
    trackCycleRef, trackMirrorRef, trackToneRef, trackTruthRef, cycleArmedRef: cycles.cycleArmedRef,
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
  /** ── LA VISTA SENZA AGO — chiesto direttamente: « una vista in più... con bottone slide per
   *  scegliere, come per LIGHT DARK, in cui non mostri l'ago né l'arco, ma solo i colori di
   *  CONTACT, DISSOLUTION, AS-IS e la velocità di liberazione ». SOLO SERENITY (App.tsx non ha
   *  questa scelta) — persistita come il tema/la lingua (`localStorage`, la STESSA chiave di
   *  cui `Serenity.tsx` è già proprietario, non condivisa con `equilibrium_ago`/il tema veri,
   *  che restano dell'archivio unico: questa è una preferenza di RESA, non un dato clinico).
   *  V. `VistaSenzaAgo.tsx` per il componente, e più giù (« L'ARCO DEI CICLI ») per dove
   *  prende il posto di `QuantumSphere`+`ClearDial`. */
  const [vistaSenzaAgo, setVistaSenzaAgo] = useState<boolean>(() => {
    try { return localStorage.getItem('serenity_vista_senza_ago') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('serenity_vista_senza_ago', vistaSenzaAgo ? '1' : '0'); } catch { /* noop */ }
  }, [vistaSenzaAgo]);
  /** ── LO SQUEEZE TEST VUOLE L'AGO — segnalato: « quando si inizia una session se il
   *  selettore è su SENZA AGO il test dello squeeze resta disponibile ma non si vede l'ago,
   *  devi portare il selettore automaticamente su CON AGO ». `vistaSenzaAgo` persiste da una
   *  seduta all'altra (sopra) — se l'ultima scelta era "senza ago", `ThetaReadyCheck` (la
   *  stretta delle boîtes, montato quando `metabolicOpen && meterC && !thetaReadyDone` — v. la
   *  IIFE del render) resta comunque raggiungibile, ma l'ago che deve muoversi di un terzo di
   *  quadrante è nascosto dietro `VistaSenzaAgo`. UN COLPO SOLO quando quello schermo si apre,
   *  non un blocco permanente: l'auditor resta libero di tornare a "senza ago" a test finito
   *  (o anche durante, se preferisce — questo effetto non lo rimette a posto una seconda
   *  volta finché le sue dipendenze non cambiano di nuovo). */
  useEffect(() => {
    if (metabolicOpen && meterC && !thetaReadyDone) setVistaSenzaAgo(false);
  }, [metabolicOpen, meterC, thetaReadyDone]);
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
  /** ── NEEDLE LIGHT — segnalato: « manca la possibilità di mettere/togliere la scia ». App.tsx
   *  ha ESATTAMENTE questa levetta (`showTrailPref`, default `true`): « AGO/AGO+ non era un
   *  metodo: era la scia, ed è diventata una levetta a parte ». Mai portata qui — `showTrail`
   *  su `<QuantumSphere>` restava fissa a `true` (v. sotto), l'auditor non poteva spegnerla.
   *  Stesso nome di stato, stesso default. */
  const [showTrailPref, setShowTrailPref] = useState(true);
  /** ── L'ANIMAZIONE INIZIALE — segnalato: « metti anche l'animazione iniziale con SERENITY
   *  come nome ». `SplashScreen` (condiviso) non era MAI montato qui — SERENITY si apriva
   *  direttamente sulla prima domanda, senza l'animazione che App.tsx mostra sempre all'avvio.
   *  Stesso stato di App.tsx (`showSplash`, default `true`), montato più sotto con
   *  `appName="SERENITY"` (v. la nota in `SplashScreen.tsx`). */
  const [showSplash, setShowSplash] = useState(true);
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
   *
   * ⚠️ TERZO CASO, SEGNALATO DI SEGUITO: « quando si fa il test del MUSE resta selezionato il
   * METER e non si vede cosa si fa col MUSE ». `MetabolicCheck` (il respiro guidato, v.
   * `metabolicOpen` sopra) è ESPLICITAMENTE il test DEL MUSE — se in questa stessa seduta il
   * METER è già stato provato prima (`ThetaReadyCheck`, la stretta con le lattine) e
   * `agoScelto` è rimasto sul Meter (la preferenza persiste da una seduta all'altra), lo
   * schermo del respiro mostrava l'ago SBAGLIATO: quello che reagisce a una stretta di
   * lattine che nessuno sta facendo, non quello che il test sta davvero misurando. Stessa
   * famiglia degli altri due casi (un contesto preciso impone il proprio strumento, la
   * preferenza generale non conta più lì dentro) — durante `metabolicOpen`, l'ago è quello del
   * MUSE, punto: non serve nemmeno `museOk` a guardia (se il MUSE non è ancora connesso,
   * `MetabolicCheck` mostra la sua attesa, non il quadrante — mostrare qui l'EEG "spento"
   * invece del Meter "acceso" da una prova precedente resta comunque la lettura onesta di cosa
   * questo schermo sta chiedendo).
   *
   * ⚠️ BUG TROVATO — segnalato: « quando faccio la prova dello squeeze l'ago si freeze ».
   * `metabolicOpen` non copre SOLO `MetabolicCheck` (il test del MUSE): la STESSA variabile
   * apre ANCHE `ThetaReadyCheck` (la stretta/il respiro delle boîtes — v. il render,
   * `{metabolicOpen && (() => { if (meterC && !thetaReadyDone) return <ThetaReadyCheck/>; ...
   * return <MetabolicCheck/>; })()}`), che gira PRIMA quando il meter è collegato. Forzare
   * `agoEeg=true` su TUTTO `metabolicOpen` costringeva l'ago EEG anche durante la stretta
   * delle lattine — uno strumento che durante quella prova non riceve nulla, quindi resta
   * fermo dov'era: non un vero "freeze" del motore, l'ago giusto (quello del Meter, che infatti
   * SI muove — `theta.testPeakOffset` lo dimostra) semplicemente non era quello disegnato.
   * `inThetaReadyCheck`, sotto, è la STESSA condizione che decide quale dei due componenti
   * montare — quando è lei a girare, l'ago resta quello del Meter; il forzato EEG scatta solo
   * per l'ALTRA metà di `metabolicOpen`, il test del MUSE vero e proprio.
   *
   * ⚠️ BUG TROVATO DI NUOVO — segnalato: « inizio session, test squeeze e non appare l'ago
   * del meter ». Il fix precedente FALLIVA quando ANCHE il MUSE risultava connesso: fuori da
   * `metabolicOpen && !inThetaReadyCheck`, il calcolo cadeva nella regola generale
   * (`museOk && meterC ? agoScelto === 'eeg' : ...`) — se `agoScelto` (la preferenza
   * PERSISTITA da una seduta precedente) valeva 'eeg', l'ago tornava quello del MUSE anche
   * durante lo squeeze test, esattamente come prima di quel fix. `inThetaReadyCheck` deve
   * FORZARE il Meter, non solo "non forzare l'EEG" — un ramo dedicato, prima di tutti gli
   * altri, invece di lasciarlo ricadere nella priorità generale. */
  const cicloEegInCorso = cycles.cycleArmed || mirror.mirrorArmed;
  const inThetaReadyCheck = metabolicOpen && meterC && !thetaReadyDone;
  const agoEeg = toneAttivo ? false
    : inThetaReadyCheck ? false
    : metabolicOpen ? true
    : cicloEegInCorso ? museOk
    : museOk && meterC ? agoScelto === 'eeg'
    : museOk;
  // Lo specchio in ref per l'ASSESSMENT (sopra) — legge questo valore dentro un `setTimeout`,
  // dove un ref (sempre aggiornato) è corretto, uno stato catturato al momento dell'item no.
  useEffect(() => { agoEegRef.current = agoEeg; }, [agoEeg]);

  // I profili vengono dallo stesso armadio di EQUILIBRIUM — è la verifica di questa fase.
  // ⚠️ Ottimizzazione (verifica del codice, richiesta esplicita — stesso risultato, non un
  // calcolo diverso): `getProfiles()`/`getPcProfiles()` rileggono e ri-analizzano (JSON.parse)
  // l'intero armadio da `localStorage` a OGNI chiamata — qui sotto e più giù (riga ~3030,
  // `HistoryModal`) venivano richiamate PIÙ VOLTE nello STESSO render per lo stesso identico
  // armadio. Lette una volta sola qui, riusate dove prima si rileggevano da capo — nello
  // stesso render, sincrono, `localStorage` non può essere cambiato nel frattempo: stesso
  // identico risultato, una lettura invece di tre. (La lettura dentro il gestore di chiusura
  // seduta, molto più giù, resta SUA: lì la freschezza al momento dell'evento conta davvero,
  // non va confusa con questa.)
  const profiliAuditor = (() => { try { return getProfiles(); } catch { return []; } })();
  const profiliPreclear = (() => { try { return getPcProfiles(); } catch { return []; } })();
  const nome = (lista: Array<{ id: string; name: string }>, id: string | null | undefined) =>
    id === 'nuovo' ? 'nuovo' : (lista.find(p => p.id === id)?.name ?? '—');
  const nomeAuditor = nome(profiliAuditor, avvio?.auditorId);
  const nomePreclear = nome(profiliPreclear, avvio?.pcId);
  /** IL SESSO DEL PRECLEAR — decide il TA di clear (tono 40 di QUESTA persona), come in
   *  App.tsx (`useProfileStore.pcSex`). In SOLO l'auditor È il preclear: il campo vive sul
   *  suo stesso profilo (`PcProfile`/`UserProfile` condividono `sex?: 'm'|'f'` apposta). */
  const pcSex: 'm' | 'f' | undefined = avvio?.solo
    ? profiliAuditor.find(p => p.id === avvio.auditorId)?.sex
    : profiliPreclear.find(p => p.id === avvio?.pcId)?.sex;

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
   * ── E IL CICLO TRUTH, ALLO STESSO MODO — v. docs/truth-cycle-proposal.md ────────────────
   * `qL`/F/N non sono nei suoi deps (v. la nota su `TruthCycleDeps`): arrivano come parametri
   * diretti di `trackTruth`, alimentato dal worker EEG via `trackTruthRef` più sopra.
   */
  const truth = useTruthCycle({
    auditingQuestion: item, setAuditingQuestion: setItem,
    setItemSpoken,
    nowSec: () => sessionClock.now(),
    logLength: () => journal.logs.length,
    log: (text, type) => journal.addLog({ speaker: 'SYS', text, time: sessionClock.now(), type }),
    ensureAssessmentOn: attivaAssessment,
    LC,
  });
  trackTruthRef.current = truth.trackTruth;

  /**
   * ── IL METODO IN CORSO, IN UN VALORE SOLO ────────────────────────────────────────────────
   * `engine/sessionMode.ts` — lo stesso tipo che App.tsx usa per `mode`. Qui non c'è un
   * selettore persistente: si RICAVA da quale dei cinque è armato/attivo (la stessa
   * esclusività reciproca già scritta nei bottoni del piede di pagina), invece di tenerne una
   * seconda copia in uno state a parte. TRUTH non ha un `xAttivo` a sé come TONE: la sua
   * stessa FSM (`truthPhase !== 'idle'`) è già quel segnale, non serve una seconda variabile
   * che potrebbe disallinearsi da lei.
   */
  const mode: SessionMode = toneAttivo ? 'tone'
    : truth.truthPhase !== 'idle' ? 'truth'
    : mirror.mirrorArmed ? 'mirror'
    : cycles.cycleArmed ? (cycles.cycleKind === 'null' ? 'null' : 'contact')
    : 'free';
  /** Stessa derivazione di App.tsx (`viewMode`, righe 259-263 di App.tsx) — il worker EEG deve
   *  sapere se siamo in MIRROR/TONE/TRUTH per alimentare `trackMirrorRef`/`trackToneRef`/
   *  `trackTruthRef`, non solo l'ago. V. la nota sul ref più sopra: prima di questa riga
   *  restava sempre 'needle'. */
  viewModeRef.current = mode === 'mirror' ? 'mirror' : mode === 'tone' ? 'tone' : mode === 'truth' ? 'truth'
    : showTrailPref ? 'needle' : 'needle_pure';
  /** ── MODALITÀ CICLO — segnalato: « quando si comincia un ciclo mi piacerebbe che sparisse
   *  tutto quello non necessario e che alla fine riapparisse ». Confermato dopo una proposta
   *  scritta (cosa sparisce, cosa resta, e perché): scatta SOLO a ciclo armato/in corso — non
   *  dall'apertura della seduta, che resta piena finché l'auditor sta ancora scegliendo. Zero
   *  stato nuovo: `mode` (sopra) già distingue `'free'` da tutto il resto — la STESSA
   *  condizione che già nasconde/mostra i cinque cerchi dei metodi, ora estesa alla barra
   *  amministrativa in alto. */
  const modalitaCiclo = mode !== 'free';
  /** ── SENZA STRUMENTI, L'ARCO SPARISCE — segnalato: « quando non ci sono strumenti attivi,
   *  l'arco deve sparire e le scritte dei cicli devono farsi al posto dell'arco, COME IN
   *  EQUILIBRIUM ». Verificato App.tsx: `senzaMisura` (la STESSA funzione pura condivisa,
   *  `noInstruments({muse,theta})` — non un'invenzione qui) decide, a seduta in corso, se
   *  montare `<QuantumSphere>` o un blocco di testo grande al suo posto (« PRIMA DELLO START
   *  non c'è niente da dire », la sua nota). Stessa condizione qui, con `museOk`/`meterC` al
   *  posto di `instruments.muse`/`instruments.theta`. */
  const senzaMisura = noInstruments({ muse: museOk, theta: meterC });
  /** ── L'ASSESSMENT SI ARMA E SI DISARMA CON IL CICLO — segnalato: « l'assessment sembra
   *  sempre attivo, anche quando è chiuso... nel report abbiamo degli assessment lunghissimi
   *  che in realtà non lo sono. DEVE ESSERE ATTIVATO al momento dell'armamento del ciclo, ed
   *  alla fine poi disattivato ». Vero: `assessAttivo` era un interruttore SOLO manuale — se
   *  restava acceso da una seduta precedente (o da una prova fatta molto prima), gli item
   *  raccolti nel frattempo finivano nello stesso "assessment" di quello vero, allungandolo nel
   *  rapporto. Ora si accende da sé quando `mode` esce da `'free'` (un ciclo si arma) e si
   *  spegne da sé quando ci rientra (il ciclo finisce) — SOLO alle transizioni (`[mode]` come
   *  unica dipendenza): mentre un ciclo resta armato, `mode` non cambia, quindi l'auditor può
   *  ancora spegnerla/riaccenderla a mano in qualunque momento (segnalato insieme: « si deve
   *  poter armare l'assessment quando l'auditor lo ritiene opportuno ») senza che questo
   *  effetto la rimetta a posto sotto di lui. */
  useEffect(() => {
    setAssessAttivo(mode !== 'free');
  }, [mode]);

  /** ── LE CAMERE, TOLTO IL LEGAME CON LA MODALITÀ CICLO — il giro scorso le rendeva piccole
   *  fuori da un ciclo e le spostava, grandi, nella striscia dell'intestazione durante un
   *  ciclo. Segnalato: « così non mi piacciono, perché si destabilizza l'auditor che deve
   *  cambiare logica di sguardo. Lascia le camm al loro posto a destra, semplicemente le
   *  ingrandisci ». Il POSTO conta più della taglia: un auditor che sa sempre dove guardare
   *  batte una camera più grande in un posto che si sposta. Tolto l'effetto che le legava a
   *  `modalitaCiclo` — restano dove sono sempre state (l'angolo sopra il quadrante, v. più
   *  giù), taglia fissa e più grande di prima (v. `CameraCerchio` più giù). L'auditor può
   *  ancora comprimerle/espanderle a mano col bottone di ciascun cerchio — quello resta. */

  /**
   * ── LA FASE DEL CICLO, LA STESSA SCALA DI App.tsx ────────────────────────────────────────
   * `engine/sessionPhase.ts` (`deriveCyclePhase`) — puro TS, già condiviso, mai importato qui
   * prima. Dà per esempio `contact.say_item` (armato ma l'item non è ancora stato dato) da
   * `null.equilibrium` (traguardo raggiunto): è la base per il badge del ciclo e per l'avviso
   * « dì l'item… » qui sotto — invece di ricomporre la stessa risposta da quattro booleani.
   */
  // ⚠️ STICKY — v. la nota grande su `itemConfirmedRef`, sopra: una volta vero in QUESTO
  // ciclo, `itemNamed` non deve più tornare falso solo perché il campo è ritoccato più tardi.
  const itemNamedGrezzo = (!!item.trim() && !itemDigitando) || itemSpoken;
  if (itemNamedGrezzo) itemConfirmedRef.current = true;
  const itemNamed = itemConfirmedRef.current || itemNamedGrezzo;
  const faseCiclo = useMemo(() => deriveCyclePhase({
    splashOpen: showSplash, sessionState: aperta ? 'running' : 'idle',
    hasInstrument: muse.museConnection === 'connected' || meterC,
    preflightOpen: false, epWindowOpen: ep.epWindowOpen, reportOpen: false,
    mode, cycleArmed: cycles.cycleArmed, asIsPending: cycles.asIsPending, nullPhase: cycles.nullPhase,
    // ⚠️ `!itemDigitando`, non solo `!!item.trim()` — v. la nota su `itemDigitando`, sopra:
    // senza, il ciclo avanzava al PRIMO carattere digitato, prima che l'auditor avesse finito
    // di scrivere.
    itemNamed,
    mirrorArmed: mirror.mirrorArmed, mirrorLocked: mirror.mirrorDisp.locked, mirrorReached: mirror.mirrorDisp.reached,
    tonePhase: tone.tonePhase, truthPhase: truth.truthPhase,
  }), [showSplash, aperta, muse.museConnection, meterC, ep.epWindowOpen, mode, cycles.cycleArmed, cycles.asIsPending,
       cycles.nullPhase, item, itemDigitando, itemSpoken, mirror.mirrorArmed, mirror.mirrorDisp.locked, mirror.mirrorDisp.reached,
       tone.tonePhase, truth.truthPhase]);

  const chargePhaseNow = useMetric(m => m.chargePhase);

  /** ── SI DISATTIVA ANCHE PASSANDO ALLA STEP SUCCESSIVA — segnalato: « quando si arma un
   *  ciclo, l'assessment si arma, ma passando alla step successiva deve disattivarsi, poiché
   *  quello che si dice non è più un assessment ». L'effetto sopra (`[mode]`) la accende/
   *  spegne solo alle DUE estremità del ciclo (armato/libero) — dentro lo stesso ciclo, `mode`
   *  non cambia mai, quindi restava accesa per tutti i tempi successivi (MOCK-UP, AS-IS,
   *  RAISE...) anche se quel che si dice lì non è più l'item da valutare. `faseCiclo`
   *  distingue i tempi "si sta ancora dando l'item" (`*.item`/`*.say_item`) dagli altri —
   *  appena si esce da quei due, se un ciclo è ancora armato, l'assessment si spegne da sé.
   *  Resta comunque riaccendibile a mano in qualunque momento (nessuna guardia tolta): un
   *  nuovo tempo la spegne di nuovo solo se e quando IL TEMPO STESSO cambia ancora, non
   *  subito dopo un tocco manuale. */
  useEffect(() => {
    // ⚠️ BUG TROVATO — segnalato: « il faut activer l'assessment, car on doit trouver un
    // R&I ». `truth.locateRI()` accende l'assessment (`ensureAssessmentOn`), ma QUESTO
    // stesso effetto la spegneva nello stesso istante: le fasi di TRUTH si chiamano
    // `truth.ri`/`truth.say_ri` (il R/I, non un "item" come negli altri quattro cicli — v.
    // `sessionPhase.ts`), quindi `inFaseItem` non le riconosceva mai come "si sta ancora
    // dando l'item", e la spegneva subito dopo averla accesa. Per TRUTH è anche PIÙ vero che
    // per gli altri: localizzare il R/I (« locate an R/I via any process ») è di per sé una
    // ricerca — l'assessment resta accesa per tutto il tempo in cui non si è ancora chiuso
    // il R/I, non solo al primo tempo.
    const inFaseItem = faseCiclo.endsWith('.item') || faseCiclo.endsWith('.say_item')
      || faseCiclo.endsWith('.ri') || faseCiclo.endsWith('.say_ri') || faseCiclo === 'truth.questioning';
    if (mode !== 'free' && !inFaseItem) setAssessAttivo(false);
  }, [faseCiclo, mode]);

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
    if (truth.truthPhase !== 'idle') {
      // ⚠️ AGGIUNTO — segnalato: « in TRUTH devi far vedere in più grande dove siamo nel ciclo
      // con ACCORDO, VERITA TEMPO PRESENTE ». Le STESSE tre tappe appena aggiunte all'arco
      // (`ClearDial.tsx`, `cycleKind:'truth'`, giro precedente) — qui si ripetono davanti al
      // `titolo`, che è il testo più grande a schermo (`PistaCiclo`/l'overlay "senza strumenti").
      // Non un'invenzione nuova: le stesse tre parole, le stesse tre lingue, un secondo posto
      // dove si leggono — quello che l'auditor guarda di più mentre conduce.
      // `return_present` esce prima con un `titolo` proprio (sotto): qui `tappa` serve solo
      // ai tre rami restanti, tutti "ACCORDO" (R/I non ancora chiesto) o "VERITÀ" (in corso).
      const tappa = (faseCiclo === 'truth.ri' || faseCiclo === 'truth.say_ri')
        ? LC('ACCORDO', 'ACCORD', 'AGREEMENT', 'ACUERDO', 'ÖVERENSKOMMELSE')
        : LC('VERITÀ', 'VÉRITÉ', 'TRUTH', 'VERDAD', 'SANNING');
      if (faseCiclo === 'truth.ri' || faseCiclo === 'truth.say_ri') return {
        titolo: `${tappa} · ` + LC('1 · DAI IL R/I', '1 · DONNE LE R/I', '1 · GIVE THE R/I', '1 · DA EL R/I', '1 · GE R/I'),
        // ⚠️ SEGNALATO — « Localise un ITEM avec un procédé quelconque » invece del
        // participio passato: un'ISTRUZIONE all'auditor (che fare adesso), non la
        // descrizione di uno stato già avvenuto. Stessa correzione nelle cinque lingue.
        come: LC('Localizza un ITEM con un procedimento qualunque. Scrivilo o dillo a voce, poi premi.',
                 'Localise un ITEM avec un procédé quelconque. Écris-le ou dis-le, puis appuie.',
                 'Locate an ITEM with any process. Type it or say it, then press.',
                 'Localiza un ÍTEM con cualquier procedimiento. Escríbelo o dilo, luego pulsa.',
                 'Lokalisera ett ITEM med valfri process. Skriv eller säg det, tryck sedan.') };
      if (truth.truthPhase === 'candidate') return {
        titolo: `${tappa} · ` + LC('CANDIDATO PROPOSTO', 'CANDIDAT PROPOSÉ', 'CANDIDATE PROPOSED', 'CANDIDATO PROPUESTO', 'KANDIDAT FÖRESLAGEN'),
        come: LC('Quel che sembrava una caduta potrebbe essere un accordo — la verità del PC che affiora. Conferma se lo è, altrimenti continua a chiedere.',
                 'Ce qui semblait une chute pourrait être un accord — la vérité du PC qui émerge. Confirme si c\'est le cas, sinon continue à demander.',
                 'What looked like a fall might be an agreement — the PC\'s truth surfacing. Confirm if it is, otherwise keep asking.',
                 'Lo que parecía una caída podría ser un acuerdo — la verdad del PC que aflora. Confirma si lo es, si no sigue preguntando.',
                 'Det som såg ut som ett fall kan vara en överenskommelse — PC:s sanning som stiger upp. Bekräfta om så är fallet, fortsätt annars fråga.') };
      if (faseCiclo === 'truth.return_present') return {
        titolo: LC('TEMPO PRESENTE', 'TEMPS PRÉSENT', 'PRESENT TIME', 'TIEMPO PRESENTE', 'NUTID')
          + ' · ' + LC('ULTERIORE R/I TROVATO', 'R/I SUPPLÉMENTAIRE TROUVÉ', 'FURTHER R/I FOUND', 'R/I ADICIONAL ENCONTRADO', 'YTTERLIGARE R/I HITTAT'), fatto: true,
        comando: LC('« Ritorna al tempo presente! »', '« Retourne au temps présent ! »', '« Return to present time! »', '« ¡Vuelve al tiempo presente! »', '« Återvänd till nutid! »'),
        come: LC('Chiedilo, poi chiudi il R/I.', 'Demande-le, puis clos le R/I.', 'Ask it, then close the R/I.', 'Pregúntalo, luego cierra el R/I.', 'Fråga det, stäng sedan R/I.') };
      // ri_located/questioning: si sta chiedendo, si può ripetere finché non emerge un
      // ulteriore R/I — ripetizione È il processo, come « raise this to tone forty ».
      return {
        titolo: `${tappa} · 2 · ${LC('CHIEDI', 'DEMANDE', 'ASK', 'PREGUNTA', 'FRÅGA')}`
          + (truth.truthRepeats > 0 ? ` · ×${truth.truthRepeats}` : ''),
        comando: LC('« Cos\'è la verità su questo? »', '« Qu\'y a-t-il de vrai là-dedans ? »',
                    '« What about this is the truth? »', '« ¿Qué hay de verdad en esto? »',
                    '« Vad är sanningen med det här? »'),
        come: LC('Ridallo finché non emerge un ulteriore R/I.',
                 'Redonne-le jusqu\'à ce qu\'un R/I supplémentaire émerge.',
                 'Give it again until a further R/I emerges.',
                 'Vuelve a darlo hasta que emerja un R/I adicional.',
                 'Ge det igen tills ett ytterligare R/I dyker upp.') };
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
        // ⚠️ SEGNALATO — quotata parola per parola: « la valeur 1–10 se fige d'elle-même quand
        // la lecture s'est retournée n'est pas clair ». "si è girata"/"s'est retournée" è
        // gergo del segnale (il picco superato e la lettura che ridiscende), non un'immagine
        // chiara per chi legge senza sapere come funziona il calcolo dentro. Riscritta su DUE
        // cose, non una: COSA succede in termini fisici (il picco passa, non "si gira"), E che
        // i dieci bottoni qui sotto restano una scelta valida — prima "aspetta" e dieci
        // bottoni cliccabili fianco a fianco lasciavano capire che aspettare fosse LA sola via.
        come: LC('Si blocca da sé un attimo dopo il picco della carica — oppure scegli tu il valore qui sotto.',
                 'Elle se verrouille toute seule juste après le pic de la charge — ou choisis toi-même la valeur ci-dessous.',
                 'It locks itself just after the charge peaks — or pick the value yourself below.',
                 'Se bloquea sola justo después del pico de la carga — o elige tú el valor abajo.',
                 'Den låser sig själv strax efter laddningens topp — eller välj värdet själv nedan.') };
      if (mirror.mirrorDisp.reached) return {
        titolo: LC('OTTENUTO', 'OBTENU', 'OBTAINED', 'OBTENIDO', 'UPPNÅTT'), fatto: true,
        come: LC('Lo smaltito ha raggiunto il doppio. Valida e riparti con un altro item.', 'Le déchargé a atteint le double. Valide et repars avec un autre item.', 'The discharged reached the double. Validate and go on with another item.', 'Lo descargado alcanzó el doble. Valida y sigue con otro ítem.', 'Det urladdade nådde dubbeln. Validera och fortsätt med ett annat item.') };
      return {
        titolo: `4 · ${LC('PORTA AL DOPPIO', 'MÈNE AU DOUBLE', 'TAKE IT TO THE DOUBLE', 'LLEVA AL DOBLE', 'FÖR TILL DUBBELN')} ${(2 * mirror.mirrorDisp.valueR).toFixed(1)}`,
        // ⚠️ SEGNALATO — il titolo già diceva "porta al doppio X.X", ma il corpo saltava
        // dritto alla descrizione ("Valore X.X — il metodo...") senza mai dirlo come
        // ISTRUZIONE: la step "valore" (poco sopra) resta inutile una volta qui, proprio
        // perché QUESTO tempo dovrebbe bastare da solo a dire cosa fare — stessa correzione
        // già fatta per CONTACT, poco sopra.
        come: LC(`Porta il valore al suo doppio. Valore ${mirror.mirrorDisp.valueR.toFixed(1)} — il metodo del doppio di Ron. Non fare altro: si smaltisce da sé.`,
                 `Mène la valeur à son double. Valeur ${mirror.mirrorDisp.valueR.toFixed(1)} — la méthode du double de Ron. Ne fais rien d'autre : ça se décharge tout seul.`,
                 `Take the value to its double. Value ${mirror.mirrorDisp.valueR.toFixed(1)} — Ron's doubling method. Do nothing else: it discharges by itself.`,
                 `Lleva el valor a su doble. Valor ${mirror.mirrorDisp.valueR.toFixed(1)} — el método del doble de Ron. No hagas nada más: se descarga solo.`,
                 `För värdet till sin dubbel. Värde ${mirror.mirrorDisp.valueR.toFixed(1)} — Rons dubbelmetod. Gör inget annat: det laddas ur av sig självt.`) };
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
        // ⚠️ SEGNALATO — stessa correzione già fatta per CONTACT: il titolo diceva già "chiedi
        // un mock-up", il corpo saltava dritto a una nota sul tempo senza mai scrivere
        // l'istruzione vera.
        come: LC('Chiedi un mock-up. Il tempo non è imposto: ogni preclear ha il suo. Il cronometro è solo indicativo.',
                 'Demande un mock-up. Le temps n\'est pas imposé : chaque préclair a le sien. Le chrono est indicatif.',
                 'Ask for a mock-up. The time is not imposed: each preclear has their own. The clock is only indicative.',
                 'Pide un mock-up. El tiempo no se impone: cada preclear tiene el suyo. El cronómetro es indicativo.',
                 'Be om en mock-up. Tiden är inte given: varje preclear har sin. Klockan är bara vägledande.') };
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
      // ⚠️ SEGNALATO — mancava l'istruzione VERA prima del « poi non fare altro »: il titolo
      // già diceva "chiedi un mock-up", ma la frase saltava dritta a "poi" senza mai dire
      // COSA viene prima di quel "poi" — lo stesso testo, senza ago (`comeSenzaAgo`,
      // `case 'contact.mockup'`, poco sopra), lo diceva già per intero.
      come: LC('Chiedi un mock-up. Poi non fare altro: il ciclo avanza da sé fino all\'AS-IS.',
               'Demande un mock-up. Puis ne fais rien d\'autre : le cycle avance tout seul jusqu\'à l\'AS-IS.',
               'Ask for a mock-up. Then do nothing else: the cycle advances by itself to the AS-IS.',
               'Pide un mock-up. Luego no hagas nada más: el ciclo avanza solo hasta el AS-IS.',
               'Be om en mock-up. Gör sedan inget mer: cykeln går själv fram till AS-IS.'),
      avviso: cycles.noReadSignal
        ? LC('sembra NULL — nessuna lettura nella finestra', 'semble NULL — aucune lecture dans la fenêtre', 'looks NULL — no read in the window', 'parece NULL — ninguna lectura en la ventana', 'ser NULL ut — ingen avläsning i fönstret')
        : chargePhaseNow === 'discharge'
        ? LC('la carica si sta dissolvendo', 'la charge se dissout', 'the charge is dissolving', 'la carga se está disolviendo', 'laddningen löses upp')
        : null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faseCiclo, toneAttivo, tone.tonePhase, tone.toneRipetizioni, mirror.mirrorArmed, mirror.mirrorDisp,
      cycles.cycleKind, cycles.cycleArmed, cycles.noReadSignal, chargePhaseNow, mode, lang,
      truth.truthPhase, truth.truthRepeats]);
  /**
   * ── « COME » SENZA AGO — portato parola per parola da App.tsx (`comeSenzaAgo`), per la
   * stessa ragione qui: `spiegazioneCiclo.come` (sopra) nomina spesso l'AGO stesso (« l'ago
   * legge → premi », « aspetta il ritorno alla base ») — parole false quando non c'è nessuno
   * strumento a leggere alcunché, e una falsa peggio che nessuna: dice all'auditor di
   * aspettare una cosa che non arriverà. Qui la stessa procedura è detta con gli indicatori
   * che restano: quel che il PRECLEAR PERCEPISCE e quel che l'AUDITOR OSSERVA. `null` dove il
   * testo normale va già bene (i tempi di TONE, che sono assessment puro).
   */
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
      // ⚠️ SEGNALATO — mancava qui il testo che `spiegazioneCiclo.come` già dice per
      // `null.rise` (« Il mock-up sta creando massa. Aspetta il ritorno alla base: quello è
      // l'EQUILIBRIUM »): questa funzione (`comeSenzaAgo`) è quella VERAMENTE mostrata quando
      // la seduta è « senza strumenti » — non `vistaSenzaAgo` (la preferenza visiva, con lo
      // strumento comunque collegato), la scelta fatta all'apertura seduta. Chi testa senza
      // hardware reale sceglie spesso "senza strumenti" apposta (evita il selettore nativo
      // MUSE/METER, bloccante in questo genere di verifica) — è QUESTA la frase che vedeva,
      // non quella con l'ago.
      // ⚠️ SEMPLIFICATO IN BASIC — segnalato: « in NULL in basic non devi fare apparire
      // RECHARGE TA se senza strumenti ». La diramazione "ci riesce/non ci riesce" con
      // l'etichetta tecnica "NON RICARICA" è un dettaglio per chi già conosce il ciclo NULL —
      // in BASIC basta il gesto (chiedere il mock-up), l'esito lo giudica l'auditor a voce,
      // non serve nominare qui un esito che potrebbe non verificarsi mai in quella seduta.
      case 'null.mockup':
        // `!== true`, non `=== false` — v. la nota grande su `espertoAttivo`/`moduleVis` più
        // sotto (« la MNA in basic non deve apparire »): una configurazione salvata senza
        // questo campo (`null`/`undefined`) deve leggersi come BASIC, non come EXPERT.
        return espertoAttivo !== true
          ? LC('Chiedi un mock-up.', 'Demande un mock-up.', 'Ask for a mock-up.',
               'Pide un mock-up.', 'Be om en mock-up.')
          : LC('Chiedi un mock-up. Ci riesce → EQUILIBRIUM. Non ci riesce → NON RICARICA.',
                  'Demande un mock-up. Il y arrive → EQUILIBRIUM. Il n\'y arrive pas → NE RECHARGE PAS.',
                  'Ask for a mock-up. He can → EQUILIBRIUM. He can\'t → NO RECHARGING.',
                  'Pide un mock-up. Lo logra → EQUILIBRIUM. No lo logra → NO RECARGA.',
                  'Be om en mock-up. Klarar → EQUILIBRIUM. Klarar inte → LADDAR INTE.');
      case 'null.rise':
        return LC('Il mock-up sta creando massa. Aspetta il ritorno alla base: quello è l\'EQUILIBRIUM.',
                  'Le mock-up crée de la masse. Attends le retour à la base : c\'est ça l\'EQUILIBRIUM.',
                  'The mock-up is creating mass. Wait for the return to base: that is the EQUILIBRIUM.',
                  'El mock-up está creando masa. Espera el retorno a la base: eso es el EQUILIBRIUM.',
                  'Mock-upen skapar massa. Vänta på återgången till basen: det är EQUILIBRIUM.');
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
      // ⚠️ BUG TROVATO — segnalato: « senza strumenti ti dice di dire o scrivere un item IN
      // TRUTH ma non c'è la zona testo ». Mancava qui il caso di TRUTH — `comeSenzaAgo`
      // tornava `null` per lui, e il ramo "senza strumenti" ripiegava sul testo NORMALE di
      // `spiegazioneCiclo.come` (« Scrivilo o dillo a voce, poi premi »), che presuppone il
      // campo item DENTRO `PistaCiclo` — MAI montato senza strumenti (v. la nota sul blocco
      // assoluto "DONNE L'ITEM", qui sopra). Non basta dire "scrivilo o dillo" senza dire
      // DOVE: senza `PistaCiclo` l'unica casella scritta è "R&I · Manuel" nel pannello
      // Assessment (a destra) — nominata esplicitamente, non lasciata sottintesa.
      case 'truth.ri': case 'truth.say_ri':
        return LC('Dillo ad alta voce, o scrivilo nel campo "R&I · Manuel" a destra, poi premi.',
                  'Dis-le à voix haute, ou écris-le dans le champ « R&I · Manuel » à droite, puis appuie.',
                  'Say it out loud, or type it in the "R&I · Manual" field on the right, then press.',
                  'Dilo en voz alta, o escríbelo en el campo "R&I · Manual" a la derecha, luego pulsa.',
                  'Säg det högt, eller skriv det i fältet "R&I · Manuellt" till höger, tryck sedan.');
      default:
        return null;   // TONE è assessment puro: il suo testo va già bene così com'è.
    }
  };
  /** Toglie il « 1 · » davanti al titolo — la numerazione la porta già la pista
   *  (`CycleSteps`, sotto). Stessa funzione di App.tsx (`senzaNumero`). */
  const senzaNumero = (s: string) => s.replace(/^\s*\d+\s*·\s*/, '');

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
  // ⚠️ Il valore di ritorno (stato "in ascolto"/"assente") non ha più un posto in resa da
  // quando l'item si scrive direttamente in `PistaCiclo` (v. la nota lì) — un `<input>`
  // sempre visibile non ha bisogno di un suggerimento per dire che si può scrivere. L'hook
  // resta chiamato TALE E QUALE: è lui che riempie `item` con la trascrizione, un effetto
  // di cui questo componente ha ancora bisogno, solo non più mostrato a chi ascolta.
  const _statoVoce = useVoiceItem({
    // In pausa (automatica O manuale) niente ascolto — stessa regola di App.tsx
    // (`handlePause` ferma esplicitamente il riconoscimento).
    active: aperta && !pausata,
    lang: lang as string,
    onTranscript: (text, speechEndMs) => {
      const ritardoS = speechEndMs
        ? Math.min(3, Math.max(0, (performance.now() - speechEndMs) / 1000)) : 0;
      // ⚠️ IL TONO DI VOCE — segnalato: « solo il testo con il tono di voce ». Mancava per
      // intero — `useVoiceItem.ts` lo dichiara esplicito («... qui manca tutta la logica di
      // ruolo/satellite/tono-vocale/relay di rete di App.tsx »), non una svista di questa
      // sessione ma un pezzo mai portato. `voiceToneAnalyzer` (STESSO singleton condiviso, v.
      // `lib/voiceToneAnalyzer.ts`) campiona il microfono in un flusso A PARTE da quello del
      // riconoscitore vocale (v. `apri()`/`chiudi()` per l'avvio/arresto) — `.analyze()` letto
      // QUI, allo stesso punto in cui App.tsx lo legge (`const tone = voiceToneAnalyzer.analyze()`),
      // non dentro il riconoscitore: è il consumo della trascrizione a doverlo sapere, non chi
      // la produce. SERENITY è sempre l'auditor in locale — nessun ramo PC/satellite da
      // scegliere, il tono è sempre di chi sta parlando qui.
      const tono = voiceToneAnalyzer.analyze() ?? undefined;
      journal.addLog({ speaker: 'Aud', text, time: Math.max(0, sessionClock.now() - ritardoS), type: 'normal', tone: tono });
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
   * ⚠️ BUG TROVATO — segnalato: « le cicle TRUTH n'est pas clair : l'item dit ne s'inscrit pas ».
   * Causa vera: TRUTH era stato agganciato all'interfaccia (motore, cerchio, pista) ma questo
   * QUARTO effetto — quello che scrive DAVVERO il R/I detto a voce nel campo — non era mai
   * stato scritto. `locateRI()` (in `useTruthCycle.ts`) accende `truthAwaitItemRef` e segna il
   * cursore esattamente come gli altri tre, ma senza QUESTO effetto nessuno lo leggeva mai:
   * il R/I restava per sempre "in attesa", `itemNamed` restava falso, la pista non avanzava
   * mai oltre "1 · DAI IL R/I" — la stessa causa, non ancora collegata per TRUTH.
   */
  useEffect(() => {
    if (!truth.truthAwaitItemRef.current) return;
    const cursore = truth.truthLogCursorRef.current;
    if (journal.logs.length <= cursore) return;
    for (let i = cursore; i < journal.logs.length; i++) {
      const riga = journal.logs[i];
      if (riga.speaker === 'Aud' && isAssessableItem(riga.text)) {
        truth.truthAwaitItemRef.current = false;
        setItem(riga.text.trim());
        break;
      }
    }
    truth.truthLogCursorRef.current = journal.logs.length;
  }, [journal.logs, truth]);

  /**
   * « L'ITEM È STATO DETTO » — il gesto di ripiego, per tutti e cinque i cicli, quando la
   * trascrizione non c'è (microfono negato, Whisper assente) o l'auditor preferisce scriverlo
   * dopo. Stessa forma di App.tsx (`dichiaraItemDetto`): si spengono tutti gli `*AwaitItemRef`
   * insieme, perché il gesto è uno solo e lo stato del ciclo dice già quale dei cinque sta
   * aspettando.
   */
  const dichiaraItemDetto = () => {
    setItemSpoken(true);
    setItemDigitando(false);   // confermato: non è più "ancora in scrittura"
    cycles.cycleAwaitItemRef.current = false;
    mirror.mirrorAwaitItemRef.current = false;
    tone.toneAwaitItemRef.current = false;
    truth.truthAwaitItemRef.current = false;
  };

  /**
   * L'APERTURA VERA — quel che `apri()` faceva per intero prima di questo segnalato. Separata
   * perché ora ha DUE strade per arrivarci: subito (uno strumento è già collegato, o "senza
   * strumenti" è già stato scelto in questa seduta) o dopo la scelta nel pannello qui sotto.
   */
  const avviaSeduta = () => {
    sessionClock.reset(); sessionClock.start();
    sessionStartRef.current = Date.now();
    // ── IL TONO DI VOCE, AVVIATO CON LA SEDUTA — stessa vita di `voiceToneAnalyzer` in
    // App.tsx (`init()` all'apertura, `stop()` alla chiusura, v. `chiudi()`): un flusso
    // microfono A PARTE da quello del riconoscitore vocale, serve solo a leggere l'energia
    // della voce, non le parole. `void`: se il microfono non è concesso (o è già preso da
    // altro) `init()` risolve `false` — `onTranscript` (sopra) legge `analyze() ?? undefined`,
    // niente chip di tono invece di un errore.
    // ⚠️ TEST DIAGNOSTICO « alone bianco » — disattivato temporaneamente per isolare la causa.
    // La pausa (`pausata`) NON ferma questo motore (solo `chiudi()` lo fa, v. sotto) — un test
    // precedente "seduta in pausa" non lo escludeva affatto, un buco nel ragionamento, non
    // nel motore. Qui un secondo flusso microfono vero, separato dal riconoscimento vocale,
    // si attiva ESATTAMENTE quando la seduta si apre — la stessa identica finestra temporale
    // in cui compare l'alone. Se sparisce con questo spento, la causa è confermata.
    // void voiceToneAnalyzer.init().then(ok => { if (ok) voiceToneAnalyzer.ensureAudioContextActive(); });
    sessionRecorder.reset();   // niente chart/reazioni/CSV di una seduta precedente — come App.tsx
    setPausata(false); pausaMotivoRef.current = null;   // niente pausa residua da una seduta precedente
    journal.resetJournal(t('ser_session_opened'));
    ep.resetEpState();   // niente "EP ✓" residuo da una seduta precedente
    mirror.resetMirror();   // niente ciclo MIRROR residuo da una seduta precedente
    tone.resetTone(); setToneAttivo(false);   // niente TONE residuo da una seduta precedente
    setCampiSessioneNascosti(false);   // OBIETTIVO/STATO FISICO/R-FACTOR di nuovo in vista
    setProvaTa({ two: null, solo: null });   // niente prova doppia residua da un'altra persona
    setAssessAttivo(false); setAssessItems([]); assessLogCursorRef.current = 0;   // idem, ASSESSMENT
    assessTimesRef.current = []; assessPrevAtRef.current = -Infinity; gruppiItemRef.current = new Map();
    shownReadsRef.current = [];   // niente reazioni di una seduta precedente nella finestra del primo item
    // ── MNA — « entra in CAPTURE » all'apertura, come App.tsx ────────────────────────────
    // Non IDLE: l'attrezzo è PRONTO a catturare fin dal primo secondo, non spento. E
    // `onHarmonicCopy` va agganciato QUI (una volta per seduta, come in App.tsx) — è
    // `primeFreqAudio` che lo richiama a ogni copia armonica generata durante HARMONICS;
    // senza, il contatore COPIES di `PannelloMna` resterebbe fermo a zero per sempre.
    // ⚠️ TEST DIAGNOSTICO « alone bianco » — disattivato temporaneamente, come già fatto per
    // voiceToneAnalyzer (escluso: l'utente conferma che l'alone resta anche con quello spento).
    // Questo crea "solo" un AudioContext — nessun getUserMedia nel suo codice — ma è l'ultimo
    // motore audio/media rimasto che si attiva ESATTAMENTE quando la seduta si apre, mai prima.
    // primeFreqAudio.init();
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
    // ⚠️ Segnalato insieme al bug di `onPhase` (v. la sua nota, più giù): senza questo,
    // `metabolicPhaseRef` poteva restare fermo su `'baseline'`/`'breath'` dopo la chiusura —
    // `useChargeEngine` avrebbe continuato a nutrire `metabolicBaseline` per il resto della
    // seduta, lavoro sprecato (mai letto: la PROSSIMA apertura lo azzera comunque con
    // `metabolicBaseline.reset()`) ma non corretto. Stessa pulizia di App.tsx alla chiusura.
    metabolicPhaseRef.current = 'idle';
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
   *  sopra il ramo `return null` del controllo): si accorge dopo il render, come deve.
   *  ⚠️ BUG TROVATO — segnalato: « quando comincio la session ed il muse è scelto ma non
   *  acceso, lascia iniziare lo stesso ». `readinessMuseOk` richiede `museOk`, cioè
   *  `museConnection === 'connected'` — falso SIA a connessione FALLITA (`'disconnected'`,
   *  il caso che questo effetto doveva coprire) SIA a connessione ANCORA IN CORSO
   *  (`'searching'`, il MUSE scelto ma non ancora acceso/associato): l'effetto non li
   *  distingueva, e trattava « sto ancora cercando » come « ho rinunciato », aprendo la
   *  seduta subito senza mai aspettare che il MUSE si connettesse davvero. `museCercandoAncora`
   *  tiene aperto il controllo finché la ricerca è DAVVERO ancora in corso — esce solo se il
   *  MUSE è tornato a `'disconnected'` per davvero (rinuncia vera), o se non c'è ricerca da
   *  aspettare (a distanza: `remoteMuseConnected` non ha un suo "searching" locale da qui). */
  useEffect(() => {
    if (!metabolicOpen) return;
    const readinessMuseOk = avvio?.distanza ? remote.remoteMuseConnected : museOk;
    if (meterC || readinessMuseOk) return;
    const museCercandoAncora = !avvio?.distanza && muse.museConnection === 'searching';
    if (museCercandoAncora) return;
    setMetabolicOpen(false);
    metabolicPhaseRef.current = 'idle';   // v. la nota accanto ad `avviaSedutaConProntezza`
    avviaSeduta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metabolicOpen, meterC, museOk, avvio?.distanza, remote.remoteMuseConnected, muse.museConnection]);
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
   * ⚠️ Segnalato di nuovo: « prima di iniziare la seduta ho scelto MUSE, poi quando inizio la
   * seduta mi si richiede di nuovo cosa utilizzo — è una doppia cosa uguale ». Vero: "già
   * collegato" era scritto `=== 'connected'` per davvero, cioè la connessione BLE già
   * conclusa — ma l'auditor aveva già DETTO la sua scelta cliccando MUSE nella pillola
   * dell'intestazione, che avvia subito una ricerca ('searching'), non istantanea. Il gate qui
   * ripeteva la stessa domanda mentre la risposta era già in corso. Ora "già scelto" include
   * anche la RICERCA in corso (MUSE 'searching', Meter 'connecting') — non solo il traguardo:
   * chi ha già cliccato un'icona non deve rispondere due volte alla stessa domanda solo perché
   * il Bluetooth non è istantaneo. */
  const apri = () => {
    const museInCorso = muse.museConnection !== 'disconnected';
    const meterInCorso = meterC || theta.status === 'connecting';
    if (!senzaStrumenti && !museInCorso && !meterInCorso) {
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
    // ⚠️ SEGNALATO — mancava: « nella configurazione registrata deve apparire... anche la
    // lingua scelta ». Richiamarla restituiva auditor/PC/strumenti ma MAI la lingua — anche
    // salvandola (v. `salvaConfigurazione`, sopra), senza restituirla qui la seduta ripartiva
    // sempre nell'ultima lingua usata, non in quella della combinazione richiamata.
    // `cfg.lingua` è opzionale (le configurazioni salvate PRIMA di questo giro non ce l'hanno):
    // senza, si lascia la lingua corrente tale e quale, non un default indovinato a caso.
    if (cfg.lingua) setLang(cfg.lingua as Parameters<typeof setLang>[0]);
    if (!cfg.strumenti.none) {
      if (cfg.strumenti.muse) muse.handleConnectMuse();
      if (cfg.strumenti.theta) theta.connect();
    }
  };
  const chiudi = () => {
    sessionClock.end();
    voiceToneAnalyzer.stop();   // stessa vita della seduta — v. la nota in `avviaSeduta()`.
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
        // ── IL JOURNAL NEL PDF — segnalato: « Fai apparire il journal nel PDF di HISTORI con
        // tutto il trascritto, le reazioni ed il tono ». Tutte le righe (non filtrate a
        // Aud/PC come il pannello a schermo: qui "tutto" significa anche AGO/SYS), con la
        // STESSA `computeInstantRead` che quel pannello già usa "sulla parola" — nessuna
        // seconda logica di lettura inventata qui, solo il dato in più nell'input.
        //
        // ⚠️ 'NEEDLE' AGGIUNTO — segnalato: « les indications de l'aiguille... une couleur qui
        // correspond à CONTACT/DISSOLUTION/AS-IS ». `sessionReport.ts` sceglie il colore di
        // ogni riga AGO proprio da questo campo `reaction` — restava fuori dal calcolo
        // (condizione ferma a Aud/PC), quindi era SEMPRE `undefined` per l'unico tipo di riga
        // che ne aveva davvero bisogno: ogni riga AGO cadeva nel colore di ripiego (grigio
        // AS-IS), qualunque fosse la lettura vera. Stessa `computeInstantRead` sullo stesso
        // istante — l'esito è lo stesso già mostrato a schermo quando la riga fu scritta
        // (`aggiungiItemManuale`, `scelta`), non un secondo calcolo.
        journal: journal.logs.map(l => ({
          time: l.time,
          speaker: l.speaker,
          text: l.text,
          tone: l.tone,
          reaction: (l.speaker === 'Aud' || l.speaker === 'PC' || l.speaker === 'NEEDLE') && (museOk || meterC)
            ? (() => {
                const r = computeInstantRead(shownReadsRef.current, l.time ?? 0, -Infinity, Infinity,
                  agoEegRef.current ? 'eeg' : 'theta').read;
                return r && r !== 'NULL' && r !== READ_NON_MISURATO ? r : undefined;
              })()
            : undefined,
        })),
        cansTest: {
          hasMeter: meterC,
          done: testedToday(canHistory, Date.now()),
          config: theta.setup.config,
          soloOffset: theta.setup.offsets?.['solo-can'] ?? 0,
          taMargin: 0,
        },
        // ── IL GRAFICO Q_L E L'MNA — segnalato: « ajoute aussi le Graphique Q_L et MNA ».
        // Dichiarati apertamente assenti in testa a `sessionReport.ts` da quando il PDF di
        // SERENITY esiste — non un dimenticato, un "non ancora fatto" scritto a chiare lettere.
        // `mnaSessionRef.current` è LO STESSO oggetto che il pannello MNA a schermo legge — non
        // un secondo calcolo, la fotografia di fine seduta di quel che c'era già.
        mnaData: mnaSessionRef.current,
      };
      const riepilogo = costruisciRiepilogo(input);
      saveSession(riepilogo);
      void (async () => {
        try {
          const pdf = await generaPdf(input, k => t(k as never) as string, LC);
          try { await saveSessionPdfAsync(riepilogo.id, pdf); } catch { saveSessionPdf(riepilogo.id, pdf); }
          // ⚠️ BUG TROVATO — segnalato: « il est toujours impossible de visualiser les pdf
          // de History ». Stesso bug già corretto UNA VOLTA in App.tsx (v. il commento
          // "FIX HISTORY-PDF" in `PostSessionReport.tsx`), mai portato qui: il PDF finiva
          // SOLO nell'IndexedDB locale, mai sul server locale (`serverSaveSessionPdf`,
          // `api-routes.cjs`). `HistoryModal.openPdf` ora prova PRIMA l'URL del server (una
          // risorsa di rete vera, apribile in qualunque finestra Electron senza il problema
          // dei `blob:` cross-processo — v. la sua nota) — ma senza QUESTA riga il server
          // non aveva mai nulla da servire per una seduta SERENITY, quindi cadeva SEMPRE sul
          // blob rotto: la stessa causa, con un sintomo diverso da quello di App.tsx a suo
          // tempo (lì mancava fra dispositivi diversi, qui mancava anche sullo stesso). */
          try {
            if (await isServerAvailable()) {
              const raw = pdf.split(',')[1] || '';
              const fname = `${(input.pcName || 'session').replace(/[^\w-]+/g, '_')}_${riepilogo.id}.pdf`;
              await serverSaveSessionPdf(riepilogo.id, fname, raw);
            }
          } catch (srvErr) { console.warn('[SERENITY] upload PDF al server fallito (resta locale)', srvErr); }
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
        <PannelloConfig onChiudi={() => setConfigAperto(false)} />
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
  /* ⚠️ SEGNALATO DI NUOVO, stavolta al contrario: « vedo che appare Santé Système anche
   *  senza il MUSE ». Un giro passato avevo tolto il cancello `&& (museOk || meterC)` per
   *  riprodurre App.tsx alla lettera (il suo commento « FIX M-07 » dice che mostra Santé
   *  SEMPRE, strumento collegato o no) — verificato di nuovo dal vivo, stavolta aprendo
   *  DAVVERO EQUILIBRIUM senza strumenti: è vero, lo fa anche lui. Ma qui la richiesta non è
   *  "correggi una divergenza da EQUILIBRIUM" — è una preferenza esplicita e diversa PER
   *  SERENITY, vista e confermata dopo aver guardato entrambe le app fianco a fianco: Santé
   *  Système (EEG/GYRO/elettrodi — dati del SUO MUSE, non del meter) non ha senso da vedere
   *  senza un MUSE connesso. Cancello rimesso, stavolta come scelta dichiarata di SERENITY,
   *  non come un'invenzione prudente scoperta per caso.
   *  ⚠️ Segnalato: « cambia di posizione il giornale con l'assessment ». L'assessment vive ora
   *  QUI (colonna destra, sotto Santé) — la colonna deve aprirsi anche quando è SOLO lui
   *  acceso, non più solo per Santé/Journal (che ora è a sinistra). */
  const rightColOpen = (aperta && moduleVis.health && museOk) || (aperta && moduleVis.ri);
  const moduleColWidth = 272;
  /* ── LE CAMERE SONO SOPRA — le `<CameraCerchio>` (più giù, `position:absolute, top:-8,
   *  right:32`) galleggiano sulla STESSA colonna destra dove vive Santé Système/journal (in
   *  flusso, sotto): senza spazio riservato le due si sovrapponevano. Un `paddingTop` sulla
   *  colonna destra pari alla vera altezza dello stack (`camStackH`, sotto — aperta o
   *  collassata, una o due camere) le tiene sempre sotto le camere, mai coperte.
   *  Le taglie (255/158, `cam2H`/`cam1H`) DEVONO restare identiche a `dimensione` sulle due
   *  `<CameraCerchio>` più giù — sono la stessa taglia vista da due punti diversi (quanto
   *  spazio riservare qui, quanto disegnare lì): se una cambia senza l'altra, la riserva e il
   *  disegno vero si disallineano in silenzio. Cronologia completa (i tentativi di
   *  disposizione provati e scartati) in `docs/serenity-refonte.md`, non ripetuta qui. */
  // ⚠️ Segnalato: « la cam dell'auditor non è necessaria, falla sparire dall'interfaccia
  // dell'auditor. Lasciala per le connessioni a distanza » — CAM 1 (sotto) ora si monta SOLO
  // con `avvio.distanza`. La riserva di spazio deve seguire la STESSA condizione, altrimenti
  // resterebbe un vuoto morto sopra Santé Système/journal in ogni seduta locale.
  const cam1Mostrata = moduleVis.cam1 && avvio.distanza;
  /**
   * ⚠️ AGGIUNTO — segnalato: « cam nascoste fuori sessione a distanza » (una delle quattro
   * proposte accettate, « tutti »). CAM 2 (la webcam locale generica) restava SEMPRE visibile
   * col suo interruttore acceso, anche fuori sessione a distanza — voluto in origine (utile
   * per un'auto-osservazione anche in locale, v. la nota più giù dove si monta) ma il livello
   * BASIC deve restare al minimo: in BASIC si vede solo con `avvio.distanza`, ESATTAMENTE come
   * CAM 1 — in EXPERT resta come sempre (`moduleVis.cam2` da solo decide). Non si tocca
   * `moduleVis.cam2` stesso: resta la preferenza vera scritta da CONFIG, questo è solo il
   * calcolo di quando MOSTRARLA — la preferenza dell'auditor non viene mai riscritta di
   * nascosto da un cambio di livello.
   */
  // FIX: era `espertoAttivo !== false` — l'UNICA occorrenza del file a trattare
  // `undefined`/`null` (una config salvata prima che il campo esistesse) come EXPERT.
  // Ogni altro uso di `espertoAttivo` in questo file usa `=== true`/`!== true`, che
  // tratta `undefined` come BASIC — allineata alla stessa convenzione.
  const cam2Mostrata = moduleVis.cam2 && (espertoAttivo === true || avvio.distanza);
  const cam2H = !cam2Mostrata ? 0 : (cam2Collassata ? 88 : 255);
  const cam1H = !cam1Mostrata ? 0 : (cam1Collassata ? 88 : 158);
  const camStackH = (cam2Mostrata || cam1Mostrata)
    ? -8 + Math.max(cam2H, cam1H) + 20
    : 0;

  /** ── I BOTTONI VERI DEI CICLI — segnalato: « tutte le indicazioni devono essere a sinistra
   *  con i comandi ed anche i bottoni ». Vivevano nella barra comandi in alto (l'ULTIMO pezzo
   *  di UI dei cicli rimasto lì, un giro fa — deciso allora di lasciarlo perché « un bottone
   *  vero, non riprodotto »). Calcolato QUI, prima del `return`, non più dentro la JSX della
   *  barra: serve in DUE punti della JSX (dentro `PistaCiclo`, con strumenti; dentro il
   *  blocco "senza strumenti", senza), e JSX non permette una `const` a metà di un unico
   *  albero di espressioni — bisogna calcolarlo una volta sola PRIMA, come già `spiegazioneCiclo`
   *  (sopra, la stessa tecnica). Nessuna riga di logica toccata: stessi tre blocchi
   *  (TONE/MIRROR/CONTACT-NULL), stesse chiamate al motore (`tone.*`/`mirror.*`/`cycles.*`),
   *  stesso `pillBtn` — solo spostati, non riscritti. */
  /** ⚠️ `whiteSpace:'nowrap'` — segnalato: « le scritte dei comandi dobbiamo allargarle per
   *  renderle su una riga se possibile ». Un bottone-pillola è largo quanto il suo contenuto
   *  (`alignItems:'flex-start'` sul contenitore, nessuna `width` fissa) — senza `nowrap` il
   *  testo, se non ci stava nello spazio rimasto, andava a capo DENTRO la pillola invece di
   *  restare su una riga sola. Vedi la nota accanto a `width:320` di `PistaCiclo`/
   *  `PistaProcedimento` per l'altra metà della correzione (più spazio, non solo niente
   *  ritorno a capo). */
  const pillBtn = (colore: string, dimensione = 17): React.CSSProperties => ({
    cursor: 'pointer', borderRadius: 999, padding: '5px 14px', background: 'var(--s-disc)',
    fontFamily: 'var(--s-sans)', fontSize: dimensione, color: colore, whiteSpace: 'nowrap',
  });
  const bottoniCiclo = (
    <>
      {/* ── TONE SCALE, ATTIVO — locate → raise → done, si ripete per ogni resistenza ────────
          (a) LOCALIZZA: da dove si parte (misurato col meter, o dichiarato dall'auditor senza
          strumenti); (b) RAISE: il comando "portalo a tono 40" ripetuto finché non c'è più
          reazione, poi dichiarato raggiunto; (c) DONE: si riparte con un'altra resistenza, o
          si esce del tutto. Stesse chiamate al motore di App.tsx (`localizzaTone`/
          `chiudiTone`/`resetTone`), stesso testo dei tre tempi. */}
      {aperta && toneAttivo && (
        <>
          {/* ⚠️ « DAI L'ITEM » NON STA PIÙ QUI — segnalato: « le cicle TONE demande d'appuyer
              sur un bouton [...] ENLEVE LE ». Il click sul cerchio TONE (sopra, v. la sua nota)
              arma E localizza nello stesso gesto: `tonePhase` passa da 'locate' a 'raise'
              PRIMA che questo componente si riveda a schermo, quindi questo ramo non è più
              raggiunto in condizioni normali — tolto, non lasciato morto. Il valore di
              partenza senza meter si sceglie ORA prima del click (v. il selettore accanto al
              cerchio TONE), non più qui dopo. */}
          {/* ⚠️ IN CORSO O RAGGIUNTO — segnalato: « mette i due valori [...] ma come auditor
              non si sà se è già stato ottenuto, inganna averli tutti e due indicati ». Prima
              questa scritta era IDENTICA nelle due fasi (stesso `+40` in `--s-reserve`, colore
              che nella dottrina dei tre segnali non significa "raggiunto" ma "dato presente non
              sostenibile" — un quarto senso non previsto). Ora: in salita, `--s-tone-hue`
              (l'identità di TONE, non uno stato) con una freccia che pulsa; raggiunto,
              `--s-still` — LO STESSO segnale che l'AS-IS/F-N usano altrove per "arrivato" — con
              un segno di spunta, niente più pulsare. La stessa distinzione, nell'arco (v.
              `ToneDial`: `animate-pulse` sulla riga ambra solo mentre `raise`). */}
          {tone.tonePhase === 'raise' && (
            <span style={{ fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-faint)' }}>
              {tone.toneAtStart !== null ? `${tone.toneAtStart > 0 ? '+' : ''}${tone.toneAtStart.toFixed(0)} ` : ''}
              <span className="animate-pulse" style={{ color: 'var(--s-tone-hue)', fontWeight: 700 }}>
                → +40 {LC('in corso…', 'en cours…', 'in progress…', 'en curso…', 'pågår…')}
              </span>
            </span>
          )}
          {tone.tonePhase === 'done' && (
            <span style={{ fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-faint)' }}>
              {tone.toneAtStart !== null ? `${tone.toneAtStart > 0 ? '+' : ''}${tone.toneAtStart.toFixed(0)} → ` : ''}
              <b style={{ color: 'var(--s-still)' }}>
                ✓ +40 {LC('raggiunto', 'atteint', 'reached', 'alcanzado', 'nådd')}
              </b>
            </span>
          )}
          {tone.tonePhase === 'raise' && (
            <>
              <button className="s-glass s-glass-btn" onClick={() => tone.setToneRipetizioni(v => v + 1)} style={pillBtn('var(--s-ink-soft)')}>
                {LC('portalo a tono 40', 'mène-le au ton 40', 'raise it to tone 40', 'llévalo al tono 40', 'för det till ton 40')}
                {tone.toneRipetizioni > 0 ? ` ×${tone.toneRipetizioni}` : ''}
              </button>
              <button className="s-glass s-glass-btn" onClick={() => { tone.chiudiTone(true); tone.setTonePhase('done'); }} style={pillBtn('var(--s-still)')}>
                {LC('tono quaranta raggiunto', 'ton quarante atteint', 'tone forty reached', 'tono cuarenta alcanzado', 'ton fyrtio nådd')}
              </button>
            </>
          )}
          {tone.tonePhase === 'done' && (
            <button className="s-glass s-glass-btn" onClick={() => tone.resetTone()} style={pillBtn('var(--s-still)')}>
              {LC('altra resistenza', 'autre résistance', 'another resistance', 'otra resistencia', 'annat motstånd')}
            </button>
          )}
          <button className="s-glass s-glass-btn" onClick={() => {
            if (tone.tonePhase === 'raise') tone.chiudiTone(false);
            tone.resetTone(); setToneAttivo(false);
          }} style={pillBtn('var(--s-ink-ghost)')}>
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
          {!mirror.mirrorDisp.locked ? (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-faint)', marginRight: 6 }}>
                {LC('quanta carica?', 'combien de charge ?', 'how much charge?', '¿cuánta carga?', 'hur mycket laddning?')}
              </span>
              {/* ⚠️ LA LETTURA VERA, COL MUSE, PRIMA DEL BLOCCO — segnalato: « in MIRROR deve
                  apparire col MUSE la carica ottenuta iniziale ». Prima, in attesa che
                  `mirrorCycle` si blocchi da sé, questo schermo mostrava SOLO i dieci
                  bottoni — nessun segno che il MUSE stesse leggendo qualcosa. `mirrorDisp.liveR`
                  (v. la sua nota in `useMirrorCycle.ts`) è la carica VERA, in diretta, sulla
                  stessa scala 1–10 dei bottoni accanto — pulsante finché non si blocca da
                  sola (o l'auditor sceglie a mano, che resta sempre possibile). Solo col MUSE:
                  senza, non c'è nessuna lettura da mostrare, i bottoni restano l'unica via. */}
              {museOk && (
                <span className="animate-pulse" style={{
                  fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-base)', fontWeight: 700,
                  color: 'var(--s-alive)', marginRight: 10,
                }}>
                  MUSE {mirror.mirrorDisp.liveR.toFixed(1)}
                </span>
              )}
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => (
                <button key={v} onClick={() => {
                  mirror.mirrorCycle.setManualValue(v);
                  mirror.setMirrorDisp({ contactQ: mirror.mirrorCycle.contactQ, dischargeQ: 0,
                    locked: true, reached: false, valueR: mirror.mirrorCycle.valueR, liveR: mirror.mirrorCycle.valueR });
                }} className="s-glass s-glass-btn" style={{
                  cursor: 'pointer', borderRadius: 999, width: 26, height: 26,
                  fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-base)', fontWeight: 700,
                  background: 'var(--s-disc-sunk)', color: 'var(--s-ink)',
                }}>
                  {v}
                </button>
              ))}
            </div>
          ) : !mirror.mirrorDisp.reached ? (
            <>
              {/* ⚠️ SEGNALATO: « la valeur 1–10 se fige d'elle-même quand la lecture s'est
                  retournée n'est pas clair dans MIRROR ». Il blocco è voluto (v. la nota su
                  `locked`/`turnedOver` in `MirrorCycle.ts`: il valore si ferma appena il picco
                  passa, non al massimo di sempre) — quel che mancava era DIRLO. Prima questa
                  riga passava dritta dal valore "vivo" (i dieci bottoni) al valore bloccato
                  senza una parola sul perché si è fermato: un numero che smette di muoversi,
                  senza spiegazione, si legge come un guasto. Un piccolo 🔒 con la frase basta a
                  chiudere il dubbio, senza aggiungere un secondo pannello. */}
              <span style={{
                fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-micro)', fontWeight: 700,
                color: 'var(--s-ink-faint)', marginRight: 8, display: 'inline-flex', alignItems: 'center', gap: 3,
              }} title={LC(
                'il valore si è bloccato da sé: la lettura ha superato il picco ed è tornata indietro',
                'la valeur s\'est verrouillée toute seule : la lecture a dépassé le pic et est revenue en arrière',
                'the value locked itself: the reading passed its peak and turned back',
                'el valor se bloqueó solo: la lectura pasó su pico y regresó',
                'värdet låste sig självt: avläsningen passerade sin topp och vände tillbaka')}>
                🔒 {LC('bloccato', 'verrouillé', 'locked', 'bloqueado', 'låst')}
              </span>
              <span style={{ fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-faint)' }}>
                {LC('portalo al doppio', 'mène-le au double', 'take it to the double', 'llévalo al doble', 'för det till dubbeln')}
                {' — '}{mirror.mirrorDisp.valueR.toFixed(0)} → {(2 * mirror.mirrorDisp.valueR).toFixed(0)}
              </span>
              <button className="s-glass s-glass-btn" onClick={() => {
                mirror.mirrorCycle.declareReached();
                mirror.setMirrorDisp({ contactQ: mirror.mirrorCycle.contactQ, dischargeQ: mirror.mirrorCycle.dischargeQ,
                  locked: true, reached: true, valueR: mirror.mirrorCycle.valueR, liveR: mirror.mirrorCycle.valueR });
              }} style={pillBtn('var(--s-still)')}>
                {LC('doppio raggiunto', 'double atteint', 'double reached', 'doble alcanzado', 'dubbeln nådd')}
              </button>
            </>
          ) : (
            <button className="s-glass s-glass-btn" onClick={() => mirror.stopMirror()} style={pillBtn('var(--s-still)')}>
              {LC('ottenuto — valida', 'obtenu — valider', 'obtained — validate', 'obtenido — validar', 'uppnått — validera')}
            </button>
          )}
          <button className="s-glass s-glass-btn" onClick={() => mirror.stopMirror()} style={pillBtn('var(--s-ink-ghost)')}>
            {t('cancel')}
          </button>
        </>
      )}
      {aperta && cycles.cycleArmed && (
        <>
          {/* ── IL CONTATORE DEL CICLO IN CORSO — mancante ─────────────────────────────
              In App.tsx un chip dice, per il SOLO metodo in corso (CONTACT con CONTACT,
              NULL con NULL — « due contatori confondono », scelta utente), quanti cicli
              sono stati armati e quanti portati a compimento questa seduta. `cycleStats`
              arriva già dallo stesso `useContactNullCycle` — solo non era letto qui. */}
          <span style={{ fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-faint)' }}>
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
          <button className="s-glass s-glass-btn" onClick={() => cycles.finalizeCycle(false)} style={pillBtn('var(--s-ink-ghost)')}>
            {t('cancel')}
          </button>
          {cycles.cycleKind === 'null' ? (
            <>
              <button className="s-glass s-glass-btn" onClick={() => cycles.validateClearRead(true)} style={pillBtn('var(--s-still)')}>
                {t('ser_validate_equilibrium_vgi')}
              </button>
              <button className="s-glass s-glass-btn" onClick={() => cycles.validateClearRead(false)} style={pillBtn('var(--s-ink-faint)')}>
                {t('ser_validate_equilibrium_novgi')}
              </button>
              {/* ── IL TERZO ESITO, MANCANTE ────────────────────────────────────────────
                  Segnalato nella revisione funzionale: il ciclo NULL in App.tsx ha TRE
                  esiti pari (VGI · senza VGI · NON RICARICA), non due — « non ricarica » è,
                  testuale App.tsx, « il risultato diagnostico più prezioso del ciclo NULL »:
                  senza dichiararlo, il ciclo resta indistinguibile da uno abbandonato, e
                  quel ramo del rapporto/CORPUS resta irraggiungibile. SERENITY aveva SOLO i
                  primi due — un bottone intero perso, non solo uno stile. */}
              <button className="s-glass s-glass-btn" onClick={() => cycles.declareNoRecharging()} style={pillBtn('var(--s-reserve)')}>
                {t('ser_no_recharging')}
              </button>
            </>
          ) : (
            <button className="s-glass s-glass-btn" onClick={() => cycles.validateAsIs()} style={pillBtn('var(--s-still)')}>
              {t('ser_validate_asis')}
            </button>
          )}
          {/* ── LO STESSO `CycleStatusBar` DI APP.TSX — segnalato: « riproduci la logica dei
              cicli di equilibrium... stessi posizionamenti ». */}
          <div style={{ width: '100%' }}>
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
      {/* ── TRUTH, ATTIVO — v. docs/truth-cycle-proposal.md. Localizza il R/I → chiedi «What
          about this is the truth?» finché non emerge un ulteriore R/I → return to present.
          Un candidato proposto dal motore (v. `truthDisp`) NON è mai un evento confermato da
          solo — conferma/scarta restano gesti dell'auditor, mai automatici. */}
      {aperta && truth.truthPhase !== 'idle' && (
        <>
          <button className="s-glass s-glass-btn" onClick={() => truth.resetTruth()} style={pillBtn('var(--s-ink-ghost)')}>
            {t('cancel')}
          </button>
          {truth.truthPhase === 'return_present' ? (
            <button className="s-glass s-glass-btn" onClick={() => truth.chiudiTruth()} style={pillBtn('var(--s-still)')}>
              {LC('chiudi il R/I', 'clore le R/I', 'close the R/I', 'cerrar el R/I', 'stäng R/I')}
            </button>
          ) : (
            <>
              {truth.truthPhase === 'candidate' && (
                <>
                  {/* ── IL CANDIDATO — una PROPOSTA del motore, mai un evento da solo (v. la
                      nota di testa in `truthScale.ts`). L'auditor conferma o scarta. */}
                  <span style={{
                    fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-micro)', fontWeight: 700,
                    color: 'var(--s-truth-hue)', padding: '5px 10px',
                  }}>
                    {LC('candidato', 'candidat', 'candidate', 'candidato', 'kandidat')} · {(truth.truthDisp.confidence * 100).toFixed(0)}%
                  </span>
                  <button className="s-glass s-glass-btn" onClick={() => truth.confermaVerita()} style={pillBtn('var(--s-still)')}>
                    {LC('conferma verità', 'confirme vérité', 'confirm truth', 'confirma verdad', 'bekräfta sanning')}
                  </button>
                  <button className="s-glass s-glass-btn" onClick={() => truth.scartaCandidato()} style={pillBtn('var(--s-ink-faint)')}>
                    {LC('non è questo', 'ce n\'est pas ça', 'not this', 'no es esto', 'inte det här')}
                  </button>
                </>
              )}
              {truth.truthPhase !== 'candidate' && (
                <button className="s-glass s-glass-btn" onClick={() => truth.askTruth()} style={pillBtn('var(--s-alive)')}>
                  {LC('chiedi', 'demande', 'ask', 'pregunta', 'fråga')}
                  {truth.truthRepeats > 0 ? ` · ×${truth.truthRepeats}` : ''}
                </button>
              )}
              <button className="s-glass s-glass-btn" onClick={() => truth.trovatoUlterioreRI()} style={pillBtn('var(--s-reserve)')}>
                {LC('ulteriore R/I trovato', 'R/I supplémentaire trouvé', 'further R/I found', 'R/I adicional encontrado', 'ytterligare R/I hittat')}
              </button>
            </>
          )}
        </>
      )}
    </>
  );

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
      /* ⚠️ Due righe, non tre — segnalato: « le scritte dei cicli devono essere tutte al lato
         sinistro, sotto il TA... dentro la barra laterale esistente ». `.ser-comandi` (sotto)
         non è più un figlio IN FLUSSO: è diventata lei stessa `position:absolute`, ancorata a
         sinistra sotto `<header>` — un grid item assoluto non partecipa più all'auto-piazzamento
         (verificato sul DOM: appena `.ser-comandi` è assoluta, `<main>` vede SOLO `<header>` e
         `<section>` come figli in flusso). Restarle assegnate TRE righe (`'auto auto 1fr'`)
         avrebbe messo `<section>` sulla SECONDA riga (`auto`, strizzata) invece dell'ultima
         (`1fr`, elastica) — lo stesso bug già trovato una volta con l'ordine sbagliato dei
         figli, stavolta con lo stesso ordine ma un figlio in meno. */
      gridTemplateRows: 'auto 1fr',
      /* ⚠️ Segnalato: « lo spazio dell'arco deve essere più grande, fallo occupare tutto lo
         spazio disponibile ». Il padding di `<main>` (38/44px) toglieva spazio VERO all'arco
         su ogni schermo, non solo su quelli piccoli: su un'aspect-ratio larga com'è la sua
         (1600/850) è quasi sempre la LARGHEZZA a decidere la taglia finale. Ridotto una prima
         volta (38/44→20/24); ridotto ANCORA qui — segnalato di nuovo insieme al riordino
         delle camere (v. `camStackH`, sopra), che quel riordino da solo toglie spazio verticale
         a Santé/Journal: compensato in parte lasciando all'arco un margine più stretto ancora. */
      padding: '16px 20px', gap: 20, position: 'relative',
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
            <span style={{ fontFamily: 'var(--s-serif)', fontSize: 'var(--s-fs-lg)', color: 'var(--s-ink)' }}>
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
                  fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', letterSpacing: '0.02em',
                  background: o.on ? 'var(--s-disc-sunk)' : 'transparent',
                  color: 'var(--s-ink)', boxShadow: o.on ? 'var(--s-shadow)' : 'none',
                }}>
                  <span style={{ fontFamily: 'var(--s-mono)', width: 14 }}>{o.on ? '✓' : '·'}</span>
                  {o.label}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-faint)', maxWidth: 280, lineHeight: 1.5 }}>
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
                    salvaConfigurazione(nomeConfigDaSalvare, avvio, connSel, lang); setConfigSalvata(true);
                  } }}
                  placeholder={LC('nome di questa configurazione…', 'nom de cette configuration…',
                    'name for this configuration…', 'nombre de esta configuración…', 'namn för denna konfiguration…') as string}
                  style={{
                    flex: 1, border: 'none', borderBottom: '1px solid var(--s-ink-ghost)', background: 'none',
                    outline: 'none', fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink)',
                    padding: '2px 4px',
                  }}
                />
                <button
                  disabled={!nomeConfigDaSalvare.trim()}
                  onClick={() => { salvaConfigurazione(nomeConfigDaSalvare, avvio, connSel, lang); setConfigSalvata(true); }}
                  style={{
                    border: 'none', background: 'none', cursor: nomeConfigDaSalvare.trim() ? 'pointer' : 'default',
                    opacity: nomeConfigDaSalvare.trim() ? 1 : 0.4,
                    fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-soft)', whiteSpace: 'nowrap',
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
                fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-ghost)',
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
                    salvaConfigurazione(nomeConfigDaSalvare, avvio, connSel, lang);
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
                  fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', letterSpacing: '0.06em', textTransform: 'uppercase',
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
          esiste).
          ⚠️ I DUE NON SI COMPORTANO UGUALE — corretto un giro dopo aver scoperto il bug (v. la
          nota su `onCancel` di `ThetaReadyCheck`, più giù): in App.tsx SOLO `MetabolicCheck`
          apre la seduta anche da ANNULLA (è consultivo, la decisione resta dell'auditor);
          `ThetaReadyCheck` (stretta/respiro del Meter) NO — ANNULLA lì chiude e basta. */}
      {metabolicOpen && (() => {
        const readinessMuseOk = avvio?.distanza ? remote.remoteMuseConnected : museOk;
        // ⚠️ Calcolato QUI, non solo più giù: serve ANCHE a `onProceed` di `ThetaReadyCheck`
        // (v. la sua nota fra poco) — stesso bug, stesso rimedio, un solo posto dove chiedersi
        // « il MUSE sta ancora cercando? ». V. la nota estesa più giù, sul cancello di
        // `MetabolicCheck`.
        const museCercandoAncora = !avvio?.distanza && muse.museConnection === 'searching';
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
                // ⚠️ BUG TROVATO — stesso della nota sul cancello di `MetabolicCheck`, qui
                // sotto: `!readinessMuseOk` da solo era vero ANCHE col MUSE ancora
                // `'searching'` (scelto insieme al meter, non ancora acceso) — apriva la
                // seduta subito invece di aspettarlo. `museCercandoAncora` lo esclude: se sta
                // ancora cercando, si passa oltre SENZA aprire — il render qui sotto monta
                // `MetabolicCheck` al giro successivo, che aspetta lui.
                if (!readinessMuseOk && !museCercandoAncora) { setMetabolicOpen(false); avviaSeduta(); }
              }}
              // ⚠️ BUG TROVATO — segnalato: « se schiacci Cancel o Start Anyway fa partire la
              // seduta comunque ». Verificato App.tsx (`onCancel={() => setMetabolicOpen(false)}`
              // per QUESTO controllo, la stretta/il respiro del Meter): ANNULLA lì chiude e
              // BASTA, non apre mai la seduta — la nota qui sopra (« nessuno dei due blocca per
              // davvero ») descriveva `MetabolicCheck` più giù (che in App.tsx SÌ apre la seduta
              // anche da ANNULLA — quello resta invariato), non `ThetaReadyCheck`: un'invenzione
              // presa in prestito dal componente sbagliato. Corretto a chiudere soltanto. */}
              onCancel={() => setMetabolicOpen(false)}
            />
            </div>
          );
        }
        // ⚠️ BUG TROVATO — segnalato: « quando il muse è scelto ma non acceso, lascia
        // iniziare lo stesso ». Prima il cancello era SOLO `readinessMuseOk` (richiede
        // `'connected'`) — mentre il MUSE è ancora `'searching'` (scelto, non ancora
        // acceso/associato) quel controllo era falso, si cadeva dritti al `return null` sotto,
        // e l'effetto accanto (v. la sua nota) scambiava « sto ancora cercando » per « ho
        // rinunciato », aprendo la seduta senza aver mai aspettato. `museCercandoAncora`
        // (calcolato in cima a questa IIFE, stessa condizione già passata a `museConnecting`)
        // tiene `MetabolicCheck` montato ANCHE durante la ricerca — lui sa già mostrare
        // "connessione in corso" (`museConnecting`, la sua prop, già cablata): il pezzo
        // mancante era che qui non lo si lasciava mai arrivare a schermo.
        if (readinessMuseOk || museCercandoAncora) {
          return (
            <div className="ser-ready-wrap">
            {/* ⚠️ BUG TROVATO — segnalato: « pronto per la session con il MUSE non dà i
                risultati anche se dice pronto ». `onPhase` era `() => {}`, un vuoto —
                `MetabolicCheck` lo chiama per dire QUANDO è nella fase `'baseline'`/`'breath'`
                (il suo stesso commento: « the engine is FED by App's METRICS_UPDATE, it reads
                the live phase via onPhase »): `useChargeEngine` (condiviso) nutre
                `metabolicBaseline` SOLO quando `metabolicPhaseRef.current` è una di quelle due
                fasi (`hooks/useChargeEngine.ts`, vicino a `METRICS_UPDATE`). Senza scrivere
                quel ref, `metabolicPhaseRef` restava fermo a `'idle'` per SEMPRE — zero
                campioni raccolti, `assess()` usciva vuoto: « pronto » (la schermata si vedeva,
                i tempi scorrevano) ma senza un solo numero vero dietro. `metabolicPhaseRef`
                esisteva già (già passato a `useChargeEngine` più sopra, `corpusSessionRef,
                tRef, metabolicPhaseRef`) — mancava solo scriverci, esattamente come App.tsx
                (`onPhase={(p) => { metabolicPhaseRef.current = p; }}`, verificato riga per
                riga). */}
            <MetabolicCheck
              lang={lang}
              meterAlreadyCalibrated={meterC && theta.setup.scaleMeasured}
              museConnected={readinessMuseOk}
              museWorn={museGate.museContact}
              museConnecting={museCercandoAncora}
              onProceed={a => avviaSedutaConProntezza(a)}
              onCancel={a => avviaSedutaConProntezza(a)}
              onPhase={p => { metabolicPhaseRef.current = p; }}
              needleTrim={{
                trim: needleTrim, setTrim: setNeedleTrim,
                inertia: needleInertia, setInertia: setNeedleInertia,
                labelSection: t('drawer_needle_trim') as string,
                labelSensitivity: t('trim_sensitivity') as string,
                labelInertia: t('trim_inertia') as string,
                labelCentering: t('trim_centering') as string,
              }}
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
        /* ⚠️ Segnalato: « cambia di posizione il giornale con l'assessment ». Il Giornale ora
           vive qui (sotto i bottoni dei metodi), l'Assessment nella colonna destra (sotto
           Santé Système) — v. i due contenitori più giù per il perché. Questo controllo
           decideva se "aprire il flusso verso l'alto" quando l'assessment era qui; ora la
           stessa domanda si fa sul Giornale, che ha preso il suo posto. */
        justifyContent: (aperta && moduleVis.journal) ? 'flex-start' : 'center',
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
        {/* ── I BOTTONI, IN UNA COLONNA A SÉ — segnalato: « la zona assessment... deve stare
            sotto il bottone EP, rimonta l'insieme dei bottoni CLOSE THE SESSION ». Il
            contenitore intorno (sopra) è largo quanto l'assessment (« larga la metà », v.
            sotto) per fargli posto SOTTO.
            ⚠️ Segnalato di nuovo: « il bottone Fermer la séance allargalo per avere solo due
            righe ». Stava in un involucro di 148px (deliberatamente più stretto di questa
            colonna, 272px) — con l'orologio a sinistra (v. sotto) il bottone stesso restava
            con appena una novantina di pixel, troppo poco per "FERMER LA SÉANCE" su due
            righe soltanto. 148 → 272, la STESSA larghezza della colonna e della riga dei
            cinque cerchi appena sotto: niente più un involucro suo più stretto. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 272, flexShrink: 0 }}>
        {/* ── L'OROLOGIO, A SINISTRA DEL BOTTONE — segnalato di nuovo: « l'heure et le temps
            de session à gauche du bouton fermer la séance ». Non più impilato SOPRA (giro
            scorso) — una riga vera, l'orologio/tempo compatti a sinistra, il bottone a
            destra: `alignItems:'center'` così i due si allineano sulla stessa linea invece
            che l'uno sopra l'altro. */}
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {/* ⚠️ Segnalato di nuovo: « le scritte dell'ora ed altre non sono le stesse ».
              L'armonizzazione delle taglie (giro scorso) ha piegato ciascun valore VECCHIO nel
              passo più vicino guardando SOLO il numero — 15→base (invariato) e 17→lg (18,
              +1px): la coppia orologio/tempo-seduta, prima scelta apposta vicina (15/17, un
              gradino di 2px), si è ritrovata con un gradino diverso (15/18, 3px) senza che
              nessuno lo decidesse. Sono la STESSA famiglia di informazione (due orologi, uno
              sopra l'altro) — restano sulla stessa taglia, `--s-fs-base`, non due passi
              diversi della scala. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, pointerEvents: 'none', flexShrink: 0 }}>
            <span style={{
              display: 'flex', alignItems: 'center', gap: 3,
              fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-base)', letterSpacing: '0.02em',
              color: 'var(--s-ink-faint)',
            }}>
              <Clock size={13} strokeWidth={1.8} aria-hidden="true" />
              <OraReale />
            </span>
            <span style={{
              display: 'flex', alignItems: 'center', gap: 3,
              fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-base)', letterSpacing: '0.03em',
              color: aperta ? 'var(--s-ink-soft)' : 'var(--s-ink-faint)',
              transition: 'color var(--s-slow) var(--s-ease)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              <Timer size={14} strokeWidth={1.8} aria-hidden="true" />
              {orologio(tempo)}
            </span>
          </div>
          {/* ⚠️ SEGNALATO — « il bottone chiudi la session fallo più verso il giallo, ma poco
              vistoso ». Solo quando DICE "chiudi la seduta" (`aperta` vero — chiudere è il
              gesto che conta, aprire no): una tinta di `--s-reserve` (lo stesso ambra tenue
              già usato per "il dato c'è ma non è sostenibile", il terzo dei tre segnali del
              sistema — v. `tokens.css`) leggerissima sul fondo, un bordo appena percettibile
              — non un rosso d'allarme, un giallo SUSSURRATO: si nota se lo cerchi, non salta
              agli occhi. Aprire una seduta resta il vetro neutro di sempre. */}
          <button className="s-glass s-glass-btn" onClick={aperta ? chiudi : apri} style={{
            flex: 1, minWidth: 0, cursor: 'pointer', pointerEvents: 'auto',
            background: aperta ? 'color-mix(in srgb, var(--s-reserve) 14%, var(--s-disc))' : 'var(--s-disc)',
            border: aperta ? '1px solid color-mix(in srgb, var(--s-reserve) 35%, transparent)' : 'none',
            color: 'var(--s-ink)',
            borderRadius: 16, padding: '12px 8px',
            fontSize: 'var(--s-fs-sm)', letterSpacing: '0.06em', textTransform: 'uppercase',
            fontFamily: 'var(--s-sans)', lineHeight: 1.25, textAlign: 'center',
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
        </div>
        {/* ── PAUSA/RIPRENDI, CON IL SUO STATO ACCANTO — segnalato: « il bottone di pausa
            deve essere vicino al bottone Fermer la séance » (giro scorso), poi: « le pavé en
            pause fais le apparaître à côté du bouton REPRISE ». Il badge "in pausa"/
            "strumento perso" stava nell'angolo dell'arco, lontano dal bottone che la governa
            — ora sulla STESSA riga, a sinistra del bottone Pausa/Riprendi, come l'orologio
            sopra è a sinistra di Chiudi. */}
        {aperta && (
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {pausata && (
              <span className="ser-pulse" style={{
                fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-micro)', fontWeight: 700, letterSpacing: '0.04em',
                padding: '3px 8px', borderRadius: 999, textAlign: 'center', flexShrink: 0,
                background: 'var(--s-reserve)', color: 'var(--s-ground)',
              }}>
                {pausaMotivoRef.current === 'manuale'
                  ? LC('in pausa', 'en pause', 'paused', 'en pausa', 'pausad')
                  : LC('strumento perso', 'instrument perdu', 'instrument lost',
                      'instrumento perdido', 'instrument förlorat')}
              </span>
            )}
            <button
              className="s-glass s-glass-btn"
              onClick={pausaManuale}
              title={(pausata
                ? LC('riprendi la seduta', 'reprendre la séance', 'resume the session', 'reanudar la sesión', 'återuppta sessionen')
                : LC('metti in pausa', 'mettre en pause', 'pause', 'pausar', 'pausa')) as string}
              style={{
                cursor: 'pointer', pointerEvents: 'auto', padding: '10px 10px', borderRadius: 16,
                background: 'var(--s-disc)', display: 'flex', justifyContent: 'center', flexShrink: 0,
                color: pausata ? 'var(--s-alive)' : 'var(--s-ink-soft)',
              }}>
              {pausata ? <Play size={20} strokeWidth={1.8} fill="currentColor" /> : <Pause size={20} strokeWidth={1.8} />}
            </button>
          </div>
        )}
        </div>
        {/* ── EP E PROCEDIMENTI, LA STESSA PICCOLA ZONA — segnalato: « i comandi e le
            indicazioni dei cicli devono stare sotto il perno dell'ago, in larghezza »:
            CONTACT/NULL/MIRROR/TONE (e il campo item che li precede) hanno lasciato questa
            barra laterale per la stessa fascia larga di `PistaCiclo`, sotto il quadrante — v.
            la nota lì per il perché e per dove sono ora. EP resta QUI: a differenza dei
            quattro metodi è visibile SEMPRE a seduta aperta, non solo quando nessun ciclo è
            armato (si registra un EP in qualunque momento) — non avrebbe senso spostarlo
            dentro-e-fuori dalla fascia dei cicli insieme a loro. Stessa cornice sottile del
            Giornale/Assessment/Santé Système (`--s-zone-bg`/`--s-zone-border`).
            ⚠️ PROCEDIMENTI, ACCANTO A EP — segnalato: « il campo Process, toglilo, è
            ridondante col nuovo Comandi Procedimenti; creerei un bottone specifico con icona
            da mettere accanto al bottone EP ». Tolto il campo di testo libero "processo" (v.
            la riga OBIETTIVO/ecc. più giù) — restava un secondo modo di dire la STESSA cosa
            che PROCESSUS→PROCEDIMENTI già dice, scegliendo un comando vero da una lista
            invece di scriverlo a mano. Al suo posto, qui, lo STESSO bottone già in
            intestazione (stessa icona `BookOpen`, stesso `onClick={() =>
            setProcessusAperto(true)}`, stesso contatore `processusPdfs.length`) — una
            scorciatoia in più durante la seduta, non una funzione nuova: PROCESSUS resta
            raggiungibile anche da lassù, per chi lo cerca lì.
            ⚠️ CHIAMALO COMMANDS — segnalato: « il Bottone Processus devi chiamarlo COMMANDS
            e deve aprire processus in generale, ma mettere in evidenza la zona Processu
            Command ». L'etichetta "procedimenti"/"processes" (tradotta via `LC`, come il resto
            di SERENITY) non diceva perché questo bottone esiste QUI, vicino a EP, e non solo
            in intestazione: non un secondo elenco di PDF, la scorciatoia diretta ai comandi di
            un procedimento. "COMMANDS", fissa in maiuscolo come "EP"/"TONE" (mai tradotta — un
            nome proprio della funzione, non una frase), lo dice. Il click resta lo stesso
            (`setProcessusAperto(true)`, l'intero modale PROCESSUS, PDF compresi) — solo la
            sezione COMANDI PROCEDIMENTI dentro di lui si fa notare di più (v. `ProcessusModal`,
            il suo stesso `procedimenti !== undefined`). */}
        {aperta && (
        <div style={{
          display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 10, width: 272,
          background: 'var(--s-zone-bg)', border: '1px solid var(--s-zone-border)',
          borderRadius: 18, padding: 10,
        }}>
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
              fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-micro)', fontWeight: 700, letterSpacing: '0.04em',
              color: ep.epValidated ? 'var(--s-still)' : 'var(--s-ink-faint)',
            }}>{ep.epValidated ? 'EP ✓' : 'EP'}</span>
          </div>
        )}
        {aperta && (
          <div style={{ display: 'grid', justifyItems: 'center', gap: 4, pointerEvents: 'auto' }}>
            <button
              className="s-glass s-glass-btn"
              onClick={() => setProcessusAperto(true)}
              title="COMMANDS" data-help={LC('carica un file di comandi da seguire', 'charge un fichier de commandes à suivre',
                'loads a commands file to follow', 'carga un archivo de comandos a seguir',
                'laddar en kommandofil att följa') as string} style={{
                position: 'relative', width: 54, height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', border: '1.5px solid var(--s-ink-ghost)', borderRadius: '50%',
                background: 'var(--s-disc)', color: 'var(--s-ink-soft)',
              }}>
              <BookOpen size={22} strokeWidth={1.8} aria-hidden="true" />
              {/* ⚠️ IL NUMERO GIUSTO — segnalato: « la pastiglia dei comandi col numero di file
                  della sezione PROCEDURES COMMANDS ». Era `processusPdfs.length` (l'archivio PDF
                  generale, sotto nello stesso modale) — un numero vero ma della sezione
                  SBAGLIATA: questo bottone si chiama COMMANDS proprio per puntare ai
                  PROCEDIMENTI, non ai PDF. `procedimenti.length` (lo stesso array che
                  `ProcessusModal` mostra nella card COMANDI PROCEDIMENTI) è il conteggio giusto. */}
              {procedimenti.length > 0 && (
                <span style={{
                  position: 'absolute', top: -2, right: -2, minWidth: 17, height: 17, borderRadius: 999,
                  background: 'var(--s-ink)', color: 'var(--s-ground)',
                  fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-micro)', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
                }}>{procedimenti.length}</span>
              )}
            </button>
            <span style={{
              fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-micro)', fontWeight: 700, letterSpacing: '0.04em',
              color: 'var(--s-ink-faint)',
            }}>COMMANDS</span>
          </div>
        )}
        </div>
        )}
        {/* ── IL GIORNALE, SOTTO EP — segnalato: « cambia di posizione il giornale con
            l'assessment ». Stava nella colonna destra, sotto Santé Système; l'Assessment stava
            qui, sotto i bottoni dei metodi. Scambiati — stessa logica di entrambi
            (`moduleVis.journal`/`journal.logs`, invariati), solo la POSIZIONE si scambia. Il
            contenitore intorno resta quello di prima (148/272px, v. sopra): la larghezza delle
            due colonne è la stessa, il giornale ci sta esattamente come l'assessment ci stava. */}
        {aperta && moduleVis.journal && (
          <div style={{
            width: '100%', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
            background: 'var(--s-zone-bg)', border: '1px solid var(--s-zone-border)',
            borderRadius: 18, padding: '10px 16px 14px', pointerEvents: 'auto',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexShrink: 0 }}>
              <span style={{ fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-sm)', letterSpacing: '0.12em',
                            textTransform: 'uppercase', color: 'var(--s-ink-faint)' }}>
                {t('ser_journal')}
              </span>
              <button onClick={() => setModuleVis(v => ({ ...v, journal: false }))} style={{
                border: 'none', background: 'none', cursor: 'pointer',
                color: 'var(--s-ink-faint)', fontSize: 'var(--s-fs-lg)', lineHeight: 1, padding: 2,
              }}>×</button>
            </div>
            {/* ⚠️ SEGNALATO: « la police de caractère dans Journal deve essere la stessa che nel
                resto dell'applicazione, per uniformità e meno bianca — è troppo visibile e
                disturba (in DARK), mentre in LIGHT va bene ». Era `--s-mono` — l'UNICA zona
                dell'app a usarlo per il testo corrente (le altre lo riservano a numeri/orari,
                v. il timestamp accanto), mentre tutto il resto (Assessment, PistaCiclo,
                SuggerimentoCiclo…) usa `--s-sans`. Non un colore sbagliato — `--s-ink` è già
                tarato per contrasto in ENTRAMBI i temi (v. `tokens.css`) — ma un font MONOSPAZIO
                ha più inchiostro per carattere di un sans-serif alla STESSA dimensione e
                colore: più "pieno", quindi percepito più chiaro/acceso su un fondo scuro. Lo
                stesso colore, nel font di tutto il resto, si legge già più discreto — la
                doppia richiesta (uniformità + meno bianco) risolta da un solo cambio, non due.
                ⚠️ SEGNALATO DI NUOVO due volte: « la police... più in grigio per non disturbare
                la vista ». Il cambio di font (primo giro) e la discesa a `--s-ink-soft`
                (secondo giro) non bastavano ancora — sceso di un gradino ulteriore, a
                `--s-ink-faint`: lo STESSO grigio già usato per le righe SYS, per il timestamp
                accanto, per l'etichetta del pulsante ✕ qui sopra — non più un colore a parte
                per il testo "importante" (Aud/PC) contro quello "di sistema": tutto il
                giornale allo stesso grigio discreto, la voce di chi parla resta comunque
                distinguibile dal grassetto (`<b>AUD:</b>`/`<b>PC:</b>`), non dal colore.
                ⚠️ BUG TROVATO — segnalato: « nel journal non appare il testo ». La causa vera:
                `.filter(l => !(avvio.solo && ...))` toglieva le righe Aud/PC PROPRIO in seduta
                SOLO (`avvio.solo`, il caso più comune) — pensato per « l'auditor solo non ha
                bisogno di rileggersi » (stessa scelta di `TranscriptLog.tsx`'s `hideSpeech` in
                App.tsx), ma la verbalizzazione è esattamente quel che l'auditor voleva vedere
                qui. Tolto.
                ⚠️ SEGNALATO INSIEME: « poi appaiono troppe informazioni... non mettere visibili
                le reazioni o la dissoluzione, solo il testo con il tono di voce e la reazione
                se c'è sulla parola ». Filtrato a `speaker === 'Aud' || 'PC'` soltanto — NEEDLE
                (le reazioni annunciate a parte) e SYS (l'andamento del ciclo, la "dissoluzione")
                non compaiono più QUI: restano intatti in `journal.logs` (il PDF, gli effetti
                che riempiono l'item alla voce, tutto il resto che li legge, non cambia). Al
                posto delle righe NEEDLE separate: la REAZIONE, quando c'è, si legge ORA
                INSIEME alla parola che l'ha causata — stesso `computeInstantRead` che
                `aggiungiItemManuale`/`cercaLetturaPerParola` già usano altrove in questo file,
                letto all'istante della riga, non una seconda fonte del dato. Il TONO DI VOCE
                (`log.tone`, v. `onTranscript` più sopra — il pezzo che mancava del tutto)
                mostrato con lo STESSO piccolo chip di `TranscriptLog.tsx` (App.tsx), tradotto
                nella lingua di SERENITY. */}
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {[...journal.logs]
                .filter(l => l.speaker === 'Aud' || l.speaker === 'PC')
                .sort((a, b) => (a.time ?? 0) - (b.time ?? 0))
                .reverse()
                .map((log, i) => {
                  const reazione = museOk || meterC
                    ? computeInstantRead(shownReadsRef.current, log.time ?? 0, -Infinity, Infinity,
                        agoEegRef.current ? 'eeg' : 'theta').read
                    : undefined;
                  const reazioneUtile = reazione && reazione !== 'NULL' && reazione !== READ_NON_MISURATO
                    ? reazione : null;
                  return (
                    <div key={i} style={{ display: 'flex', gap: 8, fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-sm)', lineHeight: 1.4 }}>
                      <span style={{ color: 'var(--s-ink-faint)', width: 38, flexShrink: 0 }}>
                        {(log.time || 0).toFixed(1)}s
                      </span>
                      <span style={{ color: 'var(--s-ink-faint)' }}>
                        <b>{log.speaker === 'Aud' ? 'AUD' : 'PC'}: </b>
                        {log.text}
                        {log.tone && (
                          <span style={{
                            marginLeft: 6, fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-micro)',
                            padding: '1px 6px', borderRadius: 999, background: 'var(--s-disc-sunk)',
                            color: 'var(--s-ink-faint)',
                          }}>
                            {(t(`tone_${log.tone.label}` as never) as string || '').toUpperCase()}
                          </span>
                        )}
                        {reazioneUtile && (
                          <span style={{
                            marginLeft: 6, fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-micro)',
                            fontWeight: 700, color: 'var(--s-still)',
                          }}>
                            → {reazioneUtile}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>
      {/* ── L'INTESTAZIONE, che non è una barra ───────────────────────────────────────────
          Nessun fondo, nessuna linea di separazione: il nome sta posato sulla stessa
          superficie di tutto il resto. Una barra è già un pannello. */}
      {/* `flexWrap` — segnalato indirettamente: le pillole di vetro e i cursori scorrevoli sono
          più larghi delle parole nude di prima. Senza, su una finestra stretta gli ultimi
          indicatori uscivano dal bordo invece di andare a capo — persi, non solo compressi.
          ⚠️ BUG TROVATO — segnalato: « CHANGER D'auditeur... e salva questa configurazione, ma
          non funziona ». Riprodotto dal vivo: i clic sul bottone "sauvegarder cette
          configuration" (dentro il popover dell'assetto, `position:absolute, zIndex:40`,
          figlio di QUESTO `<header>`) non arrivavano affatto al bottone —
          `document.elementFromPoint` sul centro esatto del bottone restituiva un `<div>`
          DIVERSO, quello di `<section>` (il quadrante), non il bottone. La causa: `<header>`
          stesso non aveva mai un `position` — un contenitore NON posizionato non stabilisce un
          proprio contesto di sovrapposizione, quindi lo `zIndex:40` del popover (un discendente
          di `<header>`) veniva confrontato non contro `<section>` ma bolliva su fino al primo
          antenato che UN contesto ce l'ha — e `<section>`, che ha `position:'relative'` (per
          il quadrante), vinceva comunque quel confronto essendo lei stessa "posizionata" più in
          basso nell'albero ma elevata di livello. `position:'relative', zIndex:10` qui: ora
          `<header>` (e tutto quel che ci vive dentro, popover incluso) forma il SUO contesto e
          resta sopra `<section>` (che non ha un suo `zIndex` esplicito) per costruzione, non
          per un numero più alto scelto a caso. La STESSA famiglia di bug degli "angoli
          trasparenti" trovata altrove in questo file — un elemento invisibile che ruba il clic
          prima che arrivi a chi dovrebbe riceverlo. */}
      <header ref={headerRef} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 14, rowGap: 10, position: 'relative', zIndex: 10 }}>
        {/* ── LA VISTA SENZA AGO — SPOSTATA SOTTO NEEDLE LIGHT — segnalato: « tu as deplacè
            avec et sans aiguille en haut a gauche. Mets le maintenant sous NEEDLE LIGHT,
            exactement avec la meme forme et la meme logique, plutot que un bouton slide ».
            Non vive più qui nell'header (v. l'angolo in alto a sinistra DELL'ARCO, accanto a
            `taRef`, per il bottone vero — stesso posto di NEEDLE LIGHT, non l'header). Restava
            raggiungibile a ciclo armato ANCHE prima di questo spostamento (quell'angolo non è
            mai stato dentro `{!modalitaCiclo && (...)}`) — la stessa proprietà si eredita
            spostandosi lì, non si perde. */}
        {/* ── MODALITÀ CICLO, IL RESTO DELLA BARRA AMMINISTRATIVA SPARISCE — v. la nota sopra.
            Logo/crediti, tema, lingua, storico, processus, l'assetto: decisi una volta, mai
            bisogno di guardarli con un ago che sta reagendo. Nulla di questo è tolto per
            davvero — l'intero blocco torna intatto appena il ciclo si chiude (`ANNULLA` o un
            esito), la STESSA condizione che già fa ricomparire i cinque cerchi dei metodi. */}
        {!modalitaCiclo && (
        <>
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
        {/* ⚠️ AGGIUNTO — segnalato: « fai apparire sotto SERENITY, vicino al logo, se
            l'interfaccia è BASIC o EXPERT ». `espertoAttivo` (sopra, `avvio?.esperto`) è già
            la stessa fonte che decide MNA/Santé Système/numeri esatti — qui si legge soltanto,
            non un secondo stato. `!== true` conta come BASIC (stessa regola robusta della nota
            grande su `espertoAttivo`/`moduleVis`: una configurazione ancora senza questo campo
            si legge come BASIC, non come EXPERT). Non mostrata prima che l'avvio esista
            (`avvio` nullo, le quattro domande non ancora finite) — dire "BASIC" prima che sia
            davvero deciso sarebbe un'informazione inventata. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontFamily: 'var(--s-serif)', fontSize: 'var(--s-fs-xl)', letterSpacing: '0.14em' }}>
            SERENITY
          </span>
          {avvio && (
            <span style={{
              fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-micro)', fontWeight: 700,
              letterSpacing: '0.12em', color: 'var(--s-ink-faint)',
            }}>
              {espertoAttivo === true ? 'EXPERT' : LC('BASIC', 'BASIQUE', 'BASIC', 'BÁSICO', 'BASIC')}
            </span>
          )}
        </div>
        <span style={{ fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-sm)', color: 'var(--s-ink-faint)' }}>
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
        <button className="s-glass s-glass-btn" onClick={() => setHistoryAperto(true)} title={t('sidebar_history') as string} data-help={t('sidebar_history') as string} style={{
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
                fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-micro)', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
              }}>{n}</span>
            ) : null;
          })()}
        </button>
        <button className="s-glass s-glass-btn" onClick={() => setProcessusAperto(true)} title={t('processus_modal_title') as string} data-help={t('processus_modal_title') as string} style={{
          position: 'relative', cursor: 'pointer', padding: 8, borderRadius: 999,
          background: 'var(--s-disc)', display: 'flex', color: 'var(--s-ink-soft)',
        }}>
          <BookOpen size={22} strokeWidth={1.8} />
          {processusPdfs.length > 0 && (
            <span style={{
              position: 'absolute', top: -4, right: -4, minWidth: 17, height: 17, borderRadius: 999,
              background: 'var(--s-ink)', color: 'var(--s-ground)',
              fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-micro)', fontWeight: 700,
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
        <Divisore />
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
          fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-soft)', display: 'flex', alignItems: 'center', gap: 10,
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
          {/* ── L'ASSETTO, UN'UNICA ICONA — v. la nota su `assettoAperto`, sopra. Prima qui
              c'erano fino a TRE cose sempre in chiaro (interruttore Basic/Expert, cambia-
              persone, salva-configurazione) — le stesse quattro domande che `Avvio.tsx` pone
              UNA VOLTA sola, tornate a vista per tutta la seduta. Nessuna tolta: solo dietro
              un solo gesto in più, non più tutte davanti agli occhi ad ogni sguardo alla
              barra. */}
          <div style={{ position: 'relative' }}>
            <button
              className="s-glass-btn"
              onClick={() => setAssettoAperto(v => !v)}
              title={LC('assetto della seduta — livello, e chi audita', 'réglages de la séance — niveau, et qui audite',
                'session setup — level, and who is auditing', 'ajustes de la sesión — nivel, y quién audita',
                'sessionsinställningar — nivå, och vem som auditerar') as string}
              data-help={LC('assetto della seduta — livello, e chi audita', 'réglages de la séance — niveau, et qui audite',
                'session setup — level, and who is auditing', 'ajustes de la sesión — nivel, y quién audita',
                'sessionsinställningar — nivå, och vem som auditerar') as string}
              style={{
                display: 'flex', alignItems: 'center', border: 'none', background: 'none',
                cursor: 'pointer', padding: 2, color: 'var(--s-ink-faint)', lineHeight: 0,
              }}>
              <SlidersHorizontal size={22} strokeWidth={1.8} aria-hidden="true" />
            </button>
            {assettoAperto && (
              <div className="s-glass s-glass-lift" style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 8, zIndex: 40,
                display: 'flex', flexDirection: 'column', gap: 4, padding: 8,
                borderRadius: 12, background: 'var(--s-disc)', minWidth: 260,
              }}>
                {/* ── LIVELLO — stesso interruttore di prima, in riga invece che compresso
                    dentro la pillola: dice il livello ATTUALE, lo capovolge al tocco. */}
                <button
                  onClick={() => setAvvio(a => a ? { ...a, esperto: !a.esperto } : a)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, border: 'none', background: 'none',
                    cursor: 'pointer', padding: '8px 6px', borderRadius: 8, textAlign: 'left',
                    fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink)',
                  }}>
                  {avvio.esperto
                    ? <Wrench size={20} strokeWidth={1.8} aria-hidden="true" />
                    : <CircleUser size={20} strokeWidth={1.8} aria-hidden="true" />}
                  {avvio.esperto ? t('ser_expert_tag') : t('ser_normal_tag')}
                  <span style={{ marginLeft: 'auto', fontSize: 'var(--s-fs-sm)', color: 'var(--s-ink-faint)' }}>
                    {LC('cambia', 'changer', 'change', 'cambiar', 'ändra')}
                  </span>
                </button>
                {/* ── CAMBIA AUDITOR O PRECLEAR — solo prima di aprire (v. `ricomincia`: chiude
                    anche la rete a distanza, non si fa a metà seduta). */}
                {!aperta && (
                  <button
                    onClick={() => { setAssettoAperto(false); ricomincia(); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, border: 'none', background: 'none',
                      cursor: 'pointer', padding: '8px 6px', borderRadius: 8, textAlign: 'left',
                      fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink)',
                    }}>
                    <UserCog size={20} strokeWidth={1.8} aria-hidden="true" />
                    {t('ser_change_people')}
                  </button>
                )}
                {/* ── SALVA QUESTA CONFIGURAZIONE — stessa azione/stesso stato di prima
                    (`salvaConfigAperto`/`salvaConfigurazione`), solo dentro questo pannello
                    invece che nella sua propria icona a parte nella pillola. */}
                {!aperta && (
                  <>
                    <button
                      onClick={() => { setSalvaConfigAperto(v => !v); setConfigSalvata(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, border: 'none', background: 'none',
                        cursor: 'pointer', padding: '8px 6px', borderRadius: 8, textAlign: 'left',
                        fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink)',
                      }}>
                      <Save size={20} strokeWidth={1.8} aria-hidden="true" />
                      {LC('salva questa configurazione', 'sauvegarder cette configuration',
                        'save this configuration', 'guardar esta configuración', 'spara denna konfiguration')}
                    </button>
                    {salvaConfigAperto && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 6px 8px' }}>
                        <span style={{ fontSize: 'var(--s-fs-sm)', lineHeight: 1.5, color: 'var(--s-ink-faint)' }}>
                          {LC('auditor, preclear, locale/distanza, e gli strumenti connessi in questo momento — tutto insieme.',
                            'auditeur, préclair, local/distance, et les instruments connectés en ce moment — le tout ensemble.',
                            'auditor, preclear, local/distance, and the instruments connected right now — all together.',
                            'auditor, preclear, local/distancia, y los instrumentos conectados ahora mismo — todo junto.',
                            'auditor, preclear, lokal/distans, och instrumenten som är anslutna just nu — allt tillsammans.')}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {/* ⚠️ `autoFocus` — il cassetto si apre già col cursore acceso nel
                              campo, e INVIO salva, lo stesso gesto del campo gemello nel
                              dialogo d'apertura. */}
                          <input
                            autoFocus
                            value={nomeConfigDaSalvare}
                            onChange={e => { setNomeConfigDaSalvare(e.target.value); setConfigSalvata(false); }}
                            onKeyDown={e => { if (e.key === 'Enter' && nomeConfigDaSalvare.trim()) {
                              salvaConfigurazione(nomeConfigDaSalvare, avvio,
                                { muse: museOk, theta: meterC, none: senzaStrumenti || (!museOk && !meterC) }, lang);
                              setConfigSalvata(true);
                            } }}
                            placeholder={LC('nome di questa configurazione…', 'nom de cette configuration…',
                              'name for this configuration…', 'nombre de esta configuración…', 'namn för denna konfiguration…') as string}
                            style={{
                              flex: 1, border: 'none', borderBottom: '1px solid var(--s-ink-ghost)', background: 'none',
                              outline: 'none', fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink)',
                              padding: '2px 4px',
                            }}
                          />
                          <button
                            disabled={!nomeConfigDaSalvare.trim()}
                            onClick={() => {
                              salvaConfigurazione(nomeConfigDaSalvare, avvio,
                                { muse: museOk, theta: meterC, none: senzaStrumenti || (!museOk && !meterC) }, lang);
                              setConfigSalvata(true);
                            }}
                            style={{
                              border: 'none', background: 'none', cursor: nomeConfigDaSalvare.trim() ? 'pointer' : 'default',
                              opacity: nomeConfigDaSalvare.trim() ? 1 : 0.4,
                              fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-soft)', whiteSpace: 'nowrap',
                            }}>
                            {configSalvata
                              ? LC('salvata ✓', 'enregistrée ✓', 'saved ✓', 'guardada ✓', 'sparad ✓')
                              : LC('salva', 'enregistrer', 'save', 'guardar', 'spara')}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </span>
        <Divisore />
        </>
        )}
        {/* ── LE CONNESSIONI, SEMPRE VISIBILI ANCHE IN MODALITÀ CICLO — v. la nota su
            `modalitaCiclo`: qui SOLO i puntini di stato restano leggibili (un disconnessione a
            metà lettura va vista SUBITO).
            ⚠️ Segnalato: « quando abbiamo un ciclo in corso dobbiamo poter attivare uno
            strumento non attivato ». Prima TUTTI i bottoni di connessione si disattivavano in
            modalità ciclo (`onClick` sempre `undefined`) — giusto per non poter STACCARE uno
            strumento a metà lettura (un'interruzione vera, quella resta vietata), sbagliato per
            chi vuole AGGIUNGERNE uno che non c'era: se il MUSE si scollega da solo a metà
            seduta, o si decide di affiancare il Meter, aspettare la fine del ciclo per poterlo
            ricollegare non serve a nessuno. Ora il gesto resta permesso quando lo strumento
            NON è ancora connesso (`!s.connesso`) — disattivato SOLO quando cliccarlo
            DISCONNETTEREBBE uno strumento già attivo durante un ciclo. */}
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
          {/* ⚠️ BUG TROVATO — segnalato: « quando scelgo senza strumenti e poi scelgo ad
              esempio cans, senza strumenti resta attivato ». Vero: scegliere MUSE o METER qui
              non spegneva mai `senzaStrumenti` — solo "NESSUNO" lo toccava (accendendolo E
              spegnendo gli altri due). Il verso opposto mancava: connettere UNO strumento deve
              uscire dal gruppo di controllo, non restarci accanto in silenzio. */}
          // ⚠️ `connesso` — SOLO lo stato ATTIVO/in ascolto di ciascuno strumento, non
          // "ricerca in corso": cliccare durante una ricerca la riprova/annulla, non stacca un
          // dato che sta arrivando davvero. Decide, sotto, quali bottoni restano vivi durante
          // un ciclo (v. la nota sopra, « attivare uno strumento non attivato »).
          const strumenti: Array<{ key: string; icona: React.ReactNode; onClick?: () => void; connesso: boolean; stato: import('./IndicatoreConnessione').StatoConnessione; title: string }> = [
            { key: 'muse', icona: <Headphones size={22} strokeWidth={1.8} />,
              onClick: () => { if (muse.museConnection === 'disconnected') setSenzaStrumenti(false); muse.handleConnectMuse(); },
              connesso: muse.museConnection === 'connected', stato: museStato, title: museTitolo },
            { key: 'meter', icona: <Gauge size={22} strokeWidth={1.8} />,
              onClick: theta.unavailable ? undefined : () => {
                if (!meterC) setSenzaStrumenti(false);
                (meterC ? theta.disconnect : theta.connect)();
              },
              connesso: meterC, stato: meterStato, title: meterTitolo },
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
              // "NESSUNO" non attiva mai uno strumento fermo — al contrario, ne stacca due se
              // acceso: resta un gesto di DISCONNESSIONE a tutti gli effetti, mai permesso a
              // ciclo in corso (v. `connesso` sopra), qualunque sia il suo stato attuale.
              connesso: true, stato: senzaStrumenti ? 'connesso' : 'in-attesa', title: noneTitolo,
            },
          ];
          // ⚠️ AGGIUNTO — segnalato: « selettore strumenti ridotto a un pallino di stato »
          // (una delle quattro proposte accettate, « tutti »). In BASIC, finché l'auditor non
          // lo tocca, le tre pillole diventano UN pallino solo — non un indicatore muto: resta
          // un bottone vero, un click lo espande alla fila intera (che poi resta così, niente
          // riduzione automatica: espandere è una scelta dell'auditor, richiuderla pure). La
          // funzione di CONNETTERE non sparisce mai, si raggiunge in un click in più soltanto
          // finché non si è già cliccato una volta. In EXPERT la fila resta sempre intera,
          // come prima di questa modifica.
          // `!== true`, non `=== false` — v. la nota su `espertoAttivo`/`moduleVis` (« la MNA
          // in basic non deve apparire »): una configurazione salvata senza questo campo
          // (`null`/`undefined`) deve leggersi come BASIC.
          if (espertoAttivo !== true && !strumentiEspansi) {
            const ordinePriorita: Record<string, number> = { connesso: 0, errore: 1, cercando: 2, spento: 3, 'in-attesa': 4 };
            const statoAggregato = strumenti.reduce((peggiore, s) =>
              ordinePriorita[s.stato] < ordinePriorita[peggiore] ? s.stato : peggiore, 'in-attesa');
            const IconaAggregata = strumenti.find(s => s.stato === statoAggregato)?.icona ?? strumenti[0].icona;
            return (
              <button className="s-glass s-glass-btn" onClick={() => setStrumentiEspansi(true)}
                data-help={LC('strumenti — tocca per scegliere MUSE/METER/senza', 'instruments — touche pour choisir MUSE/METER/sans',
                  'instruments — tap to choose MUSE/METER/none', 'instrumentos — toca para elegir MUSE/METER/ninguno',
                  'instrument — tryck för att välja MUSE/METER/inga') as string}
                title={LC('strumenti — tocca per scegliere', 'instruments — touche pour choisir',
                  'instruments — tap to choose', 'instrumentos — toca para elegir',
                  'instrument — tryck för att välja') as string}
                style={{
                  position: 'relative', cursor: 'pointer', padding: 7, borderRadius: 999,
                  background: 'var(--s-disc)', display: 'flex', color: 'var(--s-ink-soft)', border: 'none',
                }}>
                {IconaAggregata}
                <span aria-hidden="true" style={{
                  position: 'absolute', top: 4, right: 4, width: 7, height: 7, borderRadius: '50%',
                  background: COLORE_PUNTO[statoAggregato],
                  boxShadow: (statoAggregato === 'connesso' || statoAggregato === 'errore')
                    ? `0 0 0 2px color-mix(in srgb, ${COLORE_PUNTO[statoAggregato]} 25%, transparent)` : 'none',
                }} />
              </button>
            );
          }
          return (
            <span className="s-glass" style={{
              display: 'flex', alignItems: 'center', gap: 2, background: 'var(--s-disc)',
              borderRadius: 999, padding: '4px 6px',
            }}>
              {strumenti.map(s => {
                const clic = (modalitaCiclo && s.connesso) ? undefined : s.onClick;
                return (
                <button key={s.key} className="s-glass-btn" onClick={clic} title={s.title} data-help={s.title}
                  style={{
                    position: 'relative', border: 'none', background: 'transparent',
                    cursor: clic ? 'pointer' : 'default', padding: 6, borderRadius: 999,
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
                );
              })}
              {/* ⚠️ SEGNALATO: « la percentuale che appare non so cosa sia. Se è l'integrità
                  biometrica deve essere spostata sotto l'icona del MUSE in alto dove si
                  connette ». Vero — `LetturaIntegrita` (un numero nudo, "82%", nessuna parola
                  accanto) viveva nell'angolo dell'arco, lontano da MUSE/METER/NESSUNO a cui
                  appartiene (è la qualità del SUO segnale). Spostata qui, nella stessa pillola
                  — "INT" davanti al numero: mai più un numero senza dire cosa sia, la stessa
                  regola già scritta più volte in questo file. */}
              {museOk && moduleVis.biometric && (
                <span title={t('biometric_integrity') as string} style={{
                  display: 'flex', alignItems: 'baseline', gap: 3, padding: '0 8px 0 2px',
                  fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-micro)', color: 'var(--s-ink-faint)',
                }}>
                  <span style={{ fontSize: 'var(--s-fs-micro)', letterSpacing: '0.06em' }}>
                    {LC('INT', 'INT', 'INT', 'INT', 'INT')}
                  </span>
                  <LetturaIntegrita />
                </span>
              )}
            </span>
          );
        })()}
        {/* ── LA SUA ESPANSIONE — due lattine/lattina sola, le due prove, la taratura TA ──────
            Segnalato: la stessa connessione non deve avere due abitudini diverse (una in alto,
            una in fondo alla pagina) da imparare. Qui, SOLO a meter connesso, una freccia
            accanto al suo stesso indicatore apre `PannelloMeter` come un cassetto ancorato
            proprio lì (`position:absolute`, sotto l'intestazione) — la stessa idea del cassetto
            di CONFIG, non un secondo luogo. */}
        {/* Nascosto in modalità ciclo — la sua taratura si rivede annullando il ciclo, non a
            metà lettura (stessa regola già scritta per la barra amministrativa sopra). */}
        {meterC && !modalitaCiclo && (
          <button className="s-glass s-glass-btn" onClick={() => setMeterSetupAperto(v => !v)} style={{
            cursor: 'pointer', padding: '5px 12px', borderRadius: 999,
            background: 'var(--s-disc)',
            fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-faint)',
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
          <span style={{ fontSize: 'var(--s-fs-base)', color: 'var(--s-reserve)' }}>{hardwareError}</span>
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
            <Divisore />
            <span style={{ fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-sm)', letterSpacing: '0.12em',
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
        {/* ⚠️ BUG TROVATO — segnalato: « il bottone CONFIG deve apparire anche in BASIC per
            poter attivare dei moduli se necessario ». Viveva DENTRO `{!modalitaCiclo && (...)}»
            insieme al resto della barra amministrativa — spariva a ciclo armato, qualunque
            fosse il livello. Il SUO stesso commento originale (« raggiungibile in ogni momento,
            come il cassetto di EQUILIBRIUM ») non era più vero da quando quel wrapper l'ha
            inglobato: proprio in BASIC, dove MNA/Santé Système/numeri restano spenti finché
            non li si riaccende da CONFIG, restare bloccati fuori da CONFIG durante una seduta
            in corso toglie l'unico modo di cambiarli. Portato fuori dal wrapper — sempre
            montato, a qualunque `modalitaCiclo`, come dice il suo stesso commento. Guida/
            assistente IA restano dentro: sono strumenti di lettura, non un cassetto di
            preferenze da riaprire al volo. */}
        <Divisore />
        <button className="s-glass s-glass-btn" onClick={() => setConfigAperto(true)} title={t('config') as string} data-help={t('config') as string} style={{
          cursor: 'pointer', padding: 8, borderRadius: 999,
          background: 'var(--s-disc)', display: 'flex', color: 'var(--s-ink-soft)',
        }}>
          <Settings size={32} strokeWidth={1.6} />
        </button>
        {/* Guida/assistente IA — nascosti in modalità ciclo, come il resto della barra
            amministrativa (v. `modalitaCiclo`): non sono azioni da fare a metà lettura.
            Tornano appena il ciclo si chiude. CONFIG, sopra, non fa più parte di questo
            gruppo (v. la nota lì). */}
        {!modalitaCiclo && (
        <>
        {/* ── L'ASSISTENTE IA, DIETRO UN'ICONA — v. la nota su `aiAperto`, sopra. Segnalato di
            nuovo: « porta l'icona dopo config e prima di guide » — qui, non più dopo Guide
            (posizione di un giro precedente). Un'icona sola (`Brain`, la stessa che
            `AIAssistant` usa per il proprio bottone interno — non un secondo linguaggio da
            imparare), il componente condiviso si monta SOLO da aperto, dentro un popover come
            quello dell'assetto poco più su — chiuso di default, non più sempre a vista. */}
        {aperta && !modalitaCiclo && (
          <div style={{ position: 'relative' }}>
            <button className="s-glass s-glass-btn" onClick={() => setAiAperto(v => !v)}
              title={LC('assistente IA (Gemini)', 'assistant IA (Gemini)', 'AI assistant (Gemini)',
                'asistente IA (Gemini)', 'AI-assistent (Gemini)') as string} style={{
              cursor: 'pointer', padding: 8, borderRadius: 999,
              background: 'var(--s-disc)', display: 'flex', color: 'var(--s-ink-soft)',
            }}>
              <Brain size={32} strokeWidth={1.6} />
            </button>
            {/* ⚠️ Segnalato: « una parte della zona resta fuori dalla finestra ». `left:0`
                faceva crescere il popover verso DESTRA dall'icona — che sta vicino al bordo
                destro dello schermo (fra CONFIG e Guide) — e la barra di `AIAssistant` dentro
                è larga almeno 380px: usciva sicuramente. `right:0`, come il popover
                dell'assetto qui sopra: cresce verso SINISTRA, dentro lo schermo. */}
            {aiAperto && (
              <div className="s-glass s-glass-lift" style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 8, zIndex: 40,
                borderRadius: 12, background: 'var(--s-disc)', padding: 8,
              }}>
                {/* ── STESSO COMPONENTE DI App.tsx, MONTATO TALE E QUALE (legge già
                    `useUiStore` da sé, si adatta al tema di SERENITY senza bisogno di
                    passarglielo): una chiave Gemini propria dell'auditor (mai inviata a
                    SERENITY/EQUILIBRIUM), lo stesso contesto di seduta che App.tsx gli passa —
                    nome/i, tempo, TA, carica, ultima reazione, le ultime righe del giornale.
                    Nascosto in modalità ciclo (v. `modalitaCiclo` sopra) — non è uno strumento
                    per la lettura in corso, e la sua barra di input competerebbe con lo spazio
                    dedicato al campo item del ciclo. */}
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
              </div>
            )}
          </div>
        )}
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
        {/* ── HELP A POST-IT — v. la nota su `AiutoOverlay`/`helpAttivo`, sopra. Bottone A SÉ,
            accanto a GUIDE ma diverso: un click mostra/nasconde le spiegazioni brevi sopra i
            controlli di QUESTA schermata, senza aprire nulla sopra di lei. */}
        <button className="s-glass s-glass-btn" onClick={() => setHelpAttivo(v => !v)}
          title={LC('spiegazioni sui bottoni', 'explications sur les boutons', 'explanations on the buttons',
                    'explicaciones en los botones', 'förklaringar på knapparna') as string}
          style={{
            cursor: 'pointer', padding: 8, borderRadius: 999,
            background: helpAttivo ? 'var(--s-reserve)' : 'var(--s-disc)',
            display: 'flex', color: helpAttivo ? '#1c1408' : 'var(--s-ink-soft)',
          }}>
          <StickyNote size={32} strokeWidth={1.6} />
        </button>
        </>
        )}
        {/* ── LO SPAZIO VUOTO, ORA IN FONDO — segnalato: « les boutons de haut doivent être
            justifiés à gauche à côté du numéro de build ». Lo spazio elastico (`flex:1`) stava
            subito dopo Historique/Processus, spingendo tema/lingua/pillola/connessioni/CONFIG a
            distribuirsi verso destra invece di restare compatti accanto al nome. Spostato qui,
            ultimo elemento: tutto il resto si accoda a sinistra, il vuoto va tutto a destra. */}
        <span style={{ flex: 1 }} />
      </header>
      {guidaAperta && <GuideModal lang={lang} app="serenity" onClose={() => setGuidaAperta(false)} />}
      <AiutoOverlay attivo={helpAttivo} />
      {creditiAperti && (
        <CreditsModal onClose={() => setCreditiAperti(false)}
          appName="SERENITY" appVersion={__SERENITY_VERSION__} />
      )}
      {/* ── L'ANIMAZIONE INIZIALE — v. la nota su `showSplash`, sopra. */}
      {showSplash && <SplashScreen onDismiss={() => setShowSplash(false)} appName="SERENITY" />}
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
              activeProfile={profiliAuditor.find(p => p.id === avvio?.auditorId) ?? null}
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
            procedimenti={procedimenti}
            onSelectProcedimento={p => { setProcedimentoAttivo(p); setProcessusAperto(false); }}
            onApriCartellaProcedimenti={() => { apriCartellaProcedimenti(); }}
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
            <span style={{ fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: '#fff' }}>
              {processusVisualizzato.name}
            </span>
            <button onClick={() => setProcessusVisualizzato(null)} style={{
              border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff',
              borderRadius: 999, padding: '6px 16px', cursor: 'pointer',
              fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)',
            }}>
              {LC('chiudi', 'fermer', 'close', 'cerrar', 'stäng')}
            </button>
          </div>
          <iframe src={processusVisualizzato.url} title={processusVisualizzato.name}
            style={{ flex: 1, border: 'none', borderRadius: 12, background: '#fff' }} />
        </div>
      )}

      {/* ── I COMANDI, ORA A SINISTRA SOTTO L'INTESTAZIONE — segnalato di nuovo: « le scritte
          dei cicli devono essere ora tutte al lato sinistro, sotto il TA, tutte quelle in
          alto » (rispondendo: « dentro la barra laterale esistente »). Questo blocco (l'item, i
          quattro blocchi per metodo con badge/pista/`SuggerimentoCiclo`, i bottoni di
          avanzamento) stava in cima allo schermo, riga orizzontale sopra il quadrante — prima
          ancora, un `<footer>` in fondo alla pagina: due giri, due posti diversi, mai il lato
          sinistro. Ora `position:absolute`, STESSA larghezza (272px) e STESSO bordo sinistro
          (`left:20`) della barra APRI/PAUSA/CONTACT/NULL/MIRROR/TONE appena sotto — una sola
          colonna visiva, non due accostate a caso: il `top` (`comandiTop`) segue `<header>`
          come il `top` di QUELLA barra segue questo blocco (v. la nota sulla "catena a due
          anelli", dove sono dichiarati `headerRef`/`comandiRef`). `flexDirection:'column'`
          sostituisce la vecchia riga orizzontale — ogni gruppo che prima si affiancava
          (badge/item/pista, poi i bottoni) ora si impila, com'è naturale in una colonna
          stretta. Nessuna riga di LOGICA toccata qui dentro: le stesse chiamate al motore,
          lo stesso testo — solo dove e come sta a schermo. */}
      <div ref={comandiRef} className="ser-comandi" style={{
        position: 'absolute', left: 20, top: comandiTop, width: 272, zIndex: 8,
        maxHeight: `calc(100% - ${comandiTop}px - 24px)`, overflowY: 'auto',
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12,
      }}>
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
        {/* ── L'ITEM, LO STATO DELLA VOCE E I QUATTRO METODI — TRASLOCATI — segnalato: « i
            comandi e le indicazioni dei cicli devono stare sotto il perno dell'ago, in
            larghezza ». Vivevano qui (il campo dove scrivere/dire l'item, l'indicazione della
            voce, i quattro cerchi CONTACT/NULL/MIRROR/TONE): spostati nella stessa fascia
            larga di `PistaCiclo`, sotto il quadrante — v. la nota lì (`SceltaMetodo`, il
            fratello di `PistaCiclo` per lo stato "non ancora armato"). Nessuna riga di logica
            toccata: stesso `item`/`setItem`, stesso `journal.addLog` sull'Invio, stessa voce
            (`statoVoce`), stesse quattro chiamate (`armCycle`/`armMirror`/`setToneAttivo`). */}
        {/* ── I BOTTONI VERI DEI CICLI — segnalato di nuovo: « tutte le indicazioni devono
            essere a sinistra con i comandi ed anche i bottoni ». Vivevano qui (l'ULTIMO pezzo
            di UI dei cicli rimasto nella barra in alto, deciso di lasciarlo per essere « un
            bottone vero, non riprodotto ») — ora `bottoniCiclo`, calcolato una sola volta
            PRIMA del `return` del componente (v. lì, poco sopra, per la ragione: tutto ciò che
            gli serve — `tone`/`mirror`/`cycles`/`museGate`/`deltaStar*`/`isLightTheme` — è già
            in scope a quel punto), montato in DUE posti: dentro `PistaCiclo` (con strumenti) e
            dentro il blocco "senza strumenti" (senza) — mai qui. */}
        {/* ── SEGNALATO: « i moduli ASSESSMENT, System Health, Journal, MNA non devono avere
            bottoni, si attivano solamente via CONFIG ». Erano bottoni che aprivano un
            cassetto (`apriMna`/`apriSalute`/`apriGiornale`) sopra la scelta già fatta in
            CONFIG (`moduleVis`) — due controlli per la stessa cosa. Tolti: `moduleVis` da
            solo decide ora se ognuno di questi si vede, esattamente come `ZonaAssessment` fa
            già (nessun bottone, mai avuto). Il conteggio del giornale resta qui, muto, solo
            quando il modulo è spento (altrimenti lo dice già la sua stessa zona, più giù). */}
        {!moduleVis.journal && (
          <span style={{ fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-faint)' }}>
            {t('ser_journal')} · {journal.logs.length} {t(journal.logs.length === 1 ? 'ser_line' : 'ser_lines')}
          </span>
        )}
        {/* EP — spostato sotto TONE, nella barra laterale: v. la nota lì. */}
        {/* Il link « ← changer d'auditeur ou de préclair » è diventato l'icona `UserCog`
            dentro il campo Auditor/PC in alto — segnalato: « CHANGE AUDITOR OR PRECLEAR doit
            être sous forme d'icône... en haut ». Non più qui.
            ⚠️ Lo spaziatore `<span style={{flex:1}}/>` che stava qui (spingeva il resto a
            destra in una riga ORIZZONTALE) è tolto: in una colonna verticale non serve — non
            c'è più un "resto" da spingere altrove. */}
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
      {/* ── MUSE COLLEGATO MA NON INDOSSATO — segnalato: « devi lasciare l'indicazione
          apparente per indicare all'auditor ». Verificato App.tsx: ha un banner dedicato, SEMPRE
          visibile (non solo un `title` al passaggio del mouse — quello esisteva già qui, nel
          pallino di stato della barra in alto, ma un tooltip non si vede senza andarci sopra
          col mouse, e l'auditor guarda il preclear, non l'icona) — stessa condizione
          (`museConnection === 'connected' && !museContact`), stessa scritta (`t('no_contact')`,
          chiave condivisa, già tradotta nelle 5 lingue), qui nella lingua grafica di SERENITY
          (`--s-reserve`, l'ambra di sempre per "attenzione" — non il rosso di App.tsx, la
          STESSA idea nella tavolozza di qui) invece di ricopiare i suoi colori fissi. */}
      {museOk && !museGate.museContact && (
        <div className="ser-pulse" style={{
          position: 'absolute', top: '13%', left: '50%', transform: 'translateX(-50%)',
          zIndex: 6, pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 16px', borderRadius: 999, whiteSpace: 'nowrap',
          background: 'color-mix(in srgb, var(--s-reserve) 16%, transparent)',
          border: '1px solid color-mix(in srgb, var(--s-reserve) 65%, transparent)',
          color: 'var(--s-reserve)', fontFamily: 'var(--s-sans)', fontSize: 12, fontWeight: 700,
          letterSpacing: '0.06em',
        }}>
          <span style={{ fontSize: 14 }}>⚠</span> {t('no_contact') as string}
        </div>
      )}
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
      {/* ⚠️ SEGNALATO DI NUOVO: « les camm devono essere più in alto per guadagnare spazio e
          riduci di 1/4 ». `top:16` → `top:-8`: più vicine al bordo superiore della sezione
          (che comincia già SOTTO l'intestazione/i comandi, v. `<main>` più su — nessun
          rischio di finire sopra di loro). Taglia ridotta di un quarto (× 0,75): 340→255 CAM 2,
          210→158 CAM 1, stessa proporzione di sempre — insieme ai due centimetri guadagnati
          in alto, il quadrante sotto resta libero su una fetta più larga. */}
      {/* ⚠️ Segnalato: « la cam dell'auditor non è necessaria, falla sparire dall'interfaccia
          dell'auditor. Lasciala per le connessioni a distanza ». Verificato in `CameraCerchio`:
          CAM 1 non riceve mai `externalStream` — è SEMPRE la sua webcam locale via
          `getUserMedia`, un autoritratto che non serve a chi lo guarda già di persona. In
          seduta REMOTA lo stesso autoritratto diventa utile (sapere di essere inquadrati per
          la videochiamata, come in Zoom/Meet) — quindi non sparisce del tutto, solo fuori da
          `avvio.distanza`. */}
      {aperta && (cam2Mostrata || cam1Mostrata) && (
        <div style={{
          position: 'absolute', top: -8, right: 32, zIndex: 5,
          display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 16,
          pointerEvents: 'none',
        }}>
          {cam2Mostrata && (
            <CameraCerchio
              dimensione={255}
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
          {cam1Mostrata && (
            <CameraCerchio
              dimensione={158}
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
            sempre, e MNA — v. più giù, TERZO figlio di questa colonna dopo `gruppoAlto`/
            `gruppoBasso` (non più annidato dentro `gruppoBasso`: v. la nota sul suo `flex:'0 0
            auto'`, più giù, per il perché) — diventa un figlio impilato sotto di loro invece di
            un `position:absolute` DENTRO il riquadro dell'arco. */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 16 }}>
        {/* ── L'ULTIMO TERZO IN BASSO, PER I COMANDI — segnalato: « hai ridotto l'ago veramente
            a troppo piccolo. devi utilizzare l'ultimo terzo in basso come altezza per i
            comandi ». Prima l'ago (dentro il wrapper qui sotto) era un semplice figlio
            `flex` fra tanti altri (OBIETTIVO, pista dei cicli, MNA) in questa stessa colonna:
            tutti scalavano insieme quando lo spazio non bastava, ma l'ago — il più alto di
            tutti per via del suo `aspect-ratio` — era quello che perdeva più pixel nello
            scalare (uno `flex-shrink` uguale per tutti tolti PIÙ pixel a chi ne aveva di più
            da dare). Due gruppi ora, non più un'unica colonna piatta: `gruppoAlto` (OBIETTIVO
            + striscia reazioni + l'ago, `flex:'2 1 0%'`) e `gruppoBasso` (pista del ciclo/
            procedimento/scelta metodo, `flex:'1 1 0%'`) — due terzi/un terzo, DAVVERO, non più
            una speranza lasciata al flex-shrink. MNA (v. più giù) non fa più parte di questo
            conto — è un terzo fratello a `flex:'0 0 auto'`, fuori dal rapporto due-terzi/un-
            terzo apposta (segnalato: « hai rialzato il MNA ma hai ridotto di molto la zona
            ago »). `comandiSottoAgo` decide quanto spazio riservare al gruppo basso: quando non
            c'è nulla da mostrare lì (seduta chiusa, o `senzaMisura`) il gruppo basso si azzera
            (`'0 0 0%'`) e l'ago riprende tutto lo spazio — il terzo riservato non è mai vuoto
            sprecato quando non serve. */}
        {(() => {
          // ⚠️ BUG TROVATO — segnalato: « senza strumenti scrive "scegli un metodo" ma non si
          // vede nulla ». `&& !senzaMisura` qui azzerava lo spazio di `gruppoBasso` (sotto,
          // `flex:'0 0 0%'`) ogni volta che `senzaMisura` era vero — una scelta corretta
          // QUANDO fu scritta (senza strumenti, `gruppoBasso` non mostrava altro che il testo
          // di `spiegazioneCiclo`, già duplicato nell'overlay assoluto "DONNE L'ITEM" più giù,
          // quindi zero spazio non toglieva nulla). Da quando i cinque cerchi di scelta metodo
          // vivono DENTRO `gruppoBasso` e restano visibili anche senza strumenti (giro
          // precedente: « senza strumenti non appaiono i cicli, invece devono apparire »),
          // quella premessa non vale più — zero spazio per un contenitore con dentro cinque
          // cerchi veri vuol dire che straboccano sotto di lui, sotto il bordo dello schermo
          // (verificato dal vivo: `document.body.scrollHeight` 1056px contro un
          // `window.innerHeight` di 720px — i cerchi esistevano nel DOM, invisibili). `aperta`
          // da solo, senza la condizione su `senzaMisura`: `gruppoBasso` riceve sempre la sua
          // quota quando la seduta è aperta, che ci siano strumenti o no.
          const comandiSottoAgo = aperta;
          // ⚠️ SEGNALATO: « quand on a le CYCLE en bas l'arc est petit, baisse la position des
          // CICLES pour agrandir l'arc ». Il due-terzi/un-terzo (sopra) era FISSO, uguale a
          // schermo inattivo (i quattro cerchi di scelta, poche righe) e a ciclo ARMATO (tutta
          // la `PistaCiclo` — testo del tempo, ANNULLER/DECLARE AS-IS, conteggio: molto più
          // alta). Un ciclo attivo riceve ora tre quarti invece di due terzi — l'arco cresce
          // proprio quando prima si sentiva più piccolo, perché il gruppo basso gliene cedeva
          // di meno, non di più: non era un errore percettivo, il rapporto non teneva conto se
          // sotto ci fosse poco o molto da mostrare.
          const cicloAttivo = cycles.cycleArmed || mirror.mirrorArmed || toneAttivo || procedimentoAttivo;
          // ⚠️ RITIRATO — segnalato: « hai rialzato il MNA ma hai ridotto di molto la zona
          // ago, non va bene ». Il tentativo precedente (`pesoBasso` fino a 2.4 quando l'MNA
          // era visibile) rubava spazio a `gruppoAlto` per allargare `gruppoBasso` — ma
          // `gruppoBasso` porta anche i cinque cerchi/la pista del ciclo, quindi ingrandirlo
          // ingrandiva loro, non l'MNA, e nel frattempo l'arco (l'unica cosa che l'auditor deve
          // vedere SEMPRE) si restringeva per davvero. Il rimedio giusto non è una quota più
          // grande per `gruppoBasso` — è che l'MNA non viva più DENTRO di lui: v. più giù, ora
          // un terzo fratello di `gruppoAlto`/`gruppoBasso` con la SUA riga (`flex:'0 0 auto'`,
          // fuori dal conto due-terzi/un-terzo), allineato in basso — lo stesso bordo su cui la
          // colonna del Giornale, a sinistra, finisce già. `gruppoBasso` torna al suo peso di
          // sempre.
          return (
        <>
        <div style={{ flex: comandiSottoAgo ? (cicloAttivo ? '3 1 0%' : '2 1 0%') : '1 1 0%', minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        {/* ── OBIETTIVO / STATO FISICO / R-FACTOR — segnalato di nuovo: « devono essere
            presenti in alto in larghezza ». Vivevano infilati nell'angolo in alto a sinistra
            del pannello dell'ago, un campo per riga — spostati in cima a questa stessa colonna
            (`flex:1`, la STESSA larghezza del pannello e della pista dei cicli sotto di lui):
            una riga sola, i campi divisi in parti uguali (`flex:1` ciascuno). Il campo
            "processo" non c'è più (v. la nota sullo stato, sopra — tolto, ridondante col
            bottone Procedimenti accanto a EP).
            ⚠️ SPARISCE DEL TUTTO DOPO 10 SECONDI, SE RIEMPITA — segnalato di nuovo: « fais la
            disparaitre completement [...] elle n'est pas utile qu'elle reste pendant la
            seance ». Prima, scaduto il conto alla rovescia, restava una piccola maniglia
            cliccabile al suo posto (per poterla riaprire) — proprio quella maniglia era
            l'ingombro segnalato: una riga si trasformava in un'altra riga, non spariva. Ora
            `campiSessioneNascosti` non lascia più NULLA al suo posto: i tre campi restano
            comunque scritti (nello stato, nel rapporto) — solo non più a vista. */}
        {aperta && !campiSessioneNascosti && (
          <div style={{
            display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 20,
            width: 'min(96%, 2200px)', maxWidth: '100%', pointerEvents: 'auto',
          }}>
            {([
              [LC('obiettivo', 'objectif', 'objective', 'objetivo', 'mål') as string, sessionObjective, setSessionObjective],
              [LC('stato fisico', 'état physique', 'physical state', 'estado físico', 'fysiskt tillstånd') as string, sessionPhysicalCheck, setSessionPhysicalCheck],
              [LC('r-factor', 'r-factor', 'r-factor', 'r-factor', 'r-factor') as string, sessionBriefing, setSessionBriefing],
            ] as const).map(([etichetta, valore, setValore]) => (
              <div key={etichetta} style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: '1 1 160px', minWidth: 140 }}>
                <span style={{
                  fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-micro)', fontWeight: 700,
                  letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--s-ink-faint)',
                }}>
                  {etichetta}
                </span>
                <input value={valore} onChange={e => setValore(e.target.value)} placeholder={etichetta}
                  style={{
                    border: 'none', borderBottom: '1px solid var(--s-ink-ghost)', background: 'none',
                    outline: 'none', fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-sm)',
                    color: 'var(--s-ink)', padding: '2px 0', width: '100%',
                  }} />
              </div>
            ))}
          </div>
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
          {/* ⚠️ BUG TROVATO — segnalato: « le reazioni del MUSE non si leggono in LIGHT ».
              Portato da App.tsx « TALE E QUALE » un giro fa, comprese le sigle — ma NON il
              colore: App.tsx lo scrive sopra un quadrante SEMPRE scuro (una costante di
              EQUILIBRIUM), e un bianco fisso lì ha sempre contrasto. Qui l'arco cambia fondo
              con `isLightTheme` (« il principio dimensionale »: EQUILIBRIUM detta struttura,
              non colore) — lo stesso bianco fisso, in tema chiaro, finiva su un fondo perla:
              invisibile. `AMBRA` (il Meter) resta la stessa in entrambi i temi — un ambra
              saturo si legge su chiaro e su scuro, la STESSA ragione per cui questa tavolozza
              lo tiene "fuori dai tre segnali tenui" (v. la nota in cima al file). */}
          const BIANCO = isLightTheme ? 'var(--s-ink)' : 'rgba(255,255,255,0.92)';
          const BIANCO_A = isLightTheme ? 'rgba(15,23,42,0.18)' : 'rgba(255,255,255,0.35)';
          const AMBRA = '#f59e0b', AMBRA_A = 'rgba(245,158,11,0.45)';
          const riga = (sigla: string, testo: string, col: string, alone: string) => (
            <span key={sigla} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, lineHeight: 1.1 }}>
              <span style={{ fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-micro)', letterSpacing: '0.1em',
                            color: col, opacity: 0.6, width: 40, textAlign: 'right' }}>{sigla}</span>
              <span style={{ fontWeight: 400, fontSize: 'var(--s-fs-xl)', letterSpacing: '0.14em', color: col,
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
                <span style={{ fontWeight: 400, fontSize: 'var(--s-fs-xl)', letterSpacing: '0.14em', color: col,
                              textShadow: `0 0 12px ${alone}` }}>{solo}</span>
              );
            }
          }
          {/* ⚠️ SEGNALATO: « c'est gênant de déplacer la zone ARC en fonction des réactions,
              elle doit rester figée ». Prima l'altezza di questo riquadro dipendeva dal
              contenuto — `null` (niente riquadro affatto) quando non c'era reazione, 52px o
              28px secondo `reazioniViste` quando c'era: l'arco SOTTO, in una colonna flex, si
              spostava su e giù ogni volta che una reazione appariva/spariva o che si cambiava
              ago guardato. Ora un'altezza FISSA (52px, il caso più alto — due righe MUSE+METER)
              SEMPRE presente a seduta aperta, contenuto o no: l'arco non si muove mai più,
              cambia solo se qualcosa si vede dentro questo riquadro immobile. */}
          return (
            <div style={{
              height: 52,
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
          /* ⚠️ SEGNALATO ANCORA: « lo spazio dell'arco deve essere più grande, fallo occupare
             tutto lo spazio disponibile ». Il tetto in px (2200) non era mai il vero limite:
             con l'`aspect-ratio` 1600/850 (largo quasi 1,9 volte la sua altezza) è la LARGHEZZA
             disponibile — non l'altezza — a decidere la taglia su uno schermo normale (non
             ultra-wide), e quella arriva dal padding di `<main>` e dalla riserva della barra
             laterale, non da questo tetto. Tolto il tetto (era comunque già oltre lo schermo
             tipico) — resta `100%` della larghezza vera lasciata libera qui sotto. */
          width: '100%', aspectRatio: '1600 / 850', maxHeight: '100%',
          borderRadius: 18, overflow: 'hidden', position: 'relative',
          /* ⚠️ Segnalato: « il fondo della zona arc deve essere trasparente ». In chiaro era
             `var(--s-ground)` — LO STESSO colore della pagina, ma un colore PIENO: con uno
             sfondo personalizzato (CONFIG → "importa la tua immagine") copriva comunque
             l'immagine con un rettangolo opaco, invece di lasciarla vedere. Trasparente per
             davvero, ora.
             ⚠️ SEGNALATO DI NUOVO, stavolta anche per lo scuro: « la zona ARC ha sempre un
             fondo. NON LO VOGLIO, VOGLIO CHE SIA TRASPARENTE ». In scuro restava apposta un
             gradiente vero (`#2e2e33`→`#262629`) — la ragione scritta qui sopra per anni («
             l'ago disegna in colori chiari, pensati per un fondo scuro ») si scopre qui non
             regge più da sola: `--s-ground` in scuro è `#17181a`, PIÙ scuro del gradiente che
             lo sostituiva — togliere il gradiente non toglie contrasto all'ago, lo aumenta.
             Trasparente per davvero in ENTRAMBI i temi, ora — resta solo il filo sottile
             (`--s-zone-border`) a dire dov'è il quadrante, come le altre zone.
             ⚠️ Segnalato insieme: « aggrandisci al massimo delle possibilità » — il tetto di
             larghezza (1400px) era più stretto di quanto la riga lasciasse davvero libero
             (la barra laterale e le camere GALLEGGIANO, `position:absolute`: non tolgono
             spazio flex all'arco). Alzato a 2200px — l'`aspectRatio` e `maxHeight:'100%'`
             restano il vero limite su una finestra bassa. */
          /* ⚠️ Segnalato: « il fondo della zona arc deve essere trasparente ». In chiaro era
             `var(--s-ground)` — LO STESSO colore della pagina, ma un colore PIENO: con uno
             sfondo personalizzato (CONFIG → "importa la tua immagine") copriva comunque
             l'immagine con un rettangolo opaco, invece di lasciarla vedere. Trasparente per
             davvero, ora.
             ⚠️ SEGNALATO DI NUOVO, stavolta anche per lo scuro: « la zona ARC ha sempre un
             fondo. NON LO VOGLIO, VOGLIO CHE SIA TRASPARENTE ». In scuro restava apposta un
             gradiente vero (`#2e2e33`→`#262629`) — la ragione scritta qui sopra per anni («
             l'ago disegna in colori chiari, pensati per un fondo scuro ») si scopre qui non
             regge più da sola: `--s-ground` in scuro è `#17181a`, PIÙ scuro del gradiente che
             lo sostituiva — togliere il gradiente non toglie contrasto all'ago, lo aumenta.
             Trasparente per davvero in ENTRAMBI i temi, ora — resta solo il filo sottile
             (`--s-zone-border`) a dire dov'è il quadrante, come le altre zone.
             ⚠️ TEST DIAGNOSTICO « alone bianco » PROVATO E RIPRISTINATO — un giro fa, sostituito
             con `var(--s-ground)` (un vero colore pieno) per riprovare l'ipotesi "nessun colore
             proprio → all'angolo arrotondato trapela quel che sta sotto". L'utente conferma
             dal vivo (screenshot reale): l'alone resta IDENTICO — anche con un vero sfondo
             pieno sotto. Pista esclusa con certezza; tornato a `transparent` com'era, nessuna
             ragione di tenere la regressione (niente più wallpaper personalizzato) per un test
             che non ha funzionato.
             ⚠️ `transform:'translateZ(0)'` TOLTO — QUESTA riga era il sospetto rimasto. Aggiunta
             un giro fa come "rimedio standard" mai dimostrato, forzava QUESTO pannello (l'unico
             di tutta l'app con `background:transparent` + `overflow:hidden` + `borderRadius`)
             sul SUO livello di composizione GPU separato. L'utente conferma con l'ispettore del
             browser aperto sul PUNTO ESATTO dell'alone: il click non seleziona NESSUN elemento
             (« è in arrière plan », sotto tutto il contenuto vero) — e l'alone SI SPOSTA con la
             finestra, e compare IDENTICO sia in Chrome che in Safari. Le mie prove precedenti
             ("rimosso live transform:translateZ(0), l'alone non cambia") giravano nel MIO
             sandbox di test, quasi certamente non macOS — non potevano intercettare un bug del
             compositor di macOS (Core Animation/Window Server), che è sotto ENTRAMBI Chromium e
             WebKit e quindi l'unica spiegazione che regge davvero tutte le prove insieme: stesso
             identico artefatto in due motori di rendering diversi, invisibile a QUALUNQUE
             ispezione DOM/CSS di quel motore (perché non è il motore a disegnarlo), e legato
             alla finestra (perché è il compositor DI QUELLA finestra). Un livello GPU separato
             con angoli arrotondati (`overflow:hidden`+`borderRadius`) e nessun colore proprio a
             riempirlo è la combinazione da manuale per questa classe di bug. Tolto. */
          background: 'transparent',
          /* ⚠️ Segnalato: « togli l'ombra alla zona ARC AGO ». Restava un'ombra di rilievo
             (`--s-shadow`/`--s-shadow-lift`) ereditata da quando il fondo era pieno — con lo
             sfondo ormai trasparente (v. sopra) un'ombra sotto un riquadro senza fondo si legge
             come un bordo scuro extra, non più un rilievo reale. Tolta.
             ⚠️ SEGNALATO DI NUOVO: « toglierei anche il tratto di delimitazione della zona
             ARCO AGO ». Restava il filo sottile (`--s-zone-border`) a dire dove finisce il
             quadrante — con fondo già trasparente e ombra già tolta, quel filo era l'ultimo
             segno che l'arco fosse "un riquadro" invece che l'ago stesso a fluttuare sulla
             superficie di SERENITY. Tolto anche lui: nessun bordo, nessuna ombra, nessun
             fondo — solo il disegno del quadrante. */
          border: 'none',
          boxShadow: 'none',
          transition: 'background var(--s-calm) var(--s-ease)',
        }}>
          {/* ── LE LETTURE, IN ALTO A SINISTRA — segnalato: « la scritta dell'ora e del TA è un
              unico pavé che richiede attenzione per essere letto. Metti l'ora ed il tempo di
              session vicino al bottone FERMER LA SÉANCE (più logico), mentre il MUSE TA, Meter
              TA ecc. lasciali dove sono portandoli al posto dell'ora ». Vero — orologio E TA
              stavano impilati nello stesso blocco, due famiglie di informazione diverse (« che
              ore sono, che seduta è » contro « che cosa legge l'ago ADESSO ») lette come se
              fossero la stessa cosa. L'orologio/tempo di seduta si sono spostati accanto a
              CHIUDI LA SEDUTA (v. la barra laterale, sopra) — QUI restano solo le letture
              dell'ago, salite al posto che l'orologio ha lasciato libero. L'integrità
              biometrica (una percentuale nuda, "non so cosa sia") si è spostata nella pillola
              MUSE/METER/NESSUNO in alto — è la qualità del segnale DI QUELLO strumento, il suo
              posto naturale è lì, non qui. `--s-ink-faint`, non `-ghost` — stessa ragione già
              scritta per il giornale: questo riquadro ha il suo SCHERMO scuro apposta in tema
              scuro, `-ghost` (tarato sul fondo neutro di SERENITY) ci diventava illeggibile.
              ⚠️ `ref={taRef}` — non guida più `PistaCiclo`/`PistaProcedimento` (spostati sotto
              il pannello del quadrante, nel flusso normale della colonna: v. la nota lì):
              resta solo per rendere questa lettura. */}
          <div ref={taRef} style={{
            position: 'absolute', top: 14, left: 16, zIndex: 5,
            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
            pointerEvents: 'none',
          }}>
            {/* ⚠️ Il badge "in pausa"/"strumento perso" si è spostato accanto al bottone
                Pausa/Riprendi nella barra laterale — v. la nota lì (« le pavé en pause fais
                le apparaître à côté du bouton REPRISE »). */}
            {/* ⚠️ Segnalato: « il METER TA deve essere scritto più in grande ed il MUSE TA
                anche ». `LetturaTA`/il "METER TA" (più giù) ereditavano la taglia del blocco
                intero (13px) — la STESSA di fase/Total TA/velocità, che restano dov'erano: qui
                solo la riga del numero principale (`fontSize:21`) cresce, non tutto il blocco. */}
            {agoEeg && (
              <div style={{
                fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-sm)', letterSpacing: '0.03em',
                color: 'var(--s-ink-faint)', display: 'flex', flexDirection: 'column',
                alignItems: 'flex-start', gap: 2,
              }}>
                <span style={{ fontSize: 'var(--s-fs-xl)', fontWeight: 700, color: 'var(--s-ink)' }}>
                  <LetturaTA />
                </span>
                <LetturaFase t={t} />
                {/* ⚠️ ORA DIETRO EXPERT — segnalato: « semplificare al massimo BASIC »,
                    « numeri esatti (TA, %, velocità) ». Il TOTAL TA cumulativo e la velocità
                    sono un secondo livello di lettura (quanto in TUTTO, non quanto ORA) —
                    utile a chi legge il rapporto, non indispensabile a chi sta solo seguendo
                    la seduta. `LetturaTA`/`LetturaFase` sopra (il bisogno DI ADESSO) restano
                    sempre visibili in entrambi i livelli: non sono "un numero in più", sono
                    la lettura stessa. Reversione esplicita della nota precedente qui sopra
                    (« sempre visibili... una scelta esplicita di un giro precedente ») — la
                    richiesta di oggi la sostituisce apposta. */}
                {espertoAttivo && (
                  <>
                    <span title={t('total_ta') as string}>
                      <LetturaTotalTa override={meterC ? theta.totalTa : null} bodyMotion={theta.bodyMotion} />
                    </span>
                    <span title={t('mental_processing_velocity') as string}>
                      <LetturaVelocita t={t} />
                    </span>
                  </>
                )}
              </div>
            )}
            {reazioniViste === 'both' && meterC && agoEeg === false && museOk && (
              <span style={{
                fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-sm)', letterSpacing: '0.03em',
                color: 'var(--s-alive)', display: 'flex', gap: 6, alignItems: 'baseline',
              }}>
                <span style={{ fontSize: 'var(--s-fs-micro)', opacity: 0.75 }}>MUSE</span>
                <span style={{ fontSize: 'var(--s-fs-xl)', fontWeight: 700 }}>
                  <LetturaTA />
                </span>
              </span>
            )}
            {!agoEeg && meterC && (
              <div style={{
                fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-sm)', letterSpacing: '0.03em',
                color: 'var(--s-ink-faint)', display: 'flex', flexDirection: 'column',
                alignItems: 'flex-start', gap: 2,
              }}>
                {/* ⚠️ SEGNALATO DI NUOVO: « che vuol dire nel TA maintenant seguita da un
                    numero? » e « TA 1 boîte → 2 senza nessun numero? ». Il giro scorso aveva
                    aggiunto DUE numeri (`theta.ta`, il riposo, e « adesso → » `theta.taNow`) più
                    la didascalia base — tre righe per un solo dato, un'invenzione SERENITY: letto
                    App.tsx parola per parola (riga "SU CHE COSA SI BASA IL NUMERO"), lì c'è UN
                    SOLO numero — `tone.taMostrato.ta` — SEMPRE quello ADESSO (la funzione lo
                    calcola da `taNow`, non dal riposo: v. `useToneCycle.ts`), con la sua
                    didascalia SUBITO sotto. Nessuna riga « riposo » separata, nessuna freccia:
                    ecco perché la didascalia sembrava "senza numero" — il numero giusto non era
                    quello di sopra (il riposo), non erano allineati. Ora la STESSA unica coppia
                    numero+didascalia di App.tsx, non due invenzioni nuove. */}
                {tone.taMostrato && (() => {
                  /* ⚠️ SEGNALATO ANCORA UNA VOLTA: « devi rendere più chiaro ce que veut dire
                     TA 1 boîte -xx,x vs 2 ». Il giro scorso aveva aggiunto il numero vero dello
                     scarto, ma "TA · 1 lattina −0.34 → 2" resta un telegramma — un numero e
                     una freccia, senza dire CHE COSA succede. Riscritta come una frase vera:
                     "1 lattina, corretta di −0.34 ≈ equivalente a 2 lattine" — "≈ equivalente
                     a" al posto della freccia (una freccia si legge come "sta per diventare",
                     non "vale come se fosse"), il verbo "corretta" a dire che il numero grezzo
                     è già stato aggiustato, non da aggiustare. */
                  const scartoMisurato = theta.setup.offsets?.['solo-can'] ?? 0;
                  const unaLattina = LC('1 lattina', '1 boîte', '1 can', '1 lata', '1 burk');
                  const dueLattine = LC('2 lattine', '2 boîtes', '2 cans', '2 latas', '2 burkar');
                  const corretta = LC('corretta di', 'corrigée de', 'corrected by', 'corregida en', 'korrigerad med');
                  const equivalente = LC('≈ equivalente a', '≈ équivaut à', '≈ equivalent to', '≈ equivalente a', '≈ motsvarar');
                  const divisioneTolta = LC('con 1 divisione tolta', 'avec 1 division retirée', 'with 1 division removed',
                    'con 1 división quitada', 'med 1 delstreck borttaget');
                  return (
                    <>
                      {/* ⚠️ Segnalato: « scrivi METER TA invece di TA » — questa riga vive nel
                          ramo "solo meter, niente ago EEG" (`!agoEeg && meterC`): un "TA" nudo
                          non diceva DI QUALE strumento, importante ora che la lettura dell'ago
                          e quella del meter possono comparire vicine.
                          ⚠️ Segnalato ancora: « il METER TA deve essere scritto più in grande » —
                          stessa taglia (21px) della lettura MUSE qui sopra, non più ereditata
                          dal blocco (13px). */}
                      <span style={{ fontSize: 'var(--s-fs-xl)', fontWeight: 700, color: 'var(--s-ink)' }}>
                        {LC('METER TA', 'METER TA', 'METER TA', 'METER TA', 'METER TA')} {tone.taMostrato.ta.toFixed(2)}
                      </span>
                      <span style={{ fontSize: 'var(--s-fs-micro)', letterSpacing: '0.06em', textTransform: 'none',
                                    color: tone.taMostrato.margin > 0 ? 'var(--s-reserve)' : 'var(--s-ink-ghost)' }}>
                        {tone.taMostrato.basis === 'two-cans'
                          ? LC('TA · 2 lattine', 'TA · 2 boîtes', 'TA · 2 cans', 'TA · 2 latas', 'TA · 2 burkar')
                          : tone.taMostrato.basis === 'solo-measured'
                          ? `${unaLattina}, ${corretta} ${scartoMisurato >= 0 ? '+' : '−'}${Math.abs(scartoMisurato).toFixed(2)} ${equivalente} ${dueLattine}`
                          : `${unaLattina} (${divisioneTolta}) ${equivalente} ${dueLattine}`}
                      </span>
                    </>
                  );
                })()}
                {/* ⚠️ TOLTO — segnalato: « l'indication flotte ou autre, c'est quoi? ». Verificato
                    App.tsx: `theta.fn.fn` alimenta SOLO la logica interna del ciclo TONE
                    (`toneFnNow`/`fnNow`, mai renderizzato a schermo) — questa riga era
                    un'invenzione SERENITY, un'etichetta isolata senza il contesto per capirla.
                    Stessa regola di sempre: riprodurre EQUILIBRIUM, non inventare una lettura
                    che lui stesso non mostra mai. */}
                {/* ⚠️ ORA DIETRO EXPERT — v. la stessa nota sull'altro ramo (ago EEG), poco
                    più sopra: « semplificare al massimo BASIC », « numeri esatti ». */}
                {espertoAttivo && (
                  <span title={t('total_ta') as string}>
                    <LetturaTotalTa override={theta.totalTa} bodyMotion={theta.bodyMotion} />
                  </span>
                )}
              </div>
            )}
            {/* ── NEEDLE LIGHT — segnalato: « manca la possibilità di mettere/togliere la
                scia ». Stessa levetta di App.tsx (`showTrailPref`), stessa condizione — un
                ago da vedere (MUSE o METER) e non MIRROR/TONE, che hanno il loro quadrante e
                nessuna scia da accendere. `pointerEvents:'auto'`: il resto di questo angolo
                è solo lettura (`pointerEvents:'none'` sul contenitore), questo è l'UNICO
                bottone vero qui dentro.
                ⚠️ MAI IN "SENZA AGO" — segnalato: « quando si sceglie senza ago non devi
                mostrare NEEDLE LIGHT ». Giusto: la scia luminosa È l'ago — `VistaSenzaAgo`
                non ne disegna uno, questa levetta non avrebbe nulla su cui agire. */}
            {(agoEeg || meterC) && !mirror.mirrorArmed && !toneAttivo && !vistaSenzaAgo && (
              <button type="button" onClick={() => setShowTrailPref(v => !v)}
                title={LC('NEEDLE LIGHT — la scia luminosa dell\'ago e le etichette di reazione',
                          'NEEDLE LIGHT — la traînée lumineuse de l\'aiguille et les libellés de réaction',
                          'NEEDLE LIGHT — the needle\'s glowing trail and the reaction labels',
                          'NEEDLE LIGHT — la estela luminosa de la aguja y las etiquetas de reacción',
                          'NEEDLE LIGHT — nålens lysande svans och reaktionsetiketterna') as string}
                style={{
                  pointerEvents: 'auto', marginTop: 2, borderRadius: 999, cursor: 'pointer',
                  fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-micro)', fontWeight: 700, letterSpacing: '0.04em',
                  padding: '3px 9px', background: 'transparent',
                  border: '1px solid var(--s-ink-ghost)',
                  color: showTrailPref ? 'var(--s-ink-soft)' : 'var(--s-ink-faint)',
                }}>
                {showTrailPref ? '● ' : '○ '}NEEDLE LIGHT
              </button>
            )}
            {/* ── CON AGO / SENZA AGO — SOTTO NEEDLE LIGHT, STESSA FORMA — segnalato: « tu as
                deplacè avec et sans aiguille en haut a gauche. Mets le maintenant sous NEEDLE
                LIGHT, exactement avec la meme forme et la meme logique, plutot que un bouton
                slide ». Non più uno scivolo a due tappe (`BottoneCiclico`): la STESSA pillola
                di NEEDLE LIGHT qui sopra — bordo sottile, fondo trasparente, un pallino pieno/
                vuoto invece di due icone — e la STESSA logica, un click che cambia stato
                invece di una manopola che scorre.
                ⚠️ ORA ANCHE IN MIRROR E TONE — segnalato: « la scritta con o senza ago deve
                apparire anche nel ciclo MIRROR e TONE ». Prima esclusa lì (`!mirror.mirrorArmed
                && !toneAttivo`, tolto) perché quei due quadranti non rispettavano ancora
                `vistaSenzaAgo` — ora che LO fanno (v. `MirrorDial`/`ToneDial` più giù), il
                bottone deve poterli raggiungere quanto gli altri due metodi.
                ⚠️ LA PAROLA DICE L'AZIONE, NON LO STATO — segnalato: « quando scrivi SENZA AGO
                devi mostrare l'ago, così il bottone indica cosa puoi cambiare ». Prima la
                parola descriveva la vista ATTUALE ("WITHOUT NEEDLE" quando l'ago era già
                nascosto) — comodo da leggere ma diverso da come i bottoni-comando di SERENITY
                si leggono altrove (il testo dice SEMPRE cosa succede al click, mai lo stato
                presente): ora "WITHOUT NEEDLE" compare quando l'ago è ANCORA visibile (click →
                lo nasconde), "WITH NEEDLE" quando è già nascosto (click → lo rimostra). Il
                pallino resta lo stato vero (pieno = ago visibile adesso, vuoto = nascosto) —
                le due cose insieme si leggono come "● [è acceso] — click per: WITHOUT NEEDLE
                [spegnerlo]", non più contraddittorie. */}
            {(agoEeg || meterC) && (
              <button type="button" onClick={() => setVistaSenzaAgo(v => !v)}
                title={LC('con ago / senza ago — la vista del quadrante', 'avec aiguille / sans aiguille — la vue du cadran',
                          'with needle / without needle — the dial view', 'con aguja / sin aguja — la vista del cuadrante',
                          'med nål / utan nål — visningen av urtavlan') as string}
                style={{
                  pointerEvents: 'auto', marginTop: 2, borderRadius: 999, cursor: 'pointer',
                  fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-micro)', fontWeight: 700, letterSpacing: '0.04em',
                  padding: '3px 9px', background: 'transparent',
                  border: '1px solid var(--s-ink-ghost)',
                  color: vistaSenzaAgo ? 'var(--s-ink-soft)' : 'var(--s-ink-faint)',
                }}>
                {vistaSenzaAgo ? '○ WITH NEEDLE' : '● WITHOUT NEEDLE'}
              </button>
            )}
          </div>
          {/* ⚠️ Segnalato: « quando non ci sono strumenti attivi, l'arco deve sparire e le
              scritte dei cicli devono farsi al posto dell'arco, COME IN EQUILIBRIUM ».
              Verificato App.tsx: monta `<QuantumSphere>` SOLO `!senzaMisura` — a seduta
              aperta senza strumenti, un blocco di testo grande (più giù) prende il suo posto.
              Solo `aperta`, non `!aperta`: PRIMA di aprire, l'arco resta — è lì che vive il
              bottone PLAY al centro (v. sotto), un disegno SERENITY che App.tsx non ha. */}
          {/* ── LA VISTA SENZA AGO — chiesto: « non mostri l'ago né l'arco, ma solo i colori di
              CONTACT, DISSOLUTION, AS-IS e la velocità di liberazione ». Al posto di
              `QuantumSphere` (l'ago vero) quando `vistaSenzaAgo` è scelto — v. la nota sul suo
              stato, sopra, e `VistaSenzaAgo.tsx` per il componente. MIRROR e TONE non sono
              toccati (le loro scale non sono "CONTACT/DISSOLUTION/AS-IS", v. la nota nel file
              del componente): l'ago sparisce comunque, `MirrorDial`/`ToneDial` (più giù)
              restano quel che sono, indipendenti da questa scelta. */}
          {!(senzaMisura && aperta) && vistaSenzaAgo && !mirror.mirrorArmed && !toneAttivo && (
            <VistaSenzaAgo
              armed={cycles.cycleArmed}
              cycleKind={cycles.cycleKind}
              nullPhase={cycles.nullPhase}
              isLightTheme={isLightTheme}
            />
          )}
          {!(senzaMisura && aperta) && !(vistaSenzaAgo && !mirror.mirrorArmed && !toneAttivo) && (
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
            /* ⚠️ BUG TROVATO E CORRETTO — stessa famiglia del bug appena sopra in `ToneDial`:
               segnalato di nuovo, « IN TONE... NON É PRESENTE » (e per estensione MIRROR),
               la vera causa a monte era QUI. La condizione di montaggio di `QuantumSphere`
               (poco più su) esclude `vistaSenzaAgo` SOLO quando `!mirror.mirrorArmed &&
               !toneAttivo` — apposta, perché in MIRROR/TONE non esiste una `VistaSenzaAgo`
               sostitutiva (le loro scale non sono CONTACT/DISSOLUTION/AS-IS) e l'arco di
               sfondo deve restare. Ma restando MONTATO, disegnava anche l'AGO — con
               `!agoEeg`/`agoEeg` che non sapevano nulla di `vistaSenzaAgo`, l'ago tornava
               visibile proprio nei due cicli dove "senza ago" doveva valere di più. Ora
               entrambe le sorgenti dell'ago si spengono con `!vistaSenzaAgo`: l'arco/le
               fasce restano (nessuna vista alternativa da inventare), solo la lancetta
               sparisce — lo stesso principio di `hasMeter` in `ToneDial`/`MirrorDial`. */
            thetaOffset={meterC && !agoEeg && !vistaSenzaAgo ? theta.offset : null}
            showEegNeedle={agoEeg && !vistaSenzaAgo}
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
            showTrail={showTrailPref}
            sessionState={aperta ? 'running' : 'idle'}
          />
          )}
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
                fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', fontWeight: 800, letterSpacing: '0.22em',
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
              identici occupano lo stesso rettangolo).
              ⚠️ Stessa condizione di `QuantumSphere` appena sopra — senza strumenti, a seduta
              aperta, nessuno dei tre archi ha un ago da inseguire: sparisce anche lui, insieme
              all'ago, per lo stesso motivo. */}
          {!(senzaMisura && aperta) && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {/* ⚠️ MIRROR E TONE RISPETTANO ORA "SENZA AGO" — segnalato: « il bottone con o
                senza ago deve apparire anche in MIRROR e TONE » (implica: deve avere un
                effetto anche lì) e, per TONE esplicitamente: « se si sceglie senza ago non
                deve apparire [l'ago] ». Prima i due quadranti ignoravano del tutto
                `vistaSenzaAgo` (scelta esplicita di un giro precedente: le loro scale non
                sono CONTACT/DISSOLUTION/AS-IS, nessuna vista alternativa costruita per loro)
                — quella scelta resta (nessun quadrante nuovo inventato qui), ma ora "senza
                ago" per loro vuol dire semplicemente NASCONDERE il disegno dell'ago, non
                sostituirlo: il calcolo dietro (MIRROR: la sola carica EEG; TONE: MUSE se
                connesso, altrimenti il TA del Meter — v. `useToneCycle.ts`, non toccato)
                continua tale e quale, solo senza disegnarne il quadrante. La guida testuale
                di `PistaCiclo` resta comunque a schermo, invariata.
                ⚠️ BUG TROVATO E CORRETTO — segnalato di nuovo: « IN TONE FAI APPARIRE LA
                SCALA DEL TONO... NON É PRESENTE ». La riga sopra descriveva l'intento giusto
                ("nascondere l'ago, non sostituirlo") ma il codice, per TONE, faceva l'esatto
                contrario: `!vistaSenzaAgo` era nella CONDIZIONE DI MONTAGGIO di
                `<ToneDial>`/`<ToneColumn>` (sotto), non nel loro prop `hasMeter` — senza ago
                l'intero quadrante TONO spariva (cade nel ramo `toneAttivo ? null` più giù),
                non solo l'ago. `ToneDial`/`ToneColumn` however GIÀ distinguono i due: il loro
                prop `hasMeter` disegna/non disegna SOLO la lancetta misurata (v.
                `ToneDial.tsx` riga ~152, `{hasMeter && (...)}`) — l'arco, le tacche, la riga
                gialla del "dove si è fermato" e la colonna verticale restano SEMPRE, con o
                senza `hasMeter`. La scala non è mai stata invisibile "senza ago" per un
                calcolo mancante: era il componente intero a non montare. */}
            {mirror.mirrorArmed ? (
              // ⚠️ BUG TROVATO — segnalato: « dans MIRROR sans aiguille les indications du
              // nombre, de l'avancement etc n'apparaissent pas ». `vistaSenzaAgo ? null : (...)`
              // faceva sparire TUTTO `MirrorDial` — non solo un ago, perché MIRROR non ne
              // disegna uno: a differenza di `ToneDial` (una vera lancetta su un quadrante),
              // `MirrorDial` è INTERAMENTE testo e progresso (il valore 1–10, il ×2 da
              // raggiungere, l'anello di avanzamento, "🔒 bloccato", "OTTENUTO") — non c'è
              // nessun disegno d'ago lì dentro da nascondere (v. la nota in testa al file:
              // "juste dans la bande de l'aiguille" è solo il raggio scelto, non un ago vero).
              // La nota qui sopra spiegava l'intento giusto per TONE (nascondere SOLO l'ago,
              // non l'intero quadrante) ma per MIRROR non era mai stato applicato — restava il
              // vecchio `null`, ereditato da prima che quell'intento fosse scritto. Si monta
              // sempre, con o senza ago: non c'è nulla in lui che dipenda dalla scelta.
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
            ) : toneAttivo && (faseCiclo === 'tone.raise' || faseCiclo === 'tone.done') ? (
              <>
                {/* ⚠️ `hasMeter={!vistaSenzaAgo && tone.toneMisurato}`, non `tone.toneHasMeter`
                    (nota di sempre — v. `useToneCycle.ts`: con la priorità « MUSE se c'è,
                    altrimenti Meter, altrimenti dichiarato », `toneHasMeter` resta vero solo
                    col Theta-Meter) — E ora anche `!vistaSenzaAgo`: "senza ago" deve nascondere
                    SOLO la lancetta disegnata, non farla apparire di nuovo qui. L'arco, le
                    tacche e la riga gialla restano comunque (`hasMeter` false non svuota più
                    il quadrante — v. la nota sopra al ramo). */}
                <ToneDial
                  tone={tone.toneOra ?? 0}
                  hasMeter={!vistaSenzaAgo && tone.toneMisurato}
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
                {/* ⚠️ Segnalato ancora: « la scala del tono deve essere molto più grande ed
                    occupare più spazio per essere visibile ». 320px/38%-14% (un giro fa) restava
                    piccola rispetto al resto del quadrante. Allargata (320→460) e alzata di
                    altezza (38%→22% dall'alto, 14%→6% da sotto): l'SVG interno ha il suo
                    `viewBox` proporzionale (`width="100%" height="100%"`), quindi si ridisegna
                    più grande per intero — numeri, nomi dei livelli e cursore compresi — non è
                    un contenitore vuoto attorno a un disegno che resta piccolo. */}
                {/* ⚠️ Segnalato ancora: « sposta la tone scale a sinistra, completamente fuori
                    dalla zona arco ». A `left:12` (relativo a `<section>`, che ha
                    `paddingLeft:320` per la barra laterale) il riquadro (460px di larghezza)
                    finiva comunque a x=472 — 152px OLTRE il bordo dove comincia il disegno
                    vero dell'arco (x=320): lo copriva ancora, solo meno di prima. Il bordo
                    DESTRO deve stare PRIMA di quel confine, non il sinistro dopo un margine
                    fisso — `left:-150` porta il riquadro tutto a x=(-150…310), interamente
                    nella striscia riservata alla barra laterale, mai dentro il quadrante. */}
                <div style={{
                  position: 'absolute', left: -150, top: '22%', bottom: '6%', width: 460,
                  pointerEvents: 'none',
                }}>
                  <ToneColumn
                    tone={tone.toneOra ?? 0}
                    toneEeg={tone.toneOraEeg}
                    margin={tone.margineTono}
                    hasMeter={tone.toneMisurato}
                    lang={lang}
                    charge={museOk ? Math.max(0, Math.min(1, qLnow)) : null}
                    chargeFrom={tone.toneAtStart}
                  />
                </div>
              </>
            ) : toneAttivo ? (
              // ⚠️ TONE ARMATO MA SENZA QUADRANTE — UNA SOLA RAGIONE ORA (era due: la seconda,
              // "senza ago scelto", è stato il bug appena corretto qui sopra — "senza ago" non
              // deve più togliere il quadrante intero, solo la lancetta dentro `ToneDial`).
              // RESISTENZA NON ANCORA DATA — segnalato: « quando il ciclo TONE non è armato,
              // non si deve mostrare il livello della scala del tono ». Un click sul cerchio
              // TONE localizza subito (v. la sua nota, `onClick` più giù) — `toneAttivo`
              // diventa vero PRIMA che l'auditor abbia detto la resistenza, e `faseCiclo` lo sa
              // già (resta `'tone.say_item'`, non `'tone.raise'`, finché `itemNamed` è falso —
              // v. `deriveCyclePhase` in `sessionPhase.ts`, non toccato qui) — un numero
              // calcolato su una resistenza senza nome non deve apparire "già in corso".
              // Nessun arco diverso prende il posto di `ToneDial` (né `ClearDial`, vocabolario
              // sbagliato per TONE): l'indicazione di cosa fare resta comunque a schermo, in
              // `PistaCiclo` (mai gestita qui).
              null
            ) : truth.truthPhase !== 'idle' ? (
              // ⚠️ TROVATO — segnalato: « dans TRUTH tu as laissé NULL RISE EQUILIBRIUM, cela
              // n'est pas bon ». TRUTH non aveva MAI un ramo qui: il ternario cadeva dritto nel
              // ramo di default sotto — lo stesso `<ClearDial cycleKind={cycles.cycleKind}>`
              // del ciclo CONTACT/NULL, con le SUE etichette (mai pensate per un quinto metodo
              // che non esiste nemmeno in EQUILIBRIUM, dove `ClearDial` è nato). Terzo
              // `cycleKind` in `ClearDial.tsx` (v. la sua nota): ACCORD → VÉRITÉ → TEMPS
              // PRÉSENT, tradotto — non termini fissi come CONTACT/NULL.
              // Sempre montato, con o senza ago: `ClearDial` non disegna un ago (proprio come
              // `MirrorDial`, v. la sua stessa correzione più sopra) — `VistaSenzaAgo` non ha
              // un ramo TRUTH da cui "ripetersi", quindi qui nascondere sotto `vistaSenzaAgo`
              // farebbe SPARIRE l'unica vista che TRUTH ha, esattamente il difetto già corretto
              // per MIRROR.
              <ClearDial
                armed
                cycleKind="truth"
                truthDialPhase={
                  truth.truthPhase === 'ri_located' ? 'accord'
                  : truth.truthPhase === 'return_present' ? 'temps_present'
                  : 'verite'   // questioning/candidate/truth_event — un solo blocco, v. la nota
                }
                isLightTheme={isLightTheme}
                lang={lang}
              />
            ) : vistaSenzaAgo ? null : (
              // ⚠️ `ClearDial` (l'anello sottile concentrico all'ago) non ha più motivo di
              // esistere in questa vista: `VistaSenzaAgo`, montata sopra al posto
              // dell'ago, DISEGNA GIÀ le stesse tre zone — un secondo anello qui le
              // ripeterebbe, sovrapposto a un ago che questa vista non mostra.
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
          )}
          {/* ── LA PISTA A FUOCO, SOVRAPPOSTA AL LATO SINISTRO DELL'ARCO — segnalato: « le steps
              devono stare a sinistra dell'arco, senza ridurlo, sovrapposte con trasparenza; il
              comando in corso grande e al centro, i vicini più piccoli e smorzati; l'ago deve
              restare tracciabile sotto ». `PistaCiclo` (nuovo, SOLO SERENITY) legge `mode`/
              `faseCiclo`, le stesse variabili di `CycleSteps` qui sopra nella barra comandi —
              non la sostituisce (quella resta, compatta, nella barra), la affianca come lettura
              grande pensata per restare aperta sopra l'arco per tutto il ciclo. Stessa
              condizione di `QuantumSphere`/dell'arco appena sopra (`!senzaMisura`): senza
              strumenti l'ago non c'è, e sovrapporsi a un arco assente non avrebbe senso — la
              guardia interna del componente (`cur < 0`) copre da sé LIBERO e "ciclo non
              armato".
              ⚠️ Segnalato ancora: « una volta scelto un procedimento (PROCESSUS →
              PROCEDIMENTI), i suoi comandi devono essere inseriti direttamente nello spazio
              comandi dei cicli, ereditando la stessa trasparenza ». Stesso slot, quindi
              esclusivo con `PistaCiclo` — non uno sopra l'altro: `procedimentoAttivo` (scelto
              nel popover di PROCESSUS) prende il posto della pista del ciclo finché l'auditor
              non lo chiude (✕ dentro `PistaProcedimento`). */}
          {/* ── SENZA STRUMENTI, LE SCRITTE PRENDONO IL POSTO DELL'ARCO — segnalato: « COME IN
              EQUILIBRIUM ». Stessa condizione di sopra (`senzaMisura && aperta`), stesso testo
              (`spiegazioneCiclo`, `comeSenzaAgo`/`senzaNumero` appena portati da App.tsx),
              centrato dove l'arco stava — non un contenuto nuovo, il `SuggerimentoCiclo` che
              nella barra comandi (più su) si è appena spento, qui riappare molto più grande:
              è LUI il soggetto dello schermo adesso, non una didascalia sotto un disegno che
              non c'è più.
              ⚠️ Segnalato ancora: « tutte le indicazioni devono essere a sinistra con i
              comandi ed anche i bottoni ». `bottoniCiclo` (calcolato sopra, prima del
              `return`) è lo STESSO montato dentro `PistaCiclo` per chi ha strumenti — qui,
              senza, prende il loro posto: un solo blocco di JSX, due punti di montaggio, mai
              due copie da tenere allineate. */}
          {senzaMisura && aperta && (
            <div style={{
              position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
              zIndex: 4, maxWidth: 560, padding: '0 24px', textAlign: 'center',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, pointerEvents: 'none',
            }}>
              <span style={{
                fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-hero)', fontWeight: 800,
                letterSpacing: '0.02em', lineHeight: 1.15,
                color: spiegazioneCiclo.fatto ? 'var(--s-still)' : 'var(--s-ink)',
              }}>
                {senzaNumero(spiegazioneCiclo.titolo)}
              </span>
              {spiegazioneCiclo.comando && (
                <span style={{ fontFamily: 'var(--s-serif)', fontSize: 'var(--s-fs-lg)', lineHeight: 1.35, color: 'var(--s-ink-soft)' }}>
                  {spiegazioneCiclo.comando}
                </span>
              )}
              <span style={{ fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', lineHeight: 1.5, color: 'var(--s-ink-faint)' }}>
                {comeSenzaAgo(faseCiclo) ?? spiegazioneCiclo.come}
              </span>
              {spiegazioneCiclo.avviso && (
                <span style={{ fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', fontWeight: 700, color: 'var(--s-reserve)' }}>
                  {spiegazioneCiclo.avviso}
                </span>
              )}
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                pointerEvents: 'auto',
              }}>
                {bottoniCiclo}
              </div>
            </div>
          )}
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
          {/* ⚠️ MAI IN "SENZA AGO" — segnalato: « quando abbiamo senza ago, non devi mostrare
              MUSE/METER DEUX ». Stessa ragione di NEEDLE LIGHT qui sopra: questa è la scelta
              di QUALE ago guardare — senza nessun ago disegnato (`VistaSenzaAgo`), la scelta
              non ha più un oggetto.
              ⚠️ MAI DURANTE `metabolicOpen` — segnalato di nuovo: « quando fai il test MUSE
              resta su METER e non vedi l'ago del MUSE ». Il vero ago disegnato è già forzato
              su EEG in quella schermata (`agoEeg = metabolicOpen ? true : ...`, sopra), ma
              `selezionato` qui sotto legge `agoScelto` — la preferenza PERSISTITA da una
              seduta all'altra, mai quella forzata — quindi se l'auditor aveva scelto METER
              l'ultima volta (o l'ha appena provato con le boîtes, il passo PRIMA di questo),
              il selettore continuava a dire "METER" sopra un ago che nel frattempo era già
              quello del MUSE: fuorviante, e per di più CLICCABILE senza effetto (il forzato
              vince comunque). Durante il test del MUSE non c'è più una scelta da fare — si
              nasconde, come NEEDLE LIGHT/MUSE-METER-DEUX in vista senza ago. */}
          {museOk && meterC && !vistaSenzaAgo && !metabolicOpen && (
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
        </div>
        {/* chiude qui `gruppoAlto` (il `</div>` appena sopra) — l'ultimo terzo qui sotto è
            `gruppoBasso`, v. la nota sopra "L'ULTIMO TERZO IN BASSO".
            ⚠️ BUG TROVATO — segnalato: « la prima linea dei comandi non deve essere
            sottostante al bottone CLOSE, perché non si riesce a leggere la domanda » e « quando
            schiacci CLOSE si vede che i comandi sono due volte presenti e si deve schiacciare
            due volte CLOSE ». Non un doppio montaggio (un solo `<PistaCiclo>` nel sorgente,
            verificato) — `justifyContent:'center'` qui, su un contenitore che scrolla
            (`overflow:'auto'`) quando il contenuto (intestazione+item+tempi+indicazioni+bottoni
            di `PistaCiclo`, spesso più alto del terzo riservato) supera l'altezza disponibile:
            CENTRARE contenuto più alto del box lo fa sporgere ugualmente sopra E sotto, ma
            `overflow:'auto'` mostra SOLO quel che sta nel box — la PARTE SOPRA (l'intestazione
            di `PistaCiclo`, col SUO bottone "CHIUDI"/"FERMER"/"CLOSE" — quello confuso col
            bottone della seduta, stesso nome) finiva scrollata fuori dalla vista, senza nessuna
            barra di scorrimento visibile a dirlo: sembrava sparita, o "sotto" qualcos'altro.
            Cliccare alla cieca dove ci si aspettava quel bottone colpiva invece IL TESTO SOTTO
            (la vera prima riga, ora visibile) — da qui la sensazione di doverne cliccare due,
            e di vedere "i comandi due volte" (la riga vera, PRIMA nascosta e poi rivelata dallo
            scroll, sembra un secondo blocco apparso dal nulla). `justifyContent:'flex-start'`:
            il contenuto parte SEMPRE dalla cima del box — la prima riga (l'intestazione, il suo
            bottone di chiusura) è SEMPRE la prima cosa visibile, mai quella scrollata via;
            l'eventuale eccedenza trabocca in basso, dove uno scroll è normale da aspettarsi. */}
        <div style={{ flex: comandiSottoAgo ? '1 1 0%' : '0 0 0%', minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: 16, overflow: comandiSottoAgo ? 'auto' : 'visible' }}>
        {/* ── LA PISTA DEL CICLO, SOTTO IL PUNTO DI ANCORAGGIO DELL'AGO ─────────────────────────
            Segnalato: « i comandi e le indicazioni dei cicli, per più leggibilità, sotto il
            punto di ancoraggio dell'ago, in uno spazio che permetta il più possibile le
            scritte su una riga ». ⚠️ BUG TROVATO spostando: prima questo blocco viveva DENTRO
            il riquadro dell'arco (`overflow:'hidden'`, per i bordi arrotondati del pannello) —
            posizionarlo `position:absolute` con un `top` che supera l'altezza del pannello lo
            tagliava via, invisibile, anche se il DOM (e il testo di pagina) lo conteneva per
            davvero. Qui è un FRATELLO del pannello — non un suo figlio — dentro lo stesso
            involucro `flex:1 column` che li impila: nessuna misura, nessun ref, nessun `top`
            calcolato — il flusso normale della colonna lo mette esattamente dove serve, senza
            poter mai finire tagliato via da un contenitore che non lo aspettava. */}
        {/* ⚠️ BUG TROVATO — segnalato: « senza strumenti i comandi di COMMANDS non appaiono ».
            `!senzaMisura` avvolgeva l'INTERO ramo, `PistaProcedimento` compreso — corretto per
            `PistaCiclo` (la sua guida, senza strumenti, la dà il pannello assoluto "DONNE
            L'ITEM" qui sopra, mostrarlo due volte sarebbe stato ridondante) ma sbagliato per
            `PistaProcedimento`: un procedimento è testo puro letto dall'auditor, senza alcun
            legame con MUSE/METER — nascondersi senza strumenti gli toglieva l'unico posto in
            cui vivere, proprio quando "senza strumenti" è la scelta più comune per chi segue
            un procedimento a voce. `procedimentoAttivo ||` in più: quando un procedimento è
            scelto, si mostra SEMPRE; altrimenti resta la stessa regola di prima per `PistaCiclo`. */}
        {(procedimentoAttivo || !senzaMisura) && (
          procedimentoAttivo
            ? <PistaProcedimento nome={procedimentoAttivo.nome} comandi={procedimentoAttivo.comandi}
                onChiudi={() => setProcedimentoAttivo(null)} lang={lang} />
            : <PistaCiclo mode={mode} phase={faseCiclo} lang={lang}
                item={item} setItem={setItemManuale} itemPlaceholder={t('ser_item_placeholder') as string}
                spiegazione={spiegazioneCiclo} onDichiaraDetto={dichiaraItemDetto}>
                {bottoniCiclo}
              </PistaCiclo>
        )}
        {/* ── NESSUN METODO ANCORA SCELTO — il fratello di `PistaCiclo` per questo stato ──────
            Segnalato: « perché c'è sempre uno spazio con "type or say the item" in alto a
            sinistra? ». Perché viveva SEPARATO dal resto dei comandi del ciclo: prima di
            armare un metodo l'item si scriveva nella barra laterale, in alto a sinistra —
            dopo aver armato, il ciclo (e il SUO item, sola lettura) comparivano altrove (ora,
            sotto il quadrante). Due posti diversi per la STESSA cosa, a due passi di distanza
            uno dall'altro: da qui la sensazione di uno spazio isolato, senza un perché visibile.
            Ora un solo posto, sempre lo stesso: quando NESSUN metodo è armato, questa fascia
            (stessa larghezza/riga di `PistaCiclo`, stesso posto sotto il perno) mostra i
            quattro cerchi dei metodi; appena armato, `PistaCiclo` (sopra) prende il suo posto
            — mai i due insieme, mai una fascia vuota che segnala "manca qualcosa".
            ⚠️ IL CAMPO ITEM, TOLTO DI QUI — segnalato: « quando non ho armato nessun ciclo
            appare sempre ECRIS OU DIS L'ITEM, se scrivi non lo prende e poi non serve. Deve
            apparire quando armi un ciclo. Tanto se vuoi un item lo scrivi in R&I o
            ASSESSMENT ». Vero, e il « non lo prende » aveva una causa precisa: premere Invio
            qui chiamava `setItem('')` SUBITO dopo averlo loggato — svuotava il campo prima
            ancora che l'auditor potesse cliccare CONTACT/NULL/MIRROR/TONE, che a quel punto
            lo trovava già vuoto e ripartiva in modalità voce come se non fosse mai stato
            scritto. Tolto — l'item si scrive ora DENTRO `PistaCiclo`, un `<input>` vero al
            posto del vecchio `<span>` di sola lettura (v. la nota lì), disponibile appena un
            metodo è armato: non prima, perché prima l'auditor ha già R&I/ASSESSMENT per
            annotare un item, un terzo posto per la stessa cosa non aggiungeva nulla. */}
        {/* ⚠️ ANCHE SENZA STRUMENTI — segnalato: « senza strumenti non appaiono i cicli, invece
            devono apparire ». `!senzaMisura` qui escludeva TUTTA questa fascia — quindi anche
            i quattro cerchi di scelta del metodo — proprio nel caso "séance sans instruments"
            dove servono di più: senza di loro, l'auditor non aveva ALCUN modo di armare un
            ciclo (il blocco "senza strumenti" poco sopra mostra solo le SCRITTE di un ciclo
            già armato, `bottoniCiclo` — vuoto finché nessuno lo è). Tolta l'esclusione: i
            cerchi restano identici (`armCycle`/`armMirror`/`setToneAttivo`, mai toccati),
            semplicemente raggiungibili anche senza MUSE/METER connessi. */}
        {/* ⚠️ SEGNALATO E RITIRATO — provato un `|| senzaMisura` per mostrare i cerchi anche a
            procedimento aperto (« nasconde i bottoni dei cicli »), poi corretto dall'auditor
            stesso: « lasci stare, è giusto ». Un procedimento aperto prende il posto di
            `PistaCiclo` di proposito — la stessa esclusività vale con o senza strumenti. */}
        {aperta && !cycles.cycleArmed && !mirror.mirrorArmed && !toneAttivo && truth.truthPhase === 'idle' && !procedimentoAttivo && (
          <>
          {/* ── LA RIGA-GUIDA, ANCHE A RIPOSO — segnalato: « una riga-guida sempre in cima
              anche a riposo » (una delle quattro proposte accettate, « tutti »). Prima,
              a ciclo libero, questi cinque cerchi comparivano SENZA una parola sopra —
              l'unica indicazione era la loro stessa presenza, muta finché non se ne
              armava uno (`spiegazioneCiclo`, il testo che guida DURANTE un ciclo, non
              esiste ancora qui: nessun metodo è scelto). Una riga sola, la stessa idea
              di `spiegazioneCiclo` ma per il momento PRIMA di tutti gli altri: dice cosa
              fare anche quando non c'è ancora niente in corso.
              ⚠️ BUG TROVATO — segnalato: « senza strumenti scrive "scegli un metodo" ma non
              si vede nulla ». `!senzaMisura` qui, aggiunto SUBITO dopo: senza strumenti
              questo intero gruppo (riga + cinque cerchi) vive nel FLUSSO normale del
              documento, sotto il blocco `senzaMisura && aperta` (poco più su) che invece è
              `position:absolute` — quel blocco mostra GIÀ la sua propria guida grande
              ("DONNE L'ITEM" ecc., `spiegazioneCiclo`), quindi la riga qui sarebbe stata
              doppia anche a schermo pieno. Verificato dal vivo: `document.body.scrollHeight`
              (1096px) superava `window.innerHeight` (720px) — la riga in più, sommata al
              resto, spingeva i cinque cerchi sotto al bordo visibile, invisibili benché
              presenti nel DOM. Con strumenti (dove non c'è il blocco `senzaMisura` a
              contendersi lo spazio) la riga resta, verificata correttamente a schermo. */}
          {!senzaMisura && (
          <span style={{
            width: '100%', textAlign: 'center', flexShrink: 0,
            fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', fontWeight: 600,
            letterSpacing: '0.02em', color: 'var(--s-ink-faint)', marginBottom: 2,
          }}>
            {LC('scegli un metodo qui sotto', 'choisis une méthode ci-dessous', 'choose a method below',
                'elige un método aquí abajo', 'välj en metod nedan')}
          </span>
          )}
          <div style={{
            width: 'min(96%, 2200px)', maxWidth: '100%', flexShrink: 0,
            display: 'flex', flexDirection: 'row', flexWrap: 'wrap',
            alignItems: 'center', justifyContent: 'center',
            rowGap: 10, columnGap: 18,
          }}>
            {/* ⚠️ SEGNALATO: « i bottoni dei cicli devono essere meglio differenziati senza
                essere troppo vistosi ». Tre dei quattro usavano già `--s-still`/`--s-alive`/
                `--s-reserve` — I TRE SEGNALI del sistema (v. `tokens.css`: « tre e non dieci,
                un linguaggio di colore che l'auditor deve ricordare è un linguaggio che non
                guarderà »). TONE restava `hue: null` — nessun colore affatto, lo stesso grigio
                spento di un bottone "niente di speciale": non "meno vistoso" degli altri tre,
                semplicemente MENO RICONOSCIBILE, l'opposto di quel che serviva. Dargli uno dei
                tre segnali esistenti gli avrebbe rubato un significato che quel segnale porta
                altrove (vivo/quiete/riserva sono stati, non nomi di metodo) — una QUARTA
                tinta, `--s-tone-hue`, locale a questi quattro cerchi (non un ottavo colore nel
                sistema, non usata altrove): stessa desaturazione/luminosità delle altre tre
                (una via di mezzo fra `--s-reserve` e `--s-alive` sulla ruota, non un colore
                acceso nuovo) — appartiene alla STESSA famiglia quieta, non la rompe.
                ⚠️ « meglio differenziati » anche per i primi tre: prima SOLO il bordo (2px)
                portava la tinta — a un'occhiata veloce sui quattro cerchi vicini, bordi sottili
                di colori tenui si confondono. Aggiunta una tinta di FONDO leggerissima
                (`color-mix`, 12%) oltre al bordo — la stessa idea già usata altrove in
                SERENITY per marcare "questa zona/stato ha un colore" senza riempirla a tinta
                unita: più superficie colorata senza alzare la saturazione di un solo grado. */}
            {([
              { k: 'contact', hue: 'var(--s-still)', label: 'CONTACT', Icona: Crosshair,
                desc: LC('contatto diretto con la carica dell\'item', 'contact direct avec la charge de l\'item',
                  'direct contact with the item\'s charge', 'contacto directo con la carga del ítem',
                  'direktkontakt med objektets laddning') as string,
                onClick: () => { confermaItemSePresente(); cycles.armCycle('charge'); } },
              { k: 'null', hue: 'var(--s-alive)', label: 'NULL', Icona: Scale,
                desc: LC('ciclo speculare: NULL → RISE → EQUILIBRIUM', 'cycle miroir : NULL → RISE → EQUILIBRIUM',
                  'mirror cycle: NULL → RISE → EQUILIBRIUM', 'ciclo espejo: NULL → RISE → EQUILIBRIUM',
                  'spegelcykel: NULL → RISE → EQUILIBRIUM') as string,
                onClick: () => { confermaItemSePresente(); cycles.armCycle('null'); } },
              { k: 'mirror', hue: 'var(--s-reserve)', label: 'MIRROR', Icona: FlipHorizontal2,
                desc: LC('raddoppia il valore fino ad annullarlo', 'double la valeur jusqu\'à l\'annuler',
                  'doubles the value until it cancels out', 'duplica el valor hasta anularlo',
                  'fördubblar värdet tills det upphävs') as string,
                onClick: () => { confermaItemSePresente(); mirror.armMirror(); } },
              // ⚠️ TONE ARMAVA IN DUE TEMPI, GLI ALTRI TRE IN UNO — segnalato: « le cicle TONE
              // contrairement aux autres demande d'appuyer sur un bouton pour donner l'item.
              // ENLEVE LE et fais comme pour les autres cycles ». `armCycle`/`armMirror` (sopra)
              // armano E aprono la cattura dell'item nello STESSO click; TONE apriva solo il
              // pannello (`setToneAttivo(true)`) e aspettava un secondo click, "DAI L'ITEM"
              // (`tone.localizzaTone()`, sotto in `tonePhase==='locate'`) — la stessa asimmetria
              // esiste anche in App.tsx (non un'invenzione di questa sessione), ma qui è
              // un'esplicita richiesta di NON riprodurla. Un click solo, come gli altri tre.
              { k: 'tone', hue: 'var(--s-tone-hue)', label: 'TONE', Icona: AudioWaveform,
                desc: LC('porta la resistenza al tono 40', 'mène la résistance au ton 40',
                  'raises the resistance to tone 40', 'lleva la resistencia al tono 40',
                  'för motståndet till ton 40') as string,
                onClick: () => { confermaItemSePresente(); setToneAttivo(true); tone.localizzaTone(); } },
              // TRUTH — il protocollo di Ron (v. docs/truth-cycle-proposal.md). Un click solo,
              // come gli altri quattro: `locateRI()` arma E apre la cattura del R/I nello
              // stesso gesto (campo vuoto → si aspetta la voce, come tutti gli altri).
              { k: 'truth', hue: 'var(--s-truth-hue)', label: 'TRUTH', Icona: Lightbulb,
                desc: LC('localizza un R/I fino alla verità', 'localise un R/I jusqu\'à la vérité',
                  'locates an R/I until the truth', 'localiza un R/I hasta la verdad',
                  'lokaliserar en R/I till sanningen') as string,
                onClick: () => { confermaItemSePresente(); truth.locateRI(); } },
            ]).map(c => (
              <div key={c.k} style={{ display: 'grid', justifyItems: 'center', gap: 4, flexShrink: 0 }}>
                {/* ⚠️ 50px, non più 54 — segnalato: « non vedo il 5 ciclo ». Con TRUTH il quinto
                    cerchio, cinque a 54px (+ i gap) non stavano più in una riga sola nella
                    colonna centrale a schermi non larghissimi: `flexWrap` (sul contenitore,
                    sopra) mandava il quinto da solo su una seconda riga, dove leggeva come un
                    elemento perso invece che "il quinto metodo accanto agli altri". Un taglio
                    piccolo (54→50px, gap 24→18) basta a farceli stare tutti e cinque insieme. */}
                <button className="s-glass s-glass-btn" onClick={c.onClick} title={c.label} data-help={c.desc} style={{
                  width: 50, height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `1.5px solid ${c.hue}`, cursor: 'pointer',
                  borderRadius: '50%', background: `color-mix(in srgb, ${c.hue} 12%, var(--s-disc))`, color: c.hue,
                }}>
                  <c.Icona size={20} strokeWidth={1.8} aria-hidden="true" />
                </button>
                <span style={{
                  fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-micro)', fontWeight: 700, letterSpacing: '0.04em',
                  color: c.hue,
                }}>{c.label}</span>
                {/* ── DA DOVE SI PARTE SENZA METER — spostato QUI, PRIMA del click su TONE
                    (v. la nota sul suo `onClick`, sopra): armare in un click solo vuol dire
                    che non c'è più una fase di transito in cui scegliere. Ron: il legame
                    tono↔ohm è arbitrario, senza strumento la sorgente è quel che il preclear
                    dichiara — e allora si dà PRIMA, non durante. Col meter non compare: lo
                    propone la misura, come sempre. */}
                {c.k === 'tone' && !tone.toneHasMeter && (
                  <select value={tone.toneAssessed} onChange={e => tone.setToneAssessed(Number(e.target.value))}
                    title={LC('Dove sta il preclear adesso sulla scala', 'Où est le préclair maintenant sur l\'échelle', 'Where the preclear is now on the scale', 'Dónde está el preclear ahora en la escala', 'Var preclearen är nu på skalan') as string}
                    style={{
                      // ⚠️ 140, non più 96 — la scala espansa scrive anche il nome nella
                      // casella chiusa (« +9 · Simpatia », non più solo « +9 »): a 96px il
                      // nome usciva subito troncato.
                      marginTop: 2, maxWidth: 140, borderRadius: 6, border: '1px solid var(--s-ink-ghost)',
                      background: 'var(--s-disc)', outline: 'none', cursor: 'pointer',
                      fontFamily: 'var(--s-mono)', fontSize: 10, color: 'var(--s-ink-soft)', padding: '2px 3px',
                    }}>
                    {/* ⚠️ SCALA ESPANSA — segnalato: « devi mettere anche la denominazione con
                        i numeri, devi dare la scala espansa ». Prima solo i tredici numeri di
                        `TONE_LABELS` (quelli scritti sulla colonna, ridotti apposta per non
                        accavallarsi nel disegno — v. `toneLevels.ts`). Un `<select>` non è un
                        disegno: non c'è un bordo da cui i nomi escono, quindi qui il vincolo
                        non vale e si può dare la scala INTERA, `TONE_LEVELS` — sessantadue
                        livelli, ognuno col suo nome nella lingua della seduta. È lo stesso
                        formato di App.tsx (v. lì, lo stesso select): « numero · nome ». */}
                    {TONE_LEVELS.map(l => (
                      <option key={l.tone} value={l.tone}>
                        {l.tone > 0 ? `+${l.tone}` : `${l.tone}`} · {levelName(l.name, lang)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
          </>
        )}
        {/* chiude qui `gruppoBasso`. */}
        </div>
        {/* ── MNA — TERZO FRATELLO, NON PIÙ FIGLIO DI `gruppoBasso` ──────────────────────────
            Segnalato: « hai rialzato il MNA ma hai ridotto di molto la zona ago, non va bene.
            Il MNA mettilo in basso allineato con il giornale e così aggrandisci l'arco ».
            Viveva DENTRO `gruppoBasso` (v. la nota lì, sopra), che per fargli posto cresceva a
            spese di `gruppoAlto` — l'arco. Ora un terzo figlio di questa stessa colonna
            (`flex:'0 0 auto'`: prende solo l'altezza che gli serve DAVVERO, mai una quota
            pesata) — `gruppoAlto`/`gruppoBasso` tornano al loro rapporto di sempre, senza
            l'MNA a contenderselo, e l'arco riprende la sua taglia intera. Essendo l'ULTIMO
            figlio della colonna (`alignItems:'stretch'` sulla riga a tre colonne, più sopra),
            il suo bordo inferiore cade allo stesso bordo su cui finisce la colonna del
            Giornale, a sinistra — le due colonne condividono la stessa altezza vera.
            `PannelloMna` non è toccato (resta lui a posizionarsi `absolute, left/right:16,
            bottom:16` dentro questo involucro `position:relative`).
            ⚠️ 140, non più 180 — segnalato: « in MIRROR quando c'è l'MNA i numeri di quanto
            carica si vedono solo a metà e si deve scrolling, riduci la zona MNA in altezza,
            che tanto va bene lo stesso ». Questo involucro è `flex:'0 0 auto'`: non si
            restringe MAI sotto la sua `minHeight`, qualunque cosa succeda sopra di lui — in
            MIRROR, dove `gruppoAlto` cresce e la tastiera del valore manuale occupa già
            `gruppoBasso`, quei 40px in più non liberati da nessuno erano esattamente lo
            spazio che mancava. `PannelloMna` stesso è stato ristretto in parallelo (v. la
            sua nota, `padding`/`marginTop`) — 140 lascia comunque un margine reale sopra il
            pannello più stretto, senza sprecare il resto. */}
        {aperta && moduleVis.mna && (
          <div style={{ position: 'relative', width: '100%', maxWidth: 1400, minHeight: 140, flex: '0 0 auto' }}>
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
        {/* chiude qui il `<>` e la IIFE che producono `gruppoAlto`/`gruppoBasso`/MNA insieme. */}
        </>
          );
        })()}
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
            {/* ⚠️ BUG TROVATO verificando dal vivo QUESTO stesso giro: `rightColOpen` (sopra)
                aveva già il cancello `&& museOk`, ma QUESTA condizione — quella che monta
                DAVVERO `<HealthPanel>` — era rimasta la vecchia, senza il cancello: Santé
                Système continuava a comparire nel testo di pagina nonostante il contenitore
                fosse "chiuso". Due condizioni per la stessa cosa, una sola aggiornata — la
                stessa famiglia di bug della duplicazione segnalata nel resoconto. */}
            {aperta && moduleVis.health && museOk && (
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
                  /* ⚠️ Segnalato: « Santé Système devi cambiarlo... renderà meno alta la zona » —
                      v. la nota su `compact` in `HealthPanel.tsx`. Solo SERENITY la chiede. */
                  compact
                  /* ⚠️ BUG TROVATO — segnalato: « quando in LIGHT, il systems HEALTH non si
                      vede niente ». `--s-zone-bg` è `transparent` in ENTRAMBI i temi (v.
                      `tokens.css`) — in scuro restava leggibile per un caso, non per un
                      disegno: `HealthPanel` (condiviso, mai ridipinto) scrive tutto in
                      `text-white/*`, e con fondo trasparente si vedeva la pagina SCURA dietro.
                      In chiaro la stessa trasparenza mostra la pagina CHIARA — bianco su
                      bianco, davvero invisibile. `--s-instrument-bg` (nuovo, v. `tokens.css`,
                      accanto a `--tr-bg` di `ThetaReadyCheck`): fisso, scuro in ENTRAMBI i
                      temi — uno strumento resta uno strumento, non l'inseguimento di uno zoccolo
                      "trasparente" pensato per zone che il proprio testo lo colora da sé
                      (`ZonaAssessment`/Giornale/`PannelloMna`, che RESTANO su `--s-zone-bg`:
                      loro il colore lo seguono, `HealthPanel` no). */
                  panelStyle={extra => ({
                    background: 'var(--s-instrument-bg)',
                    border: '1px solid var(--s-zone-border)',
                    ...extra,
                  })}
                />
              </div>
            )}
            {/* ── L'ASSESSMENT, ORA QUI — segnalato: « cambia di posizione il giornale con
                l'assessment ». Stava sotto i bottoni dei metodi, a sinistra; il Giornale stava
                qui, sotto Santé Système. Scambiati — stessa `ZonaAssessment`, stessi dati
                (`assessAttivo`/`assessItems`, invariati), solo la POSIZIONE si scambia.
                ⚠️ Segnalato: « la zona assessment non deve essere ridotta da non vedere quasi
                più nulla, devi lasciarla ben visibile in altezza ». `maxHeight:'70%'` da solo,
                in una colonna flex con Santé Système sopra (mai limitata, « si deve vedere
                tutta »), lasciava questo `<div>` restringersi (`flex-shrink` di default) fin
                quasi a sparire quando Santé Système era già alta — e `ZonaAssessment` al suo
                interno ha il proprio `overflowY:'auto'`, quindi si comprimeva senza protestare,
                mostrando poco più della sua intestazione. `flexShrink:0` + `minHeight:280`: non
                può più scendere sotto una taglia leggibile, qualunque cosa ci sia sopra — se lo
                spazio proprio non basta, scorre la COLONNA (`overflowY:'auto'`, già lì), non
                lei che si schiaccia. */}
            {aperta && moduleVis.ri && (
              <div style={{ maxHeight: '70%', minHeight: 280, flexShrink: 0, display: 'flex', pointerEvents: 'auto' }}>
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
