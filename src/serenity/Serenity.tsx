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

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMetric, metricsStore } from '../store/metricsStore';
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
import { THETA_LABEL_AFTER_MS } from '../engine/tuning';
import { listaProcedimenti, type Procedimento } from '../lib/procedimenti';
import { metabolicBaseline, type MetabAssessment } from '../engine/MetabolicBaseline';
import { useSessionJournal } from '../session/useSessionJournal';
import { useContactNullCycle, type CycleTick } from '../session/useContactNullCycle';
import { useMirrorCycle } from '../session/useMirrorCycle';
import { useToneCycle } from '../session/useToneCycle';
import { useTruthCycle } from '../session/useTruthCycle';
import {
  loadHistory as loadCanTests, saveHistory as saveCanTests, addTest as addCanTest,
  testedToday, type PcCanHistory,
} from '../engine/canTest';
import { sessionRecorder } from '../engine/SessionRecorder';
import { sessionRecord, cycleRecord, fnRecord, itemRecord, toneRecord, chiaveItem } from '../engine/corpus';
import { corpusWrite, corpusAvailable } from '../lib/corpusWriter';
import { getProfiles, getPcProfiles, saveSession, saveSessionPdf, saveSessionPdfAsync, getAllProcessusFiles } from '../lib/storage';
import { isServerAvailable, serverGetProcessusList, serverProcessusUrl, serverSaveSessionPdf } from '../lib/serverStorage';
import type { ProcessusEntry } from '../components/ProcessusModal';
import { costruisciRiepilogo, generaPdf, type SerenityReportInput } from './sessionReport';
import { Avvio } from './Avvio';
import { type Avvio as StatoAvvio } from './flussoAvvio';
import { PannelloScegliStrumento } from './PannelloScegliStrumento';
import { useI18n } from '../i18n';
import { pick5 } from '../i18n5';
import { useUiStore } from '../store/uiStore';
import { useRemoteSession } from '../hooks/useRemoteSession';
import { useMediaRelayFallback } from '../hooks/useMediaRelayFallback';
import { Connessione } from './Connessione';
import { PannelloEp } from './PannelloEp';
import { PannelloConfig } from './PannelloConfig';
import { ZonaCamere } from './ZonaCamere';
import { ZonaMna } from './ZonaMna';
import { BottoniCiclo } from './BottoniCiclo';
import { Intestazione } from './Intestazione';
import { BarraLaterale } from './BarraLaterale';
import { GruppoAlto } from './GruppoAlto';
import { GruppoBasso } from './GruppoBasso';
import { ControlloProntezza } from './ControlloProntezza';
import { FinestreSovrapposte } from './FinestreSovrapposte';
import { PannelloMeter } from './PannelloMeter';
import { ColonnaSaluteAssessment } from './ColonnaSaluteAssessment';
import { useSerenityModuleStore } from './serenityModuleStore';
import { SplashScreen } from '../components/SplashScreen';
// ⚠️ `GuideModal`/`CreditsModal`/`HistoryModal` (il caricamento `lazy`, con la sua nota storica
// su App.tsx/`jspdf`) — SPOSTATI in `FinestreSovrapposte.tsx` (giro di scomposizione del
// 2026-09-07): erano usati SOLO lì.
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

const MNA_SESSION_VUOTA: MnaSession = {
  cycles: 0, imHistory: [], imSum: 0, imCount: 0, peakIm: 0, finalZone: 'PRIME', totalCopies: 0, phaseLog: [],
};

// ⚠️ `LetturaTA`/`LetturaFase`/`LetturaTotalTa`/`LetturaVelocita` — SPOSTATE in `GruppoAlto.tsx`
// (giro di scomposizione del 2026-09-07): erano usate SOLO nel quadrante dell'ago, ora lì dentro.

// ⚠️ `AiutoOverlay`/`impila`/`POSTIT_W`/`POSTIT_H` — SPOSTATE in `FinestreSovrapposte.tsx`
// (giro di scomposizione del 2026-09-07): erano usate SOLO lì (la modalità HELP a post-it),
// ora dentro quel componente.

// ⚠️ `LetturaIntegrita` — SPOSTATA in `SelettoreStrumenti.tsx` (giro di scomposizione del
// 2026-09-07): era usata SOLO nella pillola MUSE/METER/SENZA STRUMENTI, ora lì dentro.

/** ── IL LAG DI RON E LA % DI DISSOLUZIONE, E TUTTO IL RESTO CHE VA COL CICLO — erano
 *  informazioni dinamiche di EQUILIBRIUM (`CycleStatusBar`, riga sotto la domanda), non solo
 *  il disegno dell'arco. Segnalato di nuovo: « i cicli devono essere disposti esattamente
 *  come in equilibrium, stessi campi » — qui sotto non si reimplementa più a mano un
 *  sottoinsieme (`LetturaCiclo`, tolta: mostrava solo comm-lag e %): si monta `CycleStatusBar`
 *  STESSO, lo stesso componente condiviso che App.tsx usa, coi campi che gli mancavano
 *  (`noReadSignal`, il chip « recharging » del NULL). */

export default function Serenity() {
  const { t, lang, setLang } = useI18n();
  // ⚠️ Stessa nota di App.tsx: `t` reale ha una chiave letterale stretta (~660 varianti) —
  // corretto, ma un paio di componenti dichiarano la propria prop `t` più larga. `tWide`
  // (`t as (key: string) => unknown`) viveva qui per quei punti di passaggio — SPOSTATA in
  // `GruppoAlto.tsx` (giro di scomposizione del 2026-09-07): era usata SOLO lì.
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
  const pausaMotivoRef = useRef<'strumento' | 'manuale' | 'briefing' | null>(null);
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
  /** ⚠️ AGGIUNTO — segnalato: « si potrebbe integrare il dizionario tecnico? ». Un bottone in
   *  più accanto a EP/COMMANDS (v. `DizionarioModal.tsx` per la fonte dei dati e il motivo del
   *  copyright), stesso principio di `processusAperto`: uno stato, un solo modale montato. */
  const [dizionarioAperto, setDizionarioAperto] = useState(false);
  /**
   * ⚠️ AGGIUNTO — segnalato: « il telefono per vedere (camera) e trascrivere (microfono del
   * telefonino) le risposte del PC — c'è già in EQUILIBRIUM, dovrebbe essere facile ». Vero,
   * a metà: `Connessione`/`useRemoteSession` (link, QR, WebRTC, `remote.remoteStream`,
   * `remote.onTrascrizione`) esistono già QUI, per intero — ma erano raggiungibili SOLO
   * rispondendo « a distanza » alla domanda iniziale di `Avvio` (`avvio.distanza`), una scelta
   * fatta UNA volta prima di cominciare, mai più. Il caso segnalato è diverso: una seduta
   * LOCALE (auditor e PC nella stessa stanza — `avvio.distanza === false`) dove il telefono del
   * PC fa solo da camera/microfono AGGIUNTIVI, senza che il MUSE/METER (locali, sull'auditor)
   * ne sappiano nulla. Serve quindi un secondo modo di raggiungere LA STESSA `Connessione`,
   * non un secondo motore di rete, mai.
   * ⚠️ SPOSTATO — primo giro: il gesto viveva DURANTE la seduta già aperta (un bottone sopra
   * CAM 2). Segnalato dal vivo: « non si vede bene lì, dovrebbe stare sotto il bottone di
   * inizio sessione — è lì che si sceglie di connettere un telefonino, non a sessione iniziata
   * ». Lo stato resta lo stesso (un solo overlay, `<Connessione>` sopra tutto), è SOLO il
   * bottone che lo apre a essere salito alla schermata prima dell'apertura — v. la sua nota,
   * vicino al bottone "apri una seduta".
   */
  const [satelliteAperto, setSatelliteAperto] = useState(false);
  /** ⚠️ SEGNALATO DI NUOVO: « quando schiacci sul bottone COMMANDS, devono apparire solo i
   *  file dei comandi, non tutti i processus ». COMMANDS e "Processus" aprono lo STESSO
   *  modale (`setProcessusAperto(true)`, un solo `<ProcessusModal>` montato) — questo stato
   *  dice DA QUALE dei due bottoni si è arrivati, letto dalla nuova prop `soloComandi` del
   *  modale: `true` quando arriva da COMMANDS (nasconde tag/griglia PDF/upload, lascia solo
   *  la card PROCEDIMENTI), `false` da "Processus" (tutto, come sempre — nessun cambiamento
   *  per chi apre da lì). */
  const [processusSoloComandi, setProcessusSoloComandi] = useState(false);
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
  /**
   * ⚠️ AGGIUNTO — segnalato: « ad ogni domanda, accanto, uno spazio per scrivere la risposta
   * dell'auditor / includere la risposta verbale del PC (riconoscimento vocale) ». Tre pezzi:
   *
   *   1. `fuocoProcedimento` — il comando A FUOCO in `PistaProcedimento`, sollevato QUI da uno
   *      `useState` interno a quel componente: la trascrizione del PC (`remote.onTrascrizione`,
   *      sotto) deve sapere SU QUALE comando scrivere, e quello stato vive nel motore della
   *      connessione, non nel componente di sola lettura.
   *   2. `risposteProcedimento` — per ciascun comando (indice), lo stato della sua risposta.
   *   3. `domandeLoggateRef` — un `Set` (non uno stato: serve solo a non ripetere la stessa
   *      domanda nel Giornale se l'auditor torna sul comando già aperto una volta) di quali
   *      indici hanno già ricevuto la loro riga « domanda » nel Giornale.
   *
   * Tutti e tre si azzerano quando un procedimento NUOVO si sceglie (`onSelectProcedimento`,
   * sotto) — mai quando lo stesso resta aperto, altrimenti ogni ridisegno perderebbe le risposte
   * già scritte.
   *
   * ⚠️ CORRETTO — segnalato di nuovo, dopo aver visto la prima versione: « la frase del PC, ma
   * con la possibilità per l'auditor di riscrivere SOPRA, sempre mantenendo la risposta del PC
   * nel Giornale — la risposta del PC si scrive ANCHE nello spazio dove l'auditor può
   * riscrivere ». La prima versione teneva `auditor`/`pc` come due campi indipendenti: il campo
   * visibile mostrava `pc` SOLO finché `auditor` restava vuoto, e la prima lettera digitata lo
   * sostituiva con un testo ripartito da zero — non « riscrivere sopra » la frase del PC, ma
   * ricominciare accanto a lei. Ora `auditor` PARTE dalla trascrizione e la SEGUE dal vivo
   * (mentre il PC continua a parlare, il campo si aggiorna) finché l'auditor non lo tocca
   * (`modificato`, sotto): da quel momento è la SUA versione, editabile liberamente, e nuove
   * parole del PC non la sovrascrivono più. `pc` resta SEMPRE il testo grezzo, intatto, per il
   * Giornale — indipendentemente da quanto l'auditor riscrive sopra la sua copia.
   */
  const [fuocoProcedimento, setFuocoProcedimentoStato] = useState(0);
  const [risposteProcedimento, setRisposteProcedimento] = useState<Record<number, { auditor: string; pc: string; modificato: boolean }>>({});
  const risposteProcedimentoRef = useRef(risposteProcedimento); risposteProcedimentoRef.current = risposteProcedimento;
  const domandeLoggateRef = useRef<Set<number>>(new Set());
  /** Scrive nel Giornale le risposte accumulate per UN comando. La trascrizione del PC, se
   *  arrivata, sempre — è il dato grezzo, intatto. La versione dell'auditor SOLO se `modificato`
   *  è vero: se l'auditor non ha toccato nulla, `auditor === pc` (la segue dal vivo, v. la nota
   *  grande sopra) e scriverla una seconda volta sarebbe un doppione puro, non una seconda
   *  informazione. */
  const committaRispostaProcedimento = useCallback((indice: number) => {
    const r = risposteProcedimentoRef.current[indice];
    if (!r) return;
    if (r.pc.trim()) journal.addLog({ speaker: 'PC', text: r.pc.trim(), time: sessionClock.now() });
    if (r.modificato && r.auditor.trim()) {
      journal.addLog({
        speaker: 'Aud', type: 'highlight', time: sessionClock.now(),
        text: LC('↳ risposta del PC (riscritta dall\'auditor): ', '↳ réponse du PC (réécrite par l\'auditeur) : ',
                  '↳ PC\'s response (rewritten by the auditor): ', '↳ respuesta del PC (reescrita por el auditor): ',
                  '↳ PC:s svar (omskrivet av auditören): ') + r.auditor.trim(),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journal]);
  /**
   * Sposta il fuoco fra i comandi del procedimento — MAI un `setFuocoProcedimento` diretto
   * altrove: passando da un comando all'altro si COMMITTA prima la sua risposta (se c'è
   * qualcosa da scrivere), altrimenti lasciarlo silenzioso finché il procedimento non si
   * chiude terrebbe le risposte intermedie fuori dal Giornale fino all'ultimo comando.
   *
   * ⚠️ BUG TROVATO verificando dal vivo — la riga di commit compariva DUE VOLTE nel Giornale.
   * Causa: `committaRispostaProcedimento` (un EFFETTO — scrive nel Giornale) viveva dentro
   * l'updater funzionale di `setFuocoProcedimentoStato`. React può richiamare un updater più
   * di una volta per lo stesso aggiornamento (StrictMode in sviluppo lo fa apposta, per
   * scovare esattamente questo: un effetto che non dovrebbe stare lì) — un secondo richiamo
   * scriveva la stessa riga una seconda volta. `fuocoProcedimento` letto DIRETTAMENTE dalla
   * chiusura (non da dentro l'updater) e il commit spostato FUORI, prima di `setState`: un
   * gesto dell'auditor (il clic), non un ricalcolo di stato che React possa ripetere.
   */
  const impostaFuocoProcedimento = useCallback((indice: number) => {
    if (indice !== fuocoProcedimento) committaRispostaProcedimento(fuocoProcedimento);
    setFuocoProcedimentoStato(indice);
  }, [fuocoProcedimento, committaRispostaProcedimento]);
  /** La prima volta che l'auditor apre lo spazio risposta di un comando (schiaccia/si posiziona
   *  su di esso — v. la richiesta), la SUA domanda entra nel Giornale. Una volta sola per
   *  comando: tornarci sopra una seconda volta non deve ripeterla. */
  const apriRispostaProcedimento = useCallback((indice: number) => {
    if (domandeLoggateRef.current.has(indice)) return;
    domandeLoggateRef.current.add(indice);
    const comando = procedimentoAttivo?.comandi[indice];
    if (!comando) return;
    journal.addLog({ speaker: 'Aud', text: comando.testo, time: sessionClock.now() });
  }, [journal, procedimentoAttivo]);
  /** L'auditor tocca il campo — da qui in poi è la SUA versione: `modificato:true` lo
   *  distacca dalla trascrizione dal vivo (v. la nota grande sopra), e lo tiene per il resto
   *  di questo comando, anche se il PC continua a parlare. */
  const scriviRispostaProcedimento = useCallback((indice: number, valore: string) => {
    setRisposteProcedimento(prev => ({
      ...prev, [indice]: { auditor: valore, pc: prev[indice]?.pc ?? '', modificato: true },
    }));
  }, []);
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
   * ⚠️ AGGIUNTO (revisione dei calcoli TONE, 01/09/2026) — su quale passo aprire `PannelloMeter`
   * la PROSSIMA volta. `undefined` → il suo default ('config'), come il bottone "configura il
   * meter" ha sempre fatto — v. `passoIniziale` in `PannelloMeter.tsx`.
   * ⚠️ Il bottone "rifai la prova delle lattine", vicino al TONE, che poneva questo passo a
   * `'stretta'` prima di aprire, è stato tolto (segnalato: « era un colpo isolato, l'auditor
   * non capisce, non è interessante averlo » — v. la nota al suo vecchio punto di montaggio).
   * `'stretta'` resta un valore valido del tipo, semplicemente niente lo imposta più da qui.
   */
  const [meterSetupPasso, setMeterSetupPasso] = useState<'config' | 'stretta' | 'respiro' | 'taratura' | undefined>(undefined);
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
    // ⚠️ CORRETTO — segnalato: « includi la risposta verbale del PC (riconoscimento vocale)
    // nello spazio della domanda a fuoco ». Con un procedimento aperto, la trascrizione non va
    // più SUBITO nel Giornale: si accumula nella risposta del comando A FUOCO adesso
    // (`fuocoProcedimento`), e sarà `committaRispostaProcedimento` a scriverla — una volta sola,
    // quando l'auditor passa al comando successivo o chiude — altrimenti la STESSA frase
    // finirebbe nel Giornale due volte (qui, subito; e di nuovo al commit). Senza procedimento
    // aperto, il comportamento di sempre: una conversazione a distanza normale, riga per riga.
    // ⚠️ `procedimentoAttivo`/`fuocoProcedimento` DIRETTI, non un ref — `useRemoteSession`
    // rispecchia già questa funzione in un ref ad OGNI render (`onTrascrizioneRef.current =
    // opts.onTrascrizione`, senza array di dipendenze): la chiusura qui è già quella
    // dell'ultimo render, un secondo specchio sarebbe ridondante.
    // ⚠️ CORRETTO — segnalato: « la risposta del PC si scrive ANCHE nello spazio dove l'auditor
    // può riscrivere ». `auditor` segue `pc` dal vivo finché non è `modificato` (v. la nota
    // grande su `risposteProcedimento`, sopra) — non resta un secondo campo che compare solo
    // se quello dell'auditor è vuoto: È il campo dell'auditor, semplicemente non ancora toccato.
    onTrascrizione: testo => {
      if (procedimentoAttivo) {
        setRisposteProcedimento(prev => {
          const attuale = prev[fuocoProcedimento] ?? { auditor: '', pc: '', modificato: false };
          const pc = attuale.pc ? `${attuale.pc} ${testo}` : testo;
          const auditor = attuale.modificato ? attuale.auditor : pc;
          return { ...prev, [fuocoProcedimento]: { auditor, pc, modificato: attuale.modificato } };
        });
      } else {
        journal.addLog({ speaker: 'PC', text: testo, time: sessionClock.now() });
      }
    },
    // ⚠️ AGGIUNTO — un canale A PARTE da `onTrascrizione`, apposta: una riga diagnostica di
    // sistema (« camera del PC: N video, N audio ») deve finire SEMPRE nel Giornale, mai
    // dentro l'accumulo di risposta di un comando (quello che `onTrascrizione` fa quando
    // `procedimentoAttivo`) — non è una parola del PC, è un rapporto sulla connessione.
    onDiagnostica: testo => {
      journal.addLog({ speaker: 'SYS', text: testo, time: sessionClock.now() });
    },
  });
  // ⚠️ AGGIUNTO — segnalato dal vivo: « non vedo né la video a distanza dell'auditor né quella
  // del PC » (v. la nota grande in `useRemoteSession.ts`). `App.tsx` monta SEMPRE questo hook —
  // qui mancava del tutto: senza, un WebRTC che non riesce a stabilirsi (rete che blocca ICE/
  // TURN) lasciava SERENITY senza alcun ripiego, mentre EQUILIBRIUM sarebbe passato ai
  // fotogrammi JPEG di scorta. Non richiede parametri: legge da sé `videoFallbackActive` dallo
  // store condiviso (`useNetworkStore`, già alimentato sopra da `remote.*`) e la propria camera
  // (`networkManager.localStream`, la stessa che questa pagina già cattura per CAM 1).
  useMediaRelayFallback();

  // ⚠️ AGGIUNTO — segnalato dal vivo: sul telefono non compariva mai « seduta in corso » e la
  // sua trascrizione non arrivava mai nel Giornale, pur mostrando « microfono attivo ». Causa:
  // `impostaStatoSeduta('running')` si chiama SOLO all'apertura della seduta (v. `avviaSeduta`,
  // più giù) — ma il bottone « collega il telefono del PC » si preme DURANTE una seduta già
  // aperta, quindi quel pacchetto era già passato quando il telefono si connette, e non c'è
  // altro punto che lo rimandi. `useRemoteSession.onConnectionEstablished` rimanda già lo
  // stato corrente ad ogni RICONNESSIONE — ma solo se quello stato non è mai stato 'idle', e
  // qui non lo diventava mai in primo luogo. Questo effetto copre esattamente il varco: appena
  // un telefono risulta connesso MENTRE la seduta è aperta (sia alla prima connessione che a
  // una successiva), gli manda 'running' — è lui, non `avviaSeduta`, ad accorgersi che i due
  // fatti (seduta aperta, telefono connesso) sono finalmente veri insieme. Innocuo se ripetuto:
  // `impostaStatoSeduta` è idempotente lato PC (riarma una trascrizione già armata).
  useEffect(() => {
    if (remote.isConnected && aperta) remote.impostaStatoSeduta('running', sessionClock.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote.isConnected, aperta]);

  // ⚠️ AGGIUNTO — segnalato dal vivo: « la cam del preclear non manda nulla, ma le autorizzazioni
  // sono concesse sul telefono ». Senza accesso agli strumenti di sviluppo dell'auditor (Electron
  // li ha, ma non è comodo chiedere a chi sta testando dal vivo di aprirli), l'UNICO modo di
  // capire DOVE si ferma la catena — la chiamata media non parte mai dal telefono? arriva
  // all'auditor ma senza traccia video? arriva con una traccia ma non si disegna? — è scriverlo
  // nel Giornale, che l'auditor legge comunque. Una riga sola, alla PRIMA volta che uno stream
  // arriva per questa connessione (`giàLoggato`, azzerato alla disconnessione): non un log ad
  // ogni render.
  const streamLoggatoRef = useRef(false);
  useEffect(() => {
    if (!remote.isConnected) { streamLoggatoRef.current = false; return; }
    if (!remote.remoteStream || streamLoggatoRef.current) return;
    streamLoggatoRef.current = true;
    const tracce = remote.remoteStream.getTracks();
    const video = tracce.filter(t => t.kind === 'video').length;
    const audio = tracce.filter(t => t.kind === 'audio').length;
    journal.addLog({
      speaker: 'SYS', time: sessionClock.now(),
      text: `📹 ${LC(`flusso del PC ricevuto: ${video} video, ${audio} audio`,
                      `flux du PC reçu : ${video} vidéo, ${audio} audio`,
                      `PC stream received: ${video} video, ${audio} audio`,
                      `flujo del PC recibido: ${video} vídeo, ${audio} audio`,
                      `PC-flöde mottaget: ${video} video, ${audio} audio`)}`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote.isConnected, remote.remoteStream]);

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
  // Lo stesso, per il passo su cui riaprire: uno strumento disconnesso non deve lasciare in
  // memoria "riapri sulla prova delle lattine" per la prossima connessione, magari di un altro.
  useEffect(() => { if (!meterC) setMeterSetupPasso(undefined); }, [meterC]);
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
  /**
   * ⚠️ AGGIUNTO — lo stato del collasso di `PannelloMna` vive QUI, non dentro il pannello
   * stesso: v. la nota grande su `collapsed`/`onToggleCollapsed` in `PannelloMna.tsx`. Serve
   * qui perché è QUI che si decide quanto spazio riservargli (il contenitore poco più giù,
   * `minHeight`) — un `useState` interno al pannello poteva nascondere il SUO contenuto ma non
   * poteva mai dire al chiamante "adesso ti serve meno spazio".
   */
  const [mnaCollassato, setMnaCollassato] = useState(true);
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
  // ⚠️ `(t: never)`, non `(t: CycleTick)` — trovato attivando `strict`: un placeholder rimasto
  // troppo largo (o troppo stretto: `never` non accetta NESSUN argomento) che l'inferenza
  // lasca di prima non segnalava. Corretto al tipo vero, lo stesso che riceve poi da
  // `cycles.trackCycle` qualche riga sotto.
  const trackCycleRef = useRef<(t: CycleTick) => void>(() => {});

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
   *  (la parte Theta-Meter resta `theta.resetToSet`, già cablata sotto).
   *  ⚠️ OTTIMIZZAZIONE — `useCallback` a dipendenze vuote: tocca solo singleton di modulo
   *  (`needleEngine`/`virtualNeedle`) e ref (`workerRef`/`needleVirtualRef`, sempre lette
   *  fresche via `.current`), mai stato o props — può restare la STESSA funzione fra un
   *  render e l'altro. Prima era ricreata a ogni render: passata a `onClick` di
   *  `QuantumSphere` (sotto), un `React.memo` che l'app stessa descrive come "il componente
   *  più grande e più chiamato" proprio perché i suoi props restino stabili — una funzione
   *  nuova a ogni render vanificava quel memo per QUESTO prop, ridisegnando ~680 righe di SVG
   *  a ogni render di `Serenity.tsx`, non solo quando l'ago cambia per davvero. */
  const resetNeedleEeg = useCallback(() => {
    needleEngine.reset(() => {
      if (workerRef.current) {
        workerRef.current.postMessage({ type: 'RESET_SYSTEM' });
        workerRef.current.postMessage({ type: 'MANUAL_SET_RESET' });
      }
    });
    virtualNeedle.reset();
    needleVirtualRef.current = [];
  }, []);
  /** Il click sul quadrante (`onClick` di `QuantumSphere`, più giù) — riportato in cima e
   *  stabilizzato per la STESSA ragione di `resetNeedleEeg` appena sopra: una funzione
   *  inline nella JSX sarebbe stata ricreata a ogni render, vanificando il `React.memo` del
   *  quadrante per questo prop. `theta.resetToSet` è già stabile di suo (il proprio
   *  `useCallback` in `useThetaMeter.ts`) — usare LUI nelle dipendenze, non l'intero oggetto
   *  `theta` (che invece È un letterale nuovo a ogni render), è quel che lascia
   *  `handleQuantumSphereClick` davvero stabile fra un render e l'altro. */
  const handleQuantumSphereClick = useCallback(() => {
    theta.resetToSet();
    resetNeedleEeg();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theta.resetToSet, resetNeedleEeg]);
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
    setHardwareError, setSignalQuality: museGate.setSignalQuality, setRealBpm, setDisplayMass,
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
  // singleton che App.tsx legge). SPOSTATA in `GruppoAlto.tsx` (giro di scomposizione del
  // 2026-09-07): era letta SOLO lì (`useSyncExternalStore(needleEngine.subscribe,
  // needleEngine.getPos)`, ora dentro quel componente).

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
  /**
   * ⚠️ AGGIUNTO — segnalato: « quando hai due strumenti collegati, devi per default indicare
   * DEUX nella visualizzazione AGO ». App.tsx ha ESATTAMENTE questo effetto (« CON DUE
   * STRUMENTI SI PARTE DA "DUE" », commento suo, mai portato qui): averli collegati tutti e
   * due e vederne UNO SOLO nasconde metà di quel che si è preparato — il difetto giusto è
   * mostrare tutto e lasciare che l'auditor restringa, non il contrario.
   *
   * Una volta sola per collegamento, e MAI contro una scelta già fatta: se l'auditor ha già
   * toccato il selettore in questa seduta (o gli strumenti si scollegano e riconnettono), la
   * sua scelta resta finché non tornano a scollegarsi entrambi — stessa guardia
   * (`dueGiaImpostatoRef`) e stessa condizione (`museOk && meterC`, l'equivalente qui di
   * `instruments.muse && instruments.theta`) di App.tsx, parola per parola. */
  const dueGiaImpostatoRef = useRef(false);
  useEffect(() => {
    const dueStrumenti = museOk && meterC;
    if (!dueStrumenti) { dueGiaImpostatoRef.current = false; return; }
    if (dueGiaImpostatoRef.current) return;
    dueGiaImpostatoRef.current = true;
    setReazioniViste('both');
    setAgoScelto('theta');
  }, [museOk, meterC]);
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
    // ⚠️ AGGIUNTO — segnalato: « vedere chiaramente le sensazioni del PC, l'osservazione
    // dell'auditor e le misure ». Stesso patto di `writeCycleCorpus` più sopra. V. `ToneRecord`
    // in `engine/corpus.ts` per il perché delle due sole sorgenti.
    logTone: row => {
      if (!corpusSessionRef.current) return;   // fuori seduta non si archivia
      corpusWrite(toneRecord(corpusSessionRef.current, new Date().toISOString(), row));
    },
  });
  trackToneRef.current = tone.trackTone;
  /** ⚠️ SEGNALATO DI NUOVO, con forza: « non hai capito. Nel ciclo TONO 40 devi far vedere la
   *  scala del tono per poter scegliere il TONO dopo che è stata trovata la resistenza,
   *  altrimenti [l'auditor] non sà a che tono si trova. NON PUÒ ESSERE AUTOMATICA senza
   *  strumenti ». Chiarito dal vivo: « SENZA STRUMENTI, non c'è nessuna tendina poiché cerca
   *  da solo il tono, ma questo è impossibile senza strumenti. Dice 0 vs +40 in corso... e
   *  lampeggia ». Il giro precedente AVEVA aggiunto un select — ma sotto la scala, in fondo a
   *  un contenitore che scorre: mai visto, perché la cosa più in vista era proprio quella
   *  pillola "0 → +40 in corso…" pulsante di `bottoniCiclo` (sempre montata, sotto), che senza
   *  un valore scelto sembra — ed È — un numero automatico che lampeggia da solo. `tonoScelto`
   *  chiude il buco: finché è falso (in una seduta `senzaMisura`), `bottoniCiclo` non monta
   *  QUELLA pillola né i bottoni "portalo a tono 40"/"raggiunto" (v. la sua nota, poco più
   *  giù) — l'unica cosa a schermo è la scelta del tono, grande, in cima, impossibile da
   *  perdere. Si riarma a `false` ad ogni nuova resistenza (click su TONE, "altra
   *  resistenza") — mai un valore rimasto dalla resistenza precedente scambiato per una scelta
   *  già fatta su questa. */
  const [tonoScelto, setTonoScelto] = useState(false);

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
  /**
   * ── PRIMA VOLTA « LIBERO » — segnalato: « quando si inizia la sessione senza strumenti
   * appaiono i cerchi dei cicli, e c'è scritto DAI L'ITEM, Scrivilo o dillo, poi premi, ma non
   * è corretto ». Vero: `spiegazioneCiclo`/`comeSenzaAgo` per `mode === 'free'` sono pensati
   * per il RITORNO al libero fra un ciclo e l'altro (« nessun ciclo scelto ADESSO » — un
   * auditor già in seduta sa già come procedere). Al PRIMO libero della seduta — prima che
   * QUALSIASI ciclo sia mai stato armato — serve invece un vero briefing d'apertura (v. il
   * blocco "INIZIO SESSIONE"/"SESSION START" più giù), non la stessa didascalia minima.
   * `primaVoltaLibero` distingue i due casi con un solo state, senza toccare `spiegazioneCiclo`
   * (usata anche altrove, es. `PistaCiclo` con strumenti): si riarma a `true` ad ogni apertura
   * seduta (`aperta`), e si spegne per sempre — fino alla prossima apertura — al primo `mode`
   * diverso da `'free'`: quello è il segno che l'auditor ha già capito come muoversi.
   */
  const [primaVoltaLibero, setPrimaVoltaLibero] = useState(true);
  useEffect(() => { if (aperta) setPrimaVoltaLibero(true); }, [aperta]);
  useEffect(() => {
    if (aperta && mode !== 'free') setPrimaVoltaLibero(false);
  }, [aperta, mode]);
  /** ⚠️ SEGNALATO: « quand on commence la séance comme EXPERT on n'a pas besoin du debriefing
   *  de INIZIO SESSION ». Vero — il briefing spiega cosa sono Obiettivo/stato fisico del
   *  PC/R-Factor e come funzionano COMMANDS/ASSESSMENT: cose che un EXPERT (che vede "tous les
   *  chiffres", `espertoAttivo === true`) già sa. `espertoAttivo !== true` (stessa convenzione
   *  robusta di `moduleVis`/`cam2Mostrata` — BASIC finché non è ESPLICITAMENTE EXPERT) qui
   *  restringe il briefing al solo BASIC; in EXPERT il primo libero si comporta già come ogni
   *  libero successivo (nessun testo, solo `bottoniCiclo`, v. poco più giù). */
  const mostraBriefingIniziale = mode === 'free' && primaVoltaLibero && espertoAttivo !== true;
  /** ── SENZA STRUMENTI, L'ARCO SPARISCE — segnalato: « quando non ci sono strumenti attivi,
   *  l'arco deve sparire e le scritte dei cicli devono farsi al posto dell'arco, COME IN
   *  EQUILIBRIUM ». Verificato App.tsx: `senzaMisura` (la STESSA funzione pura condivisa,
   *  `noInstruments({muse,theta})` — non un'invenzione qui) decide, a seduta in corso, se
   *  montare `<QuantumSphere>` o un blocco di testo grande al suo posto (« PRIMA DELLO START
   *  non c'è niente da dire », la sua nota). Stessa condizione qui, con `museOk`/`meterC` al
   *  posto di `instruments.muse`/`instruments.theta`. */
  const senzaMisura = noInstruments({ muse: museOk, theta: meterC });
  /** ⚠️ SEGNALATO: « se passi da strumenti a senza strumenti, con la session in corso, rifai
   *  vedere il debriefing di inizio sessione. NON VA BENE ». `primaVoltaLibero` si spegneva
   *  solo al primo `mode !== 'free'` (sopra) — una seduta aperta CON strumenti che non ha
   *  ancora armato nessun ciclo lo lascia `true`; passando poi a "senza strumenti" a metà
   *  seduta (`senzaMisura` diventa vero SOLO ora), `mostraBriefingIniziale` si accendeva da
   *  sé, perché nulla aveva mai spento `primaVoltaLibero`. Nuovo effetto: appena la seduta
   *  gira DAVVERO con uno strumento vero (`!senzaMisura`), la leva si spegne per sempre (fino
   *  alla prossima apertura) — chi ha iniziato con MUSE/Meter, anche solo per un istante, non
   *  è più "al primo libero della seduta" nemmeno se stacca tutto dopo. */
  useEffect(() => {
    if (aperta && !senzaMisura) setPrimaVoltaLibero(false);
  }, [aperta, senzaMisura]);
  /** ⚠️ AGGIUNTO — segnalato: « quando fai partire una sessione in SENZA STRUMENTI c'è una
   *  incoerenza: hai la freccia che pulsa per START e invece il bottone pausa a destra. Quando
   *  poi schiacci START appaiono i secondi che hai passato a leggere e la sessione inizia con
   *  un tempo falso ». La correzione di un giro precedente (v. la nota grande sul timer, più
   *  giù, vicino a `<OraReale>`) nascondeva SOLO la DISPLAY del tempo (`orologio(tempo)`) e il
   *  bottone "chiudi la seduta" finché dura il briefing (`mostraBriefingIniziale && aperta`) —
   *  ma non fermava l'orologio VERO (`sessionClock`), che correva comunque dietro le quinte: i
   *  secondi passati a leggere restavano contati, e riapparivano tutti insieme, un tempo falso,
   *  appena il briefing si chiudeva (bottone "INIZIA" → `setPrimaVoltaLibero(false)`). Lo
   *  stesso vale per il bottone Pausa, poco più giù: restava condizionato solo su `aperta` —
   *  mai su `mostraBriefingIniziale` — mentre il resto della barra (timer, "chiudi la seduta")
   *  era già nascosto: la freccia che invita a INIZIARE e un comando che presuppone una seduta
   *  già IN CORSO, insieme, l'incoerenza segnalata.
   *  Corretto con lo STESSO meccanismo già usato per lo strumento perso (`pausaMotivoRef`, v.
   *  `pauseOnLoss` più sopra): un motivo automatico in più, `'briefing'` — ferma l'orologio
   *  VERO passando dall'effetto pausata/sessionClock già esistente (poco più giù), non un
   *  secondo percorso. Nessun log nel giornale (come per `'strumento'`): non è una pausa
   *  decisa dall'auditor, non deve comparire come tale nella trascrizione. Il bottone Pausa
   *  stesso prende la STESSA condizione `!(mostraBriefingIniziale && aperta)` di timer/chiudi,
   *  v. la sua nota. */
  useEffect(() => {
    if (mostraBriefingIniziale && aperta) {
      if (!pausata) { pausaMotivoRef.current = 'briefing'; setPausata(true); }
    } else if (pausata && pausaMotivoRef.current === 'briefing') {
      setPausata(false);
      pausaMotivoRef.current = null;
    }
  }, [mostraBriefingIniziale, aperta, pausata]);
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
  /** ⚠️ « NON PUÒ ESSERE AUTOMATICA senza strumenti » — v. la nota grande su `tonoScelto`,
   *  sopra. Vero SOLO in `tone.raise`: la resistenza è già stata trovata (`tone.item`/
   *  `tone.say_item`, prima, escludono questo stato) e il tono non è ancora stato scelto —
   *  `tone.done` non può mai valerlo, perché ci si arriva SOLO passando per il bottone
   *  "raggiunto", già bloccato finché `tonoScelto` è falso (v. `bottoniCiclo`). */
  const deveScegliereTono = senzaMisura && toneAttivo && faseCiclo === 'tone.raise' && !tonoScelto;

  const chargePhaseNow = useMetric(m => m.chargePhase);

  /** ── L'ASSESSMENT SI ARMA E SI DISARMA CON IL CICLO — segnalato: « l'assessment sembra
   *  sempre attivo, anche quando è chiuso... nel report abbiamo degli assessment lunghissimi
   *  che in realtà non lo sono. DEVE ESSERE ATTIVATO al momento dell'armamento del ciclo, ed
   *  alla fine poi disattivato ». Vero: `assessAttivo` era un interruttore SOLO manuale — se
   *  restava acceso da una seduta precedente, gli item raccolti nel frattempo finivano nello
   *  stesso "assessment" di quello vero, allungandolo nel rapporto.
   *
   *  ⚠️ BUG TROVATO (revisione TONE, 02/09/2026) — segnalato di nuovo, con forza: « non hai
   *  risolto il problema dell'assessment che non si attiva quando armi TONE ». Vero SOLO alla
   *  SECONDA resistenza in poi ("altra resistenza"): questo effetto era rimasto DUE effetti
   *  separati — uno su `[mode]` che ACCENDEVA solo alle transizioni libero↔armato, uno su
   *  `[faseCiclo, mode]` che SPEGNEVA quando si usciva dalla fase "dai l'item" — ma nessuno dei
   *  due RIACCENDEVA quando si RIENTRAVA in una fase "dai l'item" restando nello STESSO ciclo
   *  armato. "Altra resistenza" (v. `tone.resetTone()`+`tone.localizzaTone()`, nei bottoni del
   *  ciclo) NON disarma TONE (`toneAttivo` resta vero, `mode` resta `'tone'` — non cambia),
   *  quindi l'effetto su `[mode]` non rifaceva scattare nulla; e l'effetto su `[faseCiclo,
   *  mode]` sapeva SOLO spegnere, mai riaccendere. Risultato: dopo la prima resistenza,
   *  l'assessment restava spento per tutte quelle successive, anche tornando a "dì la
   *  resistenza". Un solo effetto ora, che scrive lo stato ESATTO invece di spegnere soltanto:
   *  fuori da un ciclo → spento; dentro un ciclo, nella fase "dai l'item" → acceso; dentro un
   *  ciclo, in qualunque altra fase → spento. Resta comunque riaccendibile a mano in qualunque
   *  momento: l'effetto rifà scattare solo quando `mode`/`faseCiclo` CAMBIANO, non a ogni
   *  render — un tocco manuale a fase invariata non viene rimesso a posto sotto l'auditor. */
  useEffect(() => {
    if (mode === 'free') { setAssessAttivo(false); return; }
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
    setAssessAttivo(inFaseItem);
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
    // ⚠️ TEST DIAGNOSTICO « alone bianco » FATTO E RIPRISTINATO — disattivato temporaneamente
    // per isolare la causa; l'utente conferma dal vivo che l'alone resta identico anche con
    // questo motore spento. Escluso con certezza — nessuna ragione di tenerlo spento.
    void voiceToneAnalyzer.init().then(ok => { if (ok) voiceToneAnalyzer.ensureAudioContextActive(); });
    sessionRecorder.reset();   // niente chart/reazioni/CSV di una seduta precedente — come App.tsx
    setPausata(false); pausaMotivoRef.current = null;   // niente pausa residua da una seduta precedente
    journal.resetJournal(t('ser_session_opened'));
    ep.resetEpState();   // niente "EP ✓" residuo da una seduta precedente
    mirror.resetMirror();   // niente ciclo MIRROR residuo da una seduta precedente
    tone.resetTone(); setToneAttivo(false); setTonoScelto(false);   // niente TONE residuo da una seduta precedente
    setCampiSessioneNascosti(false);   // OBIETTIVO/STATO FISICO/R-FACTOR di nuovo in vista
    setProvaTa({ two: null, solo: null });   // niente prova doppia residua da un'altra persona
    // ⚠️ AGGIUNTO — segnalato: lo scarto lattina-sola (`theta.setup.offsets`) sopravviveva al
    // cambio di preclear perché si salvava sotto un'unica chiave globale — v. la nota grande
    // su `resetPerSessionSetup` in `useThetaMeter.ts`. Azzerato QUI, insieme a `provaTa`
    // appena sopra: sono la stessa correzione, letture grezze e valore applicato.
    theta.resetPerSessionSetup();
    setAssessAttivo(false); setAssessItems([]); assessLogCursorRef.current = 0;   // idem, ASSESSMENT
    assessTimesRef.current = []; assessPrevAtRef.current = -Infinity; gruppiItemRef.current = new Map();
    shownReadsRef.current = [];   // niente reazioni di una seduta precedente nella finestra del primo item
    // ── MNA — « entra in CAPTURE » all'apertura, come App.tsx ────────────────────────────
    // Non IDLE: l'attrezzo è PRONTO a catturare fin dal primo secondo, non spento. E
    // `onHarmonicCopy` va agganciato QUI (una volta per seduta, come in App.tsx) — è
    // `primeFreqAudio` che lo richiama a ogni copia armonica generata durante HARMONICS;
    // senza, il contatore COPIES di `PannelloMna` resterebbe fermo a zero per sempre.
    // ⚠️ TEST DIAGNOSTICO « alone bianco » FATTO E RIPRISTINATO — disattivato temporaneamente
    // per lo stesso test; l'utente conferma dal vivo che l'alone resta identico anche con
    // questo spento. Tutta la famiglia audio/media di `avviaSeduta()` è ora esclusa con
    // certezza — nessuna ragione di tenerlo spento.
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
    // ⚠️ CORRETTO — segnalato dal vivo: gestiva solo `avvio.distanza` (vera seduta a distanza),
    // ma un telefono collegato con « collega il telefono del PC » (satellite, seduta LOCALE:
    // `avvio.distanza` resta false) non riceveva MAI questo pacchetto — restava fermo su "Chi
    // audisce?"/nessuna indicazione di seduta in corso, e la trascrizione lato PC non si armava
    // mai (v. `pcMicArmedRef` in App.tsx, armato solo da `SESSION_STATE:'running'`), da cui
    // « il microfono dice attivo ma non scrive nel giornale ». `remote.isConnected` copre
    // ENTRAMBI i casi con un solo controllo: è vero solo quando un dispositivo remoto (a
    // distanza o satellite) è davvero collegato.
    if (avvio?.distanza || remote.isConnected) remote.impostaStatoSeduta('running');
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
      // ⚠️ SEGNALATO: « Basico deve cominciare senza strumenti per default ». In BASIC
      // (`espertoAttivo !== true`, stessa convenzione di `moduleVis`/`cam2Mostrata` sopra —
      // « non === false », per includere anche la configurazione ancora senza questo campo)
      // la scelta più probabile è "nessuno": si pre-seleziona "senza strumenti" nel pannello
      // qui sotto, l'auditor può comunque cambiarla con un clic. In EXPERT nessuna scelta è
      // pre-selezionata, come prima.
      setConnSel({ muse: false, theta: false, none: espertoAttivo !== true });
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
    /* ⚠️ BUG TROVATO DI NUOVO, segnalato dal vivo: « quando chiudi una seduta e lascio un ciclo
       aperto, devi far ritornare lo schermo allo stato iniziale — ora resta TONO 40... e non
       posso nemmeno cambiare gli strumenti ». La nota qui sopra aveva corretto CONTACT/NULL/
       MIRROR ma NON TONE né TRUTH — restavano armati (`toneAttivo`/`truth.truthPhase`) anche a
       `aperta` tornato falso. Non è solo un dato mancante nel PDF (come per CONTACT/NULL): è
       `mode` (`toneAttivo ? 'tone' : truth.truthPhase !== 'idle' ? 'truth' : ...`) che NON
       controlla `aperta` — resta `'tone'`/`'truth'` per sempre dopo la chiusura, e con lui
       `modalitaCiclo`/`cicloAttivo`, che ad esempio disattivano i bottoni di connessione
       strumenti «già attivo durante un ciclo» (v. la nota su "LE CONNESSIONI..." più giù) —
       un ciclo fantasma, chiuso da nessuna parte tranne che nella testa dell'app, blocca la
       schermata SUCCESSIVA intera, non solo il quadrante. Stesso trattamento di TONE/CONTACT/
       NULL: se il ciclo era davvero in corso (`tonePhase==='raise'`) si registra "non concluso"
       prima di chiudere — `tonePhase==='done'` è già stato registrato dal bottone "raggiunto",
       richiuderlo lo duplicherebbe. TRUTH non ha un equivalente di `chiudiTone(false)`/
       `closeOpenCycleAtEnd()` per un R/I abbandonato a metà — `resetTruth()` (usato anche da
       ANNULER) è la via giusta: nessun R/I fu davvero risolto, non c'è nulla di vero da
       registrare. */
    if (toneAttivo) {
      if (tone.tonePhase === 'raise') tone.chiudiTone(false);
      tone.resetTone();
      setToneAttivo(false); setTonoScelto(false);
    }
    if (truth.truthPhase !== 'idle') truth.resetTruth();
    setProcedimentoAttivo(null);
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
    // ⚠️ Stessa correzione del punto gemello sopra (avvio seduta) — v. quella nota.
    if (avvio?.distanza || remote.isConnected) remote.impostaStatoSeduta('ended');
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
      <>
        {/* ⚠️ CORRETTO — segnalato dal vivo: « l'animazione di SERENITY deve apparire PRIMA di
            CHI AUDISCE? ». Questo `return` anticipato (nessuna risposta ancora data alle
            domande dell'avvio) usciva PRIMA di raggiungere `{showSplash && <SplashScreen/>}`,
            che vive più giù nel `return` principale — raggiunto solo DOPO aver risposto a
            tutte le domande. L'animazione compariva quindi alla FINE dell'avvio, non all'inizio:
            esattamente al contrario di un'animazione di apertura. Stessa riga duplicata qui,
            in cima a QUESTO ramo — `showSplash` resta lo stesso stato unico, scritto a `false`
            una volta sola (`onDismiss`), quindi non ricompare passando da questo ramo al
            principale una volta risposto. */}
        {showSplash && <SplashScreen onDismiss={() => setShowSplash(false)} appName="SERENITY" />}
        <main style={{ height: '100%', padding: '38px 44px' }}>
          <Avvio onPronto={setAvvio} onRichiama={richiamaConfigurazione} />
        </main>
      </>
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
  // ⚠️ SPOSTATO QUI (era calcolato solo dentro il blocco CAM 2 più giù) — segnalato dal vivo:
  // « COLLEGA il telefono del PC non si vede bene sotto la CAM 2, dovrebbe stare sotto il
  // bottone di inizio seduta: è lì che si sceglie di connettere un telefonino, non a seduta
  // iniziata ». Il bottone stesso trasloca (v. la riga di INIZIA/CHIUDI LA SEDUTA, più giù), ma
  // questo valore serve ANCHE dov'era — CAM 2 durante la seduta deve continuare a sapere se
  // mostrare il flusso del telefono — quindi sale di scope invece di restare locale a
  // quell'unico punto.
  const telefonoPcCollegato = !avvio.distanza && remote.isConnected;
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
  {/* ── I BOTTONI DEL CICLO — ESTRATTI in `BottoniCiclo.tsx`, segnalato nella revisione
      completa. Nessuna riga di logica riscritta — gli stessi quattro hook di ciclo
      (`tone`/`mirror`/`cycles`/`truth`) arrivano TALI E QUALI, la cronologia completa di ogni
      bug trovato in questi bottoni vive ora dentro `BottoniCiclo.tsx`. */}
  const bottoniCiclo = (
    <BottoniCiclo
      aperta={aperta}
      toneAttivo={toneAttivo}
      setToneAttivo={setToneAttivo}
      tone={tone}
      senzaMisura={senzaMisura}
      tonoScelto={tonoScelto}
      setTonoScelto={setTonoScelto}
      itemConfirmedRef={itemConfirmedRef}
      mirror={mirror}
      museOk={museOk}
      cycles={cycles}
      deltaStar={deltaStar}
      deltaStarN={deltaStarN}
      isLightTheme={isLightTheme}
      museContact={museGate.museContact}
      truth={truth}
      LC={LC}
    />
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
          tutto, come `PannelloMna`: qui non c'è ancora una seduta da coprire.
          Estratto in `PannelloScegliStrumento.tsx` — primo pezzo della frammentazione di
          Serenity.tsx (v. la nota in `App.tsx`/`InstrumentHintPanel.tsx` per il perché). */}
      <PannelloScegliStrumento
        open={scegliStrumento}
        onClose={() => setScegliStrumento(false)}
        connSel={connSel}
        onToggleConn={scegliConn}
        thetaUnavailable={theta.unavailable}
        lang={lang as string}
        t={t as (key: string) => string}
        nomeConfigDaSalvare={nomeConfigDaSalvare}
        onNomeConfigChange={(v) => { setNomeConfigDaSalvare(v); setConfigSalvata(false); }}
        configSalvata={configSalvata}
        onSalvaConfigurazione={() => { salvaConfigurazione(nomeConfigDaSalvare, avvio, connSel, lang); setConfigSalvata(true); }}
        avvio={avvio}
        onStart={async () => {
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
      />
      {/* ── IL CONTROLLO DI PRONTEZZA — vedi la nota su `metabolicOpen`, sopra. Stessa
          sequenza di App.tsx: prima le boîtes (`ThetaReadyCheck`, se il meter è collegato e non
          ancora fatto in questa apertura), poi il respiro del MUSE (`MetabolicCheck`, se il
          MUSE è collegato — a distanza si guarda il SUO MUSE, non uno locale che qui non
          esiste).
          ⚠️ I DUE NON SI COMPORTANO UGUALE — corretto un giro dopo aver scoperto il bug (v. la
          nota su `onCancel` di `ThetaReadyCheck`, più giù): in App.tsx SOLO `MetabolicCheck`
          apre la seduta anche da ANNULLA (è consultivo, la decisione resta dell'auditor);
          `ThetaReadyCheck` (stretta/respiro del Meter) NO — ANNULLA lì chiude e basta. */}
      {/* ── IL CONTROLLO DI PRONTEZZA — ESTRATTO in `ControlloProntezza.tsx`, segnalato nella
          revisione completa. Nessuna logica cambiata — `avviaSeduta`/`avviaSedutaConProntezza`
          restano costruiti QUI, passati giù come callback — la cronologia completa dei bug
          trovati in questa sequenza vive ora dentro `ControlloProntezza.tsx`. */}
      {metabolicOpen && (
        <ControlloProntezza
          avvio={avvio}
          remote={remote}
          museOk={museOk}
          muse={muse}
          meterC={meterC}
          thetaReadyDone={thetaReadyDone}
          setThetaReadyDone={setThetaReadyDone}
          theta={theta}
          provaTa={provaTa}
          setProvaTa={setProvaTa}
          museGate={museGate}
          avviaSeduta={avviaSeduta}
          avviaSedutaConProntezza={avviaSedutaConProntezza}
          setMetabolicOpen={setMetabolicOpen}
          metabolicPhaseRef={metabolicPhaseRef}
          needleTrim={needleTrim}
          setNeedleTrim={setNeedleTrim}
          needleInertia={needleInertia}
          setNeedleInertia={setNeedleInertia}
        />
      )}
      {/* ── LA BARRA LATERALE — ESTRATTA in `BarraLaterale.tsx`, segnalato nella revisione
          completa. APRI/CHIUDI, PAUSA, EP/COMMANDS/DIZIONARIO e il Giornale, fuori dall'arco.
          Nessuna logica cambiata — `chiudi`/`apri`/`pausaManuale` restano costruiti QUI, passati
          giù come callback — la cronologia completa delle segnalazioni che hanno formato questa
          barra vive ora dentro `BarraLaterale.tsx`. */}
      <BarraLaterale
        sidebarTop={sidebarTop}
        aperta={aperta}
        mostraBriefingIniziale={mostraBriefingIniziale}
        tempo={tempo}
        avvio={avvio}
        telefonoPcCollegato={telefonoPcCollegato}
        onApriSatellite={() => setSatelliteAperto(true)}
        LC={LC}
        pausata={pausata}
        pausaMotivoRef={pausaMotivoRef}
        onPausaManuale={pausaManuale}
        onChiudi={chiudi}
        onApri={apri}
        ep={ep}
        procedimenti={procedimenti}
        onApriCommands={() => { setProcessusSoloComandi(true); setProcessusAperto(true); }}
        onApriDizionario={() => setDizionarioAperto(true)}
        journal={journal}
        museOk={museOk}
        meterC={meterC}
        shownReadsRef={shownReadsRef}
        agoEegRef={agoEegRef}
      />
      {/* ── L'INTESTAZIONE — ESTRATTA in `Intestazione.tsx`, segnalato nella revisione completa.
          L'header (666 righe originarie) era già scomposto più a fondo in un giro precedente in
          nove componenti (LogoSerenity, ChiAuditaAssetto, SelettoreStrumenti…): questo giro
          completa quella scomposizione dando anche all'involucro `<header>` un nome vero. Nessuna
          logica cambiata — ogni azione composta resta costruita QUI, passata giù come callback —
          la cronologia completa delle segnalazioni che hanno formato l'header vive ora dentro
          `Intestazione.tsx`. */}
      <Intestazione
        headerRef={headerRef}
        modalitaCiclo={modalitaCiclo}
        avvio={avvio}
        espertoAttivo={espertoAttivo}
        LC={LC}
        onApriCrediti={() => setCreditiAperti(true)}
        nomeAuditor={nomeAuditor}
        nomePreclear={nomePreclear}
        aperta={aperta}
        assettoAperto={assettoAperto}
        onToggleAssetto={() => setAssettoAperto(v => !v)}
        onCambiaLivello={() => setAvvio(a => a ? { ...a, esperto: !a.esperto } : a)}
        onCambiaPersone={() => { setAssettoAperto(false); ricomincia(); }}
        salvaConfigAperto={salvaConfigAperto}
        onToggleSalvaConfig={() => { setSalvaConfigAperto(v => !v); setConfigSalvata(false); }}
        configSalvata={configSalvata}
        nomeConfigDaSalvare={nomeConfigDaSalvare}
        onCambiaNomeConfig={v => { setNomeConfigDaSalvare(v); setConfigSalvata(false); }}
        onSalvaConfig={() => {
          salvaConfigurazione(nomeConfigDaSalvare, avvio,
            { muse: museOk, theta: meterC, none: senzaStrumenti || (!museOk && !meterC) }, lang);
          setConfigSalvata(true);
        }}
        processusCount={processusPdfs.length}
        onApriStorico={() => setHistoryAperto(true)}
        onApriProcessus={() => { setProcessusSoloComandi(false); setProcessusAperto(true); }}
        muse={muse}
        theta={theta}
        museGate={museGate}
        meterC={meterC}
        batteryLevel={batteryLevel}
        senzaStrumenti={senzaStrumenti}
        onSenzaStrumenti={setSenzaStrumenti}
        strumentiEspansi={strumentiEspansi}
        onEspandi={() => setStrumentiEspansi(true)}
        museOk={museOk}
        meterSetupAperto={meterSetupAperto}
        onToggleMeterSetup={() => setMeterSetupAperto(v => !v)}
        hardwareError={hardwareError}
        remote={remote}
        onApriConfig={() => setConfigAperto(true)}
        aiAperto={aiAperto}
        onToggleAi={() => setAiAperto(v => !v)}
        tempo={tempo}
        needleReaction={needleReaction}
        journalLogs={journal.logs}
        onApriGuida={() => setGuidaAperta(true)}
        helpAttivo={helpAttivo}
        onToggleHelp={() => setHelpAttivo(v => !v)}
      />
      {/* ── LE FINESTRE SOVRAPPOSTE — ESTRATTE in `FinestreSovrapposte.tsx`, segnalato nella
          revisione completa. Guida, la modalità HELP a post-it, Crediti, l'animazione iniziale,
          Dizionario, Storico, Processus e il visore PDF — nessuna logica cambiata, la cronologia
          completa dei bug trovati in questi modali vive ora dentro `FinestreSovrapposte.tsx`. */}
      <FinestreSovrapposte
        helpAttivo={helpAttivo}
        guidaAperta={guidaAperta}
        setGuidaAperta={setGuidaAperta}
        creditiAperti={creditiAperti}
        setCreditiAperti={setCreditiAperti}
        showSplash={showSplash}
        setShowSplash={setShowSplash}
        dizionarioAperto={dizionarioAperto}
        setDizionarioAperto={setDizionarioAperto}
        historyAperto={historyAperto}
        setHistoryAperto={setHistoryAperto}
        profiliAuditor={profiliAuditor}
        auditorId={avvio?.auditorId}
        processusAperto={processusAperto}
        setProcessusAperto={setProcessusAperto}
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
        processusVisualizzato={processusVisualizzato}
        setProcessusVisualizzato={setProcessusVisualizzato}
        procedimenti={procedimenti}
        setProcedimentoAttivo={setProcedimentoAttivo}
        setFuocoProcedimentoStato={setFuocoProcedimentoStato}
        setRisposteProcedimento={setRisposteProcedimento}
        domandeLoggateRef={domandeLoggateRef}
        processusSoloComandi={processusSoloComandi}
      />

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
            <PannelloMeter theta={theta} provaTa={provaTa} passoIniziale={meterSetupPasso}
              onFatto={() => { setMeterSetupAperto(false); setMeterSetupPasso(undefined); }} />
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
      {/* ⚠️ ESTRATTA in `ZonaCamere.tsx` — segnalato nella revisione completa del codice:
          `Serenity.tsx` è un "componente Dio" (7000+ righe), da scomporre un dominio alla
          volta. Le due `CameraCerchio` e la loro cornice erano il pezzo più isolato — riceve
          solo valori già calcolati qui (nessuna logica spostata, solo il disegno). La cronologia
          completa di OGNI segnalazione che ha formato questo disegno (« non trovo più la camm
          PC », « le camm devono essere più in alto », « la cam LIVE indica segnale ma niente
          immagine »…) vive ora dentro `ZonaCamere.tsx`, non qui. */}
      <ZonaCamere
        aperta={aperta}
        cam1Mostrata={!!cam1Mostrata}
        cam2Mostrata={!!cam2Mostrata}
        avvioDistanza={!!avvio.distanza}
        telefonoPcCollegato={telefonoPcCollegato}
        remoteStream={remote.remoteStream}
        remoteVideoFrame={remote.remoteVideoFrame}
        remoteVideoFallbackActive={remote.videoFallbackActive}
        remoteIsConnected={remote.isConnected}
        uiAlpha={uiAlpha}
        cam1Collassata={cam1Collassata}
        cam2Collassata={cam2Collassata}
        onToggleCam1={() => setCam1Collassata(v => !v)}
        onToggleCam2={() => setCam2Collassata(v => !v)}
        statoCamPc={statoCamPc}
      />

      {/* ⚠️ AGGIUNTO, POI SPOSTATO — l'overlay di `Connessione` per il gesto « collega il
          telefono del PC ». Stesso componente della schermata a schermo intero di `avvio.distanza`
          (più su) — qui montato come un modale (stesso schema di `DizionarioModal`/
          `ProcessusModal`, un fratello in più nell'albero), non una sostituzione di `<main>`.
          Si apre ORA solo PRIMA di "apri una seduta" (v. la nota vicino a quel bottone): il
          gate non serve qui, il bottone che lo apre esiste solo quando ha senso aprirlo.
          Chiudendolo (✕, o « pronti » una volta connesso) si torna alla schermata di avvio, col
          telefono collegato se lo è — pronta per "apri una seduta", che ora parte SAPENDO già
          del telefono invece di scoprirlo a metà seduta. */}
      {satelliteAperto && (
        <div className="absolute inset-0 z-50" style={{
          background: 'color-mix(in srgb, var(--s-ground) 96%, transparent)',
          backdropFilter: 'blur(24px)',
        }}>
          <Connessione remote={remote} satellite
            onAnnulla={() => setSatelliteAperto(false)}
            onPronti={() => setSatelliteAperto(false)} />
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
        {/* ── GRUPPOALTO/GRUPPOBASSO — ESTRATTI in `GruppoAlto.tsx`/`GruppoBasso.tsx`, segnalato
            nella revisione completa: il pezzo più denso e più a rischio di tutta la
            scomposizione. Nessuna logica cambiata — `comandiSottoAgo`/`cicloAttivo` restano
            calcolati QUI (li usano entrambi i fratelli) e ogni azione composta resta costruita
            in `Serenity.tsx`, passata giù come callback. La cronologia completa delle
            segnalazioni che hanno formato l'ago/l'arco vive ora dentro quei due file. */}
        <GruppoAlto
          comandiSottoAgo={comandiSottoAgo}
          cicloAttivo={!!cicloAttivo}
          aperta={aperta}
          museOk={museOk}
          meterC={meterC}
          needleReactionKey={needleReactionKey}
          thetaReactionKey={thetaReactionKey}
          reazioniViste={reazioniViste}
          setReazioniViste={setReazioniViste}
          agoEeg={agoEeg}
          espertoAttivo={espertoAttivo}
          theta={theta}
          tone={tone}
          mirror={mirror}
          cycles={cycles}
          ep={ep}
          truth={truth}
          LC={LC}
          taRef={taRef}
          showTrailPref={showTrailPref}
          setShowTrailPref={setShowTrailPref}
          vistaSenzaAgo={vistaSenzaAgo}
          setVistaSenzaAgo={setVistaSenzaAgo}
          toneAttivo={toneAttivo}
          faseCiclo={faseCiclo}
          handleQuantumSphereClick={handleQuantumSphereClick}
          deltaStar={deltaStar}
          deltaStarN={deltaStarN}
          senzaMisura={senzaMisura}
          procedimentoAttivo={procedimentoAttivo}
          apri={apri}
          senzaStrumenti={senzaStrumenti}
          agoScelto={agoScelto}
          setAgoScelto={setAgoScelto}
          metabolicOpen={metabolicOpen}
          mostraBriefingIniziale={mostraBriefingIniziale}
          campiSessioneNascosti={campiSessioneNascosti}
          sessionObjective={sessionObjective}
          setSessionObjective={setSessionObjective}
          sessionPhysicalCheck={sessionPhysicalCheck}
          setSessionPhysicalCheck={setSessionPhysicalCheck}
          sessionBriefing={sessionBriefing}
          setSessionBriefing={setSessionBriefing}
          setPrimaVoltaLibero={setPrimaVoltaLibero}
          mode={mode}
          deveScegliereTono={deveScegliereTono}
          setTonoScelto={setTonoScelto}
          spiegazioneCiclo={spiegazioneCiclo}
          comeSenzaAgo={comeSenzaAgo}
          senzaNumero={senzaNumero}
          item={item}
          setItemManuale={setItemManuale}
          dichiaraItemDetto={dichiaraItemDetto}
          bottoniCiclo={bottoniCiclo}
        />
        {/* chiude qui `gruppoAlto` — l'ultimo terzo qui sotto è `gruppoBasso`, v. la nota sopra
            "L'ULTIMO TERZO IN BASSO". */}
        <GruppoBasso
          comandiSottoAgo={comandiSottoAgo}
          aperta={aperta}
          senzaMisura={senzaMisura}
          procedimentoAttivo={procedimentoAttivo}
          setProcedimentoAttivo={setProcedimentoAttivo}
          committaRispostaProcedimento={committaRispostaProcedimento}
          fuocoProcedimento={fuocoProcedimento}
          impostaFuocoProcedimento={impostaFuocoProcedimento}
          risposteProcedimento={risposteProcedimento}
          scriviRispostaProcedimento={scriviRispostaProcedimento}
          apriRispostaProcedimento={apriRispostaProcedimento}
          mode={mode}
          faseCiclo={faseCiclo}
          item={item}
          setItemManuale={setItemManuale}
          dichiaraItemDetto={dichiaraItemDetto}
          spiegazioneCiclo={spiegazioneCiclo}
          bottoniCiclo={bottoniCiclo}
          cycles={cycles}
          mirror={mirror}
          toneAttivo={toneAttivo}
          truth={truth}
          tone={tone}
          confermaItemSePresente={confermaItemSePresente}
          setToneAttivo={setToneAttivo}
          setTonoScelto={setTonoScelto}
        />
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
        {/* ⚠️ AGGIUNTO `&& museOk` — segnalato: « se abbiamo solo il METER, non è necessario
            fare apparire l'MNA, poiché non si può utilizzare ». Vero: `primeFreqTracker`
            (il motore dietro I_m/F_d, `engine/PrimeFreqTracker.ts`) si alimenta di `bands`,
            lo spettro EEG del MUSE (`useChargeEngine.ts`) — senza MUSE non gira, non c'è
            niente da capturare/sonificare. Stesso cancello già in uso per Santé Système
            (`moduleVis.health && museOk`, qui sotto) e per il biometrico: `moduleVis.mna`
            resta la preferenza scritta da CONFIG, `museOk` decide se ha senso mostrarla ORA. */}
        {/* ── MNA — ESTRATTO in `ZonaMna.tsx`, segnalato nella revisione completa. Nessuna
            logica cambiata, solo il disegno (`minHeight` che segue `mnaCollassato`, la cronologia
            completa delle segnalazioni che l'hanno formato vive ora lì dentro). Lo STATO resta
            qui — v. la nota grande in `ZonaMna.tsx` sul perché non si è passati a
            `useMnaModule` in questo stesso giro. */}
        <ZonaMna
          mostra={aperta && !!moduleVis.mna && museOk}
          collassato={mnaCollassato}
          onToggleCollassato={() => setMnaCollassato(c => !c)}
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
        {/* chiude qui il `<>` e la IIFE che producono `gruppoAlto`/`gruppoBasso`/MNA insieme. */}
        </>
          );
        })()}
        {/* chiude qui il wrapper centrale (`flex:1`) che avvolge l'arco — v. la nota sopra
            "LA RIGA A TRE COLONNE": la colonna destra (Santé/Journal) è un SUO fratello, non un
            figlio, nella riga a tre colonne. */}
        </div>
        {/* ── COLONNA DESTRA — ESTRATTA in `ColonnaSaluteAssessment.tsx` — segnalato nella
            revisione completa (v. `ZonaCamere.tsx`/`GiornaleSeduta.tsx` per la stessa
            scomposizione). Nessuna logica cambiata, solo il disegno: `HealthPanel` montato TALE
            E QUALE ad App.tsx, `ZonaAssessment` invariata. La cronologia completa delle
            segnalazioni che hanno formato questa colonna (« Santé Système a destra dell'arco »,
            « in LIGHT non si vede niente », « cambia di posizione il giornale con
            l'assessment »…) vive ora dentro `ColonnaSaluteAssessment.tsx`. */}
        <ColonnaSaluteAssessment
          aperta={rightColOpen}
          larghezza={moduleColWidth}
          paddingSopra={camStackH}
          mostraSalute={aperta && !!moduleVis.health && museOk}
          mostraAssessment={aperta && !!moduleVis.ri}
          eegBuffer={eegBuffer}
          gyroBuffer={gyroBuffer}
          realBpm={realBpm}
          signalQuality={museGate.signalQuality}
          museConnection={muse.museConnection}
          batteryLevel={batteryLevel}
          sessionRunning={aperta}
          onNascondiSalute={() => setModuleVis(v => ({ ...v, health: false }))}
          assessAttivo={assessAttivo}
          onToggleAssess={() => setAssessAttivo(v => !v)}
          assessItems={assessItems}
          LC={LC}
          dueAghi={museOk && meterC}
          onIndica={segnaIndicazione}
          onAggiungiItem={aggiungiItemManuale}
          cercaLettura={cercaLetturaPerParola}
        />
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
