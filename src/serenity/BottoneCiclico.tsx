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
 * ⚠️ SEGNALATO DI NUOVO, sulla LINGUA soltanto: « quando si schiaccia sulla lingua fai apparire
 * sotto tutte le lingue ». Con SOLO due tappe (tema) ciclare basta — la prossima è sempre
 * l'unica altra. Con CINQUE (lingua) ciclare vuol dire premere fino a quattro volte per
 * trovarne una che non sia la successiva: `elencoCompleto` apre invece un cassetto con TUTTE
 * le tappe sotto il bottone, una sola pressione per arrivarci. Il bottone resta lo stesso
 * (mostra solo lo stato attuale) — cambia solo cosa succede al click.
 *
 * @see docs/serenity-refonte.md
 */

import { useState, type ReactNode } from 'react';

export interface OpzioneCiclica<T extends string> {
  k: T;
  label: ReactNode;
  icona?: ReactNode;
}

export function BottoneCiclico<T extends string>({ opzioni, selezionato, onChange, minLarghezza, elencoCompleto = false }: {
  opzioni: Array<OpzioneCiclica<T>>;
  selezionato: T;
  onChange: (k: T) => void;
  minLarghezza?: number;
  /** Vedi la nota sulla lingua, sopra: click → cassetto con tutte le tappe, non un passo solo. */
  elencoCompleto?: boolean;
}) {
  const idx = Math.max(0, opzioni.findIndex(o => o.k === selezionato));
  const corrente = opzioni[idx];
  const prossimo = opzioni[(idx + 1) % opzioni.length].k;
  const [aperto, setAperto] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        className="s-glass s-glass-btn"
        onClick={() => (elencoCompleto ? setAperto(v => !v) : onChange(prossimo))}
        title={corrente.label as string}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          minWidth: minLarghezza, borderRadius: 999, padding: '6px 14px',
          background: 'var(--s-disc)', cursor: 'pointer',
          fontFamily: 'var(--s-sans)', fontSize: 14.5, fontWeight: 700, color: 'var(--s-ink)',
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
      {elencoCompleto && aperto && (
        <div className="s-glass s-glass-lift" style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 50,
          display: 'flex', flexDirection: 'column', gap: 2, padding: 6, borderRadius: 12,
          background: 'var(--s-disc)', minWidth: minLarghezza,
        }}>
          {opzioni.map(o => (
            <button key={o.k} className="s-glass-btn" onClick={() => { onChange(o.k); setAperto(false); }} style={{
              display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
              border: 'none', borderRadius: 8, padding: '6px 12px', textAlign: 'left',
              background: o.k === selezionato ? 'var(--s-disc-sunk)' : 'transparent',
              fontFamily: 'var(--s-sans)', fontSize: 14.5, fontWeight: 700,
              color: o.k === selezionato ? 'var(--s-still)' : 'var(--s-ink)',
            }}>
              {o.icona}{o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
