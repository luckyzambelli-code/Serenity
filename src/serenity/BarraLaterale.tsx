/**
 * BarraLaterale — la barra APRI/CHIUDI, PAUSA, EP/COMMANDS/DIZIONARIO e il Giornale, ancorata
 * fuori dall'arco sul bordo sinistro di `<main>`. Quarto pezzo del CORPO di `Serenity.tsx`
 * (dopo `ZonaMna`, `BottoniCiclo`, `Intestazione` — v. `docs/serenity-refonte.md` per la
 * cronologia completa della scomposizione). Ogni commento storico è copiato verbatim da dove
 * viveva in `Serenity.tsx`.
 *
 * ── COSA RESTA FUORI DI PROPOSITO ────────────────────────────────────────────────────────────
 * Ogni azione COMPOSTA (`chiudi`/`apri` la seduta, `pausaManuale`) resta costruita in
 * `Serenity.tsx` — questo componente riceve solo "cosa succede quando premo". `OraReale`
 * (l'orologio reale, prima una funzione locale usata SOLO qui) si è trasferito con la barra, non
 * duplicato — stessa ragione di `Divisore` in `Intestazione.tsx`. `moduleVis.journal`/
 * `setModuleVis` sono presi QUI, internamente (via `useSerenityModuleStore`, uno store globale),
 * non passati come prop: `setModuleVis` è già condiviso da altri pezzi di `Serenity.tsx`
 * (`ZonaAssessment`, `ColonnaSaluteAssessment`…), prenderlo qui non ne crea una seconda fonte.
 *
 * @see docs/serenity-refonte.md — giro di scomposizione, 2026-09-07.
 */
import React, { useEffect, useState, type MutableRefObject, type RefObject } from 'react';
import { Clock, Timer, Play, Pause, BookOpen, BadgeCheck, FileCheck, BookText, Smartphone } from 'lucide-react';
import { useSerenityModuleStore } from './serenityModuleStore';
import { GiornaleSeduta } from './GiornaleSeduta';
import { orologio } from './orologio';
import { sessionClock } from '../runtime/SessionClock';
import type { Avvio } from './flussoAvvio';
import type { Procedimento } from '../lib/procedimenti';
import type { useEpValidation } from '../hooks/useEpValidation';
import type { useSessionJournal } from '../session/useSessionJournal';
import type { ReadSrc } from '../engine/instantRead';

/** ── L'ORA VERA, NON QUELLA DELLA SEDUTA — segnalato: « vicino all'ora [della seduta] ci
 *  deve essere l'icona che indica cosa è, e sopra un'icona con l'ora attuale ». Due letture
 *  diverse: `orologio(tempo)` (sotto, con l'icona `Timer`) dice DA QUANTO è aperta la seduta;
 *  questa dice CHE ORE SONO davvero — utile a chi deve rispettare un orario, non ce l'aveva
 *  App.tsx ma qui è stata chiesta esplicitamente. Un `setInterval` di un secondo, isolato nel
 *  suo componente: non deve far ridisegnare la barra laterale intera ogni tick.
 *  SPOSTATA QUI da `Serenity.tsx` insieme alla barra: il suo unico uso vero viveva dentro. */
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

export interface BarraLateraleProps {
  sidebarTop: number;
  aperta: boolean;
  mostraBriefingIniziale: boolean;
  tempo: number;
  avvio: Avvio;
  telefonoPcCollegato: boolean;
  onApriSatellite: () => void;
  LC: (it: string, fr: string, en: string, es: string, sv: string) => string;
  pausata: boolean;
  pausaMotivoRef: MutableRefObject<'strumento' | 'manuale' | 'briefing' | null>;
  onPausaManuale: () => void;
  onChiudi: () => void;
  onApri: () => void;
  ep: ReturnType<typeof useEpValidation>;
  procedimenti: Procedimento[];
  onApriCommands: () => void;
  onApriDizionario: () => void;
  journal: ReturnType<typeof useSessionJournal>;
  museOk: boolean;
  meterC: boolean;
  shownReadsRef: RefObject<Array<{ time: number; reaction: string; src?: ReadSrc; episodeId?: number }>>;
  agoEegRef: RefObject<boolean>;
}

export function BarraLaterale({
  sidebarTop, aperta, mostraBriefingIniziale, tempo, avvio, telefonoPcCollegato, onApriSatellite,
  LC, pausata, pausaMotivoRef, onPausaManuale, onChiudi, onApri, ep, procedimenti, onApriCommands,
  onApriDizionario, journal, museOk, meterC, shownReadsRef, agoEegRef,
}: BarraLateraleProps) {
  const moduleVis = useSerenityModuleStore(s => s.moduleVis);
  const setModuleVis = useSerenityModuleStore(s => s.setModuleVis);

  return (
    /* ── LA BARRA LATERALE — APRI/CHIUDI e i quattro metodi, FUORI DALL'ARCO ─────────────
        Segnalato: « metti i bottoni Contact, Null, Mirror, Tone ed anche OPEN sul lato
        sinistro fuori dall'arco, così si ha più spazio per il ciclo stesso ». Prima
        stavano nella barra comandi orizzontale, sopra il quadrante — la stessa riga in cui
        vive anche « a che punto sono, cosa devo fare » (`SuggerimentoCiclo`) quando un
        ciclo è armato: più pillole in quella riga, meno posto per quel testo. Ancorata al
        bordo sinistro di `<main>` (che ha già `position:relative`), verticale, fuori dal
        contenitore del quadrante — zero logica nuova, gli stessi `chiudi`/`apri`/
        `cycles.armCycle`/`mirror.armMirror`/`setToneAttivo` di sempre, solo spostati. */
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
      {/* ⚠️ CORRETTO — segnalato dal vivo, per la terza volta, sempre più esplicito:
          « ESATTAMENTE della stessa dimensione [di "opzionale"] ED allineato ». Finché
          l'orologio stava "a sinistra del bottone" (giro storico, nota conservata qui sotto)
          il bottone vero restava largo ~178px dei 272 della colonna — nessuno spaziatore
          poteva pareggiarlo a "opzionale" (39 caratteri contro 15) senza o sforare la
          colonna o rimpicciolire il carattere fino all'illeggibile. L'unico modo di essere
          DAVVERO identici — stessa larghezza (272, l'intera colonna), stesso bordo sinistro
          E destro, stesso singolo rigo — era smettere di condividere la riga con l'orologio:
          ora l'orologio sta SOPRA, come una sua riga a parte (resta visibile, resta compatto,
          solo non più affiancato). */}
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {/* ⚠️ SEGNALATO DI NUOVO — « l'ora e il tempo di sessione devono essere più in
            grande, e l'ora più in evidenza del timer di sessione ». Il giro precedente
            (nota storica qui sopra, "L'armonizzazione delle taglie") li aveva portati alla
            STESSA taglia (`--s-fs-base`, 15px) apposta, come "stessa famiglia di
            informazione" — richiesta ora ESPLICITAMENTE ribaltata: non più uguali, l'orologio
            (`OraReale`) più grande E più marcato del timer di seduta (`orologio(tempo)`), non
            solo più grande insieme a lui. `--s-fs-xl` (21px, la taglia del nome SERENITY) per
            l'ora, `color:'var(--s-ink)'` pieno (non più `--s-ink-faint`) e `fontWeight:700` —
            il timer resta un passo sotto, `--s-fs-lg` (18px, comunque più grande di prima),
            stesso colore di sempre (`aperta ? --s-ink-soft : --s-ink-faint`): più grande
            anche lui, ma resta il SECONDO orologio, non il protagonista. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, pointerEvents: 'none', flexShrink: 0 }}>
          <span style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-xl)', fontWeight: 700, letterSpacing: '0.02em',
            color: 'var(--s-ink)',
          }}>
            <Clock size={17} strokeWidth={1.8} aria-hidden="true" />
            <OraReale />
          </span>
          {/* ⚠️ SEGNALATO — « quando si inizia la sessione senza strumenti non devi far
              partire il timer e indicare Chiudi la seduta se prima non si è schiacciato sul
              START che pulsa ». `mostraBriefingIniziale` è vero esattamente in quella
              finestra (BASIC, primo libero, briefing ancora a schermo, bottone INIZIA non
              ancora premuto) — il timer di seduta resta nascosto finché dura: la seduta È
              già `aperta` internamente (altrimenti il briefing non potrebbe stare a
              schermo), ma l'auditor non ha ancora "iniziato per davvero" nella sua
              esperienza, e vedere i secondi correre lo direbbe il contrario. L'ora reale
              (`OraReale`, sopra) resta comunque visibile — non è un orologio DI seduta.
              ⚠️ BUG TROVATO SUBITO DOPO — verificato dal vivo: `mostraBriefingIniziale` NON
              controlla `aperta` (il suo calcolo, sopra, guarda solo `mode`/`primaVoltaLibero`/
              `espertoAttivo` — `mode` vale già `'free'` PRIMA di aprire) — la sola
              `!mostraBriefingIniziale` nascondeva questa riga (e il bottone sotto) anche
              sulla schermata INIZIALE, prima di qualunque apertura: spariva "OUVRIR UNE
              SÉANCE" stesso, l'unico modo di cominciare. `&& aperta` in più: nascosto SOLO
              nella vera finestra briefing-aperto-non-ancora-iniziato, non prima. */}
          {!(mostraBriefingIniziale && aperta) && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 3,
              fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-lg)', letterSpacing: '0.03em',
              color: aperta ? 'var(--s-ink-soft)' : 'var(--s-ink-faint)',
              transition: 'color var(--s-slow) var(--s-ease)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              <Timer size={15} strokeWidth={1.8} aria-hidden="true" />
              {orologio(tempo)}
            </span>
          )}
        </div>
      </div>
      {/* ⚠️ SPOSTATO IN UNA RIGA A SÉ — v. la nota grande più sopra, sull'orologio: prima
          condivideva la riga CON l'orologio (`flex:1`, ~178px dei 272 della colonna) — ora
          `width:'100%'`, ESATTAMENTE come "opzionale" qui sotto: stessa larghezza, stesso
          bordo sinistro E destro, non solo lo stesso padding/altezza di prima. */}
      {!(mostraBriefingIniziale && aperta) && (
        // ⚠️ SEGNALATO — « il bottone chiudi la session fallo più verso il giallo, ma poco
        // vistoso ». Solo quando DICE "chiudi la seduta" (`aperta` vero — chiudere è il
        // gesto che conta, aprire no): una tinta di `--s-reserve` (lo stesso ambra tenue
        // già usato per "il dato c'è ma non è sostenibile", il terzo dei tre segnali del
        // sistema — v. `tokens.css`) leggerissima sul fondo, un bordo appena percettibile
        // — non un rosso d'allarme, un giallo SUSSURRATO: si nota se lo cerchi, non salta
        // agli occhi. Aprire una seduta resta il vetro neutro di sempre.
        // ⚠️ SEGNALATO DI NUOVO — stessa ragione del timer qui sopra: « non devi... indicare
        // Chiudi la seduta se prima non si è schiacciato sul START che pulsa ». Il bottone
        // intero resta nascosto finché `mostraBriefingIniziale && aperta` (v. la nota
        // grande sul timer, appena sopra, sul perché serve anche `aperta`) — nessun
        // "CHIUDI LA SEDUTA" a schermo prima che l'auditor abbia premuto INIZIA, l'unico
        // comando visibile in quella finestra è quello, dentro il testo del briefing —
        // MA "OUVRIR UNE SÉANCE", sulla schermata iniziale prima di qualunque apertura,
        // resta sempre a vista.
        <button className="s-glass s-glass-btn" onClick={aperta ? onChiudi : onApri} style={{
          width: '100%', boxSizing: 'border-box', cursor: 'pointer', pointerEvents: 'auto',
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
      )}
      {/* ⚠️ SPOSTATO QUI — segnalato dal vivo: « COLLEGA il telefono del PC non si vede bene
          sotto la CAM 2, dovresti metterlo sotto il bottone di inizio sessione, poiché è lì
          che si sceglie o meno di connettere un telefonino, non a sessione iniziata ». Era un
          bottone sopra CAM 2, quindi invisibile finché la seduta non era già aperta —
          esattamente al contrario di una scelta fatta PRIMA di aprire. Ora è proprio qui,
          SOTTO la riga di "apri una seduta" (una riga NUOVA nella stessa colonna, non dentro
          quella riga: ci stava per sbaglio al primo tentativo, e la riga orologio+bottone
          — larga 272px in tre — si schiacciava fino a 16px) — SOLO prima dell'apertura
          (`!aperta`), mai in SOLO, mai con `avvio.distanza` (che ha già la sua `Connessione` a
          schermo intero).
          ⚠️ CORRETTO — segnalato: « la parte opzionale del collegare il telefonino deve
          essere visibile per attivarla se l'auditor vuole attivarla durante la sessione ». Il
          commento diceva qui « a seduta già aperta non è più qui che lo si INIZIA a collegare »
          — vero fino a poco fa, ma lasciava l'auditor senza modo di connettere un telefono se
          la scelta arrivava DOPO l'apertura (il caso più comune ora: CAM 2 non mostra più
          nulla senza un flusso vero, v. `ZonaCamere.tsx`). Un'icona gemella, nella riga
          EP/COMMANDS/DIZIONARIO più sotto, resta raggiungibile per tutta la seduta — v. la sua
          nota lì.
          ⚠️ « Deve essere una scelta, non una imposizione, per cui l'indicazione deve
          chiaramente indicare che è una possibilità » — da cui l'etichetta "opzionale" SUL
          bottone stesso (non in una didascalia a parte, facile da non notare) e, quando il
          telefono È collegato, un badge di stato al suo posto invece di farlo sparire nel
          nulla (l'auditor deve poter vedere che la scelta fatta ha avuto effetto). */}
      {!aperta && !avvio.solo && !avvio.distanza && (
        // ⚠️ CORRETTO — segnalato dal vivo, per la terza volta: « ESATTAMENTE della stessa
        // dimensione di "apri una seduta" ED allineato ». Un tentativo con uno spaziatore
        // (per pareggiare la larghezza che "apri" condivideva con l'orologio) andava in
        // conflitto con un testo per forza più lungo ("opzionale — collega il telefono del
        // PC", 39 caratteri, contro i 15 di "apri una seduta"): a parità di riga sola, o
        // uno dei due sforava la colonna o l'altro diventava illeggibile. Risolto alla
        // radice spostando l'orologio sopra "apri" (v. la sua nota, più su) invece che
        // provare a pareggiare due larghezze in conflitto strutturale: ORA "apri" è a sua
        // volta largo 272px come questo, quindi il semplice `width:'100%'` di sempre basta
        // — nessuno spaziatore da mantenere in sincrono con la larghezza dell'orologio.
        telefonoPcCollegato ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            width: '100%', boxSizing: 'border-box', borderRadius: 16, padding: '12px 8px',
            background: 'color-mix(in srgb, var(--s-still) 14%, var(--s-disc))',
            color: 'var(--s-still)', fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-sm)',
            letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1.25, textAlign: 'center',
          }}>
            ✓ {LC('telefono del PC collegato', 'téléphone du PC connecté', "PC's phone connected",
                   'teléfono del PC conectado', 'PC-telefonen ansluten')}
          </div>
        ) : (() => {
          // ⚠️ CORRETTO — segnalato dal vivo: « FACULTATIF — connecter le télé... sort du
          // cadre dans différentes langues ». `fontSize: 11` era stato tarato guardando SOLO
          // l'italiano (39 caratteri) — il francese (43 caratteri, il più lungo delle 5
          // lingue) sforava il bottone alla stessa taglia. Un numero fisso non può reggere
          // testi di lunghezza diversa nella STESSA larghezza: qui il corpo del carattere si
          // calcola dalla lunghezza vera del testo scelto (39 caratteri → gli 11px già
          // verificati dal vivo restano il punto di riferimento), con un minimo leggibile
          // (9px) e un massimo (13px, la taglia di "apri una seduta") — si adatta da sé a
          // QUALUNQUE lingua, non solo alle cinque di oggi.
          const testo = LC('opzionale — collega il telefono del PC', 'facultatif — connecter le téléphone du PC',
                            "optional — connect the PC's phone", 'opcional — conectar el teléfono del PC',
                            'valfritt — anslut PC:ns telefon') as string;
          // ⚠️ CORRETTO ANCORA — verificato dal vivo in francese (43 caratteri, il più lungo):
          // `Math.round` a 10px sforava ancora di qualche pixel (`scrollWidth` 275 contro
          // `width` 272). `Math.floor` + un margine del 5% bastano a chiudere quel margine
          // per QUALUNQUE lunghezza, non solo per le cinque lingue misurate oggi.
          const dimensioneFont = Math.max(9, Math.min(13, Math.floor(11 * 39 / testo.length * 0.95)));
          return (
            <button className="s-glass s-glass-btn" onClick={onApriSatellite}
              style={{
                cursor: 'pointer', pointerEvents: 'auto', width: '100%', boxSizing: 'border-box',
                borderRadius: 16, padding: '12px 8px', border: 'none',
                background: 'var(--s-disc)', color: 'var(--s-ink-soft)',
                fontFamily: 'var(--s-sans)', fontSize: dimensioneFont, letterSpacing: '0.03em',
                textTransform: 'uppercase', lineHeight: 1.25, textAlign: 'center', whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
              📱 {testo}
            </button>
          );
        })()
      )}
      {/* ── PAUSA/RIPRENDI, CON IL SUO STATO ACCANTO — segnalato: « il bottone di pausa
          deve essere vicino al bottone Fermer la séance » (giro scorso), poi: « le pavé en
          pause fais le apparaître à côté du bouton REPRISE ». Il badge "in pausa"/
          "strumento perso" stava nell'angolo dell'arco, lontano dal bottone che la governa
          — ora sulla STESSA riga, a sinistra del bottone Pausa/Riprendi, come l'orologio
          sopra è a sinistra di Chiudi.
          ⚠️ AGGIUNTO `!(mostraBriefingIniziale && aperta)` — segnalato: « la freccia che
          pulsa per START e invece il bottone pausa a destra », la stessa incoerenza già
          corretta per timer/"chiudi la seduta" (v. le loro note, più sopra) ma dimenticata
          qui: questo bottone restava condizionato solo su `aperta`, quindi visibile anche
          nella finestra briefing-aperto-non-ancora-iniziato dove tutto il resto della barra
          è già nascosto. La pausa automatica che lo accompagna (`pausaMotivoRef.current ===
          'briefing'`, v. l'effetto vicino a `mostraBriefingIniziale`) fa il resto: durante
          quella finestra la seduta È davvero in pausa, quindi anche l'orologio VERO non
          corre — questo bottone che la comanda resta comunque nascosto, coerente con
          timer/chiudi, non con un motivo diverso da riflettere qui.
          ⚠️ BUG VERO TROVATO SUBITO DOPO — segnalato di nuovo, con l'aiuto dell'etichetta
          appena aggiunta accanto al bottone (v. sotto: prima, icona sola, difficile da
          riconoscere a colpo d'occhio — persino scambiata per un cestino verificandola dal
          vivo): « hai sempre il bottone pausa acceso all'inizio session sotto l'orario, non
          ha senso ». Vero — la condizione qui sopra non ha MAI controllato `aperta` da sola:
          `!(mostraBriefingIniziale && aperta)` è vera anche quando `aperta` è `false`
          (mostraBriefingIniziale vale allora `false` pure, quindi la congiunzione è `false`,
          la negazione `true`) — il bottone restava a schermo ANCHE sulla schermata
          "APRI UNA SEDUTA", prima di qualunque apertura, quando premerlo non significa
          niente. `aperta &&` in testa: nascosto SEMPRE a seduta chiusa, come timer e
          "chiudi/apri la seduta" già fanno. */}
      {aperta && !mostraBriefingIniziale && (
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {/* ── COLLEGA IL TELEFONO DEL PC, SULLA STESSA RIGA DI PAUSA — segnalato di nuovo:
              « hai positionè telephone PC avec les commands, EP et dictionnaire, cela n'est
              pas bon. Positionne le avant le bouton PAUSE, sur la meme ligne ». Era finito nel
              riquadro EP/COMMANDS/DIZIONARIO (v. la nota, più sotto, ancora presente per la
              cronologia) — un posto sbagliato: quel riquadro è "consultazione" (ripasso,
              raggiungibile anche a seduta chiusa), mentre collegare il telefono è un'AZIONE DI
              SEDUTA in corso, esattamente come mettere in pausa. Stessa riga di PAUSA, PRIMA
              del suo bottone — stesso stile compatto (icona sola, 20px, padding 10px,
              `borderRadius:16`, NON il cerchio 54px con etichetta sotto usato da EP/COMMANDS/
              DIZIONARIO, che qui affollerebbe la riga). Stesse guardie di prima
              (`!avvio.solo && !avvio.distanza` — mai in SOLO, mai a distanza, quella modalità
              ha già la sua `Connessione` a schermo intero); `aperta` e `!mostraBriefingIniziale`
              arrivano gratis dal cancello del contenitore, come per PAUSA stessa. */}
          {!avvio.solo && !avvio.distanza && (
            <button
              className="s-glass s-glass-btn"
              onClick={onApriSatellite}
              title={telefonoPcCollegato
                ? LC('telefono del PC collegato', 'téléphone du PC connecté', "PC's phone connected",
                     'teléfono del PC conectado', 'PC-telefonen ansluten') as string
                : LC('opzionale — collega il telefono del PC', 'facultatif — connecter le téléphone du PC',
                     "optional — connect the PC's phone", 'opcional — conectar el teléfono del PC',
                     'valfritt — anslut PC:ns telefon') as string}
              style={{
                cursor: 'pointer', pointerEvents: 'auto', padding: '10px 10px', borderRadius: 16,
                background: 'var(--s-disc)', display: 'flex', justifyContent: 'center', flexShrink: 0,
                color: telefonoPcCollegato ? 'var(--s-still)' : 'var(--s-ink-soft)',
              }}>
              <Smartphone size={20} strokeWidth={1.8} aria-hidden="true" />
            </button>
          )}
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
            onClick={onPausaManuale}
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
          {/* ⚠️ AGGIUNTA — segnalato: « hai sempre il bottone pausa acceso all'inizio
              session sotto l'orario, non ha senso ». Verificato dal vivo: il bottone È
              corretto (posizione giusta, subito sotto "chiudi la seduta"; stato giusto,
              icona spenta finché non è davvero in pausa) — il problema era la sua
              LEGGIBILITÀ: da solo, senza etichetta, l'icona ⏸ isolata è ambigua a
              colpo d'occhio (persino qui, verificandolo, è stata scambiata due volte per
              un cestino). Quando NON è in pausa non c'è alcun testo accanto (il badge
              ambra "in pausa"/"strumento perso" esiste solo QUANDO lo è) — questa
              etichetta neutra colma il vuoto, stesso stile micro/`--s-ink-faint` delle
              etichette di EP/COMMANDS/DIZIONARIO poco sotto. */}
          {!pausata && (
            <span style={{
              fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-micro)', fontWeight: 700,
              letterSpacing: '0.04em', color: 'var(--s-ink-faint)',
            }}>
              {LC('pausa', 'pause', 'pause', 'pausa', 'paus')}
            </span>
          )}
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
      {/* ⚠️ TOLTO IL CANCELLO `aperta` SU QUESTA RIGA — segnalato: « il Dizionario, i
          comandi devono essere presenti anche a seduta chiusa o non iniziata, per
          permettere all'auditor di rivedere i termini o i comandi ». Il riquadro intero
          (EP + COMMANDS + DIZIONARIO) stava dietro `{aperta && (…)}`, doppiato da un
          secondo `{aperta && (…)}` identico su OGNI bottone al suo interno — nessuno dei
          tre raggiungibile prima di aprire o dopo aver chiuso. EP resta legato alla seduta
          (registrare un EP senza seduta non ha senso, v. il suo `{aperta && (…)}` rimasto
          invariato qui sotto) — COMMANDS e DIZIONARIO no: consultarli è un ripasso, non
          un'azione di seduta, e l'auditor deve poterlo fare anche prima di iniziare o dopo
          aver finito. */}
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
        <div style={{ display: 'grid', justifyItems: 'center', gap: 4, pointerEvents: 'auto' }}>
          <button
            className="s-glass s-glass-btn"
            onClick={onApriCommands}
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
      {/* ── DIZIONARIO TECNICO — segnalato: « si potrebbe integrare il dizionario tecnico?
          ...un bottone come comands e processus sarebbe l'ideale ». Stessa forma esatta del
          bottone COMMANDS appena sopra (icona rotonda 54px, etichetta sotto) — v.
          `DizionarioModal.tsx` per la fonte dei dati e la nota sul copyright. */}
        <div style={{ display: 'grid', justifyItems: 'center', gap: 4, pointerEvents: 'auto' }}>
          <button
            className="s-glass s-glass-btn"
            onClick={onApriDizionario}
            title="DIZIONARIO" data-help={LC('cerca un termine nel dizionario tecnico di Dianetics e Scientology',
              'cherche un terme dans le dictionnaire technique de Dianetics et Scientology',
              'search a term in the Dianetics and Scientology technical dictionary',
              'busca un término en el diccionario técnico de Dianetics y Scientology',
              'sök en term i den tekniska ordboken för Dianetics och Scientology') as string} style={{
              width: 54, height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', border: '1.5px solid var(--s-ink-ghost)', borderRadius: '50%',
              background: 'var(--s-disc)', color: 'var(--s-ink-soft)',
            }}>
            {/* ⚠️ Segnalato: « l'icona del dizionario non mi piace ». Era `Search` (lente
                d'ingrandimento) — dice "cerca", non "dizionario", e qui accanto a COMMANDS
                (`BookOpen`) sembrava un bottone diverso, non un fratello. `BookText` (un
                libro con righe di testo dentro) somiglia di più a un vero dizionario, e resta
                distinta da `BookOpen`, già usato per COMMANDS/GUIDE poco sopra — mai la
                stessa icona per due bottoni diversi. */}
            <BookText size={22} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <span style={{
            fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-micro)', fontWeight: 700, letterSpacing: '0.04em',
            color: 'var(--s-ink-faint)',
          }}>{LC('DIZIONARIO', 'DICTIONNAIRE', 'DICTIONARY', 'DICCIONARIO', 'ORDBOK')}</span>
        </div>
      </div>
      {/* ── IL GIORNALE, SOTTO EP — ESTRATTO in `GiornaleSeduta.tsx` — segnalato nella
          revisione completa (v. `ZonaCamere.tsx` per la stessa scomposizione). Nessuna
          logica cambiata, solo il disegno: `moduleVis.journal`/`journal.logs`, i filtri, il
          calcolo della reazione istantanea (`shownReadsRef`/`agoEegRef`) restano gli stessi.
          La cronologia completa di ogni segnalazione che ha formato questo pannello (« cambia
          di posizione il giornale con l'assessment », « nel journal non appare il testo »,
          « la police... troppo bianca »…) vive ora dentro `GiornaleSeduta.tsx`. */}
      <GiornaleSeduta
        aperta={aperta}
        visibile={!!moduleVis.journal}
        onChiudi={() => setModuleVis(v => ({ ...v, journal: false }))}
        logs={journal.logs}
        museOk={museOk}
        meterC={meterC}
        shownReadsRef={shownReadsRef}
        agoEegRef={agoEegRef}
      />
    </div>
  );
}
