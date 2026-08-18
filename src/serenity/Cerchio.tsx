/**
 * Cerchio — l'unico elemento di SERENITY.
 *
 * ── PERCHÉ UN CERCHIO E NON UN RIQUADRO ─────────────────────────────────────────────────────
 * Un riquadro chiede di essere LETTO: ha angoli, un bordo, un dentro e un fuori, e l'occhio ci
 * entra per capire cosa contiene. Un cerchio si coglie di sbieco — per dove sta, quanto è
 * grande, se è acceso o spento — senza staccare lo sguardo dal preclear. È tutta la dottrina di
 * SERENITY in una forma.
 *
 * ── COME SI VEDE ────────────────────────────────────────────────────────────────────────────
 * Ha una superficie appena diversa dal fondo e un'ombra bassa: si vede per RILIEVO, come si
 * vede un oggetto vero posato su un tavolo.
 *
 * ── SEGNALATO: IL VETRO DI EQUILIBRIUM ──────────────────────────────────────────────────────
 * « Les boutons de EQUILIBRIUM... bien plus jolis » + « reconstruit en liquid glass ». Un bordo
 * TORNA — non la cornice che questo file rifiutava (un contorno pieno da leggere), ma il
 * riflesso chiarissimo di un vetro vero (`.s-glass`, `tokens.css`), insieme alla sfocatura di
 * quel che sta dietro (`backdrop-filter`). Il rilievo (l'ombra, sotto) resta la stessa: il
 * vetro si aggiunge, non sostituisce la dottrina del cerchio.
 *
 * ── IL RESPIRO ──────────────────────────────────────────────────────────────────────────────
 * Quando è vivo il cerchio respira: dodici secondi per ciclo, un'ampiezza dell'un per cento.
 * Non è un ornamento — è il solo modo di dire « questa cosa è attiva » senza un pallino colorato
 * che lampeggia alla periferia del campo visivo. Talmente lento che a guardarlo fisso non si
 * vede muovere, e infatti non va guardato fisso.
 */

import type { CSSProperties, ReactNode } from 'react';

export interface CerchioProps {
  dimensione: number;
  children?: ReactNode;
  /** Scostamento dal centro, in pixel. I cerchi non stanno su una griglia: compaiono dove
   *  servono, e una griglia li farebbe leggere come un cruscotto. */
  x?: number;
  y?: number;
  /** Attivo: respira, e si stacca un po' di più dal fondo. */
  viva?: boolean;
  /** In attesa del suo compito — c'è il posto, non c'è ancora la cosa. Affondato invece che
   *  in rilievo: si vede che è previsto, e che adesso non dice niente. */
  spenta?: boolean;
  /** Sfasa il respiro. Quattro cerchi che pulsano all'unisono diventano un battito, cioè
   *  esattamente l'allarme periferico che si vuole evitare. */
  ritardo?: number;
  /** La « trasparenza » di CONFIG — in EQUILIBRIUM è il vetro dei pannelli, qui è quanto un
   *  cerchio si stacca dal fondo: la STESSA impostazione (`uiAlpha`, condivisa), tradotta nella
   *  lingua del rilievo invece che in quella del vetro. `undefined` = pieno, come sempre. */
  opacita?: number;
}

export function Cerchio({ dimensione, children, x = 0, y = 0, viva, spenta, ritardo = 0, opacita }: CerchioProps) {
  const stile: CSSProperties = {
    width: dimensione, height: dimensione, borderRadius: '50%',
    display: 'grid', placeItems: 'center',
    background: spenta ? 'var(--s-disc-sunk)' : 'var(--s-disc)',
    boxShadow: spenta ? 'none' : (viva ? 'var(--s-shadow-lift)' : 'var(--s-shadow)'),
    transition: 'box-shadow var(--s-calm) var(--s-ease), background var(--s-calm) var(--s-ease), opacity var(--s-slow) var(--s-ease)',
    ...(opacita !== undefined ? { opacity: opacita } : {}),
    ...(x || y ? {
      position: 'absolute' as const,
      transform: `translate(${x}px, ${y}px)`,
    } : {}),
    ...(viva ? { animation: `respiro 12s ${ritardo}ms var(--s-ease) infinite` } : {}),
  };
  // `spenta` non prende il vetro: un disco "previsto ma spento" deve leggersi affondato e
  // opaco, non luccicare come se fosse acceso — il riflesso apparterrebbe a un'informazione
  // che qui è deliberatamente assente.
  return <div className={spenta ? undefined : 's-glass'} style={stile}>{children}</div>;
}
