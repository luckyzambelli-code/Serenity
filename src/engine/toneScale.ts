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

import { TONE_SCALE_MAX, TONE_STEP, TONE_LOOKBACK_S, TONE_LOCATE_RISE_RATIO } from './tuning';
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
export type ToneAgreement = 'confirmed' | 'differs';

/**
 * Confronta la MISURA con la validazione — CON TOLLERANZA.
 *
 * ⚠️ NON si confronta con la proposta arrotondata, e NON si pretende l'uguaglianza. L'ago cade
 * fra due divisioni: a −23 la proposta è −20, ma se il preclear trova −30 non si è sbagliato
 * nessuno dei due — l'ago era in mezzo. Pretendere il numero esatto faceva comparire « l'ago
 * diceva altro » su metà delle localizzazioni, e quel messaggio deve voler dire qualcosa.
 *
 * La regola: va bene qualunque divisione entro UNA divisione dalla misura. Con −23 passano −20
 * (scarto 3) e −30 (scarto 7); non passano −40 (17) né −10 (13). Un cambio di segno non passa
 * mai, se non a ridosso dello zero — ed è giusto così: è la cosa che più conta sapere.
 *
 * `null` quando non c'era misura: senza meter non si verifica nulla, si assessa e basta.
 */
export const agreementOf = (
  measuredTone: number | null, validated: ToneCharge, tol = TONE_STEP,
): ToneAgreement | null => {
  if (measuredTone === null || !Number.isFinite(measuredTone)) return null;
  return Math.abs(chargeValue(validated) - clampTone(measuredTone)) <= tol ? 'confirmed' : 'differs';
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
// DALL'ITEM ASSESSATO ALLA RISPOSTA DEL CICLO
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * Nelle fasi 2 e 3 l'auditor ENUNCIA le risposte — « negativo? », « positivo? », « 10, 20,
 * 30, 40 » — e il modulo ASSESSMENT le raccoglie con la loro lettura. Quando poi indica al
 * preclear e questi conferma, il ciclo deve avanzare DA SOLO: cliccare « indica » e poi
 * ricliccare il bottone in cima vorrebbe dire dire due volte la stessa cosa.
 *
 * Qui si riconosce QUALE risposta era quell'item. Puro testo → risposta, niente altro.
 *
 * ── PERCHÉ PAROLA INTERA E NON SOTTOSTRINGA ────────────────────────────────────────────────
 * Per i NUMERI si confronta parola per parola: lo svedese « tio » (dieci) è dentro decine di
 * parole comuni, e un item come « la lezione » diventerebbe un 10. Per il SEGNO invece la
 * sottostringa va bene: « negativ » e « positiv » non capitano per caso, e coprono in un colpo
 * negativo/négatif/negative/negativ e le loro coniugazioni.
 */
export type ToneAnswer =
  | { kind: 'sign'; sign: ToneSign }
  | { kind: 'magnitude'; magnitude: ToneStep };

/** Accenti via, minuscole, e i segni fuori: « Négatif ? » e « negativo » devono pareggiare. */
const norm = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Le decine dette a parole, nelle cinque lingue. Le cifre si riconoscono a parte. */
const PAROLE_AMPIEZZA: Record<ToneStep, string[]> = {
  10: ['dieci', 'dix', 'ten', 'diez', 'tio'],
  20: ['venti', 'vingt', 'twenty', 'veinte', 'tjugo'],
  30: ['trenta', 'trente', 'thirty', 'treinta', 'trettio'],
  40: ['quaranta', 'quarante', 'forty', 'cuarenta', 'fyrtio'],
};

/**
 * Che risposta è questo item, per la fase in corso? `null` se non è una risposta — ed è il caso
 * normale: nell'assessment ci finisce anche quel che si dice intorno.
 */
export const matchToneAnswer = (text: string, phase: TonePhase): ToneAnswer | null => {
  const t = norm(text);
  if (!t) return null;

  if (phase === 'sign') {
    // l'ordine conta: « non negativo » non lo trattiamo — è l'auditor che indica, non l'app che
    // interpreta. Si guarda solo quale delle due parole c'è.
    const neg = t.includes('negativ') || t.includes('negatif');
    const pos = t.includes('positiv') || t.includes('positif');
    if (neg === pos) return null;            // tutte e due, o nessuna → non si indovina
    return { kind: 'sign', sign: neg ? -1 : 1 };
  }

  if (phase === 'magnitude') {
    // le CIFRE per prime: « 30 » è la forma che arriva più spesso da chi scrive
    const cifre = t.match(/\b(10|20|30|40)\b/);
    if (cifre) return { kind: 'magnitude', magnitude: Number(cifre[1]) as ToneStep };
    const parole = t.split(/[^a-z]+/).filter(Boolean);
    for (const s of TONE_STEPS) {
      if (PAROLE_AMPIEZZA[s].some(p => parole.includes(p))) return { kind: 'magnitude', magnitude: s };
    }
    return null;
  }

  return null;
};

// ═══════════════════════════════════════════════════════════════════════════════════════════
// COME SI SA CHE L'AS-IS È ARRIVATO — I TESTIMONI
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ IL BERSAGLIO È LO ZERO, NON IL VALORE OPPOSTO.
 *
 * Domanda posta dall'utente: « l'ago dovrebbe andare sul valore opposto? ». No — e la
 * distinzione è tutto il punto del metodo. Il preclear MOCK-UPPA il +40; il RISULTATO è che i
 * due si annullano e la resistenza va al CENTRO. Se l'ago si fermasse sul +40 non ci sarebbe
 * stato nessun as-is: si sarebbe sostituita una carica con un'altra di segno opposto.
 *
 * È anche una previsione FALSIFICABILE, ed è il motivo per cui vale la pena misurarla: se in
 * seduta l'ago finisse davvero sull'opposto invece che a zero, il modello di Ron vorrebbe dire
 * un'altra cosa, e lo sapremmo.
 */

/** Chi può testimoniare che la carica se n'è andata. */
export type ToneWitness =
  /** La POSIZIONE: il tono è arrivato a zero. Serve il meter — è una misura. */
  | 'zero'
  /** L'F/N sull'ago in gioco. La firma classica. */
  | 'fn'
  /** La FIRMA ENERGETICA dissolta: quel che il ciclo CONTACT misura già. Serve il MUSE. */
  | 'signature';

export interface ToneAsIsState {
  /** Chi PUÒ parlare, con gli strumenti collegati. */
  available: ToneWitness[];
  /** Chi HA parlato. */
  fired: ToneWitness[];
  /** L'app PROPONE l'as-is? Mai lo DICHIARA: valida l'auditor, come ovunque. */
  proposed: boolean;
  /** Proposto su un testimone SOLO, perché è l'unico che c'era. Va detto. */
  singleWitness: boolean;
}

/**
 * Quali testimoni esistono, secondo cosa è collegato.
 *
 *   solo METER      → posizione + F/N del meter          (due)
 *   solo MUSE       → F/N + firma energetica             (due)
 *   MUSE + METER    → tutti e tre                        (tre, e indipendenti)
 *   niente          → nessuno: si è off-meter come Ron, e decide l'auditor da solo
 *
 * La POSIZIONE richiede il meter perché senza non c'è un tono misurato da portare a zero. La
 * FIRMA richiede il MUSE perché è l'EEG a darla. L'F/N lo dà l'ago in gioco, quale che sia.
 */
export const toneWitnesses = (hasMeter: boolean, hasMuse: boolean): ToneWitness[] => {
  const w: ToneWitness[] = [];
  if (hasMeter) w.push('zero');
  if (hasMeter || hasMuse) w.push('fn');
  if (hasMuse) w.push('signature');
  return w;
};

/**
 * La proposta.
 *
 * DUE testimoni concordi, non uno. Un solo segnale si sbaglia: l'F/N del meter oggi è troppo
 * permissivo (mediana del TA alle F/N = 5,32 su 765 casi, con picchi al fondo scala — misurato
 * sull'archivio), e una posizione a zero può capitare per caso passando. Due che dicono la
 * stessa cosa nello stesso momento è un'altra faccenda.
 *
 * Quando ce n'è UNO SOLO disponibile si propone lo stesso — meglio una proposta dichiarata
 * fragile che nessuna — ma si SCRIVE che è uno solo.
 */
export const toneAsIs = (available: ToneWitness[], fired: ToneWitness[]): ToneAsIsState => {
  const f = fired.filter(x => available.includes(x));
  const proposed = available.length === 0 ? false
    : available.length === 1 ? f.length === 1
    : f.length >= 2;
  return { available, fired: f, proposed, singleWitness: proposed && available.length === 1 };
};

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
