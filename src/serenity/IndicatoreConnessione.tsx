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
 * restano nell'inchiostro debole (nessun segnale = niente da segnalare ancora), « cercando »
 * prende « vivo » (qualcosa sta accadendo), « connesso » prende « quiete » (raggiunto), ed
 * « errore » prende « riserva » — la STESSA ambra già usata per l'hardware in `Serenity.tsx`,
 * non un rosso nuovo che griderebbe.
 *
 * @see docs/serenity-refonte.md — fase 6.
 */

export type StatoConnessione = 'connesso' | 'in-attesa' | 'cercando' | 'errore' | 'spento';

const COLORE: Record<StatoConnessione, string> = {
  connesso:  'var(--s-still)',
  cercando:  'var(--s-alive)',
  errore:    'var(--s-reserve)',
  'in-attesa': 'var(--s-ink-faint)',
  spento:    'var(--s-ink-ghost)',
};

export function IndicatoreConnessione({ stato, etichetta, dettaglio, onClick, title }: {
  stato: StatoConnessione;
  etichetta: string;
  dettaglio?: string | null;
  onClick?: () => void;
  title?: string;
}) {
  const colore = COLORE[stato];
  const Elemento = onClick ? 'button' : 'span';
  return (
    <Elemento
      onClick={onClick}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: colore,
        border: 'none', background: 'none', padding: 0, margin: 0,
        fontFamily: 'var(--s-sans)', cursor: onClick ? 'pointer' : 'default',
        transition: 'color var(--s-slow) var(--s-ease)',
      }}
    >
      <span style={{
        width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: colore,
        transition: 'background var(--s-slow) var(--s-ease)',
      }} />
      {etichetta}{dettaglio ? ` · ${dettaglio}` : ''}
    </Elemento>
  );
}
