import React, { useEffect, useState } from 'react';
import { Check, X, ChevronRight } from 'lucide-react';
import { stepsOf, currentStep, stepDone, type StepId } from '../engine/cycleSteps';
import type { SessionMode } from '../engine/sessionMode';
import type { SessionPhase } from '../engine/sessionPhase';
import { pick5 } from '../i18n5';
import { SuggerimentoCiclo } from './SuggerimentoCiclo';

/**
 * PistaCiclo — LA PROCEDURA A FUOCO, SOVRAPPOSTA AL LATO SINISTRO DELL'ARCO.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * Segnalato: « le steps devono stare a sinistra dell'arco, senza ridurlo, sovrapposte con
 * trasparenza — il comando in corso grande e al centro, i vicini più piccoli e smorzati, in
 * modo da guidare l'attenzione, con l'ago sempre leggibile sotto ». `CycleSteps` (orizzontale,
 * nella barra comandi sopra il quadrante) resta la pista "di servizio", compatta; questa ne è
 * la lettura estesa, pensata per restare sovrapposta all'arco per tutta la durata del ciclo —
 * non solo un'occhiata nella barra.
 *
 * ── PERCHÉ IL CLIC NON SPOSTA MAI IL TEMPO REALE ────────────────────────────────────────────
 * Il clic su un tempo NON avanza né riporta indietro il ciclo — non esiste, e non deve esistere,
 * un motore che sappia "salta al tempo 2": il ciclo lo fa avanzare solo un gesto vero (dare
 * l'item, validare l'AS-IS, dichiarare raggiunto...). Il clic qui è una lente: mette a fuoco
 * visivamente un tempo passato o futuro per rileggerlo, poi torna da solo al tempo vero appena
 * il ciclo avanza davvero (v. l'`useEffect` sotto, agganciato a `cur`). Un clic che "spostasse"
 * il tempo reale mentirebbe sullo stato dell'audit — proprio quello che questa pista non deve
 * mai fare.
 *
 * Dati puri da `engine/cycleSteps` (`stepsOf`/`currentStep`/`stepDone`), le STESSE funzioni che
 * legge `components/CycleSteps.tsx`: nessuna logica nuova, solo una resa diversa dello stesso
 * dato — non può divergere da lui su quanti tempi ci sono o a quale si è.
 *
 * ── STESSA POSIZIONE DI `PistaProcedimento` — segnalato: « i comandi dei cicli siano
 * posizionati esattamente come i comandi dei procedimenti ». Stessa larghezza (280, non più
 * 250), stessa intestazione a pillola (fissa in cima, `position:'sticky'`, col nome del
 * metodo accanto al bottone di chiusura — invece di un bottone isolato sopra la lista), stesso
 * calcolo di `maxHeight`. Una sola differenza resta, voluta: qui non c'è scorrimento a
 * rotellina/frecce — i tempi del ciclo sono 2-4, sempre pochi abbastanza da stare tutti a
 * schermo, quello scorrimento serve a `PistaProcedimento` per liste potenzialmente lunghe.
 *
 * ── L'ITEM E LE INDICAZIONI, ANCHE LORO QUI — segnalato: « le indicazioni, e non solo gli
 * step dei cicli, devono stare a sinistra dell'ago — niente più dei cicli riprodotto in alto a
 * sinistra ». Prima l'item e `SuggerimentoCiclo` (comando/come/avviso) vivevano SOLO nella
 * barra comandi in alto — ora vivono SOLO qui: `item`/`spiegazione` sono passati da
 * `Serenity.tsx` (che li calcola già, `spiegazioneCiclo`), non ricalcolati qui — questo
 * componente resta una RESA, mai una seconda fonte della verità. `SuggerimentoCiclo`, estratto
 * in un file a sé (`./SuggerimentoCiclo.tsx`) proprio per poter essere importato qui senza un
 * giro circolare (`Serenity.tsx` importa già `PistaCiclo` da qui). La guida segue SEMPRE il
 * tempo REALE (`spiegazione`, calcolata da `faseCiclo`), mai il `fuoco` manuale di preview —
 * coerente con la nota sopra: solo il gesto vero decide cosa dire adesso, mai il clic su un
 * tempo passato o futuro.
 *
 * ── « DÌ L'ITEM… » / « L'HO DETTA », ANCHE LORO QUI — segnalato: « SAY THE ITEM e il bottone
 * THE ITEM HAS BEEN SAID devono stare a sinistra coi comandi, per tutti i cicli ». Prima
 * vivevano nella barra comandi (tre copie quasi identiche — solo TONE diceva "la resistenza"
 * al posto di "l'item"); qui è UN blocco solo, condizionato su `phase` (che questo componente
 * riceve già): `*.say_item`, per qualunque metodo. `onDichiaraDetto` resta l'UNICA vera azione
 * (chiama `dichiaraItemDetto`, il motore) — il resto (testo che pulsa, taglia, posizione) è
 * solo resa.
 */
export function PistaCiclo({ mode, phase, lang, top, item, itemPlaceholder, spiegazione, onDichiaraDetto }: {
  mode: SessionMode;
  phase: SessionPhase;
  lang: string;
  /** ⚠️ Segnalato: « fai cominciare i comandi sotto NEEDLE LIGHT ». Non più `top:'50%'`
   *  (centrata da sola sull'arco): il chiamante (`Serenity.tsx`) misura DAVVERO dove finisce
   *  il blocco della lettura TA — che porta NEEDLE LIGHT come suo ultimo elemento — e passa
   *  qui il punto esatto dove questa pista deve cominciare. Stessa tecnica già usata per
   *  `.ser-comandi`/la barra laterale (`headerRef`/`comandiRef`): misurare, non indovinare. */
  top: number;
  /** L'item dato per questo ciclo — stringa vuota se non ancora dato. */
  item: string;
  /** Il segnaposto da mostrare al posto dell'item, finché non è stato dato. */
  itemPlaceholder: string;
  /** Comando/come/avviso del tempo REALE in corso — lo stesso `spiegazioneCiclo` che la barra
   *  comandi passava a `SuggerimentoCiclo`, calcolato una sola volta in `Serenity.tsx`. */
  spiegazione: { titolo: string; comando?: string | null; come: string; avviso?: string | null; fatto?: boolean };
  /** Dichiara l'item (o la resistenza, in TONE) detto — chiama `dichiaraItemDetto`, il motore,
   *  invariato: qui solo la resa di « dì l'item… »/« l'ho detta ». */
  onDichiaraDetto: () => void;
}) {
  const L = (it: string, fr: string, en: string, es: string, sv: string) => pick5(lang, it, fr, en, es, sv);
  const steps = stepsOf(mode);
  const cur = currentStep(phase, mode);
  // Stessa condizione dei tre punti di chiamata tolti dalla barra comandi: armato, ma l'item
  // (la resistenza, in TONE) non è ancora stato dato a voce o dichiarato a mano.
  const diItem = phase === 'tone.say_item' || phase === 'mirror.say_item'
    || phase === 'contact.say_item' || phase === 'null.say_item';

  // Il fuoco manuale (clic su un tempo diverso da quello reale) si spegne da sé appena il ciclo
  // avanza davvero — mai restare a leggere un tempo vecchio mentre l'audit è già oltre.
  const [fuoco, setFuoco] = useState<number | null>(null);
  useEffect(() => { setFuoco(null); }, [cur]);
  // ⚠️ Segnalato: « bisogna poter chiudere i comandi ». Nessuno stato nuovo in `Serenity.tsx`:
  // resta locale, come `fuoco` — chiusa mostra solo una piccola maniglia per riaprirla, non
  // sparisce per sempre (l'auditor l'ha chiusa per un momento, non ha smesso di auditare).
  const [chiuso, setChiuso] = useState(false);

  // Stessa guardia di `CycleSteps`: APERTO non ha sequenza, e fuori da un ciclo non c'è un
  // tempo — in nessuno dei due casi si disegna qualcosa che non direbbe nulla di vero.
  if (!steps.length || cur < 0) return null;

  const ETICHETTA: Record<StepId, string> = {
    item:        L('ITEM', 'ITEM', 'ITEM', 'ÍTEM', 'ITEM'),
    mockup:      L('MOCK-UP', 'MOCK-UP', 'MOCK-UP', 'MOCK-UP', 'MOCK-UP'),
    asis:        'AS-IS',
    equilibrium: 'EQUILIBRIUM',
    value:       L('VALORE', 'VALEUR', 'VALUE', 'VALOR', 'VÄRDE'),
    double:      L('DOPPIO', 'DOUBLE', 'DOUBLE', 'DOBLE', 'DUBBEL'),
    obtained:    L('OTTENUTO', 'OBTENU', 'OBTAINED', 'OBTENIDO', 'UPPNÅTT'),
    tone40:      L('TONO 40', 'TON 40', 'TONE 40', 'TONO 40', 'TON 40'),
  };
  // Il nome del metodo, l'unico che il titolo dell'intestazione può avere qui — `mode` lo
  // dice già da sé, `free` non ci arriva mai (`steps.length` sarebbe 0, si esce sopra).
  const TITOLO_METODO: Record<SessionMode, string> = {
    contact: 'CONTACT', null: 'NULL', mirror: 'MIRROR', tone: 'TONE', free: '',
  };
  const titoloRileggi = L('fatto — clic per rileggerlo', 'fait — clic pour le relire',
    'done — click to reread it', 'hecho — clic para releerlo', 'klart — klicka för att läsa igen') as string;
  const titoloApri = L('mostra i comandi del ciclo', 'afficher les commandes du cycle',
    'show the cycle\'s commands', 'mostrar los comandos del ciclo', 'visa cykelns kommandon') as string;
  const titoloChiudi = L('nascondi i comandi del ciclo', 'masquer les commandes du cycle',
    'hide the cycle\'s commands', 'ocultar los comandos del ciclo', 'dölj cykelns kommandon') as string;
  const etichettaChiudi = L('CHIUDI', 'FERMER', 'CLOSE', 'CERRAR', 'STÄNG') as string;

  const principale = fuoco ?? cur;

  if (chiuso) {
    return (
      <button type="button" onClick={() => setChiuso(false)} title={titoloApri}
        style={{
          position: 'absolute', left: 16, top, zIndex: 5, pointerEvents: 'auto',
          display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
          border: '1px solid var(--s-ink-ghost)', borderRadius: 999, padding: '4px 8px 4px 6px',
          background: 'color-mix(in srgb, var(--s-ground) 42%, transparent)',
          fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-micro)', fontWeight: 700,
          letterSpacing: '0.06em', color: 'var(--s-ink-faint)',
        }}>
        <ChevronRight size={12} strokeWidth={2.4} />
        {ETICHETTA[steps[principale]]}
      </button>
    );
  }

  return (
    <div style={{
      // ⚠️ Segnalato: « i procedimenti e i cicli devono essere più a sinistra, allineati a
      // sinistra col METER TA ». `left:16` — lo STESSO valore della lettura TA (il blocco
      // `top:14, left:16` nello stesso `<section>`, dove vive "METER TA" e, sotto di lei,
      // NEEDLE LIGHT): non un numero vicino, lo stesso bordo sinistro. Il vero disegno
      // dell'arco comincia più a destra (x=320, v. la nota storica accanto a `ToneColumn`) —
      // la pista comincia PRIMA di lui, non sul suo bordo: si legge come il proseguimento
      // della colonna di sinistra (TA, NEEDLE LIGHT, poi questa pista), non più come
      // un'etichetta sovrapposta al centro dell'arco. Nessun pixel della geometria dell'arco
      // cambia (nessuna riga di `QuantumSphere`/`ClearDial` toccata) —
      // `pointerEvents:'none'` sul contenitore, `'auto'` solo sui singoli bottoni: non ruba
      // clic al quadrante nei punti senza testo.
      // ⚠️ `width:280`, non più 250 — segnalato: « posizionati esattamente come i comandi dei
      // procedimenti » (`PistaProcedimento`, stessa larghezza).
      position: 'absolute', left: 16, top, zIndex: 5,
      width: 280, maxHeight: `calc(100% - ${top}px - 24px)`, overflowY: 'auto',
      display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
      gap: 12, pointerEvents: 'none',
    }}>
      {/* ── L'INTESTAZIONE — segnalato: « i comandi dei cicli siano posizionati esattamente
          come i comandi dei procedimenti ». Stessa pillola fissa in cima di
          `PistaProcedimento` (nome a sinistra, chiusura a destra), non più un bottone isolato
          sopra la lista. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, position: 'sticky', top: 0,
        padding: '3px 4px 3px 10px', borderRadius: 999,
        background: 'color-mix(in srgb, var(--s-ground) 68%, transparent)',
        pointerEvents: 'auto',
      }}>
        <span style={{
          fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-micro)', fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--s-ink-faint)',
          whiteSpace: 'nowrap',
        }}>
          {TITOLO_METODO[mode]}
        </span>
        {/* ── LA CHIUSURA — segnalato la prima volta: « bisogna poter chiudere i comandi »;
            poi: « la chiusura non è evidente, metti più in rilievo »; poi ancora: « fai più
            grande il bottone di chiusura ». Da un'icona nuda di 20px, a un bottone bordato ed
            etichettato, a QUESTA taglia (icona 15px, testo `--s-fs-sm` invece di `-micro`,
            padding più largo) — lo stesso trattamento, solo più grande in ogni sua parte. */}
        <button type="button" onClick={() => setChiuso(true)} title={titoloChiudi}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
            borderRadius: 999, padding: '6px 14px 6px 11px',
            border: '1px solid var(--s-ink-ghost)',
            background: 'color-mix(in srgb, var(--s-ground) 55%, transparent)',
            fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-sm)', fontWeight: 700,
            letterSpacing: '0.06em', color: 'var(--s-ink-soft)',
          }}>
          <X size={15} strokeWidth={2.6} />
          {etichettaChiudi}
        </button>
      </div>
      {/* ── L'ITEM — segnalato: « niente più dei cicli riprodotto in alto a sinistra ». Era in
          `testataCiclo`, nella barra comandi; stessa resa (`--s-serif`/`--s-fs-lg`), qui
          sotto l'intestazione invece che accanto al badge. */}
      <span style={{
        fontFamily: 'var(--s-serif)', fontSize: 'var(--s-fs-lg)', color: 'var(--s-ink)',
        padding: '0 10px',
      }}>
        {item || itemPlaceholder}
      </span>
      {/* ── « DÌ L'ITEM… » / « L'HO DETTA » — segnalato: « devono stare a sinistra coi
          comandi, per tutti i cicli ». TONE dice "la resistenza", gli altri tre "l'item" —
          stessa distinzione che facevano le tre copie nella barra comandi. */}
      {diItem && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px', pointerEvents: 'auto' }}>
          <span className="ser-pulse" style={{
            fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', letterSpacing: '0.04em',
            color: 'var(--s-reserve)',
          }}>
            {mode === 'tone'
              ? L('dì la resistenza…', 'dis la résistance…', 'say the resistance…', 'di la resistencia…', 'säg motståndet…')
              : L('dì l\'item…', 'dis l\'item…', 'say the item…', 'di el ítem…', 'säg item…')}
          </span>
          <button type="button" className="s-glass s-glass-btn" onClick={onDichiaraDetto}
            title={L('la trascrizione non c\'è o non si sente — dichiara che è stato detto',
              'pas de transcription ou pas de son — déclare que c\'est dit',
              'no transcript or no sound — declare it has been said',
              'sin transcripción o sin sonido — declara que se ha dicho',
              'ingen transkription eller inget ljud — förklara att det har sagts') as string}
            style={{
              cursor: 'pointer', borderRadius: 999, padding: '5px 14px', background: 'var(--s-disc)',
              fontFamily: 'var(--s-sans)', fontSize: 15, color: 'var(--s-ink-faint)', border: 'none',
            }}>
            {mode === 'tone'
              ? L('l\'ho detta', 'je l\'ai dite', 'said it', 'la he dicho', 'sa det')
              : L('l\'item è stato detto', 'l\'item a été dit', 'the item has been said', 'el ítem ha sido dicho', 'item har sagts')}
          </button>
        </div>
      )}
      {steps.map((s, i) => {
        const distanza = Math.abs(i - principale);
        const inFuoco = i === principale;
        const concluso = i < cur || (i === cur && stepDone(phase));
        // Taglia e chiarezza calano con la distanza dal tempo a fuoco: a colpo d'occhio si
        // vede QUALE comando conta adesso, senza dover leggere l'intera lista — è la « guida
        // dell'attenzione » segnalata, non una decorazione.
        const fs = inFuoco ? 'var(--s-fs-xl)' : distanza === 1 ? 'var(--s-fs-base)' : 'var(--s-fs-sm)';
        const opacita = inFuoco ? 1 : distanza === 1 ? 0.55 : 0.26;
        const colore = inFuoco ? 'var(--s-ink)' : concluso ? 'var(--s-still)' : 'var(--s-ink-soft)';
        return (
          <button key={s} type="button" onClick={() => setFuoco(i)} title={concluso ? titoloRileggi : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, border: 'none',
              cursor: 'pointer', padding: '3px 10px', borderRadius: 999, textAlign: 'left',
              pointerEvents: 'auto', opacity: opacita,
              transition: 'opacity 0.25s ease, font-size 0.25s ease, background 0.25s ease',
              // Solo il tempo a fuoco porta un fondo — le sue lettere devono staccarsi
              // dall'arco sotto; gli altri restano puro testo, per non impilare più riquadri
              // semitrasparenti uno sull'altro (l'ago ci perderebbe leggibilità, il punto (4)
              // della richiesta). Trasparenza calibrata a mano: abbastanza fondo da leggere il
              // testo su qualunque colore dell'arco sotto, abbastanza poco (42%) perché l'ago
              // — che passa anche dietro al tempo a fuoco — resti tracciabile.
              background: inFuoco ? 'color-mix(in srgb, var(--s-ground) 42%, transparent)' : 'none',
            }}>
            <span aria-hidden style={{
              width: inFuoco ? 26 : 18, height: inFuoco ? 26 : 18, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--s-sans)', fontSize: inFuoco ? 12 : 9, fontWeight: 800, lineHeight: 1,
              color: inFuoco ? 'var(--s-ground)' : colore,
              background: inFuoco ? 'var(--s-ink)' : 'transparent',
              border: `1px solid ${colore}`,
            }}>
              {concluso ? <Check size={inFuoco ? 14 : 10} strokeWidth={3.2} /> : i + 1}
            </span>
            <span style={{
              fontFamily: 'var(--s-sans)', fontSize: fs, fontWeight: inFuoco ? 800 : 600,
              letterSpacing: '0.06em', color: colore, whiteSpace: 'nowrap',
            }}>
              {ETICHETTA[s]}
            </span>
          </button>
        );
      })}
      {/* ── LE INDICAZIONI — segnalato: « le indicazioni, e non solo gli step, devono stare a
          sinistra dell'ago ». `SuggerimentoCiclo` (comando/come/avviso), lo stesso componente
          che prima viveva nella barra comandi — segue SEMPRE il tempo reale (`spiegazione`),
          mai il `fuoco` di preview (v. la nota in cima al file). `pointerEvents:'auto'`: è
          testo, non un bottone, ma resta sopra un fondo proprio per staccarsi dall'arco come
          i tempi qui sopra. */}
      <div style={{
        padding: '4px 10px', pointerEvents: 'auto', borderRadius: 14,
        background: 'color-mix(in srgb, var(--s-ground) 30%, transparent)',
      }}>
        <SuggerimentoCiclo {...spiegazione} />
      </div>
    </div>
  );
}
