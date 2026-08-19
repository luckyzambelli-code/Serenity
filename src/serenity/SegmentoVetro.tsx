/**
 * SegmentoVetro — UN SOLO BOTTONE CHE SCIVOLA, non due (o cinque) bottoni separati.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * Segnalato con un'immagine e un .gif precisi: un cursore di vetro che SCIVOLA da una posizione
 * all'altra dentro un'unica pista, invece di due pillole indipendenti che si accendono e si
 * spengono. « La logique est de ne pas avoir deux boutons... mais un bouton qui SLIDE ». Vale
 * per ogni scelta ESCLUSIVA (una sola vera alla volta) di questa interfaccia — tema, lingua,
 * quale ago seguire — non solo per l'esempio mostrato (chiaro/scuro).
 *
 * ── COSA NON DIVENTA QUESTO ─────────────────────────────────────────────────────────────────
 * Le pillole dei QUATTRO CICLI (CONTACT/NULL/MIRROR/TONE) restano bottoni veri, non uno
 * scivolo: ogni click lì ARMA SUBITO un ciclo — un'azione, non una preferenza. Uno scivolo
 * implicherebbe "scegli, poi conferma altrove", cambiando il gesto stesso. Questo componente è
 * per le PREFERENZE (una sola cosa vera, cambiabile in ogni momento, senza conseguenze da
 * confermare) — non per gli inneschi di un'azione.
 *
 * ── COME SCIVOLA ────────────────────────────────────────────────────────────────────────────
 * Il cursore è un `.s-glass` VERO (stesso materiale di bottoni e pannelli — sfocatura, bordo,
 * lucido), posizionato in percentuale sulla larghezza della pista e animato in `transform`
 * (non `left`: un `transform` non ricalcola il layout a ogni fotogramma). La curva ha un piccolo
 * "rimbalzo" (overshoot) apposta — è quello che nel .gif si legge come un cursore di vetro
 * vero, non un rettangolo che trasla.
 *
 * @see docs/serenity-refonte.md
 */

import type { ReactNode } from 'react';

export interface OpzioneSegmento<T extends string> {
  k: T;
  label: ReactNode;
  icona?: ReactNode;
}

export function SegmentoVetro<T extends string>({ opzioni, selezionato, onChange, minLarghezza }: {
  opzioni: Array<OpzioneSegmento<T>>;
  selezionato: T;
  onChange: (k: T) => void;
  /** Larghezza minima di ogni tappa — sotto un certo numero di lettere il cursore
   *  diventerebbe più stretto dell'etichetta che deve coprire. */
  minLarghezza?: number;
}) {
  const idx = Math.max(0, opzioni.findIndex(o => o.k === selezionato));
  const n = opzioni.length;
  return (
    <div style={{
      position: 'relative', display: 'flex', borderRadius: 999, padding: 3,
      background: 'var(--s-disc-sunk)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)',
    }}>
      {/* ── IL CURSORE — l'unico elemento di vetro vero, quello che scivola ────────────────── */}
      <div className="s-glass" style={{
        position: 'absolute', top: 3, bottom: 3, left: 3,
        width: `calc(${100 / n}% - 6px)`,
        minWidth: minLarghezza,
        borderRadius: 999, background: 'var(--s-disc)',
        transform: `translateX(calc(${idx} * (100% + 6px)))`,
        transition: 'transform 480ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        willChange: 'transform',
      }} />
      {opzioni.map(o => (
        <button key={o.k} onClick={() => onChange(o.k)} style={{
          position: 'relative', zIndex: 1, flex: 1, minWidth: minLarghezza,
          border: 'none', background: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '6px 14px', fontFamily: 'var(--s-sans)', fontSize: 13,
          fontWeight: o.k === selezionato ? 700 : 500, whiteSpace: 'nowrap',
          color: o.k === selezionato ? 'var(--s-ink)' : 'var(--s-ink-faint)',
          transition: 'color var(--s-slow) var(--s-ease), font-weight var(--s-slow) var(--s-ease)',
        }}>
          {o.icona}{o.label}
        </button>
      ))}
    </div>
  );
}
