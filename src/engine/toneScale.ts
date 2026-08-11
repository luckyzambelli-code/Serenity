/**
 * TONE SCALE — la vista della scala del tono di Ron (−40 … +40).
 *
 * LA PROCEDURA, nelle parole di Ron — DUE COMANDI, non quattro tempi:
 *   a. « Locate resistance on your case that can now be run. »
 *   b. « Raise this to tone forty on the tone scale. »
 *      — chiesto RIPETUTAMENTE, « until there is no reaction and the PC reaches serenity of
 *      beingness ».
 *
 * ⚠️ QUEL CHE C'ERA PRIMA. Fino alla 2.0.115 il ciclo aveva quattro tempi: si assessava il
 * SEGNO (positivo/negativo) e l'AMPIEZZA (10/20/30/40), e il quarto tempo faceva mock-uppare
 * l'OPPOSTO fino allo zero. Non è la procedura: i comandi sono due, e la meta è +40 per tutti.
 * Segno, ampiezza e mock-up dell'opposto sono usciti — con la « smentita dell'ago », che
 * esisteva solo per verificare l'assessment.
 *
 * ── DA DOVE VIENE IL NUMERO ─────────────────────────────────────────────────────────────────
 * Il tono di PARTENZA lo dà la misura, quando c'è un meter: l'ago si posa su una divisione e la
 * si legge. Senza meter non c'è numero, e non se ne inventa uno — il ciclo funziona lo stesso,
 * perché la meta è +40 comunque, e chi dice che ci si è arrivati è l'auditor.
 *
 * ── LA SCALA ────────────────────────────────────────────────────────────────────────────────
 * La mappa resistenza → tono NON è qui: sta in `impedanceMeter.ts` (`toneFromResistance`), dove
 * era già stata scritta per il CAN METER, ed è LINEARE NEGLI OHM — confermato da Ron, come lo
 * zero al centro dello strumento. Qui c'è solo quel che serve alla PROCEDURA.
 *
 * Puro TS, nessun React, nessuna DSP: si testa da solo.
 */

import { TONE_SCALE_MAX, TONE_STEP, TONE_LOOKBACK_S, TONE_LOCATE_RISE_RATIO } from './tuning';
import { toneFromResistance } from './impedanceMeter';

/** I due tempi del ciclo, uno per comando, più il compiuto. */
export type TonePhase = 'locate' | 'raise' | 'done';

/** LA META, per tutte le resistenze: tono quaranta. Non dipende da dove si è partiti. */
export const TONE_TARGET = TONE_SCALE_MAX;

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
 * Il TONO dal TONE ARM.
 *
 * ── ⚠️ IL TONO 40 È IL TA DI CLEAR, NON LA RESISTENZA ZERO ─────────────────────────────────
 * Era ancorato al fondo scala dello strumento: TA 0 → tono +40, TA 6,5 → −40. Sbagliato, e in
 * un modo che rendeva la scala inservibile — segnalato: « le TA homme est de 3.0 et pour la
 * femme 2.0 en lecture CLAIR. Donc on n'est jamais à 0 pour atteindre le ton 40 ».
 *
 * La resistenza di un corpo non va a zero: il TA 0 non lo raggiunge nessuno, mai. Ancorandoci il
 * tono 40, il tono 40 diventava irraggiungibile per costruzione — e un uomo CLEAR, a TA 3,0,
 * compariva a +3 « Conservatorismo » invece che in cima alla scala.
 *
 * Il riferimento alto è la LETTURA DI CLEAR: TA 3,0 per l'uomo, 2,0 per la donna — la base
 * costituzionale che l'app conosce già (`pcSex`). Quello è il tono 40. Il fondo scala dello
 * strumento resta il −40: è la resistenza che non si scioglie.
 *
 * ⚠️ SOTTO il TA di clear si è OLTRE il 40: si limita alla cima. « Più pulito di clear » non è
 * un punto della scala di Ron, è la scala che finisce lì.
 *
 * Resta LINEARE NEL TA mentre Ron chiede lineare negli OHM: il legame TA → ohm è curvo, e
 * questa via diventerà esatta il giorno che si tara il meter con due resistenze note
 * (`solveThetaCalibration`). Finché è così, il numero si mostra con un « ≈ ».
 *
 * @param ta       il tone arm letto
 * @param taClear  il TA di CLEAR di questa persona (3,0 uomo · 2,0 donna) → tono +40
 * @param taMax    il fondo scala dello strumento → tono −40
 */
export const toneFromTa = (ta: number, taClear: number, taMax: number): number => {
  const span = taMax - taClear;
  if (!(span > 0)) return 0;
  return clampTone(TONE_SCALE_MAX - 2 * TONE_SCALE_MAX * ((ta - taClear) / span));
};

// ═══════════════════════════════════════════════════════════════════════════════════════════
// IL TONO SI ANCORA AL CICLO, NON AL FONDO SCALA DELLO STRUMENTO
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * ── PERCHÉ ─────────────────────────────────────────────────────────────────────────────────
 * Ron: « The relationship between the Tone Scale and ohms is an arbitrary one. […] what is
 * important is TONE. » Se il legame è arbitrario, ancorare la scala al FONDO SCALA DEL METER —
 * che è quel che faceva `toneFromTa` con TA_MIN…TA_MAX — mette una convenzione dentro l'altra:
 * quel 6,5 è del Theta-Meter, non della scala del tono.
 *
 * Qui l'origine è il PUNTO DI PARTENZA DEL CICLO: alla localizzazione si fissa « qui sei a
 * −12 », e da lì si misura la SALITA. Il numero assoluto non serve — serve il movimento, ed è
 * quel che si vuole leggere: quanto è salito, e in quante passate.
 *
 * ── LA PENDENZA RESTA QUELLA DI RON ────────────────────────────────────────────────────────
 * « total resistance in meter divided by 80 »: l'escursione INTERA dello strumento vale 80
 * divisioni. Cambia l'origine, non la scala — due cicli restano confrontabili.
 *
 * ── E VALE PER QUALUNQUE SORGENTE ──────────────────────────────────────────────────────────
 * La stessa funzione serve al TA del meter e alla carica EEG del MUSE: si passa l'escursione
 * totale della grandezza e il resto è identico. È il motivo per cui la si scrive una volta
 * sola: con due strumenti si guardano i DUE, e devono essere calcolati allo stesso modo, se no
 * confrontarli non vuol dire niente.
 *
 * @param partenza   il tono fissato alla localizzazione
 * @param allaPartenza  la misura in quell'istante
 * @param adesso        la misura adesso
 * @param escursione    quanto vale l'INTERA scala della grandezza (80 divisioni)
 * @param scendeSale    true se la grandezza che CALA fa SALIRE il tono (resistenza, carica)
 */
export const toneFromDelta = (
  partenza: number, allaPartenza: number, adesso: number,
  escursione: number, scendeSale = true,
): number => {
  if (!(escursione > 0) || !Number.isFinite(allaPartenza) || !Number.isFinite(adesso)) {
    return clampTone(partenza);
  }
  const delta = (scendeSale ? allaPartenza - adesso : adesso - allaPartenza) / escursione;
  return clampTone(partenza + delta * 2 * TONE_SCALE_MAX);
};

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 2. PORTARE A TONO QUARANTA — quanta strada è stata fatta
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * Quanta strada verso il +40, 0 → 1.
 *
 * Si misura sul TONO CORRENTE rispetto a quello di partenza, non sul tempo: il comando si ridà
 * finché non c'è più reazione, e quante volte serva non lo sa nessuno in anticipo. Senza meter
 * resta a 0 e la barra non compare — non si inventa un avanzamento che nessuno sta misurando.
 *
 * ⚠️ Prima questa funzione misurava la strada verso lo ZERO (`mockupProgress`): il vecchio punto
 * 4 faceva mock-uppare l'opposto, e la meta era il centro. Con il comando di Ron la meta è la
 * CIMA, e la distanza da percorrere è tutta un'altra.
 *
 * Non è mai negativa: se il tono scende invece di salire, l'avanzamento è nullo, non « meno di
 * nulla ». Una discesa è un fatto da leggere sull'ago, non da scrivere in una barra.
 */
export const raiseProgress = (toneAtStart: number, toneNow: number): number => {
  const start = clampTone(toneAtStart);
  const strada = TONE_TARGET - start;
  if (strada < 1e-9) return 1;                       // si partiva già in cima
  return Math.max(0, Math.min(1, (clampTone(toneNow) - start) / strada));
};

/** Il tono è arrivato in cima alla scala. La SOGLIA è di presentazione — chi valida resta
 *  l'auditor, come nel ciclo CONTACT. */
export const reachedTop = (toneNow: number, eps = TONE_STEP / 2): boolean =>
  clampTone(toneNow) >= TONE_TARGET - eps;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// COME SI SA CHE IL TONO QUARANTA È RAGGIUNTO — I TESTIMONI
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ IL BERSAGLIO È LA CIMA, E PRIMA ERA IL CENTRO.
 *
 * Fino alla 2.0.115 il preclear mock-uppava l'OPPOSTO, i due si annullavano e la resistenza
 * tornava al CENTRO: il testimone di posizione era « ago a zero ». Il comando di Ron dice
 * un'altra cosa — « raise this to tone forty » — e allora il testimone di posizione è che il
 * tono sia arrivato IN CIMA.
 *
 * Le due letture non possono essere vere insieme, ed è quel che rende la cosa interessante: si
 * saprà guardando l'ago in seduta. La domanda è aperta con Ron.
 */

/** Chi può testimoniare che il tono è arrivato. */
export type ToneWitness =
  /** La POSIZIONE: il tono è arrivato in cima. Serve il meter — è una misura. */
  | 'top'
  /** L'F/N sull'ago in gioco. La firma classica. */
  | 'fn'
  /** La FIRMA ENERGETICA dissolta: quel che il ciclo CONTACT misura già. Serve il MUSE. */
  | 'signature';

/**
 * ⚠️ QUI C'ERANO `ToneAsIsState`, `toneWitnesses` e `toneAsIs` — chi poteva testimoniare, chi
 * aveva parlato, e la PROPOSTA quando due concordavano.
 *
 * Servivano al vecchio ciclo, dove l'app proponeva l'AS-IS e l'auditor confermava. Il comando
 * di Ron dice un'altra cosa: « ridallo finché non c'è più reazione ». Chi giudica è l'auditor,
 * che sta guardando il preclear — e tre pastiglie accanto a un bottone non lo aiutavano
 * (richiesta utente: « non so se sono utili, non credo »).
 *
 * `ToneWitness` resta, e non per inerzia: QUALI segnali si siano accesi durante la salita
 * finisce nel rapporto. A freddo dice se la fine del ciclo aveva un riscontro strumentale o
 * soltanto l'obnosi — che è esattamente la cosa da poter rileggere.
 */

// ═══════════════════════════════════════════════════════════════════════════════════════════
// GEOMETRIA DEL QUADRANTE
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** Tono −40..+40 → offset −1..+1 del quadrante (stessa geometria di ClearDial/MirrorDial).
 *  −40 a sinistra, +40 a destra: la resistenza totale sta dove l'ago non torna più. */
export const toneOffset = (tone: number): number => clampTone(tone) / TONE_SCALE_MAX;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// LA LOCALIZZAZIONE — quale istante, e chi lo certifica
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** Come si è scelto l'istante. Va scritto: un numero ancorato a una reazione del MUSE e uno
 *  preso perché non reagiva nulla non valgono la stessa cosa. */
export type ToneLocateAnchor = 'muse' | 'meter' | 'settled';

export interface ToneLocateResult {
  /** Il tono al momento scelto. */
  tone: number;
  anchor: ToneLocateAnchor;
  /** Da quanti secondi prima del clic viene il valore. Zero = nessuna reazione trovata. */
  ageS: number;
}

interface Sample { t: number; tone: number; q: number }

/**
 * ToneLocator — tiene gli ultimi secondi e, al clic, sceglie l'ISTANTE GIUSTO.
 *
 * ── PERCHÉ NON IL VALORE DEL CLIC ──────────────────────────────────────────────────────────
 * Premendo LOCALIZZA si vede spesso partire una reazione, col METER come col MUSE. E comunque
 * il preclear ha pensato la cosa PRIMA che la mano dell'auditor arrivasse sul bottone. Il valore
 * del clic è quindi il meno buono dei tre: è dopo il pensiero e dentro l'artefatto.
 *
 * ── CHI CERTIFICA IL PENSIERO ──────────────────────────────────────────────────────────────
 * Se il MUSE c'è, è LUI a dire che il preclear ha pensato qualcosa: l'EEG coglie la reazione
 * prima che il corpo la manifesti. Si cerca dunque il suo picco nella finestra e si legge il TA
 * del METER A QUELL'ISTANTE — il MUSE dice QUANDO, il METER dice QUANTO. È la divisione del
 * lavoro chiesta dall'utente, e ciascuno fa quel che sa fare.
 *
 * Senza MUSE si ripiega sul movimento del METER stesso. Se non ha reagito nulla, non si inventa
 * un istante: si prende la MEDIANA della finestra, che l'artefatto del clic non sposta (una
 * media sì), e si dice che l'ancora è « settled ».
 */
export class ToneLocator {
  private hist: Sample[] = [];
  private ambientQ = 0;

  /** Da chiamare a ogni tick in vista TONE. `q` = carica EEG (0 se il MUSE non c'è). */
  track(tone: number, q: number, nowS: number): void {
    const qq = Math.max(0, q);
    this.ambientQ = this.ambientQ === 0 ? qq : this.ambientQ * 0.99 + qq * 0.01;
    this.hist.push({ t: nowS, tone: clampTone(tone), q: qq });
    const cut = nowS - TONE_LOOKBACK_S;
    while (this.hist.length && this.hist[0].t < cut) this.hist.shift();
  }

  /** Quanti campioni ci sono in finestra — serve a sapere se la scelta poggia su qualcosa. */
  get samples(): number { return this.hist.length; }

  reset(): void { this.hist = []; this.ambientQ = 0; }

  /**
   * L'istante da usare. `hasMuse` decide chi certifica; senza campioni si torna al valore
   * corrente, che è tutto quello che c'è.
   */
  locate(nowS: number, hasMuse: boolean, currentTone: number): ToneLocateResult {
    if (!this.hist.length) return { tone: clampTone(currentTone), anchor: 'settled', ageS: 0 };

    // 1. IL MUSE dice QUANDO: il picco di carica sopra l'ambiente è il pensiero del preclear.
    if (hasMuse && this.ambientQ > 0) {
      let best: Sample | null = null;
      for (const s of this.hist) if (!best || s.q > best.q) best = s;
      if (best && best.q > this.ambientQ * TONE_LOCATE_RISE_RATIO) {
        return { tone: best.tone, anchor: 'muse', ageS: Math.max(0, nowS - best.t) };
      }
    }

    // 2. Senza MUSE (o senza suo picco): il movimento più ampio del METER nella finestra. Si
    //    prende il tono all'INIZIO del movimento, non alla fine: la partenza è il pensiero, il
    //    resto è l'ago che ci arriva.
    let widest = 0; let startIdx = -1;
    for (let i = 1; i < this.hist.length; i++) {
      const d = Math.abs(this.hist[i].tone - this.hist[i - 1].tone);
      if (d > widest) { widest = d; startIdx = i - 1; }
    }
    if (startIdx >= 0 && widest >= TONE_STEP / 4) {
      const s = this.hist[startIdx];
      return { tone: s.tone, anchor: 'meter', ageS: Math.max(0, nowS - s.t) };
    }

    // 3. Nulla ha reagito: la MEDIANA della finestra. Non la media — l'artefatto del clic
    //    sposta una media e non sposta una mediana.
    const sorted = this.hist.map(s => s.tone).sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    const med = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    return { tone: med, anchor: 'settled', ageS: 0 };
  }
}
