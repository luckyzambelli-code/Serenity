/**
 * BottoneCiclico — UN SOLO bottone, che SI TRASFORMA, non due (o cinque) affiancati.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * Segnalato dopo `SegmentoVetro.tsx` (un cursore che scivola fra tappe visibili insieme):
 * « i bottoni DARK/LIGHT devono essere solo UNO, che si trasforma quando si clicca » e « i
 * bottoni delle lingue UGUALE, deve essere un solo bottone ». Un passo oltre lo scivolo: qui
 * non si vedono MAI le tappe non scelte — un solo bottone di vetro con l'icona e la parola
 * DELLO STATO ATTUALE, che al click passa alla tappa successiva (ciclicamente) con una
 * transizione morbida (dissolvenza + risalita) invece di un salto secco.
 *
 * ── QUANDO USARE QUESTO E QUANDO `SegmentoVetro` ────────────────────────────────────────────
 * Questo per le scelte dove vedere le altre tappe non aggiunge nulla (tema, lingua, quale ago
 * guardare — sapere ADESSO qual è già basta, le altre si scoprono cliccando). `SegmentoVetro`
 * resta giusto dove le tappe sono POCHE e vale la pena vederle tutte fianco a fianco (nessun
 * caso così in SERENITY, per ora — tenuto per un domani).
 *
 * @see docs/serenity-refonte.md
 */

import type { ReactNode } from 'react';

export interface OpzioneCiclica<T extends string> {
  k: T;
  label: ReactNode;
  icona?: ReactNode;
}

export function BottoneCiclico<T extends string>({ opzioni, selezionato, onChange, minLarghezza }: {
  opzioni: Array<OpzioneCiclica<T>>;
  selezionato: T;
  onChange: (k: T) => void;
  minLarghezza?: number;
}) {
  const idx = Math.max(0, opzioni.findIndex(o => o.k === selezionato));
  const corrente = opzioni[idx];
  const prossimo = opzioni[(idx + 1) % opzioni.length].k;
  return (
    <button
      className="s-glass s-glass-btn"
      onClick={() => onChange(prossimo)}
      title={corrente.label as string}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        minWidth: minLarghezza, borderRadius: 999, padding: '6px 14px',
        background: 'var(--s-disc)', cursor: 'pointer',
        fontFamily: 'var(--s-sans)', fontSize: 13, fontWeight: 700, color: 'var(--s-ink)',
        overflow: 'hidden',
      }}
    >
      {/* `key={corrente.k}`: React SMONTA e RIMONTA questo span a ogni cambio di stato — è
          quel che fa scattare `sBottoneMorph` da capo ogni volta, il "trasformarsi" richiesto,
          invece di un testo che cambia di scatto. */}
      <span key={corrente.k} className="s-bottone-morph" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {corrente.icona}{corrente.label}
      </span>
    </button>
  );
}
