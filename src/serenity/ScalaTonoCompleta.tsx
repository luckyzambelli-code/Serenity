import { useEffect, useRef } from 'react';
import { TONE_LEVELS, levelName } from '../engine/toneLevels';
import { pick5 } from '../i18n5';

/**
 * ScalaTonoCompleta — LA SCALA INTERA, SCORREVOLE — SOLO SERENITY, SOLO SENZA STRUMENTI.
 *
 * ── PERCHÉ ESISTE, ACCANTO A `ToneColumn` (già condivisa con EQUILIBRIUM) ───────────────────
 * Segnalato: « la scala deve essere possibile scroll, poiché l'auditor potrebbe aver bisogno
 * di dare i valori ed i nomi dei diversi toni al PC ». `ToneColumn` (v. il file, condiviso)
 * disegna apposta solo TREDICI nomi (`TONE_LABELS`) su un `<svg>` che si RIDIMENSIONA per
 * stare nello spazio dato — utile come lancetta/posizione, ma senza scroll e senza gli altri
 * quarantanove nomi della scala di Ron. Qui serve l'opposto: l'elenco INTERO (`TONE_LEVELS`,
 * gli stessi 62 già usati dal `<select>` di scelta del tono), leggibile riga per riga, che
 * scorre — l'auditor deve poter dire al preclear « guarda, questo si chiama così » per
 * QUALUNQUE livello, non solo i tredici scritti sul disegno.
 *
 * Estratta a sé invece di infilata dentro `ToneColumn` (che resta INVARIATA, condivisa, con
 * tutte le sue proporzioni già tarate su schermate reali) — un elenco che scorre e un disegno
 * a scala adattata sono due mestieri diversi, non due varianti dello stesso componente.
 *
 * Nessuna logica: riceve `tone` (dove si è ADESSO, per evidenziare la riga) e basta.
 */
export function ScalaTonoCompleta({ tone, lang }: {
  /** Il tono ATTUALE, −40…+40: la riga più vicina si evidenzia. */
  tone: number;
  lang: string;
}) {
  const righeRef = useRef<Record<number, HTMLDivElement | null>>({});
  const contenitoreRef = useRef<HTMLDivElement | null>(null);

  // Il livello più vicino al tono corrente — stessa idea di `levelAt` (toneLevels.ts), qui
  // rifatta in loco perché serve l'INDICE nell'elenco (per lo scorrimento), non solo il nome.
  let idxVicino = 0;
  let distMin = Infinity;
  TONE_LEVELS.forEach((l, i) => {
    const d = Math.abs(l.tone - tone);
    if (d < distMin) { distMin = d; idxVicino = i; }
  });
  const livelloVicino = TONE_LEVELS[idxVicino].tone;

  // Segue la riga evidenziata quando il tono cambia (scelta nuova, o "tono 40 raggiunto") —
  // `block:'nearest'`: non salta in cima al minimo scarto, si sposta solo quanto serve.
  useEffect(() => {
    righeRef.current[livelloVicino]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [livelloVicino]);

  return (
    <div ref={contenitoreRef} style={{
      width: '100%', maxHeight: 220, overflowY: 'auto',
      borderRadius: 10, border: '1px solid var(--s-ink-ghost)',
      background: 'var(--s-disc)', padding: '4px 0',
    }}>
      {TONE_LEVELS.map(l => {
        const vicino = l.tone === livelloVicino;
        return (
          <div key={l.tone}
            ref={el => { righeRef.current[l.tone] = el; }}
            style={{
              display: 'flex', gap: 10, alignItems: 'baseline',
              padding: '4px 12px',
              background: vicino ? 'var(--s-tone-hue)' : 'transparent',
              opacity: vicino ? 1 : 0.85,
            }}>
            <span style={{
              width: 48, flexShrink: 0, textAlign: 'right',
              fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-sm)', fontWeight: 700,
              color: vicino ? 'var(--s-disc)' : 'var(--s-ink-faint)',
            }}>
              {l.tone > 0 ? `+${l.tone}` : `${l.tone}`}
            </span>
            <span style={{
              fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-sm)',
              fontWeight: vicino ? 700 : 400,
              color: vicino ? 'var(--s-disc)' : 'var(--s-ink-soft)',
            }}>
              {levelName(l.name, lang)}
            </span>
          </div>
        );
      })}
      <div style={{
        position: 'sticky', bottom: 0, textAlign: 'center', padding: '3px 0',
        fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-micro)', letterSpacing: '0.06em',
        color: 'var(--s-ink-faint)', background: 'var(--s-disc)',
        borderTop: '1px solid var(--s-ink-ghost)',
      }}>
        {pick5(lang, 'scorri per vedere tutti i livelli', 'défile pour voir tous les niveaux',
          'scroll to see every level', 'desplázate para ver todos los niveles',
          'skrolla för att se alla nivåer')}
      </div>
    </div>
  );
}
