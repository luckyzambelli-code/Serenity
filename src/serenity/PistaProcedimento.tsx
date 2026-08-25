import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { ComandoProcedimento } from '../lib/procedimenti';

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
 */
export function PistaProcedimento({ nome, comandi, onChiudi }: {
  nome: string;
  comandi: ComandoProcedimento[];
  onChiudi: () => void;
}) {
  const [fuoco, setFuoco] = useState(0);
  const [ultimoScroll, setUltimoScroll] = useState(0);
  const contenitoreRef = useRef<HTMLDivElement>(null);
  // Le frecce servono a un elemento col FOCUS vero — senza mettercelo da soli al montaggio,
  // l'auditor dovrebbe cliccare la pista una volta prima che ↑/↓ facciano qualcosa.
  useEffect(() => { contenitoreRef.current?.focus(); }, []);
  if (!comandi.length) return null;

  const vaia = (delta: number) => {
    setFuoco(f => Math.max(0, Math.min(comandi.length - 1, f + delta)));
  };

  return (
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
        // ⚠️ Segnalato: « i procedimenti e i cicli devono essere più a sinistra, allineati a
        // sinistra col METER TA » — stessa geometria di `PistaCiclo` (v. la sua nota),
        // `left:16` come il blocco della lettura TA nello stesso `<section>`.
        position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
        width: 280, maxHeight: '82%', overflowY: 'auto',
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
        gap: 12, pointerEvents: 'auto', zIndex: 5, outline: 'none',
      }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, position: 'sticky', top: 0,
        padding: '3px 4px 3px 10px', borderRadius: 999,
        background: 'color-mix(in srgb, var(--s-ground) 68%, transparent)',
      }}>
        <span style={{
          fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-micro)', fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--s-ink-faint)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 210,
        }}>
          {nome}
        </span>
        <button type="button" onClick={onChiudi}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
            border: 'none', background: 'none', cursor: 'pointer', color: 'var(--s-ink-faint)',
          }}>
          <X size={12} strokeWidth={2.4} />
        </button>
      </div>
      {comandi.map((c, i) => {
        const distanza = Math.abs(i - fuoco);
        const inFuoco = i === fuoco;
        const fs = inFuoco ? 'var(--s-fs-xl)' : distanza === 1 ? 'var(--s-fs-base)' : 'var(--s-fs-sm)';
        const opacita = inFuoco ? 1 : distanza === 1 ? 0.55 : 0.26;
        const colore = inFuoco ? 'var(--s-ink)' : 'var(--s-ink-soft)';
        return (
          <button key={i} type="button" onClick={() => setFuoco(i)}
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
              <span style={{
                fontFamily: 'var(--s-serif)', fontSize: fs, fontWeight: inFuoco ? 700 : 500,
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
        );
      })}
    </div>
  );
}
