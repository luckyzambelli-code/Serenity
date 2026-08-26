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
 * ⚠️ SEGNALATO UNA QUARTA VOLTA, con un'immagine di riferimento precisa (traccia+manopola in
 * vetro che SCORRE fra due stati, sole/luna): « crea un toggle button in stile glassmorphism
 * identico all'immagine ». Quell'immagine è ESATTAMENTE `SelettoreTema` (due tappe, sole/luna,
 * "Light"/"Dark" — la stessa coppia). Con SOLO due tappe la manopola ha un unico "altro lato"
 * verso cui scorrere — uno scivolo vero, non solo un bottone che si dissolve, ha senso. Con
 * CINQUE (la lingua) non ce l'ha: dove scorrerebbe la manopola fra cinque tappe, quattro delle
 * quali nascoste? Sotto, `opzioni.length === 2` sceglie fra i due rendering — stesso
 * componente, stessa API, la FORMA cambia da sé in base a quante tappe ci sono davvero.
 *
 * @see docs/serenity-refonte.md
 */

import { useState, type ReactNode } from 'react';

const TOGGLE_W = 124, TOGGLE_H = 40, TOGGLE_KNOB = 32, TOGGLE_PAD = 4;

export interface OpzioneCiclica<T extends string> {
  k: T;
  label: ReactNode;
  icona?: ReactNode;
}

export function BottoneCiclico<T extends string>({ opzioni, selezionato, onChange, minLarghezza, elencoCompleto = false, larghezzaScivolo }: {
  opzioni: Array<OpzioneCiclica<T>>;
  selezionato: T;
  onChange: (k: T) => void;
  minLarghezza?: number;
  /** Vedi la nota sulla lingua, sopra: click → cassetto con tutte le tappe, non un passo solo. */
  elencoCompleto?: boolean;
  /** ⚠️ SOLO PER LO SCIVOLO A DUE TAPPE (sotto) — segnalato: « il bottone slide con o senza ago
   *  deve mostrare in intero ogni lingua, in francese ad esempio è tagliata la parola ».
   *  `TOGGLE_W` (124px, sotto) è tarato su `SelettoreTema` ("chiaro"/"scuro" — parole corte);
   *  `minLarghezza` (sopra) non tocca AFFATTO questo ramo (serve solo all'altro, il bottone
   *  con cassetto) — passarlo alla "vista senza ago" non aveva alcun effetto, il taglio
   *  restava. Opzionale, default `TOGGLE_W`: chi non lo passa (`SelettoreTema`) resta TALE E
   *  QUALE, un solo chiamante più esigente allarga SOLO il proprio scivolo. */
  larghezzaScivolo?: number;
}) {
  const idx = Math.max(0, opzioni.findIndex(o => o.k === selezionato));
  const corrente = opzioni[idx];
  const prossimo = opzioni[(idx + 1) % opzioni.length].k;
  const [aperto, setAperto] = useState(false);
  const scivoloW = larghezzaScivolo ?? TOGGLE_W;

  // ── LO SCIVOLO — solo con ESATTAMENTE due tappe, v. la nota in testa al file. `idx` vale 0
  // o 1: la manopola scorre a sinistra (0) o a destra (1), l'etichetta prende lo spazio che
  // resta dalla parte OPPOSTA alla manopola (mai sovrapposta, mai tagliata).
  if (opzioni.length === 2 && !elencoCompleto) {
    const knobLeft = idx === 0 ? TOGGLE_PAD : scivoloW - TOGGLE_KNOB - TOGGLE_PAD;
    return (
      <button
        className="s-glass s-toggle-track"
        onClick={() => onChange(prossimo)}
        title={corrente.label as string}
        aria-pressed={idx === 1}
        style={{
          position: 'relative', width: scivoloW, height: TOGGLE_H, borderRadius: 999,
          background: 'var(--s-disc)', cursor: 'pointer', border: 'none', padding: 0,
          overflow: 'hidden', flexShrink: 0,
        }}
      >
        <span style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: idx === 0 ? 'flex-end' : 'flex-start',
          paddingRight: idx === 0 ? 14 : 0, paddingLeft: idx === 1 ? 14 : 0,
          fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-sm)', fontWeight: 700, color: 'var(--s-ink)',
          whiteSpace: 'nowrap',
        }}>
          <span key={corrente.k} className="s-bottone-morph">{corrente.label}</span>
        </span>
        <span className="s-toggle-knob" style={{
          position: 'absolute', top: TOGGLE_PAD, left: knobLeft, width: TOGGLE_KNOB, height: TOGGLE_KNOB,
          borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}>
          {corrente.icona}
        </span>
      </button>
    );
  }

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
          fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', fontWeight: 700, color: 'var(--s-ink)',
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
              fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-base)', fontWeight: 700,
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
