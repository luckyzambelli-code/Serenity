import { useEffect, useRef } from 'react';
import { TONE_LEVELS, levelName } from '../engine/toneLevels';
import { pick5 } from '../i18n5';

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
    <div style={{
      // ⚠️ CORRETTO — segnalato: « ora la scala nasconde i bottoni del ciclo TONE ». Questa
      // lista vive in un `<div>` a colonna NORMALE (non assoluto) insieme al titolo,
      // all'istruzione, all'item e — SUBITO SOTTO — ai bottoni del ciclo
      // ("portalo a tono 40"/"raggiunto"/"altra resistenza"): tutti fratelli nello stesso
      // flusso. `maxHeight:300` fisso (diventato l'UNICA scala, prima condivideva lo spazio
      // con `ToneColumn`) spingeva quel totale oltre l'altezza vera del contenitore che lo
      // ospita (`maxHeight:'100%', overflowY:'auto'` — v. `Serenity.tsx`), e sullo schermo
      // reale dell'utente i bottoni finivano sotto il bordo, senza scrollbar visibile a
      // dirlo — la stessa identica famiglia di bug già descritta altrove in questo file per
      // `PistaCiclo` (« sembrava sparita »).
      //
      // ⚠️ RIDOTTA ANCORA — verificato dal vivo dopo il primo taglio (190px): nella schermata
      // "PORTALO A TONO 40" (più affollata di quella di scelta: titolo + citazione + item +
      // scala, prima dei bottoni) i bottoni restavano appena sotto il bordo anche a
      // finestra realistica (1280×800). `min(130px, 16vh)`: la lista mostra comunque 4-5
      // righe subito, e resta scorrevole per le altre 57 — non è la sua taglia a dover
      // garantire la lettura di ogni nome, è lo scorrimento (il motivo per cui esiste).
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
          </Tag>
        );
      })}
      <div style={{
        position: 'sticky', bottom: 0, textAlign: 'center', padding: '3px 0',
        fontFamily: 'var(--s-sans)', fontSize: 'var(--s-fs-micro)', letterSpacing: '0.06em',
        color: 'var(--s-ink-faint)', background: 'var(--s-disc)',
        borderTop: '1px solid var(--s-ink-ghost)',
      }}>
        {onScegli
          ? pick5(lang, 'scorri e tocca il livello giusto', 'défile et touche le bon niveau',
              'scroll and tap the right level', 'desplázate y toca el nivel correcto',
              'skrolla och tryck på rätt nivå')
          : pick5(lang, 'scorri per vedere tutti i livelli', 'défile pour voir tous les niveaux',
              'scroll to see every level', 'desplázate para ver todos los niveles',
              'skrolla för att se alla nivåer')}
      </div>
    </div>
  );
}
