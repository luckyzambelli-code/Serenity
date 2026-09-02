import { useEffect, useRef } from 'react';
import { TONE_LEVELS, levelName } from '../engine/toneLevels';

/**
 * ScalaTonoCompleta — LA SCALA INTERA, SCORREVOLE — SOLO SERENITY, SOLO SENZA STRUMENTI.
 *
 * ── PERCHÉ ESISTE, AL POSTO DI `ToneColumn` (non accanto — v. sotto) ────────────────────────
 * Segnalato: « la scala deve essere possibile scroll, poiché l'auditor potrebbe aver bisogno
 * di dare i valori ed i nomi dei diversi toni al PC ». `ToneColumn` (condivisa con
 * EQUILIBRIUM) disegna apposta solo TREDICI nomi (`TONE_LABELS`) su un `<svg>` che si
 * RIDIMENSIONA per stare nello spazio dato — utile come lancetta/posizione, ma senza scroll e
 * senza gli altri quarantanove nomi della scala di Ron. Qui serve l'opposto: l'elenco INTERO
 * (`TONE_LEVELS`, gli stessi 62 già usati dal `<select>` di scelta del tono), leggibile riga
 * per riga, che scorre.
 *
 * ⚠️ UNA SOLA SCALA, NON DUE — segnalato con forza: « non va bene la scala del tono in
 * doppio... hai già il selettore dove fai vedere la scala, perché devi farne un secondo... NON
 * VOGLIO UNA SECONDA SCALA, è perturbante ». Il primo giro montava QUESTA lista ACCANTO a
 * `ToneColumn` e al `<select>` nativo — tre rappresentazioni della stessa cosa, a schermo
 * insieme. Corretto: dove serve la scelta (schermata "A CHE TONO SI TROVA?"), questo
 * componente SOSTITUISCE sia `ToneColumn` sia il `<select>` — prop `onScegli`, righe
 * cliccabili, `<button>` veri — non li affianca. Dove serve solo il riferimento (durante
 * "portalo a tono 40"), sostituisce `ToneColumn` da sola, senza `onScegli`. In nessun punto
 * compaiono insieme due scale.
 *
 * ⚠️ NÉ SCRITTA NÉ COLORE — segnalato ancora, dopo il primo giro:
 *   « togli SCORRI PER VEDERE... perché si sovrappone con la scelta della scala fatta »
 *     — la scritta era `position:sticky, bottom:0`, cioè un SECONDO elemento agganciato in
 *     fondo, proprio sotto quello (`bottoniCiclo`, in `Serenity.tsx`) reso sticky nel giro
 *     precedente per lo STESSO motivo: due "sticky bottom" annidati finiscono per accavallarsi.
 *     Tolta — un `title` sul contenitore basta a chi ha bisogno di saperlo, senza occupare
 *     spazio fisso permanente.
 *   « metti un ascensore laterale, si capisce » — al posto della scritta, una vera barra di
 *     scorrimento SEMPRE visibile (non quella "a comparsa al passaggio del mouse" di macOS):
 *     `::-webkit-scrollbar` con una larghezza e un colore propri, invece di lasciare al sistema
 *     operativo l'ultima parola su se e quando mostrarla.
 *   « il colore giallo non va bene perché non si vede la scritta... devi far passare in NERO
 *     il valore ed il nome del TONO » — il testo della riga evidenziata usava `var(--s-disc)`,
 *     un colore pensato per essere uno SFONDO translucido (`rgba(...,0.36..0.42)`), non un
 *     testo leggibile sopra un altro colore pieno — quasi invisibile sopra l'accento
 *     (`--s-tone-hue`). Ora un nero vero, fisso, in entrambi i temi.
 *
 * Nessuna logica di ciclo qui dentro: riceve `tone` (dove si è ADESSO, per evidenziare la
 * riga) e, se dato, `onScegli` (scrive la scelta) — il motore resta in `useToneCycle.ts`.
 */
export function ScalaTonoCompleta({ tone, lang, onScegli }: {
  /** Il tono ATTUALE, −40…+40: la riga più vicina si evidenzia. */
  tone: number;
  lang: string;
  /** Se presente, le righe diventano bottoni: cliccarne una sceglie quel tono — sostituisce
   *  il `<select>` nativo, non lo affianca. Assente → solo riferimento, righe non cliccabili
   *  (durante "portalo a tono 40": il tono è già scelto, non ha senso poterlo ritoccare qui). */
  onScegli?: (v: number) => void;
}) {
  const righeRef = useRef<Record<number, HTMLDivElement | HTMLButtonElement | null>>({});

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
    <>
      {/* Un vero "ascensore" laterale, sempre visibile — non quello a comparsa di macOS.
          Scoperto per classe, non inline: `::-webkit-scrollbar` non è uno stile che l'attributo
          `style` di React possa esprimere. */}
      <style>{`
        .s-scala-tono-scroll::-webkit-scrollbar { width: 9px; }
        .s-scala-tono-scroll::-webkit-scrollbar-track { background: transparent; }
        .s-scala-tono-scroll::-webkit-scrollbar-thumb {
          background: var(--s-ink-ghost); border-radius: 999px;
          border: 2px solid var(--s-disc); background-clip: padding-box;
        }
        .s-scala-tono-scroll::-webkit-scrollbar-thumb:hover { background: var(--s-ink-faint); }
      `}</style>
      <div className="s-scala-tono-scroll" title={onScegli
        ? undefined
        : 'scorri per vedere tutti i livelli / défile pour voir tous les niveaux / scroll to see every level'}
        style={{
          // ⚠️ v. la nota grande in testa al file — altezza già ridotta e ragionata in un
          // giro precedente («PistaCiclo»/sticky di `bottoniCiclo`), non toccata qui.
          width: '100%', maxHeight: 'min(130px, 16vh)', overflowY: 'auto',
          borderRadius: 10, border: '1px solid var(--s-ink-ghost)',
          background: 'var(--s-disc)', padding: '4px 0', pointerEvents: 'auto',
        }}>
        {TONE_LEVELS.map(l => {
          const vicino = l.tone === livelloVicino;
          const Tag = onScegli ? 'button' : 'div';
          return (
            <Tag key={l.tone}
              {...(onScegli ? { type: 'button', onClick: () => onScegli(l.tone) } : {})}
              ref={(el: HTMLDivElement | HTMLButtonElement | null) => { righeRef.current[l.tone] = el; }}
              style={{
                display: 'flex', gap: 10, alignItems: 'baseline', width: '100%',
                padding: '5px 12px', border: 'none',
                cursor: onScegli ? 'pointer' : 'default',
                background: vicino ? 'var(--s-tone-hue)' : 'transparent',
                opacity: vicino ? 1 : 0.85,
                fontFamily: 'inherit', textAlign: 'left',
              }}>
              <span style={{
                width: 48, flexShrink: 0, textAlign: 'right',
                fontFamily: 'var(--s-mono)', fontSize: 'var(--s-fs-sm)', fontWeight: 700,
                // ⚠️ NERO VERO — `var(--s-disc)` (di prima) è pensato per uno SFONDO
                // translucido, non per un testo sopra un colore pieno: quasi illeggibile
                // sopra l'accento. `#0b0f14` è lo stesso "nero" già usato altrove in
                // SERENITY per il testo su fondi chiari/accentati (v. `ToneColumn.tsx`).
                color: vicino ? '#0b0f14' : 'var(--s-ink-faint)',
              }}>
                {l.tone > 0 ? `+${l.tone}` : `${l.tone}`}
              </span>
              <span style={{
                fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-sm)',
                fontWeight: vicino ? 700 : 400,
                color: vicino ? '#0b0f14' : 'var(--s-ink-soft)',
              }}>
                {levelName(l.name, lang)}
              </span>
            </Tag>
          );
        })}
      </div>
    </>
  );
}
