/**
 * THETA-METER — lettura dell'e-meter USB dell'utente, per dare a EQUILIBRIUM un TA che viene
 * da un vero ponte di resistenza invece che ricostruito dall'EEG.
 *
 * ── IL DISPOSITIVO ─────────────────────────────────────────────────────────────────────────
 * Non è una porta seriale, malgrado le stringhe FTDI dentro il programma Theta-Meter: è un
 * microcontrollore NXP LPC13xx che si presenta come **HID vendor-defined**. Quindi nessun
 * driver, nessun modulo nativo: si legge con WebHID, che funziona sia in Electron sia in
 * Chrome — come Web Bluetooth fa già per il Muse.
 *
 *   VID 0x1FC9 (NXP) · PID 0x0003 · usage page 0xFF00
 *   report in ingresso 16 byte, ~60 al secondo · report in uscita 2 byte
 *
 * ── IL FORMATO, ricavato sperimentalmente ──────────────────────────────────────────────────
 *
 *   01 02 [MSB] [ ] [LSB] 00 00 00 00 00 00 00 00 00 00 00
 *   └──┬──┘ └──────┬──────┘ └────────── riempimento ─────────┘
 *  intestazione  lettura a 24 bit BIG-ENDIAN
 *
 * Come si è stabilito che è big-endian: su più sessioni il valore letto in BE resta in una
 * fascia stretta (~7,4M–11,8M, cioè 4,3M su 16,7 possibili), mentre in LE sbatte sull'intero
 * intervallo (1.655–16.710.535). Solo un ordinamento dei byte produce una grandezza fisica.
 *
 * VERSO, verificato dall'utente: **stringendo le lattine il numero SCENDE**. Stringere aumenta
 * la superficie di contatto e quindi ABBASSA la resistenza → il valore grezzo cresce con la
 * resistenza. Nessuna inversione da applicare.
 *
 * Puro TS, nessuna dipendenza da WebHID: qui c'è solo l'interpretazione dei byte, così è
 * collaudabile senza hardware. Il dialogo col dispositivo sta in lib/thetaMeterHid.ts.
 */
import { THETA_SMOOTH, THETA_HEADER_0, THETA_HEADER_1, THETA_MIN_REPORT_LEN } from './tuning';

/** Una lettura decodificata. */
export interface ThetaReading {
  /** Il numero grezzo a 24 bit, così com'è sul filo. Cresce con la resistenza. */
  raw: number;
  /** Lo stesso valore lisciato — quello da mostrare, per non far tremolare la cifra. */
  smooth: number;
}

/** Fondo scala del campo a 24 bit. */
export const THETA_RAW_MAX = 0xffffff;

/**
 * Decodifica un report. Restituisce null se non è dei nostri: l'intestazione `01 02` è la sola
 * verifica di sanità che abbiamo, e senza di essa un report di un altro dispositivo (o un
 * pacchetto di stato) verrebbe interpretato come una misura.
 */
export const parseThetaReport = (bytes: ArrayLike<number>): number | null => {
  if (bytes.length < THETA_MIN_REPORT_LEN) return null;
  if (bytes[0] !== THETA_HEADER_0 || bytes[1] !== THETA_HEADER_1) return null;
  return ((bytes[2] << 16) | (bytes[3] << 8) | bytes[4]) >>> 0;
};

/**
 * Lisciatura e stato della sonda. A 60 report al secondo il valore grezzo balla di qualche
 * unità: la EMA toglie il tremolio senza introdurre ritardo percepibile.
 */
export class ThetaMeter {
  /** Ultimo valore grezzo ricevuto (0 se non è ancora arrivato nulla). */
  raw = 0;
  /** Valore lisciato. */
  smooth = 0;
  /** Quanti report validi sono arrivati — serve a dire « la sonda vive ». */
  count = 0;
  /** Quanti report sono stati scartati perché l'intestazione non tornava. */
  rejected = 0;
  /** I primi report NON riconosciuti, in esadecimale.
   *
   *  Esistono più modelli di Theta-Meter, e il formato qui dentro è quello decodificato su UN
   *  apparecchio. Su un modello diverso il dispositivo si collega e non si muove niente: senza
   *  vedere i byte veri non si può scrivere il decodificatore giusto — e a chi ha quel modello
   *  non si può chiedere di aprire una console. Si tengono quindi qui i primi report, pronti da
   *  copiare e mandare. Pochi e DIVERSI fra loro: mille copie della stessa riga non dicono nulla. */
  readonly samples: string[] = [];

  /** Un report grezzo dal dispositivo. Restituisce la lettura, o null se il report non è dei nostri. */
  push(bytes: ArrayLike<number>): ThetaReading | null {
    const raw = parseThetaReport(bytes);
    if (raw === null) {
      this.rejected++;
      if (this.samples.length < 8) {
        const hex = Array.from(bytes as ArrayLike<number>, b =>
          b.toString(16).padStart(2, '0')).join(' ');
        if (!this.samples.includes(hex)) this.samples.push(hex);
      }
      return null;
    }
    this.raw = raw;
    // Il primo valore entra tale e quale: partire da zero farebbe salire la lettura da sotto
    // per qualche secondo, e sullo schermo sembrerebbe una reazione che non c'è stata.
    this.smooth = this.count === 0 ? raw : this.smooth * (1 - THETA_SMOOTH) + raw * THETA_SMOOTH;
    this.count++;
    return { raw, smooth: this.smooth };
  }

  reset(): void { this.raw = 0; this.smooth = 0; this.count = 0; this.rejected = 0;
                  this.samples.length = 0; }
}

/**
 * ⚠️ RIMOSSI (segnalato: « togliere la parte di gestione con l'artefatto », pulizia dello
 * stesso giro) — `ThetaCalibration`/`solveThetaCalibration`/`ohmFromRaw`/`linearityError`
 * stavano qui: una taratura grezzo→OHM a due punti noti, abbozzata ma MAI collegata a nulla —
 * verificato con una ricerca sul deposito, zero chiamanti in tutto il programma. Il ciclo TONE
 * vivo passa sempre dal TA (`thetaTaScale.ts`, `taFromRaw`), mai dagli ohm diretti. Un'esca per
 * chi legge: sembrava la via viva e non lo era.
 */
