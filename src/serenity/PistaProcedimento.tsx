import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { ComandoProcedimento } from '../lib/procedimenti';
import { pick5 } from '../i18n5';

/**
 * PistaProcedimento — I COMANDI DI UN PROCEDIMENTO, NELLO STESSO SPAZIO DI `PistaCiclo`.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * Segnalato: « una volta scelto un procedimento (da PROCESSUS → PROCEDIMENTI), i suoi comandi
 * devono essere inseriti direttamente nello spazio comandi dei cicli, ereditando la stessa
 * trasparenza già impostata ». Stesso slot fisico di `PistaCiclo` (sovrapposto al lato
 * sinistro dell'arco), stessa resa (tempo a fuoco grande e con fondo, i vicini più piccoli e
 * smorzati), stesso comportamento al clic — ma la SORGENTE dei "tempi" qui non è
 * `engine/cycleSteps` (il ciclo REALE, guidato dal motore): è la lista di comandi letta da un
 * file `.txt` in `~/EQUILIBRIUM/COMANDI/Procedimenti` (`lib/procedimenti.ts`), un semplice
 * testo di riferimento che l'auditor sceglie di consultare.
 *
 * ── PERCHÉ È UN COMPONENTE A SÉ, E NON UNA VARIANTE DI `PistaCiclo` ─────────────────────────
 * `PistaCiclo` non lascia MAI che il clic sposti il tempo reale (v. la sua nota) — proprio
 * perché quei tempi sono legati a uno stato d'audit vero. Qui non c'è nessuno stato vero da
 * proteggere: un procedimento è testo puro, e il clic PUÒ liberamente spostare il fuoco fra i
 * suoi comandi, è esattamente quel che deve fare. Mescolare le due logiche in un componente
 * solo (« a volte il clic naviga per davvero, a volte no ») sarebbe stata la fonte di errori
 * silenziosi che la nota di `PistaCiclo` mette in guardia — due sorgenti diverse, due
 * componenti diversi, nessuna condizione a runtime da sbagliare.
 *
 * ── NUMERO SUL COMANDO, MAI SULLA NOTA — segnalato: « a) domande numerate in sequenza; b)
 * commenti per aiutare l'auditor, sotto la domanda, prima della prossima, SENZA numero,
 * mostrati insieme alla domanda, anche su più righe ». `comandi[i].testo` prende il numero
 * `i+1`; `comandi[i].note` (0+ righe, già raggruppate da `main.cjs`) restano sotto, più
 * piccole e senza cerchio — leggibili solo quando il loro comando è a fuoco (altrimenti
 * affollerebbero la lista quando è già tutta smorzata).
 *
 * ── SCORRIMENTO A ROTELLINA E FRECCE — segnalato: « si deve poter scorrere fra i comandi con
 * il mouse, le frecce ». `onWheel` sul contenitore avanza/arretra il fuoco di un comando per
 * "tacca" di rotellina (throttle con un piccolo cooldown, altrimenti un trackpad manda decine
 * di eventi per un solo gesto e la pista salterebbe più comandi alla volta); `onKeyDown` con
 * `tabIndex` fa lo stesso con ↑/↓ e ←/→. Il clic diretto su un comando resta il modo primario:
 * questi sono scorciatoie in più, non lo sostituiscono.
 *
 * ── IL FUOCO DEVE RESTARE VISIBILE — bug segnalato: « quand on scrolle les commandes elles
 * doivent se positionner dans la fenêtre pour rester visible, maintenant ce n'est pas le cas ».
 * Cambiare `fuoco` (clic, rotellina o frecce) cambiava taglia/opacità del comando ma non
 * garantiva che fosse ancora DENTRO la parte visibile del contenitore (`overflowY:'auto'`,
 * un'altezza limitata) — con molti comandi, scorrere con le frecce poteva mettere a fuoco una
 * riga già fuori dallo scorrimento corrente, invisibile finché non si scorreva anche a mano.
 * `righeRef` (un ref per riga) + un `useEffect` su `[fuoco]` che chiama `scrollIntoView`.
 *
 * ⚠️ DA 'nearest' A 'center' — segnalato: « quando fai apparire i comandi, la frase in
 * lettura deve restare a metà altezza per vedere in piccolo le domande prima e quelle dopo ».
 * `'nearest'` spostava lo scorrimento SOLO quanto bastava a far rientrare la riga — una riga
 * già dentro la finestra (magari proprio al bordo) non si spostava affatto, e l'auditor
 * poteva ritrovarsi il comando a fuoco in cima o in fondo, senza contesto sopra O sotto.
 * `'center'` lo tiene SEMPRE a metà: le domande vicine restano leggibili (più piccole, per la
 * dissolvenza già in uso) sia prima che dopo, qualunque sia la posizione nella lista. Per
 * poterlo centrare per davvero serve uno SPAZIO CON UN BORDO (altrimenti "centrare" non vuol
 * dire niente: cresce e basta) — il contenitore riprende un tetto d'altezza (`maxHeight`,
 * sotto), stavolta non per la ragione del vecchio bug (« spazio troppo basso, larghezza
 * stretta costringeva a scorrere anche il testo » — quella si è risolta allargando la
 * LARGHEZZA, non c'entra con l'altezza) ma apposta per dare al centraggio un centro vero.
 */
export function PistaProcedimento({
  nome, comandi, onChiudi, lang,
  fuoco, onImpostaFuoco, risposte, onScriviRisposta, onApriRisposta,
}: {
  nome: string;
  comandi: ComandoProcedimento[];
  onChiudi: () => void;
  lang: string;
  /**
   * ⚠️ AGGIUNTO — segnalato: « ad ogni domanda, uno spazio per scrivere la risposta
   * dell'auditor / includere la risposta verbale del PC ». Il fuoco era uno `useState` interno
   * a questo file — sollevato in `Serenity.tsx`, che deve saperlo per instradare lì la
   * trascrizione del PC (arriva dal motore della connessione, non da qui) verso il comando
   * giusto. Questo componente resta di sola LETTURA sullo stato: naviga chiamando
   * `onImpostaFuoco`, non scrive mai `fuoco` da sé.
   */
  fuoco: number;
  onImpostaFuoco: (indice: number) => void;
  /** Le due risposte del comando A FUOCO (e di ogni altro già visitato) — mai una fusa
   *  nell'altra, v. la nota grande in `Serenity.tsx` su `risposteProcedimento`. */
  risposte: Record<number, { auditor: string; pc: string; modificato: boolean }>;
  onScriviRisposta: (indice: number, valore: string) => void;
  /** La prima volta che l'auditor apre lo spazio risposta di un comando, la SUA domanda entra
   *  nel Giornale — chiamato da `onFocus` del campo, non da un semplice passaggio col fuoco
   *  (scorrere con la rotellina/le frecce resta una lettura passiva, come sempre). */
  onApriRisposta: (indice: number) => void;
}) {
  const titoloChiudi = pick5(lang, 'chiudi il procedimento', 'fermer le procédé',
    'close the procedure', 'cerrar el procedimiento', 'stäng proceduren') as string;
  const etichettaChiudi = pick5(lang, 'CHIUDI', 'FERMER', 'CLOSE', 'CERRAR', 'STÄNG') as string;
  const rispostaPlaceholder = pick5(lang, 'scrivi la risposta del PC…', 'écris la réponse du PC…',
    'type the PC\'s response…', 'escribe la respuesta del PC…', 'skriv PC:ns svar…') as string;
  const [ultimoScroll, setUltimoScroll] = useState(0);
  const contenitoreRef = useRef<HTMLDivElement>(null);
  const righeRef = useRef<(HTMLButtonElement | null)[]>([]);
  // Le frecce servono a un elemento col FOCUS vero — senza mettercelo da soli al montaggio,
  // l'auditor dovrebbe cliccare la pista una volta prima che ↑/↓ facciano qualcosa.
  useEffect(() => { contenitoreRef.current?.focus(); }, []);
  // Il comando a fuoco resta sempre dentro la parte visibile del contenitore — v. la nota
  // sopra. `'nearest'`: sposta lo scorrimento SOLO quanto serve, mai più del necessario.
  useEffect(() => {
    righeRef.current[fuoco]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [fuoco]);
  if (!comandi.length) return null;

  const vaia = (delta: number) => {
    onImpostaFuoco(Math.max(0, Math.min(comandi.length - 1, fuoco + delta)));
  };

  return (
    <div
      style={{
        width: 'min(96%, 2200px)', maxWidth: '100%', flexShrink: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
        gap: 12, pointerEvents: 'auto',
      }}>
      <div style={{
        // ⚠️ BUG TROVATO DI NUOVO — segnalato: « quando scroll sui comandi, il bottone fermer
        // scompare, deve essere visibile ». Un giro fa questa intestazione era già stata tolta
        // da `position:sticky` (si incollava all'antenato SBAGLIATO, coprendo la prima riga) —
        // ma restava comunque dentro lo STESSO contenitore che ora scorre (v. sotto, per il
        // centraggio del comando a fuoco): scorrendo, FERMER scorreva via CON la lista, invece
        // di restarci sopra. L'intestazione è diventata un FRATELLO del contenitore scorrevole
        // (non più un suo primo figlio) — bastava finché l'UNICO scorrimento in gioco era
        // quello interno alla lista dei comandi.
        //
        // ⚠️ BUG TROVATO UNA TERZA VOLTA — segnalato: « le bouton FERMER est invisible car il
        // faut scroller vers le haut EN DEHORS de commandes, ce n'est pas naturel ». Un secondo
        // scorrimento, più esterno (la pagina/il pannello che contiene TUTTO `PistaProcedimento`,
        // quando `comandiSottoAgo` è falso o quel contenitore stesso trabocca): essere un
        // "fratello" bastava contro lo scorrimento INTERNO, non contro QUESTO. `position:
        // 'sticky', top: 0` risolve entrambi insieme, senza dover sapere quale antenato scorre
        // davvero: si aggancia al PIÙ VICINO scorrevole, quale che sia — la lista dei comandi
        // se è lei a scorrere, la pagina intera se è lei. Non lo stesso bug di prima (quello era
        // sticky DENTRO la lista, sopra la prima riga vera): qui è sticky FUORI da essa, un
        // fratello che segue lo scorrimento invece di ignorarlo.
        position: 'sticky', top: 0, zIndex: 2,
        width: '100%', boxSizing: 'border-box',
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '3px 4px 3px 10px', borderRadius: 999,
        background: 'color-mix(in srgb, var(--s-ground) 68%, transparent)',
        backdropFilter: 'blur(6px)',
      }}>
        <span style={{
          fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-micro)', fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--s-ink-faint)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150,
        }}>
          {nome}
        </span>
        {/* ⚠️ Segnalato la prima volta: « la chiusura non è evidente, metti più in rilievo »;
            poi ancora: « fai più grande il bottone di chiusura ». Da un ✕ nudo, a un cerchio
            bordato, a QUESTO bottone — bordato ED etichettato, stessa taglia di quello appena
            ingrandito in `PistaCiclo` (icona 15px, testo `--s-fs-sm`): le due piste devono
            essere posizionate esattamente uguali, il bottone di chiusura compreso. */}
        <button type="button" onClick={onChiudi} title={titoloChiudi}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
            borderRadius: 999, padding: '6px 14px 6px 11px', flexShrink: 0,
            border: '1px solid var(--s-ink-ghost)',
            background: 'color-mix(in srgb, var(--s-ground) 55%, transparent)',
            fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-sm)', fontWeight: 700,
            letterSpacing: '0.06em', color: 'var(--s-ink-soft)',
          }}>
          <X size={15} strokeWidth={2.6} />
          {etichettaChiudi}
        </button>
      </div>
      {/* ── LA LISTA, IN UNA FINESTRA CON UN CENTRO VERO — v. la nota in cima al file sul
          passaggio da `'nearest'` a `'center'`. `maxHeight` le dà un bordo entro cui
          "centrare" vuol dire qualcosa; `overflowY:'auto'` la rende scorrevole DA SOLA — FERMER
          (sopra, ora un fratello, non un figlio) non ne fa più parte e non scorre con lei. */}
      <div
        ref={contenitoreRef}
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); vaia(1); }
          else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); vaia(-1); }
        }}
        onWheel={e => {
          // Cooldown breve: un trackpad manda molti eventi per un solo gesto di scorrimento —
          // senza freno la pista salterebbe più di un comando a ogni "tacca".
          const ora = Date.now();
          if (ora - ultimoScroll < 220) return;
          if (Math.abs(e.deltaY) < 4) return;
          setUltimoScroll(ora);
          vaia(e.deltaY > 0 ? 1 : -1);
        }}
        style={{
          width: '100%', maxHeight: '52vh', overflowY: 'auto', outline: 'none',
          display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12,
          // Un po' di spazio SOPRA e SOTTO il primo/ultimo comando: senza, "centrare" il primo
          // o l'ultimo comando li spingerebbe contro il bordo della finestra invece che a
          // vera metà altezza, perché non c'è nessuno spazio oltre loro da centrare dentro.
          paddingTop: '20vh', paddingBottom: '20vh',
        }}>
      {comandi.map((c, i) => {
        const distanza = Math.abs(i - fuoco);
        const inFuoco = i === fuoco;
        const fs = inFuoco ? 'var(--s-fs-xl)' : distanza === 1 ? 'var(--s-fs-base)' : 'var(--s-fs-sm)';
        const opacita = inFuoco ? 1 : distanza === 1 ? 0.55 : 0.26;
        const colore = inFuoco ? 'var(--s-ink)' : 'var(--s-ink-soft)';
        // ⚠️ AGGIUNTO — segnalato: « ad ogni domanda, uno spazio per scrivere la risposta ».
        // Il campo NON può vivere dentro il `<button>` della riga: un `<input>` annidato in un
        // `<button>` è contenuto non valido (spec HTML) e in alcuni browser il clic sul campo
        // si propaga come clic sul bottone — un `<div>` che avvolge ENTRAMBI come fratelli
        // evita il problema, senza cambiare nulla del bottone stesso.
        const risposta = risposte[i];
        // ⚠️ CORRETTO — segnalato: « la risposta del PC si scrive ANCHE nello spazio dove
        // l'auditor può riscrivere ». Non più « pc SOLO se auditor è vuoto »: il campo mostra
        // SEMPRE `auditor`, che la trascrizione riempie e segue dal vivo finché `modificato`
        // resta falso (v. la nota grande in `Serenity.tsx`) — l'auditor riscrive SOPRA la
        // frase vera del PC, non ricomincia da un campo vuoto accanto a lei.
        const testoMostrato = risposta?.auditor ?? '';
        const mostraTrascrizione = !risposta?.modificato && !!testoMostrato;
        return (
          <div key={i} style={{ width: '100%' }}>
          <button ref={el => { righeRef.current[i] = el; }} type="button" onClick={() => onImpostaFuoco(i)}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, border: 'none',
              cursor: 'pointer', padding: '3px 10px', borderRadius: 14, textAlign: 'left',
              opacity: opacita, width: '100%', boxSizing: 'border-box',
              transition: 'opacity 0.25s ease, font-size 0.25s ease, background 0.25s ease',
              // Stessa taratura di `PistaCiclo`: solo il comando a fuoco porta un fondo, per
              // non impilare più riquadri semitrasparenti sopra l'ago.
              background: inFuoco ? 'color-mix(in srgb, var(--s-ground) 42%, transparent)' : 'none',
            }}>
            <span aria-hidden style={{
              width: inFuoco ? 26 : 18, height: inFuoco ? 26 : 18, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2,
              fontFamily: 'var(--s-sans)', fontSize: inFuoco ? 12 : 9, fontWeight: 800, lineHeight: 1,
              color: colore, background: 'transparent', border: `1px solid ${colore}`,
            }}>
              {i + 1}
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              {/* ⚠️ CORRETTO — segnalato: « metti in grassetto i nomi dei processus e dei
                  comandi procedimenti ». Era in grassetto SOLO il comando a fuoco (700), gli
                  altri restavano a peso medio (500) — ora sempre 700, a fuoco o no: distanza
                  e opacità restano il modo di dire "non è questo", il peso del carattere non
                  deve più farne parte. */}
              <span style={{
                fontFamily: 'var(--s-serif)', fontSize: fs, fontWeight: 700,
                color: colore, lineHeight: 1.25,
              }}>
                {c.testo}
              </span>
              {/* Le note: SENZA numero, sotto il comando, leggibili solo quando è lui il
                  fuoco — altrimenti affollerebbero una pista già smorzata di testo che
                  nessuno sta leggendo in quel momento. */}
              {inFuoco && c.note.length > 0 && (
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {c.note.map((n, ni) => (
                    <span key={ni} style={{
                      fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-sm)', fontStyle: 'italic',
                      color: 'var(--s-ink-faint)', lineHeight: 1.35,
                    }}>
                      {n}
                    </span>
                  ))}
                </span>
              )}
            </span>
          </button>
          {/* ── LO SPAZIO RISPOSTA — solo sul comando a fuoco, stessa ragione delle note sopra:
              affollerebbe una pista smorzata se restasse visibile ovunque. Il valore mostrato è
              SEMPRE `risposta.auditor` per la scrittura (l'auditor digita sempre nel proprio
              campo, mai "sopra" al testo trascritto) — ma finché è vuoto il campo MOSTRA la
              trascrizione del PC, in corsivo grigio: la si vede, la si può correggere
              iniziando a scrivere (da quel momento diventa testo dell'auditor, non più un
              proseguimento della trascrizione — v. la nota di `Serenity.tsx` sul perché sono
              DUE campi separati). */}
          {inFuoco && (
            <div style={{ padding: '4px 10px 8px 46px' }}>
              <input
                type="text"
                value={testoMostrato}
                onFocus={() => onApriRisposta(i)}
                onChange={e => onScriviRisposta(i, e.target.value)}
                placeholder={rispostaPlaceholder}
                style={{
                  width: '100%', boxSizing: 'border-box', border: 'none', borderBottom: '1px solid var(--s-ink-ghost)',
                  background: 'none', outline: 'none', padding: '4px 2px',
                  fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)',
                  fontStyle: mostraTrascrizione ? 'italic' : 'normal',
                  color: mostraTrascrizione ? 'var(--s-ink-faint)' : 'var(--s-ink)',
                }}
              />
            </div>
          )}
          </div>
        );
      })}
      </div>
    </div>
  );
}
