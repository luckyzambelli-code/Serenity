/**
 * L'AGO — il Meter al centro di SERENITY.
 *
 * ── STESSA GEOMETRIA, ALTRA SUPERFICIE ──────────────────────────────────────────────────────
 * Gli angoli vengono da `engine/dialGeometry`, gli STESSI che usa `QuantumSphere`: una caduta
 * di una certa ampiezza fa lo stesso angolo nelle due applicazioni. Quello che cambia qui è
 * come si vede, non dove va.
 *
 *   EQUILIBRIUM — arco spesso su fondo nero, bande colorate per stato, scia luminosa dietro
 *                 la punta, colori che dicono la fase della carica.
 *   SERENITY    — un arco sottile inciso nella superficie chiara, l'ago scuro e magro, e
 *                 nient'altro. Il colore compare SOLO quando c'è qualcosa da dire.
 *
 * ── PERCHÉ COSÌ POCO ────────────────────────────────────────────────────────────────────────
 * In seduta l'auditor guarda IL PRECLEAR, e l'ago con la coda dell'occhio. Quel che si coglie
 * di sbieco è il MOVIMENTO di una linea scura su un fondo chiaro — non una tinta, non una
 * scritta, non una scia. Tutto ciò che si aggiunge intorno alla punta ruba l'attenzione al
 * movimento, cioè alla sola cosa che conta.
 *
 * ⚠️ NESSUNA LOGICA DI LETTURA QUI DENTRO. Che cosa sia una fall, quando è un F/N, quanto vale
 * il TA: tutto in `engine/` e in `hooks/useThetaMeter`, condivisi. Questo file riceve un numero
 * fra −1 e +1 e lo disegna.
 *
 * @see docs/refonte-fasi.md — fase 5.
 */

import { SET_OFFSET, clampOffset, puntoDial, arcoDial } from '../engine/dialGeometry';

/** Il quadrante in coordinate sue: il perno all'origine, il raggio in unità di disegno.
 *  Chi lo mette in pagina decide quanto è grande — la geometria non cambia. */
const R = 100;
const R_INTERNO = 84;

export interface AgoProps {
  /** Dove sta l'ago, da −1 a +1. Fuori da lì non esiste: il quadrante finisce. */
  offset: number;
  /** L'ago sta reagendo — l'unico momento in cui il colore compare. */
  vivo?: boolean;
  /** FLOATING NEEDLE: l'ago spazza. Non è una posizione, è una FORMA nel tempo, e si dice
   *  con la quiete — non con un allarme. */
  fn?: boolean;
  /** Il TA, se il meter è tarato. `null` = nessun numero, che è meglio di un numero inventato. */
  ta?: number | null;
  /** Larghezza in pixel del disegno. L'altezza discende dalla geometria. */
  larghezza?: number;
}

export function Ago({ offset, vivo, fn, ta, larghezza = 460 }: AgoProps) {
  const o = clampOffset(offset);
  const punta = puntoDial(o, R);
  const attacco = puntoDial(o, R * 0.12);

  // Il riquadro tiene l'arco intero più un margine per la punta e per il numero sotto.
  const vb = { x: -R - 8, y: -R - 8, w: 2 * (R + 8), h: R + 46 };

  return (
    <svg
      width={larghezza}
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      style={{ display: 'block', overflow: 'visible' }}
      aria-hidden
    >
      {/* ── IL QUADRANTE ─────────────────────────────────────────────────────────────────
          Due archi sottilissimi, dello stesso grigio del fondo appena più scuro: incisi,
          non disegnati. Devono dire DOVE finisce la corsa senza farsi guardare. */}
      <path d={arcoDial(-1, 1, R)} fill="none"
            stroke="var(--s-ink-ghost)" strokeWidth={1} strokeLinecap="round" />
      <path d={arcoDial(-1, 1, R_INTERNO)} fill="none"
            stroke="var(--s-ink-ghost)" strokeWidth={0.6} strokeLinecap="round" opacity={0.55} />

      {/* ── IL SEGNO DI SET ──────────────────────────────────────────────────────────────
          Dove l'ago riposa. È l'unico riferimento fisso del quadrante: senza, una posizione
          non vuol dire niente — « caduto » si dice rispetto a qualcosa. */}
      <line
        x1={puntoDial(SET_OFFSET, R_INTERNO - 5).x} y1={puntoDial(SET_OFFSET, R_INTERNO - 5).y}
        x2={puntoDial(SET_OFFSET, R + 5).x}         y2={puntoDial(SET_OFFSET, R + 5).y}
        stroke="var(--s-ink-faint)" strokeWidth={1.2} strokeLinecap="round"
      />

      {/* ── L'AGO ────────────────────────────────────────────────────────────────────────
          Una linea sola, scura, che parte poco fuori dal perno: un ago che nasce dal centro
          esatto fa una macchia dove le linee si incrociano.
          ⚠️ NESSUNA TRANSIZIONE CSS. Il movimento dell'ago viene dal motore, che ha la sua
          molla tarata: una transizione qui ne aggiungerebbe una seconda sopra, e l'ago
          arriverebbe in ritardo su ogni reazione — cioè mentirebbe sul tempo. */}
      <line
        x1={attacco.x} y1={attacco.y} x2={punta.x} y2={punta.y}
        stroke={vivo ? 'var(--s-alive)' : 'var(--s-ink)'}
        strokeWidth={1.8} strokeLinecap="round"
      />
      <circle cx={0} cy={0} r={3.2} fill="var(--s-ink)" />

      {/* ── L'F/N ────────────────────────────────────────────────────────────────────────
          Si dice con un alone di QUIETE dietro l'arco, non con una spia. Un floating needle
          è la fine di qualcosa: annunciarlo con un lampo sarebbe dire il contrario di quel
          che è. */}
      {fn && (
        <path d={arcoDial(-1, 1, R)} fill="none"
              stroke="var(--s-still)" strokeWidth={7} strokeLinecap="round" opacity={0.22} />
      )}

      {/* ── IL TA ────────────────────────────────────────────────────────────────────────
          Sotto il perno, in cifre a larghezza fissa così non balla mentre cambia. È l'UNICA
          cosa qui dentro che si legge davvero, e per questo è la sola col nero pieno. */}
      {ta !== null && ta !== undefined && (
        <text x={0} y={30} textAnchor="middle"
              style={{ fontFamily: 'var(--s-mono)', fontSize: 17, fill: 'var(--s-ink)',
                       fontVariantNumeric: 'tabular-nums' }}>
          {ta.toFixed(2)}
        </text>
      )}
    </svg>
  );
}
