import { useEffect, useMemo, useState } from 'react';
import { pick5 } from '../i18n5';

/**
 * DizionarioModal — IL DIZIONARIO TECNICO DI DIANETICS E SCIENTOLOGY, RICERCABILE.
 *
 * ── PERCHÉ ESISTE ────────────────────────────────────────────────────────────────────────────
 * Segnalato: « si potrebbe integrare il dizionario tecnico? ». Due fonti, entrambe FUORI dal
 * deposito (come la guida — v. `scripts/copy-guide.cjs`, `GuideModal.tsx`): il "Dizionario
 * Tecnico" italiano completo (808 pagine, PDF, con testo vero estraibile — nessun OCR) e un
 * "Technical Dictionary" inglese (file .htm, dichiarato dalla fonte stessa "fair use quotes",
 * non il libro intero). Estratti UNA VOLTA in JSON con due script Python (fuori dal deposito,
 * non richiesti a ogni build come la guida — il libro non cambia) e copiati qui:
 * `public/dizionario/dizionario-it.json` (2624 voci) e `dizionario-en.json` (2541 voci).
 *
 * ⚠️ SEGNALATO DI NUOVO — con un esempio preciso: « in cima ad ogni pagina è riprodotto il
 * titolo della definizione che si sta spiegando... poi la B maiuscola è la continuazione del
 * testo della pagina 2 ». Il PDF italiano stampa un titolo corrente (il "guide word" da
 * dizionario cartaceo) in cima a OGNI pagina — lo script di estrazione lo trattava come testo
 * normale, incollandolo dentro la definizione ancora aperta al cambio pagina. Ricostruito lo
 * script (`estrai_pdf_v2.py`, fuori dal deposito): `pdfplumber`, non solo `pypdf`, per sapere
 * DOVE sta il testo sulla pagina — il titolo corrente sta sempre più in alto del corpo,
 * indipendentemente dal font. Trovati e corretti nello stesso giro altri due difetti scoperti
 * verificando la correzione: un capolettera decorativo a inizio di ogni sezione alfabetica
 * (stesso rischio, riga isolata), e i termini che vanno a capo PRIMA della virgola che apre
 * la definizione (creavano una voce fantasma col nome sbagliato — l'ultima parola della
 * traduzione inglese invece del vero termine italiano, es. "ABERRAZIONE AMBIENTALE" sparita a
 * favore di una voce "ABERRATION" con la definizione giusta ma il nome sbagliato) — e un terzo,
 * un trattino SENZA spazi dentro al termine o alla traduzione stessa (es. "MID-INTEGRITY",
 * "THEETIE-WEETIE") che le classi di caratteri della correzione precedente non prevedevano
 * ancora, fermando l'abbinamento a metà parola esattamente come prima. 2408→2624 voci italiane
 * dopo i tre giri di correzione: centinaia di frammenti fantasma spariti, centinaia di voci
 * vere (prima fuse dentro quella precedente) recuperate col proprio nome. Una QUARTA ipotesi
 * (ammettere anche le parentesi, per le abbreviazioni tra parentesi nel termine — "AMMINISTRA-
 * ZIONE (ADMIN)") è stata provata e tolta di nuovo: recuperava 9 voci ma ne rompeva 12 altre (un
 * riferimento bibliografico a fine voce precedente che va a capo da solo, "...III)", è anch'esso
 * maiuscolo+parentesi a inizio riga — v. la nota in `estrai_pdf_v2.py`). Il "-en" inglese non ha
 * questo difetto (fonte HTML, non pagine stampate) — non toccato.
 *
 * ── LE ABBREVIAZIONI, UNA TERZA/QUARTA FONTE ────────────────────────────────────────────────
 * Segnalato: « ho visto che non hai messo le ABBREVIAZIONI. Sono importanti per capire le
 * definizioni, aggiungile come nel libro, alla fine. Ho anche un dizionario inglese PDF con le
 * abbreviazioni ». I codici che chiudono ogni definizione (es. "(HCOB 23 Ago 65)") non sono
 * spiegati DENTRO al dizionario — il libro stampato ha una lista a sé, "Abbreviazioni", subito
 * dopo il corpo A-Z. Estratta con `estrai_abbrev.py` (fuori dal deposito, stesso principio dei
 * due script del dizionario) da DUE fonti: la sezione italiana del PDF già in uso (pagine 635-
 * 640, 133 voci), e la sezione equivalente ("Abbreviations") di un SECONDO pdf inglese fornito
 * apposta per questo — "1. Tech Dictionary 1975.pdf", pagine 498-500, 129 voci — non usato
 * altrove, l'inglese del dizionario principale resta l'HTML "fair use" di sempre.
 * `public/dizionario/abbreviazioni-it.json`/`abbreviazioni-en.json`, caricate insieme ai due
 * JSON principali e aggiunte in CODA a ciascuna lista (`abbreviazione:true` le distingue nel
 * rendering, con una riga-titolo "ABBREVIAZIONI" prima della prima) — "come nel libro, alla
 * fine": si vedono per ultime scorrendo, ma restano dentro la STESSA ricerca/lettera delle voci
 * vere, apposta — leggere "(HCOB 23 Ago 65)" e poter cercare subito "HCOB" nello stesso posto è
 * il punto stesso di averle.
 *
 * ⚠️ COPYRIGHT — segnalato dall'utente: per ora la distribuzione resta a due persone, per il
 * collaudo del programma; la distribuzione più ampia resta da decidere. Non è compito di
 * questo componente deciderlo — solo mostrare il dizionario a chi ha già l'app.
 *
 * ── LA RICERCA BILINGUE (SOLO ITALIANO) ─────────────────────────────────────────────────────
 * Segnalato: « per l'italiano, la ricerca deve potersi fare sia in italiano che con la parola
 * corrispondente in inglese ». Molte voci italiane portano già il proprio equivalente inglese
 * (`termine_en`, es. "ATTUABILITÀ - WORKABILITY") — la ricerca in italiano confronta la parola
 * digitata con ENTRAMBI i campi, non solo col termine italiano.
 *
 * Elenco cliccabile (di sole parole, leggero) più campo di ricerca — SOLO SERENITY, nessun
 * dato né logica di ciclo qui dentro.
 */

interface VoceGrezza { termine: string; termine_en?: string | null; definizione: string }
interface Voce { termine: string; termineEn?: string | null; definizione: string; abbreviazione?: boolean }
interface AbbrGrezza { codice: string; espansione: string }

const rimuoviAccenti = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function DizionarioModal({ lang, onClose }: { lang: string; onClose: () => void }) {
  const LC = (it: string, fr: string, en: string, es: string, sv: string) => pick5(lang, it, fr, en, es, sv) as string;

  const [caricamento, setCaricamento] = useState(true);
  const [erroreCaricamento, setErroreCaricamento] = useState(false);
  const [vociIt, setVociIt] = useState<Voce[]>([]);
  const [vociEn, setVociEn] = useState<Voce[]>([]);
  // ⚠️ AGGIUNTE — segnalato: prendi la versione INGLESE del dizionario tecnico e traducila in
  // FRANCESE e SPAGNOLO. A differenza dell'italiano (il libro vero, tradotto e curato da una
  // persona) queste due sono traduzioni SEMANTICHE del testo inglese, non confermate — v.
  // l'avviso mostrato quando una delle due è la scheda attiva, poco più sotto. `termine`
  // resta l'INTESTAZIONE INGLESE originale in entrambe (non tradotta): è il termine tecnico
  // vero, quello che compare nelle citazioni (HCOB, PAB, …) — tradurlo lo renderebbe
  // irriconoscibile rispetto alla fonte che lo cita.
  // ⚠️ COPERTURA PARZIALE, IN CRESCITA — il dizionario inglese ha 2541 voci: tradurle tutte con
  // la cura che meritano i termini di Scientology è un lavoro a più riprese, non un unico
  // giro. Le voci non ancora tradotte semplicemente non compaiono ancora nell'elenco FR/ES —
  // niente segnaposto vuoto, niente "non disponibile": la ricerca vede quel che c'è, la
  // copertura si allarga a ogni giro successivo.
  const [vociFr, setVociFr] = useState<Voce[]>([]);
  const [vociEs, setVociEs] = useState<Voce[]>([]);
  // ⚠️ INGLESE PER DEFAULT — segnalato. La ricerca bilingue (italiano che confronta anche
  // `termineEn`) resta invariata su TUTTE le schede: qui cambia solo quale si vede aprendo il
  // pannello, non la logica di ricerca.
  const [lingua, setLingua] = useState<'it' | 'en' | 'fr' | 'es'>('en');
  const [ricerca, setRicerca] = useState('');
  // ⚠️ AGGIUNTA — segnalato: « puoi mettere una ricerca anche via lettera dell'alfabeto ».
  // Alternativa al campo di testo, non insieme a lui (le due ricerche si annullano a vicenda
  // quando si usa l'altra — v. `onChange`/`onClick` sotto): scegliere una lettera mentre resta
  // scritto qualcosa nel campo di testo produrrebbe un filtro doppio poco prevedibile
  // ("comincia con B" E "contiene xyz"), più facile da confondere che da capire a colpo
  // d'occhio.
  const [letteraFiltro, setLetteraFiltro] = useState<string | null>(null);
  const [espanso, setEspanso] = useState<string | null>(null);

  // ⚠️ CARICATO SOLO ALL'APERTURA, NON ALL'AVVIO DI SERENITY — 2 MB di JSON che servono
  // solo a chi apre il dizionario: caricarli sempre, anche per una seduta che non lo apre
  // mai, sarebbe un peso di avvio per un uso che potrebbe non capitare.
  // ⚠️ LE ABBREVIAZIONI — segnalato: « ho visto che non hai messo le ABBREVIAZIONI. Sono
  // importanti per capire le definizioni, aggiungile come nel libro, alla fine ». Non sono
  // termini del dizionario: sono i CODICI di citazione che chiudono ogni definizione (es.
  // "(HCOB 23 Ago 65)") — nel libro stampato è una lista a sé, SUBITO dopo il corpo A-Z, prima
  // del resto (indici, indirizzi). Estratte con lo stesso metodo (`estrai_abbrev.py`, fuori dal
  // deposito) da DUE fonti: la sezione "Abbreviazioni" del PDF italiano già in uso, e una
  // sezione "Abbreviations" equivalente in un SECONDO pdf inglese fornito apposta ("1. Tech
  // Dictionary 1975.pdf", non usato altrove — l'inglese del dizionario principale resta l'HTML
  // "fair use" di sempre, questo secondo pdf serve SOLO per le sue abbreviazioni).
  // Aggiunte in CODA a ciascuna lista (`abbreviazione:true` le distingue nel rendering sotto) —
  // "come nel libro, alla fine": si vedono per ultime scorrendo l'elenco, MA restano dentro la
  // STESSA ricerca/lettera delle voci vere, apposta — leggere "(HCOB 23 Ago 65)" in una
  // definizione e poter cercare subito "HCOB" nello stesso posto è il punto stesso di averle.
  useEffect(() => {
    let vivo = true;
    Promise.all([
      fetch('/dizionario/dizionario-it.json').then(r => r.json()).catch(() => []),
      fetch('/dizionario/dizionario-en.json').then(r => r.json()).catch(() => []),
      fetch('/dizionario/abbreviazioni-it.json').then(r => r.json()).catch(() => []),
      fetch('/dizionario/abbreviazioni-en.json').then(r => r.json()).catch(() => []),
      // ⚠️ AGGIUNTI — traduzioni FR/ES del dizionario inglese, v. la nota sullo stato `vociFr`/
      // `vociEs` sopra. Le abbreviazioni FR/ES (`abbreviazioni-fr.json`/`-es.json`) sono
      // invece COMPLETE fin da subito — 129 voci, brevi titoli di pubblicazioni, un lavoro
      // molto più piccolo del corpo principale. `.catch(() => [])`: come le altre fonti, un
      // file mancante non deve rompere il resto del dizionario.
      fetch('/dizionario/dizionario-fr.json').then(r => r.json()).catch(() => []),
      fetch('/dizionario/dizionario-es.json').then(r => r.json()).catch(() => []),
      fetch('/dizionario/abbreviazioni-fr.json').then(r => r.json()).catch(() => []),
      fetch('/dizionario/abbreviazioni-es.json').then(r => r.json()).catch(() => []),
    ]).then(([it, en, abbrIt, abbrEn, fr, es, abbrFr, abbrEs]:
      [VoceGrezza[], VoceGrezza[], AbbrGrezza[], AbbrGrezza[], VoceGrezza[], VoceGrezza[], AbbrGrezza[], AbbrGrezza[]]) => {
      if (!vivo) return;
      if (!Array.isArray(it) && !Array.isArray(en)) { setErroreCaricamento(true); setCaricamento(false); return; }
      const aVoce = (a: AbbrGrezza): Voce => ({ termine: a.codice, definizione: a.espansione, abbreviazione: true });
      setVociIt([
        ...(Array.isArray(it) ? it : []).map(v => ({ termine: v.termine, termineEn: v.termine_en ?? null, definizione: v.definizione })),
        ...(Array.isArray(abbrIt) ? abbrIt : []).map(aVoce),
      ]);
      setVociEn([
        ...(Array.isArray(en) ? en : []).map(v => ({ termine: v.termine, definizione: v.definizione })),
        ...(Array.isArray(abbrEn) ? abbrEn : []).map(aVoce),
      ]);
      setVociFr([
        ...(Array.isArray(fr) ? fr : []).map(v => ({ termine: v.termine, definizione: v.definizione })),
        ...(Array.isArray(abbrFr) ? abbrFr : []).map(aVoce),
      ]);
      setVociEs([
        ...(Array.isArray(es) ? es : []).map(v => ({ termine: v.termine, definizione: v.definizione })),
        ...(Array.isArray(abbrEs) ? abbrEs : []).map(aVoce),
      ]);
      setCaricamento(false);
    }).catch(() => { if (vivo) { setErroreCaricamento(true); setCaricamento(false); } });
    return () => { vivo = false; };
  }, []);

  const lista = lingua === 'it' ? vociIt : lingua === 'en' ? vociEn : lingua === 'fr' ? vociFr : vociEs;

  // Lettere davvero presenti nell'elenco corrente (niente bottoni morti per una lettera
  // senza nessuna voce — es. "K" o "W" in italiano). ⚠️ SOLO voci vere, mai `abbreviazione` —
  // altrimenti un codice come "K" (se esistesse) accenderebbe il bottone "K" promettendo un
  // termine vero che non c'è: le abbreviazioni hanno ORA il loro proprio accesso (v. "§" sotto,
  // segnalato: « avrei voluto una sezione abbreviazioni dopo la lettera z »), le lettere restano
  // SOLO per le voci vere.
  const letterePresenti = useMemo(() => {
    const s = new Set<string>();
    for (const v of lista) {
      if (v.abbreviazione) continue;
      const prima = rimuoviAccenti(v.termine).charAt(0).toUpperCase();
      if (prima >= 'A' && prima <= 'Z') s.add(prima);
    }
    return s;
  }, [lista]);

  const filtrata = useMemo(() => {
    // ⚠️ SEGNALATO DI NUOVO: « avrei voluto una sezione abbreviazioni (come nel libro) dopo la
    // lettera z ». Prima le abbreviazioni si vedevano SOLO scorrendo l'elenco fino in fondo
    // (nessun filtro attivo) — cliccando una lettera qualunque, i loro codici che iniziano con
    // quella lettera si mescolavano silenziosamente alle voci vere dello stesso filtro, senza
    // un modo diretto per saltare SOLO a loro. `'#'` è un valore speciale di `letteraFiltro`
    // (mai una vera lettera dell'alfabeto) per il bottone aggiunto DOPO la Z nella riga sotto —
    // un clic e si vedono SOLO le abbreviazioni, esattamente la sezione a sé del libro stampato,
    // non più solo raggiungibile scorrendo.
    if (letteraFiltro === '#') return lista.filter(v => v.abbreviazione);
    if (letteraFiltro) return lista.filter(v => !v.abbreviazione && rimuoviAccenti(v.termine).charAt(0).toUpperCase() === letteraFiltro);
    const q = rimuoviAccenti(ricerca.trim());
    if (!q) return lista;
    return lista.filter(v =>
      rimuoviAccenti(v.termine).includes(q) || (v.termineEn ? rimuoviAccenti(v.termineEn).includes(q) : false));
  }, [lista, ricerca, letteraFiltro]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column',
      // ⚠️ 0,72 (la stessa trasparenza del visore PDF, `processusVisualizzato` — copiata da
      // lì) lasciava TRASPARIRE l'intestazione vera di SERENITY dietro il titolo "DIZIONARIO
      // TECNICO", proprio nella sua stessa fascia — verificato dal vivo, le due scritte si
      // sovrapponevano ed erano illeggibili insieme. Il visore PDF non lo mostrava (il suo
      // titolo, il nome del file, è più corto e cade altrove) — non è un difetto suo da
      // correggere qui, solo un valore che qui non basta. Quasi opaco.
      // ⚠️ SEGNALATO DI NUOVO: « in light il dizionario, le definizioni non sono molto
      // visibili ». Il fondo qui sopra era un nero LETTERALE (`rgba(6,9,13,...)`), fisso in
      // ENTRAMBI i temi — copiato dal visore PDF, che però resta scuro apposta in ogni tema
      // (uno strumento, v. `--tr-bg`/`--s-instrument-bg` in tokens.css). Questo pannello
      // invece è testo normale, non uno strumento: doveva seguire il tema come tutto il resto
      // di SERENITY. In chiaro, il vetro semitrasparente del riquadro sotto (`--s-disc`)
      // galleggiava su questo nero fisso — e le definizioni, in `--s-ink-soft` (SCURO in
      // tema chiaro, per leggersi sul fondo perla vero), sparivano su un fondo che restava
      // nero a dispetto del tema. `var(--s-ground)` invece dell'hex fisso: perla quasi opaco
      // in chiaro, quasi nero in scuro — la stessa intenzione ("nascondi l'intestazione
      // dietro"), ma nel colore giusto per il tema attivo.
      background: 'color-mix(in srgb, var(--s-ground) 96%, transparent)',
      backdropFilter: 'blur(8px)', padding: 24,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        marginBottom: 14, flexShrink: 0, flexWrap: 'wrap',
      }}>
        <span style={{ fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-lg)', fontWeight: 700, color: 'var(--s-ink)' }}>
          {LC('DIZIONARIO TECNICO', 'DICTIONNAIRE TECHNIQUE', 'TECHNICAL DICTIONARY', 'DICCIONARIO TÉCNICO', 'TEKNISK ORDBOK')}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* ── QUATTRO FONTI, QUATTRO SCHEDE — l'italiano (il libro vero, tradotto e curato
              da una persona, con incrocio inglese) e l'inglese (fonte a sé, "fair use quotes"
              — v. la nota in testa al file) restano le due sole CONFERMATE. FRANCESE e
              SPAGNOLO, aggiunte — segnalato: prendi l'inglese e traducilo in francese e
              spagnolo — sono invece traduzioni SEMANTICHE del testo inglese fatte da questa
              stessa IA, non confermate da un traduttore umano: v. l'avviso sotto la riga di
              schede, mostrato solo quando una delle due è attiva. Stesso motivo del fondo
              sopra: bianco/nero fissi sostituiti dai token — la pillola piena "inchiostro con
              sopra il colore del fondo" (v. tokens.css). */}
          <div style={{ display: 'flex', borderRadius: 999, overflow: 'hidden', border: '1px solid var(--s-ink-ghost)' }}>
            {(['it', 'en', 'fr', 'es'] as const).map(l => (
              <button key={l} onClick={() => { setLingua(l); setEspanso(null); setLetteraFiltro(null); }}
                style={{
                  border: 'none', cursor: 'pointer', padding: '6px 16px',
                  fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-sm)', fontWeight: 700,
                  background: lingua === l ? 'var(--s-ink)' : 'transparent',
                  color: lingua === l ? 'var(--s-ground-warm)' : 'var(--s-ink-faint)',
                }}>
                {l === 'it'
                  ? LC('ITALIANO', 'ITALIEN', 'ITALIAN', 'ITALIANO', 'ITALIENSKA')
                  : l === 'en'
                  ? LC('INGLESE', 'ANGLAIS', 'ENGLISH', 'INGLÉS', 'ENGELSKA')
                  : l === 'fr'
                  ? LC('FRANCESE', 'FRANÇAIS', 'FRENCH', 'FRANCÉS', 'FRANSKA')
                  : LC('SPAGNOLO', 'ESPAGNOL', 'SPANISH', 'ESPAÑOL', 'SPANSKA')}
              </button>
            ))}
          </div>
          <button onClick={onClose} style={{
            border: 'none', background: 'var(--s-disc-sunk)', color: 'var(--s-ink)',
            borderRadius: 999, padding: '6px 16px', cursor: 'pointer',
            fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)',
          }}>
            {LC('chiudi', 'fermer', 'close', 'cerrar', 'stäng')}
          </button>
        </div>
      </div>

      {/* ⚠️ AGGIUNTO — segnalato esplicitamente: « indicando che queste due traduzioni,
          contrariamente all'italiano, non sono confermate, ma semplici traduzioni semantiche
          [...] bisogna immaginare una frase che indica di verificare attentamente la
          traduzione ed in particolare le parole specifiche a Scientology ». Mostrato SOLO su
          FR/ES (l'italiano è il libro vero tradotto da una persona, l'inglese è la fonte
          originale — nessuno dei due ha bisogno di questo avviso). Colore `--s-reserve`
          (l'ambra "il dato c'è ma non è confermato", lo stesso usato altrove nell'app per
          questo tipo di segnale — mai un rosso d'allarme, non è un errore). */}
      {(lingua === 'fr' || lingua === 'es') && (
        <div style={{
          flexShrink: 0, marginBottom: 12, padding: '10px 16px', borderRadius: 10,
          background: 'color-mix(in srgb, var(--s-reserve) 12%, var(--s-disc))',
          border: '1px solid color-mix(in srgb, var(--s-reserve) 40%, transparent)',
          fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-sm)', lineHeight: 1.5, color: 'var(--s-ink-soft)',
        }}>
          {LC(
            '⚠ Traduzione semantica non confermata (a differenza dell\'italiano, il libro vero) — verifica attentamente il testo, in particolare le parole specifiche a Scientology.',
            '⚠ Traduction sémantique non confirmée (contrairement à l\'italien, le vrai livre) — vérifie attentivement le texte, en particulier les mots spécifiques à la Scientologie.',
            '⚠ Unconfirmed semantic translation (unlike the Italian, the real book) — check the text carefully, especially words specific to Scientology.',
            '⚠ Traducción semántica no confirmada (a diferencia del italiano, el libro real) — verifica el texto con atención, en particular las palabras específicas de Cienciología.',
            '⚠ Obekräftad semantisk översättning (till skillnad från italienskan, den riktiga boken) — kontrollera texten noga, särskilt ord som är specifika för Scientology.',
          )}
        </div>
      )}

      <div style={{
        flex: 1, minHeight: 0, background: 'var(--s-disc)', borderRadius: 16,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--s-ink-ghost)', flexShrink: 0 }}>
          <input
            value={ricerca}
            onChange={e => { setRicerca(e.target.value); if (letteraFiltro) setLetteraFiltro(null); }}
            autoFocus
            placeholder={lingua === 'it'
              ? LC('cerca un termine, in italiano o in inglese…', 'cherche un terme, en italien ou en anglais…',
                  'search a term, in Italian or in English…', 'busca un término, en italiano o en inglés…',
                  'sök en term, på italienska eller engelska…')
              : LC('cerca un termine…', 'cherche un terme…', 'search a term…', 'busca un término…', 'sök en term…')}
            style={{
              width: '100%', border: '2px solid var(--s-reserve)', borderRadius: 10,
              background: 'transparent', outline: 'none', padding: '10px 14px',
              fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink)',
            }}
          />
          {/* ── RICERCA PER LETTERA — segnalato: « puoi mettere una ricerca anche via lettera
              dell'alfabeto ». Alternativa al campo di testo (v. nota sullo stato sopra): un
              clic su una lettera azzera il testo digitato, e viceversa. Le lettere senza
              nessuna voce nell'elenco corrente restano visibili ma spente e non cliccabili —
              coerenza visiva dell'alfabeto intero, senza promettere risultati inesistenti.
              ⚠️ IL BOTTONE DOPO LA Z — segnalato di nuovo: « avrei voluto una sezione
              abbreviazioni (come nel libro) dopo la lettera z ». Prima le abbreviazioni si
              raggiungevano SOLO scorrendo l'elenco senza filtri fino in fondo — nessun modo
              diretto per saltare SOLO a loro, come invece si fa per una lettera. Stessa riga di
              bottoni, stesso stile, ma un piccolo distacco visivo (`marginLeft`) e un'etichetta
              diversa (§, non una lettera) per dire "qui comincia un'altra cosa" — esattamente
              dove sta nel libro stampato, subito dopo la Z. */}
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l => {
              const presente = letterePresenti.has(l);
              const attiva = letteraFiltro === l;
              return (
                <button
                  key={l}
                  disabled={!presente}
                  onClick={() => { setLetteraFiltro(attiva ? null : l); if (ricerca) setRicerca(''); }}
                  style={{
                    minWidth: 22, padding: '3px 5px', border: 'none', borderRadius: 5,
                    cursor: presente ? 'pointer' : 'default',
                    fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-micro)', fontWeight: 700,
                    background: attiva ? 'var(--s-reserve)' : 'transparent',
                    color: attiva ? '#0b0f14' : presente ? 'var(--s-ink-faint)' : 'var(--s-ink-ghost)',
                  }}>
                  {l}
                </button>
              );
            })}
            {(() => {
              const presente = lista.some(v => v.abbreviazione);
              const attiva = letteraFiltro === '#';
              return (
                <button
                  disabled={!presente}
                  onClick={() => { setLetteraFiltro(attiva ? null : '#'); if (ricerca) setRicerca(''); }}
                  title={LC('ABBREVIAZIONI', 'ABRÉVIATIONS', 'ABBREVIATIONS', 'ABREVIATURAS', 'FÖRKORTNINGAR')}
                  style={{
                    marginLeft: 6, minWidth: 22, padding: '3px 6px', border: 'none', borderRadius: 5,
                    cursor: presente ? 'pointer' : 'default',
                    fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-micro)', fontWeight: 700,
                    background: attiva ? 'var(--s-reserve)' : 'transparent',
                    color: attiva ? '#0b0f14' : presente ? 'var(--s-ink-faint)' : 'var(--s-ink-ghost)',
                  }}>
                  §
                </button>
              );
            })()}
          </div>
          <div style={{
            marginTop: 8, fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-micro)',
            letterSpacing: '0.04em', color: 'var(--s-ink-faint)',
          }}>
            {caricamento
              ? LC('caricamento…', 'chargement…', 'loading…', 'cargando…', 'laddar…')
              : `${filtrata.length} / ${lista.length} ${LC('voci', 'entrées', 'entries', 'entradas', 'poster')}`}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {erroreCaricamento && (
            <div style={{ padding: 20, fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-reserve)' }}>
              {LC('dizionario non trovato — riprova dopo aver ricostruito l\'app.',
                  'dictionnaire introuvable — réessaie après avoir reconstruit l\'app.',
                  'dictionary not found — try again after rebuilding the app.',
                  'diccionario no encontrado — vuelve a intentarlo tras reconstruir la app.',
                  'ordbok hittades inte — försök igen efter att appen byggts om.')}
            </div>
          )}
          {!caricamento && !erroreCaricamento && filtrata.length === 0 && (
            <div style={{ padding: 20, fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', color: 'var(--s-ink-faint)' }}>
              {LC('nessun termine trovato.', 'aucun terme trouvé.', 'no term found.', 'ningún término encontrado.', 'ingen term hittades.')}
            </div>
          )}
          {filtrata.map((v, i) => {
            // ⚠️ NON PIÙ `v.termine` DA SOLO — segnalato dal vivo (conteggio "2 / 2670" con
            // 14 righe davvero disegnate): alcuni CODICI di abbreviazione coincidono col nome
            // di un termine VERO già nel dizionario ("HCOB" è sia un'abbreviazione sia una voce
            // del corpo inglese) — due oggetti diversi con la stessa `key` React, che si
            // confondono a vicenda nella riconciliazione (React non sa più quale dei due tenere,
            // quale togliere) non appena la lista filtrata cambia. Un id che include anche
            // `abbreviazione` resta unico anche quando il nome coincide.
            const id = `${v.abbreviazione ? 'a' : 'v'}:${v.termine}`;
            const aperta = espanso === id;
            // ── LA RIGA-TITOLO "ABBREVIAZIONI" — appare una volta sola, appena PRIMA della
            // prima voce marcata `abbreviazione`: solo così si vede il confine "qui finiscono
            // le voci vere, qui comincia l'appendice", come nel libro stampato. Sparisce da
            // sola filtrando per lettera o per testo (la voce precedente in elenco potrebbe
            // non essere più adiacente) — lì il confine non serve più, la ricerca ha già
            // ristretto tutto a quel che conta. Resta invece col bottone "§" (`letteraFiltro
            // === '#'`): lì la lista È solo abbreviazioni, il titolo diventa "stai guardando
            // questo", non un confine da segnare.
            const inizioAbbreviazioni = v.abbreviazione && (!letteraFiltro || letteraFiltro === '#') && !ricerca.trim()
              && (i === 0 || !filtrata[i - 1].abbreviazione);
            return (
              <div key={id}>
                {inizioAbbreviazioni && (
                  <div style={{
                    padding: '14px 18px 6px 18px', fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-micro)',
                    fontWeight: 700, letterSpacing: '0.06em', color: 'var(--s-ink-faint)',
                  }}>
                    {LC('ABBREVIAZIONI', 'ABRÉVIATIONS', 'ABBREVIATIONS', 'ABREVIATURAS', 'FÖRKORTNINGAR')}
                  </div>
                )}
                <div style={{ borderBottom: '1px solid var(--s-ink-ghost)' }}>
                  <button onClick={() => setEspanso(aperta ? null : id)} style={{
                    display: 'flex', alignItems: 'baseline', gap: 10, width: '100%', textAlign: 'left',
                    border: 'none', background: 'transparent', cursor: 'pointer', padding: '9px 18px',
                    fontFamily: 'inherit',
                  }}>
                    <span style={{
                      fontFamily: v.abbreviazione ? 'var(--s-mono)' : 'var(--s-sans)',
                      fontSize: 'var(--s-fs-base)', fontWeight: 700,
                      color: aperta ? 'var(--s-reserve)' : 'var(--s-ink)',
                    }}>
                      {v.termine}
                    </span>
                    {v.termineEn && v.termineEn !== v.termine && (
                      <span style={{ fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-micro)', color: 'var(--s-ink-faint)' }}>
                        {v.termineEn}
                      </span>
                    )}
                  </button>
                  {aperta && (
                    <div style={{
                      padding: '0 18px 14px 18px', fontFamily: 'var(--s-serif)', fontSize: 'var(--s-fs-base)',
                      lineHeight: 1.55, color: 'var(--s-ink-soft)',
                    }}>
                      {v.definizione}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
