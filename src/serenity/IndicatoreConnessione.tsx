/**
 * IndicatoreConnessione — un punto e una parola, per ogni dispositivo.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * Segnalato: le indicazioni di connessione devono dire SUBITO — senza pannello tecnico —
 * quale dispositivo è collegato, quale non lo è, se la connessione regge, quale aspetta, se
 * c'è un problema, e quando il sistema sta cercando o ristabilendo. Prima ogni indicatore in
 * `Serenity.tsx` aveva la sua forma (un bottone qui, uno span colorato là): stessa informazione,
 * cinque disegni diversi — difficile da leggere in un colpo d'occhio. Un solo componente, uno
 * stato alla volta, sempre nello stesso posto (un punto a sinistra della parola).
 *
 * ── CINQUE STATI, TRE COLORI ────────────────────────────────────────────────────────────────
 * `tokens.css` dà solo tre segnali (vivo/quiete/riserva) apposta — un quarto colore per « in
 * attesa » sarebbe il linguaggio tecnico che SERENITY rifiuta. Qui « in attesa » e « spento »
 * restano su un punto neutro (nessun segnale = niente da segnalare ancora), « cercando »
 * prende « vivo » (qualcosa sta accadendo), « connesso » prende « quiete » (raggiunto), ed
 * « errore » prende « riserva » — la STESSA ambra già usata per l'hardware in `Serenity.tsx`,
 * non un rosso nuovo che griderebbe.
 *
 * ── SEGNALATO: NON SI LEGGE ─────────────────────────────────────────────────────────────────
 * Prima versione: anche la PAROLA prendeva il colore del segnale — tenue per dottrina, ma « in
 * attesa »/« spento » finivano in `--s-ink-faint`, che su fondo perla è quasi invisibile. Il
 * colore ora resta SOLO sul punto (7→9 px, l'accento) — la parola è SEMPRE `--s-ink`, lo stesso
 * inchiostro pieno di tutto il resto del testo funzionale. « I colori dicono, non gridano » non
 * voleva dire « le parole si vedono a fatica »: un'interfaccia serena dev'essere leggibile.
 *
 * ── SEGNALATO: UN'ICONA PER LO STRUMENTO ────────────────────────────────────────────────────
 * « Met un icone... pour le connecteur MUSE et Meter ». Il punto dice LO STATO; la parola dice
 * QUALE dispositivo — ma prima solo la parola lo diceva, ed è quel che un'icona coglie ancora
 * più in fretta, di sbieco, come vuole `Cerchio.tsx`. `icona` è OPZIONALE e SOLO decorativa
 * (`aria-hidden`): tolta, l'indicatore si legge esattamente come prima — la parola resta la
 * fonte vera dell'informazione, l'icona la anticipa.
 *
 * ── SEGNALATO: « le même style pour les cycles doit être utilisé pour les inscriptions en
 * haut » ──────────────────────────────────────────────────────────────────────────────────
 * Erano parole nude sulla superficie. Ora ogni indicatore è una PILLOLA di vetro — lo stesso
 * `.s-glass`/`.s-glass-btn` dei bottoni di ciclo in fondo pagina: stesso materiale, stesso
 * linguaggio, non due stili per due famiglie di controlli che fanno la stessa cosa (dire uno
 * stato, offrire un gesto).
 *
 * @see docs/serenity-refonte.md — fase 6.
 */

import type { ReactNode } from 'react';

export type StatoConnessione = 'connesso' | 'in-attesa' | 'cercando' | 'errore' | 'spento';

/** Esportato per `SelettoreStrumento` — segnalato: « i bottoni MUSE, Meter, No instrument
 *  devono essere un solo bottone con solo le icone ». Stesso linguaggio di colore, un solo
 *  punto per icona invece che punto+parola per pillola: la mappa non si duplica altrove. */
export const COLORE_PUNTO: Record<StatoConnessione, string> = {
  connesso:  'var(--s-still)',
  cercando:  'var(--s-alive)',
  errore:    'var(--s-reserve)',
  'in-attesa': 'var(--s-ink-ghost)',
  spento:    'var(--s-ink-ghost)',
};

export function IndicatoreConnessione({ stato, etichetta, dettaglio, onClick, title, icona }: {
  stato: StatoConnessione;
  etichetta: string;
  dettaglio?: string | null;
  onClick?: () => void;
  title?: string;
  /** L'icona dello STRUMENTO (non dello stato — quello resta il punto colorato). Decorativa. */
  icona?: ReactNode;
}) {
  const puntino = COLORE_PUNTO[stato];
  const Elemento = onClick ? 'button' : 'span';
  return (
    <Elemento
      onClick={onClick}
      title={title}
      className={onClick ? 's-glass s-glass-btn' : 's-glass'}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--s-fs-base)', color: 'var(--s-ink)',
        background: 'var(--s-disc)', padding: '5px 12px', borderRadius: 999, margin: 0,
        fontFamily: 'var(--s-sans)', fontWeight: 500, cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <span style={{
        width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: puntino,
        boxShadow: stato === 'connesso' || stato === 'errore' ? `0 0 0 3px color-mix(in srgb, ${puntino} 20%, transparent)` : 'none',
        transition: 'background var(--s-slow) var(--s-ease), box-shadow var(--s-slow) var(--s-ease)',
      }} />
      {icona && (
        <span aria-hidden="true" style={{ display: 'flex', color: 'var(--s-ink-soft)', flexShrink: 0 }}>
          {icona}
        </span>
      )}
      <span>
        {etichetta}
        {dettaglio && <span style={{ color: 'var(--s-ink-soft)', fontWeight: 400 }}> · {dettaglio}</span>}
      </span>
    </Elemento>
  );
}
