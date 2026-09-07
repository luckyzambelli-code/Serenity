/**
 * Intestazione — il `<header>` di Serenity.tsx per intero, undicesimo pezzo staccato dal corpo
 * (dopo `ZonaMna` e `BottoniCiclo` — v. `docs/serenity-refonte.md` per la cronologia completa
 * della scomposizione). L'intestazione (666 righe originarie) era già stata scomposta PIÙ A
 * FONDO in un giro precedente — nove componenti (`LogoSerenity`, `BottoniStoricoProcessus`,
 * `ChiAuditaAssetto`, `SelettoreStrumenti`, `IndicatoriRemoti`, `AssistenteIA`, …) — ma il
 * `<header>` stesso, che li monta tutti in fila, restava un blocco inline: questo file completa
 * quella scomposizione, dando anche all'involucro un nome e un'interfaccia di prop vera. Ogni
 * commento storico di sotto è copiato verbatim da dove viveva in `Serenity.tsx`.
 *
 * ── COSA RESTA FUORI DI PROPOSITO ────────────────────────────────────────────────────────────
 * Ogni azione COMPOSTA (`onCambiaLivello`, `onCambiaPersone`, `onSalvaConfig`, `onCambiaNomeConfig`,
 * `onToggleSalvaConfig`, `onApriProcessus`…) resta costruita in `Serenity.tsx` — questo componente
 * riceve solo "cosa succede quando premo", mai la logica di cosa succede davvero, esattamente
 * come già fanno i nove componenti che monta. `t`/`lang`/`isLightTheme`/`moduleVis.biometric`
 * sono presi QUI, internamente (dai loro stessi hook/store globali — `useI18n`/`useUiStore`/
 * `useSerenityModuleStore`), non passati come prop: sono valori globali, non stato di
 * `Serenity.tsx`, e prenderli qui evita quattro prop in più senza duplicare nulla.
 *
 * @see docs/serenity-refonte.md — giro di scomposizione, 2026-09-07.
 */
import type { MutableRefObject } from 'react';
import { Settings, HelpCircle, StickyNote } from 'lucide-react';
import { useI18n } from '../i18n';
import { useUiStore } from '../store/uiStore';
import { useSerenityModuleStore } from './serenityModuleStore';
import { SelettoreLingua, SelettoreTema } from './Impostazioni';
import { LogoSerenity } from './LogoSerenity';
import { BottoniStoricoProcessus } from './BottoniStoricoProcessus';
import { ChiAuditaAssetto } from './ChiAuditaAssetto';
import { SelettoreStrumenti } from './SelettoreStrumenti';
import { IndicatoriRemoti } from './IndicatoriRemoti';
import { AssistenteIA } from './AssistenteIA';
import type { Avvio } from './flussoAvvio';
import type { useMuseConnection } from '../hooks/useMuseConnection';
import type { useThetaMeter } from '../hooks/useThetaMeter';
import type { useMuseContactGate } from '../hooks/useMuseContactGate';
import type { useRemoteSession } from '../hooks/useRemoteSession';
import type { LogEntry } from '../components/TranscriptLog';

/** ── IL DIVISORE VERTICALE — separa le zone della barra comandi in alto (« si deve capire che
 *  sono cose diverse », v. dove viene usato). Era scritto a mano, lo stesso `<span>` identico,
 *  in QUATTRO punti diversi del file (analisi del codice, richiesta esplicita di sistemare
 *  tutto: duplicazione trovata con una ricerca sul letterale) — un componente a sé, non un
 *  gesto per volta: chi cambia il segno del separatore lo cambia una volta sola.
 *  SPOSTATO QUI da `Serenity.tsx` insieme all'intestazione: tutti e quattro i suoi usi vivevano
 *  dentro l'header, nessuno restava fuori — stesso componente, stesso motivo originario. */
function Divisore() {
  return <span style={{ width: 1, height: 16, background: 'var(--s-ink-ghost)', flexShrink: 0 }} />;
}

export interface IntestazioneProps {
  headerRef: MutableRefObject<HTMLElement | null>;
  /** Un metodo è armato — la barra amministrativa (logo/tema/lingua/storico/assetto/strumenti/
   *  guida/help/IA) sparisce, restano solo le connessioni (v. dentro) e CONFIG. */
  modalitaCiclo: boolean;
  avvio: Avvio;
  /** `avvio?.esperto` — tri-stato: `undefined`/`null`/`false` si legge come BASIC. */
  espertoAttivo: boolean | null | undefined;
  LC: (it: string, fr: string, en: string, es: string, sv: string) => string;
  onApriCrediti: () => void;
  nomeAuditor: string;
  nomePreclear: string;
  /** Seduta già aperta — passato a `ChiAuditaAssetto` (v. lì). */
  aperta: boolean;
  assettoAperto: boolean;
  onToggleAssetto: () => void;
  onCambiaLivello: () => void;
  onCambiaPersone: () => void;
  salvaConfigAperto: boolean;
  onToggleSalvaConfig: () => void;
  configSalvata: boolean;
  nomeConfigDaSalvare: string;
  onCambiaNomeConfig: (v: string) => void;
  onSalvaConfig: () => void;
  processusCount: number;
  onApriStorico: () => void;
  onApriProcessus: () => void;
  muse: ReturnType<typeof useMuseConnection>;
  theta: ReturnType<typeof useThetaMeter>;
  museGate: ReturnType<typeof useMuseContactGate>;
  /** `theta.status === 'connected'` — già calcolato da chi monta questo componente. */
  meterC: boolean;
  batteryLevel: number | null;
  senzaStrumenti: boolean;
  onSenzaStrumenti: (v: boolean) => void;
  strumentiEspansi: boolean;
  onEspandi: () => void;
  museOk: boolean;
  meterSetupAperto: boolean;
  onToggleMeterSetup: () => void;
  hardwareError: string | null;
  remote: ReturnType<typeof useRemoteSession>;
  onApriConfig: () => void;
  aiAperto: boolean;
  onToggleAi: () => void;
  tempo: number;
  needleReaction: string;
  journalLogs: LogEntry[];
  onApriGuida: () => void;
  helpAttivo: boolean;
  onToggleHelp: () => void;
}

export function Intestazione({
  headerRef, modalitaCiclo, avvio, espertoAttivo, LC, onApriCrediti, nomeAuditor, nomePreclear,
  aperta, assettoAperto, onToggleAssetto, onCambiaLivello, onCambiaPersone, salvaConfigAperto,
  onToggleSalvaConfig, configSalvata, nomeConfigDaSalvare, onCambiaNomeConfig, onSalvaConfig,
  processusCount, onApriStorico, onApriProcessus, muse, theta, museGate, meterC, batteryLevel,
  senzaStrumenti, onSenzaStrumenti, strumentiEspansi, onEspandi, museOk, meterSetupAperto,
  onToggleMeterSetup, hardwareError, remote, onApriConfig, aiAperto, onToggleAi, tempo,
  needleReaction, journalLogs, onApriGuida, helpAttivo, onToggleHelp,
}: IntestazioneProps) {
  const { t, lang } = useI18n();
  const isLightTheme = useUiStore(s => s.isLightTheme);
  const moduleVis = useSerenityModuleStore(s => s.moduleVis);

  return (
    /* ── L'INTESTAZIONE, che non è una barra ───────────────────────────────────────────
        Nessun fondo, nessuna linea di separazione: il nome sta posato sulla stessa
        superficie di tutto il resto. Una barra è già un pannello. */
    /* `flexWrap` — segnalato indirettamente: le pillole di vetro e i cursori scorrevoli sono
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
          prima che arrivi a chi dovrebbe riceverlo. */
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
        {/* ── IL LOGO, IL NOME, IL MEDAGLIONE — ESTRATTI in `LogoSerenity.tsx` — segnalato nella
            revisione completa: l'intestazione (666 righe) va scomposta PIÙ A FONDO, un pezzo
            alla volta, non in un colpo solo. Nessuna logica cambiata, solo il disegno — la
            cronologia completa delle segnalazioni che l'hanno formato vive ora lì dentro. */}
        <LogoSerenity
          onApriCrediti={onApriCrediti}
          isLightTheme={isLightTheme}
          mostraLivello={!!avvio}
          esperto={espertoAttivo}
          LC={LC}
        />
        {/* ⚠️ SEGNALATO: « la langue doit pouvoir être changée en cours de route » — non solo
            alle quattro domande d'avvio. Stessi due selettori di `Avvio.tsx`, condivisi da
            `Impostazioni.tsx`: qui restano visibili per tutta la seduta, non solo prima. */}
        <SelettoreTema />
        <SelettoreLingua />
        {/* ── STORICO E PROCESSUS — ESTRATTI in `BottoniStoricoProcessus.tsx`, segnalato nella
            revisione completa. Nessuna logica cambiata, solo il disegno. */}
        <BottoniStoricoProcessus
          auditorId={avvio?.auditorId}
          processusCount={processusCount}
          onApriStorico={onApriStorico}
          onApriProcessus={onApriProcessus}
        />
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
        {/* ── CHI AUDITA + ASSETTO — ESTRATTI in `ChiAuditaAssetto.tsx`, segnalato nella revisione
            completa. Ogni azione composta (cambia livello, ricomincia, salva configurazione)
            resta decisa QUI — il componente riceve solo "cosa succede quando premo", mai la
            logica di cosa succede davvero. La cronologia completa delle segnalazioni che hanno
            formato questo pannello vive ora dentro `ChiAuditaAssetto.tsx`. */}
        <ChiAuditaAssetto
          avvio={avvio}
          nomeAuditor={nomeAuditor}
          nomePreclear={nomePreclear}
          aperta={aperta}
          assettoAperto={assettoAperto}
          onToggleAssetto={onToggleAssetto}
          onCambiaLivello={onCambiaLivello}
          onCambiaPersone={onCambiaPersone}
          salvaConfigAperto={salvaConfigAperto}
          onToggleSalvaConfig={onToggleSalvaConfig}
          configSalvata={configSalvata}
          nomeConfigDaSalvare={nomeConfigDaSalvare}
          onCambiaNomeConfig={onCambiaNomeConfig}
          onSalvaConfig={onSalvaConfig}
          LC={LC}
        />
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
            ricollegare non serve a nessuno. Il gesto era rimasto permesso solo quando lo
            strumento NON era ancora connesso (`!s.connesso`) — disattivato quando cliccarlo
            avrebbe DISCONNESSO uno strumento già attivo durante un ciclo.
            ⚠️ RIMOSSO ANCHE QUEL BLOCCO — segnalato di nuovo, con forza: « durante la sessione,
            se voglio togliere il MUSE o il METER, devi lasciarlo fare. Ora non è possibile ».
            La restrizione era `modalitaCiclo` (` mode !== 'free' `, cioè QUALUNQUE metodo
            armato — CONTACT/NULL/MIRROR/TONE), non solo l'istante di un ciclo: in una seduta
            reale l'auditor lavora quasi sempre con un metodo armato, quindi il pulsante restava
            di fatto SEMPRE spento non appena uno strumento era connesso — visibile, cliccabile
            in apparenza, ma senza alcun effetto. L'auditor decide, non il ciclo: staccare uno
            strumento a metà lettura resta una sua scelta, non un errore da impedire qui. */}
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
        {/* ── STRUMENTI — ESTRATTO in `SelettoreStrumenti.tsx`, segnalato nella revisione
            completa. Nessuna logica cambiata, solo il disegno — la cronologia completa delle
            segnalazioni che l'hanno formato (« un solo bottone, solo icone », « selettore
            ridotto a un pallino di stato in BASIC »…) vive ora dentro `SelettoreStrumenti.tsx`. */}
        <SelettoreStrumenti
          muse={muse}
          theta={theta}
          museGate={museGate}
          meterC={meterC}
          batteryLevel={batteryLevel}
          senzaStrumenti={senzaStrumenti}
          onSenzaStrumenti={onSenzaStrumenti}
          espertoAttivo={espertoAttivo}
          strumentiEspansi={strumentiEspansi}
          onEspandi={onEspandi}
          mostraBiometria={!!moduleVis.biometric}
          museOk={museOk}
          LC={LC}
        />
        {/* ── LA SUA ESPANSIONE — due lattine/lattina sola, le due prove, la taratura TA ──────
            Segnalato: la stessa connessione non deve avere due abitudini diverse (una in alto,
            una in fondo alla pagina) da imparare. Qui, SOLO a meter connesso, una freccia
            accanto al suo stesso indicatore apre `PannelloMeter` come un cassetto ancorato
            proprio lì (`position:absolute`, sotto l'intestazione) — la stessa idea del cassetto
            di CONFIG, non un secondo luogo. */}
        {/* Nascosto in modalità ciclo — la sua taratura si rivede annullando il ciclo, non a
            metà lettura (stessa regola già scritta per la barra amministrativa sopra). */}
        {meterC && !modalitaCiclo && (
          <button className="s-glass s-glass-btn" onClick={onToggleMeterSetup} style={{
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
            <IndicatoriRemoti remote={remote} LC={LC} />
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
        <button className="s-glass s-glass-btn" onClick={onApriConfig} title={t('config') as string} data-help={t('config') as string} style={{
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
        {/* ⚠️ Segnalato: « una parte della zona resta fuori dalla finestra ». Il popover cresce
            verso SINISTRA (l'icona sta vicino al bordo destro dello schermo, fra CONFIG e
            Guide) — v. `AssistenteIA.tsx` per il dettaglio, e per l'intera cronologia di
            segnalazioni che l'hanno formato. Nascosto in modalità ciclo: non è uno strumento
            per la lettura in corso, e la sua barra di input competerebbe con lo spazio dedicato
            al campo item del ciclo. */}
        {aperta && !modalitaCiclo && (
          <AssistenteIA
            attivo={aiAperto}
            onToggle={onToggleAi}
            lang={lang as string}
            avvioSolo={avvio?.solo}
            nomeAuditor={nomeAuditor}
            nomePreclear={nomePreclear}
            tempo={tempo}
            meterC={meterC}
            totalTaTheta={theta.totalTa}
            needleReaction={needleReaction}
            journalLogs={journalLogs}
            LC={LC}
          />
        )}
        {/* ── LA GUIDA — segnalata assente nell'audit funzionale completo. `GuideModal` è
            autosufficiente (un iframe su `/guide/EQUILIBRIUM-manuale.html`, copiato a ogni
            build da `scripts/copy-guide.cjs`) — zero dipendenza dal motore, montata TALE E
            QUALE. Il manuale spiega il METODO di audit, non la grafica di un'applicazione: lo
            stesso testo vale per chi lavora da EQUILIBRIUM o da SERENITY. */}
        <button className="s-glass s-glass-btn" onClick={onApriGuida} title={t('sidebar_guide') as string} style={{
          cursor: 'pointer', padding: 8, borderRadius: 999,
          background: 'var(--s-disc)', display: 'flex', color: 'var(--s-ink-soft)',
        }}>
          <HelpCircle size={32} strokeWidth={1.6} />
        </button>
        {/* ── HELP A POST-IT — v. la nota su `AiutoOverlay`/`helpAttivo`, sopra. Bottone A SÉ,
            accanto a GUIDE ma diverso: un click mostra/nasconde le spiegazioni brevi sopra i
            controlli di QUESTA schermata, senza aprire nulla sopra di lei. */}
        <button className="s-glass s-glass-btn" onClick={onToggleHelp}
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
  );
}
