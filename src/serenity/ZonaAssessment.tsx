/**
 * ZonaAssessment — l'ASSESSMENT come una zona sua, non un cassetto appeso a un bottone.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * Segnalato: « l'assessment deve avere una sua zona, come in equilibrium ». In App.tsx
 * (`AssessmentPanel.tsx`) l'assessment è un pannello ANCORATO — una colonna vera nel layout,
 * sempre allo stesso posto, che si apre da sé quando un assessment comincia e resta lì per
 * essere ritrovato. In SERENITY era un cassetto (`position:absolute, bottom:'100%'`) che
 * usciva dal bottone stesso: spariva quando `assessAttivo` tornava falso, e la sua posizione
 * dipendeva da dove il bottone capitava a stare nella pagina — non un posto, un effetto
 * collaterale del bottone.
 *
 * ── LO STESSO STATO, SOLO UN CONTENITORE VERO ──────────────────────────────────────────────
 * Zero logica nuova: `assessAttivo`/`assessItems` restano esattamente quelli di `Serenity.tsx`
 * (l'effetto che li riempie leggendo `journal.logs` non cambia di una riga). Cambia solo DOVE
 * e COME si vedono — una colonna ancorata all'angolo, sempre presente a seduta aperta (non
 * solo quando la cattura è accesa), col suo titolo sempre leggibile anche chiusa.
 *
 * @see docs/serenity-refonte.md
 */

import { READ_NON_MISURATO } from '../engine/instantRead';

export interface AssessItemSerenity {
  id: string; time: number; item: string; gruppo: number;
  reaction: string | null; beforeMs: number; afterMs: number; readSrc?: 'eeg' | 'theta';
}

const orologio = (s: number) => {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};

export function ZonaAssessment({ attivo, onToggle, items, LC }: {
  /** La cattura è accesa? Stesso `assessAttivo` di `Serenity.tsx` — anche il toggle qui è
   *  quello stesso, non un secondo interruttore. */
  attivo: boolean;
  onToggle: () => void;
  items: AssessItemSerenity[];
  LC: (it: string, fr: string, en: string, es: string, sv: string) => string;
}) {
  return (
    <div className="s-glass s-glass-lift" style={{
      position: 'absolute', top: 16, left: 32, zIndex: 5,
      display: 'flex', flexDirection: 'column', gap: 8,
      width: 300, maxHeight: attivo ? 420 : 'auto',
      borderRadius: 16, background: 'var(--s-disc)', padding: '12px 14px',
      pointerEvents: 'auto',
    }}>
      {/* ── L'INTESTAZIONE — SEMPRE VISIBILE, come in App.tsx: si trova la zona anche chiusa,
          non solo quando sta già catturando. */}
      <button
        className="s-glass-btn"
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          border: 'none', borderRadius: 10, background: 'transparent', cursor: 'pointer',
          padding: '2px 2px', fontFamily: 'var(--s-sans)',
        }}>
        <span style={{
          fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700,
          color: attivo ? 'var(--s-still)' : 'var(--s-ink-faint)',
        }}>
          {LC('assessment', 'assessment', 'assessment', 'assessment', 'assessment')}
          {items.length > 0 ? ` · ${items.length}` : ''}
        </span>
        <span style={{ fontSize: 12, color: 'var(--s-ink-ghost)' }}>{attivo ? '▾' : '▸'}</span>
      </button>
      {attivo && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', minHeight: 0 }}>
          {items.length === 0 ? (
            <span className="ser-pulse" style={{ fontSize: 14.5, color: 'var(--s-ink-faint)' }}>
              {LC('in ascolto…', 'à l\'écoute…', 'listening…', 'escuchando…', 'lyssnar…')}
            </span>
          ) : items.slice().reverse().map(it => {
            const inAttesa = it.reaction === null;
            const colore = inAttesa ? 'var(--s-ink-faint)'
              : it.reaction === 'NULL' ? 'var(--s-ink-faint)'
              : it.reaction === READ_NON_MISURATO ? 'var(--s-reserve)'
              : 'var(--s-still)';
            return (
              <div key={it.id} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ fontFamily: 'var(--s-mono)', fontSize: 12.5, color: 'var(--s-ink-faint)', flexShrink: 0 }}>
                    {orologio(it.time)}
                  </span>
                  <span style={{ fontFamily: 'var(--s-serif)', fontSize: 15.5, color: 'var(--s-ink)' }}>
                    {it.item}
                  </span>
                  {items.filter(a => a.gruppo === it.gruppo).length > 1 && (
                    <span style={{ fontFamily: 'var(--s-mono)', fontSize: 12, color: 'var(--s-ink-ghost)' }}>
                      ×{items.filter(a => a.gruppo === it.gruppo && a.time <= it.time).length}
                    </span>
                  )}
                </div>
                <span className={inAttesa ? 'ser-pulse' : undefined} style={{
                  fontFamily: 'var(--s-mono)', fontSize: 13, color: colore, marginLeft: 62,
                }}>
                  {inAttesa
                    ? LC('in lettura…', 'en lecture…', 'reading…', 'leyendo…', 'läser…')
                    : it.reaction === 'NULL'
                      ? LC('nessuna reazione', 'aucune réaction', 'no reaction', 'sin reacción', 'ingen reaktion')
                      : it.reaction === READ_NON_MISURATO
                        ? LC('non misurato — nessuno strumento', 'non mesuré — aucun instrument',
                            'not measured — no instrument', 'no medido — ningún instrumento',
                            'inte mätt — inget instrument')
                        : `${it.reaction}${it.beforeMs > 0 ? ` −${it.beforeMs}ms` : it.afterMs > 0 ? ` +${it.afterMs}ms` : ''}`
                        + (it.readSrc ? ` · ${it.readSrc === 'eeg' ? 'MUSE' : 'METER'}` : '')}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
