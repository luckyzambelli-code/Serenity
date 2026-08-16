/**
 * LA GEOMETRIA DEL QUADRANTE — dove sta l'ago, per un dato valore.
 *
 * ── PERCHÉ ESISTE ───────────────────────────────────────────────────────────────────────────
 * Fase 5 della refonte: SERENITY disegna lo stesso ago di EQUILIBRIUM, in un altro linguaggio.
 * « Un altro linguaggio » vuol dire altri colori, altri spessori, un'altra grandezza — NON un
 * altro angolo. Se un blow-down cadesse di 40° di là e di 45° di qua, le due applicazioni
 * direbbero due cose diverse dello stesso preclear, e sarebbero due strumenti.
 *
 * Quindi l'angolo si calcola in UN posto solo, e le due superfici lo chiedono qui.
 *
 * ── COSA NON STA QUI ────────────────────────────────────────────────────────────────────────
 * Il RAGGIO. Quanto è grande il quadrante è una scelta di superficie — dipende dallo schermo,
 * dalla finestra, da cosa c'è intorno — e ognuna delle due la fa per sé. Le funzioni prendono
 * quindi il raggio da fuori: la stessa geometria, disegnata grande o piccola.
 *
 * E non ci sta il MOVIMENTO. Come l'ago raggiunge la sua posizione — la molla, l'inerzia, il
 * ritorno — è del motore dell'ago, che è già suo e non si tocca.
 *
 * ⚠️ NESSUN NUMERO QUI DENTRO VA CAMBIATO per far stare meglio un disegno. Le ampiezze delle
 * reazioni sono tarate su questi angoli: cambiarli vorrebbe dire ritarare SF, FALL, LONG FALL
 * e BLOW DOWN — cioè cambiare cosa l'applicazione chiama reazione.
 */

import { NEEDLE_REST_OFFSET } from './tuning';

/**
 * MEZZA APERTURA DELL'ARCO, in gradi. 67,5 → 135° in tutto, cioè il 75% di un semicerchio.
 *
 * Un quadrante da 180° metterebbe gli estremi ORIZZONTALI, dove un ago si legge male: vicino
 * all'orizzontale una grande differenza di valore muove pochissimo la punta sullo schermo, ed è
 * esattamente dove stanno le reazioni più grandi.
 */
export const SWEEP_DEG = 67.5;

/**
 * DOVE RIPOSA L'AGO — « SET », a sinistra del centro.
 *
 * Non è al centro perché la scala non è simmetrica: da SET si CADE (verso destra) per tutta la
 * corsa delle reazioni, mentre a sinistra resta appena il posto per una risalita. Un ago posato
 * al centro sprecherebbe metà quadrante in una direzione che quasi non si usa.
 *
 * ⚠️ Viene da `tuning.ts`, dove sta la taratura vera: `QuantumSphere` se ne teneva una copia
 * (`SET_OFFSET = -0.35`) e le due potevano scostarsi senza che nessuno se ne accorgesse.
 */
export const SET_OFFSET = NEEDLE_REST_OFFSET;

/** L'ago non esce dal quadrante: gli estremi sono gli estremi. */
export const clampOffset = (offset: number): number => Math.max(-1, Math.min(1, offset));

/**
 * VALORE → ANGOLO, in gradi, misurati come li misura la trigonometria (0° = destra, in su).
 *
 * 90° è la verticale, cioè il centro del quadrante. Un offset POSITIVO fa scendere l'angolo:
 * a destra si cade, ed è il verso della caduta su un meter vero.
 */
export const off2ang = (offset: number): number => 90 - offset * SWEEP_DEG;

/** ANGOLO → VALORE: la strada inversa, per chi legge una posizione sullo schermo. */
export const ang2off = (angleDeg: number): number => (90 - angleDeg) / SWEEP_DEG;

/** Un punto del quadrante, dato il valore e il raggio. Il perno è l'origine: chi disegna lo
 *  sposta dove vuole. `y` cresce verso il BASSO, come su uno schermo. */
export function puntoDial(offset: number, raggio: number): { x: number; y: number } {
  const a = off2ang(offset) * Math.PI / 180;
  return { x: raggio * Math.cos(a), y: -raggio * Math.sin(a) };
}

/**
 * Il tratto d'arco fra due valori, in coordinate SVG relative al perno.
 *
 * ⚠️ `sweepFlag` è 1 perché gli angoli CALANO al crescere dell'offset: con 0 l'arco andrebbe
 * dalla parte lunga e si vedrebbe un cerchio quasi intero al posto di un tratto.
 */
export function arcoDial(daOffset: number, aOffset: number, raggio: number): string {
  const p1 = puntoDial(daOffset, raggio);
  const p2 = puntoDial(aOffset, raggio);
  const grande = Math.abs(off2ang(daOffset) - off2ang(aOffset)) > 180 ? 1 : 0;
  return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${raggio} ${raggio} 0 ${grande} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
}
