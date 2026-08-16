/**
 * L'AVVIO — quattro domande, in cerchi.
 *
 * ── PERCHÉ NON È UNA PROCEDURA GUIDATA ──────────────────────────────────────────────────────
 * Una procedura guidata mette una domanda per schermata, con avanti e indietro in fondo: si
 * legge, si clicca, si aspetta la successiva. Qui le risposte SONO i cerchi, e non c'è nessun
 * « avanti »: si tocca la risposta e la domanda dopo prende il posto. Un gesto per domanda,
 * quattro gesti per aprire una seduta.
 *
 * ── COSA STA QUI E COSA NO ──────────────────────────────────────────────────────────────────
 * Qui c'è solo il disegno. L'ordine delle domande, cosa si scorda quando si torna indietro, e
 * cosa vuol dire una frase detta a voce stanno in `avvio.ts`, che si prova senza aprire niente.
 * I profili si leggono da `lib/storage`, lo stesso di EQUILIBRIUM — e sono gli stessi profili,
 * che è la verifica scritta per questa fase.
 *
 * @see docs/refonte-fasi.md — fase 4.
 */

import { useEffect, useRef, useState } from 'react';
import {
  AVVIO_VUOTO, passoCorrente, restano, rispondi, indietro,
  MODO_AUTO, MODO_AUTO_MS, type Avvio as StatoAvvio, type PassoId,
} from './flussoAvvio';
import { getProfiles, getPcProfiles } from '../lib/storage';
import { loadHistory, daysSince, testedToday } from '../engine/canTest';
import { PannelloProfilo, type Tipo } from './PannelloProfilo';
import type { DatiProfilo } from '../lib/profiloEdit';

/** Le domande, dette come le direbbe un auditor — non come le scriverebbe un modulo. */
const DOMANDA: Record<PassoId, string> = {
  auditor:  'Chi audita?',
  chi:      'Da solo, o con un preclear?',
  preclear: 'Chi è il preclear?',
  dove:     'Siete qui, o a distanza?',
  modo:     'Quanto vuoi vedere?',
  pronto:   '',
};

/**
 * Un cerchio che si può toccare.
 *
 * ⚠️ LE INIZIALI SOLO PER LE PERSONE. Su una scelta come « con un preclear » davano « CU », che
 * si legge come le iniziali di qualcuno — e nella schermata PRIMA i cerchi erano davvero
 * persone. Una scelta non ha un ritratto: il suo cerchio resta vuoto, e a dire cosa sia è
 * l'etichetta sotto. È coerente col resto: il cerchio si coglie per posizione e dimensione,
 * non si legge.
 *
 * ── E « MODIFICA », SEMPRE VISIBILE ─────────────────────────────────────────────────────────
 * Segnalato: « on ne peut pas éditer les auditeurs et PC existants ». Non è dietro un passaggio
 * del mouse: EQUILIBRIUM tiene la matita SEMPRE a vista sulla scheda, e nasconderla dietro un
 * hover l'avrebbe resa introvabile allo stesso modo — è per quello che mancava. Il gesto è un
 * bottone SEPARATO da quello che sceglie: toccare il cerchio sceglie la persona, « modifica »
 * apre il suo profilo.
 */
function Scelta({ etichetta, sotto, foto, persona, onClick, onModifica, dimensione = 116 }: {
  etichetta: string; sotto?: string; foto?: string; persona?: boolean;
  onClick: () => void; onModifica?: () => void; dimensione?: number;
}) {
  const [sopra, setSopra] = useState(false);
  const iniziali = etichetta.trim().split(/\s+/).slice(0, 2).map(p => p[0] ?? '').join('').toUpperCase();
  return (
    <div
      onMouseEnter={() => setSopra(true)}
      onMouseLeave={() => setSopra(false)}
      style={{ display: 'grid', justifyItems: 'center', gap: 8, fontFamily: 'var(--s-sans)' }}>
      <button
        onClick={onClick}
        style={{
          border: 'none', background: 'none', padding: 0, cursor: 'pointer',
          display: 'grid', justifyItems: 'center', gap: 12,
        }}>
        <div style={{
          width: dimensione, height: dimensione, borderRadius: '50%',
          display: 'grid', placeItems: 'center', overflow: 'hidden',
          background: 'var(--s-disc)',
          boxShadow: sopra ? 'var(--s-shadow-lift)' : 'var(--s-shadow)',
          transform: sopra ? 'translateY(-2px)' : 'none',
          transition: 'box-shadow var(--s-slow) var(--s-ease), transform var(--s-slow) var(--s-ease)',
        }}>
          {foto
            ? <img src={foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : persona
              ? <span style={{ fontFamily: 'var(--s-serif)', fontSize: dimensione * 0.3,
                               color: 'var(--s-ink-soft)' }}>{iniziali}</span>
              : null}
        </div>
        <div style={{ display: 'grid', justifyItems: 'center', gap: 2 }}>
          <span style={{ fontSize: 14, color: 'var(--s-ink)' }}>{etichetta}</span>
          {sotto && <span style={{ fontSize: 11.5, color: 'var(--s-ink-faint)' }}>{sotto}</span>}
        </div>
      </button>
      {onModifica && (
        <button onClick={onModifica} style={{
          border: 'none', background: 'none', cursor: 'pointer', padding: '2px 4px',
          fontFamily: 'var(--s-sans)', fontSize: 10.5, letterSpacing: '0.04em',
          color: 'var(--s-ink-faint)',
        }}>
          modifica
        </button>
      )}
    </div>
  );
}

export function Avvio({ onPronto }: { onPronto: (a: StatoAvvio) => void }) {
  const [stato, setStato] = useState<StatoAvvio>(AVVIO_VUOTO);
  const passo = passoCorrente(stato);

  // I profili sono quelli di EQUILIBRIUM, dallo stesso armadio. Si rileggono dopo ogni
  // creazione: il profilo appena fatto dev'essere lì fra gli altri, non in un elenco a parte.
  const leggi = () => {
    try { return { a: getProfiles(), p: getPcProfiles() }; } catch { return { a: [], p: [] }; }
  };
  const [liste, setListe] = useState(leggi);
  /**
   * SI STA CREANDO O MODIFICANDO un profilo? È uno stato del DISEGNO, non del flusso: la
   * macchina delle domande non deve sapere che esiste un modo di crearne o cambiarne uno.
   * `esistente` assente = si crea; presente = si modifica QUELLO.
   */
  const [pannello, setPannello] = useState<{ tipo: Tipo; esistente?: DatiProfilo } | null>(null);

  const dai = (v: string | boolean) => setStato(s => rispondi(s, passoCorrente(s), v));

  /**
   * LA PROVA DELLE LATTINE DI QUESTO PRECLEAR.
   *
   * ⚠️ Si mostra QUI, quando lo si sceglie, e non altrove: è il momento in cui si decide se
   * farla. « Che fa fede sono le due lattine » — senza una prova di oggi si toglie una
   * divisione dalla scala del tono, e chi sceglie il preclear deve poterlo sapere prima, non
   * scoprirlo a rapporto fatto.
   */
  const lattine = (nome: string): string => {
    try {
      const h = loadHistory(nome);
      if (!h.tests.length) return 'lattine mai provate';
      if (testedToday(h, Date.now())) return 'lattine provate oggi';
      const g = daysSince(h, Date.now());
      return g === 1 ? 'lattine provate ieri' : `lattine provate ${g} giorni fa`;
    } catch { return ''; }
  };

  useEffect(() => { if (passo === 'pronto') onPronto(stato); }, [passo, stato, onPronto]);

  /**
   * IL MODO SI PRENDE DA SÉ DOPO DIECI SECONDI.
   *
   * ⚠️ È L'UNICA domanda che lo fa, e la ragione è che ha una risposta giusta per quasi tutti:
   * chi vuole EXPERT lo sa e lo tocca. Le altre tre non hanno un valore prudente da indovinare
   * — chi è il preclear e dove si audita, sbagliati, falsano la seduta.
   */
  const [rimasti, setRimasti] = useState(MODO_AUTO_MS);
  const statoRef = useRef(stato); statoRef.current = stato;
  useEffect(() => {
    if (passo !== 'modo') { setRimasti(MODO_AUTO_MS); return; }
    const t0 = Date.now();
    const id = setInterval(() => {
      const r = MODO_AUTO_MS - (Date.now() - t0);
      setRimasti(Math.max(0, r));
      if (r <= 0) {
        clearInterval(id);
        setStato(s => rispondi(s, 'modo', MODO_AUTO));
      }
    }, 100);
    return () => clearInterval(id);
  }, [passo]);

  const opzioni = () => {
    switch (passo) {
      case 'auditor':
        return <>
          {liste.a.map(p => (
            <Scelta key={p.id} etichetta={p.name} foto={p.photo} persona onClick={() => dai(p.id)}
                    onModifica={() => setPannello({ tipo: 'auditor',
                      esistente: { id: p.id, nome: p.name, foto: p.photo, sesso: p.sex } })} />
          ))}
          <Scelta etichetta="Nuovo" sotto="nome, ritratto, sesso" dimensione={96}
                  onClick={() => setPannello({ tipo: 'auditor' })} />
        </>;
      case 'chi':
        return <>
          <Scelta etichetta="Da solo" sotto="audito me stesso" onClick={() => dai('solo')} />
          <Scelta etichetta="Con un preclear" onClick={() => dai('preclear')} />
        </>;
      case 'preclear':
        return <>
          {liste.p.map(p => (
            <Scelta key={p.id} etichetta={p.name} foto={p.photo} persona
                    sotto={lattine(p.name)} onClick={() => dai(p.id)}
                    onModifica={() => setPannello({ tipo: 'preclear',
                      esistente: { id: p.id, nome: p.name, foto: p.photo, sesso: p.sex } })} />
          ))}
          <Scelta etichetta="Nuovo" sotto="nome, ritratto, sesso" dimensione={96}
                  onClick={() => setPannello({ tipo: 'preclear' })} />
        </>;
      case 'dove':
        return <>
          <Scelta etichetta="Qui" sotto="nella stessa stanza" onClick={() => dai('qui')} />
          <Scelta etichetta="A distanza" sotto="il preclear è altrove" onClick={() => dai('distanza')} />
        </>;
      case 'modo':
        return <>
          <Scelta etichetta="Normale" sotto="solo ciò che serve" onClick={() => dai('normale')} />
          <Scelta etichetta="Esperto" sotto="tutti i numeri" onClick={() => dai('esperto')} />
        </>;
      default:
        return null;
    }
  };

  const quante = restano(stato);

  // Creare o modificare un profilo NON è un passo del flusso: è una deviazione.
  //   • CREARE: il profilo appena fatto è la risposta alla domanda in corso — si sceglie da sé,
  //     esattamente come premere il suo cerchio. Non farlo vorrebbe dire crearlo e poi
  //     ritrovarsi comunque davanti alla lista per sceglierlo un'altra volta.
  //   • MODIFICARE: NON sceglie nessuno. Si può star guardando la lista per scegliere qualcun
  //     altro, e aver toccato « modifica » solo per correggere una foto — scegliere al posto
  //     dell'auditor sarebbe decidere una cosa che lui non ha deciso.
  if (pannello) {
    return (
      <PannelloProfilo
        tipo={pannello.tipo}
        esistente={pannello.esistente}
        onAnnulla={() => setPannello(null)}
        onEliminato={() => { setListe(leggi()); setPannello(null); }}
        onFatto={id => {
          setListe(leggi());
          const eraNuovo = !pannello.esistente;
          setPannello(null);
          if (eraNuovo) dai(id);
        }}
      />
    );
  }

  return (
    <section style={{
      height: '100%', display: 'grid', gridTemplateRows: 'auto 1fr auto',
      alignItems: 'center', gap: 28,
    }}>
      {/* La domanda, e basta. Nessun titolo di sezione, nessun numero di passo: sapere di
          essere « al 3 di 4 » non serve a rispondere. */}
      <div style={{ display: 'grid', justifyItems: 'center', gap: 10 }}>
        <h1 style={{
          margin: 0, fontFamily: 'var(--s-serif)', fontWeight: 400,
          fontSize: 30, letterSpacing: '-0.01em', color: 'var(--s-ink)',
        }}>
          {DOMANDA[passo]}
        </h1>
        {/* Quante ne restano, detto a parole. Una barra di avanzamento sarebbe un pannello. */}
        <span style={{ fontSize: 12, color: 'var(--s-ink-faint)' }}>
          {quante > 1 ? `ancora ${quante} domande` : quante === 1 ? 'ultima domanda' : ''}
        </span>
      </div>

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 46,
        justifyContent: 'center', alignItems: 'flex-start',
      }}>
        {opzioni()}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 20, minHeight: 30 }}>
        {passo !== 'auditor' && (
          <button onClick={() => setStato(indietro)} style={{
            border: 'none', background: 'none', cursor: 'pointer',
            fontFamily: 'var(--s-sans)', fontSize: 12.5, color: 'var(--s-ink-faint)',
          }}>
            ← torna indietro
          </button>
        )}
        {passo === 'modo' && (
          // Il tempo che passa si vede, così la scelta automatica non arriva a sorpresa —
          // ma si dice a parole, non con una barra che si riempie alla periferia dell'occhio.
          <span style={{ fontSize: 12, color: 'var(--s-ink-faint)' }}>
            senza risposta, fra {Math.ceil(rimasti / 1000)} s si va in NORMALE
          </span>
        )}
      </div>
    </section>
  );
}
