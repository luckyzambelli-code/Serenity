import React from 'react';
import type { SessionMode } from '../engine/sessionMode';
import type { SessionPhase } from '../engine/sessionPhase';
import { pick5 } from '../i18n5';

/**
 * ItemDaScrivere — L'ITEM (O LA RESISTENZA, IN TONE) SI SCRIVE, NON SOLO SI DICE.
 *
 * ── PERCHÉ ESISTE A SÉ ───────────────────────────────────────────────────────────────────────
 * Era il primo blocco di `PistaCiclo` (l'`<input>` + « dì l'item…/l'ho detta »), inline lì
 * dentro — bene finché lo strumento c'è (`PistaCiclo` monta solo `!senzaMisura`). Segnalato:
 * « SANS INSTRUMENT il faut avoir la possibilité d'écrire l'item dans les Cycles, comme quand
 * on a les instruments ». Vero — senza strumenti l'overlay "grande" (`Serenity.tsx`, il blocco
 * `senzaMisura && aperta`) non montava MAI `PistaCiclo` (niente arco da affiancare), quindi
 * l'unico modo di dare un item era la voce o il campo separato "R&I · Manuel"/ASSESSMENT — un
 * gradino più lontano di un `<input>` proprio nel testo che si sta già leggendo. Estratto qui
 * per essere montato in DUE posti — dentro `PistaCiclo` (invariato) e nell'overlay senza
 * strumenti (nuovo) — senza tenere due copie della stessa logica (`diItem`, il testo "dì
 * l'item…"/"la resistenza…", il calcolo della larghezza).
 *
 * `setItem`/`item` restano gli STESSI di `Serenity.tsx` — scriverlo qui vale quanto dirlo a
 * voce, per il motore (`useContactNullCycle`/`useMirrorCycle`/`useToneCycle`) è la stessa
 * variabile, letta allo stesso modo qualunque sia la sua origine.
 */
export function ItemDaScrivere({ mode, phase, lang, item, setItem, itemPlaceholder, onDichiaraDetto, grande }: {
  mode: SessionMode;
  phase: SessionPhase;
  lang: string;
  /** L'item dato per questo ciclo — stringa vuota se non ancora dato. */
  item: string;
  /** Scrive l'item (o la resistenza, in TONE) — lo stesso `setItem` di `Serenity.tsx`, la
   *  STESSA variabile che la voce riempie: scriverlo qui vale quanto dirlo a voce. */
  setItem: (v: string) => void;
  /** Il segnaposto da mostrare al posto dell'item, finché non è stato dato. */
  itemPlaceholder: string;
  /** Dichiara l'item (o la resistenza, in TONE) detto — chiama `dichiaraItemDetto`, il motore,
   *  invariato: qui solo la resa di « dì l'item… »/« l'ho detta ». */
  onDichiaraDetto: () => void;
  /** ⚠️ SOLO per l'overlay SENZA STRUMENTI — segnalato in un giro precedente: « i comandi dei
   *  cicli scrivili più grandi per rendere facile la lettura dell'auditor ». `PistaCiclo` (con
   *  strumenti) non lo passa: la sua taglia resta quella di sempre. */
  grande?: boolean;
}) {
  const L = (it: string, fr: string, en: string, es: string, sv: string) => pick5(lang, it, fr, en, es, sv);
  // Stessa condizione dei tre punti di chiamata tolti dalla barra comandi (v. la nota storica
  // in `PistaCiclo.tsx`): armato, ma l'item (la resistenza, in TONE) non è ancora stato dato
  // a voce o dichiarato a mano.
  const diItem = phase === 'tone.say_item' || phase === 'mirror.say_item'
    || phase === 'contact.say_item' || phase === 'null.say_item' || phase === 'truth.say_ri';
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center',
      gap: grande ? 14 : 10,
    }}>
      <input
        value={item}
        onChange={e => setItem(e.target.value)}
        placeholder={itemPlaceholder}
        onKeyDown={e => {
          if (e.key === 'Enter' && diItem) onDichiaraDetto();
        }}
        style={{
          fontFamily: 'var(--s-serif)', fontSize: grande ? 'var(--s-fs-xl)' : 'var(--s-fs-lg)',
          color: 'var(--s-ink)', textAlign: grande ? 'center' : 'left',
          padding: '0 10px', border: 'none', borderBottom: '1px solid var(--s-ink-ghost)',
          background: 'none', outline: 'none',
          // ⚠️ ×1.6, non `1ch` — v. la nota storica in `PistaCiclo.tsx`: `--s-serif` non è
          // monospazio, `1ch` sottostimerebbe lo spazio vero e taglierebbe l'item ai bordi.
          flexShrink: 0, width: `${Math.max(9, (item || itemPlaceholder).length * 1.6)}ch`,
        }}
      />
      {diItem && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, pointerEvents: 'auto', flexShrink: 0 }}>
          <span className="ser-pulse" style={{
            fontFamily: 'var(--s-sans)', fontSize: grande ? 'var(--s-fs-lg)' : 'var(--s-fs-base)',
            letterSpacing: '0.04em', color: 'var(--s-reserve)',
          }}>
            {mode === 'tone'
              ? L('dì la resistenza…', 'dis la résistance…', 'say the resistance…', 'di la resistencia…', 'säg motståndet…')
              : L('dì l\'item…', 'dis l\'item…', 'say the item…', 'di el ítem…', 'säg item…')}
          </span>
          <button type="button" className="s-glass s-glass-btn" onClick={onDichiaraDetto}
            title={L('la trascrizione non c\'è o non si sente — dichiara che è stato detto',
              'pas de transcription ou pas de son — déclare que c\'est dit',
              'no transcript or no sound — declare it has been said',
              'sin transcripción o sin sonido — declara que se ha dicho',
              'ingen transkription eller inget ljud — förklara att det har sagts') as string}
            style={{
              cursor: 'pointer', borderRadius: 999, padding: '5px 14px', background: 'var(--s-disc)',
              fontFamily: 'var(--s-sans)', fontSize: grande ? 17 : 15, color: 'var(--s-ink-faint)', border: 'none',
              whiteSpace: 'nowrap',
            }}>
            {mode === 'tone'
              ? L('l\'ho detta', 'je l\'ai dite', 'said it', 'la he dicho', 'sa det')
              : L('l\'item è stato detto', 'l\'item a été dit', 'the item has been said', 'el ítem ha sido dicho', 'item har sagts')}
          </button>
        </div>
      )}
    </div>
  );
}
