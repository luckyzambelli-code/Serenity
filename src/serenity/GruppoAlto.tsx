/**
 * GruppoAlto — l'ago, l'arco, le sue letture e la schermata di briefing: il pezzo più denso e
 * più a rischio di tutta la scomposizione di `Serenity.tsx` (dodicesimo pezzo staccato dal
 * corpo — v. `docs/serenity-refonte.md` per la cronologia completa). Copiato verbatim dal blocco
 * che i commenti storici del file chiamano già "gruppoAlto" — ogni commento preservato, nessuna
 * riga di logica toccata.
 *
 * ── COSA RESTA FUORI DI PROPOSITO ────────────────────────────────────────────────────────────
 * `comandiSottoAgo`/`cicloAttivo` — calcolati dalla IIFE che in `Serenity.tsx` avvolge questo
 * componente insieme al suo fratello `gruppoBasso` — arrivano già pronti come prop, non
 * ricalcolati qui: la STESSA IIFE li usa per entrambi i fratelli, spostare il calcolo dentro
 * QUESTO componente lo avrebbe reso irraggiungibile per l'altro. Ogni azione COMPOSTA (`apri`,
 * `dichiaraItemDetto`, `handleQuantumSphereClick`…) resta costruita in `Serenity.tsx`, passata
 * giù come callback — mai reimplementata qui. `t`/`lang`/`isLightTheme` sono presi QUI,
 * internamente (dai loro stessi hook/store globali), non passati come prop — stessa ragione già
 * scritta in `Intestazione.tsx`/`BarraLaterale.tsx`. Le quattro `Lettura*` (TA/Fase/TotalTa/
 * Velocità, prima funzioni locali di `Serenity.tsx` usate SOLO qui) si sono trasferite con lui,
 * non duplicate — stessa ragione di `Divisore`/`OraReale` nei giri precedenti.
 *
 * @see docs/serenity-refonte.md — giro di scomposizione, 2026-09-07.
 */
import React, { useEffect, useMemo, useState, useSyncExternalStore, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { Play, StickyNote } from 'lucide-react';
import { useI18n } from '../i18n';
import { useUiStore } from '../store/uiStore';
import { useMetric } from '../store/metricsStore';
import { chargeStateById } from '../lib/chargeState';
import { needleEngine } from '../runtime/NeedleEngine';
import { SET_OFFSET } from '../engine/dialGeometry';
import { SQUEEZE_TARGET_OFFSET } from '../engine/thetaSetup';
import { QuantumSphere } from '../components/QuantumSphere';
import { ClearDial } from '../components/ClearDial';
import { MirrorDial } from '../components/MirrorDial';
import { ToneDial } from '../components/ToneDial';
import { ToneColumn } from '../components/ToneColumn';
import { VistaSenzaAgo } from './VistaSenzaAgo';
import { ScalaTonoCompleta } from './ScalaTonoCompleta';
import { ItemDaScrivere } from './ItemDaScrivere';
import { SegmentoVetro } from './SegmentoVetro';
import type { SessionMode } from '../engine/sessionMode';
import type { SessionPhase } from '../engine/sessionPhase';
import type { Procedimento } from '../lib/procedimenti';
import type { useThetaMeter } from '../hooks/useThetaMeter';
import type { useToneCycle } from '../session/useToneCycle';
import type { useMirrorCycle } from '../session/useMirrorCycle';
import type { useContactNullCycle } from '../session/useContactNullCycle';
import type { useTruthCycle } from '../session/useTruthCycle';
import type { useEpValidation } from '../hooks/useEpValidation';

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
 * ── L'AGO, ISOLATO — segnalato nella revisione completa (efficienza): `needleOffsetEeg`
 * (`useSyncExternalStore(needleEngine.subscribe, needleEngine.getPos)`) viveva nel corpo di
 * `GruppoAlto` stesso — il motore fisico dell'ago aggiorna a ~60 Hz, quindi OGNI riga di questo
 * componente (~1300 righe di JSX, una trentina di figli fra archi, letture, pannelli) veniva
 * rivalutata 60 volte al secondo, non solo `QuantumSphere` che è l'UNICO a usare davvero quel
 * valore. React salta il re-render dei figli memoizzati le cui prop non cambiano, ma la
 * CREAZIONE di ogni elemento JSX del genitore — l'unica cosa che conta qui — no.
 *
 * Stesso principio già applicato sopra a `LetturaTA`/`LetturaFase`/`LetturaTotalTa`/
 * `LetturaVelocita` (v. la loro nota): isolare la sottoscrizione ad alta frequenza nel PIÙ
 * PICCOLO componente possibile, `React.memo`ato, così SOLO lui ridisegna a quella cadenza.
 * Qui il componente da isolare non è un semplice `<span>` ma `QuantumSphere` per intero (con
 * la sua condizione di montaggio, spostata dentro insieme — non dipende da `needleOffsetEeg`,
 * ma non ha senso lasciarla fuori quando tutto il resto si sposta).
 */
const AgoQuantumSphere = React.memo(function AgoQuantumSphere({
  agoEeg, meterC, vistaSenzaAgo, mirrorArmed, toneAttivo, senzaMisura, theta,
  needleReactionKey, thetaReactionKey, asIsnessState, onClick, showTrail, sessionState,
}: {
  agoEeg: boolean; meterC: boolean; vistaSenzaAgo: boolean; mirrorArmed: boolean;
  toneAttivo: boolean; senzaMisura: boolean; theta: ReturnType<typeof useThetaMeter>;
  needleReactionKey: string; thetaReactionKey: string;
  asIsnessState: ReturnType<typeof useEpValidation>['asIsnessState'];
  onClick: () => void; showTrail: boolean; sessionState: 'running' | 'idle';
}) {
  const needleOffsetEeg = useSyncExternalStore(needleEngine.subscribe, needleEngine.getPos);
  // Stessa condizione di montaggio già in `GruppoAlto` prima di questa estrazione — invariata,
  // solo spostata qui insieme al resto (v. `!senzaMisura && !(vistaSenzaAgo && ...)` nel
  // vecchio punto di chiamata, ora `AgoQuantumSphere` in `GruppoAlto.tsx`).
  if (senzaMisura || (vistaSenzaAgo && !mirrorArmed && !toneAttivo)) return null;
  return (
    <QuantumSphere
      needleOffsetProp={agoEeg ? needleOffsetEeg : SET_OFFSET}
      /* ⚠️ BUG TROVATO — segnalato: « quand on choisit MUSE, apparaît toujours l'aiguille des
         boîtes » e « l'aiguille du MUSE ne bouge pas ». La stessa causa per entrambi:
         `QuantumSphere` disegna l'ago del Meter ogni volta che `thetaOffset` non è `null`
         (nessun'altra guardia) — qui era `meterC ? theta.offset : null`, SENZA CONDIZIONE
         sull'ago scelto: col meter connesso, il suo ago restava sempre disegnato ANCHE
         scegliendo MUSE, fermo (a riposo, nessuna stretta in corso) proprio sopra quello EEG
         che invece si muoveva — sembrava che l'ago del MUSE non si muovesse, era l'ago del
         Meter, immobile, disegnato sopra il suo. App.tsx lo mostra SOLO quando è lui il
         principale (`agoPrincipale === 'theta'`, la sua nota: « un ago solo »): stessa
         esclusività qui, con `agoEeg` al posto di `agoPrincipale`. */
      /* ⚠️ BUG TROVATO E CORRETTO — stessa famiglia del bug appena sopra in `ToneDial`:
         segnalato di nuovo, « IN TONE... NON É PRESENTE » (e per estensione MIRROR), la vera
         causa a monte era QUI. La condizione di montaggio (nel vecchio punto di chiamata,
         ora nel guard `if` sopra) esclude `vistaSenzaAgo` SOLO quando `!mirrorArmed &&
         !toneAttivo` — apposta, perché in MIRROR/TONE non esiste una `VistaSenzaAgo`
         sostitutiva (le loro scale non sono CONTACT/DISSOLUTION/AS-IS) e l'arco di sfondo
         deve restare. Ma restando MONTATO, disegnava anche l'AGO — con `!agoEeg`/`agoEeg`
         che non sapevano nulla di `vistaSenzaAgo`, l'ago tornava visibile proprio nei due
         cicli dove "senza ago" doveva valere di più. Ora entrambe le sorgenti dell'ago si
         spengono con `!vistaSenzaAgo`: l'arco/le fasce restano (nessuna vista alternativa da
         inventare), solo la lancetta sparisce — lo stesso principio di `hasMeter` in
         `ToneDial`/`MirrorDial`. */
      thetaOffset={meterC && !agoEeg && !vistaSenzaAgo ? theta.offset : null}
      showEegNeedle={agoEeg && !vistaSenzaAgo}
      /* ── IL BERSAGLIO DELLA PROVA, SULL'ARCO — segnalato: « lors du test de pression et
         souffle, tu dois mettre la ligne pour le tir de l'arc comme dans equilibrium ».
         `QuantumSphere` sa già disegnarlo (la linea tratteggiata verde a un terzo di
         quadrante, con l'etichetta "1/3") — App.tsx gli passa `testBaseOffset +
         SQUEEZE_TARGET_OFFSET` durante la prova; qui restava sempre `null`, quindi durante
         stretta/respiro (aperti da `PannelloMeter` o da `ThetaReadyCheck`, entrambi già
         montati) il quadrante non mostrava dove l'ago deve arrivare. */
      targetOffset={theta.testing ? theta.testBaseOffset + SQUEEZE_TARGET_OFFSET : null}
      needleReactionKey={agoEeg ? needleReactionKey : thetaReactionKey}
      asIsnessState={asIsnessState}
      onClick={onClick}
      showTrail={showTrail}
      sessionState={sessionState}
    />
  );
});

export interface GruppoAltoProps {
  /** Calcolati insieme a `gruppoBasso` dalla stessa IIFE in `Serenity.tsx` — non ricalcolati qui. */
  comandiSottoAgo: boolean;
  cicloAttivo: boolean;
  aperta: boolean;
  museOk: boolean;
  meterC: boolean;
  needleReactionKey: string;
  thetaReactionKey: string;
  reazioniViste: 'eeg' | 'theta' | 'both';
  setReazioniViste: (v: 'eeg' | 'theta' | 'both') => void;
  agoEeg: boolean;
  /** `avvio?.esperto` — tri-stato: `!== true` conta come BASIC. */
  espertoAttivo: boolean | null | undefined;
  theta: ReturnType<typeof useThetaMeter>;
  tone: ReturnType<typeof useToneCycle>;
  mirror: ReturnType<typeof useMirrorCycle>;
  cycles: ReturnType<typeof useContactNullCycle>;
  ep: ReturnType<typeof useEpValidation>;
  truth: ReturnType<typeof useTruthCycle>;
  LC: (it: string, fr: string, en: string, es: string, sv: string) => string;
  taRef: MutableRefObject<HTMLDivElement | null>;
  showTrailPref: boolean;
  setShowTrailPref: Dispatch<SetStateAction<boolean>>;
  vistaSenzaAgo: boolean;
  setVistaSenzaAgo: Dispatch<SetStateAction<boolean>>;
  toneAttivo: boolean;
  faseCiclo: SessionPhase;
  handleQuantumSphereClick: () => void;
  deltaStar: number;
  deltaStarN: number;
  senzaMisura: boolean;
  procedimentoAttivo: Procedimento | null;
  apri: () => void;
  senzaStrumenti: boolean;
  agoScelto: 'eeg' | 'theta';
  setAgoScelto: (v: 'eeg' | 'theta') => void;
  metabolicOpen: boolean;
  mostraBriefingIniziale: boolean;
  campiSessioneNascosti: boolean;
  sessionObjective: string;
  setSessionObjective: (v: string) => void;
  sessionPhysicalCheck: string;
  setSessionPhysicalCheck: (v: string) => void;
  sessionBriefing: string;
  setSessionBriefing: (v: string) => void;
  setPrimaVoltaLibero: (v: boolean) => void;
  mode: SessionMode;
  deveScegliereTono: boolean;
  setTonoScelto: (v: boolean) => void;
  spiegazioneCiclo: { titolo: string; comando?: string | null; come: string; avviso?: string | null; fatto?: boolean };
  comeSenzaAgo: (fase: string) => string | null;
  senzaNumero: (s: string) => string;
  item: string;
  setItemManuale: (v: string) => void;
  dichiaraItemDetto: () => void;
  bottoniCiclo: React.ReactNode;
}

export function GruppoAlto({
  comandiSottoAgo, cicloAttivo, aperta, museOk, meterC, needleReactionKey, thetaReactionKey,
  reazioniViste, setReazioniViste, agoEeg, espertoAttivo, theta, tone, mirror, cycles, ep, truth, LC,
  taRef, showTrailPref, setShowTrailPref, vistaSenzaAgo, setVistaSenzaAgo, toneAttivo, faseCiclo,
  handleQuantumSphereClick, deltaStar, deltaStarN, senzaMisura, procedimentoAttivo, apri, senzaStrumenti, agoScelto,
  setAgoScelto, metabolicOpen, mostraBriefingIniziale, campiSessioneNascosti, sessionObjective,
  setSessionObjective, sessionPhysicalCheck, setSessionPhysicalCheck, sessionBriefing, setSessionBriefing,
  setPrimaVoltaLibero, mode, deveScegliereTono, setTonoScelto, spiegazioneCiclo, comeSenzaAgo, senzaNumero,
  item, setItemManuale, dichiaraItemDetto, bottoniCiclo,
}: GruppoAltoProps) {
  const { t, lang } = useI18n();
  // ⚠️ VERIFICATO — segnalato nella revisione completa come possibile rottura del
  // `React.memo` di `LetturaFase`/`LetturaVelocita` (sotto): controllato di persona, NON lo è
  // — `as` è un cast, sparisce del tutto a runtime (`tWide` è letteralmente `t`, non una nuova
  // funzione), e `t` (da `useI18n`) è già stabilizzata con `useCallback` su `[lang]`: il memo
  // funzionava già. `useMemo` qui non CORREGGE nulla — documenta esplicitamente l'intento
  // (« questa prop deve restare la stessa finché la lingua non cambia ») invece di lasciarlo
  // implicito in un dettaglio di TypeScript facile da rompere per sbaglio in futuro (bastasse
  // scrivere `t2 = (k) => t(k)` invece del cast, la nuova funzione SÌ spezzerebbe il memo).
  const tWide = useMemo(() => t as (key: string) => unknown, [t]);
  const isLightTheme = useUiStore(s => s.isLightTheme);
  const qLnow = useMetric(m => m.qL);
  /** ── RICHIAMATI A MANO — v. la nota grande su « la maniglia », più giù nel render. Un
   *  tocco sulla maniglia forza a vista obiettivo/stato fisico/r-factor anche quando
   *  `campiSessioneNascosti` (prop, da `Serenity.tsx`) direbbe di no — puro stato di resa,
   *  non c'è nulla che un altro componente debba sapere su « li ho richiamati », quindi
   *  resta locale qui invece di risalire a `Serenity.tsx` come lo stato dei CAMPI stessi
   *  (`sessionObjective` & co., quelli sì condivisi). Si azzera da sé all'inizio/fine di ogni
   *  ciclo (`cicloAttivo` cambia): richiamarli DURANTE un ciclo non deve restare aperto per
   *  sempre nei cicli successivi, a insaputa di chi ha toccato la maniglia una volta sola. */
  const [richiamati, setRichiamati] = useState(false);
  useEffect(() => { setRichiamati(false); }, [cicloAttivo]);
  const campiVisibili = aperta && (!campiSessioneNascosti || richiamati);

  return (
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
            l'ingombro segnalato: una riga si trasformava in un'altra riga, non spariva. Poi
            `campiSessioneNascosti` non lasciava più NULLA al suo posto: i tre campi restavano
            comunque scritti (nello stato, nel rapporto) — solo non più a vista, e SENZA MODO
            di tornare a vederli (v. sotto per la correzione).
            ⚠️ CORRETTO — proposta « un solo fuoco per volta » (mockup discusso a voce,
            09/09/2026): due bug, non uno solo. Primo, quello appena sopra — nessuna maniglia
            vera esisteva più, nonostante un commento altrove (`Serenity.tsx`) affermasse il
            contrario. Secondo, verificato dal vivo: su una seduta dove questi tre campi
            restano VUOTI (il caso più comune — sono facoltativi) il timer dei 10 secondi non
            parte MAI, quindi restavano a schermo per l'INTERA seduta, anche nel bel mezzo di
            « DÌ L'ITEM » — l'istante in cui contano di meno. `campiSessioneNascosti`, passata
            da `Serenity.tsx`, ora è vera anche quando un ciclo è semplicemente IN CORSO
            (`cicloAttivo`, indipendente dal timer) — v. la nota lì. Qui, una maniglia VERA
            stavolta: `richiamati` (sotto) la riporta in vista con un tocco, esattamente come
            chiesto (« nascosti, un tocco per richiamarli ») — non una pillola isolata come
            quella tolta un giro fa, un filo appena percepibile, la stessa idea di « si coglie
            con la coda dell'occhio » che già governa `tokens.css`. */}
        {/* ⚠️ SEGNALATO DI NUOVO — « hai fatto malissimo: appare il bottone CHIUDI LA SEDUTA
            mentre abbiamo in alto il bottone pulsante INIZIA, questo non va bene. Il bottone
            START deve essere posizionato sotto la frase INSERISCI L'R-FACTOR ». Il giro
            precedente aveva letto "sotto il campo R-Factor" come il campo dell'INTESTAZIONE
            (qui sotto) — sbagliato: portava il bottone pulsante proprio accanto a "FERMER LA
            SÉANCE" in alto, due comandi opposti ("chiudi"/"inizia") fianco a fianco.
            "INSERISCI L'R-FACTOR" è la FRASE del briefing "INIZIO SESSIONE" (il punto della
            lista "Prima di iniziare:", v. più giù) — è LÌ che il bottone vive ora, sotto
            quella frase, lontano da questa barra. Tornata alla condizione originale
            (`!campiSessioneNascosti`, senza l'estensione `|| mostraBriefingIniziale`): non
            c'è più nessun bottone qui dentro che debba restare raggiungibile oltre i 10
            secondi. */}
        {campiVisibili && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            width: 'min(96%, 2200px)', maxWidth: '100%',
          }}>
            {/* ── RICHIUDI — mostrata SOLO quando i campi sono a vista per via del richiamo
                manuale (`richiamati`), non quando lo sarebbero comunque (nessun ciclo attivo,
                mai nascosti). Lo stesso identico filo della maniglia sotto: « un secondo tocco
                richiude » diventa vero anche nel codice, non solo nel commento. */}
            {richiamati && campiSessioneNascosti && (
              <button
                type="button"
                onClick={() => setRichiamati(false)}
                aria-label={LC(
                  'nascondi di nuovo obiettivo, stato fisico e r-factor',
                  "masquer à nouveau objectif, état physique et r-factor",
                  'hide objective, physical state and r-factor again',
                  'ocultar de nuevo objetivo, estado físico y r-factor',
                  'dölj mål, fysiskt tillstånd och r-factor igen',
                ) as string}
                style={{
                  border: 'none', background: 'none', cursor: 'pointer', pointerEvents: 'auto',
                  padding: '2px 22px 4px',
                }}>
                <span aria-hidden style={{ display: 'block', width: 34, height: 3, borderRadius: 999, background: 'var(--s-ink-ghost)' }} />
              </button>
            )}
            <div style={{
              display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 20,
              width: '100%', pointerEvents: 'auto',
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
          </div>
        )}
        {/* ── LA MANIGLIA — v. la nota grande sopra su `campiVisibili`/`richiamati`. Un solo
            filo (3px, `--s-ink-ghost` — lo stesso token che `tokens.css` riserva a « nessun
            segnale », non a un testo da leggere) invece di una pillola vera: deve trovarsi
            SENZA competere con l'ago o con « DÌ L'ITEM » per l'attenzione. L'etichetta sotto
            resta comunque leggibile a chi la cerca — la scoperta non deve dipendere dal
            ricordarsi che esiste. Un secondo tocco richiude (stesso bottone, stesso gesto):
            non serve una × a parte per un pannello così piccolo. */}
        {aperta && !campiVisibili && (
          <button
            type="button"
            onClick={() => setRichiamati(true)}
            aria-label={LC(
              'mostra obiettivo, stato fisico e r-factor',
              'afficher objectif, état physique et r-factor',
              'show objective, physical state and r-factor',
              'mostrar objetivo, estado físico y r-factor',
              'visa mål, fysiskt tillstånd och r-factor',
            ) as string}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              border: 'none', background: 'none', cursor: 'pointer', pointerEvents: 'auto',
              padding: '4px 22px 2px',
            }}>
            <span aria-hidden style={{ width: 34, height: 3, borderRadius: 999, background: 'var(--s-ink-ghost)' }} />
            <span style={{
              fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-micro)', letterSpacing: '0.08em',
              textTransform: 'uppercase', color: 'var(--s-ink-ghost)',
            }}>
              {LC('obiettivo · stato · r-factor', 'objectif · état · r-factor', 'objective · state · r-factor',
                'objetivo · estado · r-factor', 'mål · tillstånd · r-factor')}
            </span>
          </button>
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
          /* ⚠️ SEGNALATO con screenshot: « la disposizione è sbagliata con l'arco fuori
             schermo — puoi nasconderlo, poiché stiamo vedendo solo i comandi ». Quando un
             procedimento è aperto (`procedimentoAttivo`, v. sotto — mostra `PistaProcedimento`,
             es. "RADIAL PROCEDURE") NESSUN ago vero lo accompagna: non è una lettura in corso,
             è un testo di riferimento. Ma questo riquadro (l'intero quadrante — QuantumSphere,
             ClearDial/ToneDial/MirrorDial, il bottone PREMI START, le letture in alto a
             sinistra: tutti figli assoluti di QUESTO contenitore `position:relative`) restava
             comunque montato sopra, con la sua `aspectRatio` che lo spinge oltre l'alto dello
             schermo su una finestra bassa — proprio il "fuori schermo" segnalato. Un solo
             `display:'none'` qui basta a nasconderlo TUTTO insieme (niente da toccare in
             ciascun figlio): `PistaProcedimento`, più sotto nel flusso normale della colonna,
             resta l'unica cosa a schermo. */
          display: procedimentoAttivo ? 'none' : undefined,
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
                <LetturaFase t={tWide} />
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
                      <LetturaVelocita t={tWide} />
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
          {/* ⚠️ SEGNALATO DI NUOVO, con forza: « SENZA STRUMENTI NON DEVE MAI MOSTRARE L'ARCO,
              anche nella schermata iniziale (dove fai apparire l'arco con il bottone PREMI
              START) ». La nota qui sopra ("Solo `aperta`, non `!aperta`... PRIMA di aprire,
              l'arco resta — è lì che vive il bottone PLAY al centro") era una scelta
              deliberata di un giro precedente — esplicitamente ribaltata ora: "mai" vuol dire
              anche PRIMA di aprire. `!(senzaMisura && aperta)` → `!senzaMisura`, la stessa
              condizione dei tre archi (`VistaSenzaAgo`/`QuantumSphere` qui, `ClearDial`/
              `MirrorDial`/`ToneDial` poco più giù) senza più la clausola `&& aperta`. Quando
              il bottone PREMI START è a schermo, `senzaMisura` è già il segnale giusto: vero
              solo se `senzaStrumenti` è stato scelto O nessun MUSE/Meter è ancora connesso —
              esattamente quando non c'è nessun ago vero da disegnare dietro il bottone. */}
          {!senzaMisura && vistaSenzaAgo && !mirror.mirrorArmed && !toneAttivo && (
            <VistaSenzaAgo
              armed={cycles.cycleArmed}
              cycleKind={cycles.cycleKind}
              nullPhase={cycles.nullPhase}
              isLightTheme={isLightTheme}
            />
          )}
          {/* L'AGO — `AgoQuantumSphere`, sopra in questo file (v. la sua nota grande: isolato
              in un `React.memo` a parte perché la sua sottoscrizione al motore fisico
              dell'ago aggiorna a ~60 Hz — senza, OGNI riga di `GruppoAlto` ridisegnava a
              quella cadenza, non solo lui). Porta con sé, invariata, sia la condizione di
              montaggio (`!senzaMisura && !(vistaSenzaAgo && !mirror.mirrorArmed &&
              !toneAttivo)`, ora un guard interno) sia tutta la storia dei bug già corretti
              su `thetaOffset`/`showEegNeedle`/`targetOffset` — commenti spostati con lei,
              non persi. */}
          <AgoQuantumSphere
            agoEeg={agoEeg}
            meterC={meterC}
            vistaSenzaAgo={vistaSenzaAgo}
            mirrorArmed={mirror.mirrorArmed}
            toneAttivo={toneAttivo}
            senzaMisura={senzaMisura}
            theta={theta}
            needleReactionKey={needleReactionKey}
            thetaReactionKey={thetaReactionKey}
            asIsnessState={ep.asIsnessState}
            onClick={handleQuantumSphereClick}
            showTrail={showTrailPref}
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
              ⚠️ Stessa condizione di `QuantumSphere` appena sopra — senza strumenti nessuno dei
              tre archi ha un ago da inseguire: sparisce anche lui, insieme all'ago, per lo
              stesso motivo — MAI, nemmeno PRIMA di aprire la seduta (v. la nota grande su
              `QuantumSphere`, poco più su: `!senzaMisura`, non più `!(senzaMisura && aperta)`). */}
          {!senzaMisura && (
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
                {/* ⚠️ TOLTO — segnalato: « le indicazioni FONTE/METER fuori dai punti tarati
                    sono inutili. Normalmente l'auditor sa che deve tarare il METER e le
                    lattine. Togliele ». Questo riquadro (`left:-150…310`, la striscia laterale
                    fuori dalla zona arco) portava fino a un giro fa DUE badge — "fonte ·
                    MUSE/METER/dichiarato" e "fuori dai punti tarati" — bersaglio di tre giri
                    di correzioni di puro posizionamento (z-index contro `.ser-comandi`, poi il
                    taglio a `left:-150` che li spingeva fuori dallo schermo — tutta questa
                    storia, ormai superflua, è stata tolta insieme ai badge). Restava solo
                    `ToneColumn` a valere la pena in questo riquadro — nessun `flexDirection`/
                    `gap` più necessari, un solo figlio. */}
                <div style={{
                  position: 'absolute', left: -150, top: '22%', bottom: '6%', width: 460, zIndex: 9,
                  pointerEvents: 'none',
                }}>
                  <div style={{ height: '100%', width: '100%' }}>
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
              zIndex: 4,
              /* `width:'100%'` accanto a `maxWidth` — senza, il `display:flex` con
                 `alignItems:'center'` (sotto) resta largo quanto il SUO contenuto (shrink-
                 to-fit, essendo `position:absolute`), non quanto `maxWidth` concede: la `grid`
                 delle due liste (`gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))'`,
                 più giù) vedeva così una larghezza troppo stretta per due colonne e ripiegava
                 su UNA, raddoppiando l'altezza reale rispetto a quella prevista. */
              width: '100%', maxWidth: mostraBriefingIniziale ? 660 : 560,
              /* ⚠️ `82vh` (l'altezza della FINESTRA) era la misura sbagliata — verificato dal
                 vivo via DOM: questo contenitore vive dentro un genitore posizionato alto
                 ~400px (lo spazio VERO fra header e riga dei cerchi dei cicli, non l'intera
                 finestra), quindi `82vh` (738px a 900px di finestra) non scattava mai, e il
                 testo (613px col titolo ingrandito) usciva sopra/sotto quello spazio reale,
                 dietro header/riga cicli. `100%` risolve contro il VERO genitore posizionato
                 (`top:50%` qui sotto è già relativo a lui): il contenitore centrato ora
                 riempie esattamente lo spazio disponibile, `overflowY:auto` scorre SOLO se
                 il testo non ci sta comunque, invece di restare un budget mai raggiunto. */
              maxHeight: '100%', overflowY: 'auto',
              padding: '0 24px', textAlign: 'center',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
              pointerEvents: mostraBriefingIniziale ? 'auto' : 'none',
            }}>
              {/* ⚠️ SEGNALATO DI NUOVO — due correzioni sullo stesso blocco:
                  1) « scrivi il briefing INIZIO SESSIONE più grande, come i comandi dei cicli ».
                     Taglie allineate a quelle di `spiegazioneCiclo` qui sotto (il ramo "ciclo in
                     corso"): titolo `--s-fs-hero` (era `--s-fs-xl`), intro `--s-fs-xl` serif
                     (era `--s-fs-base`), le due intestazioni/liste `--s-fs-lg` (erano
                     `--s-fs-sm`) — la STESSA gerarchia di taglie, non un'invenzione a parte.
                     `maxHeight`+`overflowY` sul contenitore (sopra) resta la rete di sicurezza
                     per le finestre più basse, ora che il testo occupa più spazio.
                  2) « quando si finisce un ciclo si ritorna alla schermata iniziale e c'è
                     sempre scritto DAI L'ITEM, Scrivilo o dillo... Non deve più apparire ».
                     Vero — `mode === 'free'` senza `primaVoltaLibero` (un ciclo è già stato
                     armato e concluso in questa seduta) ricadeva sul ramo "ciclo in corso" con
                     `spiegazioneCiclo`'s "1 · DAI L'ITEM": quella frase descrive il PRIMO passo
                     del processo CONTACT, non un invito generico a ridare un item — fuorviante
                     quando l'auditor è semplicemente tornato al libero dopo MIRROR/TONE/NULL e
                     sta per SCEGLIERE un nuovo ciclo dai cerchi qui sotto, non a "scriverlo o
                     dirlo". Terzo ramo aggiunto: `mode === 'free' && !primaVoltaLibero` → nessun
                     testo, solo i cerchi (`bottoniCiclo`, sempre montati sotto). Il ramo
                     `spiegazioneCiclo`/`comeSenzaAgo` resta SOLO per `mode !== 'free'` — un
                     ciclo davvero in corso (CONTACT/NULL/MIRROR/TONE/TRUTH).
                  3) « quand on commence la séance comme EXPERT on n'a pas besoin du debriefing
                     de INIZIO SESSION ». `mostraBriefingIniziale` (sopra, accanto a
                     `primaVoltaLibero`) aggiunge `espertoAttivo !== true`: in EXPERT il primo
                     libero cade ora nello STESSO ramo `null` di ogni libero successivo — mai
                     stato bisogno di un secondo flag, `mostraBriefingIniziale` è già falso.
                  4) « quand on est en basic au début de séance dans le debriefing ajoute que on
                     peut appuyer sur EXPLICATIONS DES BOUTONS en montrant l'icône ». Nuovo punto
                     nella lista "Durante la sessione", con la VERA icona `StickyNote` del
                     bottone-aiuto di header (`helpAttivo`/`AiutoOverlay`) accanto al testo — non
                     descritta a parole soltanto. */}
              {mostraBriefingIniziale ? (
                <>
                  <span style={{
                    fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-hero)', fontWeight: 800,
                    letterSpacing: '0.02em', lineHeight: 1.15, color: 'var(--s-ink)',
                  }}>
                    {LC('INIZIO SESSIONE', 'DÉBUT DE SÉANCE', 'SESSION START', 'INICIO DE LA SESIÓN', 'SESSIONSSTART')}
                  </span>
                  <span style={{ fontFamily: 'var(--s-serif)', fontSize: 'var(--s-fs-xl)', lineHeight: 1.35, color: 'var(--s-ink-soft)' }}>
                    {LC('Stai per iniziare la sessione.', 'Tu es sur le point de commencer la séance.',
                        'You are about to start the session.', 'Estás a punto de empezar la sesión.',
                        'Du är på väg att påbörja sessionen.')}
                  </span>
                  <div style={{
                    textAlign: 'left', alignSelf: 'stretch', display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px 32px',
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <span style={{ fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-lg)', fontWeight: 700, color: 'var(--s-ink)' }}>
                        {LC('Prima di iniziare:', 'Avant de commencer :', 'Before you start:', 'Antes de empezar:', 'Innan du börjar:')}
                      </span>
                      <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 5,
                        fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-lg)', lineHeight: 1.4, color: 'var(--s-ink-faint)' }}>
                        <li>{LC('Inserisci l\'Obiettivo della sessione.', 'Renseigne l\'Objectif de la séance.',
                                'Enter the session\'s Objective.', 'Introduce el Objetivo de la sesión.',
                                'Ange sessionens Mål.')}</li>
                        <li>{LC('Indica lo stato fisico del PC.', 'Indique l\'état physique du PC.',
                                'Indicate the PC\'s physical state.', 'Indica el estado físico del PC.',
                                'Ange PC:ns fysiska tillstånd.')}</li>
                        <li>{LC('Inserisci l\'R-Factor. Questi dati saranno inclusi nel rapporto finale della sessione.',
                                'Renseigne le R-Factor. Ces données seront incluses dans le rapport final de la séance.',
                                'Enter the R-Factor. This data will be included in the session\'s final report.',
                                'Introduce el R-Factor. Estos datos se incluirán en el informe final de la sesión.',
                                'Ange R-Factor. Dessa uppgifter inkluderas i sessionens slutrapport.')}</li>
                      </ul>
                      {/* ⚠️ SEGNALATO DI NUOVO — « il bottone START deve essere posizionato
                          sotto la frase INSERISCI L'R-FACTOR », dopo aver corretto due
                          incoerenze del giro precedente:
                          1) POSIZIONE — non più nella barra Obiettivo/Stato fisico/R-Factor
                             IN ALTO (v. la sua nota, sopra): stava proprio accanto a "FERMER
                             LA SÉANCE" — due comandi opposti ("chiudi"/"inizia") fianco a
                             fianco, la stessa incoerenza segnalata esplicitamente. Qui invece
                             è DENTRO il testo del briefing, sotto l'ultimo punto della lista
                             "Prima di iniziare" ("Inserisci l'R-Factor…") — letto alla
                             lettera, e lontano dai comandi di sessione in alto.
                          2) STILE — invariato dal giro prima: lo STESSO disegno del bottone
                             "PREMI START" originale (quello che apre la seduta, montato più
                             giù su `!aperta && (senzaStrumenti || museOk || meterC)`) —
                             cerchio 104px, bagliore radiale, anello pulsante
                             (`animation:'sStartPulse'`), `Play` da 46px. `position:'relative'`
                             (vive nel flusso della colonna) e `color:'var(--s-ink)'` diretto
                             (non il ternario `isLightTheme` dell'originale, tarato per il
                             fondo scuro del quadrante ago — qui il bottone sta nel testo del
                             briefing). */}
                      <button onClick={() => setPrimaVoltaLibero(false)}
                        title={LC('inizia', 'commencer', 'start', 'empezar', 'starta') as string} style={{
                          position: 'relative', alignSelf: 'flex-start', marginTop: 10,
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          color: 'var(--s-ink)', animation: 'sStartFade 0.5s ease-out',
                        }}>
                        <span style={{
                          position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 104, height: 104, borderRadius: '50%',
                          background: 'radial-gradient(circle at 50% 40%, color-mix(in srgb, currentColor 16%, transparent), color-mix(in srgb, currentColor 4%, transparent) 70%, transparent)',
                          border: '2px solid color-mix(in srgb, currentColor 55%, transparent)',
                          animation: 'sStartPulse 1.8s ease-in-out infinite',
                        }}>
                          <Play size={46} strokeWidth={1.6} fill="currentColor" style={{ marginLeft: 6 }} />
                        </span>
                        <span style={{
                          fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', fontWeight: 800, letterSpacing: '0.22em',
                          textTransform: 'uppercase',
                        }}>
                          {LC('inizia', 'commencer', 'start', 'empezar', 'starta')}
                        </span>
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <span style={{ fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-lg)', fontWeight: 700, color: 'var(--s-ink)' }}>
                        {LC('Durante la sessione:', 'Pendant la séance :', 'During the session:', 'Durante la sesión:', 'Under sessionen:')}
                      </span>
                      <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 5,
                        fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-lg)', lineHeight: 1.4, color: 'var(--s-ink-faint)' }}>
                        <li>{LC('Puoi scegliere uno dei cicli disponibili oppure eseguire liberamente qualsiasi procedimento.',
                                'Tu peux choisir l\'un des cycles disponibles ou mener librement n\'importe quel procédé.',
                                'You can choose one of the available cycles or freely run any process.',
                                'Puedes elegir uno de los ciclos disponibles o llevar libremente cualquier procedimiento.',
                                'Du kan välja en av de tillgängliga cyklerna eller fritt köra vilken process som helst.')}</li>
                        <li>{LC('Premi COMMANDS per visualizzare i comandi disponibili.',
                                'Appuie sur COMMANDS pour afficher les commandes disponibles.',
                                'Press COMMANDS to see the available commands.',
                                'Pulsa COMMANDS para ver los comandos disponibles.',
                                'Tryck på COMMANDS för att visa tillgängliga kommandon.')}</li>
                        <li>{LC('Premi ASSESSMENT per registrare automaticamente gli item che enunci.',
                                'Appuie sur ASSESSMENT pour enregistrer automatiquement les items que tu énonces.',
                                'Press ASSESSMENT to automatically log the items you call out.',
                                'Pulsa ASSESSMENT para registrar automáticamente los ítems que enuncies.',
                                'Tryck på ASSESSMENT för att automatiskt registrera de items du säger.')}</li>
                        <li>{LC('Il trascritto della sessione viene registrato automaticamente.',
                                'La transcription de la séance est enregistrée automatiquement.',
                                'The session transcript is recorded automatically.',
                                'La transcripción de la sesión se registra automáticamente.',
                                'Sessionens transkript spelas in automatiskt.')}</li>
                        {/* ⚠️ AGGIUNTO — segnalato: « quand on est en basic au début de séance
                            dans le debriefing ajoute que on peut appuyer sur EXPLICATIONS DES
                            BOUTONS en montrant l'icône ». Lo stesso bottone-icona (`StickyNote`,
                            `helpAttivo`/`AiutoOverlay`, montato in header) che apre le
                            spiegazioni brevi sopra i controlli dello schermo — qui nominato con
                            la SUA icona reale accanto al testo, non descritto a parole soltanto:
                            un BASIC che non l'ha mai notato in header lo riconosce comunque nel
                            briefing. Icona piccola (16px) e inline col testo via uno `span`
                            `inline-flex` DENTRO il `<li>` — mettere `display:flex` sul `<li>`
                            stesso gli avrebbe tolto il pallino elenco (i browser smettono di
                            generare `::marker` su un list-item con `display` sovrascritto). */}
                        <li>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, verticalAlign: 'middle' }}>
                            {LC('Premi', 'Appuie sur', 'Press', 'Pulsa', 'Tryck på')}
                            <StickyNote size={16} strokeWidth={1.8} style={{ flexShrink: 0 }} />
                            {LC('per le spiegazioni sui bottoni.', 'pour les explications sur les boutons.',
                                'for explanations on the buttons.', 'para las explicaciones sobre los botones.',
                                'för förklaringar på knapparna.')}
                          </span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </>
              ) : mode === 'free' ? null : deveScegliereTono ? (
                /* ⚠️ SEGNALATO DI NUOVO, con forza — v. la nota grande su `deveScegliereTono`
                   più sopra: « non hai capito... NON PUÒ ESSERE AUTOMATICA senza strumenti ».
                   La versione precedente lasciava a schermo il testo NORMALE del ciclo
                   ("2 · PORTALO A TONO 40", già pronto a salire) e infilava la scelta del
                   tono DOPO di lui, in fondo, dietro uno scroll — mai vista, perché la cosa
                   più in vista restava la pillola "0 → +40 in corso…" pulsante (ora spenta,
                   v. `bottoniCiclo`). Qui invece, finché il tono non è scelto, NIENT'ALTRO è a
                   schermo: uno schermo dedicato, lo stesso peso visivo del briefing "INIZIO
                   SESSIONE" — titolo hero, istruzione, la scala GRANDE, e il select — ultimo,
                   ma ora davvero il PRIMO gesto possibile, non un'aggiunta in coda. */
                <>
                  <span style={{
                    fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-hero)', fontWeight: 800,
                    letterSpacing: '0.02em', lineHeight: 1.15, color: 'var(--s-ink)',
                  }}>
                    {LC('A CHE TONO SI TROVA?', 'À QUEL TON EST-IL ?', 'WHAT TONE IS IT AT?', '¿A QUÉ TONO ESTÁ?', 'VILKEN TON ÄR DET?')}
                  </span>
                  <span style={{ fontFamily: 'var(--s-serif)', fontSize: 'var(--s-fs-xl)', lineHeight: 1.35, color: 'var(--s-ink-soft)' }}>
                    {LC('Guarda la scala e scegli a quale livello corrisponde questa resistenza.',
                        'Regarde l\'échelle et choisis à quel niveau correspond cette résistance.',
                        'Look at the scale and choose which level this resistance corresponds to.',
                        'Mira la escala y elige a qué nivel corresponde esta resistencia.',
                        'Titta på skalan och välj vilken nivå detta motstånd motsvarar.')}
                  </span>
                  {/* ⚠️ CORRETTO — segnalato con forza: « non va bene la scala del tono in
                      doppio... hai già il selettore dove fai vedere la scala, perché devi
                      farne un secondo... NON VOGLIO UNA SECONDA SCALA, è perturbante ». Qui
                      c'erano TRE rappresentazioni della stessa cosa insieme: `ToneColumn`
                      (13 nomi, sola lettura), il `<select>` nativo (62 livelli, ma un menu che
                      si chiude appena scelto) e `ScalaTonoCompleta` appena aggiunta (62 nomi,
                      scorrevole). Una SOLA scala ora: `ScalaTonoCompleta` con `onScegli` —
                      stessa lista, scorrevole COME chiesto, e le righe sono bottoni: toccarne
                      una sceglie quel tono, sostituendo lei stessa il `<select>` invece di
                      affiancarlo. */}
                  <div style={{ width: 340, maxWidth: '100%' }}>
                    <ScalaTonoCompleta tone={tone.toneAssessed} lang={lang}
                      onScegli={v => { tone.setToneAssessed(v); tone.correggiToneAtStart(v); setTonoScelto(true); }} />
                  </div>
                </>
              ) : (
                <>
                  <span style={{
                    fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-hero)', fontWeight: 800,
                    letterSpacing: '0.02em', lineHeight: 1.15,
                    color: spiegazioneCiclo.fatto ? 'var(--s-still)' : 'var(--s-ink)',
                  }}>
                    {senzaNumero(spiegazioneCiclo.titolo)}
                  </span>
                  {/* ⚠️ SEGNALATO: « quando si audisce senza strumenti, i comandi dei cicli
                      scrivili più grandi per rendere facile la lettura dell'auditor ». Senza ago
                      né arco a fare da appoggio visivo, questo blocco di testo è l'UNICA cosa che
                      l'auditor legge per condurre il ciclo — `--s-fs-lg` (18px, la taglia dei
                      titoli minori/domande di dialogo) bastava per una didascalia accanto a un
                      disegno, non per un testo letto da solo, magari a distanza dallo schermo.
                      `--s-fs-xl` (21px, la stessa taglia del nome SERENITY/dei numeri in mostra)
                      per il comando ESATTO da dire; `--s-fs-lg` anche per il "come" appena sotto
                      (era `--s-fs-base`, 15px, la più piccola del blocco) — stesso ragionamento,
                      è l'istruzione operativa, non una nota a margine. */}
                  {spiegazioneCiclo.comando && (
                    <span style={{ fontFamily: 'var(--s-serif)', fontSize: 'var(--s-fs-xl)', lineHeight: 1.35, color: 'var(--s-ink-soft)' }}>
                      {spiegazioneCiclo.comando}
                    </span>
                  )}
                  <span style={{ fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-lg)', lineHeight: 1.5, color: 'var(--s-ink-faint)' }}>
                    {comeSenzaAgo(faseCiclo) ?? spiegazioneCiclo.come}
                  </span>
                  {spiegazioneCiclo.avviso && (
                    <span style={{ fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-lg)', fontWeight: 700, color: 'var(--s-reserve)' }}>
                      {spiegazioneCiclo.avviso}
                    </span>
                  )}
                  {/* ⚠️ AGGIUNTO — segnalato: « SANS INSTRUMENT il faut avoir la possibilité
                      d'écrire l'item dans les Cycles, comme quand on a les instruments ».
                      Vero: questo overlay non montava mai `PistaCiclo` (niente arco da
                      affiancare senza strumenti, v. la condizione `!senzaMisura` sul suo unico
                      punto di montaggio) — l'unico modo di dare un item restava la voce o il
                      campo separato "R&I · Manuel"/ASSESSMENT, un gradino più lontano di un
                      `<input>` proprio nel testo che si sta già leggendo. `ItemDaScrivere` (v.
                      il file, estratto da `PistaCiclo.tsx` apposta per essere montato anche
                      qui) è lo STESSO componente, `item`/`setItemManuale`/`dichiaraItemDetto`
                      sono le STESSE variabili di sempre — scrivere qui vale quanto dirlo a
                      voce o scriverlo dentro `PistaCiclo`, per il motore è la stessa cosa.
                      `grande`: stessa taglia già scelta per i comandi in questo overlay
                      (`--s-fs-xl`/`--s-fs-lg`, non la taglia normale di `PistaCiclo`). */}
                  <ItemDaScrivere mode={mode} phase={faseCiclo} lang={lang} item={item} setItem={setItemManuale}
                    itemPlaceholder={t('ser_item_placeholder') as string} onDichiaraDetto={dichiaraItemDetto} grande />
                  {/* ⚠️ « ToneDial » (l'ARCO) resta escluso, sempre — non ha senso senza un ago
                      vero. La scala qui è quella GIÀ scelta (v. `deveScegliereTono` più
                      sopra: si arriva qui SOLO dopo aver scelto, `tone.raise` con `tonoScelto`
                      vero, o `tone.done`) — resta come riferimento visivo mentre si dà
                      "portalo a tono 40", non più un controllo su cui agire (niente
                      `onScegli`: qui `ScalaTonoCompleta` è sola lettura).
                      ⚠️ UNA SOLA SCALA, NON DUE — segnalato con forza (v. la stessa nota,
                      più su, sulla schermata di scelta): questo punto montava `ToneColumn` E
                      `ScalaTonoCompleta` insieme. Tolta `ToneColumn` — `ScalaTonoCompleta` da
                      sola resta l'UNICA scala, qui come nella schermata di scelta appena
                      sopra: stessa coerenza, un solo posto dove guardare in tutto il ciclo. */}
                  {toneAttivo && (faseCiclo === 'tone.raise' || faseCiclo === 'tone.done') && (
                    <div style={{ width: 340, maxWidth: '100%' }}>
                      {/* ⚠️ AGGIUNTO — segnalato: « quando si ottiene TONO 40, muovi la scala
                          per indicare TONO 40 ». Senza strumenti `tone.toneOra` non si muove
                          MAI da solo (nessuna misura lo fa salire) — resta fermo al valore
                          scelto in `deveScegliereTono` per tutta la salita, e ci resta ANCHE
                          dopo "tono quaranta raggiunto" (`tone.chiudiTone(true)`, che logga il
                          traguardo ma non tocca `toneAtStart`). Vero, ma la scala che
                          l'auditor guarda deve poter DIRE che ci si è arrivati: a `tone.done`
                          si mostra +40 a schermo, non il valore di partenza dimenticato lì. */}
                      <ScalaTonoCompleta tone={tone.tonePhase === 'done' ? 40 : (tone.toneOra ?? 0)} lang={lang} />
                    </div>
                  )}
                </>
              )}
              {/* ⚠️ AGGANCIATA IN FONDO — segnalato ancora, dopo aver già ridotto la scala:
                  « ora la scala nasconde i bottoni del ciclo TONE ». Il genitore (poco più su,
                  `overflowY:'auto'`) vive in uno spazio ALTO FISSO (~400px, lo spazio vero fra
                  header e riga dei cicli — v. la sua nota, non cambia con la finestra): nella
                  schermata "PORTALO A TONO 40" (titolo + citazione + comando + item + scala,
                  PRIMA dei bottoni) quel totale supera i 400px anche a finestra grande, perché
                  la finestra non c'entra — lo spazio disponibile resta lo stesso. Restringere
                  ancora la scala avrebbe iniziato a togliere l'utilità stessa dello scorrimento
                  (leggerne il nome al PC, il motivo per cui esiste). Invece: `position:sticky,
                  bottom:0` — i bottoni restano SEMPRE nella parte bassa visibile del riquadro,
                  qualunque cosa ci sia sopra e quanto sia alta; se il testo/scala non ci stanno
                  scorre SOLO quella parte, dietro di loro, mai loro stessi. */}
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                pointerEvents: 'auto',
                position: 'sticky', bottom: 0, width: '100%',
                background: 'var(--s-disc)', borderRadius: 12, padding: '10px 0 4px',
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
  );
}
