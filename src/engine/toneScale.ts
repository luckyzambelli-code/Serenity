/**
 * TONE SCALE — la vista della scala del tono di Ron (−40 … +40).
 *
 * LA PROCEDURA, nelle parole di Ron:
 *   1. « locating resistance »            → si trova dove sta la resistenza;
 *   2. « assessing positive or negative » → il SEGNO;
 *   3. « assess 10, 20, 30, or 40 »       → l'AMPIEZZA in divisioni;
 *   4. « mock-up the opposite until an as-isness happens ».
 *
 * ── CHI DECIDE, E QUANDO ────────────────────────────────────────────────────────────────────
 * Ron assessa perché lavora SENZA meter. Con l'ago, il punto 1 dà già un NUMERO: l'ago si posa
 * su una divisione, e segno e ampiezza si LEGGONO invece di indovinarli. Quindi:
 *
 *   con il meter   → la MISURA propone, l'assessment VERIFICA (conferma o smentisce);
 *   senza il meter → l'assessment è l'unica fonte, ed è necessario.
 *
 * In tutti e due i casi il valore che vale è quello che l'auditor ha VALIDATO, mai quello
 * calcolato: `origine` dice da dove viene, e una smentita non è un errore da nascondere ma il
 * dato più interessante che questa vista possa produrre.
 *
 * ── LA SCALA ────────────────────────────────────────────────────────────────────────────────
 * La mappa resistenza → tono NON è qui: sta in `impedanceMeter.ts` (`toneFromResistance`), dove
 * era già stata scritta per il CAN METER, ed è LINEARE NEGLI OHM — confermato da Ron, come lo
 * zero al centro dello strumento. Qui c'è solo quel che serve alla PROCEDURA.
 *
 * Puro TS, nessun React, nessuna DSP: si testa da solo.
 */

import { TONE_SCALE_MAX, TONE_STEP } from './tuning';
import { toneFromResistance } from './impedanceMeter';

/** Le quattro ampiezze che Ron assessa. Non sono un continuo: sono quattro. */
export const TONE_STEPS = [10, 20, 30, 40] as const;
export type ToneStep = typeof TONE_STEPS[number];

/** Il segno: −1 = negativo, +1 = positivo. Mai 0 — « nessuna carica » non è un segno. */
export type ToneSign = -1 | 1;

/** Le quattro fasi, nell'ordine di Ron. */
export type TonePhase = 'locate' | 'sign' | 'magnitude' | 'mockup' | 'done';

/** Da dove viene il valore in corso. Cambia quel che l'auditor deve fare, e va SCRITTO nel
 *  rapporto: un valore misurato e uno indovinato non valgono la stessa cosa. */
export type ToneOrigin = 'measured' | 'assessed';

export interface ToneCharge {
  sign: ToneSign;
  magnitude: ToneStep;
  origin: ToneOrigin;
}

/** Il valore firmato in divisioni: −40 … +40. */
export const chargeValue = (c: ToneCharge): number => c.sign * c.magnitude;

/** L'OPPOSTO da mock-uppare: stessa ampiezza, segno rovesciato. È tutto il punto 4 di Ron. */
export const oppositeOf = (c: ToneCharge): number => -chargeValue(c);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 1. LOCALIZZARE — dalla misura al numero
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** Limita al fondo scala. Fuori dai ±40 non c'è scala: c'è il bordo. */
export const clampTone = (t: number): number =>
  Math.max(-TONE_SCALE_MAX, Math.min(TONE_SCALE_MAX, t));

/**
 * Il TONO dagli OHM. Riesporta `toneFromResistance` col nome che ha in questa vista, così
 * chi legge la procedura non deve sapere che la formula abita nel meter delle lattine.
 */
export const toneFromOhm = toneFromResistance;

/**
 * Il TONO dal TONE ARM — strada PROVVISORIA per il THETA-METER, che dà un TA e non degli ohm.
 *
 * ⚠️ È LINEARE NEL TA, e Ron ha chiesto lineare negli OHM. Le due cose non coincidono: il legame
 * TA → ohm è curvo. Questa via serve a poter USARE la vista da subito; diventa esatta il giorno
 * che si tara il meter con due resistenze note (`solveThetaCalibration`, già scritta e non
 * ancora usata da nessuno). Finché è così, il numero va mostrato con un « ≈ ».
 *
 * VERSO: più resistenza = TA più alto = tono più NEGATIVO, come vuole Ron (−40 = resistenza
 * totale). Il centro della scala del meter cade sullo zero.
 */
export const toneFromTa = (ta: number, taMin: number, taMax: number): number => {
  const span = taMax - taMin;
  if (!(span > 0)) return 0;
  return clampTone(TONE_SCALE_MAX - 2 * TONE_SCALE_MAX * ((ta - taMin) / span));
};

/**
 * LA PROPOSTA: dal tono misurato alle due risposte che Ron assessa.
 *
 * L'ampiezza si arrotonda alla divisione PIÙ VICINA fra le quattro, non a quella sotto: un tono
 * di −38 è un −40 di cui manca poco, non un −30 abbondante. Sotto mezza divisione dallo zero non
 * si propone nulla — lì non c'è né segno né carica da mock-uppare.
 */
export const proposeFromTone = (tone: number): ToneCharge | null => {
  const t = clampTone(tone);
  if (Math.abs(t) < TONE_STEP / 2) return null;
  const sign: ToneSign = t < 0 ? -1 : 1;
  const a = Math.abs(t);
  let best: ToneStep = TONE_STEPS[0];
  for (const s of TONE_STEPS) if (Math.abs(a - s) < Math.abs(a - best)) best = s;
  return { sign, magnitude: best, origin: 'measured' };
};

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 2–3. ASSESSARE — e, quando c'è la misura, VERIFICARE
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** L'esito del confronto fra quel che l'ago diceva e quel che il PC ha confermato. */
export type ToneAgreement = 'confirmed' | 'sign_differs' | 'magnitude_differs' | 'both_differ';

/**
 * Confronta la proposta con la validazione. `null` quando non c'era proposta: senza meter non
 * si verifica nulla, si assessa e basta — e va detto, non finto.
 */
export const agreementOf = (
  proposed: ToneCharge | null, validated: ToneCharge,
): ToneAgreement | null => {
  if (!proposed) return null;
  const s = proposed.sign === validated.sign;
  const m = proposed.magnitude === validated.magnitude;
  return s && m ? 'confirmed' : s ? 'magnitude_differs' : m ? 'sign_differs' : 'both_differ';
};

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 4. MOCK-UP DELL'OPPOSTO — quanto manca allo zero
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * Quanta strada è stata fatta verso lo zero, 0 → 1.
 *
 * Si misura sul TONO CORRENTE rispetto a quello di partenza, non sul tempo: Ron dice « until an
 * as-isness happens », e l'as-isness è che la resistenza non c'è più. Senza meter resta a 0 e la
 * barra non compare — non si inventa un avanzamento che nessuno sta misurando.
 *
 * Non è mai negativa: se il tono si allontana dallo zero, l'avanzamento è nullo, non « meno di
 * nulla ». Un allontanamento è un fatto da leggere sull'ago, non da scrivere in una barra.
 */
export const mockupProgress = (toneAtStart: number, toneNow: number): number => {
  const start = Math.abs(clampTone(toneAtStart));
  if (start < 1e-9) return 1;
  const now = Math.abs(clampTone(toneNow));
  return Math.max(0, Math.min(1, (start - now) / start));
};

/** L'as-isness della scala: la resistenza è arrivata allo zero. La SOGLIA è di presentazione —
 *  chi valida resta l'auditor, come nel ciclo CONTACT. */
export const reachedZero = (toneNow: number, eps = TONE_STEP / 2): boolean =>
  Math.abs(clampTone(toneNow)) < eps;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// GEOMETRIA DEL QUADRANTE
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** Tono −40..+40 → offset −1..+1 del quadrante (stessa geometria di ClearDial/MirrorDial).
 *  −40 a sinistra, +40 a destra: la resistenza totale sta dove l'ago non torna più. */
export const toneOffset = (tone: number): number => clampTone(tone) / TONE_SCALE_MAX;
