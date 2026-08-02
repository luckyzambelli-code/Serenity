/**
 * THETA-METER — dialogo col dispositivo via WebHID.
 *
 * La DECODIFICA non sta qui: sta in engine/thetaMeter.ts, che è puro e ha 15 test. Qui c'è
 * solo il contorno — aprire il dispositivo, ascoltare i report, riagganciarsi se sparisce.
 *
 * Perché WebHID e non un modulo nativo: funziona sia in Electron sia in Chrome, con la stessa
 * riga di codice, esattamente come Web Bluetooth fa già per il Muse. Nessuna compilazione per
 * architettura, nessun driver da installare. Lato Electron il selettore è già gestito in
 * main.cjs, che sceglie il meter da solo grazie al suo VID/PID univoco.
 *
 * NB: il programma Theta-Meter e EQUILIBRIUM possono leggere il dispositivo **nello stesso
 * momento** — verificato in seduta. HID si legge da più clienti; l'esclusiva di libusb che
 * temevo non c'è. È anzi il modo migliore di tarare: si guardano i due quadranti affiancati.
 */
import { ThetaMeter, type ThetaReading } from '../engine/thetaMeter';
import { THETA_VENDOR_ID, THETA_PRODUCT_ID } from '../engine/tuning';

/** Stato del collegamento, per l'interfaccia. */
export type ThetaStatus = 'disconnected' | 'connecting' | 'connected';

export interface ThetaMeterHidOptions {
  /** Ogni lettura valida (~60 al secondo). */
  onReading?: (r: ThetaReading) => void;
  onStatus?: (s: ThetaStatus) => void;
  onError?: (e: Error) => void;
}

const hex = (n: number) => '0x' + n.toString(16).padStart(4, '0');

/** WebHID esiste? (In un contesto non sicuro o su un browser che non lo ha, no.) */
export const isHidAvailable = (): boolean =>
  typeof navigator !== 'undefined' && 'hid' in navigator;

export class ThetaMeterHid {
  private device: HIDDevice | null = null;
  private readonly meter = new ThetaMeter();
  private readonly onInput = (e: HIDInputReportEvent) => {
    const d = e.data;
    const bytes = new Uint8Array(d.byteLength);
    for (let i = 0; i < d.byteLength; i++) bytes[i] = d.getUint8(i);
    const r = this.meter.push(bytes);
    if (r) this.opts.onReading?.(r);
  };

  status: ThetaStatus = 'disconnected';
  /** Che dispositivo si è agganciato — nome, VID e PID. Serve a capire, su una macchina
   *  altrui, SE si è collegato qualcosa e cosa: senza, un « non funziona » non è diagnosticabile. */
  info: string | null = null;

  constructor(private readonly opts: ThetaMeterHidOptions = {}) {}

  /** Quanti report validi sono arrivati e quanti scartati — diagnostica onesta. */
  get counters(): { ok: number; rejected: number } {
    return { ok: this.meter.count, rejected: this.meter.rejected };
  }

  /**
   * L'apparecchio parla, ma non la nostra lingua.
   *
   * È il caso del modello DIVERSO: si collega, i report arrivano, e nessuno è riconosciuto.
   * Distinguerlo dal « non arriva niente » (cavo, alimentazione) è tutto, perché i due si
   * rimediano in modi opposti. Una decina di report scartati e nemmeno uno buono: a 60/s è un
   * sesto di secondo, quindi non è sfortuna.
   */
  get unknownFormat(): boolean {
    return this.meter.count === 0 && this.meter.rejected >= 10;
  }

  /** I report non riconosciuti, in esadecimale — da copiare e mandare per far scrivere il
   *  decodificatore di QUEL modello. */
  get rawSamples(): string[] { return this.meter.samples; }

  private setStatus(s: ThetaStatus): void {
    this.status = s;
    this.opts.onStatus?.(s);
  }

  /**
   * Si aggancia al meter. Prima cerca fra i dispositivi GIÀ autorizzati: se c'è, nessun
   * selettore da mostrare all'utente. Altrimenti chiede — e in quel caso DEVE partire da un
   * gesto dell'utente (un clic), altrimenti il browser rifiuta la richiesta.
   */
  async connect(): Promise<boolean> {
    if (!isHidAvailable()) {
      this.opts.onError?.(new Error('WebHID non disponibile in questo contesto'));
      return false;
    }
    if (this.device) return true;

    this.setStatus('connecting');
    try {
      // ── FILTRO LARGO, POI LARGHISSIMO ────────────────────────────────────────────────────
      // Il filtro stretto (VID **e** PID) era preso dall'apparecchio di UNA persona. Esistono
      // più modelli di Theta-Meter — sei programmi diversi nella cartella dell'utente — e su un
      // altro modello il PID cambia: il dispositivo non compariva nemmeno nel selettore, e
      // senza collegamento non si vedeva né il TA né il modo di tararlo.
      // Si prova quindi: già autorizzati → stesso VID (qualunque modello NXP) → TUTTI, che
      // lascia scegliere a mano e non lascia nessuno bloccato.
      const gia = await navigator.hid.getDevices();
      let d = gia.find(x => x.vendorId === THETA_VENDOR_ID);

      if (!d) {
        [d] = await navigator.hid.requestDevice({
          filters: [{ vendorId: THETA_VENDOR_ID }],
        });
      }
      if (!d) {
        // Ultima spiaggia: nessun filtro. Se il meter di quella persona ha un altro vendor,
        // è l'unico modo di trovarlo — la scelta la fa lei, vedendo l'elenco.
        [d] = await navigator.hid.requestDevice({ filters: [] });
      }

      if (!d) { this.setStatus('disconnected'); return false; }
      if (!d.opened) await d.open();

      d.addEventListener('inputreport', this.onInput);
      this.device = d;
      this.info = `${d.productName || '?'} · ${hex(d.vendorId)}:${hex(d.productId)}`;
      this.setStatus('connected');
      return true;
    } catch (e) {
      this.setStatus('disconnected');
      const err = e instanceof Error ? e : new Error(String(e));
      // Il caso di gran lunga più comune, e il messaggio del sistema non lo dice.
      if (/open|access|busy/i.test(err.message)) {
        this.opts.onError?.(new Error(
          'Impossibile aprire il meter — verifica che sia collegato. (' + err.message + ')'));
      } else {
        this.opts.onError?.(err);
      }
      return false;
    }
  }

  /**
   * Manda un comando da 2 byte. I comandi noti — « CMD C », « CMD V », « CMD X » — vengono
   * dalle stringhe del programma Theta-Meter; il meter trasmette comunque da solo, quindi
   * finora non è servito mandarne nessuno. Tenuto per quando servisse.
   */
  async sendCommand(b0: number, b1 = 0): Promise<boolean> {
    if (!this.device) return false;
    for (const reportId of [0, 1]) {
      try { await this.device.sendReport(reportId, new Uint8Array([b0, b1])); return true; }
      catch (_) { /* si prova l'altro id */ }
    }
    return false;
  }

  async disconnect(): Promise<void> {
    const d = this.device;
    this.device = null;
    this.info = null;
    this.meter.reset();
    if (d) {
      d.removeEventListener('inputreport', this.onInput);
      try { await d.close(); } catch (_) { /* già chiuso */ }
    }
    this.setStatus('disconnected');
  }
}
