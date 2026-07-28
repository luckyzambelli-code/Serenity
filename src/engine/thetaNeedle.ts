/**
 * THETA-NEEDLE — dal valore grezzo delle LATTINE al TA e all'ago.
 *
 * ── L'IDEA, che è quella del meter vero ────────────────────────────────────────────────────
 * Su un e-meter fisico il TONE ARM *è* la posizione della manopola con cui l'auditor ricentra
 * l'ago quando questo scappa dal quadrante. Non è una grandezza separata: è **la parte lenta
 * della resistenza**, e l'ago è **lo scarto rapido rispetto a essa**.
 *
 * Quindi dal solo valore delle lattine escono tutti e due, senza inventare niente:
 *
 *     braccio  = media lenta del grezzo      → il TA (la manopola)
 *     ago      = (braccio − grezzo) · scala  → la deviazione (la lettura)
 *
 * Il VERSO torna con la fisica, verificato sul meter dell'utente: stringere le lattine abbassa
 * la resistenza e il grezzo SCENDE; scendendo sotto il braccio, `braccio − grezzo` diventa
 * positivo e l'ago va a DESTRA — cioè CADE, che è esattamente ciò che fa un ago vero quando la
 * resistenza cala.
 *
 * ── PERCHÉ NON SERVE LA TARATURA IN OHM ────────────────────────────────────────────────────
 * Tutto è relativo al braccio, che insegue la persona. Un preclear con le mani asciutte e uno
 * con le mani umide partono da grezzi lontanissimi, ma l'ago di entrambi misura lo SCARTO dal
 * proprio riposo. È la stessa filosofia del resto di EQUILIBRIUM, e sopravvive al fatto che il
 * legame grezzo→ohm non sia ancora verificato.
 *
 * Puro TS, nessun React, nessuna dipendenza dall'hardware.
 */
import {
  THETA_ARM_ALPHA, THETA_NEEDLE_SCALE, THETA_ARM_FOLLOW_FAST,
  THETA_OFFSCALE, THETA_TOTAL_TA_STEP, THETA_TOTAL_TA_DEADBAND,
} from './tuning';

export interface ThetaNeedleState {
  /** Posizione del BRACCIO in unità grezze — la « manopola ». */
  arm: number;
  /** Deviazione dell'ago sull'asse del quadrante, [-1, 1]. Positivo = a destra = CADUTA. */
  offset: number;
  /** true quando l'ago è finito fuori scala: il braccio si mette a inseguire in fretta,
   *  come farebbe l'auditor girando la manopola per riportarlo dentro. */
  offScale: boolean;
  /** Total TA accumulato: somma delle DISCESE nette del braccio, in decimi di divisione. */
  totalTa: number;
}

/**
 * Ago e braccio dalle sole letture delle lattine.
 *
 * Il Total TA usa lo stesso principio del massimo storico già in uso per il TA da EEG: contano
 * solo le discese NETTE dal picco, le risalite sotto il picco non si ricontano, e un picco
 * davvero nuovo azzera il riferimento. Senza questo, un braccio che oscilla gonfierebbe il
 * totale ad ogni respiro.
 */
export class ThetaNeedle {
  arm = 0;
  offset = 0;
  offScale = false;
  totalTa = 0;

  /** Massimo storico del braccio, per contare solo le discese nette. */
  private peak = 0;
  private started = false;

  /** Una lettura grezza dal meter. Restituisce lo stato aggiornato. */
  push(raw: number): ThetaNeedleState {
    if (!this.started) {
      // Il braccio parte DOVE SI TROVA la persona: partire da zero manderebbe l'ago a fondo
      // scala per i primi secondi, e sembrerebbe una reazione violenta che non c'è stata.
      this.arm = raw;
      this.peak = raw;
      this.started = true;
    }

    // L'ago è lo scarto dal braccio. Si calcola PRIMA di muovere il braccio, altrimenti
    // il braccio inseguirebbe già in parte la deviazione e l'ago risulterebbe smorzato.
    const scarto = (this.arm - raw) * THETA_NEEDLE_SCALE;
    this.offset = Math.max(-1, Math.min(1, scarto));
    this.offScale = Math.abs(scarto) > THETA_OFFSCALE;

    // Il braccio insegue lentamente — è la manopola. Quando l'ago è fuori scala insegue in
    // fretta: è quel che fa l'auditor, che gira la manopola per riportare l'ago nel quadrante.
    const alpha = this.offScale ? THETA_ARM_FOLLOW_FAST : THETA_ARM_ALPHA;
    this.arm = this.arm * (1 - alpha) + raw * alpha;

    // ── TOTAL TA : solo le DISCESE nette dal picco ──────────────────────────────────────────
    if (this.arm > this.peak + THETA_TOTAL_TA_DEADBAND) {
      this.peak = this.arm;                       // picco nuovo e vero → si riparte da qui
    } else if (this.arm < this.peak) {
      const disceso = this.peak - this.arm;
      const passi = Math.floor(disceso / THETA_TOTAL_TA_STEP);
      if (passi > 0) {
        this.totalTa += passi / 10;               // in decimi di divisione, come il TA da EEG
        this.peak -= passi * THETA_TOTAL_TA_STEP; // si consuma solo ciò che è stato contato
      }
    }

    return { arm: this.arm, offset: this.offset, offScale: this.offScale, totalTa: this.totalTa };
  }

  /** Azzera il Total TA senza perdere l'aggancio al preclear (inizio seduta). */
  resetTotal(): void { this.totalTa = 0; this.peak = this.arm; }

  reset(): void {
    this.arm = 0; this.offset = 0; this.offScale = false;
    this.totalTa = 0; this.peak = 0; this.started = false;
  }
}
