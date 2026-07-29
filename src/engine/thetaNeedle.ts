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
  THETA_OFFSCALE, THETA_RECENTRE, THETA_TOTAL_TA_STEP, THETA_TOTAL_TA_DEADBAND,
  THETA_TOTAL_TA_STEP_DIV, THETA_TOTAL_TA_DEADBAND_DIV,
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
  /** L'ULTIMA lettura ricevuta (già lisciata). Distinta dal braccio, che la insegue lentamente:
   *  per TARARE serve QUESTA — il braccio ci mette una ventina di secondi ad arrivarci, e
   *  registrarlo dava punti presi a metà strada, quindi compressi fra loro. */
  lastRaw = 0;
  offset = 0;
  offScale = false;
  totalTa = 0;

  /** Massimo storico, per contare solo le discese nette — in DIVISIONI se l'apparecchio è
   *  tarato, altrimenti in unità grezze. */
  private peak = 0;
  /** Sensibilità in uso: unità grezze → offset del quadrante. Parte dal valore di ripiego in
   *  tuning e viene SOSTITUITA da quella misurata col test del respiro (un terzo di quadrante).
   *  Il primo valore scelto a tavolino era cinque volte troppo alto: tutto sbatteva. */
  private scale = THETA_NEEDLE_SCALE;
  /** Decimi di divisione accumulati, come INTERO. Sommare 0,1 alla volta in virgola mobile
   *  deriva (nove volte 0,1 fa 0,8999999999999999, che finirebbe anche a schermo): si contano
   *  decimi interi e si divide solo alla lettura. */
  private tenths = 0;
  /** Conversione grezzo → TA, quando l'apparecchio è stato tarato con l'artefatto.
   *  Senza, il Total TA si conta in unità grezze e vale solo come grandezza relativa. */
  private toTa: ((raw: number) => number) | null = null;
  private started = false;
  /** true mentre il braccio sta RIPORTANDO l'ago dentro il quadrante (isteresi). */
  private recentring = false;

  /**
   * Aggancia (o stacca) la scala tarata. Da chiamare quando la taratura cambia.
   *
   * ⚠️ Cambiare unità di misura a metà strada renderebbe il totale accumulato incoerente —
   * metà in grezzi e metà in divisioni. Si riparte quindi dal punto attuale.
   */
  setTaConverter(fn: ((raw: number) => number) | null): void {
    if (fn === this.toTa) return;
    this.toTa = fn;
    this.totalTa = 0; this.tenths = 0;
    this.peak = this.misura(this.arm);
  }

  /** Cambia la sensibilità dell'ago (dal test del respiro). Non tocca né il braccio né il
   *  totale: cambia solo QUANTO si vede una data variazione, non cosa è stato misurato. */
  setScale(scale: number): void { if (scale > 0 && Number.isFinite(scale)) this.scale = scale; }

  /** Il valore su cui si conta il Total TA: divisioni di TA se tarato, grezzo altrimenti. */
  private misura(raw: number): number { return this.toTa ? this.toTa(raw) : raw; }

  /** Una lettura grezza dal meter. Restituisce lo stato aggiornato. */
  push(raw: number): ThetaNeedleState {
    if (!this.started) {
      // Il braccio parte DOVE SI TROVA la persona: partire da zero manderebbe l'ago a fondo
      // scala per i primi secondi, e sembrerebbe una reazione violenta che non c'è stata.
      this.arm = raw;
      this.peak = this.misura(raw);
      this.started = true;
    }

    this.lastRaw = raw;

    // L'ago è lo scarto dal braccio. Si calcola PRIMA di muovere il braccio, altrimenti
    // il braccio inseguirebbe già in parte la deviazione e l'ago risulterebbe smorzato.
    const scarto = (this.arm - raw) * this.scale;
    this.offset = Math.max(-1, Math.min(1, scarto));

    // ── RICENTRAGGIO, con ISTERESI ────────────────────────────────────────────────────────
    // Si comincia a inseguire in fretta quando l'ago SBATTE contro il bordo, e si smette solo
    // quando è tornato BEN DENTRO il quadrante — non appena rientra di un soffio.
    //
    // È quel che fa l'auditor: l'ago esce, lui gira la manopola finché l'ago è di nuovo in
    // mezzo. Con una sola soglia — e per giunta SOPRA 1.0, com'era prima — l'inseguimento
    // veloce si fermava mentre l'ago era ancora fuori dal quadrante visibile: restava
    // incollato al bordo e da lì rientrava solo al passo lento, cioè in pratica mai.
    const ampiezza = Math.abs(scarto);
    if (ampiezza >= THETA_OFFSCALE) this.recentring = true;
    else if (ampiezza <= THETA_RECENTRE) this.recentring = false;
    this.offScale = this.recentring;

    // Il braccio insegue lentamente — è la manopola. Mentre ricentra, in fretta.
    const alpha = this.recentring ? THETA_ARM_FOLLOW_FAST : THETA_ARM_ALPHA;
    this.arm = this.arm * (1 - alpha) + raw * alpha;

    // ── TOTAL TA : solo le DISCESE nette dal picco ──────────────────────────────────────────
    // Si conta in DIVISIONI di TA quando l'apparecchio è tarato, non in unità grezze: il
    // Theta-Meter è marcatamente NON LINEARE (scarto dalla retta 0,25 TA sui punti misurati),
    // quindi uno stesso numero di grezzi vale MOLTO più TA vicino a 2 che vicino a 5. Contarli
    // in grezzi darebbe un totale sbagliato in modo diverso a seconda di dove sta il preclear.
    const ora = this.misura(this.arm);
    const passo = this.toTa ? THETA_TOTAL_TA_STEP_DIV : THETA_TOTAL_TA_STEP;
    const bandaMorta = this.toTa ? THETA_TOTAL_TA_DEADBAND_DIV : THETA_TOTAL_TA_DEADBAND;

    if (ora > this.peak + bandaMorta) {
      this.peak = ora;                            // picco nuovo e vero → si riparte da qui
    } else if (ora < this.peak) {
      const passi = Math.floor((this.peak - ora) / passo);
      if (passi > 0) {
        this.tenths += passi;                     // un passo = un decimo di divisione
        this.totalTa = this.tenths / 10;
        this.peak -= passi * passo;               // si consuma solo ciò che è stato contato
      }
    }

    return { arm: this.arm, offset: this.offset, offScale: this.offScale, totalTa: this.totalTa };
  }

  /** Azzera il Total TA senza perdere l'aggancio al preclear (inizio seduta). */
  resetTotal(): void { this.totalTa = 0; this.tenths = 0; this.peak = this.misura(this.arm); }

  reset(): void {
    this.arm = 0; this.lastRaw = 0; this.offset = 0; this.offScale = false;
    this.totalTa = 0; this.tenths = 0; this.peak = 0; this.started = false; this.recentring = false;
  }
}
