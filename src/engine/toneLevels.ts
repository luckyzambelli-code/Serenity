/**
 * toneLevels — LA SCALA DEL TONO DI RON, coi nomi dei livelli.
 *
 * ── PERCHÉ ARRIVA SOLO ADESSO ───────────────────────────────────────────────────────────────
 * `impedanceMeter.ts` diceva: « Ron ne indica il numero ma non le nomina, e non è compito
 * nostro inventarle ». Restava vero finché la tabella non c'era. Ora c'è, data dall'utente, e
 * i nomi sono i suoi — non una ricostruzione.
 *
 * ── DUE DENSITÀ, E SERVONO ENTRAMBE ─────────────────────────────────────────────────────────
 * La scala è FITTA in basso e RADA in alto: fra 0 e 4 ci sono venticinque livelli, fra 20 e 40
 * ce ne sono tre. Su un asse lineare −40…+40 le emozioni nominate starebbero quasi tutte
 * schiacciate nel 5% della colonna, e il resto sarebbe vuoto.
 *
 * Da qui due elenchi, che rispondono a due domande diverse:
 *   • `TONE_LEVELS`  — TUTTI i livelli. Serve a dire COME SI CHIAMA il punto in cui si è
 *     (« ≈ 1,5 · ANGER »): è testo accanto al cursore, quindi l'affollamento non lo tocca.
 *   • `TONE_LABELS`  — i diciotto che si scrivono SULLA colonna. Sono scelti dall'utente, non
 *     campionati a caso: coprono la scala senza sovrapporsi.
 *
 * ── I DOPPIONI SONO VOLUTI ──────────────────────────────────────────────────────────────────
 * Sympathy sta a 9,0 e a 0,9; Grief a 5,0 e a 0,5; Making Amends a 3,75 e a 0,375. Sono nella
 * scala di Ron così come li ha dati l'utente — la banda alta e la sua eco un decimo più in
 * basso — e non si deduplicano: sarebbero due stati diversi con lo stesso nome, ed è la scala
 * a volerlo.
 *
 * Puro TS, nessun React: si prova da solo.
 */

import { TONE_SCALE_MAX } from './tuning';

export interface ToneLevel {
  /** Il valore sulla scala −40 … +40. */
  tone: number;
  /** Il nome dello stato, nella lingua di Ron. NON si traduce: sono termini tecnici, come
   *  AS-IS, F/N e VGI's, che restano in inglese in tutte e cinque le lingue. */
  name: string;
}

/** La scala INTERA, dal più alto al più basso. */
export const TONE_LEVELS: readonly ToneLevel[] = [
  { tone:  40.0,  name: 'Serenity of Beingness' },
  { tone:  30.0,  name: 'Postulates' },
  { tone:  22.0,  name: 'Games' },
  { tone:  20.0,  name: 'Action' },
  { tone:   9.0,  name: 'Sympathy' },
  { tone:   8.0,  name: 'Exhilaration / Proportion' },
  { tone:   6.0,  name: 'Aesthetic' },
  { tone:   5.0,  name: 'Grief' },
  { tone:   4.0,  name: 'Enthusiasm' },
  { tone:   3.75, name: 'Making Amends' },
  { tone:   3.5,  name: 'Cheerfulness' },
  { tone:   3.3,  name: 'Strong Interest' },
  { tone:   3.0,  name: 'Conservatism' },
  { tone:   2.9,  name: 'Mild Interest' },
  { tone:   2.8,  name: 'Contented' },
  { tone:   2.6,  name: 'Disinterested' },
  { tone:   2.5,  name: 'Boredom' },
  { tone:   2.4,  name: 'Monotony' },
  { tone:   2.0,  name: 'Antagonism' },
  { tone:   1.9,  name: 'Hostility' },
  { tone:   1.8,  name: 'Pain' },
  { tone:   1.5,  name: 'Anger' },
  { tone:   1.4,  name: 'Hate' },
  { tone:   1.3,  name: 'Resentment' },
  { tone:   1.2,  name: 'No Sympathy' },
  { tone:   1.15, name: 'Unexpressed Resentment' },
  { tone:   1.1,  name: 'Covert Hostility' },
  { tone:   1.02, name: 'Anxiety' },
  { tone:   1.0,  name: 'Fear' },
  { tone:   0.98, name: 'Despair' },
  { tone:   0.96, name: 'Terror' },
  { tone:   0.94, name: 'Numb' },
  { tone:   0.9,  name: 'Sympathy' },
  { tone:   0.8,  name: 'Propitiation' },
  { tone:   0.5,  name: 'Grief' },
  { tone:   0.375,name: 'Making Amends' },
  { tone:   0.3,  name: 'Undeserving' },
  { tone:   0.2,  name: 'Self-abasement' },
  { tone:   0.1,  name: 'Victim' },
  { tone:   0.07, name: 'Hopeless' },
  { tone:   0.05, name: 'Apathy' },
  { tone:   0.03, name: 'Useless' },
  { tone:   0.01, name: 'Dying' },
  { tone:   0.0,  name: 'Body Death' },
  { tone:  -0.01, name: 'Failure' },
  { tone:  -0.1,  name: 'Pity' },
  { tone:  -0.2,  name: 'Shame' },
  { tone:  -0.7,  name: 'Accountable' },
  { tone:  -1.0,  name: 'Blame' },
  { tone:  -1.3,  name: 'Regret' },
  { tone:  -1.5,  name: 'Controlling Bodies' },
  { tone:  -2.2,  name: 'Protecting Bodies' },
  { tone:  -3.0,  name: 'Owning Bodies' },
  { tone:  -3.5,  name: 'Approval from Bodies' },
  { tone:  -4.0,  name: 'Needing Bodies' },
  { tone:  -5.0,  name: 'Worshiping Bodies' },
  { tone:  -6.0,  name: 'Sacrifice' },
  { tone:  -8.0,  name: 'Hiding' },
  { tone: -10.0,  name: 'Being Objects' },
  { tone: -20.0,  name: 'Being Nothing' },
  { tone: -30.0,  name: "Can't Hide" },
  { tone: -40.0,  name: 'Total Failure' },
] as const;

/**
 * I livelli che si SCRIVONO sulla colonna — scelti dall'utente perché coprano la scala senza
 * accavallarsi. Gli altri restano leggibili dal cursore, che ne dice il nome per esteso.
 */
export const TONE_LABELS: readonly number[] =
  [40, 30, 20, 9, 4, 3, 2, 1.5, 1, 0, -1, -1.5, -3, -6, -10, -20, -30, -40] as const;

/**
 * Le tacche degli OTTO SEGMENTI: ogni multiplo di dieci, da −40 a +40. Nove tacche, otto
 * intervalli — la struttura che Ron indica per il quadrante.
 */
export const TONE_DECADES: readonly number[] = [-40, -30, -20, -10, 0, 10, 20, 30, 40] as const;

/**
 * POSIZIONE sulla colonna, 0 = fondo (−40) … 1 = cima (+40).
 *
 * Sta qui e non nel componente perché è la CORRISPONDENZA su cui poggia tutto il disegno:
 * `tono = 40 − 80·(R/R_totale)`, quindi resistenza che scende = tono che sale, e una caduta
 * dell'ago è resistenza che scende. Ago verso destra e colonna verso l'alto sono lo stesso
 * evento. Una funzione pura si prova; una moltiplicazione dentro un SVG no.
 */
export const tonePosition = (tone: number): number => {
  const t = Math.max(-TONE_SCALE_MAX, Math.min(TONE_SCALE_MAX, tone));
  return (t + TONE_SCALE_MAX) / (2 * TONE_SCALE_MAX);
};

/**
 * Il livello in cui ci si trova: il più alto fra quelli RAGGIUNTI, cioè il primo `tone` minore
 * o uguale al valore.
 *
 * ── PERCHÉ « RAGGIUNTO » E NON « PIÙ VICINO » ───────────────────────────────────────────────
 * A 1,6 il più vicino sarebbe Pain (1,8), ma il preclear a Pain non ci è arrivato: è sopra
 * Anger (1,5) e sotto Pain. Dire « Pain » lo collocherebbe in uno stato che non ha ancora
 * toccato — ed è il verso che conta, perché tutto il metodo consiste nel SALIRE.
 */
export function levelAt(tone: number): ToneLevel {
  const t = Math.max(-TONE_SCALE_MAX, Math.min(TONE_SCALE_MAX, tone));
  for (const l of TONE_LEVELS) if (t >= l.tone) return l;
  return TONE_LEVELS[TONE_LEVELS.length - 1];   // sotto −40: fondo scala
}

/** Il nome del livello raggiunto — scorciatoia per chi vuole solo la scritta. */
export const levelNameAt = (tone: number): string => levelAt(tone).name;

/** Il nome scritto accanto a una tacca della colonna, se quel valore ne ha uno esatto. */
export const exactLevelName = (tone: number): string | undefined =>
  TONE_LEVELS.find(l => Math.abs(l.tone - tone) < 1e-9)?.name;
